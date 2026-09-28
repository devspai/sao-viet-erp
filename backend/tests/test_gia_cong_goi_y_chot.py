"""Số điền sẵn khi chốt phải theo đơn vị của lần (đầu ra bước cuối), không phải đơn vị gửi đi."""
from types import SimpleNamespace as NS

from app.services.gia_cong_ngoai.lan import _goi_y_chot


def test_quy_to_sang_con_theo_ti_le_dai():
    # Cán màng vào 1.910 tờ … Bế ra 3.820 con (2 con/tờ): gửi 1.660 tờ ⇒ gợi ý 3.320 con.
    gcn = NS(sl_gui=1660, sl_dat=None)
    assert _goi_y_chot(gcn, NS(so_luong_vao=1910), NS(so_luong_ra=3820)) == 3320


def test_thieu_ke_hoach_thi_giu_so_gui():
    gcn = NS(sl_gui=1660, sl_dat=None)
    assert _goi_y_chot(gcn, NS(so_luong_vao=None), NS(so_luong_ra=3820)) == 1660


def test_chua_gui_thi_lay_so_dat():
    assert _goi_y_chot(NS(sl_gui=None, sl_dat=20000), None, None) == 20000
