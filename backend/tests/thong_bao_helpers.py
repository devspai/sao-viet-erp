"""Helper dùng chung cho test chấm đỏ thanh bên (module_notifications)."""
from __future__ import annotations

from app.db import SessionLocal
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import hash_password

PW = "matkhau123"


def tao_nguoi(username: str, perms: dict[str, dict], *, phong: str = "Phòng thử chấm") -> int:
    db = SessionLocal()
    try:
        depts, roles, users = DepartmentRepository(db), RoleRepository(db), UserRepository(db)
        dept = depts.get_by_name(phong) or depts.create(name=phong)
        role = roles.create(name=f"Vai {username}", department_id=dept.id)
        for module, p in perms.items():
            roles.set_permission(role_id=role.id, module_key=module, **p)
        u = users.create(username=username, name=username, password_hash=hash_password(PW))
        users.set_assignment(u, department_id=dept.id, role_id=role.id, is_active=True)
        return u.id
    finally:
        db.close()


def dang_nhap(client, username: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"username": username, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def tom_tat(client, h) -> dict:
    r = client.get("/api/module-notifications/summary", headers=h)
    assert r.status_code == 200, r.text
    return r.json()["kenh"]


def da_xem(client, h, kenh: str) -> None:
    r = client.post(f"/api/module-notifications/{kenh}/mark-read", headers=h)
    assert r.status_code == 204, r.text


def phong_id(ten: str) -> int:
    db = SessionLocal()
    try:
        d = DepartmentRepository(db)
        return (d.get_by_name(ten) or d.create(name=ten)).id
    finally:
        db.close()


def admin(client) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def tao_ho_so(client, h_admin, *, ten: str, phong: str, user_id: int | None = None) -> int:
    """Hồ sơ nhân sự ở `phong`, gắn tài khoản `user_id` nếu có. Trả employee id."""
    from app.repositories.employee_repo import EmployeeRepository

    r = client.post("/api/employees", json={
        "full_name": ten, "department_id": phong_id(phong), "hire_date": "2020-01-01",
        "gender": "male", "probation_end_date": "2025-12-31", "status": "active",
    }, headers=h_admin)
    assert r.status_code in (200, 201), r.text
    eid = r.json()["employee"]["id"]
    if user_id is not None:
        db = SessionLocal()
        try:
            emps = EmployeeRepository(db)
            emps.update(emps.get_by_id(eid), user_id=user_id)
        finally:
            db.close()
    return eid
