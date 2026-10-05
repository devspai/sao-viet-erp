"""Cache ngắn cho bảng cân đối vật tư TOÀN XƯỞNG (`GET /api/ke-hoach-vat-tu/can-doi`).

Vì sao: bảng này dựng lại cả xưởng mỗi lần gọi (đo 23,8 giây / 3,1GB RAM ở 100 nghìn lệnh), mà
badge Kế hoạch vật tư + màn Kế hoạch vật tư gọi nó mỗi lần mở app / có sự kiện — nhiều tab cùng gọi
một kết quả giống hệt nhau.

Kết quả KHÔNG phụ thuộc người gọi: router chỉ gác quyền `ke_hoach_vat_tu:read`, service không lọc
theo scope và bảng không có cột tiền (xem `schemas/ke_hoach_vat_tu.py`). Nên khoá cache chỉ gồm
tham số truy vấn (`q`, `chi_thieu`).

Hạn 45 giây. Xoá sớm (`xoa_cache_can_doi`) ở đúng những chỗ phát `ke_hoach_vat_tu_thay_doi` /
`lsx_changed`. Có `REDIS_URL` ⇒ cache chung mọi worker (khoá `svn:cache:can_doi:<hash>`, `SET EX`,
JSON); không có ⇒ dict trong tiến trình. Redis lỗi ⇒ bỏ qua cache, request vẫn chạy bình thường.

Chỉ dùng cho đường ĐỌC: router `/can-doi` và đèn vật tư của danh sách Lệnh SX
(`lenh_sx/danh_sach._den_vat_tu_co_cache`). Đường ghi (giữ chỗ, ghi sổ kho) gọi thẳng `can_doi` của service để
có số TƯƠI trong transaction — đừng đưa cache vào đó.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from typing import Any, Callable

from ..config import settings

HAN_GIAY = 45
_TIEN_TO = "svn:cache:can_doi:"
#: Trần số khoá giữ trong tiến trình — `q` là ô gõ tự do, không chặn thì dict phình theo từng phím.
_TRAN_KHOA = 256

_khoa_luong = threading.Lock()
_bo_nho: dict[str, tuple[float, Any]] = {}
_client = None


def _redis():
    global _client
    if not settings.redis_url:
        return None
    if _client is None:
        import redis  # import trễ: không có Redis thì khỏi cần thư viện

        # Hạn giờ socket: Redis treo KHÔNG được kéo request treo theo.
        _client = redis.from_url(
            settings.redis_url, decode_responses=True, socket_timeout=2, socket_connect_timeout=2,
        )
    return _client


def khoa_cache(**tham_so) -> str:
    tho = json.dumps(tham_so, sort_keys=True, ensure_ascii=False, default=str)
    return _TIEN_TO + hashlib.sha1(tho.encode("utf-8")).hexdigest()


def _doc(khoa: str):
    client = _redis()
    if client is not None:
        try:
            tho = client.get(khoa)
        except Exception:
            return None
        if tho is None:
            return None
        try:
            return json.loads(tho)
        except ValueError:
            return None
    with _khoa_luong:
        o = _bo_nho.get(khoa)
        if o is None:
            return None
        het_han, gia_tri = o
        if het_han <= time.monotonic():
            _bo_nho.pop(khoa, None)
            return None
        return gia_tri


def _ghi(khoa: str, gia_tri) -> None:
    client = _redis()
    if client is not None:
        try:
            client.set(khoa, json.dumps(gia_tri, ensure_ascii=False, default=str), ex=HAN_GIAY)
        except Exception:
            pass
        return
    with _khoa_luong:
        bay_gio = time.monotonic()
        if len(_bo_nho) >= _TRAN_KHOA:
            for k in [k for k, (h, _) in _bo_nho.items() if h <= bay_gio]:
                _bo_nho.pop(k, None)
            if len(_bo_nho) >= _TRAN_KHOA:
                _bo_nho.clear()
        _bo_nho[khoa] = (bay_gio + HAN_GIAY, gia_tri)


def lay_hoac_tinh(tinh: Callable[[], dict], **tham_so) -> dict:
    """Trả bản cache còn hạn của bộ `tham_so`; không có thì gọi `tinh()` (phải trả dict thuần JSON
    được) rồi cất. Lỗi của `tinh()` KHÔNG bị cache."""
    khoa = khoa_cache(**tham_so)
    co = _doc(khoa)
    if co is not None:
        return co
    gia_tri = tinh()
    _ghi(khoa, gia_tri)
    return gia_tri


def xoa_cache_can_doi() -> None:
    """Bỏ mọi bản cache bảng cân đối — gọi cạnh chỗ phát `ke_hoach_vat_tu_thay_doi`/`lsx_changed`.
    Không bao giờ ném lỗi: xoá cache hỏng thì cùng lắm số cũ sống thêm tối đa 45 giây."""
    with _khoa_luong:
        _bo_nho.clear()
    client = _redis()
    if client is None:
        return
    try:
        khoa = list(client.scan_iter(match=_TIEN_TO + "*", count=200))
        if khoa:
            client.delete(*khoa)
    except Exception:
        pass
