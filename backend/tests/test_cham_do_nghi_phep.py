"""Chấm đỏ Nghỉ phép: đơn mới / xin hủy → người duyệt theo phòng; quyết định → người đứng tên."""
from datetime import date, timedelta

from app.models.role import SCOPE_DEPARTMENT, SCOPE_OWN

from .thong_bao_helpers import admin, da_xem, dang_nhap, tao_ho_so, tao_nguoi, tom_tat


def _thu_hai_toi() -> date:
    d = date.today() + timedelta(days=7)
    return d - timedelta(days=d.weekday())


def test_don_moi_quyet_dinh_xin_huy(client):
    ha = admin(client)
    nv = tao_nguoi("nv_nghi", {"nghi_phep": dict(can_read=True, can_create=True, can_cancel=True, scope=SCOPE_OWN)},
                   phong="Phòng A chấm")
    tao_ho_so(client, ha, ten="NV Nghỉ chấm", phong="Phòng A chấm", user_id=nv)
    duyet = dict(can_read=True, can_approve=True, scope=SCOPE_DEPARTMENT)
    tao_nguoi("duyet_a", {"nghi_phep": duyet}, phong="Phòng A chấm")
    tao_nguoi("duyet_b", {"nghi_phep": duyet}, phong="Phòng B chấm")
    loai = client.post("/api/leaves/types", json={"name": "Việc riêng chấm", "is_paid": False,
                                                  "annual_quota": 0}, headers=ha).json()["id"]
    hn, hA, hB = dang_nhap(client, "nv_nghi"), dang_nhap(client, "duyet_a"), dang_nhap(client, "duyet_b")
    t2 = _thu_hai_toi()
    r = client.post("/api/leaves", json={"leave_type_id": loai, "start_date": t2.isoformat(),
                                         "end_date": t2.isoformat(), "reason": "việc nhà"}, headers=hn)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert tom_tat(client, hA)["nghi_phep"]["loai"] == "nghi_phep_moi"
    assert "nghi_phep" not in tom_tat(client, hB)
    da_xem(client, hA, "nghi_phep")

    assert client.post(f"/api/leaves/{rid}/approve", json={}, headers=ha).status_code == 200
    assert tom_tat(client, hn)["nghi_phep"]["loai"] == "nghi_phep_quyet_dinh"
    da_xem(client, hn, "nghi_phep")

    x = client.post(f"/api/leaves/{rid}/xin-huy", json={"ly_do": "xong việc"}, headers=hn)
    assert x.status_code == 200, x.text
    assert tom_tat(client, hA)["nghi_phep"]["loai"] == "nghi_phep_xin_huy"
    assert "nghi_phep" not in tom_tat(client, hn)
