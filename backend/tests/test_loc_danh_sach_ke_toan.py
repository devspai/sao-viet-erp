"""Thanh lọc chung (`ThanhLoc`) ở các màn Kế toán — 06/10/2026.

Luật: kỳ gửi `tu_ngay/den_ngay/moc`; lọc + đếm tab ở máy chủ; ranh ngày theo giờ Việt Nam.
- Đơn mua hàng (hộp Kế toán): mốc `tao` (Ngày tạo) / `can` (Ngày cần), `dem_theo_tab` đếm sau lọc,
  trước lọc trạng thái; ô "Nhà cung cấp" lấy từ `/inbox/loc-ncc`.
- Phiếu chi / Phiếu thu: mốc `tao` (ngày lập phiếu) bên cạnh mốc chứng từ cũ (`chi` / `thu`, mặc định).
- Tài khoản ngân hàng: lọc theo ngân hàng + trạng thái.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.accounting import PaymentReceipt, PaymentVoucher
from app.models.purchase import PurchaseRequest

from .test_ke_toan_loc_ky_phieu import _headers, _lap_phieu_chi, _lap_phieu_thu_khac
from .test_purchases_api import _create_purchase_request, _supplier

URL_INBOX = "/api/accounting/inbox"
VN = timezone(timedelta(hours=7))


def _utc(*a) -> datetime:
    """Mốc UTC không múi — SQLite cất chuỗi không múi, ứng dụng ghi UTC."""
    return datetime(*a)


def _dat(model, id_: int, **cot) -> None:
    db = SessionLocal()
    try:
        obj = db.get(model, id_)
        for k, v in cot.items():
            setattr(obj, k, v)
        db.commit()
    finally:
        db.close()


def _pmh(client, h, supplier_id: int, *, gui: bool = True) -> dict:
    pmh = _create_purchase_request(client, h, supplier_id)
    if gui:
        r = client.post(f"/api/purchase-requests/{pmh['id']}/submit", headers=h)
        assert r.status_code == 200, r.text
    return pmh


def _ma(r) -> list[str]:
    assert r.status_code == 200, r.text
    return sorted(i["code"] for i in r.json()["items"])


# --- Đơn mua hàng (hộp Kế toán) -----------------------------------------------------------------

def test_inbox_loc_ngay_tao_ranh_gio_vn_va_dem_theo_tab(client):
    h = _headers(client)
    ncc = _supplier(client, h, name="NCC Loc Ky Ke Toan")
    a = _pmh(client, h, ncc["id"])
    b = _pmh(client, h, ncc["id"])
    c = _pmh(client, h, ncc["id"])
    # 30/09 17:30 UTC = 01/10 00:30 giờ VN ⇒ THUỘC tháng 10; 16:30 UTC = 30/09 23:30 VN ⇒ ngoài.
    _dat(PurchaseRequest, a["id"], created_at=_utc(2026, 9, 30, 17, 30))
    _dat(PurchaseRequest, b["id"], created_at=_utc(2026, 9, 30, 16, 30))
    _dat(PurchaseRequest, c["id"], created_at=_utc(2026, 10, 15, 3, 0))
    r = client.post(f"/api/purchase-requests/{c['id']}/approve", headers=h)
    assert r.status_code == 200, r.text

    ky = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31", "moc": "tao"}
    assert _ma(client.get(URL_INBOX, params=ky, headers=h)) == sorted([a["code"], c["code"]])

    dem = client.get(URL_INBOX, params={**ky, "status": "approved"}, headers=h).json()
    assert dem["total"] == 1
    # Số tab đếm SAU kỳ, TRƯỚC trạng thái: chọn tab nào thì số các tab khác vẫn nguyên.
    assert dem["dem_theo_tab"]["tat_ca"] == 2
    assert dem["dem_theo_tab"]["pending_approval"] == 1
    assert dem["dem_theo_tab"]["approved"] == 1
    assert "draft" not in dem["dem_theo_tab"]


def test_inbox_loc_theo_ngay_can_va_ncc(client):
    h = _headers(client)
    ncc1 = _supplier(client, h, name="NCC Mot Ke Toan")
    ncc2 = _supplier(client, h, name="NCC Hai Ke Toan")
    a = _pmh(client, h, ncc1["id"])
    b = _pmh(client, h, ncc2["id"])
    _dat(PurchaseRequest, a["id"], needed_date=date(2026, 11, 5))
    _dat(PurchaseRequest, b["id"], needed_date=date(2026, 12, 5))

    ky_can = {"tu_ngay": "2026-11-01", "den_ngay": "2026-11-30", "moc": "can"}
    assert _ma(client.get(URL_INBOX, params=ky_can, headers=h)) == [a["code"]]
    assert _ma(client.get(URL_INBOX, params={"supplier_id": ncc2["id"]}, headers=h)) == [b["code"]]

    # Ô "Nhà cung cấp": NCC đang có đơn trong hộp, kèm số đơn.
    ds = {o["id"]: o for o in client.get(f"{URL_INBOX}/loc-ncc", headers=h).json()}
    assert ds[ncc1["id"]]["so"] == 1 and ds[ncc1["id"]]["ten"] == "NCC Mot Ke Toan"
    assert ds[ncc2["id"]]["so"] == 1


def test_inbox_bo_tham_so_ngay_cu(client):
    """`created_from/needed_from` đã thay bằng `tu_ngay/den_ngay/moc` — mốc lạ bị chặn."""
    h = _headers(client)
    assert client.get(URL_INBOX, params={"moc": "xyz"}, headers=h).status_code == 422
    r = client.get(URL_INBOX, params={"tu_ngay": "2026-10-31", "den_ngay": "2026-10-01"}, headers=h)
    assert r.status_code == 422


# --- Phiếu chi / Phiếu thu: mốc Ngày tạo ---------------------------------------------------------

def test_phieu_chi_ky_theo_ngay_tao(client):
    h = _headers(client)
    a = _lap_phieu_chi(client, h, so_tien=1_000_000, ngay=date(2026, 9, 20))
    b = _lap_phieu_chi(client, h, so_tien=2_000_000, ngay=date(2026, 10, 2))
    _dat(PaymentVoucher, a["id"], created_at=_utc(2026, 9, 30, 17, 30))  # 01/10 VN
    _dat(PaymentVoucher, b["id"], created_at=_utc(2026, 9, 30, 16, 30))  # 30/09 VN
    ky = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31"}
    url = "/api/accounting/payment-vouchers"
    assert _ma(client.get(url, params={**ky, "moc": "tao"}, headers=h)) == [a["code"]]
    # Mặc định (và `chi`) vẫn theo ngày chi trên chứng từ — các nơi gọi cũ không đổi nghĩa.
    assert _ma(client.get(url, params=ky, headers=h)) == [b["code"]]
    assert _ma(client.get(url, params={**ky, "moc": "chi"}, headers=h)) == [b["code"]]
    assert client.get(url, params={"moc": "thu"}, headers=h).status_code == 422


def test_phieu_thu_ky_theo_ngay_tao(client):
    h = _headers(client)
    a = _lap_phieu_thu_khac(client, h, so_tien=1_000_000, ngay=date(2026, 9, 20))
    b = _lap_phieu_thu_khac(client, h, so_tien=2_000_000, ngay=date(2026, 10, 2))
    _dat(PaymentReceipt, a["id"], created_at=_utc(2026, 9, 30, 17, 30))
    _dat(PaymentReceipt, b["id"], created_at=_utc(2026, 9, 30, 16, 30))
    ky = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31"}
    url = "/api/accounting/payment-receipts"
    tao = client.get(url, params={**ky, "moc": "tao"}, headers=h).json()
    assert sorted(i["code"] for i in tao["items"]) == [a["code"]]
    # Số trên thẻ lọc đi cùng mốc.
    assert tao["the_loc"]["tat_ca"] == 1
    assert _ma(client.get(url, params=ky, headers=h)) == [b["code"]]


# --- Tài khoản ngân hàng ------------------------------------------------------------------------

def _tk(client, h, *, so: str, ngan_hang: str) -> dict:
    r = client.post(
        "/api/accounting/company-bank-accounts",
        json={"account_holder": "CÔNG TY SAO VIỆT NHẬT", "account_number": so, "bank_name": ngan_hang,
              "bank_branch": "Hà Nội", "currency": "VND"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_tai_khoan_loc_ngan_hang_va_trang_thai(client):
    h = _headers(client)
    a = _tk(client, h, so="1001", ngan_hang="Vietcombank")
    b = _tk(client, h, so="1002", ngan_hang="Techcombank")
    c = _tk(client, h, so="1003", ngan_hang="Vietcombank")
    r = client.patch(f"/api/accounting/company-bank-accounts/{c['id']}/toggle-active", headers=h)
    assert r.status_code == 200, r.text

    url = "/api/accounting/company-bank-accounts"

    def ids(params):
        return {t["id"] for t in client.get(url, params=params, headers=h).json()}

    assert ids({"ngan_hang": "Vietcombank"}) == {a["id"], c["id"]}
    assert ids({"ngan_hang": "Vietcombank", "trang_thai": "dang_dung"}) == {a["id"]}
    assert ids({"trang_thai": "ngung"}) == {c["id"]}
    assert b["id"] in ids({})

    ds = {o["ten"]: o["so"] for o in client.get(f"{url}/loc-ngan-hang", headers=h).json()}
    assert ds["Vietcombank"] == 2 and ds["Techcombank"] == 1
