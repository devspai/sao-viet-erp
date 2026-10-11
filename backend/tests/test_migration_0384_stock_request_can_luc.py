from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_stock_request_can_luc


def _engine_co_bang():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE stock_requests (id INTEGER PRIMARY KEY, ngay_can DATE)"))
        c.execute(text("INSERT INTO stock_requests (id, ngay_can) VALUES (1, '2026-10-09')"))
    return eng


def test_them_cot_khong_dong_du_lieu_cu():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_stock_request_can_luc(db)
    cols = {c["name"] for c in inspect(eng).get_columns("stock_requests")}
    assert "can_luc" in cols
    with eng.connect() as c:
        assert c.execute(text("SELECT ngay_can, can_luc FROM stock_requests")).one() == ("2026-10-09", None)


def test_chay_lai_khong_loi():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_stock_request_can_luc(db)
        _migrate_stock_request_can_luc(db)


def test_chua_co_bang_thi_im_lang():
    eng = create_engine("sqlite:///:memory:")
    with Session(eng) as db:
        _migrate_stock_request_can_luc(db)


def test_da_dang_ky():
    assert "0384_stock_request_can_luc" in {m[0] for m in MIGRATIONS}
