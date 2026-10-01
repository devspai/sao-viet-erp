"""Tổ yêu cầu NHẬP LẠI vật tư thừa vào kho (spec 2026-10-01 §3.5) + cột Thực dùng của bảng đối chiếu.

Dựng nền như `test_sx_vat_tu_de_nghi.py` (đơn → SX → phát hành vào tổ); phiếu xuất/nhập đi qua
service kho thật, không qua HTTP.
"""
from __future__ import annotations

import pytest

from app.models.stock_request import REQ_NHAP, StockRequest
from tests.test_sx_vat_tu_de_nghi import (  # noqa: F401
    _T0, _authz, _dang_kho, _khai_them_vat_tu_vao_buoc, _kh_service,
    _phieu_xuat_khop_yeu_cau,
)
from tests.test_san_xuat_thuc_thi import (  # noqa: F401
    _gan_giay_len_buoc, _mot_cv, admin, customer, db, lsx_svc, orders,
)


def _cv_giay_da_cap(db, orders, lsx_svc, admin, customer, ma, *, so_to=2700):
    """Công việc có dòng giấy C300 800×1090, đã xin + kho đã xuất `so_to` tờ (phiếu XUẤT posted)."""
    from app.models.lsx import Lsx
    from app.services.san_xuat import vat_tu_de_nghi as V

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma=ma)
    lsx = db.get(Lsx, cv.lsx_id)
    lsx.quy_cach_json = {**(lsx.quy_cach_json or {}), "kho_nguyen_rong": 800,
                         "kho_nguyen_dai": 1090, "to_nguyen": so_to}
    lsx.so_to_nguyen = so_to
    db.commit()
    _gan_giay_len_buoc(db, cv)
    kh = _kh_service(db).nhu_cau_cua_cong_viec(cv)
    k0 = next(k for k in kh if k["hang_loai"] == "giay")
    ra = V.tao(db, user=admin, cong_viec_id=cv.id, can_luc=_T0, lines=[
        {"hang_loai": "giay", "hang_id": k0["hang_id"], **_dang_kho(k0), "dvt": k0["dvt"],
         "sl_yeu_cau": so_to}])
    req = db.get(StockRequest, ra["stock_request_id"])
    _phieu_xuat_khop_yeu_cau(db, admin, req, ma=f"PXK-{ma}")
    return cv, k0


def _nhap_lai(db, admin, cv, lines, **kw):
    from app.services.san_xuat import vat_tu_nhap_lai as NL
    return NL.tao(db, user=admin, cong_viec_id=cv.id, lines=lines, ghi_chu=None, **kw)


def test_tao_yeu_cau_nhap_lai_giay_khac_kho(db, orders, lsx_svc, admin, customer):
    from app.services.kho_giay import don_vi_goc_to

    cv, k0 = _cv_giay_da_cap(db, orders, lsx_svc, admin, customer, "TO-NL1")
    ra = _nhap_lai(db, admin, cv, [{
        "hang_loai": "giay", "hang_id": k0["hang_id"], "dvt": don_vi_goc_to(), "so_luong": 70,
        "dang_giay": "to", "kho_rong": 790, "kho_dai": 1090}])

    req = db.get(StockRequest, ra["id"])
    assert req.loai == REQ_NHAP
    assert req.vat_tu_tra_cong_viec_id == cv.id
    assert req.san_xuat_cong_viec_id is None
    assert req.bo_phan_id == cv.department_id
    assert req.ghi_chu.startswith("Nhập lại vật tư từ ")
    [ln] = req.lines
    assert (ln.dang_giay, ln.kho_rong, ln.kho_dai) == ("to", 790, 1090)
    assert float(ln.sl_de_nghi) == 70
    assert ra["ma"] == req.ma and ra["trang_thai"] == req.trang_thai


def test_nhap_lai_vat_tu_thuong(db, orders, lsx_svc, admin, customer):
    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-NL2")
    db.commit()
    muc = _khai_them_vat_tu_vao_buoc(db, cv, ma="VT-NL2", ten="Mực đen", so_luong=5)
    ra = _nhap_lai(db, admin, cv, [{"hang_loai": "vat_tu", "hang_id": muc.id, "dvt": "kg",
                                    "so_luong": 2}])
    [ln] = db.get(StockRequest, ra["id"]).lines
    assert (ln.hang_loai, ln.dvt, float(ln.sl_de_nghi)) == ("vat_tu", "kg", 2)
    assert (ln.dang_giay, ln.kho_rong, ln.kho_dai) == (None, 0, 0)


def test_giay_to_thieu_kho_bi_chan(db, orders, lsx_svc, admin, customer):
    from app.services.kho_giay import don_vi_goc_to

    cv, k0 = _cv_giay_da_cap(db, orders, lsx_svc, admin, customer, "TO-NL3")
    with pytest.raises(ValueError, match="hai cạnh khổ"):
        _nhap_lai(db, admin, cv, [{
            "hang_loai": "giay", "hang_id": k0["hang_id"], "dvt": don_vi_goc_to(),
            "so_luong": 10, "dang_giay": "to", "kho_rong": 790, "kho_dai": 0}])
    with pytest.raises(ValueError, match="dạng"):
        _nhap_lai(db, admin, cv, [{
            "hang_loai": "giay", "hang_id": k0["hang_id"], "dvt": don_vi_goc_to(),
            "so_luong": 10, "kho_rong": 790, "kho_dai": 1090}])
    assert db.query(StockRequest).filter(StockRequest.vat_tu_tra_cong_viec_id.is_not(None)).count() == 0


def test_so_luong_khong_hop_le_va_don_vi_la_bi_chan(db, orders, lsx_svc, admin, customer):
    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-NL4")
    db.commit()
    muc = _khai_them_vat_tu_vao_buoc(db, cv, ma="VT-NL4", ten="Mực xanh", so_luong=5)
    with pytest.raises(ValueError, match="lớn hơn 0"):
        _nhap_lai(db, admin, cv, [{"hang_loai": "vat_tu", "hang_id": muc.id, "dvt": "kg",
                                   "so_luong": 0}])
    with pytest.raises(ValueError):
        _nhap_lai(db, admin, cv, [{"hang_loai": "vat_tu", "hang_id": muc.id, "dvt": "tờ-không-có",
                                   "so_luong": 1}])
    with pytest.raises(ValueError, match="Chưa chọn"):
        _nhap_lai(db, admin, cv, [])


def test_khong_lan_vao_nhap_thanh_pham(db, orders, lsx_svc, admin, customer):
    from app.repositories.stock_request_repo import StockRequestRepository

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-NL5")
    db.commit()
    muc = _khai_them_vat_tu_vao_buoc(db, cv, ma="VT-NL5", ten="Mực vàng", so_luong=5)
    _nhap_lai(db, admin, cv, [{"hang_loai": "vat_tu", "hang_id": muc.id, "dvt": "kg",
                               "so_luong": 1}])
    assert StockRequestRepository(db).dong_nhap_tu_cong_viec([cv.id]) == []


def test_ghi_nhat_ky_va_bao_kho_sau_commit(db, orders, lsx_svc, admin, customer, monkeypatch):
    from app.models.audit import AuditLog
    from app.services import stock_request_service as SRS

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-NL6")
    db.commit()
    muc = _khai_them_vat_tu_vao_buoc(db, cv, ma="VT-NL6", ten="Mực đỏ", so_luong=5)
    goi: list = []
    monkeypatch.setattr(SRS.StockRequestService, "thong_bao_yeu_cau_moi",
                        lambda self, req: goi.append(req.id))
    ra = _nhap_lai(db, admin, cv, [{"hang_loai": "vat_tu", "hang_id": muc.id, "dvt": "kg",
                                    "so_luong": 1}])
    assert goi == [ra["id"]]
    assert db.query(AuditLog).filter_by(action="san_xuat_nhap_lai_vat_tu",
                                        target=f"san_xuat_cong_viec:{cv.id}").count() == 1


def test_don_gia_la_binh_quan_gia_von_phan_da_xuat(db, orders, lsx_svc, admin, customer):
    """Giá vốn lấy từ LÔ đã xuất (phiếu xuất không lưu don_gia): 100 kg × 20.000 + 100 kg × 30.000
    ⇒ bình quân 25.000 đ/kg; nhập lại 2 kg ⇒ dòng yêu cầu mang don_gia 25.000."""
    from app.models.stock_request import REQ_APPROVED, REQ_XUAT, StockRequestLine
    from app.models.stock_lot import StockLot
    from app.models.stock_voucher import (
        VOUCHER_POSTED, VOUCHER_XUAT, StockVoucher, StockVoucherLine,
    )
    from app.services.san_xuat import vat_tu_de_nghi as V

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-NL7")
    db.commit()
    muc = _khai_them_vat_tu_vao_buoc(db, cv, ma="VT-NL7", ten="Mực bạc", so_luong=200)
    kh = _kh_service(db).nhu_cau_cua_cong_viec(cv)
    km = next(k for k in kh if k["hang_loai"] == "vat_tu" and k["hang_id"] == muc.id)
    ra = V.tao(db, user=admin, cong_viec_id=cv.id, can_luc=_T0, lines=[
        {"hang_loai": k["hang_loai"], "hang_id": k["hang_id"], **_dang_kho(k), "dvt": k["dvt"],
         "sl_yeu_cau": k["sl"]} for k in kh])
    req = db.get(StockRequest, ra["stock_request_id"])
    rl = next(l for l in req.lines if l.hang_id == muc.id)
    v = StockVoucher(ma="PXK-NL7", loai=VOUCHER_XUAT, request_id=req.id, kho_id=1,
                     ngay=_T0.date(), nguoi_lap_id=admin.id, trang_thai=VOUCHER_POSTED)
    db.add(v)
    db.flush()
    for gia in (20000, 30000):
        lot = StockLot(ma_lo=f"L-NL7-{gia}", hang_loai="vat_tu", hang_id=muc.id, kho_id=1,
                       ngay_nhap=_T0.date(), don_gia_nhap=gia, sl_ban_dau=100, sl_con_lai=100)
        db.add(lot)
        db.flush()
        db.add(StockVoucherLine(voucher_id=v.id, request_line_id=rl.id, hang_loai="vat_tu",
                                hang_id=muc.id, lot_id=lot.id, so_luong=100, sl_goc=100))
    db.commit()

    nl = _nhap_lai(db, admin, cv, [{"hang_loai": "vat_tu", "hang_id": muc.id, "dvt": km["dvt"],
                                    "so_luong": 2}])
    [ln] = db.get(StockRequest, nl["id"]).lines
    assert km["dvt"] == km["dvt_goc"]       # mực khai kg = đơn vị gốc ⇒ không phải quy giá
    assert ln.don_gia == 25000


def test_thuc_dung_tru_nhap_lai(db, orders, lsx_svc, admin, customer):
    """Kho xuất 5 kg mực, tổ nhập lại 2 kg, kho ghi sổ phiếu NHẬP ⇒ thực dùng 3."""
    from app.models.kho_hang import KhoHang
    from app.routers.kho_voucher import get_service as voucher_service
    from app.services.san_xuat import board
    from app.services.san_xuat import vat_tu_de_nghi as V

    _to, cv = _mot_cv(db, orders, lsx_svc, admin, customer, ma="TO-NL8")
    db.commit()
    muc = _khai_them_vat_tu_vao_buoc(db, cv, ma="VT-NL8", ten="Mực nâu", so_luong=5)
    kh = _kh_service(db).nhu_cau_cua_cong_viec(cv)
    km = next(k for k in kh if k["hang_loai"] == "vat_tu" and k["hang_id"] == muc.id)
    ra = V.tao(db, user=admin, cong_viec_id=cv.id, can_luc=_T0, lines=[
        {"hang_loai": k["hang_loai"], "hang_id": k["hang_id"], **_dang_kho(k), "dvt": k["dvt"],
         "sl_yeu_cau": k["sl"]} for k in kh])
    _phieu_xuat_khop_yeu_cau(db, admin, db.get(StockRequest, ra["stock_request_id"]), ma="PXK-NL8")

    nl = _nhap_lai(db, admin, cv, [{"hang_loai": "vat_tu", "hang_id": muc.id,
                                    "dvt": km["dvt"], "so_luong": 2}])

    def dong_muc():
        ct = board.chi_tiet_cong_viec(db, admin, _authz(db), cong_viec_id=cv.id)
        return next(d for d in ct["vat_tu_cap"]["doi_chieu"] if d["hang_id"] == muc.id)

    # Chưa có phiếu NHẬP ghi sổ ⇒ chưa trừ.
    d = dong_muc()
    assert (d["sl_thuc_xuat"], d["sl_nhap_lai"], d["sl_thuc_dung"]) == (5, 0, 5)

    kho_ = KhoHang(ma="KHO-NL8", ten="Kho test")
    db.add(kho_)
    db.commit()
    svc = voucher_service(db)
    req = db.get(StockRequest, nl["id"])
    [rl] = req.lines
    v = svc.create(user=admin, request_id=req.id, kho_id=kho_.id,
                   lines=[{"request_line_id": rl.id, "so_luong": 2}])
    svc.post(v.id, admin)

    d = dong_muc()
    assert (d["sl_thuc_xuat"], d["sl_nhap_lai"], d["sl_thuc_dung"]) == (5, 2, 3)
