"""mg 0407: vai đang bật "Ghi phiếu thu cọc" được cấp Phiếu thu → Chỉnh sửa; thông báo chờ cọc cũ đổi ô đòi."""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_thu_coc_theo_phieu_thu


def _engine():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        c.execute(text(
            "CREATE TABLE role_permissions (id INTEGER PRIMARY KEY, role_id INTEGER, module_key VARCHAR(60), "
            "can_read BOOLEAN DEFAULT 0, can_create BOOLEAN DEFAULT 0, can_update BOOLEAN DEFAULT 0, "
            "can_delete BOOLEAN DEFAULT 0, can_record_deposit BOOLEAN DEFAULT 0, scope VARCHAR(20))"))
        # Vai 1: có cọc, chưa có dòng phiếu thu. Vai 2: có cọc, phiếu thu chỉ xem. Vai 3: không cọc.
        c.execute(text("INSERT INTO role_permissions (role_id, module_key, can_read, can_record_deposit, scope) "
                       "VALUES (1, 'don_hang_ban', 1, 1, 'all'), (2, 'don_hang_ban', 1, 1, 'all'), "
                       "(3, 'don_hang_ban', 1, 0, 'all')"))
        c.execute(text("INSERT INTO role_permissions (role_id, module_key, can_read, scope) "
                       "VALUES (2, 'phieu_thu', 1, 'all')"))
        c.execute(text("CREATE TABLE module_notifications (id INTEGER PRIMARY KEY, channel VARCHAR(40), "
                       "required_action VARCHAR(40))"))
        c.execute(text("INSERT INTO module_notifications (channel, required_action) VALUES "
                       "('don_hang_ban', 'record_deposit'), ('bao_gia', 'approve_exception')"))
    return eng


def _phieu_thu(eng):
    with eng.connect() as c:
        return {r[0]: tuple(bool(x) for x in r[1:]) for r in c.execute(text(
            "SELECT role_id, can_read, can_create, can_update, can_delete FROM role_permissions "
            "WHERE module_key = 'phieu_thu'"))}


def test_cap_phieu_thu_cho_vai_dang_thu_coc_va_doi_o_thong_bao():
    eng = _engine()
    with Session(eng) as db:
        _migrate_thu_coc_theo_phieu_thu(db)
    assert _phieu_thu(eng) == {1: (True,) * 4, 2: (True,) * 4}
    with eng.connect() as c:
        assert sorted(c.execute(text("SELECT channel, required_action FROM module_notifications"))) == [
            ("bao_gia", "approve_exception"), ("don_hang_ban", "phieu_thu:create")]


def test_chay_lai_khong_nhan_doi_dong():
    eng = _engine()
    with Session(eng) as db:
        _migrate_thu_coc_theo_phieu_thu(db)
        _migrate_thu_coc_theo_phieu_thu(db)
    with eng.connect() as c:
        assert c.execute(text("SELECT COUNT(*) FROM role_permissions WHERE module_key = 'phieu_thu'")).scalar() == 2


def test_chua_co_bang_thi_im_lang():
    eng = create_engine("sqlite:///:memory:")
    with Session(eng) as db:
        _migrate_thu_coc_theo_phieu_thu(db)


def test_da_dang_ky():
    assert "0407_thu_coc_theo_phieu_thu" in {m[0] for m in MIGRATIONS}
