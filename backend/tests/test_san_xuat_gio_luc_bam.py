"""Ghi sản lượng không gõ giờ (10/10/2026, chủ xưởng: *"thời gian sẽ theo cái nút ghi sản lượng"*).

Hộp Ghi sản lượng không còn ô Bắt đầu / Kết thúc: máy chủ lấy lúc bấm làm kết thúc, bắt đầu nối
lần ghi trước. Chống ghi trùng khi đó so số + người + việc, không so giờ.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.san_xuat_san_luong import SanXuatBatch
from tests.san_xuat_me_fixtures import T0, canh_me, tao_me, utc

# Fixtures + helper luồng thật.
from tests.test_san_xuat_thuc_thi import (  # noqa: F401
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)


def test_khong_go_gio_thi_lay_luc_bam_va_noi_lan_truoc(db, orders, lsx_svc, admin, customer):
    _to, cv, _batch = canh_me(db, orders, lsx_svc, admin, customer, tot=50, ma="TO-GIO-1")
    truoc = datetime.now(timezone.utc)
    moi = tao_me(db, user=admin, cong_viec_id=cv.id, tong=10, tot=10)["batch_id"]
    sau = datetime.now(timezone.utc)

    b = db.get(SanXuatBatch, moi)
    assert utc(b.bat_dau) == T0 + timedelta(hours=1)     # nối kết thúc lần ghi trước
    assert truoc <= utc(b.ket_thuc) <= sau                # lúc bấm


def test_bam_lai_ngay_thi_khong_ra_lan_thu_hai(db, orders, lsx_svc, admin, customer):
    _to, cv, _batch = canh_me(db, orders, lsx_svc, admin, customer, tot=50, ma="TO-GIO-2")
    a = tao_me(db, user=admin, cong_viec_id=cv.id, tong=10, tot=10)["batch_id"]
    b = tao_me(db, user=admin, cong_viec_id=cv.id, tong=10, tot=10)["batch_id"]
    assert a == b
    c = tao_me(db, user=admin, cong_viec_id=cv.id, tong=5, tot=5)["batch_id"]
    assert c != a
    assert utc(db.get(SanXuatBatch, c).bat_dau) == utc(db.get(SanXuatBatch, a).ket_thuc)


def test_chi_gui_mot_dau_gio_thi_bao_loi(db, orders, lsx_svc, admin, customer):
    import pytest

    _to, cv, _batch = canh_me(db, orders, lsx_svc, admin, customer, tot=50, ma="TO-GIO-3")
    with pytest.raises(ValueError, match="bắt đầu và kết thúc"):
        tao_me(db, user=admin, cong_viec_id=cv.id, bat_dau=T0 + timedelta(hours=2), tong=5, tot=5)
