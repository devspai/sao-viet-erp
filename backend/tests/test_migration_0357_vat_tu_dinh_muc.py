from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_vat_tu_cong_thuc_dinh_muc


def _db(*, co_cot: bool):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    cot = "cong_thuc_dinh_muc TEXT, " if co_cot else ""
    with engine.begin() as cn:
        cn.execute(text(f"CREATE TABLE vat_tu_in_an (id INTEGER PRIMARY KEY, ma VARCHAR(30), {cot}ghi_chu TEXT)"))
        cn.execute(text(
            "CREATE TABLE cong_doan_vat_tu (id INTEGER PRIMARY KEY, cong_doan_id INTEGER, "
            "vat_tu_id INTEGER, cong_thuc_luong TEXT)"))
        cn.execute(text("INSERT INTO vat_tu_in_an (id, ma) VALUES (1,'A'),(2,'B'),(3,'C')"))
        cn.execute(text("INSERT INTO cong_doan_vat_tu (cong_doan_id, vat_tu_id, cong_thuc_luong) VALUES "
                        "(10,1,'sl_vao / 40000'),(11,1,'sl_vao / 40000'),"
                        "(10,2,'so_mau * 0.3'),(11,2,'sl_vao'),"
                        "(10,3,''),(11,3,NULL)"))
    return engine


def _chay(engine):
    with Session(engine) as db:
        _migrate_vat_tu_cong_thuc_dinh_muc(db)


def _lay(engine):
    with engine.begin() as cn:
        return dict(cn.execute(text("SELECT id, cong_thuc_dinh_muc FROM vat_tu_in_an")).all())


def test_them_cot_va_backfill_chi_khi_dung_mot_cong_thuc():
    engine = _db(co_cot=False)
    _chay(engine)
    assert "cong_thuc_dinh_muc" in {c["name"] for c in inspect(engine).get_columns("vat_tu_in_an")}
    assert _lay(engine) == {1: "sl_vao / 40000", 2: None, 3: None}


def test_chay_lai_la_no_op_va_khong_de_cong_thuc_da_sua():
    engine = _db(co_cot=False)
    _chay(engine)
    with engine.begin() as cn:
        cn.execute(text("UPDATE vat_tu_in_an SET cong_thuc_dinh_muc = 'sl_ra' WHERE id = 1"))
    _chay(engine)
    assert _lay(engine)[1] == "sl_ra"


def test_db_da_co_cot_thi_khong_nem():
    engine = _db(co_cot=True)
    _chay(engine)
    assert _lay(engine)[1] == "sl_vao / 40000"


def test_db_chua_co_bang_thi_bo_qua():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    _chay(engine)
    assert set(inspect(engine).get_table_names()) == set()


def test_da_dang_ky_trong_danh_sach():
    assert "0357_vat_tu_cong_thuc_dinh_muc" in [m for m, _ in MIGRATIONS]
