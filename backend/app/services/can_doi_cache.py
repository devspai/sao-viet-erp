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

Chỉ dùng cho đường ĐỌC: router `/can-doi`, đèn vật tư của danh sách Lệnh SX
(`lenh_sx/danh_sach._den_vat_tu_co_cache`) và dự báo tồn của màn Tồn kho
(`ton_kho_nhom_service`, khoá `loai="ton_nhom_du_bao"`). Cùng tiền tố nên `xoa_cache_can_doi` xoá luôn.
Đường ghi (giữ chỗ, ghi sổ kho) gọi thẳng `can_doi` của service để có số TƯƠI trong transaction — đừng đưa cache vào đó.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from contextlib import contextmanager
from typing import Any, Callable

from ..config import settings

HAN_GIAY = 45
_TIEN_TO = "svn:cache:can_doi:"
#: Trần số khoá giữ trong tiến trình — `q` là ô gõ tự do, không chặn thì dict phình theo từng phím.
_TRAN_KHOA = 256
#: Ngăn PHỤ cho các khoá có thể đổi theo hình dạng dữ liệu (dự báo tồn của màn Tồn kho: mỗi tập khoá tồn một
#: khoá). Có trần riêng và chỉ đuổi MỤC CỦA CHÍNH NÓ (cũ nhất trước) — churn ở đây không bao giờ đụng tới bảng
#: cân đối đắt tiền (23,8 giây dựng lại) nằm ở ngăn chính. Cùng tiền tố nên `xoa_cache_can_doi` xoá cả hai.
NGAN_CHINH = "chinh"
NGAN_PHU = "phu"
_TRAN_KHOA_PHU = 64

_khoa_luong = threading.Lock()
_bo_nho: dict[str, tuple[float, Any]] = {}
_bo_nho_phu: dict[str, tuple[float, Any]] = {}
#: Khoá đang được tính → (ổ khoá, số người đang giữ/chờ). Một khoá nguội chỉ tính MỘT lần (single-flight).
_dang_tinh: dict[str, list] = {}
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


def _kho_trong_tien_trinh(ngan: str) -> dict[str, tuple[float, Any]]:
    return _bo_nho_phu if ngan == NGAN_PHU else _bo_nho


def _doc(khoa: str, ngan: str = NGAN_CHINH):
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
        kho = _kho_trong_tien_trinh(ngan)
        o = kho.get(khoa)
        if o is None:
            return None
        het_han, gia_tri = o
        if het_han <= time.monotonic():
            kho.pop(khoa, None)
            return None
        return gia_tri


def _ghi(khoa: str, gia_tri, ngan: str = NGAN_CHINH) -> None:
    client = _redis()
    if client is not None:
        try:
            client.set(khoa, json.dumps(gia_tri, ensure_ascii=False, default=str), ex=HAN_GIAY)
        except Exception:
            pass
        return
    with _khoa_luong:
        bay_gio = time.monotonic()
        kho = _kho_trong_tien_trinh(ngan)
        if ngan == NGAN_PHU:
            # Ngăn phụ: bỏ mục hết hạn, còn đầy thì đuổi mục CŨ NHẤT của chính ngăn này (không clear cả ngăn).
            if khoa not in kho and len(kho) >= _TRAN_KHOA_PHU:
                for k in [k for k, (h, _) in kho.items() if h <= bay_gio]:
                    kho.pop(k, None)
                while len(kho) >= _TRAN_KHOA_PHU:
                    kho.pop(min(kho, key=lambda k: kho[k][0]), None)
        elif len(kho) >= _TRAN_KHOA:
            for k in [k for k, (h, _) in kho.items() if h <= bay_gio]:
                kho.pop(k, None)
            if len(kho) >= _TRAN_KHOA:
                kho.clear()
        kho[khoa] = (bay_gio + HAN_GIAY, gia_tri)


@contextmanager
def _mot_nguoi_tinh(khoa: str):
    """Ổ khoá theo TỪNG khoá cache: các request cùng lúc trên một khoá nguội xếp hàng, người đầu tính, những
    người sau đọc lại cache. Ổ khoá bỏ khỏi bảng khi không còn ai giữ/chờ nên bảng không phình."""
    with _khoa_luong:
        o = _dang_tinh.get(khoa)
        if o is None:
            o = _dang_tinh[khoa] = [threading.Lock(), 0]
        o[1] += 1
    try:
        with o[0]:
            yield
    finally:
        with _khoa_luong:
            o[1] -= 1
            if o[1] <= 0:
                _dang_tinh.pop(khoa, None)


def lay_hoac_tinh(tinh: Callable[[], dict], *, ngan: str = NGAN_CHINH, **tham_so) -> dict:
    """Trả bản cache còn hạn của bộ `tham_so`; không có thì gọi `tinh()` (phải trả dict thuần JSON
    được) rồi cất. Lỗi của `tinh()` KHÔNG bị cache; kết quả có khoá `_khong_cache` cũng không.
    Khoá nguội chỉ được tính MỘT lần dù nhiều request đến cùng lúc (single-flight trong tiến trình).
    `ngan=NGAN_PHU` cho khoá có thể đổi theo hình dạng dữ liệu — xem chú thích `NGAN_PHU`."""
    khoa = khoa_cache(**tham_so)
    co = _doc(khoa, ngan)
    if co is not None:
        return co
    with _mot_nguoi_tinh(khoa):
        co = _doc(khoa, ngan)       # người đi trước có thể đã tính xong trong lúc ta chờ
        if co is not None:
            return co
        gia_tri = tinh()
        # Kết quả tự đánh dấu "đừng cất" (vd dự báo hỏng tạm thời, chỉ là bản lùi) thì không ghi cache.
        if not gia_tri.get("_khong_cache"):
            _ghi(khoa, gia_tri, ngan)
        return gia_tri


def bang_can_doi(kh, giu, *, q: str = "", chi_thieu: bool = False) -> dict:
    """Bảng cân đối toàn xưởng (đã gắn giữ chỗ) qua cache — MỘT định nghĩa cho mọi nơi đọc.

    `/can-doi` và dự báo tồn của màn Tồn kho (`DuBaoTonService`) cùng gọi đây nên ăn chung bản cache
    `q="" · chi_thieu=False`: hai màn nhìn đúng một bộ số, và mở màn Tồn kho không dựng lại bảng."""
    from ..schemas.ke_hoach_vat_tu import CanDoiOut  # import trễ: schema không phải phụ thuộc của cache

    def tinh() -> dict:
        with kh.nho_phieu_mua():
            bang = kh.can_doi(q=q or None, chi_thieu=chi_thieu)
            giu.gan_giu_cho_vao_bang(bang)
        return CanDoiOut(**bang, so_giu_lau=giu.dem_giu_lau()).model_dump(mode="json")

    return lay_hoac_tinh(tinh, q=q or "", chi_thieu=bool(chi_thieu))


def xoa_cache_can_doi() -> None:
    """Bỏ mọi bản cache bảng cân đối — gọi cạnh chỗ phát `ke_hoach_vat_tu_thay_doi`/`lsx_changed`.
    Không bao giờ ném lỗi: xoá cache hỏng thì cùng lắm số cũ sống thêm tối đa 45 giây."""
    with _khoa_luong:
        _bo_nho.clear()
        _bo_nho_phu.clear()
    client = _redis()
    if client is None:
        return
    try:
        khoa = list(client.scan_iter(match=_TIEN_TO + "*", count=200))
        if khoa:
            client.delete(*khoa)
    except Exception:
        pass
