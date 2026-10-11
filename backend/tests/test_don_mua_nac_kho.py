"""Đơn mua ĐÃ VỀ ĐỦ chia ba nấc kho (11/10/2026): Chờ gửi kho → Kho chưa nhập → Đã nhập kho.

Đợt giao chưa có yêu cầu nhập = chờ gửi; có yêu cầu nhập chưa Hoàn tất = kho chưa nhập; yêu cầu
Hoàn tất = đã nhập. Nấc của ĐƠN là nấc chậm nhất. Lọc + đếm ở máy chủ, cả nhánh lọc Tiền.
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.stock_request import REQ_DONE, StockRequest
from app.repositories.user_repo import UserRepository

from .test_payables_api import _da_mua, _dong_dau_tien, _ghi_dot, _gui_va_duyet, _headers, _supplier
from .test_yeu_cau_mua_tung_mon import _don

URL = "/api/purchase-requests"


def _ds(client, h, **params) -> dict:
    r = client.get(URL, params=params, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _don_cua(client, h, don_id: int) -> dict:
    return next(x for x in _ds(client, h, size=200)["items"] if x["id"] == don_id)


def test_ba_nac_kho_cua_don_da_ve_du(client):
    h = _headers(client)
    ncc = _supplier(client, h, name="NCC Nac Kho")
    don = _don(client, h, ncc["id"])
    _gui_va_duyet(client, h, don["id"])
    _da_mua(client, h, don["id"])
    dong = _dong_dau_tien(don)
    _ghi_dot(client, h, don["id"], lines=[{"purchase_request_line_id": dong, "quantity": 400}])
    r = _ghi_dot(client, h, don["id"], lines=[{"purchase_request_line_id": dong, "quantity": 600}])
    assert r["status"] == "received"

    def nac():
        x = _don_cua(client, h, don["id"])
        return sorted(d["kho"] for d in x["deliveries"])

    assert nac() == ["cho_gui_kho", "cho_gui_kho"]
    j = _ds(client, h, status="cho_gui_kho")
    assert [x["id"] for x in j["items"]] == [don["id"]]
    assert (j["dem_theo_tab"]["cho_gui_kho"], j["dem_theo_tab"]["received"]) == (1, 1)

    db = SessionLocal()
    try:
        admin = UserRepository(db).get_by_username("admin")
        yc = [
            StockRequest(ma=f"NK-NAC-{i}", loai="NHAP", nguoi_tao_id=admin.id, purchase_delivery_id=d["id"])
            for i, d in enumerate(r["deliveries"])
        ]
        # Gửi MỘT đợt: đơn vẫn Chờ gửi kho (nấc chậm nhất).
        db.add(yc[0])
        db.commit()
        assert nac() == ["cho_gui_kho", "kho_chua_nhap"]
        assert [x["id"] for x in _ds(client, h, status="cho_gui_kho")["items"]] == [don["id"]]

        # Gửi đủ: Kho chưa nhập.
        db.add(yc[1])
        db.commit()
        assert nac() == ["kho_chua_nhap", "kho_chua_nhap"]
        j = _ds(client, h, status="kho_chua_nhap")
        assert [x["id"] for x in j["items"]] == [don["id"]]
        assert "cho_gui_kho" not in j["dem_theo_tab"]

        # Kho hoàn tất cả hai: Đã nhập kho — cả nhánh lọc Tiền (cắt trang bằng Python).
        for y in yc:
            y.trang_thai = REQ_DONE
        db.commit()
    finally:
        db.close()
    assert nac() == ["da_nhap_kho", "da_nhap_kho"]
    j = _ds(client, h, status="da_nhap_kho")
    assert [x["id"] for x in j["items"]] == [don["id"]]
    assert j["dem_theo_tab"]["da_nhap_kho"] == 1
    assert [x["id"] for x in _ds(client, h, status="da_nhap_kho", tien="chua_tra")["items"]] == [don["id"]]
    assert _ds(client, h, status="kho_chua_nhap", tien="chua_tra")["items"] == []
    # "received" cũ vẫn lọc được (đường gọi khác của API).
    assert [x["id"] for x in _ds(client, h, status="received")["items"]] == [don["id"]]
