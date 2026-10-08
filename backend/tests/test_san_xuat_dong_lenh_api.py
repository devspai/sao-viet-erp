"""Đóng lệnh THỦ CÔNG — đường dây HTTP `/api/san-xuat/kcs/nhom/{id}/dong|mo-lai` (spec 2026-09-29).

Luật đã có test service ở `test_san_xuat_dong_lenh.py`; ở đây chỉ soi router + gác quyền + ánh xạ lỗi.
"""
from __future__ import annotations

from app.models.lsx import TT_DA_PHAT_HANH, Lsx
from app.repositories.san_xuat_repo import SanXuatRepository
from app.security import create_access_token

from tests.test_san_xuat_kcs import (  # noqa: F401
    _batch, admin, customer, db, lsx_svc, orders,
)
from tests.quyen_to_fixtures import cap_dong_thieu

ADMIN = {"username": "admin", "password": "admin123"}


def _admin_h(client) -> dict[str, str]:
    tok = client.post("/api/auth/login", json=ADMIN).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def _kcs_h(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


def test_tinh_trang_can_dang_nhap(client):
    assert client.get("/api/san-xuat/kcs/nhom/1/dong").status_code == 401


def test_dong_nguoi_ngoai_kcs_403(client, db, orders, lsx_svc, admin, customer):
    _to, cv, _res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    r = client.post(f"/api/san-xuat/kcs/nhom/{cv.nhom_id}/dong", json={}, headers=_admin_h(client))
    assert r.status_code == 403


def test_kcs_dong_roi_mo_lai(client, db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    db.get(Lsx, cv.lsx_id).trang_thai = TT_DA_PHAT_HANH
    db.commit()
    h = _kcs_h(cap_dong_thieu(db, res["nguoi_kcs"]))
    v = SanXuatRepository(db).nhom(cv.nhom_id).version
    url = f"/api/san-xuat/kcs/nhom/{cv.nhom_id}"

    r = client.post(f"{url}/dong", json={"expected_version": v}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["kieu"] == "dong"
    assert client.get(f"{url}/dong", headers=h).json()["trang_thai"] == "closed"

    r = client.post(f"{url}/mo-lai", json={}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["kieu"] == "mo_lai"
    assert client.post(f"{url}/mo-lai", json={}, headers=h).status_code == 400
