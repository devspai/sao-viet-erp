"""Gia công TRỌN GÓI (spec 2026-09-26 §4): cả lệnh ra ngoài, không xuống xưởng."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import KIEU_TRON_GOI, NOI_VE_KHO, GiaCongNgoai
from app.models.lsx import TT_DA_PHAT_HANH, TT_NHAP, Lsx
from app.models.san_xuat import (
    BUOC_THUE_NGOAI, GOI_DA_THU_HOI, SanXuatCongViec, SanXuatGoiPhatHanh,
)
from app.models.stock_request import REQ_NHAP, REQ_XUAT, StockRequest
from app.models.xep_lich_lenh import XepLichLenh
from app.services.gia_cong_ngoai import TT_DA_HUY, TT_DANG_GIA_CONG
from app.services.gia_cong_ngoai.chot import chot
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.gia_cong_ngoai.tron_goi import dat_tron_goi, de_nghi_xuat_giay, huy_tron_goi
from tests.gia_cong_fixtures import hang_can_cua, lenh_chua_phat, ncc, them_giay
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def lenh(sess, orders, lsx_svc, admin, customer) -> Lsx:
    return lenh_chua_phat(sess, orders, lsx_svc, admin, customer)


def _dat(sess, admin, lenh, *, xuong_cap_giay=False):
    a = ncc(sess, "In hộp Phú Thịnh")
    kq = dat_tron_goi(sess, user=admin, lsx_id=lenh.id, nha_cung_cap_id=a.id, sl_dat=20_000,
                      don_gia=900, xuong_cap_giay=xuong_cap_giay)
    return sess.get(GiaCongNgoai, kq["gia_cong_ngoai_id"])


def test_dat_tron_goi_phat_hanh_mot_cong_viec_khong_to(sess, admin, lenh):
    lan = _dat(sess, admin, lenh)
    sess.refresh(lenh)
    assert lenh.trang_thai == TT_DA_PHAT_HANH and lan.kieu == KIEU_TRON_GOI
    (cv,) = sess.query(SanXuatCongViec).filter_by(lsx_id=lenh.id).all()
    assert cv.gia_cong_ngoai_id == lan.id and cv.department_id is None
    assert cv.la_kcs_cuoi and cv.loai_buoc == BUOC_THUE_NGOAI
    assert float(cv.so_luong_ra) == 20_000 and cv.don_vi_ra == lan.don_vi
    assert sess.query(XepLichLenh).filter_by(lsx_id=lenh.id).count() == 0
    (d,) = lan_cua_lenh(sess, lenh.id, xem_tien=True)
    assert d["trang_thai"] == TT_DANG_GIA_CONG and d["xuat_giay"] is None


def test_lenh_da_phat_hanh_thi_khong_dat_duoc(sess, admin, lenh):
    lenh.trang_thai = TT_DA_PHAT_HANH
    sess.commit()
    with pytest.raises(ValueError, match="đã phát hành"):
        _dat(sess, admin, lenh)


def test_chot_tron_goi_ve_kho(sess, admin, lenh):
    lan = _dat(sess, admin, lenh)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=19_800, noi_ve=NOI_VE_KHO)
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id, loai=REQ_NHAP).one()
    assert float(req.lines[0].sl_de_nghi) == 19_800


def test_huy_tron_goi_ve_nhap_thu_hoi_goi(sess, admin, lenh):
    lan = _dat(sess, admin, lenh)
    huy_tron_goi(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
                 ly_do="Khách đổi mẫu")
    sess.refresh(lenh)
    sess.refresh(lan)
    assert lenh.trang_thai == TT_NHAP and lan.ly_do_huy == "Khách đổi mẫu"
    goi_id = sess.query(SanXuatCongViec).filter_by(lsx_id=lenh.id).one().goi_id
    assert sess.get(SanXuatGoiPhatHanh, goi_id).trang_thai == GOI_DA_THU_HOI
    (d,) = lan_cua_lenh(sess, lenh.id, xem_tien=True)
    assert d["trang_thai"] == TT_DA_HUY


def test_xuong_cap_giay_lap_de_nghi_xuat_mot_lan(sess, admin, lenh):
    them_giay(sess, lenh)
    lan = _dat(sess, admin, lenh, xuong_cap_giay=True)
    de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id, loai=REQ_XUAT).one()
    (ln,) = req.lines
    assert ln.hang_loai == "giay" and float(ln.sl_de_nghi) > 0 and ln.lsx_id == lenh.id
    (d,) = lan_cua_lenh(sess, lenh.id, xem_tien=True)
    assert d["xuat_giay"]["ma"] == req.ma
    sess.refresh(lan)
    with pytest.raises(ValueError, match="đã có đề nghị"):
        de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_nha_gia_cong_lo_giay_thi_khong_xuat(sess, admin, lenh):
    them_giay(sess, lenh)
    lan = _dat(sess, admin, lenh, xuong_cap_giay=False)
    with pytest.raises(ValueError, match="tự lo giấy"):
        de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_can_doi_vat_tu_bo_giay_khi_nha_gia_cong_lo(sess, admin, lenh):
    giay = ("giay", them_giay(sess, lenh).vat_tu_id)
    assert giay in hang_can_cua(sess, lenh.id)
    _dat(sess, admin, lenh, xuong_cap_giay=False)
    assert giay not in hang_can_cua(sess, lenh.id)


def test_can_doi_vat_tu_giu_giay_khi_xuong_cap(sess, admin, lenh):
    giay = ("giay", them_giay(sess, lenh).vat_tu_id)
    _dat(sess, admin, lenh, xuong_cap_giay=True)
    assert giay in hang_can_cua(sess, lenh.id)


def test_api_dat_tron_goi(client, sess, admin, lenh):
    a = ncc(sess, "In hộp Phú Thịnh")
    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    r = client.post(f"/api/gia-cong-ngoai/lenh/{lenh.id}/tron-goi", headers=h, json={
        "nha_cung_cap_id": a.id, "sl_dat": 20000, "don_gia": 900, "xuong_cap_giay": False})
    assert r.status_code == 200, r.text
    assert r.json()["kieu"] == "tron_goi" and r.json()["trang_thai"] == "dang_gia_cong"
