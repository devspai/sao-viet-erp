"""Lệnh `da_dong`: vẫn thấy ở màn tra cứu/tiến độ; không phát hành lại, không thu hồi, không đổi tay, không xoá."""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.lsx import TT_DA_DONG, Lsx
from app.services.lenh_sx.pham_vi import chan_ngoai_pham_vi, loc_lsx_da_phat_hanh
from app.services.san_xuat import dong_lenh

from tests.test_san_xuat_kcs import (  # noqa: F401
    _batch, admin, customer, db, lsx_svc, orders,
)
from tests.test_xep_lich_lenh_service import lenh, svc3  # noqa: F401
from app.services.xep_lich import XepLichLenhConflict


def _lenh_da_dong(db, orders, lsx_svc, admin, customer) -> Lsx:
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    db.get(Lsx, cv.lsx_id).trang_thai = "da_phat_hanh"
    db.commit()
    dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=None)
    l = db.get(Lsx, cv.lsx_id)
    assert l.trang_thai == TT_DA_DONG
    return l


def test_man_tra_cuu_van_thay(db, orders, lsx_svc, admin, customer):
    l = _lenh_da_dong(db, orders, lsx_svc, admin, customer)
    ids = db.execute(loc_lsx_da_phat_hanh(select(Lsx.id), None)).scalars().all()
    assert l.id in ids
    chan_ngoai_pham_vi(db, l, None)          # không ném 404


def test_doi_tay_va_xoa_bi_chan(db, orders, lsx_svc, admin, customer):
    l = _lenh_da_dong(db, orders, lsx_svc, admin, customer)
    with pytest.raises(Exception, match="đóng"):
        lsx_svc.set_trang_thai(lsx_id=l.id, trang_thai="nhap", actor=admin)
    with pytest.raises(Exception, match="đóng"):
        lsx_svc.set_trang_thai(lsx_id=l.id, trang_thai=TT_DA_DONG, actor=admin)
    with pytest.raises(Exception, match="đóng"):
        lsx_svc.xoa(lsx_id=l.id, actor=admin)


def test_phat_hanh_lai_bi_chan(db, svc3, lenh, admin):
    lenh.trang_thai = TT_DA_DONG
    db.commit()
    with pytest.raises(XepLichLenhConflict, match="đã đóng"):
        svc3.phat_hanh(lenh.id, actor=admin)


def test_thu_hoi_bi_chan(db, svc3, lenh, admin):
    lenh.trang_thai = TT_DA_DONG
    db.commit()
    with pytest.raises(Exception, match="đã đóng"):
        svc3.thu_hoi(lenh.id, actor=admin, ly_do="thử lại")
