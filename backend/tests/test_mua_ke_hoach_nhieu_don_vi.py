"""Mua hàng + kế hoạch vật tư khi mã khai NHIỀU đơn vị tính (spec 2026-10-10-mat-hang-nhieu-don-vi-tinh).

* So giá NCC của VẬT TƯ KHÁC khai kg + thùng: dòng giá cùng nhóm với ĐVT đang mua `cung_ho=True`,
  khác nhóm xếp sau — y luật của giấy (tờ ↔ kg), chỉ không có khổ.
* Cân đối: vật tư cần theo kg ở lệnh này, theo thùng ở lệnh kia là HAI nhóm; tồn nhóm kia bày
  cạnh (`cung_kho_khac_don_vi`), máy không trừ chéo.
* Nhu cầu ra đơn vị mã CHƯA khai (tờ của giấy chỉ khai kg) ⇒ `don_vi_chua_khai`, lập mua bị chặn.
"""
from __future__ import annotations

from itertools import count

import pytest

from app.db import SessionLocal
from app.models.kho_hang import KhoHang
from app.models.stock_lot import LOT_AVAILABLE, StockLot
from app.models.vat_lieu_kho import GiayNguyen, VatTuInAn
from app.services.ke_hoach_vat_tu_service import KeHoachVatTuValidationError
from tests.test_danh_muc_http_contract import _admin
from tests.test_ke_hoach_vat_tu import (  # noqa: F401 - fixture dùng lại
    HOM_NAY, MAI, _buoc_dau, _giay, _khai_vat_tu, _lenh, customer, db, svc,
)
from tests.test_mat_hang_nhieu_don_vi import _don_vi

VT = "/api/vat-lieu-kho/vat-tu-in-an"
_dem = count(1)


# --- so giá NCC ---------------------------------------------------------------


def _ncc(client, h, ten: str, items: list[dict]):
    r = client.post("/api/suppliers", headers=h, json={
        "name": ten, "tax_code": f"03{next(_dem):08d}", "phone": "0900000000",
        "email": f"ncc{next(_dem)}@x.vn", "address": "HN", "contact_name": "A",
        "supplier_group": "vat_tu", "items": items,
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_so_gia_vat_tu_kg_va_thung_cung_ho_theo_nhom_da_khai(client):
    h = _admin(client)
    _don_vi()
    r = client.post(VT, json={"ma": "ZZKEO-SG", "ten": "Keo SG", "don_vi_gia": "kg",
                              "don_vi_them": ["thung"]}, headers=h)
    assert r.status_code in (200, 201), r.text
    vt = r.json()

    def dong(unit, gia):
        return {"hang_loai": "vat_tu", "hang_id": vt["id"], "item_name": "Keo SG",
                "unit": unit, "unit_price": gia, "vat_percent": 8}

    _ncc(client, h, "Keo Bắc", [dong("kg", 50_000), dong("thung", 900_000)])
    _ncc(client, h, "Keo Nam", [dong("tan", 40_000_000)])

    r = client.get("/api/supplier-items/so-gia", headers=h, params={
        "hang_loai": "vat_tu", "hang_id": vt["id"], "don_vi": "thung"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["don_vi_goc"] == "thung"
    assert [(x["supplier_name"], x["unit"], x["don_vi_goc"], x["cung_ho"], x["gia_quy_doi"])
            for x in body["items"]] == [
        ("Keo Bắc", "thung", "thung", True, 900_000),
        # Khác nhóm (kg) ⇒ xếp sau, trong nhóm vẫn theo giá quy về kg.
        ("Keo Nam", "tan", "kg", False, 40_000),
        ("Keo Bắc", "kg", "kg", False, 50_000),
    ]

    r = client.get("/api/supplier-items/so-gia", headers=h, params={
        "hang_loai": "vat_tu", "hang_id": vt["id"], "don_vi": "kg"})
    body = r.json()
    assert body["don_vi_goc"] == "kg"
    assert [(x["unit"], x["cung_ho"]) for x in body["items"]] == [
        ("tan", True), ("kg", True), ("thung", False)]


# --- cân đối ------------------------------------------------------------------


def _vat_tu_hai_dv(db) -> VatTuInAn:
    _don_vi()
    vt = VatTuInAn(ma="VT-KEO2", ten="Keo hai đơn vị", don_vi_gia="kg", don_vi_them=["thung"])
    db.add(vt)
    db.commit()
    return vt


def _lo(db, loai, hid, sl, goc, kho=(0, 0)) -> None:
    k = db.query(KhoHang).first()
    if k is None:
        k = KhoHang(ma="K1", ten="Kho test")
        db.add(k)
        db.flush()
    db.add(StockLot(hang_loai=loai, hang_id=hid, kho_id=k.id, ma_lo=f"LOT-{loai}-{hid}-{goc}-{sl}",
                    sl_ban_dau=sl, sl_con_lai=sl, ngay_nhap=HOM_NAY, trang_thai=LOT_AVAILABLE,
                    don_vi_goc=goc, kho_rong=kho[0], kho_dai=kho[1]))
    db.commit()


def test_can_doi_vat_tu_hai_don_vi_hai_nhom_bay_canh_nhau(db, svc, customer):
    g = _giay(db)
    vt = _vat_tu_hai_dv(db)
    a = _lenh(db, customer, ma="LSX-KG", giay_id=g.id, so_to_nguyen=100, han=MAI, giay_o_buoc=False)
    b = _lenh(db, customer, ma="LSX-TH", giay_id=g.id, so_to_nguyen=100, han=MAI, giay_o_buoc=False)
    _khai_vat_tu(db, _buoc_dau(db, a), vt, 20, dvt="kg")
    _khai_vat_tu(db, _buoc_dau(db, b), vt, 3, dvt="thung")
    _lo(db, "vat_tu", vt.id, 5, "kg")
    _lo(db, "vat_tu", vt.id, 1, "thung")

    nhom = {x["don_vi_goc"]: x for x in svc.can_doi()["items"]
            if (x["hang_loai"], x["hang_id"]) == ("vat_tu", vt.id)}
    assert set(nhom) == {"kg", "thung"}
    kg, th = nhom["kg"], nhom["thung"]
    assert [d["ma"] for d in kg["dong"]] == ["LSX-KG"]
    assert [d["ma"] for d in th["dong"]] == ["LSX-TH"]
    # Mỗi nhóm chỉ ăn tồn đúng đơn vị của nó — 1 thùng không bù cho 20 kg.
    assert (kg["ton"], kg["tong_can"], kg["dong"][0]["thieu"]) == (5, 20, 15)
    assert (th["ton"], th["tong_can"], th["dong"][0]["thieu"]) == (1, 3, 2)
    # Số của nhóm kia bày cạnh, không trừ.
    assert [(x["don_vi_goc"], x["ton"]) for x in kg["cung_kho_khac_don_vi"]] == [("thung", 1)]
    assert [(x["don_vi_goc"], x["ton"]) for x in th["cung_kho_khac_don_vi"]] == [("kg", 5)]
    assert not kg["don_vi_chua_khai"] and not th["don_vi_chua_khai"]

    # Lập mua dòng thùng ⇒ dòng yêu cầu mua mang đúng đơn vị thùng.
    gom = svc.gom_de_nghi([{"hang_loai": "vat_tu", "hang_id": vt.id, "don_vi_goc": "thung",
                            "lsx_id": b.id, "bai_ghep_id": None,
                            "buoc_id": _buoc_dau(db, b).id}])
    assert [(x["unit"], x["quantity"]) for x in gom["lines"]] == [("thung", 2)]


def test_nhu_cau_to_cua_giay_chi_khai_kg_bao_chua_khai_va_chan_lap_mua(db, svc, customer):
    _don_vi()
    g = GiayNguyen(ma="GY-CHIKG", ten="Giấy chỉ kg", gsm=150, kho_dai=860, kho_rong=650,
                   don_vi_gia="kg", don_vi_them=None)
    db.add(g)
    db.commit()
    l = _lenh(db, customer, ma="LSX-TO", giay_id=g.id, so_to_nguyen=1_000, han=MAI)

    nhom = next(x for x in svc.can_doi()["items"]
                if (x["hang_loai"], x["hang_id"]) == ("giay", g.id))
    assert nhom["don_vi_goc"] == "to"
    assert nhom["don_vi_chua_khai"] is True
    assert nhom["ly_do_chua_khai"] == "Chưa khai đơn vị “tờ” ở danh mục Giấy cho “Giấy chỉ kg”."
    assert nhom["dong"][0]["don_vi_chua_khai"] is True

    with pytest.raises(KeHoachVatTuValidationError, match="Chưa khai đơn vị “tờ” ở danh mục Giấy"):
        svc.gom_de_nghi([{"hang_loai": "giay", "hang_id": g.id, "kho_rong": 780, "kho_dai": 905,
                          "don_vi_goc": "to", "lsx_id": l.id, "bai_ghep_id": None,
                          "buoc_id": _buoc_dau(db, l).id}])


def test_schema_can_doi_giu_co_chua_khai():
    """Pydantic nuốt field im lặng nếu schema thiếu — giữ chắc hai cờ đi tới FE."""
    from app.schemas.ke_hoach_vat_tu import CanDoiDong, CanDoiNhom, LuoiDong, LuoiHang

    for m in (CanDoiNhom, CanDoiDong, LuoiDong, LuoiHang):
        assert "don_vi_chua_khai" in m.model_fields, m
    for m in (CanDoiNhom, LuoiDong, LuoiHang):
        assert "ly_do_chua_khai" in m.model_fields, m
