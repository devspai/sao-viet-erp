"""Kho bổ sung dạng/khổ cho lô giấy cũ — spec 2026-10-01 §6. Đi bằng HTTP thật."""
from __future__ import annotations

from datetime import date

from app.db import SessionLocal
from app.models.audit import AuditLog
from app.models.stock_lot import StockLot
from app.models.vat_lieu_kho import GiayNguyen, VatTuInAn
from tests.test_kho_de_nghi import _admin, _setup
from tests.test_kho_lo_giay import _don_vi

BASE = "/api/kho"


def _lo_cu(kho_id, hang_loai, hang_id, sl, con=None) -> int:
    db = SessionLocal()
    try:
        lot = StockLot(
            ma_lo=f"LOT-CU-{hang_loai}-{hang_id}-{sl}", hang_loai=hang_loai, hang_id=hang_id,
            kho_id=kho_id, ngay_nhap=date(2026, 9, 1), sl_ban_dau=sl,
            sl_con_lai=sl if con is None else con, trang_thai="active")
        db.add(lot)
        db.commit()
        return lot.id
    finally:
        db.close()


def _giay() -> int:
    db = SessionLocal()
    try:
        g = GiayNguyen(ma="C150", ten="Giấy C150", gsm=150, don_vi_gia="kg")
        db.add(g)
        db.commit()
        return g.id
    finally:
        db.close()


def _lay(lot_id) -> StockLot:
    db = SessionLocal()
    try:
        return db.get(StockLot, lot_id)
    finally:
        db.close()


def _patch(client, lot_id, **body):
    return client.patch(f"{BASE}/phieu/lo/{lot_id}/dang-kho", headers=_admin(client), json=body)


def test_bo_sung_to_doi_kg_ra_to_nguyen_lam_tron_xuong(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2, con=64.6)
    r = _patch(client, lot_id, dang_giay="to", kho_rong=1090, kho_dai=790)
    assert r.status_code == 200, r.text
    lot = _lay(lot_id)
    assert (lot.dang_giay, lot.kho_rong, lot.kho_dai) == ("to", 790, 1090)   # chuẩn hoá ngắn × dài
    assert float(lot.sl_ban_dau) == 1000
    assert float(lot.sl_con_lai) == 500
    db = SessionLocal()
    try:
        row = db.query(AuditLog).filter(
            AuditLog.action == "kho_bo_sung_dang_kho_lo",
            AuditLog.target == f"stock_lot:{lot_id}").one()
        assert "chưa rõ dạng/khổ" in row.detail
    finally:
        db.close()


def test_bo_sung_cuon_giu_so_luong(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2)
    r = _patch(client, lot_id, dang_giay="cuon", kho_rong=790, kho_dai=0)
    assert r.status_code == 200, r.text
    lot = _lay(lot_id)
    assert (lot.dang_giay, lot.kho_rong, lot.kho_dai) == ("cuon", 790, 0)
    assert float(lot.sl_ban_dau) == 129.2 and float(lot.sl_con_lai) == 129.2


def test_lo_da_co_dang_bi_tu_choi(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2)
    assert _patch(client, lot_id, dang_giay="cuon", kho_rong=790).status_code == 200
    r = _patch(client, lot_id, dang_giay="to", kho_rong=790, kho_dai=1090)
    assert r.status_code == 400
    assert "Lô đã có dạng/khổ" in r.json()["detail"]


def test_lo_vat_tu_bi_tu_choi(client):
    kho_id, _ = _setup(client)
    _don_vi()
    db = SessionLocal()
    try:
        v = VatTuInAn(ma="VT1", ten="Keo", don_vi_gia="kg")
        db.add(v)
        db.commit()
        vid = v.id
    finally:
        db.close()
    lot_id = _lo_cu(kho_id, "vat_tu", vid, 10)
    r = _patch(client, lot_id, dang_giay="cuon", kho_rong=790)
    assert r.status_code == 400
    assert "lô giấy" in r.json()["detail"]
