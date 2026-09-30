"""Chấm đỏ Tăng ca: phiếu mới / xin hủy → người duyệt theo phòng; quyết định → người đứng tên."""
from datetime import date, timedelta

from app.models.role import SCOPE_DEPARTMENT, SCOPE_OWN

from .thong_bao_helpers import admin, da_xem, dang_nhap, tao_ho_so, tao_nguoi, tom_tat


def test_phieu_moi_quyet_dinh_xin_huy(client):
    ha = admin(client)
    nv = tao_nguoi("nv_tc", {"tang_ca": dict(can_read=True, can_create=True, scope=SCOPE_OWN)},
                   phong="Phòng A chấm")
    tao_ho_so(client, ha, ten="NV Tăng ca chấm", phong="Phòng A chấm", user_id=nv)
    duyet = dict(can_read=True, can_approve=True, scope=SCOPE_DEPARTMENT)
    tao_nguoi("duyet_a", {"tang_ca": duyet}, phong="Phòng A chấm")
    tao_nguoi("duyet_b", {"tang_ca": duyet}, phong="Phòng B chấm")
    hn, hA, hB = dang_nhap(client, "nv_tc"), dang_nhap(client, "duyet_a"), dang_nhap(client, "duyet_b")
    d = date.today() + timedelta(days=7)
    ngay = d - timedelta(days=d.weekday())
    r = client.post("/api/overtime/me", json={"work_date": ngay.isoformat(), "from_minute": 1080,
                                              "to_minute": 1200, "reason": "chạy đơn"}, headers=hn)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert tom_tat(client, hA)["tang_ca"]["loai"] == "tang_ca_moi"
    assert "tang_ca" not in tom_tat(client, hB)
    da_xem(client, hA, "tang_ca")

    assert client.post(f"/api/overtime/{rid}/approve", json={}, headers=ha).status_code == 200
    assert tom_tat(client, hn)["tang_ca"]["loai"] == "tang_ca_quyet_dinh"
    da_xem(client, hn, "tang_ca")

    x = client.post(f"/api/overtime/{rid}/xin-huy", json={"ly_do": "Con ốm"}, headers=hn)
    assert x.status_code == 200, x.text
    assert tom_tat(client, hA)["tang_ca"]["loai"] == "tang_ca_xin_huy"
    assert "tang_ca" not in tom_tat(client, hn)
