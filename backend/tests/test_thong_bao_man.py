"""Chấm đỏ thanh bên = "có bản ghi mới kể từ lần mở màn trước" (29/09/2026)."""
from __future__ import annotations

import pytest

from app.db import SessionLocal
from app.models.role import SCOPE_ALL, SCOPE_DEPARTMENT, SCOPE_OWN
from app.repositories.rbac_repo import DepartmentRepository
from app.services.thong_bao_man import bao

from .thong_bao_helpers import da_xem, dang_nhap, tao_nguoi, tom_tat


def _bao(**kw):
    db = SessionLocal()
    try:
        return bao(db, **kw)
    finally:
        db.close()


def _phong(ten: str) -> int:
    db = SessionLocal()
    try:
        d = DepartmentRepository(db)
        return (d.get_by_name(ten) or d.create(name=ten)).id
    finally:
        db.close()


def test_phat_rong_theo_quyen_xem_va_mo_man_la_mat(client):
    tao_nguoi("xem_sx", {"san_xuat": dict(can_read=True, scope=SCOPE_ALL)})
    tao_nguoi("khong_sx", {"khach_hang": dict(can_read=True, scope=SCOPE_OWN)})
    h, h2 = dang_nhap(client, "xem_sx"), dang_nhap(client, "khong_sx")
    assert tom_tat(client, h) == {}
    _bao(kenh="san_xuat", loai="don_chuyen_sx", actor_id=None, ma="DH26-0001")
    tt = tom_tat(client, h)
    assert tt["san_xuat"]["loai"] == "don_chuyen_sx" and tt["san_xuat"]["ma"] == "DH26-0001"
    assert "san_xuat" not in tom_tat(client, h2)
    da_xem(client, h, "san_xuat")
    assert tom_tat(client, h) == {}


def test_nguoi_tao_khong_thay_cham_cua_minh(client):
    uid = tao_nguoi("tu_tao", {"san_xuat": dict(can_read=True, scope=SCOPE_ALL)})
    _bao(kenh="san_xuat", loai="don_chuyen_sx", actor_id=uid)
    assert tom_tat(client, dang_nhap(client, "tu_tao")) == {}


def test_quyen_duyet_va_pham_vi_phong(client):
    p_a, p_b = _phong("Phòng A chấm"), _phong("Phòng B chấm")
    tao_nguoi("duyet_a", {"luong": dict(can_read=True, can_approve=True, scope=SCOPE_DEPARTMENT)},
              phong="Phòng A chấm")
    tao_nguoi("duyet_all", {"luong": dict(can_read=True, can_approve=True, scope=SCOPE_ALL)})
    tao_nguoi("chi_xem", {"luong": dict(can_read=True, scope=SCOPE_ALL)})
    _bao(kenh="luong", loai="tam_ung_moi", actor_id=None, quyen="approve", phong_id=p_b)
    assert "luong" not in tom_tat(client, dang_nhap(client, "duyet_a"))
    assert "luong" in tom_tat(client, dang_nhap(client, "duyet_all"))
    assert "luong" not in tom_tat(client, dang_nhap(client, "chi_xem"))
    _bao(kenh="luong", loai="tam_ung_moi", actor_id=None, quyen="approve", phong_id=p_a)
    assert "luong" in tom_tat(client, dang_nhap(client, "duyet_a"))


def test_dich_danh_khong_can_quyen_man(client):
    uid = tao_nguoi("tho_ca", {"khach_hang": dict(can_read=True, scope=SCOPE_OWN)})
    tao_nguoi("nguoi_khac", {"cham_cong": dict(can_read=True, scope=SCOPE_ALL)})
    _bao(kenh="cham_cong", loai="doi_ca", actor_id=None, nguoi_nhan=uid)
    h = dang_nhap(client, "tho_ca")
    assert tom_tat(client, h)["cham_cong"]["loai"] == "doi_ca"
    assert "cham_cong" not in tom_tat(client, dang_nhap(client, "nguoi_khac"))
    da_xem(client, h, "cham_cong")
    assert tom_tat(client, h) == {}


def test_danh_sach_nguoi_nhan_rong_thi_khong_ghi(client):
    assert _bao(kenh="kho", loai="kho_yeu_cau_moi", actor_id=None, nguoi_nhan=[]) == 0


def test_chi_mot_lan_theo_ma(client):
    assert _bao(kenh="phieu_bao_tri", loai="bao_tri_den_han", actor_id=None, ma="BT-1",
                chi_mot_lan=True) == 1
    assert _bao(kenh="phieu_bao_tri", loai="bao_tri_den_han", actor_id=None, ma="BT-1",
                chi_mot_lan=True) == 0


def test_kenh_la_bi_tu_choi(client):
    with pytest.raises(ValueError):
        _bao(kenh="khong_ton_tai", loai="x", actor_id=None)
    with pytest.raises(ValueError):
        _bao(kenh="luong", loai="x", actor_id=None, quyen="quyen_bia")


def test_mark_read_kenh_la_404(client, seed_credentials):
    tok = client.post("/api/auth/login", json=seed_credentials).json()["access_token"]
    r = client.post("/api/module-notifications/khong_ton_tai/mark-read",
                    headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 404
