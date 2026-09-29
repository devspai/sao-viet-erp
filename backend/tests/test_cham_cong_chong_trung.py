"""Chấm công không ghi sai khi bấm lại (A5 — docs/audit-suc-chiu-tai-2026-09-28.md).

Giờ cao điểm 200 người cùng chấm, máy chủ chậm ⇒ người ta bấm lại, hoặc bấm đúp. Trước đây lượt thứ
hai được hiểu là "RA" ngay sau "VÀO" — cả ngày công sai. Nay lượt hợp lệ trong 90 giây gần nhất được
trả lại nguyên như cũ, không ghi thêm.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import update

from app.db import SessionLocal
from app.models.attendance import AttendanceLog
from tests.test_attendance_api import _admin_token, _h, _link_admin_employee, _make_location

TAI_XUONG = {"latitude": 10.0, "longitude": 106.0}


def _logs(client, token) -> list[dict]:
    return client.get("/api/attendance/me/logs", headers=_h(token)).json()["items"]


def test_bam_lai_ngay_chi_ghi_mot_luot_vao(client):
    token = _admin_token(client)
    _make_location(client, token)
    _link_admin_employee(client, token)

    r1 = client.post("/api/attendance/check", json=TAI_XUONG, headers=_h(token)).json()
    r2 = client.post("/api/attendance/check", json=TAI_XUONG, headers=_h(token)).json()

    assert r1["success"] and r1["check_type"] == "in"
    # Lượt bấm lại KHÔNG thành RA: trả lại đúng lượt VÀO vừa ghi.
    assert r2["success"] and r2["check_type"] == "in"
    assert r2["log"]["id"] == r1["log"]["id"]
    assert "đã chấm VÀO" in r2["message"]
    logs = _logs(client, token)
    assert [l["check_type"] for l in logs] == ["in"]
    # /me/logs vẫn mang tên người (thôi gọi cả my_status chỉ để lấy tên).
    assert logs[0]["employee_name"] == "NV Admin"


def test_qua_90_giay_thi_luot_sau_la_ra(client):
    token = _admin_token(client)
    _make_location(client, token)
    _link_admin_employee(client, token)

    r1 = client.post("/api/attendance/check", json=TAI_XUONG, headers=_h(token)).json()
    # Lùi lượt VÀO về 2 phút trước — như người thật vào ca rồi lát sau mới bấm RA.
    db = SessionLocal()
    try:
        log = db.get(AttendanceLog, r1["log"]["id"])
        db.execute(update(AttendanceLog).where(AttendanceLog.id == log.id)
                   .values(checked_at=log.checked_at - timedelta(seconds=120)))
        db.commit()
    finally:
        db.close()

    r2 = client.post("/api/attendance/check", json=TAI_XUONG, headers=_h(token)).json()
    assert r2["success"] and r2["check_type"] == "out"
    assert sorted(l["check_type"] for l in _logs(client, token)) == ["in", "out"]


def test_luot_ngoai_vung_khong_chan_luot_sau(client):
    """Bấm ngoài vùng không ghi gì ⇒ không có gì để "trả lại"; đi vào vùng bấm tiếp là VÀO thật."""
    token = _admin_token(client)
    _make_location(client, token)
    _link_admin_employee(client, token)

    xa = client.post("/api/attendance/check", json={"latitude": 11.0, "longitude": 107.0},
                     headers=_h(token)).json()
    assert xa["success"] is False
    r = client.post("/api/attendance/check", json=TAI_XUONG, headers=_h(token)).json()
    assert r["success"] and r["check_type"] == "in"
    assert len(_logs(client, token)) == 1
