from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_tai_san_thoi_dung


def _chay(engine):
    with Session(engine) as db:
        _migrate_tai_san_thoi_dung(db)


def test_them_cot_giu_du_lieu_cu_va_chay_lai_khong_loi():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text(
            "CREATE TABLE tai_san_bien_dong (id INTEGER PRIMARY KEY, loai VARCHAR(16), "
            "ly_do VARCHAR(255))"
        ))
        cn.execute(text("INSERT INTO tai_san_bien_dong (id, loai) VALUES (1, 'dieu_chuyen')"))
    _chay(engine)
    _chay(engine)
    cot = {c["name"] for c in inspect(engine).get_columns("tai_san_bien_dong")}
    assert "kieu_thoi_dung" in cot
    with engine.begin() as cn:
        assert cn.execute(text("SELECT loai, kieu_thoi_dung FROM tai_san_bien_dong")).one() == (
            "dieu_chuyen", None,
        )


def test_chua_co_bang_thi_bo_qua():
    _chay(create_engine("sqlite+pysqlite:///:memory:"))


def test_dang_ky_dung_mot_lan():
    assert [k for k, _ in MIGRATIONS].count("0367_tai_san_thoi_dung") == 1
