"""Hồ sơ nhân sự: mỗi thao tác ghi chốt MỘT commit (rà 04/10/2026).

Đo trên DB dev trước khi sửa: sửa hồ sơ 2 commit, chuyển trạng thái / đổi chức danh / thêm NV 3,
cấp tài khoản 5, điều chuyển lẻ tới 6 — mỗi commit trên Postgres là một vòng fsync + đọc lại
(`refresh`) cả hồ sơ lẫn tài khoản người bấm. Tệ nhất là GET danh sách: lượt máy tự đánh dấu "Hết
thử việc" chốt 3 commit cho MỖI người quá hạn ngay trong request chỉ đi xem. Nay mỗi thao tác là
một giao dịch; các guard dưới đây đếm commit để lần sửa sau không lặng lẽ tách lại.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import date, timedelta

from sqlalchemy import event

from app.db import SessionLocal, engine
from app.models.payroll import EmployeeSalary
from app.repositories.user_repo import UserRepository

from .test_employees_api import _admin_token, _create, _dept_id, _h


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


def _mot_commit(client, method, url, h, **kw):
    with _dem() as n:
        r = getattr(client, method)(url, headers=h, **kw)
    assert r.status_code in (200, 201, 204), r.text
    assert n["commit"] == 1, f"{method.upper()} {url}: {n['commit']} commit"
    return r


def test_moi_thao_tac_ghi_ho_so_chi_mot_commit(client):
    tok = _admin_token(client)
    h = _h(tok)
    ids = [_create(client, tok, full_name=f"Một commit {i}").json()["employee"]["id"]
           for i in range(6)]
    kd = _dept_id("Kinh doanh")  # hồ sơ mặc định ở Hành chính nhân sự

    with _dem() as n:
        r = _create(client, tok, full_name="Thêm mới")
    assert r.status_code == 201 and n["commit"] == 1, n
    assert client.get(f"/api/employees/{r.json()['employee']['id']}/events",
                      headers=h).json()["items"][0]["event_type"] == "hired"

    _mot_commit(client, "put", f"/api/employees/{ids[0]}", h,
                json={"full_name": "Một commit sửa", "phone": "0911",
                      "probation_end_date": "2025-12-31"})
    _mot_commit(client, "post", f"/api/employees/{ids[1]}/transitions", h,
                json={"kind": "confirm", "effective_date": "2025-02-01"})
    _mot_commit(client, "post", f"/api/employees/{ids[2]}/transitions", h,
                json={"kind": "promote", "effective_date": "2025-02-01", "new_position": "Tổ phó"})
    _mot_commit(client, "post", f"/api/employees/{ids[3]}/account", h,
                json={"username": "motcommit3", "password": "Abcdef12!"})
    # Điều chuyển lẻ của người CÓ tài khoản — đường dài nhất (đổi phòng tài khoản + gỡ vai + mốc).
    _mot_commit(client, "post", f"/api/employees/{ids[3]}/transitions", h,
                json={"kind": "transfer", "effective_date": "2025-02-01",
                      "new_department_id": kd})
    # Nghỉ việc khoá tài khoản + cắt token cùng giao dịch; tuyển lại mở lại.
    _mot_commit(client, "post", f"/api/employees/{ids[3]}/transitions", h,
                json={"kind": "resign", "effective_date": "2025-03-01", "resign_reason": "Thôi"})
    db = SessionLocal()
    try:
        assert UserRepository(db).get_by_username("motcommit3").is_active is False
    finally:
        db.close()
    _mot_commit(client, "post", f"/api/employees/{ids[3]}/transitions", h,
                json={"kind": "reinstate", "effective_date": "2025-04-01"})
    att = _mot_commit(client, "post", f"/api/employees/{ids[4]}/attachments", h,
                      files={"file": ("a.txt", b"x", "text/plain")}, data={"doc_kind": "khac"})
    _mot_commit(client, "delete", f"/api/employees/{ids[4]}/attachments/{att.json()['id']}", h)

    events = client.get(f"/api/employees/{ids[3]}/events", headers=h).json()["items"]
    assert [e["event_type"] for e in events][:3] == ["reinstated", "resigned", "transferred"]


def test_quet_het_thu_viec_luc_doc_danh_sach_chot_mot_commit_ca_lo(client):
    tok = _admin_token(client)
    h = _h(tok)
    qua_han = (date.today() - timedelta(days=3)).isoformat()
    ids = [_create(client, tok, full_name=f"Quá hạn {i}", probation_end_date=qua_han)
           .json()["employee"]["id"] for i in range(5)]

    with _dem() as n:
        r = client.get("/api/employees?size=200", headers=h)
    assert r.status_code == 200
    assert n["commit"] == 1, f"quét 5 người: {n['commit']} commit"
    trang_thai = {row["id"]: row["status"] for row in r.json()["items"]}
    assert all(trang_thai[i] == "probation_ended" for i in ids)

    # Lần mở sau không còn ai để đổi ⇒ request ĐỌC không commit gì.
    with _dem() as n:
        assert client.get("/api/employees?size=200", headers=h).status_code == 200
    assert n["commit"] == 0


def test_lich_su_luong_tra_ten_nguoi_sua_mot_truy_van(client):
    tok = _admin_token(client)
    h = _h(tok)
    eid = _create(client, tok, full_name="Lịch sử lương").json()["employee"]["id"]

    def _them_moc(n: int, start: int) -> None:
        db = SessionLocal()
        try:
            users = UserRepository(db)
            for i in range(start, start + n):
                u = users.create(username=f"lsl{i}", name=f"Người sửa {i}", password_hash="x")
                db.add(EmployeeSalary(employee_id=eid, effective_from=date(2025, 1, 1 + i),
                                      base_amount=1000 + i, created_by=u.id))
            db.commit()
        finally:
            db.close()

    def _so_cau() -> int:
        with _dem() as n:
            r = client.get(f"/api/luong/salaries/{eid}", headers=h)
        assert r.status_code == 200, r.text
        return n["q"]

    _them_moc(2, 0)
    it = _so_cau()
    _them_moc(8, 2)
    assert _so_cau() == it, "lịch sử lương tra tên người sửa từng người"
    names = {i["actor_name"] for i in client.get(f"/api/luong/salaries/{eid}", headers=h).json()["items"]}
    assert len(names) == 10
