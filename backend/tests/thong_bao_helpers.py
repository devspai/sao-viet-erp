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
