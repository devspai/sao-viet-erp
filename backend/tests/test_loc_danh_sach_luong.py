"""Thanh lọc hai danh sách của màn Lương — lọc / đếm / chia trang ở MÁY CHỦ (06/10/2026).

* Tạm ứng (`GET /api/luong/advances`): tab trạng thái đếm sau lọc, Loại, Tổ, Số tiền, kỳ theo Ngày
  tạo (ranh giờ VN) hoặc Ngày ứng, ô tìm không dấu, chia trang.
* Bảng lương tháng (`GET /api/luong/table`): tìm tên / mã, Phòng / tổ, Chính thức / Thử việc.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.db import SessionLocal
from app.models.payroll import SalaryAdvance

from .test_luong_api import _admin_token, _chi, _dept_id, _h

NAM, THANG = 2026, 6
URL = "/api/luong/advances"


def _nv(client, token, ten: str, *, phong: str = "Hành chính nhân sự", status: str | None = None) -> int:
    body = {"full_name": ten, "department_id": _dept_id(phong), "hire_date": "2020-01-01",
            "gender": "male", "probation_end_date": "2025-12-31"}
    if status:
        body["status"] = status
    r = client.post("/api/employees", json=body, headers=_h(token))
    assert r.status_code in (200, 201), r.text
    return r.json()["employee"]["id"]


def _ung(client, token, eid: int, so_tien: float, *, ngay: str = "2026-06-05", loai: str = "tam_ung") -> int:
    r = client.post(URL, json={"employee_id": eid, "period_year": NAM, "period_month": THANG,
                               "advance_date": ngay, "amount": so_tien, "kind": loai},
                    headers=_h(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _dat_ngay_tao(aid: int, luc: datetime) -> None:
    db = SessionLocal()
    try:
        db.get(SalaryAdvance, aid).created_at = luc
        db.commit()
    finally:
        db.close()


def _ds(client, token, **p):
    r = client.get(URL, params={"year": NAM, "month": THANG, **p}, headers=_h(token))
    assert r.status_code == 200, r.text
    return r.json()


def _ma(j) -> set[int]:
    return {a["id"] for a in j["items"]}


def test_tam_ung_ngay_tao_ranh_gio_vn(client):
    tok = _admin_token(client)
    e = _nv(client, tok, "Ranh Giới")
    a = _ung(client, tok, e, 100_000)
    b = _ung(client, tok, e, 200_000)
    # 31/05 17:30 UTC = 01/06 00:30 giờ VN ⇒ THUỘC tháng 6; 31/05 16:30 UTC = 31/05 23:30 VN ⇒ ngoài.
    _dat_ngay_tao(a, datetime(2026, 5, 31, 17, 30, tzinfo=timezone.utc))
    _dat_ngay_tao(b, datetime(2026, 5, 31, 16, 30, tzinfo=timezone.utc))
    j = _ds(client, tok, tu_ngay="2026-06-01", den_ngay="2026-06-30", moc="tao")
    assert _ma(j) == {a}
    assert j["total"] == 1


def test_tam_ung_moc_ngay_ung(client):
    tok = _admin_token(client)
    e = _nv(client, tok, "Mốc Ngày Ứng")
    a = _ung(client, tok, e, 100_000, ngay="2026-06-03")
    _ung(client, tok, e, 100_000, ngay="2026-06-20")
    j = _ds(client, tok, tu_ngay="2026-06-01", den_ngay="2026-06-10", moc="ung")
    assert _ma(j) == {a}


def test_tam_ung_loai_to_so_tien_va_tim(client):
    tok = _admin_token(client)
    hc = _nv(client, tok, "Nguyễn Văn Hành")
    kd = _nv(client, tok, "Trần Thị Doanh", phong="Kinh doanh")
    a = _ung(client, tok, hc, 500_000)
    b = _ung(client, tok, hc, 3_000_000, loai="luong_dot_1")
    c = _ung(client, tok, kd, 1_500_000)

    assert _ma(_ds(client, tok, loai="luong_dot_1")) == {b}
    assert _ma(_ds(client, tok, to=_dept_id("Kinh doanh"))) == {c}
    assert _ma(_ds(client, tok, tien_tu=1_000_000, tien_den=2_000_000)) == {c}
    # Tìm không dấu theo tên.
    assert _ma(_ds(client, tok, q="nguyen hanh")) == {a, b}

    # Menu tổ đếm sau các điều kiện khác, chưa áp chính điều kiện tổ.
    j = _ds(client, tok, loai="tam_ung", to=_dept_id("Kinh doanh"))
    so = {t["id"]: t["so"] for t in j["to_loc"]}
    assert so == {_dept_id("Hành chính nhân sự"): 1, _dept_id("Kinh doanh"): 1}
    # Chip "Đã duyệt" tính cả kỳ, không theo bộ lọc — chưa duyệt phiếu nào.
    assert j["tong_da_duyet"] == 0


def test_tam_ung_dem_theo_tab_va_chia_trang(client):
    tok = _admin_token(client)
    e = _nv(client, tok, "Đếm Tab")
    cho = _ung(client, tok, e, 100_000)
    duyet = _ung(client, tok, e, 200_000)
    da_chi = _ung(client, tok, e, 300_000)
    huy = _ung(client, tok, e, 400_000, loai="luong_dot_1")
    for aid in (duyet, da_chi):
        assert client.post(f"{URL}/{aid}/approve", json={"approve": True},
                           headers=_h(tok)).status_code == 200
    _chi(client, tok, da_chi)
    assert client.post(f"{URL}/{huy}/reject", json={}, headers=_h(tok)).status_code == 200

    j = _ds(client, tok)
    assert j["dem_theo_tab"] == {"tat_ca": 4, "cho_duyet": 1, "cho_chi": 1, "da_chi": 1, "tu_choi": 1}
    assert j["tong_da_duyet"] == 500_000
    # Đếm tab theo bộ lọc (loại tạm ứng bỏ phiếu đợt 1 bị từ chối).
    assert _ds(client, tok, loai="tam_ung")["dem_theo_tab"]["tu_choi"] == 0
    # Tab lọc trên máy chủ; `ids_tab` bỏ qua điều kiện để màn tỉa lựa chọn.
    j = _ds(client, tok, tab="cho_chi", loai="luong_dot_1")
    assert j["items"] == [] and j["ids_tab"] == [duyet] and j["ids_loc"] == []
    assert _ma(_ds(client, tok, tab="da_chi")) == {da_chi}
    assert _ma(_ds(client, tok, tab="cho_duyet")) == {cho}

    p1 = _ds(client, tok, page=1, size=3)
    p2 = _ds(client, tok, page=2, size=3)
    assert p1["total"] == 4 and len(p1["items"]) == 3 and len(p2["items"]) == 1
    assert len(p1["ids_loc"]) == 4
    assert _ma(p1) | _ma(p2) == {cho, duyet, da_chi, huy}


def test_bang_luong_loc_o_may_chu(client):
    tok = _admin_token(client)
    ct = _nv(client, tok, "Lê Chính Thức", status="active")
    tv = _nv(client, tok, "Phạm Thử Việc", phong="Kinh doanh")
    assert client.post("/api/luong/generate", json={"year": NAM, "month": THANG},
                       headers=_h(tok)).status_code == 200

    def _bang(**p):
        r = client.get("/api/luong/table", params={"year": NAM, "month": THANG, **p}, headers=_h(tok))
        assert r.status_code == 200, r.text
        return r.json()

    tat_ca = {l["employee_id"] for l in _bang()["lines"]}
    assert {ct, tv} <= tat_ca
    assert {l["employee_id"] for l in _bang(hd="tv")["lines"]} & {ct, tv} == {tv}
    assert {l["employee_id"] for l in _bang(hd="ct")["lines"]} & {ct, tv} == {ct}
    j = _bang(phong=_dept_id("Kinh doanh"))
    assert {l["employee_id"] for l in j["lines"]} & {ct, tv} == {tv}
    assert all(l["department_id"] == _dept_id("Kinh doanh") for l in j["lines"])
    # Menu Phòng / tổ vẫn đủ các tổ khi đang lọc một tổ, kèm số người.
    so = {p["id"]: p["so"] for p in j["phong_loc"]}
    assert so[_dept_id("Hành chính nhân sự")] >= 1 and so[_dept_id("Kinh doanh")] >= 1
    assert {l["employee_id"] for l in _bang(q="pham thu")["lines"]} == {tv}
