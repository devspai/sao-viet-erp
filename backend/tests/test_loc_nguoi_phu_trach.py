"""Hộp lọc "NV phụ trách" ở Tính giá thành · Báo giá · Đơn hàng bán (04/10/2026).

Luật: hộp chọn chỉ liệt kê người TRONG tầm nhìn (own = mình + nhóm dùng chung), lọc theo người
AND với phạm vi (không chọn người ngoài tầm nhìn để xem lén), số đếm tab theo cùng phạm vi + người.
"""
from app.db import SessionLocal
from app.models.nhom_dung_chung import NhomDungChung, NhomDungChungThanhVien
from app.models.order import Order
from app.models.phieu_tinh_gia import PhieuTinhGia
from app.models.quotation import Quote
from app.models.role import SCOPE_OWN

from .thong_bao_helpers import dang_nhap, tao_nguoi

_OWN = dict(can_read=True, scope=SCOPE_OWN)
_PERMS = {"don_hang_ban": _OWN, "bao_gia": _OWN, "tinh_gia_thanh": _OWN}


def _dung_du_lieu():
    a = tao_nguoi("sale_a", _PERMS)
    b = tao_nguoi("sale_b", _PERMS)          # cùng nhóm dùng chung với A
    c = tao_nguoi("sale_c", _PERMS)          # người ngoài
    db = SessionLocal()
    try:
        nhom = NhomDungChung(ten="a-b")
        db.add(nhom)
        db.flush()
        db.add_all([NhomDungChungThanhVien(nhom_id=nhom.id, user_id=a),
                    NhomDungChungThanhVien(nhom_id=nhom.id, user_id=b)])
        for i, uid in enumerate((a, b, b, c)):
            db.add(Order(order_no=f"DH-L{i}", sale_user_id=uid, status="draft"))
            db.add(Quote(quote_number=f"BG-L{i}", salesperson_id=uid, status="draft"))
            db.add(PhieuTinhGia(ma=f"PTG-L{i}", ten_san_pham="SP", created_by=uid))
        db.commit()
    finally:
        db.close()
    return a, b, c


def test_hop_loc_chi_hien_nguoi_trong_tam_nhin_va_loc_khong_vuot_pham_vi(client):
    a, b, c = _dung_du_lieu()
    ha = dang_nhap(client, "sale_a")
    for duong in ("/api/orders/nguoi-phu-trach", "/api/quotations/nguoi-phu-trach",
                  "/api/phieu-tinh-gia/nguoi-lap"):
        r = client.get(duong, headers=ha)
        assert r.status_code == 200, (duong, r.text)
        dem = {o["id"]: o["so_kh"] for o in r.json()}
        assert dem == {a: 1, b: 2}, duong    # C ngoài nhóm → không lộ tên

    don = client.get(f"/api/orders?nguoi={b}", headers=ha).json()
    assert don["total"] == 2 and {o["sale_user_id"] for o in don["items"]} == {b}
    assert client.get(f"/api/orders?nguoi={c}", headers=ha).json()["total"] == 0   # không xem lén
    assert client.get(f"/api/orders/stats?nguoi={b}", headers=ha).json()["all"] == 2

    bg = client.get(f"/api/quotations?nguoi={b}", headers=ha).json()
    assert bg["total"] == 2
    assert client.get(f"/api/quotations?nguoi={c}", headers=ha).json()["total"] == 0
    # Số tab Báo giá theo PHẠM VI (trước đây đếm cả bảng, A thấy cả phiếu của C).
    assert client.get("/api/quotations/stats", headers=ha).json()["total"] == 3
    assert client.get(f"/api/quotations/stats?nguoi={a}", headers=ha).json()["total"] == 1

    ptg = client.get(f"/api/phieu-tinh-gia?nguoi={b}", headers=ha).json()
    assert ptg["total"] == 2
    assert client.get(f"/api/phieu-tinh-gia?nguoi={c}", headers=ha).json()["total"] == 0
    assert client.get(f"/api/phieu-tinh-gia/stats?nguoi={b}", headers=ha).json()["all"] == 2


def test_tim_tuong_doi_khong_dau(client):
    """Ô tìm 3 màn khớp TƯƠNG ĐỐI: gõ không dấu / khác hoa thường vẫn ra (04/10/2026)."""
    from app.models.customer import Customer
    from app.models.order import OrderLine

    from .thong_bao_helpers import admin

    db = SessionLocal()
    try:
        c = Customer(code="KH-TD", name="Công ty Bánh Kẹo Hữu Nghị")
        db.add(c)
        db.flush()
        o = Order(order_no="DH-TD1", customer_id=c.id, status="draft", customer_po_no="PO-ĐẶC-BIỆT")
        db.add(o)
        db.flush()
        db.add(OrderLine(order_id=o.id, description="Hộp quà Trung thu"))
        db.add(Quote(quote_number="BG-TD1", customer_id=c.id, status="draft"))
        db.add(PhieuTinhGia(ma="PTG-TD1", ten_san_pham="Túi giấy kraft", ghi_chu="Giao gấp"))
        db.commit()
    finally:
        db.close()
    ha = admin(client)

    for tu in ("huu nghi", "HOP QUA", "po-dac"):
        r = client.get("/api/orders", params={"q": tu}, headers=ha).json()
        assert [i["order_no"] for i in r["items"]] == ["DH-TD1"], tu
    assert client.get("/api/quotations", params={"q": "banh keo"}, headers=ha).json()["total"] == 1
    for tu in ("tui giay", "giao gap"):
        assert client.get("/api/phieu-tinh-gia", params={"q": tu}, headers=ha).json()["total"] == 1, tu
