"""Vật tư khác trong kho tách theo ĐƠN VỊ GỐC (mg 0390, spec 2026-10-10-mat-hang-nhieu-don-vi-tinh).

Keo khai kg + thùng: kg và thùng là hai nhóm không quy đổi ⇒ hai lô, hai dòng tồn, xuất thùng chỉ trừ lô
thùng; đơn vị chưa khai ở danh mục bị chặn ngay ở đề nghị. Đi bằng HTTP thật: đề nghị → phiếu → ghi sổ.
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.stock_lot import StockLot
from app.models.vat_lieu_kho import VatTuInAn
from tests.test_kho_de_nghi import _login, _setup
from tests.test_mat_hang_nhieu_don_vi import _don_vi

BASE = "/api/kho"


def _keo(ma: str = "KEO-2DV") -> int:
    db = SessionLocal()
    try:
        m = VatTuInAn(ma=ma, ten=f"Keo {ma}", don_vi_gia="kg", don_vi_them=["thung"])
        db.add(m)
        db.commit()
        return m.id
    finally:
        db.close()


def _dong(vt_id, dvt, sl, gia=None) -> dict:
    d = {"hang_loai": "vat_tu", "hang_id": vt_id, "dvt": dvt, "sl_de_nghi": sl}
    if gia is not None:
        d["don_gia"] = gia
    return d


def _de_nghi(client, kho_id, loai, lines):
    return client.post(f"{BASE}/de-nghi", headers=_login(client, "t_denghi"), json={
        "loai": loai, "kho_id": kho_id, "lines": lines})


def _lo(vt_id) -> dict[str, tuple[float, int]]:
    db = SessionLocal()
    try:
        return {lo.don_vi_goc: (float(lo.sl_con_lai), lo.id) for lo in db.query(StockLot).filter(
            StockLot.hang_loai == "vat_tu", StockLot.hang_id == vt_id).all()}
    finally:
        db.close()


def _nhap_hai_don_vi(client, kho_id, vt) -> None:
    """Một đề nghị hai dòng — cùng mã khác đơn vị gốc là hai dòng hợp lệ — rồi phiếu + ghi sổ."""
    r = _de_nghi(client, kho_id, "NHAP", [_dong(vt, "thung", 2, 300_000), _dong(vt, "kg", 5, 40_000)])
    assert r.status_code == 201, r.text
    req = r.json()
    assert sorted(ln["don_vi_goc"] for ln in req["lines"]) == ["kg", "thung"]
    tk = _login(client, "t_thukho")
    r = client.post(f"{BASE}/phieu", headers=tk, json={
        "request_id": req["id"], "kho_id": kho_id,
        "lines": [{"request_line_id": ln["id"], "so_luong": ln["sl_de_nghi"]} for ln in req["lines"]]})
    assert r.status_code == 201, r.text
    assert sorted(ln["don_vi_goc"] for ln in r.json()["lines"]) == ["kg", "thung"]
    r = client.post(f"{BASE}/phieu/{r.json()['id']}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text


def test_nhap_thung_va_kg_ra_hai_lo_hai_dong_ton(client):
    kho_id, _ = _setup(client)
    _don_vi()
    vt = _keo()
    _nhap_hai_don_vi(client, kho_id, vt)
    lo = _lo(vt)
    assert {k: v[0] for k, v in lo.items()} == {"thung": 2.0, "kg": 5.0}

    # Màn Tồn kho (đường thật): hai dòng, khoá 5 phần mang đơn vị gốc.
    tk = _login(client, "t_thukho")
    r = client.get(f"{BASE}/phieu/lo/ton-nhom", headers=tk, params={"kho_id": kho_id})
    assert r.status_code == 200, r.text
    body = r.json()
    khoa = {n["khoa"] for n in body["nhom"] if n["hang_id"] == vt and n["hang_loai"] == "vat_tu"}
    assert khoa == {f"vat_tu:{vt}:0:0:kg", f"vat_tu:{vt}:0:0:thung"}
    dvt = {(x["don_vi_goc"], x["dvt"], float(x["sl_con_lai"])) for x in body["items"] if x["hang_id"] == vt}
    assert dvt == {("kg", "kg", 5.0), ("thung", "thung", 2.0)}

    # Tồn toàn xưởng theo khoá: hai ô, không cộng lẫn.
    r = client.get(f"{BASE}/phieu/lo/ton-khoa", headers=tk, params={"hang_loai": "vat_tu", "hang_id": vt})
    assert r.status_code == 200, r.text
    assert {x["don_vi_goc"]: x["ton"] for x in r.json()} == {"kg": 5, "thung": 2}

    # Lịch sử một dòng tồn chỉ đọc đúng đơn vị đó.
    r = client.get(f"{BASE}/phieu/mat-hang/vat_tu/{vt}/lich-su", headers=tk,
                   params={"kho_id": kho_id, "goc": "thung"})
    assert r.status_code == 200, r.text
    assert r.json()["on_hand"] == 2 and r.json()["dvt"] == "thung"
    assert [x["id"] for x in r.json()["nhap"]] == [lo["thung"][1]]


def test_xuat_mot_thung_chi_tru_lo_thung(client):
    kho_id, _ = _setup(client)
    _don_vi()
    vt = _keo()
    _nhap_hai_don_vi(client, kho_id, vt)
    lo = _lo(vt)
    tk = _login(client, "t_thukho")

    # Gợi ý lô chỉ lấy lô thùng.
    r = client.get(f"{BASE}/phieu/lo/goi-y", headers=tk, params={
        "hang_loai": "vat_tu", "hang_id": vt, "kho_id": kho_id, "so_luong": 1, "goc": "thung"})
    assert r.status_code == 200, r.text
    assert [x["lot_id"] for x in r.json()["lines"]] == [lo["thung"][1]]

    r = _de_nghi(client, kho_id, "XUAT", [_dong(vt, "thung", 1)])
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["lines"][0]["don_vi_goc"] == "thung"
    body = {"request_id": req["id"], "kho_id": kho_id, "lines": [
        {"request_line_id": req["lines"][0]["id"], "so_luong": 1, "lot_id": lo["kg"][1]}]}
    # Chọn nhầm lô kg cho dòng xin thùng ⇒ chặn.
    r = client.post(f"{BASE}/phieu", headers=tk, json=body)
    assert r.status_code == 400, r.text
    assert "đếm theo “kg”" in r.json()["detail"]
    body["lines"][0]["lot_id"] = lo["thung"][1]
    r = client.post(f"{BASE}/phieu", headers=tk, json=body)
    assert r.status_code == 201, r.text
    r = client.post(f"{BASE}/phieu/{r.json()['id']}/ghi-so", headers=tk)
    assert r.status_code == 200, r.text
    assert {k: v[0] for k, v in _lo(vt).items()} == {"thung": 1.0, "kg": 5.0}


def test_nhap_don_vi_chua_khai_bi_chan(client):
    kho_id, _ = _setup(client)
    _don_vi()
    vt = _keo()
    r = _de_nghi(client, kho_id, "NHAP", [_dong(vt, "to", 3, 1000)])
    assert r.status_code == 400, r.text
    assert "chưa khai ở danh mục" in r.json()["detail"]
    # Tấn thuộc nhóm kg đã khai ⇒ được, gốc kg.
    r = _de_nghi(client, kho_id, "NHAP", [_dong(vt, "tan", 1, 1000)])
    assert r.status_code == 201, r.text
    assert r.json()["lines"][0]["don_vi_goc"] == "kg"
    assert r.json()["lines"][0]["sl_quy_doi"] == 1000
