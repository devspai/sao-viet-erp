"""Báo cáo thu chi theo mục × tháng (11/10/2026)."""
from __future__ import annotations

from datetime import date

from app.db import SessionLocal
from app.models.accounting import PaymentVoucher
from app.models.audit import AuditLog
from app.services.bao_cao_thu_chi import cot_ky
from tests.muc_thu_chi_fixtures import muc_id
from tests.test_ke_toan_loc_ky_phieu import URL_PC, URL_PT, _headers, _hom_nay

URL = "/api/bao-cao-thu-chi"


# ── cột kỳ ──────────────────────────────────────────────────────────────────────────────────

def test_ky_trong_mot_thang_khong_co_cot_ky():
    assert cot_ky(date(2026, 10, 1), date(2026, 10, 11)) == []


def test_ky_cat_giua_thang_ghi_ro_khoang_ngay():
    nhan = [c["nhan"] for c in cot_ky(date(2026, 8, 15), date(2026, 10, 10))]
    assert nhan == ["Tháng 8 (15 – 31/8)", "Tháng 9", "Tháng 10 (1 – 10/10)"]


def test_ky_qua_hai_nam_ghi_nam_va_qua_12_thang_thi_theo_quy():
    assert [c["nhan"] for c in cot_ky(date(2025, 12, 1), date(2026, 1, 31))] == [
        "Tháng 12/2025", "Tháng 1/2026"]
    q = cot_ky(date(2025, 1, 1), date(2026, 3, 31))
    assert [c["nhan"] for c in q][0] == "Quý 1/2025" and len(q) == 5


# ── bảng ────────────────────────────────────────────────────────────────────────────────────

def _chi(client, h, tien, muc, hinh_thuc="cash", nguoi="Nguyễn Văn A"):
    body = {"source_type": "other", "voucher_type": hinh_thuc, "payment_stage": "other",
            "voucher_date": _hom_nay().isoformat(), "amount": tien, "currency": "VND",
            "exchange_rate": 1, "content": "Chi", "cash_recipient_name": nguoi,
            "muc_thu_chi_id": muc}
    r = client.post(URL_PC, json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _thu(client, h, tien, muc):
    r = client.post(URL_PT, json={
        "payer_name": "Trần B", "receipt_method": "cash", "receipt_date": _hom_nay().isoformat(),
        "amount": tien, "content": "Thu", "muc_thu_chi_id": muc}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _bo_muc(voucher_id: int) -> None:
    db = SessionLocal()
    try:
        db.get(PaymentVoucher, voucher_id).muc_thu_chi_id = None
        db.commit()
    finally:
        db.close()


def _ky():
    hn = _hom_nay()
    return {"tu_ngay": hn.replace(day=1).isoformat(), "den_ngay": hn.isoformat()}


def _du_lieu(client, h):
    thu = muc_id(client, h, "thu", ten="Bán phế liệu")
    sua = muc_id(client, h, "chi", ten="Sửa máy")
    _thu(client, h, 300_000, thu)
    _chi(client, h, 7_000_000, sua)
    _chi(client, h, 1_000_000, sua, hinh_thuc="cash")
    le = _chi(client, h, 200_000, sua)
    _bo_muc(le["id"])
    return thu, sua, le


def test_bang_theo_muc_chenh_lech_va_chua_phan_loai(client):
    h = _headers(client)
    thu, sua, le = _du_lieu(client, h)
    r = client.get(URL, params=_ky(), headers=h)
    assert r.status_code == 200, r.text
    bc = r.json()
    assert bc["cot"] == []
    dong = {(d["ben"], d["ten"]): d for d in bc["dong"]}
    assert dong[("thu", "Bán phế liệu")]["cong"] == 300_000
    assert dong[("chi", "Sửa máy")]["cong"] == 8_000_000
    assert "tm5" not in dong[("chi", "Sửa máy")]  # gỡ 12/10/2026
    chua = dong[("chi", "Chưa phân loại")]
    assert chua["cong"] == 200_000 and chua["chua"] is True
    # Chưa phân loại xếp cuối nhóm Chi.
    assert bc["dong"][-1]["ten"] == "Chưa phân loại"
    assert bc["chenh_lech"]["cong"] == 300_000 - 8_200_000
    assert bc["the_loc"] == {"all": 3, "thu": 1, "chi": 2, "chua": 1}

    r = client.get(URL, params={**_ky(), "the": "chua"}, headers=h)
    assert [d["ten"] for d in r.json()["dong"]] == ["Chưa phân loại"]


def test_xem_theo_nguoi_va_ngan_phieu(client):
    h = _headers(client)
    thu, sua, le = _du_lieu(client, h)
    r = client.get(URL, params={**_ky(), "theo": "nguoi"}, headers=h)
    ten = {(d["ben"], d["ten"]) for d in r.json()["dong"]}
    assert ten == {("thu", "Trần B"), ("chi", "Nguyễn Văn A")}

    r = client.get(f"{URL}/phieu", params={**_ky(), "ben": "chi", "khoa": str(sua)}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["tong"] == 8_000_000 and len(r.json()["items"]) == 2
    r = client.get(URL, params={**_ky(), "the": "tm5"}, headers=h)
    assert r.status_code == 422  # thẻ "Chi tiền mặt từ 5 triệu" đã gỡ


def test_chuyen_phieu_chua_phan_loai_sang_muc(client):
    h = _headers(client)
    thu, sua, le = _du_lieu(client, h)
    r = client.post(f"{URL}/chuyen-muc", json={"phieu_chi_ids": [le["id"]], "muc_id": thu}, headers=h)
    assert r.status_code == 422, r.text  # mục thu không nhận phiếu chi
    r = client.post(f"{URL}/chuyen-muc",
                    json={"phieu_chi_ids": [le["id"]], "phieu_thu_ids": [1], "muc_id": sua}, headers=h)
    assert r.status_code == 422, r.text

    r = client.post(f"{URL}/chuyen-muc", json={"phieu_chi_ids": [le["id"]], "muc_id": sua}, headers=h)
    assert r.status_code == 200 and r.json()["so_phieu"] == 1, r.text
    bc = client.get(URL, params=_ky(), headers=h).json()
    assert "Chưa phân loại" not in {d["ten"] for d in bc["dong"]}
    db = SessionLocal()
    try:
        assert db.query(AuditLog).filter(AuditLog.action == "chuyen_muc_thu_chi",
                                         AuditLog.target == f"payment_voucher:{le['id']}").count() == 1
    finally:
        db.close()


def test_phieu_tu_nguon_vao_muc_co_dinh_va_khong_chuyen_duoc(client):
    h = _headers(client)
    thu, sua, le = _du_lieu(client, h)
    gc = _chi(client, h, 2_000_000, sua)
    db = SessionLocal()
    try:
        v = db.get(PaymentVoucher, gc["id"])
        v.source_type, v.muc_thu_chi_id = "gia_cong_ngoai", None
        db.commit()
    finally:
        db.close()
    bc = client.get(URL, params=_ky(), headers=h).json()
    dong = {(d["ben"], d["ten"]): d for d in bc["dong"]}
    cd = dong[("chi", "Thuê gia công ngoài")]
    assert cd["cong"] == 2_000_000 and cd["muc_id"] == -2 and cd["chua"] is False
    assert dong[("chi", "Chưa phân loại")]["cong"] == 200_000
    # Lọc theo mục cố định.
    r = client.get(URL, params={**_ky(), "muc": [-2]}, headers=h)
    assert [d["ten"] for d in r.json()["dong"]] == ["Thuê gia công ngoài"]
    # Chuyển mục bỏ qua phiếu sinh từ nghiệp vụ.
    r = client.post(f"{URL}/chuyen-muc", json={"phieu_chi_ids": [gc["id"]], "muc_id": sua}, headers=h)
    assert r.status_code == 200 and r.json()["so_phieu"] == 0, r.text


def test_xuat_excel(client):
    h = _headers(client)
    _du_lieu(client, h)
    r = client.get(f"{URL}/export.xlsx", params=_ky(), headers=h)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert r.content[:2] == b"PK"
