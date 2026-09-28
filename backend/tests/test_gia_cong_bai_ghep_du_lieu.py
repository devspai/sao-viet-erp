"""Gia công ngoài cho bước chung bài ghép (spec 2026-09-27 §6) — nền dữ liệu.

(1) Model: lần gia công gắn lệnh HOẶC bài ghép (đúng một), bước chung có `nha_cung_cap_id`, các cột
dự kiến cũ đã gỡ. (2) Migration đưa DB đang chạy về đúng hình dạng đó; chạy lượt hai là no-op.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import Base
from app.db_migrations import _migrate_gia_cong_ngoai_bai_ghep
from app.models.bai_ghep import BaiGhep
from app.models.gia_cong_ngoai import KIEU_MOT_PHAN, GiaCongNgoai
from app.models.purchase import Supplier
import app.models  # noqa: F401
from tests.lenh_sx_fixtures import admin, sess  # noqa: F401

COT_CU = ("sl_gui", "ngay_gui_dk", "van_chuyen_ngay", "gia_cong_ngay", "ngay_nhan_dk",
          "hao_hut_cho_phep", "don_gia_gia_cong", "yeu_cau_ky_thuat")


def test_model_lan_gan_bai_ghep_va_buoc_chung_co_ncc():
    bang = Base.metadata.tables
    gcn = bang["gia_cong_ngoai"]
    assert gcn.c.lsx_id.nullable is True
    assert "bai_ghep_id" in gcn.c
    (fk,) = [f for f in gcn.c.bai_ghep_id.foreign_keys]
    assert fk.column.table.name == "bai_ghep" and fk.ondelete == "RESTRICT"
    cot = set(bang["bai_ghep_cong_doan"].columns.keys())
    assert {"nha_cung_cap_id", "nha_cung_cap"} <= cot
    assert not (set(COT_CU) & cot)


def test_check_dung_mot_nguon(sess):
    s = Supplier(name="Cán màng Tân Phát", nhan_gia_cong=True)
    bg = BaiGhep(ma="GB-DL-1", ten="x")
    sess.add_all([s, bg])
    sess.flush()
    sess.add(GiaCongNgoai(kieu=KIEU_MOT_PHAN, nha_cung_cap_id=s.id, bai_ghep_id=bg.id))
    sess.flush()                      # chỉ bài ghép — hợp lệ
    sess.add(GiaCongNgoai(kieu=KIEU_MOT_PHAN, nha_cung_cap_id=s.id))
    with pytest.raises(IntegrityError):
        sess.flush()                  # không nguồn nào
    sess.rollback()


def test_migration_them_cot_go_cot_cu_chay_lai_no_op():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text("CREATE TABLE bai_ghep (id INTEGER PRIMARY KEY)"))
        cn.execute(text("CREATE TABLE gia_cong_ngoai (id INTEGER PRIMARY KEY, lsx_id INTEGER)"))
        cn.execute(text(
            "CREATE TABLE bai_ghep_cong_doan (id INTEGER PRIMARY KEY, nha_cung_cap VARCHAR(150), "
            + ", ".join(f"{c} VARCHAR(20)" for c in COT_CU) + ")"))
    for _ in range(2):
        with Session(engine) as db:
            _migrate_gia_cong_ngoai_bai_ghep(db)
    insp = inspect(engine)
    assert "bai_ghep_id" in {c["name"] for c in insp.get_columns("gia_cong_ngoai")}
    cot = {c["name"] for c in insp.get_columns("bai_ghep_cong_doan")}
    assert cot == {"id", "nha_cung_cap", "nha_cung_cap_id"}
