from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_lsx_vat_tu_gia_tri_chip


def _db(*, co_bang: bool = True, co_cot: bool = False):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    if co_bang:
        cot = ", gia_tri_chip JSON" if co_cot else ""
        with engine.begin() as cn:
            cn.execute(text(f"CREATE TABLE lsx_cong_doan_vat_tu (id INTEGER PRIMARY KEY, so_luong NUMERIC{cot})"))
            cn.execute(text("INSERT INTO lsx_cong_doan_vat_tu (id, so_luong) VALUES (1, 5)"))
    return engine


def _chay(engine):
    with Session(engine) as db:
        _migrate_lsx_vat_tu_gia_tri_chip(db)


def _cot(engine):
    return {c["name"] for c in inspect(engine).get_columns("lsx_cong_doan_vat_tu")}


def test_them_cot_va_giu_du_lieu_cu():
    engine = _db()
    _chay(engine)
    assert "gia_tri_chip" in _cot(engine)
    with engine.begin() as cn:
        assert cn.execute(text("SELECT so_luong, gia_tri_chip FROM lsx_cong_doan_vat_tu")).one() == (5, None)


def test_chay_lai_la_no_op():
    engine = _db(co_cot=True)
    _chay(engine)
    _chay(engine)
    assert "gia_tri_chip" in _cot(engine)


def test_chua_co_bang_thi_im_lang():
    _chay(_db(co_bang=False))


def test_da_dang_ky():
    assert "0358_lsx_vat_tu_gia_tri_chip" in {m[0] for m in MIGRATIONS}
