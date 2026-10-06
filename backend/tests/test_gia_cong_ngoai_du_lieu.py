"""Gia công ngoài — nền dữ liệu (spec 2026-09-26 §10).

Hai điều phải giữ: (1) model dựng được bảng + 6 cột nối trên DB trắng; (2) migration 0339 đưa DB
ĐANG CHẠY (thiếu mọi thứ) về đúng hình dạng đó, và chạy lượt hai là no-op.
"""
from __future__ import annotations

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db import Base
from app.db_migrations import _migrate_gia_cong_ngoai
import app.models  # noqa: F401 — đăng ký mọi bảng


def test_model_dung_bang_va_cot_noi():
    bang = Base.metadata.tables
    assert "gia_cong_ngoai" in bang
    cot = set(bang["gia_cong_ngoai"].columns.keys())
    assert {
        "lsx_id", "kieu", "nha_cung_cap_id", "nha_cung_cap_ten", "ten_viec", "don_vi",
        "sl_dat", "xuong_cap_giay", "mang_di_boi_id", "mang_di_luc", "sl_gui", "chot_boi_id",
        "chot_luc", "sl_cuoi", "noi_ve", "huy_boi_id", "huy_luc", "ly_do_huy", "created_by",
        "version",
    } <= cot
    assert "nhan_gia_cong" in bang["suppliers"].columns
    assert "nha_cung_cap_id" in bang["lsx_cong_doan"].columns
    for t in ("san_xuat_cong_viec", "stock_requests", "delivery_trips", "payment_vouchers"):
        assert "gia_cong_ngoai_id" in bang[t].columns, t
    # Người ghi là tham chiếu MỀM — FK tới users trong dự án bắt buộc CASCADE, mà xoá tài khoản
    # không được kéo mất lần gia công.
    fk_users = [
        fk for fk in bang["gia_cong_ngoai"].foreign_keys if fk.column.table.name == "users"
    ]
    assert fk_users == []


def _db_cu():
    """DB 'đang chạy' trước 0339: có đủ bảng nhưng thiếu mọi cột mới; bảng `gia_cong_ngoai` đã
    được `create_all` dựng (runner chạy create_all TRƯỚC migration)."""
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text("CREATE TABLE gia_cong_ngoai (id INTEGER PRIMARY KEY)"))
        cn.execute(text("CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name VARCHAR(255))"))
        cn.execute(text("CREATE TABLE lsx_cong_doan (id INTEGER PRIMARY KEY)"))
        cn.execute(text("CREATE TABLE san_xuat_cong_viec (id INTEGER PRIMARY KEY)"))
        cn.execute(text("CREATE TABLE stock_requests (id INTEGER PRIMARY KEY)"))
        cn.execute(text("CREATE TABLE delivery_trips (id INTEGER PRIMARY KEY)"))
        cn.execute(text(
            "CREATE TABLE payment_vouchers (id INTEGER PRIMARY KEY, status VARCHAR(16))"))
        cn.execute(text("INSERT INTO suppliers (name) VALUES ('NCC cũ')"))
    return engine


def test_migration_0339_them_du_cot_va_chay_lai_la_no_op():
    engine = _db_cu()
    for _ in range(2):
        with Session(engine) as db:
            _migrate_gia_cong_ngoai(db)
    insp = inspect(engine)
    assert "nhan_gia_cong" in {c["name"] for c in insp.get_columns("suppliers")}
    assert "nha_cung_cap_id" in {c["name"] for c in insp.get_columns("lsx_cong_doan")}
    for t in ("san_xuat_cong_viec", "stock_requests", "delivery_trips", "payment_vouchers"):
        assert "gia_cong_ngoai_id" in {c["name"] for c in insp.get_columns(t)}, t
    with engine.begin() as cn:
        # NCC có sẵn mặc định KHÔNG nhận gia công — không tự nhét ai vào ô chọn của kế hoạch.
        assert cn.execute(text("SELECT nhan_gia_cong FROM suppliers")).scalar_one() in (0, False)
        idx = {r[1] for r in cn.execute(text("PRAGMA index_list(payment_vouchers)"))}
    assert "uq_payment_voucher_gia_cong_ngoai" in idx
