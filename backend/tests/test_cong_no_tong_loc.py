"""Dòng Cộng theo bộ lọc (`tong_loc`) của hai màn công nợ + thông tin đối tác trong chi tiết.

`tong_loc` cộng trên MỌI dòng khớp bộ lọc, trước khi cắt trang — khác `total_due` / `aging` đầu màn
vốn không theo bộ lọc nâng cao. Hai lối nhanh `chi_tong` và `dem_only` không tính (giữ nhẹ).
"""
from __future__ import annotations

from datetime import timedelta

from app.db import SessionLocal
from app.models.accounting import SalesInvoice, SupplierBankAccount
from app.models.customer import CustomerContact
from app.models.order import Order, OrderLine, STATUS_ORDERED
from tests.test_ke_toan_cong_no_theo_ky import (
    _hoa_don_lui_ngay,
    _ky_qua_khu,
    _da_mua,
    _dong_dau_tien,
    _don,
    _ghi_dot,
    _headers,
    _hom_nay,
    _invoice_payload,
    _sales_order,
    _supplier,
    _user_id,
)

MOT_DOT = 220_000  # 100 tờ × 2.200đ


def _ncc_hai_dot(client, h, ten: str, *, qua_han_10_ngay: bool) -> dict:
    """NCC có 2 đợt (mỗi đợt 220.000đ). `qua_han_10_ngay`: một trong hai đợt có hạn trả cách đây 10 ngày."""
    ncc = _supplier(client, h, name=ten)
    don = _don(client, h, ncc["id"], quantity=200)
    _da_mua(client, h, don["id"])
    dong = _dong_dau_tien(don)
    han_1 = (_hom_nay() - timedelta(days=10)).isoformat() if qua_han_10_ngay else None
    _ghi_dot(client, h, don["id"], lines=[{"purchase_request_line_id": dong, "quantity": 100}], han=han_1, ngay=han_1)
    _ghi_dot(client, h, don["id"], lines=[{"purchase_request_line_id": dong, "quantity": 100}],
             han=(_hom_nay() + timedelta(days=20)).isoformat())
    return ncc


def _payables(client, h, **params) -> dict:
    r = client.get("/api/accounting/payables", headers=h, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _receivables(client, h, **params) -> dict:
    r = client.get("/api/accounting/receivables", headers=h, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_phai_tra_tong_loc_theo_bo_loc_va_hai_loi_nhanh(client):
    h = _headers(client)
    ncc1 = _ncc_hai_dot(client, h, "TongLoc Alpha", qua_han_10_ngay=True)
    ncc2 = _supplier(client, h, name="TongLoc Beta")
    don2 = _don(client, h, ncc2["id"], quantity=100)
    _da_mua(client, h, don2["id"])
    _ghi_dot(client, h, don2["id"],
             lines=[{"purchase_request_line_id": _dong_dau_tien(don2), "quantity": 100}],
             han=(_hom_nay() + timedelta(days=20)).isoformat())

    # Lọc theo tên NCC1: 1 đối tác, 2 đợt, nợ 440.000, một đợt quá hạn 10 ngày (rổ 8–15).
    t = _payables(client, h, q="TongLoc Alpha")["tong_loc"]
    assert t["so_doi_tac"] == 1
    assert t["so_khoan"] == 2
    assert t["con_no"] == 2 * MOT_DOT
    assert t["aging"]["d8_15"] == MOT_DOT
    assert t["aging"]["chua_toi_han"] == MOT_DOT
    assert t["qua_han"] == MOT_DOT
    assert set(t["aging"]) == {"chua_toi_han", "d1_7", "d8_15", "d16_30", "d31_60", "d60_plus"}

    # Không đổi theo trang: size=1 vẫn cộng cả hai NCC.
    tat_ca = _payables(client, h, q="TongLoc", size=1)
    assert len(tat_ca["items"]) == 1
    assert tat_ca["tong_loc"]["so_doi_tac"] == 2
    assert tat_ca["tong_loc"]["so_khoan"] == 3
    assert tat_ca["tong_loc"]["con_no"] == 3 * MOT_DOT

    # Hai lối nhanh không tính.
    assert _payables(client, h, q="TongLoc", chi_tong="true")["tong_loc"] is None
    assert _payables(client, h, q="TongLoc", dem_only="true")["tong_loc"] is None


def test_phai_tra_chi_tiet_co_lien_he_va_tk_nhan(client):
    h = _headers(client)
    ncc = _ncc_hai_dot(client, h, "TongLoc Gamma", qua_han_10_ngay=False)
    khong_tk = _supplier(client, h, name="TongLoc Delta")
    db = SessionLocal()
    try:
        db.add(SupplierBankAccount(supplier_id=ncc["id"], account_holder="CTY GAMMA", account_number="111222333",
                                   bank_name="Vietcombank", bank_branch="HN", is_default=False, is_active=True))
        db.add(SupplierBankAccount(supplier_id=ncc["id"], account_holder="CTY GAMMA", account_number="999888777",
                                   bank_name="Techcombank", bank_branch="HN", is_default=True, is_active=True))
        db.commit()
    finally:
        db.close()
    r = client.get(f"/api/accounting/payables/{ncc['id']}", headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["lien_he_ten"] == "Nguyễn Lan"
    assert d["lien_he_sdt"] == ncc["phone"]
    assert d["tk_nhan"] == "Techcombank 999888777"
    r2 = client.get(f"/api/accounting/payables/{khong_tk['id']}", headers=h)
    assert r2.status_code == 200, r2.text
    assert r2.json()["tk_nhan"] is None


def _them_don_cho_khach(customer_id: int, suffix: str, total: int) -> int:
    db = SessionLocal()
    try:
        order = Order(order_no=f"DH-TL-{suffix}", customer_id=customer_id, status=STATUS_ORDERED, ordered_at=None)
        order.lines.append(OrderLine(description="Hop", qty=10, don_vi_tinh="box", line_total=total, vat_pct_estimate=0))
        db.add(order)
        db.commit()
        return order.id
    finally:
        db.close()


def _hoa_don(client, h, order_id: int, so: str, *, han) -> int:
    r = client.post("/api/accounting/sales-invoices", json=_invoice_payload(order_id, number=so), headers=h)
    assert r.status_code == 201, r.text
    hd = r.json()["id"]
    db = SessionLocal()
    try:
        db.get(SalesInvoice, hd).due_date = han
        db.commit()
    finally:
        db.close()
    return hd


def test_phai_thu_tong_loc_va_phu_trach_o_chi_tiet(client):
    h = _headers(client)
    sale = _user_id("sale-tong-loc")
    hn = _hom_nay()
    o1, kh1 = _sales_order(total=600_000, suffix="TL1", sale_user_id=sale)
    o1b = _them_don_cho_khach(kh1, "TL1B", 400_000)
    o2, kh2 = _sales_order(total=900_000, suffix="TL2")
    _hoa_don(client, h, o1, "TL-0001", han=hn - timedelta(days=10))   # quá hạn 10 ngày
    _hoa_don(client, h, o1b, "TL-0002", han=hn + timedelta(days=20))
    _hoa_don(client, h, o2, "TL-0003", han=hn + timedelta(days=20))
    db = SessionLocal()
    try:
        db.add(CustomerContact(customer_id=kh1, name="Chính", phone="0900000002", is_primary=True))
        db.commit()
    finally:
        db.close()

    # Lọc theo tên khách 1: 1 khách, 2 hoá đơn, nợ 1.000.000, 600.000 quá hạn ở rổ 8–15.
    t = _receivables(client, h, q="Khach ky TL1")["tong_loc"]
    assert t["so_doi_tac"] == 1
    assert t["so_khoan"] == 2
    assert t["con_no"] == 1_000_000
    assert t["aging"]["d8_15"] == 600_000
    assert t["qua_han"] == 600_000
    # Không lọc theo tên cụ thể: cả hai khách của test (size=1 vẫn cộng trọn).
    chung = _receivables(client, h, q="Khach ky TL", size=1)
    assert len(chung["items"]) == 1
    assert chung["tong_loc"]["so_doi_tac"] == 2
    assert chung["tong_loc"]["con_no"] == 1_900_000
    assert _receivables(client, h, q="Khach ky TL", chi_tong="true")["tong_loc"] is None
    assert _receivables(client, h, q="Khach ky TL", dem_only="true")["tong_loc"] is None

    r = client.get(f"/api/accounting/receivables/{kh1}", headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert (d["lien_he_ten"], d["lien_he_sdt"]) == ("Chính", "0900000002")
    assert d["phu_trach"] == "sale-tong-loc"
    r2 = client.get(f"/api/accounting/receivables/{kh2}", headers=h)
    assert r2.status_code == 200, r2.text
    assert r2.json()["phu_trach"] is None


def test_phai_thu_tong_loc_ky_da_qua_so_khoan_bang_tong_aging_cac_dong(client):
    """Kỳ đã qua: `aging` của dòng lấy từ sổ 131 tại `den_ngay`, còn `invoice_count` là số hoá đơn
    còn nợ HÔM NAY. Dòng Cộng phải cộng đúng cột "số khoản" của từng dòng (Σ aging.count)."""
    h = _headers(client)
    order_a, kh, _ = _hoa_don_lui_ngay(client, h, suffix="TLQ", total=300_000)
    # Hoá đơn thứ hai của CÙNG khách phát hành HÔM NAY (sau kỳ) ⇒ chưa có trong sổ ở `den_ngay`.
    order_b = _them_don_cho_khach(kh, "TLQB", 200_000)
    _hoa_don(client, h, order_b, "TLQ-0002", han=_hom_nay() + timedelta(days=20))

    hom_nay = _receivables(client, h, q="Khach ky TLQ")
    assert hom_nay["items"][0]["invoice_count"] == 2
    assert hom_nay["tong_loc"]["so_khoan"] == 2

    qua_khu = _receivables(client, h, q="Khach ky TLQ", **_ky_qua_khu())
    dong = qua_khu["items"][0]
    cot_so_khoan = sum(r["count"] for r in dong["aging"].values())
    assert dong["invoice_count"] == 2 and cot_so_khoan == 1
    t = qua_khu["tong_loc"]
    assert t["so_khoan"] == cot_so_khoan == 1
    assert t["con_no"] == dong["total_due"] == 300_000
    assert t["trong_ky_1"] == dong["ban_trong_ky"] == 300_000
    assert t["trong_ky_2"] == 0
