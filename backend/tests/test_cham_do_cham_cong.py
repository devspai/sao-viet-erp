"""Chấm đỏ Chấm công: phiếu đi muộn/về sớm → người duyệt theo phòng; đổi ca → đích danh người bị đổi."""
from datetime import date, timedelta

from app.models.role import SCOPE_ALL, SCOPE_DEPARTMENT, SCOPE_OWN

from .thong_bao_helpers import admin, da_xem, dang_nhap, tao_ho_so, tao_nguoi, tom_tat


def test_di_muon_moi_theo_phong_va_quyet_dinh(client):
    ha = admin(client)
    nv = tao_nguoi("nv_dm", {"cham_cong": dict(can_read=True, can_create=True, scope=SCOPE_OWN)},
                   phong="Phòng A chấm")
    tao_ho_so(client, ha, ten="NV Đi muộn chấm", phong="Phòng A chấm", user_id=nv)
    tao_nguoi("duyet_a", {"cham_cong": dict(can_read=True, can_approve_late_early=True,
                                            scope=SCOPE_DEPARTMENT)}, phong="Phòng A chấm")
    tao_nguoi("chi_xem", {"cham_cong": dict(can_read=True, scope=SCOPE_ALL)}, phong="Phòng A chấm")
    hn = dang_nhap(client, "nv_dm")
    d = date.today() + timedelta(days=7)
    ngay = d - timedelta(days=d.weekday())
    r = client.post("/api/late-early/me", json={"work_date": ngay.isoformat(), "from_minute": 480,
                                                "to_minute": 540, "reason": "kẹt xe"}, headers=hn)
    assert r.status_code == 201, r.text
    hA = dang_nhap(client, "duyet_a")
    assert tom_tat(client, hA)["cham_cong"]["loai"] == "di_muon_moi"
    assert "cham_cong" not in tom_tat(client, dang_nhap(client, "chi_xem"))

    ap = client.post(f"/api/late-early/{r.json()['id']}/approve", json={}, headers=ha)
    assert ap.status_code == 200, ap.text
    assert tom_tat(client, hn)["cham_cong"]["loai"] == "di_muon_quyet_dinh"


def test_doi_ca_dich_danh_khong_can_quyen_man(client):
    ha = admin(client)
    tho = tao_nguoi("tho_ca", {"khach_hang": dict(can_read=True, scope=SCOPE_OWN)})
    eid = tao_ho_so(client, ha, ten="Thợ đổi ca", phong="Phòng A chấm", user_id=tho)
    ca = client.post("/api/attendance/shifts", json={"name": "Ca chấm", "start_time": "08:00",
                                                     "end_time": "17:00", "is_overnight": False},
                     headers=ha).json()
    r = client.put(f"/api/employees/{eid}/shift",
                   json={"default_shift_id": ca["id"], "effective_from": "2026-11-01"}, headers=ha)
    assert r.status_code == 200, r.text
    h = dang_nhap(client, "tho_ca")
    assert tom_tat(client, h)["cham_cong"]["loai"] == "doi_ca"
    da_xem(client, h, "cham_cong")
    assert tom_tat(client, h) == {}
