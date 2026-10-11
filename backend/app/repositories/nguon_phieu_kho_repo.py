"""Repository — NGUỒN của phiếu kho cho Báo cáo kho (11/10/2026): lệnh, đơn, khách, nhà cung cấp,
bộ phận, người lập của một loạt phiếu. Tra GỘP theo lô (mỗi bảng một lượt) để bảng Chi tiết phiếu
không N+1. Các cột nguồn ở yêu cầu kho đều là soft ref nên mọi tra cứu đều chịu được id mồ côi."""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.customer import Customer
from ..models.delivery import DeliveryRequest, DeliveryTrip
from ..models.department import Department
from ..models.gia_cong_ngoai import GiaCongNgoai
from ..models.lsx import Lsx
from ..models.order import Order
from ..models.purchase import PurchaseDelivery, PurchaseRequest, Supplier
from ..models.stock_request import StockRequest, StockRequestLine
from ..models.user import User


@dataclass
class NguonPhieu:
    lsx_cua_dong: dict[int, int] = field(default_factory=dict)          # dòng yêu cầu → lệnh
    lsx: dict[int, tuple[str, int | None]] = field(default_factory=dict)  # lệnh → (mã, đơn)
    don: dict[int, tuple[str, int | None]] = field(default_factory=dict)  # đơn → (số đơn, khách)
    khach: dict[int, str] = field(default_factory=dict)
    chuyen_don: dict[int, tuple[int | None, int | None]] = field(default_factory=dict)  # chuyến → (đơn, khách)
    ncc_dot_mua: dict[int, str] = field(default_factory=dict)          # đợt giao mua → tên NCC
    gia_cong: dict[int, tuple[str, int | None]] = field(default_factory=dict)  # gia công → (NCC, lệnh)
    bo_phan: dict[int, str] = field(default_factory=dict)
    nguoi: dict[int, str] = field(default_factory=dict)


class NguonPhieuKhoRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def tra(self, *, reqs: list[StockRequest], dong_yc_ids: set[int], nguoi_ids: set[int]) -> NguonPhieu:
        db = self.db
        n = NguonPhieu()
        if dong_yc_ids:
            n.lsx_cua_dong = {
                i: l for i, l in db.execute(
                    select(StockRequestLine.id, StockRequestLine.lsx_id)
                    .where(StockRequestLine.id.in_(dong_yc_ids), StockRequestLine.lsx_id.is_not(None))
                ).all()
            }
        gcn_ids = {r.gia_cong_ngoai_id for r in reqs if r.gia_cong_ngoai_id}
        if gcn_ids:
            n.gia_cong = {
                i: (ten or "", lsx) for i, ten, lsx in db.execute(
                    select(GiaCongNgoai.id, GiaCongNgoai.nha_cung_cap_ten, GiaCongNgoai.lsx_id)
                    .where(GiaCongNgoai.id.in_(gcn_ids))
                ).all()
            }
        trip_ids = {r.delivery_trip_id for r in reqs if r.delivery_trip_id}
        if trip_ids:
            n.chuyen_don = {
                i: (o, c) for i, o, c in db.execute(
                    select(DeliveryTrip.id, DeliveryRequest.order_id, DeliveryRequest.customer_id)
                    .join(DeliveryRequest, DeliveryRequest.id == DeliveryTrip.request_id)
                    .where(DeliveryTrip.id.in_(trip_ids))
                ).all()
            }
        pd_ids = {r.purchase_delivery_id for r in reqs if r.purchase_delivery_id}
        if pd_ids:
            n.ncc_dot_mua = {
                i: ten for i, ten in db.execute(
                    select(PurchaseDelivery.id, Supplier.name)
                    .join(PurchaseRequest, PurchaseRequest.id == PurchaseDelivery.purchase_request_id)
                    .join(Supplier, Supplier.id == PurchaseRequest.supplier_id)
                    .where(PurchaseDelivery.id.in_(pd_ids))
                ).all()
            }
        lsx_ids = set(n.lsx_cua_dong.values()) | {l for _t, l in n.gia_cong.values() if l}
        if lsx_ids:
            n.lsx = {i: (ma, o) for i, ma, o in db.execute(
                select(Lsx.id, Lsx.ma, Lsx.order_id).where(Lsx.id.in_(lsx_ids))).all()}
        order_ids = {o for _m, o in n.lsx.values() if o} | {o for o, _c in n.chuyen_don.values() if o}
        if order_ids:
            n.don = {i: (so, c) for i, so, c in db.execute(
                select(Order.id, Order.order_no, Order.customer_id).where(Order.id.in_(order_ids))).all()}
        khach_ids = {c for _s, c in n.don.values() if c} | {c for _o, c in n.chuyen_don.values() if c}
        if khach_ids:
            n.khach = dict(db.execute(select(Customer.id, Customer.name).where(Customer.id.in_(khach_ids))).all())
        bp_ids = {r.bo_phan_id for r in reqs if r.bo_phan_id}
        if bp_ids:
            n.bo_phan = dict(db.execute(select(Department.id, Department.name).where(Department.id.in_(bp_ids))).all())
        if nguoi_ids:
            n.nguoi = dict(db.execute(select(User.id, User.name).where(User.id.in_(nguoi_ids))).all())
        return n
