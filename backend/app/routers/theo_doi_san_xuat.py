"""Router màn "Theo dõi sản xuất" — Theo đơn (12/10/2026, màn đang dùng); Theo máy, Theo lệnh
(làm gọn 05/10/2026) còn giữ đường API nhưng màn không gọi nữa.

Prefix `/api/theo-doi-san-xuat`. RBAC MODULE = `theo_doi_san_xuat`. `sale_ids` LUÔN sinh từ
`pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)` — phạm vi lấy từ token, không từ URL.

Mỗi góc nhìn trả luôn số của dải bất thường (`bat_thuong`), nên mỗi lượt tải chỉ MỘT yêu cầu.
`/meta`, `/kanban`, `/theo-ca`, `/gantt` đã xoá cùng ba tab cũ.

Router chỉ điều phối; nghiệp vụ ở `services/lenh_sx/theo_doi.py` và `bang_theo_doi.py`.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_authorization_service, require_permission
from ..models.user import User
from ..schemas.loc_danh_sach import LuaChonLoc
from ..schemas.theo_doi_san_xuat import BoLocOut, DonChiTietOut, TheoDonOut, TheoLenhOut, TheoMayOut
from ..services.lenh_sx import bang_theo_doi, pham_vi, theo_doi, theo_doi_don, trang_thai
from ..services.rbac_service import AuthorizationService

router = APIRouter(prefix="/api/theo-doi-san-xuat", tags=["theo-doi-san-xuat"])
MODULE = "theo_doi_san_xuat"
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]

# Một trong sáu mục của dải bất thường; giá trị lạ (kể cả `thieu_vat_tu`) ăn 422 ở cửa thay vì
# lặng lẽ trả tập rỗng.
BatThuong = Literal[theo_doi.BAT_THUONG]
TimKiem = Annotated[str | None, Query(max_length=120)]
# Khâu của lệnh (cột "Đang ở") — điều kiện "Trạng thái" của góc Theo lệnh.
Khau = Literal[trang_thai.KHAU]


@router.get("/bo-loc", response_model=BoLocOut)
def bo_loc(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
):
    """Nguồn ô Máy và ô Khách — gác đúng ô quyền của màn này."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return bang_theo_doi.bo_loc(db, sale_ids=sale_ids)


@router.get("/theo-may", response_model=TheoMayOut)
def theo_may(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    q: TimKiem = None,
    khach_hang_id: int | None = None,
    bat_thuong: BatThuong | None = None,
):
    """Góc Theo máy: mỗi máy một dòng chia nhóm + số của dải bất thường."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi.theo_may(
        db, sale_ids=sale_ids, q=q, khach_hang_id=khach_hang_id, bat_thuong=bat_thuong,
    )


@router.get("/theo-lenh", response_model=TheoLenhOut)
def theo_lenh(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    q: TimKiem = None,
    khach_hang_id: int | None = None,
    may_id: int | None = None,
    bat_thuong: BatThuong | None = None,
    khau: Khau | None = None,
):
    """Góc Theo lệnh: mỗi lệnh còn sống một dòng + số của dải bất thường."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi.theo_lenh(
        db, sale_ids=sale_ids, q=q, khach_hang_id=khach_hang_id, may_id=may_id,
        bat_thuong=bat_thuong, khau=khau,
    )


# --- Theo đơn (12/10/2026) ------------------------------------------------------------------------
Chip = Literal[theo_doi_don.CHIP]


@router.get("/theo-don", response_model=TheoDonOut)
def theo_don(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    q: TimKiem = None,
    khach_hang_id: int | None = None,
    phu_trach_id: int | None = None,
    chip: Chip | None = None,
    tu_ngay: date | None = None,
    den_ngay: date | None = None,
    moc: Annotated[str, Query(pattern="^(chot|han_giao)$")] = "chot",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=theo_doi_don.PAGE_SIZE_TOI_DA)] = theo_doi_don.PAGE_SIZE_MAC_DINH,
):
    """Mỗi đơn đã giao xưởng một dòng — lọc, đếm chip, cắt trang ở máy chủ. Phạm vi = luật Đơn hàng bán."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi_don.theo_don(
        db, sale_ids=sale_ids, q=q, khach_hang_id=khach_hang_id, phu_trach_id=phu_trach_id,
        chip=chip, tu_ngay=tu_ngay, den_ngay=den_ngay, moc=moc, page=page, page_size=page_size,
    )


@router.get("/khach-loc", response_model=list[LuaChonLoc])
def khach_loc(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
):
    """Ô "Khách hàng" của thanh lọc — khách của các đơn trong phạm vi, kèm số đơn."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi_don.khach_loc(db, sale_ids=sale_ids)


@router.get("/phu-trach-loc", response_model=list[LuaChonLoc])
def phu_trach_loc(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
):
    """Ô "Phụ trách" của thanh lọc — chủ các đơn trong phạm vi, kèm số đơn."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi_don.phu_trach_loc(db, sale_ids=sale_ids)


@router.get("/theo-don/{order_id}", response_model=DonChiTietOut)
def chi_tiet_don(
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
    order_id: int,
):
    """Ngăn MỘT đơn: tóm tắt + bảng mặt hàng kèm routing từng lệnh. 404 / 403 như Hồ sơ lệnh."""
    sale_ids = pham_vi.sale_ids_theo_pham_vi(db, user, authz, MODULE)
    return theo_doi_don.chi_tiet_don(db, order_id, sale_ids=sale_ids)
