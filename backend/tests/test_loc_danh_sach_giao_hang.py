"""Kỳ + bộ lọc của màn Giao hàng (06/10/2026) — tab "Yêu cầu giao" và "Đơn giao hàng".

Lọc, đếm, trang hoá ở MÁY CHỦ. Mốc giờ chèn dạng UTC (SQLite cất chuỗi không múi).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from app.db import SessionLocal
from app.models.delivery import DeliveryRequest, DeliveryTrip
from tests.test_giao_hang_api import _admin, _don_da_chot, _len_kh, _tai_xe, _tao_yc

GOC = "/api/giao-hang"


def _dat(model, id_: int, **cot) -> None:
    db = SessionLocal()
    try:
        row = db.get(model, id_)
        for k, v in cot.items():
            setattr(row, k, v)
        db.commit()
    finally:
        db.close()


def _yc(client, h, suffix: str, **kw) -> dict:
    oid, lid = _don_da_chot(suffix=suffix)
    return _tao_yc(client, h, oid, lid, **kw)


def _cho(client, h, **params) -> dict:
    r = client.get(f"{GOC}/requests", params={"cho_len_ke_hoach": "true", **params}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


# --- Tab Yêu cầu giao --------------------------------------------------------------------------
def test_cho_len_ke_hoach_trang_hoa_o_sql_va_total_khop(client):
    """Yêu cầu đã lên đơn giao hàng KHÔNG hiện; `total` đếm đúng hàng chờ, trang cắt ở SQL."""
    h = _admin(client)
    a = _yc(client, h, "LA")
    b = _yc(client, h, "LB")
    c = _yc(client, h, "LC")
    assert _len_kh(client, h, b["id"], _tai_xe("Tai xe loc B")).status_code == 201

    tat_ca = _cho(client, h)
    assert tat_ca["total"] == 2
    assert {x["code"] for x in tat_ca["items"]} == {a["code"], c["code"]}

    t1 = _cho(client, h, page=1, size=1)
    t2 = _cho(client, h, page=2, size=1)
    assert t1["total"] == t2["total"] == 2
    assert [x["code"] for x in t1["items"] + t2["items"]] == [c["code"], a["code"]]


def test_loc_ngay_tao_ranh_gio_vn(client):
    h = _admin(client)
    a = _yc(client, h, "TA")
    b = _yc(client, h, "TB")
    # 30/09 17:30 UTC = 01/10 00:30 giờ VN ⇒ THUỘC tháng 10; 16:30 UTC = 30/09 23:30 VN ⇒ ngoài.
    _dat(DeliveryRequest, a["id"], created_at=datetime(2026, 9, 30, 17, 30))
    _dat(DeliveryRequest, b["id"], created_at=datetime(2026, 9, 30, 16, 30))
    r = _cho(client, h, tu_ngay="2026-10-01", den_ngay="2026-10-31", moc="tao")
    assert [x["code"] for x in r["items"]] == [a["code"]]
    assert r["total"] == 1


def test_loc_ngay_can_giao(client):
    h = _admin(client)
    a = _yc(client, h, "CA", ngay=date.today() + timedelta(days=2))
    _yc(client, h, "CB", ngay=date.today() + timedelta(days=20))
    den = (date.today() + timedelta(days=5)).isoformat()
    r = _cho(client, h, tu_ngay=date.today().isoformat(), den_ngay=den, moc="can")
    assert [x["code"] for x in r["items"]] == [a["code"]]


def test_loc_khach_don_va_o_tim(client):
    h = _admin(client)
    a = _yc(client, h, "KA")
    b = _yc(client, h, "KB")

    r = _cho(client, h, khach=a["customer_id"])
    assert [x["code"] for x in r["items"]] == [a["code"]]
    r = _cho(client, h, order_id=b["order_id"])
    assert [x["code"] for x in r["items"]] == [b["code"]] and r["total"] == 1
    # Ô tìm: mã đơn, tên khách, mã yêu cầu.
    assert [x["code"] for x in _cho(client, h, q="dh-gh-kb")["items"]] == [b["code"]]
    assert [x["code"] for x in _cho(client, h, q="khach giao hang KA")["items"]] == [a["code"]]
    assert [x["code"] for x in _cho(client, h, q=a["code"])["items"]] == [a["code"]]

    khach = client.get(f"{GOC}/requests/loc-khach", headers=h).json()
    assert {(x["id"], x["so"]) for x in khach} == {(a["customer_id"], 1), (b["customer_id"], 1)}
    don = client.get(f"{GOC}/requests/loc-don", headers=h).json()
    assert {x["ten"] for x in don} == {"DH-GH-KA", "DH-GH-KB"}


def test_lua_chon_chi_dem_yeu_cau_dang_cho(client):
    h = _admin(client)
    a = _yc(client, h, "DA")
    _yc(client, h, "DB")
    assert _len_kh(client, h, a["id"], _tai_xe("Tai xe loc DA")).status_code == 201
    don = client.get(f"{GOC}/requests/loc-don", headers=h).json()
    assert [x["ten"] for x in don] == ["DH-GH-DB"]


def test_order_id_khong_kem_cho_van_lay_tron(client):
    """Drawer đơn / màn Tạo yêu cầu (chỉ `order_id`) vẫn nhận MỌI yêu cầu của đơn, kể cả đã lên đơn."""
    h = _admin(client)
    oid, lid = _don_da_chot(suffix="OT")
    a = _tao_yc(client, h, oid, lid, qty=30)
    _tao_yc(client, h, oid, lid, qty=30)
    assert _len_kh(client, h, a["id"], _tai_xe("Tai xe loc OT")).status_code == 201
    r = client.get(f"{GOC}/requests", params={"order_id": oid}, headers=h).json()
    assert r["total"] == 2 and len(r["items"]) == 2


# --- Tab Đơn giao hàng -------------------------------------------------------------------------
def _bang(client, h, **params) -> dict:
    r = client.get(f"{GOC}/bang-giao", params=params, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _ma_chuyen(page: dict) -> set[str]:
    ra: set[str] = set()
    for k in page["items"]:
        if k["trip"]:
            ra.add(k["trip"]["request_code"])
        else:
            ra |= {d["request_code"] for d in k["luot"]["diem"]}
    return ra


def test_bang_giao_loc_tai_xe_trang_thai_moc_va_tim(client):
    h = _admin(client)
    a = _yc(client, h, "BA")
    b = _yc(client, h, "BB")
    tx_a = _tai_xe("Tai xe bang A")
    tx_b = _tai_xe("Tai xe bang B")
    ta = _len_kh(client, h, a["id"], tx_a, ngay=1).json()["trip"]
    tb = _len_kh(client, h, b["id"], tx_b, ngay=1).json()["trip"]

    assert _bang(client, h)["so_don"] == 2
    r = _bang(client, h, tai_xe=tx_a)
    assert _ma_chuyen(r) == {a["code"]} and r["so_don"] == 1 and r["total"] == 1

    _dat(DeliveryTrip, tb["id"], trang_thai="da_huy")
    r = _bang(client, h, trang_thai=["da_huy"])
    assert _ma_chuyen(r) == {b["code"]}
    r = _bang(client, h, trang_thai=["da_len_ke_hoach", "da_huy"])
    assert r["so_don"] == 2

    # Mốc giờ lấy hàng: chuyến A lấy 02/10 01:00 giờ VN (01/10 18:00 UTC), chuyến B ngoài kỳ.
    _dat(DeliveryTrip, ta["id"], gio_lay_hang=datetime(2026, 10, 1, 18, 0),
         gio_du_kien_giao=datetime(2026, 10, 1, 20, 0))
    _dat(DeliveryTrip, tb["id"], gio_lay_hang=datetime(2026, 9, 20, 3, 0),
         gio_du_kien_giao=datetime(2026, 9, 20, 5, 0))
    r = _bang(client, h, tu_ngay="2026-10-02", den_ngay="2026-10-02", moc="lay")
    assert _ma_chuyen(r) == {a["code"]}
    r = _bang(client, h, tu_ngay="2026-09-01", den_ngay="2026-09-30", moc="giao")
    assert _ma_chuyen(r) == {b["code"]}

    assert _ma_chuyen(_bang(client, h, q="DH-GH-BB")) == {b["code"]}

    tai_xe = client.get(f"{GOC}/bang-giao/loc-tai-xe", headers=h).json()
    assert {(x["id"], x["so"]) for x in tai_xe} == {(tx_a, 1), (tx_b, 1)}


def test_bang_giao_loc_xe(client):
    from tests.test_luot_xe import _canh, _len_don

    h, tx, _px, xe = _canh(client)
    t = _len_don(client, h, suffix="XA", tx=tx, xe=xe)
    b = _yc(client, h, "XB")
    assert _len_kh(client, h, b["id"], _tai_xe("Tai xe khong xe")).status_code == 201

    r = _bang(client, h, xe=xe)
    assert _ma_chuyen(r) == {t["request_code"]} and r["so_don"] == 1
    ds_xe = client.get(f"{GOC}/bang-giao/loc-xe", headers=h).json()
    assert [(x["id"], x["ten"], x["so"]) for x in ds_xe] == [(xe, "51D-853.66", 1)]
