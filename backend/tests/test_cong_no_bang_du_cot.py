"""Danh sách công nợ "bảng đủ cột" (06/10/2026, docs/mockups/cong-no-phai-thu-danh-sach-3-phuong-an.html
phương án 1): mỗi dòng mang thêm mã, liên hệ chính, phụ trách, lần thu / trả GẦN NHẤT (cả lịch sử,
không theo kỳ) và hai màn nhận tham số sắp xếp `sap_xep` + `chieu` — sắp ở MÁY CHỦ trước khi cắt trang.
"""
from __future__ import annotations

from datetime import timedelta

from app.db import SessionLocal
from app.models.customer import CustomerContact
from tests.test_ke_toan_cong_no_theo_ky import (
    _dong_dau_tien,
    _don,
    _da_mua,
    _ghi_dot,
    _headers,
    _hom_nay,
    _invoice_payload,
    _ncc_co_no,
    _phieu_chi,
    _sales_order,
    _supplier,
    _user_id,
)


def _hoa_don(client, h, order_id: int, so: str) -> int:
    r = client.post("/api/accounting/sales-invoices", json=_invoice_payload(order_id, number=so), headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _thu(client, h, hd_id: int, so_tien: int, *, ngay=None) -> None:
    """Phiếu thu hoá đơn đề hôm nay (máy chủ cấm thu trước ngày hoá đơn), rồi LÙI ngày nếu cần."""
    r = client.post(
        f"/api/accounting/sales-invoices/{hd_id}/receipts",
        json={"payer_name": "Khach", "receipt_method": "cash",
              "receipt_date": _hom_nay().isoformat(), "amount": so_tien, "content": "Thu"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    if ngay is not None:
        from app.models.accounting import PaymentReceipt

        db = SessionLocal()
        try:
            db.get(PaymentReceipt, r.json()["id"]).receipt_date = ngay
            db.commit()
        finally:
            db.close()


def _dat_han(hd_id: int, han) -> None:
    from app.models.accounting import SalesInvoice

    db = SessionLocal()
    try:
        hd = db.get(SalesInvoice, hd_id)
        hd.due_date = han
        db.commit()
    finally:
        db.close()


def _ds(client, h, duong: str, **params) -> list[dict]:
    r = client.get(f"/api/accounting/{duong}", headers=h, params=params)
    assert r.status_code == 200, r.text
    return r.json()["items"]


def test_phai_thu_dong_co_ma_lien_he_phu_trach_va_lan_thu_gan_nhat(client):
    h = _headers(client)
    sale = _user_id("sale-du-cot")
    order_a, kh_a = _sales_order(total=900_000, suffix="DC1", sale_user_id=sale)
    order_b, kh_b = _sales_order(total=400_000, suffix="DC2")
    hd_a = _hoa_don(client, h, order_a, "DC-0001")
    _hoa_don(client, h, order_b, "DC-0002")
    db = SessionLocal()
    try:
        # A có hai liên hệ, người CHÍNH là người thứ hai. B không có liên hệ nào ⇒ lùi về ô liên hệ nhanh.
        db.add(CustomerContact(customer_id=kh_a, name="Phụ", phone="0900000001", is_primary=False))
        db.add(CustomerContact(customer_id=kh_a, name="Chính", phone="0900000002", is_primary=True))
        from app.models.customer import Customer

        b = db.get(Customer, kh_b)
        b.contact_name = "Liên hệ nhanh"
        b.phone = "0900000003"
        db.commit()
    finally:
        db.close()
    # Hai lần thu: lần cũ 40 ngày trước (ngoài kỳ tháng này), lần mới hôm qua.
    _thu(client, h, hd_a, 100_000, ngay=_hom_nay() - timedelta(days=40))
    _thu(client, h, hd_a, 250_000, ngay=_hom_nay() - timedelta(days=1))

    hn = _hom_nay()
    items = _ds(client, h, "receivables", tu_ngay=hn.replace(day=1).isoformat(), den_ngay=hn.isoformat())
    a = next(x for x in items if x["customer_id"] == kh_a)
    b = next(x for x in items if x["customer_id"] == kh_b)
    assert a["customer_code"] == "KH-KY-DC1"
    assert (a["lien_he_ten"], a["lien_he_sdt"]) == ("Chính", "0900000002")
    assert a["sale_user_name"] == "sale-du-cot"
    assert a["thu_gan_nhat_ngay"] == (hn - timedelta(days=1)).isoformat()
    assert a["thu_gan_nhat_tien"] == 250_000
    assert (b["lien_he_ten"], b["lien_he_sdt"]) == ("Liên hệ nhanh", "0900000003")
    assert b["sale_user_name"] is None
    assert b["thu_gan_nhat_ngay"] is None and b["thu_gan_nhat_tien"] == 0


def test_phai_thu_sap_xep_o_may_chu(client):
    h = _headers(client)
    o1, k1 = _sales_order(total=300_000, suffix="SX1")
    o2, k2 = _sales_order(total=700_000, suffix="SX2")
    o3, k3 = _sales_order(total=500_000, suffix="SX3", term_days=None)
    h1 = _hoa_don(client, h, o1, "SX-0001")
    h2 = _hoa_don(client, h, o2, "SX-0002")
    _hoa_don(client, h, o3, "SX-0003")
    hn = _hom_nay()
    _dat_han(h1, hn + timedelta(days=3))
    _dat_han(h2, hn + timedelta(days=20))
    _thu(client, h, h2, 100_000)
    _thu(client, h, h1, 50_000, ngay=hn - timedelta(days=9))
    cua_ta = {k1, k2, k3}

    def thu_tu(**p) -> list[int]:
        return [x["customer_id"] for x in _ds(client, h, "receivables", size=200, **p) if x["customer_id"] in cua_ta]

    # Mặc định: còn nợ giảm dần (600k, 500k, 250k).
    assert thu_tu() == [k2, k3, k1]
    assert thu_tu(sap_xep="con_no", chieu="asc") == [k1, k3, k2]
    # Hạn gần nhất tăng dần; khách không có hạn LUÔN cuối, kể cả khi đảo chiều.
    assert thu_tu(sap_xep="han") == [k1, k2, k3]
    assert thu_tu(sap_xep="han", chieu="desc") == [k2, k1, k3]
    # Thu gần nhất tăng dần = im lâu nhất trước: chưa thu lần nào đứng đầu.
    assert thu_tu(sap_xep="gan_nhat") == [k3, k1, k2]
    assert thu_tu(sap_xep="gan_nhat", chieu="desc") == [k2, k1, k3]
    # Khoá lạ bỏ qua, không 422.
    assert thu_tu(sap_xep="la", chieu="ngang") == [k2, k3, k1]


def test_phai_tra_dong_co_ma_lien_he_va_lan_tra_gan_nhat(client):
    h = _headers(client)
    ncc, don, dot = _ncc_co_no(client, h, name="NCC Du Cot", quantity=1000)
    _phieu_chi(client, h, don["id"], 500_000, delivery_id=dot)
    items = _ds(client, h, "payables")
    m = next(x for x in items if x["supplier_id"] == ncc["id"])
    assert m["supplier_code"] == ncc.get("code")
    assert (m["lien_he_ten"], m["lien_he_sdt"]) == ("Nguyễn Lan", ncc["phone"])
    assert m["tra_gan_nhat_ngay"] == _hom_nay().isoformat()
    assert m["tra_gan_nhat_tien"] == 500_000

    ncc2, _, _ = _ncc_co_no(client, h, name="NCC Du Cot Chua Tra", quantity=200)
    m2 = next(x for x in _ds(client, h, "payables") if x["supplier_id"] == ncc2["id"])
    assert m2["tra_gan_nhat_ngay"] is None and m2["tra_gan_nhat_tien"] == 0


def test_phai_tra_sap_xep_o_may_chu(client):
    h = _headers(client)
    hn = _hom_nay()
    a = _supplier(client, h, name="NCC SX A")
    b = _supplier(client, h, name="NCC SX B")
    da = _don(client, h, a["id"], quantity=300)
    db_ = _don(client, h, b["id"], quantity=800)
    for don, han in ((da, hn + timedelta(days=15)), (db_, hn + timedelta(days=2))):
        _da_mua(client, h, don["id"])
        _ghi_dot(client, h, don["id"], han=han.isoformat(),
                 lines=[{"purchase_request_line_id": _dong_dau_tien(don), "quantity": 300 if don is da else 800}])
    cua_ta = {a["id"], b["id"]}

    def thu_tu(**p) -> list[int]:
        return [x["supplier_id"] for x in _ds(client, h, "payables", size=200, **p) if x["supplier_id"] in cua_ta]

    assert thu_tu() == [b["id"], a["id"]]
    assert thu_tu(sap_xep="con_no", chieu="asc") == [a["id"], b["id"]]
    assert thu_tu(sap_xep="han") == [b["id"], a["id"]]
    assert thu_tu(sap_xep="han", chieu="desc") == [a["id"], b["id"]]
