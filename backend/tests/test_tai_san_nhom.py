"""Sổ tài sản: sắp theo nhóm (`nhom_theo`), tổng theo nhóm và mức trích của tháng này.

Tháng hiện tại tính theo giờ Việt Nam; kỳ vọng tính bằng chính engine (`muc_thang`) với
`thang_hien_tai()` — ghi số cứng là qua tháng sau test đỏ.
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.department import Department
from app.models.tai_san import TaiSan
from app.services.tai_san.service import TaiSanService, thang_hien_tai
from app.repositories.tai_san_repo import TaiSanRepository

from .test_tai_san_api import _token


def _them(client, h, ten: str, *, loai: str, gia: int, ngay: str, so_thang: int) -> dict:
    r = client.post("/api/tai-san", headers=h, json={
        "ten": ten, "loai": loai, "so_thang": so_thang,
        "ngay_su_dung": ngay, "nguon_vao": "ghi_tang",
        "chi_phi": [{"dien_giai": "Gia mua", "so_tien": gia}],
    })
    assert r.status_code == 201, r.text
    return r.json()


def _dung_du_lieu(client, h) -> list[dict]:
    """2 TSCĐ + 3 CCDC; CCDC cuối đã khấu hao hết từ lâu."""
    ra = [
        _them(client, h, "May in A", loai="tscd", gia=1_200_000_000, ngay="2026-03-10", so_thang=120),
        _them(client, h, "May cat B", loai="tscd", gia=600_000_000, ngay="2026-01-01", so_thang=60),
        _them(client, h, "Tam cao su 1", loai="ccdc", gia=24_000_000, ngay="2026-07-01", so_thang=24),
        _them(client, h, "Tam cao su 2", loai="ccdc", gia=12_000_000, ngay="2026-08-01", so_thang=12),
        _them(client, h, "Dung cu het han", loai="ccdc", gia=6_000_000, ngay="2024-01-01", so_thang=12),
    ]
    return ra


def test_mac_dinh_tscd_truoc_ccdc_va_tong_theo_nhom(client, seed_credentials):
    h = _token(client, seed_credentials)
    _dung_du_lieu(client, h)

    r = client.get("/api/tai-san?limit=2&offset=0", headers=h).json()
    assert r["total"] == 5
    assert [x["loai"] for x in r["items"]] == ["tscd", "tscd"]

    tat_ca = client.get("/api/tai-san?limit=200", headers=h).json()["items"]
    assert [x["loai"] for x in tat_ca] == ["tscd", "tscd", "ccdc", "ccdc", "ccdc"]
    for loai in ("tscd", "ccdc"):  # trong nhóm sắp theo mã
        mas = [x["ma"] for x in tat_ca if x["loai"] == loai]
        assert mas == sorted(mas)

    nhom = r["nhom"]
    assert [(g["khoa"], g["ten"], g["so"]) for g in nhom] == [
        ("tscd", "Tài sản cố định", 2), ("ccdc", "Công cụ dụng cụ", 3),
    ]
    for g in nhom:
        dong = [x for x in tat_ca if x["loai"] == g["khoa"]]
        assert g["nguyen_gia"] == sum(x["nguyen_gia"] for x in dong)
        assert g["hao_mon"] == sum(x["hao_mon_luy_ke"] for x in dong)
        assert g["con_lai"] == sum(x["con_lai"] for x in dong)
        assert g["muc_thang"] == sum(x["muc_thang_nay"] for x in dong)

    # CCDC đã khấu hao hết: tháng này không trích gì.
    het = next(x for x in tat_ca if x["ten"] == "Dung cu het han")
    assert het["muc_thang_nay"] == 0
    # Máy in A trích tới 2036 — món ngắn hạn (CCDC 12 tháng) sẽ hết hạn theo ngày chạy test nên không khẳng định.
    assert next(x for x in tat_ca if x["ten"] == "May in A")["muc_thang_nay"] > 0

    assert r["tong_muc_thang"] == sum(x["muc_thang_nay"] for x in tat_ca)
    assert r["tong_hao_mon"] == sum(x["hao_mon_luy_ke"] for x in tat_ca)
    assert r["tong_hao_mon"] == sum(g["hao_mon"] for g in nhom)
    assert r["tong_gia"] == sum(g["nguyen_gia"] for g in nhom)
    assert r["tong_con_lai"] == sum(g["con_lai"] for g in nhom)


def test_muc_thang_nay_khop_engine_theo_gio_viet_nam(client, seed_credentials):
    h = _token(client, seed_credentials)
    ts = _them(client, h, "May in A", loai="tscd", gia=1_200_000_000, ngay="2026-03-10", so_thang=120)
    nam, thang = thang_hien_tai()
    db = SessionLocal()
    try:
        t = db.get(TaiSan, ts["id"])
        ky_vong = TaiSanService(TaiSanRepository(db)).muc_thang(t, nam, thang)[0]
    finally:
        db.close()
    assert ky_vong > 0
    r = client.get("/api/tai-san", headers=h).json()
    assert r["items"][0]["muc_thang_nay"] == ky_vong
    assert r["tong_muc_thang"] == ky_vong


def test_thoi_dung_thi_muc_thang_nay_bang_0(client, seed_credentials):
    h = _token(client, seed_credentials)
    ts = _them(client, h, "May in A", loai="tscd", gia=1_200_000_000, ngay="2026-03-10", so_thang=120)
    r = client.post(f"/api/tai-san/{ts['id']}/thoi-dung", headers=h, json={
        "ngay": "2026-05-15", "kieu": "ban", "ly_do": "Ban",
    })
    assert r.status_code in (200, 201), r.text
    row = client.get("/api/tai-san", headers=h).json()["items"][0]
    assert row["trang_thai"] == "da_giam"
    assert row["muc_thang_nay"] == 0


def test_nhom_theo_khong_giu_thu_tu_ma_va_nhom_rong(client, seed_credentials):
    h = _token(client, seed_credentials)
    _dung_du_lieu(client, h)
    r = client.get("/api/tai-san?nhom_theo=khong&limit=200", headers=h).json()
    assert r["nhom"] == []
    mas = [x["ma"] for x in r["items"]]
    assert mas == sorted(mas) and len(mas) == 5
    # tổng toàn bộ lọc vẫn có
    assert r["tong_muc_thang"] == sum(x["muc_thang_nay"] for x in r["items"])


def test_nhom_theo_bo_phan_sap_tren_ten_va_cuoi_la_chua_gan(client, seed_credentials):
    h = _token(client, seed_credentials)
    ds = _dung_du_lieu(client, h)
    db = SessionLocal()
    try:
        xuong = Department(name="Phong Tai San B", code="NH-1")
        kho = Department(name="Phong Tai San A", code="NH-2")
        db.add_all([xuong, kho])
        db.commit()
        # A: ds[0], ds[3]; B: ds[2]; ds[1], ds[4] chưa gán
        gan = {ds[0]["id"]: kho.id, ds[3]["id"]: kho.id, ds[2]["id"]: xuong.id}
        for tid, bp in gan.items():
            db.get(TaiSan, tid).bo_phan_id = bp
        db.commit()
    finally:
        db.close()

    r = client.get("/api/tai-san?nhom_theo=bo_phan&limit=200", headers=h).json()
    assert [(g["ten"], g["so"]) for g in r["nhom"]] == [
        ("Phong Tai San A", 2), ("Phong Tai San B", 1), ("Chưa gán bộ phận", 2),
    ]
    assert [x["bo_phan_ten"] for x in r["items"]] == [
        "Phong Tai San A", "Phong Tai San A", "Phong Tai San B", None, None,
    ]
    for g in r["nhom"]:
        assert g["nguyen_gia"] == sum(
            x["nguyen_gia"] for x in r["items"]
            if (x["bo_phan_ten"] or "Chưa gán bộ phận") == g["ten"]
        )


def test_nhom_theo_sai_gia_tri_thi_422(client, seed_credentials):
    h = _token(client, seed_credentials)
    assert client.get("/api/tai-san?nhom_theo=abc", headers=h).status_code == 422
