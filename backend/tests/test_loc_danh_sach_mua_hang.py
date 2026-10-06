"""Thanh lọc chung (`ThanhLoc`) ở hai màn Thu mua — 06/10/2026.

- Yêu cầu mua hàng (`/api/department-purchase-requests`, cũng là tab "Yêu cầu chờ xử lý" của màn
  Mua hàng): kỳ theo mốc `tao` (Ngày tạo) / `can` (Ngày cần hàng); điều kiện Phòng ban, Người yêu
  cầu, Mặt hàng; `dem_theo_tab` đếm theo trạng thái HIỂN THỊ, sau lọc, trước tab.
- Đơn mua hàng (`/api/purchase-requests`): mốc `tao` / `can` / `nhan` (Ngày dự kiến nhận) thay bộ
  `created_from/needed_from/expected_receipt_from` cũ; điều kiện Nhà cung cấp, Tiền cọc, Tổng tiền;
  `dem_theo_tab`.
"""
from __future__ import annotations

from datetime import date, datetime

from app.db import SessionLocal
from app.models.purchase import (
    DepartmentPurchaseRequest,
    DepartmentPurchaseRequestLine,
    PurchaseRequest,
    PurchaseRequestLine,
)
from app.repositories.rbac_repo import DepartmentRepository

from .test_purchases_api import (  # noqa: F401  (auth_headers/token là fixture, phải import)
    _create_department_request,
    _create_purchase_request,
    _supplier,
    auth_headers,
    token,
)

URL_YC = "/api/department-purchase-requests"
URL_PMH = "/api/purchase-requests"


def _dat(model, id_: int, **cot) -> None:
    db = SessionLocal()
    try:
        obj = db.get(model, id_)
        for k, v in cot.items():
            setattr(obj, k, v)
        db.commit()
    finally:
        db.close()


def _phong(ten: str) -> int:
    db = SessionLocal()
    try:
        return DepartmentRepository(db).get_by_name(ten).id
    finally:
        db.close()


def _ma(r) -> list[str]:
    assert r.status_code == 200, r.text
    return sorted(i["code"] for i in r.json()["items"])


# --- Yêu cầu mua hàng ----------------------------------------------------------------------------

def test_yeu_cau_loc_ngay_tao_ranh_gio_vn(client, auth_headers):
    a = _create_department_request(client, auth_headers)
    b = _create_department_request(client, auth_headers)
    # 30/09 17:30 UTC = 01/10 00:30 giờ VN ⇒ THUỘC tháng 10; 16:30 UTC = 30/09 23:30 VN ⇒ ngoài.
    _dat(DepartmentPurchaseRequest, a["id"], created_at=datetime(2026, 9, 30, 17, 30))
    _dat(DepartmentPurchaseRequest, b["id"], created_at=datetime(2026, 9, 30, 16, 30))
    ky = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31", "moc": "tao"}
    assert _ma(client.get(URL_YC, params=ky, headers=auth_headers)) == [a["code"]]


def test_yeu_cau_loc_ngay_can_va_chan_moc_la(client, auth_headers):
    a = _create_department_request(client, auth_headers)
    b = _create_department_request(client, auth_headers)
    _dat(DepartmentPurchaseRequest, a["id"], needed_date=date(2026, 11, 5))
    _dat(DepartmentPurchaseRequest, b["id"], needed_date=date(2026, 12, 5))
    ky = {"tu_ngay": "2026-11-01", "den_ngay": "2026-11-30", "moc": "can"}
    assert _ma(client.get(URL_YC, params=ky, headers=auth_headers)) == [a["code"]]
    assert client.get(URL_YC, params={"moc": "nhan"}, headers=auth_headers).status_code == 422
    nguoc = {"tu_ngay": "2026-11-30", "den_ngay": "2026-11-01"}
    assert client.get(URL_YC, params=nguoc, headers=auth_headers).status_code == 422


def test_yeu_cau_loc_phong_ban_nguoi_mat_hang_va_o_chon(client, auth_headers):
    a = _create_department_request(client, auth_headers)
    b = _create_department_request(client, auth_headers)
    sx, kd = _phong("Sản xuất"), _phong("Kinh doanh")
    _dat(DepartmentPurchaseRequest, a["id"], requesting_department_id=sx)
    _dat(DepartmentPurchaseRequest, b["id"], requesting_department_id=kd)
    _dat(DepartmentPurchaseRequestLine, a["lines"][0]["id"], hang_loai="giay", hang_id=7)
    _dat(DepartmentPurchaseRequestLine, b["lines"][0]["id"], hang_loai="vat_tu", hang_id=3)

    assert _ma(client.get(URL_YC, params={"phong_ban": sx}, headers=auth_headers)) == [a["code"]]
    assert _ma(client.get(URL_YC, params={"mat_hang": "vat_tu:3"}, headers=auth_headers)) == [b["code"]]
    assert client.get(URL_YC, params={"mat_hang": "giay"}, headers=auth_headers).status_code == 422
    nguoi = a["requested_by_user_id"]
    assert _ma(client.get(URL_YC, params={"nguoi_yeu_cau": nguoi}, headers=auth_headers)) == sorted(
        [a["code"], b["code"]]
    )

    pb = {o["id"]: o for o in client.get(f"{URL_YC}/loc-phong-ban", headers=auth_headers).json()}
    assert pb[sx]["so"] == 1 and pb[sx]["ten"] == "Sản xuất" and pb[kd]["so"] == 1
    ng = client.get(f"{URL_YC}/loc-nguoi-yeu-cau", headers=auth_headers).json()
    assert [(o["id"], o["so"]) for o in ng] == [(nguoi, 2)]
    mh = {o["ma"]: o for o in client.get(f"{URL_YC}/loc-mat-hang", headers=auth_headers).json()}
    assert set(mh) == {"giay:7", "vat_tu:3"} and mh["giay:7"]["so"] == 1


def test_yeu_cau_dem_theo_tab_theo_trang_thai_hien_thi(client, auth_headers):
    ncc = _supplier(client, auth_headers, name="NCC Loc Yeu Cau")
    a = _create_department_request(client, auth_headers)
    _create_department_request(client, auth_headers)
    # Lập đơn mua NHÁP từ `a` ⇒ `a` hiện "Thu mua đang lập đơn"; yêu cầu kia vẫn "Chờ Thu mua xử lý".
    _create_purchase_request(client, auth_headers, ncc["id"], source_ids=[a["id"]])

    r = client.get(URL_YC, params={"status": "drafting"}, headers=auth_headers)
    assert _ma(r) == [a["code"]]
    j = r.json()
    assert j["items"][0]["workflow_status"] == "drafting"
    # Số tab đếm SAU lọc, TRƯỚC trạng thái: đứng ở tab nào thì số các tab khác vẫn nguyên.
    assert j["dem_theo_tab"] == {"tat_ca": 2, "drafting": 1, "open": 1}


# --- Đơn mua hàng --------------------------------------------------------------------------------

def test_don_mua_loc_ky_ba_moc_va_dem_theo_tab(client, auth_headers):
    ncc = _supplier(client, auth_headers, name="NCC Loc Don Mua")
    a = _create_purchase_request(client, auth_headers, ncc["id"])
    b = _create_purchase_request(client, auth_headers, ncc["id"])
    assert client.post(f"{URL_PMH}/{b['id']}/submit", headers=auth_headers).status_code == 200
    _dat(PurchaseRequest, a["id"], created_at=datetime(2026, 9, 30, 17, 30),
         needed_date=date(2026, 11, 5), expected_receipt_date=date(2026, 12, 1))
    _dat(PurchaseRequest, b["id"], created_at=datetime(2026, 9, 30, 16, 30),
         needed_date=date(2026, 12, 5), expected_receipt_date=date(2026, 11, 10))

    tao = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31", "moc": "tao"}
    assert _ma(client.get(URL_PMH, params=tao, headers=auth_headers)) == [a["code"]]
    can = {"tu_ngay": "2026-11-01", "den_ngay": "2026-11-30", "moc": "can"}
    assert _ma(client.get(URL_PMH, params=can, headers=auth_headers)) == [a["code"]]
    nhan = {**can, "moc": "nhan"}
    assert _ma(client.get(URL_PMH, params=nhan, headers=auth_headers)) == [b["code"]]

    r = client.get(URL_PMH, params={"status": "draft"}, headers=auth_headers).json()
    assert r["total"] == 1
    assert r["dem_theo_tab"] == {"tat_ca": 2, "draft": 1, "pending_approval": 1}

    # Tham số ngày cũ đã gỡ; mốc lạ bị chặn.
    assert client.get(URL_PMH, params={"moc": "xyz"}, headers=auth_headers).status_code == 422


def test_don_mua_loc_tong_tien_ncc_coc(client, auth_headers):
    ncc1 = _supplier(client, auth_headers, name="NCC Tong Mot")
    ncc2 = _supplier(client, auth_headers, name="NCC Tong Hai")
    a = _create_purchase_request(client, auth_headers, ncc1["id"])   # 1000×2200 + 5×80000 = 2,6tr
    b = _create_purchase_request(client, auth_headers, ncc2["id"])
    # Đơn b: dòng 1 lên 3000 tờ ⇒ 6,6tr + 0,4tr = 7tr.
    _dat(PurchaseRequestLine, b["lines"][0]["id"], quantity=3000)
    assert a["total_estimate"] == 2_600_000

    def tong(**p):
        return _ma(client.get(URL_PMH, params=p, headers=auth_headers))

    assert tong(tong_tu=2_600_000, tong_den=2_600_000) == [a["code"]]
    assert tong(tong_tu=5_000_000) == [b["code"]]
    assert tong(tong_den=1_000_000) == []
    assert client.get(URL_PMH, params={"tong_tu": 9, "tong_den": 1}, headers=auth_headers).status_code == 422

    assert tong(supplier_id=ncc2["id"]) == [b["code"]]
    assert tong(deposit_status="none") == sorted([a["code"], b["code"]])
    assert client.get(URL_PMH, params={"deposit_status": "xx"}, headers=auth_headers).status_code == 422

    ds = {o["id"]: o for o in client.get(f"{URL_PMH}/loc-ncc", headers=auth_headers).json()}
    assert ds[ncc1["id"]]["so"] == 1 and ds[ncc1["id"]]["ten"] == "NCC Tong Mot"
