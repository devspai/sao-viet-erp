"""Chấm đỏ Đơn hàng bán + Kế hoạch SX: đơn chờ cọc → người ghi cọc; đủ cọc → Sale;
chuyển xuống sản xuất → người Xem Kế hoạch SX (một lần mỗi đơn)."""
from datetime import date

from app.db import SessionLocal
from app.models.customer import Customer
from app.models.module_notification import ModuleNotification
from app.models.role import SCOPE_ALL

from .test_orders_api import _accepted_quote
from .thong_bao_helpers import admin, dang_nhap, tao_nguoi, tom_tat


def _bao_gia_da_chot() -> int:
    db = SessionLocal()
    try:
        c = Customer(code="KH-CHAM", name="KH chấm")
        db.add(c)
        db.commit()
        return _accepted_quote(db, c).id
    finally:
        db.close()


def test_cho_coc_du_coc_va_chuyen_san_xuat(client):
    ha = admin(client)
    tao_nguoi("ke_toan_coc", {"don_hang_ban": dict(can_read=True, can_record_deposit=True,
                                                   scope=SCOPE_ALL)})
    tao_nguoi("chi_xem_don", {"don_hang_ban": dict(can_read=True, scope=SCOPE_ALL)})
    tao_nguoi("ke_hoach", {"san_xuat": dict(can_read=True, scope=SCOPE_ALL)})
    hk = dang_nhap(client, "ke_toan_coc")

    r = client.post("/api/orders", json={"source_type": "bao_gia", "quotation_id": _bao_gia_da_chot(),
                                         "deposit_pct": 50}, headers=ha)
    assert r.status_code == 201, r.text
    d = r.json()
    tt = tom_tat(client, hk)
    assert tt["don_hang_ban"]["loai"] == "don_cho_coc" and tt["don_hang_ban"]["ma"] == d["order_no"]
    assert "don_hang_ban" not in tom_tat(client, dang_nhap(client, "chi_xem_don"))

    c = client.post(f"/api/orders/{d['id']}/deposit-receipts",
                    json={"receipt_method": "cash", "amount": 500_000}, headers=hk)
    assert c.status_code == 200 and c.json()["deposit_ok"], c.text
    assert tom_tat(client, ha)["don_hang_ban"]["loai"] == "don_du_coc"

    u = client.put(f"/api/orders/{d['id']}", json={"customer_po_no": "PO1",
                                                    "delivery_committed_date": date.today().isoformat()},
                   headers=ha)
    assert u.status_code == 200, u.text
    assert client.post(f"/api/orders/{d['id']}/confirm", headers=ha).status_code == 200
    for _ in range(2):
        rel = client.post(f"/api/orders/{d['id']}/release-production", headers=ha)
        assert rel.status_code == 200, rel.text
    assert tom_tat(client, dang_nhap(client, "ke_hoach"))["san_xuat"]["loai"] == "don_chuyen_sx"
    db = SessionLocal()
    try:
        assert db.query(ModuleNotification).filter_by(channel="san_xuat").count() == 1
    finally:
        db.close()


def test_don_khong_coc_thi_khong_cham(client):
    ha = admin(client)
    tao_nguoi("ke_toan_coc2", {"don_hang_ban": dict(can_read=True, can_record_deposit=True,
                                                    scope=SCOPE_ALL)})
    r = client.post("/api/orders", json={"source_type": "bao_gia", "quotation_id": _bao_gia_da_chot(),
                                         "deposit_pct": 0}, headers=ha)
    assert r.status_code == 201, r.text
    assert "don_hang_ban" not in tom_tat(client, dang_nhap(client, "ke_toan_coc2"))
