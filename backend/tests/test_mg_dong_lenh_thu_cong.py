"""mg 0346 — gộp closed_full/closed_short → closed, waiting_conditions → in_production; lệnh của
nhóm đã đóng mà đang da_phat_hanh → da_dong."""
import pytest
from sqlalchemy import text

from app.db import Base, SessionLocal, engine
from app.db_migrations import _migrate_dong_lenh_thu_cong


@pytest.fixture
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    s = SessionLocal()
    yield s
    s.close()


def test_mg_gop_trang_thai_nhom_va_dong_lenh(db):
    # Không dựng khách/đơn: SQLite test không ép FK, migration chỉ đọc 3 bảng lsx/nhóm/thành viên.
    for i, tt in ((1, "da_phat_hanh"), (2, "da_phat_hanh"), (3, "da_phat_hanh")):
        db.execute(text(
            "INSERT INTO lsx (id, ma, order_id, order_line_id, trang_thai, loai, ten, so_luong_dat, "
            "don_vi_tinh, so_to_ke_hoach, so_to_nguyen, so_con, is_rush, giu_cho_bat, created_at, updated_at) "
            f"VALUES ({i}, 'L{i}', 1, {i}, '{tt}', 'san_xuat_moi', '', 10, 'cái', 0, 0, 1, false, false, "
            "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
    for i, tt in ((1, "closed_full"), (2, "closed_short"), (3, "waiting_conditions")):
        db.execute(text(
            "INSERT INTO san_xuat_nhom (id, ma, order_id, khoa, ten, trang_thai, version, created_at, updated_at) "
            f"VALUES ({i}, 'N{i}', 1, 'k{i}', '', '{tt}', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
        db.execute(text(
            f"INSERT INTO san_xuat_nhom_lsx (nhom_id, lsx_id, la_than_chinh, created_at) VALUES ({i}, {i}, true, CURRENT_TIMESTAMP)"))
    db.commit()

    _migrate_dong_lenh_thu_cong(db)

    nhom = dict(db.execute(text("SELECT id, trang_thai FROM san_xuat_nhom")).all())
    assert nhom == {1: "closed", 2: "closed", 3: "in_production"}
    lenh = dict(db.execute(text("SELECT id, trang_thai FROM lsx")).all())
    assert lenh == {1: "da_dong", 2: "da_dong", 3: "da_phat_hanh"}
    _migrate_dong_lenh_thu_cong(db)      # chạy lại không đổi gì
    assert dict(db.execute(text("SELECT id, trang_thai FROM lsx")).all()) == lenh
