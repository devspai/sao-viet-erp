"""Xếp lịch — trải CẢ CỤM lệnh có ràng buộc chéo (mục 5b mockup `xep-lich-A-cai-tien.html`, 08/10/2026).

Hàm thuần, cùng lịch giả với `test_xep_lich_lenh_trai_lich.py`: một ca 06:00-14:00, nghỉ cơm
11:00-12:00, T7 + CN nghỉ. Mốc chung: T6 11/09/2026 08:00.
"""
from __future__ import annotations

from datetime import datetime

import pytest

from app.services.calendar_service import CalendarService
from app.services.xep_lich.trai_lich import CAU_VONG, BuocVao, phan_tach_nghi, trai_cum, trai_lich
from app.services.xep_lich_service import LichXuong


class _Cal(CalendarService):
    def __init__(self):
        pass

    def is_working_day(self, d):
        return d.weekday() < 5


class _Ca:
    def __init__(self, s, e, od=False):
        self.start_minute, self.end_minute, self.is_overnight = s, e, od


@pytest.fixture
def lich():
    return LichXuong(_Cal(), [_Ca(6 * 60, 14 * 60)], nghi=((11 * 60, 12 * 60),))


T6 = datetime(2026, 9, 11, 8, 0)


def _h(gio, phut=0, ngay=11):
    return datetime(2026, 9, ngay, gio, phut)


def test_buoc_cho_moc_lenh_khac_thi_dung_doi_va_ghi_quang_cho(lich):
    buoc = [BuocVao(1, 1, 60), BuocVao(2, 2, 60)]
    kq = trai_lich(T6, buoc, lich, som={2: _h(10)})
    assert kq.buoc[1].cho_tu == _h(9)
    assert kq.buoc[1].bat_dau == _h(10)
    assert kq.ket_thuc == _h(11)
    assert [(c.tu, c.den, c.lsx_cong_doan_id) for c in kq.cho] == [(_h(9), _h(10), 2)]
    assert kq.cho_phut == 60
    assert kq.bat_dau == T6                 # mốc lệnh KHÔNG dời — chỉ bước phải đợi


def test_moc_som_hon_chuoi_cua_lenh_thi_khong_cho(lich):
    buoc = [BuocVao(1, 1, 60), BuocVao(2, 2, 60)]
    kq = trai_lich(T6, buoc, lich, som={2: _h(8, 30)})
    assert kq.cho == []
    assert kq.buoc[1].cho_tu is None
    assert kq.ket_thuc == _h(10)


def test_moc_cho_roi_vao_bua_com_thi_bat_dau_sau_bua(lich):
    buoc = [BuocVao(1, 1, 60), BuocVao(2, 2, 60)]
    kq = trai_lich(T6, buoc, lich, som={2: _h(11, 15)})
    assert kq.buoc[1].bat_dau == _h(12)
    assert kq.cho[0].den == _h(12)


def test_ruot_cho_bia_can_xong_moi_vao_buoc_ghep(lich):
    """Bìa: In 120′ + Cán 60′ ⇒ Cán xong 11:00. Ruột: In 60′ xong 09:00, Ghép phải đợi Cán của bìa.

    11:00 là đầu bữa cơm ⇒ Ghép chạy 12:00-13:00, ruột chờ 09:00→12:00.
    """
    dau_vao = {
        1: (T6, [BuocVao(11, 1, 60), BuocVao(12, 2, 60)]),      # ruột
        2: (T6, [BuocVao(21, 1, 120), BuocVao(22, 2, 60)]),     # bìa
    }
    kq = trai_cum(dau_vao, canh=[(22, 12)], chung=[], lich=lich)
    assert kq[2].ket_thuc == _h(11)
    assert kq[2].cho == []
    ruot = kq[1]
    assert ruot.buoc[1].cho_tu == _h(9)
    assert ruot.buoc[1].bat_dau == _h(12)
    assert ruot.ket_thuc == _h(13)
    assert ruot.cho_phut == 180
    assert CAU_VONG not in ruot.ghi_chu

    pt = phan_tach_nghi(ruot, lich)
    assert pt["cho_lenh_khac_phut"] == 180
    assert pt["nghi_giua_ca_phut"] == 0    # bữa cơm nằm trong quãng chờ, không đếm hai lần
    tong = (ruot.ket_thuc - ruot.bat_dau).total_seconds() / 60
    assert ruot.chay_phut + pt["cho_lenh_khac_phut"] + pt["nghi_giua_ca_phut"] + pt["ngoai_ca_phut"] \
        + pt["ngay_nghi_phut"] + pt["gia_cong_ngoai_phut"] == pytest.approx(tong)


def test_buoc_in_chung_bai_ghep_bat_dau_cung_luc_theo_thanh_vien_muon_nhat(lich):
    """A: Cắt 60′ rồi In chung 120′. B: In chung 120′ ngay đầu. Cả hai in 09:00-11:00, B chờ 1 giờ."""
    dau_vao = {
        1: (T6, [BuocVao(31, 1, 60), BuocVao(32, 2, 120)]),
        2: (T6, [BuocVao(41, 1, 120)]),
    }
    kq = trai_cum(dau_vao, canh=[], chung=[{32, 41}], lich=lich)
    assert kq[1].buoc[1].bat_dau == kq[2].buoc[0].bat_dau == _h(9)
    assert kq[2].cho_phut == 60
    assert kq[1].cho == []
    assert kq[2].ket_thuc == _h(11)


def test_rang_buoc_lan_qua_nhieu_lenh(lich):
    """C đợi bước in chung của A, mà bước đó lại đợi B ⇒ cần nhiều lượt mới đứng yên."""
    dau_vao = {
        1: (T6, [BuocVao(31, 1, 60), BuocVao(32, 2, 120)]),
        2: (_h(8, 30), [BuocVao(41, 1, 120)]),
        3: (T6, [BuocVao(51, 1, 60)]),
    }
    kq = trai_cum(dau_vao, canh=[(32, 51)], chung=[{32, 41}], lich=lich)
    # A sẵn sàng 09:00, B sẵn sàng 08:30 ⇒ in chung 09:00-11:00; C đợi tới 11:00 ⇒ cơm ⇒ 12:00-13:00.
    assert kq[3].buoc[0].bat_dau == _h(12)
    assert kq[3].ket_thuc == _h(13)


def test_lenh_trong_cum_chua_xep_thi_khong_rang_buoc_ai(lich):
    dau_vao = {1: (T6, [BuocVao(11, 1, 60), BuocVao(12, 2, 60)])}
    kq = trai_cum(dau_vao, canh=[(99, 12)], chung=[{12, 98}], lich=lich)
    assert kq[1].cho == []
    assert kq[1].ket_thuc == _h(10)


def test_vong_phu_thuoc_thi_dung_va_ghi_chu_khong_nem_loi(lich):
    """X.a2 → Y.b1 và Y.b2 → X.a1: không bao giờ đứng yên ⇒ dừng sau max_luot, báo trên lệnh."""
    dau_vao = {
        1: (T6, [BuocVao(1, 1, 60), BuocVao(2, 2, 60)]),
        2: (T6, [BuocVao(3, 1, 60), BuocVao(4, 2, 60)]),
    }
    kq = trai_cum(dau_vao, canh=[(2, 3), (4, 1)], chung=[], lich=lich, max_luot=4)
    assert CAU_VONG in kq[1].ghi_chu
    assert CAU_VONG in kq[2].ghi_chu
