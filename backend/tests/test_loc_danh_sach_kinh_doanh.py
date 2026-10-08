"""Dải kỳ + "Bộ lọc nâng cao" của ba danh sách Kinh doanh — Tính giá thành, Báo giá, Đơn hàng bán
(06/10/2026, phương án A "khuôn Kế toán").

Luật: lọc và đếm đều ở máy chủ; số trên thanh tab theo ĐÚNG bộ lọc đang áp; báo giá ngoài danh
sách cho biết ai duyệt / ai đang được chờ duyệt.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.customer import Customer
from app.models.order import Order, OrderLine
from app.models.phieu_tinh_gia import PhieuThanhPhan, PhieuTinhGia
from app.models.quotation import Quote, QuoteVersion

from .test_quotation_approval import _h, _make_high_value_quote, _seed_ptg, _token

VN = timezone(timedelta(hours=7))


def _vn(*a) -> datetime:
    """Mốc giờ VN, cất dạng UTC như ứng dụng vẫn ghi (`_utcnow`) — SQLite không tự đổi múi."""
    return datetime(*a, tzinfo=VN).astimezone(timezone.utc)


def _khach(ten: str) -> int:
    db = SessionLocal()
    try:
        c = Customer(code=f"KH-{ten[:6]}", name=ten)
        db.add(c)
        db.commit()
        return c.id
    finally:
        db.close()


# --- Báo giá ------------------------------------------------------------------------------------

def test_bao_gia_hien_nguoi_duyet_va_loc_theo_ket_qua_duyet(client):
    t = _token(client)
    cho = _make_high_value_quote(client, t)
    duyet = _make_high_value_quote(client, t)
    tu_choi = _make_high_value_quote(client, t)
    thuong = client.post("/api/quotations", json={"phieu_tinh_gia_id": _seed_ptg(gia_von_tp=1_000_000)},
                         headers=_h(t)).json()
    for q in (cho, duyet, tu_choi):
        r = client.post(f"/api/quotations/{q['id']}/transition", json={"to_status": "pending_approval"},
                        headers=_h(t))
        assert r.status_code == 200, r.text
    client.post(f"/api/quotations/{duyet['id']}/approval", json={"decision": "approved", "note": "ok"},
                headers=_h(t))
    client.post(f"/api/quotations/{tu_choi['id']}/approval", json={"decision": "rejected", "note": "cao"},
                headers=_h(t))
    r = client.post(f"/api/quotations/{thuong['id']}/transition", json={"to_status": "sent"}, headers=_h(t))
    assert r.status_code == 200, r.text

    rows = {i["id"]: i for i in client.get("/api/quotations", headers=_h(t)).json()["items"]}
    d_cho = rows[cho["id"]]["duyet"]
    assert d_cho["trang_thai"] == "cho" and "Admin" in d_cho["nguoi"] and d_cho["luc"] is not None
    d_duyet = rows[duyet["id"]]["duyet"]
    assert d_duyet == {**d_duyet, "trang_thai": "da_duyet", "nguoi": ["Admin"], "y_kien": "ok"}
    assert rows[tu_choi["id"]]["duyet"]["trang_thai"] == "tu_choi"
    assert rows[thuong["id"]]["duyet"]["trang_thai"] == "khong_can"
    assert rows[thuong["id"]]["created_at"] is not None

    def ids(params):
        return {i["id"] for i in client.get("/api/quotations", params=params, headers=_h(t)).json()["items"]}

    assert ids({"duyet": "cho"}) == {cho["id"]}
    assert ids({"duyet": ["duyet", "tu_choi"]}) == {duyet["id"], tu_choi["id"]}
    assert ids({"duyet": "khong"}) == {thuong["id"]}

    admin_id = next(o["id"] for o in client.get("/api/quotations/nguoi-duyet", headers=_h(t)).json())
    assert ids({"nguoi_duyet": admin_id}) == {duyet["id"], tu_choi["id"]}

    # Thanh tab đếm theo bộ lọc đang áp.
    st = client.get("/api/quotations/stats", params={"duyet": ["duyet", "tu_choi"]}, headers=_h(t)).json()
    assert st["total"] == 2 and st["approved"] == 1 and st["rejected"] == 1 and st["pending_approval"] == 0


def test_bao_gia_loc_ky_khach_gia_hieu_luc_va_xep_theo_gia(client):
    t = _token(client)
    kh = _khach("Công ty Lọc Kỳ")
    db = SessionLocal()
    try:
        tao = []
        for i, (ngay_tao, han, gia) in enumerate([
            (_vn(2026, 9, 3, 1, 0), date.today() + timedelta(days=3), 5_000_000),
            (_vn(2026, 10, 1, 0, 30), date.today() + timedelta(days=60), 9_000_000),
            (_vn(2026, 10, 2, 23, 59), date.today() - timedelta(days=1), 1_000_000),
        ]):
            q = Quote(quote_number=f"BG-LK{i}", customer_id=kh if i < 2 else None, status="draft",
                      created_at=ngay_tao, valid_until=han)
            db.add(q)
            db.flush()
            v = QuoteVersion(quote_id=q.id, version_number=1, final_amount=gia)
            db.add(v)
            db.flush()
            q.current_version_id = v.id
            tao.append(q.id)
        db.commit()
    finally:
        db.close()

    def ma(params):
        r = client.get("/api/quotations", params={"q": "BG-LK", **params}, headers=_h(t))
        assert r.status_code == 200, r.text
        return [i["code"] for i in r.json()["items"]]

    # 00:30 ngày 01/10 giờ VN vẫn thuộc ngày 01/10 (lưu UTC là 30/09).
    assert sorted(ma({"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31"})) == ["BG-LK1", "BG-LK2"]
    assert ma({"tu_ngay": "2026-09-01", "den_ngay": "2026-09-30"}) == ["BG-LK0"]
    assert sorted(ma({"khach": kh})) == ["BG-LK0", "BG-LK1"]
    assert ma({"gia_tu": 4_000_000, "gia_den": 6_000_000}) == ["BG-LK0"]
    assert ma({"hieu_luc": "sap_het"}) == ["BG-LK0"]
    assert ma({"hieu_luc": "het"}) == ["BG-LK2"]
    assert sorted(ma({"hieu_luc": "con"})) == ["BG-LK0", "BG-LK1"]
    hom_nay = date.today()
    assert ma({"moc": "hieu_luc", "tu_ngay": str(hom_nay + timedelta(days=30)),
               "den_ngay": str(hom_nay + timedelta(days=90))}) == ["BG-LK1"]
    # Nút sắp xếp cột Giá bán trước đây bị máy chủ bỏ qua.
    assert ma({"sort": "-total"}) == ["BG-LK1", "BG-LK0", "BG-LK2"]
    assert ma({"sort": "total"}) == ["BG-LK2", "BG-LK0", "BG-LK1"]

    khach = client.get("/api/quotations/khach-loc", headers=_h(t)).json()
    assert {"id": kh, "ten": "Công ty Lọc Kỳ", "so": 2} in khach

    # Dòng "Cộng" cuối bảng: Σ giá bán của MỌI dòng khớp bộ lọc, không chỉ trang đang xem.
    r = client.get("/api/quotations", params={"q": "BG-LK", "size": 1}, headers=_h(t)).json()
    assert r["total"] == 3 and len(r["items"]) == 1 and r["tong_gia_ban"] == 15_000_000
    r = client.get("/api/quotations", params={"q": "BG-LK", "khach": kh}, headers=_h(t)).json()
    assert r["tong_gia_ban"] == 14_000_000


def test_bao_gia_dong_kem_don_hang_va_so_luong(client):
    """Lưới Báo giá: cột Đơn hàng (mã + trạng thái đơn lên từ báo giá), Số lượng + đơn vị dòng đầu."""
    from app.models.quotation import QuoteItem
    t = _token(client)
    db = SessionLocal()
    try:
        q = Quote(quote_number="BG-DK1", status="converted_to_order")
        db.add(q)
        db.flush()
        v = QuoteVersion(quote_id=q.id, version_number=1, final_amount=1_000_000)
        db.add(v)
        db.flush()
        q.current_version_id = v.id
        for i, (ten, sl, dv) in enumerate([("Ruột sách", 2000, "cuốn"), ("Bìa sách", 2000, "tờ")]):
            db.add(QuoteItem(quote_version_id=v.id, line_no=i + 1, product_type="khac", product_name=ten,
                             quantity=sl, unit=dv))
        db.add(Order(order_no="DH-DK1", source_type="bao_gia", quotation_id=q.id, status="ordered"))
        db.commit()
    finally:
        db.close()
    it = client.get("/api/quotations", params={"q": "BG-DK1"}, headers=_h(t)).json()["items"][0]
    assert (it["san_pham"], it["so_sp_khac"], it["so_luong"], it["don_vi"]) == ("Ruột sách", 1, 2000, "cuốn")
    assert (it["don_hang_ma"], it["don_hang_trang_thai"]) == ("DH-DK1", "ordered")


# --- Đơn hàng bán -------------------------------------------------------------------------------

def test_don_hang_tab_san_sang_chot_va_cho_coc_dem_o_may_chu(client, monkeypatch):
    t = _token(client)
    kh = _khach("Công ty Đơn Lọc")
    db = SessionLocal()
    try:
        bg = Quote(quote_number="BG-DL1", customer_id=kh, status="accepted")
        db.add(bg)
        db.flush()

        def don(no, **kw):
            o = Order(order_no=no, customer_id=kh, source_type="bao_gia", quotation_id=bg.id, **kw)
            db.add(o)
            db.flush()
            return o

        du = don("DH-DL1", status="draft", customer_po_no="PO1", delivery_committed_date=date(2026, 11, 5))
        db.add(OrderLine(order_id=du.id, description="Hộp", line_total=1_000_000, vat_pct_estimate=8))
        thieu_po = don("DH-DL2", status="draft", delivery_committed_date=date(2026, 11, 5))
        db.add(OrderLine(order_id=thieu_po.id, description="Hộp", line_total=1_000_000))
        chua_gia = don("DH-DL3", status="draft", customer_po_no="PO3", delivery_committed_date=date(2026, 11, 5))
        db.add(OrderLine(order_id=chua_gia.id, description="Hộp", line_total=None))
        cho = don("DH-DL4", status="ordered", ordered_at=_vn(2026, 10, 2),
                  delivery_committed_date=date(2026, 10, 20), is_rush=True)
        db.add(OrderLine(order_id=cho.id, description="Tờ rơi", line_total=20_000_000, vat_pct_estimate=10))
        don("DH-DL5", status="ordered", ordered_at=_vn(2026, 10, 3),
            san_xuat_released_at=_vn(2026, 10, 3), delivery_committed_date=date(2026, 12, 1))
        db.commit()
    finally:
        db.close()

    def ma(params):
        r = client.get("/api/orders", params={"khach": kh, **params}, headers=_h(t))
        assert r.status_code == 200, r.text
        return sorted(i["order_no"] for i in r.json()["items"])

    assert ma({"status": "san_sang"}) == ["DH-DL1"]
    assert ma({"status": "cho_coc"}) == ["DH-DL4"]
    st = client.get("/api/orders/stats", params={"khach": kh}, headers=_h(t)).json()
    assert (st["all"], st["draft"], st["ordered"], st["san_sang"], st["cho_coc"]) == (5, 3, 2, 1, 1)

    assert ma({"moc": "giao", "tu_ngay": "2026-10-01", "den_ngay": "2026-10-31"}) == ["DH-DL4"]
    assert ma({"moc": "chot", "tu_ngay": "2026-10-03", "den_ngay": "2026-10-03"}) == ["DH-DL5"]
    assert ma({"gap": "true"}) == ["DH-DL4"]
    # Giá trị gồm VAT: 1.000.000 × 1,08 = 1.080.000; 20.000.000 × 1,1 = 22.000.000.
    assert ma({"gia_tu": 1_080_000, "gia_den": 1_080_000}) == ["DH-DL1"]
    assert ma({"gia_tu": 21_000_000}) == ["DH-DL4"]
    st = client.get("/api/orders/stats", params={"khach": kh, "gap": "true"}, headers=_h(t)).json()
    assert (st["all"], st["cho_coc"], st["san_sang"]) == (1, 1, 0)

    assert {"id": kh, "ten": "Công ty Đơn Lọc", "so": 5} in client.get("/api/orders/khach-loc", headers=_h(t)).json()

    # Đang chờ: đã chốt mà chưa chuyển = chờ kế toán thu cọc. Hẹn giao: đã qua ngày hẹn mà chưa
    # giao đủ / trong 7 ngày tới.
    assert ma({"dang_cho": "coc"}) == ["DH-DL4"]
    st = client.get("/api/orders/stats", params={"khach": kh, "dang_cho": "coc"}, headers=_h(t)).json()
    assert (st["all"], st["cho_coc"]) == (1, 1)
    monkeypatch.setattr("app.repositories.order_repo.hom_nay_vn", lambda: date(2026, 11, 1))
    assert ma({"hen_giao": "qua"}) == ["DH-DL4"]
    assert ma({"hen_giao": "sap"}) == ["DH-DL1", "DH-DL2", "DH-DL3"]


# --- Tính giá thành -----------------------------------------------------------------------------

def test_ptg_loc_ky_khach_gia_von_va_da_len_bao_gia(client):
    t = _token(client)
    kh = _khach("Công ty Phiếu Lọc")
    db = SessionLocal()
    try:
        for i, (ngay, gv, co_bg) in enumerate([
            (_vn(2026, 9, 30, 23, 0), 2_000_000, True),
            (_vn(2026, 10, 1, 0, 10), 8_000_000, False),
        ]):
            p = PhieuTinhGia(ma=f"PTG-PL{i}", ten_san_pham="SP", customer_id=kh, created_at=ngay,
                             tong_gia_von=gv, gia_von_don=0)
            db.add(p)
            db.flush()
            db.add(PhieuThanhPhan(phieu_id=p.id, thu_tu=0, ten="SP", so_luong=1, loai_thanh_phan="to_roi"))
            if co_bg:
                db.add(Quote(quote_number=f"BG-PL{i}", phieu_tinh_gia_id=p.id, status="draft"))
        db.commit()
    finally:
        db.close()

    def ma(params):
        r = client.get("/api/phieu-tinh-gia", params={"khach": kh, **params}, headers=_h(t))
        assert r.status_code == 200, r.text
        return sorted(i["ma"] for i in r.json()["items"])

    assert ma({}) == ["PTG-PL0", "PTG-PL1"]
    assert ma({"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31"}) == ["PTG-PL1"]
    assert ma({"gv_tu": 5_000_000}) == ["PTG-PL1"]
    assert ma({"bao_gia": "co"}) == ["PTG-PL0"]
    assert ma({"bao_gia": "chua"}) == ["PTG-PL1"]
    st = client.get("/api/phieu-tinh-gia/stats", params={"khach": kh, "bao_gia": "chua"}, headers=_h(t)).json()
    assert st == {"all": 1, "draft": 0, "dang_tinh": 0, "calculated": 1}
    assert {"id": kh, "ten": "Công ty Phiếu Lọc", "so": 2} in client.get(
        "/api/phieu-tinh-gia/khach-loc", headers=_h(t)).json()
