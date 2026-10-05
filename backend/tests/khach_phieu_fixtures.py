"""Khách hàng chọn Ở PHIẾU TÍNH GIÁ từ 04/10/2026 — phiếu chưa có khách thì không lập được báo giá.

Helper cho các bộ test báo giá cũ: gắn khách vào phiếu trước khi tạo báo giá (thay cho việc gửi
`customer_id` trong payload tạo báo giá như trước).
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.customer import Customer
from app.models.phieu_tinh_gia import PhieuTinhGia
from app.models.role import SCOPE_ALL
from app.services import ptg_khach_hang_service


def khach_mac_dinh(db) -> int:
    """Một khách dùng chung cho phiếu test không quan tâm khách là ai."""
    c = db.query(Customer).filter(Customer.code == "KH-PTG-MD").one_or_none()
    if c is None:
        c = Customer(code="KH-PTG-MD", name="Khách test phiếu")
        db.add(c)
        db.flush()
    return c.id


def gan_khach_phieu(pid: int, cid: int | None = None) -> int:
    """Gắn khách `cid` (None = khách mặc định) vào phiếu `pid`, tự điền điểm giao + người nhận
    như khi chọn ở màn phiếu. Trả customer_id đã gắn."""
    db = SessionLocal()
    try:
        p = db.get(PhieuTinhGia, pid)
        cid = cid if cid is not None else khach_mac_dinh(db)
        ptg_khach_hang_service.ap_khach(db, p, {"customer_id": cid}, actor=None, scope_khach=SCOPE_ALL)
        db.commit()
        return cid
    finally:
        db.close()
