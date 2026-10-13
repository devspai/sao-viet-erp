"""Kho thành phẩm là KHO CỐ ĐỊNH của hệ thống (12/10/2026, mg 0398), mã `KHO-TP` — như mục cố định
`HT-xx` của Mục thu chi: không xoá, không ngừng dùng, không đổi tên; vị trí / ghi chú vẫn sửa được."""
from __future__ import annotations

from app.db import SessionLocal
from app.db_migrations import _migrate_kho_thanh_pham_he_thong
from app.models.kho_hang import MA_KHO_THANH_PHAM, KhoHang
from tests.test_giao_hang_api import _admin


def _kho_tp(client, h) -> dict:
    """Khởi động chạy migration ⇒ DB nào cũng có sẵn đúng một kho `KHO-TP`."""
    ds = client.get("/api/kho", params={"q": MA_KHO_THANH_PHAM, "size": 50}, headers=h).json()["items"]
    tp = [k for k in ds if k["ma"] == MA_KHO_THANH_PHAM]
    assert len(tp) == 1, ds
    return tp[0]


def test_kho_thanh_pham_KHONG_xoa_ngung_doi_ten_duoc(client):
    h = _admin(client)
    kho = _kho_tp(client, h)
    assert kho["co_dinh"] is True
    kid = kho["id"]

    chk = client.get(f"/api/kho/{kid}/delete-check", headers=h).json()
    assert chk == {"can_delete": False, "blockers": ["kho thành phẩm của hệ thống"]}
    assert client.delete(f"/api/kho/{kid}", headers=h).status_code >= 400
    assert client.patch(f"/api/kho/{kid}/active", json={"active": False}, headers=h).status_code >= 400
    r = client.put(f"/api/kho/{kid}", json={"ten": "Kho TP moi"}, headers=h)
    assert r.status_code >= 400 and "đổi tên" in r.text, r.text
    r = client.put(f"/api/kho/{kid}", json={"ten": "Kho thành phẩm", "active": False}, headers=h)
    assert r.status_code >= 400, r.text

    # Vị trí / ghi chú vẫn sửa được.
    r = client.put(f"/api/kho/{kid}", json={"ten": "Kho thành phẩm", "vi_tri": "Tầng 1"}, headers=h)
    assert r.status_code == 200, r.text
    sau = client.get(f"/api/kho/{kid}", headers=h).json()
    assert (sau["vi_tri"], sau["active"], sau["co_dinh"]) == ("Tầng 1", True, True)


def test_kho_thuong_van_xoa_duoc(client):
    h = _admin(client)
    r = client.post("/api/kho", json={"ten": "Kho thuong"}, headers=h)
    assert r.status_code in (200, 201) and r.json()["co_dinh"] is False, r.text
    assert client.delete(f"/api/kho/{r.json()['id']}", headers=h).status_code in (200, 204)


def test_migration_NHAN_kho_ten_kho_thanh_pham_da_khai(client):
    """Kho "Kho thành phẩm" khai tay từ trước (đang có lô trỏ vào) được nhận làm kho cố định — đổi mã,
    không đẻ kho thứ hai."""
    db = SessionLocal()
    try:
        tp = db.query(KhoHang).filter(KhoHang.ma == MA_KHO_THANH_PHAM).one()
        tp.ma, tp.active = "KHO-0002", False         # dựng lại cảnh "khai tay trước ngày 12/10"
        db.add(KhoHang(ma="KHO-0001", ten="Kho giấy"))
        db.commit()
        _migrate_kho_thanh_pham_he_thong(db)
        _migrate_kho_thanh_pham_he_thong(db)        # chạy lại không đổi gì
        ds = db.query(KhoHang).filter(KhoHang.ten == "Kho thành phẩm").all()
        assert [(k.id, k.ma, k.active) for k in ds] == [(tp.id, MA_KHO_THANH_PHAM, True)]
    finally:
        db.close()


def test_migration_TAO_kho_thanh_pham_khi_chua_co(client):
    db = SessionLocal()
    try:
        db.query(KhoHang).filter(KhoHang.ma == MA_KHO_THANH_PHAM).delete()
        db.commit()
        _migrate_kho_thanh_pham_he_thong(db)
        _migrate_kho_thanh_pham_he_thong(db)
        moi = db.query(KhoHang).filter(KhoHang.ma == MA_KHO_THANH_PHAM).all()
        assert [(k.ma, k.ten) for k in moi] == [(MA_KHO_THANH_PHAM, "Kho thành phẩm")]
    finally:
        db.close()
