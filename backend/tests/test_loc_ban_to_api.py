"""Thanh lọc 6 điều kiện của bàn tổ (09/10/2026): `cho_loai`, `toi`, `vuong`, `tre`, `nguoi` lọc
ở MÁY CHỦ trước khi cắt trang + `loc_dem` đếm theo công việc."""
from __future__ import annotations

from datetime import timedelta

import pytest

import app.models  # noqa: F401 — đăng ký toàn bộ metadata
from app.models.san_xuat import SanXuatCongViec
from app.models.san_xuat_thuc_thi import PC_HOAT_DONG, SanXuatPhanCong
from app.repositories.rbac_repo import RoleRepository
from app.schemas.san_xuat import WorkItemsLocDemOut
from app.services.gio_xuong import gio_xuong
from app.services.rbac_service import AuthorizationService
from app.services.san_xuat import board
from tests.test_san_xuat_lenh_phan_trang import (  # noqa: F401
    admin,
    customer,
    db,
    lsx_svc,
    orders,
    tho_chi_lam_lenh_thu_3,
    to_co_3_lenh_9_buoc,
)


def _authz(db):
    return AuthorizationService(RoleRepository(db))


def _ban(db, admin, to_id, **kw):
    return board.work_items(db, admin, _authz(db), team_id=to_id, **kw)


def _ids(kq) -> set[int]:
    return {cv["id"] for l in kq["lenh"] for cv in l["cong_viec"]}


def _cvs(db, to_id) -> list[SanXuatCongViec]:
    return db.query(SanXuatCongViec).filter(SanXuatCongViec.department_id == to_id).order_by(SanXuatCongViec.id).all()


def test_nguoi_lam_chi_con_viec_cua_tho(db, admin, to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3):
    to_id, emp = to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3
    giao = {pc.cong_viec_id for pc in db.query(SanXuatPhanCong).filter(SanXuatPhanCong.employee_id == emp)}
    kq = _ban(db, admin, to_id, nguoi={emp})
    assert _ids(kq) == giao
    assert kq["trang"]["tong"] == 1  # cả ba việc ấy cùng một lệnh — trang đếm theo LỆNH
    # Dòng phụ cột Trạng thái của lưới: tên người đang được giao.
    assert {tuple(cv["nguoi_lam"]) for l in kq["lenh"] for cv in l["cong_viec"]} == {("Thợ Một Lệnh",)}
    kq_het = _ban(db, admin, to_id, vuong={"chua_giao_tho"}, co_trang=50)
    assert all(cv["nguoi_lam"] == [] for l in kq_het["lenh"] for cv in l["cong_viec"])


def test_chua_giao_tho_bo_viec_da_giao(db, admin, to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3):
    to_id, emp = to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3
    giao = {pc.cong_viec_id for pc in db.query(SanXuatPhanCong).filter(SanXuatPhanCong.employee_id == emp)}
    tat_ca = {cv.id for cv in _cvs(db, to_id)}
    kq = _ban(db, admin, to_id, vuong={"chua_giao_tho"}, co_trang=50)
    assert _ids(kq) == tat_ca - giao


def test_hai_dieu_kien_la_va(db, admin, to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3):
    to_id, emp = to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3
    kq = _ban(db, admin, to_id, nguoi={emp}, vuong={"chua_giao_tho"})
    assert _ids(kq) == set()
    assert kq["trang"]["tong"] == 0


def test_tre_xong_chi_viec_qua_gio_ket_thuc(db, admin, to_co_3_lenh_9_buoc):
    to_id = to_co_3_lenh_9_buoc
    cvs = _cvs(db, to_id)
    now = gio_xuong()
    for cv in cvs:
        cv.du_kien_bat_dau = now + timedelta(days=1)
        cv.du_kien_ket_thuc = now + timedelta(days=1, hours=1)
    tre = cvs[0]
    tre.du_kien_bat_dau = now - timedelta(hours=3)
    tre.du_kien_ket_thuc = now - timedelta(hours=2)
    db.commit()
    assert _ids(_ban(db, admin, to_id, tre="xong")) == {tre.id}
    # Chưa có phiên chạy nào + qua giờ bắt đầu ⇒ cũng là "quá giờ bắt đầu mà chưa chạy".
    assert _ids(_ban(db, admin, to_id, tre="bat_dau")) == {tre.id}


def test_trang_thai_gop_vao_dieu_kien_moi_cung_mot_viec(db, admin, to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3):
    to_id, emp = to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3
    kq = _ban(db, admin, to_id, nguoi={emp}, trang_thai={"running"})
    assert _ids(kq) == set()  # mọi việc đều "released" — không lệnh nào lọt chỉ vì có việc khác khớp


def test_hang_dang_toi_dau_moi_viec_co_mot_vi_tri(db, admin, to_co_3_lenh_9_buoc):
    to_id = to_co_3_lenh_9_buoc
    tat_ca = {cv.id for cv in _cvs(db, to_id)}
    gop: set[int] = set()
    for v in ("toi", "con_1", "con_2_3", "con_4", "qua"):
        ids = _ids(_ban(db, admin, to_id, toi=v, co_trang=50))
        assert not (ids & gop), "một việc chỉ thuộc một vị trí"
        gop |= ids
    # Mỗi lệnh của bộ mẫu chỉ MỘT bước — không có dải routing nhưng hàng chỉ có thể ở tổ này.
    assert gop == tat_ca
    assert _ids(_ban(db, admin, to_id, toi="toi", co_trang=50)) == tat_ca


def test_loc_dem_theo_cong_viec(db, admin, to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3):
    to_id, emp = to_co_3_lenh_9_buoc, tho_chi_lam_lenh_thu_3
    n = len(_cvs(db, to_id))
    giao = db.query(SanXuatPhanCong).filter(SanXuatPhanCong.employee_id == emp,
                                             SanXuatPhanCong.trang_thai == PC_HOAT_DONG).count()
    d = WorkItemsLocDemOut.model_validate(board.loc_dem(db, admin, _authz(db), team_id=to_id))
    assert d.trang_thai["released"] == n
    assert d.vuong["chua_giao_tho"] == n - giao
    assert sum(d.toi.values()) <= n
    tho = next(p for p in d.nguoi if p.id == emp)
    assert tho.so == giao and tho.ten == "Thợ Một Lệnh"
    assert set(d.cho) == {"ban_giao", "kcs"}


def test_loc_lenh_gap_va_the_gap_tren_dong_lenh(db, admin, to_co_3_lenh_9_buoc):
    """10/10/2026: cờ GẤP của lệnh — lọc `gap`/`thuong`, đếm theo công việc, dòng lệnh mang `is_rush`."""
    from app.models.lsx import Lsx

    to_id = to_co_3_lenh_9_buoc
    cvs = _cvs(db, to_id)
    lsx_gap = db.get(Lsx, cvs[0].lsx_id)
    lsx_gap.is_rush = True
    db.commit()
    viec_gap = {cv.id for cv in cvs if cv.lsx_id == lsx_gap.id}
    tat_ca = {cv.id for cv in cvs}

    kq = _ban(db, admin, to_id, gap="gap", co_trang=50)
    assert _ids(kq) == viec_gap
    assert [l["is_rush"] for l in kq["lenh"]] == [True]
    assert _ids(_ban(db, admin, to_id, gap="thuong", co_trang=50)) == tat_ca - viec_gap
    # Không lọc: lệnh gấp vẫn mang thẻ, lệnh thường thì không.
    kq_het = _ban(db, admin, to_id, co_trang=50)
    assert {l["lsx_id"]: l["is_rush"] for l in kq_het["lenh"]} == {
        cv.lsx_id: cv.lsx_id == lsx_gap.id for cv in cvs}

    d = WorkItemsLocDemOut.model_validate(board.loc_dem(db, admin, _authz(db), team_id=to_id))
    assert d.gap == {"gap": len(viec_gap), "thuong": len(tat_ca) - len(viec_gap)}


def test_ngoai_pham_vi_thi_chan(db, to_co_3_lenh_9_buoc):
    from app.models.user import User

    la = User(username="nguoi_la_loc", name="Người lạ", password_hash="x", is_active=True)
    db.add(la)
    db.commit()
    with pytest.raises(PermissionError):
        board.loc_dem(db, la, _authz(db), team_id=to_co_3_lenh_9_buoc)
