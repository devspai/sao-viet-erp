from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_bo_hang_thay_the


def _engine_co_bang():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        for bang in ("giay_nguyen", "vat_tu_in_an"):
            c.execute(text(f"CREATE TABLE {bang} (id INTEGER PRIMARY KEY, ma VARCHAR(40), thay_the_ids JSON)"))
            c.execute(text(f"INSERT INTO {bang} VALUES (1, 'A', '[2]')"))
    return eng


def test_go_cot_ca_hai_bang_giu_du_lieu_con_lai():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_bo_hang_thay_the(db)
    insp = inspect(eng)
    for bang in ("giay_nguyen", "vat_tu_in_an"):
        assert {c["name"] for c in insp.get_columns(bang)} == {"id", "ma"}
        with eng.connect() as c:
            assert c.execute(text(f"SELECT id, ma FROM {bang}")).one() == (1, "A")


def test_chay_lai_khong_loi():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_bo_hang_thay_the(db)
        _migrate_bo_hang_thay_the(db)


def test_chua_co_bang_thi_im_lang():
    eng = create_engine("sqlite:///:memory:")
    with Session(eng) as db:
        _migrate_bo_hang_thay_the(db)


def test_da_dang_ky():
    assert "0405_bo_hang_thay_the" in {m[0] for m in MIGRATIONS}
