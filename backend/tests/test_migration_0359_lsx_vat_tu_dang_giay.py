from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_lsx_vat_tu_dang_giay


def _db(*, co_bang: bool = True, co_cot: bool = False):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    if co_bang:
        cot = ", dang_giay VARCHAR(8)" if co_cot else ""
        with engine.begin() as cn:
            cn.execute(text("CREATE TABLE lsx_cong_doan_vat_tu "
                            f"(id INTEGER PRIMARY KEY, hang_loai VARCHAR(8), so_luong NUMERIC{cot})"))
            cn.execute(text("INSERT INTO lsx_cong_doan_vat_tu (id, hang_loai, so_luong) "
                            "VALUES (1, 'giay', 5), (2, 'vat_tu', 3)"))
    return engine


def _chay(engine):
    with Session(engine) as db:
        _migrate_lsx_vat_tu_dang_giay(db)


def _cot(engine):
    return {c["name"] for c in inspect(engine).get_columns("lsx_cong_doan_vat_tu")}


def test_them_cot_va_backfill_giay_la_to():
    engine = _db()
    _chay(engine)
    assert "dang_giay" in _cot(engine)
    with engine.begin() as cn:
        rows = cn.execute(text("SELECT id, dang_giay FROM lsx_cong_doan_vat_tu ORDER BY id")).all()
    assert rows == [(1, "to"), (2, None)]


def test_chay_lai_khong_loi_va_khong_de_dang_cuon():
    engine = _db(co_cot=True)
    with engine.begin() as cn:
        cn.execute(text("UPDATE lsx_cong_doan_vat_tu SET dang_giay='cuon' WHERE id=1"))
    _chay(engine)
    _chay(engine)
    with engine.begin() as cn:
        assert cn.execute(text("SELECT dang_giay FROM lsx_cong_doan_vat_tu WHERE id=1")).scalar() == "cuon"


def test_chua_co_bang_thi_im_lang():
    _chay(_db(co_bang=False))


def test_da_dang_ky():
    assert "0359_lsx_vat_tu_dang_giay" in {m[0] for m in MIGRATIONS}
