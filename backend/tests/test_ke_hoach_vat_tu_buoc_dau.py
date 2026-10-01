"""Kế hoạch vật tư: giấy chỉ tính ở BƯỚC ĐẦU mỗi mã (bước lấy từ kho) — spec 2026-10-01 §5."""
from __future__ import annotations

import pytest

from app.models.bai_ghep_cong_doan import BaiGhepCongDoan
from app.models.lsx import LsxCongDoan, LsxCongDoanVatTu
from app.services.kho_giay import chuan_kho, don_vi_goc_to

# Fixture và dựng liệu dùng chung với bộ test KHVT chính.
from tests.test_ke_hoach_vat_tu import (  # noqa: F401
    MAI, _bai, _giay, _lenh, _nhom, customer, db, svc,
)


def _buoc_giay(db, l, *, thu_tu, ten, giay, so_luong, kho, don_vi_vao="to_nguyen", dang="to",
               dvt=None):
    b = LsxCongDoan(lsx_id=l.id, thu_tu=thu_tu, ten=ten, loai_buoc="may",
                    don_vi_vao=don_vi_vao, don_vi_ra="to", so_luong_vao=so_luong,
                    so_luong_ra=so_luong)
    db.add(b)
    db.flush()
    kr, kd = chuan_kho(*kho) if kho else (0, 0)
    db.add(LsxCongDoanVatTu(
        lsx_cong_doan_id=b.id, hang_loai="giay", vat_tu_id=giay.id,
        vat_tu_ma_snapshot=giay.ma, vat_tu_ten_snapshot=giay.ten,
        don_vi_snapshot=dvt or don_vi_goc_to(), so_luong=so_luong, kho_rong=kr, kho_dai=kd,
        thu_tu=0, tu_dong=False, dang_giay=dang,
    ))
    db.commit()
    return b


def _lenh_cat_in(db, customer, g):
    """Lệnh 2 bước: Cắt tờ (790×1090, 5.260 tờ nguyên) → In (545×790, 10.520 tờ in)."""
    l = _lenh(db, customer, ma="LSX-CI", giay_id=g.id, so_to_nguyen=5_260, han=MAI, buoc=False)
    cat = _buoc_giay(db, l, thu_tu=1, ten="Cắt tờ", giay=g, so_luong=5_260, kho=(790, 1_090))
    in_ = _buoc_giay(db, l, thu_tu=2, ten="In offset", giay=g, so_luong=10_520, kho=(545, 790),
                     don_vi_vao="to")
    return l, cat, in_


def _khoa_giay(bang, g):
    return {(i["hang_loai"], i["hang_id"], i["kho_rong"], i["kho_dai"]):
            sum(d["nhu_cau"] for d in i["dong"])
            for i in bang["items"] if i["hang_loai"] == "giay" and i["hang_id"] == g.id}


def test_chi_buoc_dau_vao_nhu_cau(db, svc, customer):
    g = _giay(db)
    _lenh_cat_in(db, customer, g)
    kq = _khoa_giay(svc.can_doi(), g)
    assert kq == {("giay", g.id, 790, 1_090): pytest.approx(5_260)}


def test_nhu_cau_cong_viec_in_rong_khi_co_buoc_cat(db, svc, customer):
    from tests.test_ke_hoach_vat_tu import _cong_viec

    g = _giay(db)
    l, cat, in_ = _lenh_cat_in(db, customer, g)
    cv_in = _cong_viec(db, l, buoc_id=in_.id, xong=False)
    cv_cat = _cong_viec(db, l, buoc_id=cat.id, xong=False)
    assert svc.nhu_cau_cua_cong_viec(cv_in) == []
    ds = svc.nhu_cau_cua_cong_viec(cv_cat)
    assert [round(x["sl_goc"] if "sl_goc" in x else x.get("nhu_cau", 0)) for x in ds] == [5_260]


def test_khong_buoc_cat_thi_in_la_buoc_dau(db, svc, customer):
    g = _giay(db)
    l = _lenh(db, customer, ma="LSX-I", giay_id=g.id, so_to_nguyen=10_520, han=MAI, buoc=False)
    _buoc_giay(db, l, thu_tu=1, ten="In offset", giay=g, so_luong=10_520, kho=(545, 790),
               don_vi_vao="to")
    assert _khoa_giay(svc.can_doi(), g) == {("giay", g.id, 545, 790): pytest.approx(10_520)}


def test_buoc_nhan_tu(db, svc, customer):
    g = _giay(db)
    l, cat, in_ = _lenh_cat_in(db, customer, g)
    assert svc.buoc_nhan_tu(l.id) == {in_.id: {"hang_id": g.id, "tu_buoc": "Cắt tờ"}}


def test_buoc_nhan_tu_bo_qua_buoc_bi_buoc_chung_de(db, svc, customer):
    """Bước Cắt tờ bị bước chung của bài đè ⇒ không đóng góp ⇒ nhãn của Cán màng nêu In offset,
    không nêu Cắt tờ; còn In (đứng sau Cắt tờ, trước không còn bước nào đóng góp) không có nhãn."""
    from app.models.bai_ghep_cong_doan import BaiGhepCongDoanMap

    g = _giay(db)
    l, cat, in_ = _lenh_cat_in(db, customer, g)
    can = _buoc_giay(db, l, thu_tu=3, ten="Cán màng", giay=g, so_luong=10_520, kho=(545, 790),
                     don_vi_vao="to")
    bg = _bai(db, "GB-DE", g, [l])
    chung = BaiGhepCongDoan(bai_ghep_id=bg.id, thu_tu=1, ten="Cắt chung", loai_buoc="may",
                            don_vi_vao="to_nguyen", don_vi_ra="to")
    db.add(chung)
    db.flush()
    db.add(BaiGhepCongDoanMap(bai_ghep_cong_doan_id=chung.id, lsx_id=l.id,
                              lsx_step_key=cat.step_key))
    db.commit()
    assert svc.buoc_nhan_tu(l.id) == {can.id: {"hang_id": g.id, "tu_buoc": "In offset"}}


def test_buoc_nhan_tu_bo_qua_lenh_tron_goi(db, svc, customer):
    from app.models.gia_cong_ngoai import KIEU_TRON_GOI, GiaCongNgoai
    from app.models.purchase import Supplier

    g = _giay(db)
    l, _cat, _in = _lenh_cat_in(db, customer, g)
    s = Supplier(name="NCC trọn gói", tax_code="0900000001", phone="0900000000",
                 email="tg@x.vn", address="HN", contact_name="A", supplier_group="giay",
                 status="active")
    db.add(s)
    db.flush()
    db.add(GiaCongNgoai(kieu=KIEU_TRON_GOI, lsx_id=l.id, nha_cung_cap_id=s.id,
                        xuong_cap_giay=False))
    db.commit()
    assert svc.buoc_nhan_tu(l.id) == {}


def test_cuon_gom_theo_ma(db, svc, customer):
    g = _giay(db)
    l = _lenh(db, customer, ma="LSX-CU", giay_id=g.id, so_to_nguyen=100, han=MAI, buoc=False)
    _buoc_giay(db, l, thu_tu=1, ten="Cắt cuộn", giay=g, so_luong=300, kho=(790, 0),
               don_vi_vao="kg", dang="cuon", dvt="kg")
    assert _khoa_giay(svc.can_doi(), g) == {("giay", g.id, 0, 0): pytest.approx(300)}


def _bai_voi_buoc_chung(db, customer, g, *, don_vi_vao, so_luong_vao=0):
    a = _lenh(db, customer, ma="LSX-A", giay_id=g.id, so_to_nguyen=1_000, han=MAI,
              giay_o_buoc=False)
    b = _lenh(db, customer, ma="LSX-B", giay_id=g.id, so_to_nguyen=1_000, han=MAI,
              giay_o_buoc=False)
    bg = _bai(db, "GB-CAT", g, [a, b])
    db.add(BaiGhepCongDoan(bai_ghep_id=bg.id, thu_tu=1, ten="Cắt tờ", loai_buoc="may",
                           don_vi_vao=don_vi_vao, don_vi_ra="to", so_luong_vao=so_luong_vao,
                           so_luong_ra=so_luong_vao, chen_boi_to_cat=True))
    db.commit()
    return a, b, bg


def test_bai_buoc_chung_dau_nhan_to_nguyen_lay_to_nguyen_can(db, svc, customer):
    g = _giay(db)
    a, b, bg = _bai_voi_buoc_chung(db, customer, g, don_vi_vao="to_nguyen")
    so_to = svc._tinh_so_to(bg, {a.id: a, b.id: b})
    kq = _khoa_giay(svc.can_doi(), g)
    assert kq == {("giay", g.id, 780, 905): pytest.approx(so_to["to_nguyen_can"])}


def test_bai_buoc_chung_dau_nhan_to_in_lay_kho_in_va_tong_to(db, svc, customer):
    g = _giay(db)
    a, b, bg = _bai_voi_buoc_chung(db, customer, g, don_vi_vao="to")
    so_to = svc._tinh_so_to(bg, {a.id: a, b.id: b})
    kq = _khoa_giay(svc.can_doi(), g)
    assert kq == {("giay", g.id, 650, 860): pytest.approx(so_to["tong_to"])}
