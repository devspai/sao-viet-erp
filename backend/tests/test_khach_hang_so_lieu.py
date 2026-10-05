"""Số liệu hồ sơ khách THEO KỲ (04/10/2026): Tổng quan / Lịch sử mua hàng / Lịch sử báo giá.

Chốt các luật người bán hàng nhìn thấy:
  · doanh số chỉ cộng đơn ĐÃ CHỐT (nháp không, huỷ không);
  · mọi khối có số của CÙNG KỲ NĂM TRƯỚC;
  · cột biểu đồ cộng lại đúng bằng số tổng của kỳ;
  · lọc / đếm / phân trang chạy ở máy chủ;
  · báo giá "đã gửi" quá hạn hiệu lực rơi vào nhóm Hết hạn, không nằm trong "đang chờ".
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.order import Order, OrderLine
from app.models.quotation import Quote, QuoteVersion
from app.services.khach_hang_so_lieu import chia_cot, hom_nay_vn, lui_nam

ADMIN = {"username": "admin", "password": "admin123"}


def _token(client) -> str:
    return client.post("/api/auth/login", json=ADMIN).json()["access_token"]


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _khach(client, token, ten="Khách Số Liệu") -> int:
    return client.post("/api/customers", json={"name": ten}, headers=_h(token)).json()["customer"]["id"]


def _luc(ngay: date) -> datetime:
    """10:00 giờ VN của `ngay` (03:00 UTC) — xa nửa đêm để ngày VN không lệch."""
    return datetime(ngay.year, ngay.month, ngay.day, 3, 0, tzinfo=timezone.utc)


def _don(cid: int, so: str, ngay: date, dong: list[tuple[str, int]], status="ordered",
         quotation_id=None) -> None:
    db = SessionLocal()
    try:
        o = Order(order_no=so, customer_id=cid, order_kind="moi", status=status,
                  created_at=_luc(ngay), quotation_id=quotation_id)
        for mo_ta, tien in dong:
            o.lines.append(OrderLine(description=mo_ta, qty=1, unit_price_snapshot=tien,
                                     line_total=tien))
        db.add(o)
        db.commit()
    finally:
        db.close()


def _bao_gia(cid: int, ma: str, ngay: date, status: str, tien: int,
             han: date | None = None) -> int:
    db = SessionLocal()
    try:
        q = Quote(quote_number=ma, customer_id=cid, status=status, created_at=_luc(ngay),
                  valid_until=han)
        db.add(q)
        db.flush()
        v = QuoteVersion(quote_id=q.id, version_number=1, status="sent",
                         total_cost_snapshot=0, subtotal_amount=tien, discount_amount=0,
                         vat_percent=0, vat_amount=0, final_amount=tien, created_at=_luc(ngay))
        db.add(v)
        db.flush()
        q.current_version_id = v.id
        db.commit()
        return q.id
    finally:
        db.close()


# --- hàm thuần -------------------------------------------------------------------------------


def test_chia_cot_cat_theo_ky_va_tu_len_buoc_tho():
    buoc, cot = chia_cot(date(2026, 1, 15), date(2026, 3, 10), "thang")
    assert buoc == "thang"
    assert cot == [(date(2026, 1, 15), date(2026, 1, 31)), (date(2026, 2, 1), date(2026, 2, 28)),
                   (date(2026, 3, 1), date(2026, 3, 10))]
    # 3 năm theo tuần = ~157 cột > trần 60 ⇒ tự lên tháng (36 cột).
    buoc, cot = chia_cot(date(2023, 1, 1), date(2025, 12, 31), "tuan")
    assert buoc == "thang" and len(cot) == 36


def test_lui_nam_ngay_29_2():
    assert lui_nam(date(2028, 2, 29)) == date(2027, 2, 28)


# --- Tổng quan ---------------------------------------------------------------------------------


def test_thong_ke_chi_cong_don_DA_CHOT_va_co_cung_ky(client):
    token = _token(client)
    cid = _khach(client, token)
    hn = hom_nay_vn()
    tu = hn - timedelta(days=90)
    _don(cid, "SL1", hn - timedelta(days=5), [("Hộp cứng", 20_000_000), ("Túi giấy", 4_000_000)])
    _don(cid, "SL2", hn - timedelta(days=40), [("Hộp cứng", 10_000_000)])
    _don(cid, "SL3", hn - timedelta(days=2), [("Hộp cứng", 99_000_000)], status="draft")
    _don(cid, "SL4", hn - timedelta(days=3), [("Tem nhãn", 7_000_000)], status="cancelled")
    _don(cid, "SL5", lui_nam(hn - timedelta(days=10)), [("Hộp cứng", 8_000_000)])  # cùng kỳ

    tk = client.get(f"/api/customers/{cid}/thong-ke?tu={tu}&den={hn}&buoc=tuan",
                    headers=_h(token)).json()
    assert tk["don"]["doanh_so"] == 34_000_000      # nháp 99tr KHÔNG tính
    assert tk["don"]["so_don"] == 2
    assert tk["don"]["tb_don"] == 17_000_000
    assert tk["don"]["so_huy"] == 1 and tk["don"]["tien_huy"] == 7_000_000
    assert tk["don_cu"]["doanh_so"] == 8_000_000
    assert tk["tu_cu"] == lui_nam(tu).isoformat()
    # Cột biểu đồ cộng lại = số tổng của kỳ (kể cả cột đầu/cuối bị cắt giữa tuần).
    assert tk["buoc"] == "tuan"
    assert sum(c["doanh_so"] for c in tk["cot"]) == 34_000_000
    assert sum(c["doanh_so_cu"] for c in tk["cot"]) == 8_000_000
    sp = {x["ten"]: x for x in tk["san_pham"]}
    assert sp["Hộp cứng"]["doanh_so"] == 30_000_000 and sp["Hộp cứng"]["so_lan"] == 2
    assert sp["Hộp cứng"]["doanh_so_cu"] == 8_000_000
    assert "Tem nhãn" not in sp  # đơn huỷ


def test_nhip_dat_hang_theo_ky(client):
    token = _token(client)
    cid = _khach(client, token)
    hn = hom_nay_vn()
    for i, lui in enumerate((400, 100, 70, 40)):
        _don(cid, f"NH{i}", hn - timedelta(days=lui), [("Hộp", 1_000_000)])
    _don(cid, "NHX", hn - timedelta(days=50), [("Hộp", 2_000_000)], status="cancelled")
    tu = (hn - timedelta(days=120)).isoformat()
    tk = client.get(f"/api/customers/{cid}/thong-ke?tu={tu}", headers=_h(token)).json()
    n = tk["nhip"]
    # Đơn 400 ngày trước nằm ngoài kỳ ⇒ không kéo khoảng cách lên 300 ngày.
    assert n["tb_ngay"] == 30 and n["nhanh_nhat"] == 30 and n["lau_nhat"] == 30
    assert n["so_don"] == 3 and n["so_ngay_tu_lan_cuoi"] == 40
    assert n["du_kien"] == (hn - timedelta(days=10)).isoformat()
    # Lịch tần suất cũng theo kỳ: 3 đơn chốt + 1 đơn huỷ.
    assert len(tk["diem_don"]) == 4 and sum(d["huy"] for d in tk["diem_don"]) == 1

    # Kỳ rộng hơn thì nhịp đổi theo.
    tu = (hn - timedelta(days=500)).isoformat()
    n = client.get(f"/api/customers/{cid}/thong-ke?tu={tu}", headers=_h(token)).json()["nhip"]
    assert n["so_don"] == 4 and n["lau_nhat"] == 300


def test_thong_ke_khach_moi_tra_so_0_that(client):
    token = _token(client)
    cid = _khach(client, token)
    tk = client.get(f"/api/customers/{cid}/thong-ke", headers=_h(token)).json()
    assert tk["don"] == {"doanh_so": 0, "so_don": 0, "tb_don": None, "so_huy": 0, "tien_huy": 0}
    assert tk["san_pham"] == [] and tk["nhip"] is None
    assert tk["bao_gia"]["ti_le"] is None


def test_thong_ke_tu_sau_den_bi_tu_choi(client):
    token = _token(client)
    cid = _khach(client, token)
    r = client.get(f"/api/customers/{cid}/thong-ke?tu=2026-05-01&den=2026-04-01", headers=_h(token))
    assert r.status_code == 422


# --- Báo giá ------------------------------------------------------------------------------------


def test_bao_gia_nhom_dang_cho_het_han_va_thanh_don(client):
    token = _token(client)
    cid = _khach(client, token)
    hn = hom_nay_vn()
    _bao_gia(cid, "BGC1", hn - timedelta(days=3), "sent", 10_000_000, han=hn + timedelta(days=4))
    _bao_gia(cid, "BGC2", hn - timedelta(days=3), "sent", 5_000_000, han=hn + timedelta(days=20))
    _bao_gia(cid, "BGQH", hn - timedelta(days=40), "sent", 9_000_000, han=hn - timedelta(days=10))
    qid = _bao_gia(cid, "BGTD", hn - timedelta(days=20), "converted_to_order", 30_000_000)
    _don(cid, "DHTD", hn - timedelta(days=12), [("Hộp", 30_000_000)], quotation_id=qid)

    tk = client.get(f"/api/customers/{cid}/thong-ke", headers=_h(token)).json()
    assert tk["dang_cho"] == {"so": 2, "tong": 15_000_000, "sap_het_han": 1}
    assert tk["bao_gia"]["tb_ngay_chot"] == 8

    tu = (hn - timedelta(days=60)).isoformat()
    r = client.get(f"/api/customers/{cid}/quotations?tu={tu}", headers=_h(token)).json()
    assert r["dem"]["cho"] == 2 and r["dem"]["het_han"] == 1 and r["dem"]["thanh_don"] == 1
    nhom = {x["code"]: x["nhom"] for x in r["items"]}
    assert nhom["BGQH"] == "het_han"  # đã gửi nhưng quá hạn ⇒ không còn "đang chờ"
    td = next(x for x in r["items"] if x["code"] == "BGTD")
    assert td["don_ma"] == "DHTD"

    loc = client.get(f"/api/customers/{cid}/quotations?tu={tu}&nhom=cho", headers=_h(token)).json()
    assert {x["code"] for x in loc["items"]} == {"BGC1", "BGC2"} and loc["tong_so"] == 2
    tim = client.get(f"/api/customers/{cid}/quotations?tu={tu}&q=DHTD", headers=_h(token)).json()
    assert [x["code"] for x in tim["items"]] == ["BGTD"]


# --- Lịch sử mua hàng ------------------------------------------------------------------------------


def test_lich_su_don_loc_dem_tien_va_phan_trang_o_may_chu(client):
    token = _token(client)
    cid = _khach(client, token)
    hn = hom_nay_vn()
    qid = _bao_gia(cid, "BGLS", hn - timedelta(days=30), "converted_to_order", 1)
    _don(cid, "LS1", hn - timedelta(days=20), [("Hộp bánh", 12_000_000)], quotation_id=qid)
    _don(cid, "LS2", hn - timedelta(days=10), [("Túi giấy", 3_000_000)])
    _don(cid, "LS3", hn - timedelta(days=5), [("Hộp bánh", 50_000_000)], status="draft")
    _don(cid, "LS4", hn - timedelta(days=4), [("Hộp bánh", 6_000_000)], status="cancelled")
    _don(cid, "LS0", hn - timedelta(days=400), [("Hộp bánh", 1_000_000)])  # ngoài kỳ

    tu = (hn - timedelta(days=60)).isoformat()
    url = f"/api/customers/{cid}/orders?tu={tu}"
    r = client.get(url, headers=_h(token)).json()
    assert r["dem"] == {"chot": 2, "nhap": 1, "huy": 1}
    assert r["tong_so"] == 4
    assert r["tien_chot"] == 15_000_000
    assert r["tien_huy"] == 6_000_000  # nháp 50tr không vào tiền chốt lẫn tiền huỷ
    assert [x["order_no"] for x in r["items"]] == ["LS4", "LS3", "LS2", "LS1"]
    assert r["items"][-1]["bao_gia_ma"] == "BGLS"

    # Tìm theo tên sản phẩm VÀ theo mã báo giá — đếm theo đúng tập tìm được.
    r = client.get(url + "&q=hộp bánh", headers=_h(token)).json()
    assert r["dem"] == {"chot": 1, "nhap": 1, "huy": 1} and r["tien_chot"] == 12_000_000
    r = client.get(url + "&q=BGLS", headers=_h(token)).json()
    assert [x["order_no"] for x in r["items"]] == ["LS1"]

    # Nhóm + sắp theo tiền + phân trang.
    r = client.get(url + "&nhom=chot&sap_xep=-tien&co=1", headers=_h(token)).json()
    assert r["tong_so"] == 2 and [x["order_no"] for x in r["items"]] == ["LS1"]
    r = client.get(url + "&nhom=chot&sap_xep=-tien&co=1&trang=2", headers=_h(token)).json()
    assert [x["order_no"] for x in r["items"]] == ["LS2"]

    # Xuất Excel theo đúng bộ lọc.
    csv = client.get(f"/api/customers/{cid}/orders.csv?tu={tu}&nhom=chot", headers=_h(token))
    text = csv.content.decode("utf-8")
    assert "LS1" in text and "LS2" in text and "LS3" not in text and "LS0" not in text


def test_danh_sach_khach_khong_cong_don_nhap(client):
    token = _token(client)
    cid = _khach(client, token, "Khách Danh Sách Nháp")
    hn = hom_nay_vn()
    _don(cid, "DSN1", hn - timedelta(days=3), [("Hộp", 5_000_000)])
    _don(cid, "DSN2", hn - timedelta(days=1), [("Hộp", 70_000_000)], status="draft")
    _don(cid, "DSN0", hn - timedelta(days=500), [("Hộp", 9_000_000)])  # ngoài 12 tháng
    row = next(c for c in client.get("/api/customers?size=200", headers=_h(token)).json()["items"]
               if c["id"] == cid)
    assert row["revenue_12m"] == 5_000_000 and row["orders_12m"] == 1
    assert row["orders_total"] == 2  # mọi thời kỳ, vẫn chỉ đơn đã chốt
    d = client.get(f"/api/customers/{cid}", headers=_h(token)).json()
    assert d["so_don"] == 3  # nhãn tab: mọi trạng thái, mọi thời kỳ
