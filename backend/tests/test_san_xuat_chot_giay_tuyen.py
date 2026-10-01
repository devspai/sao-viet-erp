"""Chốt giấy trên lệnh nhiều bước CTP → In → Đóng gói (spec giấy theo khổ §4.6): bước cắt chèn đầu
tuyến chỉ đứng trước BƯỚC MANG GIẤY — CTP không chờ Cắt, In chờ cả CTP lẫn Cắt.

Nền `lenh_that` (đã phát hành, không có giấy) + gắn một dòng giấy lên bước In sau phát hành — luật
"bước mang giấy" đọc dòng vật tư sống của bước, không đọc snapshot."""
from __future__ import annotations

from app.models.cong_doan import CongDoan
from app.models.department import Department
from app.models.lsx import LsxCongDoan, LsxCongDoanVatTu
from app.models.san_xuat import SanXuatCongViec
from app.models.vat_lieu_kho import GiayNguyen
from app.repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from app.services.san_xuat import chot_giay
from tests.lenh_sx_fixtures import (  # noqa: F401
    admin, customer, lenh_that, lsx_svc, orders, sess,
)
from tests.quyen_to_fixtures import cap_quyen_to


def _buoc(sess, lsx_id, ten) -> LsxCongDoan:
    return sess.query(LsxCongDoan).filter_by(lsx_id=lsx_id, ten=ten).one()


def _cv(sess, buoc) -> SanXuatCongViec:
    return sess.query(SanXuatCongViec).filter_by(lsx_cong_doan_id=buoc.id).one()


def test_ctp_khong_cho_cat_in_cho_ca_ctp_lan_cat(sess, admin, lenh_that):
    g = GiayNguyen(ma="G-CG-TUYEN", ten="Couche 150", gsm=150, kho_rong=790, kho_dai=1090)
    sess.add(g)
    sess.flush()
    in_ = _buoc(sess, lenh_that, "In")
    sess.add(LsxCongDoanVatTu(
        lsx_cong_doan_id=in_.id, hang_loai="giay", vat_tu_id=g.id, vat_tu_ma_snapshot=g.ma,
        vat_tu_ten_snapshot=g.ten, don_vi_snapshot="to", so_luong=5000, kho_rong=790,
        kho_dai=1090))
    to_cat = Department(name="Tổ Cắt tuyến", code="TO-CAT-TY", la_san_xuat=True, la_to_cat=True)
    sess.add(to_cat)
    sess.flush()
    cap_quyen_to(sess, admin, to_cat)
    cd = CongDoan(ma="CD-CAT-TY", ten="Cắt tờ", nhom="prepress", cong_thuc_gia="so_luong * don_gia")
    sess.add(cd)
    sess.flush()
    cd.department_ids = [to_cat.id]
    sess.commit()

    ctp, dong_goi = _buoc(sess, lenh_that, "CTP"), _buoc(sess, lenh_that, "Đóng gói")
    cv_ctp, cv_in = _cv(sess, ctp), _cv(sess, in_)
    assert chot_giay.la_buoc_mang_giay(sess, cv_in)
    assert not chot_giay.la_buoc_mang_giay(sess, cv_ctp)
    assert not chot_giay.la_buoc_mang_giay(sess, _cv(sess, dong_goi))

    kq = chot_giay.chot(sess, user=admin, team_id=to_cat.id, lsx_id=lenh_that, bai_ghep_id=None,
                        cach="cat", cong_doan_ids=[cd.id])
    sess.commit()
    sess.expire_all()
    ten = [b.ten for b in sess.query(LsxCongDoan).filter_by(lsx_id=lenh_that)
           .order_by(LsxCongDoan.thu_tu)]
    assert ten == ["Cắt tờ", "CTP", "In", "Đóng gói"]

    sl = SanXuatSanLuongRepository(sess)
    cv_cat = sess.get(SanXuatCongViec, kq["cong_viec_moi"][0])
    assert sl.cong_viec_chang_truoc(cv_ctp) == []
    assert {c.id for c in sl.cong_viec_chang_truoc(cv_in)} == {cv_ctp.id, cv_cat.id}
    assert [c.id for c in sl.cong_viec_chang_sau(cv_cat)] == [cv_in.id]
    assert [c.id for c in sl.cong_viec_chang_sau(cv_ctp)] == [cv_in.id]


def test_bai_ghep_chen_mot_cong_viec_cat_cho_ca_bai(sess, orders, lsx_svc, admin, customer):
    from app.models.bai_ghep_cong_doan import BaiGhepCongDoan, BaiGhepCongDoanMap
    from app.models.lsx import LsxCongDoanPhuThuoc
    from tests.gia_cong_fixtures import cv_chung, dung_bai_ghep_gia_cong

    bg, a, b = dung_bai_ghep_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to", "to"),
        ("Bế", "may", None, 4000, "to", "cai"),
    ], chung=[0], con=(4, 2))
    bg.giay_id = sess.query(GiayNguyen).filter_by(ma="G-IV350X").one().id
    to_cat = Department(name="Tổ Cắt bài", code="TO-CAT-BG", la_san_xuat=True, la_to_cat=True)
    sess.add(to_cat)
    sess.flush()
    cap_quyen_to(sess, admin, to_cat)
    cd = CongDoan(ma="CD-CAT-BG", ten="Cắt tờ", nhom="prepress", cong_thuc_gia="so_luong * don_gia")
    sess.add(cd)
    sess.flush()
    cd.department_ids = [to_cat.id]
    sess.commit()

    cv_in = cv_chung(sess, bg.id, "In")
    assert chot_giay.la_buoc_mang_giay(sess, cv_in)
    ds = chot_giay.danh_sach(sess, team_id=to_cat.id)
    assert [(d["chu_the"], d["id"]) for d in ds] == [("bai", bg.id)]

    kq = chot_giay.chot(sess, user=admin, team_id=to_cat.id, lsx_id=None, bai_ghep_id=bg.id,
                        cach="cat", cong_doan_ids=[cd.id])
    sess.commit()
    sess.expire_all()
    assert len(kq["cong_viec_moi"]) == 1
    cv_cat = sess.get(SanXuatCongViec, kq["cong_viec_moi"][0])
    assert cv_cat.bai_ghep_id == bg.id and cv_cat.department_id == to_cat.id
    chung = (sess.query(BaiGhepCongDoan).filter_by(bai_ghep_id=bg.id)
             .order_by(BaiGhepCongDoan.thu_tu).all())
    assert [(c.ten, c.chen_boi_to_cat) for c in chung] == [("Cắt tờ", True), ("In", False)]
    phu = sess.query(BaiGhepCongDoanMap).filter_by(bai_ghep_cong_doan_id=chung[0].id).all()
    assert {m.lsx_id for m in phu} == {a, b}
    for lid in (a, b):
        cat = sess.query(LsxCongDoan).filter_by(lsx_id=lid, chen_boi_to_cat=True).one()
        in_ = _buoc(sess, lid, "In")
        assert cat.thu_tu == 0 and in_.thu_tu == 1
        assert [c.buoc_sau_id for c in sess.query(LsxCongDoanPhuThuoc)
                .filter_by(buoc_truoc_id=cat.id)] == [in_.id]
    sl = SanXuatSanLuongRepository(sess)
    assert cv_cat.id in {c.id for c in sl.cong_viec_chang_truoc(cv_in)}
    # Bước mang giấy của bài vẫn là bước chung In, không phải bước cắt vừa chèn.
    assert chot_giay.la_buoc_mang_giay(sess, cv_in)
    assert not chot_giay.la_buoc_mang_giay(sess, cv_cat)

    chot_giay.go_chot(sess, user=admin, team_id=to_cat.id, lsx_id=None, bai_ghep_id=bg.id)
    sess.commit()
    sess.expire_all()
    assert [c.ten for c in sess.query(BaiGhepCongDoan).filter_by(bai_ghep_id=bg.id)] == ["In"]
    assert sess.query(LsxCongDoan).filter(LsxCongDoan.lsx_id.in_([a, b]),
                                          LsxCongDoan.chen_boi_to_cat.is_(True)).count() == 0
    assert sess.get(SanXuatCongViec, cv_cat.id) is None
    assert [b_.thu_tu for b_ in sess.query(BaiGhepCongDoan).filter_by(bai_ghep_id=bg.id)] == [0]
