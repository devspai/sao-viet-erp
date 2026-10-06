"""Gia công ngoài nhìn từ người kế hoạch: dòng danh sách lệnh nói lệnh đang ở nhà gia công nào,
khối trên lệnh có số điện thoại + mốc giao việc, đơn giá khai được sau khi giao, nhật ký in số
kiểu Việt."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import NOI_VE_KHO, GiaCongNgoai
from app.services.gia_cong_ngoai import so_vi
from app.services.gia_cong_ngoai.chot import chot
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.gia_cong_ngoai.mot_phan import mang_di
from app.services.gia_cong_ngoai.tron_goi import dat_tron_goi
from tests.gia_cong_fixtures import (
    cv_ten, dung_lenh_gia_cong, giao_sang, lenh_chua_phat, ncc,
)
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


def _h(client):
    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {tok.json()['access_token']}"}


def test_so_vi():
    assert so_vi(5000) == "5.000"
    assert so_vi(1_000_000) == "1.000.000"
    assert so_vi(1250.5) == "1.250,5"
    assert so_vi(0) == "0"


def test_danh_sach_lenh_kem_tom_tat_gia_cong(client, sess, orders, lsx_svc, admin, customer):
    ngoai = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"), ("Cán màng", "thue_ngoai", ncc(sess, "GC B"), 1660, "to"),
        ("Bế", "to", None, 1650, "to"),
    ])
    giao_sang(sess, admin, cv_ten(sess, ngoai, "In"), cv_ten(sess, ngoai, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=ngoai).one()
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    tron = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    dat_tron_goi(sess, user=admin, lsx_id=tron.id, nha_cung_cap_id=ncc(sess, "GC C").id,
                 sl_dat=1000, xuong_cap_giay=False)
    thuong = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)

    r = client.get("/api/lsx", headers=_h(client))
    assert r.status_code == 200, r.text
    theo_id = {x["id"]: x for x in r.json()["items"]}
    assert theo_id[thuong.id]["gia_cong"] is None
    g = theo_id[tron.id]["gia_cong"]
    assert g["kieu"] == "tron_goi" and g["trang_thai"] == "dang_gia_cong"
    assert g["nha_cung_cap_ten"] == "GC C" and g["so_lan_mo"] == 1
    g = theo_id[ngoai]["gia_cong"]
    assert g["kieu"] == "mot_phan" and g["trang_thai"] == "dang_o_ngoai"
    assert g["ten_viec"] == "Cán màng"


def test_tron_goi_da_xong_van_hien_tren_dong(client, sess, orders, lsx_svc, admin, customer):
    tron = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    kq = dat_tron_goi(sess, user=admin, lsx_id=tron.id, nha_cung_cap_id=ncc(sess, "GC D").id,
                      sl_dat=1000, xuong_cap_giay=False)
    lan = sess.get(GiaCongNgoai, kq["gia_cong_ngoai_id"])
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version, sl_cuoi=990,
         noi_ve=NOI_VE_KHO)
    r = client.get("/api/lsx", headers=_h(client))
    g = {x["id"]: x for x in r.json()["items"]}[tron.id]["gia_cong"]
    assert g["trang_thai"] == "da_xong" and g["so_lan_mo"] == 0


def test_khoi_lan_co_sdt_va_moc_giao_viec(sess, orders, lsx_svc, admin, customer):
    tron = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    a = ncc(sess, "GC E")
    a.phone = "0912345678"
    sess.commit()
    dat_tron_goi(sess, user=admin, lsx_id=tron.id, nha_cung_cap_id=a.id, sl_dat=5000,
                 xuong_cap_giay=False)
    (d,) = lan_cua_lenh(sess, tron.id)
    assert d["nha_cung_cap_sdt"] == "0912345678"
    assert d["tao_luc"] is not None and d["tao_boi_ten"]
    # Nhật ký in số kiểu Việt, không "5000".
    assert "5.000" in d["lich_su"][0]["chi_tiet"]


def test_gia_cong_khong_con_don_gia(client, sess, orders, lsx_svc, admin, customer):
    """Chủ chốt 07/10/2026: gia công ngoài KHÔNG có đơn giá — tiền trả nhà gia công kế toán gõ ở
    phiếu chi theo hoá đơn của họ. Không ô, không cửa sửa, không tiền tạm tính trên khối."""
    tron = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    kq = dat_tron_goi(sess, user=admin, lsx_id=tron.id, nha_cung_cap_id=ncc(sess, "GC F").id,
                      sl_dat=1000, xuong_cap_giay=False)
    lan = sess.get(GiaCongNgoai, kq["gia_cong_ngoai_id"])
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version, sl_cuoi=990,
         noi_ve=NOI_VE_KHO)
    (d,) = lan_cua_lenh(sess, tron.id)
    assert "don_gia" not in d and "thanh_tien" not in d
    r = client.post(f"/api/gia-cong-ngoai/{lan.id}/don-gia", headers=_h(client),
                    json={"version": lan.version, "don_gia": 750})
    assert r.status_code in (404, 405)
