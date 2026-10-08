"""Sản xuất từng mặt hàng của đơn + bộ lọc "Đang chờ" / gia công / giao / hoá đơn (07/10/2026)."""
from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.models.gia_cong_ngoai import NOI_VE_KHACH, GiaCongNgoai
from app.models.order import Order, OrderLine
from app.repositories.order_repo import LocDonHang
from app.services.don_hang_san_xuat import tom_tat_nhieu_don
from app.services.gia_cong_ngoai.chot import chot
from app.services.gia_cong_ngoai.tron_goi import dat_tron_goi
from tests.gia_cong_fixtures import lenh_chua_phat, ncc, nhan_vien_cua
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def lenh(sess, orders, lsx_svc, admin, customer):
    return lenh_chua_phat(sess, orders, lsx_svc, admin, customer)


def _ma(orders, admin, **loc) -> list[str]:
    out = orders.list(actor=admin, scope="all", q=None, status=None, order_kind=None,
                      sort="order_no", page=1, size=200, loc=LocDonHang(**loc))
    return [r.order_no for r in out.items]


def test_lenh_chua_phat_hanh_cho_ke_hoach(sess, admin, lenh):
    don = sess.get(Order, lenh.order_id)
    t = tom_tat_nhieu_don(sess, [don])[don.id]
    mon = next(m for m in t["mon"] if m["lenh"])
    assert mon["o"] == "chua_xuong" and mon["lenh"][0]["ma"] == lenh.ma
    assert "ke_hoach" in t["dang_cho"]


def test_tron_goi_dang_o_nha_gia_cong_roi_giao_thang(sess, admin, orders, lenh):
    nha = ncc(sess, "In bao bì Phú Thịnh")
    kq = dat_tron_goi(sess, user=admin, lsx_id=lenh.id, nha_cung_cap_id=nha.id, sl_dat=20_000,
                      xuong_cap_giay=False)
    don = sess.get(Order, lenh.order_id)
    sess.refresh(don)

    t = tom_tat_nhieu_don(sess, [don])[don.id]
    mon = next(m for m in t["mon"] if m["lenh"])
    l = mon["lenh"][0]
    assert mon["o"] == "ngoai" and l["kieu"] == "tron_goi"
    assert l["gia_cong"]["nha_cung_cap_ten"] == "In bao bì Phú Thịnh" and l["gia_cong"]["tu_luc"]
    assert "gia_cong" in t["dang_cho"]

    # Danh sách trả cùng tóm tắt; các ô lọc mới chọn đúng đơn.
    row = next(r for r in orders.list(actor=admin, scope="all", q=None, status=None, order_kind=None,
                                      sort="order_no", page=1, size=200).items if r.id == don.id)
    assert any(m.o == "ngoai" for m in row.san_xuat_mon) and "gia_cong" in row.dang_cho
    assert don.order_no in _ma(orders, admin, dang_cho="gia_cong")
    assert don.order_no not in _ma(orders, admin, dang_cho="xuong")
    assert don.order_no in _ma(orders, admin, gia_cong="tron_goi")
    assert don.order_no not in _ma(orders, admin, gia_cong="mot_phan")
    assert don.order_no in _ma(orders, admin, nha_gia_cong=nha.id)
    assert don.order_no not in _ma(orders, admin, gia_cong="khong")
    assert orders.dem_dang_cho(actor=admin, scope="all")["gia_cong"] >= 1
    assert (nha.id, "In bao bì Phú Thịnh", 1) in orders.repo.dem_theo_nha_gia_cong(scope="all", actor=admin)
    assert don.order_no in _ma(orders, admin, giao="chua")

    # Nhà gia công giao thẳng đủ cho dòng của lệnh.
    dong = sess.get(OrderLine, lenh.order_line_id)
    nhan_vien_cua(sess, admin)
    lan = sess.get(GiaCongNgoai, kq["gia_cong_ngoai_id"])
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=float(dong.qty), noi_ve=NOI_VE_KHACH)
    sess.expire_all()
    don = sess.get(Order, lenh.order_id)
    t = tom_tat_nhieu_don(sess, [don])[don.id]
    mon = next(m for m in t["mon"] if m["lenh"])
    assert mon["du_hang"] and mon["o"] == "du_hang" and mon["giao_thang"] == dong.qty
    assert "gia_cong" not in t["dang_cho"]
    assert don.order_no in _ma(orders, admin, gia_cong="giao_thang")


def test_hen_giao_qua_bo_don_da_giao_du(sess, admin, orders, monkeypatch):
    from app.models.customer import Customer
    from app.models.delivery import LG_THANH_CONG, DeliveryRequest, DeliveryTrip, DeliveryTripLine

    kh = Customer(code="KH-HG", name="Khách Hẹn Giao")
    sess.add(kh)
    sess.flush()
    dons = []
    for no in ("DH-HG1", "DH-HG2"):
        o = Order(order_no=no, customer_id=kh.id, source_type="bao_gia", status="ordered",
                  delivery_committed_date=date(2026, 10, 1))
        sess.add(o)
        sess.flush()
        ln = OrderLine(order_id=o.id, description="Hộp", qty=100, line_total=1_000_000)
        sess.add(ln)
        sess.flush()
        dons.append((o, ln))
    o, ln = dons[0]
    req = DeliveryRequest(code="YC-HG1", order_id=o.id, trang_thai="cho_len_ke_hoach",
                          ngay_can_giao=date(2026, 10, 1))
    sess.add(req)
    sess.flush()
    luc = datetime(2026, 10, 1, 3, tzinfo=timezone.utc)
    trip = DeliveryTrip(request_id=req.id, lan_thu=1, trang_thai=LG_THANH_CONG,
                        employee_id=nhan_vien_cua(sess, admin).id, gio_lay_hang=luc, gio_du_kien_giao=luc)
    sess.add(trip)
    sess.flush()
    sess.add(DeliveryTripLine(trip_id=trip.id, order_line_id=ln.id, qty_giao=100))
    sess.commit()

    monkeypatch.setattr("app.repositories.order_repo.hom_nay_vn", lambda: date(2026, 11, 1))
    qua = _ma(orders, admin, khach=kh.id, hen_giao="qua")
    assert qua == ["DH-HG2"]
    assert _ma(orders, admin, khach=kh.id, giao="du") == ["DH-HG1"]
    assert _ma(orders, admin, khach=kh.id, hoa_don="chua") == ["DH-HG1", "DH-HG2"]


def test_tab_hoan_tat_can_giao_du_va_hoa_don_du(sess, admin, orders):
    """Tab Hoàn tất (SQL) và "Đang chờ = xong" (Python) chọn cùng một đơn: giao đủ + hoá đơn đủ."""
    from app.models.accounting import SalesInvoice
    from app.models.customer import Customer
    from app.models.delivery import LG_THANH_CONG, DeliveryRequest, DeliveryTrip, DeliveryTripLine

    kh = Customer(code="KH-HT", name="Khách Hoàn Tất")
    sess.add(kh)
    sess.flush()
    o = Order(order_no="DH-HT1", customer_id=kh.id, source_type="bao_gia", status="ordered",
              san_xuat_released_at=datetime(2026, 9, 1, tzinfo=timezone.utc))
    sess.add(o)
    sess.flush()
    ln = OrderLine(order_id=o.id, description="Hộp", qty=100, line_total=1_000_000)
    sess.add(ln)
    sess.flush()
    req = DeliveryRequest(code="YC-HT1", order_id=o.id, trang_thai="cho_len_ke_hoach",
                          ngay_can_giao=date(2026, 10, 1))
    sess.add(req)
    sess.flush()
    luc = datetime(2026, 10, 1, 3, tzinfo=timezone.utc)
    trip = DeliveryTrip(request_id=req.id, lan_thu=1, trang_thai=LG_THANH_CONG,
                        employee_id=nhan_vien_cua(sess, admin).id, gio_lay_hang=luc, gio_du_kien_giao=luc)
    sess.add(trip)
    sess.flush()
    sess.add(DeliveryTripLine(trip_id=trip.id, order_line_id=ln.id, qty_giao=100))
    tong = int(orders.list(actor=admin, scope="all", q="DH-HT1", status=None, order_kind=None,
                           sort="order_no", page=1, size=5).items[0].total_with_vat)

    def hoa_don(so_tien: int):
        sess.add(SalesInvoice(order_id=o.id, customer_id=kh.id, invoice_symbol="1C26T",
                              invoice_number=f"{len(sess.query(SalesInvoice).all()) + 1}", invoice_date=date(2026, 10, 2),
                              amount_vnd=so_tien, customer_name_snapshot=kh.name))
        sess.commit()

    def thay():
        ma = _ma(orders, admin, khach=kh.id)
        tab = [r.order_no for r in orders.list(actor=admin, scope="all", q=None, status="hoan_tat",
                                               order_kind=None, sort="order_no", page=1, size=50).items]
        dem = orders.stats(actor=admin, scope="all", q="DH-HT1").hoan_tat
        sess.expire_all()
        cho = tom_tat_nhieu_don(sess, [sess.get(Order, o.id)])[o.id]["dang_cho"]
        return ma, tab, dem, cho

    hoa_don(tong // 2)
    _, tab, dem, cho = thay()
    assert "DH-HT1" not in tab and dem == 0 and cho == ["hoa_don"]

    hoa_don(tong - tong // 2)
    _, tab, dem, cho = thay()
    assert "DH-HT1" in tab and dem == 1 and cho == ["xong"]


def test_dong_cong_tong_theo_bo_loc(sess, orders, admin):
    """Dòng "Cộng" của lưới đơn: Σ giá trị gồm VAT + Σ cọc đã thu trên MỌI đơn khớp lọc, không chỉ trang."""
    for i, gia in enumerate([1_000_000, 2_000_000, 3_000_000]):
        o = Order(order_no=f"DH-CG{i}", source_type="bao_gia", status="draft")
        o.lines.append(OrderLine(description="Hàng", qty=1, line_total=gia, vat_pct_estimate=10))
        sess.add(o)
    sess.commit()
    out = orders.list(actor=admin, scope="all", q="DH-CG", status=None, order_kind=None,
                      sort="-created_at", page=1, size=1)
    assert out.total == 3 and len(out.items) == 1
    assert out.tong_gia_tri == 6_600_000 and out.tong_coc == 0


def test_yeu_cau_giu_du_ma_chua_giao_khong_phai_hoan_tat(sess):
    """`con_phai_giao` = 0 khi yêu cầu giao đang GIỮ đủ số — khách chưa nhận gì. Đơn đó vẫn chờ GIAO,
    không phải "xong" (07/10/2026: danh sách báo Hoàn tất oan, lệch số tab Hoàn tất ở máy chủ)."""
    from types import SimpleNamespace

    o = Order(order_no="DH-GIU1", source_type="bao_gia", status="ordered",
              san_xuat_released_at=datetime.now(timezone.utc))
    o.lines.append(OrderLine(description="Tờ rơi", qty=4000, line_total=1000, vat_pct_estimate=0))
    sess.add(o)
    sess.commit()
    cum = SimpleNamespace(khoa="k1", ten="Tờ rơi", dong_dau=o.lines[0])
    n = {"cum": cum, "co_lenh": False, "lsx_ids": [], "dat": 4000, "da_giao": 0, "giao_thang": 0,
         "dang_giu": 4000, "con_phai_giao": 0, "khach_nhan_du": False, "giao_duoc": 0}
    t = tom_tat_nhieu_don(sess, [o], nguon_san={o.id: [n]}, lenh_san={})[o.id]
    assert t["dang_cho"] == ["giao"]
    assert t["mon"][0]["khach_nhan_du"] is False
