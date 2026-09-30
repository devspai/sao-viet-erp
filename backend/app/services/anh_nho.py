"""Ảnh thu nhỏ theo yêu cầu cho `/api/files/<khoá>?w=160|320`.

Vì sao: màn nhiều ảnh (ảnh máy hỏng, lỗi KCS, đính kèm, tồn kho…) vẽ ô 80–200px nhưng kéo ảnh gốc
~400 KB mỗi tấm (frontend đã nén trước khi gửi, còn ảnh cũ thì tới vài MB). Ảnh nhỏ ~10–25 KB.

Sinh LẦN ĐẦU có người xin, cất vào kho tệp dưới `_thumb/w<W>/<khoá gốc>.jpg`, lần sau phục vụ
thẳng. Khoá gốc không bao giờ trỏ sang nội dung khác (xem `routers/files.py::_CACHE_VINH_VIEN`) nên
ảnh nhỏ không bao giờ phải làm mới. `_thumb/` KHÔNG đọc thẳng được qua URL — router chặn, vì quyền
của nó là quyền của ảnh gốc.
"""
from __future__ import annotations

import io
import logging

from ..storage import Storage

log = logging.getLogger(__name__)

TIEN_TO = "_thumb/"
#: Chiều rộng cho phép — hai cỡ đủ cho mọi lưới hiện có (ô 80px màn hình dày ⇒ 160, ô 160px ⇒ 320).
CO_CHO_PHEP = (160, 320)
#: Đuôi ảnh raster thu nhỏ được. GIF động ra KHUNG ĐẦU — ô lưới chỉ cần nhận ra ảnh, khung xem lớn
#: vẫn mở ảnh gốc (ảnh vật tư GIF ở Tồn kho nặng 4 MB mỗi tấm).
_DUOI_RASTER = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")
#: Ảnh gốc lớn hơn mức này thì thôi, phục vụ ảnh gốc — không đọc cả chục MB vào RAM một worker.
_TRAN_BYTE = 25 * 2**20
#: Chặn ảnh "bom giải nén" (khai 50.000×50.000 điểm trong vài KB): Pillow ném lỗi thay vì chỉ cảnh báo.
_TRAN_DIEM_ANH = 60_000_000


def thu_nho_duoc(key: str) -> bool:
    return key.lower().endswith(_DUOI_RASTER)


def khoa_anh_nho(key: str, w: int) -> str:
    return f"{TIEN_TO}w{w}/{key}.jpg"


def thu_nho(du_lieu: bytes, w: int) -> bytes:
    """JPEG chất lượng 80, CẠNH NGẮN = `w` (ô lưới cắt `object-fit: cover` nên cạnh ngắn phải đủ),
    cạnh dài chặn ở 4w cho ảnh toàn cảnh. Xoay theo EXIF — ảnh điện thoại chụp dọc lưu ngang."""
    from PIL import Image, ImageOps

    Image.MAX_IMAGE_PIXELS = _TRAN_DIEM_ANH
    with Image.open(io.BytesIO(du_lieu)) as anh:
        # JPEG: giải mã sẵn ở tỉ lệ 1/2, 1/4, 1/8 — nhanh hơn nhiều lần so với giải mã đủ rồi thu.
        anh.draft("RGB", (w * 2, w * 2))
        anh = ImageOps.exif_transpose(anh)
        if anh.mode in ("RGBA", "LA", "P"):
            nen = Image.new("RGB", anh.size, (255, 255, 255))
            anh = anh.convert("RGBA")
            nen.paste(anh, mask=anh.getchannel("A"))
            anh = nen
        elif anh.mode != "RGB":
            anh = anh.convert("RGB")
        rong, cao = anh.size
        ti_le = min(w / min(rong, cao), 4 * w / max(rong, cao), 1.0)
        if ti_le < 1.0:
            anh = anh.resize((max(1, round(rong * ti_le)), max(1, round(cao * ti_le))),
                             Image.LANCZOS)
        ra = io.BytesIO()
        anh.save(ra, "JPEG", quality=80, optimize=True, progressive=True)
        return ra.getvalue()


def dam_bao_anh_nho(store: Storage, key: str, w: int) -> str | None:
    """Khoá ảnh nhỏ (sinh nếu chưa có). `None` ⇒ không thu nhỏ được, người gọi phục vụ ảnh gốc —
    ảnh hỏng/quá lớn/kho tệp lỗi không được làm mất ảnh trên màn."""
    dich = khoa_anh_nho(key, w)
    try:
        if store.ton_tai(dich):
            return dich
        luong, co, _ = store.open_stream(key)
        try:
            if co is not None and co > _TRAN_BYTE:
                return None
            du_lieu = bytearray()
            for khuc in luong:
                du_lieu += khuc
                if len(du_lieu) > _TRAN_BYTE:
                    return None
        finally:
            luong.close()
        store.save(dich, thu_nho(bytes(du_lieu), w), "image/jpeg")
        return dich
    except Exception:  # noqa: BLE001 — mọi lỗi đều lùi về ảnh gốc
        log.warning("Không thu nhỏ được ảnh %s (w=%s)", key, w, exc_info=True)
        return None
