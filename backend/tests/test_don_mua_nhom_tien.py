"""Nhóm lọc TIỀN của danh sách đơn mua (phương án 3, 07/10/2026).

Danh sách đơn ở màn Mua hàng và Kế toán có hai nhóm lọc độc lập: Hàng (`status`) và Tiền (`tien` =
chua_tra | mot_phan | qua_han | da_tra). Số trên mỗi nhóm đếm TRƯỚC khi lọc cả hai nhóm. Đơn chưa
có hàng về thì chưa phát sinh nợ, không vào nhóm tiền nào.
"""
from __future__ import annotations

from datetime import timedelta

from app.db import SessionLocal
from app.models.purchase import PurchaseDelivery

from .test_payables_api import (
    _da_mua,
    _don,
    _dong_dau_tien,
    _ghi_dot,
    _headers,
    _hom_nay,
    _phieu_chi,
    _supplier,
)

URL_PMH = "/api/purchase-requests"
URL_KT = "/api/accounting/inbox"


def _dot(client, headers, don: dict, so: int) -> int:
    _da_mua(client, headers, don["id"])
    r = _ghi_dot(
        client, headers, don["id"],
        lines=[{"purchase_request_line_id": _dong_dau_tien(don), "quantity": so}],
    )
    return r["deliveries"][-1]["id"]


def _ma(r) -> list[str]:
    assert r.status_code == 200, r.text
    return sorted(i["code"] for i in r.json()["items"])


def test_nhom_tien_dem_va_loc_o_hai_man(client):
    h = _headers(client)
    ncc = _supplier(client, h, name="NCC Nhom Tien")
    chua_tra = _don(client, h, ncc["id"])
    _dot(client, h, chua_tra, 500)

    da_tra = _don(client, h, ncc["id"])
    d = _dot(client, h, da_tra, 1000)
    _phieu_chi(client, h, da_tra["id"], 2_200_000, stage="final", delivery_id=d)

    mot_phan = _don(client, h, ncc["id"])
    d = _dot(client, h, mot_phan, 500)
    _phieu_chi(client, h, mot_phan["id"], 500_000, stage="final", delivery_id=d)

    qua_han = _don(client, h, ncc["id"])
    d = _dot(client, h, qua_han, 500)
    db = SessionLocal()
    try:
        db.get(PurchaseDelivery, d).due_date = _hom_nay() - timedelta(days=3)
        db.commit()
    finally:
        db.close()

    _don(client, h, ncc["id"])  # đã duyệt, chưa có hàng về ⇒ không vào nhóm tiền nào

    for url in (URL_PMH, URL_KT):
        r = client.get(url, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["dem_theo_tien"] == {"chua_tra": 1, "mot_phan": 1, "qua_han": 1, "da_tra": 1}
        assert _ma(client.get(url, params={"tien": "qua_han"}, headers=h)) == [qua_han["code"]]
        # Chip trên dòng đọc cùng một hàm với bộ lọc.
        assert client.get(url, params={"tien": "qua_han"}, headers=h).json()["items"][0]["nhom_tien"] == "qua_han"
        assert _ma(client.get(url, params={"tien": "chua_tra"}, headers=h)) == [chua_tra["code"]]
        assert _ma(client.get(url, params={"tien": "mot_phan"}, headers=h)) == [mot_phan["code"]]
        # Hai nhóm lọc chồng nhau: đơn trả đủ là đơn đã về đủ, không phải về một phần.
        assert _ma(client.get(url, params={"tien": "da_tra", "status": "received"}, headers=h)) == [
            da_tra["code"]
        ]
        assert _ma(client.get(url, params={"tien": "da_tra", "status": "partially_received"}, headers=h)) == []
        # Số trên nhóm Tiền không đổi theo chip đang chọn.
        j = client.get(url, params={"tien": "da_tra", "status": "received"}, headers=h).json()
        assert j["total"] == 1 and j["dem_theo_tien"]["chua_tra"] == 1
        assert client.get(url, params={"tien": "no"}, headers=h).status_code == 422


def test_nhom_tien_cat_trang_dung_thu_tu(client):
    h = _headers(client)
    ncc = _supplier(client, h, name="NCC Nhom Tien Trang")
    dons = [_don(client, h, ncc["id"]) for _ in range(3)]
    for don in dons:
        _dot(client, h, don, 100)
    r1 = client.get(URL_PMH, params={"tien": "chua_tra", "size": 2, "page": 1}, headers=h).json()
    r2 = client.get(URL_PMH, params={"tien": "chua_tra", "size": 2, "page": 2}, headers=h).json()
    assert r1["total"] == 3 and len(r1["items"]) == 2 and len(r2["items"]) == 1
    # Mặc định mới nhất lên đầu, như trang không lọc tiền.
    thu_tu = [i["code"] for i in r1["items"] + r2["items"]]
    assert thu_tu == [d["code"] for d in reversed(dons)]
