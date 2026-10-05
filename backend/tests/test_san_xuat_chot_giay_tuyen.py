"""Chốt giấy trên lệnh nhiều bước CTP → In → Đóng gói (spec dòng giấy theo đầu vào §3.3): tổ Cắt
THÊM công đoạn Trước In vào NGAY TRƯỚC bước In (thứ tự bảng CTP · Cắt tờ · In · Đóng gói) nhưng chạy
SONG SONG với CTP: Cắt không chờ CTP, In chờ cả CTP lẫn Cắt (phán quyết controller 01/10/2026).

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


def test_them_cat_song_song_ctp_ca_hai_vao_in(sess, admin, lenh_that):
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
    # Cổng §4.7 chỉ đứng ở bước mang giấy: CTP / Đóng gói bắt đầu không phải chờ tổ Cắt.
    assert chot_giay.ly_do_cho_chot(sess, cv_ctp) is None
    assert chot_giay.ly_do_cho_chot(sess, _cv(sess, dong_goi)) is None
    assert chot_giay.ly_do_cho_chot(sess, cv_in)

    kq = chot_giay.them(sess, user=admin, team_id=to_cat.id, lsx_id=lenh_that, bai_ghep_id=None,
                        cong_doan_ids=[cd.id])
    sess.commit()
    sess.expire_all()
    ten = [b.ten for b in sess.query(LsxCongDoan).filter_by(lsx_id=lenh_that)
           .order_by(LsxCongDoan.thu_tu)]
    assert ten == ["CTP", "Cắt tờ", "In", "Đóng gói"]

    sl = SanXuatSanLuongRepository(sess)
    cv_cat = sess.get(SanXuatCongViec, kq["cong_viec_moi"][0])
    assert sl.cong_viec_chang_truoc(cv_ctp) == []
    assert sl.cong_viec_chang_truoc(cv_cat) == []
    assert {c.id for c in sl.cong_viec_chang_truoc(cv_in)} == {cv_ctp.id, cv_cat.id}
    assert [c.id for c in sl.cong_viec_chang_sau(cv_cat)] == [cv_in.id]
    assert [c.id for c in sl.cong_viec_chang_sau(cv_ctp)] == [cv_in.id]
    # Cắt có dòng giấy rồi ⇒ cổng chờ chốt không còn khoá In.
    assert chot_giay.ly_do_cho_chot(sess, cv_in) is None


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
    # Cổng §4.7: bước chung đầu bài chờ tổ Cắt, câu gọi mã BÀI chứ không mã lệnh con.
    ly_do = chot_giay.ly_do_cho_chot(sess, cv_in)
    assert ly_do and ly_do.startswith(f"Chờ tổ Cắt chốt giấy cho {bg.ma}")
    import pytest

    from app.repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository as _R
    from app.services.san_xuat.dau_vao import kiem_bat_dau
    with pytest.raises(ValueError, match="Chờ tổ Cắt"):
        kiem_bat_dau(_R(sess), cv_in)
    ds = chot_giay.danh_sach(sess, team_id=to_cat.id)
    assert [(d["chu_the"], d["id"]) for d in ds] == [("bai", bg.id)]

    kq = chot_giay.them(sess, user=admin, team_id=to_cat.id, lsx_id=None, bai_ghep_id=bg.id,
                        cong_doan_ids=[cd.id])
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

    assert chot_giay.ly_do_cho_chot(sess, cv_in) is None
    row = chot_giay.danh_sach(sess, team_id=to_cat.id)[0]
    assert [b["buoc_id"] for b in row["buoc_truoc_in"]] == [chung[0].id]

    chot_giay.xoa(sess, user=admin, team_id=to_cat.id, lsx_id=None, bai_ghep_id=bg.id,
                  buoc_id=chung[0].id)
    sess.commit()
    sess.expire_all()
    assert sess.get(type(bg), bg.id).giay_chot_cach == "khong_cat"
    assert [c.ten for c in sess.query(BaiGhepCongDoan).filter_by(bai_ghep_id=bg.id)] == ["In"]
    assert sess.query(LsxCongDoan).filter(LsxCongDoan.lsx_id.in_([a, b]),
                                          LsxCongDoan.chen_boi_to_cat.is_(True)).count() == 0
    assert sess.get(SanXuatCongViec, cv_cat.id) is None
    assert [b_.thu_tu for b_ in sess.query(BaiGhepCongDoan).filter_by(bai_ghep_id=bg.id)] == [0]


def _nen_tuyen(sess, admin, lenh_that):
    g = GiayNguyen(ma="G-CG-TY2", ten="Couche 150", gsm=150, kho_rong=790, kho_dai=1090)
    sess.add(g)
    sess.flush()
    in_ = _buoc(sess, lenh_that, "In")
    sess.add(LsxCongDoanVatTu(
        lsx_cong_doan_id=in_.id, hang_loai="giay", vat_tu_id=g.id, vat_tu_ma_snapshot=g.ma,
        vat_tu_ten_snapshot=g.ten, don_vi_snapshot="to", so_luong=5000, kho_rong=790,
        kho_dai=1090))
    to_cat = Department(name="Tổ Cắt tuyến 2", code="TO-CAT-TY2", la_san_xuat=True, la_to_cat=True)
    sess.add(to_cat)
    sess.flush()
    cap_quyen_to(sess, admin, to_cat)
    cds = []
    for ma, ten in (("CD-XEN-TY2", "Xén giấy"), ("CD-CAT-TY2", "Cắt tờ")):
        cd = CongDoan(ma=ma, ten=ten, nhom="prepress", cong_thuc_gia="so_luong * don_gia")
        sess.add(cd)
        sess.flush()
        cd.department_ids = [to_cat.id]
        cds.append(cd)
    sess.commit()
    return to_cat, cds


def test_xoa_cat1_cua_chuoi_song_song_khong_de_canh_ctp_moi(sess, admin, lenh_that):
    from app.models.lsx import LsxCongDoanPhuThuoc

    to_cat, (xen, cat) = _nen_tuyen(sess, admin, lenh_that)
    chot_giay.them(sess, user=admin, team_id=to_cat.id, lsx_id=lenh_that, bai_ghep_id=None,
                   cong_doan_ids=[xen.id, cat.id])
    sess.commit()
    sess.expire_all()
    ctp, b_xen, b_cat = (_buoc(sess, lenh_that, t) for t in ("CTP", "Xén giấy", "Cắt tờ"))
    chot_giay.xoa(sess, user=admin, team_id=to_cat.id, lsx_id=lenh_that, bai_ghep_id=None,
                  buoc_id=b_xen.id)
    sess.commit()
    sess.expire_all()
    ten = [b.ten for b in sess.query(LsxCongDoan).filter_by(lsx_id=lenh_that)
           .order_by(LsxCongDoan.thu_tu)]
    assert ten == ["CTP", "Cắt tờ", "In", "Đóng gói"]
    assert sess.query(LsxCongDoanPhuThuoc).filter_by(
        buoc_truoc_id=ctp.id, buoc_sau_id=b_cat.id).count() == 0
    sl = SanXuatSanLuongRepository(sess)
    cv_cat, cv_in, cv_ctp = _cv(sess, b_cat), _cv(sess, _buoc(sess, lenh_that, "In")), _cv(sess, ctp)
    assert sl.cong_viec_chang_truoc(cv_cat) == []
    assert {c.id for c in sl.cong_viec_chang_truoc(cv_in)} == {cv_ctp.id, cv_cat.id}


def test_bai_ghep_ctp_chung_truoc_in_cong_khoa_in_cat_song_song(
        sess, orders, lsx_svc, admin, customer):
    """Bài có bước chung Ghi kẽm (Trước In, tổ khác) đứng trước In: In mới là bước nhận giấy."""
    from app.models.bai_ghep_cong_doan import BaiGhepCongDoan, BaiGhepCongDoanMap
    from app.services.san_xuat import release
    from tests.gia_cong_fixtures import cv_chung, dung_bai_ghep_gia_cong

    bg, a, b = dung_bai_ghep_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("CTP", "may", None, 8, "kem", "kem"),
        ("In", "may", None, 1000, "to", "to"),
        ("Bế", "may", None, 4000, "to", "cai"),
    ], chung=[0, 1], con=(4, 2), phat_hanh=False)
    for ten, nhom in (("CTP", "prepress"), ("In", "print")):
        for x in sess.query(BaiGhepCongDoan).filter_by(bai_ghep_id=bg.id, ten=ten):
            x.nhom = nhom
        for x in sess.query(LsxCongDoan).filter(LsxCongDoan.lsx_id.in_([a, b]),
                                                LsxCongDoan.ten == ten):
            x.nhom = nhom
    bg.giay_id = sess.query(GiayNguyen).filter_by(ma="G-IV350X").one().id
    sess.commit()
    release.phat_hanh(sess, lsx_ids={a, b}, bai_ghep_ids={bg.id}, actor=admin)
    sess.commit()
    to_cat = Department(name="Tổ Cắt bài CTP", code="TO-CAT-BGC", la_san_xuat=True, la_to_cat=True)
    sess.add(to_cat)
    sess.flush()
    cap_quyen_to(sess, admin, to_cat)
    cd = CongDoan(ma="CD-CAT-BGC", ten="Cắt tờ", nhom="prepress", cong_thuc_gia="so_luong * don_gia")
    sess.add(cd)
    sess.flush()
    cd.department_ids = [to_cat.id]
    sess.commit()

    cv_ctp, cv_in = cv_chung(sess, bg.id, "CTP"), cv_chung(sess, bg.id, "In")
    assert chot_giay.ly_do_cho_chot(sess, cv_ctp) is None
    assert chot_giay.ly_do_cho_chot(sess, cv_in)
    assert chot_giay.buoc_lay_giay(sess, ("bai", bg.id)).ten == "In"

    kq = chot_giay.them(sess, user=admin, team_id=to_cat.id, lsx_id=None, bai_ghep_id=bg.id,
                        cong_doan_ids=[cd.id])
    sess.commit()
    sess.expire_all()
    chung = [c.ten for c in sess.query(BaiGhepCongDoan).filter_by(bai_ghep_id=bg.id)
             .order_by(BaiGhepCongDoan.thu_tu)]
    assert chung == ["CTP", "Cắt tờ", "In"]
    for lid in (a, b):
        ten = [x.ten for x in sess.query(LsxCongDoan).filter_by(lsx_id=lid)
               .order_by(LsxCongDoan.thu_tu)]
        assert ten == ["CTP", "Cắt tờ", "In", "Bế"]
    cv_cat = sess.get(SanXuatCongViec, kq["cong_viec_moi"][0])
    sl = SanXuatSanLuongRepository(sess)
    assert sl.cong_viec_chang_truoc(cv_cat) == []
    assert {c.id for c in sl.cong_viec_chang_truoc(cv_in)} == {cv_ctp.id, cv_cat.id}
    assert chot_giay.ly_do_cho_chot(sess, cv_in) is None
    assert chot_giay.ly_do_cho_chot(sess, cv_ctp) is None
    bc_cat = sess.query(BaiGhepCongDoan).filter_by(bai_ghep_id=bg.id, ten="Cắt tờ").one()
    assert sess.query(BaiGhepCongDoanMap).filter_by(bai_ghep_cong_doan_id=bc_cat.id).count() == 2
