from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_stock_request_vat_tu_tra


def _db(*, co_bang: bool = True, co_cot: bool = False):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    if co_bang:
        cot = ", vat_tu_tra_cong_viec_id INTEGER" if co_cot else ""
        with engine.begin() as cn:
            cn.execute(text(f"CREATE TABLE stock_requests (id INTEGER PRIMARY KEY, ma VARCHAR(30){cot})"))
            cn.execute(text("INSERT INTO stock_requests (id, ma) VALUES (1, 'A')"))
    return engine


def _chay(engine):
    with Session(engine) as db:
        _migrate_stock_request_vat_tu_tra(db)


def test_them_cot_va_index_khong_dong_den_du_lieu_cu():
    engine = _db()
    _chay(engine)
    assert "vat_tu_tra_cong_viec_id" in {c["name"] for c in inspect(engine).get_columns("stock_requests")}
    assert "ix_stock_requests_vat_tu_tra_cong_viec_id" in {
        i["name"] for i in inspect(engine).get_indexes("stock_requests")}
    with engine.begin() as cn:
        assert cn.execute(text("SELECT vat_tu_tra_cong_viec_id FROM stock_requests")).scalar() is None


def test_chay_lai_khong_loi():
    engine = _db(co_cot=True)
    _chay(engine)
    _chay(engine)


def test_chua_co_bang_thi_im_lang():
    _chay(_db(co_bang=False))


def test_da_dang_ky():
    assert "0361_stock_request_vat_tu_tra" in {m[0] for m in MIGRATIONS}
