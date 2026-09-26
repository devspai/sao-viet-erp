"""Nút "Đã mang đi" (spec 2026-09-26 §3 bước 4–5)."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import GiaCongNgoai
from app.models.san_xuat_san_luong import BG_XAC_NHAN, SanXuatBanGiao
from app.services.gia_cong_ngoai import TT_DANG_O_NGOAI, GiaCongXungDot
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.gia_cong_ngoai.mot_phan import mang_di
from tests.gia_cong_fixtures import cv_ten, dung_lenh_gia_cong, giao_sang, ncc, nguoi_ke_hoach
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def lenh(sess, orders, lsx_svc, admin, customer):
    return dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1660, "to"),
        ("Bế", "to", None, 1650, "to"),
    ])


def test_ban_giao_sang_buoc_gia_cong_bao_nguoi_ke_hoach(sess, admin, lenh):
    kh = nguoi_ke_hoach(sess)
    res = giao_sang(sess, admin, cv_ten(sess, lenh, "In"), cv_ten(sess, lenh, "Cán màng"), 1660)
    assert res["su_kien"] == "cho_mang_di" and res["lsx_ma"]
    assert kh.id in res["notify_user_ids"] and admin.id not in res["notify_user_ids"]
    assert res["trang_thai_ban_giao"] == "proposed"


def test_mang_di_nhan_ban_giao_va_ghi_so_gui(sess, admin, lenh):
    giao_sang(sess, admin, cv_ten(sess, lenh, "In"), cv_ten(sess, lenh, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lenh).one()
    kq = mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    assert float(lan.sl_gui) == 1660 and lan.mang_di_boi_id == admin.id
    bg = sess.query(SanXuatBanGiao).one()
    assert bg.trang_thai == BG_XAC_NHAN and bg.xac_nhan_by_id == admin.id
    assert kq["ban_giao"][0]["su_kien"] == "xac_nhan"
    (d,) = lan_cua_lenh(sess, lenh)
    assert d["trang_thai"] == TT_DANG_O_NGOAI and d["sl_cho_mang_di"] == 0
    assert [x["viec"] for x in d["lich_su"]][0] == "Mang hàng đi gia công ngoài"


def test_chua_co_ban_giao_thi_chua_mang_di_duoc(sess, admin, lenh):
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lenh).one()
    with pytest.raises(ValueError, match="chưa bàn giao"):
        mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_lech_version_la_xung_dot(sess, admin, lenh):
    giao_sang(sess, admin, cv_ten(sess, lenh, "In"), cv_ten(sess, lenh, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lenh).one()
    with pytest.raises(GiaCongXungDot):
        mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version + 1)


def test_co_ban_giao_cho_ma_goi_sl_gui_la_loi(sess, admin, lenh):
    giao_sang(sess, admin, cv_ten(sess, lenh, "In"), cv_ten(sess, lenh, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lenh).one()
    with pytest.raises(ValueError, match="không gõ tay"):
        mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version, sl_gui=1660)


def test_buoc_dau_lenh_la_thue_ngoai_thi_go_so_gui(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
        ("Bế", "to", None, 1000, "to"),
    ])
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    with pytest.raises(ValueError, match="số lượng mang đi"):
        mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version, sl_gui=1000)
    sess.refresh(lan)
    assert float(lan.sl_gui) == 1000


def test_api_mang_di_can_quyen_sua_lenh(client, sess, admin, lenh):
    giao_sang(sess, admin, cv_ten(sess, lenh, "In"), cv_ten(sess, lenh, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lenh).one()
    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    r = client.post(f"/api/gia-cong-ngoai/{lan.id}/mang-di", headers=h,
                    json={"version": lan.version})
    assert r.status_code == 200, r.text
    assert r.json()["trang_thai"] == "dang_o_ngoai"
