"""Giới hạn đăng nhập sai — chặn dò mật khẩu và chặn nghẽn CPU vì bcrypt (0,3–0,4 giây/lượt).

Đếm lần SAI trong cửa sổ 15 phút (tính từ lần sai đầu tiên của cửa sổ), hai bộ đếm song song:
  · theo tên đăng nhập (chữ thường) — ≥ 10 lần sai thì khoá tên đó;
  · theo IP — ≥ 30 lần sai thì khoá IP đó (một máy dò nhiều tên khác nhau).
Bị khoá ⇒ 429 trước khi chạy bcrypt. Đăng nhập ĐÚNG ⇒ xoá bộ đếm của tên đăng nhập (không xoá bộ
đếm IP: một người đúng không gỡ tội cho cả máy đang dò).

Cần Redis (bộ đếm chung mọi worker). Không có `REDIS_URL` hoặc Redis lỗi ⇒ BỎ QUA, không chặn ai —
giới hạn này là lớp bảo vệ thêm, không được biến sự cố Redis thành "cả xưởng không đăng nhập được".
"""
from __future__ import annotations

import math

from fastapi import Request

from .config import settings

CUA_SO_GIAY = 15 * 60
TRAN_TEN = 10
TRAN_IP = 30
_TIEN_TO = "svn:dang_nhap_sai:"

_client = None


def _redis():
    global _client
    if not settings.redis_url:
        return None
    if _client is None:
        import redis  # import trễ: không có Redis thì khỏi cần thư viện

        # Client đồng bộ RIÊNG, hạn giờ socket 2 giây: Redis treo không được kéo lượt đăng nhập
        # treo theo (mặc định redis-py chờ vô hạn).
        _client = redis.from_url(
            settings.redis_url, decode_responses=True, socket_timeout=2, socket_connect_timeout=2,
        )
    return _client


def ip_cua(request: Request) -> str:
    """IP người gọi: phần tử ĐẦU của `X-Forwarded-For` (client thật khi đứng sau nginx), không có
    thì `request.client.host`."""
    xff = request.headers.get("x-forwarded-for") or ""
    dau = xff.split(",")[0].strip()
    if dau:
        return dau
    return request.client.host if request.client else ""


def _khoa_ten(username: str) -> str:
    return f"{_TIEN_TO}ten:{(username or '').strip().lower()}"


def _khoa_ip(ip: str) -> str:
    return f"{_TIEN_TO}ip:{ip}"


def phut_con_bi_chan(username: str, ip: str) -> int | None:
    """Số phút còn phải chờ nếu tên HOẶC IP đang bị chặn; None nếu được thử (hoặc không có Redis)."""
    client = _redis()
    if client is None:
        return None
    try:
        pipe = client.pipeline()
        kt, ki = _khoa_ten(username), _khoa_ip(ip)
        pipe.get(kt)
        pipe.ttl(kt)
        pipe.get(ki)
        pipe.ttl(ki)
        so_ten, ttl_ten, so_ip, ttl_ip = pipe.execute()
    except Exception:
        return None
    con: list[int] = []
    if so_ten is not None and int(so_ten) >= TRAN_TEN:
        con.append(int(ttl_ten) if ttl_ten and int(ttl_ten) > 0 else CUA_SO_GIAY)
    if so_ip is not None and int(so_ip) >= TRAN_IP:
        con.append(int(ttl_ip) if ttl_ip and int(ttl_ip) > 0 else CUA_SO_GIAY)
    if not con:
        return None
    return max(1, math.ceil(max(con) / 60))


def ghi_sai(username: str, ip: str) -> None:
    """Cộng một lần sai cho cả tên lẫn IP. Cửa sổ bắt đầu từ lần sai ĐẦU (SET NX EX), không trượt
    theo mỗi lần sai — nếu không, kẻ dò đều đặn sẽ bị khoá mãi còn người gõ nhầm cũng vậy."""
    client = _redis()
    if client is None:
        return
    try:
        pipe = client.pipeline()
        for k in (_khoa_ten(username), _khoa_ip(ip)):
            pipe.set(k, 0, ex=CUA_SO_GIAY, nx=True)
            pipe.incr(k)
        pipe.execute()
    except Exception:
        pass


def xoa_dem_ten(username: str) -> None:
    """Đăng nhập đúng ⇒ xoá bộ đếm của tên đăng nhập."""
    client = _redis()
    if client is None:
        return
    try:
        client.delete(_khoa_ten(username))
    except Exception:
        pass


def thong_bao(phut: int) -> str:
    return f"Đăng nhập sai quá nhiều lần, vui lòng thử lại sau {phut} phút."
