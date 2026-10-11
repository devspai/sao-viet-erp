"""Giao hàng làm lại 19/09/2026 — "không được giao phần chưa nhập kho" + các lỗ treo cũ.

Thiết kế: `docs/superpowers/plans/2026-09-19-giao-hang-tien-do-don.md`.
"""
from __future__ import annotations

from datetime import date, timedelta

from app.db import SessionLocal
from app.models.lsx import Lsx
from app.models.order import Order
from app.models.stock_request import StockRequest, StockRequestLine
from app.models.user import User
from app.services.thanh_pham_khai_bao import cum_ban, khai_mot_dong
from tests.test_giao_hang_api import (
    _admin,
    _don_da_chot,
    _gui_yeu_cau_xuat_kho,
    _len_kh,
    _nap_ton,
    _tai_xe,
    _tao_yc,
)


def _yc(client, h, oid, lid, qty):
    return client.post("/api/giao-hang/requests", json={
        "order_id": oid, "ngay_can_giao": (date.today() + timedelta(days=2)).isoformat(),
        "lines": [{"order_line_id": lid, "qty": qty}],
    }, headers=h)


def test_KHONG_TON_thi_khong_lap_duoc_yeu_cau(client):
    h = _admin(client)
    oid, lid = _don_da_chot(suffix="gd1", nap_ton=False)
    r = _yc(client, h, oid, lid, 10)
    assert r.status_code == 400, r.text
    assert "chưa nhập kho" in r.json()["detail"]


def test_TON_MOT_PHAN_chi_lap_duoc_toi_so_ton(client):
    h = _admin(client)
    oid, lid = _don_da_chot(suffix="gd2", nap_ton=False)
    _nap_ton(oid, so=30)
    assert _yc(client, h, oid, lid, 31).status_code == 400
    assert _yc(client, h, oid, lid, 30).status_code == 201
    # 30 đã bị yêu cầu đầu giữ ⇒ hết.
    assert _yc(client, h, oid, lid, 1).status_code == 400


def _lenh_va_kho_nhan(oid: int, *, de_nghi: float, da_nhan: float) -> None:
    """Đơn có LỆNH, KCS đã gửi yêu cầu nhập cho lệnh đó, kho nhận `da_nhan`."""
    db = SessionLocal()
    try:
        order = db.get(Order, oid)
        ln = order.lines[0]
        l = Lsx(ma=f"LSX-GD-{oid}", ten=ln.description, order_id=oid, order_line_id=ln.id,
                so_luong_dat=int(ln.qty))
        db.add(l)
        db.flush()
        tp = khai_mot_dong(db, order, cum_ban(order)[0].dong_dau)
        admin = db.query(User).filter(User.username == "admin").one()
        req = StockRequest(ma=f"YCNK-GD-{oid}", loai="NHAP", nguoi_tao_id=admin.id,
                           trang_thai="partial", san_xuat_cong_viec_id=987654)
        req.lines.append(StockRequestLine(hang_loai="vat_tu", hang_id=tp.id, dvt=tp.don_vi_gia or "hop",
                                          sl_de_nghi=de_nghi, sl_duyet=de_nghi, sl_da_ung=da_nhan,
                                          lsx_id=l.id))
        db.add(req)
        db.commit()
    finally:
        db.close()


def test_DON_CO_LENH_giao_duoc_ca_TON_CUA_MA_tien_do_van_dem_theo_lenh(client):
    """11/10/2026 (mg 0394): thành phẩm thuộc về khách ⇒ tồn của mã (100) giao được dù lệnh của đơn
    mới gửi kho 40. Số kho đề nghị / đã nhận vẫn đếm theo lệnh của đơn — đó là tiến độ sản xuất."""
    h = _admin(client)
    oid, lid = _don_da_chot(suffix="gd3")               # tồn thật 100 của mã
    _lenh_va_kho_nhan(oid, de_nghi=60, da_nhan=40)
    assert _yc(client, h, oid, lid, 101).status_code == 400
    assert _yc(client, h, oid, lid, 100).status_code == 201

    td = client.get(f"/api/orders/{oid}/tien-do", headers=h)
    assert td.status_code == 200, td.text
    cum = td.json()["cum"][0]
    assert cum["kho_de_nghi"] == 60 and cum["kho_da_nhan"] == 40 and cum["cho_kho"] == 20
    assert cum["dang_giu"] == 100 and cum["giao_duoc"] == 0
    assert td.json()["yeu_cau"][0]["trang_thai"] == "cho_len_ke_hoach"


def _don_cung_khach(oid_goc: int, suffix: str, *, qty: int, gan_ma: bool = True,
                    khach_khac: bool = False) -> tuple[int, int]:
    """Đơn thứ hai ĐÃ CHỐT. `gan_ma` = dòng mang mã thành phẩm của đơn gốc (như chọn tái bản)."""
    from app.models.customer import Customer
    from app.models.order import STATUS_ORDERED, OrderLine

    db = SessionLocal()
    try:
        goc = db.get(Order, oid_goc)
        kh_id = goc.customer_id
        if khach_khac:
            kh = Customer(code=f"KH-GH-{suffix}", name=f"Khach {suffix}")
            db.add(kh)
            db.flush()
            kh_id = kh.id
        o = Order(order_no=f"DH-GH-{suffix}", customer_id=kh_id, status=STATUS_ORDERED,
                  delivery_address="12 Le Loi, Q1", delivery_contact_name="Chi Lan",
                  delivery_contact_phone="0901234567")
        o.lines.append(OrderLine(description=goc.lines[0].description, qty=qty, don_vi_tinh="hop",
                                 line_total=1_000_000, vat_pct_estimate=0,
                                 thanh_pham_id=goc.lines[0].thanh_pham_id if gan_ma else None))
        db.add(o)
        db.commit()
        return o.id, o.lines[0].id
    finally:
        db.close()


def _giao_duoc(client, h, oid) -> dict:
    return client.get(f"/api/orders/{oid}/tien-do", headers=h).json()["cum"][0]


def test_DON_SAU_cung_khach_dung_HANG_DU_cua_don_truoc(client):
    """⭐ Đơn A đặt 100 mà làm dư (tồn 150). Đơn B cùng khách, cùng sản phẩm: 50 dư giao được ngay.
    A lập yêu cầu giữ 100 ⇒ B chỉ còn 50; kho xuất chuyến của A ⇒ tồn giảm 100 nhưng phần giữ cũng
    hết, B vẫn 50 (không trừ hai lần)."""
    from app.models.stock_lot import StockLot

    h = _admin(client)
    oid_a, lid_a = _don_da_chot(suffix="du-a", nap_ton=False)
    _nap_ton(oid_a, so=150)
    oid_b, _ = _don_cung_khach(oid_a, "du-b", qty=100)
    assert _giao_duoc(client, h, oid_b)["giao_duoc"] == 100

    yc = _tao_yc(client, h, oid_a, lid_a, qty=100)
    b = _giao_duoc(client, h, oid_b)
    assert b["giao_duoc"] == 50 and b["giu_don_khac"] == 100

    trip = _len_kh(client, h, yc["id"], _tai_xe("TX du")).json()["trip"]["id"]
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").one()
        tp_id = db.get(Order, oid_a).lines[0].thanh_pham_id
        xuat = StockRequest(ma=f"YCXK-DU-{oid_a}", loai="XUAT", nguoi_tao_id=admin.id,
                            trang_thai="done", delivery_trip_id=trip)
        xuat.lines.append(StockRequestLine(hang_loai="vat_tu", hang_id=tp_id, dvt="hop",
                                           sl_de_nghi=100, sl_duyet=100, sl_da_ung=100))
        db.add(xuat)
        for lot in db.query(StockLot).filter(StockLot.hang_id == tp_id).all():
            lot.sl_con_lai = 50
        db.commit()
    finally:
        db.close()
    b = _giao_duoc(client, h, oid_b)
    assert b["ton_that"] == 50 and b["giu_don_khac"] == 0 and b["giao_duoc"] == 50


def test_KHACH_KHAC_trung_ten_KHONG_thay_hang(client):
    h = _admin(client)
    oid_a, _ = _don_da_chot(suffix="kk-a")             # tồn 100 của khách A
    oid_c, _ = _don_cung_khach(oid_a, "kk-c", qty=100, gan_ma=False, khach_khac=True)
    c = _giao_duoc(client, h, oid_c)
    assert c["ton_that"] == 0 and c["giao_duoc"] == 0 and c["ton_kho"] == []


def test_HUY_CHUYEN_thi_yeu_cau_huy_duoc_va_nha_hang(client):
    """Bẫy cũ: unique index mg 0229 cấm chuyến thứ hai, còn huỷ yêu cầu bị chặn vì 'còn chuyến' ⇒
    yêu cầu kẹt mãi, hàng bị giữ mãi."""
    h = _admin(client)
    oid, lid = _don_da_chot(suffix="gd4")
    yc = _tao_yc(client, h, oid, lid, qty=100)
    trip = _len_kh(client, h, yc["id"], _tai_xe("TX gd4")).json()["trip"]["id"]
    r = client.post(f"/api/giao-hang/plans/{trip}/huy", json={"ly_do": "Xe hong"}, headers=h)
    assert r.status_code == 200, r.text

    ds = client.get(f"/api/giao-hang/requests?order_id={oid}", headers=h).json()["items"]
    assert ds[0]["trang_thai"] == "chuyen_da_huy"
    con = client.get(f"/api/giao-hang/orders/{oid}/con-phai-giao", headers=h).json()
    assert con["lines"][0]["con_phai_giao"] == 100
    r = client.post(f"/api/giao-hang/requests/{yc['id']}/huy", json={"ly_do": "Lap lai"}, headers=h)
    assert r.status_code == 200, r.text


def test_HUY_DON_bi_chan_khi_con_yeu_cau_dang_chay(client):
    h = _admin(client)
    oid, lid = _don_da_chot(suffix="gd5")
    yc = _tao_yc(client, h, oid, lid, qty=10)
    r = client.post(f"/api/orders/{oid}/cancel",
                    json={"reason": "Khach huy", "fault": "khach"}, headers=h)
    assert r.status_code == 409, r.text
    assert yc["code"] in r.json()["detail"]


def test_GUI_XUAT_KHO_kiem_lai_ton_that(client):
    h = _admin(client)
    oid, lid = _don_da_chot(suffix="gd6")
    yc = _tao_yc(client, h, oid, lid, qty=100)
    trip = _len_kh(client, h, yc["id"], _tai_xe("TX gd6")).json()["trip"]["id"]
    # Kho đã xuất hàng cho việc khác trong lúc chờ xếp chuyến.
    from app.models.stock_lot import StockLot
    db = SessionLocal()
    try:
        for lot in db.query(StockLot).filter(StockLot.ma_lo.like(f"LO-GH-{oid}-%")).all():
            lot.sl_con_lai = 50
        db.commit()
    finally:
        db.close()
    from app.models.kho_hang import KhoHang
    db = SessionLocal()
    try:
        kho_id = db.query(KhoHang).filter(KhoHang.ma == "KTP").one().id
    finally:
        db.close()
    r = client.post(f"/api/giao-hang/plans/{trip}/yeu-cau-xuat-kho", json={"kho_id": kho_id},
                    headers=h)
    assert r.status_code == 400, r.text
    assert "chỉ còn 50" in r.json()["detail"]


def test_TIEN_DO_tra_ton_theo_kho(client):
    """Ngăn đơn chặng Giao: mỗi món kèm bảng kho nào đang có bao nhiêu. Từ 11/10/2026 tồn của mã là
    hàng của khách nên không còn cột "của ai"."""
    h = _admin(client)
    oid, _ = _don_da_chot(suffix="gd7")                  # tồn 100 ở KTP
    cum = _giao_duoc(client, h, oid)
    assert [r["so_luong"] for r in cum["ton_kho"]] == [100]
    assert cum["ton_kho"][0]["kho_ten"] and "cua_don" not in cum["ton_kho"][0]
    assert cum["giao_duoc"] == 100 and cum["giu_don_khac"] == 0
