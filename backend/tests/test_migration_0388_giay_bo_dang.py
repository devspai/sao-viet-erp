"""mg 0388 — giấy bỏ dạng cuộn/tờ: `dang_giay` → `don_vi_goc`, khoá ngưỡng/kỳ tồn/giữ chỗ thêm gốc."""
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_giay_bo_dang


def _db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text("CREATE TABLE giay_nguyen (id INTEGER PRIMARY KEY, don_vi_gia VARCHAR(16))"))
        cn.execute(text("INSERT INTO giay_nguyen VALUES (1, 'KG'), (2, 'to')"))
        for t in ("stock_lots", "stock_voucher_lines", "stock_request_lines"):
            cn.execute(text(f"CREATE TABLE {t} (id INTEGER PRIMARY KEY, hang_loai VARCHAR(8), "
                            "hang_id INTEGER, dang_giay VARCHAR(8), kho_rong INTEGER NOT NULL DEFAULT 0, "
                            "kho_dai INTEGER NOT NULL DEFAULT 0)"))
            cn.execute(text(f"INSERT INTO {t} (id, hang_loai, hang_id, dang_giay, kho_rong, kho_dai) VALUES "
                            "(1, 'giay', 1, 'to', 650, 860), (2, 'giay', 1, 'cuon', 1000, 0), "
                            "(3, 'giay', 1, NULL, 0, 0), (4, 'vat_tu', 9, NULL, 0, 0)"))
        cn.execute(text("CREATE INDEX ix_stock_lots_giay_kho ON stock_lots "
                        "(hang_loai, hang_id, dang_giay, kho_rong, kho_dai)"))
        cn.execute(text("CREATE TABLE lsx_cong_doan_vat_tu (id INTEGER PRIMARY KEY, hang_loai VARCHAR(8), "
                        "vat_tu_id INTEGER, dang_giay VARCHAR(8))"))
        cn.execute(text("INSERT INTO lsx_cong_doan_vat_tu VALUES (1, 'giay', 1, 'cuon'), (2, 'giay', 2, 'to')"))
        for t in ("stock_thresholds", "kho_ky_ton", "vat_tu_giu_cho"):
            cn.execute(text(f"CREATE TABLE {t} (id INTEGER PRIMARY KEY, hang_loai VARCHAR(8), "
                            "hang_id INTEGER, kho_rong INTEGER NOT NULL DEFAULT 0, "
                            "kho_dai INTEGER NOT NULL DEFAULT 0)"))
            cn.execute(text(f"INSERT INTO {t} VALUES (1, 'giay', 1, 650, 860), (2, 'giay', 1, 0, 0), "
                            "(3, 'vat_tu', 9, 0, 0)"))
        cn.execute(text("CREATE TABLE san_xuat_vat_tu_de_nghi_dong (id INTEGER PRIMARY KEY, "
                        "hang_loai VARCHAR(8), dang_giay VARCHAR(8), dvt_goc VARCHAR(24))"))
        cn.execute(text("CREATE TABLE supplier_items (id INTEGER PRIMARY KEY, unit VARCHAR(32), "
                        "dang_ban VARCHAR(8))"))
    return engine


def _chay(engine):
    with Session(engine) as db:
        _migrate_giay_bo_dang(db)


def _goc(engine, t):
    with engine.begin() as cn:
        return [r[0] for r in cn.execute(text(f"SELECT don_vi_goc FROM {t} ORDER BY id"))]


def test_backfill_tu_dang_va_don_vi_gia():
    engine = _db()
    _chay(engine)
    for t in ("stock_lots", "stock_voucher_lines", "stock_request_lines"):
        # tờ ⇒ 'to'; cuộn và giấy cũ chưa có dạng ⇒ đơn vị giá của mã (chữ thường); vật tư ⇒ ''.
        assert _goc(engine, t) == ["to", "kg", "kg", ""], t
    assert _goc(engine, "lsx_cong_doan_vat_tu") == ["kg", "to"]
    for t in ("stock_thresholds", "kho_ky_ton", "vat_tu_giu_cho"):
        # Khoá cũ chỉ TỜ mới mang đủ hai cạnh khổ.
        assert _goc(engine, t) == ["to", "kg", ""], t


def test_bo_cot_dang_va_dung_lai_chi_muc():
    engine = _db()
    _chay(engine)
    insp = inspect(engine)
    for t in ("stock_lots", "stock_voucher_lines", "stock_request_lines", "lsx_cong_doan_vat_tu",
              "san_xuat_vat_tu_de_nghi_dong"):
        assert "dang_giay" not in {c["name"] for c in insp.get_columns(t)}, t
    assert "dang_ban" not in {c["name"] for c in insp.get_columns("supplier_items")}
    ix = {i["name"]: i["column_names"] for i in insp.get_indexes("stock_lots")}
    assert ix["ix_stock_lots_giay_kho"] == ["hang_loai", "hang_id", "kho_rong", "kho_dai", "don_vi_goc"]


def test_chay_lai_khong_loi_khong_de_gia_tri():
    engine = _db()
    _chay(engine)
    with engine.begin() as cn:
        cn.execute(text("UPDATE stock_lots SET don_vi_goc = 'tan' WHERE id = 2"))
    _chay(engine)
    assert _goc(engine, "stock_lots")[1] == "tan"


def test_da_dang_ky():
    assert "0388_giay_bo_dang" in {m[0] for m in MIGRATIONS}
