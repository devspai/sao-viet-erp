"""PDF báo giá + Excel khấu hao đi theo ô THAO TÁC (05/10/2026).

Trước đó máy chủ gác hai việc này bằng `export` — mà ma trận quyền không bày ô `can_export` cho Báo
giá lẫn Tài sản ⇒ ngoài admin không ai tải được, dù vai đã bật đủ Xem + Thao tác.
"""

from __future__ import annotations

from app.db import SessionLocal
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import create_access_token, hash_password

from .test_quotations_api import _admin_token, _create, _mk_ptg


def _vai(ten: str, khoa: str, **co) -> dict:
    db = SessionLocal()
    try:
        dept = DepartmentRepository(db).get_by_name("Sản xuất")
        roles, users = RoleRepository(db), UserRepository(db)
        r = roles.create(name=f"Vai {ten}", department_id=dept.id)
        roles.set_permission(role_id=r.id, module_key=khoa, scope="all", can_read=True, **co)
        u = users.create(username=ten, name=ten, password_hash=hash_password("x"))
        users.set_assignment(u, department_id=dept.id, role_id=r.id, is_active=True)
        db.commit()
        return {"Authorization": f"Bearer {create_access_token(str(u.id))}"}
    finally:
        db.close()


def test_pdf_bao_gia_theo_o_thao_tac(client):
    q = _create(client, _admin_token(client), _mk_ptg())
    url = f"/api/quotations/{q['id']}/pdf"

    assert client.get(url, headers=_vai("bg-chi-xem", "bao_gia")).status_code == 403
    r = client.get(url, headers=_vai("bg-thao-tac", "bao_gia", can_create=True, can_update=True,
                                     can_delete=True))
    assert r.status_code == 200, r.text
    assert r.content[:5] == b"%PDF-"


def test_excel_khau_hao_theo_o_thao_tac(client):
    url = "/api/tai-san/thang/2026/3/excel"

    assert client.get(url, headers=_vai("ts-chi-xem", "tai_san")).status_code == 403
    r = client.get(url, headers=_vai("ts-thao-tac", "tai_san", can_create=True, can_update=True,
                                     can_delete=True))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
