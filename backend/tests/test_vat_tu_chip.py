import pytest

from app.services.bien_cong_thuc import LOAI_VAT_TU, ma_chip_hop_le, ma_tu_ten_chip
from app.services.thanh_phan_engine import kiem_cong_thuc


def test_ma_tu_ten_bo_dau_va_snake_case():
    assert ma_tu_ten_chip("Định lượng support") == "dinh_luong_support"
    assert ma_tu_ten_chip("  Dài  support (mm) ") == "dai_support_mm"
    assert ma_tu_ten_chip("2 mặt") == "c_2_mat"
    assert ma_tu_ten_chip("!!!") == "chip"


def test_ma_hop_le_chan_trung_bien_he_thong_va_tu_khoa():
    assert ma_chip_hop_le("dai_support")
    assert not ma_chip_hop_le("so_mau")
    assert not ma_chip_hop_le("dinh_luong")
    assert not ma_chip_hop_le("in")
    assert not ma_chip_hop_le("if")
    assert not ma_chip_hop_le("Dai")
    assert not ma_chip_hop_le("2dai")


def test_kiem_cong_thuc_nhan_bien_them_cho_dung_loai():
    kiem_cong_thuc("dai_support * rong_support", nhan="Công thức giá", loai=LOAI_VAT_TU,
                   bien_them=("dai_support", "rong_support"))
    with pytest.raises(ValueError):
        kiem_cong_thuc("dai_support * 2", nhan="Công thức giá", loai=LOAI_VAT_TU)


from tests.test_danh_muc_http_contract import _admin

URL = "/api/vat-lieu-kho/vat-tu-in-an"
BA_CHIP = [
    {"ten": "Định lượng support", "don_vi": "zzgm2"},
    {"ten": "Dài support", "don_vi": "zzmm"},
    {"ten": "Rộng support", "don_vi": "zzmm"},
]
CT_GIA = "dinh_luong_support * dai_support * rong_support"


def _khai_don_vi(client, h):
    for ma, ten in (("zzgm2", "g/m²"), ("zzmm", "mm")):
        r = client.post("/api/don-vi", json={"ma": ma, "ten": ten}, headers=h)
        assert r.status_code in (200, 201, 409, 422), r.text


def _tao(client, h, ma="ZZSUP1", **kw):
    _khai_don_vi(client, h)
    return client.post(URL, json={"ma": ma, "ten": "ZZ Support", **kw}, headers=h)


def test_tao_sinh_ma_chip_tu_ten_va_nhan_hai_cong_thuc(client):
    h = _admin(client)
    r = _tao(client, h, chips=BA_CHIP, cong_thuc_gia=CT_GIA,
             cong_thuc_dinh_muc="dai_support * rong_support / 1000000")
    assert r.status_code in (200, 201), r.text
    assert [c["ma"] for c in r.json()["chips"]] == ["dinh_luong_support", "dai_support", "rong_support"]
    assert r.json()["cong_thuc_dinh_muc"] == "dai_support * rong_support / 1000000"


def test_cong_thuc_dung_chip_chua_khai_bi_chan(client):
    h = _admin(client)
    assert _tao(client, h, cong_thuc_gia="dai_support * 2").status_code in (400, 422)


def test_chip_trung_bien_he_thong_bi_chan(client):
    h = _admin(client)
    r = _tao(client, h, chips=[{"ten": "Số màu"}])
    assert r.status_code in (400, 422) and "so_mau" in r.text


def test_sua_giu_ma_chip_khi_doi_ten(client):
    h = _admin(client)
    vt = _tao(client, h, chips=BA_CHIP, cong_thuc_gia=CT_GIA).json()
    chips = [{"ma": c["ma"], "ten": c["ten"] + " (mới)", "don_vi": c["don_vi"]} for c in vt["chips"]]
    r = client.put(f"{URL}/{vt['id']}", json={"ma": vt["ma"], "ten": vt["ten"], "chips": chips}, headers=h)
    assert r.status_code == 200, r.text
    assert [c["ma"] for c in r.json()["chips"]] == ["dinh_luong_support", "dai_support", "rong_support"]


def test_xoa_chip_dang_dung_trong_cong_thuc_bi_chan(client):
    h = _admin(client)
    vt = _tao(client, h, chips=BA_CHIP, cong_thuc_gia=CT_GIA).json()
    r = client.put(f"{URL}/{vt['id']}", json={"ma": vt["ma"], "ten": vt["ten"], "chips": vt["chips"][:2]}, headers=h)
    assert r.status_code in (400, 422), r.text


def test_put_khong_gui_chips_thi_khong_dung_vao_chip(client):
    h = _admin(client)
    vt = _tao(client, h, chips=BA_CHIP).json()
    r = client.put(f"{URL}/{vt['id']}", json={"ma": vt["ma"], "ten": vt["ten"], "ghi_chu": "x"}, headers=h)
    assert r.status_code == 200 and len(r.json()["chips"]) == 3


def test_clone_mang_chip_theo(client):
    h = _admin(client)
    vt = _tao(client, h, chips=BA_CHIP, cong_thuc_gia=CT_GIA).json()
    r = client.post(f"{URL}/{vt['id']}/clone", headers=h)
    assert r.status_code in (200, 201), r.text
    assert len(r.json()["chips"]) == 3


def test_cong_thuc_dinh_muc_dung_bien_he_thong_cua_buoc(client):
    h = _admin(client)
    r = _tao(client, h, cong_thuc_dinh_muc="sl_vao / 40000")
    assert r.status_code in (200, 201), r.text


def test_don_vi_chip_khong_co_trong_danh_muc_bi_chan_nen_ten_chip(client):
    h = _admin(client)
    r = _tao(client, h, chips=[{"ten": "Dài support", "don_vi": "khong_co_dau"}])
    assert r.status_code in (400, 422), r.text
    assert "Dài support" in r.text and "danh mục" in r.text


def test_don_vi_chip_rong_van_cho_phep_va_go_ten_thi_doi_ra_ma(client):
    h = _admin(client)
    r = _tao(client, h, chips=[{"ten": "Dài support", "don_vi": ""}, {"ten": "Rộng support", "don_vi": "g/m²"}])
    assert r.status_code in (200, 201), r.text
    assert [c["don_vi"] for c in r.json()["chips"]] == [None, "zzgm2"]


def test_chip_cu_go_tay_giu_nguyen_don_vi_thi_sua_ten_van_duoc(client):
    from app.db import SessionLocal
    from app.models.vat_lieu_kho import VatTuChip
    h = _admin(client)
    vt = _tao(client, h, chips=[{"ten": "Dài support", "don_vi": "zzmm"}]).json()
    db = SessionLocal()
    try:
        c = db.query(VatTuChip).filter_by(vat_tu_id=vt["id"]).one()
        c.don_vi = "mm_cu"          # dữ liệu cũ gõ tay, không có trong danh mục
        db.commit()
    finally:
        db.close()
    giu = [{"ma": "dai_support", "ten": "Dài support (mới)", "don_vi": "mm_cu"}]
    r = client.put(f"{URL}/{vt['id']}", json={"ma": vt["ma"], "ten": vt["ten"], "chips": giu}, headers=h)
    assert r.status_code == 200, r.text
    doi = [{"ma": "dai_support", "ten": "Dài support", "don_vi": "mm_khac"}]
    r = client.put(f"{URL}/{vt['id']}", json={"ma": vt["ma"], "ten": vt["ten"], "chips": doi}, headers=h)
    assert r.status_code in (400, 422), r.text
