from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_dong_yeu_cau_lo_goc


def _engine_co_bang():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE stock_request_lines (id INTEGER PRIMARY KEY, request_id INTEGER, "
                       "sl_de_nghi NUMERIC)"))
        c.execute(text("INSERT INTO stock_request_lines VALUES (1, 7, 40)"))
    return eng


def test_them_cot_giu_du_lieu_va_chay_lai_khong_loi():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_dong_yeu_cau_lo_goc(db)
        _migrate_dong_yeu_cau_lo_goc(db)
    assert "lo_goc_id" in {c["name"] for c in inspect(eng).get_columns("stock_request_lines")}
    with eng.connect() as c:
        assert c.execute(text("SELECT id, request_id, sl_de_nghi, lo_goc_id FROM stock_request_lines")).one() \
            == (1, 7, 40, None)


def test_chua_co_bang_thi_im_lang():
    eng = create_engine("sqlite:///:memory:")
    with Session(eng) as db:
        _migrate_dong_yeu_cau_lo_goc(db)


def test_da_dang_ky():
    assert "0401_dong_yeu_cau_lo_goc" in {m[0] for m in MIGRATIONS}
