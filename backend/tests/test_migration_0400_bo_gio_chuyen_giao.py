from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_bo_gio_chuyen_giao


def _engine_co_bang():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        c.execute(text(
            "CREATE TABLE delivery_trips (id INTEGER PRIMARY KEY, request_id INTEGER, "
            "gio_lay_hang DATETIME, gio_du_kien_giao DATETIME, km NUMERIC)"))
        c.execute(text("INSERT INTO delivery_trips VALUES (1, 7, '2026-10-12 01:00', '2026-10-12 03:00', 12)"))
    return eng


def test_go_hai_cot_giu_du_lieu_con_lai():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_bo_gio_chuyen_giao(db)
    insp = inspect(eng)
    assert {c["name"] for c in insp.get_columns("delivery_trips")} == {"id", "request_id", "km"}
    with eng.connect() as c:
        assert c.execute(text("SELECT id, request_id, km FROM delivery_trips")).one() == (1, 7, 12)


def test_chay_lai_khong_loi():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_bo_gio_chuyen_giao(db)
        _migrate_bo_gio_chuyen_giao(db)


def test_chua_co_bang_thi_im_lang():
    eng = create_engine("sqlite:///:memory:")
    with Session(eng) as db:
        _migrate_bo_gio_chuyen_giao(db)


def test_da_dang_ky():
    assert "0400_bo_gio_chuyen_giao" in {m[0] for m in MIGRATIONS}
