"""Bảng giá NCC lưu MÃ đơn vị, kể cả khi người gửi TÊN (27/09/2026).

Trước đó cửa ghi kiểm đơn vị nhận cả tên lẫn mã nhưng lưu nguyên chữ người gửi ("cái"); màn bảng giá
so theo mã nên dòng đó hiện "Quy về gốc" gạch ngang. mg 0341 dọn dữ liệu cũ.
"""
from __future__ import annotations

from sqlalchemy import text

from app.db import SessionLocal
from app.db_migrations import _migrate_don_vi_ncc_ve_ma
from app.models.vat_lieu_kho import GiayNguyen


def _h(client, seed_credentials):
    tok = client.post("/api/auth/login", json=seed_credentials).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def _giay_theo_to() -> int:
    db = SessionLocal()
    try:
        g = GiayNguyen(ma="GY-TO-MA", ten="Giay dem to", gsm=150, kho_dai=860, kho_rong=650,
                       don_vi_gia="to")
        db.add(g)
        db.commit()
        return g.id
    finally:
        db.close()


def _ncc(client, h, gid, unit):
    r = client.post("/api/suppliers", json={
        "name": f"NCC luu ma {unit}", "tax_code": "0355500011" if unit == "tờ" else "0355500012",
        "phone": "0901000001", "email": "ncc@example.com", "address": "HCM", "contact_name": "Lan",
        "supplier_group": "paper", "payment_terms": "30 ngay",
        "items": [{"hang_loai": "giay", "hang_id": gid, "item_name": "Giay dem to", "unit": unit,
                   "dang_ban": "to", "kho_rong": 650, "kho_dai": 860,
                   "unit_price": 900, "vat_percent": 8}],
    }, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_gui_ten_don_vi_thi_luu_ma(client, seed_credentials):
    h = _h(client, seed_credentials)
    ncc = _ncc(client, h, _giay_theo_to(), "tờ")
    it = ncc["items"][0]
    assert it["unit"] == "to"
    assert it["he_so_ve_goc"] == 1.0 and it["gia_quy_doi"] == 900


def test_migration_doi_ten_ve_ma(client, seed_credentials):
    h = _h(client, seed_credentials)
    ncc = _ncc(client, h, _giay_theo_to(), "to")
    item_id = ncc["items"][0]["id"]
    db = SessionLocal()
    try:
        db.execute(text("UPDATE supplier_items SET unit = 'Tờ' WHERE id = :i"), {"i": item_id})
        db.commit()
        _migrate_don_vi_ncc_ve_ma(db)
        _migrate_don_vi_ncc_ve_ma(db)  # idempotent
        assert db.execute(text("SELECT unit FROM supplier_items WHERE id = :i"),
                          {"i": item_id}).scalar_one() == "to"
    finally:
        db.close()
