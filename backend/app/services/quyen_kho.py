"""Quyền THEO KHO — ai xem tồn / khai ngưỡng được ở kho nào (05/10/2026).

Chủ chốt: *"làm kho giống tổ đi, mỗi kho một dòng"*. Trước đó MỘT khoá `ton_kho` mở cùng lúc mọi
mục kho trên thanh bên (Kho giấy, Kho thành phẩm…) — không cấp riêng từng kho được, và ma trận có
dòng "Tồn kho" mà thanh bên không có mục nào tên vậy.

MỘT DÒNG QUYỀN CHO MỖI KHO đã khai báo, khoá `ton_kho_<id kho>`, nhãn = tên kho. Dòng tự sinh /
đổi tên / gỡ theo Khai báo kho (`dong_bo_dong_quyen_kho`) — cùng khuôn dòng quyền theo tổ
(`services/quyen_to.py`), nhưng đơn giản hơn: kho không có cây, không có phạm vi theo người (máy
chủ ép `all`). Mỗi dòng có Xem (`can_read`: mục kho đó hiện trên thanh bên + số tồn, lô của kho) và
Thao tác `can_set_threshold` (khai ngưỡng tồn của kho đó) và ô chi tiết `can_view_cost` (xem giá
của kho đó).

XEM GIÁ THEO TỪNG MÀN (05/10/2026, chủ chốt: *"kho giấy tôi bật giá thành thì xem được giá thành
trong kho giấy, mấy kho kia không bật thì không; yêu cầu nhập xuất không bật là không xem được"*):
mỗi module kho có ô "Xem giá thành" RIÊNG — `kho.can_view_cost` (Yêu cầu nhập xuất),
`ton_kho_<id>.can_view_cost` (từng kho), `bao_cao_kho.can_view_cost` (Báo cáo kho). Danh sách lô và
lịch sử mặt hàng được ba màn cùng gọi, nên người gọi nói mình đang ở màn nào (`man`) và máy chủ áp
đúng ô của màn đó (`gia_lo_theo_man`). Nói sai màn cũng không lấy thêm được gì: ô của màn nào chỉ
mở đúng những con số màn đó vốn được hiện.

Kho ngừng dùng GIỮ dòng (xoá kho chỉ là ngừng dùng — bật lại không mất quyền đã cấp); ma trận chỉ
bày dòng của kho đang dùng, đúng như thanh bên.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.user import User
from ..repositories.quyen_kho_repo import KHOA_TIEN_TO_KHO, QuyenKhoRepository


def khoa_kho(kho_id: int) -> str:
    return f"{KHOA_TIEN_TO_KHO}{kho_id}"


def kho_cua_khoa(key: str) -> int | None:
    if not key.startswith(KHOA_TIEN_TO_KHO):
        return None
    duoi = key[len(KHOA_TIEN_TO_KHO):]
    return int(duoi) if duoi.isdigit() else None


def la_khoa_kho(key: str) -> bool:
    return kho_cua_khoa(key) is not None


def dong_bo_dong_quyen_kho(db: Session) -> None:
    """Dòng quyền theo kho khớp đúng bảng kho: kho mới → thêm dòng, đổi tên → đổi nhãn, kho không
    còn trong bảng → gỡ dòng cùng các ô đã cấp. Idempotent."""
    repo = QuyenKhoRepository(db)
    muon = {khoa_kho(kid): ten for kid, _ma, ten, _dung in repo.danh_sach_kho()}
    dang_co = repo.module_kho()
    doi = False
    for key, ten in muon.items():
        if key not in dang_co:
            repo.tao_module(key, ten)
            doi = True
        elif dang_co[key] != ten:
            repo.doi_nhan_module(key, ten)
            doi = True
    for key in dang_co.keys() - muon.keys():
        repo.xoa_module(key)
        doi = True
    if doi:
        db.commit()


def kho_duoc(authz, user: User, viec: str = "read") -> set[int]:
    """Id các kho mà vai của `user` bật `viec` ("read" | "set_threshold" | "view_cost") trên dòng của
    kho đó."""
    ket: set[int] = set()
    for c in authz.capabilities(user):
        kid = kho_cua_khoa(c["module_key"])
        if kid is not None and authz.can(user, c["module_key"], viec):
            ket.add(kid)
    return ket


def xem_ton_kho(db: Session, authz, user: User, kho_id: int | None) -> bool:
    """Được đọc số tồn / lô của kho `kho_id` theo DÒNG CỦA KHO ĐÓ. `kho_id` rỗng (gộp mọi kho) thì
    phải xem được MỌI kho đang có dòng — gộp số của kho mình không được xem là lộ số đó."""
    if kho_id is not None:
        return authz.can(user, khoa_kho(kho_id), "read")
    repo = QuyenKhoRepository(db)
    tat_ca = {kid for kid, _ma, _ten, dung in repo.danh_sach_kho() if dung}
    return bool(tat_ca) and tat_ca <= kho_duoc(authz, user)


#: Màn gọi danh sách lô / lịch sử mặt hàng → khoá có ô "Xem giá thành" của màn đó. Màn tồn của
#: từng kho ("ton") không nằm ở đây: nó hỏi dòng của CHÍNH kho có lô (`ton_kho_<kho_id của lô>`).
MAN_GIA: dict[str, str] = {"yeu_cau": "kho", "bao_cao": "bao_cao_kho"}


def gia_lo_theo_man(authz, user: User, man: str):
    """Hàm `kho_id -> bool`: lô ở kho đó có được hiện tiền không, theo ô "Xem giá thành" của màn
    `man` ("ton" | "yeu_cau" | "bao_cao")."""
    if man in MAN_GIA:
        co = authz.can(user, MAN_GIA[man], "view_cost")
        return lambda _kho_id: co
    duoc = kho_duoc(authz, user, "view_cost")
    return lambda kho_id: kho_id in duoc


def xem_kho_nao(authz, user: User) -> bool:
    """Có Xem ở ÍT NHẤT một dòng kho — cổng thô của các endpoint đọc tồn; đúng kho nào do người
    gọi hỏi tiếp bằng `xem_ton_kho`."""
    return any(
        la_khoa_kho(c["module_key"]) and c["can_read"] for c in authz.capabilities(user)
    )
