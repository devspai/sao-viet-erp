"""Thanh lọc (06/10/2026) của màn Bàn tổ.

  · Bàn tổ — chế độ Bảng (`/work-items`, `nhom="lenh"`): kỳ `tu_ngay`/`den_ngay` theo mốc `moc`
    (`nhan` lúc tổ nhận lệnh — mặc định, `tao` ngày tạo lệnh, `du_kien` dự kiến bắt đầu), thay cặp
    `nhan_tu`/`nhan_den` cũ; mỗi lệnh trả thêm `tao_luc` cho cột "Ngày tạo".

Phần Tiêu chí KCS (`/khai-bao` lọc `nhom`/`bat_buoc`/`active`/kỳ) GỠ 08/10/2026 cùng các cột đó
(mg 0381) — màn hai ngăn chỉ còn ô tìm `q`, soi ở `test_san_xuat_kcs_tieu_chi.py`.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import app.models  # noqa: F401 — đăng ký toàn bộ metadata
from app.models.lsx import Lsx
from app.models.san_xuat import SanXuatCongViec
from app.repositories.rbac_repo import RoleRepository
from app.schemas.lsx import HangChoItem
from app.schemas.san_xuat import WorkItemsOut
from app.services.gio_xuong import ve_gio_xuong
from app.services.rbac_service import AuthorizationService
from app.services.san_xuat import board
from tests.test_san_xuat_lenh_phan_trang import (  # noqa: F401
    admin,
    customer,
    db,
    lsx_svc,
    orders,
    to_co_3_lenh_9_buoc,
    to_nhan_lech_ngay,
)


def _ban(db, admin, to_id, **kw):
    return board.work_items(db, admin, AuthorizationService(RoleRepository(db)), team_id=to_id, **kw)


def _lenh_cua_to(db, to_id) -> dict[int, list[SanXuatCongViec]]:
    out: dict[int, list[SanXuatCongViec]] = {}
    for cv in db.query(SanXuatCongViec).filter(SanXuatCongViec.department_id == to_id):
        out.setdefault(cv.lsx_id, []).append(cv)
    return out


# --- Bàn tổ ------------------------------------------------------------------------------------
def test_ban_to_moc_nhan_mac_dinh_la_ngay_xuong(db, admin, to_nhan_lech_ngay):
    to_id, tang = to_nhan_lech_ngay
    b = tang[0][1]
    nhan_b = min(cv.created_at for cv in _lenh_cua_to(db, to_id)[b])
    ngay = ve_gio_xuong(nhan_b.replace(tzinfo=timezone.utc)).date()
    kq = _ban(db, admin, to_id, tu_ngay=ngay, den_ngay=ngay)
    assert [l["lsx_id"] for l in kq["lenh"]] == [b]
    assert kq["trang"]["tong"] == 1
    assert _ban(db, admin, to_id, tu_ngay=ngay, den_ngay=ngay, moc="nhan")["trang"]["tong"] == 1


def test_ban_to_moc_tao_theo_ngay_tao_lenh_va_tra_tao_luc(db, admin, to_co_3_lenh_9_buoc):
    to_id = to_co_3_lenh_9_buoc
    a, b, c = sorted(_lenh_cua_to(db, to_id))
    for lid, luc in ((a, datetime(2026, 8, 1, 5, tzinfo=timezone.utc)),
                     (b, datetime(2026, 10, 2, 5, tzinfo=timezone.utc)),
                     (c, datetime(2026, 10, 20, 5, tzinfo=timezone.utc))):
        db.get(Lsx, lid).created_at = luc
    db.commit()

    kq = _ban(db, admin, to_id, tu_ngay=date(2026, 10, 1), den_ngay=date(2026, 10, 31), moc="tao")
    assert kq["trang"]["tong"] == 2
    assert {l["lsx_id"] for l in kq["lenh"]} == {b, c}
    # Pydantic nuốt im lặng khoá không khai — soi qua schema.
    out = WorkItemsOut.model_validate(kq)
    assert all(l.tao_luc is not None for l in out.lenh)
    assert {l.tao_luc.date() for l in out.lenh} == {date(2026, 10, 2), date(2026, 10, 20)}
    # Kết hợp tìm chữ (cùng JOIN lệnh) vẫn chạy.
    ma_b = db.get(Lsx, b).ma
    kq = _ban(db, admin, to_id, tu_ngay=date(2026, 10, 1), moc="tao", tim=ma_b)
    assert [l["lsx_id"] for l in kq["lenh"]] == [b]


def test_ban_to_moc_du_kien_bo_lenh_chua_xep_gio(db, admin, to_co_3_lenh_9_buoc):
    to_id = to_co_3_lenh_9_buoc
    theo = _lenh_cua_to(db, to_id)
    a, b, c = sorted(theo)
    for cv in theo[a]:
        cv.du_kien_bat_dau = datetime(2026, 11, 5, 8, tzinfo=timezone.utc)
        cv.du_kien_ket_thuc = datetime(2026, 11, 5, 10, tzinfo=timezone.utc)
    for cv in theo[b]:
        cv.du_kien_bat_dau = datetime(2026, 12, 1, 8, tzinfo=timezone.utc)
        cv.du_kien_ket_thuc = datetime(2026, 12, 1, 10, tzinfo=timezone.utc)
    for cv in theo[c]:
        cv.du_kien_bat_dau = None
        cv.du_kien_ket_thuc = None
    db.commit()

    kq = _ban(db, admin, to_id, tu_ngay=date(2026, 11, 1), den_ngay=date(2026, 11, 30), moc="du_kien")
    assert [l["lsx_id"] for l in kq["lenh"]] == [a]
    kq = _ban(db, admin, to_id, tu_ngay=date(2026, 11, 1), moc="du_kien")
    assert {l["lsx_id"] for l in kq["lenh"]} == {a, b}


def test_hang_cho_giu_san_pham_tom_tat():
    item = HangChoItem.model_validate({
        "order_id": 1, "order_no": "DH-1", "san_pham_tom_tat": "Hộp quà, Tờ rơi",
    })
    assert item.model_dump()["san_pham_tom_tat"] == "Hộp quà, Tờ rơi"
