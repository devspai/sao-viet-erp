"""Xếp lịch — trải THEO CỤM ở lớp service (mục 5b + 7 mockup `xep-lich-A-cai-tien.html`, 08/10/2026).

Hai lệnh thật (đơn → lệnh → sẵn sàng), nối một cạnh phụ thuộc chéo: bước ĐẦU của lệnh B đợi bước
CUỐI của lệnh A. Cả hai đặt cùng một mốc ⇒ B phải đứng chờ tới lúc A xong.
"""
from __future__ import annotations

from datetime import date, datetime

import pytest

from app.models.lsx import LsxCongDoan, LsxCongDoanPhuThuoc
from app.repositories.audit_repo import AuditLogRepository
from app.repositories.xep_lich_lenh_repo import XepLichLenhRepository
from app.services.xep_lich import XepLichLenhService

from tests.test_xep_lich_service import (  # noqa: F401
    _hai_lsx_san_sang,
    _khai_giay_len_buoc_in,
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)

MOC = datetime(2026, 9, 11, 8, 0)


@pytest.fixture
def svc3(db):
    return XepLichLenhService(db, XepLichLenhRepository(db), AuditLogRepository(db))


def _buoc(db, lsx_id):
    return list(db.query(LsxCongDoan).filter(LsxCongDoan.lsx_id == lsx_id)
                .order_by(LsxCongDoan.thu_tu, LsxCongDoan.id))


@pytest.fixture
def cap(db, orders, lsx_svc, admin, customer):
    """(A, B, bước cuối A, bước đầu B) — B.đầu đợi A.cuối."""
    a, b = _hai_lsx_san_sang(db, orders, lsx_svc, admin, customer)
    for l in (a, b):
        _khai_giay_len_buoc_in(db, l.id)
    cuoi_a, dau_b = _buoc(db, a.id)[-1], _buoc(db, b.id)[0]
    db.add(LsxCongDoanPhuThuoc(buoc_truoc_id=cuoi_a.id, buoc_sau_id=dau_b.id))
    db.commit()
    return a, b, cuoi_a, dau_b


def test_cum_lien_thong_chia_dung_cum(db, cap):
    a, b, *_ = cap
    cum = XepLichLenhRepository(db).cum_lien_thong([a.id])
    assert {a.id, b.id} in cum


def test_lenh_sau_dung_cho_lenh_truoc_xong(svc3, cap):
    a, b, cuoi_a, dau_b = cap
    svc3.dat_moc(a.id, MOC)
    svc3.dat_moc(b.id, MOC)
    moc = svc3.moc_cong_doan([a.id, b.id])
    xong_a = {m.lsx_cong_doan_id: m for m in moc[a.id]}[cuoi_a.id].ket_thuc
    vao_b = {m.lsx_cong_doan_id: m for m in moc[b.id]}[dau_b.id]
    assert vao_b.bat_dau >= xong_a           # thẻ việc dưới xưởng nhận giờ đã đợi
    assert vao_b.cho_tu is not None


def test_dong_lich_co_doan_cho_dai_noi_va_cum(svc3, cap):
    a, b, cuoi_a, dau_b = cap
    svc3.dat_moc(a.id, MOC)
    svc3.dat_moc(b.id, MOC)
    ra = svc3.lich(tu=date(2026, 9, 1), den=date(2026, 10, 31))
    dong = {d["lsx_id"]: d for d in ra["dong"]}
    db_, da = dong[b.id], dong[a.id]
    assert db_["cho_phut"] > 0 and db_["cho"][0]["cong_doan_id"] == dau_b.id
    assert db_["cum_id"] == da["cum_id"] is not None
    cho = [x for x in db_["lien"] if x["loai"] == "cho"]
    assert cho and cho[0]["lsx_id_khac"] == a.id and cho[0]["cong_doan_id_khac"] == cuoi_a.id
    assert cho[0]["luc_khac"] <= cho[0]["luc_nay"]
    assert [x["loai"] for x in da["lien"]] == ["doi"]
    assert [c["id"] for c in ra["cum"]] == [db_["cum_id"]]
    assert {x["lsx_id"] for x in ra["cum"][0]["lsx"]} >= {a.id, b.id}
    # Thanh vẫn cộng đủ: chạy + chờ + nghỉ = dài thanh.
    tong = (db_["ket_thuc"] - db_["bat_dau_at"]).total_seconds() / 60
    assert db_["chay_phut"] + db_["cho_phut"] + db_["nghi_ngoai_ca_phut"] == pytest.approx(tong, abs=0.1)


def test_chi_tiet_co_cum_dai_noi_tung_buoc_va_tach_cho(svc3, cap):
    a, b, cuoi_a, dau_b = cap
    svc3.dat_moc(a.id, MOC)
    svc3.dat_moc(b.id, MOC)
    ct = svc3.chi_tiet(b.id)
    assert ct["cum"] and {x["lsx_id"] for x in ct["cum"]["lsx"]} >= {a.id, b.id}
    buoc = {c["id"]: c for c in ct["cong_doans"]}[dau_b.id]
    assert buoc["cho_tu"] is not None and buoc["lien"][0]["loai"] == "cho"
    assert ct["phan_tach_nghi"]["cho_lenh_khac_phut"] == pytest.approx(ct["cho_phut"], abs=0.1)


def test_lenh_kia_chua_xep_thi_khong_cho(svc3, cap):
    a, b, _cuoi_a, dau_b = cap
    svc3.dat_moc(b.id, MOC)
    ct = svc3.chi_tiet(b.id)
    assert ct["cho_phut"] == 0
    buoc = {c["id"]: c for c in ct["cong_doans"]}[dau_b.id]
    assert buoc["lien"] and buoc["lien"][0]["luc_khac"] is None


def test_dat_moc_tra_dong_da_trai_theo_cum(svc3, cap):
    a, b, *_ = cap
    svc3.dat_moc(a.id, MOC)
    d = svc3.dat_moc(b.id, MOC)
    assert d["cho_phut"] > 0 and d["cum_id"] is not None


def test_thu_moc_khop_dat_moc_ma_khong_ghi(db, svc3, cap):
    a, b, *_ = cap
    svc3.dat_moc(a.id, MOC)
    thu = svc3.thu_moc(b.id, MOC)
    assert XepLichLenhRepository(db).theo_lsx(b.id) is None     # xem trước KHÔNG ghi
    d = svc3.dat_moc(b.id, MOC)
    assert (thu["bat_dau"], thu["ket_thuc"]) == (d["bat_dau_at"], d["ket_thuc"])
    assert thu["cho_phut"] == pytest.approx(d["cho_phut"])


def test_dai_noi_mang_gio_cua_buoc_ben_nay(svc3, cap):
    a, b, _cuoi_a, dau_b = cap
    svc3.dat_moc(a.id, MOC)
    d = svc3.dat_moc(b.id, MOC)
    cho = [x for x in d["lien"] if x["loai"] == "cho"][0]
    assert cho["bat_dau_nay"] == cho["luc_nay"] and cho["ket_thuc_nay"] > cho["bat_dau_nay"]


def test_lich_loc_o_may_chu_va_dem_loc_nhanh(svc3, cap):
    a, b, *_ = cap
    svc3.dat_moc(a.id, MOC)
    svc3.dat_moc(b.id, MOC)
    tu, den = date(2026, 9, 1), date(2026, 10, 31)
    tat_ca = svc3.lich(tu=tu, den=den)
    assert tat_ca["dem"]["chua"] == len(tat_ca["dong"]) >= 2   # cả hai có lịch, chưa phát hành
    chi_a = svc3.lich(tu=tu, den=den, tim=a.ma.lower())
    assert [d["lsx_id"] for d in chi_a["dong"]] == [a.id]
    assert svc3.lich(tu=tu, den=den, trang_thai=["da_phat_hanh"])["dong"] == []
    assert svc3.lich(tu=tu, den=den, nhanh="tre")["tong"] == tat_ca["dem"]["tre"]
    assert all("_khach_id" not in d for d in tat_ca["dong"])
