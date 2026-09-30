"""Chấm đỏ Khách hàng (hẹn được giao / tới hạn) + Phiếu bảo trì tới hạn — mỗi việc MỘT dòng."""
from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.module_notification import ModuleNotification
from app.models.role import SCOPE_OWN

from .test_customer_crm_survey import _create
from .thong_bao_helpers import admin, dang_nhap, da_xem, tao_nguoi, tom_tat


def _dem(kenh: str) -> int:
    db = SessionLocal()
    try:
        return db.query(ModuleNotification).filter_by(channel=kenh).count()
    finally:
        db.close()


def test_hen_cham_soc_duoc_giao_va_toi_han(client):
    from app.care_reminders import _scan_once

    ha = admin(client)
    sale = tao_nguoi("sale_cs", {"khach_hang": dict(can_read=True, scope=SCOPE_OWN)})
    cid = _create(client, ha["Authorization"].split()[1], name="Cty Chấm", sale_user_id=sale)["customer"]["id"]
    now = datetime.now(timezone.utc)
    r = client.post(f"/api/customers/{cid}/care-tasks", json={"note": "Gọi", "due_date": now.isoformat()},
                    headers=ha)
    assert r.status_code == 201, r.text
    hs = dang_nhap(client, "sale_cs")
    assert tom_tat(client, hs)["khach_hang"]["loai"] == "cham_soc_duoc_giao"
    da_xem(client, hs, "khach_hang")

    _scan_once(now - timedelta(minutes=1), now + timedelta(minutes=1))
    _scan_once(now - timedelta(minutes=1), now + timedelta(minutes=1))
    assert tom_tat(client, hs)["khach_hang"]["loai"] == "cham_soc_den_han"
    assert _dem("khach_hang") == 2        # một "được giao" + MỘT "tới hạn" dù quét hai lần


def test_bao_tri_toi_han_mot_lan(client, monkeypatch):
    from app import bao_tri_reminders
    from app.models.ky_thuat_may import BaoTriMay
    from app.models.may_thiet_bi import MayThietBi

    tho = tao_nguoi("tho_bt", {"phieu_bao_tri": dict(can_read=True, scope=SCOPE_OWN)})
    db = SessionLocal()
    try:
        m = MayThietBi(ma="MAY-BT-CHAM", ten="Máy BT", loai_may="Bế")
        db.add(m)
        db.flush()
        db.add(BaoTriMay(ma="BT-CHAM-1", may_id=m.id, ngay_ke_hoach=date.today(),
                         nguoi_thuc_hien_id=tho))
        db.commit()
    finally:
        db.close()
    monkeypatch.setattr(bao_tri_reminders, "_da_ting", {})
    bao_tri_reminders._scan_once(date.today())
    bao_tri_reminders._da_ting.clear()            # giả lập restart: sổ RAM mất
    bao_tri_reminders._scan_once(date.today())
    assert tom_tat(client, dang_nhap(client, "tho_bt"))["phieu_bao_tri"]["loai"] == "bao_tri_den_han"
    assert _dem("phieu_bao_tri") == 1
