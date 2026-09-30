"""Đóng lệnh × việc chung bài ghép, và gỡ số chốt gia công ngoài khi nhóm đã đóng."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import NOI_VE_KHACH
from app.models.lsx import TT_DA_PHAT_HANH, Lsx
from app.models.san_xuat import CV_PHAT_HANH, NHOM_DONG, SanXuatNhom, SanXuatNhomLsx
from app.repositories.san_xuat_repo import SanXuatRepository
from app.services.gia_cong_ngoai.chot import chot, mo_lai
from app.services.san_xuat import dong_lenh
from tests.gia_cong_fixtures import cv_ten, nguoi_kcs, nhan_vien_cua
from tests.lenh_sx_fixtures import (  # noqa: F401
    admin, customer, ghep_doi, lsx_svc, orders, sess,
)
from tests.test_gia_cong_chot_cuoi import dai_cuoi  # noqa: F401


def _nhom_cua(sess, lsx_id: int) -> int:
    return sess.query(SanXuatNhomLsx).filter_by(lsx_id=lsx_id).one().nhom_id


def _dong_nhom(sess, kcs, nhom_id: int) -> None:
    dong_lenh.dong(sess, user=kcs, nhom_id=nhom_id)


def _hien_o_ban_to(sess, cv) -> bool:
    return cv.id in {c.id for c in SanXuatRepository(sess).cong_viec_cua_to({cv.department_id})}


def test_viec_chung_bai_ghep_chi_dong_khi_dong_het_nhom(sess, ghep_doi):
    a_id, b_id, cv = ghep_doi
    kcs = nguoi_kcs(sess)
    na, nb = _nhom_cua(sess, a_id), _nhom_cua(sess, b_id)
    assert na != nb and cv.nhom_id is None and cv.bai_ghep_id is not None
    for l in (sess.get(Lsx, a_id), sess.get(Lsx, b_id)):
        l.trang_thai = TT_DA_PHAT_HANH
    cv.trang_thai = CV_PHAT_HANH                     # chưa làm
    sess.commit()

    assert _hien_o_ban_to(sess, cv)
    _dong_nhom(sess, kcs, na)                           # mới một nhóm đóng
    assert dong_lenh.nhom_da_dong(sess, cv) is False
    dong_lenh.chan_neu_da_dong(sess, cv)             # không raise
    assert _hien_o_ban_to(sess, cv)

    _dong_nhom(sess, kcs, nb)                           # đóng hết
    assert dong_lenh.nhom_da_dong(sess, cv) is True
    with pytest.raises(ValueError, match="Lệnh đã đóng"):
        dong_lenh.chan_neu_da_dong(sess, cv)
    assert not _hien_o_ban_to(sess, cv)

    dong_lenh.mo_lai(sess, user=kcs, nhom_id=nb)   # mở lại một nhóm
    assert dong_lenh.nhom_da_dong(sess, cv) is False
    assert _hien_o_ban_to(sess, cv)
    assert sess.get(SanXuatNhom, na).trang_thai == NHOM_DONG


def test_go_so_chot_gia_cong_ngoai_bi_chan_khi_nhom_da_dong(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
    cuoi = cv_ten(sess, lsx_id, "Đóng gói")
    sess.get(Lsx, lsx_id).trang_thai = TT_DA_PHAT_HANH
    sess.commit()
    dong_lenh.dong(sess, user=nguoi_kcs(sess), nhom_id=cuoi.nhom_id)
    sess.refresh(lan)
    with pytest.raises(ValueError, match="Lệnh đã đóng"):
        mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
