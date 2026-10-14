from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_gop_to_tp_vao_to


def _engine():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE don_vi_do (id INTEGER PRIMARY KEY, ma TEXT, ten TEXT)"))
        c.execute(text("INSERT INTO don_vi_do VALUES (10, 'to', 'tờ'), (24, 'to_tp', ' thành phẩm'), "
                       "(3, 'cai', 'cái')"))
        c.execute(text("CREATE TABLE don_vi_quy_doi (id INTEGER PRIMARY KEY, tu_id INTEGER, den_id INTEGER)"))
        c.execute(text("INSERT INTO don_vi_quy_doi VALUES (1, 24, 3)"))
        c.execute(text("CREATE TABLE vat_tu_in_an (id INTEGER PRIMARY KEY, don_vi_gia TEXT)"))
        c.execute(text("INSERT INTO vat_tu_in_an VALUES (1, 'to_tp'), (2, 'cai')"))
        c.execute(text("CREATE TABLE stock_request_lines (id INTEGER PRIMARY KEY, dvt TEXT, don_vi_goc TEXT)"))
        c.execute(text("INSERT INTO stock_request_lines VALUES (1, 'to_tp', 'to_tp')"))
        c.execute(text("CREATE TABLE stock_thresholds (id INTEGER PRIMARY KEY, hang_loai TEXT, hang_id INTEGER, "
                       "kho_id INTEGER, kho_rong INTEGER, kho_dai INTEGER, don_vi_goc TEXT)"))
        # Dòng 1 trùng khoá với dòng 3 (đã là `to`) ⇒ bỏ; dòng 2 không trùng ⇒ đổi sang `to`.
        c.execute(text("INSERT INTO stock_thresholds VALUES (1, 'vat_tu', 1, 5, 0, 0, 'to_tp'), "
                       "(2, 'vat_tu', 1, 6, 0, 0, 'to_tp'), (3, 'vat_tu', 1, 5, 0, 0, 'to')"))
    return eng


def test_chuyen_moi_dong_sang_to_va_xoa_to_tp():
    eng = _engine()
    with Session(eng) as db:
        _migrate_gop_to_tp_vao_to(db)
        _migrate_gop_to_tp_vao_to(db)
    with eng.connect() as c:
        assert c.execute(text("SELECT ma FROM don_vi_do ORDER BY id")).scalars().all() == ["cai", "to"]
        assert c.execute(text("SELECT count(*) FROM don_vi_quy_doi")).scalar_one() == 0
        assert c.execute(text("SELECT don_vi_gia FROM vat_tu_in_an ORDER BY id")).scalars().all() == ["to", "cai"]
        assert c.execute(text("SELECT dvt, don_vi_goc FROM stock_request_lines")).one() == ("to", "to")
        assert c.execute(text("SELECT id, don_vi_goc FROM stock_thresholds ORDER BY id")).all() == [
            (2, "to"), (3, "to")]


def test_khong_co_to_tp_thi_im_lang():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE don_vi_do (id INTEGER PRIMARY KEY, ma TEXT, ten TEXT)"))
        c.execute(text("INSERT INTO don_vi_do VALUES (10, 'to', 'tờ')"))
    with Session(eng) as db:
        _migrate_gop_to_tp_vao_to(db)
    with Session(create_engine("sqlite:///:memory:")) as db:
        _migrate_gop_to_tp_vao_to(db)


def test_da_dang_ky():
    assert "0403_gop_to_tp_vao_to" in {m[0] for m in MIGRATIONS}
