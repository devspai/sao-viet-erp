from app.services.kho_giay import chuan_kho, khoa_dong, khoa_ton, la_khoa_to, nhan_kho


def test_chuan_kho_canh_ngan_truoc_va_lam_tron_mm():
    assert chuan_kho(905, 780) == (780, 905)
    assert chuan_kho("780", 905.4) == (780, 905)
    assert chuan_kho(1000, None) == (1000, 0)
    assert chuan_kho(None, 0) == (0, 0)


def test_khoa_ton_vat_tu_bo_kho_giay_to_giu_kho_cuon_gom_theo_ma():
    assert khoa_ton("vat_tu", 7, kho_rong=780, kho_dai=905) == ("vat_tu", 7, 0, 0)
    assert khoa_ton("giay", 3, dang="to", kho_rong=905, kho_dai=780) == ("giay", 3, 780, 905)
    assert khoa_ton("giay", 3, dang="cuon", kho_rong=1000) == ("giay", 3, 0, 0)
    assert khoa_ton("giay", 3, kho_rong=780, kho_dai=905) == ("giay", 3, 780, 905)
    assert la_khoa_to(("giay", 3, 780, 905)) and not la_khoa_to(("giay", 3, 0, 0))


def test_khoa_dong_cung_ma_khac_kho_la_hai_dong():
    assert khoa_dong("giay", 3, "to", 780, 905) != khoa_dong("giay", 3, "to", 800, 1090)
    assert khoa_dong("giay", 3, "to", 905, 780) == khoa_dong("giay", 3, "to", 780, 905)


def test_nhan_kho():
    assert nhan_kho(780, 905) == "780 × 905 mm"
    assert nhan_kho(1000, 0) == "khổ 1000 mm"
    assert nhan_kho(0, 0) == "chưa có khổ"
