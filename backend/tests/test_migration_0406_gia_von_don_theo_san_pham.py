import json

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_gia_von_don_theo_san_pham


def _engine_co_phieu():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE phieu_tinh_gia (id INTEGER PRIMARY KEY, so_luong INTEGER, "
                       "tong_gia_von NUMERIC, gia_von_don NUMERIC, result_json JSON)"))
        c.execute(text("CREATE TABLE phieu_thanh_phan (id INTEGER PRIMARY KEY, phieu_id INTEGER, "
                       "thu_tu INTEGER, ten VARCHAR, nhom_bao_gia VARCHAR, so_luong INTEGER)"))
        meta = json.dumps({"meta": {"tong_so_luong": 2000, "gia_von_don": 10000}, "groups": []})
        # Phiếu 1: ruột + bìa cùng nhóm, SL 0 ⇒ rơi về SL đầu phiếu 1.000.
        c.execute(text("INSERT INTO phieu_tinh_gia VALUES (1, 1000, 20000000, 10000, :j)"), {"j": meta})
        c.execute(text("INSERT INTO phieu_thanh_phan VALUES (1, 1, 0, 'Ruột', 'Sách A5', 0)"))
        c.execute(text("INSERT INTO phieu_thanh_phan VALUES (2, 1, 1, 'Bìa', 'Sách A5', 0)"))
        # Phiếu 2: không nhóm — không được đụng.
        c.execute(text("INSERT INTO phieu_tinh_gia VALUES (2, 500, 1000000, 1000, NULL)"))
        c.execute(text("INSERT INTO phieu_thanh_phan VALUES (3, 2, 0, 'Tờ rơi', NULL, 1000)"))
    return eng


def test_tinh_lai_phieu_co_nhom_bo_qua_phieu_khong_nhom():
    eng = _engine_co_phieu()
    with Session(eng) as db:
        _migrate_gia_von_don_theo_san_pham(db)
    with eng.connect() as c:
        g1, rj = c.execute(text("SELECT gia_von_don, result_json FROM phieu_tinh_gia WHERE id = 1")).one()
        g2 = c.execute(text("SELECT gia_von_don FROM phieu_tinh_gia WHERE id = 2")).scalar()
    assert float(g1) == 20000
    meta = (json.loads(rj) if isinstance(rj, str) else rj)["meta"]
    assert meta["tong_so_luong"] == 1000 and meta["so_san_pham"] == 1 and meta["gia_von_don"] == 20000
    assert float(g2) == 1000


def test_chay_lai_cung_ket_qua():
    eng = _engine_co_phieu()
    with Session(eng) as db:
        _migrate_gia_von_don_theo_san_pham(db)
        _migrate_gia_von_don_theo_san_pham(db)
    with eng.connect() as c:
        assert float(c.execute(text("SELECT gia_von_don FROM phieu_tinh_gia WHERE id = 1")).scalar()) == 20000


def test_chua_co_bang_thi_im_lang():
    eng = create_engine("sqlite:///:memory:")
    with Session(eng) as db:
        _migrate_gia_von_don_theo_san_pham(db)


def test_da_dang_ky():
    assert "0406_gia_von_don_theo_san_pham" in {m[0] for m in MIGRATIONS}
