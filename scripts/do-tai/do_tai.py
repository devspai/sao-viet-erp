"""Giả lập N người dùng đồng thời đánh vào stack đo tải (`erp-svn-tai`) — chạy trên máy HOST.

    python scripts/do-tai/do_tai.py --base http://127.0.0.1:8460 --users 200 \
        --kich-ban daudca --thoi-gian 150 --mat-khau '...'

Mỗi người dùng ảo làm đúng những gì trình duyệt làm khi mở app (đọc từ `AppShell.tsx`):
  POST /api/auth/login → GET /api/auth/permissions → chùm badge theo quyền (`reloadBadges`,
  `reloadBadgeVatTu`, `reloadKho`, `reloadTeams`, bắn song song như Promise) + mở SSE
  `/api/quotations/events` giữ suốt phiên, đọc stream ở task riêng, đứt thì chờ CỐ ĐỊNH 3 giây rồi nối
  lại (đúng `connectQuoteEvents` hiện tại).

Kịch bản:
  daudca    — N người vào dàn đều trong 60–120s (ngẫu nhiên). Mở app xong: status → chấm công →
              status + logs (màn Chấm công của tôi).
  bando     — N người mở app (dàn 30s) rồi mỗi 3–8s gọi vài endpoint đọc phổ biến: status chấm công,
              quyền, 2 badge ngẫu nhiên trong chùm của họ, danh sách tổ + việc của tổ (nếu có bàn tổ).
  reconnect — N người mở app + giữ SSE; khi ≥95% đã nối thì `docker compose -p <project> restart
              backend`. Đo thời gian tới khi ≥95% SSE nối lại và lỗi request trong 60s sau restart
              (người dùng vẫn gọi status chấm công mỗi 3–8s trong lúc đó).

Kết quả: bảng markdown (stdout + file) — tổng request, lỗi theo mã, p50/p95/p99/max theo nhóm
endpoint, số request > 10s, số chấm công thành công, CPU máy phát tải, CPU/RAM container backend.
"""
from __future__ import annotations

import argparse
import asyncio
import http.cookiejar
import json
import io
import os
import random
import re
import statistics
import subprocess
import sys
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import httpx

try:
    import psutil
except ImportError:  # CPU máy phát tải là "nếu đo được"
    psutil = None

NGUONG_CHAM_S = 10.0
TOA_DO = (10.7769, 106.7009)  # khớp `tao_du_lieu.py`


# ------------------------------------------------------------------------------------------------
# Thu số liệu
# ------------------------------------------------------------------------------------------------

@dataclass
class Mau:
    nhom: str
    ma: str          # "200", "500", "timeout", "ket_noi"…
    tre: float       # giây
    luc: float       # time.monotonic() lúc KẾT THÚC
    pha: str


class ThuSo:
    def __init__(self) -> None:
        self.mau: list[Mau] = []
        self.cham_cong_ok = 0
        self.cham_cong_hong: Counter = Counter()
        self.pha = "mo_app"
        self.byte_gui = 0
        self.byte_tai = 0
        self.so_304 = 0

    def ghi(self, nhom: str, ma: str, tre: float) -> None:
        self.mau.append(Mau(nhom, ma, tre, time.monotonic(), self.pha))


def _loi(ma: str) -> bool:
    """304 = bản trong máy người xem vẫn đúng — là KẾT QUẢ TỐT, không phải lỗi."""
    return not (ma.startswith("2") or ma == "304")


def _nhom(path: str) -> str:
    p = path.split("?", 1)[0]
    return re.sub(r"/\d+(?=/|$)", "/{id}", p)


def _phan_vi(xs: list[float], q: float) -> float:
    if not xs:
        return float("nan")
    xs = sorted(xs)
    k = max(0, min(len(xs) - 1, int(round(q * (len(xs) - 1)))))
    return xs[k]


# ------------------------------------------------------------------------------------------------
# Người dùng ảo
# ------------------------------------------------------------------------------------------------

class KhongCookie(http.cookiejar.DefaultCookiePolicy):
    """Client DÙNG CHUNG cho mọi người dùng ảo ⇒ không để cookie của người này rơi sang người khác.
    Cookie refresh của từng người được giữ riêng trong `NguoiDung.cookie`."""

    def set_ok(self, cookie, request):  # noqa: D401
        return False

    def return_ok(self, cookie, request):
        return False


@dataclass
class NguoiDung:
    so: int
    ten: str
    token: str | None = None
    cookie: dict = field(default_factory=dict)
    modules: set = field(default_factory=set)
    sse_mo: bool = False
    sse_lan_noi: list = field(default_factory=list)   # monotonic mỗi lần nối được
    sse_lan_dut: list = field(default_factory=list)
    to_id: int | None = None
    client: object = None   # --client-moi-nguoi: pool riêng của người này
    etag: dict = field(default_factory=dict)   # kịch bản anh: url → ETag (bộ nhớ đệm trình duyệt)


class May:
    def __init__(self, args, thu: ThuSo) -> None:
        self.args = args
        self.thu = thu
        self.dung = False
        self.kho_url: list[str] = []   # kịch bản anh: mọi tệp đã gửi thành công (dùng chung)
        self.client = httpx.AsyncClient(
            base_url=args.base,
            http1=True, http2=False,
            # Mặc định N×6 (trình duyệt HTTP/1.1 mở tối đa 6 kết nối/host): máy phát tải không được là
            # chỗ xếp hàng — thiếu kết nối thì request chờ ở CLIENT và độ trễ đo được là giả.
            limits=httpx.Limits(max_connections=args.users * args.ket_noi_moi_nguoi,
                                max_keepalive_connections=args.users * args.ket_noi_moi_nguoi),
            timeout=httpx.Timeout(60.0),
            cookies=http.cookiejar.CookieJar(policy=KhongCookie()),
        )
        self._ssl = None

    def cl(self, nd: NguoiDung) -> httpx.AsyncClient:
        """Client của người dùng ảo. Mặc định: MỘT client dùng chung (như lượt nền). Với
        `--client-moi-nguoi`: mỗi người một client, trần 6 kết nối — đúng như một trình duyệt, và
        tránh chỗ nghẽn của CHÍNH máy phát tải: pool httpcore quét tuần tự mọi kết nối cho mỗi request
        (`_assign_requests_to_connections`), pool chung vài nghìn kết nối ⇒ client ăn hết một lõi và
        request xếp hàng ở client hàng chục giây trong khi nginx trả < 1s."""
        if not self.args.client_moi_nguoi:
            return self.client
        if nd.client is None:
            import ssl
            if self._ssl is None:
                self._ssl = ssl.create_default_context()
            nd.client = httpx.AsyncClient(
                base_url=self.args.base, http1=True, http2=False, verify=self._ssl,
                limits=httpx.Limits(max_connections=self.args.ket_noi_moi_nguoi,
                                    max_keepalive_connections=self.args.ket_noi_moi_nguoi),
                timeout=httpx.Timeout(60.0),
                cookies=http.cookiejar.CookieJar(policy=KhongCookie()),
            )
        return nd.client

    async def goi(self, nd: NguoiDung, method: str, path: str, *, json_body=None, nhom: str | None = None):
        """Một request. Trả Response hoặc None (lỗi mạng/timeout). Luôn ghi mẫu."""
        headers = {"Authorization": f"Bearer {nd.token}"} if nd.token else {}
        t = time.perf_counter()
        g = nhom or _nhom(path)
        try:
            r = await self.cl(nd).request(method, path, json=json_body, headers=headers)
            self.thu.ghi(g, str(r.status_code), time.perf_counter() - t)
            return r
        except asyncio.CancelledError:
            # Hết giờ đo mà request còn treo — đếm riêng, KHÔNG bỏ im lặng (đó chính là "treo màn").
            self.thu.ghi(g, "dang_cho", time.perf_counter() - t)
            raise
        except httpx.TimeoutException:
            self.thu.ghi(g, "timeout", time.perf_counter() - t)
        except httpx.HTTPError as e:
            self.thu.ghi(g, "ket_noi", time.perf_counter() - t)
            if self.args.verbose:
                print(f"[{nd.ten}] {method} {path}: {type(e).__name__} {e}", file=sys.stderr)
        return None

    # --- mở app -----------------------------------------------------------------------------

    def chum_badge(self, nd: NguoiDung) -> list[str]:
        m = nd.modules
        ds = ["/api/module-notifications/summary", "/api/attendance/notify-summary"]
        if "nghi_phep" in m: ds.append("/api/leaves/summary")
        if "tang_ca" in m: ds.append("/api/overtime/summary")
        if "cham_cong" in m: ds.append("/api/late-early/summary")
        if "phieu_chi" in m: ds.append("/api/accounting/gia-cong-cho-chi/dem")
        if "khach_hang" in m: ds.append("/api/customers/care-followups")
        if "bao_gia" in m: ds.append("/api/quotations/notify-summary")
        if "don_hang_ban" in m: ds.append("/api/orders/notify-summary")
        if "san_xuat" in m: ds.append("/api/lsx/hang-cho")
        if "bai_ghep_2" in m: ds.append("/api/bai-ghep-2/hang-cho")          # BAI_GHEP_ENABLED = true
        if "xep_lich" in m: ds.append("/api/xep-lich/hang-cho?moi_trang=1")
        if "ky_thuat_may" in m: ds.append("/api/ky-thuat-may/yeu-cau/cho-xu-ly")
        if "phieu_bao_tri" in m: ds.append("/api/ky-thuat-may/bao-tri/den-han")
        if "luong" in m: ds.append("/api/luong/advances/notify-summary")
        if "kho" in m: ds.append("/api/kho/de-nghi/counts")
        return ds

    def chum_phu(self, nd: NguoiDung) -> list[str]:
        """reloadBadgeVatTu + reloadKho + reloadTeams — ba effect riêng cùng chạy lúc mở app."""
        ds = []
        if "ke_hoach_vat_tu" in nd.modules: ds.append("/api/ke-hoach-vat-tu/can-doi?chi_thieu=true")
        if "kho" in nd.modules: ds.append("/api/kho?active=true")
        if self.co_ban_to(nd): ds.append("/api/san-xuat/teams")
        return ds

    @staticmethod
    def co_ban_to(nd: NguoiDung) -> bool:
        return any(k.startswith("to_sx_") for k in nd.modules)

    async def dang_nhap(self, nd: NguoiDung) -> bool:
        r = await self.goi(nd, "POST", "/api/auth/login",
                           json_body={"username": nd.ten, "password": self.args.mat_khau})
        if r is None or r.status_code != 200:
            return False
        nd.token = r.json()["access_token"]
        nd.cookie = dict(r.cookies)
        return True

    async def mo_app(self, nd: NguoiDung) -> bool:
        if not await self.dang_nhap(nd):
            return False
        r = await self.goi(nd, "GET", "/api/auth/permissions")
        if r is None or r.status_code != 200:
            return False
        nd.modules = set(r.json().get("modules", []))
        # SSE mở CÙNG LÚC với chùm badge (effect SSE chạy khi `readable` có giá trị).
        asyncio.create_task(self.sse(nd))
        ds = self.chum_badge(nd) + self.chum_phu(nd)
        kq = await asyncio.gather(*(self.goi(nd, "GET", p) for p in ds))
        for p, r in zip(ds, kq):
            if p == "/api/san-xuat/teams" and r is not None and r.status_code == 200:
                teams = r.json().get("teams") or []
                if teams:
                    nd.to_id = teams[0]["id"]
        return True

    # --- SSE --------------------------------------------------------------------------------

    async def sse(self, nd: NguoiDung) -> None:
        while not self.dung:
            t = time.perf_counter()
            try:
                async with self.cl(nd).stream(
                    "GET", "/api/quotations/events",
                    headers={"Authorization": f"Bearer {nd.token}", "Accept": "text/event-stream"},
                    timeout=httpx.Timeout(60.0, read=None),
                ) as r:
                    self.thu.ghi("SSE /api/quotations/events (mở)", str(r.status_code), time.perf_counter() - t)
                    if r.status_code == 401:
                        # FE: refresh bằng cookie rồi thử ngay. Ở đây: đăng nhập lại (cookie refresh
                        # Secure không đi qua http thường).
                        if await self.dang_nhap(nd):
                            continue
                        break
                    if r.status_code == 200:
                        nd.sse_mo = True
                        nd.sse_lan_noi.append(time.monotonic())
                        async for _ in r.aiter_raw():
                            if self.dung:
                                break
            except httpx.TimeoutException:
                self.thu.ghi("SSE /api/quotations/events (mở)", "timeout", time.perf_counter() - t)
            except httpx.HTTPError:
                if not nd.sse_mo:
                    self.thu.ghi("SSE /api/quotations/events (mở)", "ket_noi", time.perf_counter() - t)
            finally:
                if nd.sse_mo:
                    nd.sse_lan_dut.append(time.monotonic())
                nd.sse_mo = False
            if self.dung:
                break
            await asyncio.sleep(3.0)   # client.ts:2914 — chờ cố định, không jitter

    # --- kịch bản -----------------------------------------------------------------------------

    async def cham_cong(self, nd: NguoiDung) -> None:
        await self.goi(nd, "GET", "/api/attendance/me/status")
        r = await self.goi(nd, "POST", "/api/attendance/check",
                           json_body={"latitude": TOA_DO[0], "longitude": TOA_DO[1]})
        if r is not None and r.status_code == 200 and r.json().get("success"):
            self.thu.cham_cong_ok += 1
        elif r is not None:
            try:
                ly_do = r.json().get("detail") or r.json().get("message")
            except Exception:
                ly_do = r.text[:80]
            self.thu.cham_cong_hong[f"{r.status_code}: {str(ly_do)[:90]}"] += 1
        else:
            self.thu.cham_cong_hong["không có phản hồi"] += 1
        await asyncio.gather(self.goi(nd, "GET", "/api/attendance/me/status"),
                             self.goi(nd, "GET", "/api/attendance/me/logs"))

    async def vong_bando(self, nd: NguoiDung, het: float) -> None:
        badge = self.chum_badge(nd)
        while not self.dung and time.monotonic() < het:
            await asyncio.sleep(random.uniform(3, 8))
            if self.dung or time.monotonic() >= het:
                break
            ds = ["/api/attendance/me/status", "/api/auth/permissions", *random.sample(badge, min(2, len(badge)))]
            if self.co_ban_to(nd):
                ds.append("/api/san-xuat/teams")
                if nd.to_id:
                    ds.append(f"/api/san-xuat/work-items?team_id={nd.to_id}&nhom=lenh&trang=1&co_trang=20")
            await asyncio.gather(*(self.goi(nd, "GET", p) for p in ds))

    # --- kịch bản `anh`: gửi + xem tệp --------------------------------------------------------

    async def goi_tep(self, nd: NguoiDung, path: str, tep: list[tuple[str, bytes]], *, nhom: str):
        """POST multipart (trường `file`). Trả Response hoặc None; luôn ghi mẫu + đếm byte gửi."""
        headers = {"Authorization": f"Bearer {nd.token}"}
        files = [("file", (ten, data, "image/jpeg")) for ten, data in tep]
        t = time.perf_counter()
        try:
            # Như FE: gửi tệp chờ tối đa 180s (`client.ts`), không phải 60s.
            r = await self.cl(nd).post(path, files=files, headers=headers, timeout=httpx.Timeout(180.0))
            self.thu.ghi(nhom, str(r.status_code), time.perf_counter() - t)
            if r.status_code < 300:
                self.thu.byte_gui += sum(len(d) for _, d in tep)
            return r
        except asyncio.CancelledError:
            self.thu.ghi(nhom, "dang_cho", time.perf_counter() - t)
            raise
        except httpx.TimeoutException:
            self.thu.ghi(nhom, "timeout", time.perf_counter() - t)
        except httpx.HTTPError as e:
            self.thu.ghi(nhom, "ket_noi", time.perf_counter() - t)
            if self.args.verbose:
                print(f"[{nd.ten}] POST {path}: {type(e).__name__} {e}", file=sys.stderr)
        return None

    async def xem_tep(self, nd: NguoiDung, url: str) -> None:
        """Mở một tệp như `<img src>`: lần đầu tải trọn; đã có bản trong máy thì gửi `If-None-Match`
        (trường hợp XẤU — trình duyệt thật với `immutable` thường không hỏi lại máy chủ)."""
        # `/api/files` xác thực bằng cookie `file_access` (đặt lúc đăng nhập), KHÔNG bằng Bearer —
        # `<img src>` không gắn được header. Client dùng chung chặn cookie ⇒ gắn tay.
        headers = {"Cookie": f"file_access={nd.cookie.get('file_access', '')}"}
        etag = nd.etag.get(url)
        if etag:
            headers["If-None-Match"] = etag
        nhom = "GET /api/files (có sẵn → hỏi lại)" if etag else "GET /api/files (tải lần đầu)"
        t = time.perf_counter()
        try:
            r = await self.cl(nd).get(url, headers=headers)
            self.thu.ghi(nhom, str(r.status_code), time.perf_counter() - t)
            if r.status_code == 200:
                self.thu.byte_tai += len(r.content)
                if r.headers.get("etag"):
                    nd.etag[url] = r.headers["etag"]
            elif r.status_code == 304:
                self.thu.so_304 += 1
        except asyncio.CancelledError:
            self.thu.ghi(nhom, "dang_cho", time.perf_counter() - t)
            raise
        except httpx.TimeoutException:
            self.thu.ghi(nhom, "timeout", time.perf_counter() - t)
        except httpx.HTTPError:
            self.thu.ghi(nhom, "ket_noi", time.perf_counter() - t)

    _KHO_BYTE = os.urandom(9 * 1024 * 1024)

    _KHO_JPEG: dict[str, list[bytes]] = {}

    @classmethod
    def sinh_jpeg_that(cls) -> None:
        """`--anh-that`: ảnh JPEG GIẢI MÃ ĐƯỢC (nhiễu ngẫu nhiên, Pillow). Byte ngẫu nhiên không làm ảnh
        thu nhỏ được — máy chủ lùi về ảnh gốc, nên đo `?w=` bằng byte ngẫu nhiên là đo sai. Sinh sẵn
        một kho nhỏ: nén 4–8MB mỗi lượt gửi là chính máy phát tải ăn CPU."""
        from PIL import Image  # chỉ cần khi bật cờ

        def jpeg(w: int, h: int, q: int) -> bytes:
            b = io.BytesIO()
            Image.frombytes("RGB", (w, h), os.urandom(w * h * 3)).save(b, "JPEG", quality=q)
            return b.getvalue()
        cls._KHO_JPEG["nho"] = [jpeg(w, w * 3 // 4, 40) for w in (1000, 1100, 1200, 1300, 1400, 1500)]
        cls._KHO_JPEG["lon"] = [jpeg(w, w * 3 // 4, 60) for w in (3200, 3600, 4000)]

    @classmethod
    def _anh(cls, kb_min: float, kb_max: float) -> bytes:
        if cls._KHO_JPEG:
            return random.choice(cls._KHO_JPEG["lon" if kb_min >= 2048 else "nho"])
        # Byte ngẫu nhiên = không nén thêm được, đúng như JPEG. Máy chủ không soi nội dung ảnh. Cắt từ
        # MỘT khối sinh sẵn: sinh mới 4–8MB mỗi lượt gửi là chính máy phát tải ăn CPU.
        n = int(random.uniform(kb_min, kb_max) * 1024)
        dau = random.randrange(0, max(1, len(cls._KHO_BYTE) - n))
        return b"\xff\xd8\xff\xe0" + cls._KHO_BYTE[dau:dau + n]

    async def gui_anh_dai_dien(self, nd: NguoiDung) -> None:
        a = self.args
        r = await self.goi_tep(nd, "/api/users/me/avatar",
                               [(f"{nd.ten}.jpg", self._anh(a.anh_nho_kb[0], a.anh_nho_kb[1]))],
                               nhom="POST /api/users/me/avatar (ảnh đã nén)")
        if r is not None and r.status_code == 200:
            # Máy chủ XOÁ ảnh đại diện cũ khi thay (đúng thiết kế) ⇒ rút url cũ khỏi danh sách xem,
            # không thì các lượt xem sau đếm 404 oan.
            cu = getattr(nd, "avatar_url", None)
            if cu in self.kho_url:
                self.kho_url.remove(cu)
            nd.avatar_url = r.json()["avatar_url"]
            self.kho_url.append(nd.avatar_url)

    async def gui_anh_lon(self, nd: NguoiDung) -> None:
        """Quản lý lập phiếu sửa chữa rồi gửi `--so-anh-lon` ảnh GỐC (không nén) CÙNG LÚC."""
        a = self.args
        r = await self.goi(nd, "POST", "/api/ky-thuat-may/sua-chua",
                           json_body={"may_id": a.may_id, "bo_phan_hong": "Đo tải"})
        if r is None or r.status_code != 201:
            return
        pid = r.json()["id"]
        path = f"/api/ky-thuat-may/sua_chua/{pid}/anh?giai_doan=truoc"
        mb = a.anh_lon_mb
        kq = await asyncio.gather(*(
            self.goi_tep(nd, path, [(f"goc{i}.jpg", self._anh(mb[0] * 1024, mb[1] * 1024))],
                         nhom="POST ảnh phiếu máy (ảnh gốc, không nén)")
            for i in range(a.so_anh_lon)))
        for x in kq:
            if x is not None and x.status_code == 201:
                self.kho_url.append(x.json()["file_url"])

    async def vong_anh(self, nd: NguoiDung, het: float) -> None:
        la_ql = nd.so % 10 == 0 and self.args.may_id
        await self.gui_anh_dai_dien(nd)
        if la_ql:
            await self.gui_anh_lon(nd)
        con_gui = self.args.luot_gui - 1
        while not self.dung and time.monotonic() < het:
            await asyncio.sleep(random.uniform(3, 8))
            if self.dung or time.monotonic() >= het:
                break
            # Mở một màn danh sách có ảnh: kéo vài ảnh cùng lúc như trình duyệt vẽ lưới.
            if self.kho_url:
                ds = random.sample(self.kho_url, min(self.args.anh_moi_man, len(self.kho_url)))
                w = self.args.anh_w
                await asyncio.gather(*(self.xem_tep(nd, f"{u}?w={w}" if w else u) for u in ds))
            if con_gui > 0 and random.random() < 0.3:
                con_gui -= 1
                await (self.gui_anh_lon(nd) if la_ql else self.gui_anh_dai_dien(nd))

    async def vong_nhe(self, nd: NguoiDung, het: float) -> None:
        while not self.dung and time.monotonic() < het:
            await asyncio.sleep(random.uniform(3, 8))
            if self.dung or time.monotonic() >= het:
                break
            await self.goi(nd, "GET", "/api/attendance/me/status")


# ------------------------------------------------------------------------------------------------
# Đo tài nguyên
# ------------------------------------------------------------------------------------------------

def _mib(s: str) -> float:
    """"512.3MiB" / "1.2GiB" / "800kB" (docker stats) → MiB."""
    m = re.match(r"\s*([\d.]+)\s*([KMGT]?i?B)", s.strip(), re.I)
    if not m:
        return float("nan")
    he = {"b": 1 / 2**20, "kb": 1e3 / 2**20, "kib": 1 / 1024, "mb": 1e6 / 2**20, "mib": 1,
          "gb": 1e9 / 2**20, "gib": 1024}
    return float(m.group(1)) * he.get(m.group(2).lower(), float("nan"))


class DoTaiNguyen(threading.Thread):
    def __init__(self, project: str, co_docker: bool) -> None:
        super().__init__(daemon=True)
        self.project = project
        self.co_docker = co_docker
        self.cpu_host: list[float] = []
        self.be_cpu: list[float] = []
        self.be_mem: list[str] = []
        self.db_cpu: list[float] = []
        self.be_mib: list[float] = []
        self.minio_cpu: list[float] = []
        self.minio_mib: list[float] = []
        self.dung = threading.Event()

    def run(self) -> None:
        if psutil:
            psutil.cpu_percent(None)
        dem = 0
        while not self.dung.is_set():
            self.dung.wait(1.0)
            if psutil:
                self.cpu_host.append(psutil.cpu_percent(None))
            dem += 1
            if self.co_docker and dem % 5 == 0:
                try:
                    out = subprocess.run(
                        ["docker", "stats", "--no-stream", "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"],
                        capture_output=True, text=True, timeout=15).stdout
                    for ln in out.splitlines():
                        ten, cpu, mem = ln.split("|")
                        if not ten.startswith(self.project + "-"):
                            continue
                        c = float(cpu.strip("%") or 0)
                        if "-backend-" in ten:
                            self.be_cpu.append(c)
                            self.be_mem.append(mem.split("/")[0].strip())
                            self.be_mib.append(_mib(mem.split("/")[0]))
                        elif "-db-" in ten:
                            self.db_cpu.append(c)
                        elif "-minio-" in ten:
                            self.minio_cpu.append(c)
                            self.minio_mib.append(_mib(mem.split("/")[0]))
                except Exception:
                    pass


# ------------------------------------------------------------------------------------------------
# Chạy
# ------------------------------------------------------------------------------------------------

async def chay(args) -> dict:
    thu = ThuSo()
    may = May(args, thu)
    nds = [NguoiDung(i, f"{args.tien_to}{i:03d}") for i in range(1, args.users + 1)]
    t0 = time.monotonic()
    het = t0 + args.thoi_gian
    ket: dict = {"restart": None}

    async def mot(nd: NguoiDung, tre: float, sau_mo):
        await asyncio.sleep(tre)
        while not await may.mo_app(nd):
            # daudca/bando: mở app hỏng thì người đó bỏ cuộc (đo đúng "lần đầu mở app").
            # reconnect: người dùng thật sẽ F5 lại — thử lại sau 3–8s, vì kịch bản cần họ đang
            # trong app lúc restart.
            if args.kich_ban != "reconnect" or time.monotonic() >= het:
                return
            await asyncio.sleep(random.uniform(3, 8))
        if sau_mo:
            await sau_mo(nd)

    if args.kich_ban == "daudca":
        dan = args.dan if args.dan is not None else random.uniform(60, 120)
        ket["dan_s"] = round(dan, 1)
        tasks = [asyncio.create_task(mot(nd, random.uniform(0, dan), may.cham_cong)) for nd in nds]
        await asyncio.wait(tasks, timeout=max(1.0, het - time.monotonic()))
        # giữ SSE tới hết thời gian
        while time.monotonic() < het:
            await asyncio.sleep(0.5)
    elif args.kich_ban == "bando":
        dan = args.dan if args.dan is not None else 30.0
        ket["dan_s"] = dan
        thu.pha = "mo_app"

        async def sau(nd):
            await may.vong_bando(nd, het)

        tasks = [asyncio.create_task(mot(nd, random.uniform(0, dan), sau)) for nd in nds]
        await asyncio.sleep(dan + 5)
        thu.pha = "giua_ca"
        await asyncio.wait(tasks, timeout=max(1.0, het - time.monotonic() + 5))
    elif args.kich_ban == "anh":
        dan = args.dan if args.dan is not None else 30.0
        ket["dan_s"] = dan

        async def sau(nd):
            await may.vong_anh(nd, het)

        tasks = [asyncio.create_task(mot(nd, random.uniform(0, dan), sau)) for nd in nds]
        await asyncio.wait(tasks, timeout=max(1.0, het - time.monotonic() + 30))
    else:  # reconnect
        dan = args.dan if args.dan is not None else 30.0
        ket["dan_s"] = dan

        async def sau(nd):
            await may.vong_nhe(nd, het)

        tasks = [asyncio.create_task(mot(nd, random.uniform(0, dan), sau)) for nd in nds]
        # chờ ≥95% SSE mở (tối đa dan + 30s — hệ đang sập thì không bao giờ đủ, cứ restart)
        han = time.monotonic() + dan + 30
        while time.monotonic() < han:
            if sum(nd.sse_mo for nd in nds) >= 0.95 * len(nds):
                break
            await asyncio.sleep(0.5)
        await asyncio.sleep(3)
        goc = [nd for nd in nds if nd.sse_mo]          # người đang giữ SSE lúc restart
        ket["sse_mo_truoc_restart"] = len(goc)
        thu.pha = "sau_restart"
        t_rs = time.monotonic()
        ket["restart_luc_s"] = round(t_rs - t0, 1)
        proc = await asyncio.create_subprocess_exec(
            "docker", "compose", "-p", args.project, "restart", "backend",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)

        song_lai: list[float] = []

        async def do_health():
            # /api/health qua nginx mỗi giây: mốc API sống lại (200 đầu tiên sau khi lệnh restart xong).
            await asyncio.sleep(1)
            while not song_lai:
                try:
                    r = await may.client.get("/api/health", timeout=5)
                    if r.status_code == 200 and proc.returncode is not None:
                        song_lai.append(time.monotonic() - t_rs)
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(1)

        probe = asyncio.create_task(do_health())
        moc95 = None
        het_rs = max(t_rs + 60.0, t0 + args.thoi_gian)
        lenh_xong = None

        def da_noi_lai(ds):
            return sum(1 for nd in ds if nd.sse_mo and any(x > t_rs for x in nd.sse_lan_noi))

        while time.monotonic() < het_rs:
            if lenh_xong is None and proc.returncode is not None:
                lenh_xong = time.monotonic() - t_rs
            if moc95 is None and goc and da_noi_lai(goc) >= 0.95 * len(goc):
                moc95 = time.monotonic() - t_rs
            if moc95 is not None and time.monotonic() - t_rs >= 60:
                break
            await asyncio.sleep(0.25)
        await proc.wait()
        probe.cancel()
        ket["lenh_restart_s"] = round(lenh_xong, 1) if lenh_xong else None
        ket["api_song_lai_s"] = round(song_lai[0], 1) if song_lai else None
        ket["hoi_phuc_95_s"] = round(moc95, 1) if moc95 is not None else None
        ket["cua_so_do_s"] = round(time.monotonic() - t_rs, 1)
        ket["sse_noi_lai_goc"] = da_noi_lai(goc)
        ket["sse_noi_lai_cuoi"] = da_noi_lai(nds)
        ket["t_rs"] = t_rs
        het = time.monotonic()

    may.dung = True
    await asyncio.sleep(0.2)
    # Huỷ có HẠN: httpx/anyio đôi khi nuốt lệnh huỷ của task đang đọc stream SSE ⇒ gather vô hạn
    # treo cả lượt đo (daudca 400 lượt SAU treo 10 phút, 10 kết nối SSE còn mở). Huỷ 3 lần, mỗi lần
    # chờ tối đa 5s; còn sót thì đếm và bỏ — mẫu đã ghi xong từ lúc huỷ lần đầu.
    con: set = set()
    for _ in range(3):
        con = {t for t in asyncio.all_tasks() if t is not asyncio.current_task() and not t.done()}
        if not con:
            break
        for t in con:
            t.cancel()
        _, con = await asyncio.wait(con, timeout=5)
    ket["task_treo_luc_dung"] = len(con)
    try:
        await asyncio.wait_for(asyncio.gather(
            may.client.aclose(), *(nd.client.aclose() for nd in nds if nd.client is not None),
            return_exceptions=True), timeout=10)
    except (asyncio.TimeoutError, Exception):
        pass
    ket["thu"] = thu
    ket["nds"] = nds
    ket["t0"] = t0
    ket["sse_mo_toi_da"] = sum(1 for nd in nds if nd.sse_lan_noi)
    return ket


def bang(mau: list[Mau]) -> str:
    theo = defaultdict(list)
    for m in mau:
        theo[m.nhom].append(m)
    dong = ["| Nhóm endpoint | n | lỗi | mã lỗi | p50 | p95 | p99 | max | >10s |",
            "|---|---:|---:|---|---:|---:|---:|---:|---:|"]
    for g in sorted(theo, key=lambda k: -len(theo[k])):
        ms = theo[g]
        tre = [m.tre for m in ms]
        loi = Counter(m.ma for m in ms if _loi(m.ma))
        dong.append(
            f"| `{g}` | {len(ms)} | {sum(loi.values())} | "
            f"{', '.join(f'{k}×{v}' for k, v in loi.most_common()) or '—'} | "
            f"{_phan_vi(tre, .5):.2f} | {_phan_vi(tre, .95):.2f} | {_phan_vi(tre, .99):.2f} | "
            f"{max(tre):.2f} | {sum(1 for x in tre if x > NGUONG_CHAM_S)} |")
    return "\n".join(dong)


def bao_cao(args, ket: dict, tn: DoTaiNguyen, bat_dau: datetime) -> str:
    thu: ThuSo = ket["thu"]
    # SSE mở là kết nối dài — tách khỏi thống kê request thường.
    req = [m for m in thu.mau if not m.nhom.startswith("SSE")]
    sse = [m for m in thu.mau if m.nhom.startswith("SSE")]
    loi = Counter(m.ma for m in req if _loi(m.ma))
    tre = [m.tre for m in req]
    L = []
    L.append(f"### {args.kich_ban} · {args.users} người · {bat_dau:%Y-%m-%d %H:%M:%S}")
    L.append("")
    L.append("- Máy phát tải: " + ("mỗi người một client (6 kết nối)" if args.client_moi_nguoi
                                     else f"MỘT client chung, trần {args.users * args.ket_noi_moi_nguoi} kết nối"))
    L.append(f"- Thời gian chạy: {args.thoi_gian}s; dàn người vào trong {ket.get('dan_s')}s")
    if any(m.ma == "dang_cho" for m in req):
        L.append(f"- `dang_cho` = request còn treo lúc hết giờ đo: {sum(1 for m in req if m.ma == 'dang_cho')}")
    L.append(f"- Request thường: **{len(req)}**, lỗi **{sum(loi.values())}** "
             f"({100 * sum(loi.values()) / max(1, len(req)):.1f}%) — "
             f"{', '.join(f'{k}×{v}' for k, v in loi.most_common()) or 'không lỗi'}")
    if tre:
        L.append(f"- Độ trễ chung: p50 {_phan_vi(tre, .5):.2f}s · p95 {_phan_vi(tre, .95):.2f}s · "
                 f"p99 {_phan_vi(tre, .99):.2f}s · max {max(tre):.2f}s · >10s: "
                 f"{sum(1 for x in tre if x > NGUONG_CHAM_S)}")
        dur = max(1e-6, max(m.luc for m in req) - min(m.luc for m in req))
        L.append(f"- Thông lượng trung bình: {len(req) / dur:.1f} req/s")
    L.append(f"- SSE: {ket['sse_mo_toi_da']}/{args.users} người từng mở được; "
             f"lượt mở {len(sse)} (lỗi {sum(1 for m in sse if _loi(m.ma))})")
    if ket.get("task_treo_luc_dung"):
        L.append(f"- Task không chịu huỷ lúc dừng (bỏ lại): {ket['task_treo_luc_dung']}")
    if args.kich_ban == "anh":
        dur = max(1.0, args.thoi_gian)
        L.append(f"- Đã gửi thành công {thu.byte_gui / 2**20:.0f} MB, tải về {thu.byte_tai / 2**20:.0f} MB "
                 f"(TB {thu.byte_gui / 2**20 / dur:.1f} MB/s lên · {thu.byte_tai / 2**20 / dur:.1f} MB/s xuống); "
                 f"{thu.so_304} lượt 304 (bản trong máy vẫn đúng, không kéo byte nào)")
        L.append(f"- Ảnh nhỏ (đã nén) {args.anh_nho_kb[0]:g}–{args.anh_nho_kb[1]:g} KB; quản lý gửi "
                 f"{args.so_anh_lon} ảnh GỐC {args.anh_lon_mb[0]:g}–{args.anh_lon_mb[1]:g} MB cùng lúc; "
                 f"mỗi màn mở {args.anh_moi_man} ảnh; tối đa {args.luot_gui} lượt gửi/người"
                 + ("; JPEG thật" if args.anh_that else "; byte ngẫu nhiên")
                 + (f"; xem qua `?w={args.anh_w}`" if args.anh_w else "; xem ảnh gốc"))
    if args.kich_ban == "daudca":
        L.append(f"- Chấm công thành công: **{thu.cham_cong_ok}/{args.users}**"
                 + (f"; hỏng: {dict(thu.cham_cong_hong)}" if thu.cham_cong_hong else ""))
    for pha in ("mo_app", "giua_ca", "sau_restart"):
        ms = [m for m in req if m.pha == pha]
        if ms and args.kich_ban != "daudca":
            lp = sum(1 for m in ms if _loi(m.ma))
            L.append(f"- Pha `{pha}`: {len(ms)} req, lỗi {lp} ({100 * lp / len(ms):.1f}%), "
                     f"p50 {_phan_vi([m.tre for m in ms], .5):.2f}s, p95 {_phan_vi([m.tre for m in ms], .95):.2f}s")
    if args.kich_ban == "reconnect":
        t_rs = ket["t_rs"]
        cua_so = [m for m in req if t_rs <= m.luc <= t_rs + 60]
        lcs = Counter(m.ma for m in cua_so if _loi(m.ma))
        L.append(f"- SSE mở trước restart: {ket['sse_mo_truoc_restart']}/{args.users}; restart lúc "
                 f"t={ket['restart_luc_s']}s; lệnh `restart backend` mất {ket['lenh_restart_s']}s; "
                 f"`/api/health` trả 200 lại sau {ket['api_song_lai_s']}s")
        hp = (f"sau {ket['hoi_phuc_95_s']}s" if ket["hoi_phuc_95_s"] is not None
              else f"CHƯA đạt trong {ket['cua_so_do_s']}s đo")
        L.append(f"- **Hồi phục: ≥95% số SSE đang mở lúc restart nối lại {hp}** "
                 f"(cuối cửa sổ: {ket['sse_noi_lai_goc']}/{ket['sse_mo_truoc_restart']} người đang mở trước "
                 f"restart đã nối lại; tổng {ket['sse_noi_lai_cuoi']}/{args.users} người có SSE)")
        L.append(f"- Request trong 60s sau restart: {len(cua_so)}, lỗi {sum(lcs.values())} "
                 f"({100 * sum(lcs.values()) / max(1, len(cua_so)):.1f}%) — "
                 f"{', '.join(f'{k}×{v}' for k, v in lcs.most_common()) or 'không lỗi'}")
    if ket.get("cpu_truoc") is not None:
        L.append(f"- CPU host 5s TRƯỚC khi chạy (nền, gồm tiến trình khác trên máy): {ket['cpu_truoc']:.0f}%")
    if tn.cpu_host:
        L.append(f"- CPU máy phát tải (host, toàn máy): TB {statistics.mean(tn.cpu_host):.0f}% · "
                 f"max {max(tn.cpu_host):.0f}%")
    if tn.be_cpu:
        L.append(f"- Container backend: CPU TB {statistics.mean(tn.be_cpu):.0f}% · max {max(tn.be_cpu):.0f}% "
                 f"(100% = 1 lõi) · RAM cuối {tn.be_mem[-1]} · RAM đỉnh {max(tn.be_mib):.0f} MiB")
    if tn.minio_cpu:
        L.append(f"- Container minio: CPU TB {statistics.mean(tn.minio_cpu):.0f}% · max {max(tn.minio_cpu):.0f}% "
                 f"· RAM đỉnh {max(tn.minio_mib):.0f} MiB")
    if tn.db_cpu:
        L.append(f"- Container db: CPU TB {statistics.mean(tn.db_cpu):.0f}% · max {max(tn.db_cpu):.0f}%")
    L.append("")
    L.append(bang(thu.mau))
    L.append("")
    return "\n".join(L)


def main() -> None:
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")   # console Windows cp1252 không in được tiếng Việt
        except Exception:
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://127.0.0.1:8460")
    ap.add_argument("--users", type=int, required=True)
    ap.add_argument("--kich-ban", choices=["daudca", "bando", "reconnect", "anh"], required=True)
    ap.add_argument("--may-id", type=int, default=None,
                    help="kịch bản anh: id máy `MAY-DO-TAI` (tao_du_lieu.py in ra); trống = quản lý không gửi ảnh lớn")
    ap.add_argument("--anh-nho-kb", type=float, nargs=2, default=(250, 600),
                    help="kịch bản anh: cỡ ảnh đại diện (đã nén ở trình duyệt), KB")
    ap.add_argument("--anh-lon-mb", type=float, nargs=2, default=(4, 8),
                    help="kịch bản anh: cỡ ảnh GỐC quản lý gửi (điện thoại, không nén), MB")
    ap.add_argument("--so-anh-lon", type=int, default=3, help="kịch bản anh: số ảnh gốc gửi cùng lúc mỗi lượt")
    ap.add_argument("--anh-moi-man", type=int, default=10, help="kịch bản anh: số ảnh kéo mỗi lần mở màn")
    ap.add_argument("--luot-gui", type=int, default=3, help="kịch bản anh: số lượt gửi tối đa mỗi người")
    ap.add_argument("--anh-that", action="store_true",
                    help="kịch bản anh: gửi JPEG thật (cần Pillow) thay byte ngẫu nhiên — bắt buộc khi đo --anh-w")
    ap.add_argument("--anh-w", type=int, choices=[160, 320], default=None,
                    help="kịch bản anh: xem ảnh qua `?w=` (ảnh thu nhỏ, như lưới/avatar của giao diện)")
    ap.add_argument("--thoi-gian", type=int, default=150, help="giây (kịch bản reconnect: tối thiểu tới 60s sau restart)")
    ap.add_argument("--mat-khau", default=os.environ.get("TAI_PASSWORD"), help="hoặc biến môi trường TAI_PASSWORD")
    ap.add_argument("--tien-to", default="tai_")
    ap.add_argument("--client-moi-nguoi", action="store_true",
                    help="mỗi người dùng ảo một client (6 kết nối) thay vì một pool chung — xem May.cl")
    ap.add_argument("--project", default="erp-svn-tai", help="compose project (restart + docker stats)")
    ap.add_argument("--khong-docker-stats", action="store_true")
    ap.add_argument("--ket-noi-moi-nguoi", type=int, default=6,
                    help="trần kết nối httpx = users × số này (mặc định 6)")
    ap.add_argument("--ra", help="file markdown ghi kết quả (mặc định ket-qua/lan-chay/<...>.md)")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--dan", type=float, default=None,
                    help="giây dàn người vào (mặc định: daudca ngẫu nhiên 60–120, còn lại 30)")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--cho-may-ranh", type=float, default=40,
                    help="chờ tới khi CPU host < ngưỡng %% (0 = không chờ)")
    args = ap.parse_args()
    if not args.mat_khau:
        ap.error("thiếu --mat-khau (hoặc TAI_PASSWORD)")
    if args.anh_w and not args.anh_that:
        ap.error("--anh-w cần --anh-that (byte ngẫu nhiên không thu nhỏ được)")
    if args.seed is not None:
        random.seed(args.seed)
    if args.anh_that:
        May.sinh_jpeg_that()

    cpu_truoc = None
    if psutil and args.cho_may_ranh > 0:
        # Máy dev dùng chung (phiên khác chạy pytest/build) ⇒ đo lúc host đang bão hoà thì số là số
        # của máy chứ không phải của app. Chờ host rảnh (TB 5s < ngưỡng), tối đa 5 phút, rồi ghi lại.
        han = time.monotonic() + 300
        while True:
            cpu_truoc = psutil.cpu_percent(interval=5)
            if cpu_truoc < args.cho_may_ranh or time.monotonic() > han:
                break
            print(f"host CPU {cpu_truoc:.0f}% ≥ {args.cho_may_ranh}% — chờ máy rảnh…", file=sys.stderr)
    bat_dau = datetime.now()
    tn = DoTaiNguyen(args.project, not args.khong_docker_stats)
    tn.start()
    # KHÔNG dùng asyncio.run: lúc đóng nó lại gather mọi task còn sót — chính task nuốt lệnh huỷ
    # làm treo vô hạn. Task sót (nếu có) đã đếm trong ket["task_treo_luc_dung"].
    loop = asyncio.new_event_loop()
    ket = loop.run_until_complete(chay(args))
    tn.dung.set()
    tn.join(timeout=20)

    ket["cpu_truoc"] = cpu_truoc
    md = bao_cao(args, ket, tn, bat_dau)
    print(md)
    ra = Path(args.ra) if args.ra else (
        Path(__file__).parent / "ket-qua" / "lan-chay"
        / f"{bat_dau:%Y%m%d-%H%M%S}-{args.kich_ban}-{args.users}{'-cm' if args.client_moi_nguoi else ''}{f'-w{args.anh_w}' if args.anh_w else ''}.md")
    ra.parent.mkdir(parents=True, exist_ok=True)
    ra.write_text(md, encoding="utf-8")
    print(f"\n(đã ghi {ra})")


if __name__ == "__main__":
    main()
