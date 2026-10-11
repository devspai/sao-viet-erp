"""Thợ xem lần ghi sản lượng trong drawer công việc: sản lượng CẢ LẦN + danh sách người cùng làm,
không số phút của ai, không tiền (tầng chia gỡ hẳn ở mg 0322).

Băng "Sản lượng tôi tham gia" đầu Bàn tổ gỡ 10/10/2026: mỗi lần ghi đã nằm ở tab Sản lượng của
chính công việc, băng chỉ nói lại lần nữa.

Phần drawer soi ở tầng SERVICE (`board.chi_tiet_cong_viec`) vì dàn cảnh cần hai người cùng một mẻ có
chấm công thật. "Thợ" là tài khoản thật được cấp dòng quyền của tổ theo vai mẫu Công nhân (Xem +
phạm vi Của tôi, mg 0302).
"""
from __future__ import annotations

from datetime import timedelta

from app.models.role import SCOPE_OWN
from app.models.user import User
from app.services.san_xuat import board
from tests.quyen_to_fixtures import cap_quyen_to
from tests.san_xuat_me_fixtures import T0, canh_me, cham_cong, co_mat, khoang, tao_me
from tests.test_san_xuat_board import _giao

# Fixtures + helper luồng thật.
from tests.test_san_xuat_thuc_thi import (  # noqa: F401
    _emp,
    _to_cong_nhat,
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)


def _authz(db):
    from app.repositories.rbac_repo import RoleRepository
    from app.services.rbac_service import AuthorizationService

    return AuthorizationService(RoleRepository(db))


def _canh_2_nguoi(db, orders, lsx_svc, admin, customer, *, ma):
    """Tổ (admin giữ dòng quyền Tất cả của tổ) + MỘT mẻ + hai người A/B cùng làm, cùng có chấm
    công hợp lệ. A có tài khoản riêng thuộc tổ (đóng vai THỢ mở bàn), B thì không.

    Cả hai đều phải có PHÂN CÔNG còn hiệu lực: thợ chưa được giao việc thì bị chặn ngay ở cửa
    drawer (§7.1), bài sẽ đỏ vì lý do khác hẳn điều nó muốn soi."""
    to, cv, batch = canh_me(db, orders, lsx_svc, admin, customer, ma=ma)
    u_a = User(username=f"tho_a_{ma.lower()}", name="Thợ A", password_hash="x",
               department_id=to.id)
    db.add(u_a)
    db.flush()
    cap_quyen_to(db, u_a, to, scope=SCOPE_OWN, viec=())
    a = _emp(db, to, f"NV-A-{ma}", ten="Thợ A Tên", user_id=u_a.id)
    b = _emp(db, to, f"NV-B-{ma}", ten="Thợ B Tên")
    cham_cong(db, a)
    cham_cong(db, b)
    db.commit()
    _giao(db, cv.id, a.id)
    _giao(db, cv.id, b.id)
    co_mat(db, batch, a, b)
    db.commit()
    return to, cv, batch, u_a, a, b


def test_tho_thay_ca_danh_sach_nguoi_trong_me_khong_so_phut(db, orders, lsx_svc, admin, customer):
    _to, cv, batch, tho, a, b = _canh_2_nguoi(
        db, orders, lsx_svc, admin, customer, ma="TO-THO-1")

    d = board.chi_tiet_cong_viec(db, tho, _authz(db), cong_viec_id=cv.id)
    assert "phan_bo" not in d
    me = next(m for m in d["san_luong"]["batches"] if m["id"] == batch.id)
    assert {n["ho_ten"] for n in me["nguoi_tham_gia"]} == {a.full_name, b.full_name}
    assert me["so_nguoi"] == 2
    assert "chia_du_kien" not in me
    # Không phút, không phần chia — chỉ tên + nhãn tổ gốc (người cùng tổ ⇒ trơn).
    assert all(set(n) == {"employee_id", "ho_ten", "to_ten", "la_ho_tro"} for n in me["nguoi_tham_gia"])
    assert all(n["to_ten"] is None for n in me["nguoi_tham_gia"])


def test_nguoi_lam_doc_tu_anh_chup_khong_suy_tu_khoang(db, orders, lsx_svc, admin, customer):
    """Từ 10/10/2026 người làm là ảnh chụp tổ tick lúc ghi — khoảng tham gia phủ trọn lần ghi cũng
    không tự thêm ai vào."""
    to, cv, batch, _tho, a, b = _canh_2_nguoi(
        db, orders, lsx_svc, admin, customer, ma="TO-THO-MOC")
    c = _emp(db, to, "NV-C-MOC", ten="Thợ Có Khoảng")
    khoang(db, cv, c, batch.bat_dau, batch.ket_thuc)
    db.commit()

    d = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    me = next(m for m in d["san_luong"]["batches"] if m["id"] == batch.id)
    assert {n["ho_ten"] for n in me["nguoi_tham_gia"]} == {a.full_name, b.full_name}


def test_nguoi_to_khac_sang_giup_hien_o_drawer_kem_nhan_to(
    db, orders, lsx_svc, admin, customer,
):
    """Người tổ khác sang giúp được tổ thêm thẳng lúc ghi (mg 0389, không còn thỏa thuận chờ hai
    bên) ⇒ lần ghi mang `la_ho_tro`, drawer liệt kê kèm nhãn tổ gốc."""
    to, cv, batch, _tho, a, b = _canh_2_nguoi(
        db, orders, lsx_svc, admin, customer, ma="TO-THO-HT")
    to2 = _to_cong_nhat(db, ma="TO-THO-HT2")
    u_c = User(username="tho_c_ht", name="Thợ C", password_hash="x", department_id=to2.id)
    db.add(u_c)
    db.flush()
    c = _emp(db, to2, "NV-C-HT", ten="Thợ C Giúp", user_id=u_c.id)
    moc = T0 + timedelta(hours=2)
    db.commit()
    moi = tao_me(db, user=admin, cong_viec_id=cv.id, bat_dau=moc, ket_thuc=moc + timedelta(hours=1),
                 tong=30, tot=30, nguoi_ids=[a.id, b.id, c.id])["batch_id"]

    d = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
    me = next(m for m in d["san_luong"]["batches"] if m["id"] == moi)
    assert {n["ho_ten"]: n["to_ten"] for n in me["nguoi_tham_gia"]} == {
        a.full_name: None, b.full_name: None, c.full_name: to2.name}
    assert next(n for n in me["nguoi_tham_gia"] if n["ho_ten"] == c.full_name)["la_ho_tro"] is True
    assert me["so_nguoi"] == 3
    # Lần ghi khác không có tên người giúp.
    cu = next(m for m in d["san_luong"]["batches"] if m["id"] == batch.id)
    assert c.full_name not in {n["ho_ten"] for n in cu["nguoi_tham_gia"]}

