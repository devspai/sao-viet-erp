"""Dựng nhanh "khách đã nhận hàng" cho các test cần ghi hóa đơn bán.

Hóa đơn bán gắn một lượt khách đã nhận và không vượt giá trị hàng của lượt (mg 0402) — test kế
toán chỉ cần đơn đã giao, không cần đi cả luồng giao hàng.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.db import SessionLocal
from app.models.delivery import (
    LG_THANH_CONG,
    DeliveryRequest,
    DeliveryRequestLine,
    DeliveryTrip,
    DeliveryTripLine,
)
from app.models.employee import Employee
from app.models.order import Order
from app.repositories.delivery_repo import DeliveryRepository


def _tai_xe(db) -> Employee:
    emp = db.query(Employee).filter(Employee.code == "NV-GH-TEST").one_or_none()
    if emp is None:
        emp = Employee(code="NV-GH-TEST", full_name="Tài xế test")
        db.add(emp)
        db.flush()
    return emp


def giao_het(order_id: int, so: dict[int, int] | None = None) -> int:
    """Một lượt `thanh_cong` giao phần còn lại của đơn (hoặc đúng `so` {order_line_id: SL}).

    Đơn đã giao hết mà gọi lại thì trả lượt cuối — test ghi nhiều hóa đơn cho cùng đơn dùng chung."""
    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        da = DeliveryRepository(db).da_giao_theo_dong(order_id)
        giao = so if so is not None else {
            ln.id: int(ln.qty or 0) - int(da.get(ln.id, 0)) for ln in order.lines
        }
        giao = {k: v for k, v in giao.items() if v > 0}
        if not giao:
            cu = DeliveryRepository(db).luot_khach_da_nhan_cua_don(order_id)
            assert cu, "đơn không có dòng nào để giao"
            return cu[-1].id
        n = db.query(DeliveryRequest).filter(DeliveryRequest.order_id == order_id).count()
        luc = datetime.now(timezone.utc)
        req = DeliveryRequest(code=f"YCGH-T{order_id}-{n + 1}", order_id=order_id,
                              customer_id=order.customer_id, ngay_can_giao=luc.date())
        db.add(req)
        db.flush()
        for lid, sl in giao.items():
            db.add(DeliveryRequestLine(request_id=req.id, order_line_id=lid, qty=sl))
        trip = DeliveryTrip(request_id=req.id, lan_thu=1, trang_thai=LG_THANH_CONG,
                            employee_id=_tai_xe(db).id, thoi_gian_ket_thuc=luc)
        db.add(trip)
        db.flush()
        for lid, sl in giao.items():
            db.add(DeliveryTripLine(trip_id=trip.id, order_line_id=lid, qty_giao=sl))
        db.commit()
        return trip.id
    finally:
        db.close()
