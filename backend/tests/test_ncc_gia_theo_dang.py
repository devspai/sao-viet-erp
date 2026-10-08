"""Bảng giá NCC giấy theo DẠNG BÁN (chủ chốt 07/10/2026): tờ + khổ so đ/tờ, cuộn so đ/kg.

Vì sao: NCC báo giá giấy tờ (theo ram, khổ 65×87) và giấy cuộn (theo tấn) khác nhau. Trước đây
mọi dòng giấy quy về kg, nên dòng đơn đếm tờ bị điền giá một kg. Nay mỗi dòng giá giấy ghi dạng;
so giá chỉ so cùng dạng, tờ chỉ so cùng khổ. Máy không quy tờ ↔ kg.
"""
from __future__ import annotations

from itertools import count

import pytest

from app.db import SessionLocal
from app.models.don_vi_do import DonViDo, DonViQuyDoi
from app.models.vat_lieu_kho import GiayNguyen

ADMIN = {"username": "admin", "password": "admin123"}
_dem_mst = count(1)


def _h(client) -> dict[str, str]:
    r = client.post("/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def giay_id() -> int:
    """Đơn vị to/ram/kg/tan + cặp ram→tờ 500, tấn→kg 1000; một mã giấy giá theo kg."""
    db = SessionLocal()
    try:
        def lay(ma, ten, ho):
            d = db.query(DonViDo).filter(DonViDo.ma == ma).first()
            if d is None:
                d = DonViDo(ma=ma, ten=ten, ho=ho)
                db.add(d)
                db.flush()
            return d

        to, ram = lay("to", "tờ", "to"), lay("ram", "ram", "to")
        kg, tan = lay("kg", "kg", "khoi_luong"), lay("tan", "tấn", "khoi_luong")
        for tu, den, hs in ((ram, to, 500), (tan, kg, 1000)):
            if not db.query(DonViQuyDoi).filter(
                    DonViQuyDoi.tu_id == tu.id, DonViQuyDoi.den_id == den.id).first():
                db.add(DonViQuyDoi(tu_id=tu.id, den_id=den.id, he_so=hs))
        g = GiayNguyen(ma="C80-NCC", ten="COUCHE 80GSM", gsm=80, don_vi_gia="kg")
        db.add(g)
        db.commit()
        return g.id
    finally:
        db.close()


def _ncc(client, h, ten: str, items: list[dict]):
    mst = f"02{next(_dem_mst):08d}"
    return client.post("/api/suppliers", headers=h, json={
        "name": ten, "tax_code": mst, "phone": "0900000000",
        "email": f"{next(_dem_mst)}@x.vn", "address": "HN",
        "contact_name": "A", "supplier_group": "giay", "items": items,
    })


def _dong(gid, **kw) -> dict:
    return {"hang_loai": "giay", "hang_id": gid, "item_name": "COUCHE 80GSM",
            "vat_percent": 8, **kw}


def test_dong_to_luu_kho_va_quy_ve_gia_mot_to(client, giay_id):
    h = _h(client)
    r = _ncc(client, h, "Tân Mai", [
        _dong(giay_id, dang_ban="to", kho_rong=870, kho_dai=650, unit="ram", unit_price=520_000),
        _dong(giay_id, dang_ban="cuon", unit="tan", unit_price=22_600_000),
    ])
    assert r.status_code == 201, r.text
    items = {i["dang_ban"]: i for i in r.json()["items"]}
    assert (items["to"]["kho_rong"], items["to"]["kho_dai"]) == (650, 870)   # cạnh ngắn trước
    assert items["to"]["gia_quy_doi"] == 1040                               # 520.000 ÷ 500 tờ
    assert items["cuon"]["gia_quy_doi"] == 22600                            # 22.600.000 ÷ 1.000 kg
    assert (items["cuon"]["kho_rong"], items["cuon"]["kho_dai"]) == (0, 0)


def test_dong_to_khong_nhan_don_vi_kg_dong_cuon_khong_nhan_ram(client, giay_id):
    h = _h(client)
    r = _ncc(client, h, "X1", [_dong(giay_id, dang_ban="to", kho_rong=650, kho_dai=870,
                                     unit="kg", unit_price=1)])
    assert r.status_code in (400, 422), r.text
    r = _ncc(client, h, "X2", [_dong(giay_id, dang_ban="cuon", unit="ram", unit_price=1)])
    assert r.status_code in (400, 422), r.text


def test_giay_bat_buoc_dang_ban_va_to_du_hai_canh(client, giay_id):
    h = _h(client)
    r = _ncc(client, h, "A", [_dong(giay_id, unit="kg", unit_price=1)])
    assert r.status_code in (400, 422), r.text
    r = _ncc(client, h, "B", [_dong(giay_id, dang_ban="to", kho_rong=650, unit="to",
                                    unit_price=1)])
    assert r.status_code in (400, 422), r.text


def test_so_gia_chi_so_cung_dang_cung_kho(client, giay_id):
    h = _h(client)
    assert _ncc(client, h, "Tân Mai", [
        _dong(giay_id, dang_ban="to", kho_rong=650, kho_dai=870, unit="ram", unit_price=520_000),
    ]).status_code == 201
    assert _ncc(client, h, "An Phát", [
        _dong(giay_id, dang_ban="to", kho_rong=650, kho_dai=870, unit="to", unit_price=1_080),
        _dong(giay_id, dang_ban="to", kho_rong=790, kho_dai=1090, unit="to", unit_price=900),
    ]).status_code == 201
    assert _ncc(client, h, "Việt Trì", [
        _dong(giay_id, dang_ban="cuon", unit="kg", unit_price=21_000),
    ]).status_code == 201

    r = client.get("/api/supplier-items/so-gia", headers=h, params={
        "hang_loai": "giay", "hang_id": giay_id, "dang": "to", "kho_rong": 870, "kho_dai": 650})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["don_vi_goc"] == "to"
    assert [x["supplier_name"] for x in body["items"]] == ["Tân Mai", "An Phát"]
    assert [x["gia_quy_doi"] for x in body["items"]] == [1040, 1080]
    assert all((x["dang_ban"], x["kho_rong"], x["kho_dai"]) == ("to", 650, 870)
               for x in body["items"])

    r = client.get("/api/supplier-items/so-gia", headers=h, params={
        "hang_loai": "giay", "hang_id": giay_id, "dang": "cuon"})
    body = r.json()
    assert body["don_vi_goc"] == "kg"
    assert [(x["supplier_name"], x["gia_quy_doi"]) for x in body["items"]] == [("Việt Trì", 21000)]

    # Không gửi dạng: mọi dòng, mỗi dòng quy theo dạng của chính nó (không dòng nào bị quy tờ ↔ kg).
    r = client.get("/api/supplier-items/so-gia", headers=h, params={
        "hang_loai": "giay", "hang_id": giay_id})
    assert sorted(x["gia_quy_doi"] for x in r.json()["items"]) == [900, 1040, 1080, 21000]
