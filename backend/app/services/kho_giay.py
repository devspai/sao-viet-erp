"""Khổ + dạng của giấy (spec 2026-10-01-giay-dem-to-theo-kho). MỘT nơi chuẩn hoá — đừng tự min/max."""
from __future__ import annotations

DANG_TO = "to"
DANG_CUON = "cuon"
DANG_GIAY = (DANG_TO, DANG_CUON)

#: Khoá so tồn / giữ chỗ / nhu cầu: (hang_loai, hang_id, kho_rong, kho_dai).
Khoa = tuple[str, int, int, int]


def _mm(x) -> int:
    try:
        v = int(round(float(x)))
    except (TypeError, ValueError):
        return 0
    return v if v > 0 else 0


def chuan_kho(a, b) -> tuple[int, int]:
    """Hai cạnh mm, thứ tự tuỳ ý → (cạnh ngắn, cạnh dài). Thiếu cạnh = 0; một cạnh ⇒ (cạnh, 0)."""
    x, y = _mm(a), _mm(b)
    if x and y:
        return (min(x, y), max(x, y))
    return (x or y, 0)


def dang_tu_kho(kho_rong: int, kho_dai: int) -> str:
    """Đủ hai cạnh ⇒ tờ, còn lại ⇒ cuộn. Chỉ dùng để ĐIỀN SẴN (chép từ dòng mua sang yêu cầu nhập)."""
    return DANG_TO if kho_rong and kho_dai else DANG_CUON


def khoa_ton(hang_loai: str, hang_id: int, *, dang: str | None = None,
             kho_rong=0, kho_dai=0) -> Khoa:
    """Vật tư: (loai, id, 0, 0). Giấy tờ: (giay, id, rộng, dài). Giấy cuộn: (giay, id, 0, 0) — cuộn
    gom theo mã, khổ rộng chỉ để xem. Giấy tờ thiếu khổ cũng ra (giay, id, 0, 0): nơi cần TỜ phải hỏi
    `la_khoa_to` trước khi tra tồn."""
    if hang_loai != "giay":
        return (hang_loai, int(hang_id), 0, 0)
    kr, kd = chuan_kho(kho_rong, kho_dai)
    if (dang or dang_tu_kho(kr, kd)) == DANG_CUON:
        return ("giay", int(hang_id), 0, 0)
    return ("giay", int(hang_id), kr, kd)


def la_khoa_to(k) -> bool:
    return len(k) == 4 and k[0] == "giay" and k[2] > 0 and k[3] > 0


def khoa_dong(hang_loai: str, hang_id: int, dang: str | None, kho_rong=0, kho_dai=0) -> tuple:
    """Khoá CHỐNG TRÙNG dòng trên một chứng từ (yêu cầu kho, phiếu, đề nghị cấp): cùng mã khác dạng/khổ
    là hai dòng hợp lệ."""
    if hang_loai != "giay":
        return (hang_loai, int(hang_id), None, 0, 0)
    kr, kd = chuan_kho(kho_rong, kho_dai)
    return ("giay", int(hang_id), dang or dang_tu_kho(kr, kd), kr, kd)


def nhan_kho(kho_rong: int, kho_dai: int) -> str:
    """"780 × 905 mm" · cuộn "khổ 1000 mm" · không có ⇒ "chưa có khổ"."""
    if kho_rong and kho_dai:
        return f"{kho_rong} × {kho_dai} mm"
    if kho_rong:
        return f"khổ {kho_rong} mm"
    return "chưa có khổ"


def don_vi_goc_to() -> str:
    """MÃ đơn vị đếm lô/dòng giấy TỜ = đơn vị đứng ở chặng tờ nguyên (hỏi `dong_giay`, không viết cứng)."""
    from ..models.don_vi_do import TRAM_TO_NGUYEN
    from .dong_giay import ban_do_tram, ma_cua_tram

    return ma_cua_tram(TRAM_TO_NGUYEN, ban_do_tram()) or TRAM_TO_NGUYEN
