"""Sổ tổng hợp công nợ phương án C (11/10/2026): lọc nhanh, phân trang, tab "Đợt còn nợ".

Ba luật:

1. **Lọc nhanh đếm theo bộ lọc, dòng Cộng theo MỌI trang.** `dem_the` đếm trên tập đã qua ô tìm
   nhưng TRƯỚC khi áp chính mục lọc nhanh; `tong` / `tong_aging` cộng mọi dòng khớp, không chỉ
   trang đang xem. `aging` (dải toàn màn) không đổi theo lọc.
2. ⭐ **Tab "Đợt còn nợ" cộng ra ĐÚNG ô tuổi nợ của dòng.** Hai bên đi chung một vòng cấn trừ
   (`_khoan_phai_tra` / `_khoan_phai_thu`), test canh bất biến đó.
3. **Sổ chi tiết cắt trang ở máy chủ, mới nhất lên đầu**; luỹ kế không đổi vì cắt sau khi tính.
"""
from __future__ import annotations

from tests.test_bao_cao_cong_no import _bao_cao, _dong, _ngay
from tests.test_payables_api import (
    _da_mua,
    _dong_dau_tien,
    _don,
    _ghi_dot,
    _headers,
    _phieu_chi,
    _supplier,
)
from tests.test_sales_invoices_api import _invoice_payload, _sales_order


def _get(client, headers, duong: str, **params) -> dict:
    r = client.get(f"/api/accounting/reports/{duong}", params=params, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _ncc_cho_no_0(client, headers, ten: str) -> dict:
    """NCC có `credit_days=0` ⇒ hạn trả đúng bằng ngày hàng về, khỏi cộng trừ."""
    ncc = _supplier(client, headers, name=ten)
    r = client.put(
        f"/api/suppliers/{ncc['id']}",
        json={**{k: ncc[k] for k in
                 ("name", "tax_code", "phone", "email", "address", "contact_name", "supplier_group")},
              "credit_days": 0,
              "items": [{"item_name": "Giấy Duplex", "unit": "tờ", "unit_price": 2200, "vat_percent": 0}]},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return ncc


def _hai_dot(client, headers, ncc_id: int, *, lui_1: int, lui_2: int) -> dict:
    don = _don(client, headers, ncc_id)
    _da_mua(client, headers, don["id"])
    for lui in (lui_1, lui_2):
        _ghi_dot(
            client, headers, don["id"],
            lines=[{"purchase_request_line_id": _dong_dau_tien(don), "quantity": 100}],
            ngay=_ngay(lui),
        )  # 100 × 2.200 = 220.000 mỗi đợt
    return don


def test_loc_nhanh_dem_theo_tim_va_tong_theo_moi_trang(client):
    headers = _headers(client)
    no = _ncc_cho_no_0(client, headers, "NCC LocC No Qua Han")
    _hai_dot(client, headers, no["id"], lui_1=20, lui_2=0)          # một đợt trễ 20 ngày
    truoc = _supplier(client, headers, name="NCC LocC Tra Truoc")
    don = _don(client, headers, truoc["id"], coc=300_000)
    _phieu_chi(client, headers, don["id"], 300_000, stage="advance")  # dư Nợ = trả trước

    tu, den = _ngay(60), _ngay(0)
    tat_ca = _get(client, headers, "payables", tu_ngay=tu, den_ngay=den, q="LocC")
    assert tat_ca["dem_the"] == {"all": 2, "con_no": 1, "qua_han": 1, "tra_truoc": 1}
    assert tat_ca["total"] == 2

    qh = _get(client, headers, "payables", tu_ngay=tu, den_ngay=den, q="LocC", the="qua_han")
    assert [d["ten"] for d in qh["items"]] == ["NCC LocC No Qua Han"]
    assert qh["dem_the"] == tat_ca["dem_the"], "mục lọc nhanh đang chọn không làm đổi số đếm"
    assert qh["tong"]["cuoi_co"] == 440_000
    assert qh["tong_aging"]["d16_30"] == 220_000
    assert qh["tong_aging"]["chua_toi_han"] == 220_000
    assert qh["aging"] == tat_ca["aging"], "dải rổ toàn màn không theo lọc"

    tt = _get(client, headers, "payables", tu_ngay=tu, den_ngay=den, q="LocC", the="tra_truoc")
    assert [d["ten"] for d in tt["items"]] == ["NCC LocC Tra Truoc"]
    assert tt["tong"]["cuoi_no"] == 300_000


def test_phan_trang_giu_tong_cua_moi_dong(client):
    headers = _headers(client)
    for i in range(3):
        ncc = _supplier(client, headers, name=f"NCC TrangC {i}")
        don = _don(client, headers, ncc["id"])
        _da_mua(client, headers, don["id"])
        _ghi_dot(
            client, headers, don["id"],
            lines=[{"purchase_request_line_id": _dong_dau_tien(don), "quantity": 100}],
            ngay=_ngay(1),
        )
    tu, den = _ngay(30), _ngay(0)
    t1 = _get(client, headers, "payables", tu_ngay=tu, den_ngay=den, q="TrangC", page=1, size=2)
    t2 = _get(client, headers, "payables", tu_ngay=tu, den_ngay=den, q="TrangC", page=2, size=2)
    assert (len(t1["items"]), len(t2["items"])) == (2, 1)
    assert t1["total"] == t2["total"] == 3
    assert t1["tong"]["cuoi_co"] == t2["tong"]["cuoi_co"] == 660_000
    assert {d["ten"] for d in t1["items"] + t2["items"]} == {f"NCC TrangC {i}" for i in range(3)}

    khong_size = _get(client, headers, "payables", tu_ngay=tu, den_ngay=den, q="TrangC")
    assert len(khong_size["items"]) == 3, "không gửi size thì trả hết như cũ"


def test_dot_con_no_cong_ra_dung_o_tuoi_no_cua_dong(client):
    """⭐ Bất biến của tab: Σ khoản theo rổ == ô tuổi nợ của chính dòng đó."""
    headers = _headers(client)
    ncc = _ncc_cho_no_0(client, headers, "NCC DotC Con No")
    _hai_dot(client, headers, ncc["id"], lui_1=40, lui_2=3)
    tu, den = _ngay(90), _ngay(0)

    bc = _bao_cao(client, headers, "payables", tu=tu, den=den)
    dong = _dong(bc, "NCC DotC Con No")
    kh = _get(client, headers, "payables/khoan-con-no", tu_ngay=tu, den_ngay=den, doi_tuong_id=ncc["id"])

    assert kh["tong"] == dong["cuoi_co"] == 440_000
    theo_ro: dict[str, int] = {}
    for k in kh["items"]:
        theo_ro[k["ro"]] = theo_ro.get(k["ro"], 0) + k["con_no"]
    for khoa, o in dong["aging"].items():
        assert theo_ro.get(khoa, 0) == o["amount"], f"rổ {khoa} lệch"
    # Trễ lâu nhất lên đầu; số đợt ghi theo đơn.
    assert [k["tre_ngay"] for k in kh["items"]] == [40, 3]
    assert kh["items"][0]["so_ct"].endswith("đợt 1")

    # Tính tại ngày cuối kỳ: kỳ kết thúc 35 ngày trước thì đợt sau chưa về, đợt đầu mới trễ 5 ngày.
    cu = _get(client, headers, "payables/khoan-con-no", tu_ngay=tu, den_ngay=_ngay(35), doi_tuong_id=ncc["id"])
    assert [(k["tre_ngay"], k["ro"]) for k in cu["items"]] == [(5, "d1_7")]


def test_hoa_don_con_no_cua_khach(client):
    headers = _headers(client)
    order_id, kh_id = _sales_order(suffix="KC1", term_days=0)
    r = client.post(
        "/api/accounting/sales-invoices",
        json={**_invoice_payload(order_id, number="70000031", amount=500_000), "invoice_date": _ngay(20)},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    tu, den = _ngay(60), _ngay(0)

    bc = _bao_cao(client, headers, "receivables", tu=tu, den=den)
    dong = next(d for d in bc["items"] if d["doi_tuong_id"] == kh_id)
    kh = _get(client, headers, "receivables/khoan-con-no", tu_ngay=tu, den_ngay=den, doi_tuong_id=kh_id)
    assert kh["tong"] == sum(o["amount"] for o in dong["aging"].values()) == 500_000
    assert [(k["con_no"], k["tre_ngay"], k["ro"]) for k in kh["items"]] == [(500_000, 20, "d16_30")]


def test_so_chi_tiet_cat_trang_moi_nhat_len_dau(client):
    headers = _headers(client)
    ncc = _supplier(client, headers, name="NCC SoC Trang")
    don = _don(client, headers, ncc["id"])
    _da_mua(client, headers, don["id"])
    for lui in (9, 6, 3):
        _ghi_dot(
            client, headers, don["id"],
            lines=[{"purchase_request_line_id": _dong_dau_tien(don), "quantity": 100}],
            ngay=_ngay(lui),
        )
    tu, den = _ngay(30), _ngay(0)
    ca_so = _get(client, headers, "payables/so-chi-tiet", tu_ngay=tu, den_ngay=den, doi_tuong_id=ncc["id"])
    assert [d["ngay"] for d in ca_so["dong"]] == [_ngay(9), _ngay(6), _ngay(3)], "không size: như cũ"
    assert ca_so["so_dong"] == 3

    t1 = _get(client, headers, "payables/so-chi-tiet", tu_ngay=tu, den_ngay=den,
              doi_tuong_id=ncc["id"], page=1, size=2)
    t2 = _get(client, headers, "payables/so-chi-tiet", tu_ngay=tu, den_ngay=den,
              doi_tuong_id=ncc["id"], page=2, size=2)
    assert [d["ngay"] for d in t1["dong"]] == [_ngay(3), _ngay(6)]
    assert [d["ngay"] for d in t2["dong"]] == [_ngay(9)]
    assert t1["dong"][0]["luy_ke_co"] == 660_000, "luỹ kế tính trên cả sổ, cắt sau không đổi"
    assert t1["so_dong"] == t2["so_dong"] == 3
    assert t1["cuoi_co"] == ca_so["cuoi_co"]
