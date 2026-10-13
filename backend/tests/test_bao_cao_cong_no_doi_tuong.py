"""Hai màn công nợ chỉ cộng chứng từ thuộc ĐÚNG đối tượng (11/10/2026).

Phiếu chi nội bộ / lặt vặt không gắn nhà cung cấp không còn rơi vào Công nợ phải trả; phiếu thu
lập tay không gắn khách không còn rơi vào Công nợ phải thu; phiếu chi trả lại tiền cho khách (nguồn
`customer_refund`, 12/10/2026) cộng vào Công nợ phải thu của đúng khách đó.
"""
from __future__ import annotations

from datetime import date

from app.db import SessionLocal
from app.models.order import Order
from app.repositories.accounting_repo import AccountingRepository
from app.services import bao_cao_cong_no
from tests.test_bao_cao_cong_no import _bao_cao, _dong, _kiem_can_so, _ngay
from tests.test_ke_toan_loc_ky_phieu import _lap_phieu_chi, _lap_phieu_thu_khac
from tests.test_payables_api import _headers
from tests.test_sales_invoices_api import _add_deposit, _sales_order


def _khach_cua_don(order_id: int) -> int:
    db = SessionLocal()
    try:
        return db.get(Order, order_id).customer_id
    finally:
        db.close()


def test_phieu_chi_khong_gan_ncc_khong_vao_cong_no_phai_tra(client):
    h = _headers(client)
    _lap_phieu_chi(client, h, so_tien=700_000)
    bc = _bao_cao(client, h, "payables", tu=_ngay(30), den=_ngay(0))
    assert bc["items"] == []
    assert bc["tong"]["ps_no"] == 0


def test_phieu_thu_khong_gan_khach_khong_vao_cong_no_phai_thu(client):
    h = _headers(client)
    _lap_phieu_thu_khac(client, h, so_tien=300_000)
    bc = _bao_cao(client, h, "receivables", tu=_ngay(30), den=_ngay(0))
    assert bc["items"] == []
    assert bc["tong"]["ps_co"] == 0


def test_hoan_tien_khach_cong_vao_phai_thu_cua_dung_khach(client):
    h = _headers(client)
    order_id, _ = _sales_order(suffix="HT1")
    _add_deposit(order_id, 250_000)
    kh = _khach_cua_don(order_id)

    r = client.post("/api/accounting/payment-vouchers", json={
        "source_type": "customer_refund", "voucher_type": "cash", "payment_stage": "other",
        "voucher_date": _ngay(0), "amount": 100_000, "currency": "VND", "exchange_rate": 1,
        "content": "Trả lại tiền cọc thừa", "cash_recipient_name": "Khách", "customer_id": kh,
    }, headers=h)
    assert r.status_code == 201, r.text

    bc = _bao_cao(client, h, "receivables", tu=_ngay(30), den=_ngay(0))
    d = _dong(bc, "Customer invoice test HT1")
    assert (d["ps_no"], d["ps_co"]) == (100_000, 250_000)
    assert (d["cuoi_no"], d["cuoi_co"]) == (0, 150_000), "còn giữ 150.000 của khách"
    _kiem_can_so(bc)

    # Phiếu hoàn tiền KHÔNG còn nằm ở Công nợ phải trả.
    assert _bao_cao(client, h, "payables", tu=_ngay(30), den=_ngay(0))["items"] == []

    r = client.get("/api/accounting/reports/receivables/so-chi-tiet", params={
        "doi_tuong_id": kh, "tu_ngay": _ngay(30), "den_ngay": _ngay(0)}, headers=h)
    assert r.status_code == 200, r.text
    assert "hoan_tien_khach" in {x["loai"] for x in r.json()["dong"]}

    # Cột "Bán trong kỳ" của màn Công nợ phải thu đọc `ban_ky` — chỉ hoá đơn, không gồm tiền hoàn.
    db = SessionLocal()
    try:
        tong = bao_cao_cong_no.tong_hop_phai_thu(
            AccountingRepository(db), tu_ngay=date.fromisoformat(_ngay(30)), den_ngay=date.fromisoformat(_ngay(0)))
    finally:
        db.close()
    dong = next(x for x in tong["items"] if x["doi_tuong_id"] == kh)
    assert (dong["ps_no"], dong["ban_ky"]) == (100_000, 0)
