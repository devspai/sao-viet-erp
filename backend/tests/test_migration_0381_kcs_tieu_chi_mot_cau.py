"""Migration 0381 — Tiêu chí KCS chỉ còn MỘT câu chữ (`docs/design-tieu-chi-kcs-lam-lai.md`).

Xoá dòng ngừng dùng TRƯỚC khi gỡ cột `active` (không được sống lại), đánh lại `thu_tu` 1..n mỗi
công đoạn (dữ liệu cũ hay để 0 nên khoá kết quả kiểm `thu_tu` từng trùng), rồi gỡ `bat_buoc`,
`active`, `huong_dan`. Chạy lại vô hại; DB trắng (bảng không còn cột cũ) thì chỉ đánh lại thứ tự.
"""
from __future__ import annotations

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import _migrate_kcs_tieu_chi_mot_cau


def _fixture():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text(
            "CREATE TABLE san_xuat_kcs_tieu_chi (id INTEGER PRIMARY KEY, ma VARCHAR(30), "
            "cong_doan_id INTEGER, ten VARCHAR(200), huong_dan VARCHAR(500), "
            "bat_buoc BOOLEAN NOT NULL DEFAULT 1, thu_tu INTEGER NOT NULL DEFAULT 0, "
            "active BOOLEAN NOT NULL DEFAULT 1)"))
        cn.execute(text(
            "INSERT INTO san_xuat_kcs_tieu_chi (id, ma, cong_doan_id, ten, thu_tu, active) VALUES "
            "(1, 'KM1', 10, 'Màu đúng', 0, 1), (2, 'KM2', 10, 'Đã ngừng', 0, 0), "
            "(3, 'KM3', 10, 'Không lem', 0, 1), (4, 'KM4', 20, 'Bế đúng đường', 5, 1), "
            "(5, 'KM5', 20, 'Mép không xơ', 2, 1)"))
    return engine


def _chay(engine) -> None:
    with Session(engine) as db:
        _migrate_kcs_tieu_chi_mot_cau(db)


def _thu_tu(engine) -> dict[int, int]:
    with engine.begin() as cn:
        return dict(cn.execute(text("SELECT id, thu_tu FROM san_xuat_kcs_tieu_chi")).all())


def test_xoa_dong_ngung_danh_lai_thu_tu_go_ba_cot():
    engine = _fixture()
    _chay(engine)

    cot = {c["name"] for c in inspect(engine).get_columns("san_xuat_kcs_tieu_chi")}
    assert not cot & {"bat_buoc", "active", "huong_dan"}
    # Dòng ngừng dùng mất; thứ tự đánh lại theo (thu_tu, id) trong từng công đoạn.
    assert _thu_tu(engine) == {1: 1, 3: 2, 5: 1, 4: 2}


def test_chay_lai_vo_hai():
    engine = _fixture()
    _chay(engine)
    _chay(engine)
    assert _thu_tu(engine) == {1: 1, 3: 2, 5: 1, 4: 2}


def test_bang_chua_co_thi_bo_qua():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    _chay(engine)
