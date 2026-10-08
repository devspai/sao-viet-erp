"""Một đơn mua từ món của NHIỀU yêu cầu (08/10/2026, phương án 1: tick chéo).

Luật: đơn gắn đúng các yêu cầu có món trong đơn; một món chỉ nằm trong một đơn còn sống; yêu cầu
còn món chưa vào đơn thì vẫn Chờ mua (không khoá cả yêu cầu như trước).
"""
from __future__ import annotations

from tests.test_ycmh_trang_thai_api import _headers, _huy_phieu, _needed_date


def _ncc(client, h, ten: str, mon: list[tuple[str, str]]) -> dict:
    dau = f"{abs(hash(ten)) % 10**8:08d}"
    r = client.post("/api/suppliers", headers=h, json={
        "name": ten, "tax_code": f"01{dau}", "phone": f"09{dau}", "email": f"n{dau}@example.com",
        "address": "Hà Nội", "contact_name": "Lan", "supplier_group": "paper",
        "items": [{"item_name": t, "unit": dv, "unit_price": 2200, "vat_percent": 0} for t, dv in mon],
    })
    assert r.status_code == 201, r.text
    return r.json()


def _yc(client, h, mon: list[tuple[str, str]]) -> dict:
    r = client.post("/api/department-purchase-requests", headers=h, json={
        "source_type": "kinh_doanh", "purpose": "Mua vật tư", "needed_date": _needed_date(),
        "lines": [{"item_name": t, "unit": dv, "quantity": 100} for t, dv in mon],
    })
    assert r.status_code == 201, r.text
    return r.json()


def _dong(yc, ten, ncc):
    ln = next(l for l in yc["lines"] if l["item_name"] == ten)
    return {"item_name": ten, "unit": ln["unit"], "quantity": 100, "expected_unit_price": 2200,
            "supplier_id": ncc["id"], "department_request_line_id": ln["id"]}


def _lap(client, h, nguon, dong):
    return client.post("/api/purchase-requests/batch", headers=h, json={
        "source_request_ids": [y["id"] for y in nguon], "purpose": "Gom đơn",
        "needed_date": _needed_date(), "lines": dong})


def _mon(client, h, yc_id) -> dict:
    items = client.get("/api/department-purchase-requests/mon", headers=h,
                       params={"size": 200}).json()["items"]
    return {m["item_name"]: m for m in items if m["request_id"] == yc_id}


def _tt(client, h, yc_id) -> str:
    return client.get(f"/api/department-purchase-requests/{yc_id}", headers=h).json()["status"]


def _hai_yeu_cau(client, h):
    ncc = _ncc(client, h, "NCC Gom", [("Giấy C300", "tờ"), ("Keo dán", "kg"), ("Mực đen", "kg")])
    a = _yc(client, h, [("Giấy C300", "tờ"), ("Keo dán", "kg")])
    b = _yc(client, h, [("Mực đen", "kg")])
    return ncc, a, b


def test_mot_don_tu_mon_cua_hai_yeu_cau(client):
    h = _headers(client)
    ncc, a, b = _hai_yeu_cau(client, h)
    r = _lap(client, h, [a, b], [_dong(a, "Giấy C300", ncc), _dong(b, "Mực đen", ncc)])
    assert r.status_code == 201, r.text
    don = r.json()["items"]
    assert len(don) == 1
    assert sorted(s["department_request_id"] for s in don[0]["sources"]) == sorted([a["id"], b["id"]])
    # A còn Keo dán chưa vào đơn ⇒ vẫn Chờ mua, món đó vẫn tick được. B hết món ⇒ Chờ duyệt.
    assert _tt(client, h, a["id"]) == "open"
    assert _tt(client, h, b["id"]) == "pending_approval"
    mon_a = _mon(client, h, a["id"])
    assert mon_a["Keo dán"]["chon_duoc"] is True
    assert mon_a["Giấy C300"]["chon_duoc"] is False


def test_mon_da_co_don_khong_lap_don_thu_hai(client):
    h = _headers(client)
    ncc, a, b = _hai_yeu_cau(client, h)
    don = _lap(client, h, [a, b], [_dong(a, "Giấy C300", ncc), _dong(b, "Mực đen", ncc)]).json()
    lai = _lap(client, h, [a], [_dong(a, "Giấy C300", ncc)])
    assert lai.status_code == 422, lai.text
    assert don["items"][0]["code"] in lai.json()["detail"]


def test_hai_ncc_moi_don_chi_gan_yeu_cau_cua_minh(client):
    h = _headers(client)
    n1 = _ncc(client, h, "NCC Một", [("Giấy C300", "tờ")])
    n2 = _ncc(client, h, "NCC Hai", [("Mực đen", "kg")])
    a = _yc(client, h, [("Giấy C300", "tờ")])
    b = _yc(client, h, [("Mực đen", "kg")])
    r = _lap(client, h, [a, b], [_dong(a, "Giấy C300", n1), _dong(b, "Mực đen", n2)])
    assert r.status_code == 201, r.text
    theo_ncc = {d["supplier_id"]: d for d in r.json()["items"]}
    assert [s["department_request_id"] for s in theo_ncc[n1["id"]]["sources"]] == [a["id"]]
    assert [s["department_request_id"] for s in theo_ncc[n2["id"]]["sources"]] == [b["id"]]


def test_huy_don_thi_mon_ve_cho_lap(client):
    h = _headers(client)
    ncc, a, b = _hai_yeu_cau(client, h)
    don = _lap(client, h, [a, b], [_dong(a, "Giấy C300", ncc), _dong(b, "Mực đen", ncc)]).json()
    _huy_phieu(client, h, don["items"][0]["id"])
    assert _mon(client, h, a["id"])["Giấy C300"]["chon_duoc"] is True
    assert _mon(client, h, b["id"])["Mực đen"]["chon_duoc"] is True
    assert _tt(client, h, b["id"]) == "open"


def test_sua_don_nhap_giu_mon_cu_khong_tu_chan(client):
    h = _headers(client)
    ncc, a, b = _hai_yeu_cau(client, h)
    don = _lap(client, h, [a, b], [_dong(a, "Giấy C300", ncc), _dong(b, "Mực đen", ncc)]).json()
    d = don["items"][0]
    r = client.put(f"/api/purchase-requests/{d['id']}", headers=h, json={
        "supplier_id": ncc["id"], "source_request_ids": [a["id"], b["id"]], "purpose": "Gom đơn",
        "needed_date": _needed_date(),
        # Bỏ Mực đen khỏi đơn ⇒ B về Chờ mua, đơn chỉ còn nguồn A.
        "lines": [_dong(a, "Giấy C300", ncc)],
    })
    assert r.status_code == 200, r.text
    assert [s["department_request_id"] for s in r.json()["sources"]] == [a["id"]]
    assert _tt(client, h, b["id"]) == "open"
