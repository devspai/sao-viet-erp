"""Thanh lọc chung (kỳ `tu_ngay/den_ngay/moc` + điều kiện) cho Sổ tài sản, Đề nghị cập nhật hồ sơ
của tôi và Nhật ký hoạt động (06/10/2026). Lọc và đếm đều ở máy chủ; ranh ngày theo giờ VN.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.db import SessionLocal
from app.models.audit import AuditLog
from app.models.department import Department
from app.models.profile_request import ProfileUpdateRequest
from app.models.tai_san import TaiSan

from .test_audit_api_loc import _admin, _h
from .test_employees_api import _admin_token, _create, _vai_tho

VN = timezone(timedelta(hours=7))


def _vn(*a) -> datetime:
    """Mốc giờ VN, cất dạng UTC như ứng dụng vẫn ghi."""
    return datetime(*a, tzinfo=VN).astimezone(timezone.utc)


# --- Sổ tài sản -----------------------------------------------------------------------------------

def _ts(client, h, ten: str, *, gia: int, ngay: str = "2026-03-10", loai: str = "tscd") -> dict:
    r = client.post("/api/tai-san", headers=h, json={
        "ten": ten, "loai": loai, "so_thang": 24 if loai == "ccdc" else 120,
        "ngay_su_dung": ngay, "nguon_vao": "ghi_tang",
        "chi_phi": [{"dien_giai": "Gia mua", "so_tien": gia}],
    })
    assert r.status_code == 201, r.text
    return r.json()


def _sua_ts(ts_id: int, **cot) -> None:
    db = SessionLocal()
    try:
        t = db.get(TaiSan, ts_id)
        for k, v in cot.items():
            setattr(t, k, v)
        db.commit()
    finally:
        db.close()


def _bo_phan(ten: str) -> int:
    db = SessionLocal()
    try:
        d = Department(name=ten, code="TS-LOC")
        db.add(d)
        db.commit()
        return d.id
    finally:
        db.close()


def _ma(r) -> list[str]:
    assert r.status_code == 200, r.text
    return sorted(x["ten"] for x in r.json()["items"])


def test_tai_san_loc_ngay_tao_ranh_gio_vn_va_tra_created_at(client):
    h = _h(_admin(client))
    a = _ts(client, h, "May A", gia=40_000_000)
    b = _ts(client, h, "May B", gia=40_000_000)
    _sua_ts(a["id"], created_at=_vn(2026, 10, 1, 0, 30))     # 30/09 17:30 UTC ⇒ THUỘC tháng 10
    _sua_ts(b["id"], created_at=_vn(2026, 9, 30, 23, 30))    # 30/09 VN ⇒ ngoài
    r = client.get("/api/tai-san", headers=h,
                   params={"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31", "moc": "tao"})
    assert _ma(r) == ["May A"]
    assert r.json()["items"][0]["created_at"]
    assert client.get("/api/tai-san", headers=h, params={"moc": "xyz"}).status_code == 422


def test_tai_san_loc_ngay_bat_dau_dung_va_ngay_thoi_dung(client):
    h = _h(_admin(client))
    _ts(client, h, "Dung thang 3", gia=40_000_000, ngay="2026-03-10")
    _ts(client, h, "Dung thang 5", gia=40_000_000, ngay="2026-05-02")
    thoi = _ts(client, h, "Da thoi", gia=40_000_000, ngay="2026-01-05")
    _sua_ts(thoi["id"], trang_thai="da_giam", ngay_giam=date(2026, 6, 15))

    r = client.get("/api/tai-san", headers=h, params={
        "tu_ngay": "2026-03-01", "den_ngay": "2026-03-31", "moc": "su_dung", "trang_thai": "dang_dung"})
    assert _ma(r) == ["Dung thang 3"]
    r = client.get("/api/tai-san", headers=h, params={
        "tu_ngay": "2026-06-01", "den_ngay": "2026-06-30", "moc": "giam"})
    assert _ma(r) == ["Da thoi"]


def test_tai_san_loc_gia_mua_bo_phan_va_dem_theo_trang_thai(client):
    h = _h(_admin(client))
    bp = _bo_phan("To In thu loc")
    re = _ts(client, h, "Re", gia=5_000_000, loai="ccdc")
    _ts(client, h, "Vua", gia=50_000_000)
    _ts(client, h, "Dat", gia=900_000_000)
    _sua_ts(re["id"], bo_phan_id=bp)
    thoi = _ts(client, h, "Thoi dung", gia=60_000_000)
    _sua_ts(thoi["id"], trang_thai="da_giam", ngay_giam=date(2026, 6, 1))

    r = client.get("/api/tai-san", headers=h, params={"gia_tu": 10_000_000, "gia_den": 100_000_000})
    assert _ma(r) == ["Thoi dung", "Vua"]
    r = client.get("/api/tai-san", headers=h, params={"bo_phan_id": bp})
    assert _ma(r) == ["Re"]

    # Số trên thẻ Trạng thái bỏ điều kiện trạng thái nhưng giữ các điều kiện khác.
    body = client.get("/api/tai-san", headers=h,
                      params={"trang_thai": "dang_dung", "gia_tu": 10_000_000}).json()
    assert body["total"] == 2
    assert body["dem_trang_thai"] == {"dang_dung": 2, "da_giam": 1}
    assert body["dem_loai"] == {"tscd": 2}

    # Thẻ Bộ phận: chỉ bộ phận đang có tài sản, kèm số.
    lc = client.get("/api/tai-san/loc-bo-phan", headers=h).json()
    assert {"id": bp, "ten": "To In thu loc", "so": 1} in lc


# --- Hồ sơ của tôi: đề nghị cập nhật -------------------------------------------------------------

def test_de_nghi_cua_toi_loc_ky_ngay_tao_va_nhieu_trang_thai(client):
    admin = _admin_token(client)
    _create(client, admin, full_name="NV Loc Ky", bank_account="111",
            account={"username": "nvlocky", "password": "nvlocky123", "role_id": _vai_tho(client, admin)})
    tok = client.post("/api/auth/login",
                      json={"username": "nvlocky", "password": "nvlocky123"}).json()["access_token"]
    ids = [client.post("/api/employees/me/update-requests",
                       json={"changes": {"bank_account": f"80{i}"}}, headers=_h(tok)).json()["id"]
           for i in range(3)]
    client.post(f"/api/employees/me/update-requests/{ids[0]}/cancel", headers=_h(tok))
    db = SessionLocal()
    try:
        db.get(ProfileUpdateRequest, ids[0]).created_at = _vn(2026, 10, 1, 0, 30)   # trong tháng 10
        db.get(ProfileUpdateRequest, ids[1]).created_at = _vn(2026, 10, 2, 9, 0)    # trong tháng 10
        db.get(ProfileUpdateRequest, ids[2]).created_at = _vn(2026, 9, 30, 23, 30)  # 30/09 VN ⇒ ngoài
        db.commit()
    finally:
        db.close()

    url = "/api/employees/me/update-requests"
    ky = {"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31", "moc": "tao"}
    body = client.get(url, params=ky, headers=_h(tok)).json()
    assert sorted(x["id"] for x in body["items"]) == sorted(ids[:2])
    assert body["dem_theo_tab"] == {"cancelled": 1, "pending": 1}
    assert body["dem"] == {"cancelled": 1, "pending": 2}          # badge: toàn hồ sơ, không theo kỳ

    hai = client.get(url, params=[("status", "pending"), ("status", "cancelled")], headers=_h(tok)).json()
    assert hai["total"] == 3
    assert client.get(url, params={"status": "xyz"}, headers=_h(tok)).status_code == 400


# --- Nhật ký hoạt động ---------------------------------------------------------------------------

def _gieo(action: str, luc: datetime) -> None:
    db = SessionLocal()
    try:
        db.add(AuditLog(actor_user_id=None, action=action, target="", detail="x", created_at=luc))
        db.commit()
    finally:
        db.close()


def test_nhat_ky_ky_theo_ngay_vn_va_tat_ca(client):
    token = _admin(client)
    _gieo("create_machine", _vn(2026, 10, 1, 0, 30))     # 30/09 17:30 UTC ⇒ ngày 01/10 VN
    _gieo("create_machine", _vn(2026, 9, 30, 23, 30))    # 30/09 VN
    _gieo("create_machine", _vn(2026, 10, 1, 23, 50))    # cuối ngày 01/10 VN vẫn trong kỳ

    r = client.get("/api/audit", params={"action": "create_machine", "tu_ngay": "2026-10-01",
                                         "den_ngay": "2026-10-01", "moc": "tao"}, headers=_h(token))
    assert r.status_code == 200, r.text
    assert r.json()["tong"] == 2

    f = client.get("/api/audit/facets", params={"tu_ngay": "2026-10-01", "den_ngay": "2026-10-01"},
                   headers=_h(token)).json()
    assert next(h for h in f["hanh_dong"] if h["ma"] == "create_machine")["so_dong"] == 2

    # "Tất cả" bỏ cửa sổ 30 ngày mặc định — dòng một năm trước vẫn ra.
    _gieo("create_machine", datetime.now(timezone.utc) - timedelta(days=365))
    mac_dinh = client.get("/api/audit", params={"action": "create_machine"}, headers=_h(token)).json()
    tat_ca = client.get("/api/audit", params={"action": "create_machine", "tat_ca": "true"},
                        headers=_h(token)).json()
    assert tat_ca["tong"] == 4 and mac_dinh["tong"] < 4

    assert client.get("/api/audit", params={"tu_ngay": "khong-phai-ngay"},
                      headers=_h(token)).status_code == 422
    assert client.get("/api/audit", params={"moc": "gui"}, headers=_h(token)).status_code == 422
