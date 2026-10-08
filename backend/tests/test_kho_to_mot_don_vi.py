"""Kho/mua đếm giấy tờ bằng MỘT đơn vị "tờ" (mã `to`); mã chặng của lệnh qua cửa kho hệ số 1.

Chủ chốt 07/10/2026 (Mua hàng phương án A): chữ "tờ nguyên / tờ in" chỉ còn ở sản xuất. Tờ nào
khác tờ nào là do KHỔ, nên ở kho và mua hàng chỉ còn một đơn vị `to`. DB riêng trong bộ nhớ.
"""
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
import app.models  # noqa: F401 — đăng ký metadata mọi bảng
from app.models.don_vi_do import TRAM_TO_NGUYEN, DonViDo, DonViQuyDoi
from app.models.vat_lieu_kho import GiayNguyen
from app.repositories.don_vi_do_repo import DonViDoRepository
from app.repositories.vat_lieu_kho_repo import VatLieuKhoRepository
from app.services.kho_giay import DON_VI_TO_KHO, don_vi_goc_to, goi_y_dong_giay, la_ma_to_giay
from app.services.vat_lieu_kho_service import VatLieuKhoService, VatLieuKhoValidationError

# `to_nguyen` còn trong danh mục (mg 0186 đã thêm) nhưng KHÔNG có cặp quy đổi với `to` — mg 0186
# cấm cặp chặng ↔ chặng. Mã chặng qua cửa kho được nhận nhờ luật hệ số 1, không nhờ cặp.
_DV = [("to", "tờ", "to"), ("to_nguyen", "tờ nguyên", "to"), ("ram", "ram", "to"),
       ("kg", "kg", "khoi_luong")]


@pytest.fixture
def db():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False},
                        poolclass=StaticPool)
    Base.metadata.create_all(eng)
    s = sessionmaker(bind=eng)()
    ids = {}
    for ma, ten, ho in _DV:
        d = DonViDo(ma=ma, ten=ten, ho=ho)
        s.add(d)
        s.flush()
        ids[ma] = d.id
    s.add(DonViQuyDoi(tu_id=ids["ram"], den_id=ids["to"], he_so=500))
    s.commit()
    yield s
    s.close()


def _giay(db) -> GiayNguyen:
    g = GiayNguyen(ma="C80", ten="COUCHE 80GSM", gsm=80, don_vi_gia="kg")
    db.add(g)
    db.commit()
    return g


def _svc(db) -> VatLieuKhoService:
    return VatLieuKhoService(VatLieuKhoRepository(db), DonViDoRepository(db))


def test_don_vi_goc_giay_to_la_to():
    assert DON_VI_TO_KHO == "to" and don_vi_goc_to() == "to"
    assert la_ma_to_giay("to_nguyen") and la_ma_to_giay("to") and la_ma_to_giay(" TO ")
    assert not la_ma_to_giay("kg") and not la_ma_to_giay("ram") and not la_ma_to_giay(None)


def test_giay_to_doi_duoc_ram_va_ma_chang(db):
    g = _giay(db)
    svc = _svc(db)
    ra = svc.don_vi_cua_mat_hang("giay", g.id, dang="to")
    assert ra["don_vi_goc"] == "to" and ra["don_vi_goc_ten"] == "tờ" and ra["giay_to"] is True
    assert svc.quy_ve_goc("giay", g.id, "ram", 2, dang="to")["sl_goc"] == 1000
    # mã chặng của dòng giấy lệnh: hệ số 1, lưu về mã kho `to`
    q = svc.quy_ve_goc("giay", g.id, "to_nguyen", 300, dang="to")
    assert q["sl_goc"] == 300 and q["ma_don_vi"] == "to"
    assert svc.he_so_ve_goc(ra, "to_nguyen") == 1.0
    # tờ không bao giờ đổi ra kg
    with pytest.raises(VatLieuKhoValidationError):
        svc.quy_ve_goc("giay", g.id, "kg", 1, dang="to")


def test_ma_chang_khong_lot_qua_hang_khong_phai_giay_to(db):
    """Luật hệ số 1 chỉ cho giấy DẠNG TỜ: giấy cuộn gốc kg vẫn từ chối `to_nguyen`."""
    g = _giay(db)
    with pytest.raises(VatLieuKhoValidationError):
        _svc(db).quy_ve_goc("giay", g.id, "to_nguyen", 10, dang="cuon")


def test_ke_hoach_vat_tu_quy_ma_chang_ve_to(db):
    """Bảng cân đối / đề nghị cấp quy dòng giấy lệnh (`to_nguyen`) về `tờ` của kho, hệ số 1."""
    from app.services.ke_hoach_vat_tu_service import KeHoachVatTuService

    g = _giay(db)
    kh = KeHoachVatTuService(
        db, lsx_repo=None, bai_ghep_repo=None, hang=_svc(db), lots=None, requests=None,
        purchases=None, suppliers=None, don_vi=DonViDoRepository(db),
    )
    assert kh.ve_don_vi_goc("giay", g.id, "to_nguyen", 5_260, dang="to") == (5_260, "tờ")
    assert kh.ve_don_vi_goc("giay", g.id, "to", 120, dang="to") == (120, "tờ")
    assert kh.ve_don_vi_goc("giay", g.id, "ram", 2, dang="to") == (1_000, "tờ")


def test_goi_y_dong_giay_cua_lenh_giu_ma_chang():
    """Dòng giấy của BƯỚC lệnh là dữ liệu sản xuất — giữ mã chặng tờ nguyên."""
    gy = goi_y_dong_giay({"kho_nguyen_rong": 790, "kho_nguyen_dai": 1090, "to_nguyen": 500})
    assert gy["don_vi"] == TRAM_TO_NGUYEN and gy["so_luong"] == 500


def test_migration_0375_them_to_va_doi_dong_kho_mua(db):
    from app.db_migrations import _migrate_kho_mua_dem_to

    # DB cũ chưa có `to` trong danh mục.
    db.execute(text("DELETE FROM don_vi_quy_doi"))
    db.execute(text("DELETE FROM don_vi_do WHERE ma = 'to'"))
    db.execute(text("INSERT INTO suppliers (id, code, name, status, created_at, updated_at) "
                    "VALUES (1, 'NCC1', 'NCC 1', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"))
    for i, (loai, unit) in enumerate([("giay", "to_nguyen"), ("giay", "kg"),
                                      ("vat_tu", "to_nguyen")], start=1):
        db.execute(text(
            "INSERT INTO supplier_items (id, supplier_id, hang_loai, hang_id, item_name, unit, "
            "unit_price, vat_percent, is_active, created_at, updated_at) VALUES "
            "(:i, 1, :loai, 1, 'x', :unit, 0, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"),
            {"i": i, "loai": loai, "unit": unit})
    db.commit()

    _migrate_kho_mua_dem_to(db)
    _migrate_kho_mua_dem_to(db)  # chạy lại vô hại

    to = db.execute(text("SELECT ten, ho FROM don_vi_do WHERE ma = 'to'")).all()
    assert [tuple(r) for r in to] == [("tờ", "to")]
    units = db.execute(text("SELECT id, unit FROM supplier_items ORDER BY id")).all()
    assert [tuple(r) for r in units] == [(1, "to"), (2, "kg"), (3, "to_nguyen")]
