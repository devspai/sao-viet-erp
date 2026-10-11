"""Form Yêu cầu nhập xuất của Kho gửi/nhận GIỜ cần hàng (`stock_requests.can_luc`, mg 0384)."""
from .test_kho_de_nghi import _login, _setup


def _dong(mat):
    return [{"hang_loai": mat[0], "hang_id": mat[1], "dvt": "to", "sl_de_nghi": 5}]


def test_tao_yeu_cau_co_gio_can_thi_ngay_can_theo_gio(client):
    kho_id, mat = _setup(client)
    h = _login(client, "t_denghi")
    r = client.post("/api/kho/de-nghi", headers=h, json={
        "loai": "XUAT", "kho_id": kho_id, "can_luc": "2026-10-09T17:30:00", "lines": _dong(mat)})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ngay_can"] == "2026-10-09"
    assert body["can_luc"].startswith("2026-10-09T17:30")
    # Đọc lại: giờ vẫn là wall-clock, không lệch múi.
    r2 = client.get(f"/api/kho/de-nghi/{body['id']}", headers=h)
    assert r2.status_code == 200, r2.text
    assert r2.json()["can_luc"].startswith("2026-10-09T17:30")


def test_khong_gui_gio_van_tao_duoc_va_can_luc_rong(client):
    kho_id, mat = _setup(client)
    h = _login(client, "t_denghi")
    r = client.post("/api/kho/de-nghi", headers=h, json={
        "loai": "XUAT", "kho_id": kho_id, "ngay_can": "2026-10-10", "lines": _dong(mat)})
    assert r.status_code == 201, r.text
    assert r.json()["can_luc"] is None and r.json()["ngay_can"] == "2026-10-10"


def test_sua_doi_gio_can(client):
    kho_id, mat = _setup(client)
    h = _login(client, "t_denghi")
    r = client.post("/api/kho/de-nghi", headers=h, json={
        "loai": "XUAT", "kho_id": kho_id, "can_luc": "2026-10-09T17:30:00", "lines": _dong(mat)})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    # Yêu cầu tự duyệt ngay lúc tạo; sửa chỉ cho phép khi còn chờ duyệt ⇒ đưa về trạng thái đó.
    from app.db import SessionLocal
    from app.models.stock_request import REQ_PENDING, StockRequest
    with SessionLocal() as db:
        db.get(StockRequest, rid).trang_thai = REQ_PENDING
        db.commit()
    u = client.put(f"/api/kho/de-nghi/{rid}", headers=h, json={"can_luc": "2026-10-10T08:00:00"})
    assert u.status_code == 200, u.text
    assert u.json()["ngay_can"] == "2026-10-10"
    assert u.json()["can_luc"].startswith("2026-10-10T08:00")
