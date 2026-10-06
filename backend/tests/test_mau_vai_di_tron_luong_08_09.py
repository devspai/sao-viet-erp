"""Vai HCNS phải đi trọn luồng thật — bản rà liên thông 5 phân hệ (08/09/2026), E8 + C12.

HCNS cấp vai từ mẫu rồi: tạo nhân viên kèm tài khoản có vai (đi qua kiểm `nhan_su:assign_role`
từ 07/09), tạo loại nghỉ, mở Bảng lương tháng / Lương nhân viên. Tổ trưởng (không có module nhân
sự) đổ được dropdown "Tạo hộ thợ" qua `/api/overtime/roster` — chỉ thấy người trong tổ.
"""
from __future__ import annotations

from app.db import SessionLocal
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import create_access_token, hash_password
from tests.test_duyet_dung_pham_vi_api import _emp, _lead_token
from tests.test_luong_api import _admin_token, _h


def _dept_id(name: str) -> int:
    db = SessionLocal()
    try:
        return DepartmentRepository(db).get_by_name(name).id
    finally:
        db.close()


#: Bộ quyền HCNS — trước 05/10/2026 lấy từ bảng vai mẫu (`/api/roles/templates`, đã gỡ). Giữ
#: nguyên bộ ô để test vẫn canh đúng luồng: thiếu ô nào là HCNS kẹt đúng bước đó.
_QUYEN_HCNS = {
    "dashboard": {"can_read": True, "scope": "all"},
    "phong_ban": {"can_read": True, "can_set_head": True, "scope": "all"},
    "nhan_su": {
        "can_read": True, "can_create": True, "can_update": True,
        "can_view_salary": True, "can_edit_salary": True, "can_manage_status": True,
        "can_transfer": True, "can_approve": True, "can_export": True,
        "can_assign_role": True, "scope": "all",
    },
    "cham_cong": {
        "can_read": True, "can_create": True, "can_update": True, "can_delete": True,
        "can_view_timesheet": True, "can_view_log": True, "can_adjust": True, "can_lock": True,
        "can_approve": True, "can_approve_late_early": True, "can_manage_locations": True,
        "can_manage_shifts": True, "can_manage_calendar": True, "scope": "all",
    },
    "nghi_phep": {
        "can_read": True, "can_create": True, "can_update": True, "can_delete": True,
        "can_approve": True, "can_cancel": True, "can_manage_leave_types": True, "scope": "all",
    },
    "tang_ca": {"can_read": True, "can_create": True, "can_approve": True, "can_cancel": True,
                "scope": "all"},
    "luong": {
        "can_read": True, "can_create": True, "can_update": True, "can_approve": True,
        "can_lock": True, "can_export": True, "can_view_salary": True, "can_edit_salary": True,
        "can_view_payroll_table": True, "can_manage_salary_profiles": True,
        "can_manage_piece_rates": True, "scope": "all",
    },
    "noi_quy": {"can_read": True, "can_create": True, "can_delete": True, "scope": "all"},
    "self_service": {"can_read": True, "scope": "own"},
}


def _vai_hcns(client, admin, ten: str) -> int:
    """Y hệt người quản trị làm trên màn Vai trò: tạo vai → tick ma trận → Lưu."""
    r = client.post("/api/roles", json={"name": ten, "department_id": _dept_id("Hành chính nhân sự")},
                    headers=_h(admin))
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    rows = [{"module_key": k, **v} for k, v in _QUYEN_HCNS.items()]
    r = client.put(f"/api/roles/{rid}/permissions", json={"permissions": rows}, headers=_h(admin))
    assert r.status_code == 200, r.text
    return rid


def _user_voi_vai(username: str, dept: str, role_id: int) -> str:
    db = SessionLocal()
    try:
        users = UserRepository(db)
        u = users.create(username=username, name=username, password_hash=hash_password("x"))
        users.set_assignment(u, department_id=_dept_id(dept), role_id=role_id, is_active=True)
        db.commit()
        return create_access_token(str(u.id))
    finally:
        db.close()


def test_hcns_di_tron_luong(client):
    admin = _admin_token(client)
    rid = _vai_hcns(client, admin, "HCNS tự khai")
    hcns = _user_voi_vai("hcns-mau", "Hành chính nhân sự", rid)
    db = SessionLocal()
    try:
        tho_role = RoleRepository(db).get_by_name_and_department("Thợ SX", _dept_id("Sản xuất")).id
    finally:
        db.close()
    # (a) tạo NV kèm tài khoản có vai — trước 08/09: 403 "cần quyền Người dùng → Gán vai trò".
    r = client.post("/api/employees", json={
        "full_name": "Thợ mới", "department_id": _dept_id("Sản xuất"), "hire_date": "2026-09-01",
        "gender": "male", "status": "active", "probation_end_date": "2026-12-01",
        "account": {"username": "tho-moi-mau", "password": "Abc12345!", "role_id": tho_role}},
        headers=_h(hcns))
    assert r.status_code == 201, r.text
    # (b) tạo loại nghỉ.
    r = client.post("/api/leaves/types", json={"name": "Nghỉ việc riêng", "is_paid": False,
                                                "annual_quota": 0}, headers=_h(hcns))
    assert r.status_code == 201, r.text
    # (c) ba màn lương tách ô 15/08: bảng lương tháng, hồ sơ lương, đơn giá khoán.
    assert client.get("/api/luong/table", params={"year": 2026, "month": 9},
                      headers=_h(hcns)).status_code == 200
    eid = r_eid = _emp(client, admin, name="Thợ SX", dept="Sản xuất")
    assert client.get(f"/api/luong/salaries/{eid}", headers=_h(hcns)).status_code == 200
    assert r_eid == eid


def test_to_truong_do_duoc_roster_tao_ho_tang_ca(client):
    admin = _admin_token(client)
    sx = _emp(client, admin, name="Thợ SX A", dept="Sản xuất")
    kd = _emp(client, admin, name="NV Kinh doanh", dept="Kinh doanh")
    nghi = _emp(client, admin, name="Thợ đã nghỉ", dept="Sản xuất")
    r = client.post(f"/api/employees/{nghi}/transitions",
                    json={"kind": "resign", "effective_date": "2026-08-01", "resign_reason": "x"},
                    headers=_h(admin))
    assert r.status_code == 200, r.text
    lead = _lead_token()
    # Vai "Tổ trưởng SX" không có module nhân sự: /api/employees vẫn 403 (không nới), roster thì 200.
    assert client.get("/api/employees", headers=_h(lead)).status_code == 403
    r = client.get("/api/overtime/roster", headers=_h(lead))
    assert r.status_code == 200, r.text
    ids = {e["id"] for e in r.json()["employees"]}
    assert sx in ids and kd not in ids and nghi not in ids
    # Vai thợ (không có ô duyệt) không gọi được roster.
    db = SessionLocal()
    try:
        users = UserRepository(db)
        role = RoleRepository(db).get_by_name_and_department("Thợ SX", _dept_id("Sản xuất"))
        u = users.create(username="tho-roster", name="Thợ", password_hash=hash_password("x"))
        users.set_assignment(u, department_id=_dept_id("Sản xuất"), role_id=role.id, is_active=True)
        db.commit()
        tho = create_access_token(str(u.id))
    finally:
        db.close()
    assert client.get("/api/overtime/roster", headers=_h(tho)).status_code == 403
