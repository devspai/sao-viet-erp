"""Tồn + ngưỡng tồn + báo cáo N-X-T của giấy theo KHOÁ (mã, khổ) — spec 2026-10-01-giay-dem-to-theo-kho §3.2.

Giấy tờ: tồn theo (mã, khổ) đếm tờ. Giấy cuộn: gom theo mã, đếm kg. Lô giấy cũ chưa có dạng
không vào khoá 4 phần tử nào. Cặp 2 phần tử giữ hành vi cũ (gom mọi lô của mã).
"""
from __future__ import annotations

from datetime import date

import pytest

from app.db import SessionLocal
from app.models.kho_hang import KhoHang
from app.models.role import SCOPE_ALL
from app.models.stock_lot import StockLot
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.stock_lot_repo import StockLotRepository, StockThresholdRepository
from app.repositories.user_repo import UserRepository
from app.security import hash_password
from tests.test_kho_de_nghi import PW, _admin, _login, _setup
from tests.test_kho_lo_giay import _dong, _don_vi, _giay, _nhap


@pytest.fixture
def db(client):
    """Phiên DB trên CSDL test mà `client` vừa dựng."""
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def _kho(db) -> int:
    k = KhoHang(ma=f"KG{next(_SO_LO)}", ten="Kho giấy")
    db.add(k)
    db.flush()
    return k.id


_SO_LO = iter(range(1, 10_000))


def _lo(db, kho_id, hang, sl, *, dang=None, kr=0, kd=0, trang_thai="available") -> StockLot:
    lot = StockLot(
        ma_lo=f"LOT-T-{next(_SO_LO)}", hang_loai=hang[0], hang_id=hang[1], kho_id=kho_id,
        sl_ban_dau=sl, sl_con_lai=sl, don_gia_nhap=0, ngay_nhap=date(2026, 10, 1),
        trang_thai=trang_thai, dang_giay=dang, kho_rong=kr, kho_dai=kd,
    )
    db.add(lot)
    db.flush()
    return lot


def test_on_hand_map_giay_to_dung_kho_cuon_theo_ma(db):
    k = _kho(db)
    g = 7
    _lo(db, k, ("giay", g), 1000, dang="to", kr=780, kd=905)
    _lo(db, k, ("giay", g), 500, dang="to", kr=800, kd=1090)
    _lo(db, k, ("giay", g), 300, dang="cuon", kr=1000)
    db.commit()
    repo = StockLotRepository(db)
    keys = [("giay", g, 780, 905), ("giay", g, 800, 1090), ("giay", g, 0, 0), ("giay", g, 650, 860)]
    assert repo.on_hand_map(keys) == {keys[0]: 1000.0, keys[1]: 500.0, keys[2]: 300.0, keys[3]: 0.0}
    assert repo.on_hand(("giay", g, 780, 905), k) == 1000.0
    by_kho = repo.on_hand_by_kho([("giay", g, 800, 1090), ("giay", g, 0, 0)])
    assert by_kho == {("giay", g, 800, 1090): {k: 500.0}, ("giay", g, 0, 0): {k: 300.0}}


def test_on_hand_map_cap_hai_phan_tu_giu_hanh_vi_cu(db):
    k = _kho(db)
    _lo(db, k, ("vat_tu", 3), 40)
    _lo(db, k, ("vat_tu", 3), 2, trang_thai="qc_wait")       # không khả dụng
    _lo(db, k, ("giay", 3), 9, dang="to", kr=700, kd=1000)   # cùng id, khác loại — không lẫn
    db.commit()
    repo = StockLotRepository(db)
    assert repo.on_hand_map([("vat_tu", 3)]) == {("vat_tu", 3): 40.0}
    # Vật tư qua khoá 4 phần tử (0, 0) cũng gom theo mã.
    assert repo.on_hand_map([("vat_tu", 3, 0, 0)]) == {("vat_tu", 3, 0, 0): 40.0}
    assert repo.on_hand(("vat_tu", 3)) == 40.0


def test_lo_giay_cu_khong_dang_khong_vao_khoa_nao(db):
    k = _kho(db)
    g = 11
    _lo(db, k, ("giay", g), 250)                              # kg cũ, dang NULL
    db.commit()
    repo = StockLotRepository(db)
    assert repo.on_hand_map([("giay", g, 0, 0), ("giay", g, 780, 905)]) == {
        ("giay", g, 0, 0): 0.0, ("giay", g, 780, 905): 0.0}
    # Cặp 2 phần tử (đường cũ) vẫn thấy.
    assert repo.on_hand_map([("giay", g)]) == {("giay", g): 250.0}


def test_nguong_ton_to_theo_kho_cuon_theo_ma(db):
    k = _kho(db)
    db.commit()
    repo = StockThresholdRepository(db)
    repo.upsert(hang=("giay", 5, 780, 905), kho_id=k, nguong_ton=100)
    repo.upsert(hang=("giay", 5, 800, 1090), kho_id=k, nguong_ton=200)
    repo.upsert(hang=("giay", 5, 0, 0), kho_id=k, nguong_ton=50)
    repo.upsert(hang=("giay", 5, 780, 905), kho_id=k, nguong_ton=120)   # cùng khổ ⇒ đè
    m = repo.map_for([("giay", 5, 780, 905), ("giay", 5, 800, 1090), ("giay", 5, 0, 0)], k)
    assert {kk: float(v.nguong_ton) for kk, v in m.items()} == {
        ("giay", 5, 780, 905): 120.0, ("giay", 5, 800, 1090): 200.0, ("giay", 5, 0, 0): 50.0}
    # Cặp 2 phần tử đọc ngưỡng (…, 0, 0).
    assert float(repo.get_for(("giay", 5), k).nguong_ton) == 50.0


def test_api_nguong_ton_giay_to_mang_kho_hang_khac_ep_0(client):
    kho_id, mat = _setup(client)
    tk = _login(client, "t_thukho")
    r = client.put("/api/kho/nguong-ton", headers=tk, json={
        "hang_loai": "giay", "hang_id": 5, "kho_id": kho_id, "nguong_ton": 10,
        "kho_rong": 905, "kho_dai": 780})
    assert r.status_code == 200, r.text
    assert (r.json()["kho_rong"], r.json()["kho_dai"]) == (780, 905)
    r = client.put("/api/kho/nguong-ton", headers=tk, json={
        "hang_loai": mat[0], "hang_id": mat[1], "kho_id": kho_id, "nguong_ton": 10,
        "kho_rong": 905, "kho_dai": 780})
    assert r.status_code == 200, r.text
    assert (r.json()["kho_rong"], r.json()["kho_dai"]) == (0, 0)
    r = client.put("/api/kho/nguong-ton", headers=tk, json={
        "hang_loai": "giay", "hang_id": 5, "kho_id": kho_id, "nguong_ton": 10, "kho_rong": 905})
    assert r.status_code == 422, r.text


def _nguoi_xem_bao_cao(username: str) -> None:
    """Vai chỉ mở màn Báo cáo kho — KHÔNG có `kho:view_cost`."""
    db = SessionLocal()
    try:
        depts, roles, users = DepartmentRepository(db), RoleRepository(db), UserRepository(db)
        dept = depts.get_by_name("Kế hoạch") or depts.create(name="Kế hoạch")
        role = roles.create(name=f"Vai {username}", department_id=dept.id)
        roles.set_permission(role_id=role.id, module_key="bao_cao_kho", can_read=True, scope=SCOPE_ALL)
        u = users.create(username=username, name=username, password_hash=hash_password(PW))
        users.set_assignment(u, department_id=dept.id, role_id=role.id, is_active=True)
    finally:
        db.close()


def test_bao_cao_nxt_tach_dong_giay_theo_kho(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    _nhap(client, kho_id, _dong(g, dvt="ram", sl=2, dang="to", kr=780, kd=905, gia=1_000_000))
    _nhap(client, kho_id, _dong(g, dvt="ram", sl=1, dang="to", kr=800, kd=1090, gia=600_000))
    _nhap(client, kho_id, _dong(g, dvt="kg", sl=300, dang="cuon", kr=1000, gia=20_000))
    hom_nay = date.today().isoformat()
    q = {"tu": "2026-01-01", "den": hom_nay}

    r = client.get("/api/kho/bao-cao/nxt", headers=_admin(client), params=q)
    assert r.status_code == 200, r.text
    dong = {(x["kho_rong"], x["kho_dai"]): x for x in r.json()["items"] if x["hang_id"] == g
            and x["hang_loai"] == "giay"}
    assert set(dong) == {(780, 905), (800, 1090), (0, 0)}
    assert dong[(780, 905)]["nhap_sl"] == 1000 and dong[(800, 1090)]["nhap_sl"] == 500
    assert dong[(0, 0)]["nhap_sl"] == 300
    assert dong[(780, 905)]["dvt"] == "tờ" and dong[(0, 0)]["dvt"] == "kg"
    assert dong[(780, 905)]["nhap_gt"] == 2_000_000

    # Sổ dòng mang khổ từng dòng phiếu.
    r = client.get("/api/kho/bao-cao/dong", headers=_admin(client), params=q)
    assert r.status_code == 200, r.text
    so = [(x["dang_giay"], x["kho_rong"], x["kho_dai"], x["dvt"]) for x in r.json()["items"]]
    assert ("to", 780, 905, "tờ") in so and ("cuon", 1000, 0, "kg") in so

    # Không có `kho:view_cost` ⇒ vẫn thấy số lượng, không thấy tiền.
    _nguoi_xem_bao_cao("t_xem_bc")
    r = client.get("/api/kho/bao-cao/nxt", headers=_login(client, "t_xem_bc"), params=q)
    assert r.status_code == 200, r.text
    to = next(x for x in r.json()["items"] if x["hang_id"] == g and x["kho_rong"] == 780)
    assert to["nhap_sl"] == 1000 and to["nhap_gt"] is None and to["don_gia_bq"] is None


def test_tinh_gia_ky_snapshot_tach_kho_noi_chuoi(client):
    kho_id, _ = _setup(client)
    _don_vi()
    g = _giay()
    _nhap(client, kho_id, _dong(g, dvt="ram", sl=2, dang="to", kr=780, kd=905, gia=1_000_000))
    _nhap(client, kho_id, _dong(g, dvt="ram", sl=1, dang="to", kr=800, kd=1090, gia=600_000))
    hom_nay = date.today()
    ad = _admin(client)
    r = client.post("/api/kho/bao-cao/tinh-gia-ky", headers=ad, json={
        "tu": "2026-01-01", "den": hom_nay.isoformat(), "kho_id": kho_id})
    assert r.status_code == 200, r.text
    # Kỳ sau đọc snapshot làm đầu kỳ — đúng từng khổ.
    sau = date.fromordinal(hom_nay.toordinal() + 1).isoformat()
    r = client.get("/api/kho/bao-cao/nxt", headers=ad, params={"tu": sau, "den": sau, "kho_id": kho_id})
    assert r.status_code == 200, r.text
    dau = {(x["kho_rong"], x["kho_dai"]): x["dau_sl"] for x in r.json()["items"] if x["hang_id"] == g}
    assert dau == {(780, 905): 1000, (800, 1090): 500}
