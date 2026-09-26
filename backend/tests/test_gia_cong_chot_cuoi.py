"""Dải chứa bước cuối: số chốt thay KCS ⇒ về kho hoặc giao thẳng (spec §3 cuối, §4 bước 4–5)."""
from __future__ import annotations

import pytest

from datetime import date

from app.models.delivery import LG_DA_HUY, LG_THANH_CONG, DeliveryTrip
from app.models.gia_cong_ngoai import NOI_VE_KHACH, NOI_VE_KHO, GiaCongNgoai
from app.models.lsx import Lsx
from app.models.san_xuat import CV_HOAN_THANH, NHOM_DONG_DU, NHOM_DONG_THIEU, SanXuatNhom
from app.models.san_xuat_kcs import SanXuatKcsBatch
from app.models.stock_request import REQ_CANCELLED, StockRequest
from app.models.stock_voucher import VOUCHER_DRAFT, VOUCHER_NHAP, StockVoucher
from app.repositories.delivery_repo import DeliveryRepository
from app.services.gia_cong_ngoai.chot import chot, mo_lai
from app.services.gia_cong_ngoai.mot_phan import mang_di
from app.services.san_xuat.kcs import chuoi_cong_doan_kcs
from tests.gia_cong_fixtures import (
    cv_ten, dung_lenh_gia_cong, giao_sang, ncc, nguoi_ke_hoach, nguoi_kcs, nhan_vien_cua,
)
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def dai_cuoi(sess, orders, lsx_svc, admin, customer):
    """In → Bế + Đóng gói ngoài (bước cuối); đã mang đi; tổ In đã xong việc.

    Đơn vị ra của dải = "cái" (đúng đơn vị dòng đơn) — cùng khuôn `test_san_xuat_kcs._cv_kcs`, để
    quy sang đơn vị thành phẩm có hệ số 1 và bài test đọc thẳng được số."""
    a = ncc(sess, "Hộp Phú Thịnh")
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Bế", "thue_ngoai", a, 1000, "cái"),
        ("Đóng gói", "thue_ngoai", a, 1000, "cái"),
    ])
    in_ = cv_ten(sess, lsx_id, "In")
    giao_sang(sess, admin, in_, cv_ten(sess, lsx_id, "Bế"), 1000)
    in_.trang_thai = CV_HOAN_THANH          # đóng nhóm đòi MỌI công việc xong
    sess.commit()
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    return lsx_id, lan


def test_ve_kho_ghi_kcs_tong_hop_va_de_nghi_nhap(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    kq = chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
              sl_cuoi=1000, noi_ve=NOI_VE_KHO)
    cuoi = cv_ten(sess, lsx_id, "Đóng gói")
    (k,) = sess.query(SanXuatKcsBatch).filter_by(cong_viec_id=cuoi.id).all()
    assert float(k.so_luong_dat) == 1000 and "ngoài phần mềm" in k.ghi_chu
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id).one()
    assert req.san_xuat_cong_viec_id == cuoi.id and req is kq["yeu_cau_kho"]
    # Đủ mục tiêu + mọi việc xong ⇒ nhóm tự đóng đủ như hàng xưởng làm.
    assert sess.get(SanXuatNhom, cuoi.nhom_id).trang_thai == NHOM_DONG_DU
    assert kq["nhom_dong"]["kieu"] == "du"


def test_man_kcs_khong_bao_con_gui_kho_cho_viec_gia_cong(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHO)
    chuoi = chuoi_cong_doan_kcs(sess, nguoi_kcs(sess), lsx_id)
    cuoi = next(c for c in chuoi["cong_doan"] if c["ten"] == "Đóng gói")
    assert cuoi["con_gui_kho"] == 0 and cuoi["gia_cong_ngoai"] is True


def test_mo_lai_ve_kho_huy_de_nghi_va_mo_lai_nhom(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHO)
    sess.refresh(lan)
    mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    cuoi = cv_ten(sess, lsx_id, "Đóng gói")
    assert sess.query(SanXuatKcsBatch).filter_by(cong_viec_id=cuoi.id).count() == 0
    assert sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id).one().trang_thai == REQ_CANCELLED
    assert sess.get(SanXuatNhom, cuoi.nhom_id).trang_thai != NHOM_DONG_DU


def test_mo_lai_ve_kho_chan_khi_da_lap_phieu(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHO)
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id).one()
    v = StockVoucher(ma=f"PNK-TEST-{req.id}", loai=VOUCHER_NHAP, request_id=req.id, kho_id=1,
                     ngay=date(2026, 9, 26), nguoi_lap_id=admin.id, trang_thai=VOUCHER_DRAFT)
    sess.add(v)
    sess.commit()
    sess.refresh(lan)
    with pytest.raises(ValueError, match="đã lập phiếu"):
        mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_mo_lai_ve_kho_chan_khi_nhom_dong_thieu(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHO)
    cuoi = cv_ten(sess, lsx_id, "Đóng gói")
    nhom = sess.get(SanXuatNhom, cuoi.nhom_id)
    # Trưởng KCS đã đóng thiếu (đường tắt: gán thẳng trạng thái, workflow đủ điều kiện đã kiểm ở
    # `dong_nhom.py`, bài test này chỉ soi cửa mở lại) — trạng thái này KHOÁ CỨNG, không đảo được.
    nhom.trang_thai = NHOM_DONG_THIEU
    sess.commit()
    sess.refresh(lan)
    with pytest.raises(ValueError, match="đóng thiếu"):
        mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_giao_thang_ghi_chuyen_thanh_cong_cong_vao_da_giao(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
    trip = sess.query(DeliveryTrip).filter_by(gia_cong_ngoai_id=lan.id).one()
    assert trip.trang_thai == LG_THANH_CONG and trip.km is None
    l = sess.get(Lsx, lsx_id)
    assert DeliveryRepository(sess).da_giao_theo_dong(l.order_id)[l.order_line_id] == 1000
    assert sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id).count() == 0


def test_giao_thang_mo_lai_huy_chuyen(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
    sess.refresh(lan)
    mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    assert sess.query(DeliveryTrip).filter_by(gia_cong_ngoai_id=lan.id).one().trang_thai == LG_DA_HUY
    l = sess.get(Lsx, lsx_id)
    assert DeliveryRepository(sess).da_giao_theo_dong(l.order_id).get(l.order_line_id, 0) == 0


def test_giao_thang_can_ho_so_nhan_vien(sess, dai_cuoi):
    _lsx_id, lan = dai_cuoi
    kh = nguoi_ke_hoach(sess)                       # tài khoản mới, chưa gắn hồ sơ nhân viên
    with pytest.raises(ValueError, match="hồ sơ nhân viên"):
        chot(sess, user=kh, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
