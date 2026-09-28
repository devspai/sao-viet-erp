"""Guard chống N+1 ở các danh sách của module Mua hàng.

Đếm số câu SQL của MỘT request danh sách khi dữ liệu có ít dòng và khi có nhiều dòng. Số câu phải
ĐỨNG YÊN khi số dòng tăng — tăng theo số dòng nghĩa là đang hỏi DB từng dòng một (27/09/2026: danh
sách phiếu mua ~5 câu/phiếu, NCC ~4 câu/mặt hàng khác nhau, form mỗi dòng vật tư một request đơn vị).
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import date, timedelta

import pytest
from sqlalchemy import event

from app.db import SessionLocal, engine
from app.models.vat_lieu_kho import GiayNguyen


@pytest.fixture
def h(client, seed_credentials) -> dict[str, str]:
    tok = client.post("/api/auth/login", json=seed_credentials).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


@contextmanager
def dem_sql():
    dem = {"n": 0}

    def _nghe(*_a, **_k):
        dem["n"] += 1

    event.listen(engine, "before_cursor_execute", _nghe)
    try:
        yield dem
    finally:
        event.remove(engine, "before_cursor_execute", _nghe)


def _giay(n: int, tien_to: str) -> list[int]:
    db = SessionLocal()
    try:
        rows = [
            GiayNguyen(ma=f"{tien_to}{i}", ten=f"Giay {tien_to} {i}", gsm=150, kho_dai=860,
                       kho_rong=650, don_vi_gia="kg",
                       cong_thuc_luong="dinh_luong * dai_nguyen * rong_nguyen * to_nguyen")
            for i in range(n)
        ]
        db.add_all(rows)
        db.commit()
        return [r.id for r in rows]
    finally:
        db.close()


def _dung(client, h, n: int, tien_to: str) -> list[int]:
    """n mặt hàng giấy · 1 NCC bán cả n · n YCMH · n phiếu mua (mỗi phiếu một YCMH, có 1 đợt giao)."""
    ids = _giay(n, tien_to)
    ncc = client.post("/api/suppliers", json={
        "name": f"NCC do N+1 {tien_to}", "tax_code": f"03{abs(hash(tien_to)) % 10**8:08d}",
        "phone": "0901000001", "email": "ncc@example.com", "address": "HCM",
        "contact_name": "Lan", "supplier_group": "paper", "payment_terms": "30 ngay",
        "items": [{"hang_loai": "giay", "hang_id": gid, "item_name": f"Giay {tien_to} {i}",
                   "unit": "kg", "unit_price": 22000, "vat_percent": 8}
                  for i, gid in enumerate(ids)],
    }, headers=h)
    assert ncc.status_code == 201, ncc.text
    han = (date.today() + timedelta(days=30)).isoformat()
    for i, gid in enumerate(ids):
        yc = client.post("/api/department-purchase-requests", json={
            "source_type": "kinh_doanh", "purpose": "do", "needed_date": han,
            "lines": [{"item_name": f"Giay {tien_to} {i}", "unit": "kg", "quantity": 10,
                       "hang_loai": "giay", "hang_id": gid}],
        }, headers=h)
        assert yc.status_code == 201, yc.text
        pm = client.post("/api/purchase-requests", json={
            "supplier_id": ncc.json()["id"], "source_request_ids": [yc.json()["id"]],
            "purpose": "do", "needed_date": han, "expected_receipt_date": han,
            "lines": [{"item_name": f"Giay {tien_to} {i}", "unit": "kg", "quantity": 10,
                       "expected_unit_price": 22000}],
        }, headers=h)
        assert pm.status_code == 201, pm.text
    return ids


def _so_cau(client, h, url: str) -> int:
    with dem_sql() as d:
        r = client.get(url, headers=h)
    assert r.status_code == 200, r.text
    return d["n"]


DANH_SACH = [
    "/api/suppliers?size=20",
    "/api/purchase-requests?size=20",
    "/api/department-purchase-requests?size=20",
]


def test_danh_sach_mua_hang_khong_hoi_db_tung_dong(client, h):
    _dung(client, h, 2, "A")
    it = {u: _so_cau(client, h, u) for u in DANH_SACH}
    _dung(client, h, 8, "B")
    nhieu = {u: _so_cau(client, h, u) for u in DANH_SACH}
    print("\nSO CAU SQL (it dong -> nhieu dong):", {u: (it[u], nhieu[u]) for u in DANH_SACH})
    for u in DANH_SACH:
        assert nhieu[u] == it[u], f"{u}: {it[u]} -> {nhieu[u]} câu khi tăng số dòng"


def test_don_vi_nhieu_mat_hang_mot_request(client, h):
    ids = _dung(client, h, 6, "C")
    cap = ",".join(f"giay:{i}" for i in ids)
    it = _so_cau(client, h, f"/api/vat-lieu-kho/mat-hang/don-vi-lo?cap=giay:{ids[0]}")
    nhieu = _so_cau(client, h, f"/api/vat-lieu-kho/mat-hang/don-vi-lo?cap={cap}")
    r = client.get(f"/api/vat-lieu-kho/mat-hang/don-vi-lo?cap={cap}", headers=h).json()
    assert len(r["items"]) == len(ids)
    assert r["items"][0]["don_vi_goc"] == "kg"
    print("\nDON VI LO (1 mat hang -> 6):", it, nhieu)
    assert nhieu == it


def test_tong_quan_ncc_dem_toan_danh_muc(client, h):
    """Thanh đếm + dải nhóm của màn NCC đếm ở máy chủ cho TOÀN danh mục, kể cả NCC tạm ngừng."""
    truoc = client.get("/api/suppliers/tong-quan", headers=h).json()
    _dung(client, h, 1, "T")
    ncc = client.get("/api/suppliers?q=NCC do N%2B1 T", headers=h).json()["items"][0]
    assert client.patch(f"/api/suppliers/{ncc['id']}/toggle-active", headers=h).status_code == 200
    sau = client.get("/api/suppliers/tong-quan", headers=h).json()
    assert sau["tong"] == truoc["tong"] + 1
    assert sau["tam_ngung"] == truoc["tam_ngung"] + 1
    assert sau["dang_hop_tac"] == truoc["dang_hop_tac"]
    nhom = {n["supplier_group"]: n["so_ncc"] for n in sau["nhom"]}
    nhom_truoc = {n["supplier_group"]: n["so_ncc"] for n in truoc["nhom"]}
    assert nhom["paper"] == nhom_truoc.get("paper", 0) + 1
