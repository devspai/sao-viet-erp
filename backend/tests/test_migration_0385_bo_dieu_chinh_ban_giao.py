from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_bo_dieu_chinh_ban_giao


def _engine_co_bang():
    """Ba lần giao: 1 điều chỉnh có mẻ (300 → 299, mẻ tốt 300), 2 điều chỉnh không mẻ (100 → 90 →
    95), 3 đã xác nhận thường."""
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE san_xuat_batch (id INTEGER PRIMARY KEY, tot NUMERIC)"))
        c.execute(text(
            "CREATE TABLE san_xuat_ban_giao (id INTEGER PRIMARY KEY, so_luong NUMERIC, "
            "trang_thai VARCHAR(16), khong_nhat_quan BOOLEAN DEFAULT 0, xac_nhan_luc DATETIME)"))
        c.execute(text("CREATE TABLE san_xuat_ban_giao_batch (id INTEGER PRIMARY KEY, ban_giao_id INTEGER, batch_id INTEGER)"))
        c.execute(text(
            "CREATE TABLE san_xuat_ban_giao_dieu_chinh (id INTEGER PRIMARY KEY, ban_giao_id INTEGER, "
            "so_luong_truoc NUMERIC, so_luong_sau NUMERIC)"))
        c.execute(text("INSERT INTO san_xuat_batch VALUES (10, 300)"))
        c.execute(text("INSERT INTO san_xuat_ban_giao VALUES (1, 299, 'adjusted', 0, NULL), "
                       "(2, 95, 'adjusted', 1, '2026-10-01'), (3, 50, 'confirmed', 0, '2026-10-01')"))
        c.execute(text("INSERT INTO san_xuat_ban_giao_batch VALUES (1, 1, 10)"))
        c.execute(text("INSERT INTO san_xuat_ban_giao_dieu_chinh VALUES (1, 1, 300, 299), "
                       "(2, 2, 100, 90), (3, 2, 90, 95)"))
    return eng


def test_tra_so_ve_theo_me_roi_go_bang_va_cot():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_bo_dieu_chinh_ban_giao(db)
    with eng.connect() as c:
        rows = c.execute(text("SELECT id, so_luong, trang_thai, xac_nhan_luc FROM san_xuat_ban_giao ORDER BY id")).all()
    assert [(r[0], float(r[1]), r[2]) for r in rows] == [
        (1, 300, "confirmed"), (2, 100, "confirmed"), (3, 50, "confirmed")]
    assert rows[0][3] is None                     # đang chờ xác nhận lại thì vẫn chờ
    insp = inspect(eng)
    assert "san_xuat_ban_giao_dieu_chinh" not in insp.get_table_names()
    assert "khong_nhat_quan" not in {c["name"] for c in insp.get_columns("san_xuat_ban_giao")}


def test_chay_lai_khong_loi():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_bo_dieu_chinh_ban_giao(db)
        _migrate_bo_dieu_chinh_ban_giao(db)


def test_chua_co_bang_thi_im_lang():
    eng = create_engine("sqlite:///:memory:")
    with Session(eng) as db:
        _migrate_bo_dieu_chinh_ban_giao(db)


def test_da_dang_ky():
    assert "0385_bo_dieu_chinh_ban_giao" in {m[0] for m in MIGRATIONS}
