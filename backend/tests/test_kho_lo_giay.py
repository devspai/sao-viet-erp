"""Giấy trong kho mang DẠNG (tờ / cuộn) + KHỔ — spec 2026-10-01-giay-dem-to-theo-kho §3, §4.5.

Đi bằng HTTP thật: đề nghị → phiếu → ghi sổ → lô, như kho dùng.
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.don_vi_do import DonViDo, DonViQuyDoi
from app.models.stock_lot import StockLot
from app.models.vat_lieu_kho import GiayNguyen
from tests.test_kho_de_nghi import _admin, _login, _setup

BASE = "/api/kho"


def _don_vi() -> None:
    """kg (khối lượng) · ram · tờ nguyên + cặp 1 ram = 500 tờ nguyên (như fixture ram → tờ)."""
    db = SessionLocal()
    try:
        def lay(ma, ten, ho):
            d = db.query(DonViDo).filter(DonViDo.ma == ma).first()
            if d is None:
                d = DonViDo(ma=ma, ten=ten, ho=ho)
                db.add(d)
                db.flush()
            return d

        kg = lay("kg", "kg", "khoi_luong")
        ram = lay("ram", "ram", "to")
        tn = lay("to_nguyen", "tờ nguyên", "to")
        del kg
        if not db.query(DonViQuyDoi).filter(
                DonViQuyDoi.tu_id == ram.id, DonViQuyDoi.den_id == tn.id).first():
            db.add(DonViQuyDoi(tu_id=ram.id, den_id=tn.id, he_so=500))
        db.commit()
    finally:
        db.close()


def _giay(ma: str = "C-300", don_vi_gia: str = "kg") -> int:
    db = SessionLocal()
    try:
        g = GiayNguyen(ma=ma, ten=f"Giấy {ma}", gsm=300, don_vi_gia=don_vi_gia)
        db.add(g)
        db.commit()
        return g.id
    finally:
        db.close()


def _dong(giay_id, *, dvt, sl, dang, kr=0, kd=0, gia=None, **them) -> dict:
    d = {"hang_loai": "giay", "hang_id": giay_id, "dvt": dvt, "sl_de_nghi": sl}
    if dang is not None:
        d["dang_giay"] = dang
    if kr:
        d["kho_rong"] = kr
    if kd:
        d["kho_dai"] = kd
    if gia is not None:
        d["don_gia"] = gia
    d.update(them)
    return d


def _de_nghi(client, kho_id, loai, lines):
    return client.post("/api/kho/de-nghi", headers=_login(client, "t_denghi"), json={
        "loai": loai, "kho_id": kho_id, "lines": lines})


def _nhap(client, kho_id, line) -> dict:
    """Đề nghị nhập 1 dòng → phiếu → ghi sổ. Trả phiếu."""
    r = _de_nghi(client, kho_id, "NHAP", [line])
    assert r.status_code == 201, r.text
    req = r.json()
    tk = _login(client, "t_thukho")
    r = client.post(f"{BASE}/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": req["lines"][0]["sl_de_nghi"]}],
    })
    assert r.status_code == 201, r.text
    r = client.post(f"{BASE}/phieu/{r.json()['id']}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text
    return r.json()


def _lo(giay_id):
    db = SessionLocal()
    try:
        return db.query(StockLot).filter(
            StockLot.hang_loai == "giay", StockLot.hang_id == giay_id).order_by(StockLot.id).all()
    finally:
        db.close()


def test_nhap_giay_to_sinh_lo_dung_kho_dem_to_nguyen(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    _nhap(client, kho_id, _dong(g, dvt="ram", sl=2, dang="to", kr=905, kd=780, gia=1_000_000))
    (lo,) = _lo(g)
    assert (lo.dang_giay, lo.kho_rong, lo.kho_dai) == ("to", 780, 905)
    assert float(lo.sl_ban_dau) == 1000
    assert int(lo.don_gia_nhap) == 2000      # 2.000.000 ÷ 1.000 tờ nguyên


def test_nhap_giay_cuon_dem_kg(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    _nhap(client, kho_id, _dong(g, dvt="kg", sl=500, dang="cuon", kr=1000, gia=20_000))
    (lo,) = _lo(g)
    assert (lo.dang_giay, lo.kho_rong, lo.kho_dai) == ("cuon", 1000, 0)
    assert float(lo.sl_ban_dau) == 500


def test_nhap_cuon_cho_ma_don_vi_goc_khong_phai_khoi_luong_bao_loi(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay(don_vi_gia="ram")
    r = _de_nghi(client, kho_id, "NHAP", [_dong(g, dvt="ram", sl=1, dang="cuon", kr=1000)])
    assert r.status_code == 400, r.text
    assert "không nhập cuộn được" in r.json()["detail"]


def test_giay_thieu_dang_hoac_thieu_kho_to_bi_tu_choi(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    r = _de_nghi(client, kho_id, "NHAP", [_dong(g, dvt="ram", sl=1, dang=None)])
    assert r.status_code == 422, r.text
    assert "dạng" in r.text
    r = _de_nghi(client, kho_id, "NHAP", [_dong(g, dvt="ram", sl=1, dang="to", kr=780)])
    assert r.status_code == 422, r.text
    assert "khổ" in r.text


def test_cung_ma_hai_kho_tren_mot_phieu_hop_le(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    r = _de_nghi(client, kho_id, "NHAP", [
        _dong(g, dvt="ram", sl=1, dang="to", kr=780, kd=905, gia=1000),
        _dong(g, dvt="ram", sl=1, dang="to", kr=800, kd=1090, gia=1000),
    ])
    assert r.status_code == 201, r.text
    req = r.json()
    tk = _login(client, "t_thukho")
    r = client.post(f"{BASE}/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": ln["id"], "so_luong": 1} for ln in req["lines"]]})
    assert r.status_code == 201, r.text
    assert client.post(f"{BASE}/phieu/{r.json()['id']}/ghi-so", headers=tk).status_code == 200
    assert sorted((lo.kho_rong, lo.kho_dai) for lo in _lo(g)) == [(780, 905), (800, 1090)]


def test_cung_ma_cung_kho_hai_dong_bi_chan(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    r = _de_nghi(client, kho_id, "NHAP", [
        _dong(g, dvt="ram", sl=1, dang="to", kr=780, kd=905),
        _dong(g, dvt="ram", sl=1, dang="to", kr=905, kd=780),    # cùng khổ, ghi ngược cạnh
    ])
    assert r.status_code == 400, r.text
    assert "1 dòng" in r.json()["detail"]


def _ba_lo(client, kho_id, g):
    _nhap(client, kho_id, _dong(g, dvt="ram", sl=1, dang="to", kr=780, kd=905, gia=1000))
    _nhap(client, kho_id, _dong(g, dvt="ram", sl=1, dang="to", kr=800, kd=1090, gia=1000))
    _nhap(client, kho_id, _dong(g, dvt="kg", sl=100, dang="cuon", kr=1000, gia=20_000))
    return _lo(g)


def test_goi_y_lo_chi_lay_dung_dang_va_kho(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    lo_a, lo_b, lo_c = _ba_lo(client, kho_id, g)
    tk = _login(client, "t_thukho")
    base = {"hang_loai": "giay", "hang_id": g, "kho_id": kho_id, "so_luong": 100}
    r = client.get(f"{BASE}/phieu/lo/goi-y", headers=tk,
                   params={**base, "dang_giay": "to", "kho_rong": 905, "kho_dai": 780})
    assert r.status_code == 200, r.text
    assert [x["lot_id"] for x in r.json()["lines"]] == [lo_a.id]
    r = client.get(f"{BASE}/phieu/lo/goi-y", headers=tk, params={**base, "dang_giay": "cuon"})
    assert [x["lot_id"] for x in r.json()["lines"]] == [lo_c.id]
    r = client.get(f"{BASE}/phieu/lo/danh-sach", headers=_login(client, "t_ketoan"),
                   params={"hang_loai": "giay", "hang_id": g, "dang_giay": "to",
                           "kho_rong": 800, "kho_dai": 1090})
    assert [x["id"] for x in r.json()] == [lo_b.id]
    assert (r.json()[0]["dang_giay"], r.json()[0]["kho_rong"], r.json()[0]["kho_dai"]) == ("to", 800, 1090)


def test_xuat_chon_lo_sai_kho_bi_chan(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    lo_a, lo_b, _c = _ba_lo(client, kho_id, g)
    r = _de_nghi(client, kho_id, "XUAT", [_dong(g, dvt="to_nguyen", sl=300, dang="to", kr=780, kd=905)])
    assert r.status_code == 201, r.text
    req = r.json()
    tk = _login(client, "t_thukho")
    body = {"request_id": req["id"], "kho_id": kho_id, "lines": [
        {"request_line_id": req["lines"][0]["id"], "so_luong": 300, "lot_id": lo_b.id}]}
    r = client.post(f"{BASE}/phieu", headers=tk, json=body)
    assert r.status_code == 400, r.text
    assert "khổ" in r.json()["detail"]
    body["lines"][0]["lot_id"] = lo_a.id
    assert client.post(f"{BASE}/phieu", headers=tk, json=body).status_code == 201


def test_vat_tu_khac_khong_doi_hanh_vi(client):
    from app.models.stock_request import StockRequestLine

    kho_id, mat = _setup(client)
    r = _de_nghi(client, kho_id, "NHAP", [{
        "hang_loai": mat[0], "hang_id": mat[1], "dvt": "to", "sl_de_nghi": 5,
        "dang_giay": "to", "kho_rong": 780, "kho_dai": 905}])
    assert r.status_code == 201, r.text
    db = SessionLocal()
    try:
        ln = db.get(StockRequestLine, r.json()["lines"][0]["id"])
        assert (ln.dang_giay, ln.kho_rong, ln.kho_dai) == (None, 0, 0)   # đọc từ DB, không từ phản hồi
    finally:
        db.close()


def test_phan_hoi_dong_giay_mang_dang_kho_va_quy_doi_theo_dang(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    r = _de_nghi(client, kho_id, "NHAP", [_dong(g, dvt="ram", sl=2, dang="to", kr=905, kd=780, gia=1000)])
    assert r.status_code == 201, r.text
    ln = r.json()["lines"][0]
    assert (ln["dang_giay"], ln["kho_rong"], ln["kho_dai"]) == ("to", 780, 905)
    assert ln["sl_quy_doi"] == 1000 and ln["canh_bao_dv"] is None     # tờ nguyên, không phải kg
    tk = _login(client, "t_thukho")
    r = client.post(f"{BASE}/phieu", headers=tk, json={
        "request_id": r.json()["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": ln["id"], "so_luong": 2}]})
    assert r.status_code == 201, r.text
    pl = r.json()["lines"][0]
    assert (pl["dang_giay"], pl["kho_rong"], pl["kho_dai"]) == ("to", 780, 905)
    assert pl["don_vi_goc"] == "to_nguyen"
    client.post(f"{BASE}/phieu/{r.json()['id']}/ghi-so", headers=tk)
    lo = client.get(f"{BASE}/phieu/lo/danh-sach", headers=_login(client, "t_ketoan"),
                    params={"hang_loai": "giay", "hang_id": g}).json()[0]
    assert lo["dvt"] == "to_nguyen"


def test_dieu_chuyen_giay_tach_theo_dang_va_kho(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    _ba_lo(client, kho_id, g)
    adm = _login(client, "t_thukho")
    r = client.post("/api/kho", json={"ten": "Kho đích"}, headers=_admin(client))
    den = r.json()["id"]
    r = client.post("/api/kho/dieu-chuyen", headers=adm, json={
        "kho_nguon_id": kho_id, "kho_den_id": den, "items": [
            {"hang_loai": "giay", "hang_id": g, "so_luong": 300,
             "dang_giay": "to", "kho_rong": 905, "kho_dai": 780},
            {"hang_loai": "giay", "hang_id": g, "so_luong": 40, "dang_giay": "cuon", "kho_rong": 1000},
        ]})
    assert r.status_code == 201, r.text
    assert r.json()["so_dong"] == 2
    r = client.post(f"{BASE}/phieu/{r.json()['phieu_nhap_id']}/ghi-so", headers=adm)
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        moi = sorted((lo.dang_giay, lo.kho_rong, lo.kho_dai, float(lo.sl_ban_dau))
                     for lo in db.query(StockLot).filter(StockLot.kho_id == den).all())
        assert moi == [("cuon", 1000, 0, 40.0), ("to", 780, 905, 300.0)]
    finally:
        db.close()


def test_dieu_chuyen_giay_thieu_dang_bi_chan(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    _ba_lo(client, kho_id, g)
    adm = _login(client, "t_thukho")
    den = client.post("/api/kho", json={"ten": "Kho đích 2"}, headers=_admin(client)).json()["id"]
    r = client.post("/api/kho/dieu-chuyen", headers=adm, json={
        "kho_nguon_id": kho_id, "kho_den_id": den,
        "items": [{"hang_loai": "giay", "hang_id": g, "so_luong": 10}]})
    assert r.status_code in (400, 409, 422), r.text
    assert "dạng" in r.text
