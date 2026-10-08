"""Yêu cầu mua hàng — chế độ xem TỪNG MÓN (phương án 3, 07/10/2026).

`GET /api/department-purchase-requests/mon`: mỗi món một dòng, kèm đơn mua đang giữ nó, tình trạng
(chờ lập đơn → nhập kho) và tiến độ năm nấc. Lọc tình trạng + đếm + cắt trang ở máy chủ.
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.stock_request import StockRequest
from app.repositories.user_repo import UserRepository

from .test_payables_api import (
    _da_mua,
    _dong_dau_tien,
    _ghi_dot,
    _gui_va_duyet,
    _headers,
    _needed_date,
    _supplier,
)

URL = "/api/department-purchase-requests/mon"


def _mon(client, h, **params) -> dict:
    r = client.get(URL, params=params, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _don(client, h, supplier_id: int) -> dict:
    """Đơn NHÁP 1000 tờ lập từ một yêu cầu, NỐI DÒNG ↔ DÒNG như form Lập đơn gửi lên."""
    r = client.post(
        "/api/department-purchase-requests",
        json={
            "source_type": "kinh_doanh",
            "purpose": "Mua giấy",
            "needed_date": _needed_date(),
            "lines": [{"item_name": "Giấy Duplex", "unit": "tờ", "quantity": 1000}],
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    src = r.json()
    r = client.post(
        "/api/purchase-requests",
        json={
            "supplier_id": supplier_id,
            "source_request_ids": [src["id"]],
            "purpose": "Mua giấy",
            "needed_date": _needed_date(),
            "lines": [{
                "item_name": "Giấy Duplex", "unit": "tờ", "quantity": 1000,
                "expected_unit_price": 2200, "discount_percent": 0, "vat_percent": 0,
                "department_request_line_id": src["lines"][0]["id"],
            }],
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    return {**r.json(), "source_id": src["id"]}


def _cua(j: dict, request_id: int) -> list[dict]:
    return [m for m in j["items"] if m["request_id"] == request_id]


def test_tinh_trang_mon_tu_cho_lap_toi_nhap_kho(client):
    h = _headers(client)
    ncc = _supplier(client, h, name="NCC Tung Mon")
    _supplier(client, h, name="NCC Keo Tung Mon", item="Keo nhiệt", unit="kg")

    # Yêu cầu chưa có đơn ⇒ Chờ lập đơn, tick được.
    r = client.post(
        "/api/department-purchase-requests",
        json={
            "source_type": "kinh_doanh",
            "purpose": "Mua giấy cho lệnh",
            "needed_date": _needed_date(),
            "lines": [
                {"item_name": "Giấy Duplex", "unit": "tờ", "quantity": 10},
                {"item_name": "Keo nhiệt", "unit": "kg", "quantity": 2},
            ],
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    yc = r.json()
    j = _mon(client, h)
    mon = _cua(j, yc["id"])
    assert [m["item_name"] for m in mon] == ["Giấy Duplex", "Keo nhiệt"]
    assert {(m["tinh_trang"], m["tien_do"], m["chon_duoc"]) for m in mon} == {("cho_lap", 0.0, True)}

    # Đơn nháp ⇒ món nằm ở Đơn nháp, không tick được nữa.
    don = _don(client, h, ncc["id"])
    m = _cua(_mon(client, h), don["source_id"])[0]
    assert (m["tinh_trang"], m["tien_do"], m["chon_duoc"], m["purchase_code"]) == (
        "nhap", 1.0, False, don["code"],
    )
    _gui_va_duyet(client, h, don["id"])
    assert _cua(_mon(client, h), don["source_id"])[0]["tinh_trang"] == "cho_hang"

    _da_mua(client, h, don["id"])
    dong = _dong_dau_tien(don)
    _ghi_dot(client, h, don["id"], lines=[{"purchase_request_line_id": dong, "quantity": 400}])
    m = _cua(_mon(client, h), don["source_id"])[0]
    assert (m["tinh_trang"], m["tien_do"], m["received_quantity"]) == ("mot_phan", 3.5, 400)

    r = _ghi_dot(client, h, don["id"], lines=[{"purchase_request_line_id": dong, "quantity": 600}])
    m = _cua(_mon(client, h), don["source_id"])[0]
    assert (m["tinh_trang"], m["tien_do"]) == ("du", 4.0)

    # Nhập kho đủ mọi đợt có món ⇒ Đã nhập kho.
    db = SessionLocal()
    try:
        admin = UserRepository(db).get_by_username("admin")
        for i, d in enumerate(r["deliveries"]):
            db.add(StockRequest(ma=f"NK-TUNGMON-{i}", loai="NHAP", nguoi_tao_id=admin.id, purchase_delivery_id=d["id"]))
            if i == 0:
                db.commit()
                m = _cua(_mon(client, h), don["source_id"])[0]
                assert m["tinh_trang"] == "du"  # còn một đợt chưa nhập
        db.commit()
    finally:
        db.close()
    m = _cua(_mon(client, h), don["source_id"])[0]
    assert (m["tinh_trang"], m["tien_do"]) == ("nhap_kho", 5.0)

    # Đếm theo tình trạng, lọc + cắt trang ở máy chủ, tìm theo tên vật tư.
    j = _mon(client, h)
    assert j["dem_theo_tab"]["cho_lap"] == 2 and j["dem_theo_tab"]["nhap_kho"] == 1
    j = _mon(client, h, tinh_trang="cho_lap", size=1)
    assert j["total"] == 2 and len(j["items"]) == 1 and j["so_yeu_cau"] == 1
    j = _mon(client, h, q="keo nhi")
    assert [m["item_name"] for m in j["items"]] == ["Keo nhiệt"]
    assert client.get(URL, params={"tinh_trang": "la"}, headers=h).status_code == 422
