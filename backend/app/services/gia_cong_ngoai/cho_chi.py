"""Hàng "Gia công chờ chi" của màn Phiếu chi (spec 2026-09-26 §5)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ..gio_xuong import thuc_te_hien_thi


def hang_cho_chi(db: Session, *, xem_tien: bool) -> list[dict]:
    repo = GiaCongNgoaiRepository(db)
    ds = repo.cho_chi()
    ten = repo.user_names({g.chot_boi_id for g in ds})
    sx = SanXuatRepository(db)
    ra = []
    for g in ds:
        lsx = sx.lsx(g.lsx_id)
        tien = (round(float(g.sl_cuoi) * float(g.don_gia), 0)
                if xem_tien and g.don_gia is not None else None)
        ra.append({
            "gia_cong_ngoai_id": g.id, "lsx_id": g.lsx_id, "lsx_ma": lsx.ma if lsx else "",
            "ten_viec": g.ten_viec, "nha_cung_cap_id": g.nha_cung_cap_id,
            "nha_cung_cap_ten": g.nha_cung_cap_ten, "sl_cuoi": float(g.sl_cuoi),
            "don_vi": g.don_vi, "don_gia": float(g.don_gia) if xem_tien and g.don_gia is not None
            else None,
            "thanh_tien": tien, "chot_luc": thuc_te_hien_thi(g.chot_luc),
            "chot_boi_ten": ten.get(g.chot_boi_id),
        })
    return ra


def dem_cho_chi(db: Session) -> int:
    return len(GiaCongNgoaiRepository(db).cho_chi())
