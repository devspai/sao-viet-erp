"""Kho bổ sung KHỔ cho lô giấy cũ chưa có khổ (10/10/2026 — giấy bỏ dạng cuộn/tờ). Đi bằng HTTP thật.

`PATCH /api/kho/phieu/lo/{id}/kho` chỉ GHI KHỔ: số lượng, đơn vị gốc, đơn giá giữ nguyên — tờ và kg không
quy đổi nên máy không còn đổi khối lượng ra tờ như hộp "Bổ sung dạng/khổ" cũ.
"""
from __future__ import annotations

from datetime import date

from app.db import SessionLocal
from app.models.audit import AuditLog
from app.models.stock_lot import StockLot
from app.models.stock_voucher import (
    VOUCHER_DRAFT, VOUCHER_XUAT, StockVoucher, StockVoucherLine,
)
from app.models.vat_lieu_kho import GiayNguyen, VatTuInAn
from tests.test_kho_de_nghi import _admin, _setup
from tests.test_kho_lo_giay import _don_vi

BASE = "/api/kho"


def _lo_cu(kho_id, hang_loai, hang_id, sl, con=None, *, goc="kg", kr=0, kd=0, gia=None) -> int:
    db = SessionLocal()
    try:
        lot = StockLot(
            ma_lo=f"LOT-CU-{hang_loai}-{hang_id}-{sl}-{kr}", hang_loai=hang_loai, hang_id=hang_id,
            kho_id=kho_id, ngay_nhap=date(2026, 9, 1), sl_ban_dau=sl,
            sl_con_lai=sl if con is None else con, trang_thai="active",
            don_vi_goc=goc if hang_loai == "giay" else "", kho_rong=kr, kho_dai=kd,
            don_gia_nhap=gia)
        db.add(lot)
        db.commit()
        return lot.id
    finally:
        db.close()


def _giay(don_vi_gia: str = "kg", gsm: int = 150) -> int:
    db = SessionLocal()
    try:
        g = GiayNguyen(don_vi_them=["to"], ma="C150", ten="Giấy C150", gsm=gsm, don_vi_gia=don_vi_gia)
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
    return client.patch(f"{BASE}/phieu/lo/{lot_id}/kho", headers=_admin(client), json=body)


def test_bo_sung_kho_hai_canh_chi_ghi_kho_giu_so_luong_don_vi_gia(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2, con=64.6, gia=20000)
    r = _patch(client, lot_id, kho_rong=1090, kho_dai=790)
    assert r.status_code == 200, r.text
    assert r.json() == {"id": lot_id, "don_vi_goc": "kg", "kho_rong": 790, "kho_dai": 1090,
                        "sl_ban_dau": 129.2, "sl_con_lai": 64.6}
    lot = _lay(lot_id)
    # Chuẩn hoá ngắn × dài; số, đơn vị, giá giữ nguyên.
    assert (lot.don_vi_goc, lot.kho_rong, lot.kho_dai) == ("kg", 790, 1090)
    assert float(lot.sl_ban_dau) == 129.2 and float(lot.sl_con_lai) == 64.6
    assert lot.don_gia_nhap == 20000
    db = SessionLocal()
    try:
        row = db.query(AuditLog).filter(
            AuditLog.action == "kho_bo_sung_kho_lo",
            AuditLog.target == f"stock_lot:{lot_id}").one()
        assert "chưa có khổ" in row.detail and "790 × 1090 mm" in row.detail
    finally:
        db.close()


def test_bo_sung_kho_chi_rong(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2)
    r = _patch(client, lot_id, kho_rong=790)
    assert r.status_code == 200, r.text
    lot = _lay(lot_id)
    assert (lot.kho_rong, lot.kho_dai) == (790, 0)
    assert float(lot.sl_ban_dau) == 129.2


def test_lo_to_giu_don_vi_to(client):
    """Lô giấy đếm tờ chưa có khổ: bổ sung khổ không đổi đơn vị gốc."""
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 1000, goc="to")
    r = _patch(client, lot_id, kho_rong=790, kho_dai=1090)
    assert r.status_code == 200, r.text
    assert r.json()["don_vi_goc"] == "to"
    assert float(_lay(lot_id).sl_ban_dau) == 1000


def test_lo_da_co_kho_bi_tu_choi(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2)
    assert _patch(client, lot_id, kho_rong=790).status_code == 200
    r = _patch(client, lot_id, kho_rong=790, kho_dai=1090)
    assert r.status_code == 400
    assert "Lô đã có khổ" in r.json()["detail"]


def test_body_thieu_kho_rong_bi_422(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2)
    assert _patch(client, lot_id, kho_rong=0, kho_dai=500).status_code == 422
    assert _lay(lot_id).kho_rong == 0


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
    r = _patch(client, lot_id, kho_rong=790)
    assert r.status_code == 400
    assert "lô giấy" in r.json()["detail"]


def test_lo_trong_phieu_xuat_nhap_bi_chan(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2)
    db = SessionLocal()
    try:
        v = StockVoucher(ma="PXK-NHAP-1", loai=VOUCHER_XUAT, request_id=1, kho_id=kho_id,
                         trang_thai=VOUCHER_DRAFT, ngay=date(2026, 9, 2), nguoi_lap_id=1)
        db.add(v)
        db.flush()
        db.add(StockVoucherLine(
            voucher_id=v.id, request_line_id=1, hang_loai="giay", hang_id=1, lot_id=lot_id,
            so_luong=10, sl_goc=10))
        db.commit()
    finally:
        db.close()
    r = _patch(client, lot_id, kho_rong=790)
    assert r.status_code == 400
    assert "phiếu xuất nháp PXK-NHAP-1" in r.json()["detail"]
    assert _lay(lot_id).kho_rong == 0


def test_duong_dang_kho_cu_da_go(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2)
    r = client.patch(f"{BASE}/phieu/lo/{lot_id}/dang-kho", headers=_admin(client),
                     json={"dang_giay": "cuon", "kho_rong": 790})
    assert r.status_code in (404, 405)
