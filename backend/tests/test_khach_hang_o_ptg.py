"""Khách hàng + ghi chú chọn ở PHIẾU TÍNH GIÁ, báo giá kế thừa CHỈ ĐỌC (chủ dự án chốt 04/10/2026).

Luật (docs/superpowers/plans/2026-10-04-khach-hang-o-phieu-tinh-gia.md):
  - Khách, địa chỉ giao, người nhận, ghi chú nội bộ chọn ở phiếu; báo giá chép sang, không sửa được.
  - Phiếu chưa có khách ⇒ không lập được báo giá.
  - Phiếu đổi ⇒ báo giá NHÁP theo ngay; báo giá đã qua nháp giữ nguyên.
  - Khách chọn ở phiếu phải nằm trong phạm vi Khách hàng của người chọn.
  - Tạo báo giá phải thấy được phiếu nguồn.
"""
from __future__ import annotations

from app.db import SessionLocal
from app.models.customer import Customer, CustomerAddress, CustomerContact
from app.models.phieu_tinh_gia import PhieuThanhPhan, PhieuTinhGia
from app.models.role import SCOPE_ALL, SCOPE_OWN
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import create_access_token, hash_password

ADMIN = {"username": "admin", "password": "admin123"}


def _admin(client) -> str:
    return client.post("/api/auth/login", json=ADMIN).json()["access_token"]


def _h(t: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {t}"}


def _nguoi(username: str, quyen: dict[str, dict]) -> tuple[str, int]:
    """User trong phòng Kinh doanh, vai riêng chỉ có đúng `quyen` = {module: {scope, can_*}}."""
    db = SessionLocal()
    try:
        users, roles = UserRepository(db), RoleRepository(db)
        kd = DepartmentRepository(db).get_by_name("Kinh doanh")
        role = roles.get_by_name_and_department(f"vai-{username}", kd.id) or roles.create(
            name=f"vai-{username}", department_id=kd.id
        )
        for module, perm in quyen.items():
            perm = dict(perm)
            scope = perm.pop("scope", SCOPE_ALL)
            roles.set_permission(role_id=role.id, module_key=module, scope=scope, **perm)
        u = users.get_by_username(username) or users.create(
            username=username, name=username, password_hash=hash_password("x")
        )
        users.set_assignment(u, department_id=kd.id, role_id=role.id, is_active=True)
        return create_access_token(str(u.id)), u.id
    finally:
        db.close()


def _khach(*, ten="Cty Bibica Test", sale_user_id: int | None = None) -> int:
    """Khách có 2 liên hệ (1 chính) + 2 điểm giao (1 mặc định)."""
    db = SessionLocal()
    try:
        n = db.query(Customer).count() + 1
        c = Customer(code=f"KHP-{n:04d}", name=ten, sale_user_id=sale_user_id)
        db.add(c)
        db.flush()
        db.add(CustomerContact(customer_id=c.id, name="Chị Trang", title="Marketing",
                               phone="0939959884", is_primary=False))
        db.add(CustomerContact(customer_id=c.id, name="Anh Sơn", title="Trưởng phòng Mua hàng",
                               phone="0986080684", email="son@x.vn", is_primary=True))
        db.add(CustomerAddress(customer_id=c.id, label="Văn phòng", address="443 Lý Thường Kiệt",
                               is_default=False))
        db.add(CustomerAddress(customer_id=c.id, label="Chi nhánh Hà Nội",
                               address="Lô CN4, KCN Quang Minh", is_default=True))
        db.commit()
        return c.id
    finally:
        db.close()


def _phieu(*, created_by: int | None = None) -> int:
    db = SessionLocal()
    try:
        n = db.query(PhieuTinhGia).count() + 1
        p = PhieuTinhGia(ma=f"PTG-KH-{n:04d}", ten_san_pham="Sách A5", so_luong=1000,
                         tong_gia_von=1_000_000, gia_von_don=1000, ktv="KTV", created_by=created_by)
        db.add(p)
        db.flush()
        db.add(PhieuThanhPhan(phieu_id=p.id, thu_tu=0, ten="Ruột", so_luong=1000,
                              gia_von_tp=1_000_000, loai_thanh_phan="to_roi"))
        db.commit()
        return p.id
    finally:
        db.close()


def _chon_khach(client, token, pid, **body):
    return client.patch(f"/api/phieu-tinh-gia/{pid}/khach-hang", json=body, headers=_h(token))


# ------------------------------------------------------------------ chọn khách ở phiếu
def test_chon_khach_tu_dien_diem_giao_mac_dinh_va_lien_he_chinh(client):
    t = _admin(client)
    pid, cid = _phieu(), _khach()
    r = _chon_khach(client, t, pid, customer_id=cid)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["customer_id"] == cid
    assert d["customer_name"] == "Cty Bibica Test"
    assert d["delivery_address"] == "Lô CN4, KCN Quang Minh"
    assert d["contact_name_snapshot"] == "Anh Sơn"
    assert d["contact_phone_snapshot"] == "0986080684"
    assert d["contact_title_snapshot"] == "Trưởng phòng Mua hàng"


def test_chon_tay_dia_chi_nguoi_nhan_va_ghi_chu(client):
    t = _admin(client)
    pid, cid = _phieu(), _khach()
    _chon_khach(client, t, pid, customer_id=cid)
    r = _chon_khach(client, t, pid, delivery_address="443 Lý Thường Kiệt",
                    contact_name_snapshot="Chị Trang", contact_phone_snapshot="0939959884",
                    contact_title_snapshot="Marketing", contact_email_snapshot=None,
                    ghi_chu="Giao trước 20/10")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["customer_id"] == cid                      # không gửi customer_id ⇒ giữ khách cũ
    assert d["delivery_address"] == "443 Lý Thường Kiệt"
    assert d["contact_name_snapshot"] == "Chị Trang"
    assert d["ghi_chu"] == "Giao trước 20/10"
    # GET chi tiết trả lại đúng như vừa lưu.
    g = client.get(f"/api/phieu-tinh-gia/{pid}", headers=_h(t)).json()
    assert g["customer_name"] == "Cty Bibica Test"
    assert g["delivery_address"] == "443 Lý Thường Kiệt"


def test_tao_phieu_kem_khach_ngay_tu_dau(client):
    t = _admin(client)
    cid = _khach()
    r = client.post("/api/phieu-tinh-gia", json={"ten_san_pham": "Hộp", "customer_id": cid,
                                                 "ghi_chu": "Khách quen"}, headers=_h(t))
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["customer_id"] == cid
    assert d["delivery_address"] == "Lô CN4, KCN Quang Minh"   # tự điền như lúc chọn sau
    assert d["ghi_chu"] == "Khách quen"


def test_chon_khach_khong_can_quyen_xem_chi_tiet_gia_von(client):
    """Khách hàng không phải ruột giá: vai có Sửa tính giá nhưng thiếu view_cost vẫn chọn được."""
    t, uid = _nguoi("kd_chon_khach", {
        "tinh_gia_thanh": {"scope": SCOPE_OWN, "can_read": True, "can_update": True},
        "khach_hang": {"scope": SCOPE_ALL, "can_read": True},
    })
    pid, cid = _phieu(created_by=uid), _khach()
    r = _chon_khach(client, t, pid, customer_id=cid)
    assert r.status_code == 200, r.text


def test_khong_chon_duoc_khach_ngoai_pham_vi(client):
    t, uid = _nguoi("kd_ngoai_pham_vi", {
        "tinh_gia_thanh": {"scope": SCOPE_OWN, "can_read": True, "can_update": True},
        "khach_hang": {"scope": SCOPE_OWN, "can_read": True},
    })
    _, khac = _nguoi("kd_chu_khach", {"khach_hang": {"scope": SCOPE_OWN, "can_read": True}})
    pid = _phieu(created_by=uid)
    cid_cua_nguoi_khac = _khach(ten="Khách của người khác", sale_user_id=khac)
    r = _chon_khach(client, t, pid, customer_id=cid_cua_nguoi_khac)
    assert r.status_code == 403, r.text
    cid_cua_minh = _khach(ten="Khách của mình", sale_user_id=uid)
    assert _chon_khach(client, t, pid, customer_id=cid_cua_minh).status_code == 200


def test_danh_sach_tra_ten_khach_ghi_chu_va_tim_theo_ten_khach(client):
    t = _admin(client)
    pid, cid = _phieu(), _khach(ten="Cty Tìm Theo Tên")
    _chon_khach(client, t, pid, customer_id=cid, ghi_chu="Bìa Ivory lô cũ")
    r = client.get("/api/phieu-tinh-gia", params={"q": "Tìm Theo"}, headers=_h(t))
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert [it["id"] for it in items] == [pid]
    assert items[0]["customer_name"] == "Cty Tìm Theo Tên"
    assert items[0]["ghi_chu"] == "Bìa Ivory lô cũ"


# ------------------------------------------------------------------ báo giá kế thừa
def test_chua_chon_khach_thi_khong_lap_duoc_bao_gia(client):
    t = _admin(client)
    r = client.post("/api/quotations", json={"phieu_tinh_gia_id": _phieu()}, headers=_h(t))
    assert r.status_code == 422
    assert "khách" in r.json()["detail"].lower()


def test_bao_gia_chep_khach_dia_chi_nguoi_nhan_ghi_chu_tu_phieu(client):
    t = _admin(client)
    pid, cid = _phieu(), _khach()
    _chon_khach(client, t, pid, customer_id=cid, ghi_chu="Giao 2 đợt")
    khac = _khach(ten="Khách gửi kèm payload")
    r = client.post("/api/quotations", json={"phieu_tinh_gia_id": pid, "customer_id": khac},
                    headers=_h(t))
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["customer_id"] == cid                       # lấy theo PHIẾU, bỏ qua payload
    assert d["delivery_address"] == "Lô CN4, KCN Quang Minh"
    assert d["contact_name_snapshot"] == "Anh Sơn"
    assert d["internal_note"] == "Giao 2 đợt"


def test_bao_gia_tu_choi_sua_thong_tin_ke_thua(client):
    t = _admin(client)
    pid, cid = _phieu(), _khach()
    _chon_khach(client, t, pid, customer_id=cid, ghi_chu="Ghi chú phiếu")
    q = client.post("/api/quotations", json={"phieu_tinh_gia_id": pid}, headers=_h(t)).json()
    url = f"/api/quotations/{q['id']}"
    # Đổi khách / địa chỉ / người nhận / ghi chú ở báo giá ⇒ 422, chỉ đường là sửa ở phiếu.
    for body in ({"customer_id": _khach(ten="Khách khác")},
                 {"customer_id": cid, "delivery_address": "Chỗ khác"},
                 {"customer_id": cid, "contact_name_snapshot": "Người khác"},
                 {"customer_id": cid, "internal_note": "Ghi đè"}):
        r = client.put(url, json=body, headers=_h(t))
        assert r.status_code == 422, (body, r.text)
        assert "phiếu tính giá" in r.json()["detail"]
    # Sửa điều khoản (không kèm ô kế thừa) vẫn được.
    r = client.put(url, json={"terms_text": "Điều khoản mới"}, headers=_h(t))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["terms_text"] == "Điều khoản mới"
    assert d["customer_id"] == cid and d["internal_note"] == "Ghi chú phiếu"


def test_doi_o_phieu_thi_bao_gia_nhap_theo_bao_gia_da_gui_giu_nguyen(client):
    # Một phiếu chỉ một báo giá ⇒ hai phiếu: một báo giá đã gửi, một báo giá còn nháp.
    t = _admin(client)
    pid_gui, pid_nhap, cid = _phieu(), _phieu(), _khach()
    _chon_khach(client, t, pid_gui, customer_id=cid)
    _chon_khach(client, t, pid_nhap, customer_id=cid)
    da_gui = client.post("/api/quotations", json={"phieu_tinh_gia_id": pid_gui}, headers=_h(t)).json()
    assert client.post(f"/api/quotations/{da_gui['id']}/transition", json={"to_status": "sent"},
                       headers=_h(t)).status_code == 200
    nhap = client.post("/api/quotations", json={"phieu_tinh_gia_id": pid_nhap}, headers=_h(t)).json()

    moi = _khach(ten="Cty Mới")
    for pid in (pid_gui, pid_nhap):
        assert _chon_khach(client, t, pid, customer_id=moi, ghi_chu="Đổi khách").status_code == 200

    n = client.get(f"/api/quotations/{nhap['id']}", headers=_h(t)).json()
    assert n["customer_id"] == moi
    assert n["delivery_address"] == "Lô CN4, KCN Quang Minh"
    assert n["internal_note"] == "Đổi khách"
    g = client.get(f"/api/quotations/{da_gui['id']}", headers=_h(t)).json()
    assert g["customer_id"] == cid                        # đã gửi khách ⇒ giữ nguyên
    assert g["internal_note"] in (None, "")


def test_phien_ban_moi_lay_lai_thong_tin_moi_nhat_tu_phieu(client):
    t = _admin(client)
    pid, cid = _phieu(), _khach()
    _chon_khach(client, t, pid, customer_id=cid)
    q = client.post("/api/quotations", json={"phieu_tinh_gia_id": pid}, headers=_h(t)).json()
    url = f"/api/quotations/{q['id']}"
    client.post(f"{url}/transition", json={"to_status": "sent"}, headers=_h(t))
    client.post(f"{url}/transition", json={"to_status": "rejected"}, headers=_h(t))
    _chon_khach(client, t, pid, delivery_address="443 Lý Thường Kiệt", ghi_chu="Khách đổi kho")
    r = client.post(f"{url}/requote", json={"change_reason": "Khách đổi kho"}, headers=_h(t))
    assert r.status_code in (200, 201), r.text
    d = client.get(url, headers=_h(t)).json()
    assert d["delivery_address"] == "443 Lý Thường Kiệt"
    assert d["internal_note"] == "Khách đổi kho"


def test_khong_lap_duoc_bao_gia_tu_phieu_ngoai_pham_vi(client):
    """Vá lỗ hổng: có quyền Tạo báo giá nhưng không thấy phiếu ⇒ không được chép giá vốn của phiếu."""
    t, uid = _nguoi("kd_tao_bg", {
        "tinh_gia_thanh": {"scope": SCOPE_OWN, "can_read": True},
        "bao_gia": {"scope": SCOPE_OWN, "can_read": True, "can_create": True},
    })
    admin = _admin(client)
    pid_nguoi_khac, cid = _phieu(created_by=None), _khach()
    _chon_khach(client, admin, pid_nguoi_khac, customer_id=cid)
    r = client.post("/api/quotations", json={"phieu_tinh_gia_id": pid_nguoi_khac}, headers=_h(t))
    assert r.status_code == 404, r.text
    pid_cua_minh = _phieu(created_by=uid)
    _chon_khach(client, admin, pid_cua_minh, customer_id=cid)
    r = client.post("/api/quotations", json={"phieu_tinh_gia_id": pid_cua_minh}, headers=_h(t))
    assert r.status_code == 201, r.text
