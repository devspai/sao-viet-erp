"""Kế toán chi tiền gia công ngoài (spec 2026-09-26 §5): một lần ⇄ một phiếu chi, không 331."""
from __future__ import annotations

from datetime import date

import pytest

from app.db import SessionLocal
from app.models.gia_cong_ngoai import NOI_VE_XUONG, GiaCongNgoai
from app.models.role import SCOPE_ALL
from app.repositories.accounting_repo import AccountingRepository
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import hash_password
from app.services.gia_cong_ngoai.chot import chot, mo_lai
from app.services.gia_cong_ngoai.mot_phan import mang_di
from tests.gia_cong_fixtures import cv_ten, dung_lenh_gia_cong, giao_sang, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401

PW = "pw123456"


@pytest.fixture
def h(client):
    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {tok.json()['access_token']}"}


def _mk_ke_toan_khong_xem_gia(username: str) -> None:
    """Vai chỉ có `phieu_chi:read` — KHÔNG có dòng quyền `kho` nào ⇒ `kho:view_cost` mặc định False."""
    db = SessionLocal()
    try:
        depts, roles, users = DepartmentRepository(db), RoleRepository(db), UserRepository(db)
        dept = depts.get_by_name("Kế toán không giá") or depts.create(name="Kế toán không giá")
        role = roles.get_by_name_and_department(f"Vai {username}", dept.id) or roles.create(
            name=f"Vai {username}", department_id=dept.id
        )
        roles.set_permission(role_id=role.id, module_key="phieu_chi", can_read=True, scope=SCOPE_ALL)
        u = users.create(username=username, name=username, password_hash=hash_password(PW))
        users.set_assignment(u, department_id=dept.id, role_id=role.id, is_active=True)
        db.commit()
    finally:
        db.close()


@pytest.fixture
def h_khong_xem_gia(client):
    _mk_ke_toan_khong_xem_gia("t_ke_toan_khong_gia")
    tok = client.post("/api/auth/login", json={"username": "t_ke_toan_khong_gia", "password": PW})
    return {"Authorization": f"Bearer {tok.json()['access_token']}"}


@pytest.fixture
def lan_da_chot(sess, orders, lsx_svc, admin, customer) -> GiaCongNgoai:
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1660, "to"),
        ("Bế", "to", None, 1650, "to"),
    ])
    giao_sang(sess, admin, cv_ten(sess, lsx_id, "In"), cv_ten(sess, lsx_id, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1650, noi_ve=NOI_VE_XUONG)
    sess.refresh(lan)
    return lan


def _phieu(lan, **them):
    return {"source_type": "gia_cong_ngoai", "gia_cong_ngoai_id": lan.id, "voucher_type": "cash",
            "payment_stage": "other", "voucher_date": date.today().isoformat(),
            "amount": 825_000, "content": "Gia công cán màng", **them}


def test_hang_cho_chi_co_lan_da_chot(client, h, lan_da_chot):
    r = client.get("/api/accounting/gia-cong-cho-chi", headers=h)
    assert r.status_code == 200, r.text
    (d,) = r.json()
    assert d["gia_cong_ngoai_id"] == lan_da_chot.id and d["thanh_tien"] == 825_000
    assert d["nha_cung_cap_ten"] == "Cán màng Minh Long"
    assert client.get("/api/accounting/gia-cong-cho-chi/dem", headers=h).json() == {"so": 1}


def test_hang_cho_chi_hien_gia_du_thieu_view_cost(client, h_khong_xem_gia, lan_da_chot):
    r = client.get("/api/accounting/gia-cong-cho-chi", headers=h_khong_xem_gia)
    assert r.status_code == 200, r.text
    (d,) = r.json()
    assert d["gia_cong_ngoai_id"] == lan_da_chot.id
    # Chủ chốt 27/09/2026: tiền gia công KHÔNG gác view_cost.
    assert d["thanh_tien"] == 825_000
    assert d["sl_cuoi"] == 1650 and d["nha_cung_cap_ten"] == "Cán màng Minh Long"


def test_lap_phieu_chi_roi_het_cho_va_khong_vao_331(client, h, sess, lan_da_chot):
    r = client.post("/api/accounting/payment-vouchers", headers=h, json=_phieu(lan_da_chot))
    assert r.status_code == 201, r.text
    pc = r.json()
    assert pc["source_type"] == "gia_cong_ngoai" and pc["gia_cong_ngoai_id"] == lan_da_chot.id
    assert pc["amount"] == 825_000
    assert client.get("/api/accounting/gia-cong-cho-chi", headers=h).json() == []
    assert all(v.id != pc["id"] for v in AccountingRepository(sess).phieu_chi_cho_bao_cao())
    # Người nhận bỏ trống ⇒ tên nhà gia công
    assert pc["cash_recipient_name"] == "Cán màng Minh Long"


def test_mot_lan_chi_mot_phieu(client, h, lan_da_chot):
    assert client.post("/api/accounting/payment-vouchers", headers=h,
                       json=_phieu(lan_da_chot)).status_code == 201
    r = client.post("/api/accounting/payment-vouchers", headers=h, json=_phieu(lan_da_chot))
    assert r.status_code in (409, 422) and "đã có phiếu chi" in r.json()["detail"]


def test_lan_chua_chot_khong_lap_duoc(client, h, sess, lan_da_chot, admin):
    mo_lai(sess, user=admin, gcn_id=lan_da_chot.id, expected_version=lan_da_chot.version)
    r = client.post("/api/accounting/payment-vouchers", headers=h, json=_phieu(lan_da_chot))
    assert r.status_code == 422 and "chưa chốt" in r.json()["detail"]


def test_co_phieu_chi_thi_khong_mo_lai_huy_phieu_thi_cho_chi_lai(client, h, sess, admin,
                                                                   lan_da_chot):
    pc = client.post("/api/accounting/payment-vouchers", headers=h,
                     json=_phieu(lan_da_chot)).json()
    sess.refresh(lan_da_chot)
    with pytest.raises(ValueError, match="phiếu chi"):
        mo_lai(sess, user=admin, gcn_id=lan_da_chot.id, expected_version=lan_da_chot.version)
    r = client.post(f"/api/accounting/payment-vouchers/{pc['id']}/cancel", headers=h,
                    json={"reason": "Lập nhầm số"})
    assert r.status_code == 200, r.text
    assert len(client.get("/api/accounting/gia-cong-cho-chi", headers=h).json()) == 1
