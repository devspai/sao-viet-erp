"""Hàng "Gia công chờ chi" của màn Phiếu chi (spec 2026-09-26 §5)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ..gio_xuong import thuc_te_hien_thi
from .lan import nguon_lan


def hang_cho_chi(db: Session) -> list[dict]:
    repo = GiaCongNgoaiRepository(db)
    ds = repo.cho_chi()
    ten = repo.user_names({g.chot_boi_id for g in ds})
    ma_lenh = repo.ma_cua_lenh({g.lsx_id for g in ds if g.lsx_id})
    ra = []
    for g in ds:
        ra.append({
            "gia_cong_ngoai_id": g.id, "lsx_id": g.lsx_id, "lsx_ma": ma_lenh.get(g.lsx_id, ""),
            # Lần của bài ghép: "BG-.. (LSX-A, LSX-B)" — một phiếu chi cho cả bài (spec 2026-09-27).
            "bai_ghep_id": g.bai_ghep_id,
            "nhan_nguon": (nguon_lan(db, g)["nhan_nguon"] if g.bai_ghep_id is not None
                           else ma_lenh.get(g.lsx_id, "")),
            "ten_viec": g.ten_viec, "nha_cung_cap_id": g.nha_cung_cap_id,
            "nha_cung_cap_ten": g.nha_cung_cap_ten, "sl_cuoi": float(g.sl_cuoi),
            "don_vi": g.don_vi, "chot_luc": thuc_te_hien_thi(g.chot_luc),
            "chot_boi_ten": ten.get(g.chot_boi_id),
        })
    return ra


def dem_cho_chi(db: Session) -> int:
    return GiaCongNgoaiRepository(db).dem_cho_chi()
