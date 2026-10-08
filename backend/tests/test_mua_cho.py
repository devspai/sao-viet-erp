"""Cột "Mua cho" (08/10/2026): món, yêu cầu, dòng đơn, đơn mua nói đúng lệnh nào hay tồn kho.

Nguồn duy nhất là liên kết lệnh của yêu cầu (`yeu_cau_mua_nguon_lenh`) khớp dòng theo mặt hàng +
khổ. Tìm theo mã lệnh phải ra món; lọc theo loại mua lọc ở máy chủ.
"""
from __future__ import annotations

from app.models.purchase import Supplier, SupplierItem
from tests.test_ke_hoach_vat_tu import (  # noqa: F401 — fixture dùng lại
    KHO,
    MAI,
    _admin_token,
    _dv_dong,
    _giay,
    _lenh,
    customer,
    db,
)


def _hang(g):
    return ("giay", g.id)


def _ncc_ban(db, g) -> Supplier:
    s = Supplier(name=f"NCC giấy {g.id}", status="active")
    db.add(s)
    db.flush()
    db.add(SupplierItem(supplier_id=s.id, hang_loai="giay", hang_id=g.id, item_name=g.ten,
                        unit=_dv_dong(_hang(g), None), unit_price=1))
    db.commit()
    return s


def _dong(g, so):
    return {"item_name": g.ten, "unit": _dv_dong(_hang(g), None), "quantity": so,
            "hang_loai": "giay", "hang_id": g.id, "kho_rong": KHO[0], "kho_dai": KHO[1]}


def _nguon(g, lenh, so):
    return {"hang_loai": "giay", "hang_id": g.id, "kho_rong": KHO[0], "kho_dai": KHO[1],
            "lsx_id": lenh.id, "so_luong": so}


def _h():
    return {"Authorization": f"Bearer {_admin_token()}"}


def _yeu_cau_hai_lenh(client, db, customer):
    g = _giay(db)
    ncc = _ncc_ban(db, g)
    a = _lenh(db, customer, ma="LSX-MCA", giay_id=g.id, so_to_nguyen=500, han=MAI)
    b = _lenh(db, customer, ma="LSX-MCB", giay_id=g.id, so_to_nguyen=300, han=MAI)
    body = {"content": "Thiếu giấy", "needed_date": MAI.isoformat(), "lines": [_dong(g, 800)],
            # Client đòi Mua tồn nhưng có liên kết lệnh ⇒ máy chủ chốt Cho lệnh SX.
            "loai_mua": "mua_ton",
            "nguon_lenh": [_nguon(g, a, 500), _nguon(g, b, 300)]}
    r = client.post("/api/department-purchase-requests", json=body, headers=_h())
    assert r.status_code == 201, r.text
    return g, ncc, r.json()


def test_yeu_cau_va_mon_hien_du_hai_lenh(client, db, customer):
    g, _, yc = _yeu_cau_hai_lenh(client, db, customer)
    assert yc["loai_mua"] == "cho_lsx"
    assert [(m["ma"], m["so_luong"]) for m in yc["mua_cho"]] == [("LSX-MCA", 500), ("LSX-MCB", 300)]
    assert [m["loai"] for m in yc["lines"][0]["mua_cho"]] == ["lsx", "lsx"]

    mon = client.get("/api/department-purchase-requests/mon", headers=_h()).json()["items"]
    m = next(x for x in mon if x["request_id"] == yc["id"])
    assert m["loai_mua"] == "cho_lsx"
    assert [x["ma"] for x in m["mua_cho"]] == ["LSX-MCA", "LSX-MCB"]


def test_tim_theo_ma_lenh_ra_mon(client, db, customer):
    _, _, yc = _yeu_cau_hai_lenh(client, db, customer)
    tim = client.get("/api/department-purchase-requests/mon", params={"q": "lsx-mcb"},
                     headers=_h()).json()["items"]
    assert [x["request_id"] for x in tim] == [yc["id"]]
    ds = client.get("/api/department-purchase-requests", params={"q": "LSX-MCB"},
                    headers=_h()).json()["items"]
    assert [x["id"] for x in ds] == [yc["id"]]


def test_loc_loai_mua_o_may_chu(client, db, customer):
    _, _, yc = _yeu_cau_hai_lenh(client, db, customer)
    h = _h()
    co = client.get("/api/department-purchase-requests", params=[("loai_mua", "cho_lsx")],
                    headers=h).json()["items"]
    assert yc["id"] in [x["id"] for x in co]
    khong = client.get("/api/department-purchase-requests",
                       params=[("loai_mua", "mua_ton"), ("loai_mua", "theo_yeu_cau")],
                       headers=h).json()["items"]
    assert yc["id"] not in [x["id"] for x in khong]
    mon = client.get("/api/department-purchase-requests/mon", params=[("loai_mua", "mua_ton")],
                     headers=h).json()["items"]
    assert yc["id"] not in [x["request_id"] for x in mon]
    sai = client.get("/api/department-purchase-requests", params=[("loai_mua", "x")], headers=h)
    assert sai.status_code == 422


def test_don_mua_mang_mua_cho_tung_dong(client, db, customer):
    g, ncc, yc = _yeu_cau_hai_lenh(client, db, customer)
    h = _h()
    dong = {**_dong(g, 800), "expected_unit_price": 1000, "supplier_id": ncc.id,
            "department_request_line_id": yc["lines"][0]["id"]}
    r = client.post("/api/purchase-requests/batch", headers=h, json={
        "source_request_ids": [yc["id"]], "content": "Mua giấy",
        "needed_date": MAI.isoformat(), "lines": [dong]})
    assert r.status_code == 201, r.text
    don = r.json()["items"][0]
    assert don["loai_mua_cac"] == ["cho_lsx"]
    assert [m["ma"] for m in don["mua_cho"]] == ["LSX-MCA", "LSX-MCB"]
    assert don["lines"][0]["yeu_cau_ma"] == yc["code"]
    assert don["lines"][0]["loai_mua"] == "cho_lsx"
    assert don["sources"][0]["loai_mua"] == "cho_lsx"

    co = client.get("/api/purchase-requests", params=[("loai_mua", "cho_lsx")], headers=h).json()
    assert don["id"] in [x["id"] for x in co["items"]]
    khong = client.get("/api/purchase-requests", params=[("loai_mua", "mua_ton")], headers=h).json()
    assert don["id"] not in [x["id"] for x in khong["items"]]


def test_yeu_cau_nhap_kho_tu_dot_giao_thay_mua_cho(client, db, customer):
    from app.models.stock_request import StockRequest, StockRequestLine
    from app.repositories.user_repo import UserRepository
    from tests.test_payables_api import _da_mua, _ghi_dot, _gui_va_duyet

    g, ncc, yc = _yeu_cau_hai_lenh(client, db, customer)
    h = _h()
    dong = {**_dong(g, 800), "expected_unit_price": 1000, "supplier_id": ncc.id,
            "department_request_line_id": yc["lines"][0]["id"]}
    don = client.post("/api/purchase-requests/batch", headers=h, json={
        "source_request_ids": [yc["id"]], "content": "Mua giấy",
        "needed_date": MAI.isoformat(), "lines": [dong]}).json()["items"][0]
    _gui_va_duyet(client, h, don["id"])
    _da_mua(client, h, don["id"])
    dot = _ghi_dot(client, h, don["id"], lines=[
        {"purchase_request_line_id": don["lines"][0]["id"], "quantity": 800}])["deliveries"][-1]

    admin = UserRepository(db).get_by_username("admin")
    nk = StockRequest(ma="NK-MUACHO", loai="NHAP", nguoi_tao_id=admin.id, purchase_delivery_id=dot["id"])
    db.add(nk)
    db.flush()
    db.add(StockRequestLine(request_id=nk.id, hang_loai="giay", hang_id=g.id, kho_rong=KHO[0],
                            kho_dai=KHO[1], dvt=_dv_dong(_hang(g), None), sl_de_nghi=800))
    db.commit()

    r = client.get(f"/api/kho/de-nghi/{nk.id}", headers=h)
    assert r.status_code == 200, r.text
    ln = r.json()["lines"][0]
    assert ln["loai_mua_cac"] == ["cho_lsx"]
    assert [(m["ma"], m["so_luong"]) for m in ln["mua_cho"]] == [("LSX-MCA", 500), ("LSX-MCB", 300)]
    ds = client.get("/api/kho/de-nghi", headers=h).json()["items"]
    assert next(x for x in ds if x["id"] == nk.id)["lines"][0]["mua_cho"][0]["ma"] == "LSX-MCA"
