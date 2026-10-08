"""Lệnh đã đóng: cửa ghi xưởng từ chối; việc đang chạy vẫn khép được; bàn tổ ẩn việc chưa làm."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.san_xuat import CV_DANG_CHAY, CV_PHAT_HANH, CV_TAM_DUNG
from app.repositories.san_xuat_repo import SanXuatRepository
from app.services.san_xuat import dong_lenh, kcs, san_luong

from tests.test_san_xuat_kcs import (  # noqa: F401
    _batch, _nguoi_o_to, admin, customer, db, lsx_svc, orders,
)
from tests.quyen_to_fixtures import cap_dong_thieu


def _dong(db, cv, res):
    cap_dong_thieu(db, res["nguoi_kcs"])
    dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=None)


def test_kcs_kiem_bi_chan_khi_da_dong(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    _dong(db, cv, res)
    with pytest.raises(ValueError, match="Lệnh đã đóng"):
        kcs.kiem_cong_doan(db, user=res["nguoi_kcs"], cong_viec_id=cv.id, so_dat=1, so_loi=0)


def test_nhap_kho_bi_chan_khi_da_dong(db, orders, lsx_svc, admin, customer):
    from app.services.san_xuat import kho

    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    _dong(db, cv, res)
    with pytest.raises(ValueError, match="Lệnh đã đóng"):
        kho.tao_yeu_cau_nhap_kho_cong_doan(db, user=res["nguoi_kcs"], cong_viec_id=cv.id)


def _ids_to(repo, cv):
    """Việc bàn tổ thấy được, chỉ tính việc của nhóm đang xét (fixture còn một việc nhóm khác)."""
    ids_nhom = {c.id for c in repo.cong_viec_hien_tai_cua_nhom(cv.nhom_id)}
    return {c.id for c in repo.cong_viec_cua_to({cv.department_id})} & ids_nhom


def test_ban_to_an_viec_chua_lam_giu_viec_dang_chay(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    repo = SanXuatRepository(db)
    khac = [c for c in repo.cong_viec_cua_to({cv.department_id}) if c.id != cv.id]
    assert cv.trang_thai == CV_DANG_CHAY
    cv.trang_thai = CV_PHAT_HANH                     # chưa làm
    db.commit()
    assert cv.id in _ids_to(repo, cv)
    n_truoc = sum(repo.dem_cho_lam_theo_to({cv.department_id}).values())
    _dong(db, cv, res)
    assert cv.id not in _ids_to(repo, cv)            # đóng ⇒ ẩn việc chưa làm
    assert sum(repo.dem_cho_lam_theo_to({cv.department_id}).values()) == n_truoc - 1
    assert {c.id for c in khac} <= {c.id for c in repo.cong_viec_cua_to({cv.department_id})}
    # Đang chạy thì giữ tới khi tổ Kết thúc.
    cv.trang_thai = CV_DANG_CHAY
    db.commit()
    assert cv.id in _ids_to(repo, cv)


def test_mo_lai_thi_viec_hien_lai(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    repo = SanXuatRepository(db)
    cv.trang_thai = CV_TAM_DUNG
    db.commit()
    cap_dong_thieu(db, res["nguoi_kcs"])
    kq = dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=None)
    assert cv.id not in _ids_to(repo, cv)
    dong_lenh.mo_lai(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=kq["version"])
    assert cv.id in _ids_to(repo, cv)


def test_ghi_me_chi_duoc_khi_viec_dang_chay(db, orders, lsx_svc, admin, customer):
    to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    nguoi = _nguoi_o_to(db, to, "tho1", viec=("run_order",))
    _dong(db, cv, res)
    cv.trang_thai = CV_DANG_CHAY
    db.commit()
    t0 = datetime.now(timezone.utc) - timedelta(hours=3)

    def ghi():
        return san_luong.tao_batch(db, user=nguoi, cong_viec_id=cv.id, bat_dau=t0,
                                   ket_thuc=t0 + timedelta(hours=1), tong=5, tot=5)

    ghi()                                            # việc đang chạy: khép được
    cv.trang_thai = CV_TAM_DUNG
    db.commit()
    with pytest.raises(ValueError, match="Lệnh đã đóng"):
        ghi()


def test_da_dong_chan_bat_dau_nhung_van_ket_thuc_duoc(db, orders, lsx_svc, admin, customer):
    from app.models.san_xuat import CV_HOAN_THANH
    from app.services.san_xuat import thuc_thi

    to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    nguoi = _nguoi_o_to(db, to, "tho1", viec=("run_order",))
    _dong(db, cv, res)
    cv.trang_thai = CV_TAM_DUNG
    db.commit()
    with pytest.raises(ValueError, match="Lệnh đã đóng"):
        thuc_thi.bat_dau(db, user=nguoi, cong_viec_id=cv.id)
    thuc_thi.ket_thuc(db, user=nguoi, cong_viec_id=cv.id)    # việc dở vẫn khép được
    db.refresh(cv)
    assert cv.trang_thai == CV_HOAN_THANH


def test_dong_hai_lan_cung_version_bi_tu_choi(db, orders, lsx_svc, admin, customer):
    _to, cv, res = _batch(db, orders, lsx_svc, admin, customer, cuoi=True)
    v = SanXuatRepository(db).nhom(cv.nhom_id).version
    cap_dong_thieu(db, res["nguoi_kcs"])
    dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=v)
    with pytest.raises(ValueError, match="đã đóng rồi"):
        dong_lenh.dong(db, user=res["nguoi_kcs"], nhom_id=cv.nhom_id, expected_version=v)
