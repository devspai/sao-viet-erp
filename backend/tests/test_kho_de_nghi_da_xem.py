"""Phản hồi kho "chưa xem" của người tạo (07/10/2026): mở màn danh sách là đã xem hết.

Trước đây phải bấm mở TỪNG yêu cầu Hoàn tất / Không thành thì số đỏ ở tab "Yêu cầu" mới tắt; luật
chung của app là nhìn thấy bản ghi trên danh sách là đủ (`POST /api/kho/de-nghi/seen-all`).
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.stock_request import StockRequest
from tests.test_kho_de_nghi import _admin, _mk_kho, _mk_material


def _tao_roi_huy(client, h) -> int:
    kho_id = _mk_kho(client, h)
    mat = _mk_material("GY-DX-1")
    r = client.post("/api/kho/de-nghi", headers=h, json={
        "loai": "XUAT", "kho_id": kho_id,
        "lines": [{"hang_loai": mat[0], "hang_id": mat[1], "dvt": "to", "sl_de_nghi": 3}],
    })
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    db = SessionLocal()
    try:
        db.get(StockRequest, rid).trang_thai = "cancelled"  # `updated_at` nhảy ⇒ phản hồi mới
        db.commit()
    finally:
        db.close()
    return rid


def test_mo_man_danh_sach_la_da_xem_het_phan_hoi(client):
    h = _admin(client)
    _tao_roi_huy(client, h)
    assert client.get("/api/kho/de-nghi/counts", headers=h).json()["fail_unseen"] == 1

    assert client.post("/api/kho/de-nghi/seen-all", headers=h).status_code == 204

    dem = client.get("/api/kho/de-nghi/counts", headers=h).json()
    assert dem["fail_unseen"] == 0
    assert dem["done_unseen"] == 0
