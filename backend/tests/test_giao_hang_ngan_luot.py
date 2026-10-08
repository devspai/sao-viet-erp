"""Ngăn lượt xe màn Giao hàng (06/10/2026, mockup docs/mockups/giao-hang-phuong-an-B-chi-tiet.html).

Bảng + ngăn cần đọc ngay trên từng điểm: nơi giao, người nhận, ngày hẹn, lưu ý giao, PO, phiếu kho
thật của RIÊNG điểm đó, và — với đơn "nhà gia công giao thẳng" — nhà gia công + lệnh nguồn thay cho
tài xế/xe/km. Bản đầu của giao thẳng ghi câu "Nhà gia công … giao thẳng" đè vào ô địa chỉ.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.db_migrations import (
    _migrate_giao_thang_hen_theo_han_don,
    _migrate_giao_thang_noi_nhan_cua_don,
)
from app.models.delivery import DeliveryRequest, DeliveryTrip
from app.models.gia_cong_ngoai import NOI_VE_KHACH
from app.models.lsx import Lsx
from app.models.order import Order
from app.repositories.loc_danh_sach import hom_nay_vn
from app.routers.delivery import _giao_thang_out
from app.services.gia_cong_ngoai.chot import chot
from app.services.gia_cong_ngoai.giao_thang import _ngay_vn
from tests.gia_cong_fixtures import nhan_vien_cua
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401
from tests.test_gia_cong_chot_cuoi import dai_cuoi  # noqa: F401
from tests.test_giao_hang_api import _gui_yeu_cau_xuat_kho
from tests.test_luot_xe import GOC, _canh, _len_don, _len_luot, _yc


def _diem(client, h):
    khoi = client.get(f"{GOC}/bang-giao", headers=h).json()["items"]
    return [t for k in khoi for t in (k["luot"]["diem"] if k["luot"] else [k["trip"]])]


def test_moi_diem_mang_noi_nhan_ngay_hen_va_ngay_tao(client):
    h, tx, _px, xe = _canh(client, "51C-111.01")
    luot = _len_luot(client, h, [_yc(client, h, "nl1")], tx=tx, xe=xe)
    (t,) = _diem(client, h)
    assert (t["dia_chi"], t["nguoi_nhan"], t["sdt_nguoi_nhan"]) == (
        "12 Le Loi, Q1", "Chi Lan", "0901234567")
    assert t["ngay_can_giao"] and t["created_at"]
    assert t["giao_thang"] is None
    assert t["phieu_xuat"] is None and t["kho_da_lap_phieu"] is False
    khoi = client.get(f"{GOC}/bang-giao", headers=h).json()["items"][0]["luot"]
    assert khoi["id"] == luot["luot_id"] and khoi["created_at"]


def test_phieu_xuat_cua_rieng_diem_khop_co_kho_da_lap_phieu(client):
    h, tx, _px, xe = _canh(client, "51C-111.02")
    _len_luot(client, h, [_yc(client, h, "nl2a"), _yc(client, h, "nl2b")], tx=tx, xe=xe)
    a, b = _diem(client, h)
    _gui_yeu_cau_xuat_kho(client, h, a["id"])
    theo_id = {t["id"]: t for t in _diem(client, h)}
    # Cờ "kho đã chuẩn bị xong" và phiếu đọc từ CÙNG một chỗ — không bao giờ nói hai kiểu.
    for t in theo_id.values():
        assert (t["phieu_xuat"] is not None) == t["kho_da_lap_phieu"]
    # Điểm chưa gửi kho không mượn phiếu của điểm kia.
    assert theo_id[b["id"]]["phieu_xuat"] is None


def test_giao_thang_lay_noi_nhan_cua_don_va_noi_ro_nha_gia_cong(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
    trip = sess.query(DeliveryTrip).filter_by(gia_cong_ngoai_id=lan.id).one()
    req = sess.get(DeliveryRequest, trip.request_id)
    l = sess.get(Lsx, lsx_id)
    o = sess.get(Order, l.order_id)
    assert req.dia_chi == (o.delivery_address or "")
    assert (req.nguoi_nhan, req.sdt_nguoi_nhan, req.ghi_chu) == (
        o.delivery_contact_name, o.delivery_contact_phone, o.delivery_note)
    assert "giao thẳng" in (trip.ghi_chu_phan_cong or "")

    gt = _giao_thang_out(sess, trip)
    assert gt is not None
    assert (gt.nha_cung_cap_ten, gt.lsx_id, gt.lsx_ma) == ("Hộp Phú Thịnh", lsx_id, l.ma)


def test_migration_0372_chep_lai_noi_nhan_cho_yeu_cau_giao_thang_cu(sess, admin, dai_cuoi):
    _lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
    trip = sess.query(DeliveryTrip).filter_by(gia_cong_ngoai_id=lan.id).one()
    req = sess.get(DeliveryRequest, trip.request_id)
    o = sess.get(Order, req.order_id)
    o.delivery_address, o.delivery_contact_name = "Số 18 Đại lộ Độc Lập", "Nguyễn Thanh Vy"
    # Dựng lại dữ liệu hỏng của bản đầu.
    req.dia_chi = f"Nhà gia công {lan.nha_cung_cap_ten} giao thẳng"
    req.nguoi_nhan = None
    sess.commit()

    _migrate_giao_thang_noi_nhan_cua_don(sess)
    _migrate_giao_thang_noi_nhan_cua_don(sess)      # chạy lại vô hại
    sess.expire_all()
    req = sess.get(DeliveryRequest, trip.request_id)
    assert (req.dia_chi, req.nguoi_nhan) == ("Số 18 Đại lộ Độc Lập", "Nguyễn Thanh Vy")


def test_giao_thang_ghi_ngay_khach_nhan_va_hen_theo_han_don(sess, admin, dai_cuoi):
    """Kế toán ghi doanh thu + giá vốn theo ngày khách nhận trên biên bản, không theo giờ bấm chốt;
    ngày hẹn là hạn trên đơn để màn Giao hàng so sớm / trễ."""
    lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    hom_nay = hom_nay_vn()
    lan.created_at = datetime.now(timezone.utc) - timedelta(days=10)
    o = sess.get(Order, sess.get(Lsx, lsx_id).order_id)
    o.delivery_committed_date = hom_nay + timedelta(days=24)
    sess.commit()

    nhan = hom_nay - timedelta(days=2)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHACH, ngay_khach_nhan=nhan)
    trip = sess.query(DeliveryTrip).filter_by(gia_cong_ngoai_id=lan.id).one()
    req = sess.get(DeliveryRequest, trip.request_id)
    assert _ngay_vn(trip.thoi_gian_ket_thuc) == nhan
    assert req.ngay_can_giao == o.delivery_committed_date
    # "Ghi nhận" (ai bấm, lúc nào) vẫn là lúc chốt.
    assert _ngay_vn(trip.created_at) == hom_nay


def test_giao_thang_chan_ngay_khach_nhan_sau_hom_nay_hoac_truoc_ngay_giao_viec(
        sess, admin, dai_cuoi):
    _lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    hom_nay = hom_nay_vn()
    with pytest.raises(ValueError, match="sau hôm nay"):
        chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=1000, noi_ve=NOI_VE_KHACH, ngay_khach_nhan=hom_nay + timedelta(days=1))
    sess.rollback()
    with pytest.raises(ValueError, match="trước ngày giao việc"):
        chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=1000, noi_ve=NOI_VE_KHACH, ngay_khach_nhan=hom_nay - timedelta(days=30))
    sess.rollback()
    assert sess.query(DeliveryTrip).filter_by(gia_cong_ngoai_id=lan.id).count() == 0


def test_migration_0373_ngay_hen_giao_thang_cu_ve_han_don(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    o = sess.get(Order, sess.get(Lsx, lsx_id).order_id)
    o.delivery_committed_date = None
    sess.commit()
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
    trip = sess.query(DeliveryTrip).filter_by(gia_cong_ngoai_id=lan.id).one()
    hen = hom_nay_vn() + timedelta(days=24)
    o.delivery_committed_date = hen
    sess.commit()

    _migrate_giao_thang_hen_theo_han_don(sess)
    _migrate_giao_thang_hen_theo_han_don(sess)      # chạy lại vô hại
    sess.expire_all()
    assert sess.get(DeliveryRequest, trip.request_id).ngay_can_giao == hen


# --- Dòng hàng đi kèm bảng giao + bỏ N+1 (07/10/2026) ------------------------------------------
# Ngăn chi tiết từng phải gọi thêm `/requests/{id}` mới có bảng hàng ⇒ bảng "Hàng giao" hiện sau
# 0,7–2,7 giây. Nay bảng giao mang sẵn `hang` của từng chuyến, nạp gộp cả trang.

_KHOA_DONG = ("id", "order_line_id", "qty", "mo_ta", "don_vi_tinh", "da_giao", "hang_ten", "dvt")


def _dem_truy_van(viec) -> int:
    from sqlalchemy import event

    from app.db import engine

    dem = [0]

    def nghe(*_a, **_k):
        dem[0] += 1

    event.listen(engine, "before_cursor_execute", nghe)
    try:
        viec()
    finally:
        event.remove(engine, "before_cursor_execute", nghe)
    return dem[0]


def test_moi_diem_mang_dong_hang_khop_chi_tiet_yeu_cau(client):
    h, tx, _px, xe = _canh(client, "51C-111.03")
    _len_luot(client, h, [_yc(client, h, "nl3a"), _yc(client, h, "nl3b")], tx=tx, xe=xe)
    diem = _diem(client, h)
    assert len(diem) == 2
    for t in diem:
        ct = client.get(f"{GOC}/requests/{t['request_id']}", headers=h).json()["request"]["lines"]
        assert t["hang"], "bảng giao phải mang dòng hàng của yêu cầu"
        assert [{k: d[k] for k in _KHOA_DONG} for d in t["hang"]] == \
               [{k: d[k] for k in _KHOA_DONG} for d in ct]


def test_dong_hang_nap_gop_so_truy_van_khong_tang_theo_so_yeu_cau(client):
    from app.db import SessionLocal
    from app.routers.delivery import _hang_theo_yeu_cau, get_service

    h, tx, _px, xe = _canh(client, "51C-111.04")
    ids = [_yc(client, h, f"nl4{c}") for c in "abc"]
    _len_luot(client, h, ids, tx=tx, xe=xe)
    db = SessionLocal()
    try:
        svc = get_service(db)
        mot = _dem_truy_van(lambda: _hang_theo_yeu_cau(db, svc, ids[:1]))
        ba = _dem_truy_van(lambda: _hang_theo_yeu_cau(db, svc, ids))
        assert len(_hang_theo_yeu_cau(db, svc, ids)) == 3
    finally:
        db.close()
    assert ba == mot


def test_chi_tiet_yeu_cau_so_truy_van_khong_tang_theo_so_dong_lich_su(client):
    from app.db import SessionLocal
    from app.models.delivery import DeliveryStatusHistory

    h, tx, _px, xe = _canh(client, "51C-111.05")
    rid = _yc(client, h, "nl5")
    _len_luot(client, h, [rid], tx=tx, xe=xe)
    url = f"{GOC}/requests/{rid}"
    truoc = _dem_truy_van(lambda: client.get(url, headers=h))
    db = SessionLocal()
    try:
        trip = db.query(DeliveryTrip).filter_by(request_id=rid).one()
        # Mỗi mốc một người KHÁC nhau: cùng một người thì `db.get` lấy từ bộ nhớ phiên, bản cũ
        # cũng không tốn thêm truy vấn — test sẽ xanh oan.
        from app.models.user import User
        moi = [User(username=f"ls_nl5_{i}", name=f"Người {i}", password_hash="x") for i in range(4)]
        db.add_all(moi)
        db.flush()
        nguoi = [u.id for u in moi]
        for i, uid in enumerate(nguoi):
            db.add(DeliveryStatusHistory(trip_id=trip.id, tu_trang_thai=None, den_trang_thai="da_len_ke_hoach",
                                         nguoi_thao_tac_id=uid, luc=datetime.now(timezone.utc),
                                         ghi_chu=f"mốc {i}"))
        db.commit()
    finally:
        db.close()
    r = client.get(url, headers=h)
    assert r.status_code == 200
    assert len(r.json()["lich_su"]) >= len(nguoi) + 1
    assert all(x["nguoi_thao_tac_name"] for x in r.json()["lich_su"] if x["nguoi_thao_tac_id"])
    assert _dem_truy_van(lambda: client.get(url, headers=h)) == truoc


def test_bang_giao_so_truy_van_khong_tang_theo_so_chuyen(client):
    """Cả trang `/bang-giao` chạy số truy vấn CỐ ĐỊNH (07/10/2026) — trước đây mỗi chuyến ~12 truy vấn
    (yêu cầu, đơn, khách, tài xế, phụ xe, yêu cầu kho, phiếu kho, lượt…), mỗi lượt thêm vài câu."""
    url = f"{GOC}/bang-giao?size=50"

    def dung(ma_xe, so_diem, so_le, sfx):
        h, tx, px, xe = _canh(client, ma_xe)
        _len_luot(client, h, [_yc(client, h, f"{sfx}l{i}") for i in range(so_diem)], tx=tx, xe=xe, px=px)
        for i in range(so_le):
            _len_don(client, h, suffix=f"{sfx}c{i}", tx=tx, xe=xe, luot=None, px=px, lay=12 + i, giao=13 + i)
        return h

    h = dung("51C-111.06", 2, 1, "nl6a")
    _gui_yeu_cau_xuat_kho(client, h, _diem(client, h)[0]["id"])
    it = _dem_truy_van(lambda: client.get(url, headers=h))
    assert len(_diem(client, h)) == 3

    h = dung("51C-111.07", 3, 2, "nl6b")
    _gui_yeu_cau_xuat_kho(client, h, _diem(client, h)[0]["id"])
    nhieu = _dem_truy_van(lambda: client.get(url, headers=h))
    assert len(_diem(client, h)) == 8
    assert nhieu == it, (it, nhieu)
