"""Ghi sổ phiếu kho = MỘT commit, và cân đối vật tư toàn xưởng chạy SAU commit (30/09/2026).

Trước đây phần giữ chỗ tự `commit()` GIỮA lúc ghi sổ (`chuyen_dang_ve_sang_kho` khi nhập,
`tieu_thu` khi xuất) ⇒ khoá dòng phiếu bị nhả trong khi phiếu vẫn NHÁP. Lượt `/ghi-so` thứ hai
đang chờ khoá (bấm đúp, mạng chập chờn rồi thử lại) đọc thấy NHÁP và ghi sổ LẦN NỮA: lô nhập đôi,
tồn trừ đôi. Và `nhat_them()` chạy `can_doi()` toàn xưởng ngay trong luồng ghi sổ — docstring
`can_doi_cache` đo 23,8s ở 100k lệnh — trong lúc đó thủ kho đứng chờ, còn `dieu_chinh_xuat`
thì giữ nguyên khoá phiếu + dòng lô suốt thời gian ấy.

SQLite trong bộ test không cho hai giao dịch chen nhau, nên test chấm đúng điều kiện đủ để chặn
ghi đôi: mọi lần commit trong lượt ghi sổ đều thấy phiếu đã `posted`.
"""
from __future__ import annotations

import pytest
from sqlalchemy import event

from app.db import SessionLocal
from app.models.stock_voucher import VOUCHER_POSTED, StockVoucher
from app.services.ke_hoach_vat_tu_service import KeHoachVatTuService

from tests.test_kho_de_nghi import _approved_request, _login, _nhap, _setup


@pytest.fixture
def theo_doi(monkeypatch):
    """`theo_doi(voucher_id)` ⇒ danh sách ghi lại, theo thứ tự: mỗi lần commit (kèm trạng thái phiếu
    lúc đó) và mỗi lần chạy `can_doi`."""
    vet: list[tuple[str, str | None]] = []
    dang_theo: list[int] = []

    def truoc_commit(session):
        if not dang_theo:
            return
        for obj in list(session.identity_map.values()):
            if isinstance(obj, StockVoucher) and obj.id == dang_theo[0]:
                vet.append(("commit", obj.trang_thai))
                return
        vet.append(("commit", None))

    goc = KeHoachVatTuService.can_doi

    def can_doi(self, *a, **kw):
        if dang_theo:
            vet.append(("can_doi", None))
        return goc(self, *a, **kw)

    event.listen(SessionLocal, "before_commit", truoc_commit)
    monkeypatch.setattr(KeHoachVatTuService, "can_doi", can_doi)

    def bat(voucher_id: int):
        dang_theo.append(voucher_id)
        return vet

    yield bat
    event.remove(SessionLocal, "before_commit", truoc_commit)


def _phieu_nhap_nhap(client, *, kho_id, mat_id, qty):
    req = _approved_request(client, kho_id=kho_id, loai="NHAP", mat_id=mat_id, qty=qty, gia=1_000)
    tk = _login(client, "t_thukho")
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": qty}],
    })
    assert r.status_code == 201, r.text
    return r.json()["id"], tk


def test_ghi_so_nhap_khong_commit_khi_phieu_con_nhap(client, theo_doi):
    kho_id, mat_id = _setup(client)
    vid, tk = _phieu_nhap_nhap(client, kho_id=kho_id, mat_id=mat_id, qty=50)
    vet = theo_doi(vid)
    r = client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text
    trang_thai_luc_commit = [tt for loai, tt in vet if loai == "commit" and tt is not None]
    assert trang_thai_luc_commit, vet
    assert all(tt == VOUCHER_POSTED for tt in trang_thai_luc_commit), vet


def test_ghi_so_nhap_chay_can_doi_sau_khi_da_ghi_so(client, theo_doi):
    kho_id, mat_id = _setup(client)
    vid, tk = _phieu_nhap_nhap(client, kho_id=kho_id, mat_id=mat_id, qty=50)
    vet = theo_doi(vid)
    assert client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk).status_code == 200
    assert ("can_doi", None) in vet, "nhặt thêm giữ chỗ vẫn phải chạy sau khi nhập"
    dau_can_doi = vet.index(("can_doi", None))
    assert ("commit", VOUCHER_POSTED) in vet[:dau_can_doi], vet


def test_ghi_so_hai_lan_bi_chan_va_ton_chi_cong_mot_lan(client):
    kho_id, mat_id = _setup(client)
    vid, tk = _phieu_nhap_nhap(client, kho_id=kho_id, mat_id=mat_id, qty=50)
    assert client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk).status_code == 200
    r = client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk)
    assert r.status_code == 400, r.text
    with SessionLocal() as s:
        v = s.get(StockVoucher, vid)
        assert v.trang_thai == VOUCHER_POSTED
        assert sum(1 for ln in v.lines if ln.lot_id) == 1


def test_dieu_chinh_xuat_chay_can_doi_sau_commit(client, theo_doi):
    kho_id, mat_id = _setup(client)
    nhap = _nhap(client, kho_id=kho_id, mat_id=mat_id, qty=100, gia=1_000)
    lot_id = nhap["lines"][0]["lot_id"]
    req = _approved_request(client, kho_id=kho_id, loai="XUAT", mat_id=mat_id, qty=100)
    tk = _login(client, "t_thukho")
    r = client.post("/api/kho/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": req["lines"][0]["id"], "so_luong": 100, "lot_id": lot_id}],
    })
    vid = r.json()["id"]
    r = client.post(f"/api/kho/phieu/{vid}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text
    line_id = r.json()["lines"][0]["id"]

    vet = theo_doi(vid)
    r = client.post(f"/api/kho/phieu/{vid}/dieu-chinh-xuat", headers=tk, json={
        "lines": [{"line_id": line_id, "so_luong_moi": 70}], "ly_do": "dùng không hết",
    })
    assert r.status_code == 200, r.text
    assert ("can_doi", None) in vet
    dau_can_doi = vet.index(("can_doi", None))
    assert any(loai == "commit" for loai, _ in vet[:dau_can_doi]), vet
