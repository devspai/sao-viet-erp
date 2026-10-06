"""Thanh lọc ba danh sách Nhân sự — Hồ sơ nhân sự, Phòng ban, Nội quy (06/10/2026).

Luật: lọc ở MÁY CHỦ; kỳ gửi `tu_ngay` / `den_ngay` / `moc`, ranh ngày theo giờ VN.
"""
from __future__ import annotations

import io
from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.department import Department
from app.models.employee import Employee
from app.models.noi_quy import NoiQuyRecord

from .test_employees_api import _admin_token, _create, _dept_id, _h

VN = timezone(timedelta(hours=7))


def _vn(*a) -> datetime:
    """Mốc giờ VN, cất dạng UTC như ứng dụng vẫn ghi — SQLite không tự đổi múi."""
    return datetime(*a, tzinfo=VN).astimezone(timezone.utc)


def _dat(model, id_: int, **cot) -> None:
    db = SessionLocal()
    try:
        row = db.get(model, id_)
        for k, v in cot.items():
            setattr(row, k, v)
        db.commit()
    finally:
        db.close()


# --- Hồ sơ nhân sự --------------------------------------------------------------------------------

def test_nhan_su_loc_ngay_tao_ranh_gio_vn(client):
    t = _admin_token(client)
    a = _create(client, t, full_name="Nguyễn Kỳ A").json()["employee"]
    b = _create(client, t, full_name="Nguyễn Kỳ B").json()["employee"]
    # 01/10 00:30 VN ⇒ THUỘC tháng 10; 30/09 23:30 VN ⇒ ngoài.
    _dat(Employee, a["id"], created_at=_vn(2026, 10, 1, 0, 30))
    _dat(Employee, b["id"], created_at=_vn(2026, 9, 30, 23, 30))
    r = client.get("/api/employees", params={"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31",
                                             "moc": "tao", "q": "Kỳ"}, headers=_h(t))
    assert r.status_code == 200, r.text
    body = r.json()
    assert [x["id"] for x in body["items"]] == [a["id"]]
    assert body["total"] == 1
    assert body["items"][0]["created_at"] is not None


def test_nhan_su_loc_ngay_vao_lam(client):
    t = _admin_token(client)
    a = _create(client, t, full_name="Trần Vào A", hire_date="2024-03-01").json()["employee"]
    _create(client, t, full_name="Trần Vào B", hire_date="2024-05-01")
    r = client.get("/api/employees", params={"tu_ngay": "2024-03-01", "den_ngay": "2024-03-31",
                                             "moc": "vao_lam", "q": "Vào"}, headers=_h(t))
    assert [x["id"] for x in r.json()["items"]] == [a["id"]]
    # Mốc lạ bị chặn.
    assert client.get("/api/employees", params={"moc": "xyz"}, headers=_h(t)).status_code == 422


def test_nhan_su_xuat_excel_theo_ky(client):
    t = _admin_token(client)
    _create(client, t, full_name="Lê Xuất", hire_date="2023-01-10")
    r = client.get("/api/employees/export.xlsx",
                   params={"tu_ngay": "2023-01-01", "den_ngay": "2023-01-31", "moc": "vao_lam"},
                   headers=_h(t))
    assert r.status_code == 200, r.text


# --- Phòng ban ------------------------------------------------------------------------------------

def _phong(client, t, ten: str, **kw) -> int:
    r = client.post("/api/departments", json={"name": ten, **kw}, headers=_h(t))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_phong_ban_khong_loc_tra_tron_cay(client):
    t = _admin_token(client)
    rows = client.get("/api/departments", headers=_h(t)).json()
    assert rows and all(x["khop"] for x in rows)
    assert all("created_at" in x for x in rows)


def test_phong_ban_loc_khoi_tra_kem_to_tien(client):
    t = _admin_token(client)
    goc = _phong(client, t, "Khối Thử SX", la_san_xuat=True)
    to = _phong(client, t, "Tổ Thử In", parent_id=goc)
    ngoai = _phong(client, t, "Phòng Thử Ngoài")
    rows = client.get("/api/departments", params={"khoi": "san_xuat", "q": "Thử In"},
                      headers=_h(t)).json()
    theo_id = {x["id"]: x for x in rows}
    # Tổ con KẾ THỪA khối sản xuất từ cha; cha trả kèm để vẽ cây nhưng không tính là khớp.
    assert theo_id[to]["khop"] is True
    assert theo_id[goc]["khop"] is False
    assert ngoai not in theo_id
    rows = client.get("/api/departments", params={"khoi": "ngoai_sx", "q": "Thử"},
                      headers=_h(t)).json()
    assert {x["id"] for x in rows if x["khop"]} == {ngoai}


def test_phong_ban_loc_tinh_trang_va_ngay_tao(client):
    t = _admin_token(client)
    trong = _phong(client, t, "Phòng Trống Người")
    co_nguoi = _phong(client, t, "Phòng Có Người")
    _create(client, t, full_name="Người Của Phòng", department_id=co_nguoi)
    def khop(params):
        rows = client.get("/api/departments", params=params, headers=_h(t)).json()
        return {x["id"] for x in rows if x["khop"]}
    assert trong in khop({"tinh_trang": "chua_co_nguoi"})
    assert co_nguoi not in khop({"tinh_trang": "chua_co_nguoi"})
    assert co_nguoi in khop({"tinh_trang": "thieu_truong"})
    # Ngày tạo theo giờ VN.
    _dat(Department, trong, created_at=_vn(2025, 10, 1, 0, 30))
    _dat(Department, co_nguoi, created_at=_vn(2025, 9, 30, 23, 30))
    assert khop({"tu_ngay": "2025-10-01", "den_ngay": "2025-10-31", "moc": "tao"}) == {trong}


# --- Nội quy --------------------------------------------------------------------------------------

def _tai(client, t, ten: str, *, anh: bool = False) -> int:
    tep = (("a.png", io.BytesIO(b"\x89PNG\r\n\x1a\nxx"), "image/png") if anh
           else ("a.pdf", io.BytesIO(b"%PDF-1.4\nx\n%%EOF"), "application/pdf"))
    r = client.post("/api/noi-quy", data={"name": ten}, files={"file": tep}, headers=_h(t))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_noi_quy_loc_ngay_tai_loai_tep_nguoi_tai(client):
    t = _admin_token(client)
    a = _tai(client, t, "Nội quy A")
    b = _tai(client, t, "Nội quy B", anh=True)
    _dat(NoiQuyRecord, a, uploaded_at=_vn(2026, 10, 1, 0, 30))
    _dat(NoiQuyRecord, b, uploaded_at=_vn(2026, 9, 30, 23, 30))

    def ids(params):
        r = client.get("/api/noi-quy", params=params, headers=_h(t))
        assert r.status_code == 200, r.text
        return [x["id"] for x in r.json()["items"]]

    assert ids({"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31", "moc": "tao"}) == [a]
    assert ids({"loai": "anh"}) == [b]
    assert ids({"loai": "pdf"}) == [a]

    nguoi = client.get("/api/noi-quy/nguoi-tai-loc", headers=_h(t)).json()
    assert len(nguoi) == 1 and nguoi[0]["so"] == 2 and nguoi[0]["ten"]
    assert set(ids({"nguoi": nguoi[0]["id"]})) == {a, b}
    assert ids({"nguoi": nguoi[0]["id"] + 999}) == []
