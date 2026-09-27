"""Gia công TRỌN GÓI (spec 2026-09-26 §4): cả lệnh ra ngoài, không xuống xưởng."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import KIEU_TRON_GOI, NOI_VE_KHO, GiaCongNgoai
from app.models.lsx import TT_DA_PHAT_HANH, TT_NHAP, Lsx
from app.models.san_xuat import (
    BUOC_THUE_NGOAI, GOI_DA_THU_HOI, SanXuatCongViec, SanXuatGoiPhatHanh,
)
from app.models.stock_request import REQ_NHAP, REQ_XUAT, StockRequest
from app.models.xep_lich import XepLichCongDoan
from app.models.xep_lich_lenh import XepLichLenh
from app.services.gia_cong_ngoai import TT_DA_HUY, TT_DANG_GIA_CONG
from app.services.gia_cong_ngoai.chot import chot
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.gia_cong_ngoai.tron_goi import dat_tron_goi, de_nghi_xuat_giay, huy_tron_goi
from tests.gia_cong_fixtures import hang_can_cua, lenh_chua_phat, ncc, them_giay
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def lenh(sess, orders, lsx_svc, admin, customer) -> Lsx:
    return lenh_chua_phat(sess, orders, lsx_svc, admin, customer)


def _dat(sess, admin, lenh, *, xuong_cap_giay=False):
    a = ncc(sess, "In hộp Phú Thịnh")
    kq = dat_tron_goi(sess, user=admin, lsx_id=lenh.id, nha_cung_cap_id=a.id, sl_dat=20_000,
                      don_gia=900, xuong_cap_giay=xuong_cap_giay)
    return sess.get(GiaCongNgoai, kq["gia_cong_ngoai_id"])


def test_dat_tron_goi_phat_hanh_mot_cong_viec_khong_to(sess, admin, lenh):
    lan = _dat(sess, admin, lenh)
    sess.refresh(lenh)
    assert lenh.trang_thai == TT_DA_PHAT_HANH and lan.kieu == KIEU_TRON_GOI
    (cv,) = sess.query(SanXuatCongViec).filter_by(lsx_id=lenh.id).all()
    assert cv.gia_cong_ngoai_id == lan.id and cv.department_id is None
    assert cv.la_kcs_cuoi and cv.loai_buoc == BUOC_THUE_NGOAI
    assert float(cv.so_luong_ra) == 20_000 and cv.don_vi_ra == lan.don_vi
    assert sess.query(XepLichLenh).filter_by(lsx_id=lenh.id).count() == 0
    (d,) = lan_cua_lenh(sess, lenh.id)
    assert d["trang_thai"] == TT_DANG_GIA_CONG and d["xuat_giay"] is None


def test_lenh_da_phat_hanh_thi_khong_dat_duoc(sess, admin, lenh):
    lenh.trang_thai = TT_DA_PHAT_HANH
    sess.commit()
    with pytest.raises(ValueError, match="đã phát hành"):
        _dat(sess, admin, lenh)


def test_chot_tron_goi_ve_kho(sess, admin, lenh):
    lan = _dat(sess, admin, lenh)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=19_800, noi_ve=NOI_VE_KHO)
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id, loai=REQ_NHAP).one()
    assert float(req.lines[0].sl_de_nghi) == 19_800


def test_huy_tron_goi_ve_nhap_thu_hoi_goi(sess, admin, lenh):
    lan = _dat(sess, admin, lenh)
    huy_tron_goi(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
                 ly_do="Khách đổi mẫu")
    sess.refresh(lenh)
    sess.refresh(lan)
    assert lenh.trang_thai == TT_NHAP and lan.ly_do_huy == "Khách đổi mẫu"
    goi_id = sess.query(SanXuatCongViec).filter_by(lsx_id=lenh.id).one().goi_id
    assert sess.get(SanXuatGoiPhatHanh, goi_id).trang_thai == GOI_DA_THU_HOI
    (d,) = lan_cua_lenh(sess, lenh.id)
    assert d["trang_thai"] == TT_DA_HUY


def test_xuong_cap_giay_lap_de_nghi_xuat_mot_lan(sess, admin, lenh):
    them_giay(sess, lenh)
    lan = _dat(sess, admin, lenh, xuong_cap_giay=True)
    de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id, loai=REQ_XUAT).one()
    (ln,) = req.lines
    assert ln.hang_loai == "giay" and float(ln.sl_de_nghi) > 0 and ln.lsx_id == lenh.id
    (d,) = lan_cua_lenh(sess, lenh.id)
    assert d["xuat_giay"]["ma"] == req.ma
    sess.refresh(lan)
    with pytest.raises(ValueError, match="đã có đề nghị"):
        de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_nha_gia_cong_lo_giay_thi_khong_xuat(sess, admin, lenh):
    them_giay(sess, lenh)
    lan = _dat(sess, admin, lenh, xuong_cap_giay=False)
    with pytest.raises(ValueError, match="tự lo giấy"):
        de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_can_doi_vat_tu_bo_giay_khi_nha_gia_cong_lo(sess, admin, lenh):
    giay = ("giay", them_giay(sess, lenh).vat_tu_id)
    assert giay in hang_can_cua(sess, lenh.id)
    _dat(sess, admin, lenh, xuong_cap_giay=False)
    assert giay not in hang_can_cua(sess, lenh.id)


def test_can_doi_vat_tu_giu_giay_khi_xuong_cap(sess, admin, lenh):
    giay = ("giay", them_giay(sess, lenh).vat_tu_id)
    _dat(sess, admin, lenh, xuong_cap_giay=True)
    assert giay in hang_can_cua(sess, lenh.id)


def test_api_dat_tron_goi(client, sess, admin, lenh):
    a = ncc(sess, "In hộp Phú Thịnh")
    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    r = client.post(f"/api/gia-cong-ngoai/lenh/{lenh.id}/tron-goi", headers=h, json={
        "nha_cung_cap_id": a.id, "sl_dat": 20000, "don_gia": 900, "xuong_cap_giay": False})
    assert r.status_code == 200, r.text
    assert r.json()["kieu"] == "tron_goi" and r.json()["trang_thai"] == "dang_gia_cong"


# --- Fix round 1 ------------------------------------------------------------------------------

def test_dat_tron_goi_tu_go_dong_xep_lich(sess, admin, lenh):
    """Lệnh đã có dòng xếp lịch công đoạn: đặt trọn gói tự xoá dòng đó thay vì bắt tay xoá trước
    (spec §4 bước 1)."""
    buoc = sorted(lenh.cong_doans, key=lambda c: c.thu_tu)[0]
    dong = XepLichCongDoan(nguon="lsx", lsx_id=lenh.id, lsx_cong_doan_id=buoc.id,
                           source_thu_tu=buoc.thu_tu, loai_buoc="may")
    sess.add(dong)
    sess.commit()
    _dat(sess, admin, lenh)
    assert sess.query(XepLichCongDoan).filter_by(lsx_id=lenh.id).count() == 0


def test_huy_tron_goi_bat_lai_giu_cho(sess, admin, lenh, monkeypatch):
    """Đặt trọn gói xưởng cấp giấy giữ nguyên `giu_cho_bat=True` (chỉ còn giữ giấy). Huỷ phải gọi
    LẠI `GiuChoService.bat()` — cùng điều kiện `if lsx.giu_cho_bat` như lúc đặt — để nhặt lại theo
    nhu cầu ĐẦY ĐỦ một khi lệnh về Nháp, không dừng ở mỗi giấy."""
    import app.services.gia_cong_ngoai.tron_goi as tron_goi_mod
    from app.services.xep_lich.release import _giu_cho_service

    them_giay(sess, lenh)
    _giu_cho_service(sess).bat(lsx_id=lenh.id)  # bật giữ chỗ TRƯỚC khi đặt trọn gói, như lệnh thật
    sess.refresh(lenh)
    assert lenh.giu_cho_bat

    goi_lan_dau: list[dict] = []
    goc_giu_cho = tron_goi_mod._giu_cho

    def _theo_doi(db):
        svc = goc_giu_cho(db)
        goc_bat = svc.bat
        svc.bat = lambda **kw: (goi_lan_dau.append(kw), goc_bat(**kw))[1]
        return svc

    monkeypatch.setattr(tron_goi_mod, "_giu_cho", _theo_doi)

    lan = _dat(sess, admin, lenh, xuong_cap_giay=True)
    sess.refresh(lenh)
    assert lenh.giu_cho_bat
    assert goi_lan_dau == [{"lsx_id": lenh.id}]  # `dat_tron_goi` tự bật lại cho phần giấy

    huy_tron_goi(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
                 ly_do="Khách đổi mẫu")
    sess.refresh(lenh)
    assert lenh.giu_cho_bat
    assert goi_lan_dau == [{"lsx_id": lenh.id}, {"lsx_id": lenh.id}]  # huỷ gọi lại `bat()` lần 2


def test_huy_tron_goi_ncc_lo_giay_bat_lai_giu_cho(sess, admin, lenh, monkeypatch):
    """Fix round 2: NCC LO GIẤY (`xuong_cap_giay=False`) — `dat_tron_goi` tắt hẳn `giu_cho_bat`,
    không có nhánh bật lại nên cờ về False. Không có cách nào đọc lại cờ TRƯỚC lúc đặt (không lưu
    riêng), nên huỷ BẬT LẠI VÔ ĐIỀU KIỆN cho đúng trường hợp này — chấp nhận bật cả khi lệnh trước
    đó có thể chưa từng bật giữ chỗ."""
    import app.services.gia_cong_ngoai.tron_goi as tron_goi_mod
    from app.services.xep_lich.release import _giu_cho_service

    them_giay(sess, lenh)
    _giu_cho_service(sess).bat(lsx_id=lenh.id)
    sess.refresh(lenh)
    assert lenh.giu_cho_bat

    goi_lan_dau: list[dict] = []
    goc_giu_cho = tron_goi_mod._giu_cho

    def _theo_doi(db):
        svc = goc_giu_cho(db)
        goc_bat = svc.bat
        svc.bat = lambda **kw: (goi_lan_dau.append(kw), goc_bat(**kw))[1]
        return svc

    monkeypatch.setattr(tron_goi_mod, "_giu_cho", _theo_doi)

    lan = _dat(sess, admin, lenh, xuong_cap_giay=False)
    sess.refresh(lenh)
    assert not lenh.giu_cho_bat  # đặt tắt hẳn — không nhánh nào bật lại khi NCC lo giấy
    assert goi_lan_dau == []  # `dat_tron_goi` không gọi `bat()` ở nhánh này

    huy_tron_goi(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
                 ly_do="Khách đổi mẫu")
    sess.refresh(lenh)
    assert lenh.giu_cho_bat  # huỷ tự bật lại
    assert goi_lan_dau == [{"lsx_id": lenh.id}]  # và gọi `bat()` đúng một lần


def test_de_nghi_xuat_giay_ghi_chu_dung_mau(sess, admin, lenh):
    them_giay(sess, lenh)
    lan = _dat(sess, admin, lenh, xuong_cap_giay=True)
    req = de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    assert req.ghi_chu.startswith("Cấp giấy gia công trọn gói — In hộp Phú Thịnh")
    assert lenh.ma in req.ghi_chu


# --- Final fix: đơn vị lệnh ≠ đơn vị món Thành phẩm (C1/I1) + phạm vi lệnh (I2) ----------------

def _hop_bang_10_cai(sess, lenh):
    """Lệnh đếm theo HỘP, dòng đơn + món Thành phẩm đếm theo CÁI; 1 hộp = 10 cái."""
    from app.models.don_vi_do import DonViDo, DonViQuyDoi
    from app.models.order import OrderLine

    hop = sess.query(DonViDo).filter(DonViDo.ma == "hop").one()
    cai = sess.query(DonViDo).filter(DonViDo.ma == "cai").one()
    sess.add(DonViQuyDoi(tu_id=hop.id, den_id=cai.id, he_so=10))
    lenh.don_vi_tinh = "hop"
    sess.get(OrderLine, lenh.order_line_id).don_vi_tinh = "cai"
    sess.commit()


def test_tron_goi_luu_so_theo_don_vi_lenh(sess, admin, lenh):
    _hop_bang_10_cai(sess, lenh)
    lan = _dat(sess, admin, lenh)
    (cv,) = sess.query(SanXuatCongViec).filter_by(lsx_id=lenh.id).all()
    assert lan.don_vi == "hop" and cv.don_vi_ra == "hop" and float(cv.so_luong_ra) == 20_000


def test_tron_goi_ve_kho_quy_sang_don_vi_thanh_pham(sess, admin, lenh):
    from app.services.thanh_pham_khai_bao import khai_mot_dong
    from app.models.order import Order, OrderLine

    _hop_bang_10_cai(sess, lenh)
    order = sess.get(Order, lenh.order_id)
    tp = khai_mot_dong(sess, order, sess.get(OrderLine, lenh.order_line_id))
    tp.don_vi_gia = "cai"
    sess.commit()
    lan = _dat(sess, admin, lenh)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=100, noi_ve=NOI_VE_KHO)
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id, loai=REQ_NHAP).one()
    (ln,) = req.lines
    # 100 hộp = 1.000 cái — kho nhận đúng số cái, không phải 100 cái.
    assert ln.dvt == "cai" and float(ln.sl_de_nghi) == 1_000


def test_tron_goi_giao_thang_quy_ve_don_vi_dong_don(sess, admin, lenh):
    from app.models.gia_cong_ngoai import NOI_VE_KHACH
    from app.repositories.delivery_repo import DeliveryRepository
    from app.models.order import OrderLine
    from tests.gia_cong_fixtures import nhan_vien_cua

    _hop_bang_10_cai(sess, lenh)
    dong = sess.get(OrderLine, lenh.order_line_id)
    dong.qty = 1_000
    sess.commit()
    nhan_vien_cua(sess, admin)
    lan = _dat(sess, admin, lenh)
    # 101 hộp = 1.010 cái > 1.000 cái còn phải giao ⇒ chặn (so CÙNG đơn vị dòng đơn).
    with pytest.raises(ValueError, match="còn phải giao 1000"):
        chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=101, noi_ve=NOI_VE_KHACH)
    sess.rollback()
    sess.refresh(lan)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=100, noi_ve=NOI_VE_KHACH)
    assert DeliveryRepository(sess).da_giao_theo_dong(lenh.order_id)[lenh.order_line_id] == 1_000


def test_nguoi_pham_vi_rieng_khong_dung_lenh_nguoi_khac(sess, admin, lenh):
    from fastapi import HTTPException

    from app.models.role import SCOPE_OWN
    from app.models.user import User
    from app.routers import gia_cong_ngoai as r
    from app.schemas.gia_cong_ngoai import HuyTronGoiIn

    class _Authz:
        def scope_for(self, user, module_key):  # noqa: ARG002
            return SCOPE_OWN

        def can(self, *a, **k):  # noqa: ARG002
            return False

    lan = _dat(sess, admin, lenh)
    la = User(username="to_truong_gc", name="Tổ trưởng khác", password_hash="x")
    sess.add(la)
    sess.commit()
    with pytest.raises(HTTPException) as e:
        r.cua_lenh(lenh.id, sess, _Authz(), la)
    assert e.value.status_code == 404
    with pytest.raises(HTTPException) as e:
        r.huy_tron_goi(lan.id, HuyTronGoiIn(version=lan.version, ly_do="Khách đổi mẫu"), sess, _Authz(), la)
    assert e.value.status_code == 404
    sess.refresh(lan)
    assert lan.ly_do_huy is None


def test_den_vat_tu_xanh_khi_nha_gia_cong_lo_giay(sess, admin, lenh):
    """E2E 27/09: trọn gói NCC tự lo giấy tắt giữ chỗ ⇒ đèn vật tư từng báo đỏ "Chưa giữ chỗ vật
    tư", đẩy lệnh vào tab Cảnh báo (cờ Thiếu vật tư) kể cả khi hàng đã về kho. Lệnh không đòi gì
    từ kho thì đèn phải xanh; xưởng cấp giấy thì vẫn soi như lệnh thường."""
    from app.services import lsx_tong_quan

    them_giay(sess, lenh)
    _dat(sess, admin, lenh, xuong_cap_giay=False)
    den, _ = lsx_tong_quan.den_vat_tu_va_bang(sess, [lenh.id])
    assert den[lenh.id]["muc"] == lsx_tong_quan.MUC_OK


def test_ly_do_khong_mo_lai_khi_kho_da_lap_phieu(sess, admin, lenh, monkeypatch):
    """E2E 27/09: nút Mở lại hiện dù máy chủ chắc chắn từ chối. Lần dict nay trả lý do để FE khoá."""
    from app.repositories.stock_request_repo import StockRequestRepository

    lan = _dat(sess, admin, lenh)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=19_800, noi_ve=NOI_VE_KHO)
    (d,) = lan_cua_lenh(sess, lenh.id)
    assert d["ly_do_khong_mo_lai"] is None
    monkeypatch.setattr(StockRequestRepository, "co_voucher", lambda self, rid: True)
    (d,) = lan_cua_lenh(sess, lenh.id)
    assert "Kho đã lập phiếu" in d["ly_do_khong_mo_lai"]


def test_huy_roi_dat_lai_chot_xong_thi_lenh_xong_va_don_dem_dung(sess, admin, lenh):
    """E2E 27/09/2026: huỷ trọn gói (gói bị thu hồi) rồi đặt lại, chốt xong — việc của gói thu hồi
    không được tính, lệnh phải "xong" và đơn đếm 1 lệnh xong (trước đó kẹt 50%, 0/N lệnh)."""
    from app.models.order import Order, OrderLine
    from app.services.don_hang_tien_do import tien_do_don

    lan = _dat(sess, admin, lenh)
    huy_tron_goi(sess, user=admin, gcn_id=lan.id, expected_version=lan.version, ly_do="đổi nhà")
    lan = _dat(sess, admin, lenh)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=20_000, noi_ve=NOI_VE_KHO)
    don = sess.get(Order, sess.get(OrderLine, lenh.order_line_id).order_id)
    (x,) = [l for c in tien_do_don(sess, don)["cum"] for l in c["lenh"] if l["id"] == lenh.id]
    assert x["xong"] and x["pct"] == 100.0


def test_giao_thang_khong_quy_doi_duoc_chi_duong_sua(sess, admin, lenh):
    """Bước ra «cái», dòng đơn tính đơn vị không đổi được ⇒ câu lỗi nói bước nào, lệnh nào, và
    sửa ở đâu — không gợi ý khai cặp quy đổi toàn cục cho hai đơn vị khác loại."""
    from app.models.don_vi_do import DonViDo
    from app.models.gia_cong_ngoai import NOI_VE_KHACH
    from app.models.order import OrderLine
    from tests.gia_cong_fixtures import nhan_vien_cua

    kien = DonViDo(ma="kien_x", ten="kiện X", ho="khac")
    sess.add(kien)
    dong = sess.get(OrderLine, lenh.order_line_id)
    dong.don_vi_tinh = kien.ma
    lenh.don_vi_tinh = "cai"
    sess.commit()
    nhan_vien_cua(sess, admin)
    lan = _dat(sess, admin, lenh)
    with pytest.raises(ValueError, match=r"sang «kiện X» \(đơn vị dòng đơn") as e:
        chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=100, noi_ve=NOI_VE_KHACH)
    msg = str(e.value)
    assert lenh.ma in msg and "tab Công đoạn" in msg and "Đơn hàng bán" in msg
