"""Báo cáo kinh doanh theo khách hàng (24/09/2026) — xem trên màn + xuất Excel.

Gác bằng ô quyền RIÊNG `bao_cao_kinh_doanh` (mục menu riêng trong nhóm Kinh doanh): Xem = xem báo
cáo + xuất Excel. Phạm vi dữ liệu lấy từ CHÍNH ô này, tính như khối Kinh doanh: theo NGƯỜI PHỤ
TRÁCH KHÁCH, "own" nới ra cả nhóm dùng chung (`order_repo` — `org_scope.nhom_dung_chung_user_ids`).

Thanh lọc chung (06/10/2026): kỳ gửi `tu_ngay` / `den_ngay` / `moc` như mọi danh sách — báo cáo chỉ
có MỘT mốc là ngày chốt đơn (`chot`); bỏ trống cả hai ngày = mọi thời gian. Khách (`customer_id`)
và sale (`sale_id`) lọc ở máy chủ; `loc-khach` / `loc-sale` trả giá trị chọn được kèm số đơn.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from ..deps import (
    get_accounting_repository,
    get_authorization_service,
    get_order_repository,
    require_permission,
)
from ..models.user import User
from ..repositories.accounting_repo import AccountingRepository
from ..repositories.order_repo import OrderRepository
from ..services import bao_cao_kinh_doanh, bao_cao_kinh_doanh_excel
from ..services.rbac_service import AuthorizationService

router = APIRouter(prefix="/api/bao-cao-kinh-doanh", tags=["bao-cao-kinh-doanh"])
MODULE = "bao_cao_kinh_doanh"

Orders = Annotated[OrderRepository, Depends(get_order_repository)]
Accounting = Annotated[AccountingRepository, Depends(get_accounting_repository)]
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]
Nguoi = Annotated[User, Depends(require_permission(MODULE, "read"))]


def _lap(orders, accounting, authz, user, tu_ngay: date | None, den_ngay: date | None,
         customer_id: int | None, sale_id: int | None) -> dict:
    if tu_ngay is not None and den_ngay is not None and tu_ngay > den_ngay:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Từ ngày phải trước hoặc bằng đến ngày.")
    return bao_cao_kinh_doanh.lap_bao_cao(
        orders, accounting, tu_ngay=tu_ngay, den_ngay=den_ngay,
        scope=authz.scope_for(user, MODULE) or "own", actor=user, customer_id=customer_id,
        sale_user_id=sale_id,
    )


@router.get("")
def xem_bao_cao(
    orders: Orders, accounting: Accounting, authz: Authz, user: Nguoi,
    tu_ngay: date | None = Query(default=None),
    den_ngay: date | None = Query(default=None),
    moc: str = Query("chot", pattern="^chot$"),
    customer_id: int | None = Query(default=None),
    sale_id: int | None = Query(default=None),
) -> dict:
    return _lap(orders, accounting, authz, user, tu_ngay, den_ngay, customer_id, sale_id)


@router.get("/loc-khach")
def loc_khach(orders: Orders, authz: Authz, user: Nguoi) -> list[dict]:
    """Khách có đơn đã chốt trong tầm nhìn, kèm số đơn — giá trị của điều kiện "Khách hàng"."""
    return orders.dem_chot_theo(theo="khach", scope=authz.scope_for(user, MODULE) or "own",
                                actor=user)


@router.get("/loc-sale")
def loc_sale(orders: Orders, authz: Authz, user: Nguoi) -> list[dict]:
    """Sale có đơn đã chốt trong tầm nhìn, kèm số đơn — giá trị của điều kiện "Sale"."""
    return orders.dem_chot_theo(theo="sale", scope=authz.scope_for(user, MODULE) or "own",
                                actor=user)


@router.get("/export.xlsx")
def xuat_excel(
    orders: Orders, accounting: Accounting, authz: Authz, user: Nguoi,
    tu_ngay: date | None = Query(default=None),
    den_ngay: date | None = Query(default=None),
    moc: str = Query("chot", pattern="^chot$"),
    customer_id: int | None = Query(default=None),
    sale_id: int | None = Query(default=None),
) -> Response:
    bc = _lap(orders, accounting, authz, user, tu_ngay, den_ngay, customer_id, sale_id)
    ma = None
    if customer_id is not None and bc["khach"]:
        ma = bc["khach"][0]["ma"] or bc["khach"][0]["ten"]
    return Response(
        content=bao_cao_kinh_doanh_excel.xuat_xlsx(bc),
        media_type=bao_cao_kinh_doanh_excel.MEDIA_XLSX,
        headers={"Content-Disposition":
                 f'attachment; filename="{bao_cao_kinh_doanh_excel.ten_file(bc, ma_khach=ma)}"'},
    )
