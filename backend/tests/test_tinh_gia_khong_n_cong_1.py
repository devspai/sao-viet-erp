"""Tính giá: số câu SQL không tăng theo số SẢN PHẨM, API nhẹ cho lời nhắc, tín hiệu SSE khi danh mục đổi.

Rà 04/10/2026: xem trước giá tốn thêm 6 câu mỗi sản phẩm, mở phiếu thêm 3 câu mỗi sản phẩm; màn
phiếu tự nạp lại bốn danh mục + cả phiếu mỗi lần cửa sổ được focus. Đo bằng `before_cursor_execute`
trên engine dùng chung (StaticPool) — cùng cách `test_vat_tu_chip_so_truy_van.py`.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import event

from app.db import SessionLocal, engine
from app.models.cong_doan import CongDoan
from app.models.phieu_tinh_gia import PhieuTinhGia
from app.models.vat_lieu_kho import VatTuChip, VatTuInAn
from tests.test_phieu_tinh_gia import (  # noqa: F401 — fixture dùng chung
    _component,
    _lui_moc,
    _seed_catalog,
    _seed_may_mitsubishi,
    auth_headers,
    token,
)


def _dem(fn) -> tuple[int, object]:
    n = 0

    def _bat(*_a, **_k):
        nonlocal n
        n += 1

    event.listen(engine, "before_cursor_execute", _bat)
    try:
        kq = fn()
    finally:
        event.remove(engine, "before_cursor_execute", _bat)
    return n, kq


def _vat_tu_co_chip() -> int:
    db = SessionLocal()
    try:
        vt = VatTuInAn(ma="VT-NC1", ten="Màng test", don_vi_gia="m2", don_gia=1000,
                       cong_thuc_gia="dai_x * 2", cong_thuc_dinh_muc="dai_x")
        vt.chips = [VatTuChip(ma="dai_x", ten="Dài", don_vi="mm", thu_tu=0)]
        db.add(vt)
        db.commit()
        return vt.id
    finally:
        db.close()


def _san_pham(giay_id: int, cd_id: int, may_id: int, vt_id: int, i: int) -> dict:
    tp = {**_component(giay_id, cd_id), "ten": f"Sản phẩm {i}", "may_id": may_id}
    tp["thanh_phams"][0]["vat_tus"] = [{"vat_tu_id": vt_id, "gia_tri_chip": {"dai_x": 10 + i}}]
    return tp


@pytest.fixture
def danh_muc(client):
    giay_id, cd_id = _seed_catalog()
    return giay_id, cd_id, _seed_may_mitsubishi(), _vat_tu_co_chip()


def _body(danh_muc, so_sp: int) -> dict:
    return {"so_luong": 1000, "thanh_phans": [_san_pham(*danh_muc, i) for i in range(so_sp)]}


def test_xem_truoc_so_cau_khong_tang_theo_so_san_pham(client, auth_headers, danh_muc):
    def chay(so_sp):
        n, r = _dem(lambda: client.post("/api/tinh-gia/preview", json=_body(danh_muc, so_sp),
                                        headers=auth_headers))
        assert r.status_code == 200, r.text
        return n

    mot, bon = chay(1), chay(4)
    assert bon <= mot + 1, f"xem trước: 1 sản phẩm {mot} câu, 4 sản phẩm {bon} câu"


def test_mo_phieu_so_cau_khong_tang_theo_so_san_pham(client, auth_headers, danh_muc):
    def chay(so_sp):
        pid = client.post("/api/phieu-tinh-gia", json=_body(danh_muc, so_sp),
                          headers=auth_headers).json()["id"]
        n, r = _dem(lambda: client.get(f"/api/phieu-tinh-gia/{pid}", headers=auth_headers))
        assert r.status_code == 200
        assert len(r.json()["thanh_phans"]) == so_sp
        assert r.json()["thanh_phans"][0]["thanh_phams"][0]["vat_tus"]
        return n

    mot, bon = chay(1), chay(4)
    assert bon <= mot + 1, f"mở phiếu: 1 sản phẩm {mot} câu, 4 sản phẩm {bon} câu"


def test_api_nhe_chi_tra_loi_nhac_danh_muc_doi(client, auth_headers, danh_muc):
    _, cd_id, _, _ = danh_muc
    pid = client.post("/api/phieu-tinh-gia", json=_body(danh_muc, 1), headers=auth_headers).json()["id"]
    _lui_moc(pid)
    r = client.get(f"/api/phieu-tinh-gia/{pid}/danh-muc-doi", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"danh_muc_doi": None}

    db = SessionLocal()
    try:
        cd = db.get(CongDoan, cd_id)
        cd.ten = "Cán màng (đổi tên)"
        cd.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()
    doi = client.get(f"/api/phieu-tinh-gia/{pid}/danh-muc-doi", headers=auth_headers).json()
    assert doi["danh_muc_doi"]["ten"] == ["Cán màng (đổi tên)"]
    # Khớp với lời nhắc của GET đầy đủ — hai đường một nguồn.
    day_du = client.get(f"/api/phieu-tinh-gia/{pid}", headers=auth_headers).json()
    assert day_du["danh_muc_doi"]["ten"] == doi["danh_muc_doi"]["ten"]


def test_api_nhe_ngoai_pham_vi_tra_404(client, auth_headers):
    assert client.get("/api/phieu-tinh-gia/999999/danh-muc-doi", headers=auth_headers).status_code == 404


@pytest.fixture
def su_kien(monkeypatch):
    from app.realtime import hub

    da_gui: list[tuple[dict, list | tuple | None]] = []
    monkeypatch.setattr(hub, "gui", lambda ev, quyen=None, **_k: da_gui.append((ev, quyen)))
    return da_gui


def test_sua_danh_muc_commit_thi_bao_mot_tin(client, danh_muc, su_kien):
    _, cd_id, _, vt_id = danh_muc
    su_kien.clear()
    db = SessionLocal()
    try:
        db.get(CongDoan, cd_id).ten = "Cán màng mới"
        chip = db.query(VatTuChip).filter(VatTuChip.vat_tu_id == vt_id).one()
        chip.ten = "Dài màng"
        db.commit()
    finally:
        db.close()
    assert su_kien == [({"type": "danh_muc_doi", "loai": ["cong_doan", "vat_tu"]}, ("tinh_gia_thanh",))]


def test_rollback_hoac_bang_khac_thi_im(client, danh_muc, su_kien):
    _, cd_id, _, _ = danh_muc
    su_kien.clear()
    db = SessionLocal()
    try:
        db.get(CongDoan, cd_id).ten = "Đổi rồi bỏ"
        db.flush()
        db.rollback()
        db.commit()
        # Ghi phiếu (không phải danh mục) — màn phiếu khác không cần nạp lại danh mục.
        db.add(PhieuTinhGia(ma="PTG-IM-1", ten_san_pham="x", so_luong=1))
        db.commit()
        # Đọc danh mục không phải là đổi.
        db.get(CongDoan, cd_id)
        db.commit()
    finally:
        db.close()
    assert su_kien == []
