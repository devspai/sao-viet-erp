"""Báo cáo KCS — tổng hợp theo filter/scope + xuất Excel hai sheet (§5.7, §6.2, §9 mục 10).

Soi tầng service `services/san_xuat/kcs_bao_cao.py` theo KCS theo LỆNH (mg 0306):
  · mục 2: tỷ lệ đạt = tổng Đạt / tổng nhận (SUM/SUM), KHÔNG phải trung bình tỷ lệ từng lần kiểm;
  · mục 3: công đoạn/tổ xếp theo TỔNG số lượng lỗi, không phải đếm dòng (bảng "nhóm lỗi" đã gỡ
    cùng danh mục Lý do & lỗi SX — mg 0288);
  · mục 4: hồ sơ `to_chiu_id IS NULL` (dữ liệu cũ) KHÔNG vào bảng xếp hạng "tổ", nhưng VẪN cộng vào
    KPI tổng lỗi. Lỗi ghi mới luôn neo tổ của công đoạn;
  · §9 mục 10: JSON (`bao_cao_kcs`) và Excel (`xuat_excel_kcs`) đọc CHUNG `_hang_kcs_theo_scope`
    — cùng filter phải trả cùng tổng;
  · PHẠM VI: vai có Xem ở dòng `kcs` (mg 0383) thấy MỌI tổ; người khác chỉ gom tổ được bật Xem
    TRỌN — Xem mức "Của tôi" không mở số liệu KCS của cả tổ;
  · RBAC: `GET /kcs/bao-cao` gác Xem ở ít nhất một tổ HOẶC Xem ở dòng `kcs`
    (`require_quyen_to("read", ("kcs", "read"))`),
    `GET /kcs/bao-cao/export.xlsx` gác RIÊNG: CHỈ Xem ở dòng `kcs` (đi qua HTTP thật vì đây là chỗ
    cổng router thật sự áp).

Tái dùng dàn cảnh + helper của test KCS (`_batch`, `_cv_kcs`, `_to_kiem`, `_anh`) và `_authz` của
test board (tham số `authz` còn trong chữ ký service nhưng không quyết định phạm vi).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from io import BytesIO

from openpyxl import load_workbook

from app.db import SessionLocal
from app.models.cong_doan import CongDoan
from app.models.department import Department
from app.models.lsx import Lsx
from app.models.role import SCOPE_ALL, SCOPE_OWN
from app.models.san_xuat_kcs import SanXuatKcsBatch, SanXuatKcsLoi
from app.repositories.rbac_repo import RoleRepository
from app.models.user import User
from app.repositories.user_repo import UserRepository
from app.security import create_access_token, hash_password
from app.services.san_xuat import kcs, kcs_bao_cao
from tests.quyen_to_fixtures import cap_quyen_to

# Stub đủ tham số `authz` cho chữ ký service (phạm vi do dòng quyền theo tổ quyết định).
from tests.test_san_xuat_board import _authz

# Fixtures + helper dàn cảnh dùng chung — TỪ test KCS.
from tests.test_san_xuat_kcs import (  # noqa: F401
    _anh,
    _batch,
    _cv_kcs,
    _ghi_tot,
    _to_kiem,
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)

_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# Ảnh chụp 2 tiêu chí theo khuôn mg 0381 — mỗi mục chỉ là một câu chữ.
_TIEU_CHI_2 = [
    {"tieu_chi_id": 1, "ma": "TC-01", "ten": "Không lệch màu", "thu_tu": 1},
    {"tieu_chi_id": 2, "ma": "TC-02", "ten": "Không rách giấy", "thu_tu": 2},
]


def _batch_voi_checklist(db, orders, lsx_svc, admin, customer, *, ma, checklist_ket_qua,
                          dat=90, khong_dat=10):
    """Lần kiểm CÓ gắn snapshot `cv.kcs_tieu_chi_json` TRƯỚC khi ghi — khác `_batch` (không gắn
    gì) — dùng cho test Sheet 2 (mục 3.7)."""
    # Tiêu chí chỉ còn ở công đoạn cuối (công đoạn giữa KCS chỉ ghi lỗi, 19/09/2026).
    to, cv = _cv_kcs(db, orders, lsx_svc, admin, customer, ma=ma, cuoi=True)
    cv.kcs_tieu_chi_json = _TIEU_CHI_2
    db.commit()
    _ghi_tot(db, cv, dat + khong_dat)
    _d, nguoi = _to_kiem(db, ten=f"Tổ KCS {ma}", ma=f"{ma}-KCS")
    res = kcs.kiem_cong_doan(
        db, user=nguoi, cong_viec_id=cv.id, so_dat=dat, so_loi=khong_dat,
        loi_mo_ta="Lem mực" if khong_dat else None, anh=_anh() if khong_dat else None,
        checklist_ket_qua=checklist_ket_qua,
    )
    return to, cv, res


# --- Mục 2: tỷ lệ đạt = tổng/tổng --------------------------------------------------------------
def test_ty_le_dat_la_tong_tren_tong_khong_phai_trung_binh(db, orders, lsx_svc, admin, customer):
    _batch(db, orders, lsx_svc, admin, customer, dat=90, khong_dat=10, ma="KCS-TY-A", cuoi=True)
    _batch(db, orders, lsx_svc, admin, customer, dat=1, khong_dat=9, ma="KCS-TY-B", cuoi=True)

    out = kcs_bao_cao.bao_cao_kcs(db, admin, _authz(db))

    assert out["tong_nhan"] == 110
    assert out["tong_dat"] == 91
    assert abs(out["ty_le_dat"] - (91 / 110)) < 1e-9   # tổng/tổng ≈ 0.827
    assert abs(out["ty_le_dat"] - 0.5) > 0.1            # KHÔNG phải trung bình (90%+10%)/2 = 50%


def test_ty_le_dat_bo_qua_cong_doan_giua(db, orders, lsx_svc, admin, customer):
    """Công đoạn giữa KCS chỉ ghi lỗi (đạt = 0) — lỗi vẫn cộng, nhưng nhận/đạt/tỷ lệ chỉ lấy
    công đoạn cuối, không thì tỷ lệ đạt tụt oan (19/09/2026)."""
    _batch(db, orders, lsx_svc, admin, customer, dat=90, khong_dat=10, ma="KCS-TY-C", cuoi=True)
    _batch(db, orders, lsx_svc, admin, customer, dat=0, khong_dat=4, ma="KCS-TY-G")

    out = kcs_bao_cao.bao_cao_kcs(db, admin, _authz(db))

    assert (out["tong_nhan"], out["tong_dat"], out["tong_loi"]) == (100, 90, 14)
    assert abs(out["ty_le_dat"] - 0.9) < 1e-9
    assert [(d["tong_nhan"], d["tong_dat"], d["tong_loi"]) for d in out["theo_ngay"]] == [(100, 90, 14)]


# --- Mục 3: xếp hạng theo TỔNG số lượng, không phải đếm dòng ----------------------------------
def test_xep_hang_to_theo_tong_so_luong(db, orders, lsx_svc, admin, customer):
    """Xếp hạng lấy TỔNG số lượng, KHÔNG đếm dòng: tổ X có 1 lần lỗi 50 cái phải đứng trên tổ Y có
    3 lần lỗi 1 cái. Lỗi neo tổ của CÔNG ĐOẠN được kiểm (KCS theo lệnh)."""
    to_x, _cv_x, _res_x = _batch(db, orders, lsx_svc, admin, customer, dat=50, khong_dat=50,
                                 ma="KCS-XH-X")
    to_y, cv_y, res_y = _batch(db, orders, lsx_svc, admin, customer, dat=10, khong_dat=1,
                               ma="KCS-XH-Y")
    _ghi_tot(db, cv_y, 2)
    # Ghi chú khác nhau: hai lần kiểm Y HỆT trong 30 giây bị coi là một lần "Lưu" gửi lại (chống ghi lặp).
    for i in range(2):
        kcs.kiem_cong_doan(db, user=res_y["nguoi_kcs"], cong_viec_id=cv_y.id, so_dat=0, so_loi=1,
                           loi_mo_ta="Xước nhẹ", anh=_anh(), ghi_chu=f"Lần kiểm {i + 1}")

    out = kcs_bao_cao.bao_cao_kcs(db, admin, _authz(db))

    assert "nhom_loi" not in out                          # bảng nhóm lỗi đã gỡ (mg 0288)
    assert out["to"][0]["to_id"] == to_x.id               # tổng 50 > tổng 3, KHÔNG phải Y (3 dòng)
    assert out["to"][0]["tong_so_luong"] == 50
    theo_id = {r["to_id"]: r for r in out["to"]}
    assert theo_id[to_y.id]["tong_so_luong"] == 3
    assert theo_id[to_x.id]["ten"] == to_x.name and theo_id[to_y.id]["ten"] == to_y.name


# --- Mục 4: hồ sơ không xác định trách nhiệm KHÔNG vào bảng xếp hạng "tổ" (nhưng vẫn vào KPI)
# ---------------------------------------------------------------------------------------------
def test_loi_khong_to_chiu_khong_len_bang_xep_hang_to(db, orders, lsx_svc, admin, customer):
    """Lỗi ghi mới luôn neo tổ của công đoạn; `to_chiu_id IS NULL` chỉ còn ở dữ liệu cũ — dựng bằng
    cách xoá tay cột đó trên một lần kiểm."""
    to_a, _cv_a, _res_a = _batch(db, orders, lsx_svc, admin, customer, dat=94, khong_dat=6,
                                 ma="KCS-M4-A")
    _to_b, _cv_b, res_b = _batch(db, orders, lsx_svc, admin, customer, dat=96, khong_dat=4,
                                 ma="KCS-M4-B")
    loi_b = db.get(SanXuatKcsLoi, res_b["loi_id"])
    loi_b.to_chiu_id = None
    db.commit()

    out = kcs_bao_cao.bao_cao_kcs(db, admin, _authz(db))

    assert out["tong_loi"] == 10                    # KPI lấy từ lần kiểm, KHÔNG mất dòng to_chiu=None
    to_ids = {r["to_id"] for r in out["to"]}
    assert to_ids == {to_a.id}
    assert out["to"][0]["tong_so_luong"] == 6        # CHỈ dòng có to_chiu được cộng vào bảng "tổ"


def _nguoi_xem_x_tron_y_cua_toi(db, to_x, to_y) -> User:
    """Một người đứng ở tổ X: vai bật Xem TRỌN tổ X, còn tổ Y chỉ Xem mức "Của tôi" — không một
    quyền chi tiết nào. (`_to_khoan` dựng tổ nào cũng bật đủ quyền cho vai của admin, nên phép thử
    phạm vi phải dùng người khác admin, không thì tổ Y cũng lọt vào.)"""
    u = User(username=f"xem_bc_{to_x.code.lower()}", name="Người xem báo cáo", password_hash="x",
             department_id=to_x.id)
    db.add(u)
    db.flush()
    cap_quyen_to(db, u, to_x, viec=())
    cap_quyen_to(db, u, to_y, scope=SCOPE_OWN, viec=())
    db.commit()
    return u


# --- §4.1: báo cáo chỉ gom tổ người xem thấy TRỌN; người KCS thấy mọi tổ ---------------------
def test_bao_cao_chi_gom_to_nguoi_xem_thay_tron(db, orders, lsx_svc, admin, customer):
    to_x, _cv_x, res_x = _batch(db, orders, lsx_svc, admin, customer, ma="KCS-SC-X")
    to_y, _cv_y, _res_y = _batch(db, orders, lsx_svc, admin, customer, ma="KCS-SC-Y")
    nguoi = _nguoi_xem_x_tron_y_cua_toi(db, to_x, to_y)

    out = kcs_bao_cao.bao_cao_kcs(db, nguoi, _authz(db))

    assert out["tong_luot"] == 1                        # chỉ tổ X; tổ Y "Của tôi" KHÔNG cộng vào
    assert kcs_bao_cao.bao_cao_kcs(db, admin, _authz(db))["tong_luot"] == 2   # admin thấy trọn cả hai
    # Người KCS không cần dòng quyền theo tổ nào vẫn thấy mọi tổ.
    assert kcs_bao_cao.bao_cao_kcs(db, res_x["nguoi_kcs"], _authz(db))["tong_luot"] == 2


# --- Filter riêng lẻ: tu-den / cong_doan_id / tu_khoa -----------------------------------------
def test_filter_tu_den_cong_doan_id_tu_khoa_thu_hep_dung(db, orders, lsx_svc, admin, customer):
    _to_a, cv_a, res_a = _batch(db, orders, lsx_svc, admin, customer, ma="KCS-FL-A")
    cv_a.ten_cong_doan = "In-Test-FL"
    cd_in = CongDoan(ma="CD-FL-IN", ten="In-Test-FL", nhom="test")
    db.add(cd_in)
    db.commit()

    _to_b, cv_b, res_b = _batch(db, orders, lsx_svc, admin, customer, dat=20, khong_dat=0,
                                ma="KCS-FL-B", cuoi=True)
    cv_b.ten_cong_doan = "Be-Test-FL"
    # Dời mốc hai lần kiểm về hai ngày khác nhau (giờ VN) để soi lọc ngày.
    t0 = datetime(2026, 8, 20, 3, 0, tzinfo=timezone.utc)
    for bid, moc in ((res_a["kcs_batch_id"], t0), (res_b["kcs_batch_id"], t0 + timedelta(days=5))):
        kb = db.get(SanXuatKcsBatch, bid)
        kb.bat_dau = kb.ket_thuc = moc
    db.commit()

    authz = _authz(db)

    out_cd = kcs_bao_cao.bao_cao_kcs(db, admin, authz, cong_doan_id=cd_in.id)
    assert out_cd["tong_luot"] == 1 and out_cd["lich_su"][0]["cong_viec_id"] == cv_a.id

    out_tu = kcs_bao_cao.bao_cao_kcs(db, admin, authz, tu=date(2026, 8, 20), den=date(2026, 8, 20))
    assert out_tu["tong_luot"] == 1 and out_tu["lich_su"][0]["cong_viec_id"] == cv_a.id

    lsx_b = db.get(Lsx, cv_b.lsx_id)
    assert lsx_b is not None
    out_kw = kcs_bao_cao.bao_cao_kcs(db, admin, authz, tu_khoa=lsx_b.ma)
    assert out_kw["tong_luot"] == 1 and out_kw["lich_su"][0]["cong_viec_id"] == cv_b.id


# --- Thanh lọc tab Báo cáo lỗi (09/10/2026): tìm tên khách, lọc khách/công đoạn, số cho menu Lọc ---
def test_loc_khach_cong_doan_va_so_cho_menu_loc(db, orders, lsx_svc, admin, customer):
    _to_a, cv_a, _r = _batch(db, orders, lsx_svc, admin, customer, ma="KCS-LK-A")
    _to_b, cv_b, _r = _batch(db, orders, lsx_svc, admin, customer, ma="KCS-LK-B", cuoi=True)
    cv_a.ten_cong_doan, cv_b.ten_cong_doan = "In-Test-LK", "Be-Test-LK"
    db.commit()
    authz = _authz(db)

    tat_ca = kcs_bao_cao.bao_cao_kcs(db, admin, authz)
    assert tat_ca["tong_luot"] == 2
    assert {(r["ten"], r["so"]) for r in tat_ca["loc_cong_doan"]} == {("In-Test-LK", 1), ("Be-Test-LK", 1)}
    assert [(r["id"], r["so"]) for r in tat_ca["loc_khach"]] == [(customer.id, 2)]

    # Ô tìm khớp cả tên khách (cùng ô tìm với tab Lệnh).
    assert kcs_bao_cao.bao_cao_kcs(db, admin, authz, tu_khoa=customer.name)["tong_luot"] == 2

    # Lọc công đoạn: số của khách tính theo công đoạn đang chọn, danh sách công đoạn vẫn đủ để đổi.
    chi_in = kcs_bao_cao.bao_cao_kcs(db, admin, authz, cong_doan="In-Test-LK")
    assert chi_in["tong_luot"] == 1 and chi_in["lich_su"][0]["cong_viec_id"] == cv_a.id
    assert [(r["id"], r["so"]) for r in chi_in["loc_khach"]] == [(customer.id, 1)]
    assert len(chi_in["loc_cong_doan"]) == 2

    assert kcs_bao_cao.bao_cao_kcs(db, admin, authz, khach_id=customer.id)["tong_luot"] == 2
    khac = kcs_bao_cao.bao_cao_kcs(db, admin, authz, khach_id=customer.id + 999)
    assert khac["tong_luot"] == 0 and khac["loc_cong_doan"] == []
    # Khách đang chọn mà kỳ không còn lượt nào vẫn có tên (số 0) cho khối điều kiện đã áp.
    ngoai_ky = kcs_bao_cao.bao_cao_kcs(db, admin, authz, khach_id=customer.id, tu=date(2000, 1, 1), den=date(2000, 1, 2))
    assert [(r["id"], r["so"]) for r in ngoai_ky["loc_khach"]] == [(customer.id, 0)]
    # Excel đi cùng nguồn dòng nên cùng bộ lọc.
    content, _fn = kcs_bao_cao.xuat_excel_kcs(db, admin, authz, cong_doan="Be-Test-LK")
    ws = load_workbook(BytesIO(content))["Kết quả KCS"]
    assert [r[3] for r in ws.iter_rows(min_row=2, values_only=True)] == ["Be-Test-LK"]


def test_bao_cao_http_nhan_ky_theo_quy_uoc_chung(client):
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    q = "tu_ngay=2026-10-01&den_ngay=2026-10-31&moc=kiem&khach_id=1&cong_doan=In&tu_khoa=LSX"
    r = client.get(f"/api/san-xuat/kcs/bao-cao?{q}", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["loc_khach"] == [] and r.json()["loc_cong_doan"] == []
    assert client.get(f"/api/san-xuat/kcs/bao-cao/export.xlsx?{q}", headers=h).status_code == 200
    assert client.get("/api/san-xuat/kcs/bao-cao?moc=tao", headers=h).status_code == 422


# --- Bảng "Kết quả đã ghi": lịch sử đọc từ DB, không phải state phiên của FE -------------------
def test_lich_su_kem_nguoi_kiem_va_trang_thai_gui_kho(db, orders, lsx_svc, admin, customer):
    """`lich_su` trả MỌI lần kiểm trong phạm vi, kèm NGƯỜI KIỂM (tài khoản đăng nhập) — và chịu
    đúng filter như KPI. Chỉ công đoạn cuối nhóm mới có trạng thái gửi kho."""
    _to_g, cv_g, res_g = _batch(db, orders, lsx_svc, admin, customer, dat=17, khong_dat=3,
                                ma="KCS-LS-GIUA")
    _to_c, cv_c, res_c = _batch(db, orders, lsx_svc, admin, customer, dat=90, khong_dat=10,
                                ma="KCS-LS-CUOI", cuoi=True)
    kb_c = db.get(SanXuatKcsBatch, res_c["kcs_batch_id"])
    kb_c.bat_dau = kb_c.ket_thuc = kb_c.bat_dau + timedelta(days=2)   # lần kiểm cuối mới hơn
    db.commit()

    out = kcs_bao_cao.bao_cao_kcs(db, admin, _authz(db))

    assert len(out["lich_su"]) == 2
    theo_cv = {r["cong_viec_id"]: r for r in out["lich_su"]}
    r_g = theo_cv[cv_g.id]
    assert r_g["nguoi_ghi"] == res_g["nguoi_kcs"].name
    assert r_g["ten_cong_doan"] == cv_g.ten_cong_doan
    assert (r_g["so_luong_dat"], r_g["so_luong_khong_dat"]) == (0, 3)   # công đoạn giữa chỉ ghi lỗi
    assert r_g["trang_thai_gui_kho"] == "khong_ap_dung"   # công đoạn giữa không gửi kho
    assert r_g["nguon_ma"] == db.get(Lsx, cv_g.lsx_id).ma
    r_c = theo_cv[cv_c.id]
    assert r_c["nguoi_ghi"] == res_c["nguoi_kcs"].name
    assert r_c["trang_thai_gui_kho"] == "chua_gui"
    assert out["lich_su"][0]["kcs_batch_id"] == res_c["kcs_batch_id"]   # mới nhất lên đầu

    # Cùng nguồn `_hang_kcs_theo_scope` với KPI ⇒ filter thu hẹp cả hai như nhau.
    lsx_c = db.get(Lsx, cv_c.lsx_id)
    chi_c = kcs_bao_cao.bao_cao_kcs(db, admin, _authz(db), lsx_id=lsx_c.id)
    assert chi_c["tong_luot"] == 1 and len(chi_c["lich_su"]) == 1


# --- RBAC: export gác quyền RIÊNG với read (§4.4, §4.1) — qua HTTP thật --------------------------
def test_export_yeu_cau_quyen_export_rieng_voi_read(client):
    login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login.status_code == 200, login.text
    headers_admin = {"Authorization": f"Bearer {login.json()['access_token']}"}

    def _nguoi(sess, username, to, vai):
        u = UserRepository(sess).create(
            username=username, name="NV Đọc Báo Cáo KCS", password_hash=hash_password("x"),
        )
        UserRepository(sess).set_assignment(u, department_id=to.id, role_id=vai.id, is_active=True)
        return u

    db2 = SessionLocal()
    try:
        to = Department(name="Tổ KCS Báo Cáo API", code="KCS-BC-API", la_san_xuat=True)
        db2.add(to)
        db2.flush()
        # Người 1: vai chỉ bật Xem trên dòng quyền theo tổ — không có ô tĩnh `san_xuat:export`.
        vai_to = RoleRepository(db2).create(name="KCS Bao Cao Xem To", department_id=to.id)
        u_to = _nguoi(db2, "kcs-bc-xem-to", to, vai_to)
        cap_quyen_to(db2, u_to, to, viec=())
        # Người 2: kiểu CŨ — ô tĩnh `san_xuat:read` phạm vi all, KHÔNG dòng quyền theo tổ nào.
        vai_cu = RoleRepository(db2).create(name="KCS Bao Cao Doc Cu", department_id=to.id)
        RoleRepository(db2).set_permission(
            role_id=vai_cu.id, module_key="san_xuat", can_read=True, scope=SCOPE_ALL,
        )
        u_cu = _nguoi(db2, "kcs-bc-doc-cu", to, vai_cu)
        db2.commit()
        headers_doc = {"Authorization": f"Bearer {create_access_token(str(u_to.id))}"}
        headers_cu = {"Authorization": f"Bearer {create_access_token(str(u_cu.id))}"}
    finally:
        db2.close()

    r_json = client.get("/api/san-xuat/kcs/bao-cao", headers=headers_doc)
    assert r_json.status_code == 200, r_json.text   # Xem ở một tổ đủ cho JSON

    r_json_cu = client.get("/api/san-xuat/kcs/bao-cao", headers=headers_cu)
    assert r_json_cu.status_code == 403, r_json_cu.text   # ô tĩnh `san_xuat:read` không còn mở Bàn tổ

    r_xlsx_doc = client.get("/api/san-xuat/kcs/bao-cao/export.xlsx", headers=headers_doc)
    assert r_xlsx_doc.status_code == 403, r_xlsx_doc.text   # không có Xem ở dòng `kcs` → chặn

    # Admin (Giám đốc, toàn quyền mọi dòng kể cả `kcs`) xuất được.
    r_xlsx_admin = client.get("/api/san-xuat/kcs/bao-cao/export.xlsx", headers=headers_admin)
    assert r_xlsx_admin.status_code == 200, r_xlsx_admin.text


def test_o_loc_cong_doan_doc_duoi_quyen_to_khong_can_quyen_danh_muc(client):
    """Người chỉ giữ quyền Xem theo tổ (vd tổ trưởng KCS) KHÔNG đọc được Danh mục công đoạn —
    trước đây màn KCS gọi `/api/cong-doan`, ăn 403 và ô lọc "Công đoạn" rỗng. Cửa riêng của KCS
    phải mở cho họ, chỉ trả công đoạn đang dùng, và vẫn chặn người không có quyền tổ nào."""
    db2 = SessionLocal()
    try:
        to = Department(name="Tổ KCS Lọc CĐ", code="KCS-LOC-CD", la_san_xuat=True)
        db2.add(to)
        db2.add(CongDoan(ma="CD-LOC-SONG", ten="Công đoạn còn dùng", nhom="print"))
        db2.add(CongDoan(ma="CD-LOC-NGUNG", ten="Công đoạn đã ngừng", nhom="print", active=False))
        db2.flush()
        vai = RoleRepository(db2).create(name="KCS Loc CD Xem To", department_id=to.id)
        u_to = UserRepository(db2).create(
            username="kcs-loc-cd-to", name="Tổ trưởng KCS", password_hash=hash_password("x"))
        UserRepository(db2).set_assignment(u_to, department_id=to.id, role_id=vai.id, is_active=True)
        cap_quyen_to(db2, u_to, to, viec=())
        vai_trong = RoleRepository(db2).create(name="KCS Loc CD Trong", department_id=to.id)
        u_trong = UserRepository(db2).create(
            username="kcs-loc-cd-trong", name="Không quyền tổ", password_hash=hash_password("x"))
        UserRepository(db2).set_assignment(
            u_trong, department_id=to.id, role_id=vai_trong.id, is_active=True)
        db2.commit()
        h_to = {"Authorization": f"Bearer {create_access_token(str(u_to.id))}"}
        h_trong = {"Authorization": f"Bearer {create_access_token(str(u_trong.id))}"}
    finally:
        db2.close()

    assert client.get("/api/cong-doan?size=200&active=true", headers=h_to).status_code == 403

    r = client.get("/api/san-xuat/kcs/cong-doan", headers=h_to)
    assert r.status_code == 200, r.text
    ma = {c["ma"]: c for c in r.json()["items"]}
    assert ma["CD-LOC-SONG"] == {
        "id": ma["CD-LOC-SONG"]["id"], "ma": "CD-LOC-SONG", "ten": "Công đoạn còn dùng",
        "nhom": "print",
    }
    assert "CD-LOC-NGUNG" not in ma

    assert client.get("/api/san-xuat/kcs/cong-doan", headers=h_trong).status_code == 403


def test_nguoi_kcs_khong_giu_quyen_to_van_mo_duoc_bao_cao_va_chot_nhom(client):
    """Người chỉ có Xem ở dòng `kcs`, không giữ dòng quyền tổ nào — màn KCS vẫn phải đọc được
    dashboard, ô lọc công đoạn, điều kiện chốt nhóm và xuất Excel (không 403)."""
    db2 = SessionLocal()
    try:
        phong = Department(name="Tổ KCS Thuần", code="KCS-THUAN")
        db2.add(phong)
        db2.flush()
        vai = RoleRepository(db2).create(name="KCS Thuan Khong Quyen", department_id=phong.id)
        RoleRepository(db2).set_permission(role_id=vai.id, module_key="kcs", scope="all",
                                           can_read=True)
        u = UserRepository(db2).create(
            username="kcs-thuan", name="KCS thuần", password_hash=hash_password("x"))
        UserRepository(db2).set_assignment(u, department_id=phong.id, role_id=vai.id, is_active=True)
        db2.commit()
        h = {"Authorization": f"Bearer {create_access_token(str(u.id))}"}
    finally:
        db2.close()

    assert client.get("/api/san-xuat/kcs/bao-cao", headers=h).status_code == 200
    assert client.get("/api/san-xuat/kcs/cong-doan", headers=h).status_code == 200
    assert client.get("/api/san-xuat/kho/nhom/999999/dieu-kien-dong", headers=h).status_code != 403
    assert client.get("/api/san-xuat/kcs/bao-cao/export.xlsx", headers=h).status_code == 200


# --- §9 mục 10: Excel áp đúng scope như dashboard (cùng filter → cùng tổng) ---------------------
def test_export_ap_dung_scope_giong_dashboard(db, orders, lsx_svc, admin, customer):
    to_x, _cv_x, _res_x = _batch(db, orders, lsx_svc, admin, customer, ma="KCS-SC8-X")
    to_y, _cv_y, _res_y = _batch(db, orders, lsx_svc, admin, customer, ma="KCS-SC8-Y")
    nguoi = _nguoi_xem_x_tron_y_cua_toi(db, to_x, to_y)
    authz = _authz(db)

    out = kcs_bao_cao.bao_cao_kcs(db, nguoi, authz)
    content, _fn = kcs_bao_cao.xuat_excel_kcs(db, nguoi, authz)
    wb = load_workbook(BytesIO(content))
    ws1 = wb["Kết quả KCS"]

    assert ws1.max_row - 1 == out["tong_luot"] == 1


# --- Excel: tên sheet + header đúng -------------------------------------------------------------
def test_excel_ten_sheet_va_header_dung(db, orders, lsx_svc, admin, customer):
    _batch(db, orders, lsx_svc, admin, customer, ma="KCS-XL-HD")

    content, _fn = kcs_bao_cao.xuat_excel_kcs(db, admin, _authz(db))
    wb = load_workbook(BytesIO(content))

    assert wb.sheetnames == ["Tổng hợp", "Theo công đoạn", "Các lần ghi lỗi", "Kết quả KCS", "Chi tiết checklist"]
    assert [c.value for c in wb["Các lần ghi lỗi"][1]] == [
        "Lúc", "Lệnh", "Sản phẩm", "Khách hàng", "Công đoạn gây lỗi", "Tiêu chí", "Ghi chú",
        "Bắt ở", "Số lỗi", "Đơn vị", "Tổ chịu", "Người ghi", "URL ảnh",
    ]
    assert wb["Các lần ghi lỗi"].max_row == 2   # một lần ghi lỗi "Lem mực"
    header1 = [c.value for c in wb["Kết quả KCS"][1]]
    assert header1 == [
        "Mã kết quả", "Thời điểm", "Mã LSX", "Công đoạn", "Tổ", "Số kiểm", "Số đạt", "Số lỗi",
        "Đơn vị", "Kết luận", "Ghi chú", "Người kiểm", "Mô tả lỗi", "URL ảnh",
        "Công đoạn chịu lỗi",
    ]
    header2 = [c.value for c in wb["Chi tiết checklist"][1]]
    assert header2 == [
        "Mã kết quả", "Thời điểm", "Công đoạn", "Mã tiêu chí", "Tên tiêu chí", "Đạt", "Ghi chú",
    ]


# --- Excel: số dòng khớp dữ liệu đã lọc, và batch thiếu 1 trong 2 field JSON thì Sheet 2 = 0 dòng
def test_excel_so_dong_khop_du_lieu(db, orders, lsx_svc, admin, customer):
    _to_a, _cv_a, res_a = _batch_voi_checklist(
        db, orders, lsx_svc, admin, customer, ma="KCS-XL-CNT-A",
        checklist_ket_qua=[
            {"thu_tu": 1, "dat": True, "ghi_chu": None},
            {"thu_tu": 2, "dat": False, "ghi_chu": "lem mực"},
        ],
    )
    _batch(db, orders, lsx_svc, admin, customer, ma="KCS-XL-CNT-B")   # KHÔNG gửi checklist

    authz = _authz(db)
    out = kcs_bao_cao.bao_cao_kcs(db, admin, authz)
    content, _fn = kcs_bao_cao.xuat_excel_kcs(db, admin, authz)
    wb = load_workbook(BytesIO(content))

    ws1 = wb["Kết quả KCS"]
    assert ws1.max_row - 1 == out["tong_luot"] == 2

    ws2 = wb["Chi tiết checklist"]
    assert ws2.max_row - 1 == 2   # chỉ batch A góp 2 dòng (2 tiêu chí); B góp 0 dòng
    # Giờ ở sheet tiêu chí trùng giờ sheet kết quả của cùng lần kiểm — trước 08/10/2026 bị quy
    # đổi giờ hai lần, lệch đúng bằng múi giờ máy chủ.
    gio_kq = {r[0]: r[1] for r in ws1.iter_rows(min_row=2, values_only=True)}
    assert all(r[1] == gio_kq[r[0]] for r in ws2.iter_rows(min_row=2, values_only=True))


def test_excel_url_anh_xuat_hien_dung_cot(db, orders, lsx_svc, admin, customer):
    _to, cv = _cv_kcs(db, orders, lsx_svc, admin, customer, ma="KCS-XL-IMG")
    _ghi_tot(db, cv, 100)
    _d, nguoi = _to_kiem(db, ma="KCS-XL-IMG-KCS")
    anh_2 = [
        {"file_name": "a.jpg", "file_url": "https://x/a.jpg", "file_type": "image/jpeg"},
        {"file_name": "b.jpg", "file_url": "https://x/b.jpg", "file_type": "image/jpeg"},
    ]
    res = kcs.kiem_cong_doan(db, user=nguoi, cong_viec_id=cv.id, so_dat=95, so_loi=5,
                             loi_mo_ta="Lỗi có ảnh", anh=anh_2)

    content, _fn = kcs_bao_cao.xuat_excel_kcs(db, admin, _authz(db))
    wb = load_workbook(BytesIO(content))
    ws1 = wb["Kết quả KCS"]

    dong = next(r for r in ws1.iter_rows(min_row=2) if r[0].value == res["kcs_batch_id"])
    url_cell = dong[13].value   # cột 14 "URL ảnh" (index 0-based 13)
    assert "https://x/a.jpg" in url_cell and "https://x/b.jpg" in url_cell


def test_checklist_thieu_snapshot_khong_vo_khong_ra_dong_rac(db, orders, lsx_svc, admin, customer):
    _to, cv = _cv_kcs(db, orders, lsx_svc, admin, customer, ma="KCS-XL-MISS", cuoi=True)
    # cv.kcs_tieu_chi_json CHƯA gắn (None) — việc cũ trước module này — nhưng lần kiểm VẪN gửi
    # checklist_ket_qua (form không biết cv thiếu snapshot).
    assert cv.kcs_tieu_chi_json is None
    _ghi_tot(db, cv, 50)
    _d, nguoi = _to_kiem(db, ma="KCS-XL-MISS-KCS")
    res = kcs.kiem_cong_doan(
        db, user=nguoi, cong_viec_id=cv.id, so_dat=50,
        checklist_ket_qua=[{"thu_tu": 1, "dat": True, "ghi_chu": None}],
    )
    kb = db.get(SanXuatKcsBatch, res["kcs_batch_id"])
    assert kb.checklist_json   # lần kiểm CÓ checklist_json, chỉ thiếu snapshot ở cv

    content, _fn = kcs_bao_cao.xuat_excel_kcs(db, admin, _authz(db))
    wb = load_workbook(BytesIO(content))
    ws2 = wb["Chi tiết checklist"]

    assert ws2.max_row == 1   # chỉ header — không văng lỗi, không dòng rác


# --- Dạng Bảng | Biểu đồ (11/10/2026) -------------------------------------------------------------
def test_tach_tieu_chi_theo_ten_dai_truoc():
    """Dòng lỗi tick tiêu chí lưu "<tên>" hoặc "<tên>: <ghi chú>"; không khớp tên nào là Lỗi khác."""
    from types import SimpleNamespace

    g = SimpleNamespace(kcs_tieu_chi_json=[{"ten": "Không lệch"}, {"ten": "Không lệch màu"}])
    assert kcs_bao_cao._tach_tieu_chi("Không lệch màu", g) == ("Không lệch màu", None)
    assert kcs_bao_cao._tach_tieu_chi("Không lệch màu: mép phải", g) == ("Không lệch màu", "mép phải")
    assert kcs_bao_cao._tach_tieu_chi("Không lệch: x", g) == ("Không lệch", "x")
    assert kcs_bao_cao._tach_tieu_chi("Lem mực", g) == (None, "Lem mực")
    assert kcs_bao_cao._tach_tieu_chi("Lem mực", None) == (None, "Lem mực")


def test_lan_loi_phan_tich_va_bam_loc(db, orders, lsx_svc, admin, customer):
    """Mỗi lần ghi lỗi một dòng; ba chiều đếm SỐ LẦN kèm số theo đơn vị; bấm chọn một mục chỉ thu
    hẹp phần lỗi và KHÔNG thu hẹp chính chiều của nó; lần ghi lỗi / lệnh có lỗi bám bấm-lọc còn
    lượt kiểm theo thanh lọc; danh sách cắt trang ở máy chủ."""
    _ta, cv_a, _ra = _batch(db, orders, lsx_svc, admin, customer, dat=90, khong_dat=10, ma="KCS-PT-A")
    _tb, cv_b, _rb = _batch(db, orders, lsx_svc, admin, customer, dat=95, khong_dat=5, ma="KCS-PT-B")
    cv_a.ten_cong_doan, cv_b.ten_cong_doan = "In A", "Cán B"
    db.commit()
    authz = _authz(db)

    out = kcs_bao_cao.bao_cao_kcs(db, admin, authz)
    assert out["so_lan_ghi_loi"] == out["lan_loi_tong"] == 2
    cd = {m["ten"]: m for m in out["phan_tich"]["cong_doan"]}
    assert (cd["In A"]["lan"], cd["In A"]["so_theo_dv"], cd["In A"]["tai_cho"], cd["In A"]["lot"]) == (
        1, {"cái": 10}, 1, 0)
    assert [m["ten"] for m in out["phan_tich"]["tieu_chi"]] == ["Lỗi khác"]
    assert sum(cd["In A"]["ngay"].values()) == 1
    dong = next(r for r in out["lan_loi"] if r["cong_doan"] == "In A")
    assert (dong["tieu_chi"], dong["ghi_chu"], dong["tai_cho"], dong["so_luong"]) == (None, "Lem mực", True, 10)
    assert dong["anh"] and dong["nguoi_ghi"]
    assert {r["lan"] for r in out["nhiet_cong_doan"]} == {1}

    out2 = kcs_bao_cao.bao_cao_kcs(db, admin, authz, chon={"cong_doan": "In A"})
    assert out2["lan_loi_tong"] == 1 and out2["lan_loi"][0]["cong_doan"] == "In A"
    assert {m["ten"] for m in out2["phan_tich"]["cong_doan"]} == {"In A", "Cán B"}
    assert sum(m["lan"] for m in out2["phan_tich"]["to"]) == 1
    assert {r["ten"] for r in out2["nhiet_cong_doan"]} == {"In A", "Cán B"}
    assert len(out2["nhiet_to"]) == 1
    assert (out2["so_lan_ghi_loi"], out2["so_lenh_loi"], out2["tong_luot"]) == (1, 1, 2)

    out3 = kcs_bao_cao.bao_cao_kcs(db, admin, authz, trang=2, co_trang=1)
    assert out3["lan_loi_tong"] == 2 and len(out3["lan_loi"]) == 1


def test_ky_truoc_cung_do_dai_va_truc_lien(db, orders, lsx_svc, admin, customer):
    """Kỳ trước = liền trước, cùng độ dài tính tới hôm nay (kỳ chưa hết thì không so với cả kỳ);
    trục ngày liền từ đầu kỳ tới hôm nay; "Mọi thời gian" không có kỳ trước."""
    _batch(db, orders, lsx_svc, admin, customer, dat=90, khong_dat=10, ma="KCS-KT", cuoi=True)
    authz = _authz(db)
    hom_nay = kcs_bao_cao._hom_nay()

    out = kcs_bao_cao.bao_cao_kcs(db, admin, authz, tu=hom_nay - timedelta(days=2),
                                  den=hom_nay + timedelta(days=10))
    kt = out["ky_truoc"]
    assert (kt["tu"], kt["den"]) == (hom_nay - timedelta(days=5), hom_nay - timedelta(days=3))
    assert (kt["tong_luot"], kt["so_lan_ghi_loi"], kt["ty_le_dat"]) == (0, 0, None)
    assert [m["khoa"] for m in out["truc"]] == [
        (hom_nay - timedelta(days=i)).isoformat() for i in (2, 1, 0)]
    assert (out["truc"][-1]["nhan_cuoi"], out["truc"][-1]["dat_cuoi"]) == (100, 90)
    assert out["so_lenh_loi"] == 1

    assert kcs_bao_cao.bao_cao_kcs(db, admin, authz)["ky_truoc"] is None


def test_excel_theo_dieu_kien_tab(db, orders, lsx_svc, admin, customer):
    """Excel xuất đúng cái tab đang chọn: bấm-lọc thu hẹp sheet lần ghi lỗi + hai số lỗi ở Tổng
    hợp, sheet 2 theo cách xem, sheet Kết quả KCS vẫn theo thanh lọc (11/10/2026)."""
    _ta, cv_a, _ra = _batch(db, orders, lsx_svc, admin, customer, dat=90, khong_dat=10, ma="KCS-XL-TAB-A")
    _tb, cv_b, _rb = _batch(db, orders, lsx_svc, admin, customer, dat=95, khong_dat=5, ma="KCS-XL-TAB-B")
    cv_a.ten_cong_doan, cv_b.ten_cong_doan = "In A", "Cán B"
    db.commit()

    content, _fn = kcs_bao_cao.xuat_excel_kcs(db, admin, _authz(db), chon={"cong_doan": "In A"}, xem="to")
    wb = load_workbook(BytesIO(content))
    assert wb.sheetnames[:3] == ["Tổng hợp", "Theo tổ", "Các lần ghi lỗi"]
    lan = list(wb["Các lần ghi lỗi"].iter_rows(min_row=2, values_only=True))
    assert len(lan) == 1 and lan[0][4] == "In A"
    tong = {r[0]: r[1] for r in wb["Tổng hợp"].iter_rows(values_only=True) if r and r[0]}
    assert (tong["Công đoạn gây lỗi"], tong["Lần ghi lỗi"], tong["Lượt kiểm"], tong["Cách xem"]) == (
        "In A", 1, 2, "Theo tổ")
    assert wb["Theo tổ"].max_row == 2
    assert wb["Kết quả KCS"].max_row - 1 == 2

