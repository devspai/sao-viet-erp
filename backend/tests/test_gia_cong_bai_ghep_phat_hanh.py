"""Phát hành bài ghép có bước CHUNG thuê ngoài ⇒ lần gia công gắn bài ghép (spec 2026-09-27 §2–3).

Cùng luật gộp dải đợt 1: bước chung thuê ngoài liền nhau cùng nhà ⇒ một lần; bước chung và bước
riêng KHÔNG chung một lần. Phát hành cập nhật không đẻ lần rỗng cho bước lệnh bị bài ghép phủ.
"""
from __future__ import annotations

from app.models.gia_cong_ngoai import GiaCongNgoai
from app.models.lsx import LsxCongDoan
from app.models.bai_ghep_cong_doan import BaiGhepCongDoan
from app.services.gia_cong_ngoai.lan import dong_bo_lan_khi_cap_nhat
from app.services.san_xuat.release_update import phat_hanh_cap_nhat
from tests.gia_cong_fixtures import cv_chung, cv_ten, dung_bai_ghep_gia_cong, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


def _lan(sess, **kw):
    return sess.query(GiaCongNgoai).filter_by(**kw).order_by(GiaCongNgoai.id).all()


def test_buoc_chung_thue_ngoai_sinh_mot_lan_gan_bai_ghep(sess, orders, lsx_svc, admin, customer):
    tp = ncc(sess, "Cán màng Tân Phát")
    bg, a, b = dung_bai_ghep_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to", "to"),
        ("Cán màng", "thue_ngoai", tp, 1000, "to", "to"),
        ("Bế", "may", None, 1000, "to", "cai"),
    ], chung=[0, 1])
    (lan,) = _lan(sess, bai_ghep_id=bg.id)
    assert lan.lsx_id is None and lan.nha_cung_cap_id == tp.id
    assert lan.ten_viec == "Cán màng" and lan.nha_cung_cap_ten == "Cán màng Tân Phát"
    can = cv_chung(sess, bg.id, "Cán màng")
    assert can.gia_cong_ngoai_id == lan.id and can.department_id is None
    assert not _lan(sess, lsx_id=a) and not _lan(sess, lsx_id=b)


def test_dai_chung_lien_nhau_cung_nha_gop_mot_lan(sess, orders, lsx_svc, admin, customer):
    tp = ncc(sess, "Hộp Tân Phát")
    bg, _a, _b = dung_bai_ghep_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to", "to"),
        ("Cán màng", "thue_ngoai", tp, 1000, "to", "to"),
        ("Bế", "thue_ngoai", tp, 1000, "to", "to"),
        ("Đóng gói", "to", None, 1000, "to", "cai"),
    ], chung=[0, 1, 2])
    (lan,) = _lan(sess, bai_ghep_id=bg.id)
    assert lan.ten_viec == "Cán màng + Bế"
    assert {cv_chung(sess, bg.id, t).gia_cong_ngoai_id for t in ("Cán màng", "Bế")} == {lan.id}


def test_chung_va_rieng_khong_chung_mot_lan(sess, orders, lsx_svc, admin, customer):
    tp = ncc(sess, "Gia công Tân Phát")
    bg, a, b = dung_bai_ghep_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to", "to"),
        ("Cán màng", "thue_ngoai", tp, 1000, "to", "to"),
        ("Bế", "thue_ngoai", tp, 1000, "to", "cai"),
    ], chung=[0, 1])
    assert len(_lan(sess, bai_ghep_id=bg.id)) == 1
    for lsx_id in (a, b):
        (l,) = _lan(sess, lsx_id=lsx_id)
        assert l.ten_viec == "Bế" and cv_ten(sess, lsx_id, "Bế").gia_cong_ngoai_id == l.id


def test_cap_nhat_phat_hanh_khong_de_lan_rong_cho_buoc_bi_phu(
        sess, orders, lsx_svc, admin, customer):
    tp = ncc(sess, "Cán màng Tân Phát")
    bg, a, b = dung_bai_ghep_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to", "to"),
        ("Cán màng", "thue_ngoai", tp, 1000, "to", "to"),
        ("Bế", "may", None, 1000, "to", "cai"),
    ], chung=[0, 1])
    # Bước lệnh bị phủ chưa chọn nhà gia công (nhà nằm ở bước CHUNG) — trước đây đồng bộ coi nó như
    # bước riêng: ném "chưa chọn nhà gia công" hoặc gom thành lần không công việc nào.
    for cd in sess.query(LsxCongDoan).filter(LsxCongDoan.ten == "Cán màng",
                                              LsxCongDoan.lsx_id.in_([a, b])):
        cd.nha_cung_cap_id = cd.nha_cung_cap = None
    sess.commit()
    dong_bo_lan_khi_cap_nhat(sess, lsx_ids={a, b}, actor=admin)
    sess.commit()
    assert not _lan(sess, lsx_id=a) and not _lan(sess, lsx_id=b)
    (lan,) = _lan(sess, bai_ghep_id=bg.id)
    assert lan.huy_luc is None


def test_cap_nhat_phat_hanh_bai_ghep_dong_bo_nha_gia_cong(sess, orders, lsx_svc, admin, customer):
    tp, ml = ncc(sess, "Cán màng Tân Phát"), ncc(sess, "Cán màng Minh Long")
    bg, _a, _b = dung_bai_ghep_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to", "to"),
        ("Cán màng", "thue_ngoai", tp, 1000, "to", "to"),
        ("Bế", "may", None, 1000, "to", "cai"),
    ], chung=[0, 1])
    (lan,) = _lan(sess, bai_ghep_id=bg.id)
    can = sess.query(BaiGhepCongDoan).filter_by(bai_ghep_id=bg.id, ten="Cán màng").one()
    can.nha_cung_cap_id, can.nha_cung_cap = ml.id, ml.name
    sess.commit()
    phat_hanh_cap_nhat(sess, nguon="in_ghep", id=bg.id, ly_do="Đổi nhà cán màng", actor=admin)
    ds = _lan(sess, bai_ghep_id=bg.id)
    assert [g.id for g in ds] == [lan.id]          # dải không đổi ⇒ giữ nguyên dòng
    assert ds[0].nha_cung_cap_id == ml.id and ds[0].nha_cung_cap_ten == "Cán màng Minh Long"
