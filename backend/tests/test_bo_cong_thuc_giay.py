"""Gỡ "Công thức tính định mức" của Giấy (`giay_nguyen.cong_thuc_luong`) + cụm lịch sử công thức.

Giấy đếm theo TỜ × KHỔ nên ô ra kg hết đất sống; Giấy là danh mục duy nhất ghi `cong_thuc_lich_su`
nên bảng đó chết theo. mg `0348`.
"""
from __future__ import annotations

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_bo_cong_thuc_luong_giay
from tests.test_danh_muc_http_contract import _admin
from tests.test_kiem_cong_thuc import _giay


def test_api_giay_khong_con_o_cong_thuc_luong(client):
    h = _admin(client)
    # GiayIn không extra="forbid" ⇒ gửi ô cũ lên vẫn 201, giá trị bị bỏ qua.
    tao = client.post("/api/vat-lieu-kho/giay",
                      json=_giay(client, h, cong_thuc_luong="dinh_luong * to_nguyen"), headers=h)
    assert tao.status_code == 201, tao.text
    for khoa in ("cong_thuc_luong", "cong_thuc_luong_truoc", "cong_thuc_luong_sua_luc"):
        assert khoa not in tao.json()
    gid = tao.json()["id"]
    one = client.get(f"/api/vat-lieu-kho/giay/{gid}", headers=h)
    assert one.status_code == 200, one.text
    for khoa in ("cong_thuc_luong", "cong_thuc_luong_truoc", "cong_thuc_luong_sua_luc"):
        assert khoa not in one.json()
    ds = client.get("/api/vat-lieu-kho/giay", headers=h)
    assert ds.status_code == 200, ds.text
    dong = next(r for r in ds.json()["items"] if r["id"] == gid)
    for khoa in ("cong_thuc_luong", "cong_thuc_luong_truoc", "cong_thuc_luong_sua_luc"):
        assert khoa not in dong


def test_migration_0348_xoa_cot_va_bang():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text("CREATE TABLE giay_nguyen (id INTEGER PRIMARY KEY, ma TEXT, "
                        "cong_thuc_gia TEXT, cong_thuc_luong TEXT)"))
        cn.execute(text("INSERT INTO giay_nguyen VALUES (1, 'G1', 'a * b', 'dinh_luong')"))
        cn.execute(text("CREATE TABLE cong_thuc_lich_su (id INTEGER PRIMARY KEY, bang TEXT)"))
    assert "0348_bo_cong_thuc_luong_giay" in [t for t, _ in MIGRATIONS]
    for _ in range(2):   # lần hai: DB đã gỡ rồi, không được nổ
        with Session(engine) as db:
            _migrate_bo_cong_thuc_luong_giay(db)
    insp = inspect(engine)
    assert {c["name"] for c in insp.get_columns("giay_nguyen")} == {"id", "ma", "cong_thuc_gia"}
    assert "cong_thuc_lich_su" not in insp.get_table_names()
    with engine.connect() as cn:
        assert cn.execute(text("SELECT ma, cong_thuc_gia FROM giay_nguyen")).one() == ("G1", "a * b")
