"""Hai số ĐẾM gắn vào dòng danh sách danh mục (05/10/2026) — để bảng bớt trống:

· Khai báo kho: `so_vi_tri` = số vị trí cất ĐANG DÙNG (vị trí đã xoá mềm không tính).
· Đơn vị & quy đổi: `mat_hang_dung` = số giấy / vật tư / thành phẩm đang lấy đơn vị đó làm ĐVT
  (mặt hàng đã ngừng dùng không tính; Vật tư khác và Thành phẩm chung bảng nên phải tách đúng).
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.vat_lieu_kho import GiayNguyen, VatTuInAn


def _h(client, seed_credentials):
    tok = client.post("/api/auth/login", json=seed_credentials).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def test_kho_dem_vi_tri_dang_dung(client, seed_credentials):
    h = _h(client, seed_credentials)
    kho = client.post("/api/kho", json={"ten": "Kho đếm vị trí"}, headers=h).json()
    trong = client.post("/api/kho", json={"ten": "Kho chưa khai vị trí"}, headers=h).json()
    for ma in ("Kệ A", "Kệ B", "Kệ C"):
        r = client.post(f"/api/kho/{kho['id']}/vi-tri", json={"ma": ma}, headers=h)
        assert r.status_code == 201, r.text
    bo = client.get(f"/api/kho/{kho['id']}/vi-tri", headers=h).json()["items"][0]
    assert client.delete(f"/api/kho/vi-tri/{bo['id']}", headers=h).status_code == 204

    dong = {r["id"]: r for r in client.get("/api/kho", headers=h).json()["items"]}
    assert dong[kho["id"]]["so_vi_tri"] == 2
    assert dong[trong["id"]]["so_vi_tri"] == 0


def test_don_vi_dem_mat_hang_dung(client, seed_credentials):
    h = _h(client, seed_credentials)
    r = client.post("/api/don-vi", json={"ma": "cuonx", "ten": "cuộn thử"}, headers=h)
    assert r.status_code == 201, r.text
    db = SessionLocal()
    try:
        db.add_all([
            GiayNguyen(ma="GY-DEM-1", ten="Giấy đếm 1", gsm=100, don_vi_gia="cuonx"),
            GiayNguyen(ma="GY-DEM-2", ten="Giấy đếm 2", gsm=120, don_vi_gia="cuonx", active=False),
            VatTuInAn(ma="VT-DEM-1", ten="Màng đếm", don_vi_gia="cuonx"),
            VatTuInAn(ma="VT-DEM-2", ten="Keo đếm", don_vi_gia="cuonx"),
            VatTuInAn(ma="TP-DEM-1", ten="Hộp đếm", don_vi_gia="cuonx", la_thanh_pham=True),
        ])
        db.commit()
    finally:
        db.close()

    items = client.get("/api/don-vi", params={"q": "cuonx"}, headers=h).json()["items"]
    dv = next(r for r in items if r["ma"] == "cuonx")
    assert dv["mat_hang_dung"] == {"giay": 1, "vat_tu": 2, "thanh_pham": 1}
