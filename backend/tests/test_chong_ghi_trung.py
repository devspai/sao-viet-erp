"""Mã chứng từ cấp qua bộ đếm (`DocumentSequenceRepository.cap_ma`) — không bao giờ cấp mã đã có.

Kiểu cũ "đếm rồi +1" (PTG, lô) cấp trùng ngay khi một bản ghi bị xoá; kiểu "max rồi +1" (phiếu kỹ
thuật máy) cấp trùng khi hai người tạo cùng lúc hoặc tạo loạt trong một giao dịch chưa flush.
"""
from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import text

from app.models.document_sequence import SEQ_YEAR_GLOBAL, DocumentSequence
from app.models.phieu_tinh_gia import PhieuTinhGia
from app.models.stock_lot import StockLot
from app.repositories.document_sequence_repo import DocumentSequenceRepository, so_lon_nhat
from app.repositories.stock_lot_repo import StockLotRepository
from tests.conftest import phien_da_seed


@pytest.fixture
def db():
    yield from phien_da_seed()


def test_cap_ma_lien_tiep_trong_mot_giao_dich_khong_trung(db):
    repo = DocumentSequenceRepository(db)
    ma = [repo.cap_ma("thu", 2026, PhieuTinhGia.ma, "PTG-2026-") for _ in range(3)]
    assert ma == ["PTG-2026-0001", "PTG-2026-0002", "PTG-2026-0003"]


def test_bo_dem_tu_day_len_tren_ma_lon_nhat_dang_co(db):
    """Dữ liệu sinh trước khi có bộ đếm (hoặc bộ đếm tụt sau vì lý do gì đó): mã kế phải nằm TRÊN
    mã lớn nhất đang có. Dùng chính cột `doc_type` làm "cột mã" để khỏi dựng cả chứng từ thật."""
    from sqlalchemy import text

    for ma in ("PFX-0003", "PFX-0007", "PFX-XX"):
        db.execute(text("INSERT INTO document_sequences (doc_type, year, current_number) "
                        "VALUES (:m, 2026, 0)"), {"m": ma})
    db.execute(text("INSERT INTO document_sequences (doc_type, year, current_number) "
                    "VALUES ('dem-tut', 2026, 2)"))
    assert so_lon_nhat(db, DocumentSequence.doc_type, "PFX-") == 7
    repo = DocumentSequenceRepository(db)
    assert repo.cap_ma("dem-tut", 2026, DocumentSequence.doc_type, "PFX-") == "PFX-0008"
    assert repo.cap_ma("dem-tut", 2026, DocumentSequence.doc_type, "PFX-") == "PFX-0009"


def test_ma_lo_hai_lan_cung_ngay_cung_hang_khac_nhau(db):
    lots = StockLotRepository(db)
    a = lots.next_ma_lo("gy001", date(2026, 9, 28))
    b = lots.next_ma_lo("GY001", date(2026, 9, 28))
    assert a == "LOT-GY001-260928-01"
    assert b == "LOT-GY001-260928-02"
    # Mặt hàng khác, ngày khác: dãy riêng.
    assert lots.next_ma_lo("GY002", date(2026, 9, 28)) == "LOT-GY002-260928-01"
    assert lots.next_ma_lo("GY001", date(2026, 9, 29)) == "LOT-GY001-260929-01"


def test_doc_type_dai_bi_cat_van_ra_ma_khac_nhau(db):
    repo = DocumentSequenceRepository(db)
    dai = "lo:0928:" + "X" * 40
    a = repo.cap_ma(dai + "A", 2026, StockLot.ma_lo, "LOT-" + "X" * 40 + "A-", rong=2)
    b = repo.cap_ma(dai + "B", 2026, StockLot.ma_lo, "LOT-" + "X" * 40 + "B-", rong=2)
    assert a != b


def test_ky_thuat_may_ma_qua_bo_dem_toan_cuc(db):
    from app.repositories.ky_thuat_may_repo import KyThuatMayRepository

    repo = KyThuatMayRepository(db)
    a, b = repo.next_ma_yeu_cau(), repo.next_ma_yeu_cau()
    assert a != b and a < b
    dem = db.execute(
        text("SELECT year FROM document_sequences WHERE doc_type LIKE 'ktm:%'")
    ).scalars().all()
    assert dem and set(dem) == {SEQ_YEAR_GLOBAL}


# --- Yêu cầu kho: bấm "Gửi" lần nữa lúc máy chủ chậm --------------------------------------------
def test_gui_lai_yeu_cau_kho_y_het_tra_lai_yeu_cau_cu(client):
    from tests.test_kho_de_nghi import _login, _setup

    kho_id, mat = _setup(client)
    dn = _login(client, "t_denghi")
    than = {"loai": "XUAT", "kho_id": kho_id,
            "lines": [{"hang_loai": mat[0], "hang_id": mat[1], "dvt": "to", "sl_de_nghi": 7}]}
    a = client.post("/api/kho/de-nghi", headers=dn, json=than)
    b = client.post("/api/kho/de-nghi", headers=dn, json=than)
    assert a.status_code == 201 and b.status_code == 201
    assert a.json()["id"] == b.json()["id"]

    # Khác số lượng là yêu cầu thật thứ hai.
    than["lines"][0]["sl_de_nghi"] = 8
    c = client.post("/api/kho/de-nghi", headers=dn, json=than)
    assert c.status_code == 201 and c.json()["id"] != a.json()["id"]
