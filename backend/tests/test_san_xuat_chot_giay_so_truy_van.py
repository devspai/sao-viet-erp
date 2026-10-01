"""Khối "Chờ chốt giấy" của bàn tổ Cắt: số câu truy vấn KHÔNG chạy theo số lệnh.

Bàn tổ tải lại khối này mỗi lần làm mới / có SSE. Trước khi nạp lô, mỗi lệnh đội ~12 câu (bước,
phạm vi tổ Cắt từng bước, công việc, phiên, sổ sách, tồn kho...) — 200 lệnh là ~2.400 câu một lượt.
"""
from __future__ import annotations

from sqlalchemy import event

from app.services.san_xuat import chot_giay
from tests.test_san_xuat_board import (  # noqa: F401
    _phat_hanh_vao_to,
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)
from tests.test_san_xuat_chot_giay import _nen


def _dem(db, fn) -> int:
    n = [0]

    def _ghi(*_a):
        n[0] += 1

    bind = db.get_bind()
    event.listen(bind, "before_cursor_execute", _ghi)
    try:
        fn()
    finally:
        event.remove(bind, "before_cursor_execute", _ghi)
    return n[0]


def test_danh_sach_to_cat_khong_chay_theo_so_lenh(db, orders, lsx_svc, admin, customer):
    n = _nen(db, orders, lsx_svc, admin, customer)
    db.expire_all()
    it = _dem(db, lambda: chot_giay.danh_sach(db, team_id=n.to_cat.id))
    so_it = len(chot_giay.danh_sach(db, team_id=n.to_cat.id))

    _phat_hanh_vao_to(db, orders, lsx_svc, admin, customer, n.to_sx.id)
    db.expire_all()
    nhieu = _dem(db, lambda: chot_giay.danh_sach(db, team_id=n.to_cat.id))
    so_nhieu = len(chot_giay.danh_sach(db, team_id=n.to_cat.id))

    assert so_nhieu > so_it, "dữ liệu phải lớn thật"
    assert nhieu - it <= 1, f"số truy vấn nhảy theo số lệnh: {it} → {nhieu} — N+1 đã quay lại"
    # Nạp lô chỉ sống trong lượt đọc — không để lại bộ nhớ tạm trên phiên DB.
    assert chot_giay._NAP not in db.info
