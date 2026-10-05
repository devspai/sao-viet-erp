from app.models.don_vi_do import TRAM_TO, TRAM_TO_NGUYEN
from app.services.kho_giay import dong_giay_theo_dau_vao

QC = {"kho_nguyen_dai": 1090, "kho_nguyen_rong": 790, "kho_in_dai": 790, "kho_in_rong": 545,
      "so_manh_xa": 2}


def test_buoc_in_nhan_to_in_lay_kho_in():
    d = dong_giay_theo_dau_vao(don_vi_vao=TRAM_TO, so_luong_vao=10520, so_luong_ra=10400,
                               quy_cach=QC, gsm=250)
    assert (d["dang"], d["so_luong"], d["kho_rong"], d["kho_dai"], d["don_vi"]) == \
        ("to", 10520, 545, 790, TRAM_TO)


def test_buoc_cat_to_nhan_to_nguyen_lay_kho_nguyen():
    d = dong_giay_theo_dau_vao(don_vi_vao=TRAM_TO_NGUYEN, so_luong_vao=5260, so_luong_ra=10520,
                               quy_cach=QC, gsm=250)
    assert (d["dang"], d["so_luong"], d["kho_rong"], d["kho_dai"]) == ("to", 5260, 790, 1090)


def test_in_thang_kho_nguyen_khi_kho_in_trong():
    qc = {**QC, "kho_in_dai": 0, "kho_in_rong": 0}
    d = dong_giay_theo_dau_vao(don_vi_vao=TRAM_TO, so_luong_vao=100, so_luong_ra=100,
                               quy_cach=qc, gsm=250)
    assert (d["kho_rong"], d["kho_dai"]) == (790, 1090)


def test_buoc_nhan_cuon_tinh_kg_tu_to_nguyen_ra():
    d = dong_giay_theo_dau_vao(don_vi_vao="cuon", so_luong_vao=1, so_luong_ra=1370,
                               quy_cach=QC, gsm=150)
    assert d["dang"] == "cuon" and d["don_vi"] == "kg"
    assert round(d["so_luong"], 3) == 176.956
    assert (d["kho_rong"], d["kho_dai"]) == (790, 0)


def test_don_vi_vao_trong_hoac_khong_phai_to_cuon_thi_khong_doan():
    for dv in (None, "", "cai", "con", "tay"):
        d = dong_giay_theo_dau_vao(don_vi_vao=dv, so_luong_vao=10, so_luong_ra=10,
                                   quy_cach=QC, gsm=250)
        assert d["so_luong"] is None and d["ly_do"], dv
        assert d["dang"] == "to"      # không bị lật sang cuộn
    assert "chưa khai" in dong_giay_theo_dau_vao(
        don_vi_vao=None, so_luong_vao=1, so_luong_ra=1, quy_cach=QC, gsm=250)["ly_do"]


def test_thieu_kho_thi_khong_doan():
    d = dong_giay_theo_dau_vao(don_vi_vao=TRAM_TO_NGUYEN, so_luong_vao=10, so_luong_ra=10,
                               quy_cach={}, gsm=250)
    assert d["so_luong"] is None and d["ly_do"]


# ---- tầng service: dòng giấy thật trên lệnh thật --------------------------------------------
import pytest

from app.models.cong_doan import CongDoan
from app.models.don_vi_do import DonViDo, DonViQuyDoi
from app.models.lsx import Lsx, LsxCongDoan, LsxCongDoanVatTu
from app.repositories.lsx_repo import LsxRepository
from app.services.lsx_service import LsxService
from tests.conftest import phien_da_seed
from tests.test_ke_hoach_vat_tu import _don, _giay, _may


@pytest.fixture
def db():
    yield from phien_da_seed()


def _svc(db) -> LsxService:
    return LsxService(db, LsxRepository(db), None, None)


def _lenh(db, customer, giay, *, qc=None):
    o = _don(db, customer)
    l = Lsx(ma="L-DG", ten="L-DG", order_id=o.id, order_line_id=o._line.id, so_luong_dat=10_000,
            so_to_nguyen=0, so_con=1, quy_cach_json={"giay_id": giay.id, **(qc or QC)})
    db.add(l)
    db.flush()
    return l


def _buoc(db, lsx, thu_tu, ten, vao, ra, giay, *, cd_vao=None):
    cd = CongDoan(ma=f"CD-DG-{thu_tu}", ten=ten, nhom="print", don_vi_vao=vao, don_vi_ra=ra)
    db.add(cd)
    db.flush()
    b = LsxCongDoan(lsx_id=lsx.id, thu_tu=thu_tu, ten=ten, loai_buoc="may", may_id=_may(db).id,
                    cong_doan_id=cd.id, don_vi_vao=vao, don_vi_ra=ra, so_luong_vao=0, so_luong_ra=0)
    db.add(b)
    db.flush()
    # SỐ RÁC + khổ rác: máy phải ghi đè hết.
    db.add(LsxCongDoanVatTu(lsx_cong_doan_id=b.id, hang_loai="giay", vat_tu_id=giay.id,
                            vat_tu_ma_snapshot=giay.ma, vat_tu_ten_snapshot=giay.ten,
                            don_vi_snapshot="rac", so_luong=1, kho_rong=1, kho_dai=2, thu_tu=0))
    db.flush()
    return b


def _dong_giay(b):
    d = next(v for v in b.vat_tus if v.hang_loai == "giay")
    return (d.dang_giay, float(d.so_luong), d.kho_rong, d.kho_dai, d.don_vi_snapshot)


def test_dong_giay_buoc_cat_va_buoc_in_theo_dau_vao(db):
    from app.models.customer import Customer
    c = Customer(code="KH-DG", name="Khách DG")
    db.add(c)
    db.commit()
    g = _giay(db, ma="C250", gsm=250)
    lsx = _lenh(db, c, g)
    cat = _buoc(db, lsx, 1, "Cắt tờ", TRAM_TO_NGUYEN, TRAM_TO, g)
    in_ = _buoc(db, lsx, 2, "In", TRAM_TO, TRAM_TO, g)
    db.refresh(lsx)
    _svc(db)._ap_chuoi_nguoc(lsx)
    assert float(cat.so_luong_vao) > 0 and float(in_.so_luong_vao) > 0
    assert _dong_giay(cat) == ("to", float(cat.so_luong_vao), 790, 1090, TRAM_TO_NGUYEN)
    assert _dong_giay(in_) == ("to", float(in_.so_luong_vao), 545, 790, TRAM_TO)


def _cuon(db, don_vi_gia, *, quy_doi=True):
    from app.models.customer import Customer
    c = Customer(code=f"KH-{don_vi_gia}", name="Khách cuộn")
    db.add(c)
    db.commit()
    g = _giay(db, ma=f"CU-{don_vi_gia}", gsm=150, don_vi=don_vi_gia)
    lsx = _lenh(db, c, g)
    b = _buoc(db, lsx, 1, "Cắt cuộn", "cuon", TRAM_TO_NGUYEN, g)
    b.so_luong_vao, b.so_luong_ra = 1, 1370
    db.refresh(lsx)
    return lsx, b


def test_buoc_nhan_cuon_don_vi_kg(db):
    lsx, b = _cuon(db, "kg")
    _svc(db)._dong_bo_dong_giay(lsx)
    dang, sl, kr, kd, dv = _dong_giay(b)
    assert (dang, kr, kd, dv) == ("cuon", 790, 0, "kg")
    assert round(sl, 3) == 176.956


def test_buoc_nhan_cuon_don_vi_tan_co_cap_quy_doi(db):
    # Danh mục seed đã có cặp 1 tấn = 1.000 kg; chỉ khẳng định lại để test không dựa vào may rủi.
    tan = db.query(DonViDo).filter(DonViDo.ma == "tan").one()
    kg = db.query(DonViDo).filter(DonViDo.ma == "kg").one()
    cap = db.query(DonViQuyDoi).filter(DonViQuyDoi.tu_id == tan.id, DonViQuyDoi.den_id == kg.id).one()
    assert float(cap.he_so) == 1000
    lsx, b = _cuon(db, "tan")
    _svc(db)._dong_bo_dong_giay(lsx)
    dang, sl, kr, kd, dv = _dong_giay(b)
    assert (dang, dv) == ("cuon", "tan")
    assert round(sl, 6) == 0.176956


def test_buoc_nhan_cuon_thieu_cap_quy_doi_khong_raise(db):
    db.query(DonViQuyDoi).delete()
    db.commit()
    lsx, b = _cuon(db, "tan")
    _svc(db)._dong_bo_dong_giay(lsx)
    # Không đổi được ⇒ giữ NGUYÊN giá trị đã lưu (số rác ban đầu 1), không ghi 0.
    assert _dong_giay(b)[:2] == (None, 1.0)


def test_buoc_khong_tinh_duoc_giu_nguyen_dong_giay_da_luu(db):
    from app.models.customer import Customer
    c = Customer(code="KH-GN", name="Khách giữ")
    db.add(c)
    db.commit()
    g = _giay(db, ma="C250G", gsm=250)
    lsx = _lenh(db, c, g)
    b = _buoc(db, lsx, 1, "Dán", "cai", "cai", g)
    v = b.vat_tus[0]
    v.so_luong, v.kho_rong, v.kho_dai, v.don_vi_snapshot, v.dang_giay = 123, 790, 1090, "to_nguyen", "to"
    b.so_luong_vao = 50
    db.refresh(lsx)
    _svc(db)._dong_bo_dong_giay(lsx)
    assert _dong_giay(b) == ("to", 123.0, 790, 1090, "to_nguyen")
