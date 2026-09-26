"""Lọc "Gia công ngoài" ở danh sách Kế hoạch SX — lọc + đếm ở máy chủ (spec §7)."""
from __future__ import annotations

from app.models.gia_cong_ngoai import GiaCongNgoai
from app.services.gia_cong_ngoai.mot_phan import mang_di
from app.services.gia_cong_ngoai.tron_goi import dat_tron_goi
from tests.gia_cong_fixtures import (
    cv_ten, dung_lenh_gia_cong, giao_sang, lenh_chua_phat, ncc,
)
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


def _ids(client, h, loai):
    r = client.get(f"/api/lsx?gia_cong={loai}", headers=h)
    assert r.status_code == 200, r.text
    return {x["id"] for x in r.json()["items"]}


def test_loc_gia_cong(client, sess, orders, lsx_svc, admin, customer):
    cho = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"), ("Cán màng", "thue_ngoai", ncc(sess), 1660, "to"),
        ("Bế", "to", None, 1650, "to"),
    ])
    ngoai = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"), ("Cán màng", "thue_ngoai", ncc(sess, "GC B"), 1660, "to"),
        ("Bế", "to", None, 1650, "to"),
    ])
    giao_sang(sess, admin, cv_ten(sess, ngoai, "In"), cv_ten(sess, ngoai, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=ngoai).one()
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    tron = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    dat_tron_goi(sess, user=admin, lsx_id=tron.id, nha_cung_cap_id=ncc(sess, "GC C").id,
                 sl_dat=1000, don_gia=None, xuong_cap_giay=False)
    thuong = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)

    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    assert _ids(client, h, "cho_mang_di") == {cho}
    assert _ids(client, h, "dang_o_ngoai") == {ngoai}
    assert _ids(client, h, "tron_goi") == {tron.id}
    assert thuong.id not in _ids(client, h, "cho_mang_di") | _ids(client, h, "tron_goi")
    assert client.get("/api/lsx?gia_cong=bay", headers=h).status_code == 422
