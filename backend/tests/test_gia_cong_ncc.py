"""Nhà gia công lấy từ danh mục Nhà cung cấp có tích "Nhận gia công" (spec §7)."""
from __future__ import annotations

from itertools import count

ADMIN = {"username": "admin", "password": "admin123"}
_dem = count(1)


def _h(client) -> dict[str, str]:
    r = client.post("/api/auth/login", json=ADMIN)
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _ncc(client, h, ten: str, **them) -> dict:
    i = next(_dem)
    r = client.post("/api/suppliers", headers=h, json={
        "name": ten, "tax_code": f"08{i:08d}", "phone": "0900000000", "email": f"gc{i}@x.vn",
        "address": "HN", "contact_name": "A", "supplier_group": "gia cong", **them,
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_luu_va_doc_lai_co_nhan_gia_cong(client):
    h = _h(client)
    row = _ncc(client, h, "Cán màng Minh Long", nhan_gia_cong=True)
    assert row["nhan_gia_cong"] is True
    body = {k: row[k] for k in ("name", "tax_code", "phone", "email", "address",
                                "contact_name", "supplier_group")}
    r = client.put(f"/api/suppliers/{row['id']}", headers=h, json={**body, "nhan_gia_cong": False})
    assert r.status_code == 200, r.text
    assert r.json()["nhan_gia_cong"] is False


def test_o_chon_chi_moi_ncc_dang_hoat_dong_co_tich(client):
    h = _h(client)
    co = _ncc(client, h, "In hộp Phú Thịnh", nhan_gia_cong=True)
    _ncc(client, h, "Giấy Hoàng Hà")                                  # không tích
    ngung = _ncc(client, h, "Bế Tân Tiến", nhan_gia_cong=True)
    assert client.patch(f"/api/suppliers/{ngung['id']}/toggle-active", headers=h).status_code == 200

    r = client.get("/api/gia-cong-ngoai/nha-gia-cong", headers=h)
    assert r.status_code == 200, r.text
    assert r.json() == [{"id": co["id"], "ten": "In hộp Phú Thịnh"}]
