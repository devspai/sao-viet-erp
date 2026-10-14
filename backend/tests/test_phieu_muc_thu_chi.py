"""Phiếu thu / phiếu chi mang MỤC từ danh mục Mục thu chi (11/10/2026).

Phiếu lập tay bắt buộc chọn mục đúng loại; phiếu sinh từ nguồn thuộc mục CỐ ĐỊNH của nguồn (id
âm, cột mục để trống); phiếu chi lập tay gửi khách lên thì khách bị bỏ; danh sách lọc được theo mục
(0 = chưa phân loại, id âm = mục cố định).
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.accounting import PaymentVoucher
from app.models.customer import Customer
from app.repositories.accounting_repo import AccountingRepository
from app.services.accounting_service import AccountingService
from tests.muc_thu_chi_fixtures import muc_id

from .test_ke_toan_loc_ky_phieu import URL_PC, URL_PT, _headers, _hom_nay


def _phieu_chi(client, h, **them):
    return client.post(URL_PC, json={
        "source_type": "other", "voucher_type": "cash", "payment_stage": "other",
        "voucher_date": _hom_nay().isoformat(), "amount": 1_500_000, "currency": "VND",
        "exchange_rate": 1, "content": "Mua văn phòng phẩm", "cash_recipient_name": "Nguyễn Văn A",
        **them,
    }, headers=h)


def _phieu_thu(client, h, **them):
    return client.post(URL_PT, json={
        "payer_name": "Nguyễn Văn B", "receipt_method": "cash",
        "receipt_date": _hom_nay().isoformat(), "amount": 300_000, "content": "Thu bán phế liệu",
        **them,
    }, headers=h)


def _khach(ten="Khách hoàn tiền") -> int:
    db = SessionLocal()
    try:
        c = Customer(code="KH-MUC-01", name=ten)
        db.add(c)
        db.commit()
        return c.id
    finally:
        db.close()


def test_phieu_chi_lap_tay_bat_buoc_muc_dung_loai(client):
    h = _headers(client)
    r = _phieu_chi(client, h)
    assert r.status_code == 422 and "Chọn mục chi" in r.text
    r = _phieu_chi(client, h, muc_thu_chi_id=muc_id(client, h, "thu"))
    assert r.status_code == 422 and "không dùng cho phiếu chi" in r.text

    m = muc_id(client, h, "chi", ten="Văn phòng phẩm")
    r = _phieu_chi(client, h, muc_thu_chi_id=m)
    assert r.status_code == 201, r.text
    assert r.json()["muc_thu_chi_id"] == m
    assert r.json()["muc_thu_chi_ten"] == "Văn phòng phẩm"


def test_muc_ngung_dung_khong_chon_duoc(client):
    h = _headers(client)
    m = muc_id(client, h, "chi", ten="Tiếp khách")
    r = client.patch(f"/api/muc-thu-chi/{m}/active", json={"active": False}, headers=h)
    assert r.status_code == 200, r.text
    r = _phieu_chi(client, h, muc_thu_chi_id=m)
    assert r.status_code == 422 and "ngừng dùng" in r.text


def test_phieu_chi_lap_tay_bo_khach_gui_kem(client):
    h = _headers(client)
    kh = _khach()
    # Phiếu lập tay không gắn ai: khách gửi kèm bị bỏ — phiếu không lọt vào Công nợ phải thu.
    r = _phieu_chi(client, h, muc_thu_chi_id=muc_id(client, h, "chi"), customer_id=kh)
    assert r.status_code == 201, r.text
    assert r.json()["customer_id"] is None


def test_phieu_thu_lap_tay_bat_buoc_muc(client):
    h = _headers(client)
    r = _phieu_thu(client, h)
    assert r.status_code == 422 and "Chọn mục thu" in r.text
    m = muc_id(client, h, "thu", ten="Bán phế liệu")
    r = _phieu_thu(client, h, muc_thu_chi_id=m)
    assert r.status_code == 201, r.text
    assert r.json()["muc_thu_chi_ten"] == "Bán phế liệu"


def test_loc_danh_sach_theo_muc_va_chua_phan_loai(client):
    h = _headers(client)
    a = muc_id(client, h, "chi", ten="Điện nước")
    b = muc_id(client, h, "chi", ten="Sửa máy")
    pa = _phieu_chi(client, h, muc_thu_chi_id=a).json()
    pb = _phieu_chi(client, h, muc_thu_chi_id=b).json()
    pc = _phieu_chi(client, h, muc_thu_chi_id=b).json()
    db = SessionLocal()
    try:
        db.get(PaymentVoucher, pc["id"]).muc_thu_chi_id = None  # phiếu cũ chưa có mục
        db.commit()
    finally:
        db.close()

    def ma(muc):
        r = client.get(URL_PC, params={"muc": muc, "size": 50}, headers=h)
        assert r.status_code == 200, r.text
        return sorted(i["code"] for i in r.json()["items"])

    assert ma([a]) == [pa["code"]]
    assert ma([0]) == [pc["code"]]
    assert ma([b, 0]) == sorted([pb["code"], pc["code"]])


def test_phieu_tu_nguon_thuoc_muc_co_dinh(client):
    h = _headers(client)
    cu = _phieu_chi(client, h, muc_thu_chi_id=muc_id(client, h, "chi")).json()
    db = SessionLocal()
    try:
        v = db.get(PaymentVoucher, cu["id"])
        v.source_type, v.muc_thu_chi_id = "gia_cong_ngoai", None
        db.commit()
    finally:
        db.close()

    r = client.get(f"{URL_PC}/{cu['id']}", headers=h)
    assert r.json()["muc_thu_chi_ten"] == "Thuê gia công ngoài"
    # Lọc theo mục cố định (id âm) ra đúng phiếu nguồn đó; "Chưa phân loại" không gồm nó.
    r = client.get(URL_PC, params={"muc": [-2], "size": 50}, headers=h)
    assert [i["id"] for i in r.json()["items"]] == [cu["id"]]
    r = client.get(URL_PC, params={"muc": [0], "size": 50}, headers=h)
    assert cu["id"] not in [i["id"] for i in r.json()["items"]]
    # Phiếu lập tay không chọn được mục cố định (schema chặn id âm).
    assert _phieu_chi(client, h, muc_thu_chi_id=-2).status_code == 422


def test_phieu_tu_nguon_bo_qua_muc_gui_len(client):
    h = _headers(client)
    db = SessionLocal()
    try:
        svc = AccountingService.__new__(AccountingService)
        svc.repo = AccountingRepository(db)
        v = PaymentVoucher(source_type="salary_advance")
        svc._gan_muc_chi(v, muc_id(client, h, "chi", ten="Lương"), None)
        assert v.muc_thu_chi_id is None and v.customer_id is None
    finally:
        db.close()
