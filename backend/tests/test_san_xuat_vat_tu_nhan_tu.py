"""Tab Bàn giao & Vật tư của Bàn tổ: giấy ở bước SAU hiện "Nhận từ <bước trước>" — spec 2026-10-01 §5.

Lệnh 2 bước Cắt tờ (790×1090, 5.260 tờ nguyên) → In (545×790, 10.520 tờ in) cùng một mã giấy: chỉ
Cắt tờ là nhu cầu lấy từ kho; In nhận từ Cắt tờ — hiện một dòng trung tính, không đòi xin cấp.
"""
from __future__ import annotations

import pytest

from app.models.lsx import LsxCongDoan, LsxCongDoanVatTu
from app.models.san_xuat import SanXuatCongViec
from app.services.kho_giay import chuan_kho, don_vi_goc_to
from app.services.san_xuat import board, release

from tests.test_san_xuat_board import _authz, _to_moi
from tests.test_xep_lich_service import (  # noqa: F401
    _hai_lsx_san_sang, admin, customer, db, lsx_svc, orders,
)
from tests.test_ke_hoach_vat_tu import _giay


def _them_giay(db, buoc, giay, so_luong, kho):
    kr, kd = chuan_kho(*kho)
    db.add(LsxCongDoanVatTu(
        lsx_cong_doan_id=buoc.id, hang_loai="giay", vat_tu_id=giay.id,
        vat_tu_ma_snapshot=giay.ma, vat_tu_ten_snapshot=giay.ten,
        don_vi_snapshot=don_vi_goc_to(), so_luong=so_luong, kho_rong=kr, kho_dai=kd,
        thu_tu=0, tu_dong=False, dang_giay="to",
    ))


@pytest.fixture
def cat_in(db, orders, lsx_svc, admin, customer):
    """Lệnh đã phát hành vào một tổ, 2 bước Cắt tờ → In, cùng mã giấy. Trả (cv_cat, cv_in)."""
    to = _to_moi(db)
    a, b = _hai_lsx_san_sang(db, orders, lsx_svc, admin, customer)
    in_ = db.query(LsxCongDoan).filter_by(lsx_id=a.id).one()
    in_.thu_tu = 2
    cat = LsxCongDoan(lsx_id=a.id, thu_tu=1, ten="Cắt tờ", loai_buoc="may",
                      don_vi_vao="to_nguyen", don_vi_ra="to_nguyen", so_luong_vao=5_260,
                      so_luong_ra=5_260)
    db.add(cat)
    db.flush()
    db.query(LsxCongDoan).filter(LsxCongDoan.lsx_id.in_([a.id, b.id])).update(
        {LsxCongDoan.department_id: to.id}, synchronize_session=False)
    db.commit()
    release.phat_hanh(db, lsx_ids={a.id, b.id}, actor=admin)
    db.commit()
    # Lệnh dựng sẵn có một dòng giấy mẫu (1 tờ) ở bước In — bỏ đi, chỉ giữ hai dòng của test.
    db.query(LsxCongDoanVatTu).filter(LsxCongDoanVatTu.lsx_cong_doan_id == in_.id,
                                      LsxCongDoanVatTu.hang_loai == "giay").delete(
        synchronize_session=False)
    g = _giay(db)
    _them_giay(db, cat, g, 5_260, (790, 1_090))
    _them_giay(db, in_, g, 10_520, (545, 790))
    db.commit()
    cv = lambda buoc: db.query(SanXuatCongViec).filter_by(lsx_cong_doan_id=buoc.id).one()
    return cv(cat), cv(in_), g


def _giay_dong(ct):
    return [d for d in ct["vat_tu_cap"]["doi_chieu"] if d["hang_loai"] == "giay"]


def test_buoc_in_hien_nhan_tu_cat_to_khong_phai_nhu_cau(db, admin, cat_in):
    _cv_cat, cv_in, g = cat_in
    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv_in.id)
    (d,) = _giay_dong(ct)
    assert d["nhan_tu"] == "Cắt tờ"
    assert d["hang_id"] == g.id
    assert d["sl_ke_hoach"] == pytest.approx(10_520)
    assert d["sl_yeu_cau"] == 0 and d["sl_thuc_xuat"] == 0
    assert d["lech_ke_hoach"] == 0 and d["lech_thuc_te"] == 0
    # Không phải nhu cầu ⇒ không nằm trong kế hoạch xin cấp của bước.
    assert ct["vat_tu_cap"]["ke_hoach"] == []


def test_buoc_cat_la_nhu_cau_that_khong_co_nhan_tu(db, admin, cat_in):
    cv_cat, _cv_in, _g = cat_in
    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv_cat.id)
    (d,) = _giay_dong(ct)
    assert d["nhan_tu"] is None
    assert d["sl_ke_hoach"] == pytest.approx(5_260)


def test_nhap_lai_o_buoc_nhan_tu_giu_dong_va_gia_von(db, admin, cat_in):
    """I4 — In nhận 10.520 tờ in từ Cắt tờ, trả thừa 70 tờ 545×790: dòng "Nhận từ Cắt tờ" vẫn còn,
    thực dùng = 10.520 − 70 (không âm), lô trả mang giá vốn quy từ phần Cắt tờ đã xuất (theo diện
    tích tờ), không phải 0."""
    from app.models.stock_lot import StockLot
    from app.models.stock_request import StockRequest
    from app.models.stock_voucher import (
        VOUCHER_POSTED, VOUCHER_XUAT, StockVoucher, StockVoucherLine,
    )
    from app.services.san_xuat import vat_tu_de_nghi as V
    from app.services.san_xuat import vat_tu_nhap_lai as NL
    from tests.test_sx_vat_tu_de_nghi import _T0, _dang_kho, _kh_service
    from tests.test_sx_vat_tu_nhap_lai import _ghi_so_phieu_nhap

    cv_cat, cv_in, g = cat_in
    kh = _kh_service(db).nhu_cau_cua_cong_viec(cv_cat)
    k0 = next(k for k in kh if k["hang_loai"] == "giay")
    ra = V.tao(db, user=admin, cong_viec_id=cv_cat.id, can_luc=_T0, lines=[
        {"hang_loai": "giay", "hang_id": g.id, **_dang_kho(k0), "dvt": k0["dvt"],
         "sl_yeu_cau": k0["sl"]}])
    req = db.get(StockRequest, ra["stock_request_id"])
    rl = req.lines[0]
    v = StockVoucher(ma="PXK-NT1", loai=VOUCHER_XUAT, request_id=req.id, kho_id=1,
                     ngay=_T0.date(), nguoi_lap_id=admin.id, trang_thai=VOUCHER_POSTED)
    db.add(v)
    db.flush()
    lot = StockLot(ma_lo="L-NT1", hang_loai="giay", hang_id=g.id, kho_id=1, ngay_nhap=_T0.date(),
                   don_gia_nhap=4000, sl_ban_dau=6000, sl_con_lai=740, dang_giay="to",
                   kho_rong=790, kho_dai=1090)
    db.add(lot)
    db.flush()
    db.add(StockVoucherLine(voucher_id=v.id, request_line_id=rl.id, hang_loai="giay",
                            hang_id=g.id, dang_giay="to", kho_rong=790, kho_dai=1090,
                            lot_id=lot.id, so_luong=5_260, sl_goc=5_260))
    db.commit()

    nl = NL.tao(db, user=admin, cong_viec_id=cv_in.id, ghi_chu=None, lines=[{
        "hang_loai": "giay", "hang_id": g.id, "dvt": don_vi_goc_to(), "so_luong": 70,
        "dang_giay": "to", "kho_rong": 545, "kho_dai": 790}])
    [ln] = db.get(StockRequest, nl["id"]).lines
    assert ln.don_gia == round(4000 * (545 * 790) / (790 * 1090))     # 2.000 đ/tờ in
    _ghi_so_phieu_nhap(db, admin, nl["id"], 70)

    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv_in.id)
    (d,) = _giay_dong(ct)
    assert d["nhan_tu"] == "Cắt tờ"
    assert d["sl_nhap_lai"] == pytest.approx(70)
    assert d["sl_thuc_dung"] == pytest.approx(10_520 - 70)
    assert d["nhap_lai_vao"] is None


def test_nhap_lai_khac_kho_o_buoc_nhan_tu_tru_vao_dong_nhan_tu(db, admin, cat_in):
    """Trả khổ khác khổ nhận (còn nguyên 790×1090) ở bước nhận-từ ⇒ trừ vào dòng nhận-từ cùng
    (mã, dạng); dòng trả là dòng thông tin, không thực dùng âm."""
    from app.services.san_xuat import vat_tu_nhap_lai as NL
    from tests.test_sx_vat_tu_nhap_lai import _ghi_so_phieu_nhap

    _cv_cat, cv_in, g = cat_in
    nl = NL.tao(db, user=admin, cong_viec_id=cv_in.id, ghi_chu=None, lines=[{
        "hang_loai": "giay", "hang_id": g.id, "dvt": don_vi_goc_to(), "so_luong": 20,
        "dang_giay": "to", "kho_rong": 790, "kho_dai": 1090}])
    _ghi_so_phieu_nhap(db, admin, nl["id"], 20)
    ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv_in.id)
    rows = _giay_dong(ct)
    nhan = next(d for d in rows if d["nhan_tu"])
    tra = next(d for d in rows if not d["nhan_tu"])
    assert nhan["sl_thuc_dung"] == pytest.approx(10_520 - 20)
    assert tra["sl_thuc_dung"] is None and tra["nhap_lai_vao"]
