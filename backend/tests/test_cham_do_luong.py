"""Chấm đỏ Lương: đề nghị tạm ứng mới → người duyệt theo phòng; quyết định → người đứng tên."""
from app.models.role import SCOPE_ALL, SCOPE_DEPARTMENT

from .thong_bao_helpers import admin, da_xem, dang_nhap, tao_ho_so, tao_nguoi, tom_tat


def test_tam_ung_moi_va_quyet_dinh(client):
    ha = admin(client)
    nv = tao_nguoi("nv_ung", {}, phong="Phòng A chấm")
    eid = tao_ho_so(client, ha, ten="NV Ứng chấm", phong="Phòng A chấm", user_id=nv)
    tao_nguoi("duyet_all", {"luong": dict(can_read=True, can_approve=True, scope=SCOPE_ALL)})
    tao_nguoi("chi_xem", {"luong": dict(can_read=True, scope=SCOPE_ALL)})
    tao_nguoi("duyet_b", {"luong": dict(can_read=True, can_approve=True, scope=SCOPE_DEPARTMENT)},
              phong="Phòng B chấm")
    r = client.post("/api/luong/advances", json={
        "employee_id": eid, "period_year": 2026, "period_month": 6,
        "advance_date": "2026-06-10", "amount": 1_000_000, "reason": "Ứng",
    }, headers=ha)
    assert r.status_code == 201, r.text
    h = dang_nhap(client, "duyet_all")
    assert tom_tat(client, h)["luong"]["loai"] == "tam_ung_moi"
    assert "luong" not in tom_tat(client, dang_nhap(client, "chi_xem"))
    assert "luong" not in tom_tat(client, dang_nhap(client, "duyet_b"))
    da_xem(client, h, "luong")
    assert "luong" not in tom_tat(client, h)

    ap = client.post(f"/api/luong/advances/{r.json()['id']}/approve", json={}, headers=ha)
    assert ap.status_code == 200, ap.text
    hn = dang_nhap(client, "nv_ung")
    assert tom_tat(client, hn)["luong"]["loai"] == "tam_ung_quyet_dinh"
    da_xem(client, hn, "luong")
    assert "luong" not in tom_tat(client, hn)
