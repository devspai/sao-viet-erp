"""Điều kiện "Trạng thái" trong nút Lọc của nhóm màn Sản xuất (07/10/2026).

Theo dõi sản xuất, góc Theo lệnh: lọc theo khâu (cột "Đang ở") ở MÁY CHỦ. Như các ô lọc khác, số
của dải bất thường không đổi theo điều kiện này.
"""
from __future__ import annotations

from app.services.lenh_sx import theo_doi, trang_thai
from tests.lenh_sx_fixtures import (  # noqa: F401
    _h,
    _tok,
    admin,
    customer,
    lenh_that,
    lsx_svc,
    orders,
    sess,
)


def _ids(d: dict) -> list[int]:
    return [r["lsx_id"] for r in d["items"]]


def test_theo_lenh_loc_theo_khau(sess, lenh_that):
    het = theo_doi.theo_lenh(sess, sale_ids=None)
    assert _ids(het) == [lenh_that]
    assert het["items"][0]["khau"] == trang_thai.KHAU_DANG_SX

    dang = theo_doi.theo_lenh(sess, sale_ids=None, khau=trang_thai.KHAU_DANG_SX)
    assert _ids(dang) == [lenh_that] and dang["total"] == 1

    sau = theo_doi.theo_lenh(sess, sale_ids=None, khau=trang_thai.KHAU_SAU_SX)
    assert sau["items"] == [] and sau["total"] == 0
    assert sau["bat_thuong"] == het["bat_thuong"]


def test_theo_lenh_loc_khau_theo_ket_qua_trang_thai_khau(sess, lenh_that, monkeypatch):
    """Lọc đọc đúng `trang_thai.khau` — lệnh sang Sau sản xuất thì rơi vào điều kiện đó."""
    monkeypatch.setattr(trang_thai, "khau", lambda bc, i: (trang_thai.KHAU_SAU_SX, None))
    assert _ids(theo_doi.theo_lenh(sess, sale_ids=None, khau=trang_thai.KHAU_SAU_SX)) == [lenh_that]
    assert theo_doi.theo_lenh(sess, sale_ids=None, khau=trang_thai.KHAU_DANG_SX)["total"] == 0


def test_api_theo_lenh_khau(client, seed_credentials, sess, lenh_that):
    h = _h(_tok(client, seed_credentials))
    r = client.get("/api/theo-doi-san-xuat/theo-lenh?khau=dang_sx", headers=h)
    assert r.status_code == 200
    assert [i["lsx_id"] for i in r.json()["items"]] == [lenh_that]
    r = client.get("/api/theo-doi-san-xuat/theo-lenh?khau=da_giao", headers=h)
    assert r.status_code == 200 and r.json()["items"] == []
    assert client.get("/api/theo-doi-san-xuat/theo-lenh?khau=la", headers=h).status_code == 422
