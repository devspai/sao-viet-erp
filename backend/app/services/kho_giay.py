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


def goi_y_dong_giay(qc: dict) -> dict:
    """Gợi ý dòng giấy của bước lệnh (spec §4.2) từ quy cách đã gộp số cột (`quy_cach_bien`):
    khổ nguyên + số tờ nguyên; thiếu khổ nguyên thì khổ tờ in + số tờ vào máy. Không công thức.

    Trả `{so_luong, kho_rong, kho_dai, don_vi, dien_giai, ly_do}`; chưa đủ dữ kiện ⇒ `so_luong=None`
    kèm `ly_do` (ô để trống cho người lập lệnh gõ, khổ vẫn điền nếu có)."""
    def so(*khoa):
        for k in khoa:
            try:
                v = float(qc.get(k) or 0)
            except (TypeError, ValueError):
                v = 0.0
            if v > 0:
                return v
        return 0.0

    kr, kd = chuan_kho(so("kho_nguyen_dai", "kho_dai"), so("kho_nguyen_rong", "kho_rong"))
    nguon, to = "khổ nguyên", so("to_nguyen")
    if not (kr and kd):
        kr, kd = chuan_kho(so("kho_in_dai"), so("kho_in_rong"))
        nguon, to = "khổ tờ in", so("to_dau_vao")
    if not (kr and kd):
        kr = kd = 0
    out = {"kho_rong": kr, "kho_dai": kd, "don_vi": don_vi_goc_to(),
           "so_luong": None, "dien_giai": None, "ly_do": None}
    if not (kr and kd):
        out["ly_do"] = "Lệnh chưa có khổ giấy — gõ tay."
    elif to <= 0:
        out["ly_do"] = "Lệnh chưa có số tờ — gõ tay."
    else:
        out["so_luong"] = round(to, 3)
        out["dien_giai"] = f"Theo {nguon} của lệnh {nhan_kho(kr, kd)}"
    return out


def dong_giay_theo_dau_vao(*, don_vi_vao: str | None, so_luong_vao: float, so_luong_ra: float,
                           quy_cach: dict, gsm: float | None) -> dict:
    """Dòng giấy của MỘT bước, dẫn xuất từ ĐẦU VÀO của bước (spec 2026-10-01 dong-giay-theo-dau-vao §4).

    Bước nhận tờ in (`TRAM_TO`) ⇒ tờ khổ in; nhận tờ nguyên (`TRAM_TO_NGUYEN`) ⇒ tờ khổ nguyên; còn lại
    (đơn vị vào có khai nhưng KHÔNG phải mã chặng giấy — bước nhận cuộn, vd Cắt cuộn) ⇒ cuộn, đếm bằng **kg** = tờ nguyên ra × diện tích × gsm. Cuộn luôn trả
    `don_vi="kg"` — bên gọi đổi sang đơn vị của mã giấy. Thiếu khổ / gsm ⇒ `so_luong=None` + `ly_do`.
    """
    from ..models.don_vi_do import TRAM_TO, TRAM_TO_NGUYEN
    from .dong_giay import ban_do_tram, tram_cua

    def so(*khoa):
        for k in khoa:
            try:
                v = float((quy_cach or {}).get(k) or 0)
            except (TypeError, ValueError):
                v = 0.0
            if v > 0:
                return v
        return 0.0

    ng_r, ng_d = chuan_kho(so("kho_nguyen_rong"), so("kho_nguyen_dai"))
    in_r, in_d = chuan_kho(so("kho_in_rong"), so("kho_in_dai"))
    tram = tram_cua(don_vi_vao, ban_do_tram()) if don_vi_vao else None
    out = {"dang": DANG_TO, "so_luong": None, "don_vi": don_vi_vao or "", "kho_rong": 0,
           "kho_dai": 0, "ly_do": None}
    if tram == TRAM_TO:
        kr, kd = (in_r, in_d) if (in_r and in_d) else (ng_r, ng_d)
        out.update(so_luong=float(so_luong_vao or 0), kho_rong=kr, kho_dai=kd)
        if not (kr and kd):
            out.update(so_luong=None, ly_do="Lệnh chưa có khổ giấy (khổ tờ in / khổ nguyên).")
        return out
    if tram == TRAM_TO_NGUYEN:
        out.update(so_luong=float(so_luong_vao or 0), kho_rong=ng_r, kho_dai=ng_d)
        if not (ng_r and ng_d):
            out.update(so_luong=None, ly_do="Lệnh chưa có khổ nguyên của giấy.")
        return out
    if not (don_vi_vao or "").strip():
        out.update(ly_do="Bước chưa khai đơn vị vào.")
        return out
    if tram is not None:
        # Chặng giấy nhưng không phải tờ (con / cai / tay): đầu vào không còn là tờ hay cuộn giấy.
        out.update(ly_do="Đầu vào của bước không phải tờ hay cuộn giấy nên không tính được dòng giấy.")
        return out
    out.update(dang=DANG_CUON, don_vi="kg", kho_rong=ng_r, kho_dai=0)
    if not (ng_r and ng_d):
        out.update(so_luong=None, ly_do="Lệnh chưa có khổ nguyên để tính kg cuộn.")
    elif not gsm or float(gsm) <= 0:
        out.update(so_luong=None, ly_do="Giấy chưa khai định lượng (gsm) nên không tính được kg cuộn.")
    else:
        out["so_luong"] = float(so_luong_ra or 0) * (ng_r / 1000) * (ng_d / 1000) * float(gsm) / 1000
    return out


def khoa_ton_cua(obj) -> tuple:
    """Khoá tra tồn của một lô / dòng (có `hang_loai`, `hang_id`, `dang_giay`, `kho_rong`, `kho_dai`).
    Giấy đã có dạng ⇒ `khoa_ton` (tờ đúng khổ / cuộn theo mã). Hàng khác, hoặc giấy CŨ chưa có dạng
    (dữ liệu kg trước mg 0349) ⇒ cặp `(loai, id)` — gom mọi lô của mã như trước."""
    loai, hid = obj.hang_loai, int(obj.hang_id)
    dang = getattr(obj, "dang_giay", None)
    if loai != "giay" or not dang:
        return (loai, hid)
    return khoa_ton(loai, hid, dang=dang, kho_rong=getattr(obj, "kho_rong", 0) or 0,
                    kho_dai=getattr(obj, "kho_dai", 0) or 0)
