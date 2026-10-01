"""Vật tư THEO BƯỚC của phiếu tính giá: engine thế chip vào công thức giá, API lưu/mở lại."""
from __future__ import annotations

from app.services.thanh_phan_engine import compute_phieu
from tests.test_thanh_phan_engine import _buoc, _component, _grp

BA_CHIP = [
    {"ma": "dinh_luong_support", "ten": "Định lượng support", "don_vi": "g/m2"},
    {"ma": "dai_support", "ten": "Dài support", "don_vi": "mm"},
    {"ma": "rong_support", "ten": "Rộng support", "don_vi": "mm"},
]


def _vat_tu_support(**kw):
    return {
        "vat_tu_id": 77, "ten": "Support", "don_gia": 0, "don_vi_gia": "kg",
        "cong_thuc_gia": "dinh_luong_support * dai_support * rong_support",
        "chips": BA_CHIP,
        "gia_tri_chip": {"dinh_luong_support": 2, "dai_support": 3, "rong_support": 4},
        **kw,
    }


def _phieu(vat_tus):
    tp = _component()
    tp["thanh_phams"] = [{**_buoc("Cán màng", "to", "to"), "vat_tus": vat_tus}]
    return compute_phieu(so_luong=1000, thanh_phans=[tp])


def _dong_support(res):
    return [r for r in _grp(res, "nvl")["rows"] if "Support" in r["ten"]]


def test_chip_the_vao_cong_thuc_gia_cua_vat_tu_trong_buoc():
    dong = _dong_support(_phieu([_vat_tu_support()]))
    assert len(dong) == 1
    assert dong[0]["thanh_tien"] == 24          # 2 × 3 × 4
    assert dong[0]["vat_tu_id"] == 77


def test_chip_chua_nhap_so_thi_tinh_0_va_canh_bao():
    res = _phieu([_vat_tu_support(gia_tri_chip={"dai_support": 3})])
    dong = _dong_support(res)
    assert dong[0]["thanh_tien"] == 0
    assert any("chưa nhập số" in w and "Định lượng support" in w for w in res["warnings"])


def test_hai_buoc_cung_dung_mot_vat_tu_ra_hai_dong():
    tp = _component()
    tp["thanh_phams"] = [
        {**_buoc("Cán màng", "to", "to"), "vat_tus": [_vat_tu_support()]},
        {**_buoc("Bế", "to", "to"), "vat_tus": [_vat_tu_support(
            gia_tri_chip={"dinh_luong_support": 1, "dai_support": 1, "rong_support": 1})]},
    ]
    res = compute_phieu(so_luong=1000, thanh_phans=[tp])
    assert sorted(r["thanh_tien"] for r in _dong_support(res)) == [1, 24]


def test_vat_tu_khong_co_cong_thuc_tinh_0_va_canh_bao():
    res = _phieu([_vat_tu_support(cong_thuc_gia=None)])
    assert any("chưa có công thức" in w for w in res["warnings"])
