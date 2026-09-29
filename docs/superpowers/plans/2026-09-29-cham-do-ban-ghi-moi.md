# Chấm đỏ thanh bên = "có bản ghi mới" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi mục thanh bên hiện CHẤM ĐỎ khi có bản ghi mới kể từ lần cuối người dùng mở màn đó; mở màn là mất chấm. Thay ~15 lượt ĐẾM (có lượt nặng CPU) bằng MỘT lượt hỏi.

**Architecture:** Mở rộng cơ chế sẵn có `module_notifications` (hiện chỉ Mua hàng + Kế toán): mỗi sự kiện ghi một dòng theo KÊNH (= khoá module RBAC của màn), kèm `required_action` (ô quyền người nhận phải có, NULL = chỉ cần Xem) và `department_id` (phòng của bản ghi, lọc theo phạm vi quyền). Mỗi người giữ mốc "đã xem tới id nào" theo kênh. Máy chủ trả MỘT tóm tắt `{kênh: bản ghi mới nhất chưa xem}`; giao diện đổi kênh → mục thanh bên, hiện chấm, bắn toast khi id tăng, gọi mark-read khi mở màn.

**Tech Stack:** FastAPI + SQLAlchemy 2 (SQLite test / Postgres dev-prod), React + TypeScript + Vitest.

**Spec:** mục "Thiết kế đã chốt" ngay dưới (chốt trong hội thoại 29/09/2026).

## Thiết kế đã chốt

- Chấm đỏ = có bản ghi mới; NHÌN THẤY (mở màn) là mất chấm. Không in số (đã làm: `Sidebar.tsx`, `sidebar.css`).
- "Nhìn thấy" = mở màn đó, không phải mở từng bản ghi. Đang đứng trong màn mà có bản ghi mới ⇒ tự đánh dấu đã xem, không hiện chấm.
- Người tự tạo bản ghi không thấy chấm của chính mình (`actor_user_id`).
- Chấm KHÔNG còn nhắc việc tồn (chủ đã được báo và chấp nhận).
- Kế hoạch vật tư BỎ chấm (con số tính ra, không có bản ghi). Bài ghép 2 (màn đang ẩn) bỏ lượt đếm.

| Kênh | Nav thanh bên | `loai` (event_type) | Người nhận |
|---|---|---|---|
| `thu_mua` | `mua-hang` | (giữ nguyên các loại đang có) | như cũ |
| `ke_toan` | `ke-toan-don-mua-hang` | (giữ nguyên) | như cũ |
| `luong` | `luong` | `tam_ung_moi` | quyền `approve`, lọc phòng NV |
| | | `tam_ung_quyet_dinh` | đích danh người đứng tên |
| `nghi_phep` | `nghi-phep` | `nghi_phep_moi`, `nghi_phep_xin_huy` | quyền `approve`, lọc phòng NV |
| | | `nghi_phep_quyet_dinh` | đích danh |
| `tang_ca` | `tang-ca` | `tang_ca_moi`, `tang_ca_xin_huy` | quyền `approve`, lọc phòng NV |
| | | `tang_ca_quyet_dinh` | đích danh |
| `cham_cong` | `cham-cong` | `di_muon_moi` | quyền `approve_late_early`, lọc phòng NV |
| | | `di_muon_quyet_dinh`, `doi_ca` | đích danh |
| `bao_gia` | `bao-gia` | `bao_gia_cho_duyet` | quyền `approve_exception`, lọc phòng Sale |
| | | `bao_gia_quyet_dinh` | đích danh Sale soạn |
| `don_hang_ban` | `don-hang-ban` | `don_cho_coc` | quyền `record_deposit`, lọc phòng Sale |
| | | `don_du_coc` | đích danh Sale |
| `san_xuat` | `ke-hoach-sx` | `don_chuyen_sx` | ai Xem được Kế hoạch SX |
| `xep_lich` | `xep-lich` | `lenh_cho_xep` | ai Xem được Xếp lịch |
| `to_sx_<id>` | `thuc-hien-sx:<id>` | `viec_moi`, `ban_giao_den`, `ho_tro_cheo`, `kcs_bao_loi` | ai Xem được tổ đó |
| `kho` | `kho-main` | `kho_yeu_cau_moi` | đích danh danh sách `kho_notify_user_ids` |
| | | `kho_phan_hoi` | đích danh người tạo yêu cầu |
| `phieu_chi` | `ke-toan-phieu-chi` | `gia_cong_cho_chi` | đích danh `nguoi_lap_phieu_chi()` |
| `ky_thuat_may` | `sua-chua-may` | `bao_hong_moi` | đích danh `_nguoi_to_sua_chua` |
| `phieu_bao_tri` | `phieu-bao-tri` | `bao_tri_den_han` (1 lần/phiếu) | người thực hiện, không có thì `_nguoi_nhan_thong_bao` |
| `khach_hang` | `khach-hang` | `cham_soc_den_han` (1 lần/việc), `cham_soc_duoc_giao` | đích danh người phụ trách |

**Luật hiển thị** (người U, dòng N, N.id > mốc đã xem của U ở kênh N.channel, N.actor ≠ U):
- N.recipient_user_id = U ⇒ thấy (KHÔNG xét quyền — việc của chính mình).
- N.recipient_user_id NULL ⇒ thấy khi U có ô `N.required_action` (NULL = `read`) trên module = kênh, và:
  N.department_id NULL ⇒ thấy; phạm vi `all` ⇒ thấy; `department` ⇒ N.department_id ∈ cây phòng của U
  (`dept_subtree_ids`); `own` ⇒ không thấy.
- Kênh tổ `to_sx_<id>`: thấy khi U xem được tổ id (`quyen_to_cua(db,U).tron|rieng[VIEC_XEM]`).

## Global Constraints

- Tầng: `routers → services → repositories → DB`. Chỉ repository chạm SQL; `bao()` là service.
- KHÔNG Alembic: cột mới đi qua `backend/app/db_migrations.py` (id kế tiếp `0346_...`), đọc siêu dữ liệu (inspector) TRƯỚC mọi ALTER; cập nhật `docs/DB_SCHEMA.md` cùng lúc (guard test).
- `bao()` gọi SAU khi nghiệp vụ đã commit, hoặc truyền `commit=False` để dòng thông báo đi chung giao dịch và SSE chỉ bắn sau commit.
- UI tiếng Việt, không tiếng Anh. Không in số trên thanh bên.
- Verify: pytest NHẮM FILE (`cd backend; python -m pytest tests/<file> -q -p no:cacheprovider`) + `cd frontend; npx tsc --noEmit -p .` + `npx vitest run <file>`. KHÔNG chạy `./init.ps1`, KHÔNG pytest cả bộ (CI chạy).
- Commit message tiếng Việt, KHÔNG dòng Co-Authored-By. Không `git stash` (phiên song song đang có file frontend chưa commit — chỉ `git add` đúng file của Task).
- Không đụng `backend/app/models/*` ngoài `module_notification.py`.

---

### Task 1: Lõi máy chủ — kênh động, quyền + phòng, một lượt tóm tắt

**Files:**
- Modify: `backend/app/models/module_notification.py`
- Modify: `backend/app/repositories/module_notification_repo.py`
- Create: `backend/app/services/thong_bao_man.py`
- Modify: `backend/app/routers/module_notifications.py`
- Modify: `backend/app/schemas/module_notification.py`
- Modify: `backend/app/db_migrations.py` (append `0346_module_notification_quyen_phong`)
- Modify: `docs/DB_SCHEMA.md` (mục `module_notifications` ~dòng 6276, `module_notification_reads` ~6305)
- Create: `backend/tests/thong_bao_helpers.py`
- Create: `backend/tests/test_thong_bao_man.py`
- Modify: `backend/tests/test_duong_nong.py:248-253`, `backend/tests/test_purchases_api.py:157-260` (khớp định dạng tóm tắt mới)

**Interfaces:**
- Produces:
  - `app.services.thong_bao_man.bao(db, *, kenh: str, loai: str, actor_id: int | None, nguoi_nhan: int | Iterable[int] | None = None, quyen: str | None = None, phong_id: int | None = None, ma: str | None = None, chi_mot_lan: bool = False, commit: bool = True) -> int` (số dòng đã ghi)
  - `app.services.thong_bao_man.kenh_to(department_id: int) -> str` → `"to_sx_<id>"`
  - `app.services.thong_bao_man.kenh_hop_le(kenh: str) -> bool`
  - `app.services.thong_bao_man.trang_thai(db, authz, user) -> dict[str, dict]` → `{kenh: {"id": int, "loai": str, "ma": str | None}}`
  - `GET /api/module-notifications/summary` → `{"kenh": {kenh: {"id","loai","ma"}}}`
  - `POST /api/module-notifications/{kenh}/mark-read` → 204 (404 nếu kênh không hợp lệ; KHÔNG đòi quyền — chỉ dời mốc của chính mình)
  - SSE `{"type": "thong_bao_man", "kenh": str}`
  - Test helpers `tests/thong_bao_helpers.py`: `tao_nguoi(username, perms, *, phong: str = "Phòng thử chấm") -> int`, `dang_nhap(client, username) -> dict`, `tom_tat(client, h) -> dict`, `da_xem(client, h, kenh) -> None`

- [ ] **Step 1: Viết test hỏng** — `backend/tests/thong_bao_helpers.py`:

```python
"""Helper dùng chung cho test chấm đỏ thanh bên (module_notifications)."""
from __future__ import annotations

from app.db import SessionLocal
from app.repositories.rbac_repo import DepartmentRepository, RoleRepository
from app.repositories.user_repo import UserRepository
from app.security import hash_password

PW = "matkhau123"


def tao_nguoi(username: str, perms: dict[str, dict], *, phong: str = "Phòng thử chấm") -> int:
    db = SessionLocal()
    try:
        depts, roles, users = DepartmentRepository(db), RoleRepository(db), UserRepository(db)
        dept = depts.get_by_name(phong) or depts.create(name=phong)
        role = roles.create(name=f"Vai {username}", department_id=dept.id)
        for module, p in perms.items():
            roles.set_permission(role_id=role.id, module_key=module, **p)
        u = users.create(username=username, name=username, password_hash=hash_password(PW))
        users.set_assignment(u, department_id=dept.id, role_id=role.id, is_active=True)
        return u.id
    finally:
        db.close()


def dang_nhap(client, username: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"username": username, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def tom_tat(client, h) -> dict:
    r = client.get("/api/module-notifications/summary", headers=h)
    assert r.status_code == 200, r.text
    return r.json()["kenh"]


def da_xem(client, h, kenh: str) -> None:
    r = client.post(f"/api/module-notifications/{kenh}/mark-read", headers=h)
    assert r.status_code == 204, r.text
```

(Kiểm `hash_password` import đúng chỗ: `grep -n "def hash_password" backend/app -r`; `test_duong_nong.py` đang import nó — sao cùng dòng import.)

`backend/tests/test_thong_bao_man.py`:

```python
from __future__ import annotations

from app.db import SessionLocal
from app.models.role import SCOPE_ALL, SCOPE_DEPARTMENT, SCOPE_OWN
from app.repositories.rbac_repo import DepartmentRepository
from app.services.thong_bao_man import bao, kenh_to

from .thong_bao_helpers import da_xem, dang_nhap, tao_nguoi, tom_tat


def _bao(**kw):
    db = SessionLocal()
    try:
        return bao(db, **kw)
    finally:
        db.close()


def _phong(ten: str) -> int:
    db = SessionLocal()
    try:
        d = DepartmentRepository(db)
        return (d.get_by_name(ten) or d.create(name=ten)).id
    finally:
        db.close()


def test_phat_rong_theo_quyen_xem_va_mo_man_la_mat(client):
    uid = tao_nguoi("xem_sx", {"san_xuat": dict(can_read=True, scope=SCOPE_ALL)})
    tao_nguoi("khong_sx", {"khach_hang": dict(can_read=True, scope=SCOPE_OWN)})
    h, h2 = dang_nhap(client, "xem_sx"), dang_nhap(client, "khong_sx")
    assert tom_tat(client, h) == {}
    _bao(kenh="san_xuat", loai="don_chuyen_sx", actor_id=None, ma="DH26-0001")
    tt = tom_tat(client, h)
    assert tt["san_xuat"]["loai"] == "don_chuyen_sx" and tt["san_xuat"]["ma"] == "DH26-0001"
    assert "san_xuat" not in tom_tat(client, h2)
    da_xem(client, h, "san_xuat")
    assert tom_tat(client, h) == {}


def test_nguoi_tao_khong_thay_cham_cua_minh(client):
    uid = tao_nguoi("tu_tao", {"san_xuat": dict(can_read=True, scope=SCOPE_ALL)})
    _bao(kenh="san_xuat", loai="don_chuyen_sx", actor_id=uid)
    assert tom_tat(client, dang_nhap(client, "tu_tao")) == {}


def test_quyen_duyet_va_pham_vi_phong(client):
    p_a, p_b = _phong("Phòng A chấm"), _phong("Phòng B chấm")
    tao_nguoi("duyet_a", {"luong": dict(can_read=True, can_approve=True, scope=SCOPE_DEPARTMENT)},
              phong="Phòng A chấm")
    tao_nguoi("duyet_all", {"luong": dict(can_read=True, can_approve=True, scope=SCOPE_ALL)})
    tao_nguoi("chi_xem", {"luong": dict(can_read=True, scope=SCOPE_ALL)})
    _bao(kenh="luong", loai="tam_ung_moi", actor_id=None, quyen="approve", phong_id=p_b)
    assert "luong" not in tom_tat(client, dang_nhap(client, "duyet_a"))
    assert "luong" in tom_tat(client, dang_nhap(client, "duyet_all"))
    assert "luong" not in tom_tat(client, dang_nhap(client, "chi_xem"))
    _bao(kenh="luong", loai="tam_ung_moi", actor_id=None, quyen="approve", phong_id=p_a)
    assert "luong" in tom_tat(client, dang_nhap(client, "duyet_a"))


def test_dich_danh_khong_can_quyen_man(client):
    uid = tao_nguoi("tho_ca", {"khach_hang": dict(can_read=True, scope=SCOPE_OWN)})
    tao_nguoi("nguoi_khac", {"cham_cong": dict(can_read=True, scope=SCOPE_ALL)})
    _bao(kenh="cham_cong", loai="doi_ca", actor_id=None, nguoi_nhan=uid)
    assert tom_tat(client, dang_nhap(client, "tho_ca"))["cham_cong"]["loai"] == "doi_ca"
    assert "cham_cong" not in tom_tat(client, dang_nhap(client, "nguoi_khac"))


def test_chi_mot_lan_theo_ma(client):
    assert _bao(kenh="phieu_bao_tri", loai="bao_tri_den_han", actor_id=None, ma="BT-1",
                chi_mot_lan=True) == 1
    assert _bao(kenh="phieu_bao_tri", loai="bao_tri_den_han", actor_id=None, ma="BT-1",
                chi_mot_lan=True) == 0


def test_kenh_to_theo_quyen_xem_to(client):
    to_id = _phong("Tổ thử chấm")
    tao_nguoi("nguoi_to", {kenh_to(to_id): dict(can_read=True, scope=SCOPE_ALL)})
    tao_nguoi("to_khac", {"san_xuat": dict(can_read=True, scope=SCOPE_ALL)})
    _bao(kenh=kenh_to(to_id), loai="viec_moi", actor_id=None)
    assert kenh_to(to_id) in tom_tat(client, dang_nhap(client, "nguoi_to"))
    assert kenh_to(to_id) not in tom_tat(client, dang_nhap(client, "to_khac"))


def test_kenh_la_bi_tu_choi(client):
    import pytest
    with pytest.raises(ValueError):
        _bao(kenh="khong_ton_tai", loai="x", actor_id=None)
    with pytest.raises(ValueError):
        _bao(kenh="luong", loai="x", actor_id=None, quyen="quyen_bia")



def test_mark_read_kenh_la_404(client, seed_credentials):
    tok = client.post("/api/auth/login", json=seed_credentials).json()["access_token"]
    r = client.post("/api/module-notifications/khong_ton_tai/mark-read",
                    headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 404
```

Lưu ý kênh tổ: dòng quyền `to_sx_<id>` chỉ tồn tại khi phòng là TỔ trong khối SX (`dong_bo_dong_quyen_to`). Nếu `set_permission` báo lỗi FK vì `modules` chưa có `to_sx_<id>`, trong test tạo hàng module trước: `ModuleRepository(db).create(key=kenh_to(to_id), label="Tổ thử chấm")`, và `trang_thai` phải lấy tổ từ `quyen_to_cua` — nếu `quyen_to_cua` đòi tổ thuộc cây khối SX, dựng tổ con của phòng có cờ sản xuất như `tests/test_quyen_to*.py` đang làm (grep `la_san_xuat` trong tests để sao đúng cách dựng).

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `cd backend; python -m pytest tests/test_thong_bao_man.py -q -p no:cacheprovider`
Expected: FAIL — `ModuleNotFoundError: app.services.thong_bao_man`.

- [ ] **Step 3: Model** — `backend/app/models/module_notification.py`, thêm vào `ModuleNotification` sau `recipient_user_id`:

```python
    # Ô quyền người nhận PHẢI có trên module = kênh (vd `approve`); NULL = chỉ cần Xem màn (mg 0346).
    required_action: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Phòng của BẢN GHI gây ra thông báo — lọc theo phạm vi `department` của người nhận (mg 0346).
    # NULL = không gắn phòng (ai đủ quyền đều thấy).
    department_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
```

Sửa docstring đầu file: "Thông báo chưa đọc theo màn nghiệp vụ — nguồn DUY NHẤT của chấm đỏ thanh bên (29/09/2026)".

- [ ] **Step 4: Migration** — cuối `backend/app/db_migrations.py`:

```python
def _migrate_module_notification_quyen_phong(db: Session) -> None:
    """Chấm đỏ thanh bên cho MỌI màn (29/09/2026): thêm ô quyền người nhận phải có + phòng của bản
    ghi để lọc người duyệt theo phạm vi. Đọc siêu dữ liệu TRƯỚC mọi ALTER (bài học mg 0343)."""
    bind = db.get_bind()
    insp = inspect(bind)
    if "module_notifications" not in set(insp.get_table_names()):
        return
    cot = _existing_columns(insp, "module_notifications")
    if "required_action" not in cot:
        db.execute(text("ALTER TABLE module_notifications ADD COLUMN required_action VARCHAR(40)"))
    if "department_id" not in cot:
        db.execute(text(
            "ALTER TABLE module_notifications ADD COLUMN department_id INTEGER "
            "REFERENCES departments(id) ON DELETE SET NULL"
        ))
    db.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_module_notifications_recipient_channel "
        "ON module_notifications (recipient_user_id, channel, id)"
    ))
    db.commit()


MIGRATIONS.append(("0346_module_notification_quyen_phong", _migrate_module_notification_quyen_phong))
```

Thêm `Index("ix_module_notifications_recipient_channel", "recipient_user_id", "channel", "id")` vào `__table_args__` của model để DB trắng cũng có. Nếu 0346 đã bị ai dùng (`grep -n '"0346_' backend/app/db_migrations.py`), lấy số kế tiếp.

- [ ] **Step 5: Repository** — thay toàn bộ `backend/app/repositories/module_notification_repo.py`:

```python
"""Data access cho chấm đỏ thanh bên — thông báo theo KÊNH (= khoá module của màn)."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.orm import Session

from ..models.module_notification import ModuleNotification, ModuleNotificationRead

CHANNEL_THU_MUA = "thu_mua"
CHANNEL_KE_TOAN = "ke_toan"


@dataclass(frozen=True)
class DieuKienKenh:
    """Một vế "người gọi được thấy dòng phát rộng nào" của một kênh.

    `quyen` None = dòng chỉ đòi Xem; `phong_ids` None = mọi phòng, () = chỉ dòng không gắn phòng."""
    kenh: str
    quyen: str | None
    phong_ids: tuple[int, ...] | None


class ModuleNotificationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        *,
        channel: str,
        event_type: str,
        actor_user_id: int | None,
        recipient_user_id: int | None = None,
        source_code: str | None = None,
        required_action: str | None = None,
        department_id: int | None = None,
        commit: bool = True,
    ) -> ModuleNotification:
        row = ModuleNotification(
            channel=channel,
            event_type=event_type,
            actor_user_id=actor_user_id,
            recipient_user_id=recipient_user_id,
            source_code=(source_code or "").strip() or None,
            required_action=required_action,
            department_id=department_id,
        )
        self.db.add(row)
        if commit:
            self.db.commit()
            self.db.refresh(row)
        else:
            self.db.flush()
        return row

    def da_co(self, *, kenh: str, loai: str, ma: str | None) -> bool:
        return self.db.execute(
            select(ModuleNotification.id).where(
                ModuleNotification.channel == kenh,
                ModuleNotification.event_type == loai,
                ModuleNotification.source_code == ma,
            ).limit(1)
        ).first() is not None

    def moi_nhat(self, user_id: int, dieu_kien: list[DieuKienKenh]) -> dict[str, dict]:
        """Mỗi kênh: dòng MỚI NHẤT người gọi chưa xem và được thấy. MỘT câu gom + (nếu có) MỘT câu
        lấy chi tiết. Dòng đích danh (`recipient_user_id` = mình) không xét quyền."""
        N, R = ModuleNotification, ModuleNotificationRead
        ve = []
        for d in dieu_kien:
            c = [
                N.channel == d.kenh,
                N.required_action.is_(None) if d.quyen is None else N.required_action == d.quyen,
            ]
            if d.phong_ids is not None:
                c.append(
                    or_(N.department_id.is_(None), N.department_id.in_(d.phong_ids))
                    if d.phong_ids else N.department_id.is_(None)
                )
            ve.append(and_(*c))
        phat_rong = and_(N.recipient_user_id.is_(None), or_(*ve)) if ve else false()
        gom = (
            select(N.channel, func.max(N.id))
            .select_from(N)
            .outerjoin(R, and_(R.user_id == user_id, R.channel == N.channel))
            .where(
                N.id > func.coalesce(R.last_read_notification_id, 0),
                or_(N.actor_user_id.is_(None), N.actor_user_id != user_id),
                or_(N.recipient_user_id == user_id, phat_rong),
            )
            .group_by(N.channel)
        )
        ids = [i for _k, i in self.db.execute(gom).all()]
        if not ids:
            return {}
        rows = self.db.execute(
            select(N.id, N.channel, N.event_type, N.source_code).where(N.id.in_(ids))
        ).all()
        return {r.channel: {"id": r.id, "loai": r.event_type, "ma": r.source_code} for r in rows}

    def mark_read(self, *, user_id: int, channel: str) -> None:
        latest_id = self.db.execute(
            select(func.max(ModuleNotification.id)).where(ModuleNotification.channel == channel)
        ).scalar_one()
        row = self.db.execute(
            select(ModuleNotificationRead).where(
                ModuleNotificationRead.user_id == user_id,
                ModuleNotificationRead.channel == channel,
            )
        ).scalar_one_or_none()
        if row is None:
            self.db.add(ModuleNotificationRead(
                user_id=user_id, channel=channel, last_read_notification_id=int(latest_id or 0),
            ))
        else:
            row.last_read_notification_id = int(latest_id or 0)
        self.db.commit()
```

Rồi `grep -rn "CHANNELS\|unread_counts" backend/app backend/tests` — không nơi nào còn dùng (router sửa ở Step 7); sửa chỗ nào còn sót.

- [ ] **Step 6: Service** — tạo `backend/app/services/thong_bao_man.py`:

```python
"""Chấm đỏ thanh bên = "có bản ghi mới kể từ lần mở màn trước" (chủ chốt 29/09/2026).

MỘT điểm ghi (`bao`) cho mọi module + MỘT lượt hỏi (`trang_thai`) cho cả thanh bên — thay ~15 lượt
đếm riêng (có lượt duyệt cả kho/lệnh bằng Python). Kênh = khoá module RBAC của màn; tổ SX dùng
`to_sx_<id>`. Xem bảng kênh ở docs/superpowers/plans/2026-09-29-cham-do-ban-ghi-moi.md.
"""
from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import event
from sqlalchemy.orm import Session

from ..models.role import SCOPE_ALL, SCOPE_DEPARTMENT
from ..realtime import hub
from ..repositories.module_notification_repo import DieuKienKenh, ModuleNotificationRepository
from ..repositories.org_scope import dept_subtree_ids

# Kênh tĩnh → các ô quyền (ngoài Xem) mà một dòng phát rộng của kênh có thể đòi.
KENH: dict[str, tuple[str, ...]] = {
    "thu_mua": (),
    "ke_toan": (),
    "luong": ("approve",),
    "nghi_phep": ("approve",),
    "tang_ca": ("approve",),
    "cham_cong": ("approve_late_early",),
    "bao_gia": ("approve_exception",),
    "don_hang_ban": ("record_deposit",),
    "san_xuat": (),
    "xep_lich": (),
    "kho": (),
    "phieu_chi": (),
    "ky_thuat_may": (),
    "phieu_bao_tri": (),
    "khach_hang": (),
}
TIEN_TO_TO = "to_sx_"


def kenh_to(department_id: int) -> str:
    return f"{TIEN_TO_TO}{int(department_id)}"


def kenh_hop_le(kenh: str) -> bool:
    if kenh in KENH:
        return True
    return kenh.startswith(TIEN_TO_TO) and kenh[len(TIEN_TO_TO):].isdigit()


def bao(
    db: Session,
    *,
    kenh: str,
    loai: str,
    actor_id: int | None,
    nguoi_nhan: int | Iterable[int] | None = None,
    quyen: str | None = None,
    phong_id: int | None = None,
    ma: str | None = None,
    chi_mot_lan: bool = False,
    commit: bool = True,
) -> int:
    """Ghi thông báo + đẩy SSE `thong_bao_man`. `nguoi_nhan` None = phát rộng theo quyền; một id
    hoặc danh sách = đích danh (danh sách rỗng ⇒ không ai, không ghi gì).

    `commit=True`: gọi SAU khi nghiệp vụ đã commit. `commit=False`: dòng đi chung giao dịch đang mở,
    SSE chỉ bắn khi giao dịch đó commit (bắn trước là báo một việc còn có thể rollback)."""
    if not kenh_hop_le(kenh):
        raise ValueError(f"Kênh thông báo không hợp lệ: {kenh!r}")
    if quyen is not None and quyen not in KENH.get(kenh, ()):
        raise ValueError(f"Kênh {kenh!r} không khai ô quyền {quyen!r}")
    repo = ModuleNotificationRepository(db)
    if chi_mot_lan and repo.da_co(kenh=kenh, loai=loai, ma=ma):
        return 0
    if nguoi_nhan is None:
        ds: list[int | None] = [None]
    elif isinstance(nguoi_nhan, int):
        ds = [nguoi_nhan]
    else:
        ds = sorted({int(u) for u in nguoi_nhan if u is not None})
        if not ds:
            return 0
    for uid in ds:
        repo.create(
            channel=kenh, event_type=loai, actor_user_id=actor_id, recipient_user_id=uid,
            source_code=ma, required_action=quyen, department_id=phong_id, commit=False,
        )

    su_kien = {"type": "thong_bao_man", "kenh": kenh}

    def _day(*_a) -> None:
        if ds == [None]:
            if kenh.startswith(TIEN_TO_TO):
                hub.gui(su_kien, to=[int(kenh[len(TIEN_TO_TO):])])
            else:
                hub.gui(su_kien, quyen=[kenh])
        else:
            hub.gui(su_kien, nguoi=[u for u in ds if u is not None])

    if commit:
        db.commit()
        _day()
    else:
        event.listen(db, "after_commit", _day, once=True)
    return len(ds)


def trang_thai(db: Session, authz, user) -> dict[str, dict]:
    """Tóm tắt chấm đỏ của người gọi: `{kenh: {"id","loai","ma"}}` — chỉ kênh đang có bản ghi mới."""
    from .quyen_to import VIEC_XEM, quyen_to_cua

    cay: list[int] | None = None

    def _cay() -> tuple[int, ...]:
        nonlocal cay
        if cay is None:
            cay = dept_subtree_ids(db, user.department_id) if user.department_id else []
        return tuple(cay)

    dk: list[DieuKienKenh] = []
    for kenh, cac_quyen in KENH.items():
        if not authz.can(user, kenh, "read"):
            continue
        pv = authz.scope_for(user, kenh) or "own"
        phong = None if pv == SCOPE_ALL else (_cay() if pv == SCOPE_DEPARTMENT else ())
        for q in (None, *cac_quyen):
            if q is None or authz.can(user, kenh, q):
                dk.append(DieuKienKenh(kenh=kenh, quyen=q, phong_ids=phong))
    if user.role_id is not None:
        qt = quyen_to_cua(db, user)
        for to_id in sorted(qt.tron[VIEC_XEM] | qt.rieng[VIEC_XEM]):
            dk.append(DieuKienKenh(kenh=kenh_to(to_id), quyen=None, phong_ids=None))
    return ModuleNotificationRepository(db).moi_nhat(user.id, dk)
```

- [ ] **Step 7: Schema + router**

`backend/app/schemas/module_notification.py`:

```python
from pydantic import BaseModel


class ThongBaoMoi(BaseModel):
    id: int
    loai: str
    ma: str | None = None


class ModuleNotificationSummaryOut(BaseModel):
    kenh: dict[str, ThongBaoMoi] = {}
```

`backend/app/routers/module_notifications.py`:

```python
"""Chấm đỏ thanh bên: MỘT tóm tắt cho mọi màn + đánh dấu đã xem khi mở màn."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import CurrentUser, get_authorization_service, get_module_notification_repository
from ..repositories.module_notification_repo import ModuleNotificationRepository
from ..schemas.module_notification import ModuleNotificationSummaryOut
from ..services.rbac_service import AuthorizationService
from ..services.thong_bao_man import kenh_hop_le, trang_thai

router = APIRouter(prefix="/api/module-notifications", tags=["module-notifications"])
Repo = Annotated[ModuleNotificationRepository, Depends(get_module_notification_repository)]
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]
Db = Annotated[Session, Depends(get_db)]


@router.get("/summary", response_model=ModuleNotificationSummaryOut)
def summary(db: Db, authz: Authz, user: CurrentUser) -> ModuleNotificationSummaryOut:
    return ModuleNotificationSummaryOut(kenh=trang_thai(db, authz, user))


@router.post("/{channel}/mark-read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(channel: str, repo: Repo, user: CurrentUser) -> Response:
    # Không đòi quyền màn: chỉ dời mốc "đã xem" của CHÍNH người gọi — người không có quyền màn
    # vẫn phải dọn được chấm của việc gửi đích danh cho họ (vd thợ bị đổi ca).
    if not kenh_hop_le(channel):
        raise HTTPException(status_code=404, detail="Không tìm thấy kênh thông báo.")
    repo.mark_read(user_id=user.id, channel=channel)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 8: Sửa test cũ theo định dạng mới**
  - `tests/test_duong_nong.py:248` `test_module_notifications_khong_quyen_thi_khong_dem`: đổi thành người chỉ có `noi_quy` Xem; assert `r.json() == {"kenh": {}}` và số câu SQL chạm `module_notification` **≤ 1** (câu gom; không có câu chi tiết khi rỗng). Đổi tên test: `test_tom_tat_cham_do_mot_cau_sql`.
  - `tests/test_purchases_api.py:157-260`: nơi assert `{"thu_mua": n, "ke_toan": m}` đổi sang kiểm có/không khoá trong `r.json()["kenh"]`; chỗ assert mark-read 403 khi không có quyền đổi thành 204 (luật mới — ghi chú lý do trong test).

- [ ] **Step 9: DB_SCHEMA.md** — mục `module_notifications`: thêm 2 dòng bảng cho `required_action` (`String(40) → VARCHAR(40)`, null, ô quyền người nhận phải có; NULL = chỉ cần Xem) và `department_id` (`Integer → INTEGER`, FK `departments.id` ON DELETE SET NULL, null, phòng của bản ghi để lọc phạm vi); cập nhật mô tả `channel` (dòng ~6284 và ~6313): "khoá module RBAC của màn (`luong`, `nghi_phep`, … xem `services/thong_bao_man.KENH`) hoặc `to_sx_<id>` cho tổ SX"; thêm index `ix_module_notifications_recipient_channel`; thêm 2 cột vào dòng **Tất cả cột**.

- [ ] **Step 10: Chạy test**

Run: `cd backend; python -m pytest tests/test_thong_bao_man.py tests/test_duong_nong.py tests/test_purchases_api.py tests/test_module_notification_migration.py tests/test_broadcast_theo_doi_tuong.py tests/test_schema_doc*.py -q -p no:cacheprovider`
Expected: PASS. (`ls backend/tests | grep -i schema` để lấy đúng tên file guard DB_SCHEMA.)

- [ ] **Step 11: Commit**

```bash
git add backend/app/models/module_notification.py backend/app/repositories/module_notification_repo.py backend/app/services/thong_bao_man.py backend/app/routers/module_notifications.py backend/app/schemas/module_notification.py backend/app/db_migrations.py docs/DB_SCHEMA.md backend/tests/thong_bao_helpers.py backend/tests/test_thong_bao_man.py backend/tests/test_duong_nong.py backend/tests/test_purchases_api.py
git commit -m "thong_bao_man: lõi chấm đỏ thanh bên — kênh = module, lọc theo ô quyền + phòng, một lượt tóm tắt (mg 0346)"
```

---

### Task 2: Giao diện — chấm đỏ từ MỘT tóm tắt, bỏ mọi lượt đếm

**Files:**
- Create: `frontend/src/lib/thongBaoMan.ts`
- Create: `frontend/src/lib/thongBaoMan.test.ts`
- Modify: `frontend/src/api/client.ts` (~dòng 440-445 kiểu; ~13480 `moduleNotifications`; union kiểu SSE ~448-461)
- Modify: `frontend/src/components/AppShell.tsx`
- Modify: `frontend/src/components/AppShell.test.tsx` (mock `/api/module-notifications/summary` ~dòng 73, 85, 190)

**Interfaces:**
- Consumes: `GET /api/module-notifications/summary` → `{kenh: {[k]: {id, loai, ma}}}`; `POST /api/module-notifications/{kenh}/mark-read`; SSE `thong_bao_man`.
- Produces: `navCuaKenh(kenh: string): string | null`, `kenhCuaNav(navId: string): string | null`, `loiNhacCua(loai: string, ma: string | null): string | null` trong `frontend/src/lib/thongBaoMan.ts`.

- [ ] **Step 1: Test hỏng** — `frontend/src/lib/thongBaoMan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { kenhCuaNav, loiNhacCua, navCuaKenh } from "./thongBaoMan";

describe("thongBaoMan", () => {
  it("đổi kênh ↔ mục thanh bên", () => {
    expect(navCuaKenh("luong")).toBe("luong");
    expect(navCuaKenh("san_xuat")).toBe("ke-hoach-sx");
    expect(navCuaKenh("to_sx_12")).toBe("thuc-hien-sx:12");
    expect(navCuaKenh("khong_co")).toBeNull();
    expect(kenhCuaNav("ke-hoach-sx")).toBe("san_xuat");
    expect(kenhCuaNav("thuc-hien-sx:12")).toBe("to_sx_12");
    expect(kenhCuaNav("dashboard")).toBeNull();
  });
  it("lời nhắc tiếng Việt, loại đã có toast riêng thì im", () => {
    expect(loiNhacCua("nghi_phep_moi", null)).toBe("🔔 Có đơn nghỉ phép mới chờ duyệt");
    expect(loiNhacCua("bao_gia_cho_duyet", "BG26-0001")).toBe("🔔 Báo giá BG26-0001 chờ bạn duyệt");
    expect(loiNhacCua("bao_gia_quyet_dinh", "BG26-0001")).toBeNull();
    expect(loiNhacCua("khong_biet", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng** — Run: `cd frontend; npx vitest run src/lib/thongBaoMan.test.ts` → FAIL (không tìm thấy module).

- [ ] **Step 3: `frontend/src/lib/thongBaoMan.ts`**

```ts
/** Chấm đỏ thanh bên = "có bản ghi mới kể từ lần mở màn trước" (chủ chốt 29/09/2026).
 *  Kênh = khoá module của màn ở máy chủ (`services/thong_bao_man.py`); tổ SX là `to_sx_<id>`. */

const KENH_NAV: Record<string, string> = {
  thu_mua: "mua-hang",
  ke_toan: "ke-toan-don-mua-hang",
  luong: "luong",
  nghi_phep: "nghi-phep",
  tang_ca: "tang-ca",
  cham_cong: "cham-cong",
  bao_gia: "bao-gia",
  don_hang_ban: "don-hang-ban",
  san_xuat: "ke-hoach-sx",
  xep_lich: "xep-lich",
  kho: "kho-main",
  phieu_chi: "ke-toan-phieu-chi",
  ky_thuat_may: "sua-chua-may",
  phieu_bao_tri: "phieu-bao-tri",
  khach_hang: "khach-hang",
};
const NAV_KENH: Record<string, string> = Object.fromEntries(
  Object.entries(KENH_NAV).map(([k, n]) => [n, k]),
);
const TIEN_TO_TO = "to_sx_";
const NAV_TO = "thuc-hien-sx:";

export function navCuaKenh(kenh: string): string | null {
  if (kenh.startsWith(TIEN_TO_TO)) return NAV_TO + kenh.slice(TIEN_TO_TO.length);
  return KENH_NAV[kenh] ?? null;
}

export function kenhCuaNav(navId: string): string | null {
  if (navId.startsWith(NAV_TO)) return TIEN_TO_TO + navId.slice(NAV_TO.length);
  return NAV_KENH[navId.split(":")[0]] ?? null;
}

/** Toast khi có bản ghi mới. null = loại đã có toast riêng từ sự kiện của chính nó (quyết định,
 *  bàn giao, bảo trì…) — nhắc thêm là hai toast cho một việc. */
const LOI_NHAC: Record<string, (ma: string | null) => string> = {
  tam_ung_moi: () => "🔔 Có đề nghị tạm ứng mới chờ duyệt",
  nghi_phep_moi: () => "🔔 Có đơn nghỉ phép mới chờ duyệt",
  nghi_phep_xin_huy: () => "🔔 Có yêu cầu hủy đơn nghỉ chờ duyệt",
  tang_ca_moi: () => "🔔 Có phiếu tăng ca mới chờ duyệt",
  tang_ca_xin_huy: () => "🔔 Có yêu cầu hủy phiếu tăng ca chờ duyệt",
  di_muon_moi: () => "🔔 Có phiếu đi muộn / về sớm mới chờ duyệt",
  doi_ca: () => "🔔 Ca làm việc của bạn vừa được thay đổi",
  bao_gia_cho_duyet: (ma) => `🔔 Báo giá${ma ? " " + ma : ""} chờ bạn duyệt`,
  don_cho_coc: (ma) => `🔔 Đơn hàng${ma ? " " + ma : ""} chờ ghi cọc`,
  lenh_cho_xep: (ma) => `🔔 Lệnh${ma ? " " + ma : ""} vừa vào hàng chờ xếp lịch`,
  viec_moi: () => "🔔 Tổ có việc mới",
  kho_yeu_cau_moi: (ma) => `🔔 Có yêu cầu kho mới${ma ? " " + ma : ""} chờ lập phiếu`,
};

export function loiNhacCua(loai: string, ma: string | null): string | null {
  const f = LOI_NHAC[loai];
  return f ? f(ma) : null;
}
```

- [ ] **Step 4: Chạy lại** — `npx vitest run src/lib/thongBaoMan.test.ts` → PASS.

- [ ] **Step 5: `client.ts`** — thay kiểu `ModuleNotificationChannel`/`ModuleNotificationSummary` (~dòng 440):

```ts
export type ModuleNotificationChannel = string;
export interface ThongBaoMoi { id: number; loai: string; ma: string | null }
export interface ModuleNotificationSummary { kenh: Record<string, ThongBaoMoi> }
```

Thêm vào union sự kiện SSE (~448-461): `| { type: "thong_bao_man"; kenh: string }`. `api.moduleNotifications.summary/markRead` (~13480) giữ chữ ký, chỉ kiểu trả về đổi. Chạy `npx tsc --noEmit -p .` để thấy mọi chỗ gãy — sửa ở Step 6.

- [ ] **Step 6: `AppShell.tsx`** — làm theo thứ tự:
  1. Xoá hằng `MODULE_NOTIFICATION_NAV` (~dòng 205) và `moduleNotificationRevision` (~322); import `{ kenhCuaNav, loiNhacCua, navCuaKenh } from "../lib/thongBaoMan"`.
  2. Thay `reloadModuleNotificationBadges` (~447-472) bằng:

```tsx
  // Chấm đỏ thanh bên: MỘT lượt hỏi cho mọi mục (29/09/2026). Có bản ghi mới ⇒ chấm; đang đứng
  // trong màn đó ⇒ coi như đã xem (đánh dấu luôn, không chấm). Toast khi id MỚI NHẤT tăng.
  const lastThongBao = useRef<Record<string, number> | null>(null);
  const napThongBao = useCallback(() => {
    if (!token || readable === null) return;
    api.moduleNotifications
      .summary(token)
      .then((s) => {
        const dangMo = activeIdRef.current;
        const truoc = lastThongBao.current;
        const cham: Record<string, number> = {};
        for (const [kenh, tb] of Object.entries(s.kenh)) {
          const nav = navCuaKenh(kenh);
          if (!nav) continue;
          if (nav === dangMo || nav === dangMo.split(":")[0]) {
            void api.moduleNotifications.markRead(token, kenh).catch(() => {});
            continue;
          }
          cham[nav] = 1;
          if (truoc && tb.id > (truoc[kenh] ?? 0)) {
            const loi = loiNhacCua(tb.loai, tb.ma);
            if (loi) pushToast(loi, "info");
          }
        }
        lastThongBao.current = Object.fromEntries(
          Object.entries(s.kenh).map(([k, t]) => [k, t.id]),
        );
        setBadges(cham);
      })
      .catch(() => {});
  }, [token, readable, pushToast]);
```

  3. Thay `markModuleNotificationsRead` (~474-491) bằng bản nhận `kenh: string`: xoá chấm của `navCuaKenh(kenh)` ngay (`setBadges(prev => ({...prev, [nav]: 0}))`) rồi `markRead`; lỗi thì gọi `napThongBao()`. Giữ `markThuMuaNotificationsRead`/`markKeToanNotificationsRead` gọi nó với `"thu_mua"`/`"ke_toan"`.
  4. `reloadBadges` (~503-683): XOÁ toàn bộ thân đếm (nghỉ phép, tăng ca, đi muộn, phiếu chi, khách hàng, đổi ca, báo giá, đơn hàng, kế hoạch SX, bài ghép, xếp lịch, sửa chữa, bảo trì, lương, kho) — thân mới chỉ còn `napThongBao();`. Giữ TÊN `reloadBadges` vì hàng chục màn nhận nó qua `onBadgeStale`. Xoá các ref chỉ còn phục vụ đếm: `lastPending`, `lastOrderAction`, `lastShiftChange`, `lastLeavePending`, `lastOtPending`, `lastElPending`, `lastAdvancePending`, `lastKhoPending`, `daToastBaoTri` (tsc báo ref nào còn dùng).
  5. Kho: `khoCounts` vẫn nuôi các tab TRONG màn Kho (`counts={khoCounts}` ~1560). Chuyển lượt `api.kho.deNghi.counts` thành hàm `napSoKho()` chỉ gọi khi `activeIdRef.current.split(":")[0] === "kho-main"` — gọi lúc mở màn Kho và trong nhánh SSE `stock_request` / `stock_request_pending_changed`; KHÔNG `setBadges` ở đó nữa. Giữ toast của nhánh `stock_request` (tin đích danh); bỏ toast "việc mới chờ cấp" dựa trên `lastKhoPending` (đã có `kho_yeu_cau_moi`).
  6. Xoá `reloadBadgeVatTu`, `dangNapVatTu`, `boLoVatTu` và `baoSoViecVatTu`; bỏ prop `onSoViec={baoSoViecVatTu}` (~1727) — nếu prop bắt buộc trong trang Kế hoạch vật tư, đổi thành tuỳ chọn ở component đó (`onSoViec?:`) và gọi `onSoViec?.(n)`.
  7. Effect đồng bộ badge tổ từ `teamList` (~772-779): xoá vòng gán `thuc-hien-sx:${t.id}` (chấm tổ nay đến từ kênh `to_sx_<id>`); giữ `reloadTeams` cho danh sách tổ.
  8. Nhánh SSE (~881-1370): trong các nhánh `quote_pending_changed`, `order_pending_changed`, `shift_changed`, `order_ordered|lsx_changed|bai_ghep_changed|xep_lich_changed`, `leave_pending_changed`, `ot_pending_changed`, `adjust_pending_changed`, `el_pending_changed`, `gia_cong_cho_chi(_changed)`, `advance_pending_changed`, `stock_request_pending_changed`, `san_xuat_*_changed`: XOÁ lượt gọi đếm + `setBadges` + toast "khi số tăng". Giữ toast phát thẳng từ sự kiện (`quote_decision`, `order_deposit_ok`, `order_ordered` toast "vừa chuyển xuống sản xuất", `leave_decision`, `el_decision`, `adjust_decision`, `san_xuat_ban_giao`, `san_xuat_ho_tro`, `ky_thuat_yeu_cau_moi`, `bao_tri_due`, `care_due`, `care_assigned`, `gia_cong_cho_chi`, `stock_request`, `purchase_*`, `payment_voucher_*`). Các nhánh cũ gọi `napBadge("tat_ca", reloadBadges)` giữ nguyên (nay rẻ). Thêm nhánh:

```tsx
    } else if (e.type === "thong_bao_man") {
      napBadge("thong_bao_man", napThongBao);
```

  9. Effect đánh dấu đã xem khi đổi màn (~1416-1429, đang chỉ lo `thu_mua`/`ke_toan`): viết lại chung —

```tsx
  useEffect(() => {
    if (!token) return;
    const kenh = kenhCuaNav(activeId);
    if (!kenh) return;
    const nav = navCuaKenh(kenh);
    if (nav && badges[nav]) markModuleNotificationsRead(kenh);
  }, [activeId, token, badges, markModuleNotificationsRead]);
```

  Giữ effect `markDecisionsSeen` của Báo giá (~1432) — màn Báo giá còn dùng cờ đó.

- [ ] **Step 7: `AppShell.test.tsx`** — mock `/api/module-notifications/summary` trả `{ kenh: {} }` (thay `{thu_mua:0, ke_toan:0}`). Thêm test: mock trả `{kenh: {luong: {id: 5, loai: "tam_ung_moi", ma: null}}}` ⇒ mục Lương có `.sidebar__badge`; điều hướng vào Lương ⇒ có lượt `POST /api/module-notifications/luong/mark-read` và chấm biến mất. Sao cách render/điều hướng của các test sẵn có trong file (dòng ~73-200).

- [ ] **Step 8: Kiểm** — `cd frontend; npx tsc --noEmit -p .` (sạch) và `npx vitest run src/lib/thongBaoMan.test.ts src/components/AppShell.test.tsx` (PASS).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/thongBaoMan.ts frontend/src/lib/thongBaoMan.test.ts frontend/src/api/client.ts frontend/src/components/AppShell.tsx frontend/src/components/AppShell.test.tsx
git commit -m "thanh bên: chấm đỏ lấy từ MỘT tóm tắt thông báo, mở màn là đã xem — bỏ ~15 lượt đếm"
```

(Nếu phải sửa trang Kế hoạch vật tư ở mục 6, `git add` thêm đúng file đó.)

---

### Task 3: Lương — đề nghị tạm ứng

**Files:**
- Modify: `backend/app/routers/payroll.py` (`create_my_advance` ~805, `create_advance` ~666, `create_advances_bulk` ~703, `approve_advance` ~757, `reject_advance` ~770, `decide_advances_bulk` ~741)
- Test: `backend/tests/test_cham_do_luong.py`

**Interfaces:**
- Consumes: `bao(...)` (Task 1); helpers `tao_nguoi/dang_nhap/tom_tat/da_xem`.

- [ ] **Step 1: Test hỏng** — `backend/tests/test_cham_do_luong.py`: dựng một nhân viên có tài khoản + hồ sơ ở "Phòng A chấm" (sao cách dựng hồ sơ + đề nghị tạm ứng trong `tests/test_payroll*.py` — `grep -ln "advances" backend/tests`), gửi `POST` tạo đề nghị qua API như test sẵn có. Assert:
  - người duyệt `luong` scope `all` có `can_approve` ⇒ `tom_tat()["luong"]["loai"] == "tam_ung_moi"`;
  - người chỉ Xem `luong` ⇒ không có khoá `luong`;
  - người duyệt scope `department` ở phòng KHÁC ⇒ không có;
  - duyệt đề nghị bằng admin ⇒ người đứng tên có `tom_tat()["luong"]["loai"] == "tam_ung_quyet_dinh"`;
  - `da_xem(..., "luong")` ⇒ mất.

- [ ] **Step 2: Chạy** — `cd backend; python -m pytest tests/test_cham_do_luong.py -q -p no:cacheprovider` → FAIL (không có khoá `luong`).

- [ ] **Step 3: Cài** — trong `payroll.py` thêm `from ..services.thong_bao_man import bao`. Ngay sau MỖI chỗ đang gọi `_notify_advance_pending(...)` (dòng ~677, ~715, ~753, ~819 — sau commit của service), ghi thêm cho từng đề nghị vừa tạo (`adv` / từng phần tử danh sách bulk; `emp` lấy như code quanh đó đang lấy):

```python
    bao(db, kenh="luong", loai="tam_ung_moi", actor_id=user.id, quyen="approve",
        phong_id=emp.department_id, ma=str(adv.id))
```

Ở `_notify_advance_decision` (~363) / `_notify_advance_decisions` (~352) — nơi đã có `emp.user_id` — thêm cho mỗi người nhận (bỏ qua `emp.user_id is None`):

```python
    bao(db, kenh="luong", loai="tam_ung_quyet_dinh", actor_id=actor_id, nguoi_nhan=emp.user_id,
        ma=str(adv.id))
```

Nếu hai helper không có `db`/`actor_id`, thêm tham số và truyền từ route (route có `db` qua dependency và `user`). Bulk: gom `nguoi_nhan` thành danh sách và gọi `bao` MỘT lần cho cả lô với `ma=None`.

- [ ] **Step 4: Chạy lại** → PASS; chạy thêm `python -m pytest $(ls tests/test_*payroll*.py tests/test_*tam_ung*.py 2>/dev/null) -q -p no:cacheprovider` để chắc không gãy luồng cũ.

- [ ] **Step 5: Commit** — `git add backend/app/routers/payroll.py backend/tests/test_cham_do_luong.py` · `git commit -m "luong: chấm đỏ tạm ứng — đề nghị mới báo người duyệt theo phòng, quyết định báo người đứng tên"`

---

### Task 4: Nghỉ phép

**Files:**
- Modify: `backend/app/routers/leaves.py` (`_notify_pending_changed` ~148 và các chỗ gọi ~230, ~308, ~336, ~347; `_notify_decision` ~154)
- Test: `backend/tests/test_cham_do_nghi_phep.py`

- [ ] **Step 1: Test hỏng** — sao cách dựng đơn nghỉ của `tests/test_leaves_api.py` (loại nghỉ + hồ sơ). Kịch bản: NV phòng A gửi đơn ⇒ người duyệt `nghi_phep` (`can_approve`, scope `department`, phòng A) thấy `nghi_phep_moi`; người duyệt phòng B không thấy; admin duyệt ⇒ NV thấy `nghi_phep_quyet_dinh`; NV xin hủy đơn đã duyệt ⇒ người duyệt phòng A thấy `nghi_phep_xin_huy`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — `from ..services.thong_bao_man import bao`.
  - `create_request` route (~215) sau khi service trả đơn: `bao(db, kenh="nghi_phep", loai="nghi_phep_moi", actor_id=user.id, quyen="approve", phong_id=<department_id của NV đứng tên đơn>, ma=str(req.id))` (lấy NV như service: `EmployeeRepository(db).get(req.employee_id)` hoặc quan hệ sẵn có trên đơn — dùng đúng thứ route đang có trong tay).
  - `xin_huy` (~330): như trên với `loai="nghi_phep_xin_huy"`.
  - `_notify_decision` (~154, đã có `emp.user_id`): thêm `bao(db, kenh="nghi_phep", loai="nghi_phep_quyet_dinh", actor_id=<người quyết>, nguoi_nhan=emp.user_id, ma=str(req.id))` khi `emp.user_id` không None; thêm tham số `db`/`actor_id` cho helper nếu thiếu, truyền từ mọi nơi gọi (`grep -n "_notify_decision(" backend/app/routers/leaves.py`), gồm cả `quyet_xin_huy` (~352) và bulk (~421/~432).
- [ ] **Step 4: Chạy lại** `tests/test_cham_do_nghi_phep.py tests/test_leaves_api.py` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "nghi_phep: chấm đỏ đơn mới / xin hủy cho người duyệt theo phòng, quyết định cho người đứng tên"` (chỉ `git add` 2 file của Task).

---

### Task 5: Tăng ca

**Files:**
- Modify: `backend/app/routers/overtime.py` (`create_my_request` ~178, xin hủy ~415, `_notify_decision` ~165 + các chỗ gọi ~310, ~321, ~336, ~349, ~436)
- Test: `backend/tests/test_cham_do_tang_ca.py`

- [ ] **Step 1: Test hỏng** — sao dựng phiếu của `tests/test_overtime*.py`. Kịch bản như Task 4 với `tang_ca_moi`, `tang_ca_xin_huy`, `tang_ca_quyet_dinh`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — y hệt khuôn Task 4, kênh `tang_ca`, `quyen="approve"`, `phong_id` = phòng NV đứng tên phiếu. `create_for_employee` (~274, tự duyệt) KHÔNG báo người duyệt; báo NV đứng tên `tang_ca_quyet_dinh` nếu NV có tài khoản và không phải người tạo.
- [ ] **Step 4: Chạy lại** `tests/test_cham_do_tang_ca.py` + file test tăng ca sẵn có → PASS.
- [ ] **Step 5: Commit** — `git commit -m "tang_ca: chấm đỏ phiếu mới / xin hủy cho người duyệt theo phòng, quyết định cho người đứng tên"`

---

### Task 6: Chấm công — đi muộn/về sớm + đổi ca

**Files:**
- Modify: `backend/app/routers/late_early.py` (`create_my_request` ~180, `_notify_decision` ~167 + chỗ gọi ~287, ~297, ~311, ~324)
- Modify: `backend/app/shift_notify.py` (`push_shift_changes`)
- Modify: mọi nơi gọi `push_shift_changes(` (`grep -rn "push_shift_changes(" backend/app`: `attendance_service.py` ~2591, `employee_service.py` ~472/524/579/615 hoặc router tương ứng)
- Test: `backend/tests/test_cham_do_cham_cong.py`

- [ ] **Step 1: Test hỏng** — (a) NV phòng A gửi phiếu đi muộn (sao `tests/test_late_early*.py`) ⇒ người có `cham_cong.approve_late_early` scope `department` phòng A thấy `di_muon_moi`; người chỉ Xem `cham_cong` không thấy. (b) Admin đổi ca của NV có tài khoản (sao test đổi ca trong `tests/test_attendance_api.py` — grep `shift_changed` / `my-shift-changes`) ⇒ NV thấy `tom_tat()["cham_cong"]["loai"] == "doi_ca"` dù vai NV KHÔNG có quyền `cham_cong`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài**
  - late_early: `bao(db, kenh="cham_cong", loai="di_muon_moi", actor_id=user.id, quyen="approve_late_early", phong_id=<phòng NV>, ma=str(req.id))` sau tạo; quyết định: `loai="di_muon_quyet_dinh"`, `nguoi_nhan=uid`.
  - `shift_notify.push_shift_changes(logs, db=None)`: thêm tham số `db: Session | None = None`; sau vòng gom `by_user`, nếu `db is not None and by_user`: `bao(db, kenh="cham_cong", loai="doi_ca", actor_id=<actor chung của logs nếu có, lấy `logs[0].actor_user_id`>, nguoi_nhan=list(by_user))`. Truyền `db` ở MỌI nơi gọi (hàm đã được gọi SAU commit — docstring nói rõ).
- [ ] **Step 4: Chạy lại** `tests/test_cham_do_cham_cong.py tests/test_attendance_api.py $(ls tests/test_late_early*.py)` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "cham_cong: chấm đỏ phiếu đi muộn/về sớm cho người duyệt theo phòng + đổi ca đích danh (hết cảnh hai nguồn đè nhau)"`

---

### Task 7: Báo giá

**Files:**
- Modify: `backend/app/routers/quotations.py` (`transition_quotation` ~598 nhánh `pending_approval` ~632; `record_quote_approval` ~640-667)
- Test: `backend/tests/test_cham_do_bao_gia.py`

- [ ] **Step 1: Test hỏng** — sao dựng báo giá "đặc thù" trình duyệt của `tests/test_quotation*.py` (grep `pending_approval`). Kịch bản: Sale (vai NV Sales, phòng Kinh doanh) trình duyệt ⇒ TP KD (vai seed "Trưởng phòng KD", scope department, cùng phòng) thấy `bao_gia_cho_duyet` với `ma` = mã báo giá; một người có `approve_exception` scope department ở phòng khác không thấy; admin duyệt ⇒ Sale thấy `bao_gia_quyet_dinh`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — sau `hub.gui(quote_pending_changed)` ~632 khi `to_status == "pending_approval"`:

```python
        sale = db.get(User, q.salesperson_id) if q.salesperson_id else None
        bao(db, kenh="bao_gia", loai="bao_gia_cho_duyet", actor_id=user.id,
            quyen="approve_exception", phong_id=sale.department_id if sale else None, ma=q.code)
```

Sau `hub.publish(q.salesperson_id, quote_decision)` ~663: `bao(db, kenh="bao_gia", loai="bao_gia_quyet_dinh", actor_id=user.id, nguoi_nhan=q.salesperson_id, ma=q.code)` (bỏ nếu `salesperson_id` None). Dùng đúng tên biến route đang có (`q`/`quote`, `code`), import `User` + `bao`.
- [ ] **Step 4: Chạy lại** file test mới + file test báo giá sẵn có → PASS.
- [ ] **Step 5: Commit** — `git commit -m "bao_gia: chấm đỏ báo giá chờ duyệt theo phòng Sale + quyết định cho người soạn"`

---

### Task 8: Đơn hàng bán

**Files:**
- Modify: `backend/app/routers/orders.py` (`create_order` ~191-201; `add_deposit_receipt` ~326-341)
- Test: `backend/tests/test_cham_do_don_hang.py`

- [ ] **Step 1: Test hỏng** — sao dựng đơn từ báo giá của `tests/test_order*.py`. Kịch bản: tạo đơn `deposit_pct > 0` ⇒ người có `don_hang_ban.record_deposit` (scope all) thấy `don_cho_coc` với `ma` = mã đơn; tạo đơn `deposit_pct == 0` ⇒ không ai thấy `don_cho_coc`; ghi cọc đủ ⇒ Sale đứng tên đơn thấy `don_du_coc`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — sau `_order_changed()` ở `create_order`: nếu `(o.deposit_pct or 0) > 0`: `bao(db, kenh="don_hang_ban", loai="don_cho_coc", actor_id=user.id, quyen="record_deposit", phong_id=<department_id của User(o.sale_user_id)>, ma=o.code)`. Ở `add_deposit_receipt`, ngay cạnh `hub.publish(d.sale_user_id, order_deposit_ok)` ~340: `bao(db, kenh="don_hang_ban", loai="don_du_coc", actor_id=user.id, nguoi_nhan=d.sale_user_id, ma=d.code)`.
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "don_hang_ban: chấm đỏ đơn chờ ghi cọc cho kế toán + đơn đủ cọc cho Sale"`

---

### Task 9: Kế hoạch sản xuất

**Files:**
- Modify: `backend/app/routers/orders.py` (release ~244-259, nơi `hub.gui(order_ordered, quyen=NGHE_LENH)` ~258)
- Test: `backend/tests/test_cham_do_ke_hoach_sx.py`

- [ ] **Step 1: Test hỏng** — sao luồng "chuyển xuống sản xuất" của `tests/test_order*.py`/`tests/lenh_sx_fixtures.py` (grep `release-production` hoặc `san_xuat_released_at`). Assert người Xem `san_xuat` thấy `don_chuyen_sx` với `ma` = mã đơn; chuyển lần 2 (đã release) KHÔNG thêm dòng mới (id không đổi).
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — ngay cạnh `hub.gui(order_ordered)`, CHỈ khi service báo đây là lần release đầu (dùng đúng cờ/giá trị trả về mà route đang dựa để bắn `order_ordered`; nếu route bắn mọi lần, so `san_xuat_released_at` trước/sau lời gọi service): `bao(db, kenh="san_xuat", loai="don_chuyen_sx", actor_id=user.id, ma=order.code)`.
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "san_xuat: chấm đỏ Kế hoạch SX khi đơn mới chuyển xuống"`

---

### Task 10: Xếp lịch

**Files:**
- Modify: `backend/app/routers/lsx.py` (`set_trang_thai` route ~563-578)
- Modify: `backend/app/routers/xep_lich.py` (`xoa_moc` ~169, `thu_hoi` ~237)
- Test: `backend/tests/test_cham_do_xep_lich.py`

- [ ] **Step 1: Test hỏng** — dùng `tests/lenh_sx_fixtures.py` dựng lệnh; đặt trạng thái `san_sang` qua API ⇒ người Xem `xep_lich` thấy `lenh_cho_xep` với `ma` = mã lệnh; người không có `xep_lich` không thấy.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — trong route đổi trạng thái, khi trạng thái MỚI thuộc `TT_XEP_DUOC` (`services/xep_lich/service.py:46`) và trạng thái CŨ không thuộc: `bao(db, kenh="xep_lich", loai="lenh_cho_xep", actor_id=user.id, ma=lsx.ma)`. Ở `xoa_moc` và `thu_hoi` (thẻ quay lại hàng chờ): cùng lời gọi với mã lệnh bị ảnh hưởng (lấy từ tham số/đối tượng route đang có; `thu_hoi` nhiều lệnh ⇒ gọi cho từng mã).
- [ ] **Step 4: Chạy lại** + `tests/test_xep_lich*.py` liên quan → PASS.
- [ ] **Step 5: Commit** — `git commit -m "xep_lich: chấm đỏ khi lệnh vào hàng chờ xếp"`

---

### Task 11: Bàn tổ

**Files:**
- Modify: `backend/app/routers/xep_lich.py` (`phat_hanh` ~184 và phát hành cập nhật)
- Modify: `backend/app/routers/san_xuat.py` (`_phat_sse` ~128 cho giao việc; `phat_ban_giao` caller ~743/759; `_phat_sse_ho_tro` ~159; `_phat_sse_kcs` ~181)
- Test: `backend/tests/test_cham_do_ban_to.py`

- [ ] **Step 1: Test hỏng** — dùng fixtures bàn tổ sẵn có (`grep -ln "ban-giao\|phat-hanh" backend/tests`). Kịch bản: phát hành lệnh ⇒ người xem được tổ nhận việc thấy khoá `to_sx_<id tổ>` loại `viec_moi`; người của tổ khác không thấy; đề xuất bàn giao sang tổ B ⇒ người tổ B thấy `ban_giao_den`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — `from ..services.thong_bao_man import bao, kenh_to`.
  - Phát hành: sau khi service trả về, lấy tập `department_id` của các `SanXuatCongViec` thuộc các lệnh vừa phát hành (thêm hàm repo `SanXuatRepository.to_cua_lenh(lsx_ids: list[int]) -> set[int]` = `select(distinct(SanXuatCongViec.department_id)).where(SanXuatCongViec.lsx_id.in_(lsx_ids), SanXuatCongViec.department_id.is_not(None))`), rồi mỗi tổ: `bao(db, kenh=kenh_to(t), loai="viec_moi", actor_id=user.id)`.
  - Bàn giao đến: tại chỗ có `dich_department_id` (kết quả `ket_qua_cho_ben_nhan`): `bao(db, kenh=kenh_to(dich), loai="ban_giao_den", actor_id=user.id)` — chỉ cho `de_xuat` và `sua`, không cho xác nhận/điều chỉnh.
  - Hỗ trợ chéo: `bao(..., kenh=kenh_to(<tổ chưa xác nhận>), loai="ho_tro_cheo")` ở `de_xuat_ho_tro`.
  - KCS báo lỗi: trong `_phat_sse_kcs` khi có lỗi quy về tổ: `bao(..., kenh=kenh_to(team_id), loai="kcs_bao_loi")`.
- [ ] **Step 4: Chạy lại** file test mới + các test bàn giao/hỗ trợ/phát hành sẵn có → PASS.
- [ ] **Step 5: Commit** — `git commit -m "ban_to: chấm đỏ theo tổ — việc mới phát hành, bàn giao đến, hỗ trợ chéo, KCS báo lỗi"`

---

### Task 12: Kho

**Files:**
- Modify: `backend/app/services/stock_request_service.py` (`thong_bao_yeu_cau_moi` ~189; `create_dieu_chuyen` ~244; `dong_bo_tu_san_xuat` ~383; `refresh_fulfillment` ~725; `cancel_by_kho` ~516)
- Test: `backend/tests/test_cham_do_kho.py`

- [ ] **Step 1: Test hỏng** — sao dựng kho + vật tư của `tests/test_kho_de_nghi.py` (`_admin`, `_mk_kho`, `_mk_material`). Kịch bản: người thường (có `kho.request`) tạo yêu cầu xuất ⇒ một người có trong `RoleRepository(db).kho_notify_user_ids(...)` thấy `kho_yeu_cau_moi`; kho huỷ yêu cầu (`cancel_kho`) ⇒ người tạo thấy `kho_phan_hoi`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — trong service (`from .thong_bao_man import bao`):
  - `thong_bao_yeu_cau_moi(req)` (đã chạy sau commit): `bao(self.db, kenh="kho", loai="kho_yeu_cau_moi", actor_id=req.nguoi_tao_id, nguoi_nhan=<cùng danh sách `kho_notify_user_ids(...)` mà `_notify` đang dùng>, ma=req.ma)`. Tách lời gọi `kho_notify_user_ids` thành biến dùng chung cho cả `_notify` lẫn `bao`.
  - `create_dieu_chuyen(notify=True)` và `dong_bo_tu_san_xuat`: cùng lời gọi (dùng `commit=False` nếu điểm đó chạy TRƯỚC commit của service).
  - `refresh_fulfillment` khi chuyển sang done (cạnh `_notif_nguoi_tao(loai="kho_hoan_tat")`) và `cancel_by_kho` (cạnh `_notif_nguoi_tao(loai="kho_huy")`): `bao(self.db, kenh="kho", loai="kho_phan_hoi", actor_id=None, nguoi_nhan=req.nguoi_tao_id, ma=req.ma, commit=False)` — `commit=False` vì hai hàm này chạy trong giao dịch của phiếu kho.
- [ ] **Step 4: Chạy lại** `tests/test_cham_do_kho.py tests/test_kho_de_nghi.py` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "kho: chấm đỏ yêu cầu mới cho người xử lý kho + phản hồi kho cho người tạo"`

---

### Task 13: Phiếu chi (gia công ngoài chờ chi)

**Files:**
- Modify: `backend/app/routers/gia_cong_ngoai.py` (`_phat_cho_chi` ~174)
- Test: `backend/tests/test_cham_do_phieu_chi.py`

- [ ] **Step 1: Test hỏng** — sao luồng chốt của `tests/test_gia_cong_phieu_chi.py`. Assert một người trong `GiaCongNgoaiRepository(db).nguoi_lap_phieu_chi()` (khác người chốt) thấy `phieu_chi` loại `gia_cong_cho_chi`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — trong `_phat_cho_chi(res, user, db)`: `bao(db, kenh="phieu_chi", loai="gia_cong_cho_chi", actor_id=user.id, nguoi_nhan=<cùng danh sách người nhận SSE hiện tại>, ma=str(res["gia_cong_ngoai_id"]))`.
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "phieu_chi: chấm đỏ lần gia công ngoài vừa chốt chờ lập phiếu chi"`

---

### Task 14: Sửa chữa máy

**Files:**
- Modify: `backend/app/services/ky_thuat_may_service.py` (`bao_to_sua_chua` ~438)
- Test: `backend/tests/test_cham_do_sua_chua.py`

- [ ] **Step 1: Test hỏng** — sao tạo yêu cầu báo hỏng của `tests/test_ky_thuat_may*.py`. Assert người có `ky_thuat_may.can_update` thấy `ky_thuat_may` loại `bao_hong_moi`; người báo không thấy.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — trong `bao_to_sua_chua`, sau vòng `hub.publish`: `bao(self.db, kenh="ky_thuat_may", loai="bao_hong_moi", actor_id=<người báo>, nguoi_nhan=<danh sách `_nguoi_to_sua_chua` đang dùng>, ma=<mã yêu cầu>)`. Nếu hàm chạy trước commit của `tao_yeu_cau`, dùng `commit=False`.
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "ky_thuat_may: chấm đỏ báo hỏng mới cho tổ sửa chữa"`

---

### Task 15: Phiếu bảo trì tới hạn

**Files:**
- Modify: `backend/app/bao_tri_reminders.py` (`_scan_once` ~60-115)
- Test: `backend/tests/test_cham_do_bao_tri.py`

- [ ] **Step 1: Test hỏng** — dựng một phiếu bảo trì `ngay_ke_hoach <= hôm nay` đang mở (sao `tests/test_bao_tri*.py`/`test_ky_thuat_may*.py`), gọi `_scan_once(...)` HAI lần với tham số như test sẵn có của ticker. Assert người thực hiện thấy `phieu_bao_tri` loại `bao_tri_den_han`; và chỉ có MỘT dòng `ModuleNotification` cho mã phiếu đó sau hai lượt quét.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài** — trong vòng lặp từng phiếu, cạnh `hub.publish(bao_tri_due)`: `bao(db, kenh="phieu_bao_tri", loai="bao_tri_den_han", actor_id=None, nguoi_nhan=<cùng danh sách người nhận vừa publish>, ma=p.ma, chi_mot_lan=True)`. `chi_mot_lan` thay cho sổ `_da_ting` trong RAM ở phần chấm (toast theo ngày giữ nguyên).
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "phieu_bao_tri: chấm đỏ phiếu tới hạn, mỗi phiếu một lần (nhớ trong DB, restart không báo lại)"`

---

### Task 16: Khách hàng — chăm sóc đến hạn / được giao

**Files:**
- Modify: `backend/app/care_reminders.py` (`_scan_once` ~26-40)
- Modify: `backend/app/services/customer_service.py` (`add_care_task` ~864-889)
- Test: `backend/tests/test_cham_do_khach_hang.py`

- [ ] **Step 1: Test hỏng** — sao dựng việc chăm sóc của `tests/test_customer*.py` (grep `care`). (a) Admin giao việc cho sale khác ⇒ sale thấy `khach_hang` loại `cham_soc_duoc_giao`. (b) Việc đến hạn trong cửa sổ, gọi `_scan_once(after, until)` hai lần ⇒ người phụ trách thấy `cham_soc_den_han`, chỉ một dòng.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài**
  - `care_reminders._scan_once`: cạnh `hub.publish(task.assignee_user_id, care_due)`: `bao(db, kenh="khach_hang", loai="cham_soc_den_han", actor_id=None, nguoi_nhan=task.assignee_user_id, ma=f"CS{task.id}", chi_mot_lan=True)`.
  - `add_care_task`: cạnh `hub.publish(assignee, care_assigned)` (chỉ khi assignee ≠ actor): `bao(self.db, kenh="khach_hang", loai="cham_soc_duoc_giao", actor_id=actor.id, nguoi_nhan=assignee, ma=f"CS{task.id}")` (`commit=False` nếu chạy trước commit).
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "khach_hang: chấm đỏ việc chăm sóc được giao / đến hạn cho người phụ trách"`

---

### Task 17: Xác minh luồng thật trên giao diện + tài liệu

**Files:**
- Modify: `docs/` — ghi luật chấm đỏ vào tài liệu module Nhân sự/Thanh bên nếu có mục thanh bên (`grep -rln "badge\|chấm đỏ" docs | head`); nếu không có chỗ hợp, thêm mục ngắn vào `docs/ARCHITECTURE.md` phần realtime.

- [ ] **Step 1:** Bật backend + frontend dev (memory: bật qua WMI, FE `localhost:5173`, BE `--host localhost`; restart uvicorn sau khi đổi backend — migration 0346 chạy lúc khởi động).
- [ ] **Step 2:** Trên dev-browser, đăng nhập người A (nhân viên) gửi một đơn nghỉ phép bằng chuột/bàn phím; ở tab khác đăng nhập người duyệt ⇒ chấm đỏ hiện ở "Nghỉ phép" KHÔNG cần tải lại + toast; bấm vào "Nghỉ phép" ⇒ chấm mất; tải lại trang ⇒ chấm vẫn mất.
- [ ] **Step 3:** Lặp kịch bản cho một mục Sản xuất (chuyển đơn xuống SX ⇒ chấm "Kế hoạch SX") và Kho (tạo yêu cầu xuất ⇒ chấm "Yêu cầu nhập xuất" ở thủ kho).
- [ ] **Step 4:** Báo cáo liệt kê CỤ THỂ đã bấm gì/gõ gì/thấy gì ở từng bước (CLAUDE.md). Không dùng API thay bước nào; nếu buộc phải, nói rõ.
- [ ] **Step 5: Commit** tài liệu — `git commit -m "docs: luật chấm đỏ thanh bên — có bản ghi mới, mở màn là mất"`
