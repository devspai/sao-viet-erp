from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_ngung_o_khuon_ep_kim


def _db(*, co_bang: bool = True):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    if co_bang:
        with engine.begin() as cn:
            cn.execute(text(
                "CREATE TABLE phieu_thanh_pham (id INTEGER PRIMARY KEY, phi_khuon NUMERIC, "
                "dai_khuon NUMERIC NOT NULL DEFAULT 0, rong_khuon NUMERIC NOT NULL DEFAULT 0, "
                "so_khuon INTEGER NOT NULL DEFAULT 0)"
            ))
            cn.execute(text("INSERT INTO phieu_thanh_pham (id, phi_khuon, dai_khuon, so_khuon) VALUES (1, 5, 100, 2)"))
    return engine


def _chay(engine):
    with Session(engine) as db:
        _migrate_ngung_o_khuon_ep_kim(db)


def test_giu_nguyen_du_lieu_cu_va_khong_drop_cot():
    engine = _db()
    _chay(engine)
    with engine.begin() as cn:
        assert cn.execute(text("SELECT phi_khuon, dai_khuon, so_khuon FROM phieu_thanh_pham")).one() == (5, 100, 2)


def test_chay_lai_la_no_op():
    engine = _db()
    _chay(engine)
    _chay(engine)


def test_chua_co_bang_thi_im_lang():
    _chay(_db(co_bang=False))


def test_da_dang_ky():
    assert "0359_ngung_o_khuon_ep_kim" in {m[0] for m in MIGRATIONS}
