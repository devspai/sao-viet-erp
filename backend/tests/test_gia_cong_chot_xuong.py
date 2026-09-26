"""Chốt số cuối của dải giữa lệnh ⇒ về xưởng, bàn giao sang bước sau (spec §3 bước 6–7, §6)."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import NOI_VE_KHO, NOI_VE_XUONG, GiaCongNgoai
from app.models.san_xuat import CV_HOAN_THANH, CV_PHAT_HANH
from app.models.san_xuat_san_luong import BG_DE_XUAT, SanXuatBanGiao, SanXuatBatch
from app.services.gia_cong_ngoai import TT_DA_XONG, TT_DANG_O_NGOAI
from app.services.gia_cong_ngoai.chot import chot, mo_lai
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.gia_cong_ngoai.mot_phan import mang_di
from app.services.san_xuat import ban_giao
from tests.gia_cong_fixtures import cv_ten, dung_lenh_gia_cong, giao_sang, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def da_mang_di(sess, orders, lsx_svc, admin, customer):
    """In → Cán màng + Bế (một nhà) → Đóng gói; đã mang 1.660 tờ đi."""
    a = ncc(sess)
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"),
        ("Cán màng", "thue_ngoai", a, 1660, "to"),
        ("Bế", "thue_ngoai", a, 1650, "to"),
        ("Đóng gói", "to", None, 1650, "to"),
    ])
    giao_sang(sess, admin, cv_ten(sess, lsx_id, "In"), cv_ten(sess, lsx_id, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    return lsx_id, lan


def test_chot_ve_xuong_ghi_me_hoan_thanh_va_de_xuat_ban_giao(sess, admin, da_mang_di):
    lsx_id, lan = da_mang_di
    kq = chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
              sl_cuoi=1650, noi_ve=NOI_VE_XUONG)
    be, can = cv_ten(sess, lsx_id, "Bế"), cv_ten(sess, lsx_id, "Cán màng")
    assert can.trang_thai == be.trang_thai == CV_HOAN_THANH and be.hoan_thanh_luc
    (me,) = sess.query(SanXuatBatch).filter_by(cong_viec_id=be.id).all()
    assert float(me.tot) == 1650
    bg = sess.query(SanXuatBanGiao).filter_by(nguon_cong_viec_id=be.id).one()
    assert bg.trang_thai == BG_DE_XUAT and float(bg.so_luong) == 1650
    assert bg.dich_cong_viec_id == cv_ten(sess, lsx_id, "Đóng gói").id
    assert kq["ban_giao"]["su_kien"] == "de_xuat"
    (d,) = lan_cua_lenh(sess, lsx_id, xem_tien=True)
    assert d["trang_thai"] == TT_DA_XONG and d["thanh_tien"] == 1650 * 500


def test_to_nhan_xac_nhan_duoc_nhu_thuong(sess, admin, da_mang_di):
    lsx_id, lan = da_mang_di
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1650, noi_ve=NOI_VE_XUONG)
    bg = sess.query(SanXuatBanGiao).filter_by(trang_thai=BG_DE_XUAT).one()
    ban_giao.xac_nhan(sess, user=admin, ban_giao_id=bg.id)   # admin có quyền trên tổ Đóng gói


def test_dai_giua_lenh_khong_ve_kho(sess, admin, da_mang_di):
    _lsx_id, lan = da_mang_di
    with pytest.raises(ValueError, match="bước sau"):
        chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=1650, noi_ve=NOI_VE_KHO)


def test_chua_mang_di_thi_chua_chot(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
        ("Bế", "to", None, 1000, "to"),
    ])
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    with pytest.raises(ValueError, match="Mang đi"):
        chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=1000, noi_ve=NOI_VE_XUONG)


def test_mo_lai_go_sach_roi_chot_lai(sess, admin, da_mang_di):
    lsx_id, lan = da_mang_di
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1600, noi_ve=NOI_VE_XUONG)
    sess.refresh(lan)
    mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    be = cv_ten(sess, lsx_id, "Bế")
    assert lan.chot_luc is None and lan.sl_cuoi is None
    assert be.trang_thai == CV_PHAT_HANH and be.hoan_thanh_luc is None
    assert sess.query(SanXuatBatch).filter_by(cong_viec_id=be.id).count() == 0
    assert sess.query(SanXuatBanGiao).filter_by(nguon_cong_viec_id=be.id).count() == 0
    (d,) = lan_cua_lenh(sess, lsx_id, xem_tien=True)
    assert d["trang_thai"] == TT_DANG_O_NGOAI
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1650, noi_ve=NOI_VE_XUONG)


def test_mo_lai_khong_con_cong_viec(sess, admin, da_mang_di):
    """Lệnh mất liên kết công việc SAU khi đã chốt (mồ côi) ⇒ mở lại phải báo lỗi rõ, không
    index rỗng ra IndexError."""
    lsx_id, lan = da_mang_di
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1650, noi_ve=NOI_VE_XUONG)
    sess.refresh(lan)
    for cv in (cv_ten(sess, lsx_id, "Cán màng"), cv_ten(sess, lsx_id, "Bế")):
        cv.gia_cong_ngoai_id = None
    sess.flush()
    with pytest.raises(ValueError, match="không còn công việc"):
        mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_to_sau_da_nhan_thi_khong_mo_lai(sess, admin, da_mang_di):
    _lsx_id, lan = da_mang_di
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1650, noi_ve=NOI_VE_XUONG)
    bg = sess.query(SanXuatBanGiao).filter_by(trang_thai=BG_DE_XUAT).one()
    ban_giao.xac_nhan(sess, user=admin, ban_giao_id=bg.id)
    sess.refresh(lan)
    with pytest.raises(ValueError, match="đã xác nhận"):
        mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
