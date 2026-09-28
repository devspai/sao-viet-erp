"""Middleware ASGI THUẦN: vết người gọi cho nhật ký + CỔNG giới hạn số request chạy cùng lúc.

Thay cho `@app.middleware("http")` (BaseHTTPMiddleware) — lớp đó bọc mỗi request trong một task
group + memory stream, trung chuyển toàn bộ body qua task khác, và che thông điệp ngắt kết nối của
luồng SSE. Viết thẳng ASGI thì không tốn gì trong số đó.

Vì sao cần CỔNG. Mỗi request đồng bộ đi qua vài dependency, mỗi cái xin một luồng của threadpool
riêng, và giữ MỘT kết nối DB từ lúc truy vấn đầu tới lúc xong. Khi số request đang chạy vượt số kết
nối: request A giữ kết nối nhưng chờ luồng, còn các luồng thì đang bị request B, C… chiếm để chờ kết
nối — kẹt nhau tới khi hết `pool_timeout`, rồi lỗi hàng loạt. Giữ số request đang chạy ≤ số kết nối
thì vòng kẹt đó không thể xảy ra; phần dư XẾP HÀNG ngay ở cổng — chờ bằng asyncio, không tốn luồng,
không giữ kết nối. Chờ quá lâu thì trả 503 kèm Retry-After để client (FE tự thử lại GET) quay lại.

Không đi qua cổng:
  · luồng SSE `/api/quotations/events` — sống hàng giờ, không giữ kết nối DB;
  · `/api/health` — phải trả lời được cả khi máy chủ đang đông, không thì healthcheck báo chết oan.
"""
from __future__ import annotations

import asyncio
import json
import weakref

from . import audit_context

_KHONG_QUA_CONG = ("/api/quotations/events", "/api/health")

_THAN_503 = json.dumps(
    {"detail": "Máy chủ đang bận, vui lòng thử lại sau giây lát."}, ensure_ascii=False
).encode("utf-8")


class CongDongThoi:
    def __init__(self, app, *, gioi_han: int, cho_toi_da: float) -> None:
        self.app = app
        self.gioi_han = max(1, gioi_han)
        self.cho_toi_da = cho_toi_da
        # Semaphore gắn với event loop tạo ra nó. Mỗi worker một loop, nhưng TestClient đẻ loop mới
        # cho mỗi phiên trên CÙNG đối tượng app — giữ một semaphore cho mỗi loop.
        self._sem: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()

    def _semaphore(self) -> asyncio.Semaphore:
        loop = asyncio.get_running_loop()
        sem = self._sem.get(loop)
        if sem is None:
            sem = asyncio.Semaphore(self.gioi_han)
            self._sem[loop] = sem
        return sem

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        tokens = audit_context.dat(*_nguoi_goi(scope))
        try:
            path = scope.get("path", "")
            if path.startswith(_KHONG_QUA_CONG):
                await self.app(scope, receive, send)
                return

            sem = self._semaphore()
            try:
                await asyncio.wait_for(sem.acquire(), timeout=self.cho_toi_da)
            except asyncio.TimeoutError:
                await _tra_503(send)
                return
            try:
                await self.app(scope, receive, send)
            finally:
                sem.release()
        finally:
            audit_context.tra_lai(tokens)


def _nguoi_goi(scope) -> tuple[str, str]:
    """(IP, thiết bị) của request. Sau proxy thì `client` là IP của nginx, nên lấy phần tử ĐẦU của
    `X-Forwarded-For` (client thật) — phần còn lại là chuỗi proxy."""
    xff = ua = ""
    for ten, gia_tri in scope.get("headers") or ():
        if ten == b"x-forwarded-for":
            xff = gia_tri.decode("latin-1")
        elif ten == b"user-agent":
            ua = gia_tri.decode("latin-1")
    if xff:
        ip = xff.split(",")[0].strip()
    else:
        client = scope.get("client")
        ip = client[0] if client else ""
    return ip, ua


async def _tra_503(send) -> None:
    await send({
        "type": "http.response.start",
        "status": 503,
        "headers": [
            (b"content-type", b"application/json; charset=utf-8"),
            (b"content-length", str(len(_THAN_503)).encode()),
            (b"retry-after", b"2"),
        ],
    })
    await send({"type": "http.response.body", "body": _THAN_503})


# Việc cần DB nhưng không đi qua cổng (xác thực SSE): tối đa bấy nhiêu cái cùng lúc mỗi worker —
# đúng bằng phần kết nối cổng chừa ra (`gioi_han_mac_dinh` trừ 2). 200 người cùng nối lại SSE sau
# một lần mạng chớp thì xếp hàng ở đây bằng asyncio, không chiếm luồng + không giành kết nối của
# request thường.
_NGOAI_CONG_TOI_DA = 2
_sem_ngoai_cong: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()


async def chay_ngoai_cong(fn, *args):
    """Chạy hàm ĐỒNG BỘ có đụng DB từ một route KHÔNG qua cổng, ra khỏi event loop, có giới hạn."""
    from starlette.concurrency import run_in_threadpool

    loop = asyncio.get_running_loop()
    sem = _sem_ngoai_cong.get(loop)
    if sem is None:
        sem = asyncio.Semaphore(_NGOAI_CONG_TOI_DA)
        _sem_ngoai_cong[loop] = sem
    async with sem:
        return await run_in_threadpool(fn, *args)


def gioi_han_mac_dinh() -> int:
    """Số request chạy cùng lúc của MỘT worker khi `MAX_REQUEST_DONG_THOI` không đặt.

    Postgres: đúng bằng số kết nối của pool trừ 2 — chừa chỗ cho việc ngoài request trong cùng tiến
    trình (ticker, xác thực SSE). SQLite (dev/test): không có pool thật, lấy 40 = cỡ threadpool.
    """
    from .config import settings

    if settings.max_request_dong_thoi > 0:
        return settings.max_request_dong_thoi
    if not settings.database_url.startswith("postgresql"):
        return 40
    from .tai_nguyen import cau_hinh_pool

    pool = cau_hinh_pool(
        settings.svn_so_worker,
        pg_max_connections=settings.pg_max_connections,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
    )
    return max(4, pool["pool_size"] + pool["max_overflow"] - 2)
