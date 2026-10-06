"""Thanh lọc chung cho các màn DANH MỤC (06/10/2026, Task 20): kỳ theo Ngày tạo (ranh ngày giờ VN),
điều kiện riêng từng màn, số đếm từng điều kiện (`dem`) — tất cả ở máy chủ; mọi dòng có `created_at`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import event

from app.db import SessionLocal, engine
from app.models.cong_doan import CongDoan, CongDoanTo
from app.models.customer import Customer
from app.models.department import Department
from app.models.kho_hang import KhoHang
from app.models.khuon_be import KhuonBe
from app.models.vat_lieu_kho import GiayNguyen, VatTuInAn
from app.models.xe import MucKhoanKm, Xe

from .test_quotation_approval import _h, _token

VN = timezone(timedelta(hours=7))
THANG_10 = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31", "moc": "tao"}


def _utc(*a) -> datetime:
    return datetime(*a, tzinfo=timezone.utc)


def _them(*objs):
    db = SessionLocal()
    try:
        for o in objs:
            db.add(o)
        db.commit()
        return [getattr(o, "id", None) for o in objs]
    finally:
        db.close()


def _ds(client, t, url, **params):
    params.setdefault("kem_dem", "true")       # màn danh mục xin số đếm của thanh lọc
    r = client.get(url, params=params, headers=_h(t))
    assert r.status_code == 200, r.text
    return r.json()


def _dem(body, khoa) -> dict[str, int]:
    return {d["value"]: d["so"] for d in body["dem"].get(khoa, [])}


def test_ky_ngay_tao_ranh_gio_vn_va_co_created_at(client):
    t = _token(client)
    # 30/09 17:30 UTC = 01/10 00:30 giờ VN ⇒ THUỘC tháng 10; 16:30 UTC = 30/09 23:30 VN ⇒ ngoài.
    _them(KhoHang(ma="KHO-T10", ten="Kho A", created_at=_utc(2026, 9, 30, 17, 30)),
          KhoHang(ma="KHO-T09", ten="Kho B", created_at=_utc(2026, 9, 30, 16, 30)))
    body = _ds(client, t, "/api/kho", q="KHO-T", **THANG_10)
    assert [x["ma"] for x in body["items"]] == ["KHO-T10"]
    assert body["items"][0]["created_at"].startswith("2026-09-30T17:30")
    # Không chọn kỳ ⇒ không chặn ngày.
    assert body["total"] == 1 and _ds(client, t, "/api/kho", q="KHO-T")["total"] == 2


def test_moc_la_chi_nhan_tao(client):
    t = _token(client)
    r = client.get("/api/kho", params={**THANG_10, "moc": "can"}, headers=_h(t))
    assert r.status_code == 422


def test_dem_dang_dung_da_ngung_theo_bo_loc_khac(client):
    t = _token(client)
    _them(KhoHang(ma="KHO-D1", ten="Dùng", created_at=_utc(2026, 10, 2)),
          KhoHang(ma="KHO-N1", ten="Ngừng", active=False, created_at=_utc(2026, 10, 3)),
          KhoHang(ma="KHO-N2", ten="Ngừng cũ", active=False, created_at=_utc(2026, 8, 3)))
    body = _ds(client, t, "/api/kho", q="KHO-", active="true", **THANG_10)
    assert [x["ma"] for x in body["items"]] == ["KHO-D1"]
    # Số của "active" bỏ chính điều kiện active, nhưng vẫn áp kỳ + ô tìm.
    assert _dem(body, "active") == {"true": 1, "false": 1}


def test_cong_doan_to_can_khuon_va_dem(client):
    t = _token(client)
    to_in, to_be = _them(Department(name="Tổ In lọc", code="TL-IN"), Department(name="Tổ Bế lọc", code="TL-BE"))
    a, b, _c = _them(
        CongDoan(ma="CD-L1", ten="In lọc", nhom="print", requires_tooling=False),
        CongDoan(ma="CD-L2", ten="Bế lọc", nhom="finishing", requires_tooling=True),
        CongDoan(ma="CD-L3", ten="Dán lọc", nhom="finishing", requires_tooling=False),
    )
    _them(CongDoanTo(cong_doan_id=a, department_id=to_in), CongDoanTo(cong_doan_id=b, department_id=to_be),
          CongDoanTo(cong_doan_id=b, department_id=to_in, thu_tu=1))
    body = _ds(client, t, "/api/cong-doan", q="CD-L", to_id=to_in)
    assert sorted(x["ma"] for x in body["items"]) == ["CD-L1", "CD-L2"]
    assert all("created_at" in x for x in body["items"])
    to = {d["value"]: (d["nhan"], d["so"]) for d in body["dem"]["to_id"]}
    assert to[str(to_in)] == ("Tổ In lọc", 2) and to[str(to_be)] == ("Tổ Bế lọc", 1)
    # Giai đoạn đếm dưới bộ lọc tổ.
    assert _dem(body, "nhom") == {"print": 1, "finishing": 1}
    body = _ds(client, t, "/api/cong-doan", q="CD-L", can_khuon="true")
    assert [x["ma"] for x in body["items"]] == ["CD-L2"]
    assert _dem(body, "can_khuon") == {"true": 1, "false": 2}


def test_khuon_khach_tinh_trang_so_ke_co_ten_khach(client):
    t = _token(client)
    (kh,) = _them(Customer(code="KH-LOC", name="Minh Long lọc"))
    _them(KhuonBe(ma="KB-L1", ten="Hộp A", khach_hang_id=kh, loai="khuon_be", so_ke="Kệ B3", tinh_trang="dang_dung"),
          KhuonBe(ma="KB-L2", ten="Hộp B", khach_hang_id=kh, loai="khuon_be", so_ke="Kệ C1", tinh_trang="hong"),
          KhuonBe(ma="KB-L3", ten="Hộp C", loai="khuon_be", so_ke="Kệ B3", tinh_trang="dang_dung"))
    body = _ds(client, t, "/api/khuon-be", q="Hộp", khach_hang_id=kh)
    assert sorted(x["ma"] for x in body["items"]) == ["KB-L1", "KB-L2"]
    khach = {d["value"]: d for d in body["dem"]["khach_hang_id"]}
    assert khach[str(kh)]["nhan"] == "Minh Long lọc" and khach[str(kh)]["so"] == 2
    assert _dem(body, "tinh_trang") == {"dang_dung": 1, "hong": 1}
    assert _dem(body, "so_ke") == {"Kệ B3": 1, "Kệ C1": 1}
    assert _dem(body, "loai") == {"khuon_be": 2}


def test_giay_don_vi_gia_va_thanh_pham_khach(client):
    t = _token(client)
    (kh,) = _them(Customer(code="KH-TP", name="Khách thành phẩm"))
    _them(GiayNguyen(ma="GL-1", ten="Giấy lọc 1", gsm=100, don_vi_gia="kg"),
          GiayNguyen(ma="GL-2", ten="Giấy lọc 2", gsm=120, don_vi_gia="to"),
          VatTuInAn(ma="TP-L1", ten="Hộp lọc", la_thanh_pham=True, customer_id=kh),
          VatTuInAn(ma="TP-L2", ten="Túi lọc", la_thanh_pham=True))
    body = _ds(client, t, "/api/vat-lieu-kho/giay", q="GL-", don_vi_gia="kg")
    assert [x["ma"] for x in body["items"]] == ["GL-1"] and "created_at" in body["items"][0]
    assert _dem(body, "don_vi_gia") == {"kg": 1, "to": 1}
    body = _ds(client, t, "/api/vat-lieu-kho/thanh-pham", q="lọc", khach_hang_id=kh)
    assert [x["ma"] for x in body["items"]] == ["TP-L1"]
    assert body["dem"]["khach_hang_id"] == [{"value": str(kh), "nhan": "Khách thành phẩm", "so": 1}]


def test_xe_muc_khoan(client):
    t = _token(client)
    m1, m2 = _them(MucKhoanKm(ten="Xe 1 tấn lọc"), MucKhoanKm(ten="Xe 2 tấn lọc"))
    _them(Xe(ma="51L-001", ten="Xe một", muc_khoan_km_id=m1), Xe(ma="51L-002", ten="Xe hai", muc_khoan_km_id=m2))
    body = _ds(client, t, "/api/xe", q="51L-", muc_khoan_km_id=m2)
    assert [x["ma"] for x in body["items"]] == ["51L-002"] and "created_at" in body["items"][0]
    muc = {d["value"]: (d["nhan"], d["so"]) for d in body["dem"]["muc_khoan_km_id"]}
    assert muc == {str(m1): ("Xe 1 tấn lọc", 1), str(m2): ("Xe 2 tấn lọc", 1)}


def test_don_vi_ho_va_thiet_bi_co_ky(client):
    t = _token(client)
    body = _ds(client, t, "/api/don-vi", **THANG_10)
    assert "dem" in body and "ho" in body["dem"]
    body = _ds(client, t, "/api/may-thiet-bi", **THANG_10)
    assert "loai_may" in body["dem"] or body["total"] == 0
    assert "active" in body["dem"]


def test_khong_xin_kem_dem_thi_khong_dem_va_khong_group_by_thua(client):
    """Ô chọn ở màn khác gọi `/api/kho`, `/api/xe`… rất nhiều: không xin `kem_dem` thì không có số
    đếm và KHÔNG chạy câu GROUP BY nào."""
    t = _token(client)
    _them(KhoHang(ma="KHO-K1", ten="Kho K", created_at=_utc(2026, 10, 2)))
    cau: list[str] = []

    def ghi(_conn, _cur, sql, *_a):
        cau.append(sql)

    event.listen(engine, "before_cursor_execute", ghi)
    try:
        r = client.get("/api/kho", params={"q": "KHO-K", "active": "true", **THANG_10}, headers=_h(t))
        r2 = client.get("/api/xe", params={"active": "true"}, headers=_h(t))
    finally:
        event.remove(engine, "before_cursor_execute", ghi)
    assert r.status_code == 200 and r2.status_code == 200
    assert r.json()["dem"] == {} and r2.json()["dem"] == {}
    assert [x["ma"] for x in r.json()["items"]] == ["KHO-K1"]
    # GROUP BY sẵn có của dòng (số vị trí cất của kho — `so_vi_tri`) không tính; cấm GROUP BY trên
    # chính bảng danh mục.
    assert not [c for c in cau if "GROUP BY" in c.upper()
                and ("FROM kho_hang" in c or "FROM xe" in c)]
    # Xin rõ thì có.
    assert _dem(_ds(client, t, "/api/kho", q="KHO-K"), "active") == {"true": 1}
