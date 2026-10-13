"""In phiếu xuất kho bán hàng (có giá) / 02-VT (không giá) từ ngăn đơn — chủ chốt 13/10/2026.

Chỉ in được SAU KHI kho ghi sổ phiếu xuất của chuyến; số trên phiếu là SỐ THỰC XUẤT, không phải
số yêu cầu giao."""
from __future__ import annotations

from app.db import SessionLocal
from app.models.customer import Customer
from app.models.order import Order
from tests.test_giao_hang_api import _admin, _de_nghi_xuat, _don_da_chot, _len_kh, _tai_xe, _tao_yc


def _phieu(client, h, trip_id, *, so_luong: float | None = None) -> int:
    """Thủ kho lập phiếu xuất (chưa ghi sổ) — `so_luong` để xuất thiếu."""
    from app.models.stock_lot import StockLot
    from app.models.stock_request import StockRequest

    yc_id = _de_nghi_xuat(trip_id).id
    db = SessionLocal()
    try:
        yc = db.get(StockRequest, yc_id)
        ln = yc.lines[0]
        lo = (db.query(StockLot).filter(StockLot.hang_loai == ln.hang_loai, StockLot.hang_id == ln.hang_id,
                                        StockLot.sl_con_lai > 0).order_by(StockLot.id).first())
        body = {"request_id": yc_id, "kho_id": yc.kho_id or lo.kho_id, "lines": [
            {"request_line_id": ln.id, "so_luong": so_luong or float(ln.sl_de_nghi), "lot_id": lo.id,
             **({"ly_do": "Kho con thieu"} if so_luong else {})}]}
    finally:
        db.close()
    r = client.post("/api/kho/phieu", headers=h, json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _chuyen_tien_do(client, h, oid, yc_id):
    r = client.get(f"/api/orders/{oid}/tien-do", headers=h)
    assert r.status_code == 200, r.text
    return next(y for y in r.json()["yeu_cau"] if y["id"] == yc_id)["chuyen"]


def _dat_mst(oid):
    db = SessionLocal()
    try:
        kh = db.get(Customer, db.get(Order, oid).customer_id)
        kh.tax_code, kh.address = "3703054928", "34/38 Dong Chieu, Di An"
        db.commit()
    finally:
        db.close()


def test_chua_ghi_so_thi_KHONG_in_duoc_ghi_so_xong_in_theo_SO_THUC_XUAT(client):
    h = _admin(client)
    oid, lid = _don_da_chot(suffix="pxin1", qty=100)
    _dat_mst(oid)
    yc = _tao_yc(client, h, oid, lid, qty=60)
    r = _len_kh(client, h, yc["id"], _tai_xe("TX-pxin1"))
    assert r.status_code == 201, r.text
    trip = r.json()["trip"]["id"]
    url = f"/api/orders/{oid}/yeu-cau-giao/{yc['id']}/phieu-xuat"

    # Chưa lập phiếu, rồi lập phiếu mà CHƯA ghi sổ: hàng chưa ra khỏi kho ⇒ chưa in.
    assert client.get(url, headers=h).status_code == 400
    pid = _phieu(client, h, trip, so_luong=45)
    assert client.get(url, headers=h).status_code == 400
    assert _chuyen_tien_do(client, h, oid, yc["id"])["kho_da_xuat"] is False

    r = client.post(f"/api/kho/phieu/{pid}/ghi-so", headers=h)
    assert r.status_code == 200, r.text
    assert _chuyen_tien_do(client, h, oid, yc["id"])["kho_da_xuat"] is True

    r = client.get(url, headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["so_phieu"]) == 1 and d["so_phieu"][0]
    # Kho xuất thiếu 45/60 ⇒ phiếu in 45, không phải 60 của yêu cầu.
    assert [(x["order_line_id"], x["so_luong"]) for x in d["thuc_xuat"]] == [(lid, 45.0)]
    assert d["thuc_xuat"][0]["ma_hang"]
    assert d["khach_ma_so_thue"] == "3703054928"
    assert d["khach_dia_chi"] == "34/38 Dong Chieu, Di An"
    assert d["tai_xe"] == "TX-pxin1"


def test_yeu_cau_cua_don_khac_thi_tu_choi(client):
    h = _admin(client)
    oid, lid = _don_da_chot(suffix="pxin2", qty=50)
    oid2, _ = _don_da_chot(suffix="pxin3", qty=50)
    yc = _tao_yc(client, h, oid, lid, qty=50)
    assert client.get(f"/api/orders/{oid2}/yeu-cau-giao/{yc['id']}/phieu-xuat", headers=h).status_code == 400
