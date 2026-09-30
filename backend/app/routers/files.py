"""Phục vụ file người dùng tải lên — thay cho mount `/static` công khai trước đây.

Vì sao có router này: `/static` là public, ai có URL là đọc được scan CCCD, hợp đồng lao động,
chứng từ kế toán. Giờ mọi byte đi qua đây: phải ĐĂNG NHẬP, và với thư mục nhạy cảm còn phải có
quyền đọc module tương ứng.

Vì sao xác thực bằng cookie chứ không phải Bearer: `<img src>` / `<a download>` do trình duyệt
tự phát, không gắn được header `Authorization`, mà access token cố ý chỉ nằm trong RAM của tab
(`frontend/src/auth/AuthContext.tsx`). Chi tiết ở `app/deps.py::get_file_user`.
"""
from __future__ import annotations

import mimetypes
import re
from typing import Annotated, Iterator
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import FileUser, get_authorization_service
from ..services.quyen_to import VIEC_XEM, quyen_to_cua
from ..services.rbac_service import AuthorizationService
from ..config import settings
from ..storage import LuongTep, MinioStorage, StorageFileNotFound, get_storage, is_safe_key

router = APIRouter(prefix="/api/files", tags=["files"])

# Thư mục nào đòi quyền gì. KHÔNG có trong bảng → chỉ cần đăng nhập (vd `avatars/`: ảnh đại diện
# hiện khắp app, ai đăng nhập cũng thấy). Module key lấy từ hằng `MODULE` của router tương ứng.
_PREFIX_PERMISSION: dict[str, str] = {
    "hr": "nhan_su",
    "crm": "khach_hang",
    # Chứng từ đính kèm đi theo MÀN của nó, không còn dùng chung khoá `ke_toan`.
    "ke-toan": "phieu_chi",
    "ke-toan-thu": "phieu_thu",
    "don-hang": "don_hang_ban",
    "san-xuat": "san_xuat",
    "kho": "kho",  # đính kèm phiếu kho (chứng từ nhập/xuất) — chỉ người có quyền đọc kho xem được
    # Hợp đồng / hoá đơn / biên bản giao nhận của phiếu mua (06/08/2026).
    "mua-hang": "thu_mua",
    # Tài liệu đính kèm nội bộ của báo giá (file khách gửi / mẫu thiết kế / ảnh tham khảo).
    "bao-gia": "bao_gia",
    # Ảnh hiện trạng hỏng + ảnh chứng thực sau sửa/bảo trì (12/08/2026). Gác quyền vì ảnh máy móc
    # cho thấy tình trạng nhà xưởng, không phải thứ ai đăng nhập cũng nên xem.
    "ky-thuat-may": "ky_thuat_may",
    # Hoá đơn / biên nhận khách đã ký của chuyến giao (mg 0230, 22/08/2026). PHẢI gác: trên tờ
    # hoá đơn có tên khách, mặt hàng và ĐƠN GIÁ — thiếu dòng này thì thư mục rơi vào nhánh
    # "không có khoá" ở dưới, tức ai đăng nhập cũng đọc được.
    "giao-hang": "giao_hang",
}

# Thư mục chứa ảnh của HAI màn khác ô quyền — khoá có dạng `<thư mục>/<loại phiếu>/...` nên soi
# thêm đoạn thứ hai. Không làm bước này thì chỉ còn hai lựa chọn, cả hai đều dở: nới `ky-thuat-may`
# cho cả hai khoá (người chỉ có Phiếu bảo trì xem được ảnh máy hỏng), hoặc để nguyên một khoá
# (người chỉ có Phiếu bảo trì không xem được ảnh của chính phiếu mình đang làm).
_PREFIX_2_PERMISSION: dict[tuple[str, str], tuple[str, ...]] = {
    ("ky-thuat-may", "bao_tri"): ("phieu_bao_tri",),
    # Ảnh máy hỏng người ngoài tổ kỹ thuật gửi kèm yêu cầu. Trước 24/09/2026 phải khai HAI khoá
    # (`yeu_cau_sua_chua` cho người báo + `ky_thuat_may` cho tổ sửa chữa) vì lúc yêu cầu thành
    # phiếu, ảnh đổi chủ sang phiếu nhưng KHOÁ LƯU TRỮ vẫn mang đoạn `yeu_cau`. Nay "Báo máy hỏng"
    # là ô chi tiết của chính `ky_thuat_may` (mg `0332`) nên một khoá gác đủ cả hai bên.
    ("ky-thuat-may", "yeu_cau"): ("ky_thuat_may",),
}


def _xem_ban_to(db: Session, thu_muc: str, user) -> bool:
    """Ảnh của Bàn tổ (`san-xuat/…`, ảnh lỗi KCS) còn mở cho người XEM được một tổ theo dòng quyền
    theo tổ (mg 0302) — thợ/tổ trưởng không nhất thiết có ô tĩnh `san_xuat`."""
    return thu_muc == "san-xuat" and quyen_to_cua(db, user).co_viec(VIEC_XEM)


# Khoá tệp KHÔNG BAO GIỜ trỏ sang nội dung khác: mọi chỗ ghi đều sinh khoá mới có đoạn ngẫu nhiên
# (`storage.make_key` → `token_hex(4)`; ảnh đại diện → `token_hex(8)`; đính kèm phiếu kho tự ghép
# `token_hex(4)`), sửa tệp = tải tệp mới = khoá mới. Nên cache được vĩnh viễn — `private` để proxy
# dùng chung không giữ (tệp gắn với quyền của người xem). Trước đây 5 phút: danh sách 50 ảnh là 50
# lượt tải lại ảnh gốc mỗi lần mở màn.
_CACHE_VINH_VIEN = "private, max-age=31536000, immutable"


def _etag(key: str) -> str:
    # Header HTTP chỉ nhận latin-1, mà tên tệp có dấu tiếng Việt ⇒ mã hoá % (không đổi nghĩa: vẫn
    # là "khoá tệp", khớp 1-1).
    return f'"{quote(key, safe="/")}"'


def _khop_etag(if_none_match: str | None, etag: str) -> bool:
    """`If-None-Match` có thể là `*`, một danh sách `"a", "b"`, hoặc dạng yếu `W/"a"`."""
    if not if_none_match:
        return False
    for phan in if_none_match.split(","):
        phan = phan.strip()
        if phan == "*" or phan.removeprefix("W/") == etag:
            return True
    return False


def _phat(stream: LuongTep) -> Iterator[bytes]:
    """Bọc luồng để `finally` đóng nó cả khi client ngắt giữa chừng (Starlette bỏ dở vòng lặp,
    generator bị thu dọn ⇒ `finally` chạy). Hết luồng bình thường thì `BackgroundTask` đóng —
    `close()` gọi hai lần vô hại."""
    try:
        yield from stream
    finally:
        stream.close()


@router.get("/{key:path}")
def download_file(
    key: str,
    user: FileUser,
    db: Annotated[Session, Depends(get_db)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    # Kiểm khoá TRƯỚC khi chạm storage: `key` tới thẳng từ URL người dùng gõ.
    if not is_safe_key(key):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Đường dẫn tệp không hợp lệ")

    doan = key.split("/")
    khoa = _PREFIX_2_PERMISSION.get((doan[0], doan[1] if len(doan) > 1 else ""))
    if khoa is None:
        mot = _PREFIX_PERMISSION.get(doan[0])
        khoa = (mot,) if mot else ()
    # `any`: có MỘT khoá đọc được là đủ — nhiều khoá ở đây nghĩa là "nhiều nhóm người cùng có lý do
    # chính đáng nhìn tấm ảnh này", không phải "phải có đủ cả hai".
    if khoa and not any(authz.can(user, m, "read") for m in khoa) and not _xem_ban_to(db, doan[0], user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền xem tệp này")

    # Kiểm quyền ở TRÊN đã chạy xong: 304 chỉ nói "bản bạn đang giữ vẫn đúng", nhưng người mất
    # quyền vẫn phải nhận 403 chứ không được xác nhận gì.
    etag = _etag(key)
    headers = {
        "Cache-Control": _CACHE_VINH_VIEN,
        "ETag": etag,
        # Tệp phục vụ CÙNG origin với app: không có `nosniff` + `attachment` thì một `.html`/`.svg`
        # chèn script, mở thẳng đường dẫn là script chạy với phiên của người đang xem. `nosniff`
        # chặn trình duyệt tự đoán lại kiểu; `attachment` ép tải về mọi thứ không nằm trong danh
        # sách xem-trước.
        "X-Content-Type-Options": "nosniff",
    }
    if _khop_etag(if_none_match, etag):
        # KHÔNG mở luồng MinIO — cả mục đích của 304 là khỏi kéo byte nào.
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    store = get_storage()
    if settings.kho_tep_qua_nginx and isinstance(store, MinioStorage):
        # Quyền đã kiểm xong ⇒ giao nginx kéo byte thẳng từ MinIO. Python bơm từng khúc qua threadpool
        # thì 200 người mở màn có ảnh là nghẽn cả app (đo 29/09/2026: p50 54s, 3,5 lõi cho 3,4 MB/s).
        # Kiểu tệp lấy theo ĐUÔI (không hỏi MinIO — thêm một lượt mạng) và ký vào đường dẫn, nên
        # content-type người gửi khai lúc tải lên không bao giờ tới được trình duyệt. Header trả về
        # (ETag, Cache-Control, nosniff) do `location /_kho_tep/` gắn — xem frontend/nginx.conf.
        media = mimetypes.guess_type(key)[0] or "application/octet-stream"
        return Response(status_code=status.HTTP_200_OK, headers={
            "X-Accel-Redirect": "/_kho_tep/",
            "X-Kho-Duong": store.duong_ky_san(key, kieu=media, trinh_bay=_content_disposition(key, media)),
            "X-Tep-Etag": etag,
        })

    try:
        stream, size, content_type = store.open_stream(key)
    except StorageFileNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tệp") from None

    if size is not None:
        headers["Content-Length"] = str(size)
    # LocalStorage không giữ content-type → đoán theo đuôi file.
    media = content_type or mimetypes.guess_type(key)[0] or "application/octet-stream"
    headers["Content-Disposition"] = _content_disposition(key, media)
    return StreamingResponse(
        _phat(stream), media_type=media, headers=headers, background=BackgroundTask(stream.close),
    )


# Kiểu được MỞ NGAY trong trình duyệt — đúng những gì các màn xem trước (ảnh thu nhỏ, PDF trong
# khung). SVG cố ý KHÔNG có: nó là tài liệu chạy được script. `<img src>` vẫn vẽ được SVG vì thẻ ảnh
# bỏ qua `Content-Disposition` và không chạy script bên trong.
_XEM_TRONG_TRINH_DUYET = frozenset({
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "application/pdf",
})
# `storage.make_key` đặt 8 ký tự hex + "_" trước tên để hai tệp trùng tên không đè nhau.
_MA_NGAU_NHIEN = re.compile(r"^[0-9a-f]{8}_")


def _content_disposition(key: str, media: str) -> str:
    ten = _MA_NGAU_NHIEN.sub("", key.rsplit("/", 1)[-1], count=1) or "tep"
    kieu = "inline" if media.split(";", 1)[0].strip().lower() in _XEM_TRONG_TRINH_DUYET else "attachment"
    # Header HTTP chỉ nhận latin-1 ⇒ `filename` là bản ASCII dự phòng, tên có dấu đi qua
    # `filename*` (RFC 5987/6266) — trình duyệt hiện đại ưu tiên cái sau.
    ascii_ten = re.sub(r'[^\x20-\x7e]|["\\]', "_", ten)
    return f"{kieu}; filename=\"{ascii_ten}\"; filename*=UTF-8''{quote(ten, safe='')}"
