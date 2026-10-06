"""Thanh lọc chung (06/10/2026) cho ba bảng điều phối — Theo dõi sản xuất, Kế hoạch vật tư, hàng
chờ Xếp lịch. Luật: lọc + đếm tab ở MÁY CHỦ; kỳ gửi `tu_ngay`/`den_ngay`/`moc` theo giờ VN.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.customer import Customer
from app.models.lsx import TT_SAN_SANG, Lsx
from app.models.order import Order
from app.services.giu_cho_service import GiuChoService
from app.services.ke_hoach_vat_tu_service import KeHoachVatTuService
from tests.lenh_sx_fixtures import (  # noqa: F401
    _h,
    _tok,
    admin,
    customer,
    lenh_that,
    lsx_svc,
    orders,
    sess,
)

ADMIN = {"username": "admin", "password": "admin123"}


def _hd(client) -> dict[str, str]:
    tok = client.post("/api/auth/login", json=ADMIN).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


# --- Theo dõi sản xuất ---------------------------------------------------------------------------

def test_theo_doi_theo_lenh_co_ngay_tao(client, seed_credentials, sess, lenh_that):
    h = _h(_tok(client, seed_credentials))
    d = client.get("/api/theo-doi-san-xuat/theo-lenh", headers=h).json()
    assert [i["lsx_id"] for i in d["items"]] == [lenh_that]
    assert d["items"][0]["created_at"] is not None


# --- Kế hoạch vật tư: theo mặt hàng ---------------------------------------------------------------

def _nhom(ma: str, loai: str, do: int = 0, khong_ro: int = 0) -> dict:
    return {"hang_ma": ma, "hang_loai": loai, "so_dong_do": do, "so_dong_khong_ro": khong_ro}


NHOM = [
    _nhom("G1", "giay", do=2),
    _nhom("G2", "giay", khong_ro=1),
    _nhom("G3", "giay"),
    _nhom("V1", "vat_tu", do=1, khong_ro=1),
    _nhom("V2", "vat_tu"),
]


def test_can_doi_tab_va_loai_hang_loc_o_may_chu():
    ma = lambda ds: [g["hang_ma"] for g in ds]  # noqa: E731
    items, dem = KeHoachVatTuService.loc_hien_thi(NHOM)
    assert ma(items) == ["G1", "G2", "G3", "V1", "V2"]
    assert dem == {"so_nhom": 5, "so_dong_do": 3, "so_dong_khong_ro": 2, "so_nhom_du": 2,
                   "theo_loai": {"giay": 3, "vat_tu": 2}}

    assert ma(KeHoachVatTuService.loc_hien_thi(NHOM, tinh_trang="thieu")[0]) == ["G1", "V1"]
    assert ma(KeHoachVatTuService.loc_hien_thi(NHOM, tinh_trang="khong_ro")[0]) == ["G2", "V1"]
    assert ma(KeHoachVatTuService.loc_hien_thi(NHOM, tinh_trang="du")[0]) == ["G3", "V2"]

    # Số trên tab theo loại hàng đang áp, KHÔNG theo tab đang chọn; `theo_loai` trước loại hàng.
    items, dem = KeHoachVatTuService.loc_hien_thi(NHOM, hang_loai="giay", tinh_trang="thieu")
    assert ma(items) == ["G1"]
    assert dem == {"so_nhom": 3, "so_dong_do": 2, "so_dong_khong_ro": 1, "so_nhom_du": 1,
                   "theo_loai": {"giay": 3, "vat_tu": 2}}


def test_api_can_doi_nhan_tab_va_tra_dem(client):
    h = _hd(client)
    r = client.get("/api/ke-hoach-vat-tu/can-doi",
                   params={"tinh_trang": "thieu", "hang_loai": "giay"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["dem"]["so_nhom"] == 0
    assert client.get("/api/ke-hoach-vat-tu/can-doi", params={"tinh_trang": "la"},
                      headers=h).status_code == 422


# --- Kế hoạch vật tư: theo lệnh -------------------------------------------------------------------

def _the(ma: str, *, bat: bool, du: bool, giu_lau: bool = False) -> dict:
    return {"ma": ma, "bat": bat, "du": du, "giu_lau_chua_chay": giu_lau}


THE = [
    _the("A", bat=True, du=True),
    _the("B", bat=True, du=False, giu_lau=True),
    _the("C", bat=False, du=False),
    _the("D", bat=False, du=False),
]


def test_theo_lenh_tab_giu_cho_loc_o_may_chu():
    ma = lambda ds: [r["ma"] for r in ds]  # noqa: E731
    items, dem = GiuChoService.loc_theo_tab(THE, None)
    assert ma(items) == ["A", "B", "C", "D"]
    assert dem == {"tat_ca": 4, "du": 1, "dang": 1, "tat": 2, "giu_lau": 1}
    assert ma(GiuChoService.loc_theo_tab(THE, "du")[0]) == ["A"]
    assert ma(GiuChoService.loc_theo_tab(THE, "dang")[0]) == ["B"]
    assert ma(GiuChoService.loc_theo_tab(THE, "tat")[0]) == ["C", "D"]
    items, dem = GiuChoService.loc_theo_tab(THE, "giu_lau")
    assert ma(items) == ["B"] and dem["tat_ca"] == 4


def test_api_theo_lenh_tra_dem_theo_tab(client):
    h = _hd(client)
    r = client.get("/api/ke-hoach-vat-tu/theo-lenh", params={"giu": "du"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["dem_theo_tab"] == {"tat_ca": 0, "du": 0, "dang": 0, "tat": 0, "giu_lau": 0}
    assert client.get("/api/ke-hoach-vat-tu/theo-lenh", params={"giu": "la"},
                      headers=h).status_code == 422


# --- Xếp lịch: hàng chờ ---------------------------------------------------------------------------

def _don(ten_khach: str) -> tuple[int, int]:
    db = SessionLocal()
    try:
        c = Customer(code=f"KH-XL-{ten_khach[-1]}", name=ten_khach)
        db.add(c)
        db.flush()
        o = Order(order_no=f"DH-XL-{ten_khach[-1]}", customer_id=c.id)
        db.add(o)
        db.commit()
        return c.id, o.id
    finally:
        db.close()


def _lenh(ma: str, order_id: int, created_at: datetime, han: date | None = None) -> int:
    db = SessionLocal()
    try:
        l = Lsx(ma=ma, ten=f"Lệnh {ma}", order_id=order_id, order_line_id=1,
                trang_thai=TT_SAN_SANG, so_luong_dat=1000, so_to_ke_hoach=10,
                han_hoan_thanh_sx=han, created_at=created_at)
        db.add(l)
        db.commit()
        return l.id
    finally:
        db.close()


def _ma(client, h, **params) -> list[str]:
    r = client.get("/api/xep-lich/hang-cho", params=params, headers=h)
    assert r.status_code == 200, r.text
    return sorted(d["ma"] for d in r.json()["dong"])


def test_hang_cho_ky_ngay_tao_ranh_gio_vn_va_khach(client):
    h = _hd(client)
    k_a, d_a = _don("Khách A")
    k_b, d_b = _don("Khách B")
    # 30/09 17:30 UTC = 01/10 00:30 giờ VN ⇒ THUỘC tháng 10; 16:30 UTC = 30/09 23:30 VN ⇒ ngoài.
    _lenh("XL-A", d_a, datetime(2026, 9, 30, 17, 30, tzinfo=timezone.utc), han=date(2026, 11, 5))
    _lenh("XL-B", d_b, datetime(2026, 9, 30, 16, 30, tzinfo=timezone.utc), han=date(2026, 10, 20))

    thang10 = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31"}
    assert _ma(client, h, **thang10, moc="tao") == ["XL-A"]
    assert _ma(client, h, **thang10, moc="han_sx") == ["XL-B"]
    assert _ma(client, h, khach_id=k_b) == ["XL-B"]
    assert _ma(client, h, khach_id=k_a, **thang10) == ["XL-A"]

    r = client.get("/api/xep-lich/hang-cho", headers=h).json()
    assert r["tong"] == 2 and all(d["created_at"] for d in r["dong"])

    loc = client.get("/api/xep-lich/hang-cho/khach-loc", headers=h).json()
    assert loc == [{"id": k_a, "ten": "Khách A", "so": 1}, {"id": k_b, "ten": "Khách B", "so": 1}]
    loc = client.get("/api/xep-lich/hang-cho/khach-loc", params={**thang10, "moc": "tao"},
                     headers=h).json()
    assert [o["id"] for o in loc] == [k_a]
    assert client.get("/api/xep-lich/hang-cho", params={"moc": "la"}, headers=h).status_code == 422
