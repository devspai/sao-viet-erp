from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_khuon_cot_cho_phep_bo_trong


def _db_pg(bang: set[str], cot: set[str]):
    """Session giả mang dialect postgresql — ghi lại các câu SQL được chạy."""
    db = MagicMock()
    db.get_bind.return_value.dialect.name = "postgresql"
    insp = MagicMock()
    insp.get_table_names.return_value = list(bang)
    insp.get_columns.return_value = [{"name": c} for c in cot]
    return db, insp


def _sql(db) -> list[str]:
    return [str(c.args[0]) for c in db.execute.call_args_list]


def test_dat_default_cho_bon_cot_so():
    db, insp = _db_pg({"phieu_thanh_pham"}, {"phi_khuon", "dai_khuon", "rong_khuon", "so_khuon", "khuon_nguon"})
    with patch("app.db_migrations.inspect", return_value=insp):
        _migrate_khuon_cot_cho_phep_bo_trong(db)
    ds = _sql(db)
    assert len(ds) == 4 and all("SET DEFAULT 0" in s for s in ds)
    db.commit.assert_called_once()


def test_chay_lai_la_vo_hai_va_bo_qua_cot_thieu():
    db, insp = _db_pg({"phieu_thanh_pham"}, {"phi_khuon"})
    with patch("app.db_migrations.inspect", return_value=insp):
        _migrate_khuon_cot_cho_phep_bo_trong(db)
        _migrate_khuon_cot_cho_phep_bo_trong(db)
    assert len(_sql(db)) == 2


def test_chua_co_bang_thi_im_lang():
    db, insp = _db_pg(set(), set())
    with patch("app.db_migrations.inspect", return_value=insp):
        _migrate_khuon_cot_cho_phep_bo_trong(db)
    assert _sql(db) == []


def test_sqlite_bo_qua_va_da_dang_ky():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text("CREATE TABLE phieu_thanh_pham (id INTEGER PRIMARY KEY)"))
    with Session(engine) as db:
        _migrate_khuon_cot_cho_phep_bo_trong(db)
    assert "0359_khuon_cot_cho_phep_bo_trong" in {m[0] for m in MIGRATIONS}
