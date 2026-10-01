"""Kho bổ sung dạng/khổ cho lô giấy cũ — spec 2026-10-01 §6. Đi bằng HTTP thật."""
from __future__ import annotations

from datetime import date

from app.db import SessionLocal
from app.models.audit import AuditLog
from app.models.don_vi_do import DonViDo, DonViQuyDoi
from app.models.stock_lot import StockLot
from app.models.stock_voucher import (
    VOUCHER_DRAFT, VOUCHER_XUAT, StockVoucher, StockVoucherLine,
)
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


def _giay(don_vi_gia: str = "kg", gsm: int = 150) -> int:
    db = SessionLocal()
    try:
        g = GiayNguyen(ma="C150", ten="Giấy C150", gsm=gsm, don_vi_gia=don_vi_gia)
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


def _tan(co_cap: bool, ma: str = "tan_t") -> None:
    """Đơn vị `ma` (khối lượng); có cặp 1 tấn = 1000 kg hay không tuỳ test."""
    db = SessionLocal()
    try:
        kg = db.query(DonViDo).filter(DonViDo.ma == "kg").one()
        tan = DonViDo(ma=ma, ten="tấn thử", ho="khoi_luong")
        db.add(tan)
        db.flush()
        if co_cap:
            db.add(DonViQuyDoi(tu_id=tan.id, den_id=kg.id, he_so=1000))
        db.commit()
    finally:
        db.close()


def test_ma_dem_bang_tan_quy_ve_kg_dung_chieu(client):
    kho_id, _ = _setup(client)
    _don_vi()
    _tan(co_cap=True)
    # 0,1292 tấn = 129,2 kg ⇒ 1000 tờ (đảo chiều hệ số sẽ ra 0 hoặc hàng triệu tờ).
    lot_id = _lo_cu(kho_id, "giay", _giay("tan_t"), 0.1292)
    r = _patch(client, lot_id, dang_giay="to", kho_rong=790, kho_dai=1090)
    assert r.status_code == 200, r.text
    assert float(_lay(lot_id).sl_ban_dau) == 1000


def test_thieu_cap_quy_doi_ve_kg_bao_loi_ro(client):
    kho_id, _ = _setup(client)
    _don_vi()
    _tan(co_cap=False)
    lot_id = _lo_cu(kho_id, "giay", _giay("tan_t"), 0.1292)
    r = _patch(client, lot_id, dang_giay="to", kho_rong=790, kho_dai=1090)
    assert r.status_code == 400
    assert "kg" in r.json()["detail"]
    assert _lay(lot_id).dang_giay is None


def test_gsm_bang_khong_bi_tu_choi(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(gsm=0), 129.2)
    r = _patch(client, lot_id, dang_giay="to", kho_rong=790, kho_dai=1090)
    assert r.status_code == 400
    assert "gsm" in r.json()["detail"]
    assert _lay(lot_id).dang_giay is None


def test_lo_qua_nhe_doi_ra_khong_toi_mot_to_bi_tu_choi(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 0.05)
    r = _patch(client, lot_id, dang_giay="to", kho_rong=790, kho_dai=1090)
    assert r.status_code == 400
    assert "chưa tới một tờ" in r.json()["detail"]
    assert _lay(lot_id).dang_giay is None


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
    r = _patch(client, lot_id, dang_giay="cuon", kho_rong=790)
    assert r.status_code == 400
    assert "phiếu xuất nháp PXK-NHAP-1" in r.json()["detail"]
    assert _lay(lot_id).dang_giay is None

def test_bo_sung_to_giu_tong_gia_tri_lo(client):
    """Đổi kg → tờ phải quy đơn giá nhập (đ/kg → đ/tờ) để SL × giá của lô không phình."""
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2, con=64.6)
    db = SessionLocal()
    try:
        db.get(StockLot, lot_id).don_gia_nhap = 20000
        db.commit()
    finally:
        db.close()
    gia_tri_truoc = 129.2 * 20000
    r = _patch(client, lot_id, dang_giay="to", kho_rong=1090, kho_dai=790)
    assert r.status_code == 200, r.text
    lot = _lay(lot_id)
    assert float(lot.sl_ban_dau) == 1000
    assert lot.don_gia_nhap == 2584
    assert abs(float(lot.sl_ban_dau) * lot.don_gia_nhap - gia_tri_truoc) <= float(lot.sl_ban_dau)
    assert abs(float(lot.sl_con_lai) * lot.don_gia_nhap - 64.6 * 20000) <= float(lot.sl_con_lai)
    db = SessionLocal()
    try:
        row = db.query(AuditLog).filter(
            AuditLog.action == "kho_bo_sung_dang_kho_lo",
            AuditLog.target == f"stock_lot:{lot_id}").one()
        assert "20.000" in row.detail and "2.584" in row.detail
    finally:
        db.close()


def test_bo_sung_cuon_giu_don_gia(client):
    kho_id, _ = _setup(client)
    _don_vi()
    lot_id = _lo_cu(kho_id, "giay", _giay(), 129.2)
    db = SessionLocal()
    try:
        db.get(StockLot, lot_id).don_gia_nhap = 20000
        db.commit()
    finally:
        db.close()
    r = _patch(client, lot_id, dang_giay="cuon", kho_rong=790, kho_dai=0)
    assert r.status_code == 200, r.text
    assert _lay(lot_id).don_gia_nhap == 20000
