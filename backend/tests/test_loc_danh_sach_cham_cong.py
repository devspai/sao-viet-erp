"""Kỳ + bộ lọc + phân trang ở MÁY CHỦ cho các danh sách Chấm công / Nghỉ phép / Tăng ca
(06/10/2026): Nhật ký chấm công, Yêu cầu chỉnh công, Đi muộn/về sớm, Nghỉ phép, Tăng ca.

Kỳ là NGÀY giờ Việt Nam: mốc lưu UTC 30/09 17:30 = 01/10 00:30 giờ VN ⇒ thuộc tháng 10.
"""
from __future__ import annotations

from datetime import date, datetime

from app.db import SessionLocal
from app.models.attendance import AttendanceAdjustRequest, AttendanceLog, WorkLocation, WorkShift
from app.models.employee import Employee
from app.models.late_early import LateEarlyRequest
from app.models.leave import LeaveRequest, LeaveType
from app.models.overtime import OvertimeRequest
from app.repositories.rbac_repo import DepartmentRepository
from app.services.late_early_service import kieu_vang
from tests.test_duyet_dung_pham_vi_api import _emp
from tests.test_luong_api import _admin_token, _h

THANG_10 = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31"}
TRONG_THANG_10 = datetime(2026, 9, 30, 17, 30)   # 01/10 00:30 giờ VN
NGOAI_THANG_10 = datetime(2026, 9, 30, 16, 30)   # 30/09 23:30 giờ VN


def _them(*objs):
    db = SessionLocal()
    try:
        for o in objs:
            db.add(o)
        db.commit()
        return [o.id for o in objs]
    finally:
        db.close()


def _phong(ten: str) -> int:
    db = SessionLocal()
    try:
        return DepartmentRepository(db).get_by_name(ten).id
    finally:
        db.close()


def _ids(r) -> list[int]:
    assert r.status_code == 200, r.text
    return [x["id"] for x in r.json()["items"]]


# --- Nhật ký chấm công --------------------------------------------------------


def test_nhat_ky_ky_theo_gio_cham_va_ngay_tao_ranh_gio_vn(client):
    h = _h(_admin_token(client))
    a = _emp(client, _admin_token(client), name="NK Lọc A", dept="Kinh doanh")
    trong, ngoai = _them(
        AttendanceLog(employee_id=a, check_type="in", checked_at=TRONG_THANG_10,
                      created_at=NGOAI_THANG_10),
        AttendanceLog(employee_id=a, check_type="out", checked_at=NGOAI_THANG_10,
                      created_at=TRONG_THANG_10),
    )
    # Mốc mặc định = giờ chấm.
    assert _ids(client.get("/api/attendance/logs", params={**THANG_10, "employee_id": a},
                           headers=h)) == [trong]
    assert _ids(client.get("/api/attendance/logs",
                           params={**THANG_10, "moc": "tao", "employee_id": a}, headers=h)) == [ngoai]
    assert client.get("/api/attendance/logs", params={"moc": "xyz"}, headers=h).status_code == 422


def test_nhat_ky_loc_diem_phong_va_lua_chon(client):
    h = _h(_admin_token(client))
    t = _admin_token(client)
    a = _emp(client, t, name="NK Điểm A", dept="Kinh doanh")
    b = _emp(client, t, name="NK Điểm B", dept="Hành chính nhân sự")
    (diem,) = _them(WorkLocation(name="Cổng lọc", latitude=10, longitude=106, radius_m=100))
    la, lb = _them(
        AttendanceLog(employee_id=a, check_type="in", checked_at=datetime(2026, 10, 2, 1),
                      work_location_id=diem),
        AttendanceLog(employee_id=b, check_type="in", checked_at=datetime(2026, 10, 2, 2)),
    )
    r = client.get("/api/attendance/logs", params={"diem": diem}, headers=h)
    assert _ids(r) == [la] and r.json()["total"] == 1
    assert lb in _ids(client.get("/api/attendance/logs", params={"phong": _phong("Hành chính nhân sự")},
                                 headers=h))
    assert la not in _ids(client.get("/api/attendance/logs",
                                     params={"phong": _phong("Hành chính nhân sự")}, headers=h))
    ds = client.get("/api/attendance/logs/loc/diem", headers=h).json()
    assert {"id": diem, "ten": "Cổng lọc", "so": 1} in ds
    nv = {x["id"]: x["so"] for x in client.get("/api/attendance/logs/loc/nhan_vien", headers=h).json()}
    assert nv[a] == 1 and nv[b] == 1


# --- Yêu cầu chỉnh công -------------------------------------------------------


def test_chinh_cong_ky_dem_tab_va_ngay_tao(client):
    h = _h(_admin_token(client))
    a = _emp(client, _admin_token(client), name="CC Lọc A", dept="Kinh doanh")
    y1, y2, y3 = _them(
        AttendanceAdjustRequest(employee_id=a, work_date=date(2026, 9, 29), check_type="in",
                                reason="x", status="pending", created_at=TRONG_THANG_10),
        AttendanceAdjustRequest(employee_id=a, work_date=date(2026, 10, 5), check_type="out",
                                reason="x", status="approved", created_at=TRONG_THANG_10),
        AttendanceAdjustRequest(employee_id=a, work_date=date(2026, 10, 6), check_type="in",
                                reason="x", status="pending", created_at=NGOAI_THANG_10),
    )
    r = client.get("/api/attendance/adjust-requests",
                   params={**THANG_10, "status": "pending", "employee_id": a}, headers=h).json()
    assert [x["id"] for x in r["items"]] == [y1] and r["total"] == 1
    assert r["dem_theo_tab"] == {"pending": 1, "approved": 1, "tat_ca": 2}
    assert r["items"][0]["created_at"]
    # Mốc ngày công (cột Date).
    r = client.get("/api/attendance/adjust-requests",
                   params={**THANG_10, "moc": "ngay_cong", "status": "all", "employee_id": a},
                   headers=h)
    assert sorted(_ids(r)) == sorted([y2, y3])


# --- Đi muộn / về sớm ---------------------------------------------------------


def test_kieu_vang_khop_luat_man_hinh():
    # Ca 08:00–17:00.
    assert kieu_vang(480, 540, 480, 1020, False) == "late"
    assert kieu_vang(960, 1020, 480, 1020, False) == "early"
    assert kieu_vang(480, 780, 480, 1020, False) == "half"
    assert kieu_vang(600, 660, 480, 1020, False) == "mid"
    # Ca đêm 22:00–06:00: về sớm lúc 05:00 (giờ đồng hồ) nằm trên trục "hôm sau".
    assert kieu_vang(300, 360, 1320, 360, True) == "early"
    assert kieu_vang(480, 540, None, None, None) is None


def test_di_muon_loc_kieu_ky_va_dem_tab_o_may_chu(client):
    h = _h(_admin_token(client))
    a = _emp(client, _admin_token(client), name="DM Lọc A", dept="Kinh doanh")
    (ca,) = _them(WorkShift(name="Ca lọc 8-17", start_minute=480, end_minute=1020))
    db = SessionLocal()
    try:
        db.get(Employee, a).default_shift_id = ca
        db.commit()
    finally:
        db.close()
    muon, som, som_cu = _them(
        LateEarlyRequest(employee_id=a, work_date=date(2026, 10, 2), from_minute=480,
                         to_minute=540, status="pending", created_at=TRONG_THANG_10),
        LateEarlyRequest(employee_id=a, work_date=date(2026, 10, 3), from_minute=960,
                         to_minute=1020, status="approved", created_at=TRONG_THANG_10),
        LateEarlyRequest(employee_id=a, work_date=date(2026, 9, 30), from_minute=960,
                         to_minute=1020, status="pending", created_at=NGOAI_THANG_10),
    )
    r = client.get("/api/late-early", params={"employee_id": a, "kieu": "early"}, headers=h).json()
    assert sorted(x["id"] for x in r["items"]) == sorted([som, som_cu])
    assert r["dem_theo_tab"] == {"approved": 1, "pending": 1, "tat_ca": 2}
    r = client.get("/api/late-early", params={**THANG_10, "employee_id": a, "kieu": "early",
                                             "status_filter": "approved"}, headers=h).json()
    assert [x["id"] for x in r["items"]] == [som] and r["total"] == 1
    r = client.get("/api/late-early", params={**THANG_10, "moc": "ngay_cong", "employee_id": a,
                                             "size": 1}, headers=h).json()
    assert r["total"] == 2 and len(r["items"]) == 1 and r["items"][0]["id"] == muon  # chờ duyệt lên đầu
    assert any(x["id"] == a for x in client.get("/api/late-early/loc/nhan_vien", headers=h).json())


# --- Nghỉ phép ----------------------------------------------------------------


def test_nghi_phep_moc_nghi_giao_ky_va_loc_loai(client):
    h = _h(_admin_token(client))
    a = _emp(client, _admin_token(client), name="NP Lọc A", dept="Kinh doanh")
    l1, l2 = _them(LeaveType(name="Phép lọc 1", is_paid=True, annual_quota=12),
                   LeaveType(name="Phép lọc 2", is_paid=False, annual_quota=0))
    vat, truoc, sau = _them(
        # Đơn 28/09–03/10 vắt qua đầu tháng 10 ⇒ khớp kỳ tháng 10 theo mốc nghỉ.
        LeaveRequest(employee_id=a, leave_type_id=l1, start_date=date(2026, 9, 28),
                     end_date=date(2026, 10, 3), days=6, created_at=NGOAI_THANG_10),
        LeaveRequest(employee_id=a, leave_type_id=l1, start_date=date(2026, 9, 10),
                     end_date=date(2026, 9, 11), days=2, created_at=TRONG_THANG_10),
        LeaveRequest(employee_id=a, leave_type_id=l2, start_date=date(2026, 10, 20),
                     end_date=date(2026, 10, 20), days=1, status="approved",
                     created_at=datetime(2026, 10, 10, 3)),
    )
    r = client.get("/api/leaves", params={**THANG_10, "moc": "nghi", "employee_id": a}, headers=h)
    assert sorted(_ids(r)) == sorted([vat, sau])
    r = client.get("/api/leaves", params={**THANG_10, "employee_id": a}, headers=h).json()
    assert [x["id"] for x in r["items"]] == [sau, truoc], "mốc tạo + mới tạo nhất lên đầu"
    assert r["dem_theo_tab"] == {"pending": 1, "approved": 1, "tat_ca": 2}
    r = client.get("/api/leaves", params={"employee_id": a, "loai": l2}, headers=h)
    assert _ids(r) == [sau]
    r = client.get("/api/leaves", params={"employee_id": a, "status": "pending"}, headers=h).json()
    assert r["total"] == 2 and r["dem_theo_tab"]["tat_ca"] == 3
    assert any(x["id"] == a and x["so"] == 3
               for x in client.get("/api/leaves/loc/nhan_vien", headers=h).json())


# --- Tăng ca ------------------------------------------------------------------


def test_tang_ca_ky_theo_ngay_tao_va_ngay_cong(client):
    h = _h(_admin_token(client))
    a = _emp(client, _admin_token(client), name="TC Lọc A", dept="Kinh doanh")
    o1, o2 = _them(
        OvertimeRequest(employee_id=a, work_date=date(2026, 9, 30), from_minute=1080,
                        to_minute=1200, status="approved", created_at=TRONG_THANG_10),
        OvertimeRequest(employee_id=a, work_date=date(2026, 10, 1), from_minute=1080,
                        to_minute=1200, status="pending", created_at=NGOAI_THANG_10),
    )
    r = client.get("/api/overtime", params={**THANG_10, "employee_id": a}, headers=h).json()
    assert [x["id"] for x in r["items"]] == [o1]
    assert r["dem_theo_tab"] == {"approved": 1, "tat_ca": 1}
    r = client.get("/api/overtime", params={**THANG_10, "moc": "ngay_cong", "employee_id": a},
                   headers=h)
    assert _ids(r) == [o2]
    assert _ids(client.get("/api/overtime", params={"phong": _phong("Kinh doanh"),
                                                    "employee_id": a}, headers=h)) == [o1, o2]
    assert _ids(client.get("/api/overtime", params={"phong": _phong("Hành chính nhân sự"),
                                                    "employee_id": a}, headers=h)) == []
