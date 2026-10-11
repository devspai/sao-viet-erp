"""mg 0390 — Giấy + Vật tư khác khai nhiều ĐVT: cột `don_vi_them`, backfill tờ cho giấy, gốc cho vật tư."""
import json

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_mat_hang_don_vi_them

_BANG = ("stock_lots", "stock_voucher_lines", "stock_request_lines", "stock_thresholds", "kho_ky_ton",
         "vat_tu_giu_cho")


def _db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text("CREATE TABLE giay_nguyen (id INTEGER PRIMARY KEY, don_vi_gia VARCHAR(16))"))
        cn.execute(text("INSERT INTO giay_nguyen VALUES (1, 'KG'), (2, 'to'), (3, NULL), (4, 'ram')"))
        cn.execute(text("CREATE TABLE vat_tu_in_an (id INTEGER PRIMARY KEY, don_vi_gia VARCHAR(16))"))
        cn.execute(text("INSERT INTO vat_tu_in_an VALUES (9, 'Thung'), (10, NULL)"))
        for t in _BANG:
            cn.execute(text(f"CREATE TABLE {t} (id INTEGER PRIMARY KEY, hang_loai VARCHAR(8), "
                            "hang_id INTEGER, don_vi_goc VARCHAR(24) NOT NULL DEFAULT '')"))
            cn.execute(text(f"INSERT INTO {t} VALUES (1, 'giay', 1, ''), (2, 'vat_tu', 9, ''), "
                            "(3, 'vat_tu', 9, 'kg'), (4, 'vat_tu', 10, ''), (5, 'vat_tu', 77, '')"))
        cn.execute(text("CREATE TABLE lsx_cong_doan_vat_tu (id INTEGER PRIMARY KEY, hang_loai VARCHAR(8), "
                        "vat_tu_id INTEGER, don_vi_goc VARCHAR(24) NOT NULL DEFAULT '')"))
        cn.execute(text("INSERT INTO lsx_cong_doan_vat_tu VALUES (1, 'vat_tu', 9, '')"))
    return engine


def _chay(engine):
    with Session(engine) as db:
        _migrate_mat_hang_don_vi_them(db)


def _cot(engine, sql):
    with engine.begin() as cn:
        return [r[0] for r in cn.execute(text(sql))]


def test_them_cot_va_backfill_to_cho_giay():
    engine = _db()
    _chay(engine)
    insp = inspect(engine)
    for t in ("giay_nguyen", "vat_tu_in_an"):
        assert "don_vi_them" in {c["name"] for c in insp.get_columns(t)}, t
    them = [json.loads(v) if v else None for v in _cot(engine, "SELECT don_vi_them FROM giay_nguyen ORDER BY id")]
    # ĐVT chính kg ⇒ thêm tờ; chính đã thuộc họ tờ (tờ, ram) hoặc trống ⇒ không đụng.
    assert them == [["to"], None, None, None]
    assert _cot(engine, "SELECT don_vi_them FROM vat_tu_in_an") == [None, None]


def test_backfill_goc_vat_tu():
    engine = _db()
    _chay(engine)
    for t in _BANG:
        # Giấy không đụng; vật tư rỗng ⇒ ĐVT chính chữ thường; đã có gốc giữ; mã mất/ĐVT trống ⇒ ''.
        assert _cot(engine, f"SELECT don_vi_goc FROM {t} ORDER BY id") == ["", "thung", "kg", "", ""], t
    assert _cot(engine, "SELECT don_vi_goc FROM lsx_cong_doan_vat_tu") == ["thung"]


def test_chay_lai_khong_de_lai_to_da_bo():
    engine = _db()
    _chay(engine)
    with engine.begin() as cn:
        cn.execute(text("UPDATE giay_nguyen SET don_vi_them = '[]' WHERE id = 1"))
    _chay(engine)
    assert _cot(engine, "SELECT don_vi_them FROM giay_nguyen WHERE id = 1") == ["[]"]


def test_da_dang_ky():
    assert "0390_mat_hang_don_vi_them" in {m[0] for m in MIGRATIONS}
