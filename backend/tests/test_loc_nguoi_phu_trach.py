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


def test_ten_nguoi_lap_lay_tu_tai_khoan_created_by(client):
    """Chuyển người lập (đổi `created_by`) mà ảnh chụp `ktv` còn tên cũ ⇒ màn vẫn hiện người lập
    THẬT, khớp với phạm vi và hộp lọc (05/10/2026). Phiếu cũ không `created_by` giữ `ktv`."""
    a = tao_nguoi("sale_lap", {"tinh_gia_thanh": dict(can_read=True, scope="all")})
    db = SessionLocal()
    try:
        p = PhieuTinhGia(ma="PTG-KTV1", ten_san_pham="SP", ktv="Admin", created_by=a)
        db.add(p)
        db.add(PhieuTinhGia(ma="PTG-KTV2", ten_san_pham="SP", ktv="Người cũ", created_by=None))
        db.commit()
        pid = p.id
    finally:
        db.close()
    h = dang_nhap(client, "sale_lap")
    ten = {i["ma"]: i["ktv"] for i in client.get("/api/phieu-tinh-gia", headers=h).json()["items"]}
    assert ten == {"PTG-KTV1": "sale_lap", "PTG-KTV2": "Người cũ"}
    assert client.get(f"/api/phieu-tinh-gia/{pid}", headers=h).json()["ktv"] == "sale_lap"


def test_tro_ly_hai_nhom_chi_lo_chung_tu_theo_khach(client):
    """Chủ chứng từ = sale phụ trách KHÁCH (05/10/2026). Trợ lý T ở hai nhóm (T–H1, T–H2) lập phiếu,
    báo giá, đơn cho khách của H2 ⇒ H2 thấy, H1 KHÔNG thấy (cùng luật màn Khách hàng). Chứng từ
    chưa chọn khách thì vẫn theo người lập ⇒ H1 thấy như cũ."""
    from app.models.customer import Customer

    t = tao_nguoi("tro_ly_t", _PERMS)
    h1 = tao_nguoi("sale_h1", _PERMS)
    h2 = tao_nguoi("sale_h2", _PERMS)
    db = SessionLocal()
    try:
        for ten, uid in (("t-h1", h1), ("t-h2", h2)):
            nhom = NhomDungChung(ten=ten)
            db.add(nhom)
            db.flush()
            db.add_all([NhomDungChungThanhVien(nhom_id=nhom.id, user_id=t),
                        NhomDungChungThanhVien(nhom_id=nhom.id, user_id=uid)])
        kh = Customer(code="KH-H2", name="Khách của H2", sale_user_id=h2)
        db.add(kh)
        db.flush()
        o = Order(order_no="DH-K", customer_id=kh.id, sale_user_id=t, status="draft")
        q = Quote(quote_number="BG-K", customer_id=kh.id, salesperson_id=t, status="draft")
        p = PhieuTinhGia(ma="PTG-K", ten_san_pham="SP", customer_id=kh.id, created_by=t)
        p_trong = PhieuTinhGia(ma="PTG-TRONG", ten_san_pham="SP", created_by=t)   # chưa chọn khách
        db.add_all([o, q, p, p_trong])
        db.commit()
        ids = {"orders": o.id, "quotations": q.id, "phieu-tinh-gia": p.id}
        id_trong = p_trong.id
    finally:
        db.close()

    for ten, thay in (("sale_h1", False), ("sale_h2", True), ("tro_ly_t", True)):
        h = dang_nhap(client, ten)
        for duong, rid in ids.items():
            ds = client.get(f"/api/{duong}", headers=h).json()
            assert (rid in {x["id"] for x in ds["items"]}) is thay, (ten, duong)
            assert (client.get(f"/api/{duong}/{rid}", headers=h).status_code == 200) is thay, (ten, duong)
    h1h = dang_nhap(client, "sale_h1")
    assert client.get(f"/api/phieu-tinh-gia/{id_trong}", headers=h1h).status_code == 200
    assert client.get("/api/phieu-tinh-gia/stats", headers=h1h).json()["all"] == 1


def test_bao_gia_va_don_dung_ten_nguoi_phu_trach_khach(client):
    """NV phụ trách báo giá + đơn = người phụ trách KHÁCH, không phải người bấm (05/10/2026).
    Ca thật: trợ lý Luyến soạn BG26-0001 cho khách của Huyên, Huyên lên đơn DH001 → đơn đứng tên
    Luyến, hoa hồng lúc chốt chụp nhầm % của Luyến."""
    from app.models.customer import Customer
    from app.models.phieu_tinh_gia import PhieuThanhPhan

    from .test_orders_api import _accepted_quote
    from .thong_bao_helpers import admin

    h2 = tao_nguoi("sale_chu_khach", _PERMS)
    ha = admin(client)
    db = SessionLocal()
    try:
        kh = Customer(code="KH-CHU", name="Khách có chủ", sale_user_id=h2)
        kh_trong = Customer(code="KH-VO-CHU", name="Khách chưa gán")
        db.add_all([kh, kh_trong])
        db.flush()
        ptg = PhieuTinhGia(ma="PTG-CHU", ten_san_pham="SP", so_luong=100, customer_id=kh.id,
                           tong_gia_von=1_000_000, gia_von_don=0)
        db.add(ptg)
        db.flush()
        db.add(PhieuThanhPhan(phieu_id=ptg.id, thu_tu=0, ten="SP", so_luong=100,
                              gia_von_tp=1_000_000, loai_thanh_phan="to_roi"))
        db.commit()
        ptg_id = ptg.id
        q1 = _accepted_quote(db, kh)
        q1.quote_number = "BG-T-CHU"   # helper luôn đặt "BG-T" — đổi để tạo được cái thứ hai
        db.commit()
        q_id = q1.id
        q_trong_id = _accepted_quote(db, kh_trong).id
    finally:
        db.close()

    # Admin bấm tạo báo giá cho khách của H2 → báo giá đứng tên H2, không phải admin.
    r = client.post("/api/quotations", json={"phieu_tinh_gia_id": ptg_id}, headers=ha)
    assert r.status_code == 201, r.text
    assert r.json()["salesperson_id"] == h2

    # Lên đơn → NV phụ trách đơn = H2.
    r = client.post("/api/orders", json={"source_type": "bao_gia", "quotation_id": q_id},
                    headers=ha)
    assert r.status_code == 201, r.text
    assert r.json()["sale_user_id"] == h2
    # Khách chưa gán ai → rơi về người bấm như cũ.
    r = client.post("/api/orders", json={"source_type": "bao_gia", "quotation_id": q_trong_id},
                    headers=ha)
    assert r.status_code == 201, r.text
    assert r.json()["sale_user_id"] not in (None, h2)


def test_chot_don_di_theo_quyen_sua_khong_can_o_rieng(client):
    """Chốt đơn = quyền SỬA đơn (05/10/2026). Ô `manage_status` không có trên ma trận nên vai lập
    qua giao diện (vd "sale" của Huyên) trước đây không bao giờ chốt được — chỉ Giám đốc."""
    from datetime import date

    from app.models.customer import Customer
    from app.models.role import SCOPE_ALL

    from .test_orders_api import _accepted_quote
    from .thong_bao_helpers import admin

    tao_nguoi("sale_sua", {"don_hang_ban": dict(can_read=True, can_create=True, can_update=True,
                                                scope=SCOPE_ALL)})
    tao_nguoi("chi_xem", {"don_hang_ban": dict(can_read=True, scope=SCOPE_ALL)})
    ha = admin(client)
    db = SessionLocal()
    try:
        c = Customer(code="KH-CHOT", name="KH chốt")
        db.add(c)
        db.commit()
        qid = _accepted_quote(db, c).id
    finally:
        db.close()
    r = client.post("/api/orders", json={"source_type": "bao_gia", "quotation_id": qid,
                                         "deposit_pct": 0}, headers=ha)
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    u = client.put(f"/api/orders/{oid}", json={"customer_po_no": "PO1",
                                               "delivery_committed_date": date.today().isoformat()},
                   headers=ha)
    assert u.status_code == 200, u.text

    assert client.post(f"/api/orders/{oid}/confirm",
                       headers=dang_nhap(client, "chi_xem")).status_code == 403
    hs = dang_nhap(client, "sale_sua")
    assert client.get("/api/orders/notify-summary", headers=hs).json()["action_count"] == 1
    ch = client.post(f"/api/orders/{oid}/confirm", headers=hs)
    assert ch.status_code == 200 and ch.json()["status"] == "ordered", ch.text
