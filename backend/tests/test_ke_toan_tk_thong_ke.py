"""Thu/chi theo từng tài khoản ngân hàng công ty TRONG KỲ — số trên thẻ tài khoản ở màn Tài khoản.

Chỉ tính phiếu ĐÃ chi / ĐÃ thu (không đếm phiếu huỷ), theo NGÀY CHỨNG TỪ (`voucher_date` /
`receipt_date`). Ngày lấy từ `accounting_service._business_today()` (đồng hồ xưởng), không dùng
`date.today()` vì runner CI chạy UTC.
"""
from __future__ import annotations

from datetime import timedelta

from app.services import accounting_service
from tests.test_payables_api import _token_vai

URL = "/api/accounting/company-bank-accounts/thong-ke"
URL_PC = "/api/accounting/payment-vouchers"
URL_PT = "/api/accounting/payment-receipts"


def _hom_nay():
    return accounting_service._business_today()


def _headers(client) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _tai_khoan(client, h, *, so_tk="111222333") -> dict:
    r = client.post(
        "/api/accounting/company-bank-accounts",
        json={
            "account_holder": "CÔNG TY SAO VIỆT NHẬT",
            "account_number": so_tk,
            "bank_name": "Vietcombank",
            "bank_branch": "Hà Nội",
            "currency": "VND",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _lap_phieu_chi(client, h, *, so_tien, tai_khoan_id, ngay=None):
    """Phiếu chi chuyển khoản qua một tài khoản công ty (chi phí nội bộ) — lập ra là ĐÃ CHI."""
    r = client.post(
        URL_PC,
        json={
            "source_type": "internal_expense",
            "voucher_type": "bank_transfer",
            "payment_stage": "other",
            "voucher_date": (ngay or _hom_nay()).isoformat(),
            "amount": so_tien,
            "currency": "VND",
            "exchange_rate": 1,
            "content": "Chi phí văn phòng",
            "company_bank_account_id": tai_khoan_id,
            "cash_recipient_name": "Nguyễn Văn Nhận",
            "beneficiary_account_holder": "CÔNG TY NHẬN",
            "beneficiary_account_number": "987654321",
            "beneficiary_bank_name": "BIDV",
            "beneficiary_bank_branch": "Hà Nội",
            "bank_fee_bearer": "payer",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _lap_phieu_thu(client, h, *, so_tien, tai_khoan_id, ngay=None, ma="GD-0001"):
    r = client.post(
        URL_PT,
        json={
            "payer_name": "Nguyễn Văn Nộp",
            "receipt_method": "bank_transfer",
            "receipt_date": (ngay or _hom_nay()).isoformat(),
            "amount": so_tien,
            "content": "Thu khác",
            "company_bank_account_id": tai_khoan_id,
            "bank_reference": ma,
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_thong_ke_tai_khoan_cong_dung_ky(client):
    h = _headers(client)
    tk = _tai_khoan(client, h)
    hn = _hom_nay()
    _lap_phieu_chi(client, h, so_tien=2_000_000, tai_khoan_id=tk["id"], ngay=hn)
    _lap_phieu_chi(client, h, so_tien=9_000_000, tai_khoan_id=tk["id"], ngay=hn - timedelta(days=400))
    r = client.get(URL, headers=h, params={"tu_ngay": hn.replace(day=1).isoformat(),
                                           "den_ngay": hn.isoformat()})
    assert r.status_code == 200, r.text
    dong = next(x for x in r.json() if x["tai_khoan_id"] == tk["id"])
    assert dong == {"tai_khoan_id": tk["id"], "thu": 0, "chi": 2_000_000, "so_phieu": 1}


def test_thong_ke_tai_khoan_gop_thu_chi_va_bo_phieu_huy(client):
    h = _headers(client)
    tk = _tai_khoan(client, h, so_tk="444555666")
    khac = _tai_khoan(client, h, so_tk="777888999")
    hn = _hom_nay()
    _lap_phieu_chi(client, h, so_tien=1_000_000, tai_khoan_id=tk["id"], ngay=hn)
    _lap_phieu_chi(client, h, so_tien=500_000, tai_khoan_id=tk["id"], ngay=hn)
    huy = _lap_phieu_chi(client, h, so_tien=7_000_000, tai_khoan_id=tk["id"], ngay=hn)
    assert client.post(f"{URL_PC}/{huy['id']}/cancel", json={"reason": "Lập nhầm"},
                       headers=h).status_code == 200
    _lap_phieu_thu(client, h, so_tien=3_000_000, tai_khoan_id=tk["id"], ngay=hn)
    r = client.get(URL, headers=h, params={"tu_ngay": hn.isoformat(), "den_ngay": hn.isoformat()})
    assert r.status_code == 200, r.text
    ids = [x["tai_khoan_id"] for x in r.json()]
    assert khac["id"] not in ids                       # tài khoản không có phiếu trong kỳ thì vắng mặt
    dong = next(x for x in r.json() if x["tai_khoan_id"] == tk["id"])
    assert dong == {"tai_khoan_id": tk["id"], "thu": 3_000_000, "chi": 1_500_000, "so_phieu": 3}


def test_thong_ke_tai_khoan_khoang_ngay_nguoc_bi_chan(client):
    h = _headers(client)
    hn = _hom_nay()
    r = client.get(URL, headers=h, params={"tu_ngay": hn.isoformat(),
                                           "den_ngay": (hn - timedelta(days=1)).isoformat()})
    assert r.status_code == 422


def test_thong_ke_tai_khoan_bat_buoc_ca_hai_ngay(client):
    h = _headers(client)
    assert client.get(URL, headers=h).status_code == 422
    assert client.get(URL, headers=h, params={"tu_ngay": _hom_nay().isoformat()}).status_code == 422


def test_thong_ke_thu_quy_chi_co_quyen_xem_tai_khoan(client):
    """Vai chỉ có `tk_ngan_hang:read` xem được số theo tài khoản (200); vai không có quyền ⇒ 403."""
    hn = _hom_nay()
    params = {"tu_ngay": hn.isoformat(), "den_ngay": hn.isoformat()}
    co = _token_vai("tk-chi-xem", module="tk_ngan_hang", can_read=True)
    r = client.get(URL, headers={"Authorization": f"Bearer {co}"}, params=params)
    assert r.status_code == 200, r.text
    khong = _token_vai("tk-khong-quyen", module="ke_toan", can_read=True)
    r2 = client.get(URL, headers={"Authorization": f"Bearer {khong}"}, params=params)
    assert r2.status_code == 403
