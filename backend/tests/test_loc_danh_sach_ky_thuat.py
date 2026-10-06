"""Thanh lọc chung (kỳ + điều kiện) của Kỹ thuật máy — Phiếu sửa chữa, Yêu cầu báo hỏng, Phiếu bảo
trì chế độ Bảng (06/10/2026). Lọc và đếm tab ở máy chủ; ranh ngày theo giờ VN.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.ky_thuat_may import BaoTriMay, SuaChuaMay, YeuCauSuaChua

from .test_ky_thuat_may import _headers

VN = timezone(timedelta(hours=7))
SC = "/api/ky-thuat-may/sua-chua"
YC = "/api/ky-thuat-may/yeu-cau"
BT = "/api/ky-thuat-may/bao-tri"


def _utc(*a) -> datetime:
    return datetime(*a, tzinfo=timezone.utc)


def _dat(model, id_: int, **cot) -> None:
    db = SessionLocal()
    try:
        obj = db.get(model, id_)
        for k, v in cot.items():
            setattr(obj, k, v)
        db.commit()
    finally:
        db.close()


def _may(client, h, ma: str) -> int:
    r = client.post("/api/may-thiet-bi", json={"ma": ma, "ten": f"Máy {ma}", "loai_may": "Bế"},
                    headers=h)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _sc(client, h, may_id: int, *, muc_do="trung_binh") -> dict:
    r = client.post(SC, json={"may_id": may_id, "bo_phan_hong": "Trục", "muc_do": muc_do}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _yc(client, h, may_id: int, *, muc_do="trung_binh") -> dict:
    r = client.post(YC, json={"may_id": may_id, "bo_phan_hong": "Dao", "muc_do": muc_do}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _bt(client, h, may_id: int, ngay: str) -> dict:
    r = client.post(BT, json={"may_id": may_id, "loai": "dot_xuat", "ngay_ke_hoach": ngay}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


THANG_10 = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31"}


# --- Phiếu sửa chữa -----------------------------------------------------------------------------

def test_sua_chua_loc_ngay_tao_ranh_gio_vn_va_dem_tab(client):
    h = _headers(client)
    m = _may(client, h, "SC-LOC-1")
    a, b = _sc(client, h, m), _sc(client, h, m)
    # 30/09 17:30 UTC = 01/10 00:30 giờ VN ⇒ THUỘC tháng 10; 16:30 UTC = 30/09 23:30 VN ⇒ ngoài.
    _dat(SuaChuaMay, a["id"], created_at=_utc(2026, 9, 30, 17, 30))
    _dat(SuaChuaMay, b["id"], created_at=_utc(2026, 9, 30, 16, 30))
    r = client.get(SC, params={**THANG_10, "moc": "tao", "size": 50}, headers=h).json()
    assert [x["ma"] for x in r["items"]] == [a["ma"]]
    assert r["dem"] == {"cho_sua": 1}
    assert r["items"][0]["created_at"]


def test_sua_chua_moc_thoi_diem_va_xong(client):
    h = _headers(client)
    m = _may(client, h, "SC-LOC-2")
    a, b = _sc(client, h, m), _sc(client, h, m)
    _dat(SuaChuaMay, a["id"], thoi_diem=_utc(2026, 10, 5, 3), hoan_thanh_at=None)
    _dat(SuaChuaMay, b["id"], thoi_diem=_utc(2026, 8, 5, 3), hoan_thanh_at=_utc(2026, 10, 9, 3))
    hong = client.get(SC, params={**THANG_10, "moc": "thoi_diem"}, headers=h).json()
    assert [x["id"] for x in hong["items"]] == [a["id"]]
    xong = client.get(SC, params={**THANG_10, "moc": "xong"}, headers=h).json()
    assert [x["id"] for x in xong["items"]] == [b["id"]]
    assert client.get(SC, params={"moc": "la"}, headers=h).status_code == 422


def test_sua_chua_loc_may_va_nhieu_muc_do(client):
    h = _headers(client)
    m1, m2 = _may(client, h, "SC-LOC-3"), _may(client, h, "SC-LOC-4")
    _sc(client, h, m1, muc_do="nhe")
    _sc(client, h, m1, muc_do="nghiem_trong")
    _sc(client, h, m2, muc_do="trung_binh")
    r = client.get(SC, params={"muc_do": "nhe,trung_binh"}, headers=h).json()
    assert sorted(x["muc_do"] for x in r["items"]) == ["nhe", "trung_binh"]
    assert r["dem"]["cho_sua"] == 2
    r = client.get(SC, params={"may_id": m1, "muc_do": "nghiem_trong"}, headers=h).json()
    assert r["total"] == 1
    may = {x["id"]: x for x in client.get(f"{SC}/loc-may", headers=h).json()}
    assert may[m1]["so"] == 2 and may[m2]["so"] == 1
    assert may[m1]["ten"] == "SC-LOC-3 Máy SC-LOC-3"


# --- Yêu cầu báo hỏng ---------------------------------------------------------------------------

def test_yeu_cau_loc_ky_muc_do_va_dem_tab(client):
    h = _headers(client)
    m = _may(client, h, "YC-LOC-1")
    a = _yc(client, h, m, muc_do="nghiem_trong")
    b = _yc(client, h, m, muc_do="nhe")
    c = _yc(client, h, m, muc_do="nghiem_trong")
    _dat(YeuCauSuaChua, a["id"], created_at=_utc(2026, 9, 30, 17, 30))
    _dat(YeuCauSuaChua, b["id"], created_at=_utc(2026, 10, 3, 3))
    _dat(YeuCauSuaChua, c["id"], created_at=_utc(2026, 9, 30, 16, 30))
    r = client.get(YC, params={**THANG_10, "moc": "tao"}, headers=h).json()
    assert {x["id"] for x in r["items"]} == {a["id"], b["id"]}
    assert r["dem"] == {"cho_tiep_nhan": 2}
    r = client.get(YC, params={**THANG_10, "moc": "tao", "muc_do": "nghiem_trong"}, headers=h).json()
    assert [x["id"] for x in r["items"]] == [a["id"]]
    # "Của tôi" vẫn chạy chung với thanh lọc.
    r = client.get(YC, params={"cua_toi": 1, "may_id": m}, headers=h).json()
    assert r["total"] == 3
    may = {x["id"]: x["so"] for x in client.get(f"{YC}/loc-may", headers=h).json()}
    assert may[m] == 3


def test_yeu_cau_moc_xu_ly(client):
    h = _headers(client)
    m = _may(client, h, "YC-LOC-2")
    a, b = _yc(client, h, m), _yc(client, h, m)
    _dat(YeuCauSuaChua, a["id"], xu_ly_at=_utc(2026, 10, 2, 3))
    r = client.get(YC, params={**THANG_10, "moc": "xong"}, headers=h).json()
    assert [x["id"] for x in r["items"]] == [a["id"]]


# --- Phiếu bảo trì (chế độ Bảng) ----------------------------------------------------------------

def test_bao_tri_moc_mac_dinh_la_ngay_ke_hoach(client):
    h = _headers(client)
    m = _may(client, h, "BT-LOC-1")
    a = _bt(client, h, m, "2026-10-15")
    b = _bt(client, h, m, "2026-09-30")
    # Ngày tạo của b rơi vào tháng 10 — mốc mặc định vẫn là kế hoạch nên b ngoài.
    _dat(BaoTriMay, b["id"], created_at=_utc(2026, 10, 2, 3))
    _dat(BaoTriMay, a["id"], created_at=_utc(2026, 9, 2, 3))
    r = client.get(BT, params=THANG_10, headers=h).json()
    assert [x["id"] for x in r["items"]] == [a["id"]]
    assert r["dem"]["cho_thuc_hien"] == 1
    r = client.get(BT, params={**THANG_10, "moc": "tao"}, headers=h).json()
    assert [x["id"] for x in r["items"]] == [b["id"]]
    assert r["items"][0]["created_at"]


def test_bao_tri_moc_hoan_thanh_va_loai(client):
    h = _headers(client)
    m = _may(client, h, "BT-LOC-2")
    a = _bt(client, h, m, "2026-09-10")
    b = _bt(client, h, m, "2026-09-11")
    _dat(BaoTriMay, a["id"], trang_thai="hoan_thanh", ngay_hoan_thanh=date(2026, 10, 1))
    r = client.get(BT, params={**THANG_10, "moc": "hoan_thanh"}, headers=h).json()
    assert [x["id"] for x in r["items"]] == [a["id"]]
    assert r["dem"].get("hoan_thanh") == 1 and r["dem"].get("cho_thuc_hien", 0) == 0
    assert client.get(BT, params={"loai": "dinh_ky", "may_id": m}, headers=h).json()["total"] == 0
    assert client.get(BT, params={"loai": "dot_xuat", "may_id": m}, headers=h).json()["total"] == 2
    may = {x["id"]: x["so"] for x in client.get(f"{BT}/loc-may", headers=h).json()}
    assert may[m] == 2
    assert b["id"]


def test_bao_tri_tab_qua_han_dem_theo_bo_loc(client):
    h = _headers(client)
    m1, m2 = _may(client, h, "BT-LOC-3"), _may(client, h, "BT-LOC-4")
    from app.services.ky_thuat_may_service import hom_nay_vn
    hom_qua = str(hom_nay_vn() - timedelta(days=1))
    _bt(client, h, m1, hom_qua)
    _bt(client, h, m2, hom_qua)
    r = client.get(BT, params={"may_id": m1, "trang_thai": "qua_han"}, headers=h).json()
    assert r["total"] == 1 and r["dem"]["qua_han"] == 1
