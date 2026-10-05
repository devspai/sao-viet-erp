"""Dọn tệp mồ côi (30/09/2026) — xem `app/services/don_tep_mo_coi.py`. Sai ở đây là mất tệp thật."""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import pytest

from app.db import SessionLocal
from app.models.noi_quy import NoiQuyVersion
from app.models.user import User
from app.services import don_tep_mo_coi as dtmc
from app.storage import LocalStorage

_CU = time.time() - 30 * 24 * 3600  # 30 ngày trước


@pytest.fixture
def kho(tmp_path):
    return LocalStorage(root=tmp_path)


def _ghi(kho: LocalStorage, key: str, *, cu: bool = True) -> None:
    kho.save(key, b"x")
    if cu:
        os.utime(kho._path(key), (_CU, _CU))


def _nen(kho: LocalStorage, n: int = 20) -> list[str]:
    """Object CÓ người trỏ tới — đủ nhiều để lượt dọn không vấp chốt tỉ lệ 20%."""
    khoa = [f"avatars/nen_{i}.png" for i in range(n)]
    for k in khoa:
        _ghi(kho, k)
    with SessionLocal() as db:
        for i, k in enumerate(khoa):
            db.add(NoiQuyVersion(noi_dung=f'<p>ảnh {i}</p><img src="/api/files/{k}">'))
        db.commit()
    return khoa


def _chay(kho, **kw):
    with SessionLocal() as db:
        return dtmc.don_tep_mo_coi(db, kho, **kw)


def test_xoa_object_khong_ai_tro_toi_va_giu_moi_thu_con_lai(client, kho):
    nen = _nen(kho)
    _ghi(kho, "avatars/admin.png")
    _ghi(kho, "crm/1/cu.png")                       # /static/ đời cũ vẫn là tham chiếu
    _ghi(kho, "kho/1/mo-coi.pdf")                    # không ai trỏ ⇒ xoá
    _ghi(kho, "kho/1/vua-tai.pdf", cu=False)         # mồ côi nhưng mới ⇒ giữ
    _ghi(kho, "_thumb/w160/avatars/admin.png.jpg")   # gốc còn ⇒ giữ
    _ghi(kho, "_thumb/w160/kho/1/da-xoa.jpg.jpg")    # gốc mất ⇒ xoá
    with SessionLocal() as db:
        admin = db.query(User).filter_by(username="admin").one()
        admin.avatar_url = "/api/files/avatars/admin.png"
        db.add(NoiQuyVersion(noi_dung='<img src="/static/crm/1/cu.png" alt="">'))
        db.commit()

    kq = _chay(kho)

    assert sorted(kq.da_xoa) == ["_thumb/w160/kho/1/da-xoa.jpg.jpg", "kho/1/mo-coi.pdf"]
    con = {k for k, _ in kho.liet_ke()}
    assert "kho/1/mo-coi.pdf" not in con
    assert {"avatars/admin.png", "crm/1/cu.png", "kho/1/vua-tai.pdf",
            "_thumb/w160/avatars/admin.png.jpg", *nen} <= con


def test_qua_ti_le_an_toan_thi_khong_xoa_gi(client, kho):
    _nen(kho, 3)
    for i in range(5):
        _ghi(kho, f"kho/1/rac_{i}.pdf")
    kq = _chay(kho)
    assert kq.bo_qua == "quá tỉ lệ an toàn" and kq.da_xoa == []
    assert len(list(kho.liet_ke())) == 8


def test_doc_tham_chieu_loi_thi_bo_luot(client, kho, monkeypatch):
    _ghi(kho, "kho/1/mo-coi.pdf")

    def hong(db):
        raise RuntimeError("mất kết nối giữa chừng")

    monkeypatch.setattr(dtmc, "tap_tham_chieu", hong)
    kq = _chay(kho)
    assert kq.bo_qua == "đọc tham chiếu lỗi" and kq.da_xoa == []
    assert kho.ton_tai("kho/1/mo-coi.pdf")


def test_tran_moi_luot(client, kho, monkeypatch):
    _nen(kho, 40)
    for i in range(5):
        _ghi(kho, f"kho/1/rac_{i}.pdf")
    monkeypatch.setattr(dtmc, "TRAN_MOI_LUOT", 2)
    assert len(_chay(kho).da_xoa) == 2
    assert len(_chay(kho).da_xoa) == 2


def test_quet_ca_cot_json_va_chu_dai_cua_moi_bang(client):
    """Tập tham chiếu đọc từ MỌI cột chữ/JSON đủ dài — cột lưu tệp mới thêm sau tự được tính."""
    cot = {(b.name, c.name) for b in dtmc.Base.metadata.sorted_tables
           for c in dtmc._cot_co_the_chua_tep(b)}
    assert ("users", "avatar_url") in cot
    assert ("noi_quy_versions", "noi_dung") in cot
    assert ("san_xuat_kcs_loi_anh", "file_url") in cot
    assert ("quote_items", "anh_minh_hoa") in cot


def test_chi_chay_voi_minio(client, monkeypatch):
    from app import don_dinh_ky

    goi = []
    monkeypatch.setattr("app.services.don_tep_mo_coi.don_tep_mo_coi", lambda *a, **k: goi.append(1))
    don_dinh_ky._mot_luot_don_tep()  # test chạy LocalStorage
    assert goi == []


def test_ten_tep_co_dau_cach_va_dau_tieng_viet_van_la_tham_chieu():
    """ĐÃ BẮT THẬT trên dữ liệu dev: đính kèm lệnh SX lưu `…_Anh thu lai.png` (dấu cách thật, không
    mã hoá) — bản đầu cắt khoá ở dấu cách nên xếp 5 tệp đang dùng vào diện mồ côi."""
    uv = dtmc._ung_vien("/api/files/san-xuat/lsx/1/21b63ac6_Anh thu lai.png")
    assert "san-xuat/lsx/1/21b63ac6_Anh thu lai.png" in uv
    uv = dtmc._ung_vien('<p>xem /static/hr/9/a b.pdf, và <img src="/api/files/noi-quy/x/Ảnh%20mẫu.png"></p>')
    assert {"hr/9/a b.pdf", "noi-quy/x/Ảnh%20mẫu.png"} <= uv
    uv = dtmc._ung_vien('[{"file_url": "/api/files/san-xuat/kcs-loi/28/79a448ae_chup-bavia-1.jpg"}]')
    assert "san-xuat/kcs-loi/28/79a448ae_chup-bavia-1.jpg" in uv
