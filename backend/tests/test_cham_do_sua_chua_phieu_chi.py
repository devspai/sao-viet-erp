"""Chấm đỏ Sửa chữa máy (báo hỏng → tổ sửa chữa) + Phiếu chi (gia công chốt → người lập phiếu chi)."""
from app.db import SessionLocal
from app.models.may_thiet_bi import MayThietBi
from app.models.role import SCOPE_ALL, SCOPE_OWN
from app.models.user import User
from app.routers.gia_cong_ngoai import _phat_cho_chi

from .thong_bao_helpers import dang_nhap, tao_nguoi, tom_tat


def test_bao_hong_moi_toi_to_sua_chua(client):
    db = SessionLocal()
    try:
        m = MayThietBi(ma="MAY-CHAM", ten="Máy chấm", loai_may="Bế")
        db.add(m)
        db.commit()
        may_id = m.id
    finally:
        db.close()
    tao_nguoi("tho_sua", {"ky_thuat_may": dict(can_read=True, can_update=True, scope=SCOPE_ALL)})
    tao_nguoi("nguoi_bao", {"ky_thuat_may": dict(can_read=True, can_request=True, scope=SCOPE_OWN)})
    hb = dang_nhap(client, "nguoi_bao")
    r = client.post("/api/ky-thuat-may/yeu-cau", json={"may_id": may_id, "bo_phan_hong": "Dao bế"},
                    headers=hb)
    assert r.status_code == 201, r.text
    tt = tom_tat(client, dang_nhap(client, "tho_sua"))
    assert tt["ky_thuat_may"]["loai"] == "bao_hong_moi"
    assert "ky_thuat_may" not in tom_tat(client, hb)


def test_gia_cong_chot_bao_nguoi_lap_phieu_chi(client):
    tao_nguoi("ke_toan_chi", {"phieu_chi": dict(can_read=True, can_create=True, scope=SCOPE_ALL)})
    tao_nguoi("chi_xem_chi", {"phieu_chi": dict(can_read=True, scope=SCOPE_ALL)})
    db = SessionLocal()
    try:
        admin = db.query(User).filter_by(username="admin").one()
        _phat_cho_chi({"gia_cong_ngoai_id": 77, "lsx_ma": "LSX-1"}, admin, db)
    finally:
        db.close()
    tt = tom_tat(client, dang_nhap(client, "ke_toan_chi"))
    assert tt["phieu_chi"]["loai"] == "gia_cong_cho_chi" and tt["phieu_chi"]["ma"] == "77"
    assert "phieu_chi" not in tom_tat(client, dang_nhap(client, "chi_xem_chi"))
