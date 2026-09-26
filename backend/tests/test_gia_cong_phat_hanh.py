"""Phát hành gom dải thuê ngoài thành LẦN GIA CÔNG (spec 2026-09-26 §2, §10)."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import GiaCongNgoai, KIEU_MOT_PHAN
from app.models.san_xuat import SanXuatCongViec
from app.services.gia_cong_ngoai import TT_CHO_MANG_DI
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.san_xuat import release_update, thuc_thi
from tests.gia_cong_fixtures import dung_lenh_gia_cong, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


def _lan(sess, lsx_id):
    return sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).order_by(GiaCongNgoai.id).all()


def _cv(sess, lsx_id, ten):
    return sess.query(SanXuatCongViec).filter_by(lsx_id=lsx_id, ten_cong_doan=ten).one()


def test_hai_buoc_lien_nhau_cung_nha_gia_cong_la_mot_lan(sess, orders, lsx_svc, admin, customer):
    a = ncc(sess)
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"),
        ("Cán màng", "thue_ngoai", a, 1660, "to"),
        ("Bế", "thue_ngoai", a, 1650, "cai"),
        ("Đóng gói", "to", None, 1650, "cai"),
    ])
    (lan,) = _lan(sess, lsx_id)
    assert lan.kieu == KIEU_MOT_PHAN and lan.nha_cung_cap_id == a.id
    assert lan.ten_viec == "Cán màng + Bế" and lan.don_vi == "cai"
    assert float(lan.don_gia) == 500
    for ten in ("Cán màng", "Bế"):
        cv = _cv(sess, lsx_id, ten)
        assert cv.gia_cong_ngoai_id == lan.id and cv.department_id is None
    assert _cv(sess, lsx_id, "In").gia_cong_ngoai_id is None


def test_khac_nha_hoac_chen_buoc_noi_bo_la_hai_lan(sess, orders, lsx_svc, admin, customer):
    a, b = ncc(sess), ncc(sess, "Bế Tân Tiến")
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", a, 1000, "to"),
        ("Bế", "thue_ngoai", b, 1000, "cai"),
        ("Dán", "to", None, 1000, "cai"),
        ("Ép kim", "thue_ngoai", b, 1000, "cai"),
    ])
    assert [l.ten_viec for l in _lan(sess, lsx_id)] == ["Cán màng", "Bế", "Ép kim"]


def test_doc_khoi_lan_an_tien_khi_khong_co_quyen(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    (co,) = lan_cua_lenh(sess, lsx_id, xem_tien=True)
    (khong,) = lan_cua_lenh(sess, lsx_id, xem_tien=False)
    assert co["trang_thai"] == TT_CHO_MANG_DI and co["don_gia"] == 500
    assert khong["don_gia"] is None and khong["thanh_tien"] is None
    assert co["co_buoc_truoc"] is True and co["chang_sau"] == []


def test_xuong_khong_bat_dau_duoc_viec_gia_cong(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    cv = _cv(sess, lsx_id, "Cán màng")
    with pytest.raises(ValueError, match="Gia công ngoài"):
        thuc_thi.bat_dau(sess, user=admin, cong_viec_id=cv.id)


def test_thu_hoi_goi_huy_lan_chua_mang_di(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    release_update.thu_hoi_goi(sess, nguon="lsx", id=lsx_id, actor=admin)
    sess.commit()
    (lan,) = _lan(sess, lsx_id)
    assert lan.huy_luc is not None and lan.ly_do_huy


def test_da_mang_di_thi_coi_nhu_da_bat_dau(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    (lan,) = _lan(sess, lsx_id)
    from datetime import datetime, timezone
    lan.mang_di_luc = datetime.now(timezone.utc)
    sess.commit()
    assert release_update.co_cong_viec_da_bat_dau(sess, nguon="lsx", id=lsx_id) is True
