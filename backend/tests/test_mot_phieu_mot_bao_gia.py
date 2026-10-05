"""Một phiếu tính giá chỉ MỘT báo giá + nhân bản phiếu (chủ dự án chốt 04/10/2026).

  - Phiếu đã có báo giá (BẤT KỲ trạng thái, kể cả đã huỷ) ⇒ lập báo giá thứ hai bị 409.
  - `by-phieu` trả báo giá duy nhất đó để màn phiếu mở thay vì lập mới.
  - Nhân bản: mã mới, người lập = người bấm, chép nguyên khách + ghi chú + cây sản phẩm
    (bước, vật tư của bước, chi phí khác); bản sao lập được báo giá riêng.
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.phieu_tinh_gia import (
    PhieuBuocVatTu, PhieuChiPhiKhac, PhieuThanhPham, PhieuThanhPhan, PhieuTinhGia,
)
from app.models.quotation import Quote
from app.models.role import SCOPE_OWN

from tests.khach_phieu_fixtures import gan_khach_phieu
from tests.test_khach_hang_o_ptg import _admin, _h, _khach, _nguoi


def _phieu_day_du(*, created_by: int | None = None) -> int:
    """Phiếu có 1 sản phẩm → 1 bước (kèm 1 vật tư) + 1 chi phí khác."""
    db = SessionLocal()
    try:
        n = db.query(PhieuTinhGia).count() + 1
        p = PhieuTinhGia(ma=f"PTG-NB-{n:04d}", ten_san_pham="Hộp quà", so_luong=500,
                         ghi_chu="Khách cần mẫu trước", ktv="KTV", created_by=created_by)
        tp = PhieuThanhPhan(thu_tu=0, ten="Thân hộp", so_luong=500, loai_thanh_phan="to_roi",
                            dai_thanh_pham=200, rong_thanh_pham=150, nhom_bao_gia="Hộp",
                            phi_giao_hang=300_000, muc_a=["C", "M", "Y", "K"])
        buoc = PhieuThanhPham(thu_tu=0, ten="Bế", don_gia=50, khuon_nguon="lam_moi", phi_khuon=700_000)
        buoc.vat_tus.append(PhieuBuocVatTu(thu_tu=0, vat_tu_id=999, gia_tri_chip={"x": 2}))
        tp.thanh_phams.append(buoc)
        tp.chi_phi_khacs.append(PhieuChiPhiKhac(thu_tu=0, ten="Làm kẽm ngoài", so_tien=800_000))
        p.thanh_phans.append(tp)
        db.add(p)
        db.commit()
        return p.id
    finally:
        db.close()


def _lap_bao_gia(client, t, pid):
    return client.post("/api/quotations", json={"phieu_tinh_gia_id": pid}, headers=_h(t))


# ------------------------------------------------------------------ một phiếu một báo giá
def test_phieu_da_co_bao_gia_thi_khong_lap_them(client):
    t = _admin(client)
    pid = _phieu_day_du()
    gan_khach_phieu(pid)
    r1 = _lap_bao_gia(client, t, pid)
    assert r1.status_code == 201, r1.text
    r2 = _lap_bao_gia(client, t, pid)
    assert r2.status_code == 409, r2.text
    assert r1.json()["code"] in r2.json()["detail"]
    assert "nhân bản" in r2.json()["detail"]


def test_bao_gia_da_huy_van_giu_cho(client):
    t = _admin(client)
    pid = _phieu_day_du()
    gan_khach_phieu(pid)
    qid = _lap_bao_gia(client, t, pid).json()["id"]
    db = SessionLocal()
    try:
        db.get(Quote, qid).status = "cancelled"
        db.commit()
    finally:
        db.close()
    assert _lap_bao_gia(client, t, pid).status_code == 409


def test_by_phieu_tra_bao_gia_duy_nhat_moi_trang_thai(client):
    t = _admin(client)
    pid = _phieu_day_du()
    gan_khach_phieu(pid)
    assert client.get(f"/api/quotations/by-phieu/{pid}", headers=_h(t)).json()["quote_id"] is None
    q = _lap_bao_gia(client, t, pid).json()
    db = SessionLocal()
    try:
        db.get(Quote, q["id"]).status = "cancelled"
        db.commit()
    finally:
        db.close()
    d = client.get(f"/api/quotations/by-phieu/{pid}", headers=_h(t)).json()
    assert d == {"quote_id": q["id"], "quote_number": q["code"]}


# ------------------------------------------------------------------ nhân bản
def test_nhan_ban_chep_nguyen_cau_hinh_khach_va_ghi_chu(client):
    t = _admin(client)
    pid, cid = _phieu_day_du(), _khach()
    gan_khach_phieu(pid, cid)
    r = client.post(f"/api/phieu-tinh-gia/{pid}/nhan-ban", headers=_h(t))
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["id"] != pid
    assert d["ma"].startswith("PTG-") and not d["ma"].startswith("PTG-NB-")
    assert d["ten_san_pham"] == "Hộp quà" and d["so_luong"] == 500
    assert d["ghi_chu"] == "Khách cần mẫu trước"
    assert d["customer_id"] == cid and d["customer_name"] == "Cty Bibica Test"
    assert d["delivery_address"] == "Lô CN4, KCN Quang Minh"
    assert d["contact_name_snapshot"] == "Anh Sơn"

    db = SessionLocal()
    try:
        moi = db.get(PhieuTinhGia, d["id"])
        goc = db.get(PhieuTinhGia, pid)
        assert moi.created_by != goc.created_by or goc.created_by is None
        [tp] = moi.thanh_phans
        assert tp.id != goc.thanh_phans[0].id
        assert (tp.ten, tp.nhom_bao_gia, float(tp.phi_giao_hang), tp.muc_a) == (
            "Thân hộp", "Hộp", 300_000, ["C", "M", "Y", "K"])
        [buoc] = tp.thanh_phams
        assert (buoc.ten, buoc.khuon_nguon, float(buoc.phi_khuon)) == ("Bế", "lam_moi", 700_000)
        [vt] = buoc.vat_tus
        assert (vt.vat_tu_id, vt.gia_tri_chip) == (999, {"x": 2})
        [cp] = tp.chi_phi_khacs
        assert (cp.ten, float(cp.so_tien)) == ("Làm kẽm ngoài", 800_000)
        # Phiếu gốc nguyên vẹn.
        assert len(goc.thanh_phans) == 1 and len(goc.thanh_phans[0].thanh_phams) == 1
    finally:
        db.close()

    nk = client.get(f"/api/phieu-tinh-gia/{d['id']}/activity", headers=_h(t)).json()["items"]
    assert any("Nhân bản" in (i["detail"] or "") and "PTG-NB-" in i["detail"] for i in nk)


def test_ban_sao_lap_duoc_bao_gia_rieng(client):
    t = _admin(client)
    pid = _phieu_day_du()
    gan_khach_phieu(pid)
    assert _lap_bao_gia(client, t, pid).status_code == 201
    moi = client.post(f"/api/phieu-tinh-gia/{pid}/nhan-ban", headers=_h(t)).json()["id"]
    assert client.get(f"/api/quotations/by-phieu/{moi}", headers=_h(t)).json()["quote_id"] is None
    assert _lap_bao_gia(client, t, moi).status_code == 201


def test_nhan_ban_nguoi_lap_la_nguoi_bam(client):
    t, uid = _nguoi("sale-nb", {
        "tinh_gia_thanh": {"scope": SCOPE_OWN, "can_read": True, "can_create": True,
                           "can_view_cost": True},
    })
    pid = _phieu_day_du(created_by=uid)
    r = client.post(f"/api/phieu-tinh-gia/{pid}/nhan-ban", headers=_h(t))
    assert r.status_code == 201, r.text
    db = SessionLocal()
    try:
        assert db.get(PhieuTinhGia, r.json()["id"]).created_by == uid
    finally:
        db.close()


def test_nhan_ban_phieu_ngoai_pham_vi_la_404(client):
    t, _ = _nguoi("sale-nb2", {
        "tinh_gia_thanh": {"scope": SCOPE_OWN, "can_read": True, "can_create": True,
                           "can_view_cost": True},
    })
    pid = _phieu_day_du(created_by=None)
    assert client.post(f"/api/phieu-tinh-gia/{pid}/nhan-ban", headers=_h(t)).status_code == 404


def test_nhan_ban_can_quyen_xem_chi_tiet_gia_von(client):
    t, uid = _nguoi("sale-nb3", {
        "tinh_gia_thanh": {"scope": SCOPE_OWN, "can_read": True, "can_create": True},
    })
    pid = _phieu_day_du(created_by=uid)
    assert client.post(f"/api/phieu-tinh-gia/{pid}/nhan-ban", headers=_h(t)).status_code == 403
