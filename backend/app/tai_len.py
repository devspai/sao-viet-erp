"""Đọc tệp tải lên có TRẦN — cửa chung cho mọi endpoint nhận `UploadFile`.

Vì sao có module này: trước đây mọi chỗ `file.file.read()` nguyên tệp vào RAM rồi mới so cỡ. 20
người tải tệp 50 MB cùng lúc là ~1 GB RAM của tiến trình, OOM thì sập cả app. Ở đây đọc theo khối
1 MiB, vượt trần là dừng NGAY — phần thừa nằm lại trong tệp tạm của Starlette, không vào RAM.

Hàm ở đây là hàm ĐỒNG BỘ (đọc `f.file`), nên route gọi nó phải là `def` — FastAPI chạy route
`def` trong threadpool, không chặn event loop (route `async def` đọc đồng bộ thì cả máy chủ đứng).
"""
from __future__ import annotations

from fastapi import HTTPException, UploadFile, status

MIB = 1024 * 1024
TRAN_EXCEL = 10 * MIB
TRAN_TAI_LIEU = 20 * MIB

_KHOI = MIB


def _so_mb(max_bytes: int) -> str:
    """`10485760` → "10"; trần lẻ (vd 1.5 MB) vẫn hiện đúng, không làm tròn thành số sai."""
    return f"{max_bytes / MIB:g}"


def doc_gioi_han(
    f: UploadFile,
    max_bytes: int,
    *,
    ten: str = "Tệp",
    cho_rong: bool = False,
    ma_rong: int = status.HTTP_422_UNPROCESSABLE_ENTITY,
    loi_rong: str | None = None,
) -> bytes:
    """Đọc `f` tối đa `max_bytes` byte.

    - Vượt trần ⇒ `HTTPException(413, "<ten> vượt quá N MB.")` ngay, không đọc tiếp.
    - Rỗng ⇒ `HTTPException(ma_rong, loi_rong or "<ten> rỗng.")`. Chỗ gọi cũ đã có câu/mã riêng
      cho tệp rỗng thì truyền `ma_rong`/`loi_rong` để giữ nguyên; `cho_rong=True` khi tầng service
      tự kiểm rỗng bằng câu của nó (trả `b""` cho service quyết).
    """
    loi_qua_lon = HTTPException(
        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{ten} vượt quá {_so_mb(max_bytes)} MB."
    )
    # Starlette đã biết cỡ lúc parse multipart → chặn luôn, khỏi đọc khối nào.
    if f.size is not None and f.size > max_bytes:
        raise loi_qua_lon

    khoi: list[bytes] = []
    da_doc = 0
    while True:
        # Đọc dư 1 byte so với phần còn được phép để biết chắc là "vượt" chứ không phải "vừa khít".
        con_lai = max_bytes + 1 - da_doc
        chunk = f.file.read(min(_KHOI, con_lai))
        if not chunk:
            break
        da_doc += len(chunk)
        if da_doc > max_bytes:
            raise loi_qua_lon
        khoi.append(chunk)

    data = b"".join(khoi)
    if not data and not cho_rong:
        raise HTTPException(ma_rong, loi_rong or f"{ten} rỗng.")
    return data


# Ảnh raster trình duyệt / điện thoại chụp ra. SVG CỐ Ý không có: nó là tài liệu XML chạy được
# script — mở thẳng đường dẫn cùng origin là script chạy với phiên của người đang xem.
KIEU_ANH = frozenset({
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
})
_LOI_ANH = "Chỉ nhận ảnh JPG, PNG, WEBP, GIF hoặc HEIC."


def kiem_anh(content_type: str | None, ten_tep: str | None) -> None:
    """Chặn mọi thứ không phải ảnh raster (415). Kiểm cả kiểu lẫn đuôi: trình duyệt gửi kiểu theo
    đuôi, nhưng client tự viết gửi gì cũng được — đuôi `.svg` mà khai `image/png` vẫn bị chặn."""
    kieu = (content_type or "").split(";", 1)[0].strip().lower()
    ten = (ten_tep or "").strip().lower()
    if kieu not in KIEU_ANH or ten.endswith((".svg", ".svgz")):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, _LOI_ANH)
