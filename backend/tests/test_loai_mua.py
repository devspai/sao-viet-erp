"""Loại mua của yêu cầu mua (08/10/2026): Theo yêu cầu, Cho lệnh SX, Mua tồn.

Máy chủ chốt loại: có liên kết lệnh thì là Cho lệnh SX bất kể client gửi gì; gõ tay đòi Cho lệnh
SX thì chặn (chỉ Kế hoạch vật tư sinh được liên kết lệnh). Hai loại kia đổi qua lại khi sửa.
"""
from __future__ import annotations

from tests.test_purchases_api import _department_request_payload
from tests.test_ycmh_trang_thai_api import _headers


def _body(**them) -> dict:
    b = _department_request_payload()
    b.update(them)
    return b


def test_mac_dinh_la_theo_yeu_cau(client):
    h = _headers(client)
    r = client.post("/api/department-purchase-requests", json=_body(), headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["loai_mua"] == "theo_yeu_cau"


def test_chon_mua_ton(client):
    h = _headers(client)
    r = client.post("/api/department-purchase-requests", json=_body(loai_mua="mua_ton"), headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["loai_mua"] == "mua_ton"


def test_cho_lsx_khong_co_lenh_bi_chan(client):
    h = _headers(client)
    r = client.post("/api/department-purchase-requests", json=_body(loai_mua="cho_lsx"), headers=h)
    assert r.status_code == 422, r.text
    assert "Kế hoạch vật tư" in r.json()["detail"]


def test_loai_la_bi_chan(client):
    h = _headers(client)
    r = client.post("/api/department-purchase-requests", json=_body(loai_mua="linh_tinh"), headers=h)
    assert r.status_code == 422, r.text


def test_sua_doi_qua_lai_theo_yeu_cau_va_mua_ton(client):
    h = _headers(client)
    yc = client.post("/api/department-purchase-requests", json=_body(), headers=h).json()
    r = client.put(
        f"/api/department-purchase-requests/{yc['id']}", json=_body(loai_mua="mua_ton"), headers=h
    )
    assert r.status_code == 200, r.text
    assert r.json()["loai_mua"] == "mua_ton"
    # Không gửi loại ⇒ giữ loại cũ.
    r = client.put(f"/api/department-purchase-requests/{yc['id']}", json=_body(), headers=h)
    assert r.json()["loai_mua"] == "mua_ton"
    r = client.put(
        f"/api/department-purchase-requests/{yc['id']}", json=_body(loai_mua="cho_lsx"), headers=h
    )
    assert r.status_code == 422, r.text
