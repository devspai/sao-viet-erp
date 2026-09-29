"""Điểm khởi động của container backend: chuẩn bị schema MỘT lần rồi bật N worker uvicorn.

Số worker TỰ CO GIÃN theo CPU/RAM của container (`app/tai_nguyen.py`); `WEB_CONCURRENCY` chốt tay
được. Ngân sách kết nối Postgres chia theo số worker thật — worker con đọc `SVN_SO_WORKER`.

Nhiều worker CHỈ khi có Redis: không Redis thì hub SSE là in-process — người A nối SSE vào worker 1,
người B bấm duyệt ở worker 2 thì A không bao giờ nhận được tin. Khi đó ép 1 worker.

Chạy: `python -m app.serve`. Máy dev vẫn chạy thẳng `uvicorn app.main:app` như cũ.
"""
from __future__ import annotations

import logging
import os
import signal
import sys
import tempfile
import threading

log = logging.getLogger("svn.serve")


def _chuan_bi_nen(duong: str, hong: threading.Event) -> None:
    """Chạy ở luồng phụ của cha, song song lúc worker import app. Xong ⇒ đặt tệp tín hiệu; hỏng ⇒
    đặt `.loi` (worker thôi chờ) rồi tự gửi SIGTERM để uvicorn dừng cả cụm."""
    from . import khoi_dong

    try:
        khoi_dong.chuan_bi()
    except BaseException:
        log.exception("chuan bi schema hong — dung may chu")
        hong.set()
        open(duong + ".loi", "w").close()
        os.kill(os.getpid(), signal.SIGTERM)
        return
    open(duong, "w").close()
    log.info("schema da san")


def so_worker() -> int:
    from .config import settings
    from .tai_nguyen import so_worker_mac_dinh

    if not settings.redis_url:
        return 1
    if settings.web_concurrency > 0:
        return settings.web_concurrency
    return so_worker_mac_dinh()


def main() -> None:
    import uvicorn

    from . import khoi_dong
    from .config import settings
    from .tai_nguyen import cau_hinh_pool, ram_mb, so_cpu

    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s %(message)s")

    # Migration + seed + bucket ở ĐÂY, một lần, SONG SONG lúc worker import app; worker chỉ nhận
    # request sau khi tệp tín hiệu xuất hiện (`khoi_dong.cho_schema_san`).
    duong = os.path.join(tempfile.gettempdir(), f"svn-schema-{os.getpid()}")
    for cu in (duong, duong + ".loi"):
        if os.path.exists(cu):
            os.remove(cu)
    hong = threading.Event()

    w = so_worker()
    # Worker con là tiến trình spawn mới — đọc lại cấu hình từ biến môi trường.
    os.environ[khoi_dong.BIEN_DA_SAN] = "1"
    os.environ[khoi_dong.BIEN_TIN_HIEU] = duong
    os.environ["SVN_SO_WORKER"] = str(w)
    if settings.database_url.startswith("postgresql"):
        pool = cau_hinh_pool(
            w,
            pg_max_connections=settings.pg_max_connections,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
        )
        log.info(
            "may: %d CPU, %d MB RAM -> %d worker, moi worker pool %d + %d ket noi",
            so_cpu(), ram_mb(), w, pool["pool_size"], pool["max_overflow"],
        )
    else:
        log.info("may: %d CPU, %d MB RAM -> %d worker", so_cpu(), ram_mb(), w)

    threading.Thread(target=_chuan_bi_nen, args=(duong, hong), daemon=True,
                     name="chuan-bi-schema").start()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        workers=w,
        # Sau Caddy/nginx: lấy IP + https thật từ header proxy.
        proxy_headers=True,
        forwarded_allow_ips="*",
        # Tắt máy khi deploy: chờ request đang dở tối đa 5 giây rồi cắt — luồng SSE sống hàng giờ,
        # không đặt thì uvicorn chờ chúng mãi và `docker stop` phải giết cứng sau 10 giây.
        timeout_graceful_shutdown=5,
    )
    if hong.is_set():
        sys.exit(1)


if __name__ == "__main__":
    main()
