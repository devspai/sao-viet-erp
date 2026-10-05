"""Màn Phòng ban không được N+1 (04/10/2026).

Đo trên DB dev (39 phòng, ma trận 81 dòng): `GET /departments` ~0,74s vì đếm 3 câu cho TỪNG phòng;
bấm "Lưu thay đổi" ma trận quyền SELECT + COMMIT + đọc lại cho TỪNG dòng (~80 commit). Các guard
dưới đây đếm câu SQL: thêm phòng / thêm người thì số câu KHÔNG được tăng, lưu ma trận chỉ một commit.
"""
from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy import event

from app.db import SessionLocal, engine
from app.repositories.employee_repo import EmployeeRepository
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import hash_password


@contextmanager
def _dem():
    n = {"q": 0, "commit": 0}

    def on_exec(*_a, **_k):
        n["q"] += 1

    def on_commit(*_a, **_k):
        n["commit"] += 1

    event.listen(engine, "before_cursor_execute", on_exec)
    event.listen(engine, "commit", on_commit)
    try:
        yield n
    finally:
        event.remove(engine, "before_cursor_execute", on_exec)
        event.remove(engine, "commit", on_commit)


def _h(client) -> dict[str, str]:
    tok = client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin123"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def _so_cau(client, h, url) -> int:
    with _dem() as n:
        r = client.get(url, headers=h)
    assert r.status_code == 200, r.text
    return n["q"]


def _them_nguoi(dept_id: int, so: int, prefix: str, role_id: int | None = None) -> list[int]:
    """Tài khoản + HỒ SƠ gắn với nó (màn Phòng ban liệt kê nhân sự theo hồ sơ)."""
    db = SessionLocal()
    try:
        users = UserRepository(db)
        emps = EmployeeRepository(db)
        ids = []
        for i in range(so):
            u = users.create(username=f"{prefix}{i}", name=f"{prefix} {i}", password_hash=hash_password("x"))
            users.set_assignment(u, department_id=dept_id, role_id=role_id, is_active=True)
            emps.create(full_name=f"{prefix} {i}", department_id=dept_id, user_id=u.id)
            ids.append(u.id)
        return ids
    finally:
        db.close()


def test_danh_sach_phong_khong_tang_cau_theo_so_phong(client):
    h = _h(client)
    truoc = _so_cau(client, h, "/api/departments")
    goc = client.post("/api/departments", json={"name": "Nhánh đo N+1"}, headers=h).json()
    cha = goc["id"]
    for i in range(6):  # cây sâu: mỗi phòng là con của phòng trước
        cha = client.post(
            "/api/departments", json={"name": f"Nhánh đo N+1 / {i}", "parent_id": cha}, headers=h
        ).json()["id"]
    _them_nguoi(cha, 2, "nb_la_")
    sau = _so_cau(client, h, "/api/departments")
    assert sau == truoc, f"thêm 7 phòng mà số câu SQL tăng {truoc} → {sau} (N+1)"
    # Số đếm cuộn cây vẫn đúng: gốc nhánh gom được 2 tài khoản ở lá sâu nhất.
    rows = {d["id"]: d for d in client.get("/api/departments", headers=h).json()}
    assert rows[goc["id"]]["total_user_count"] == 2
    assert rows[cha]["user_count"] == 2


def test_ung_vien_truong_phong_va_nhan_su_khong_tang_cau(client):
    h = _h(client)
    goc = client.post("/api/departments", json={"name": "Gốc ứng viên"}, headers=h).json()["id"]
    con = client.post(
        "/api/departments", json={"name": "Con ứng viên", "parent_id": goc}, headers=h
    ).json()["id"]
    _them_nguoi(goc, 1, "uv_goc_")
    _them_nguoi(con, 1, "uv_con_")
    q_uv_1 = _so_cau(client, h, f"/api/departments/{goc}/head-candidates")
    for i in range(3):
        client.post(
            "/api/departments", json={"name": f"Cháu ứng viên {i}", "parent_id": con}, headers=h
        )
    _them_nguoi(con, 4, "uv_them_")
    q_uv_2 = _so_cau(client, h, f"/api/departments/{goc}/head-candidates")
    assert q_uv_2 == q_uv_1, f"ứng viên trưởng phòng {q_uv_1} → {q_uv_2} câu (N+1)"
    ten = [u["username"] for u in client.get(f"/api/departments/{goc}/head-candidates", headers=h).json()]
    # Thứ tự giữ như cũ: người phòng gốc trước, rồi tới phòng con theo id.
    assert ten[0] == "uv_goc_0" and ten[1] == "uv_con_0" and len(ten) == 6

    q_ns_1 = _so_cau(client, h, f"/api/departments/{con}/users")
    _them_nguoi(con, 5, "uv_ns_")
    q_ns_2 = _so_cau(client, h, f"/api/departments/{con}/users")
    assert q_ns_2 == q_ns_1, f"nhân sự phòng {q_ns_1} → {q_ns_2} câu (N+1)"


def test_luu_ma_tran_quyen_mot_commit(client):
    h = _h(client)
    db = SessionLocal()
    try:
        kd = DepartmentRepository(db).get_by_name("Kinh doanh")
        role = RoleRepository(db).create(name="Vai đo lưu ma trận", department_id=kd.id)
        role_id = role.id
    finally:
        db.close()
    matrix = client.get(f"/api/roles/{role_id}/permissions", headers=h).json()
    assert len(matrix) > 40
    for r in matrix:  # bật Xem mọi dòng ⇒ dòng nào cũng phải ghi
        r["can_read"] = True
    with _dem() as n:
        r = client.put(f"/api/roles/{role_id}/permissions", json={"permissions": matrix}, headers=h)
    assert r.status_code == 200, r.text
    assert n["commit"] == 1, f"lưu ma trận {len(matrix)} dòng mà commit {n['commit']} lần"
    assert all(row["can_read"] for row in r.json())
    # Lưu lại lần hai (cập nhật dòng ĐÃ có) cũng chỉ một commit, và dữ liệu đọc lại khớp.
    matrix[0]["can_create"] = True
    with _dem() as n:
        r = client.put(f"/api/roles/{role_id}/permissions", json={"permissions": matrix}, headers=h)
    assert r.status_code == 200 and n["commit"] == 1
    lai = {row["module_key"]: row for row in client.get(f"/api/roles/{role_id}/permissions", headers=h).json()}
    assert lai[matrix[0]["module_key"]]["can_create"] is True


def test_gan_vai_hang_loat_mot_commit(client):
    h = _h(client)
    db = SessionLocal()
    try:
        kd = DepartmentRepository(db).get_by_name("Kinh doanh")
        role_id = RoleRepository(db).create(name="Vai đo gán lô", department_id=kd.id).id
        kd_id = kd.id
    finally:
        db.close()
    ids = _them_nguoi(kd_id, 6, "gan_lo_")
    with _dem() as n:
        r = client.post(
            "/api/departments/assign-role", json={"user_ids": ids, "role_id": role_id}, headers=h
        )
    assert r.status_code == 200, r.text
    assert r.json()["assigned"] == 6
    assert n["commit"] == 1, f"gán vai 6 người mà commit {n['commit']} lần"
    nhan_su = client.get(f"/api/departments/{kd_id}/users", headers=h).json()
    assert {m["role_name"] for m in nhan_su if (m["username"] or "").startswith("gan_lo_")} == {
        "Vai đo gán lô"
    }


def test_chuyen_phong_hang_loat_mot_commit_va_du_he_qua(client):
    """Chuyển 5 người một lượt: MỘT commit (bản cũ ~6 commit mỗi người), mà vẫn đủ hệ quả của
    luồng điều chuyển đơn — gỡ vai cũ, gỡ chức trưởng phòng cũ, ghi Quá trình công tác + nhật ký."""
    from sqlalchemy import func, select

    from app.models.audit import AuditLog
    from app.models.employee import EVENT_TRANSFERRED, EmployeeEvent

    h = _h(client)
    db = SessionLocal()
    try:
        depts = DepartmentRepository(db)
        kd = depts.get_by_name("Kinh doanh")
        dich = depts.get_by_name("Hành chính nhân sự")
        role_id = RoleRepository(db).create(name="Vai đo chuyển lô", department_id=kd.id).id
        kd_id, dich_id = kd.id, dich.id
    finally:
        db.close()
    user_ids = _them_nguoi(kd_id, 5, "chuyen_lo_", role_id=role_id)
    db = SessionLocal()
    try:
        DepartmentRepository(db).set_head(DepartmentRepository(db).get_by_id(kd_id), user_ids[0])
    finally:
        db.close()
    emp_ids = [
        m["employee_id"] for m in client.get(f"/api/departments/{kd_id}/users", headers=h).json()
        if m["user_id"] in user_ids
    ]
    assert len(emp_ids) == 5
    with _dem() as n:
        r = client.post(
            "/api/departments/transfer",
            json={"employee_ids": emp_ids, "target_department_id": dich_id}, headers=h,
        )
    assert r.status_code == 200, r.text
    assert r.json()["transferred"] == 5
    assert n["commit"] == 1, f"chuyển 5 người mà commit {n['commit']} lần"

    sang = {m["user_id"]: m for m in client.get(f"/api/departments/{dich_id}/users", headers=h).json()}
    assert set(user_ids) <= set(sang), "thiếu người ở phòng đích"
    assert all(sang[u]["role_name"] is None for u in user_ids), "vai của phòng cũ chưa gỡ"
    kd_row = next(d for d in client.get("/api/departments", headers=h).json() if d["id"] == kd_id)
    assert kd_row["head_user_id"] is None, "trưởng phòng cũ chuyển đi mà chức còn treo"
    db = SessionLocal()
    try:
        so_moc = db.execute(
            select(func.count()).select_from(EmployeeEvent).where(
                EmployeeEvent.employee_id.in_(emp_ids), EmployeeEvent.event_type == EVENT_TRANSFERRED
            )
        ).scalar_one()
        so_nk = db.execute(
            select(func.count()).select_from(AuditLog).where(
                AuditLog.action == "employee_transferred",
                AuditLog.target.in_([f"employee:{e}" for e in emp_ids]),
            )
        ).scalar_one()
    finally:
        db.close()
    assert so_moc == 5 and so_nk == 5


def test_chuyen_phong_hang_loat_id_hong_khong_ai_bi_chuyen(client):
    h = _h(client)
    db = SessionLocal()
    try:
        depts = DepartmentRepository(db)
        kd_id = depts.get_by_name("Kinh doanh").id
        dich_id = depts.get_by_name("Hành chính nhân sự").id
    finally:
        db.close()
    user_ids = _them_nguoi(kd_id, 2, "chuyen_hong_")
    emp_ids = [
        m["employee_id"] for m in client.get(f"/api/departments/{kd_id}/users", headers=h).json()
        if m["user_id"] in user_ids
    ]
    r = client.post(
        "/api/departments/transfer",
        json={"employee_ids": emp_ids + [999999], "target_department_id": dich_id}, headers=h,
    )
    assert r.status_code == 404
    con_o_kd = {m["user_id"] for m in client.get(f"/api/departments/{kd_id}/users", headers=h).json()}
    assert set(user_ids) <= con_o_kd
