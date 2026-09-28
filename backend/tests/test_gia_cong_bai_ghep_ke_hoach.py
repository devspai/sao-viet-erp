"""Bước CHUNG thuê ngoài của bài ghép — lập kế hoạch (spec 2026-09-27 §2 bước 1, §6).

Chọn nhà gia công từ danh mục (chỉ NCC tích "Nhận gia công"), tên do máy chủ ghi; thiếu nhà gia
công ⇒ bài "Còn thiếu"; gộp chép nhà gia công khi mọi bước gộp cùng một nhà.
"""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import KIEU_MOT_PHAN, GiaCongNgoai, _utcnow
from app.models.lsx import LB_MAY, LB_THUE_NGOAI, LsxCongDoan
from app.models.purchase import Supplier
from app.services.bai_ghep_service import BaiGhepValidationError
from tests.test_bai_ghep_service import (  # noqa: F401
    _hai_lsx_san_sang, admin, bg_svc, customer, db, lsx_svc, orders,
)


def _ncc(db, ten="Cán màng Tân Phát", nhan=True) -> Supplier:
    s = Supplier(name=ten, nhan_gia_cong=nhan)
    db.add(s)
    db.commit()
    return s


def _buoc_in(db, lsx_id) -> LsxCongDoan:
    return (db.query(LsxCongDoan).filter(LsxCongDoan.lsx_id == lsx_id)
            .order_by(LsxCongDoan.thu_tu).first())


@pytest.fixture
def bai(db, orders, lsx_svc, bg_svc, admin, customer):
    a, b = _hai_lsx_san_sang(db, orders, lsx_svc, admin, customer)
    bg = bg_svc.tao(lsx_ids=[a.id, b.id], actor=admin)
    return bg, a, b


def _gop(db, bg_svc, admin, bg, a, b):
    bg_svc.gop(bai_ghep_id=bg.id, actor=admin,
               step_keys=[_buoc_in(db, a.id).step_key, _buoc_in(db, b.id).step_key])
    (c,) = bg_svc._buoc_chungs(bg_svc._get(bg.id))
    return c


def test_chon_nha_gia_cong_ten_do_may_chu_ghi_go_to_may(db, bg_svc, admin, bai):
    bg, a, b = bai
    c = _gop(db, bg_svc, admin, bg, a, b)
    s = _ncc(db)
    bg_svc.lap_ke_hoach_buoc_chung(
        bai_ghep_id=bg.id, gang_step_key=c.step_key, actor=admin,
        patch={"loai_buoc": LB_THUE_NGOAI, "nha_cung_cap_id": s.id, "department_id": 1},
    )
    db.refresh(c)
    assert c.nha_cung_cap_id == s.id and c.nha_cung_cap == "Cán màng Tân Phát"
    assert c.department_id is None and c.may_id is None
    assert "Chưa chọn nhà gia công" not in bg_svc._thieu_buoc_chung(c)


def test_ncc_khong_nhan_gia_cong_bi_tu_choi(db, bg_svc, admin, bai):
    bg, a, b = bai
    c = _gop(db, bg_svc, admin, bg, a, b)
    s = _ncc(db, "Giấy Hoà Bình", nhan=False)
    with pytest.raises(BaiGhepValidationError, match="Nhận gia công"):
        bg_svc.lap_ke_hoach_buoc_chung(
            bai_ghep_id=bg.id, gang_step_key=c.step_key, actor=admin,
            patch={"loai_buoc": LB_THUE_NGOAI, "nha_cung_cap_id": s.id},
        )


def test_thieu_nha_gia_cong_la_con_thieu(db, bg_svc, admin, bai):
    bg, a, b = bai
    c = _gop(db, bg_svc, admin, bg, a, b)
    bg_svc.lap_ke_hoach_buoc_chung(bai_ghep_id=bg.id, gang_step_key=c.step_key, actor=admin,
                                   patch={"loai_buoc": LB_THUE_NGOAI})
    db.refresh(c)
    assert "Chưa chọn nhà gia công" in bg_svc._thieu_buoc_chung(c)
    assert "thieu_ke_hoach_buoc_chung" in bg_svc.thieu_cua(bg_svc._get(bg.id))


def test_doi_khoi_thue_ngoai_don_nha_gia_cong(db, bg_svc, admin, bai):
    bg, a, b = bai
    c = _gop(db, bg_svc, admin, bg, a, b)
    s = _ncc(db)
    bg_svc.lap_ke_hoach_buoc_chung(bai_ghep_id=bg.id, gang_step_key=c.step_key, actor=admin,
                                   patch={"loai_buoc": LB_THUE_NGOAI, "nha_cung_cap_id": s.id})
    bg_svc.lap_ke_hoach_buoc_chung(bai_ghep_id=bg.id, gang_step_key=c.step_key, actor=admin,
                                   patch={"loai_buoc": LB_MAY})
    db.refresh(c)
    assert c.nha_cung_cap_id is None and c.nha_cung_cap is None


def test_gop_chep_nha_gia_cong_khi_moi_buoc_cung_mot_nha(db, bg_svc, admin, bai):
    bg, a, b = bai
    s = _ncc(db)
    for l in (a, b):
        cd = _buoc_in(db, l.id)
        cd.loai_buoc, cd.nha_cung_cap_id, cd.nha_cung_cap = LB_THUE_NGOAI, s.id, s.name
    db.commit()
    c = _gop(db, bg_svc, admin, bg, a, b)
    assert c.loai_buoc == LB_THUE_NGOAI
    assert c.nha_cung_cap_id == s.id and c.nha_cung_cap == s.name


def test_gop_khong_chep_khi_khac_nha(db, bg_svc, admin, bai):
    bg, a, b = bai
    s1, s2 = _ncc(db), _ncc(db, "Cán màng Minh Long")
    for l, s in ((a, s1), (b, s2)):
        cd = _buoc_in(db, l.id)
        cd.loai_buoc, cd.nha_cung_cap_id, cd.nha_cung_cap = LB_THUE_NGOAI, s.id, s.name
    db.commit()
    c = _gop(db, bg_svc, admin, bg, a, b)
    assert c.nha_cung_cap_id is None and c.nha_cung_cap is None


def test_xoa_bai_don_lan_da_huy(db, bg_svc, admin, bai):
    bg, _a, _b = bai
    s = _ncc(db)
    db.add(GiaCongNgoai(kieu=KIEU_MOT_PHAN, nha_cung_cap_id=s.id, bai_ghep_id=bg.id,
                        huy_luc=_utcnow(), ly_do_huy="Thu hồi gói"))
    db.commit()
    bg_svc.xoa(bai_ghep_id=bg.id, actor=admin)
    assert db.query(GiaCongNgoai).filter_by(bai_ghep_id=bg.id).count() == 0
