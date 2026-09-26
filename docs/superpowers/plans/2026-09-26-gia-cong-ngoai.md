# Gia công ngoài (trọn gói & một phần) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kế hoạch SX đem được một dải bước hoặc cả lệnh ra nhà gia công ngoài. Mỗi lần kết thúc bằng MỘT con số do người nhập, rẽ về xưởng / kho / khách. Kế toán lập phiếu chi từ lần đó. Không KCS trên phần mềm, không ngày hẹn về, không công nợ 331.

**Architecture:**
- Thêm một bảng `gia_cong_ngoai`, mỗi dòng là một **lần gia công**.
- Lúc phát hành, các bước thuê ngoài liền nhau và cùng nhà gia công được gom thành một lần. Công việc (`san_xuat_cong_viec`) của các bước đó mang `gia_cong_ngoai_id`.
- Trọn gói = phát hành một gói chỉ có MỘT công việc thuê ngoài, không thuộc tổ nào.
- Sau đó mọi thứ đi lại đường có sẵn: bàn giao, mẻ sản lượng, KCS-cuối, nhập kho, giao hàng, đóng nhóm.
  - Chốt ghi một mẻ.
  - Nếu dải chứa bước cuối lệnh thì chốt ghi thêm một bản ghi KCS tổng hợp, rồi gọi lõi nhập kho hoặc ghi một chuyến giao thành công.
- Phiếu chi thêm nguồn `gia_cong_ngoai`, chép khuôn tạm ứng lương, và bị loại khỏi báo cáo 331.

**Tech Stack:**
- Backend: FastAPI + SQLAlchemy 2 (`Mapped`). Migration viết tay trong `backend/app/db_migrations.py`.
- Test: pytest (SQLite in-memory, `pytest.ini` ở gốc repo). Frontend test: vitest.
- Frontend: React 18 + TypeScript + Vite.

**Spec:** `docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md` — đọc trước khi làm bất kỳ task nào.

## Global Constraints

**Migration & schema**
- Không có Alembic. Thêm / đổi / gỡ cột = một bước trong `backend/app/db_migrations.py` (`MIGRATIONS.append(("NNNN_slug", fn))`).
  - Bước phải idempotent và không dùng `PRAGMA`.
  - Plan dùng ba số: `0339` (Task 1), `0340` (Task 4), `0341` (Task 11). Số cao nhất trên `dev` lúc viết plan là `0338`. Trước mỗi task có migration, chạy `grep -o 'MIGRATIONS.append(("0[0-9]*' backend/app/db_migrations.py | sort | tail -1`. Nếu số đã bị lấy thì dùng số trống kế tiếp, và sửa mọi chỗ plan nhắc số đó (tên hàm test, docstring, DB_SCHEMA).
- Mỗi bảng / cột mới phải có mặt trong `docs/DB_SCHEMA.md`, trong section ``### `bang` `` **đầu tiên** của bảng đó, cùng lượt sửa. `backend/tests/test_schema_documented.py` chấm điều này.
- Cột Boolean: `server_default=sa_false()` / `sa_true()`, KHÔNG dùng `"0"` / `"1"`.
- Mọi FK trỏ `users` phải có `ondelete="CASCADE"` (`tests/test_user_fk_cascade.py`). Vì vậy người ghi trên `gia_cong_ngoai` là Integer mềm, không FK.

**Nhật ký**
- Mọi `action=` audit mới phải là chuỗi literal có trong `backend/app/audit_registry.py` (`tests/test_audit_registry.py`).

**Nghiệp vụ**
- Tiền của lần gia công (đơn giá, thành tiền) chỉ trả khi `authz.can(user, "kho", "view_cost")`. Không có quyền thì trả `None`, không phải `0`.
- Người và giờ lấy từ tài khoản đang đăng nhập ở máy chủ. Không nhận tên hay giờ từ client.
- Gửi / thông báo nội bộ phải đẩy SSE ngay sau commit (`hub.broadcast` / `hub.publish`).
- UI hoàn toàn tiếng Việt. Không in thẳng mã nội bộ (`mot_phan`, `xuong`…) ra màn hình.

**Cách verify**
- Backend: `python -m pytest backend/tests/<file> -q`, chạy từ gốc repo.
- Frontend: `npx tsc --noEmit` và `npx vitest run <file>`, chạy trong `frontend/`.
- KHÔNG chạy `./init.ps1`. KHÔNG chạy cả bộ pytest ở máy — CI chạy.
- `python -c …` chạy trong `backend/` sẽ trỏ vào Postgres DEV thật. Muốn thăm dò thì viết test tạm.

**Làm song song**
- Một phiên khác đang sửa phân hệ Kế toán / Tạm ứng: `accounting_service.py`, `accounting_repo.py`, `routers/accounting.py`, `schemas/accounting.py`, `PaymentVouchersPage.tsx`, `db_migrations.py`.
- Trước Task 1, 10 và 15: đồng bộ nhánh, rồi đọc lại đúng đoạn sắp sửa. Số dòng trong plan chỉ là mốc để tìm.
- Không `git stash -u` và không commit gộp file của phiên khác.

**Commit**
- Chỉ commit khi người dùng bảo.
- Message tiếng Việt, không có dòng `Co-Authored-By`.

**Xác minh UI**
- Luồng có UI phải được thao tác lại bằng chuột / bàn phím thật trên dev-browser (Task 16) trước khi báo xong.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `backend/app/models/gia_cong_ngoai.py` (mới) | Model `GiaCongNgoai` + hằng kiểu / nơi về |
| `backend/app/repositories/gia_cong_ngoai_repo.py` (mới) | Mọi truy vấn của lần gia công: lấy + khoá, cv của lần, bàn giao chờ, NCC nhận gia công, người sửa lệnh, hàng chờ chi, điều kiện lọc danh sách KHSX |
| `backend/app/services/gia_cong_ngoai/__init__.py` (mới) | Lỗi dùng chung (`GiaCongXungDot`), `trang_thai()`, `kiem_version()` |
| `backend/app/services/gia_cong_ngoai/lan.py` (mới) | Gom lần khi phát hành · huỷ lần khi thu hồi gói · dựng dict đọc |
| `backend/app/services/gia_cong_ngoai/mot_phan.py` (mới) | Nút "Đã mang đi" |
| `backend/app/services/gia_cong_ngoai/chot.py` (mới) | Chốt con số cuối (về xưởng / kho / khách) + Mở lại |
| `backend/app/services/gia_cong_ngoai/tron_goi.py` (mới) | Đặt trọn gói · huỷ · đề nghị xuất giấy |
| `backend/app/schemas/gia_cong_ngoai.py` (mới) | Body / response Pydantic |
| `backend/app/routers/gia_cong_ngoai.py` (mới) | `/api/gia-cong-ngoai/...` + đẩy SSE sau commit |
| `backend/app/services/san_xuat/release.py` | Gọi gom lần sau `danh_dau_kcs_cuoi` |
| `backend/app/services/san_xuat/release_update.py` | `thu_hoi_goi` huỷ lần chưa mang đi |
| `backend/app/services/san_xuat/ban_giao.py` | `de_xuat` sang bước gia công ⇒ báo người sửa lệnh |
| `backend/app/services/san_xuat/kho.py` | Tách lõi `lap_yeu_cau_nhap_tp` (không gate KCS) |
| `backend/app/services/san_xuat/kcs.py`, `kcs_bao_cao.py` | Chặn kiểm / loại khỏi báo cáo công việc gia công |
| `backend/app/services/lsx_service.py` | Bước thuê ngoài: NCC từ danh mục, không tổ / máy / vật tư / thời lượng; gỡ sổ giao–nhận cũ |
| `backend/app/services/xep_lich/service.py`, `trai_lich.py` | Bỏ ngày thuê ngoài |
| `backend/app/services/ke_hoach_vat_tu_service.py` | Bỏ nhu cầu bước thuê ngoài / lệnh trọn gói NCC lo giấy; `nhu_cau_giay_cua_lenh` |
| `backend/app/services/accounting_service.py` + repo + schema + router | Nguồn phiếu chi `gia_cong_ngoai`, `GET /gia-cong-cho-chi`, loại khỏi 331 |
| `backend/app/services/purchase_service.py` + schema + repo | Cờ `nhan_gia_cong` |
| `frontend/src/api/client.ts` | Kiểu + `api.giaCongNgoai.*`, sửa kiểu bước lệnh, phiếu chi |
| `frontend/src/pages/lsxBuoc.ts`, `LsxBuocDrawer.tsx`, `LsxRoutingTable.tsx` | Ô Nhà gia công + Đơn giá thay Tổ / Máy; bảng cha suy dải |
| `frontend/src/pages/LsxDetailView.tsx` | Gắn khối Gia công ngoài + nút Gia công trọn gói |
| `frontend/src/pages/KeHoachSXPage.tsx`, `backend/app/repositories/lsx_repo.py`, `backend/app/routers/lsx.py` | Ô lọc "Gia công ngoài" (lọc + đếm ở máy chủ) |
| `frontend/src/pages/gia-cong/giaCong.ts` (mới) | Hàm thuần: nhãn trạng thái, nút kế tiếp, nơi về hợp lệ |
| `frontend/src/pages/gia-cong/GiaCongNgoaiPanel.tsx` (mới) | Khối "Gia công ngoài" trên hồ sơ lệnh |
| `frontend/src/pages/gia-cong/TronGoiDialog.tsx` (mới) | Hộp đặt gia công trọn gói |
| `frontend/src/pages/gia-cong/giaCong.css` (mới) | Style khối |
| `frontend/src/pages/ke-toan/phieu-chi/components/GiaCongChoChiStrip.tsx` (mới) | Hàng "Gia công chờ chi" đầu màn Phiếu chi |
| `frontend/src/pages/ke-toan/phieu-chi/modals/LapPhieuChiGiaCongModal.tsx` (mới) | Hộp lập phiếu chi từ một lần (khuôn `LapPhieuChiModal` của tạm ứng lương) |
| `frontend/src/pages/ke-toan/phieu-chi/PaymentVouchersPage.tsx`, `shared/list-constants.ts` | Gắn hàng chờ + hộp; nhãn nguồn "Gia công ngoài" |
| `frontend/src/components/AppShell.tsx` | Toast "chờ mang đi" / "chờ chi" + badge Phiếu chi |
| `backend/tests/gia_cong_fixtures.py` (mới) | Dựng NCC, lệnh một phần, bàn giao, nhân viên |

---

### Task 1: Dữ liệu — bảng `gia_cong_ngoai` + 6 cột nối + migration 0339

**Files:**
- Create: `backend/app/models/gia_cong_ngoai.py`
- Modify: `backend/app/models/__init__.py` (import + `__all__`)
- Modify: `backend/app/models/purchase.py` (`Supplier.nhan_gia_cong`)
- Modify: `backend/app/models/lsx.py:322-345` (`LsxCongDoan.nha_cung_cap_id`, sửa chú thích khối §8)
- Modify: `backend/app/models/san_xuat.py` (`SanXuatCongViec.gia_cong_ngoai_id`, ngay sau `nha_cung_cap`)
- Modify: `backend/app/models/stock_request.py:129` (`StockRequest.gia_cong_ngoai_id`)
- Modify: `backend/app/models/delivery.py` (`DeliveryTrip.gia_cong_ngoai_id`)
- Modify: `backend/app/models/accounting.py:155-195` (`PaymentVoucher.gia_cong_ngoai_id` + partial unique index, `VOUCHER_SOURCE_GIA_CONG`)
- Modify: `backend/app/db_migrations.py` (cuối file: `0339_gia_cong_ngoai`)
- Modify: `docs/DB_SCHEMA.md`
- Test: `backend/tests/test_gia_cong_ngoai_du_lieu.py`

**Interfaces:**
- Produces:
  - `app.models.gia_cong_ngoai`: `GiaCongNgoai`, `KIEU_MOT_PHAN = "mot_phan"`, `KIEU_TRON_GOI = "tron_goi"`, `NOI_VE_XUONG = "xuong"`, `NOI_VE_KHO = "kho"`, `NOI_VE_KHACH = "khach"`, `NOI_VE = (...)`.
  - Cột mới (mọi task sau dùng đúng tên): `suppliers.nhan_gia_cong`, `lsx_cong_doan.nha_cung_cap_id`, `san_xuat_cong_viec.gia_cong_ngoai_id`, `stock_requests.gia_cong_ngoai_id`, `delivery_trips.gia_cong_ngoai_id`, `payment_vouchers.gia_cong_ngoai_id`.
  - `app.models.accounting.VOUCHER_SOURCE_GIA_CONG = "gia_cong_ngoai"` (có trong `VOUCHER_SOURCES`).
  - Migration function `_migrate_gia_cong_ngoai(db)` id `0339_gia_cong_ngoai`.

- [ ] **Step 1: Viết test thất bại**

```python
# backend/tests/test_gia_cong_ngoai_du_lieu.py
"""Gia công ngoài — nền dữ liệu (spec 2026-09-26 §10).

Hai điều phải giữ: (1) model dựng được bảng + 6 cột nối trên DB trắng; (2) migration 0339 đưa DB
ĐANG CHẠY (thiếu mọi thứ) về đúng hình dạng đó, và chạy lượt hai là no-op.
"""
from __future__ import annotations

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db import Base
from app.db_migrations import _migrate_gia_cong_ngoai
import app.models  # noqa: F401 — đăng ký mọi bảng


def test_model_dung_bang_va_cot_noi():
    bang = Base.metadata.tables
    assert "gia_cong_ngoai" in bang
    cot = set(bang["gia_cong_ngoai"].columns.keys())
    assert {
        "lsx_id", "kieu", "nha_cung_cap_id", "nha_cung_cap_ten", "ten_viec", "don_gia", "don_vi",
        "sl_dat", "xuong_cap_giay", "mang_di_boi_id", "mang_di_luc", "sl_gui", "chot_boi_id",
        "chot_luc", "sl_cuoi", "noi_ve", "huy_boi_id", "huy_luc", "ly_do_huy", "created_by",
        "version",
    } <= cot
    assert "nhan_gia_cong" in bang["suppliers"].columns
    assert "nha_cung_cap_id" in bang["lsx_cong_doan"].columns
    for t in ("san_xuat_cong_viec", "stock_requests", "delivery_trips", "payment_vouchers"):
        assert "gia_cong_ngoai_id" in bang[t].columns, t
    # Người ghi là tham chiếu MỀM — FK tới users trong dự án bắt buộc CASCADE, mà xoá tài khoản
    # không được kéo mất lần gia công.
    fk_users = [
        fk for fk in bang["gia_cong_ngoai"].foreign_keys if fk.column.table.name == "users"
    ]
    assert fk_users == []


def _db_cu():
    """DB 'đang chạy' trước 0339: có đủ bảng nhưng thiếu mọi cột mới; bảng `gia_cong_ngoai` đã
    được `create_all` dựng (runner chạy create_all TRƯỚC migration)."""
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text("CREATE TABLE gia_cong_ngoai (id INTEGER PRIMARY KEY)"))
        cn.execute(text("CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name VARCHAR(255))"))
        cn.execute(text("CREATE TABLE lsx_cong_doan (id INTEGER PRIMARY KEY)"))
        cn.execute(text("CREATE TABLE san_xuat_cong_viec (id INTEGER PRIMARY KEY)"))
        cn.execute(text("CREATE TABLE stock_requests (id INTEGER PRIMARY KEY)"))
        cn.execute(text("CREATE TABLE delivery_trips (id INTEGER PRIMARY KEY)"))
        cn.execute(text(
            "CREATE TABLE payment_vouchers (id INTEGER PRIMARY KEY, status VARCHAR(16))"))
        cn.execute(text("INSERT INTO suppliers (name) VALUES ('NCC cũ')"))
    return engine


def test_migration_0339_them_du_cot_va_chay_lai_la_no_op():
    engine = _db_cu()
    for _ in range(2):
        with Session(engine) as db:
            _migrate_gia_cong_ngoai(db)
    insp = inspect(engine)
    assert "nhan_gia_cong" in {c["name"] for c in insp.get_columns("suppliers")}
    assert "nha_cung_cap_id" in {c["name"] for c in insp.get_columns("lsx_cong_doan")}
    for t in ("san_xuat_cong_viec", "stock_requests", "delivery_trips", "payment_vouchers"):
        assert "gia_cong_ngoai_id" in {c["name"] for c in insp.get_columns(t)}, t
    with engine.begin() as cn:
        # NCC có sẵn mặc định KHÔNG nhận gia công — không tự nhét ai vào ô chọn của kế hoạch.
        assert cn.execute(text("SELECT nhan_gia_cong FROM suppliers")).scalar_one() in (0, False)
        idx = {r[1] for r in cn.execute(text("PRAGMA index_list(payment_vouchers)"))}
    assert "uq_payment_voucher_gia_cong_ngoai" in idx
```

(`PRAGMA` ở đây nằm trong TEST để soi SQLite, không nằm trong migration — guard `test_migration_khong_dung_pragma` chỉ soi `db_migrations.py`.)

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_ngoai_du_lieu.py -q`
Expected: FAIL — `ImportError: cannot import name '_migrate_gia_cong_ngoai'`.

- [ ] **Step 3: Viết model**

```python
# backend/app/models/gia_cong_ngoai.py
"""LẦN GIA CÔNG NGOÀI — spec `docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md`.

Một lần = một nhà gia công + một khối việc đem ra ngoài, gửi một lần, chốt MỘT con số:
  · `mot_phan` — một dải bước "Thuê ngoài" LIỀN NHAU, cùng nhà gia công, của một lệnh. Các công
    việc của dải trỏ về đây qua `san_xuat_cong_viec.gia_cong_ngoai_id`.
  · `tron_goi` — cả lệnh; lệnh được phát hành với MỘT công việc thuê ngoài không tổ nào nhận.

Vì sao một bảng mà không thêm cột vào bước: một lần phủ NHIỀU bước (dải) hoặc KHÔNG bước nào
(trọn gói) — cột trên từng bước không chở nổi.

KHÔNG lưu trạng thái (dẫn xuất từ các mốc — `services/gia_cong_ngoai.trang_thai`) và KHÔNG lưu
tiền (= `sl_cuoi × don_gia`). KHÔNG có ngày hẹn về, hao hụt cho phép, công nợ — chủ chốt 26/09/2026.

Người ghi (`created_by`, `mang_di_boi_id`, `chot_boi_id`, `huy_boi_id`) là tham chiếu MỀM tới
`users`: FK tới `users` trong dự án bắt buộc CASCADE (`test_user_fk_cascade`), mà xoá tài khoản
không được kéo mất lần gia công đã có phiếu chi.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, false as sa_false
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

KIEU_MOT_PHAN = "mot_phan"
KIEU_TRON_GOI = "tron_goi"
KIEU_GIA_CONG = (KIEU_MOT_PHAN, KIEU_TRON_GOI)

# Một lần chỉ về MỘT nơi. Nhà gia công vừa giao khách một phần vừa chở về kho một phần ⇒ hai lần.
NOI_VE_XUONG = "xuong"   # về bước sau của lệnh (dải còn chặng sau)
NOI_VE_KHO = "kho"       # nhập kho thành phẩm (dải chứa bước cuối / trọn gói)
NOI_VE_KHACH = "khach"   # nhà gia công giao thẳng cho khách
NOI_VE = (NOI_VE_XUONG, NOI_VE_KHO, NOI_VE_KHACH)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class GiaCongNgoai(Base):
    __tablename__ = "gia_cong_ngoai"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lsx_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("lsx.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kieu: Mapped[str] = mapped_column(String(12), nullable=False)
    # Danh mục Nhà cung cấp có tích "Nhận gia công". Không có đường xoá NCC nên FK thường là đủ.
    nha_cung_cap_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("suppliers.id"), index=True, nullable=False
    )
    # ẢNH CHỤP tên lúc đặt — đổi tên NCC sau không đổi lịch sử lần đã chốt / phiếu chi đã in.
    nha_cung_cap_ten: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # "Cán màng" · "Bế + Dán" · "Gia công trọn gói" — nhãn cho khối trên lệnh và lý do chi.
    ten_viec: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # Đơn giá theo ĐƠN VỊ của con số cuối (`don_vi`). Bỏ trống được — kế toán gõ tiền tay.
    don_gia: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    don_vi: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Chỉ trọn gói: số đặt nhà gia công làm (điền sẵn SL lệnh).
    sl_dat: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    # Chỉ trọn gói: xưởng cấp giấy (đề nghị xuất kho) hay nhà gia công tự lo (nhả giữ chỗ).
    xuong_cap_giay: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sa_false(), default=False
    )
    # --- Mang đi (chỉ một phần) ---
    mang_di_boi_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mang_di_luc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sl_gui: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    # --- Chốt ---
    chot_boi_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chot_luc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sl_cuoi: Mapped[float | None] = mapped_column(Numeric(18, 3), nullable=True)
    noi_ve: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # --- Huỷ (trọn gói huỷ trước chốt · lần một phần mất khi gói bị thu hồi) ---
    huy_boi_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    huy_luc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ly_do_huy: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
```

Đăng ký trong `backend/app/models/__init__.py` (cạnh dòng `from .san_xuat_vat_tu import ...`):

```python
from .gia_cong_ngoai import GiaCongNgoai
```
và thêm `"GiaCongNgoai",` vào `__all__`.

- [ ] **Step 4: Thêm 6 cột nối vào model**

`backend/app/models/purchase.py`, trong `Supplier`, ngay sau `status`:

```python
    # NHẬN GIA CÔNG (26/09/2026) — nhà cung cấp này nhận gia công ngoài cho xưởng. Ô chọn "Nhà gia
    # công" ở Kế hoạch SX chỉ mời NCC đang hoạt động có cờ này. KHÔNG lọc theo chữ `supplier_group`
    # (gõ tự do: "GC ngoài", "gia cong"… là lọt).
    nhan_gia_cong: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sa_false(), default=False
    )
```
(thêm `false as sa_false` vào dòng import `sqlalchemy` của file nếu chưa có; kiểm `Boolean` đã import.)

`backend/app/models/lsx.py` — thay chú thích khối §8 (dòng 322-323) và thêm cột ngay trên `nha_cung_cap`:

```python
    # --- Gia công ngoài (spec 2026-09-26) — chỉ dùng khi `loai_buoc = thue_ngoai`. Nhà gia công
    # chọn từ danh mục Nhà cung cấp (cờ `nhan_gia_cong`) — tham chiếu MỀM như máy/tổ/khuôn của
    # lệnh. `nha_cung_cap` (chữ) do MÁY CHỦ ghi theo NCC đã chọn: bảy chỗ đang đọc tên (snapshot,
    # hồ sơ lệnh, phiếu công nghệ, chip…) khỏi phải đổi. Client không gửi cột chữ.
    nha_cung_cap_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    nha_cung_cap: Mapped[str | None] = mapped_column(String(150), nullable=True)
```
(9 cột dự kiến + 6 cột giao–nhận vẫn để nguyên ở Task 1 — Task 3 gỡ chúng cùng code đọc/ghi.)

`backend/app/models/san_xuat.py`, trong `SanXuatCongViec`, ngay sau cột `nha_cung_cap`:

```python
    # LẦN GIA CÔNG NGOÀI mà công việc này thuộc về (spec 2026-09-26). NULL = việc của xưởng. Công
    # việc có cột này KHÔNG vào bàn tổ nào (department_id NULL), không bắt đầu / ghi mẻ tay — mọi
    # ghi nhận đi qua khối Gia công ngoài của lệnh.
    gia_cong_ngoai_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("gia_cong_ngoai.id", ondelete="SET NULL"), index=True, nullable=True
    )
```

`backend/app/models/stock_request.py`, ngay sau `san_xuat_cong_viec_id`:

```python
    # NGUỒN GIA CÔNG NGOÀI (mg 0339): đề nghị xuất giấy cấp cho nhà gia công trọn gói, hoặc đề
    # nghị nhập thành phẩm từ lần gia công đã chốt. Soft ref cùng khuôn `delivery_trip_id`.
    gia_cong_ngoai_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
```

`backend/app/models/delivery.py`, trong `DeliveryTrip`, ngay sau `ghi_chu_phan_cong`:

```python
    # NHÀ GIA CÔNG GIAO THẲNG (mg 0339): chuyến này không có xe, không xuất kho — chỉ để "đã giao"
    # của dòng đơn cộng đúng số khách nhận. `khoan_km_service` loại chuyến có cột này.
    gia_cong_ngoai_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
```

`backend/app/models/accounting.py`:
- thêm hằng sau `VOUCHER_SOURCE_SALARY_ADVANCE`:

```python
# Phiếu chi lập TỪ MỘT LẦN GIA CÔNG NGOÀI đã chốt (26/09/2026). Một lần ⇄ một phiếu chi còn sống.
# CHỈ ghi tiền ra: không `supplier_id`, loại khỏi báo cáo 331 (chủ: "không dính 331").
VOUCHER_SOURCE_GIA_CONG = "gia_cong_ngoai"
```
- thêm `VOUCHER_SOURCE_GIA_CONG,` vào tuple `VOUCHER_SOURCES` (ngay sau `VOUCHER_SOURCE_SALARY_ADVANCE`);
- thêm index vào `PaymentVoucher.__table_args__`:

```python
        Index("uq_payment_voucher_gia_cong_ngoai", "gia_cong_ngoai_id", unique=True,
              postgresql_where=text("status <> 'cancelled'"),
              sqlite_where=text("status <> 'cancelled'")),
```
- thêm cột ngay sau `salary_advance_id`:

```python
    # LẦN GIA CÔNG NGOÀI nguồn (mg 0339). Chỉ có giá trị khi `source_type = gia_cong_ngoai`.
    # RESTRICT: còn phiếu chi thì không xoá được lần. Một lần chỉ MỘT phiếu chi CÒN HIỆU LỰC
    # (`uq_payment_voucher_gia_cong_ngoai`), huỷ phiếu thì lần tự về "chờ chi".
    gia_cong_ngoai_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("gia_cong_ngoai.id", ondelete="RESTRICT"), nullable=True, index=True,
    )
```

- [ ] **Step 5: Viết migration 0339 (cuối `backend/app/db_migrations.py`)**

```python
# mg 0339 — GIA CÔNG NGOÀI (spec 2026-09-26). Bảng `gia_cong_ngoai` do `create_all` dựng (runner
# chạy create_all TRƯỚC chuỗi migration); ở đây chỉ thêm cột nối vào các bảng ĐÃ có.
_COT_0339 = (
    ("suppliers", "nhan_gia_cong", "BOOLEAN NOT NULL DEFAULT false"),
    ("lsx_cong_doan", "nha_cung_cap_id", "INTEGER"),
    ("san_xuat_cong_viec", "gia_cong_ngoai_id",
     "INTEGER REFERENCES gia_cong_ngoai(id) ON DELETE SET NULL"),
    ("stock_requests", "gia_cong_ngoai_id", "INTEGER"),
    ("delivery_trips", "gia_cong_ngoai_id", "INTEGER"),
    ("payment_vouchers", "gia_cong_ngoai_id",
     "INTEGER REFERENCES gia_cong_ngoai(id) ON DELETE RESTRICT"),
)


def _migrate_gia_cong_ngoai(db) -> None:
    """Sáu cột nối + index của lần gia công ngoài. Idempotent (soi cột trước khi thêm).

    KHÔNG backfill: NCC có sẵn mặc định KHÔNG nhận gia công (người mua hàng tự tích), bước thuê
    ngoài cũ còn tên chữ mà chưa có `nha_cung_cap_id` ⇒ bảng "còn thiếu" sẽ nhắc chọn lại — đúng ý,
    tên gõ tay không đối chiếu được với danh mục.
    """
    insp = inspect(db.get_bind())
    bang = set(insp.get_table_names())
    for ten_bang, cot, kieu in _COT_0339:
        if ten_bang not in bang or cot in _existing_columns(insp, ten_bang):
            continue
        db.execute(text(f"ALTER TABLE {ten_bang} ADD COLUMN {cot} {kieu}"))
    for ten_bang, cot in (
        ("lsx_cong_doan", "nha_cung_cap_id"),
        ("san_xuat_cong_viec", "gia_cong_ngoai_id"),
        ("stock_requests", "gia_cong_ngoai_id"),
        ("delivery_trips", "gia_cong_ngoai_id"),
    ):
        if ten_bang in bang:
            db.execute(text(
                f"CREATE INDEX IF NOT EXISTS ix_{ten_bang}_{cot} ON {ten_bang} ({cot})"))
    if "payment_vouchers" in bang:
        # Cùng khuôn `uq_payment_voucher_salary_advance` (mg 0271): phiếu đã huỷ nhường chỗ.
        db.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_voucher_gia_cong_ngoai "
            "ON payment_vouchers (gia_cong_ngoai_id) WHERE status <> 'cancelled'"))
    db.commit()


MIGRATIONS.append(("0339_gia_cong_ngoai", _migrate_gia_cong_ngoai))
```

- [ ] **Step 6: Cập nhật `docs/DB_SCHEMA.md`**

Thêm section mới (đặt ngay sau section ``### `lsx_cong_doan` ``):

```markdown
### `gia_cong_ngoai`

**Purpose:** Một LẦN gia công ngoài (spec `docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md`). `mot_phan` = một dải bước "Thuê ngoài" liền nhau cùng nhà gia công (các `san_xuat_cong_viec` của dải trỏ về qua `gia_cong_ngoai_id`); `tron_goi` = cả lệnh, phát hành với MỘT công việc không tổ. Trạng thái và tiền DẪN XUẤT (không cột). Người ghi là tham chiếu MỀM tới `users`. Bảng mới → `create_all` tự tạo; cột nối ở các bảng khác thêm bằng mg `0339`.

| Column | Type | Key | Null | Default | Meaning |
| --- | --- | --- | --- | --- | --- |
| `id` | `Integer` | **PK** | no | auto | |
| `lsx_id` | `Integer` | FK `lsx` CASCADE, idx | no | — | Lệnh của lần. |
| `kieu` | `String(12)` | — | no | — | `mot_phan` \| `tron_goi`. |
| `nha_cung_cap_id` | `Integer` | FK `suppliers`, idx | no | — | Nhà gia công (NCC có `nhan_gia_cong`). |
| `nha_cung_cap_ten` | `String(255)` | — | no | `""` | Ảnh chụp tên NCC lúc đặt. |
| `ten_viec` | `String(255)` | — | no | `""` | "Cán màng", "Bế + Dán", "Gia công trọn gói". |
| `don_gia` | `Numeric(18,2)` | — | yes | — | Đơn giá theo `don_vi` của con số cuối. Tiền = `sl_cuoi × don_gia` (dẫn xuất). |
| `don_vi` | `String(40)` | — | yes | — | Đơn vị con số cuối (đơn vị ra của bước cuối dải / đơn vị thành phẩm). |
| `sl_dat` | `Numeric(18,3)` | — | yes | — | Trọn gói: số đặt. |
| `xuong_cap_giay` | `Boolean` | — | no | `false` | Trọn gói: xưởng cấp giấy (đề nghị xuất) hay NCC tự lo (nhả giữ chỗ). |
| `mang_di_boi_id` | `Integer` | soft → `users` | yes | — | Người bấm "Đã mang đi" (một phần). |
| `mang_di_luc` | `DateTime(tz)` | — | yes | — | Giờ mang đi. |
| `sl_gui` | `Numeric(18,3)` | — | yes | — | Σ bàn giao đã nhận từ bước trước. |
| `chot_boi_id` | `Integer` | soft → `users` | yes | — | Người chốt con số cuối. |
| `chot_luc` | `DateTime(tz)` | — | yes | — | Giờ chốt. |
| `sl_cuoi` | `Numeric(18,3)` | — | yes | — | CON SỐ CUỐI (KCS làm ngoài phần mềm). |
| `noi_ve` | `String(8)` | — | yes | — | `xuong` \| `kho` \| `khach`. |
| `huy_boi_id` | `Integer` | soft → `users` | yes | — | Người huỷ. |
| `huy_luc` | `DateTime(tz)` | — | yes | — | Giờ huỷ (trọn gói huỷ / gói bị thu hồi). |
| `ly_do_huy` | `String(500)` | — | yes | — | Lý do huỷ. |
| `created_by` | `Integer` | soft → `users` | yes | — | Người đặt. |
| `created_at` | `DateTime(tz)` | — | no | now | |
| `updated_at` | `DateTime(tz)` | — | no | now | |
| `version` | `Integer` | — | no | 1 | Khoá lạc quan cho Mang đi / Chốt / Mở lại. |
```

Trong các section ĐẦU TIÊN của từng bảng, thêm một dòng bảng (khớp định dạng bảng đang có ở section đó; nếu section chỉ có dòng "**Tất cả cột:**" thì thêm tên cột vào dòng đó):
- ``### `suppliers` `` (dòng ~1996): `nhan_gia_cong` — `Boolean`, not null, `false` — "Nhận gia công ngoài; ô chọn Nhà gia công ở KHSX chỉ mời NCC đang hoạt động có cờ này (mg 0339)."
- ``### `lsx_cong_doan` `` (dòng ~4112): `nha_cung_cap_id` — `Integer` soft → `suppliers`, idx — "Nhà gia công của bước thuê ngoài; `nha_cung_cap` (chữ) do máy chủ ghi theo nó (mg 0339)." Thêm `nha_cung_cap_id` vào dòng "**Tất cả cột:**"; sửa nghĩa dòng `nha_cung_cap` thành "Tên nhà gia công — máy chủ ghi theo `nha_cung_cap_id`, client không gửi."
- ``### `san_xuat_cong_viec` ``: `gia_cong_ngoai_id` — FK `gia_cong_ngoai` SET NULL, idx — "Lần gia công ngoài của công việc; có ⇒ không vào bàn tổ (mg 0339)."
- ``### `stock_requests` ``: `gia_cong_ngoai_id` — soft, idx — "Đề nghị xuất giấy trọn gói / nhập TP từ lần gia công (mg 0339)."
- ``### `delivery_trips` ``: `gia_cong_ngoai_id` — soft, idx — "Chuyến 'nhà gia công giao thẳng' — không xe, không kho, loại khỏi tiền km (mg 0339)."
- ``### `payment_vouchers` `` (dòng ~2420): `gia_cong_ngoai_id` — FK `gia_cong_ngoai` RESTRICT, partial unique `uq_payment_voucher_gia_cong_ngoai` — "Nguồn `gia_cong_ngoai`; một lần ⇄ một phiếu còn sống (mg 0339)."

- [ ] **Step 7: Chạy lại test + guard schema**

Run: `python -m pytest backend/tests/test_gia_cong_ngoai_du_lieu.py backend/tests/test_schema_documented.py backend/tests/test_user_fk_cascade.py backend/tests/test_migration_khong_dung_pragma.py -q`
Expected: PASS.

- [ ] **Step 8: Commit (khi người dùng cho phép)**

```bash
git add backend/app/models/gia_cong_ngoai.py backend/app/models/__init__.py backend/app/models/purchase.py backend/app/models/lsx.py backend/app/models/san_xuat.py backend/app/models/stock_request.py backend/app/models/delivery.py backend/app/models/accounting.py backend/app/db_migrations.py docs/DB_SCHEMA.md backend/tests/test_gia_cong_ngoai_du_lieu.py
git commit -m "gia_cong_ngoai: bảng lần gia công + 6 cột nối (mg 0339)"
```

---

### Task 2: Nhà gia công = Nhà cung cấp có tích "Nhận gia công"

**Files:**
- Modify: `backend/app/schemas/purchase.py:47-67` (`SupplierIn.nhan_gia_cong`), `:97-129` (`SupplierRow.nhan_gia_cong`)
- Modify: `backend/app/services/purchase_service.py:737-814` (`_clean_supplier_values` trả thêm khoá)
- Modify: `backend/app/repositories/purchase_repo.py:328-381` (`create(... nhan_gia_cong=False)`)
- Create: `backend/app/repositories/gia_cong_ngoai_repo.py` (phần `nha_gia_cong_options`)
- Create: `backend/app/schemas/gia_cong_ngoai.py` (phần `NhaGiaCongOut`)
- Create: `backend/app/routers/gia_cong_ngoai.py` (khung router + `GET /nha-gia-cong`)
- Modify: `backend/app/main.py` (include router)
- Modify: `frontend/src/api/client.ts` (kiểu NCC + `api.giaCongNgoai.nhaGiaCong`)
- Modify: form Nhà cung cấp (`grep -rn "supplier_group" frontend/src/pages --include=*.tsx -l` để tìm đúng file form; thêm ô tích)
- Test: `backend/tests/test_gia_cong_ncc.py`

**Interfaces:**
- Consumes: `Supplier.nhan_gia_cong` (Task 1).
- Produces:
  - `GiaCongNgoaiRepository(db)` với `nha_gia_cong_options() -> list[Supplier]` (đang hoạt động + có cờ, sắp theo tên).
  - `GET /api/gia-cong-ngoai/nha-gia-cong` → `list[{"id": int, "ten": str}]`, quyền `san_xuat:read`.
  - Router `backend/app/routers/gia_cong_ngoai.py` với `router = APIRouter(prefix="/api/gia-cong-ngoai", tags=["gia-cong-ngoai"])`, `MODULE = "san_xuat"`, helper `_chay(fn)` (PermissionError→403, `GiaCongXungDot`→409, ValueError→400). Task 6+ thêm endpoint vào đây.
  - FE: `api.giaCongNgoai.nhaGiaCong(token): Promise<{ id: number; ten: string }[]>`; `SupplierRow.nhan_gia_cong: boolean`; `SupplierInput.nhan_gia_cong?: boolean`.

- [ ] **Step 1: Viết test thất bại**

```python
# backend/tests/test_gia_cong_ncc.py
"""Nhà gia công lấy từ danh mục Nhà cung cấp có tích "Nhận gia công" (spec §7)."""
from __future__ import annotations

from itertools import count

ADMIN = {"username": "admin", "password": "admin123"}
_dem = count(1)


def _h(client) -> dict[str, str]:
    r = client.post("/api/auth/login", json=ADMIN)
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _ncc(client, h, ten: str, **them) -> dict:
    i = next(_dem)
    r = client.post("/api/suppliers", headers=h, json={
        "name": ten, "tax_code": f"08{i:08d}", "phone": "0900000000", "email": f"gc{i}@x.vn",
        "address": "HN", "contact_name": "A", "supplier_group": "gia cong", **them,
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_luu_va_doc_lai_co_nhan_gia_cong(client):
    h = _h(client)
    row = _ncc(client, h, "Cán màng Minh Long", nhan_gia_cong=True)
    assert row["nhan_gia_cong"] is True
    body = {k: row[k] for k in ("name", "tax_code", "phone", "email", "address",
                                "contact_name", "supplier_group")}
    r = client.put(f"/api/suppliers/{row['id']}", headers=h, json={**body, "nhan_gia_cong": False})
    assert r.status_code == 200, r.text
    assert r.json()["nhan_gia_cong"] is False


def test_o_chon_chi_moi_ncc_dang_hoat_dong_co_tich(client):
    h = _h(client)
    co = _ncc(client, h, "In hộp Phú Thịnh", nhan_gia_cong=True)
    _ncc(client, h, "Giấy Hoàng Hà")                                  # không tích
    ngung = _ncc(client, h, "Bế Tân Tiến", nhan_gia_cong=True)
    assert client.patch(f"/api/suppliers/{ngung['id']}/toggle-active", headers=h).status_code == 200

    r = client.get("/api/gia-cong-ngoai/nha-gia-cong", headers=h)
    assert r.status_code == 200, r.text
    assert r.json() == [{"id": co["id"], "ten": "In hộp Phú Thịnh"}]
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_ncc.py -q`
Expected: FAIL — `KeyError: 'nhan_gia_cong'` và 404 ở `/api/gia-cong-ngoai/nha-gia-cong`.

- [ ] **Step 3: Nối cờ qua schema → service → repo**

`backend/app/schemas/purchase.py` — `SupplierIn` thêm `nhan_gia_cong: bool = False` (sau `status`); `SupplierRow` thêm `nhan_gia_cong: bool = False` (sau `status`).

`backend/app/services/purchase_service.py::_clean_supplier_values` — trong dict trả về, sau `"status": status,`:

```python
            # Tích "Nhận gia công" (26/09/2026) — ô chọn Nhà gia công ở Kế hoạch SX lọc theo cờ này.
            "nhan_gia_cong": bool(values.get("nhan_gia_cong")),
```

`backend/app/repositories/purchase_repo.py::create` — thêm tham số `nhan_gia_cong: bool = False,` và truyền `nhan_gia_cong=nhan_gia_cong,` vào `Supplier(...)`. (`update` đã `setattr` mọi khoá nên tự nhận.)

- [ ] **Step 4: Repo + schema + router khung**

```python
# backend/app/repositories/gia_cong_ngoai_repo.py
"""Truy vấn của LẦN GIA CÔNG NGOÀI — spec 2026-09-26. Mọi SELECT của module nằm ở đây."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.purchase import SUPPLIER_ACTIVE, Supplier


class GiaCongNgoaiRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Nhà gia công ----------------------------------------------------------------------
    def nha_gia_cong_options(self) -> list[Supplier]:
        """NCC ĐANG HOẠT ĐỘNG có tích "Nhận gia công", theo tên — nguồn DUY NHẤT của ô chọn."""
        return list(self.db.scalars(
            select(Supplier)
            .where(Supplier.nhan_gia_cong.is_(True), Supplier.status == SUPPLIER_ACTIVE)
            .order_by(Supplier.name, Supplier.id)
        ))

    def nha_gia_cong(self, supplier_id: int | None) -> Supplier | None:
        """Một NCC CÒN chọn được làm nhà gia công — None nếu không có / ngưng / chưa tích."""
        if not supplier_id:
            return None
        s = self.db.get(Supplier, int(supplier_id))
        if s is None or not s.nhan_gia_cong or s.status != SUPPLIER_ACTIVE:
            return None
        return s
```

(Kiểm tên hằng trạng thái hoạt động: `grep -n "SUPPLIER_ACTIVE" backend/app/models/purchase.py`. Nếu tên khác, dùng đúng tên đó.)

```python
# backend/app/schemas/gia_cong_ngoai.py
"""Body / response của `/api/gia-cong-ngoai` — spec 2026-09-26."""
from __future__ import annotations

from pydantic import BaseModel


class NhaGiaCongOut(BaseModel):
    id: int
    ten: str
```

```python
# backend/app/routers/gia_cong_ngoai.py
"""Gia công ngoài — một cửa ghi DUY NHẤT cho mang đi / chốt / mở lại / trọn gói (spec 2026-09-26).

Quyền: ai sửa được lệnh (`san_xuat:update`) — không thêm vai, không thêm bit (spec §6). Tiền của
lần chỉ trả cho người có `kho:view_cost`. Mọi SSE bắn SAU commit.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_authorization_service, require_permission
from ..models.user import User
from ..repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ..schemas.gia_cong_ngoai import NhaGiaCongOut
from ..services.rbac_service import AuthorizationService

router = APIRouter(prefix="/api/gia-cong-ngoai", tags=["gia-cong-ngoai"])
MODULE = "san_xuat"
Authz = Annotated[AuthorizationService, Depends(get_authorization_service)]


def _chay(fn):
    """Lỗi nghiệp vụ → mã HTTP: quyền 403 · người khác vừa đổi 409 · ràng buộc 400."""
    from ..services.gia_cong_ngoai import GiaCongXungDot

    try:
        return fn()
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except GiaCongXungDot as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/nha-gia-cong", response_model=list[NhaGiaCongOut])
def nha_gia_cong(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission(MODULE, "read"))],
) -> list[dict]:
    """Ô chọn Nhà gia công của Kế hoạch SX — người kế hoạch không cần quyền Mua hàng."""
    return [{"id": s.id, "ten": s.name} for s in GiaCongNgoaiRepository(db).nha_gia_cong_options()]
```

Tạo sẵn `backend/app/services/gia_cong_ngoai/__init__.py` (Task 6 bổ sung phần còn lại):

```python
"""Gia công ngoài — service (spec docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md)."""
from __future__ import annotations


class GiaCongXungDot(ValueError):
    """Lần gia công vừa bị người khác đổi (lệch `version`) — router dịch 409."""
```

`backend/app/main.py`: import `gia_cong_ngoai` cùng chỗ các router khác và `app.include_router(gia_cong_ngoai.router)` (đặt cạnh `san_xuat`).

- [ ] **Step 5: Chạy test**

Run: `python -m pytest backend/tests/test_gia_cong_ncc.py -q`
Expected: PASS.

- [ ] **Step 6: Frontend — kiểu + api + ô tích**

`frontend/src/api/client.ts`:
- trong kiểu dòng NCC (`grep -n "supplier_group" frontend/src/api/client.ts` → interface `SupplierRow` và kiểu input tương ứng) thêm `nhan_gia_cong: boolean;` (row) và `nhan_gia_cong?: boolean;` (input);
- thêm namespace:

```ts
export interface NhaGiaCong { id: number; ten: string }
```
và trong object `api`:

```ts
  giaCongNgoai: {
    /** Ô chọn Nhà gia công — NCC đang hoạt động có tích "Nhận gia công" (spec gia công ngoài §7). */
    nhaGiaCong(token: string): Promise<NhaGiaCong[]> {
      return authed<NhaGiaCong[]>("/api/gia-cong-ngoai/nha-gia-cong", token);
    },
  },
```
(`authed<T>(url, token, init?)` là helper mọi namespace trong file đang dùng — xem `api.lsx.preview`. Task 6/10/14 thêm method vào CHÍNH namespace này.)

Form Nhà cung cấp: cạnh ô "Nhóm nhà cung cấp", thêm:

```tsx
<label className="purchase__check">
  <input
    type="checkbox"
    checked={Boolean(form.nhan_gia_cong)}
    onChange={(e) => setForm((f) => ({ ...f, nhan_gia_cong: e.target.checked }))}
  />
  Nhận gia công
  <span className="purchase__hint">Hiện trong ô chọn “Nhà gia công” ở Kế hoạch sản xuất.</span>
</label>
```
(khớp tên state/setter và class của form đang có; payload gửi PUT/POST phải mang `nhan_gia_cong`.)

Run (trong `frontend/`): `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 7: Commit (khi người dùng cho phép)**

```bash
git add backend/app/schemas/purchase.py backend/app/services/purchase_service.py backend/app/repositories/purchase_repo.py backend/app/repositories/gia_cong_ngoai_repo.py backend/app/schemas/gia_cong_ngoai.py backend/app/routers/gia_cong_ngoai.py backend/app/services/gia_cong_ngoai/__init__.py backend/app/main.py backend/tests/test_gia_cong_ncc.py frontend/src
git commit -m "gia_cong_ngoai: tích Nhận gia công ở hồ sơ NCC + ô chọn nhà gia công"
```

---

### Task 3: Bước "Thuê ngoài" ở Kế hoạch SX — nhà gia công từ danh mục, không tổ / máy / vật tư / thời lượng

**Files:**
- Create: `backend/tests/gia_cong_fixtures.py`
- Modify: `backend/app/schemas/lsx.py:150-205` (`LsxCongDoanIn`: bỏ `nha_cung_cap`, thêm `nha_cung_cap_id`), `LsxCongDoanOut` (thêm `nha_cung_cap_id`)
- Modify: `backend/app/services/lsx_service.py` — `thoi_luong_buoc` (330-360), `sl_tinh_cua_buoc` (927-928), `_bung_vat_tu_cong_doan` (1494-1520), `thieu_cua` (1673-1687), `_cong_doan_dict` (2320-2325), `_ROUTING_FIELD_*` (2759-2774), `replace_routing` (2955-3030, 3078-3082)
- Modify: `frontend/src/api/client.ts:606` (nhãn mã thiếu)
- Test: `backend/tests/test_gia_cong_buoc_lenh.py`

**Interfaces:**
- Consumes: `GiaCongNgoaiRepository(db).nha_gia_cong(supplier_id) -> Supplier | None` (Task 2); cột `lsx_cong_doan.nha_cung_cap_id` (Task 1).
- Produces:
  - `LsxCongDoanIn.nha_cung_cap_id: int | None`; client KHÔNG gửi `nha_cung_cap` (chữ) nữa, máy chủ ghi tên theo NCC.
  - Bước `loai_buoc == "thue_ngoai"` sau khi lưu: `department_id = None`, `may_id = None`, `so_luot_chay = 1`, không dòng vật tư.
  - `thoi_luong_buoc(...)["dien_giai"]["phuong_phap"] == "thue_ngoai"`, mọi số phút = 0, `canh_bao == []`.
  - Mã thiếu mới `"thieu_nha_gia_cong"` trong `LsxService.thieu_cua`.
  - `_cong_doan_dict(...)["nha_cung_cap_id"]`.
  - Khuôn test `tests/gia_cong_fixtures.py`: `ncc(sess, ten="Cán màng Minh Long", *, nhan=True) -> Supplier`, `lenh_chua_phat(sess, orders, lsx_svc, admin, customer) -> Lsx`, `dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, *, buoc) -> int`.

- [ ] **Step 1: Viết khuôn test dùng chung**

```python
# backend/tests/gia_cong_fixtures.py
"""Khuôn dựng dữ liệu cho các bài Gia công ngoài (spec 2026-09-26).

Dùng CHUNG các fixture `sess` / `admin` / `customer` / `orders` / `lsx_svc` của
`tests/lenh_sx_fixtures.py` — file test nào dùng thì import cả hai.
"""
from __future__ import annotations

from itertools import count

from app.models.lsx import LB_THUE_NGOAI, TT_DA_PHAT_HANH, Lsx, LsxCongDoan, LsxCongDoanPhuThuoc
from app.models.purchase import Supplier
from app.services.san_xuat import release
from tests.test_san_xuat_board import _to_moi
from tests.test_xep_lich_service import _don_da_chuyen_sx, _ptg_2_in

_dem = count(1)


def ncc(sess, ten: str = "Cán màng Minh Long", *, nhan: bool = True) -> Supplier:
    """Một nhà cung cấp; `nhan=True` = có tích "Nhận gia công"."""
    s = Supplier(name=ten, nhan_gia_cong=nhan)
    sess.add(s)
    sess.flush()
    return s


def lenh_chua_phat(sess, orders, lsx_svc, admin, customer) -> Lsx:
    """MỘT lệnh vừa tạo từ đơn (nháp, CHƯA giữ chỗ vật tư) — sửa routing / đặt trọn gói được.

    Không dùng `_hai_lsx_san_sang`: hàm đó bật giữ chỗ, mà lệnh đang giữ chỗ thì `replace_routing`
    chặn (`_chan_dang_giu_cho`)."""
    ptg = _ptg_2_in(sess)
    d = _don_da_chuyen_sx(sess, orders, admin, customer, ptg)
    ids = [l["order_line_id"] for l in lsx_svc.preview(d.id)["lines"]]
    return lsx_svc.tao(order_id=d.id, order_line_ids=ids[:1], actor=admin)[0]


def dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, *, buoc) -> int:
    """Lệnh ĐÃ PHÁT HÀNH, routing tuyến tính do bài test mô tả. Trả `lsx_id`.

    `buoc` = list `(ten, loai_buoc, nha_cung_cap | None, so_luong_ra, don_vi_ra)`. Bước máy/tổ về
    MỘT tổ mới (admin có đủ quyền trên tổ); bước thuê ngoài không tổ, đơn giá 500đ."""
    i = next(_dem)
    to = _to_moi(sess, f"Tổ GC {i}", f"TO-GC-{i}")
    lsx = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    for cd in list(lsx.cong_doans):
        sess.delete(cd)
    sess.flush()
    buocs: list[LsxCongDoan] = []
    dv_truoc = "to"
    for k, (ten, loai, s, sl_ra, dv_ra) in enumerate(buoc):
        cd = LsxCongDoan(
            lsx_id=lsx.id, thu_tu=k, ten=ten, nhom="print" if k == 0 else "finishing",
            loai_buoc=loai, department_id=None if loai == LB_THUE_NGOAI else to.id,
            nha_cung_cap_id=s.id if s else None, nha_cung_cap=s.name if s else None,
            don_gia_gia_cong=500 if loai == LB_THUE_NGOAI else None,
            so_luong_vao=sl_ra, so_luong_ra=sl_ra, don_vi_vao=dv_truoc, don_vi_ra=dv_ra,
        )
        sess.add(cd)
        buocs.append(cd)
        dv_truoc = dv_ra
    sess.flush()
    for a, b in zip(buocs, buocs[1:]):
        sess.add(LsxCongDoanPhuThuoc(buoc_truoc_id=a.id, buoc_sau_id=b.id))
    sess.commit()
    release.phat_hanh(sess, lsx_ids={lsx.id}, actor=admin)
    lsx.trang_thai = TT_DA_PHAT_HANH
    sess.commit()
    return lsx.id
```

- [ ] **Step 2: Viết test thất bại**

```python
# backend/tests/test_gia_cong_buoc_lenh.py
"""Bước "Thuê ngoài" ở Kế hoạch SX (spec 2026-09-26 §7, §8, §10).

Nhà gia công chọn từ danh mục Nhà cung cấp; bước không tổ, không máy, không vật tư, không thời
lượng; thiếu nhà gia công thì chặn "Sẵn sàng"."""
from __future__ import annotations

import pytest

from app.models.lsx import LB_MAY, LB_THUE_NGOAI
from app.schemas.lsx import LsxCongDoanIn
from app.services.lsx_service import LsxValidationError, thoi_luong_buoc
from tests.gia_cong_fixtures import lenh_chua_phat, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


def _rows(lsx, **sua_buoc_cuoi) -> list[LsxCongDoanIn]:
    ds = sorted(lsx.cong_doans, key=lambda c: c.thu_tu)
    out = []
    for i, c in enumerate(ds):
        d = {"step_key": c.step_key, "thu_tu": i, "cong_doan_id": c.cong_doan_id, "ten": c.ten,
             "nhom": c.nhom, "loai_buoc": c.loai_buoc, "department_id": c.department_id,
             "may_id": c.may_id}
        if i == len(ds) - 1:
            d.update(sua_buoc_cuoi)
        out.append(LsxCongDoanIn(**d))
    return out


def test_buoc_thue_ngoai_lay_ten_tu_danh_muc_va_bo_to_may(sess, orders, lsx_svc, admin, customer):
    s = ncc(sess)
    lsx = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    lsx = lsx_svc.replace_routing(lsx_id=lsx.id, rows_in=_rows(
        lsx, loai_buoc=LB_THUE_NGOAI, nha_cung_cap_id=s.id, don_gia_gia_cong=150,
    ), actor=admin)
    cd = max(lsx.cong_doans, key=lambda c: c.thu_tu)
    assert (cd.nha_cung_cap_id, cd.nha_cung_cap) == (s.id, "Cán màng Minh Long")
    assert cd.department_id is None and cd.may_id is None
    assert list(cd.vat_tus) == []
    assert float(cd.don_gia_gia_cong) == 150


def test_ncc_khong_tich_nhan_gia_cong_bi_tu_choi(sess, orders, lsx_svc, admin, customer):
    s = ncc(sess, "Giấy Hoàng Hà", nhan=False)
    lsx = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    with pytest.raises(LsxValidationError, match="Nhận gia công"):
        lsx_svc.replace_routing(lsx_id=lsx.id, rows_in=_rows(
            lsx, loai_buoc=LB_THUE_NGOAI, nha_cung_cap_id=s.id), actor=admin)


def test_doi_ve_buoc_may_thi_xoa_nha_gia_cong(sess, orders, lsx_svc, admin, customer):
    s = ncc(sess)
    lsx = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    lsx = lsx_svc.replace_routing(lsx_id=lsx.id, rows_in=_rows(
        lsx, loai_buoc=LB_THUE_NGOAI, nha_cung_cap_id=s.id), actor=admin)
    lsx = lsx_svc.replace_routing(lsx_id=lsx.id, rows_in=_rows(lsx, loai_buoc=LB_MAY), actor=admin)
    cd = max(lsx.cong_doans, key=lambda c: c.thu_tu)
    assert cd.nha_cung_cap_id is None and cd.nha_cung_cap is None


def test_thieu_nha_gia_cong_chan_san_sang(sess, orders, lsx_svc, admin, customer):
    lsx = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    lsx = lsx_svc.replace_routing(lsx_id=lsx.id, rows_in=_rows(
        lsx, loai_buoc=LB_THUE_NGOAI), actor=admin)
    thieu = lsx_svc.thieu_cua(lsx)
    assert "thieu_nha_gia_cong" in thieu
    assert "thieu_to_may" not in thieu     # bước thuê ngoài không bị đòi tổ/máy


def test_thoi_luong_buoc_thue_ngoai_bang_0_khong_canh_bao():
    class Buoc:
        loai_buoc = LB_THUE_NGOAI
        so_luot_chay = 3
        phat_sinh_phut = 45
        so_gio_ke_hoach = 0
        so_luong_vao = 5000
        don_vi_vao = "to"

    t = thoi_luong_buoc(Buoc(), None, None)
    assert t["chiem_may_phut"] == 0 and t["tong_phut"] == 0
    assert t["dien_giai"]["phuong_phap"] == "thue_ngoai"
    assert t["canh_bao"] == []
```

(`thoi_luong_buoc` trả khoá `canh_bao` ở cấp ngoài — kiểm bằng `grep -n '"canh_bao"' backend/app/services/lsx_service.py` trong khoảng 430-470; nếu nó nằm trong `dien_giai` thì đổi dòng assert cuối thành `t["dien_giai"]["canh_bao"] == []`.)

- [ ] **Step 3: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_buoc_lenh.py -q`
Expected: FAIL — `nha_cung_cap_id` không có trong `LsxCongDoanIn` (bị bỏ qua) nên tên không được ghi; `phuong_phap == "thieu_nang_suat"`.

- [ ] **Step 4: Schema**

`backend/app/schemas/lsx.py` — trong `LsxCongDoanIn` thay dòng `nha_cung_cap: str | None = None` bằng:

```python
    # Gia công ngoài (spec 2026-09-26): nhà gia công = NCC có tích "Nhận gia công". Chỉ gửi ID —
    # tên (`nha_cung_cap`) do máy chủ ghi theo NCC đã chọn, client không gửi chữ.
    nha_cung_cap_id: int | None = None
```
Trong `LsxCongDoanOut`, ngay trên dòng `nha_cung_cap: str | None = None` thêm `nha_cung_cap_id: int | None = None`.

- [ ] **Step 5: Thời lượng = 0 cho bước thuê ngoài**

`backend/app/services/lsx_service.py::thoi_luong_buoc`:
- đổi dòng `khac = _f(getattr(cd, "phat_sinh_phut", 0))` thành

```python
    # Bước THUÊ NGOÀI không có thời lượng (spec gia công ngoài §8) — kể cả "thời gian khác".
    khac = 0.0 if loai == LB_THUE_NGOAI else _f(getattr(cd, "phat_sinh_phut", 0))
```
- thay khối chú thích "THUÊ NGOÀI ăn CHUNG đường của bước máy…" + dòng `theo_may = loai in (LB_MAY, LB_THUE_NGOAI)` bằng:

```python
    # THUÊ NGOÀI KHÔNG đi đường máy nữa (26/09/2026): nhà gia công chọn từ danh mục Nhà cung cấp,
    # không còn là "máy giả" trong danh mục Máy — không tốc độ, không chuẩn bị, không lượt.
    theo_may = loai == LB_MAY
```
- trong nhánh chọn công thức, chèn nhánh giữa `if loai == LB_TO:` và `else:`:

```python
    elif loai == LB_THUE_NGOAI:
        # Nhà gia công chạy theo lịch của họ; xưởng không dựng ngày hẹn về (chủ chốt 26/09/2026).
        chay = chay_nhanh = chay_cham = 0.0
        phuong_phap = "thue_ngoai"
```
- trong `dien_giai`, đổi `"nguon_nang_suat": "gio_ke_hoach" if loai == LB_TO else "may",` thành

```python
        "nguon_nang_suat": {LB_TO: "gio_ke_hoach", LB_THUE_NGOAI: "thue_ngoai"}.get(loai, "may"),
```
- sửa câu cuối docstring "Bước THUÊ NGOÀI đi theo ngày gửi/nhận, thời lượng máy = 0." thành "Bước THUÊ NGOÀI = 0 phút, không cảnh báo (spec gia công ngoài §8)."

`sl_tinh_cua_buoc`: đổi `if loai in (LB_MAY, LB_THUE_NGOAI):` thành `if loai == LB_MAY:` và sửa docstring câu "(và THUÊ NGOÀI — nhà thầu là một máy khai trong danh mục)" thành "Bước THUÊ NGOÀI và bước TỔ trả `None`".

- [ ] **Step 6: Không bung vật tư, không đòi tổ/máy, đòi nhà gia công**

`_bung_vat_tu_cong_doan` — ngay đầu vòng `for cd in lsx.cong_doans:` thêm:

```python
            # THUÊ NGOÀI không bung — nhà gia công tự lo vật tư (tiền nằm trong đơn giá, spec §3).
            if cd.loai_buoc == LB_THUE_NGOAI:
                continue
```

`thieu_cua` — thay khối từ `# Mọi bước phải biết ai/máy nào làm…` tới hết `thieu.append("thieu_to_may")` bằng:

```python
            # Bước MÁY/TỔ phải biết ai/máy nào làm thì Gantt mới có chỗ đặt. Bước THUÊ NGOÀI không
            # tổ, không máy — nó phải có NHÀ GIA CÔNG chọn từ danh mục (spec 2026-09-26 §7); tên
            # gõ tay kiểu cũ (`nha_cung_cap` có chữ mà không có id) không tính.
            if cd.loai_buoc == LB_THUE_NGOAI:
                if cd.nha_cung_cap_id is None and "thieu_nha_gia_cong" not in thieu:
                    thieu.append("thieu_nha_gia_cong")
            elif (cd.loai_buoc in (LB_MAY, LB_TO)
                    and not (cd.department_id or cd.may_id)):
                if "thieu_to_may" not in thieu:
                    thieu.append("thieu_to_may")
```

`frontend/src/api/client.ts` — trong bảng nhãn có dòng `thieu_to_may: "Có công đoạn chưa gán tổ / máy",` thêm ngay dưới:

```ts
  thieu_nha_gia_cong: "Có bước thuê ngoài chưa chọn nhà gia công",
```

- [ ] **Step 7: Lưu routing — máy chủ ghi tên, gỡ tổ/máy/vật tư**

`_ROUTING_FIELD_THUAN`: bỏ chuỗi `"nha_cung_cap", ` khỏi dòng `"nha_cung_cap", "sl_gui", …`. `_ROUTING_FIELD_NULLABLE`: bỏ `"nha_cung_cap", `.

`replace_routing`:
- điều kiện soi tổ phụ trách (khối `if (cd_obj is not None and dept is not None and cd_obj.department_ids …`) thêm vế đầu `(d.get("loai_buoc") or old_loai) != LB_THUE_NGOAI and` — bước thuê ngoài không có tổ để soi.
- ngay SAU khối `if row.loai_buoc == LB_TO: … row.so_luot_chay = 1` chèn:

```python
            # GIA CÔNG NGOÀI (spec 2026-09-26 §7): bước thuê ngoài KHÔNG tổ, KHÔNG máy — nhà gia công
            # chọn từ danh mục Nhà cung cấp (cờ `nhan_gia_cong`) và TÊN do máy chủ ghi theo. Gỡ ở
            # SERVER chứ không chỉ ẩn ô: tổ còn dính lại là công việc rơi vào bàn tổ đó sau phát hành.
            if row.loai_buoc == LB_THUE_NGOAI:
                row.department_id = None
                row.may_id = None
                row.so_luot_chay = 1
                if "nha_cung_cap_id" in d:
                    ncc_id = d.get("nha_cung_cap_id")
                    if ncc_id is None:
                        row.nha_cung_cap_id, row.nha_cung_cap = None, None
                    elif ncc_id != row.nha_cung_cap_id:
                        ncc = GiaCongNgoaiRepository(self.db).nha_gia_cong(ncc_id)
                        if ncc is None:
                            raise LsxValidationError(
                                "Nhà gia công phải là nhà cung cấp đang hoạt động có tích "
                                "“Nhận gia công” — vào màn Nhà cung cấp để tích.")
                        row.nha_cung_cap_id, row.nha_cung_cap = ncc.id, ncc.name
            else:
                # Đổi khỏi thuê ngoài thì dọn dữ liệu nhà gia công — không để checklist hiểu nhầm.
                row.nha_cung_cap_id, row.nha_cung_cap = None, None
                row.don_gia_gia_cong = None
```
  và thêm import ở đầu file: `from ..repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository`.
- vòng đồng bộ vật tư (`for row, d in zip(rows, payloads):` ngay dưới chú thích "Vật tư là khai báo riêng của bước"): thay hai dòng

```python
            if "vat_tus" not in d:
                continue
            vat_tus = d.get("vat_tus") or []
```
bằng

```python
            ngoai = row.loai_buoc == LB_THUE_NGOAI
            if "vat_tus" not in d and not ngoai:
                continue
            # Bước thuê ngoài không có dòng vật tư (spec §3): đổi sang thuê ngoài là dọn sạch.
            vat_tus = [] if ngoai else (d.get("vat_tus") or [])
```

`_cong_doan_dict`: thay `"nha_cung_cap": cd.nha_cung_cap, "sl_gui": …` bằng `"nha_cung_cap_id": cd.nha_cung_cap_id, "nha_cung_cap": cd.nha_cung_cap, "sl_gui": …` (các khoá cũ còn lại gỡ ở Task 4).

- [ ] **Step 8: Chạy test**

Run: `python -m pytest backend/tests/test_gia_cong_buoc_lenh.py backend/tests/test_lsx_service.py -q`
Expected: PASS. Nếu `test_lsx_service.py` có bài khẳng định bước thuê ngoài đi đường máy (tìm `LB_THUE_NGOAI` trong file), sửa bài đó theo luật mới và ghi lý do trong docstring.

Run (trong `frontend/`): `npx tsc --noEmit` — Expected: không lỗi.

- [ ] **Step 9: Commit (khi người dùng cho phép)**

```bash
git add backend/tests/gia_cong_fixtures.py backend/tests/test_gia_cong_buoc_lenh.py backend/app/schemas/lsx.py backend/app/services/lsx_service.py frontend/src/api/client.ts
git commit -m "lsx: bước thuê ngoài chọn nhà gia công từ danh mục, không tổ/máy/vật tư/thời lượng"
```

---

### Task 4: Gỡ đồ cũ — 13 cột bước, sổ giao–nhận, ngày thuê ngoài ở Xếp lịch; chặn đổi tay sang "đã phát hành"

**Files:**
- Modify: `backend/app/models/lsx.py:322-345` (gỡ 13 cột)
- Modify: `backend/app/db_migrations.py` (cuối file: `0340_go_cot_thue_ngoai_cu`)
- Modify: `docs/DB_SCHEMA.md` (section `lsx_cong_doan`: gỡ 13 dòng + tên khỏi "Tất cả cột")
- Modify: `backend/app/schemas/lsx.py` (gỡ 8 trường In, 8 + 13 trường Out, class `LsxGiaoNhanIn`)
- Modify: `backend/app/services/lsx_service.py` (`_cong_doan_dict` 2325-2333, `_giao_nhan_dict` 2363-2405, `ghi_giao_nhan` 2407-2452, `_ROUTING_FIELD_*`, `set_trang_thai` 3231-3250)
- Modify: `backend/app/routers/lsx.py:36, 498-520` (gỡ cửa `POST …/giao-nhan`)
- Modify: `backend/app/services/xep_lich/service.py:62-77, 331-332, 1072`; `backend/app/services/xep_lich/trai_lich.py:29-40, 94-102`; `backend/app/schemas/xep_lich.py:155`
- Modify: `backend/tests/test_xep_lich_lenh_trai_lich.py:116-140, 218-230`
- Modify: `frontend/src/api/client.ts` (gỡ `LsxThueNgoaiFields` cũ + `LsxGiaoNhanFields` + `api.lsx.giaoNhan` + `thue_ngoai_ngay`), `frontend/src/pages/lsxBuoc.ts`, `frontend/src/pages/XlChiTiet.tsx:809, 888-889`
- Test: `backend/tests/test_gia_cong_go_cot_cu.py`

**Interfaces:**
- Consumes: Task 3 (`nha_cung_cap_id` đã thay chữ gõ tay).
- Produces:
  - `lsx_cong_doan` chỉ còn `nha_cung_cap_id`, `nha_cung_cap`, `don_gia_gia_cong` cho thuê ngoài.
  - `BuocVao` (xep_lich) KHÔNG còn `thue_ngoai_ngay`; `trai_lich` coi bước thuê ngoài = 0 phút + ghi chú "Không tính thời gian gia công ngoài."
  - `LsxService.set_trang_thai` ném `LsxValidationError` khi `trang_thai == "da_phat_hanh"`, và `LsxConflict` khi lệnh đang `da_phat_hanh`.
  - FE: `LsxCongDoan` có `nha_cung_cap_id: number | null; nha_cung_cap: string | null; don_gia_gia_cong: number | null`; `LsxCongDoanBody` có `nha_cung_cap_id?: number | null; don_gia_gia_cong?: number | null`.

- [ ] **Step 1: Viết test thất bại**

```python
# backend/tests/test_gia_cong_go_cot_cu.py
"""Gỡ phần thuê ngoài CŨ (spec 2026-09-26 §10): 13 cột bước, sổ giao–nhận, ngày thuê ngoài."""
from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db import Base
from app.db_migrations import _migrate_go_cot_thue_ngoai_cu
from app.models.lsx import TT_DA_PHAT_HANH
from app.services.lsx_service import LsxConflict, LsxValidationError
from app.services.xep_lich.trai_lich import BuocVao, trai_lich
import app.models  # noqa: F401
from tests.gia_cong_fixtures import dung_lenh_gia_cong, lenh_chua_phat, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401
from tests.test_xep_lich_lenh_trai_lich import lich_mot_ca  # noqa: F401

COT_CU = ("sl_gui", "ngay_gui_dk", "van_chuyen_ngay", "gia_cong_ngay", "ngay_nhan_dk",
          "hao_hut_cho_phep", "yeu_cau_ky_thuat", "nguoi_giao_id", "giao_luc", "sl_giao_thuc",
          "nguoi_nhan_id", "nhan_luc", "sl_nhan_thuc")


def test_model_khong_con_cot_cu():
    cot = set(Base.metadata.tables["lsx_cong_doan"].columns.keys())
    assert not (set(COT_CU) & cot)
    assert {"nha_cung_cap_id", "nha_cung_cap", "don_gia_gia_cong"} <= cot


def test_migration_0340_go_cot_va_chay_lai_la_no_op():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as cn:
        cn.execute(text(
            "CREATE TABLE lsx_cong_doan (id INTEGER PRIMARY KEY, ten VARCHAR(150), "
            + ", ".join(f"{c} VARCHAR(20)" for c in COT_CU) + ")"))
    for _ in range(2):
        with Session(engine) as db:
            _migrate_go_cot_thue_ngoai_cu(db)
    cot = {c["name"] for c in inspect(engine).get_columns("lsx_cong_doan")}
    assert cot == {"id", "ten"}


def test_thue_ngoai_chiem_0_phut_va_ghi_chu(lich_mot_ca):
    buoc = [
        BuocVao(lsx_cong_doan_id=1, thu_tu=1, chay_phut=60),
        BuocVao(lsx_cong_doan_id=2, thu_tu=2, chay_phut=0, la_thue_ngoai=True),
        BuocVao(lsx_cong_doan_id=3, thu_tu=3, chay_phut=60),
    ]
    kq = trai_lich(datetime(2026, 9, 11, 8, 0), buoc, lich_mot_ca)
    assert kq.buoc[1].bat_dau == kq.buoc[1].ket_thuc
    assert kq.buoc[2].bat_dau == kq.buoc[1].ket_thuc
    assert "Không tính thời gian gia công ngoài." in kq.ghi_chu


def test_khong_doi_tay_sang_da_phat_hanh(sess, orders, lsx_svc, admin, customer):
    lsx = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    with pytest.raises(LsxValidationError):
        lsx_svc.set_trang_thai(lsx_id=lsx.id, trang_thai=TT_DA_PHAT_HANH, actor=admin)


def test_lenh_da_phat_hanh_khong_ha_tay(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    with pytest.raises(LsxConflict):
        lsx_svc.set_trang_thai(lsx_id=lsx_id, trang_thai="nhap", actor=admin)


def test_cua_giao_nhan_cu_da_go(client):
    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    r = client.post("/api/lsx/1/buoc/1/giao-nhan", headers=h, json={"su_kien": "giao"})
    assert r.status_code in (404, 405)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_go_cot_cu.py -q`
Expected: FAIL — `ImportError: cannot import name '_migrate_go_cot_thue_ngoai_cu'`.

- [ ] **Step 3: Gỡ 13 cột khỏi model + migration 0340**

`backend/app/models/lsx.py` — trong `LsxCongDoan` xoá các dòng khai: `sl_gui`, `ngay_gui_dk`, `van_chuyen_ngay`, `gia_cong_ngay`, `ngay_nhan_dk`, `hao_hut_cho_phep`, `yeu_cau_ky_thuat` và cả khối "sổ giao – nhận thực tế" (`nguoi_giao_id`, `giao_luc`, `sl_giao_thuc`, `nguoi_nhan_id`, `nhan_luc`, `sl_nhan_thuc`) cùng chú thích của chúng. Giữ `nha_cung_cap_id`, `nha_cung_cap`, `don_gia_gia_cong`. Sửa chú thích `don_gia_gia_cong`:

```python
    # Đơn giá gia công của bước — chỉ ô ở BƯỚC CUỐI một dải thuê ngoài được đọc lúc phát hành
    # (đơn giá cả lần, theo đơn vị ra của bước đó). Tiền = con số chốt × đơn giá, không lưu cột.
```
(Nếu `Date` / `datetime` không còn ai dùng trong file sau khi xoá, gỡ khỏi import.)

Migration (cuối `backend/app/db_migrations.py`):

```python
_COT_THUE_NGOAI_CU = (
    "sl_gui", "ngay_gui_dk", "van_chuyen_ngay", "gia_cong_ngay", "ngay_nhan_dk",
    "hao_hut_cho_phep", "yeu_cau_ky_thuat",
    "nguoi_giao_id", "giao_luc", "sl_giao_thuc", "nguoi_nhan_id", "nhan_luc", "sl_nhan_thuc",
)


def _migrate_go_cot_thue_ngoai_cu(db) -> None:
    """mg 0340 — gỡ 13 cột thuê ngoài CŨ của `lsx_cong_doan` (spec gia công ngoài §10).

    Chủ chốt 26/09/2026: không ngày gửi/hẹn về, không hao hụt cho phép; sổ giao–nhận của bước
    thay bằng LẦN GIA CÔNG (`gia_cong_ngoai`). Dự án chưa có dữ liệu thật ⇒ gỡ thẳng, không chép.
    Index trên `nguoi_giao_id` / `nguoi_nhan_id` (nếu có) phải DROP trước — SQLite từ chối DROP
    COLUMN đang có index. Idempotent: cột nào đã mất thì bỏ qua.
    """
    insp = inspect(db.get_bind())
    if "lsx_cong_doan" not in insp.get_table_names():
        return
    co = _existing_columns(insp, "lsx_cong_doan")
    for ix in insp.get_indexes("lsx_cong_doan"):
        if set(ix.get("column_names") or []) & set(_COT_THUE_NGOAI_CU):
            db.execute(text(f"DROP INDEX IF EXISTS {ix['name']}"))
    for cot in _COT_THUE_NGOAI_CU:
        if cot in co:
            db.execute(text(f"ALTER TABLE lsx_cong_doan DROP COLUMN {cot}"))
    db.commit()


MIGRATIONS.append(("0340_go_cot_thue_ngoai_cu", _migrate_go_cot_thue_ngoai_cu))
```

`docs/DB_SCHEMA.md`, section ``### `lsx_cong_doan` `` đầu tiên: xoá 13 dòng bảng của các cột trên, bỏ tên chúng khỏi dòng "**Tất cả cột:**", thêm một câu dưới Purpose: "13 cột thuê ngoài cũ (ngày gửi/nhận, hao hụt cho phép, sổ giao–nhận) gỡ ở mg `0340` — thay bằng bảng `gia_cong_ngoai`."

- [ ] **Step 4: Gỡ ở schema / service / router**

`backend/app/schemas/lsx.py`:
- `LsxCongDoanIn`: xoá `sl_gui`, `ngay_gui_dk`, `van_chuyen_ngay`, `gia_cong_ngay`, `ngay_nhan_dk`, `hao_hut_cho_phep`, `yeu_cau_ky_thuat` và đoạn chú thích "Người giao / người nhận + số thực KHÔNG nhận ở đây…". Giữ `nha_cung_cap_id`, `don_gia_gia_cong`.
- `LsxCongDoanOut`: xoá cùng 7 trường + khối giao–nhận (`nguoi_giao_id` … `qua_han_ngay`, gồm `giao_nhan_trang_thai`, `so_hut`, `hut_vuot_dinh_muc`, `tien_gia_cong_thuc`).
- Xoá class `LsxGiaoNhanIn`.

`backend/app/services/lsx_service.py`:
- `_cong_doan_dict`: thay khối từ `"nha_cung_cap_id": …` tới `**self._giao_nhan_dict(cd),` bằng

```python
            # Gia công ngoài (spec 2026-09-26): nhà gia công + đơn giá của BƯỚC. Việc mang đi / chốt
            # số nằm ở LẦN GIA CÔNG (`/api/gia-cong-ngoai/lenh/{id}`), không ở bước.
            "nha_cung_cap_id": cd.nha_cung_cap_id, "nha_cung_cap": cd.nha_cung_cap,
            "don_gia_gia_cong": cd.don_gia_gia_cong and _f(cd.don_gia_gia_cong),
            "ghi_chu": cd.ghi_chu,
```
- xoá hẳn `_giao_nhan_dict` và `ghi_giao_nhan`.
- `_ROUTING_FIELD_THUAN`: dòng thuê ngoài còn `"don_gia_gia_cong",`; `_ROUTING_FIELD_NULLABLE` bỏ `"ngay_gui_dk", "ngay_nhan_dk",`.
- `set_trang_thai`: ngay sau `if trang_thai not in TRANG_THAI_LSX: …` thêm

```python
        # "Đã phát hành" chỉ đến từ cửa PHÁT HÀNH (đóng băng gói công việc) — Xếp lịch hoặc Gia
        # công trọn gói. Đổi tay ở đây là lệnh "đã phát" mà xưởng không có việc nào.
        if trang_thai == TT_DA_PHAT_HANH:
            raise LsxValidationError(
                "Phát hành qua màn Xếp lịch (hoặc Gia công trọn gói), không đổi trực tiếp ở đây")
        if lsx.trang_thai == TT_DA_PHAT_HANH:
            raise LsxConflict(
                "Lệnh đã phát hành — thu hồi ở màn Xếp lịch (hoặc huỷ gia công trọn gói) trước")
```
(import `TT_DA_PHAT_HANH` từ `..models.lsx` nếu chưa có.)

`backend/app/routers/lsx.py`: xoá endpoint `ghi_giao_nhan` (`@router.post("/{lsx_id}/buoc/{buoc_id}/giao-nhan" …`) và `LsxGiaoNhanIn` khỏi import.

- [ ] **Step 5: Xếp lịch bỏ ngày thuê ngoài**

`backend/app/services/xep_lich/trai_lich.py`:
- `BuocVao`: xoá `thue_ngoai_ngay` + chú thích của nó.
- trong vòng trải, thay khối

```python
        if b.la_thue_ngoai:
            if b.thue_ngoai_ngay is None:
                ...
            else:
                ...
                con = con + timedelta(days=b.thue_ngoai_ngay)
```
bằng

```python
        if b.la_thue_ngoai:
            # Gia công ngoài KHÔNG chiếm thời gian trên lịch (spec 2026-09-26 §8): ngày kết thúc là
            # ngày XƯỞNG làm xong phần của mình. Nói ra một lần để không ai tưởng đó là lịch trọn.
            if "Không tính thời gian gia công ngoài." not in ghi_chu:
                ghi_chu.append("Không tính thời gian gia công ngoài.")
```
- `phan_tach_nghi`: bước thuê ngoài nay luôn 0 phút nên `thue` luôn rỗng; để nguyên code (khoá `gia_cong_ngoai_phut` vẫn trả 0).

`backend/app/services/xep_lich/service.py`: xoá hàm `_ngay_thue_ngoai`; ở `_tinh_buoc` đổi thành `BuocVao(lsx_cong_doan_id=cd.id, thu_tu=tt, chay_phut=0.0, la_thue_ngoai=True)`; ở dict chi tiết bước xoá dòng `"thue_ngoai_ngay": …` và thêm `"la_thue_ngoai": ngoai,`.
`backend/app/schemas/xep_lich.py:155`: thay `thue_ngoai_ngay: int | None = None` bằng `la_thue_ngoai: bool = False`.

`backend/tests/test_xep_lich_lenh_trai_lich.py`:
- xoá `test_thue_ngoai_chiem_ngay_LICH_khong_tru_ca` (luật cũ);
- `test_thue_ngoai_thieu_ngay_thi_chiem_0_va_GHI_CHU`: đổi tên thành `test_thue_ngoai_chiem_0_va_GHI_CHU`, docstring "Gia công ngoài không chiếm lịch (spec 2026-09-26 §8).", assert cuối thành `assert "Không tính thời gian gia công ngoài." in kq.ghi_chu`;
- `test_phan_tach_nghi_tach_rieng_gia_cong_ngoai`: bỏ `thue_ngoai_ngay=3`, assert thành `pt["gia_cong_ngoai_phut"] == 0`.

- [ ] **Step 6: Frontend gỡ kiểu + cửa cũ**

`frontend/src/api/client.ts`:
- thay `interface LsxThueNgoaiFields { … }` bằng

```ts
/** Gia công ngoài của BƯỚC (spec 2026-09-26) — chỉ có nghĩa khi `loai_buoc = "thue_ngoai"`.
 *  Tên nhà gia công do máy chủ ghi theo `nha_cung_cap_id`; việc mang đi / chốt số nằm ở
 *  `api.giaCongNgoai`, không ở bước. */
interface LsxThueNgoaiFields {
  nha_cung_cap_id: number | null;
  nha_cung_cap: string | null;
  don_gia_gia_cong: number | null;
}
```
- xoá `LsxGiaoNhanFields`; `export interface LsxCongDoan extends LsxThueNgoaiFields {` (bỏ `, LsxGiaoNhanFields`);
- `LsxCongDoanBody extends Partial<Omit<LsxThueNgoaiFields, "nha_cung_cap">>`;
- xoá method `giaoNhan(...)` trong `api.lsx`;
- trong kiểu bước của Xếp lịch (dòng ~1076) thay `thue_ngoai_ngay: number | null;` bằng `la_thue_ngoai: boolean;`.

`frontend/src/pages/lsxBuoc.ts`:
- `EditRow`: thay 9 trường gia công + `giao_nhan` bằng

```ts
  // Gia công ngoài (spec 2026-09-26): nhà gia công từ danh mục NCC + đơn giá cả lần.
  nha_cung_cap_id: number | null;
  /** Tên do máy chủ ghi — chỉ để hiện, không gửi lên. */
  nha_cung_cap: string;
  don_gia_gia_cong: string;
```
- `toEdit`: thay 9 dòng + khối `giao_nhan: {…}` bằng

```ts
    nha_cung_cap_id: cd.nha_cung_cap_id ?? null,
    nha_cung_cap: cd.nha_cung_cap ?? "",
    don_gia_gia_cong: s(cd.don_gia_gia_cong),
```
- `emptyRow`: thay hai dòng gia công + `giao_nhan: null,` bằng `nha_cung_cap_id: null, nha_cung_cap: "", don_gia_gia_cong: "",`
- `toBody`: thay 9 dòng gia công bằng

```ts
      // Chỉ gửi khi bước ĐANG là thuê ngoài — đổi loại rồi thì server tự dọn (Task 3).
      nha_cung_cap_id: ngoai ? r.nha_cung_cap_id : null,
      don_gia_gia_cong: ngoai ? on(r.don_gia_gia_cong) : undefined,
      // Thuê ngoài không tổ, không máy, không vật tư — gửi rỗng để khỏi lệch với server.
```
  và đổi ba dòng `department_id: r.department_id,` / `may_id: r.may_id,` / `vat_tus: r.vat_tus.map(…)` thành `department_id: ngoai ? null : r.department_id,` / `may_id: ngoai ? null : r.may_id,` / `vat_tus: ngoai ? [] : r.vat_tus.map(…)`.
- bỏ `LsxGiaoNhanFields` khỏi import đầu file.

`frontend/src/pages/XlChiTiet.tsx`: `coThoiGian = c.chay_phut > 0 || c.la_thue_ngoai;` và nhãn `{c.la_thue_ngoai ? "Gia công ngoài" : c.chay_phut > 0 ? … }`.

Gỡ `ChipNgoai` và CSS `.khsx-gn*`: `grep -n "ChipNgoai\|khsx-gn" frontend/src/pages/keHoachSxShared.tsx frontend/src/pages/ke-hoach-sx.css frontend/src/styles/responsive.css frontend/src/styles/responsive-chu.css` — xoá component `ChipNgoai` (không ai import — kiểm bằng `grep -rn "ChipNgoai" frontend/src` chỉ còn chính định nghĩa) và mọi khối selector bắt đầu `.khsx-gn`.

- [ ] **Step 7: Chạy test**

Run: `python -m pytest backend/tests/test_gia_cong_go_cot_cu.py backend/tests/test_xep_lich_lenh_trai_lich.py backend/tests/test_schema_documented.py backend/tests/test_gia_cong_buoc_lenh.py -q`
Expected: PASS.
Run: `grep -rn "giao_nhan\|thue_ngoai_ngay\|sl_giao_thuc\|ngay_nhan_dk\|hao_hut_cho_phep" backend/app frontend/src --include=*.py --include=*.ts --include=*.tsx` — Expected: chỉ còn trong `bai_ghep*` (bảng riêng của bài ghép, đợt 2) và `db_migrations.py`.
Run (trong `frontend/`): `npx tsc --noEmit` và `npx vitest run src/pages/lsxBuoc.test.ts` — Expected: sạch / PASS.

- [ ] **Step 8: Commit (khi người dùng cho phép)**

```bash
git add backend/app/models/lsx.py backend/app/db_migrations.py docs/DB_SCHEMA.md backend/app/schemas/lsx.py backend/app/services/lsx_service.py backend/app/routers/lsx.py backend/app/services/xep_lich backend/app/schemas/xep_lich.py backend/tests/test_xep_lich_lenh_trai_lich.py backend/tests/test_gia_cong_go_cot_cu.py frontend/src
git commit -m "lsx: gỡ 13 cột thuê ngoài cũ + sổ giao–nhận + ngày thuê ngoài ở Xếp lịch (mg 0340)"
```

---

### Task 5: Phát hành gom LẦN GIA CÔNG; thu hồi huỷ lần; xưởng không đụng được công việc gia công; đọc khối lần của lệnh

**Files:**
- Modify: `backend/app/services/gia_cong_ngoai/__init__.py` (trạng thái, version, câu chặn)
- Create: `backend/app/services/gia_cong_ngoai/lan.py`
- Modify: `backend/app/repositories/gia_cong_ngoai_repo.py` (truy vấn đọc)
- Modify: `backend/app/schemas/gia_cong_ngoai.py` (`GiaCongNgoaiOut`)
- Modify: `backend/app/routers/gia_cong_ngoai.py` (`GET /lenh/{lsx_id}`)
- Modify: `backend/app/services/san_xuat/release.py:88-104` (gọi gom)
- Modify: `backend/app/services/san_xuat/release_update.py:311-345` (`co_cong_viec_da_bat_dau`, `thu_hoi_goi`)
- Modify: `backend/app/services/xep_lich/service.py:668-716` (bọc lỗi gom thành `XepLichLenhError`)
- Modify: `backend/app/services/san_xuat/thuc_thi.py:62-66` (`_lay_cong_viec` chặn), `backend/app/services/san_xuat/san_luong.py:164-190` (`tao_batch` chặn)
- Modify: `backend/app/services/san_xuat/kcs.py` (`kiem_cong_doan`, `dieu_chinh_ket_qua` chặn; `con_gui_kho` = 0 ở 643 + 738), `backend/app/services/san_xuat/kho.py:274-279` (cửa KCS gửi kho chặn), `backend/app/services/san_xuat/kcs_bao_cao.py:~84` (loại)
- Modify: `backend/app/models/san_xuat.py:306-312` (chú thích `hoan_thanh_luc` — thêm chỗ ghi thứ hai)
- Modify: `backend/app/audit_registry.py` (khối `san_xuat`)
- Test: `backend/tests/test_gia_cong_phat_hanh.py`

**Interfaces:**
- Consumes: `GiaCongNgoai` + hằng (Task 1), `GiaCongNgoaiRepository` (Task 2), `dung_lenh_gia_cong` / `ncc` (Task 3).
- Produces (mọi task sau dùng đúng tên):
  - `app.services.gia_cong_ngoai`: `GiaCongXungDot`, `TT_CHO_MANG_DI = "cho_mang_di"`, `TT_DANG_O_NGOAI = "dang_o_ngoai"`, `TT_DANG_GIA_CONG = "dang_gia_cong"`, `TT_DA_XONG = "da_xong"`, `TT_DA_HUY = "da_huy"`, `trang_thai(gcn) -> str`, `kiem_version(gcn, expected: int | None) -> None`, `CHAN_XUONG: str`, `la_gia_cong(cv) -> bool`.
  - `app.services.gia_cong_ngoai.lan`: `gom_lan_khi_phat_hanh(db, *, lsx_ids: set[int], cv_by_step: dict[str, list], actor) -> list[GiaCongNgoai]`; `huy_lan_cua_goi(db, *, goi_id: int, actor, ly_do: str) -> int`; `lan_cua_lenh(db, lsx_id: int, *, xem_tien: bool) -> list[dict]`; `lan_dict(db, gcn, *, xem_tien: bool) -> dict`.
  - `GiaCongNgoaiRepository`: `get(id)`, `khoa(id)`, `cua_lenh(lsx_id)`, `cong_viec_cua(gcn_id) -> list[SanXuatCongViec]` (theo id tăng dần), `ban_giao_cho_mang_di(cv_id) -> list[SanXuatBanGiao]`, `co_buoc_truoc(lsx_cong_doan_id) -> bool`, `co_lan_da_di_trong_goi(goi_id) -> bool`, `user_names(ids) -> dict[int, str]`, `phieu_chi_song(gcn_ids) -> dict[int, PaymentVoucher]`.
  - `GET /api/gia-cong-ngoai/lenh/{lsx_id}` → `list[GiaCongNgoaiOut]` (quyền `san_xuat:read`; tiền `None` nếu không có `kho:view_cost`).
  - Audit actions: `gia_cong_ngoai_dat`, `gia_cong_ngoai_mang_di`, `gia_cong_ngoai_chot`, `gia_cong_ngoai_mo_lai`, `gia_cong_ngoai_huy`, `gia_cong_ngoai_xuat_giay` (khai hết ở task này).

- [ ] **Step 1: Viết test thất bại**

```python
# backend/tests/test_gia_cong_phat_hanh.py
"""Phát hành gom dải thuê ngoài thành LẦN GIA CÔNG (spec 2026-09-26 §2, §10)."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import GiaCongNgoai, KIEU_MOT_PHAN
from app.models.san_xuat import SanXuatCongViec
from app.services.gia_cong_ngoai import TT_CHO_MANG_DI
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.san_xuat import release_update, thuc_thi
from tests.gia_cong_fixtures import dung_lenh_gia_cong, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


def _lan(sess, lsx_id):
    return sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).order_by(GiaCongNgoai.id).all()


def _cv(sess, lsx_id, ten):
    return sess.query(SanXuatCongViec).filter_by(lsx_id=lsx_id, ten_cong_doan=ten).one()


def test_hai_buoc_lien_nhau_cung_nha_gia_cong_la_mot_lan(sess, orders, lsx_svc, admin, customer):
    a = ncc(sess)
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"),
        ("Cán màng", "thue_ngoai", a, 1660, "to"),
        ("Bế", "thue_ngoai", a, 1650, "cai"),
        ("Đóng gói", "to", None, 1650, "cai"),
    ])
    (lan,) = _lan(sess, lsx_id)
    assert lan.kieu == KIEU_MOT_PHAN and lan.nha_cung_cap_id == a.id
    assert lan.ten_viec == "Cán màng + Bế" and lan.don_vi == "cai"
    assert float(lan.don_gia) == 500
    for ten in ("Cán màng", "Bế"):
        cv = _cv(sess, lsx_id, ten)
        assert cv.gia_cong_ngoai_id == lan.id and cv.department_id is None
    assert _cv(sess, lsx_id, "In").gia_cong_ngoai_id is None


def test_khac_nha_hoac_chen_buoc_noi_bo_la_hai_lan(sess, orders, lsx_svc, admin, customer):
    a, b = ncc(sess), ncc(sess, "Bế Tân Tiến")
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", a, 1000, "to"),
        ("Bế", "thue_ngoai", b, 1000, "cai"),
        ("Dán", "to", None, 1000, "cai"),
        ("Ép kim", "thue_ngoai", b, 1000, "cai"),
    ])
    assert [l.ten_viec for l in _lan(sess, lsx_id)] == ["Cán màng", "Bế", "Ép kim"]


def test_doc_khoi_lan_an_tien_khi_khong_co_quyen(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    (co,) = lan_cua_lenh(sess, lsx_id, xem_tien=True)
    (khong,) = lan_cua_lenh(sess, lsx_id, xem_tien=False)
    assert co["trang_thai"] == TT_CHO_MANG_DI and co["don_gia"] == 500
    assert khong["don_gia"] is None and khong["thanh_tien"] is None
    assert co["co_buoc_truoc"] is True and co["chang_sau"] == []


def test_xuong_khong_bat_dau_duoc_viec_gia_cong(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    cv = _cv(sess, lsx_id, "Cán màng")
    with pytest.raises(ValueError, match="Gia công ngoài"):
        thuc_thi.bat_dau(sess, user=admin, cong_viec_id=cv.id)


def test_thu_hoi_goi_huy_lan_chua_mang_di(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    release_update.thu_hoi_goi(sess, nguon="lsx", id=lsx_id, actor=admin)
    sess.commit()
    (lan,) = _lan(sess, lsx_id)
    assert lan.huy_luc is not None and lan.ly_do_huy


def test_da_mang_di_thi_coi_nhu_da_bat_dau(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
    ])
    (lan,) = _lan(sess, lsx_id)
    from datetime import datetime, timezone
    lan.mang_di_luc = datetime.now(timezone.utc)
    sess.commit()
    assert release_update.co_cong_viec_da_bat_dau(sess, nguon="lsx", id=lsx_id) is True
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_phat_hanh.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.gia_cong_ngoai.lan'`.

- [ ] **Step 3: Lõi dùng chung**

Thay toàn bộ `backend/app/services/gia_cong_ngoai/__init__.py`:

```python
"""Gia công ngoài — service (spec docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md).

Một cửa ghi DUY NHẤT cho lần gia công: `mot_phan.mang_di`, `chot.chot` / `chot.mo_lai`,
`tron_goi.*`. Bàn tổ / KCS / Xếp lịch chỉ nhìn, không ghi.
"""
from __future__ import annotations

TT_CHO_MANG_DI = "cho_mang_di"
TT_DANG_O_NGOAI = "dang_o_ngoai"
TT_DANG_GIA_CONG = "dang_gia_cong"   # trọn gói, chưa chốt
TT_DA_XONG = "da_xong"
TT_DA_HUY = "da_huy"

# Câu chặn chung cho mọi cửa xưởng (bàn tổ, ghi mẻ, KCS) gặp công việc gia công ngoài.
CHAN_XUONG = (
    "Công việc Gia công ngoài — ghi nhận ở khối Gia công ngoài trên lệnh (Đã mang đi / Chốt số), "
    "không làm ở bàn tổ hay KCS."
)


class GiaCongXungDot(ValueError):
    """Lần gia công vừa bị người khác đổi (lệch `version`) — router dịch 409."""


def trang_thai(gcn) -> str:
    """Trạng thái DẪN XUẤT từ các mốc — không lưu cột (spec §2)."""
    if gcn.huy_luc is not None:
        return TT_DA_HUY
    if gcn.chot_luc is not None:
        return TT_DA_XONG
    if gcn.kieu == "tron_goi":
        return TT_DANG_GIA_CONG
    if gcn.mang_di_luc is not None:
        return TT_DANG_O_NGOAI
    return TT_CHO_MANG_DI


def kiem_version(gcn, expected: int | None) -> None:
    if expected is not None and int(expected) != int(gcn.version):
        raise GiaCongXungDot("Lần gia công vừa được người khác cập nhật — tải lại rồi làm tiếp.")


def la_gia_cong(cv) -> bool:
    return getattr(cv, "gia_cong_ngoai_id", None) is not None
```

- [ ] **Step 4: Repo đọc**

Thêm vào `backend/app/repositories/gia_cong_ngoai_repo.py` (import thêm `from ..models.gia_cong_ngoai import GiaCongNgoai`, `from ..models.lsx import LsxCongDoan, LsxCongDoanPhuThuoc`, `from ..models.san_xuat import SanXuatCongViec`, `from ..models.san_xuat_san_luong import BG_DE_XUAT, SanXuatBanGiao`, `from ..models.accounting import PAYMENT_VOUCHER_CANCELLED, PaymentVoucher`, `from ..models.user import User`, `from sqlalchemy import exists, func, or_`):

```python
    # --- Lần gia công --------------------------------------------------------------------------
    def get(self, gcn_id: int) -> GiaCongNgoai | None:
        return self.db.get(GiaCongNgoai, gcn_id)

    def khoa(self, gcn_id: int) -> GiaCongNgoai | None:
        """Lấy + KHOÁ dòng (Postgres `FOR UPDATE`; SQLite bỏ qua) — chặn bấm đúp Mang đi / Chốt."""
        return self.db.execute(
            select(GiaCongNgoai).where(GiaCongNgoai.id == gcn_id).with_for_update()
        ).scalar_one_or_none()

    def cua_lenh(self, lsx_id: int) -> list[GiaCongNgoai]:
        return list(self.db.scalars(
            select(GiaCongNgoai).where(GiaCongNgoai.lsx_id == lsx_id).order_by(GiaCongNgoai.id)
        ))

    def cong_viec_cua(self, gcn_id: int) -> list[SanXuatCongViec]:
        """Công việc của lần, theo THỨ TỰ bước (snapshot đẻ công việc theo thứ tự routing ⇒ id tăng)."""
        return list(self.db.scalars(
            select(SanXuatCongViec).where(SanXuatCongViec.gia_cong_ngoai_id == gcn_id)
            .order_by(SanXuatCongViec.id)
        ))

    def ban_giao_cho_mang_di(self, cv_id: int) -> list[SanXuatBanGiao]:
        """Bàn giao bước trước đã ĐỀ XUẤT sang công việc đầu của dải, chưa ai nhận."""
        return list(self.db.scalars(
            select(SanXuatBanGiao).where(
                SanXuatBanGiao.dich_cong_viec_id == cv_id, SanXuatBanGiao.trang_thai == BG_DE_XUAT,
            ).order_by(SanXuatBanGiao.id)
        ))

    def co_buoc_truoc(self, lsx_cong_doan_id: int | None) -> bool:
        """Bước này có bước trước (cạnh đi vào, hoặc bước có `thu_tu` nhỏ hơn cùng lệnh)?"""
        if not lsx_cong_doan_id:
            return False
        cd = self.db.get(LsxCongDoan, lsx_cong_doan_id)
        if cd is None:
            return False
        co_canh = self.db.execute(select(LsxCongDoanPhuThuoc.id).where(
            LsxCongDoanPhuThuoc.buoc_sau_id == cd.id).limit(1)).first()
        if co_canh is not None:
            return True
        return self.db.execute(select(LsxCongDoan.id).where(
            LsxCongDoan.lsx_id == cd.lsx_id, LsxCongDoan.thu_tu < cd.thu_tu).limit(1)).first() is not None

    def co_lan_da_di_trong_goi(self, goi_id: int) -> bool:
        """Gói có lần gia công đã MANG ĐI hoặc đã CHỐT — hàng đã rời xưởng, không thu hồi gói được."""
        return self.db.execute(
            select(GiaCongNgoai.id)
            .join(SanXuatCongViec, SanXuatCongViec.gia_cong_ngoai_id == GiaCongNgoai.id)
            .where(SanXuatCongViec.goi_id == goi_id, GiaCongNgoai.huy_luc.is_(None),
                   or_(GiaCongNgoai.mang_di_luc.is_not(None), GiaCongNgoai.chot_luc.is_not(None)))
            .limit(1)
        ).first() is not None

    def lan_cua_goi(self, goi_id: int) -> list[GiaCongNgoai]:
        return list(self.db.scalars(
            select(GiaCongNgoai).where(GiaCongNgoai.id.in_(
                select(SanXuatCongViec.gia_cong_ngoai_id).where(SanXuatCongViec.goi_id == goi_id)
            ))
        ))

    def user_names(self, ids) -> dict[int, str]:
        ids = {int(i) for i in ids if i}
        if not ids:
            return {}
        return {uid: ten for uid, ten in self.db.execute(
            select(User.id, User.name).where(User.id.in_(ids)))}

    def phieu_chi_song(self, gcn_ids) -> dict[int, PaymentVoucher]:
        """Phiếu chi CÒN HIỆU LỰC của từng lần (tối đa một — partial unique mg 0339)."""
        ids = [int(i) for i in gcn_ids if i]
        if not ids:
            return {}
        return {v.gia_cong_ngoai_id: v for v in self.db.scalars(
            select(PaymentVoucher).where(
                PaymentVoucher.gia_cong_ngoai_id.in_(ids),
                PaymentVoucher.status != PAYMENT_VOUCHER_CANCELLED,
            ))}
```

- [ ] **Step 5: Gom lần + huỷ lần + dict đọc (`lan.py`)**

```python
# backend/app/services/gia_cong_ngoai/lan.py
"""Gom LẦN GIA CÔNG lúc phát hành, huỷ khi thu hồi gói, dựng dict đọc cho khối trên lệnh."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...audit_registry import tra
from ...models.gia_cong_ngoai import (
    KIEU_MOT_PHAN, NOI_VE_KHACH, NOI_VE_KHO, NOI_VE_XUONG, GiaCongNgoai,
)
from ...models.lsx import LB_THUE_NGOAI
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ..gio_xuong import thuc_te_hien_thi
from . import trang_thai


def _f(v) -> float | None:
    return float(v) if v is not None else None


def gom_lan_khi_phat_hanh(db: Session, *, lsx_ids: set[int], cv_by_step: dict, actor) -> list:
    """Dải bước "Thuê ngoài" LIỀN NHAU, CÙNG nhà gia công ⇒ MỘT lần (spec §2). Gọi trong giao
    dịch phát hành, KHÔNG commit. Công việc của dải: gắn `gia_cong_ngoai_id`, gỡ tổ + máy (không
    vào bàn tổ nào). Bước đã bị bài ghép phủ bỏ qua — bài ghép là đợt 2 (spec §9)."""
    repo = SanXuatRepository(db)
    audit = AuditLogRepository(db)
    uid = getattr(actor, "id", None)
    tao: list[GiaCongNgoai] = []
    for lsx_id in sorted(lsx_ids):
        dai: list = []

        def dong_dai() -> None:
            if not dai:
                return
            cuoi = dai[-1]
            gcn = GiaCongNgoai(
                lsx_id=lsx_id, kieu=KIEU_MOT_PHAN,
                nha_cung_cap_id=cuoi.nha_cung_cap_id, nha_cung_cap_ten=cuoi.nha_cung_cap or "",
                ten_viec=" + ".join(c.ten for c in dai),
                # Đơn giá CẢ LẦN khai ở bước CUỐI dải, theo đơn vị ra của bước đó (spec §7).
                don_gia=cuoi.don_gia_gia_cong, don_vi=cuoi.don_vi_ra, created_by=uid,
            )
            db.add(gcn)
            db.flush()
            for c in dai:
                for cv in cv_by_step.get(c.step_key) or []:
                    cv.gia_cong_ngoai_id = gcn.id
                    cv.department_id = None
                    cv.may_id = None
            audit.create(
                actor_user_id=uid, action="gia_cong_ngoai_dat", target=f"gia_cong_ngoai:{gcn.id}",
                detail=f"Phát hành: {gcn.ten_viec} — {gcn.nha_cung_cap_ten}", commit=False,
            )
            tao.append(gcn)
            dai.clear()

        for cd in repo.routing_steps(lsx_id):
            cvs = cv_by_step.get(cd.step_key) or []
            chung = any(cv.bai_ghep_id for cv in cvs)
            if cd.loai_buoc != LB_THUE_NGOAI or chung:
                dong_dai()
                continue
            if cd.nha_cung_cap_id is None:
                raise ValueError(
                    f"Bước “{cd.ten}” thuê ngoài chưa chọn nhà gia công — chọn ở Kế hoạch SX rồi "
                    f"phát hành lại.")
            if dai and dai[-1].nha_cung_cap_id != cd.nha_cung_cap_id:
                dong_dai()
            dai.append(cd)
        dong_dai()
    db.flush()
    return tao


def huy_lan_cua_goi(db: Session, *, goi_id: int, actor, ly_do: str) -> int:
    """Gói bị thu hồi ⇒ lần chưa chốt của gói HUỶ theo (không xoá — giữ vết). KHÔNG commit."""
    from ...models.gia_cong_ngoai import _utcnow

    repo = GiaCongNgoaiRepository(db)
    audit = AuditLogRepository(db)
    uid = getattr(actor, "id", None)
    n = 0
    for gcn in repo.lan_cua_goi(goi_id):
        if gcn.huy_luc is not None or gcn.chot_luc is not None:
            continue
        gcn.huy_luc, gcn.huy_boi_id, gcn.ly_do_huy = _utcnow(), uid, ly_do[:500]
        gcn.version += 1
        audit.create(actor_user_id=uid, action="gia_cong_ngoai_huy",
                     target=f"gia_cong_ngoai:{gcn.id}", detail=ly_do[:500], commit=False)
        n += 1
    db.flush()
    return n


def noi_ve_hop_le(db: Session, gcn, chang_sau: list) -> list[str]:
    """Dải còn chặng sau ⇒ chỉ về xưởng. Dải chứa bước cuối / trọn gói ⇒ kho, hoặc khách khi dòng
    đơn của lệnh đứng riêng một cụm bán (§4 bước 5)."""
    if chang_sau:
        return [NOI_VE_XUONG]
    from .giao_thang import dong_don_dung_rieng

    return [NOI_VE_KHO, NOI_VE_KHACH] if dong_don_dung_rieng(db, gcn.lsx_id) else [NOI_VE_KHO]


def lan_dict(db: Session, gcn, *, xem_tien: bool, _cache: dict | None = None) -> dict:
    repo = GiaCongNgoaiRepository(db)
    sl_repo = SanXuatSanLuongRepository(db)
    cvs = repo.cong_viec_cua(gcn.id)
    dau = cvs[0] if cvs else None
    cuoi = cvs[-1] if cvs else None
    chang_sau = sl_repo.cong_viec_chang_sau(cuoi) if cuoi is not None else []
    cho = repo.ban_giao_cho_mang_di(dau.id) if dau is not None and gcn.kieu == KIEU_MOT_PHAN else []
    ten = repo.user_names({gcn.mang_di_boi_id, gcn.chot_boi_id, gcn.huy_boi_id})
    pc = repo.phieu_chi_song([gcn.id]).get(gcn.id)
    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    tien = (round(float(gcn.sl_cuoi) * float(gcn.don_gia), 0)
            if xem_tien and gcn.sl_cuoi is not None and gcn.don_gia is not None else None)
    return {
        "id": gcn.id, "lsx_id": gcn.lsx_id, "lsx_ma": lsx.ma if lsx else "",
        "kieu": gcn.kieu, "trang_thai": trang_thai(gcn),
        "nha_cung_cap_id": gcn.nha_cung_cap_id, "nha_cung_cap_ten": gcn.nha_cung_cap_ten,
        "ten_viec": gcn.ten_viec, "don_vi": gcn.don_vi,
        "don_gia": _f(gcn.don_gia) if xem_tien else None,
        "thanh_tien": tien,
        "sl_dat": _f(gcn.sl_dat), "xuong_cap_giay": bool(gcn.xuong_cap_giay),
        "don_vi_gui": dau.don_vi_vao if dau is not None else None,
        "sl_cho_mang_di": round(sum(float(b.so_luong) for b in cho), 3),
        "co_buoc_truoc": repo.co_buoc_truoc(dau.lsx_cong_doan_id) if dau is not None else False,
        "mang_di_boi_ten": ten.get(gcn.mang_di_boi_id), "mang_di_luc": thuc_te_hien_thi(gcn.mang_di_luc),
        "sl_gui": _f(gcn.sl_gui),
        "chot_boi_ten": ten.get(gcn.chot_boi_id), "chot_luc": thuc_te_hien_thi(gcn.chot_luc),
        "sl_cuoi": _f(gcn.sl_cuoi), "noi_ve": gcn.noi_ve,
        "noi_ve_hop_le": noi_ve_hop_le(db, gcn, chang_sau if gcn.kieu == KIEU_MOT_PHAN else []),
        "chang_sau": [{"id": c.id, "ten": c.ten_cong_doan} for c in chang_sau],
        "huy_boi_ten": ten.get(gcn.huy_boi_id), "huy_luc": thuc_te_hien_thi(gcn.huy_luc),
        "ly_do_huy": gcn.ly_do_huy,
        "phieu_chi": {"id": pc.id, "code": pc.code} if pc is not None else None,
        # Nhật ký hiện NGAY trên lần (spec §6) — đọc thẳng audit theo target, nhãn từ registry.
        # Chi tiết audit của lần gia công viết sẵn bằng lời (không mã nội bộ, không tiền).
        "lich_su": [
            {"luc": thuc_te_hien_thi(a.created_at), "ai": a.actor_name_luc_do or "",
             "viec": tra(a.action).nhan, "chi_tiet": a.detail or ""}
            for a in AuditLogRepository(db).list_by_target(f"gia_cong_ngoai:{gcn.id}", limit=50)
        ],
        "version": gcn.version,
    }


def lan_cua_lenh(db: Session, lsx_id: int, *, xem_tien: bool) -> list[dict]:
    return [lan_dict(db, g, xem_tien=xem_tien) for g in GiaCongNgoaiRepository(db).cua_lenh(lsx_id)]
```

Tạo `backend/app/services/gia_cong_ngoai/giao_thang.py` với hàm luật "đứng riêng" (Task 8 bổ sung phần ghi):

```python
# backend/app/services/gia_cong_ngoai/giao_thang.py
"""Nhà gia công GIAO THẲNG cho khách (spec §4 bước 5)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...repositories.order_repo import OrderRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ..thanh_pham_khai_bao import cum_ban


def dong_don_dung_rieng(db: Session, lsx_id: int) -> bool:
    """Dòng đơn của lệnh đứng RIÊNG một cụm bán (cụm chỉ có đúng dòng đó). Cụm nhiều dòng (bìa +
    ruột một cuốn) thì một lệnh không giao thẳng thay cả cụm được."""
    lsx = SanXuatRepository(db).lsx(lsx_id)
    if lsx is None or not lsx.order_line_id:
        return False
    order = OrderRepository(db).get_by_id(lsx.order_id)
    if order is None:
        return False
    for cum in cum_ban(order):
        if any(ln.id == lsx.order_line_id for ln in cum.dong):
            return len(cum.dong) == 1
    return False
```

(`thuc_te_hien_thi` ở `backend/app/services/gio_xuong.py` — kiểm tên bằng `grep -n "def thuc_te_hien_thi" backend/app/services/gio_xuong.py`; board.py đang import nó.)

- [ ] **Step 6: Nối vào phát hành + thu hồi**

`backend/app/services/san_xuat/release.py`: import `from ..gia_cong_ngoai.lan import gom_lan_khi_phat_hanh`; ngay SAU vòng `for nhom_id, lsx_id in than_chinh.items(): …` và TRƯỚC `dung_phu_thuoc(`:

```python
    # GIA CÔNG NGOÀI (spec 2026-09-26): dải bước thuê ngoài liền nhau cùng nhà gia công ⇒ MỘT lần;
    # công việc của dải rời khỏi mọi bàn tổ. Đặt SAU `danh_dau_kcs_cuoi`: dải chứa bước cuối vẫn
    # giữ cờ KCS-cuối — con số chốt thay KCS (bản ghi tổng hợp lúc chốt).
    gom_lan_khi_phat_hanh(repo.db, lsx_ids=lsx_ids, cv_by_step=cv_by_step, actor=actor)
```

`backend/app/services/san_xuat/release_update.py`:
- `co_cong_viec_da_bat_dau`: thay `return bool(_da_bat_dau_ids(thuc, repo.cong_viec_cua_goi(goi.id)))` bằng

```python
    if _da_bat_dau_ids(thuc, repo.cong_viec_cua_goi(goi.id)):
        return True
    # Hàng đã mang ra nhà gia công (hoặc đã chốt) = việc ĐÃ chạy, dù công việc gia công không có
    # phiên bắt đầu nào — thu hồi lúc này là xoá dấu vết hàng đang nằm ngoài xưởng.
    from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository

    return GiaCongNgoaiRepository(db).co_lan_da_di_trong_goi(goi.id)
```
- `thu_hoi_goi`: ngay trước `goi.trang_thai = GOI_DA_THU_HOI` thêm

```python
    from ..gia_cong_ngoai.lan import huy_lan_cua_goi

    huy_lan_cua_goi(db, goi_id=goi.id, actor=actor, ly_do=f"Thu hồi gói phát hành {goi.ma}")
```

`backend/app/services/xep_lich/service.py::phat_hanh`: bọc lời gọi

```python
        try:
            _sx_phat_hanh(self.db, lsx_ids=tp.lsx_ids, bai_ghep_ids=tp.bai_ghep_ids, actor=actor)
        except ValueError as exc:
            # Gom lần gia công ngoài từ chối (bước thuê ngoài chưa chọn nhà gia công) — trả 400.
            self.db.rollback()
            raise XepLichLenhError(str(exc)) from None
```

- [ ] **Step 7: Chặn các cửa của xưởng**

`backend/app/services/san_xuat/thuc_thi.py::_lay_cong_viec`:

```python
def _lay_cong_viec(repo: SanXuatThucThiRepository, cong_viec_id: int) -> SanXuatCongViec:
    cv = repo.cong_viec(cong_viec_id)
    if cv is None:
        raise ValueError("Không tìm thấy công việc.")
    # Công việc gia công ngoài không phân công / bắt đầu / đổi máy / tạm dừng (spec gia công §10).
    if cv.gia_cong_ngoai_id is not None:
        from ..gia_cong_ngoai import CHAN_XUONG

        raise ValueError(CHAN_XUONG)
    return cv
```

`backend/app/services/san_xuat/san_luong.py::tao_batch` — ngay sau `if cv is None: raise ValueError("Không tìm thấy công việc.")`:

```python
    if cv.gia_cong_ngoai_id is not None:
        from ..gia_cong_ngoai import CHAN_XUONG

        raise ValueError(CHAN_XUONG)
```

`backend/app/services/san_xuat/kcs.py`:
- `kiem_cong_doan` và `dieu_chinh_ket_qua`: ngay sau chỗ nạp `cv` (dòng `cv = repo.cong_viec(...)` / kiểm None) thêm cùng khối chặn như trên (KCS làm ngoài phần mềm).
- `_tom_cuoi` (dòng ~643) và `chuoi_cong_doan_kcs` (dòng ~738): `con_gui_kho` = `0.0` khi `cv.gia_cong_ngoai_id is not None` — con số chốt tự đi (về kho) hoặc không vào kho (giao thẳng). Ở 738: `"con_gui_kho": max(0.0, min(dat, tot) - da_yc) if cv.la_kcs_cuoi and cv.gia_cong_ngoai_id is None else 0.0,` và thêm khoá `"gia_cong_ngoai": cv.gia_cong_ngoai_id is not None,`. Ở 643 đọc `cvs` của `_tom_cuoi`: lọc `cvs = [c for c in cvs if c.gia_cong_ngoai_id is None]` ngay đầu hàm trước khi cộng.

`backend/app/services/san_xuat/kho.py::tao_yeu_cau_nhap_kho_cong_doan` — sau `if not cv.la_kcs_cuoi: …`:

```python
    if cv.gia_cong_ngoai_id is not None:
        raise ValueError("Công đoạn gia công ngoài — số chốt tự đi vào kho, KCS không gửi lại.")
```

`backend/app/services/san_xuat/kcs_bao_cao.py` — trong câu `stmt = (select(SanXuatKcsBatch, SanXuatCongViec) …)` thêm `.where(SanXuatCongViec.gia_cong_ngoai_id.is_(None))` (bản ghi tổng hợp lúc chốt không phải một lần kiểm thật).

`backend/app/models/san_xuat.py` — chú thích `hoan_thanh_luc`: đổi "chỗ duy nhất trong hệ đặt `trang_thai='completed'`" thành "một trong HAI chỗ đặt `completed` (chỗ kia: chốt lần gia công ngoài, `services/gia_cong_ngoai/chot.py`)".

- [ ] **Step 8: Đọc khối lần — schema + router + audit registry**

`backend/app/schemas/gia_cong_ngoai.py` thêm:

```python
from datetime import datetime


class PhieuChiNganOut(BaseModel):
    id: int
    code: str


class ChangSauOut(BaseModel):
    id: int
    ten: str


class LichSuOut(BaseModel):
    luc: datetime | None = None
    ai: str = ""
    viec: str = ""
    chi_tiet: str = ""


class GiaCongNgoaiOut(BaseModel):
    id: int
    lsx_id: int
    lsx_ma: str
    kieu: str
    trang_thai: str
    nha_cung_cap_id: int
    nha_cung_cap_ten: str
    ten_viec: str
    don_vi: str | None = None
    don_gia: float | None = None          # None khi không có quyền xem tiền
    thanh_tien: float | None = None
    sl_dat: float | None = None
    xuong_cap_giay: bool = False
    don_vi_gui: str | None = None
    sl_cho_mang_di: float = 0
    co_buoc_truoc: bool = False
    mang_di_boi_ten: str | None = None
    mang_di_luc: datetime | None = None
    sl_gui: float | None = None
    chot_boi_ten: str | None = None
    chot_luc: datetime | None = None
    sl_cuoi: float | None = None
    noi_ve: str | None = None
    noi_ve_hop_le: list[str] = []
    chang_sau: list[ChangSauOut] = []
    huy_boi_ten: str | None = None
    huy_luc: datetime | None = None
    ly_do_huy: str | None = None
    phieu_chi: PhieuChiNganOut | None = None
    lich_su: list[LichSuOut] = []
    version: int
```

`backend/app/routers/gia_cong_ngoai.py` thêm:

```python
from ..schemas.gia_cong_ngoai import GiaCongNgoaiOut
from ..services.gia_cong_ngoai.lan import lan_cua_lenh


def _xem_tien(authz: AuthorizationService, user: User) -> bool:
    """Tiền của lần gia công đi qua CÙNG cổng với mọi số tiền khác (`kho:view_cost`)."""
    return authz.can(user, "kho", "view_cost")


@router.get("/lenh/{lsx_id}", response_model=list[GiaCongNgoaiOut])
def cua_lenh(
    lsx_id: int,
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "read"))],
) -> list[dict]:
    return lan_cua_lenh(db, lsx_id, xem_tien=_xem_tien(authz, user))
```
(kiểm chữ ký `authz.can` bằng `grep -n "def can" backend/app/services/rbac_service.py`; nếu tham số thứ ba là hằng, dùng `ACTION_VIEW_COST`.)

`backend/app/audit_registry.py` — trong khối `_HD += _dong("san_xuat", "san_xuat", {…})` thêm:

```python
    "gia_cong_ngoai_dat": "Đặt gia công ngoài",
    "gia_cong_ngoai_mang_di": "Mang hàng đi gia công ngoài",
    "gia_cong_ngoai_chot": "Chốt số gia công ngoài",
    "gia_cong_ngoai_mo_lai": "Mở lại lần gia công ngoài",
    "gia_cong_ngoai_huy": "Huỷ gia công ngoài",
    "gia_cong_ngoai_xuat_giay": "Đề nghị xuất giấy cho gia công ngoài",
```

- [ ] **Step 9: Chạy test**

Run: `python -m pytest backend/tests/test_gia_cong_phat_hanh.py backend/tests/test_audit_registry.py backend/tests/test_san_xuat_thuc_thi.py backend/tests/test_san_xuat_kcs.py -q`
Expected: PASS.

- [ ] **Step 10: Commit (khi người dùng cho phép)**

```bash
git add backend/app/services/gia_cong_ngoai backend/app/repositories/gia_cong_ngoai_repo.py backend/app/schemas/gia_cong_ngoai.py backend/app/routers/gia_cong_ngoai.py backend/app/services/san_xuat backend/app/services/xep_lich/service.py backend/app/models/san_xuat.py backend/app/audit_registry.py backend/tests/test_gia_cong_phat_hanh.py
git commit -m "gia_cong_ngoai: phát hành gom dải thuê ngoài thành lần gia công, xưởng không đụng được"
```

---

### Task 6: "Đã mang đi" — nhận bàn giao thay tổ; báo người kế hoạch khi có hàng chờ mang đi

**Files:**
- Modify: `backend/app/services/san_xuat/ban_giao.py` (tách lõi `ghi_xac_nhan`; `de_xuat` báo "chờ mang đi"; hai hàm kết quả công khai)
- Modify: `backend/app/routers/san_xuat.py:135-160` (`_phat_sse_ban_giao` mang thêm `lsx_ma`)
- Modify: `backend/app/repositories/gia_cong_ngoai_repo.py` (`nguoi_sua_lenh`, `nguoi_lap_phieu_chi`)
- Create: `backend/app/services/gia_cong_ngoai/mot_phan.py`
- Modify: `backend/app/schemas/gia_cong_ngoai.py` (`MangDiIn`), `backend/app/routers/gia_cong_ngoai.py` (`POST /{id}/mang-di`, `_phat_doi`)
- Modify: `backend/tests/gia_cong_fixtures.py` (`cv_ten`, `ghi_me`, `giao_sang`, `nguoi_ke_hoach`)
- Test: `backend/tests/test_gia_cong_mang_di.py`

**Interfaces:**
- Consumes: `GiaCongNgoaiRepository.khoa/cong_viec_cua/ban_giao_cho_mang_di/co_buoc_truoc` + `kiem_version`, `GiaCongXungDot` (Task 5); `lan_dict` (Task 5).
- Produces:
  - `ban_giao.ghi_xac_nhan(db, *, bg, user) -> None` — không gate, không commit.
  - `ban_giao.lap_ban_giao(db, *, user, nguon_cv, dich_cv, so_luong: float, don_vi: str, batch_ids: list[int]) -> SanXuatBanGiao` — không gate, không commit.
  - `ban_giao.ket_qua_cho_ben_nhan(db, *, user, bg, nguon_cv, dich_cv) -> dict` (su_kien `"de_xuat"`, báo tổ đích) và `ban_giao.ket_qua_da_nhan(db, *, user, bg, nguon_cv, dich_cv) -> dict` (su_kien `"xac_nhan"`, báo tổ nguồn) — cùng khuôn dict `_ket_qua`, router đưa thẳng vào `_phat_sse_ban_giao`.
  - Bàn giao sang công việc gia công: kết quả `su_kien == "cho_mang_di"`, `lsx_ma`, `notify_user_ids` = `nguoi_sua_lenh()` trừ người bấm.
  - `GiaCongNgoaiRepository.nguoi_sua_lenh() -> list[int]`, `.nguoi_lap_phieu_chi() -> list[int]` (tài khoản đang hoạt động có `san_xuat.can_update` / `phieu_chi.can_create`).
  - `mot_phan.mang_di(db, *, user, gcn_id: int, expected_version: int | None, sl_gui: float | None = None) -> dict` → `{"gia_cong_ngoai_id", "lsx_id", "ban_giao": [dict…]}`.
  - `POST /api/gia-cong-ngoai/{id}/mang-di` body `{"version": int, "sl_gui": float | null}` → `GiaCongNgoaiOut`.
  - Router helper `_phat_doi(lsx_id: int)` = broadcast `{"type": "gia_cong_ngoai_changed", "lsx_id": …}` — mọi endpoint ghi sau này gọi nó.

- [ ] **Step 1: Bổ sung khuôn test**

Thêm vào cuối `backend/tests/gia_cong_fixtures.py`:

```python
from datetime import datetime, timedelta, timezone

from app.models.role import Role
from app.models.san_xuat import SanXuatCongViec
from app.models.san_xuat_san_luong import SanXuatBatch
from app.models.user import User
from app.services.san_xuat import ban_giao


def cv_ten(sess, lsx_id: int, ten: str) -> SanXuatCongViec:
    return sess.query(SanXuatCongViec).filter_by(lsx_id=lsx_id, ten_cong_doan=ten).one()


def ghi_me(sess, cv, sl: float) -> SanXuatBatch:
    """Mẻ TỐT `sl` cho một công việc NỘI BỘ — chèn thẳng, bỏ qua bàn tổ (bài test không soi ghi mẻ)."""
    luc = datetime.now(timezone.utc)
    b = SanXuatBatch(cong_viec_id=cv.id, bat_dau=luc - timedelta(hours=1), ket_thuc=luc,
                     tong=sl, tot=sl, hong=0, don_vi=cv.don_vi_ra or "to")
    sess.add(b)
    sess.flush()
    return b


def giao_sang(sess, admin, nguon, dich, sl: float) -> dict:
    """Tổ nguồn ghi mẻ `sl` rồi ĐỀ XUẤT bàn giao sang `dich` — đúng cửa thật `ban_giao.de_xuat`."""
    b = ghi_me(sess, nguon, sl)
    sess.commit()
    return ban_giao.de_xuat(sess, user=admin, nguon_cong_viec_id=nguon.id,
                            dich_cong_viec_id=dich.id, batch_ids=[b.id])


def nguoi_ke_hoach(sess, username: str = "kehoach_gc") -> User:
    """Một tài khoản vai "Kế hoạch SX" (seed) — người nhận toast "chờ mang đi"."""
    role = sess.query(Role).filter(Role.name == "Kế hoạch SX").one()
    u = User(username=username, name="Kế hoạch A", password_hash="x", role_id=role.id,
             is_active=True)
    sess.add(u)
    sess.commit()
    return u
```

- [ ] **Step 2: Viết test thất bại**

```python
# backend/tests/test_gia_cong_mang_di.py
"""Nút "Đã mang đi" (spec 2026-09-26 §3 bước 4–5)."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import GiaCongNgoai
from app.models.san_xuat_san_luong import BG_XAC_NHAN, SanXuatBanGiao
from app.services.gia_cong_ngoai import TT_DANG_O_NGOAI, GiaCongXungDot
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.gia_cong_ngoai.mot_phan import mang_di
from tests.gia_cong_fixtures import cv_ten, dung_lenh_gia_cong, giao_sang, ncc, nguoi_ke_hoach
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def lenh(sess, orders, lsx_svc, admin, customer):
    return dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1660, "to"),
        ("Bế", "to", None, 1650, "to"),
    ])


def test_ban_giao_sang_buoc_gia_cong_bao_nguoi_ke_hoach(sess, admin, lenh):
    kh = nguoi_ke_hoach(sess)
    res = giao_sang(sess, admin, cv_ten(sess, lenh, "In"), cv_ten(sess, lenh, "Cán màng"), 1660)
    assert res["su_kien"] == "cho_mang_di" and res["lsx_ma"]
    assert kh.id in res["notify_user_ids"] and admin.id not in res["notify_user_ids"]
    assert res["trang_thai_ban_giao"] == "proposed"


def test_mang_di_nhan_ban_giao_va_ghi_so_gui(sess, admin, lenh):
    giao_sang(sess, admin, cv_ten(sess, lenh, "In"), cv_ten(sess, lenh, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lenh).one()
    kq = mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    assert float(lan.sl_gui) == 1660 and lan.mang_di_boi_id == admin.id
    bg = sess.query(SanXuatBanGiao).one()
    assert bg.trang_thai == BG_XAC_NHAN and bg.xac_nhan_by_id == admin.id
    assert kq["ban_giao"][0]["su_kien"] == "xac_nhan"
    (d,) = lan_cua_lenh(sess, lenh, xem_tien=True)
    assert d["trang_thai"] == TT_DANG_O_NGOAI and d["sl_cho_mang_di"] == 0
    assert [x["viec"] for x in d["lich_su"]][0] == "Mang hàng đi gia công ngoài"


def test_chua_co_ban_giao_thi_chua_mang_di_duoc(sess, admin, lenh):
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lenh).one()
    with pytest.raises(ValueError, match="chưa bàn giao"):
        mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_lech_version_la_xung_dot(sess, admin, lenh):
    giao_sang(sess, admin, cv_ten(sess, lenh, "In"), cv_ten(sess, lenh, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lenh).one()
    with pytest.raises(GiaCongXungDot):
        mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version + 1)


def test_buoc_dau_lenh_la_thue_ngoai_thi_go_so_gui(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
        ("Bế", "to", None, 1000, "to"),
    ])
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    with pytest.raises(ValueError, match="số lượng mang đi"):
        mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version, sl_gui=1000)
    sess.refresh(lan)
    assert float(lan.sl_gui) == 1000


def test_api_mang_di_can_quyen_sua_lenh(client, sess, admin, lenh):
    giao_sang(sess, admin, cv_ten(sess, lenh, "In"), cv_ten(sess, lenh, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lenh).one()
    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    r = client.post(f"/api/gia-cong-ngoai/{lan.id}/mang-di", headers=h,
                    json={"version": lan.version})
    assert r.status_code == 200, r.text
    assert r.json()["trang_thai"] == "dang_o_ngoai"
```

- [ ] **Step 3: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_mang_di.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.gia_cong_ngoai.mot_phan'`.

- [ ] **Step 4: Tách lõi bàn giao**

`backend/app/services/san_xuat/ban_giao.py` — thêm import `from ...repositories.san_xuat_repo import SanXuatRepository`, rồi thêm ba hàm công khai ngay dưới `_ket_qua`:

```python
def lap_ban_giao(
    db: Session, *, user, nguon_cv, dich_cv, so_luong: float, don_vi: str, batch_ids: list[int],
) -> SanXuatBanGiao:
    """LÕI ghi một bàn giao — KHÔNG gate, KHÔNG commit, không tự tính số.

    `de_xuat` gác quyền tổ nguồn + suy số từ mẻ rồi gọi vào đây. Chốt lần gia công ngoài
    (`services/gia_cong_ngoai/chot.py`) gác `san_xuat:update` và giao ĐÚNG con số chốt — công việc
    gia công không có tổ nào để gác theo dòng quyền tổ."""
    repo = SanXuatSanLuongRepository(db)
    cung_to = _la_cung_to(nguon_cv, dich_cv)
    now = _moc()
    uid = getattr(user, "id", None)
    bg = SanXuatBanGiao(
        nguon_cong_viec_id=nguon_cv.id, dich_cong_viec_id=dich_cv.id, cung_to=cung_to,
        so_luong=so_luong, don_vi=don_vi,
        trang_thai=BG_XAC_NHAN if cung_to else BG_DE_XUAT,
        de_xuat_by_id=uid, de_xuat_luc=now,
        xac_nhan_by_id=uid if cung_to else None, xac_nhan_luc=now if cung_to else None,
    )
    repo.add(bg)
    repo.flush()
    for batch_id in batch_ids:
        repo.add(SanXuatBanGiaoBatch(ban_giao_id=bg.id, batch_id=batch_id))
    AuditLogRepository(db).create(
        actor_user_id=uid, action="san_xuat_ban_giao_de_xuat", target=f"san_xuat_ban_giao:{bg.id}",
        detail=(f"nguon={nguon_cv.id} dich={dich_cv.id} sl={so_luong} "
                f"me={','.join(map(str, batch_ids)) or '-'} {'cung_to' if cung_to else 'de_xuat'}"),
        commit=False,
    )
    return bg


def ghi_xac_nhan(db: Session, *, bg: SanXuatBanGiao, user) -> None:
    """LÕI xác nhận — KHÔNG gate, KHÔNG commit. `xac_nhan` gác quyền tổ đích; "Đã mang đi" của
    gia công ngoài gác `san_xuat:update` (đích là công việc gia công, không tổ nào nhận)."""
    bg.trang_thai = BG_XAC_NHAN
    bg.xac_nhan_by_id = getattr(user, "id", None)
    bg.xac_nhan_luc = _moc()
    bg.version += 1
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None), action="san_xuat_ban_giao_xac_nhan",
        target=f"san_xuat_ban_giao:{bg.id}", detail=f"sl={float(bg.so_luong)}", commit=False,
    )


def ket_qua_cho_ben_nhan(db: Session, *, user, bg, nguon_cv, dich_cv) -> dict:
    """Bàn giao MỚI chờ bên nhận: báo người Xác nhận sản lượng ở tổ ĐÍCH (cùng tổ ⇒ không báo ai).
    Đích là công việc GIA CÔNG NGOÀI thì không tổ nào nhận — báo người mang hàng đi (ai sửa được
    lệnh, spec gia công §6) bằng sự kiện "chờ mang đi"."""
    if dich_cv.gia_cong_ngoai_id is not None:
        from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository

        uid = getattr(user, "id", None)
        ra = _ket_qua(bg, nguon_cv, dich_cv, su_kien="cho_mang_di", notify_user_ids=[
            u for u in GiaCongNgoaiRepository(db).nguoi_sua_lenh() if u != uid])
        lsx = SanXuatRepository(db).lsx(dich_cv.lsx_id) if dich_cv.lsx_id else None
        ra["lsx_ma"] = lsx.ma if lsx else ""
        return ra
    notify = [] if bg.trang_thai == BG_XAC_NHAN else _nguoi_nhan(db, user, dich_cv.department_id)
    return _ket_qua(bg, nguon_cv, dich_cv, notify_user_ids=notify, su_kien="de_xuat")


def ket_qua_da_nhan(db: Session, *, user, bg, nguon_cv, dich_cv) -> dict:
    """Bên nhận vừa xác nhận: báo người Xác nhận sản lượng ở tổ NGUỒN."""
    return _ket_qua(bg, nguon_cv, dich_cv, su_kien="xac_nhan", notify_user_ids=_nguoi_nhan(
        db, user, nguon_cv.department_id if nguon_cv else None))
```

Trong `de_xuat`: thay đoạn từ `cung_to = _la_cung_to(nguon_cv, dich_cv)` tới hết `return _ket_qua(...)` bằng:

```python
    bg = lap_ban_giao(db, user=user, nguon_cv=nguon_cv, dich_cv=dich_cv, so_luong=sl,
                      don_vi=don_vi_bg, batch_ids=chon)
    db.commit()
    return ket_qua_cho_ben_nhan(db, user=user, bg=bg, nguon_cv=nguon_cv, dich_cv=dich_cv)
```

Trong `xac_nhan`: ngay sau `dich_cv = repo.cong_viec(bg.dich_cong_viec_id)` thêm

```python
    if dich_cv is not None and dich_cv.gia_cong_ngoai_id is not None:
        # Hàng giao sang bước gia công ngoài: không tổ nào nhận — người kế hoạch bấm "Đã mang đi".
        raise ValueError("Bàn giao sang gia công ngoài — người kế hoạch nhận bằng nút “Đã mang đi”.")
```

rồi thay khối từ `bg.trang_thai = BG_XAC_NHAN` tới hết `return _ket_qua(...)` bằng:

```python
    ghi_xac_nhan(db, bg=bg, user=user)
    db.commit()
    return ket_qua_da_nhan(db, user=user, bg=bg, nguon_cv=nguon_cv, dich_cv=dich_cv)
```

`backend/app/routers/san_xuat.py::_phat_sse_ban_giao` — trong dict `hub.publish(uid, {...})` thêm dòng `"lsx_ma": res.get("lsx_ma"),`.

- [ ] **Step 5: Repo — người nhận thông báo**

`backend/app/repositories/gia_cong_ngoai_repo.py` (import thêm `from ..models.role import RolePermission`):

```python
    # --- Người nhận thông báo (spec §6) -----------------------------------------------------
    def _nguoi_co(self, module_key: str, cot) -> list[int]:
        stmt = (
            select(User.id)
            .join(RolePermission, RolePermission.role_id == User.role_id)
            .where(RolePermission.module_key == module_key, cot.is_(True),
                   User.is_active.is_(True))
        )
        return sorted({uid for (uid,) in self.db.execute(stmt)})

    def nguoi_sua_lenh(self) -> list[int]:
        """Ai mang hàng đi / chốt được: tài khoản có `san_xuat:update` (không thêm vai, không bit)."""
        return self._nguoi_co("san_xuat", RolePermission.can_update)

    def nguoi_lap_phieu_chi(self) -> list[int]:
        """Kế toán lập phiếu chi: `phieu_chi:create` — người nhận toast "chờ chi"."""
        return self._nguoi_co("phieu_chi", RolePermission.can_create)
```

- [ ] **Step 6: Service "Đã mang đi"**

```python
# backend/app/services/gia_cong_ngoai/mot_phan.py
"""Nút "Đã mang đi" của lần gia công MỘT PHẦN (spec 2026-09-26 §3 bước 5).

Mang đi = NHẬN bàn giao của bước trước thay cho tổ (công việc gia công không có tổ nào xác nhận).
Số gửi = đúng số bước trước đã bàn giao — không gõ tay; lệch thì tổ nguồn điều chỉnh bàn giao như
thường. Bấm lại được trước khi chốt (bước trước giao thêm một đợt): số gửi CỘNG DỒN.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.gia_cong_ngoai import KIEU_MOT_PHAN, _utcnow
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ..san_xuat import ban_giao
from . import kiem_version

_EPS = 1e-9


def _lay_lan_mo(repo: GiaCongNgoaiRepository, gcn_id: int, expected_version: int | None):
    gcn = repo.khoa(gcn_id)
    if gcn is None:
        raise ValueError("Không tìm thấy lần gia công.")
    kiem_version(gcn, expected_version)
    if gcn.huy_luc is not None:
        raise ValueError("Lần gia công đã huỷ.")
    if gcn.chot_luc is not None:
        raise ValueError("Lần gia công đã chốt số — mở lại trước nếu cần sửa.")
    return gcn


def mang_di(db: Session, *, user, gcn_id: int, expected_version: int | None,
            sl_gui: float | None = None) -> dict:
    repo = GiaCongNgoaiRepository(db)
    gcn = _lay_lan_mo(repo, gcn_id, expected_version)
    if gcn.kieu != KIEU_MOT_PHAN:
        raise ValueError("Gia công trọn gói không có bước mang đi — giấy đi theo phiếu xuất kho.")
    cvs = repo.cong_viec_cua(gcn.id)
    if not cvs:
        raise ValueError("Lần gia công không còn công việc nào — lệnh đã bị thu hồi?")
    dau = cvs[0]
    cho = repo.ban_giao_cho_mang_di(dau.id)
    if cho:
        so = sum(float(b.so_luong) for b in cho)
    elif repo.co_buoc_truoc(dau.lsx_cong_doan_id):
        raise ValueError("Bước trước chưa bàn giao hàng sang — chờ tổ bàn giao rồi bấm lại.")
    else:
        # Dải đứng ĐẦU lệnh (không bước trước): không có bàn giao để nhận, người mang đi gõ số.
        if sl_gui is None or float(sl_gui) <= _EPS:
            raise ValueError("Nhập số lượng mang đi (lớn hơn 0).")
        so = float(sl_gui)

    sl_repo = SanXuatSanLuongRepository(db)
    ra_bg: list[dict] = []
    for bg in cho:
        ban_giao.ghi_xac_nhan(db, bg=bg, user=user)
        nguon = sl_repo.cong_viec(bg.nguon_cong_viec_id)
        ra_bg.append((bg, nguon))

    uid = getattr(user, "id", None)
    gcn.sl_gui = float(gcn.sl_gui or 0) + so
    gcn.mang_di_boi_id, gcn.mang_di_luc = uid, _utcnow()
    gcn.version += 1
    AuditLogRepository(db).create(
        actor_user_id=uid, action="gia_cong_ngoai_mang_di", target=f"gia_cong_ngoai:{gcn.id}",
        detail=f"Mang đi {so:g} — tổng đã gửi {float(gcn.sl_gui):g}", commit=False,
    )
    db.commit()
    return {
        "gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id,
        "ban_giao": [ban_giao.ket_qua_da_nhan(db, user=user, bg=bg, nguon_cv=n, dich_cv=dau)
                     for bg, n in ra_bg],
    }
```

(Nếu model Task 1 chưa có `_utcnow` công khai thì dùng đúng tên hàm giờ trong `app/models/gia_cong_ngoai.py`.)

- [ ] **Step 7: Schema + endpoint**

`backend/app/schemas/gia_cong_ngoai.py`:

```python
class MangDiIn(BaseModel):
    version: int
    sl_gui: float | None = Field(default=None, gt=0)
```
(import `Field` từ pydantic.)

`backend/app/routers/gia_cong_ngoai.py` — thêm import `from ..realtime import hub`, `from .san_xuat import _phat_sse_ban_giao` (dùng lại đúng gói SSE bàn giao của bàn tổ, không đẻ bản thứ hai), `from ..schemas.gia_cong_ngoai import MangDiIn`, `from ..services.gia_cong_ngoai import mot_phan`, `from ..services.gia_cong_ngoai.lan import lan_dict`, rồi:

```python
def _phat_doi(lsx_id: int) -> None:
    """Khối Gia công ngoài trên lệnh + danh sách Kế hoạch SX tự nạp lại (sau commit)."""
    hub.broadcast({"type": "gia_cong_ngoai_changed", "lsx_id": lsx_id})


def _ra(db: Session, authz: AuthorizationService, user: User, gcn_id: int) -> dict:
    gcn = GiaCongNgoaiRepository(db).get(gcn_id)
    return lan_dict(db, gcn, xem_tien=_xem_tien(authz, user))


@router.post("/{gcn_id}/mang-di", response_model=GiaCongNgoaiOut)
def mang_di(
    gcn_id: int,
    body: MangDiIn,
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "update"))],
) -> dict:
    kq = _chay(lambda: mot_phan.mang_di(
        db, user=user, gcn_id=gcn_id, expected_version=body.version, sl_gui=body.sl_gui))
    for res in kq["ban_giao"]:
        _phat_sse_ban_giao(res)
    _phat_doi(kq["lsx_id"])
    return _ra(db, authz, user, gcn_id)
```

- [ ] **Step 8: Chạy test**

Run: `python -m pytest backend/tests/test_gia_cong_mang_di.py backend/tests/test_san_xuat_ban_giao.py -q`
Expected: PASS (bài bàn giao cũ vẫn xanh — hành vi `de_xuat` / `xac_nhan` không đổi). Nếu tên file test bàn giao khác, tìm bằng `grep -rln "ban_giao.de_xuat" backend/tests`.

- [ ] **Step 9: Commit (khi người dùng cho phép)**

```bash
git add backend/app/services/san_xuat/ban_giao.py backend/app/routers/san_xuat.py backend/app/repositories/gia_cong_ngoai_repo.py backend/app/services/gia_cong_ngoai/mot_phan.py backend/app/schemas/gia_cong_ngoai.py backend/app/routers/gia_cong_ngoai.py backend/tests/gia_cong_fixtures.py backend/tests/test_gia_cong_mang_di.py
git commit -m "gia_cong_ngoai: nút Đã mang đi nhận bàn giao thay tổ + báo kế hoạch hàng chờ mang đi"
```

---

### Task 7: Chốt con số cuối — về XƯỞNG; Mở lại; báo kế toán "chờ chi"

**Files:**
- Create: `backend/app/services/gia_cong_ngoai/chot.py`
- Modify: `backend/app/repositories/gia_cong_ngoai_repo.py` (`ban_giao_tu`)
- Modify: `backend/app/schemas/gia_cong_ngoai.py` (`ChotIn`, `MoLaiIn`), `backend/app/routers/gia_cong_ngoai.py` (`POST /{id}/chot`, `POST /{id}/mo-lai`, `_phat_cho_chi`)
- Test: `backend/tests/test_gia_cong_chot_xuong.py`

**Interfaces:**
- Consumes: `mang_di` (Task 6), `ban_giao.lap_ban_giao` / `ket_qua_cho_ben_nhan` (Task 6), `lan.noi_ve_hop_le(db, gcn, chang_sau) -> list[str]` (Task 5), `nguoi_lap_phieu_chi` (Task 6).
- Produces:
  - `chot.chot(db, *, user, gcn_id: int, expected_version: int | None, sl_cuoi: float, noi_ve: str, dich_cong_viec_id: int | None = None) -> dict` → `{"gia_cong_ngoai_id", "lsx_id", "lsx_ma", "nha_cung_cap_ten", "ten_viec", "ban_giao": dict | None, "yeu_cau_kho": object | None, "nhom_dong": dict | None}`.
  - `chot.mo_lai(db, *, user, gcn_id: int, expected_version: int | None) -> dict` → `{"gia_cong_ngoai_id", "lsx_id"}`.
  - Sổ nhánh `chot._NHANH: dict[str, Callable]` (nơi về → hàm ghi) và `chot._GO: dict[str, Callable]` (nơi về → hàm gỡ). Task này có nhánh `xuong`; Task 8 thêm `kho`, `khach`.
  - `GiaCongNgoaiRepository.ban_giao_tu(cv_id) -> list[SanXuatBanGiao]`.
  - `POST /api/gia-cong-ngoai/{id}/chot` body `{"version", "sl_cuoi" > 0, "noi_ve", "dich_cong_viec_id"?}`; `POST /api/gia-cong-ngoai/{id}/mo-lai` body `{"version"}` → `GiaCongNgoaiOut`.
  - SSE: publish `{"type": "gia_cong_cho_chi", "gia_cong_ngoai_id", "lsx_ma", "nha_cung_cap_ten", "ten_viec"}` tới `nguoi_lap_phieu_chi()` trừ người bấm + broadcast `{"type": "gia_cong_cho_chi_changed"}` — helper `_phat_cho_chi(res, user, db)`; Task 10 gọi lại broadcast khi lập / huỷ phiếu chi.

- [ ] **Step 1: Viết test thất bại**

```python
# backend/tests/test_gia_cong_chot_xuong.py
"""Chốt số cuối của dải giữa lệnh ⇒ về xưởng, bàn giao sang bước sau (spec §3 bước 6–7, §6)."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import NOI_VE_KHO, NOI_VE_XUONG, GiaCongNgoai
from app.models.san_xuat import CV_HOAN_THANH, CV_PHAT_HANH
from app.models.san_xuat_san_luong import BG_DE_XUAT, SanXuatBanGiao, SanXuatBatch
from app.services.gia_cong_ngoai import TT_DA_XONG, TT_DANG_O_NGOAI
from app.services.gia_cong_ngoai.chot import chot, mo_lai
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.gia_cong_ngoai.mot_phan import mang_di
from app.services.san_xuat import ban_giao
from tests.gia_cong_fixtures import cv_ten, dung_lenh_gia_cong, giao_sang, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def da_mang_di(sess, orders, lsx_svc, admin, customer):
    """In → Cán màng + Bế (một nhà) → Đóng gói; đã mang 1.660 tờ đi."""
    a = ncc(sess)
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"),
        ("Cán màng", "thue_ngoai", a, 1660, "to"),
        ("Bế", "thue_ngoai", a, 1650, "to"),
        ("Đóng gói", "to", None, 1650, "to"),
    ])
    giao_sang(sess, admin, cv_ten(sess, lsx_id, "In"), cv_ten(sess, lsx_id, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    return lsx_id, lan


def test_chot_ve_xuong_ghi_me_hoan_thanh_va_de_xuat_ban_giao(sess, admin, da_mang_di):
    lsx_id, lan = da_mang_di
    kq = chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
              sl_cuoi=1650, noi_ve=NOI_VE_XUONG)
    be, can = cv_ten(sess, lsx_id, "Bế"), cv_ten(sess, lsx_id, "Cán màng")
    assert can.trang_thai == be.trang_thai == CV_HOAN_THANH and be.hoan_thanh_luc
    (me,) = sess.query(SanXuatBatch).filter_by(cong_viec_id=be.id).all()
    assert float(me.tot) == 1650
    bg = sess.query(SanXuatBanGiao).filter_by(nguon_cong_viec_id=be.id).one()
    assert bg.trang_thai == BG_DE_XUAT and float(bg.so_luong) == 1650
    assert bg.dich_cong_viec_id == cv_ten(sess, lsx_id, "Đóng gói").id
    assert kq["ban_giao"]["su_kien"] == "de_xuat"
    (d,) = lan_cua_lenh(sess, lsx_id, xem_tien=True)
    assert d["trang_thai"] == TT_DA_XONG and d["thanh_tien"] == 1650 * 500


def test_to_nhan_xac_nhan_duoc_nhu_thuong(sess, admin, da_mang_di):
    lsx_id, lan = da_mang_di
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1650, noi_ve=NOI_VE_XUONG)
    bg = sess.query(SanXuatBanGiao).filter_by(trang_thai=BG_DE_XUAT).one()
    ban_giao.xac_nhan(sess, user=admin, ban_giao_id=bg.id)   # admin có quyền trên tổ Đóng gói


def test_dai_giua_lenh_khong_ve_kho(sess, admin, da_mang_di):
    _lsx_id, lan = da_mang_di
    with pytest.raises(ValueError, match="bước sau"):
        chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=1650, noi_ve=NOI_VE_KHO)


def test_chua_mang_di_thi_chua_chot(sess, orders, lsx_svc, admin, customer):
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1000, "to"),
        ("Bế", "to", None, 1000, "to"),
    ])
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    with pytest.raises(ValueError, match="Mang đi"):
        chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=1000, noi_ve=NOI_VE_XUONG)


def test_mo_lai_go_sach_roi_chot_lai(sess, admin, da_mang_di):
    lsx_id, lan = da_mang_di
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1600, noi_ve=NOI_VE_XUONG)
    sess.refresh(lan)
    mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    be = cv_ten(sess, lsx_id, "Bế")
    assert lan.chot_luc is None and lan.sl_cuoi is None
    assert be.trang_thai == CV_PHAT_HANH and be.hoan_thanh_luc is None
    assert sess.query(SanXuatBatch).filter_by(cong_viec_id=be.id).count() == 0
    assert sess.query(SanXuatBanGiao).filter_by(nguon_cong_viec_id=be.id).count() == 0
    (d,) = lan_cua_lenh(sess, lsx_id, xem_tien=True)
    assert d["trang_thai"] == TT_DANG_O_NGOAI
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1650, noi_ve=NOI_VE_XUONG)


def test_to_sau_da_nhan_thi_khong_mo_lai(sess, admin, da_mang_di):
    _lsx_id, lan = da_mang_di
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1650, noi_ve=NOI_VE_XUONG)
    bg = sess.query(SanXuatBanGiao).filter_by(trang_thai=BG_DE_XUAT).one()
    ban_giao.xac_nhan(sess, user=admin, ban_giao_id=bg.id)
    sess.refresh(lan)
    with pytest.raises(ValueError, match="đã xác nhận"):
        mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_chot_xuong.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.gia_cong_ngoai.chot'`.

- [ ] **Step 3: Repo — bàn giao đi từ công việc cuối**

`backend/app/repositories/gia_cong_ngoai_repo.py`:

```python
    def ban_giao_tu(self, cv_id: int) -> list[SanXuatBanGiao]:
        """Bàn giao ĐI từ công việc cuối của lần (chốt về xưởng đẻ đúng một cái)."""
        return list(self.db.scalars(
            select(SanXuatBanGiao).where(SanXuatBanGiao.nguon_cong_viec_id == cv_id)
            .order_by(SanXuatBanGiao.id)
        ))
```


- [ ] **Step 4: Service chốt / mở lại**

```python
# backend/app/services/gia_cong_ngoai/chot.py
"""Chốt con số cuối của lần gia công + Mở lại (spec 2026-09-26 §3 bước 6, §4 bước 3–5, §6).

Chốt ghi MỘT mẻ (tốt = số chốt) lên công việc cuối của lần, đánh mọi công việc của lần là hoàn
thành, rồi rẽ theo nơi về. Từ đó bàn giao / nhập kho / giao hàng / đóng nhóm chạy NGUYÊN đường cũ.
Mở lại gỡ sạch đúng những gì lần chốt đã đẻ ra — chỉ khi chứng từ phía sau chưa chạy.
"""
from __future__ import annotations

from collections.abc import Callable

from sqlalchemy.orm import Session

from ...models.gia_cong_ngoai import KIEU_MOT_PHAN, NOI_VE_XUONG, _utcnow
from ...models.san_xuat import CV_HOAN_THANH, CV_PHAT_HANH
from ...models.san_xuat_san_luong import BG_DE_XUAT, SanXuatBatch
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.don_vi_do_repo import DonViDoRepository, nhan_don_vi
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.san_xuat_san_luong_repo import SanXuatSanLuongRepository
from ..san_xuat import ban_giao
from . import GiaCongXungDot, kiem_version
from .lan import noi_ve_hop_le

_EPS = 1e-9
NHAN_NOI_VE = {"xuong": "về xưởng", "kho": "về kho", "khach": "giao thẳng cho khách"}


# --- Nhánh GHI theo nơi về ------------------------------------------------------------------
def _ve_xuong(db: Session, *, user, gcn, cuoi, me, so: float, chang_sau: list,
              dich_cong_viec_id: int | None) -> dict:
    if len(chang_sau) == 1:
        dich = chang_sau[0]
    else:
        dich = next((c for c in chang_sau if c.id == dich_cong_viec_id), None)
        if dich is None:
            raise ValueError("Bước sau có nhiều nhánh — chọn bước nhận hàng.")
    bg = ban_giao.lap_ban_giao(db, user=user, nguon_cv=cuoi, dich_cv=dich, so_luong=so,
                               don_vi=me.don_vi, batch_ids=[me.id])
    return {"ban_giao": (bg, cuoi, dich)}


def _go_xuong(db: Session, *, user, gcn, cuoi) -> None:
    repo = GiaCongNgoaiRepository(db)
    sl_repo = SanXuatSanLuongRepository(db)
    for bg in repo.ban_giao_tu(cuoi.id):
        if bg.trang_thai != BG_DE_XUAT:
            raise ValueError("Tổ nhận đã xác nhận bàn giao số chốt — không mở lại được. Nhờ tổ "
                             "điều chỉnh bàn giao nếu số cần sửa.")
        for lk in sl_repo.lien_ket_me(bg.id):
            sl_repo.delete(lk)
        sl_repo.flush()
        sl_repo.delete(bg)


# Nơi về → hàm ghi / hàm gỡ. Task 8 thêm "kho" và "khach".
_NHANH: dict[str, Callable] = {NOI_VE_XUONG: _ve_xuong}
_GO: dict[str, Callable] = {NOI_VE_XUONG: _go_xuong}


def _lay(repo: GiaCongNgoaiRepository, gcn_id: int, expected_version: int | None):
    gcn = repo.khoa(gcn_id)
    if gcn is None:
        raise ValueError("Không tìm thấy lần gia công.")
    kiem_version(gcn, expected_version)
    if gcn.huy_luc is not None:
        raise ValueError("Lần gia công đã huỷ.")
    return gcn


def chot(db: Session, *, user, gcn_id: int, expected_version: int | None, sl_cuoi: float,
         noi_ve: str, dich_cong_viec_id: int | None = None) -> dict:
    repo = GiaCongNgoaiRepository(db)
    gcn = _lay(repo, gcn_id, expected_version)
    if gcn.chot_luc is not None:
        raise GiaCongXungDot("Lần gia công vừa được chốt — tải lại.")
    if gcn.kieu == KIEU_MOT_PHAN and gcn.mang_di_luc is None:
        raise ValueError("Chưa ghi “Đã mang đi” — bấm Mang đi trước khi nhận về.")
    so = float(sl_cuoi or 0)
    if so <= _EPS:
        raise ValueError("Con số cuối phải lớn hơn 0.")
    cvs = repo.cong_viec_cua(gcn.id)
    if not cvs:
        raise ValueError("Lần gia công không còn công việc nào — lệnh đã bị thu hồi?")
    cuoi = cvs[-1]
    chang_sau = SanXuatSanLuongRepository(db).cong_viec_chang_sau(cuoi)
    if noi_ve not in noi_ve_hop_le(db, gcn, chang_sau):
        raise ValueError(
            "Dải này còn bước sau trong xưởng — chỉ chốt về xưởng." if chang_sau else
            "Nơi về không hợp lệ — dải chứa bước cuối của lệnh chỉ về kho, hoặc giao thẳng khi "
            "dòng đơn đứng riêng một cụm.")
    nhanh = _NHANH.get(noi_ve)
    if nhanh is None:
        raise ValueError("Chưa ghi được nơi về này.")

    uid = getattr(user, "id", None)
    luc = _utcnow()
    don_vi = (cuoi.don_vi_ra or gcn.don_vi or "").strip()
    me = SanXuatBatch(
        cong_viec_id=cuoi.id, bat_dau=luc, ket_thuc=luc, tong=so, tot=so, hong=0, don_vi=don_vi,
        ghi_chu=f"Số chốt gia công ngoài — {gcn.nha_cung_cap_ten}"[:500], created_by=uid,
    )
    db.add(me)
    db.flush()
    for cv in cvs:
        cv.trang_thai = CV_HOAN_THANH
        cv.hoan_thanh_luc = luc
        cv.version += 1
    kq = nhanh(db, user=user, gcn=gcn, cuoi=cuoi, me=me, so=so, chang_sau=chang_sau,
               dich_cong_viec_id=dich_cong_viec_id)

    gcn.sl_cuoi, gcn.noi_ve, gcn.chot_boi_id, gcn.chot_luc = so, noi_ve, uid, luc
    gcn.version += 1
    dv_ten = nhan_don_vi(DonViDoRepository(db).ten_theo_ma(), don_vi)
    AuditLogRepository(db).create(
        actor_user_id=uid, action="gia_cong_ngoai_chot", target=f"gia_cong_ngoai:{gcn.id}",
        detail=f"Chốt {so:g} {dv_ten} — {NHAN_NOI_VE[noi_ve]}", commit=False,
    )
    db.commit()

    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    ra = {
        "gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id, "lsx_ma": lsx.ma if lsx else "",
        "nha_cung_cap_ten": gcn.nha_cung_cap_ten, "ten_viec": gcn.ten_viec,
        "ban_giao": None, "yeu_cau_kho": None, "nhom_dong": None,
    }
    if "ban_giao" in kq:
        bg, nguon, dich = kq["ban_giao"]
        ra["ban_giao"] = ban_giao.ket_qua_cho_ben_nhan(db, user=user, bg=bg, nguon_cv=nguon,
                                                       dich_cv=dich)
    for k in ("yeu_cau_kho", "nhom_dong"):
        if k in kq:
            ra[k] = kq[k]
    return ra


def mo_lai(db: Session, *, user, gcn_id: int, expected_version: int | None) -> dict:
    repo = GiaCongNgoaiRepository(db)
    gcn = _lay(repo, gcn_id, expected_version)
    if gcn.chot_luc is None:
        raise ValueError("Lần gia công chưa chốt.")
    pc = repo.phieu_chi_song([gcn.id]).get(gcn.id)
    if pc is not None:
        raise ValueError(f"Kế toán đã lập phiếu chi {pc.code} — huỷ phiếu chi trước rồi mới mở lại.")
    cvs = repo.cong_viec_cua(gcn.id)
    cuoi = cvs[-1]
    _GO[gcn.noi_ve](db, user=user, gcn=gcn, cuoi=cuoi)

    sl_repo = SanXuatSanLuongRepository(db)
    for b in sl_repo.cac_batch(cuoi.id):
        sl_repo.delete(b)
    for cv in cvs:
        cv.trang_thai = CV_PHAT_HANH
        cv.hoan_thanh_luc = None
        cv.version += 1
    so_cu, noi_cu = float(gcn.sl_cuoi), gcn.noi_ve
    gcn.sl_cuoi = gcn.noi_ve = gcn.chot_boi_id = gcn.chot_luc = None
    gcn.version += 1
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None), action="gia_cong_ngoai_mo_lai",
        target=f"gia_cong_ngoai:{gcn.id}",
        detail=f"Mở lại số chốt {so_cu:g} ({NHAN_NOI_VE[noi_cu]})", commit=False,
    )
    db.commit()
    return {"gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id}
```

- [ ] **Step 5: Schema + endpoint + SSE "chờ chi"**

`backend/app/schemas/gia_cong_ngoai.py`:

```python
class ChotIn(BaseModel):
    version: int
    sl_cuoi: float = Field(gt=0)
    noi_ve: str = Field(pattern="^(xuong|kho|khach)$")
    dich_cong_viec_id: int | None = None


class MoLaiIn(BaseModel):
    version: int
```

`backend/app/routers/gia_cong_ngoai.py` (import `ChotIn`, `MoLaiIn`, `from ..services.gia_cong_ngoai import chot as chot_svc`, `from .san_xuat import _phat_sse_dong_nhom`, `from ..services.san_xuat.kho import phat_su_kien_kho`):

```python
def _phat_cho_chi(res: dict, user: User, db: Session) -> None:
    """Lần vừa chốt ⇒ kế toán có việc "chờ chi" (spec §6): toast đích danh + badge mọi người."""
    for uid in GiaCongNgoaiRepository(db).nguoi_lap_phieu_chi():
        if uid == user.id:
            continue
        hub.publish(uid, {
            "type": "gia_cong_cho_chi", "gia_cong_ngoai_id": res["gia_cong_ngoai_id"],
            "lsx_ma": res.get("lsx_ma"), "nha_cung_cap_ten": res.get("nha_cung_cap_ten"),
            "ten_viec": res.get("ten_viec"),
        })
    hub.broadcast({"type": "gia_cong_cho_chi_changed"})


@router.post("/{gcn_id}/chot", response_model=GiaCongNgoaiOut)
def chot(
    gcn_id: int,
    body: ChotIn,
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "update"))],
) -> dict:
    res = _chay(lambda: chot_svc.chot(
        db, user=user, gcn_id=gcn_id, expected_version=body.version, sl_cuoi=body.sl_cuoi,
        noi_ve=body.noi_ve, dich_cong_viec_id=body.dich_cong_viec_id))
    if res["ban_giao"]:
        _phat_sse_ban_giao(res["ban_giao"])
    if res["yeu_cau_kho"] is not None:
        phat_su_kien_kho(res["yeu_cau_kho"], bao_nguoi_tao=False)
    if res["nhom_dong"]:
        _phat_sse_dong_nhom(res["nhom_dong"])
    _phat_cho_chi(res, user, db)
    _phat_doi(res["lsx_id"])
    return _ra(db, authz, user, gcn_id)


@router.post("/{gcn_id}/mo-lai", response_model=GiaCongNgoaiOut)
def mo_lai(
    gcn_id: int,
    body: MoLaiIn,
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "update"))],
) -> dict:
    res = _chay(lambda: chot_svc.mo_lai(db, user=user, gcn_id=gcn_id,
                                         expected_version=body.version))
    hub.broadcast({"type": "gia_cong_cho_chi_changed"})
    # Bàn tổ của bước sau / màn KCS / kho vừa mất một bàn giao hoặc đề nghị — bump chung.
    hub.broadcast({"type": "san_xuat_cong_viec_changed", "lsx_id": res["lsx_id"]})
    _phat_doi(res["lsx_id"])
    return _ra(db, authz, user, gcn_id)
```

- [ ] **Step 6: Chạy test**

Run: `python -m pytest backend/tests/test_gia_cong_chot_xuong.py backend/tests/test_gia_cong_mang_di.py backend/tests/test_gia_cong_phat_hanh.py -q`
Expected: PASS.

- [ ] **Step 7: Commit (khi người dùng cho phép)**

```bash
git add backend/app/services/gia_cong_ngoai backend/app/repositories/gia_cong_ngoai_repo.py backend/app/schemas/gia_cong_ngoai.py backend/app/routers/gia_cong_ngoai.py backend/tests/test_gia_cong_chot_xuong.py
git commit -m "gia_cong_ngoai: chốt số cuối về xưởng + mở lại + báo kế toán chờ chi"
```

---

### Task 8: Chốt dải chứa bước cuối — về KHO (không qua KCS) hoặc GIAO THẲNG cho khách

**Files:**
- Modify: `backend/app/services/san_xuat/kho.py:267-348` (tách lõi `lap_yeu_cau_nhap_tp`, thêm `bao_yeu_cau_nhap_moi`)
- Modify: `backend/app/services/san_xuat/kcs.py` (thêm `ghi_kcs_ngoai_phan_mem`)
- Modify: `backend/app/services/delivery_service.py:123-135, 1247-1266` (tách `sinh_ma_chung_tu`; thống kê tài xế bỏ chuyến giao thẳng)
- Modify: `backend/app/services/gia_cong_ngoai/giao_thang.py` (thêm `ghi_giao_thang`, `huy_giao_thang`)
- Modify: `backend/app/services/gia_cong_ngoai/chot.py` (nhánh `kho`, `khach`)
- Modify: `backend/app/repositories/gia_cong_ngoai_repo.py` (`yeu_cau_nhap_cua`, `yeu_cau_xuat_cua`, `chuyen_giao_thang_cua`)
- Modify: `backend/tests/gia_cong_fixtures.py` (`nhan_vien_cua`)
- Test: `backend/tests/test_gia_cong_chot_cuoi.py`

**Interfaces:**
- Consumes: `chot._NHANH` / `_GO` (Task 7), `dong_don_dung_rieng` (Task 5), cột `stock_requests.gia_cong_ngoai_id` / `delivery_trips.gia_cong_ngoai_id` (Task 1).
- Produces:
  - `kho.lap_yeu_cau_nhap_tp(db, *, user, cv, so_kcs: float, nguon_ghi: str = "KCS", gia_cong_ngoai_id: int | None = None) -> tuple[StockRequest, list[dict]]` — không gate, không khoá, không commit.
  - `kho.bao_yeu_cau_nhap_moi(db, req) -> None` — thông báo kho + SSE, gọi SAU commit.
  - `kcs.ghi_kcs_ngoai_phan_mem(db, *, cv, so_dat: float, uid: int | None, ghi_chu: str) -> SanXuatKcsBatch` — không gate, không commit.
  - `delivery_service.sinh_ma_chung_tu(tien_to: str, da_ton_tai) -> str`.
  - `giao_thang.ghi_giao_thang(db, *, user, gcn, cv, so: float) -> DeliveryTrip`; `giao_thang.huy_giao_thang(db, *, user, gcn) -> None`.
  - `GiaCongNgoaiRepository.yeu_cau_nhap_cua(gcn_id) -> list[StockRequest]` / `.yeu_cau_xuat_cua(gcn_id)` (loại NHAP / XUAT, chưa huỷ), `.chuyen_giao_thang_cua(gcn_id) -> list[DeliveryTrip]` (chưa huỷ).
  - Kết quả `chot.chot(...)["yeu_cau_kho"]` = `StockRequest` (router bắn `phat_su_kien_kho`), `["nhom_dong"]` = dict của `tu_dong_dong_neu_du` hoặc None.

- [ ] **Step 1: Viết test thất bại**

```python
# backend/tests/test_gia_cong_chot_cuoi.py
"""Dải chứa bước cuối: số chốt thay KCS ⇒ về kho hoặc giao thẳng (spec §3 cuối, §4 bước 4–5)."""
from __future__ import annotations

import pytest

from app.models.delivery import LG_DA_HUY, LG_THANH_CONG, DeliveryTrip
from app.models.gia_cong_ngoai import NOI_VE_KHACH, NOI_VE_KHO, GiaCongNgoai
from app.models.lsx import Lsx
from app.models.san_xuat import CV_HOAN_THANH, NHOM_DONG_DU, SanXuatNhom
from app.models.san_xuat_kcs import SanXuatKcsBatch
from app.models.stock_request import REQ_CANCELLED, StockRequest
from app.repositories.delivery_repo import DeliveryRepository
from app.services.gia_cong_ngoai.chot import chot, mo_lai
from app.services.gia_cong_ngoai.mot_phan import mang_di
from app.services.san_xuat.kcs import chuoi_cong_doan_kcs
from tests.gia_cong_fixtures import (
    cv_ten, dung_lenh_gia_cong, giao_sang, ncc, nguoi_ke_hoach, nhan_vien_cua,
)
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def dai_cuoi(sess, orders, lsx_svc, admin, customer):
    """In → Bế + Đóng gói ngoài (bước cuối); đã mang đi; tổ In đã xong việc.

    Đơn vị ra của dải = "cái" (đúng đơn vị dòng đơn) — cùng khuôn `test_san_xuat_kcs._cv_kcs`, để
    quy sang đơn vị thành phẩm có hệ số 1 và bài test đọc thẳng được số."""
    a = ncc(sess, "Hộp Phú Thịnh")
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1000, "to"),
        ("Bế", "thue_ngoai", a, 1000, "cái"),
        ("Đóng gói", "thue_ngoai", a, 1000, "cái"),
    ])
    in_ = cv_ten(sess, lsx_id, "In")
    giao_sang(sess, admin, in_, cv_ten(sess, lsx_id, "Bế"), 1000)
    in_.trang_thai = CV_HOAN_THANH          # đóng nhóm đòi MỌI công việc xong
    sess.commit()
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    return lsx_id, lan


def test_ve_kho_ghi_kcs_tong_hop_va_de_nghi_nhap(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    kq = chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
              sl_cuoi=1000, noi_ve=NOI_VE_KHO)
    cuoi = cv_ten(sess, lsx_id, "Đóng gói")
    (k,) = sess.query(SanXuatKcsBatch).filter_by(cong_viec_id=cuoi.id).all()
    assert float(k.so_luong_dat) == 1000 and "ngoài phần mềm" in k.ghi_chu
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id).one()
    assert req.san_xuat_cong_viec_id == cuoi.id and req is kq["yeu_cau_kho"]
    # Đủ mục tiêu + mọi việc xong ⇒ nhóm tự đóng đủ như hàng xưởng làm.
    assert sess.get(SanXuatNhom, cuoi.nhom_id).trang_thai == NHOM_DONG_DU
    assert kq["nhom_dong"]["kieu"] == "du"


def test_man_kcs_khong_bao_con_gui_kho_cho_viec_gia_cong(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHO)
    chuoi = chuoi_cong_doan_kcs(sess, admin, lsx_id)
    cuoi = next(c for c in chuoi["cong_doan"] if c["ten_cong_doan"] == "Đóng gói")
    assert cuoi["con_gui_kho"] == 0 and cuoi["gia_cong_ngoai"] is True


def test_mo_lai_ve_kho_huy_de_nghi_va_mo_lai_nhom(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHO)
    sess.refresh(lan)
    mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    cuoi = cv_ten(sess, lsx_id, "Đóng gói")
    assert sess.query(SanXuatKcsBatch).filter_by(cong_viec_id=cuoi.id).count() == 0
    assert sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id).one().trang_thai == REQ_CANCELLED
    assert sess.get(SanXuatNhom, cuoi.nhom_id).trang_thai != NHOM_DONG_DU


def test_giao_thang_ghi_chuyen_thanh_cong_cong_vao_da_giao(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
    trip = sess.query(DeliveryTrip).filter_by(gia_cong_ngoai_id=lan.id).one()
    assert trip.trang_thai == LG_THANH_CONG and trip.km is None
    l = sess.get(Lsx, lsx_id)
    assert DeliveryRepository(sess).da_giao_theo_dong(l.order_id)[l.order_line_id] == 1000
    assert sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id).count() == 0


def test_giao_thang_mo_lai_huy_chuyen(sess, admin, dai_cuoi):
    lsx_id, lan = dai_cuoi
    nhan_vien_cua(sess, admin)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
    sess.refresh(lan)
    mo_lai(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    assert sess.query(DeliveryTrip).filter_by(gia_cong_ngoai_id=lan.id).one().trang_thai == LG_DA_HUY
    l = sess.get(Lsx, lsx_id)
    assert DeliveryRepository(sess).da_giao_theo_dong(l.order_id).get(l.order_line_id, 0) == 0


def test_giao_thang_can_ho_so_nhan_vien(sess, dai_cuoi):
    _lsx_id, lan = dai_cuoi
    kh = nguoi_ke_hoach(sess)                       # tài khoản mới, chưa gắn hồ sơ nhân viên
    with pytest.raises(ValueError, match="hồ sơ nhân viên"):
        chot(sess, user=kh, gcn_id=lan.id, expected_version=lan.version,
             sl_cuoi=1000, noi_ve=NOI_VE_KHACH)
```

Thêm helper vào `backend/tests/gia_cong_fixtures.py`:

```python
from app.models.employee import Employee
from app.repositories.employee_repo import EmployeeRepository


def nhan_vien_cua(sess, user) -> Employee:
    """Hồ sơ nhân viên gắn tài khoản (giao thẳng đứng tên một nhân viên). Có sẵn thì dùng lại —
    `employees.user_id` UNIQUE."""
    emp = EmployeeRepository(sess).get_by_user_id(user.id)
    if emp is None:
        emp = Employee(code=f"NV-GC{user.id}", full_name=user.name or user.username, user_id=user.id)
        sess.add(emp)
        sess.commit()
    return emp
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_chot_cuoi.py -q`
Expected: FAIL — `ValueError: Chưa ghi được nơi về này.`

- [ ] **Step 3: Lõi nhập kho thành phẩm (không gate KCS)**

`backend/app/services/san_xuat/kho.py` — tách thân `tao_yeu_cau_nhap_kho_cong_doan` từ `nguon = _nguon_nhom(...)` tới hết khối `try: req = req_svc.create(...) except ...` thành:

```python
def lap_yeu_cau_nhap_tp(
    db: Session, *, user, cv, so_kcs: float, nguon_ghi: str = "KCS",
    gia_cong_ngoai_id: int | None = None,
):
    """LÕI lập đề nghị NHẬP thành phẩm cho `so_kcs` (đơn vị ra của công đoạn cuối) — KHÔNG gate,
    KHÔNG khoá, KHÔNG commit. Trả `(req, dong_ra)`.

    Hai cửa gọi: nút của KCS (`tao_yeu_cau_nhap_kho_cong_doan` — gate KCS + khoá + số còn gửi) và
    chốt lần gia công ngoài về kho (spec gia công §4 bước 4 — KCS làm ngoài phần mềm, số chốt đi
    thẳng). Đề nghị vẫn mang `san_xuat_cong_viec_id` ⇒ "giao được" của Giao hàng đếm như thường."""
    nguon = _nguon_nhom(db, nhom_id=cv.nhom_id, lsx_id=cv.lsx_id)
    if nguon is None or not nguon.cums:
        raise ValueError("Nhóm thành phẩm chưa nối được dòng đơn nào nên chưa thể nhập kho.")

    hang = _hang_service(db)
    don_vi_kcs = (cv.don_vi_ra or "").strip()
    theo_ma: dict[int, dict] = {}
    for cum, sl_kcs in zip(nguon.cums, _chia_theo_cum(so_kcs, nguon.cums)):
        tp = khai_cum(db, nguon.order, cum)
        sl = round(sl_kcs * _he_so_cho_nhap(db, hang, tp, don_vi_kcs), 2)
        if sl <= 0:
            continue
        d = theo_ma.setdefault(tp.id, {"tp": tp, "sl": 0.0, "tien": 0.0, "du_gia": True})
        gia = gia_ban_cum(cum)
        d["sl"] += sl
        d["tien"] += sl * (gia or 0)
        d["du_gia"] = d["du_gia"] and gia is not None
    if not theo_ma:
        raise KhongConSoDuGuiKho("Không còn số đạt chưa gửi kho ở công đoạn này.")

    lines: list[dict] = []
    ra: list[dict] = []
    for d in theo_ma.values():
        tp, sl = d["tp"], round(d["sl"], 2)
        gia_ban = int(round(d["tien"] / d["sl"])) if d["du_gia"] and d["sl"] > 0 else None
        lines.append({"hang_loai": "vat_tu", "hang_id": tp.id, "lsx_id": nguon.than_chinh.id,
                      "dvt": tp.don_vi_gia, "sl_de_nghi": sl, "don_gia": 0, "don_gia_ban": gia_ban})
        ra.append({"hang_id": tp.id, "ma_hang": tp.ma, "ten_hang": tp.ten, "dvt": tp.don_vi_gia,
                   "sl_de_nghi": sl, "don_gia_ban": gia_ban})

    req_svc = _req_service(db, hang)
    ten = " + ".join(c.ten for c in nguon.cums)
    them = {"gia_cong_ngoai_id": gia_cong_ngoai_id} if gia_cong_ngoai_id else {}
    try:
        req = req_svc.create(
            user=user, loai=REQ_NHAP, lines=lines, commit=False,
            bo_phan_id=cv.department_id or user.department_id,
            san_xuat_cong_viec_id=cv.id,
            ghi_chu=f"Nhập thành phẩm từ {nguon_ghi} · {nguon.than_chinh.ma} · {ten}"[:1000],
            **them,
        )
    except StockRequestError as e:
        db.rollback()
        raise ValueError(str(e)) from None
    return req, ra


def bao_yeu_cau_nhap_moi(db: Session, req) -> None:
    """Thông báo kho có đề nghị nhập mới + SSE — gọi SAU commit."""
    _req_service(db, _hang_service(db)).thong_bao_yeu_cau_moi(req)
    phat_su_kien_kho(req, bao_nguoi_tao=False)
```

Và `tao_yeu_cau_nhap_kho_cong_doan` còn lại:

```python
    gate_kcs(db, user)
    cv = SanXuatRepository(db).cong_viec(cong_viec_id)
    if cv is None:
        raise ValueError("Không tìm thấy công đoạn.")
    if not cv.la_kcs_cuoi:
        raise ValueError("Chỉ công đoạn cuối của nhóm thành phẩm mới tạo yêu cầu nhập kho.")
    if cv.gia_cong_ngoai_id is not None:
        raise ValueError("Công đoạn gia công ngoài — số chốt tự đi vào kho, KCS không gửi lại.")

    SanXuatKcsRepository(db).khoa_kcs_cua_cong_viec(cv.id)   # khoá TRƯỚC khi đọc — chặn bấm đúp
    dong = dong_nhap_kho_cua_cong_viec(db, [cv.id]).get(cv.id, [])
    con = so_con_gui_kho(db, cv, dong)
    if con <= _EPS:
        raise KhongConSoDuGuiKho("Không còn số đạt chưa gửi kho ở công đoạn này.")
    req, ra = lap_yeu_cau_nhap_tp(db, user=user, cv=cv, so_kcs=con)

    # ⚠️ `audit_repo.create` tự commit — đặt SAU khi yêu cầu đã flush để cả hai chốt chung một nhịp.
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None),
        action="san_xuat_kho_yeu_cau_nhap",
        target=f"san_xuat_cong_viec:{cv.id}",
        detail=f"stock_request={req.id} ma={req.ma} so_luong_kcs={con:g}",
    )
    db.commit()
    bao_yeu_cau_nhap_moi(db, req)
    return {"request_id": req.id, "ma": req.ma, "cong_viec_id": cv.id,
            "so_luong": round(con, 3), "don_vi": (cv.don_vi_ra or "").strip() or None, "dong": ra}
```
(Dòng chặn `gia_cong_ngoai_id` đã thêm ở Task 5 — giữ một bản, đừng lặp.)

- [ ] **Step 4: KCS tổng hợp**

`backend/app/services/san_xuat/kcs.py` — thêm ngay dưới `kiem_cong_doan`:

```python
def ghi_kcs_ngoai_phan_mem(db: Session, *, cv, so_dat: float, uid: int | None,
                           ghi_chu: str) -> SanXuatKcsBatch:
    """Bản ghi KCS ĐẠT tổng hợp cho công việc GIA CÔNG NGOÀI cuối nhóm (spec gia công §10).

    KCS làm ngoài phần mềm; con số chốt đứng thay. Không gate, không commit — `gia_cong_ngoai.chot`
    gác `san_xuat:update`. Nhờ bản ghi này "còn gửi kho" / đóng nhóm / trạng thái lệnh chạy nguyên
    đường cũ. Báo cáo KCS loại nó (`kcs_bao_cao`)."""
    luc = _moc()
    kcs = SanXuatKcsBatch(
        cong_viec_id=cv.id, nhom_id=cv.nhom_id, bat_dau=luc, ket_thuc=luc,
        so_luong_nhan=so_dat, so_luong_dat=so_dat, so_luong_khong_dat=0,
        don_vi=(cv.don_vi_ra or "").strip(), ket_luan=_ket_luan(so_dat, 0),
        ghi_chu=ghi_chu[:500], created_by=uid,
    )
    db.add(kcs)
    db.flush()
    return kcs
```

- [ ] **Step 5: Giao thẳng**

`backend/app/services/delivery_service.py` — đưa thân `_sinh_ma` ra hàm module rồi để method gọi lại:

```python
def sinh_ma_chung_tu(tien_to: str, da_ton_tai) -> str:
    """`YCGH-yymmdd-XXXX` / `DNXGH-yymmdd-XXXX` — cùng khuôn `YCMH-` bên Thu mua. Dùng chung cho
    giao thẳng của gia công ngoài (không qua cửa lập yêu cầu)."""
    hom_nay = _utcnow().strftime("%y%m%d")
    bang_chu = string.ascii_uppercase + string.digits
    for _ in range(20):
        duoi = "".join(secrets.choice(bang_chu) for _ in range(4))
        ma = f"{tien_to}-{hom_nay}-{duoi}"
        if da_ton_tai(ma) is None:
            return ma
    raise DeliveryError("Không sinh được mã chứng từ duy nhất, vui lòng thử lại.")
```
(đặt ngay trên `class DeliveryService`; method `_sinh_ma(self, tien_to, da_ton_tai)` còn một dòng `return sinh_ma_chung_tu(tien_to, da_ton_tai)`.)

Trong `thong_ke_thang` (vòng `for t in self.deliveries.list_trips(employee_ids=[employee_id]):` ~dòng 1256) VÀ `thong_ke_ngay` (vòng cùng dạng ~dòng 2052), đầu thân vòng thêm:

```python
            # Chuyến "nhà gia công giao thẳng" chỉ đứng tên người chốt số — người đó không chạy xe.
            if getattr(t, "gia_cong_ngoai_id", None):
                continue
```

`backend/app/services/gia_cong_ngoai/giao_thang.py` — thêm (import `from ...models.delivery import LG_DA_HUY, LG_THANH_CONG, YC_CHO_LEN_KE_HOACH, YC_DA_HUY`, `from ...models.gia_cong_ngoai import _utcnow`, `from ...repositories.delivery_repo import DeliveryRepository`, `from ...repositories.employee_repo import EmployeeRepository`, `from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository`, `from ..delivery_service import sinh_ma_chung_tu`, `from ..san_xuat.kho import _he_so_cho_nhap`, `from ..san_xuat.vat_tu_de_nghi import _hang_service`, `from ..thanh_pham_khai_bao import cum_cua_dong, khai_cum`):

```python
def ghi_giao_thang(db: Session, *, user, gcn, cv, so: float):
    """Nhà gia công giao thẳng: MỘT yêu cầu giao + MỘT chuyến THÀNH CÔNG đứng tên người chốt ⇒ cộng
    vào "đã giao" của dòng đơn (`da_giao_theo_dong`). Không kho, không xe, không phiếu xuất, không
    km (km trống ⇒ khoán km không trả đồng nào). Đi thẳng qua repo — cửa lập yêu cầu của Giao hàng
    chặn theo trần "giao được" tính từ kho, mà hàng này không qua kho. Không commit."""
    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    order = OrderRepository(db).get_by_id(lsx.order_id) if lsx else None
    cum = cum_cua_dong(order, lsx.order_line_id) if order is not None else None
    if cum is None or len(cum.dong) != 1:
        raise ValueError("Dòng đơn của lệnh đi chung cụm với dòng khác — không giao thẳng được, "
                         "chọn về kho.")
    emp = EmployeeRepository(db).get_by_user_id(user.id)
    if emp is None:
        raise ValueError("Tài khoản của bạn chưa gắn hồ sơ nhân viên — chuyến giao phải đứng tên "
                         "một nhân viên. Nhờ Nhân sự gắn rồi chốt lại, hoặc chọn về kho.")
    tp = khai_cum(db, order, cum)
    qty = int(round(so * _he_so_cho_nhap(db, _hang_service(db), tp, (cv.don_vi_ra or "").strip())))
    if qty <= 0:
        raise ValueError("Con số cuối quy ra số lượng giao bằng 0.")
    ln = cum.dong[0]
    repo = DeliveryRepository(db)
    con = int(ln.qty or 0) - int(repo.da_giao_theo_dong(order.id).get(ln.id, 0))
    if qty > con:
        raise ValueError(f"Dòng đơn chỉ còn phải giao {con} — nhập đúng số khách nhận.")

    luc = _utcnow()
    uid = getattr(user, "id", None)
    ghi = f"Nhà gia công {gcn.nha_cung_cap_ten} giao thẳng"
    req = repo.create_request(
        code=sinh_ma_chung_tu("YCGH", repo.get_request_by_code), order_id=order.id,
        customer_id=getattr(order, "customer_id", None), department_id=user.department_id,
        ngay_can_giao=luc.date(), dia_chi=ghi, ghi_chu=ghi, trang_thai=YC_CHO_LEN_KE_HOACH,
        created_by=uid,
    )
    repo.add_request_line(req.id, ln.id, qty, hang_loai="vat_tu", hang_id=tp.id, dvt=tp.don_vi_gia)
    trip = repo.create_trip(
        request_id=req.id, lan_thu=1, employee_id=emp.id, gio_lay_hang=luc, gio_du_kien_giao=luc,
        ghi_chu_phan_cong=f"{ghi} — không xe, không kho", trang_thai=LG_THANH_CONG,
        thoi_gian_ket_thuc=luc, ghi_chu_ket_qua=ghi, created_by=uid, gia_cong_ngoai_id=gcn.id,
    )
    repo.add_trip_line(trip.id, ln.id, qty)
    repo.ghi_lich_su(trip_id=trip.id, tu_trang_thai=None, den_trang_thai=LG_THANH_CONG,
                     nguoi_thao_tac_id=uid, ghi_chu="Ghi từ lần gia công ngoài đã chốt")
    return trip


def huy_giao_thang(db: Session, *, user, gcn) -> None:
    """Mở lại lần đã giao thẳng: HUỶ chuyến + yêu cầu (giữ vết, không xoá) ⇒ thôi cộng "đã giao"."""
    repo = DeliveryRepository(db)
    uid = getattr(user, "id", None)
    for trip in GiaCongNgoaiRepository(db).chuyen_giao_thang_cua(gcn.id):
        truoc = trip.trang_thai
        trip.trang_thai = LG_DA_HUY
        repo.ghi_lich_su(trip_id=trip.id, tu_trang_thai=truoc, den_trang_thai=LG_DA_HUY,
                         nguoi_thao_tac_id=uid, ly_do="Mở lại lần gia công ngoài")
        req = repo.get_request(trip.request_id)
        if req is not None:
            req.trang_thai, req.ly_do_huy = YC_DA_HUY, "Mở lại lần gia công ngoài"
```

- [ ] **Step 6: Repo đọc chứng từ sau của lần**

`backend/app/repositories/gia_cong_ngoai_repo.py` (import `StockRequest`, `REQ_CANCELLED`, `REQ_NHAP`, `REQ_XUAT` từ `..models.stock_request`; `DeliveryTrip`, `LG_DA_HUY` từ `..models.delivery`):

```python
    def _yeu_cau_cua(self, gcn_id: int, loai: str) -> list[StockRequest]:
        return list(self.db.scalars(select(StockRequest).where(
            StockRequest.gia_cong_ngoai_id == gcn_id, StockRequest.loai == loai,
            StockRequest.trang_thai != REQ_CANCELLED).order_by(StockRequest.id)))

    def yeu_cau_nhap_cua(self, gcn_id: int) -> list[StockRequest]:
        """Đề nghị NHẬP thành phẩm do lần chốt về kho đẻ ra (còn sống)."""
        return self._yeu_cau_cua(gcn_id, REQ_NHAP)

    def yeu_cau_xuat_cua(self, gcn_id: int) -> list[StockRequest]:
        """Đề nghị XUẤT giấy cấp cho nhà gia công trọn gói (Task 9) — còn sống. Tách loại để mở
        lại số chốt không đụng nhầm phiếu giấy đã xuất."""
        return self._yeu_cau_cua(gcn_id, REQ_XUAT)

    def chuyen_giao_thang_cua(self, gcn_id: int) -> list[DeliveryTrip]:
        return list(self.db.scalars(select(DeliveryTrip).where(
            DeliveryTrip.gia_cong_ngoai_id == gcn_id, DeliveryTrip.trang_thai != LG_DA_HUY)))
```

- [ ] **Step 7: Hai nhánh mới trong `chot.py`**

Thêm import `from ...models.gia_cong_ngoai import NOI_VE_KHACH, NOI_VE_KHO`, `from ...models.san_xuat import NHOM_DANG_SX, NHOM_DONG_DU, NHOM_DONG_THIEU`, `from ...models.stock_request import REQ_CANCELLED`, `from ...repositories.san_xuat_kcs_repo import SanXuatKcsRepository`, `from ...repositories.stock_request_repo import StockRequestRepository`, `from ..san_xuat import kho as sx_kho`, `from ..san_xuat.dong_nhom import tu_dong_dong_neu_du`, `from ..san_xuat.kcs import ghi_kcs_ngoai_phan_mem`, `from .giao_thang import ghi_giao_thang, huy_giao_thang`, rồi:

```python
_GHI_KCS = "KCS làm ngoài phần mềm — số chốt gia công ngoài"


def _ve_kho(db: Session, *, user, gcn, cuoi, me, so: float, chang_sau: list,
            dich_cong_viec_id: int | None) -> dict:
    ghi_kcs_ngoai_phan_mem(db, cv=cuoi, so_dat=so, uid=getattr(user, "id", None), ghi_chu=_GHI_KCS)
    req, _ra = sx_kho.lap_yeu_cau_nhap_tp(
        db, user=user, cv=cuoi, so_kcs=so,
        nguon_ghi=f"gia công ngoài ({gcn.nha_cung_cap_ten})", gia_cong_ngoai_id=gcn.id)
    return {"yeu_cau_kho": req, "_dong_nhom": cuoi.nhom_id}


def _ve_khach(db: Session, *, user, gcn, cuoi, me, so: float, chang_sau: list,
              dich_cong_viec_id: int | None) -> dict:
    ghi_kcs_ngoai_phan_mem(db, cv=cuoi, so_dat=so, uid=getattr(user, "id", None), ghi_chu=_GHI_KCS)
    ghi_giao_thang(db, user=user, gcn=gcn, cv=cuoi, so=so)
    return {"_dong_nhom": cuoi.nhom_id}


def _go_kcs_va_nhom(db: Session, *, user, cuoi) -> None:
    kcs_repo = SanXuatKcsRepository(db)
    for k in kcs_repo.cac_kcs_batch(cuoi.id):
        db.delete(k)
    nhom = SanXuatRepository(db).nhom(cuoi.nhom_id) if cuoi.nhom_id else None
    if nhom is not None and nhom.trang_thai == NHOM_DONG_THIEU:
        raise ValueError("Trưởng KCS đã đóng thiếu nhóm thành phẩm này — không mở lại được.")
    if nhom is not None and nhom.trang_thai == NHOM_DONG_DU:
        # Chính số chốt đã làm nhóm đủ ⇒ gỡ số thì nhóm mở lại.
        nhom.trang_thai = NHOM_DANG_SX
        nhom.version += 1


def _go_kho(db: Session, *, user, gcn, cuoi) -> None:
    req_repo = StockRequestRepository(db)
    for req in GiaCongNgoaiRepository(db).yeu_cau_nhap_cua(gcn.id):
        req_repo.lock_for_update(req.id)
        if req_repo.co_voucher(req.id):
            raise ValueError(f"Kho đã lập phiếu cho đề nghị nhập {req.ma} — không mở lại được.")
        req.trang_thai, req.ly_do_huy = REQ_CANCELLED, "Mở lại lần gia công ngoài"
    _go_kcs_va_nhom(db, user=user, cuoi=cuoi)


def _go_khach(db: Session, *, user, gcn, cuoi) -> None:
    huy_giao_thang(db, user=user, gcn=gcn)
    _go_kcs_va_nhom(db, user=user, cuoi=cuoi)


_NHANH.update({NOI_VE_KHO: _ve_kho, NOI_VE_KHACH: _ve_khach})
_GO.update({NOI_VE_KHO: _go_kho, NOI_VE_KHACH: _go_khach})
```

Trong `chot()`: ngay sau `db.commit()` (trước khi dựng `ra`) thêm

```python
    nhom_dong = None
    if kq.get("_dong_nhom"):
        # Đóng nhóm tự commit riêng — đặt SAU giao dịch chính như mọi cửa gọi khác (§16).
        nhom_dong = tu_dong_dong_neu_du(db, nhom_id=kq["_dong_nhom"], actor=user,
                                        su_kien="gia_cong_ngoai_chot")
    if kq.get("yeu_cau_kho") is not None:
        sx_kho.bao_yeu_cau_nhap_moi(db, kq["yeu_cau_kho"])
```
và đổi vòng cuối thành

```python
    ra["yeu_cau_kho"] = kq.get("yeu_cau_kho")
    ra["nhom_dong"] = nhom_dong
    return ra
```
(bỏ vòng `for k in ("yeu_cau_kho", "nhom_dong")` cũ). Kiểm model nhóm có cột `version` (`grep -n "version" backend/app/models/san_xuat.py` trong class `SanXuatNhom`) — dong_nhom.py đang `nhom.version += 1` nên có.

Router Task 7 đã bắn `phat_su_kien_kho(res["yeu_cau_kho"], …)` — XOÁ dòng đó (đã gọi trong `bao_yeu_cau_nhap_moi`, bắn hai lần là toast đúp).

- [ ] **Step 8: Chạy test**

Run: `python -m pytest backend/tests/test_gia_cong_chot_cuoi.py backend/tests/test_gia_cong_chot_xuong.py backend/tests/test_san_xuat_nhap_kho_tp.py backend/tests/test_san_xuat_dong_nhom.py backend/tests/test_khoan_km_giao_hang.py backend/tests/test_giao_hang_api.py -q`
Expected: PASS (lõi nhập kho tách ra không đổi hành vi nút KCS; mã chứng từ giao hàng sinh như cũ; thống kê tài xế không đổi).

- [ ] **Step 9: Commit (khi người dùng cho phép)**

```bash
git add backend/app/services/san_xuat/kho.py backend/app/services/san_xuat/kcs.py backend/app/services/delivery_service.py backend/app/services/gia_cong_ngoai backend/app/repositories/gia_cong_ngoai_repo.py backend/app/routers/gia_cong_ngoai.py backend/tests/test_gia_cong_chot_cuoi.py
git commit -m "gia_cong_ngoai: chốt dải cuối về kho (không qua KCS) hoặc nhà gia công giao thẳng"
```

---

### Task 9: Gia công TRỌN GÓI — đặt, huỷ, đề nghị xuất giấy, bỏ nhu cầu vật tư

**Files:**
- Create: `backend/app/services/gia_cong_ngoai/tron_goi.py`
- Modify: `backend/app/repositories/gia_cong_ngoai_repo.py` (`tron_goi_dang_chay`, `giay_cua_lenh`)
- Modify: `backend/app/services/gia_cong_ngoai/lan.py` (`lan_dict` thêm `xuat_giay`)
- Modify: `backend/app/services/ke_hoach_vat_tu_service.py:943-956` (bỏ nhu cầu của lệnh trọn gói)
- Modify: `backend/app/schemas/gia_cong_ngoai.py` (`TronGoiIn`, `HuyTronGoiIn`, `XuatGiayIn`, `XuatGiayOut`; `GiaCongNgoaiOut.xuat_giay`)
- Modify: `backend/app/routers/gia_cong_ngoai.py` (3 endpoint)
- Modify: `backend/tests/gia_cong_fixtures.py` (`them_giay`, `kh_vt`)
- Test: `backend/tests/test_gia_cong_tron_goi.py`

**Interfaces:**
- Consumes: `GiaCongNgoaiRepository.nha_gia_cong(id)` (Task 2), `huy_lan_cua_goi` + `lan_dict` (Task 5), `chot` / `mo_lai` (Task 7–8, trọn gói đi thẳng nhánh kho / khách), `yeu_cau_xuat_cua` (Task 8), `release_update.thu_hoi_goi`, `nhom.dam_bao_nhom`, `component.thanh_phan_lien_thong`, `xep_lich.release._giu_cho_service`.
- Produces:
  - `tron_goi.dat_tron_goi(db, *, user, lsx_id: int, nha_cung_cap_id: int, sl_dat: float, don_gia: float | None, xuong_cap_giay: bool) -> dict` → `{"gia_cong_ngoai_id", "lsx_id"}`.
  - `tron_goi.huy_tron_goi(db, *, user, gcn_id: int, expected_version: int | None, ly_do: str) -> dict` → `{"gia_cong_ngoai_id", "lsx_id"}`; lệnh về **nháp**.
  - `tron_goi.de_nghi_xuat_giay(db, *, user, gcn_id: int, expected_version: int | None) -> StockRequest`.
  - `GiaCongNgoaiRepository.tron_goi_dang_chay(lsx_ids) -> dict[int, bool]` (`{lsx_id: xuong_cap_giay}` của lần trọn gói chưa huỷ), `.giay_cua_lenh(lsx_id) -> list[LsxCongDoanVatTu]`.
  - `lan_dict(...)["xuat_giay"]` = `{"id", "ma", "trang_thai"} | None`.
  - `POST /api/gia-cong-ngoai/lenh/{lsx_id}/tron-goi` body `{"nha_cung_cap_id", "sl_dat" > 0, "don_gia"?: ≥ 0, "xuong_cap_giay": bool}` → `GiaCongNgoaiOut`.
  - `POST /api/gia-cong-ngoai/{id}/huy-tron-goi` body `{"version", "ly_do" ≥ 3 ký tự}` → `GiaCongNgoaiOut`.
  - `POST /api/gia-cong-ngoai/{id}/xuat-giay` body `{"version"}` → `GiaCongNgoaiOut`.

- [ ] **Step 1: Khuôn test**

Thêm vào `backend/tests/gia_cong_fixtures.py`:

```python
from app.models.lsx import LsxCongDoanVatTu
from app.models.vat_lieu_kho import GiayNguyen


def them_giay(sess, lsx, *, so_luong: float = 0.5, don_vi: str = "tan") -> LsxCongDoanVatTu:
    """Một dòng GIẤY (Ivory 350 của `_ptg_2_in`) trên bước ĐẦU của lệnh — thay mọi dòng giấy cũ.

    Khai theo đơn vị gốc của giấy ("tan") để khỏi phụ thuộc quy cách tờ ↔ tấn trong test."""
    giay = sess.query(GiayNguyen).filter(GiayNguyen.ma == "G-IV350X").one()
    buoc = sorted(lsx.cong_doans, key=lambda c: c.thu_tu)[0]
    for vt in list(buoc.vat_tus):
        if vt.hang_loai == "giay":
            sess.delete(vt)
    sess.flush()
    vt = LsxCongDoanVatTu(
        lsx_cong_doan_id=buoc.id, hang_loai="giay", vat_tu_id=giay.id,
        vat_tu_ma_snapshot=giay.ma, vat_tu_ten_snapshot=giay.ten, don_vi_snapshot=don_vi,
        so_luong=so_luong,
    )
    sess.add(vt)
    sess.commit()
    return vt


def kh_vt(sess):
    """KeHoachVatTuService dựng đúng dây của cửa phát hành (`xep_lich/release._giu_cho_service`)."""
    from app.services.xep_lich.release import _giu_cho_service

    return _giu_cho_service(sess).kh


def hang_can_cua(sess, lsx_id: int) -> set[tuple[str, int]]:
    """Mặt hàng mà bảng cân đối đang tính nhu cầu cho lệnh này."""
    bang = kh_vt(sess).can_doi(chi_lsx_ids={lsx_id})
    return {(n["hang_loai"], n["hang_id"]) for n in bang["items"]
            if n.get("loai_nhom") == "vat_tu"
            for d in n.get("dong", []) if d.get("lsx_id") == lsx_id}
```

- [ ] **Step 2: Viết test thất bại**

```python
# backend/tests/test_gia_cong_tron_goi.py
"""Gia công TRỌN GÓI (spec 2026-09-26 §4): cả lệnh ra ngoài, không xuống xưởng."""
from __future__ import annotations

import pytest

from app.models.gia_cong_ngoai import KIEU_TRON_GOI, NOI_VE_KHO, GiaCongNgoai
from app.models.lsx import TT_DA_PHAT_HANH, TT_NHAP, Lsx
from app.models.san_xuat import (
    BUOC_THUE_NGOAI, GOI_DA_THU_HOI, SanXuatCongViec, SanXuatGoiPhatHanh,
)
from app.models.stock_request import REQ_NHAP, REQ_XUAT, StockRequest
from app.models.xep_lich_lenh import XepLichLenh
from app.services.gia_cong_ngoai import TT_DA_HUY, TT_DANG_GIA_CONG
from app.services.gia_cong_ngoai.chot import chot
from app.services.gia_cong_ngoai.lan import lan_cua_lenh
from app.services.gia_cong_ngoai.tron_goi import dat_tron_goi, de_nghi_xuat_giay, huy_tron_goi
from tests.gia_cong_fixtures import hang_can_cua, lenh_chua_phat, ncc, them_giay
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def lenh(sess, orders, lsx_svc, admin, customer) -> Lsx:
    return lenh_chua_phat(sess, orders, lsx_svc, admin, customer)


def _dat(sess, admin, lenh, *, xuong_cap_giay=False):
    a = ncc(sess, "In hộp Phú Thịnh")
    kq = dat_tron_goi(sess, user=admin, lsx_id=lenh.id, nha_cung_cap_id=a.id, sl_dat=20_000,
                      don_gia=900, xuong_cap_giay=xuong_cap_giay)
    return sess.get(GiaCongNgoai, kq["gia_cong_ngoai_id"])


def test_dat_tron_goi_phat_hanh_mot_cong_viec_khong_to(sess, admin, lenh):
    lan = _dat(sess, admin, lenh)
    sess.refresh(lenh)
    assert lenh.trang_thai == TT_DA_PHAT_HANH and lan.kieu == KIEU_TRON_GOI
    (cv,) = sess.query(SanXuatCongViec).filter_by(lsx_id=lenh.id).all()
    assert cv.gia_cong_ngoai_id == lan.id and cv.department_id is None
    assert cv.la_kcs_cuoi and cv.loai_buoc == BUOC_THUE_NGOAI
    assert float(cv.so_luong_ra) == 20_000 and cv.don_vi_ra == lan.don_vi
    assert sess.query(XepLichLenh).filter_by(lsx_id=lenh.id).count() == 0
    (d,) = lan_cua_lenh(sess, lenh.id, xem_tien=True)
    assert d["trang_thai"] == TT_DANG_GIA_CONG and d["xuat_giay"] is None


def test_lenh_da_phat_hanh_thi_khong_dat_duoc(sess, admin, lenh):
    lenh.trang_thai = TT_DA_PHAT_HANH
    sess.commit()
    with pytest.raises(ValueError, match="đã phát hành"):
        _dat(sess, admin, lenh)


def test_chot_tron_goi_ve_kho(sess, admin, lenh):
    lan = _dat(sess, admin, lenh)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=19_800, noi_ve=NOI_VE_KHO)
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id, loai=REQ_NHAP).one()
    assert float(req.lines[0].sl_de_nghi) == 19_800


def test_huy_tron_goi_ve_nhap_thu_hoi_goi(sess, admin, lenh):
    lan = _dat(sess, admin, lenh)
    huy_tron_goi(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
                 ly_do="Khách đổi mẫu")
    sess.refresh(lenh)
    sess.refresh(lan)
    assert lenh.trang_thai == TT_NHAP and lan.ly_do_huy == "Khách đổi mẫu"
    goi_id = sess.query(SanXuatCongViec).filter_by(lsx_id=lenh.id).one().goi_id
    assert sess.get(SanXuatGoiPhatHanh, goi_id).trang_thai == GOI_DA_THU_HOI
    (d,) = lan_cua_lenh(sess, lenh.id, xem_tien=True)
    assert d["trang_thai"] == TT_DA_HUY


def test_xuong_cap_giay_lap_de_nghi_xuat_mot_lan(sess, admin, lenh):
    them_giay(sess, lenh)
    lan = _dat(sess, admin, lenh, xuong_cap_giay=True)
    de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    req = sess.query(StockRequest).filter_by(gia_cong_ngoai_id=lan.id, loai=REQ_XUAT).one()
    (ln,) = req.lines
    assert ln.hang_loai == "giay" and float(ln.sl_de_nghi) > 0 and ln.lsx_id == lenh.id
    (d,) = lan_cua_lenh(sess, lenh.id, xem_tien=True)
    assert d["xuat_giay"]["ma"] == req.ma
    sess.refresh(lan)
    with pytest.raises(ValueError, match="đã có đề nghị"):
        de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_nha_gia_cong_lo_giay_thi_khong_xuat(sess, admin, lenh):
    them_giay(sess, lenh)
    lan = _dat(sess, admin, lenh, xuong_cap_giay=False)
    with pytest.raises(ValueError, match="tự lo giấy"):
        de_nghi_xuat_giay(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)


def test_can_doi_vat_tu_bo_giay_khi_nha_gia_cong_lo(sess, admin, lenh):
    giay = ("giay", them_giay(sess, lenh).vat_tu_id)
    assert giay in hang_can_cua(sess, lenh.id)
    _dat(sess, admin, lenh, xuong_cap_giay=False)
    assert giay not in hang_can_cua(sess, lenh.id)


def test_can_doi_vat_tu_giu_giay_khi_xuong_cap(sess, admin, lenh):
    giay = ("giay", them_giay(sess, lenh).vat_tu_id)
    _dat(sess, admin, lenh, xuong_cap_giay=True)
    assert giay in hang_can_cua(sess, lenh.id)


def test_api_dat_tron_goi(client, sess, admin, lenh):
    a = ncc(sess, "In hộp Phú Thịnh")
    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    r = client.post(f"/api/gia-cong-ngoai/lenh/{lenh.id}/tron-goi", headers=h, json={
        "nha_cung_cap_id": a.id, "sl_dat": 20000, "don_gia": 900, "xuong_cap_giay": False})
    assert r.status_code == 200, r.text
    assert r.json()["kieu"] == "tron_goi" and r.json()["trang_thai"] == "dang_gia_cong"
```

(`XepLichLenh` ở `app/models/xep_lich_lenh.py:32`; `can_doi(chi_lsx_ids=…)` hỏi đích danh nên tính cả lệnh NHÁP — `ke_hoach_vat_tu_service.py:322`.)

- [ ] **Step 3: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_tron_goi.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.gia_cong_ngoai.tron_goi'`.

- [ ] **Step 4: Repo**

`backend/app/repositories/gia_cong_ngoai_repo.py` (import `KIEU_TRON_GOI` từ model, `LsxCongDoanVatTu` từ `..models.lsx`, `HANG_GIAY` từ `..models.vat_lieu_kho`):

```python
    def tron_goi_dang_chay(self, lsx_ids) -> dict[int, bool]:
        """`{lsx_id: xuong_cap_giay}` của lệnh đang gia công TRỌN GÓI (lần chưa huỷ)."""
        ids = [int(i) for i in lsx_ids if i]
        if not ids:
            return {}
        return {lsx_id: bool(cap) for lsx_id, cap in self.db.execute(
            select(GiaCongNgoai.lsx_id, GiaCongNgoai.xuong_cap_giay).where(
                GiaCongNgoai.lsx_id.in_(ids), GiaCongNgoai.kieu == KIEU_TRON_GOI,
                GiaCongNgoai.huy_luc.is_(None)))}

    def giay_cua_lenh(self, lsx_id: int) -> list[LsxCongDoanVatTu]:
        """Dòng GIẤY khai ở các bước của lệnh — nguồn đề nghị xuất giấy cho nhà gia công."""
        return list(self.db.scalars(
            select(LsxCongDoanVatTu).join(LsxCongDoan, LsxCongDoan.id == LsxCongDoanVatTu.lsx_cong_doan_id)
            .where(LsxCongDoan.lsx_id == lsx_id, LsxCongDoanVatTu.hang_loai == HANG_GIAY,
                   LsxCongDoanVatTu.so_luong > 0)
            .order_by(LsxCongDoan.thu_tu, LsxCongDoanVatTu.id)))
```

- [ ] **Step 5: Service trọn gói**

```python
# backend/app/services/gia_cong_ngoai/tron_goi.py
"""Gia công TRỌN GÓI (spec 2026-09-26 §4).

Đặt = phát hành lệnh thành một gói có ĐÚNG MỘT công việc thuê ngoài, không tổ, là công đoạn cuối
của nhóm thành phẩm. Không bước nào xuống bàn tổ; lệnh vẫn "Đã phát hành" để mọi màn đọc đúng.
Số cuối chốt bằng `chot.py` (nhánh kho / khách) như dải cuối của gia công một phần.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.gia_cong_ngoai import KIEU_TRON_GOI, GiaCongNgoai, _utcnow
from ...models.lsx import TT_CHO_BO_SUNG, TT_DA_LAP_KE_HOACH, TT_NHAP, TT_SAN_SANG
from ...models.lsx import TT_DA_PHAT_HANH as LSX_DA_PHAT_HANH
from ...models.san_xuat import (
    BUOC_THUE_NGOAI, CV_PHAT_HANH, PB_PHAT_HANH, SanXuatCongViec, SanXuatGoiPhatHanh,
    SanXuatPhienBan,
)
from ...models.stock_request import REQ_CANCELLED, REQ_XUAT
from ...repositories.audit_repo import AuditLogRepository
from ...repositories.document_sequence_repo import DocumentSequenceRepository
from ...repositories.don_vi_do_repo import DonViDoRepository, nhan_don_vi
from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.order_repo import OrderRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ...repositories.stock_request_repo import StockRequestRepository
from ...repositories.xep_lich_lenh_repo import XepLichLenhRepository
from ...repositories.xep_lich_repo import XepLichRepository
from ..san_xuat.component import thanh_phan_lien_thong
from ..san_xuat.nhom import dam_bao_nhom
from ..san_xuat.release_update import thu_hoi_goi
from ..san_xuat.vat_tu_de_nghi import _don_vi_gui_kho, _hang_service, _req_service
from ..sequence_service import SequenceService
from ..stock_request_service import StockRequestError
from ..thanh_pham_khai_bao import cum_cua_dong, khai_cum
from . import GiaCongXungDot, kiem_version

_DAT_DUOC = (TT_NHAP, TT_CHO_BO_SUNG, TT_SAN_SANG, TT_DA_LAP_KE_HOACH)


def _don_vi_thanh_pham(db: Session, lsx) -> str:
    """Đơn vị của con số cuối = đơn vị món Thành phẩm của cụm (cùng thứ kho sẽ nhập)."""
    order = OrderRepository(db).get_by_id(lsx.order_id)
    cum = cum_cua_dong(order, lsx.order_line_id) if order is not None else None
    tp = khai_cum(db, order, cum) if cum is not None else None
    return ((tp.don_vi_gia if tp is not None else None) or lsx.don_vi_tinh or "").strip()


def _giu_cho(db: Session):
    from ..xep_lich.release import _giu_cho_service

    return _giu_cho_service(db)


def dat_tron_goi(db: Session, *, user, lsx_id: int, nha_cung_cap_id: int, sl_dat: float,
                 don_gia: float | None, xuong_cap_giay: bool) -> dict:
    repo = SanXuatRepository(db)
    gc_repo = GiaCongNgoaiRepository(db)
    lsx = repo.lsx(lsx_id)
    if lsx is None:
        raise ValueError("Không tìm thấy lệnh sản xuất.")
    if lsx.trang_thai == LSX_DA_PHAT_HANH:
        raise ValueError("Lệnh đã phát hành xuống xưởng — thu hồi phát hành trước rồi mới đặt "
                         "gia công trọn gói.")
    if lsx.trang_thai not in _DAT_DUOC:
        raise ValueError("Trạng thái lệnh không cho đặt gia công trọn gói.")
    nha = gc_repo.nha_gia_cong(nha_cung_cap_id)
    if nha is None:
        raise ValueError("Nhà cung cấp này chưa bật “Nhận gia công” hoặc đã ngừng giao dịch.")
    if float(sl_dat or 0) <= 0:
        raise ValueError("Số lượng đặt gia công phải lớn hơn 0.")
    tp = thanh_phan_lien_thong(repo, {lsx_id})
    if len(tp.lsx_ids) > 1 or tp.bai_ghep_ids:
        raise ValueError("Lệnh đi chung nhóm thành phẩm hoặc bài ghép với lệnh khác — gia công "
                         "trọn gói chỉ áp cho lệnh đứng riêng.")
    if XepLichRepository(db).exists_lsx(lsx_id):
        raise ValueError("Lệnh đang có dòng xếp lịch theo công đoạn — xoá nháp xếp lịch trước.")
    if repo.goi_hien_tai_cua({lsx_id}, set()) is not None:
        raise ValueError("Lệnh đang có gói phát hành — thu hồi trước.")

    # Mốc giờ của bàn Xếp lịch không còn nghĩa: lệnh không chạy trong xưởng.
    moc = XepLichLenhRepository(db).theo_lsx(lsx_id)
    if moc is not None:
        XepLichLenhRepository(db).xoa(moc)

    uid = getattr(user, "id", None)
    dv = _don_vi_thanh_pham(db, lsx)
    gcn = GiaCongNgoai(
        lsx_id=lsx_id, kieu=KIEU_TRON_GOI, nha_cung_cap_id=nha.id, nha_cung_cap_ten=nha.name,
        ten_viec="Trọn gói cả lệnh", don_gia=don_gia, don_vi=dv, sl_dat=float(sl_dat),
        xuong_cap_giay=bool(xuong_cap_giay), created_by=uid,
    )
    db.add(gcn)
    db.flush()

    goi = SanXuatGoiPhatHanh(
        ma=SequenceService(DocumentSequenceRepository(db)).generate_code("san_xuat_goi"),
        version_hien_tai=1)
    repo.add(goi)
    repo.flush()
    repo.add(SanXuatPhienBan(goi_id=goi.id, so=1, loai=PB_PHAT_HANH, phat_hanh_by_id=uid))
    nhom = dam_bao_nhom(repo, {lsx_id}).get(lsx_id)
    repo.add(SanXuatCongViec(
        goi_id=goi.id, phien_ban_so=1, nhom_id=nhom.id if nhom is not None else None,
        lsx_id=lsx_id, ten_cong_doan=f"Gia công trọn gói — {nha.name}"[:255],
        loai_buoc=BUOC_THUE_NGOAI, department_id=None, la_kcs_cuoi=True,
        so_luong_vao=float(sl_dat), so_luong_ra=float(sl_dat), don_vi_vao=dv, don_vi_ra=dv,
        nha_cung_cap=nha.name, trang_thai=CV_PHAT_HANH, gia_cong_ngoai_id=gcn.id,
    ))
    if nhom is not None:
        nhom.than_chinh_lsx_id = lsx_id
    member = repo.member_of_lsx(lsx_id)
    if member is not None:
        member.la_than_chinh = True
    lsx.trang_thai = LSX_DA_PHAT_HANH

    dv_ten = nhan_don_vi(DonViDoRepository(db).ten_theo_ma(), dv)
    AuditLogRepository(db).create(
        actor_user_id=uid, action="gia_cong_ngoai_dat", target=f"gia_cong_ngoai:{gcn.id}",
        detail=(f"Trọn gói lệnh {lsx.ma}: {nha.name} — {float(sl_dat):g} {dv_ten}; "
                f"{'xưởng cấp giấy' if xuong_cap_giay else 'nhà gia công lo giấy'}"),
        commit=False,
    )
    db.commit()

    # Giữ chỗ vật tư đi theo NHU CẦU mới (KHVT bỏ nhu cầu lệnh trọn gói): nhả hết rồi giữ lại
    # đúng phần còn cần — giấy khi xưởng cấp, không gì khi nhà gia công lo. `tat`/`bat` tự commit.
    if lsx.giu_cho_bat:
        giu = _giu_cho(db)
        giu.tat(lsx_id=lsx_id)
        if xuong_cap_giay:
            giu.bat(lsx_id=lsx_id)
    return {"gia_cong_ngoai_id": gcn.id, "lsx_id": lsx_id}


def _lay_tron_goi(gc_repo: GiaCongNgoaiRepository, gcn_id: int, expected_version):
    gcn = gc_repo.khoa(gcn_id)
    if gcn is None or gcn.kieu != KIEU_TRON_GOI:
        raise ValueError("Không tìm thấy lần gia công trọn gói.")
    kiem_version(gcn, expected_version)
    if gcn.huy_luc is not None:
        raise ValueError("Lần gia công đã huỷ.")
    if gcn.chot_luc is not None:
        raise GiaCongXungDot("Lần gia công đã chốt số — mở lại trước.")
    return gcn


def huy_tron_goi(db: Session, *, user, gcn_id: int, expected_version: int | None,
                 ly_do: str) -> dict:
    ly_do = (ly_do or "").strip()
    if len(ly_do) < 3:
        raise ValueError("Ghi lý do huỷ (ít nhất 3 ký tự).")
    gc_repo = GiaCongNgoaiRepository(db)
    gcn = _lay_tron_goi(gc_repo, gcn_id, expected_version)
    req_repo = StockRequestRepository(db)
    for req in gc_repo.yeu_cau_xuat_cua(gcn.id):
        req_repo.lock_for_update(req.id)
        if req_repo.co_voucher(req.id):
            raise ValueError(f"Kho đã lập phiếu xuất giấy {req.ma} cho nhà gia công — không huỷ "
                             "được. Nhập trả giấy về kho trước.")
        req.trang_thai, req.ly_do_huy = REQ_CANCELLED, "Huỷ gia công trọn gói"

    uid = getattr(user, "id", None)
    # Đánh huỷ TRƯỚC khi thu hồi gói: `thu_hoi_goi` → `huy_lan_cua_goi` bỏ qua lần đã huỷ, nên
    # lý do người dùng gõ không bị câu "Thu hồi gói…" đè.
    gcn.huy_luc, gcn.huy_boi_id, gcn.ly_do_huy = _utcnow(), uid, ly_do[:500]
    gcn.version += 1
    thu_hoi_goi(db, nguon="lsx", id=gcn.lsx_id, actor=user)
    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    lsx.trang_thai = TT_NHAP
    AuditLogRepository(db).create(
        actor_user_id=uid, action="gia_cong_ngoai_huy", target=f"gia_cong_ngoai:{gcn.id}",
        detail=f"Huỷ trọn gói — lệnh {lsx.ma} về Nháp. Lý do: {ly_do}"[:500], commit=False,
    )
    db.commit()
    return {"gia_cong_ngoai_id": gcn.id, "lsx_id": gcn.lsx_id}


def de_nghi_xuat_giay(db: Session, *, user, gcn_id: int, expected_version: int | None):
    """Xưởng cấp giấy cho nhà gia công: MỘT đề nghị XUẤT (kho soạn + lập phiếu xuất như mọi đề
    nghị khác). Dòng lấy từ giấy khai ở các bước của lệnh; mang `lsx_id` nên KHVT tự trừ "đã cấp"."""
    gc_repo = GiaCongNgoaiRepository(db)
    gcn = _lay_tron_goi(gc_repo, gcn_id, expected_version)
    if not gcn.xuong_cap_giay:
        raise ValueError("Lần này nhà gia công tự lo giấy — không có giấy để xuất.")
    if gc_repo.yeu_cau_xuat_cua(gcn.id):
        raise ValueError("Lần này đã có đề nghị xuất giấy — xem ở Yêu cầu nhập xuất.")
    dong = gc_repo.giay_cua_lenh(gcn.lsx_id)
    if not dong:
        raise ValueError("Lệnh chưa khai giấy ở bước nào — khai ở Kế hoạch SX rồi đề nghị lại.")

    hang = _hang_service(db)
    goc: dict[int, float] = {}
    for vt in dong:
        q = hang.quy_ve_goc("giay", int(vt.vat_tu_id), vt.don_vi_snapshot, float(vt.so_luong))
        goc[int(vt.vat_tu_id)] = goc.get(int(vt.vat_tu_id), 0.0) + float(q["sl_goc"])
    lines = []
    for hang_id, sl_goc in goc.items():
        dvt, sl = _don_vi_gui_kho(hang, "giay", hang_id, sl_goc)
        if round(sl, 2) <= 0:
            raise ValueError("Lượng giấy quá nhỏ để kho ghi được — kiểm lại số khai ở bước.")
        lines.append({"hang_loai": "giay", "hang_id": hang_id, "dvt": dvt,
                      "sl_de_nghi": round(sl, 2), "lsx_id": gcn.lsx_id})

    lsx = SanXuatRepository(db).lsx(gcn.lsx_id)
    req_svc = _req_service(db, hang)
    try:
        req = req_svc.create(
            user=user, loai=REQ_XUAT, lines=lines, commit=False,
            bo_phan_id=user.department_id, gia_cong_ngoai_id=gcn.id,
            ghi_chu=f"Cấp giấy cho nhà gia công {gcn.nha_cung_cap_ten} — lệnh {lsx.ma}"[:1000],
        )
    except StockRequestError as e:
        db.rollback()
        raise ValueError(str(e)) from None
    gcn.version += 1
    AuditLogRepository(db).create(
        actor_user_id=getattr(user, "id", None), action="gia_cong_ngoai_xuat_giay",
        target=f"gia_cong_ngoai:{gcn.id}", detail=f"Đề nghị xuất giấy {req.ma}", commit=False,
    )
    db.commit()
    req_svc.thong_bao_yeu_cau_moi(req)
    return req
```

(`REQ_XUAT` trong `StockRequestService.create` tự duyệt hay chờ duyệt là luật sẵn có của kho — không đụng. Tên kho repo mốc xếp lịch: `grep -n "class XepLichLenhRepository" backend/app/repositories/*.py` — plan đã kiểm là `xep_lich_lenh_repo.py`; `XepLichRepository.exists_lsx` ở `xep_lich_repo.py`.)

- [ ] **Step 6: KHVT bỏ nhu cầu lệnh trọn gói**

`backend/app/services/ke_hoach_vat_tu_service.py::_gom_nhu_cau` — vòng "vật tư khai tay ở bước lệnh" (dòng ~943-956) đổi thành:

```python
        # --- vật tư khai tay ở bước lệnh ------------------------------------
        buoc_map = {cd.id: (cd, l) for l in lenh for cd in l.cong_doans}
        bi_buoc_chung_de = self.repo.step_keys_bi_buoc_chung_de({bg.id for bg in bais})
        # Lệnh gia công TRỌN GÓI (spec gia công ngoài §4): nhà gia công lo vật tư. Xưởng cấp giấy
        # thì chỉ GIẤY còn là nhu cầu của xưởng; không thì lệnh không cần gì từ kho.
        from ..repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository

        tron_goi = GiaCongNgoaiRepository(self.db).tron_goi_dang_chay({l.id for l in lenh})
        if buoc_map:
            for vt in self.repo.vat_tu_theo_buoc_lenh(list(buoc_map)):
                cd, l = buoc_map[vt.lsx_cong_doan_id]
                if cd.step_key in bi_buoc_chung_de or _f(vt.so_luong) <= 0:
                    continue
                if l.id in tron_goi and not (tron_goi[l.id] and vt.hang_loai == "giay"):
                    continue
                tho.append(
```
(phần `tho.append(...)` giữ nguyên.) Kiểm import tương đối: file ở `app/services/`, nên là `from ..repositories...`.

- [ ] **Step 7: `lan_dict` + schema + endpoint**

`backend/app/services/gia_cong_ngoai/lan.py::lan_dict` — trước `"version"` thêm:

```python
        "xuat_giay": next(({"id": r.id, "ma": r.ma, "trang_thai": r.trang_thai}
                           for r in repo.yeu_cau_xuat_cua(gcn.id)), None),
```

`backend/app/schemas/gia_cong_ngoai.py`:

```python
class XuatGiayOut(BaseModel):
    id: int
    ma: str
    trang_thai: str


class TronGoiIn(BaseModel):
    nha_cung_cap_id: int = Field(gt=0)
    sl_dat: float = Field(gt=0)
    don_gia: float | None = Field(default=None, ge=0)
    xuong_cap_giay: bool = False


class HuyTronGoiIn(BaseModel):
    version: int
    ly_do: str = Field(min_length=3, max_length=500)


class XuatGiayIn(BaseModel):
    version: int
```
và trong `GiaCongNgoaiOut` thêm `xuat_giay: XuatGiayOut | None = None`.

`backend/app/routers/gia_cong_ngoai.py` (import `TronGoiIn`, `HuyTronGoiIn`, `XuatGiayIn`, `from ..services.gia_cong_ngoai import tron_goi`):

```python
@router.post("/lenh/{lsx_id}/tron-goi", response_model=GiaCongNgoaiOut)
def dat_tron_goi(
    lsx_id: int,
    body: TronGoiIn,
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "update"))],
) -> dict:
    kq = _chay(lambda: tron_goi.dat_tron_goi(
        db, user=user, lsx_id=lsx_id, nha_cung_cap_id=body.nha_cung_cap_id, sl_dat=body.sl_dat,
        don_gia=body.don_gia, xuong_cap_giay=body.xuong_cap_giay))
    _phat_doi(lsx_id)
    return _ra(db, authz, user, kq["gia_cong_ngoai_id"])


@router.post("/{gcn_id}/huy-tron-goi", response_model=GiaCongNgoaiOut)
def huy_tron_goi(
    gcn_id: int,
    body: HuyTronGoiIn,
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "update"))],
) -> dict:
    kq = _chay(lambda: tron_goi.huy_tron_goi(db, user=user, gcn_id=gcn_id,
                                              expected_version=body.version, ly_do=body.ly_do))
    _phat_doi(kq["lsx_id"])
    return _ra(db, authz, user, gcn_id)


@router.post("/{gcn_id}/xuat-giay", response_model=GiaCongNgoaiOut)
def xuat_giay(
    gcn_id: int,
    body: XuatGiayIn,
    db: Annotated[Session, Depends(get_db)],
    authz: Authz,
    user: Annotated[User, Depends(require_permission(MODULE, "update"))],
) -> dict:
    req = _chay(lambda: tron_goi.de_nghi_xuat_giay(db, user=user, gcn_id=gcn_id,
                                                    expected_version=body.version))
    _phat_doi(GiaCongNgoaiRepository(db).get(gcn_id).lsx_id)
    return _ra(db, authz, user, gcn_id)
```
(`req` không dùng thêm — thông báo kho đã bắn trong service. Bỏ biến nếu linter kêu: `_chay(...)` đứng một mình.)

- [ ] **Step 8: Chạy test**

Run: `python -m pytest backend/tests/test_gia_cong_tron_goi.py backend/tests/test_gia_cong_chot_cuoi.py backend/tests/test_ke_hoach_vat_tu.py -q`
Expected: PASS. (Nếu `test_ke_hoach_vat_tu.py` không có, chạy `ls backend/tests | grep -i "ke_hoach_vat_tu\|khvt"` và chạy file có thật.)

- [ ] **Step 9: Commit (khi người dùng cho phép)**

```bash
git add backend/app/services/gia_cong_ngoai backend/app/repositories/gia_cong_ngoai_repo.py backend/app/services/ke_hoach_vat_tu_service.py backend/app/schemas/gia_cong_ngoai.py backend/app/routers/gia_cong_ngoai.py backend/tests/gia_cong_fixtures.py backend/tests/test_gia_cong_tron_goi.py
git commit -m "gia_cong_ngoai: gia công trọn gói — đặt/huỷ, đề nghị xuất giấy, bỏ nhu cầu vật tư"
```

---

### Task 10: Phiếu chi nguồn "Gia công ngoài" + hàng "chờ chi" + loại khỏi 331

**Files:**
- Modify: `backend/app/services/accounting_service.py:1021-1054` (`create_voucher`), `:2568-2697` (`_prepare_standalone_voucher`), `_voucher_out` (~3057), thêm `_gia_cong_cho_phieu_chi`
- Modify: `backend/app/schemas/accounting.py:84-111` (`PaymentVoucherIn.gia_cong_ngoai_id`, `PaymentVoucherOut.gia_cong_ngoai_id`, `GiaCongChoChiOut`, `GiaCongChoChiDemOut`)
- Modify: `backend/app/repositories/accounting_repo.py:620-637` (`phieu_chi_cho_bao_cao` loại nguồn gia công)
- Modify: `backend/app/repositories/gia_cong_ngoai_repo.py` (`cho_chi`)
- Create: `backend/app/services/gia_cong_ngoai/cho_chi.py`
- Modify: `backend/app/routers/accounting.py` (2 GET + SSE khi lập / huỷ phiếu nguồn gia công)
- Test: `backend/tests/test_gia_cong_phieu_chi.py`

**Interfaces:**
- Consumes: `VOUCHER_SOURCE_GIA_CONG`, `payment_vouchers.gia_cong_ngoai_id` + partial unique (Task 1), `phieu_chi_song` (Task 5), `chot` (Task 7).
- Produces:
  - `POST /api/accounting/payment-vouchers` nhận `"source_type": "gia_cong_ngoai"` + `"gia_cong_ngoai_id"`. Số tiền do kế toán gõ (mặc định FE = thành tiền). Người nhận bỏ trống ⇒ tên nhà gia công. `supplier_id` luôn NULL.
  - `GET /api/accounting/gia-cong-cho-chi` (quyền `phieu_chi:read`) → `list[GiaCongChoChiOut]`: `{gia_cong_ngoai_id, lsx_id, lsx_ma, ten_viec, nha_cung_cap_id, nha_cung_cap_ten, sl_cuoi, don_vi, don_gia, thanh_tien, chot_luc, chot_boi_ten}`. Tiền là `None` khi không có `kho:view_cost`.
  - `GET /api/accounting/gia-cong-cho-chi/dem` → `{"so": int}` (badge).
  - `PaymentVoucherOut.gia_cong_ngoai_id: int | None`.
  - SSE: lập / huỷ phiếu nguồn gia công ⇒ broadcast `{"type": "gia_cong_cho_chi_changed"}` + `{"type": "gia_cong_ngoai_changed", "lsx_id"}`.
  - `cho_chi.hang_cho_chi(db, *, xem_tien: bool) -> list[dict]`, `cho_chi.dem_cho_chi(db) -> int`.

- [ ] **Step 1: Đồng bộ nhánh**

Phiên song song đang sửa bốn file accounting. Chạy `git status --short backend/app/services/accounting_service.py backend/app/repositories/accounting_repo.py backend/app/routers/accounting.py backend/app/schemas/accounting.py`. Có dòng `M` chưa commit của người khác thì DỪNG, báo người dùng, chờ phiên kia commit rồi mới sửa. Không stash.

- [ ] **Step 2: Viết test thất bại**

```python
# backend/tests/test_gia_cong_phieu_chi.py
"""Kế toán chi tiền gia công ngoài (spec 2026-09-26 §5): một lần ⇄ một phiếu chi, không 331."""
from __future__ import annotations

from datetime import date

import pytest

from app.models.gia_cong_ngoai import NOI_VE_XUONG, GiaCongNgoai
from app.repositories.accounting_repo import AccountingRepository
from app.services.gia_cong_ngoai.chot import chot, mo_lai
from app.services.gia_cong_ngoai.mot_phan import mang_di
from tests.gia_cong_fixtures import cv_ten, dung_lenh_gia_cong, giao_sang, ncc
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


@pytest.fixture
def h(client):
    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {tok.json()['access_token']}"}


@pytest.fixture
def lan_da_chot(sess, orders, lsx_svc, admin, customer) -> GiaCongNgoai:
    lsx_id = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"),
        ("Cán màng", "thue_ngoai", ncc(sess), 1660, "to"),
        ("Bế", "to", None, 1650, "to"),
    ])
    giao_sang(sess, admin, cv_ten(sess, lsx_id, "In"), cv_ten(sess, lsx_id, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=lsx_id).one()
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    sess.refresh(lan)
    chot(sess, user=admin, gcn_id=lan.id, expected_version=lan.version,
         sl_cuoi=1650, noi_ve=NOI_VE_XUONG)
    sess.refresh(lan)
    return lan


def _phieu(lan, **them):
    return {"source_type": "gia_cong_ngoai", "gia_cong_ngoai_id": lan.id, "voucher_type": "cash",
            "payment_stage": "other", "voucher_date": date.today().isoformat(),
            "amount": 825_000, "content": "Gia công cán màng", **them}


def test_hang_cho_chi_co_lan_da_chot(client, h, lan_da_chot):
    r = client.get("/api/accounting/gia-cong-cho-chi", headers=h)
    assert r.status_code == 200, r.text
    (d,) = r.json()
    assert d["gia_cong_ngoai_id"] == lan_da_chot.id and d["thanh_tien"] == 825_000
    assert d["nha_cung_cap_ten"] == "Cán màng Minh Long"
    assert client.get("/api/accounting/gia-cong-cho-chi/dem", headers=h).json() == {"so": 1}


def test_lap_phieu_chi_roi_het_cho_va_khong_vao_331(client, h, sess, lan_da_chot):
    r = client.post("/api/accounting/payment-vouchers", headers=h, json=_phieu(lan_da_chot))
    assert r.status_code == 201, r.text
    pc = r.json()
    assert pc["source_type"] == "gia_cong_ngoai" and pc["gia_cong_ngoai_id"] == lan_da_chot.id
    assert pc["amount"] == 825_000
    assert client.get("/api/accounting/gia-cong-cho-chi", headers=h).json() == []
    assert all(v.id != pc["id"] for v in AccountingRepository(sess).phieu_chi_cho_bao_cao())
    # Người nhận bỏ trống ⇒ tên nhà gia công
    assert pc["cash_recipient_name"] == "Cán màng Minh Long"


def test_mot_lan_chi_mot_phieu(client, h, lan_da_chot):
    assert client.post("/api/accounting/payment-vouchers", headers=h,
                       json=_phieu(lan_da_chot)).status_code == 201
    r = client.post("/api/accounting/payment-vouchers", headers=h, json=_phieu(lan_da_chot))
    assert r.status_code in (409, 422) and "đã có phiếu chi" in r.json()["detail"]


def test_lan_chua_chot_khong_lap_duoc(client, h, sess, lan_da_chot, admin):
    mo_lai(sess, user=admin, gcn_id=lan_da_chot.id, expected_version=lan_da_chot.version)
    r = client.post("/api/accounting/payment-vouchers", headers=h, json=_phieu(lan_da_chot))
    assert r.status_code == 422 and "chưa chốt" in r.json()["detail"]


def test_co_phieu_chi_thi_khong_mo_lai_huy_phieu_thi_cho_chi_lai(client, h, sess, admin,
                                                                   lan_da_chot):
    pc = client.post("/api/accounting/payment-vouchers", headers=h,
                     json=_phieu(lan_da_chot)).json()
    sess.refresh(lan_da_chot)
    with pytest.raises(ValueError, match="phiếu chi"):
        mo_lai(sess, user=admin, gcn_id=lan_da_chot.id, expected_version=lan_da_chot.version)
    r = client.post(f"/api/accounting/payment-vouchers/{pc['id']}/cancel", headers=h,
                    json={"reason": "Lập nhầm số"})
    assert r.status_code == 200, r.text
    assert len(client.get("/api/accounting/gia-cong-cho-chi", headers=h).json()) == 1
```

(Session của `client` và `sess` là hai phiên trên cùng DB: sau lời gọi API, `sess.refresh(...)` trước khi đọc lại.)

- [ ] **Step 3: Chạy test, phải FAIL**

Run: `python -m pytest backend/tests/test_gia_cong_phieu_chi.py -q`
Expected: FAIL — 404 ở `/api/accounting/gia-cong-cho-chi`.

- [ ] **Step 4: Repo — hàng chờ chi + loại khỏi 331**

`backend/app/repositories/gia_cong_ngoai_repo.py`:

```python
    def cho_chi(self) -> list[GiaCongNgoai]:
        """Lần ĐÃ CHỐT, chưa huỷ, chưa có phiếu chi còn hiệu lực — việc của kế toán (spec §5)."""
        song = select(PaymentVoucher.id).where(
            PaymentVoucher.gia_cong_ngoai_id == GiaCongNgoai.id,
            PaymentVoucher.status != PAYMENT_VOUCHER_CANCELLED)
        return list(self.db.scalars(
            select(GiaCongNgoai).where(
                GiaCongNgoai.chot_luc.is_not(None), GiaCongNgoai.huy_luc.is_(None),
                ~exists(song))
            .order_by(GiaCongNgoai.chot_luc, GiaCongNgoai.id)))
```

`backend/app/repositories/accounting_repo.py::phieu_chi_cho_bao_cao` — thêm điều kiện vào `.where(...)` (import `VOUCHER_SOURCE_GIA_CONG` từ `..models.accounting`):

```python
            .where(PaymentVoucher.status == PAYMENT_VOUCHER_PAID,
                   # Chi gia công ngoài KHÔNG vào công nợ 331 (spec gia công ngoài §5): tiền trả
                   # ngay khi chốt, không có đơn mua / hoá đơn treo nợ.
                   PaymentVoucher.source_type != VOUCHER_SOURCE_GIA_CONG)
```
và thêm một câu vào docstring: "Loại phiếu chi gia công ngoài — không phải công nợ NCC."

- [ ] **Step 5: Service đọc hàng chờ chi**

```python
# backend/app/services/gia_cong_ngoai/cho_chi.py
"""Hàng "Gia công chờ chi" của màn Phiếu chi (spec 2026-09-26 §5)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ...repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository
from ...repositories.san_xuat_repo import SanXuatRepository
from ..gio_xuong import thuc_te_hien_thi


def hang_cho_chi(db: Session, *, xem_tien: bool) -> list[dict]:
    repo = GiaCongNgoaiRepository(db)
    ds = repo.cho_chi()
    ten = repo.user_names({g.chot_boi_id for g in ds})
    sx = SanXuatRepository(db)
    ra = []
    for g in ds:
        lsx = sx.lsx(g.lsx_id)
        tien = (round(float(g.sl_cuoi) * float(g.don_gia), 0)
                if xem_tien and g.don_gia is not None else None)
        ra.append({
            "gia_cong_ngoai_id": g.id, "lsx_id": g.lsx_id, "lsx_ma": lsx.ma if lsx else "",
            "ten_viec": g.ten_viec, "nha_cung_cap_id": g.nha_cung_cap_id,
            "nha_cung_cap_ten": g.nha_cung_cap_ten, "sl_cuoi": float(g.sl_cuoi),
            "don_vi": g.don_vi, "don_gia": float(g.don_gia) if xem_tien and g.don_gia is not None
            else None,
            "thanh_tien": tien, "chot_luc": thuc_te_hien_thi(g.chot_luc),
            "chot_boi_ten": ten.get(g.chot_boi_id),
        })
    return ra


def dem_cho_chi(db: Session) -> int:
    return len(GiaCongNgoaiRepository(db).cho_chi())
```

- [ ] **Step 6: Service phiếu chi — nhánh nguồn gia công**

`backend/app/services/accounting_service.py`:
- import thêm `VOUCHER_SOURCE_GIA_CONG` (cùng khối import `VOUCHER_SOURCE_*` dòng ~33).
- `create_voucher`: thêm tham số `gia_cong_ngoai_id: int | None = None` và nhánh ĐẦU TIÊN:

```python
    def create_voucher(self, *, actor, purchase_request_id: int | None = None,
                       salary_advance_id: int | None = None,
                       gia_cong_ngoai_id: int | None = None, **values):
        source_type = (values.get("source_type") or VOUCHER_SOURCE_PURCHASE).strip()
        advance = None
        gia_cong = None
        if source_type == VOUCHER_SOURCE_GIA_CONG or gia_cong_ngoai_id is not None:
            purchase = None
            gia_cong = self._gia_cong_cho_phieu_chi(gia_cong_ngoai_id)
            prepared = self._prepare_standalone_voucher(values, gia_cong=gia_cong)
        elif source_type == VOUCHER_SOURCE_SALARY_ADVANCE or salary_advance_id is not None:
```
(các nhánh sau giữ nguyên; `elif` cũ của tạm ứng nay đứng sau nhánh gia công.)

- thêm ngay dưới `_advance_cho_phieu_chi`:

```python
    def _gia_cong_cho_phieu_chi(self, gia_cong_ngoai_id: int | None):
        """Lần gia công nguồn: phải ĐÃ CHỐT, chưa huỷ, chưa có phiếu chi còn hiệu lực. Khoá dòng để
        hai kế toán bấm cùng lúc không đẻ hai phiếu (index partial unique là chốt chặn cuối)."""
        from ..repositories.gia_cong_ngoai_repo import GiaCongNgoaiRepository

        if gia_cong_ngoai_id is None:
            raise AccountingValidationError("Phiếu chi gia công ngoài phải chọn lần gia công nguồn.")
        repo = GiaCongNgoaiRepository(self.repo.db)
        gcn = repo.khoa(int(gia_cong_ngoai_id))
        if gcn is None:
            raise AccountingNotFound("Không tìm thấy lần gia công.")
        if gcn.huy_luc is not None:
            raise AccountingValidationError("Lần gia công đã huỷ.")
        if gcn.chot_luc is None:
            raise AccountingValidationError("Lần gia công chưa chốt số — chưa chi được.")
        pc = repo.phieu_chi_song([gcn.id]).get(gcn.id)
        if pc is not None:
            raise AccountingConflict(f"Lần gia công này đã có phiếu chi {pc.code}.")
        return gcn
```

- `_prepare_standalone_voucher(self, values, *, advance=None, lo_tam_ung=None, gia_cong=None)` — thêm nhánh ĐẦU (trước `if lo_tam_ung:`), rồi đổi `if lo_tam_ung:` thành `elif lo_tam_ung:`:

```python
        if gia_cong is not None:
            # Số tiền kế toán GÕ (mặc định FE = SL chốt × đơn giá — thực tế hay có tiền lẻ, phí
            # xe). Người nhận bỏ trống ⇒ tên nhà gia công. KHÔNG gắn `supplier_id` (spec §5: không
            # công nợ 331 — `phieu_chi_cho_bao_cao` còn loại hẳn nguồn này).
            source_type = VOUCHER_SOURCE_GIA_CONG
            values = dict(values)
            if not (values.get("cash_recipient_name") or "").strip():
                values["cash_recipient_name"] = gia_cong.nha_cung_cap_ten
```
- ở `return {...}` của hàm: thêm khoá `"gia_cong_ngoai_id": gia_cong.id if gia_cong is not None else None,` và đổi `"source_code_snapshot"` thành:

```python
            "source_code_snapshot": (advance.code or f"TU#{advance.id}") if advance is not None
                                    else f"Lô {len(lo_tam_ung)} phiếu tạm ứng" if lo_tam_ung
                                    else self._ma_lenh_gia_cong(gia_cong) if gia_cong is not None
                                    else source_labels[source_type],
```
và thêm helper:

```python
    def _ma_lenh_gia_cong(self, gcn) -> str:
        from ..repositories.san_xuat_repo import SanXuatRepository

        lsx = SanXuatRepository(self.repo.db).lsx(gcn.lsx_id)
        return f"Gia công {lsx.ma if lsx else f'#{gcn.id}'}"[:32]  # cột String(32)
```
(`payment_vouchers.source_code_snapshot` là `String(32)` — `models/accounting.py:229`.)

- `create_voucher`: dòng audit `detail=f"{saved.code} <- ..."` giữ nguyên (nguồn in ra là `prepared['source_type']`).
- `_voucher_out`: thêm `"gia_cong_ngoai_id": row.gia_cong_ngoai_id,` ngay dưới `"salary_advance_id"`.

- [ ] **Step 7: Schema + router**

`backend/app/schemas/accounting.py`:
- `PaymentVoucherIn` thêm `gia_cong_ngoai_id: int | None = Field(default=None, gt=0)` (kèm chú thích "Lần gia công ngoài nguồn — spec 2026-09-26 §5").
- `PaymentVoucherOut` thêm `gia_cong_ngoai_id: int | None = None` dưới `salary_advance_id`.
- thêm:

```python
class GiaCongChoChiOut(BaseModel):
    gia_cong_ngoai_id: int
    lsx_id: int
    lsx_ma: str
    ten_viec: str
    nha_cung_cap_id: int | None = None
    nha_cung_cap_ten: str
    sl_cuoi: float
    don_vi: str | None = None
    don_gia: float | None = None
    thanh_tien: float | None = None
    chot_luc: datetime | None = None
    chot_boi_ten: str | None = None


class GiaCongChoChiDemOut(BaseModel):
    so: int
```

`backend/app/routers/accounting.py` (import `get_db`, `get_authorization_service`, `AuthorizationService` nếu chưa có — dò bằng `grep -n "^from ..deps import" backend/app/routers/accounting.py`; import `GiaCongChoChiOut`, `GiaCongChoChiDemOut`; `from ..services.gia_cong_ngoai import cho_chi as gc_cho_chi`):

```python
@router.get("/api/accounting/gia-cong-cho-chi", response_model=list[GiaCongChoChiOut])
def gia_cong_cho_chi(
    db: Annotated[Session, Depends(get_db)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
    user: Annotated[User, Depends(require_permission(MODULE_PC, "read"))],
):
    """Lần gia công ngoài đã chốt số, chưa có phiếu chi (spec gia công ngoài §5)."""
    return gc_cho_chi.hang_cho_chi(db, xem_tien=authz.can(user, "kho", "view_cost"))


@router.get("/api/accounting/gia-cong-cho-chi/dem", response_model=GiaCongChoChiDemOut)
def gia_cong_cho_chi_dem(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_permission(MODULE_PC, "read"))],
):
    return {"so": gc_cho_chi.dem_cho_chi(db)}
```
Đặt HAI route này TRƯỚC `@router.get("/api/accounting/payment-vouchers/{voucher_id}")` không bắt buộc (khác tiền tố), nhưng đặt cạnh khối phiếu chi cho dễ tìm.

Trong `create_payment_voucher` và `cancel_payment_voucher`, ngay trước `return PaymentVoucherOut(**row)` thêm:

```python
    if row.get("source_type") == "gia_cong_ngoai":
        # Hàng "Gia công chờ chi" + badge Phiếu chi + khối Gia công ngoài trên lệnh đổi ngay.
        hub.broadcast({"type": "gia_cong_cho_chi_changed"})
        hub.broadcast({"type": "gia_cong_ngoai_changed", "gia_cong_ngoai_id": row.get("gia_cong_ngoai_id")})
```
(FE nạp lại khối theo `gia_cong_ngoai_id` hoặc `lsx_id` — Task 13 bắt cả hai khoá.)

- [ ] **Step 8: Chạy test**

Run: `python -m pytest backend/tests/test_gia_cong_phieu_chi.py backend/tests/test_payment_vouchers.py backend/tests/test_bao_cao_cong_no.py -q`
Expected: PASS. (Tên hai file cũ: `ls backend/tests | grep -i "payment_voucher\|phieu_chi\|cong_no"` — chạy đúng file có thật.)

- [ ] **Step 9: Commit (khi người dùng cho phép)**

```bash
git add backend/app/services/accounting_service.py backend/app/schemas/accounting.py backend/app/repositories/accounting_repo.py backend/app/repositories/gia_cong_ngoai_repo.py backend/app/services/gia_cong_ngoai/cho_chi.py backend/app/routers/accounting.py backend/tests/test_gia_cong_phieu_chi.py
git commit -m "phieu_chi: nguồn Gia công ngoài + hàng chờ chi, không vào công nợ 331"
```

---

### Task 11 (CHỜ CHỦ DUYỆT — mặc định KHÔNG làm): Kế hoạch SX thấy tiền gia công

Seed hiện ghi "Chỉ vai này (+ GĐ) thấy giá" ở `app/seed.py:837`. Bật `kho.can_view_cost` cho vai Kế hoạch SX là MỞ RỘNG thẩm quyền. Ô này mở mọi con số tiền gác bằng nó, ở mọi màn vai đó đọc được, không riêng gia công. Không có task này thì người kế hoạch vẫn gõ được đơn giá ở ngăn bước và ở hộp trọn gói. Khối Gia công ngoài chỉ ẩn cột Đơn giá / Thành tiền với họ.

Chỉ làm khi người dùng nói rõ đồng ý:

**Files:** `backend/app/seed.py:508-540`, `backend/app/db_migrations.py` (mg `0341`), `backend/tests/test_gia_cong_quyen_tien.py`

- [ ] **Step 1: Test**

```python
# backend/tests/test_gia_cong_quyen_tien.py
from app.models.role import Role, RolePermission


def test_ke_hoach_sx_thay_gia_von(client, db_session=None):
    from tests.lenh_sx_fixtures import SessionLocal

    s = SessionLocal()
    role = s.query(Role).filter(Role.name == "Kế hoạch SX").one()
    rp = s.query(RolePermission).filter_by(role_id=role.id, module_key="kho").one()
    assert rp.can_view_cost is True and rp.can_read is False
    s.close()
```

- [ ] **Step 2: Seed** — trong dict quyền của "Kế hoạch SX" thêm:

```python
            # Gia công ngoài (spec 2026-09-26): người kế hoạch đặt giá với nhà gia công ⇒ thấy
            # Đơn giá / Thành tiền của lần. CHỈ ô giá vốn — không mở màn kho nào (can_read False).
            "kho": dict(can_read=False, can_create=False, can_update=False, can_delete=False,
                        scope=SCOPE_ALL, can_view_cost=True),
```

- [ ] **Step 3: Migration `0341_ke_hoach_sx_xem_gia`** (cuối `db_migrations.py`):

```python
def _migrate_ke_hoach_sx_xem_gia(db: Session) -> None:
    """0341 — vai "Kế hoạch SX" thấy tiền gia công ngoài: bật `kho.can_view_cost` (không mở màn kho).

    Idempotent: có dòng thì chỉ bật cờ đang tắt; chưa có thì đẻ dòng với mọi cờ khác tắt. Cột đời
    đầu `can_create`/`can_delete` NOT NULL không default — phải ghi tường minh (bài học mg 0334)."""
    insp = inspect(db.get_bind())
    if not {"roles", "role_permissions"} <= set(insp.get_table_names()):
        return
    cols = set(_existing_columns(insp, "role_permissions"))
    if "can_view_cost" not in cols:
        return
    role_id = db.execute(text("SELECT id FROM roles WHERE name = 'Kế hoạch SX'")).scalar()
    if role_id is None:
        return
    co = db.execute(text("SELECT id FROM role_permissions WHERE role_id = :r AND module_key = 'kho'"),
                    {"r": role_id}).scalar()
    if co is None:
        cot_scope, gt_scope = (", scope", ", 'all'") if "scope" in cols else ("", "")
        db.execute(text(
            "INSERT INTO role_permissions (module_key, role_id, can_read, can_create, can_update, "
            f"can_delete, can_view_cost{cot_scope}) VALUES ('kho', :r, false, false, false, false, "
            f"true{gt_scope})"), {"r": role_id})
    else:
        db.execute(text("UPDATE role_permissions SET can_view_cost = true "
                        "WHERE id = :i AND can_view_cost = false"), {"i": co})
    db.commit()


MIGRATIONS.append(("0341_ke_hoach_sx_xem_gia", _migrate_ke_hoach_sx_xem_gia))
```

- [ ] **Step 4: Chạy** `python -m pytest backend/tests/test_gia_cong_quyen_tien.py backend/tests/test_ma_tran_quyen_khop_thanh_ben.py -q` → PASS. (`can_read` False nên không mọc mục thanh bên.)

- [ ] **Step 5: Commit (khi người dùng cho phép)** — `git commit -m "quyen: Kế hoạch SX thấy tiền gia công ngoài (mg 0341)"`.

---

### Task 12: Ngăn bước "Thuê ngoài" — chọn Nhà gia công + đơn giá cả lần

**Files:**
- Create: `frontend/src/pages/gia-cong/giaCong.ts` (hàm `viTriTrongDai`)
- Create: `frontend/src/pages/gia-cong/giaCong.test.ts`
- Modify: `frontend/src/pages/LsxBuocDrawer.tsx` (import, prop `daiGiaCong`, `tabsList`, `doiLoaiBuoc`, tab Phân công, thẻ `NhaGiaCongCard` cuối file, chú thích dòng 32-35)
- Modify: `frontend/src/pages/LsxRoutingTable.tsx:1015` (truyền `daiGiaCong`)
- Modify: `frontend/src/api/client.ts:588` (hint của `LSX_LOAI_BUOC_META.thue_ngoai`)
- Modify: `backend/tests/test_khsx_ui_contract.py:147-168` (thay guard cũ)

**Interfaces:**
- Consumes: `api.giaCongNgoai.nhaGiaCong(token): Promise<NhaGiaCong[]>` và `NhaGiaCong { id; ten }` (Task 2). `EditRow.nha_cung_cap_id` / `nha_cung_cap` / `don_gia_gia_cong` và `toBody` gửi `nha_cung_cap_id` (Task 4).
- Produces:
  - `viTriTrongDai(rows: BuocDai[], i: number): ViTriDai | null`.
  - `BuocDai { ten: string; loai_buoc: LsxLoaiBuoc; nha_cung_cap_id: number | null }`.
  - `ViTriDai { truoc: string | null; sau: string | null; laCuoi: boolean }`.
  - `LsxBuocDrawer` nhận prop `daiGiaCong?: ViTriDai | null`.

- [ ] **Step 1: Test hàm thuần**

```ts
// frontend/src/pages/gia-cong/giaCong.test.ts
import { describe, expect, it } from "vitest";
import { viTriTrongDai, type BuocDai } from "./giaCong";

const b = (ten: string, loai: BuocDai["loai_buoc"], ncc: number | null = null): BuocDai => ({
  ten, loai_buoc: loai, nha_cung_cap_id: ncc,
});

describe("viTriTrongDai — cùng luật gom lần của máy chủ", () => {
  const rows = [
    b("In", "may"), b("Cán màng", "thue_ngoai", 7), b("Ép kim", "thue_ngoai", 7),
    b("Bế", "thue_ngoai", 9), b("Dán", "to"),
  ];
  it("bước không thuê ngoài thì null", () => {
    expect(viTriTrongDai(rows, 0)).toBeNull();
  });
  it("đầu dải: ô đơn giá nằm ở bước sau", () => {
    expect(viTriTrongDai(rows, 1)).toEqual({ truoc: null, sau: "Ép kim", laCuoi: false });
  });
  it("cuối dải cùng nhà gia công", () => {
    expect(viTriTrongDai(rows, 2)).toEqual({ truoc: "Cán màng", sau: null, laCuoi: true });
  });
  it("khác nhà gia công là lần khác", () => {
    expect(viTriTrongDai(rows, 3)).toEqual({ truoc: null, sau: null, laCuoi: true });
  });
  it("chưa chọn nhà gia công thì không gom", () => {
    const r2 = [b("A", "thue_ngoai"), b("B", "thue_ngoai")];
    expect(viTriTrongDai(r2, 0)).toEqual({ truoc: null, sau: null, laCuoi: true });
  });
});
```

- [ ] **Step 2: Chạy, phải FAIL**

Run (trong `frontend/`): `npx vitest run src/pages/gia-cong/giaCong.test.ts`
Expected: FAIL — `Failed to resolve import "./giaCong"`.

- [ ] **Step 3: Hàm thuần**

```ts
// frontend/src/pages/gia-cong/giaCong.ts
/** Hàm THUẦN của Gia công ngoài (spec docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md).
 *  Không gọi API, không React — vitest soi thẳng. */
import type { LsxLoaiBuoc } from "../../api/client";

/** Tối thiểu một bước cần có để suy dải — `EditRow` của bảng routing khớp kiểu này. */
export interface BuocDai {
  ten: string;
  loai_buoc: LsxLoaiBuoc;
  nha_cung_cap_id: number | null;
}

export interface ViTriDai {
  /** Tên bước liền trước CÙNG lần (null = bước này mở đầu lần). */
  truoc: string | null;
  /** Tên bước liền sau CÙNG lần (null = bước này là cuối lần). */
  sau: string | null;
  /** Bước cuối của lần — nơi khai đơn giá CẢ lần. */
  laCuoi: boolean;
}

function cungLan(a: BuocDai | undefined, c: BuocDai | undefined): boolean {
  return !!a && !!c && a.loai_buoc === "thue_ngoai" && c.loai_buoc === "thue_ngoai"
    && a.nha_cung_cap_id != null && a.nha_cung_cap_id === c.nha_cung_cap_id;
}

/** Vị trí của bước `i` trong DẢI gia công. Cùng luật với máy chủ lúc phát hành
 *  (`services/gia_cong_ngoai/lan.py::gom_lan_khi_phat_hanh`): các bước Thuê ngoài LIỀN NHAU
 *  theo thứ tự bảng, CÙNG nhà gia công ⇒ MỘT lần. `null` khi bước không phải thuê ngoài. */
export function viTriTrongDai(rows: BuocDai[], i: number): ViTriDai | null {
  const r = rows[i];
  if (!r || r.loai_buoc !== "thue_ngoai") return null;
  const truoc = cungLan(rows[i - 1], r) ? rows[i - 1].ten : null;
  const sau = cungLan(r, rows[i + 1]) ? rows[i + 1].ten : null;
  return { truoc, sau, laCuoi: sau == null };
}
```

- [ ] **Step 4: Chạy, phải PASS**

Run: `npx vitest run src/pages/gia-cong/giaCong.test.ts` — Expected: 5 passed.

- [ ] **Step 5: Guard hợp đồng UI (đổi trước, để nó FAIL)**

`backend/tests/test_khsx_ui_contract.py` — thay nguyên hàm `test_thue_ngoai_khong_co_o_nao_rieng_ngoai_buoc_may` bằng:

```python
def test_thue_ngoai_chon_nha_gia_cong_khong_to_may() -> None:
    """Bước THUÊ NGOÀI (spec gia công ngoài 2026-09-26 §7): chọn NHÀ GIA CÔNG từ danh mục Nhà cung
    cấp + đơn giá cả lần; không tổ, không máy, không vật tư. Sổ giao–nhận cũ đã gỡ hẳn cả ở server
    (Task 4) — việc mang đi / chốt số nằm ở khối Gia công ngoài trên lệnh, không ở bước."""
    drawer = DRAWER.read_text(encoding="utf-8")
    bang = ROUTING.read_text(encoding="utf-8")
    card = (DRAWER.parents[1] / "components" / "DagNodeCard.tsx").read_text(encoding="utf-8")

    for src in (drawer, bang, card):
        assert '"giao_nhan"' not in src
        assert "khsx-gn-badge" not in src
        assert "onGiaoNhan(" not in src
    assert 'LOAI_BUOC_ORDER: LsxLoaiBuoc[] = ["may", "to", "thue_ngoai"]' in drawer
    # Ô chọn đọc danh mục Nhà cung cấp tích "Nhận gia công", không gõ chữ tự do.
    assert "api.giaCongNgoai.nhaGiaCong" in drawer
    # Đổi sang thuê ngoài là dọn tổ / máy / vật tư ngay trong bản nháp.
    assert 'if (k === "thue_ngoai") {' in drawer
    # Ô đơn giá chỉ ở bước cuối lần — bảng cha suy dải cùng luật máy chủ.
    assert "viTriTrongDai(" in bang
```

Run: `python -m pytest backend/tests/test_khsx_ui_contract.py -q` — Expected: FAIL ở `api.giaCongNgoai.nhaGiaCong`.

- [ ] **Step 6: Drawer**

`frontend/src/pages/LsxBuocDrawer.tsx`:

(a) Import — dòng 13 đổi thành `import { ApiError, api, LSX_LOAI_BUOC_META, type LsxLoaiBuoc, type NhaGiaCong } from "../api/client";`. Thêm `import { useAuth } from "../auth/useAuth";` và `import type { ViTriDai } from "./gia-cong/giaCong";`.

(b) Chú thích dòng 32-35 ("Bước THUÊ NGOÀI nhập liệu Y HỆT bước máy …") thay bằng:

```ts
// Bước THUÊ NGOÀI (spec gia công ngoài 2026-09-26): nhà gia công lo máy, người, vật tư, thời gian.
// Drawer chỉ còn NHÀ GIA CÔNG (danh mục Nhà cung cấp tích "Nhận gia công") + ĐƠN GIÁ cả lần ở bước
// cuối dải. Mang đi / chốt số làm ở khối Gia công ngoài trên lệnh sau phát hành.
```

(c) Props — thêm vào destructure (sau `baiGhep,`) `daiGiaCong = null,` và vào kiểu (sau `baiGhep: …;`):

```ts
  /** Vị trí trong DẢI gia công (bảng cha suy bằng `viTriTrongDai`) — `null` khi không thuê ngoài. */
  daiGiaCong?: ViTriDai | null;
```

(d) `doiLoaiBuoc` thay nguyên thân:

```ts
  function doiLoaiBuoc(k: LsxLoaiBuoc) {
    if (k === "thue_ngoai") {
      // Gia công ngoài: không tổ, không máy, một lượt, không vật tư — nhà gia công lo. Dọn ngay
      // trong bản nháp để bảng không còn chip tổ/máy cũ; máy chủ cũng dọn khi lưu (Task 3).
      onPatch({
        loai_buoc: k, may_id: null, department_id: null, department_ten: null,
        so_luot_chay: "1", vat_tus: [],
      });
      return;
    }
    // Máy: giờ theo tốc độ máy. Tổ: giờ kế hoạch gõ tay (tab Thời gian).
    if (k === "may") {
      onPatch({ loai_buoc: k });
      return;
    }
    onPatch({
      loai_buoc: k,
      may_id: null,
      // Ô "số lượt qua máy" không hiện ở bước tổ (08/09/2026) — trả về 1 ngay lúc đổi loại, để
      // số 2 lượt của bước máy cũ không nằm lại vô hình trong bản nháp.
      so_luot_chay: "1",
    });
  }
```

(e) Ngay dưới `const meta = LSX_LOAI_BUOC_META[row.loai_buoc];` thêm `const ngoai = row.loai_buoc === "thue_ngoai";`. `tabsList` đổi thành:

```ts
  const tabsList = useMemo(() => {
    // Thuê ngoài: nhà gia công lo vật tư + thời gian ⇒ chỉ còn Cấu hình, Nhà gia công, Phụ thuộc.
    const list: { key: MainTab; label: string; badge?: number }[] = ngoai
      ? [
          { key: "cau_hinh", label: "Cấu hình & Số lượng" },
          { key: "phan_cong", label: "Nhà gia công" },
        ]
      : [
          { key: "cau_hinh", label: "Cấu hình & Số lượng" },
          { key: "phan_cong", label: "Phân công & Thiết bị" },
          { key: "vat_tu", label: "Vật tư", badge: row.vat_tus.length },
          { key: "tien_do", label: "Tiến độ & Thời gian" },
        ];
    // CUỐI hàng — badge đếm số bước tiền nhiệm đang chọn, đúng con số trước đây treo ở tab Tiến độ.
    list.push({ key: "phu_thuoc", label: "Phụ thuộc", badge: row.phu_thuoc_step_keys.length });
    return list;
  }, [ngoai, row.vat_tus.length, row.phu_thuoc_step_keys.length]);

  // Đang đứng ở tab vừa biến mất (đổi sang thuê ngoài, hoặc badge ngoài bảng mở thẳng tab đó).
  useEffect(() => {
    if (ngoai && (activeTab === "vat_tu" || activeTab === "tien_do")) setActiveTab("phan_cong");
  }, [ngoai, activeTab]);
```

(f) Tab Phân công — bọc thẻ `<section>` "Tổ sản xuất & Máy thiết bị" bằng `{!ngoai && ( … )}`. Ngay trước nó thêm:

```tsx
                  {ngoai && (
                    <NhaGiaCongCard
                      row={row}
                      dai={daiGiaCong}
                      canUpdate={canUpdate}
                      onPatch={onPatch}
                    />
                  )}
```

(g) Cuối file (sau `KhuonCuaBuoc`) thêm:

```tsx
/** Thẻ NHÀ GIA CÔNG của bước thuê ngoài (spec gia công ngoài §7). Nhà gia công = Nhà cung cấp tích
 *  "Nhận gia công" — không thêm nhanh ở đây, bên mua hàng tạo ở màn Nhà cung cấp. */
function NhaGiaCongCard({
  row,
  dai,
  canUpdate,
  onPatch,
}: {
  row: EditRow;
  dai: ViTriDai | null;
  canUpdate: boolean;
  onPatch: (p: Partial<EditRow>) => void;
}) {
  const { token } = useAuth();
  const [ds, setDs] = useState<NhaGiaCong[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let song = true;
    api.giaCongNgoai
      .nhaGiaCong(token)
      .then((r) => { if (song) setDs(r); })
      .catch((e: unknown) => { if (song) setLoi(e instanceof ApiError ? e.message : String(e)); });
    return () => { song = false; };
  }, [token]);
  // Nhà đã chọn nhưng nay bỏ tích / ngừng giao dịch vẫn phải HIỆN — không thì ô chọn trống trơn
  // trong khi bước vẫn trỏ tới họ, và bảng "còn thiếu" không nhắc (máy chủ giữ nguyên id).
  const mat = row.nha_cung_cap_id != null && ds != null
    && !ds.some((n) => n.id === row.nha_cung_cap_id);
  return (
    <section className="khsx-section-card">
      <div className="khsx-section-card__head">
        <h3 className="khsx-section-card__title">Nhà gia công</h3>
      </div>
      <div className="khsx-assign-grid">
        <label className="khsx-field">
          <span className="khsx-field__label">NHÀ GIA CÔNG</span>
          {loi ? (
            <span className="khsx-field__hint">{loi}</span>
          ) : (
            <select
              className="khsx-select-std"
              value={row.nha_cung_cap_id ?? ""}
              disabled={!canUpdate || ds == null}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                onPatch({
                  nha_cung_cap_id: id,
                  nha_cung_cap: ds?.find((n) => n.id === id)?.ten ?? "",
                });
              }}
            >
              <option value="">— chọn nhà gia công —</option>
              {mat && (
                <option value={row.nha_cung_cap_id ?? ""}>
                  {(row.nha_cung_cap || "Nhà đã chọn") + " (đã bỏ tích “Nhận gia công”)"}
                </option>
              )}
              {(ds ?? []).map((n) => (
                <option key={n.id} value={n.id}>{n.ten}</option>
              ))}
            </select>
          )}
          {ds != null && ds.length === 0 && (
            <span className="khsx-field__hint">
              Chưa có nhà cung cấp nào tích “Nhận gia công” — vào màn Nhà cung cấp tích ô đó cho
              nhà gia công rồi chọn lại ở đây.
            </span>
          )}
          {dai?.truoc && (
            <span className="khsx-field__hint">
              Đi chung một lần gia công với bước “{dai.truoc}”.
            </span>
          )}
        </label>
        {dai && !dai.laCuoi ? (
          <p className="khsx-field__hint">
            Đơn giá cả lần khai ở bước cuối của lần (“{dai.sau}”).
          </p>
        ) : (
          <label className="khsx-field">
            <span className="khsx-field__label">
              ĐƠN GIÁ CẢ LẦN (đ / {dvNhanChung(row.don_vi_ra)})
            </span>
            <input
              className="khsx-input-std"
              inputMode="decimal"
              value={row.don_gia_gia_cong}
              disabled={!canUpdate}
              onChange={(e) => onPatch({ don_gia_gia_cong: e.target.value })}
            />
            <span className="khsx-field__hint">
              Tiền gợi ý = số chốt cuối × đơn giá. Bỏ trống được — kế toán gõ số tiền thật lúc lập
              phiếu chi.
            </span>
          </label>
        )}
      </div>
    </section>
  );
}
```

(Nếu `EditRow` không có `department_ten` thì bỏ khoá đó khỏi `onPatch` ở bước (d) — `grep -n "department_ten" frontend/src/pages/lsxBuoc.ts`.)

- [ ] **Step 7: Bảng cha truyền vị trí dải**

`frontend/src/pages/LsxRoutingTable.tsx`: import `import { viTriTrongDai } from "./gia-cong/giaCong";` và trong `<LsxBuocDrawer …>` (dòng ~1015) thêm prop `daiGiaCong={viTriTrongDai(rows, moBuoc)}` ngay sau `baiGhep={baiGhep}`.

`frontend/src/api/client.ts:588` — hint của `thue_ngoai` đổi thành `"Nhà gia công ngoài làm — chọn nhà gia công trong danh mục Nhà cung cấp; không tổ, không máy, không vật tư, không tính thời gian"`.

- [ ] **Step 8: Chạy**

Run: `python -m pytest backend/tests/test_khsx_ui_contract.py -q` — Expected: PASS.
Run (trong `frontend/`): `npx tsc --noEmit` và `npx vitest run src/pages/gia-cong/giaCong.test.ts` — Expected: sạch / PASS.

- [ ] **Step 9: Commit (khi người dùng cho phép)**

```bash
git add frontend/src/pages/gia-cong frontend/src/pages/LsxBuocDrawer.tsx frontend/src/pages/LsxRoutingTable.tsx frontend/src/api/client.ts backend/tests/test_khsx_ui_contract.py
git commit -m "khsx: bước thuê ngoài chọn nhà gia công + đơn giá cả lần, bỏ tổ/máy/vật tư"
```

---

### Task 13: Khối "Gia công ngoài" trên hồ sơ lệnh — Mang đi / Chốt / Mở lại

**Files:**
- Modify: `frontend/src/api/client.ts` (kiểu `GiaCongNgoaiLan` + method trong `api.giaCongNgoai`)
- Modify: `frontend/src/pages/gia-cong/giaCong.ts` (+ `giaCong.test.ts`)
- Create: `frontend/src/pages/gia-cong/GiaCongNgoaiPanel.tsx`
- Create: `frontend/src/pages/gia-cong/giaCong.css`
- Modify: `frontend/src/pages/LsxDetailView.tsx:984-986` (gắn khối)

**Interfaces:**
- Consumes: `GET /api/gia-cong-ngoai/lenh/{lsx_id}` (Task 5), `POST /{id}/mang-di` (Task 6), `POST /{id}/chot` + `/mo-lai` (Task 7–8), `POST /{id}/huy-tron-goi` + `/xuat-giay` (Task 9). Dict lần = `GiaCongNgoaiOut` (Task 5 + `xuat_giay` Task 9).
- Produces:
  - TS `GiaCongNgoaiLan`, `GiaCongTrangThai`, `GiaCongNoiVe`.
  - `api.giaCongNgoai.cuaLenh / mangDi / chot / moLai / datTronGoi / huyTronGoi / xuatGiay`. Task 14 dùng `datTronGoi`.
  - Hàm thuần `NHAN_TRANG_THAI`, `NHAN_NOI_VE`, `nutCuaLan(l)`, `goiYChot(l)`, `tomTat(l, dvTen, xemTien)`.
  - `<GiaCongNgoaiPanel lsxId eventTick canUpdate onChanged />`.

- [ ] **Step 1: Kiểu + API**

`frontend/src/api/client.ts` — cạnh `interface NhaGiaCong` (Task 2) thêm:

```ts
export type GiaCongTrangThai = "cho_mang_di" | "dang_o_ngoai" | "dang_gia_cong" | "da_xong" | "da_huy";
export type GiaCongNoiVe = "xuong" | "kho" | "khach";

/** MỘT lần gia công ngoài (spec 2026-09-26). Tiền (`don_gia`, `thanh_tien`) là `null` khi người
 *  xem không có quyền xem tiền — máy chủ gác, màn chỉ hiện "—". */
export interface GiaCongNgoaiLan {
  id: number;
  lsx_id: number;
  lsx_ma: string;
  kieu: "mot_phan" | "tron_goi";
  trang_thai: GiaCongTrangThai;
  nha_cung_cap_id: number;
  nha_cung_cap_ten: string;
  ten_viec: string;
  don_vi: string | null;
  don_gia: number | null;
  thanh_tien: number | null;
  sl_dat: number | null;
  xuong_cap_giay: boolean;
  don_vi_gui: string | null;
  sl_cho_mang_di: number;
  co_buoc_truoc: boolean;
  mang_di_boi_ten: string | null;
  mang_di_luc: string | null;
  sl_gui: number | null;
  chot_boi_ten: string | null;
  chot_luc: string | null;
  sl_cuoi: number | null;
  noi_ve: GiaCongNoiVe | null;
  noi_ve_hop_le: GiaCongNoiVe[];
  chang_sau: { id: number; ten: string }[];
  huy_boi_ten: string | null;
  huy_luc: string | null;
  ly_do_huy: string | null;
  phieu_chi: { id: number; code: string } | null;
  xuat_giay: { id: number; ma: string; trang_thai: string } | null;
  lich_su: { luc: string | null; ai: string; viec: string; chi_tiet: string }[];
  version: number;
}
```

và trong namespace `giaCongNgoai` (sau `nhaGiaCong`):

```ts
    cuaLenh(token: string, lsxId: number): Promise<GiaCongNgoaiLan[]> {
      return authed<GiaCongNgoaiLan[]>(`/api/gia-cong-ngoai/lenh/${lsxId}`, token);
    },
    /** "Đã mang đi" — nhận MỌI bàn giao đang chờ của bước trước. `sl_gui` chỉ khi dải đứng đầu
     *  lệnh (không có bàn giao để nhận). */
    mangDi(token: string, id: number, body: { version: number; sl_gui?: number | null }): Promise<GiaCongNgoaiLan> {
      return authed<GiaCongNgoaiLan>(`/api/gia-cong-ngoai/${id}/mang-di`, token, {
        method: "POST", body: JSON.stringify(body),
      });
    },
    chot(
      token: string,
      id: number,
      body: { version: number; sl_cuoi: number; noi_ve: GiaCongNoiVe; dich_cong_viec_id?: number | null },
    ): Promise<GiaCongNgoaiLan> {
      return authed<GiaCongNgoaiLan>(`/api/gia-cong-ngoai/${id}/chot`, token, {
        method: "POST", body: JSON.stringify(body),
      });
    },
    moLai(token: string, id: number, version: number): Promise<GiaCongNgoaiLan> {
      return authed<GiaCongNgoaiLan>(`/api/gia-cong-ngoai/${id}/mo-lai`, token, {
        method: "POST", body: JSON.stringify({ version }),
      });
    },
    datTronGoi(
      token: string,
      lsxId: number,
      body: { nha_cung_cap_id: number; sl_dat: number; don_gia: number | null; xuong_cap_giay: boolean },
    ): Promise<GiaCongNgoaiLan> {
      return authed<GiaCongNgoaiLan>(`/api/gia-cong-ngoai/lenh/${lsxId}/tron-goi`, token, {
        method: "POST", body: JSON.stringify(body),
      });
    },
    huyTronGoi(token: string, id: number, body: { version: number; ly_do: string }): Promise<GiaCongNgoaiLan> {
      return authed<GiaCongNgoaiLan>(`/api/gia-cong-ngoai/${id}/huy-tron-goi`, token, {
        method: "POST", body: JSON.stringify(body),
      });
    },
    xuatGiay(token: string, id: number, version: number): Promise<GiaCongNgoaiLan> {
      return authed<GiaCongNgoaiLan>(`/api/gia-cong-ngoai/${id}/xuat-giay`, token, {
        method: "POST", body: JSON.stringify({ version }),
      });
    },
```

- [ ] **Step 2: Test hàm thuần (FAIL)**

Thêm vào `frontend/src/pages/gia-cong/giaCong.test.ts`:

```ts
import type { GiaCongNgoaiLan } from "../../api/client";
import { goiYChot, nutCuaLan, tomTat } from "./giaCong";

const lan = (p: Partial<GiaCongNgoaiLan>): GiaCongNgoaiLan => ({
  id: 1, lsx_id: 9, lsx_ma: "LSX-001", kieu: "mot_phan", trang_thai: "cho_mang_di",
  nha_cung_cap_id: 7, nha_cung_cap_ten: "Cán màng Minh Long", ten_viec: "Cán màng",
  don_vi: "to", don_gia: 150, thanh_tien: null, sl_dat: null, xuong_cap_giay: false,
  don_vi_gui: "to", sl_cho_mang_di: 0, co_buoc_truoc: true, mang_di_boi_ten: null,
  mang_di_luc: null, sl_gui: null, chot_boi_ten: null, chot_luc: null, sl_cuoi: null,
  noi_ve: null, noi_ve_hop_le: ["xuong"], chang_sau: [{ id: 31, ten: "Bế" }],
  huy_boi_ten: null, huy_luc: null, ly_do_huy: null, phieu_chi: null, xuat_giay: null,
  lich_su: [], version: 1, ...p,
});

describe("nutCuaLan", () => {
  it("chờ mang đi mà bước trước chưa giao thì chưa bấm được", () => {
    expect(nutCuaLan(lan({})).mangDi).toBe(false);
  });
  it("có hàng chờ thì bấm Đã mang đi", () => {
    expect(nutCuaLan(lan({ sl_cho_mang_di: 1660 })).mangDi).toBe(true);
  });
  it("dải đầu lệnh (không bước trước) thì gõ số mà mang đi", () => {
    expect(nutCuaLan(lan({ co_buoc_truoc: false })).mangDi).toBe(true);
  });
  it("đang ở ngoài thì chốt được, còn hàng mới về thì mang thêm được", () => {
    const n = nutCuaLan(lan({ trang_thai: "dang_o_ngoai", sl_gui: 1660, sl_cho_mang_di: 40 }));
    expect([n.chot, n.mangDi]).toEqual([true, true]);
  });
  it("đã xong có phiếu chi thì KHÔNG mở lại", () => {
    expect(nutCuaLan(lan({ trang_thai: "da_xong", phieu_chi: { id: 3, code: "PC-1" } })).moLai).toBe(false);
    expect(nutCuaLan(lan({ trang_thai: "da_xong" })).moLai).toBe(true);
  });
  it("trọn gói xưởng cấp giấy, chưa đề nghị ⇒ nút xuất giấy + huỷ", () => {
    const n = nutCuaLan(lan({ kieu: "tron_goi", trang_thai: "dang_gia_cong", xuong_cap_giay: true }));
    expect([n.xuatGiay, n.huyTronGoi, n.chot, n.mangDi]).toEqual([true, true, true, false]);
  });
});

describe("goiYChot", () => {
  it("điền sẵn số đã gửi, nơi về đầu tiên, bước sau duy nhất", () => {
    expect(goiYChot(lan({ trang_thai: "dang_o_ngoai", sl_gui: 1660 }))).toEqual({
      sl: "1660", noiVe: "xuong", dich: 31,
    });
  });
  it("trọn gói lấy số đặt", () => {
    expect(goiYChot(lan({ kieu: "tron_goi", sl_dat: 20000, noi_ve_hop_le: ["kho", "khach"], chang_sau: [] })))
      .toEqual({ sl: "20000", noiVe: "kho", dich: null });
  });
});

describe("tomTat", () => {
  it("một dòng đủ người, số, nơi về, tiền, phiếu chi", () => {
    const s = tomTat(
      lan({ trang_thai: "da_xong", mang_di_boi_ten: "Nguyễn A", sl_gui: 1660, chot_boi_ten: "Nguyễn A",
            sl_cuoi: 1650, noi_ve: "xuong", thanh_tien: 247500, phieu_chi: { id: 3, code: "PC-1" } }),
      () => "tờ",
    );
    expect(s).toBe("Nguyễn A mang đi 1.660 tờ · Nguyễn A chốt 1.650 tờ — về xưởng làm tiếp · 247.500đ · Phiếu chi PC-1");
  });
  it("không có quyền xem tiền thì không có đoạn tiền", () => {
    expect(tomTat(lan({ trang_thai: "da_xong", chot_boi_ten: "B", sl_cuoi: 5, noi_ve: "kho" }), () => "cái"))
      .toBe("B chốt 5 cái — nhập kho thành phẩm");
  });
});
```

Run: `npx vitest run src/pages/gia-cong/giaCong.test.ts` — Expected: FAIL (`nutCuaLan` chưa có).

- [ ] **Step 3: Hàm thuần**

Thêm vào `frontend/src/pages/gia-cong/giaCong.ts` (đổi dòng import thành `import type { GiaCongNgoaiLan, GiaCongNoiVe, GiaCongTrangThai, LsxLoaiBuoc } from "../../api/client";`):

```ts
export const NHAN_TRANG_THAI: Record<GiaCongTrangThai, string> = {
  cho_mang_di: "Chờ mang đi",
  dang_o_ngoai: "Đang ở nhà gia công",
  dang_gia_cong: "Đang gia công trọn gói",
  da_xong: "Đã xong",
  da_huy: "Đã huỷ",
};

export const NHAN_NOI_VE: Record<GiaCongNoiVe, string> = {
  xuong: "Về xưởng làm tiếp",
  kho: "Nhập kho thành phẩm",
  khach: "Giao thẳng cho khách",
};

export interface NutLan {
  mangDi: boolean;
  chot: boolean;
  moLai: boolean;
  xuatGiay: boolean;
  huyTronGoi: boolean;
}

/** Nút nào hiện với lần này — cùng các chốt chặn của máy chủ (Task 6–9), để người dùng không bấm
 *  vào một nút chắc chắn bị từ chối. Máy chủ vẫn là nơi quyết. */
export function nutCuaLan(l: GiaCongNgoaiLan): NutLan {
  const motPhan = l.kieu === "mot_phan";
  const conMo = l.trang_thai === "cho_mang_di" || l.trang_thai === "dang_o_ngoai";
  return {
    mangDi: motPhan && conMo
      && (l.sl_cho_mang_di > 0 || (l.trang_thai === "cho_mang_di" && !l.co_buoc_truoc)),
    chot: l.trang_thai === "dang_o_ngoai" || l.trang_thai === "dang_gia_cong",
    moLai: l.trang_thai === "da_xong" && l.phieu_chi == null,
    xuatGiay: l.kieu === "tron_goi" && l.trang_thai === "dang_gia_cong" && l.xuong_cap_giay
      && l.xuat_giay == null,
    huyTronGoi: l.kieu === "tron_goi" && l.trang_thai === "dang_gia_cong",
  };
}

/** Giá trị điền sẵn của mini-form Chốt — "hai click" (spec §7). */
export function goiYChot(l: GiaCongNgoaiLan): { sl: string; noiVe: GiaCongNoiVe | null; dich: number | null } {
  const sl = l.sl_gui ?? l.sl_dat;
  return {
    sl: sl != null ? String(sl) : "",
    noiVe: l.noi_ve_hop_le[0] ?? null,
    dich: l.chang_sau.length === 1 ? l.chang_sau[0].id : null,
  };
}

const so = (n: number) => n.toLocaleString("vi-VN");

/** Dòng tóm tắt sau khi xong (spec §7): "Nguyễn A mang đi 1.660 · Nguyễn A chốt 1.650 · 247.500đ".
 *  `dvTen` dịch mã đơn vị sang tên danh mục (không in thẳng mã). Không có quyền xem tiền thì
 *  `thanh_tien` là null ⇒ không có đoạn tiền. */
export function tomTat(l: GiaCongNgoaiLan, dvTen: (ma: string | null) => string): string {
  const phan: string[] = [];
  if (l.mang_di_boi_ten && l.sl_gui != null) {
    phan.push(`${l.mang_di_boi_ten} mang đi ${so(l.sl_gui)} ${dvTen(l.don_vi_gui)}`.trim());
  }
  if (l.chot_boi_ten && l.sl_cuoi != null) {
    const ve = l.noi_ve ? ` — ${NHAN_NOI_VE[l.noi_ve].toLowerCase()}` : "";
    phan.push(`${l.chot_boi_ten} chốt ${so(l.sl_cuoi)} ${dvTen(l.don_vi)}`.trim() + ve);
  }
  if (l.thanh_tien != null) phan.push(`${so(l.thanh_tien)}đ`);
  if (l.phieu_chi) phan.push(`Phiếu chi ${l.phieu_chi.code}`);
  return phan.join(" · ");
}
```

Run: `npx vitest run src/pages/gia-cong/giaCong.test.ts` — Expected: PASS.

- [ ] **Step 4: Khối trên lệnh**

```tsx
// frontend/src/pages/gia-cong/GiaCongNgoaiPanel.tsx
// Khối "Gia công ngoài" trên hồ sơ lệnh (spec 2026-09-26 §7). MỘT cửa ghi duy nhất của lần gia
// công: Đã mang đi · Chốt số · Mở lại · Đề nghị xuất giấy · Huỷ trọn gói. Bàn tổ / Xếp lịch / KCS
// chỉ nhìn. Tự nạp lại theo tick SSE — khối không có ô nhập dở dang nào ngoài mini-form đang mở,
// mà state của mini-form nằm riêng, nạp lại không xoá nó.
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  type GiaCongNgoaiLan,
  type GiaCongNoiVe,
} from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { nhanDonVi } from "../lsxBuoc";
import { NHAN_NOI_VE, NHAN_TRANG_THAI, goiYChot, nutCuaLan, tomTat } from "./giaCong";
import "./giaCong.css";

type FormChot = { sl: string; noiVe: GiaCongNoiVe | null; dich: number | null };

export function GiaCongNgoaiPanel({
  lsxId,
  eventTick = 0,
  canUpdate,
  onChanged,
}: {
  lsxId: number;
  eventTick?: number;
  canUpdate: boolean;
  /** Lệnh đổi trạng thái (huỷ trọn gói về Nháp, chốt về kho làm nhóm đóng…) — màn cha nạp lại. */
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [lans, setLans] = useState<GiaCongNgoaiLan[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [chot, setChot] = useState<Record<number, FormChot>>({});
  const [slGui, setSlGui] = useState<Record<number, string>>({});
  const [huy, setHuy] = useState<{ lan: GiaCongNgoaiLan; lyDo: string } | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.giaCongNgoai
      .cuaLenh(token, lsxId)
      .then(setLans)
      .catch((e: unknown) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [token, lsxId]);
  useEffect(() => load(), [load, eventTick]);

  async function chay(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    setErr(null);
    try {
      await fn();
      load();
      onChanged();
      return true;
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!lans || lans.length === 0) return err ? <div className="banner banner--error">{err}</div> : null;
  const dvTen = (ma: string | null) => (ma ? nhanDonVi(ma) : "");
  return (
    <section className="gcn" aria-label="Gia công ngoài">
      <h3 className="gcn__title">Gia công ngoài</h3>
      {err && <div className="banner banner--error" role="alert">{err}</div>}
      {lans.map((l) => {
        const nut = nutCuaLan(l);
        const f = chot[l.id];
        const dangBan = busy === l.id;
        return (
          <article key={l.id} className={`gcn__lan gcn__lan--${l.trang_thai}`}>
            <div className="gcn__head">
              <strong className="gcn__viec">{l.ten_viec}</strong>
              <span className="gcn__ncc">{l.nha_cung_cap_ten}</span>
              <span className={`gcn__tt gcn__tt--${l.trang_thai}`}>{NHAN_TRANG_THAI[l.trang_thai]}</span>
              {l.don_gia != null && (
                <span className="gcn__gia">
                  {l.don_gia.toLocaleString("vi-VN")}đ / {dvTen(l.don_vi)}
                </span>
              )}
            </div>

            {l.trang_thai === "cho_mang_di" && l.sl_cho_mang_di > 0 && (
              <p className="gcn__note">
                Bước trước đã bàn giao {l.sl_cho_mang_di.toLocaleString("vi-VN")} {dvTen(l.don_vi_gui)} — chờ mang đi.
              </p>
            )}
            {l.trang_thai === "cho_mang_di" && l.sl_cho_mang_di === 0 && l.co_buoc_truoc && (
              <p className="gcn__note">Chờ bước trước bàn giao hàng sang.</p>
            )}
            {l.trang_thai === "dang_o_ngoai" && l.sl_cho_mang_di > 0 && (
              <p className="gcn__note">
                Còn {l.sl_cho_mang_di.toLocaleString("vi-VN")} {dvTen(l.don_vi_gui)} mới bàn giao — mang thêm nếu đã đem đi.
              </p>
            )}
            {l.kieu === "tron_goi" && (
              <p className="gcn__note">
                {l.xuong_cap_giay ? "Xưởng cấp giấy" : "Nhà gia công tự lo giấy"}
                {l.xuat_giay ? ` · Đề nghị xuất giấy ${l.xuat_giay.ma}` : ""}
                {l.sl_dat != null ? ` · Đặt ${l.sl_dat.toLocaleString("vi-VN")} ${dvTen(l.don_vi)}` : ""}
              </p>
            )}
            {(l.trang_thai === "da_xong" || l.mang_di_boi_ten) && (
              <p className="gcn__tomtat">{tomTat(l, dvTen)}</p>
            )}
            {l.trang_thai === "da_huy" && (
              <p className="gcn__note">
                {l.huy_boi_ten ?? "—"} huỷ{l.ly_do_huy ? `: ${l.ly_do_huy}` : ""}
              </p>
            )}

            {canUpdate && (
              <div className="gcn__nut">
                {nut.mangDi && (
                  <>
                    {!l.co_buoc_truoc && l.trang_thai === "cho_mang_di" && (
                      <label className="gcn__o">
                        <span>Số mang đi ({dvTen(l.don_vi_gui)})</span>
                        <input
                          inputMode="decimal"
                          value={slGui[l.id] ?? ""}
                          onChange={(e) => setSlGui((m) => ({ ...m, [l.id]: e.target.value }))}
                        />
                      </label>
                    )}
                    <Button
                      variant="accent"
                      loading={dangBan}
                      onClick={() => chay(l.id, () => api.giaCongNgoai.mangDi(token!, l.id, {
                        version: l.version,
                        sl_gui: l.co_buoc_truoc ? null : Number(slGui[l.id] || 0) || null,
                      }))}
                    >
                      {l.trang_thai === "dang_o_ngoai" ? "Mang thêm" : "Đã mang đi"}
                    </Button>
                  </>
                )}
                {nut.chot && !f && (
                  <Button variant="accent" onClick={() => setChot((m) => ({ ...m, [l.id]: goiYChot(l) }))}>
                    Chốt số nhận về
                  </Button>
                )}
                {nut.xuatGiay && (
                  <Button
                    loading={dangBan}
                    onClick={() => chay(l.id, () => api.giaCongNgoai.xuatGiay(token!, l.id, l.version))}
                  >
                    Đề nghị xuất giấy
                  </Button>
                )}
                {nut.huyTronGoi && (
                  <Button variant="ghost" onClick={() => setHuy({ lan: l, lyDo: "" })}>
                    Huỷ gia công trọn gói
                  </Button>
                )}
                {nut.moLai && (
                  <Button
                    variant="ghost"
                    loading={dangBan}
                    onClick={() => chay(l.id, () => api.giaCongNgoai.moLai(token!, l.id, l.version))}
                  >
                    Mở lại
                  </Button>
                )}
              </div>
            )}

            {canUpdate && f && (
              <div className="gcn__form">
                <label className="gcn__o">
                  <span>Số nhận về ({dvTen(l.don_vi)})</span>
                  <input
                    inputMode="decimal"
                    value={f.sl}
                    autoFocus
                    onChange={(e) => setChot((m) => ({ ...m, [l.id]: { ...f, sl: e.target.value } }))}
                  />
                </label>
                <fieldset className="gcn__noive">
                  <legend>Hàng về đâu</legend>
                  {l.noi_ve_hop_le.map((nv) => (
                    <label key={nv}>
                      <input
                        type="radio"
                        name={`gcn-noive-${l.id}`}
                        checked={f.noiVe === nv}
                        onChange={() => setChot((m) => ({ ...m, [l.id]: { ...f, noiVe: nv } }))}
                      />
                      {NHAN_NOI_VE[nv]}
                    </label>
                  ))}
                </fieldset>
                {f.noiVe === "xuong" && l.chang_sau.length > 1 && (
                  <label className="gcn__o">
                    <span>Bước nhận hàng</span>
                    <select
                      value={f.dich ?? ""}
                      onChange={(e) => setChot((m) => ({
                        ...m, [l.id]: { ...f, dich: e.target.value ? Number(e.target.value) : null },
                      }))}
                    >
                      <option value="">— chọn bước —</option>
                      {l.chang_sau.map((c) => <option key={c.id} value={c.id}>{c.ten}</option>)}
                    </select>
                  </label>
                )}
                <div className="gcn__nut">
                  <Button
                    variant="accent"
                    loading={dangBan}
                    disabled={!(Number(f.sl) > 0) || !f.noiVe}
                    onClick={async () => {
                      const xong = await chay(l.id, () => api.giaCongNgoai.chot(token!, l.id, {
                        version: l.version, sl_cuoi: Number(f.sl), noi_ve: f.noiVe!,
                        dich_cong_viec_id: f.dich,
                      }));
                      if (xong) setChot((m) => { const n = { ...m }; delete n[l.id]; return n; });
                    }}
                  >
                    Chốt
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setChot((m) => { const n = { ...m }; delete n[l.id]; return n; })}
                  >
                    Thôi
                  </Button>
                </div>
              </div>
            )}

            {l.lich_su.length > 0 && (
              <details className="gcn__lichsu">
                <summary>Nhật ký ({l.lich_su.length})</summary>
                <ul>
                  {l.lich_su.map((h, i) => (
                    <li key={i}>
                      <span className="gcn__luc">
                        {h.luc ? new Date(h.luc).toLocaleString("vi-VN") : ""}
                      </span>{" "}
                      <b>{h.ai}</b> · {h.viec}{h.chi_tiet ? ` — ${h.chi_tiet}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        );
      })}

      <ConfirmDialog
        open={huy != null}
        title={`Huỷ gia công trọn gói — ${huy?.lan.lsx_ma ?? ""}?`}
        message="Lệnh về Nháp, gói phát hành thu hồi. Đề nghị xuất giấy chưa xuất sẽ huỷ theo."
        confirmLabel="Huỷ trọn gói"
        danger
        busy={huy != null && busy === huy.lan.id}
        confirmDisabled={(huy?.lyDo.trim().length ?? 0) < 3}
        onConfirm={async () => {
          if (!huy) return;
          const xong = await chay(huy.lan.id, () => api.giaCongNgoai.huyTronGoi(token!, huy.lan.id, {
            version: huy.lan.version, ly_do: huy.lyDo.trim(),
          }));
          if (xong) setHuy(null);
        }}
        onCancel={() => setHuy(null)}
      >
        <label className="gcn__o">
          <span>Lý do huỷ</span>
          <textarea
            rows={2}
            value={huy?.lyDo ?? ""}
            onChange={(e) => setHuy((h) => (h ? { ...h, lyDo: e.target.value } : h))}
          />
        </label>
      </ConfirmDialog>
    </section>
  );
}
```

(Kiểm tên prop của `Button` bằng `sed -n 1,40p frontend/src/components/Button.tsx` — plan dùng `variant` `"accent" | "ghost"` + `loading`, đang dùng ở `LsxRoutingTable.tsx:1001-1004` và `LsxDetailView.tsx:731`. `nhanDonVi` ở `pages/lsxBuoc.ts`, AppShell cũng import từ đó.)

- [ ] **Step 5: CSS (an toàn màn điện thoại)**

```css
/* frontend/src/pages/gia-cong/giaCong.css — khối Gia công ngoài trên hồ sơ lệnh.
   Luật màn hẹp (memory "sáu khuôn lỗi điện thoại"): mọi hàng flex-wrap, không bề rộng cứng, không
   ellipsis nuốt số, không thông tin chỉ hiện khi hover, cỡ chữ theo rem. */
.gcn {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0 0 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--rule-soft, #e3e3e3);
  border-radius: var(--r-3, 10px);
  background: var(--paper, #fff);
}
.gcn__title { margin: 0; font-size: 1rem; }
.gcn__lan {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--rule-soft, #e3e3e3);
  min-width: 0;
}
.gcn__lan:first-of-type { border-top: 0; padding-top: 0; }
.gcn__head, .gcn__nut, .gcn__form, .gcn__noive {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  min-width: 0;
}
.gcn__noive { border: 0; padding: 0; margin: 0; }
.gcn__noive legend { font-size: 0.8125rem; color: var(--ash, #666); margin-bottom: 0.25rem; }
.gcn__viec { overflow-wrap: anywhere; }
.gcn__ncc, .gcn__gia, .gcn__note, .gcn__luc { color: var(--ash, #666); font-size: 0.875rem; }
.gcn__note, .gcn__tomtat { margin: 0; overflow-wrap: anywhere; }
.gcn__tt {
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  background: var(--steel-soft, #eef2ff);
}
.gcn__tt--cho_mang_di { background: var(--amber-soft, #fff4e0); }
.gcn__tt--dang_o_ngoai, .gcn__tt--dang_gia_cong { background: var(--steel-soft, #e6f0ff); }
.gcn__tt--da_xong { background: var(--moss-soft, #e7f6ec); }
.gcn__tt--da_huy { background: var(--ash-2, #f2f2f2); text-decoration: line-through; }
.gcn__o { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; font-size: 0.875rem; }
.gcn__o input, .gcn__o select, .gcn__o textarea { min-width: 0; max-width: 100%; font-size: 1rem; }
.gcn__lichsu summary { cursor: pointer; font-size: 0.875rem; }
.gcn__lichsu ul { margin: 0.25rem 0 0; padding-left: 1rem; font-size: 0.8125rem; }
```

(Token màu lấy từ `frontend/src/styles/tokens.css`: `--rule-soft`, `--paper`, `--ash`, `--ash-2`, `--steel-soft`, `--amber-soft`, `--moss-soft`, `--r-3`. Nhìn màn thấy tông lệch thì đổi sang token gần nhất trong file đó, không đặt mã màu cứng mới.)

- [ ] **Step 6: Gắn vào hồ sơ lệnh**

`frontend/src/pages/LsxDetailView.tsx`: import `import { GiaCongNgoaiPanel } from "./gia-cong/GiaCongNgoaiPanel";`. Ngay sau `{err && <BangLoi text={err} onRetry={load} />}` (dòng ~985) thêm:

```tsx
      {/* Khối Gia công ngoài (spec 2026-09-26 §7) — hiện ở MỌI tab vì đây là việc hằng ngày của
          người kế hoạch sau phát hành; không có lần nào thì khối không vẽ gì. Nó TỰ nạp theo tick
          SSE (khác phần còn lại của màn chờ nút "Làm mới") — không có ô routing nào ở đây để mất. */}
      <GiaCongNgoaiPanel
        lsxId={lsxId}
        eventTick={eventTick}
        canUpdate={canUpdate}
        onChanged={() => { load(); onChanged(); }}
      />
```

- [ ] **Step 7: Chạy**

Run (trong `frontend/`): `npx tsc --noEmit` và `npx vitest run src/pages/gia-cong/giaCong.test.ts` — Expected: sạch / PASS.

- [ ] **Step 8: Commit (khi người dùng cho phép)**

```bash
git add frontend/src/api/client.ts frontend/src/pages/gia-cong frontend/src/pages/LsxDetailView.tsx
git commit -m "khsx: khối Gia công ngoài trên lệnh — mang đi, chốt số, mở lại"
```

---

### Task 14: Hộp "Gia công trọn gói" + lọc "Gia công ngoài" ở danh sách Kế hoạch SX

**Files:**
- Create: `frontend/src/pages/gia-cong/TronGoiDialog.tsx`
- Modify: `frontend/src/pages/LsxDetailView.tsx` (nút ở `khsx-detail__headnut` ~dòng 720 + hộp)
- Modify: `backend/app/repositories/gia_cong_ngoai_repo.py` (`LOC_GIA_CONG`, `lsx_ids_loc_gia_cong`)
- Modify: `backend/app/repositories/lsx_repo.py:31-69` (`_dieu_kien` nhận `gia_cong`)
- Modify: `backend/app/routers/lsx.py:176-215` (`list_items`, `bo_loc` nhận `gia_cong`)
- Modify: `frontend/src/api/client.ts:11829-11845` (`api.lsx.list` / `boLoc` nhận `gia_cong`)
- Modify: `frontend/src/pages/KeHoachSXPage.tsx` (state + ô lọc)
- Test: `backend/tests/test_gia_cong_loc_khsx.py`

**Interfaces:**
- Consumes: `api.giaCongNgoai.datTronGoi` (Task 13), `api.giaCongNgoai.nhaGiaCong` (Task 2), `dat_tron_goi` (Task 9), fixtures `lenh_chua_phat` / `dung_lenh_gia_cong` / `ncc` (Task 3).
- Produces:
  - `GET /api/lsx?gia_cong=cho_mang_di|dang_o_ngoai|tron_goi`, cùng luật với `trang_thai()` của lần.
  - `gia_cong_ngoai_repo.lsx_ids_loc_gia_cong(loai) -> Select`.
  - `<TronGoiDialog lsx open onClose onDone />`.

- [ ] **Step 1: Test lọc (FAIL)**

```python
# backend/tests/test_gia_cong_loc_khsx.py
"""Lọc "Gia công ngoài" ở danh sách Kế hoạch SX — lọc + đếm ở máy chủ (spec §7)."""
from __future__ import annotations

from app.models.gia_cong_ngoai import GiaCongNgoai
from app.services.gia_cong_ngoai.mot_phan import mang_di
from app.services.gia_cong_ngoai.tron_goi import dat_tron_goi
from tests.gia_cong_fixtures import (
    cv_ten, dung_lenh_gia_cong, giao_sang, lenh_chua_phat, ncc,
)
from tests.lenh_sx_fixtures import admin, customer, orders, lsx_svc, sess  # noqa: F401


def _ids(client, h, loai):
    r = client.get(f"/api/lsx?gia_cong={loai}", headers=h)
    assert r.status_code == 200, r.text
    return {x["id"] for x in r.json()["items"]}


def test_loc_gia_cong(client, sess, orders, lsx_svc, admin, customer):
    cho = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"), ("Cán màng", "thue_ngoai", ncc(sess), 1660, "to"),
        ("Bế", "to", None, 1650, "to"),
    ])
    ngoai = dung_lenh_gia_cong(sess, orders, lsx_svc, admin, customer, buoc=[
        ("In", "may", None, 1660, "to"), ("Cán màng", "thue_ngoai", ncc(sess, "GC B"), 1660, "to"),
        ("Bế", "to", None, 1650, "to"),
    ])
    giao_sang(sess, admin, cv_ten(sess, ngoai, "In"), cv_ten(sess, ngoai, "Cán màng"), 1660)
    lan = sess.query(GiaCongNgoai).filter_by(lsx_id=ngoai).one()
    mang_di(sess, user=admin, gcn_id=lan.id, expected_version=lan.version)
    tron = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)
    dat_tron_goi(sess, user=admin, lsx_id=tron.id, nha_cung_cap_id=ncc(sess, "GC C").id,
                 sl_dat=1000, don_gia=None, xuong_cap_giay=False)
    thuong = lenh_chua_phat(sess, orders, lsx_svc, admin, customer)

    tok = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
    assert _ids(client, h, "cho_mang_di") == {cho}
    assert _ids(client, h, "dang_o_ngoai") == {ngoai}
    assert _ids(client, h, "tron_goi") == {tron.id}
    assert thuong.id not in _ids(client, h, "cho_mang_di") | _ids(client, h, "tron_goi")
    assert client.get("/api/lsx?gia_cong=bay", headers=h).status_code == 422
```

Run: `python -m pytest backend/tests/test_gia_cong_loc_khsx.py -q` — Expected: FAIL (`gia_cong` bị bỏ qua ⇒ tập lớn hơn mong đợi).

- [ ] **Step 2: Repo + router**

`backend/app/repositories/gia_cong_ngoai_repo.py` — thêm hàm cấp module (import `KIEU_MOT_PHAN`, `KIEU_TRON_GOI` nếu chưa có):

```python
LOC_GIA_CONG = ("cho_mang_di", "dang_o_ngoai", "tron_goi")


def lsx_ids_loc_gia_cong(loai: str):
    """Subquery `lsx_id` cho ô lọc "Gia công ngoài" của danh sách Kế hoạch SX (spec §7). CÙNG luật
    với `services.gia_cong_ngoai.trang_thai()` nhưng viết bằng SQL — lọc + đếm ở máy chủ."""
    dk = [GiaCongNgoai.huy_luc.is_(None), GiaCongNgoai.chot_luc.is_(None)]
    if loai == "cho_mang_di":
        dk += [GiaCongNgoai.kieu == KIEU_MOT_PHAN, GiaCongNgoai.mang_di_luc.is_(None)]
    elif loai == "dang_o_ngoai":
        dk += [GiaCongNgoai.kieu == KIEU_MOT_PHAN, GiaCongNgoai.mang_di_luc.is_not(None)]
    elif loai == "tron_goi":
        dk.append(GiaCongNgoai.kieu == KIEU_TRON_GOI)
    else:
        raise ValueError(f"Bộ lọc gia công không hợp lệ: {loai}")
    return select(GiaCongNgoai.lsx_id).where(*dk)
```

`backend/app/repositories/lsx_repo.py::_dieu_kien` — thêm tham số `gia_cong: str | None = None,` (sau `owner_ids`), và trước `return conds`:

```python
        if gia_cong:
            # Ô lọc "Gia công ngoài" (spec gia công ngoài §7) — chờ mang đi / đang ở ngoài / trọn gói.
            from .gia_cong_ngoai_repo import lsx_ids_loc_gia_cong

            conds.append(Lsx.id.in_(lsx_ids_loc_gia_cong(gia_cong)))
```

`backend/app/routers/lsx.py`:
- `list_items`: thêm tham số `gia_cong: str | None = Query(default=None, pattern="^(cho_mang_di|dang_o_ngoai|tron_goi)$"),` và khoá `"gia_cong": gia_cong,` vào dict `loc`.
- `bo_loc`: thêm cùng tham số và truyền `gia_cong=gia_cong` vào `nguon_bo_loc(...)`.

Run: `python -m pytest backend/tests/test_gia_cong_loc_khsx.py backend/tests/test_lsx_api.py -q` — Expected: PASS. (Tên file bài danh sách lệnh cũ: `grep -rln "/api/lsx?" backend/tests | head` — chạy file có thật.)

- [ ] **Step 3: FE — API + ô lọc**

`frontend/src/api/client.ts` — `api.lsx.list`: kiểu `params` thêm `gia_cong?: string;` và thêm dòng `if (params.gia_cong) qs.set("gia_cong", params.gia_cong);`. Làm y hệt cho `api.lsx.boLoc`.

`frontend/src/pages/KeHoachSXPage.tsx`:
- cạnh `const [ttFilter, setTtFilter] = useState("all");` thêm `const [gcFilter, setGcFilter] = useState("");`
- `loadLenhs`: thêm `gia_cong: gcFilter || undefined,` vào params, thêm `gcFilter` vào mảng deps; `loadNguonLoc` cũng vậy.
- `useEffect(() => setPage(1), [ttFilter, q, orderFilter, khachFilter]);` thêm `gcFilter` vào deps.
- `<LenhTable …>` thêm `gcFilter={gcFilter}` và `onGcFilter={setGcFilter}`.
- `LenhTable`: destructure + kiểu thêm `gcFilter: string; onGcFilter: (v: string) => void;`. `coLoc` thêm `|| gcFilter !== ""`. Sau ô lọc "Đơn" (trước nút "Bỏ lọc") thêm:

```tsx
        <label className="khsx__filtersel">
          <span className="khsx__filtersel-label">Gia công ngoài</span>
          <select
            value={gcFilter}
            aria-label="Lọc theo gia công ngoài"
            onChange={(e) => onGcFilter(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="cho_mang_di">Chờ mang đi</option>
            <option value="dang_o_ngoai">Đang ở nhà gia công</option>
            <option value="tron_goi">Đang gia công trọn gói</option>
          </select>
        </label>
```
- nút "Bỏ lọc": điều kiện thành `(orderFilter || khachFilter || gcFilter)` và `onClick` thêm `onGcFilter("");`.

- [ ] **Step 4: Hộp trọn gói**

```tsx
// frontend/src/pages/gia-cong/TronGoiDialog.tsx
// Hộp "Gia công trọn gói" (spec 2026-09-26 §4) — thay cho phát hành: cả lệnh giao nhà gia công,
// không xuống bàn tổ, không vào Xếp lịch. Máy chủ chặn lệnh ghép cụm / đang có dòng xếp lịch.
import { useEffect, useState } from "react";
import { ApiError, api, type LsxDetail, type NhaGiaCong } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { nhanDonVi } from "../lsxBuoc";
import "./giaCong.css";

export function TronGoiDialog({
  lsx,
  open,
  onClose,
  onDone,
}: {
  lsx: LsxDetail;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const [ds, setDs] = useState<NhaGiaCong[] | null>(null);
  const [ncc, setNcc] = useState<number | "">("");
  const [sl, setSl] = useState(String(lsx.so_luong_dat ?? ""));
  const [gia, setGia] = useState("");
  const [capGiay, setCapGiay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    api.giaCongNgoai
      .nhaGiaCong(token)
      .then(setDs)
      .catch((e: unknown) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [open, token]);

  async function dat() {
    if (!token || ncc === "") return;
    setBusy(true);
    setErr(null);
    try {
      await api.giaCongNgoai.datTronGoi(token, lsx.id, {
        nha_cung_cap_id: ncc,
        sl_dat: Number(sl),
        don_gia: gia.trim() ? Number(gia) : null,
        xuong_cap_giay: capGiay,
      });
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const dv = nhanDonVi(lsx.don_vi_tinh);
  return (
    <ConfirmDialog
      open={open}
      title={`Gia công trọn gói — ${lsx.ma}`}
      confirmLabel="Đặt gia công trọn gói"
      busy={busy}
      error={err}
      confirmDisabled={ncc === "" || !(Number(sl) > 0) || (gia.trim() !== "" && !(Number(gia) >= 0))}
      onConfirm={dat}
      onCancel={onClose}
    >
      <div className="gcn__form gcn__form--cot">
        <p className="gcn__note">
          Cả lệnh giao cho nhà gia công: lệnh chuyển sang Đã phát hành với MỘT việc “Gia công trọn
          gói”, không xuống bàn tổ, không vào Xếp lịch. Nhận hàng về thì chốt số ở khối Gia công
          ngoài trên lệnh.
        </p>
        <label className="gcn__o">
          <span>Nhà gia công</span>
          <select
            value={ncc}
            onChange={(e) => setNcc(e.target.value ? Number(e.target.value) : "")}
            disabled={ds == null}
          >
            <option value="">— chọn nhà gia công —</option>
            {(ds ?? []).map((n) => <option key={n.id} value={n.id}>{n.ten}</option>)}
          </select>
          {ds != null && ds.length === 0 && (
            <span className="gcn__note">
              Chưa có nhà cung cấp nào tích “Nhận gia công” — vào màn Nhà cung cấp tích ô đó.
            </span>
          )}
        </label>
        <label className="gcn__o">
          <span>Số đặt ({dv})</span>
          <input inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} />
        </label>
        <label className="gcn__o">
          <span>Đơn giá (đ / {dv}) — bỏ trống được</span>
          <input inputMode="decimal" value={gia} onChange={(e) => setGia(e.target.value)} />
        </label>
        <label className="gcn__chk">
          <input type="checkbox" checked={capGiay} onChange={(e) => setCapGiay(e.target.checked)} />
          Xưởng cấp giấy (kho xuất giấy cho nhà gia công)
        </label>
      </div>
    </ConfirmDialog>
  );
}
```

Thêm vào `giaCong.css`:

```css
.gcn__form--cot { flex-direction: column; align-items: stretch; }
.gcn__chk { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.875rem; }
```

(Kiểu `LsxDetail` có `so_luong_dat: number; don_vi_tinh: string` ở `client.ts:2732`.)

- [ ] **Step 5: Nút trên hồ sơ lệnh**

`frontend/src/pages/LsxDetailView.tsx`:
- import `import { TronGoiDialog } from "./gia-cong/TronGoiDialog";`
- state cạnh `askDelete`: `const [moTronGoi, setMoTronGoi] = useState(false);`
- trong `<div className="khsx-detail__headnut">`, ngay sau nút "Làm mới", thêm:

```tsx
            {/* Gia công trọn gói thay cho phát hành (spec gia công ngoài §4) — chỉ lệnh CHƯA phát
                hành. Máy chủ chặn tiếp lệnh ghép cụm / đang có dòng xếp lịch và nói lý do. */}
            {canUpdate && ["nhap", "cho_bo_sung", "san_sang", "da_lap_ke_hoach"].includes(d.trang_thai) && (
              <Button variant="ghost" onClick={() => setMoTronGoi(true)}>
                <Icon name="truck" size={14} /> Gia công trọn gói
              </Button>
            )}
```
- cạnh `<ConfirmDialog open={askDelete} …/>` thêm:

```tsx
      {moTronGoi && (
        <TronGoiDialog
          lsx={d}
          open={moTronGoi}
          onClose={() => setMoTronGoi(false)}
          onDone={() => { setMoTronGoi(false); load(); onChanged(); }}
        />
      )}
```

(Icon `truck` có sẵn ở `components/Icons.tsx:124`.)

- [ ] **Step 6: Chạy**

Run: `python -m pytest backend/tests/test_gia_cong_loc_khsx.py -q` — PASS.
Run (trong `frontend/`): `npx tsc --noEmit` — sạch.

- [ ] **Step 7: Commit (khi người dùng cho phép)**

```bash
git add backend/app/repositories/gia_cong_ngoai_repo.py backend/app/repositories/lsx_repo.py backend/app/routers/lsx.py backend/tests/test_gia_cong_loc_khsx.py frontend/src/api/client.ts frontend/src/pages/KeHoachSXPage.tsx frontend/src/pages/LsxDetailView.tsx frontend/src/pages/gia-cong
git commit -m "khsx: hộp gia công trọn gói + lọc Gia công ngoài ở danh sách lệnh"
```

---

### Task 15: Phiếu chi — hàng "Gia công chờ chi" + hộp lập phiếu; thông báo tức thì

**Files:**
- Modify: `frontend/src/api/client.ts` (`PaymentVoucherSource`, `PaymentVoucherInput`, `PaymentVoucherRow`, `GiaCongChoChi`, `api.giaCongNgoai.choChi / demChoChi`, `QuoteEvent`)
- Modify: `frontend/src/pages/ke-toan/phieu-chi/shared/list-constants.ts` (`SOURCE_LABELS`)
- Create: `frontend/src/pages/ke-toan/phieu-chi/components/GiaCongChoChiStrip.tsx`
- Create: `frontend/src/pages/ke-toan/phieu-chi/modals/LapPhieuChiGiaCongModal.tsx`
- Modify: `frontend/src/pages/ke-toan/phieu-chi/PaymentVouchersPage.tsx` (gắn strip + hộp; câu mô tả đầu màn)
- Modify: `frontend/src/components/AppShell.tsx` (~871 toast "chờ mang đi"; nhánh `gia_cong_cho_chi*`; badge `ke-toan-phieu-chi` trong `reloadBadges`)

**Interfaces:**
- Consumes: `GET /api/accounting/gia-cong-cho-chi` + `/dem`, `POST /api/accounting/payment-vouchers` với `source_type: "gia_cong_ngoai"` (Task 10). SSE `gia_cong_cho_chi` (đích danh, Task 7) · `gia_cong_cho_chi_changed` (broadcast, Task 7/10) · `san_xuat_ban_giao` có `su_kien: "cho_mang_di"` + `lsx_ma` (Task 6).
- Produces: `GiaCongChoChi`, `api.giaCongNgoai.choChi(token)`, `api.giaCongNgoai.demChoChi(token)`, badge `"ke-toan-phieu-chi"`.

- [ ] **Step 1: Đồng bộ nhánh**

Phiên song song sửa `PaymentVouchersPage.tsx`. Chạy `git status --short frontend/src/pages/ke-toan/phieu-chi`. Có sửa chưa commit của người khác thì DỪNG, báo người dùng. Không stash.

- [ ] **Step 2: Kiểu + API**

`frontend/src/api/client.ts`:
- `PaymentVoucherSource` thêm nhánh:

```ts
  /** Phiếu chi lập TỪ một lần gia công ngoài đã chốt (26/09/2026). KHÔNG vào công nợ 331 — ô nhà
   *  cung cấp công nợ để trống, tên nhà gia công chỉ nằm ở người nhận. */
  | "gia_cong_ngoai"
```
- `PaymentVoucherInput` thêm `gia_cong_ngoai_id?: number | null;`; `PaymentVoucherRow` thêm `gia_cong_ngoai_id?: number | null;` (dưới `salary_advance_id`; để tuỳ chọn cho các fixture test dựng `PaymentVoucherRow` bằng tay khỏi vỡ `tsc`).
- cạnh `GiaCongNgoaiLan`:

```ts
/** Một dòng "Gia công chờ chi" — lần đã chốt, chưa có phiếu chi còn hiệu lực. Tiền `null` khi người
 *  xem không có quyền xem tiền. */
export interface GiaCongChoChi {
  gia_cong_ngoai_id: number;
  lsx_id: number;
  lsx_ma: string;
  ten_viec: string;
  nha_cung_cap_id: number | null;
  nha_cung_cap_ten: string;
  sl_cuoi: number;
  don_vi: string | null;
  don_gia: number | null;
  thanh_tien: number | null;
  chot_luc: string | null;
  chot_boi_ten: string | null;
}
```
- trong `api.giaCongNgoai`:

```ts
    choChi(token: string): Promise<GiaCongChoChi[]> {
      return authed<GiaCongChoChi[]>("/api/accounting/gia-cong-cho-chi", token);
    },
    demChoChi(token: string): Promise<{ so: number }> {
      return authed<{ so: number }>("/api/accounting/gia-cong-cho-chi/dem", token);
    },
```
- `QuoteEvent`: nhánh `san_xuat_ban_giao` thêm `lsx_ma?: string | null;`; thêm hai nhánh mới:

```ts
  // Gia công ngoài (spec 2026-09-26): lần vừa CHỐT ⇒ đẩy đích danh người lập phiếu chi (toast) +
  // broadcast `_changed` để badge Phiếu chi của mọi người nhảy; `gia_cong_ngoai_changed` để khối
  // Gia công ngoài / danh sách Kế hoạch SX đang mở tự nạp (qua tick chung).
  | {
      type: "gia_cong_cho_chi";
      gia_cong_ngoai_id: number;
      lsx_ma?: string | null;
      nha_cung_cap_ten?: string | null;
      ten_viec?: string | null;
    }
  | { type: "gia_cong_cho_chi_changed" }
  | { type: "gia_cong_ngoai_changed"; lsx_id?: number | null; gia_cong_ngoai_id?: number | null }
```

`frontend/src/pages/ke-toan/phieu-chi/shared/list-constants.ts` — `SOURCE_LABELS` thêm `gia_cong_ngoai: "Gia công ngoài",`.

- [ ] **Step 3: Hàng "Gia công chờ chi"**

```tsx
// frontend/src/pages/ke-toan/phieu-chi/components/GiaCongChoChiStrip.tsx
// Hàng "Gia công chờ chi" đầu màn Phiếu chi (spec gia công ngoài §5): lần đã chốt số, chưa có
// phiếu chi còn hiệu lực. Không có dòng nào thì không vẽ gì. Tự nạp theo tick SSE.
import { useEffect, useState } from "react";
import { ApiError, api, type GiaCongChoChi } from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { Button } from "../../../../components/Button";
import { nhanDonVi } from "../../../lsxBuoc";

export function GiaCongChoChiStrip({
  eventTick,
  canCreate,
  onLap,
}: {
  eventTick: number;
  canCreate: boolean;
  onLap: (row: GiaCongChoChi) => void;
}) {
  const { token } = useAuth();
  const [rows, setRows] = useState<GiaCongChoChi[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    api.giaCongNgoai
      .choChi(token)
      .then((r) => { setRows(r); setErr(null); })
      .catch((e: unknown) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [token, eventTick]);

  if (err) return <div className="banner banner--error">{err}</div>;
  if (rows.length === 0) return null;
  return (
    <section className="acct-gc-cho" aria-label="Gia công chờ chi">
      <h2 className="acct-gc-cho__title">Gia công chờ chi ({rows.length})</h2>
      <ul className="acct-gc-cho__list">
        {rows.map((r) => (
          <li key={r.gia_cong_ngoai_id} className="acct-gc-cho__row">
            <span className="acct-gc-cho__ncc">{r.nha_cung_cap_ten}</span>
            <span>{r.lsx_ma} · {r.ten_viec}</span>
            <span>
              {r.sl_cuoi.toLocaleString("vi-VN")} {r.don_vi ? nhanDonVi(r.don_vi) : ""}
              {r.thanh_tien != null ? ` · ${r.thanh_tien.toLocaleString("vi-VN")}đ` : ""}
            </span>
            <span className="acct-gc-cho__ai">
              {r.chot_boi_ten ?? ""}{r.chot_luc ? ` · ${new Date(r.chot_luc).toLocaleDateString("vi-VN")}` : ""}
            </span>
            {canCreate && (
              <Button variant="accent" onClick={() => onLap(r)}>Lập phiếu chi</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

CSS — cuối `frontend/src/pages/accounting.css` (khối `.acct-pc`):

```css
/* Hàng "Gia công chờ chi" (spec gia công ngoài §5) — flex-wrap, không bề rộng cứng (màn hẹp). */
.acct-pc .acct-gc-cho { margin: 0 0 1rem; padding: 0.75rem 1rem; border-radius: var(--r-3, 10px); background: var(--amber-soft, #fff8ec); }
.acct-pc .acct-gc-cho__title { margin: 0 0 0.5rem; font-size: 1rem; }
.acct-pc .acct-gc-cho__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.acct-pc .acct-gc-cho__row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 1rem; min-width: 0; }
.acct-pc .acct-gc-cho__row > span { overflow-wrap: anywhere; }
.acct-pc .acct-gc-cho__ncc { font-weight: 600; }
.acct-pc .acct-gc-cho__ai { color: var(--ash, #666); font-size: 0.875rem; }
```

- [ ] **Step 4: Hộp lập phiếu chi gia công**

Chép khuôn `pages/nhan-su-luong/luong/modals/LapPhieuChiModal.tsx` (tạm ứng lương). Khác ba chỗ: số tiền SỬA ĐƯỢC, người nhận sửa được, gửi `gia_cong_ngoai_id`.

```tsx
// frontend/src/pages/ke-toan/phieu-chi/modals/LapPhieuChiGiaCongModal.tsx
// Lập PHIẾU CHI từ một lần gia công ngoài đã chốt (spec 2026-09-26 §5) — khuôn của
// `LapPhieuChiModal` (tạm ứng lương). Khác: số tiền SỬA ĐƯỢC (con số trên lần chỉ là gợi ý, phiếu
// chi là số thật đã trả), người nhận sửa được (nhà gia công, hoặc người kế hoạch cầm tiền mặt đi
// trả). Không có ô nhà cung cấp công nợ — phiếu này không vào 331.
import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  type CompanyBankAccountRow,
  type GiaCongChoChi,
  type PaymentVoucherRow,
  type PaymentVoucherType,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { nhanDonVi } from "../../../lsxBuoc";
import "../../../nhan-su.css";
import "../../../luong.css";

const homNay = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD theo giờ máy

export function LapPhieuChiGiaCongModal({
  row,
  onClose,
  onDone,
}: {
  row: GiaCongChoChi;
  onClose: () => void;
  onDone: (pc: PaymentVoucherRow) => void;
}) {
  const { token } = useAuth();
  const ngayMax = homNay();
  const [vtype, setVtype] = useState<PaymentVoucherType>("cash");
  const [ngay, setNgay] = useState(ngayMax);
  const [soTien, setSoTien] = useState(row.thanh_tien != null ? String(row.thanh_tien) : "");
  const [nguoiNhan, setNguoiNhan] = useState(row.nha_cung_cap_ten);
  const [noiDung, setNoiDung] = useState(
    `Gia công ${row.ten_viec} — ${row.lsx_ma} — ${row.nha_cung_cap_ten}`,
  );
  const [ghiChu, setGhiChu] = useState("");
  const [diaChi, setDiaChi] = useState("");
  const [giayTo, setGiayTo] = useState("");
  const [tkCty, setTkCty] = useState<number | "">("");
  const [tkList, setTkList] = useState<CompanyBankAccountRow[]>([]);
  const [tkLoi, setTkLoi] = useState(false);
  const [thHolder, setThHolder] = useState(row.nha_cung_cap_ten);
  const [thSo, setThSo] = useState("");
  const [thNganHang, setThNganHang] = useState("");
  const [thChiNhanh, setThChiNhanh] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chuyenKhoan = vtype === "bank_transfer";

  // Chỉ nạp tài khoản công ty khi chọn chuyển khoản — API này đòi quyền Tài khoản ngân hàng.
  useEffect(() => {
    if (!chuyenKhoan || !token) return;
    let alive = true;
    api.accounting
      .companyAccounts(token, true, "pay")
      .then((rows) => {
        if (!alive) return;
        setTkList(rows);
        setTkLoi(false);
        if (rows.length === 1) setTkCty(rows[0].id);
      })
      .catch(() => {
        if (!alive) return;
        setTkList([]);
        setTkLoi(true);
      });
    return () => { alive = false; };
  }, [chuyenKhoan, token]);

  async function save() {
    if (!token) return;
    const tien = Math.round(Number(soTien));
    if (!(tien > 0)) return setErr("Số tiền chi phải lớn hơn 0.");
    if (!nguoiNhan.trim()) return setErr("Nhập người nhận tiền.");
    if (!noiDung.trim()) return setErr("Nhập nội dung chi.");
    if (ngay > ngayMax) return setErr("Ngày chứng từ không được ở tương lai.");
    if (chuyenKhoan && (tkCty === "" || !thHolder.trim() || !thSo.trim() || !thNganHang.trim())) {
      return setErr("Chuyển khoản phải có tài khoản trích nợ và đủ tên · số tài khoản · ngân hàng thụ hưởng.");
    }
    setBusy(true);
    setErr(null);
    try {
      const pc = await api.accounting.createVoucher(token, {
        source_type: "gia_cong_ngoai",
        gia_cong_ngoai_id: row.gia_cong_ngoai_id,
        voucher_type: vtype,
        payment_stage: "other",
        voucher_date: ngay,
        amount: tien,
        currency: "VND",
        exchange_rate: 1,
        content: noiDung.trim(),
        note: ghiChu.trim() || null,
        cash_recipient_name: nguoiNhan.trim(),
        cash_recipient_address: chuyenKhoan ? null : diaChi.trim() || null,
        cash_recipient_identity: chuyenKhoan ? null : giayTo.trim() || null,
        company_bank_account_id: chuyenKhoan ? Number(tkCty) : null,
        beneficiary_account_holder: chuyenKhoan ? thHolder.trim() : null,
        beneficiary_account_number: chuyenKhoan ? thSo.trim() : null,
        beneficiary_bank_name: chuyenKhoan ? thNganHang.trim() : null,
        beneficiary_bank_branch: chuyenKhoan ? thChiNhanh.trim() || null : null,
        bank_fee_bearer: chuyenKhoan ? "payer" : null,
      });
      onDone(pc);
    } catch (e) {
      // 409 (đã có phiếu chi) · 422 (chưa chốt / huỷ / thiếu ô) — câu tiếng Việt của máy chủ.
      setErr(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="ns-modal" role="dialog" aria-modal="true">
      <div className="ns-modal__box">
        <header className="ns-modal__head">
          <h2>Lập phiếu chi — gia công {row.lsx_ma}</h2>
          <button className="ns-modal__x" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        <div className="ns-modal__body lg-pc-body">
          {err && <div className="banner banner--error">{err}</div>}
          <div className="lg-pc-ro">
            <div className="lg-pc-ro__cell">
              <span className="lg-pc-ro__lbl">Nhà gia công</span>
              <b className="lg-pc-ro__val">{row.nha_cung_cap_ten}</b>
            </div>
            <div className="lg-pc-ro__cell">
              <span className="lg-pc-ro__lbl">Việc</span>
              <b className="lg-pc-ro__val">{row.ten_viec}</b>
            </div>
            <div className="lg-pc-ro__cell">
              <span className="lg-pc-ro__lbl">Số chốt</span>
              <b className="lg-pc-ro__val">
                {row.sl_cuoi.toLocaleString("vi-VN")} {row.don_vi ? nhanDonVi(row.don_vi) : ""}
              </b>
            </div>
          </div>
          <p className="lg-pc-hint">
            {row.thanh_tien != null
              ? `Số tiền điền sẵn = số chốt × đơn giá (${(row.don_gia ?? 0).toLocaleString("vi-VN")}đ). Sửa theo số thật đã trả.`
              : "Gõ số tiền thật đã trả cho nhà gia công."}
          </p>

          <div className="ns-grid">
            <label className="ns-field">
              <span className="ns-field__label">Số tiền (đ) *</span>
              <input inputMode="numeric" value={soTien} onChange={(e) => setSoTien(e.target.value)} />
            </label>
            <label className="ns-field">
              <span className="ns-field__label">Người nhận tiền *</span>
              <input value={nguoiNhan} onChange={(e) => setNguoiNhan(e.target.value)} />
            </label>
            <label className="ns-field">
              <span className="ns-field__label">Hình thức chi *</span>
              <select value={vtype} onChange={(e) => setVtype(e.target.value as PaymentVoucherType)}>
                <option value="cash">Tiền mặt</option>
                <option value="bank_transfer">Chuyển khoản</option>
              </select>
            </label>
            <label className="ns-field">
              <span className="ns-field__label">Ngày chứng từ *</span>
              <input type="date" max={ngayMax} value={ngay} onChange={(e) => setNgay(e.target.value)} />
            </label>
          </div>

          {chuyenKhoan && (
            <>
              {tkLoi && (
                <div className="banner banner--warn">
                  Không đọc được danh sách tài khoản công ty (thiếu quyền Tài khoản ngân hàng). Chọn
                  “Tiền mặt”, hoặc nhờ kế toán có quyền lập giúp.
                </div>
              )}
              <label className="ns-field">
                <span className="ns-field__label">Tài khoản trích nợ *</span>
                <select value={tkCty} onChange={(e) => setTkCty(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">— chọn tài khoản công ty —</option>
                  {tkList.map((t) => (
                    <option key={t.id} value={t.id}>{t.bank_name} · {t.account_number} · {t.currency}</option>
                  ))}
                </select>
              </label>
              <div className="ns-grid">
                <label className="ns-field">
                  <span className="ns-field__label">Chủ tài khoản nhận *</span>
                  <input value={thHolder} onChange={(e) => setThHolder(e.target.value)} />
                </label>
                <label className="ns-field">
                  <span className="ns-field__label">Số tài khoản nhận *</span>
                  <input inputMode="numeric" value={thSo} onChange={(e) => setThSo(e.target.value)} />
                </label>
                <label className="ns-field">
                  <span className="ns-field__label">Ngân hàng nhận *</span>
                  <input value={thNganHang} onChange={(e) => setThNganHang(e.target.value)} />
                </label>
                <label className="ns-field">
                  <span className="ns-field__label">Chi nhánh</span>
                  <input value={thChiNhanh} onChange={(e) => setThChiNhanh(e.target.value)} />
                </label>
              </div>
            </>
          )}
          {!chuyenKhoan && (
            <div className="ns-grid">
              <label className="ns-field">
                <span className="ns-field__label">Địa chỉ người nhận</span>
                <input value={diaChi} onChange={(e) => setDiaChi(e.target.value)} />
              </label>
              <label className="ns-field">
                <span className="ns-field__label">CCCD/Giấy tờ</span>
                <input value={giayTo} onChange={(e) => setGiayTo(e.target.value)} />
              </label>
            </div>
          )}
          <label className="ns-field">
            <span className="ns-field__label">Nội dung chi *</span>
            <input value={noiDung} onChange={(e) => setNoiDung(e.target.value)} />
          </label>
          <label className="ns-field">
            <span className="ns-field__label">Ghi chú</span>
            <input value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
          </label>
        </div>
        <footer className="ns-modal__foot">
          <span className="lg-pc-warn">
            Lập phiếu chi là tiền đã ra khỏi két. Lập xong không sửa được, chỉ huỷ được.
          </span>
          <div className="ns-modal__footright">
            <button className="btn btn--ghost" onClick={onClose} disabled={busy}>Hủy</button>
            <button className="btn btn--primary" onClick={save} disabled={busy}>
              {busy ? "Đang lập…" : "Lập phiếu chi"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Gắn vào màn Phiếu chi**

`frontend/src/pages/ke-toan/phieu-chi/PaymentVouchersPage.tsx`:
- import `type GiaCongChoChi` (thêm vào khối import `api/client`), `import { GiaCongChoChiStrip } from "./components/GiaCongChoChiStrip";`, `import { LapPhieuChiGiaCongModal } from "./modals/LapPhieuChiGiaCongModal";`
- state: `const [lapGc, setLapGc] = useState<GiaCongChoChi | null>(null);`
- câu `md-page__sub`: "nguồn chi có thể là Đơn mua hàng, chi phí nội bộ, hoàn tiền khách hàng hoặc khoản chi khác" đổi thành "nguồn chi có thể là Đơn mua hàng, gia công ngoài, chi phí nội bộ, hoàn tiền khách hàng hoặc khoản chi khác".
- ngay trước `<VouchersToolbar`:

```tsx
      <GiaCongChoChiStrip eventTick={eventTick} canCreate={canApprove} onLap={setLapGc} />
```
- cạnh `{standaloneOpen && (…)}`:

```tsx
      {lapGc && (
        <LapPhieuChiGiaCongModal
          row={lapGc}
          onClose={() => setLapGc(null)}
          onDone={(saved) => {
            setLapGc(null);
            setSelectedId(saved.id);
            load();
          }}
        />
      )}
```
(Hàng chờ tự rụng nhờ SSE `gia_cong_cho_chi_changed` bump tick → strip nạp lại.)

- [ ] **Step 6: AppShell — toast + badge**

`frontend/src/components/AppShell.tsx`:

(a) Trong nhánh `else if (e.type === "san_xuat_ban_giao") {` (~871), đổi dòng `if (e.su_kien === "xac_nhan") {` thành một nhánh MỚI đứng đầu chuỗi:

```tsx
        if (e.su_kien === "cho_mang_di") {
          // Bàn giao sang dải GIA CÔNG NGOÀI — máy chủ đẩy tới người có quyền sửa lệnh (Task 6).
          pushToast(
            `📦 ${e.nguon_ten || "Bước trước"} vừa giao${sl ? " " + sl : ""} sang “${e.dich_ten || "gia công ngoài"}”${e.lsx_ma ? ` (${e.lsx_ma})` : ""} — chờ mang đi gia công`,
            "info",
            9000,
          );
        } else if (e.su_kien === "xac_nhan") {
```
(`sl` là hằng đã tính ngay đầu nhánh; phần còn lại của chuỗi `else if` giữ nguyên. Kiểm chữ ký `pushToast(msg, tone, ms?)` ở `AppShell.tsx:258`.)

(b) Trước nhánh `} else if (readable.has("luong") && e.type === "advance_pending_changed") {` thêm:

```tsx
      } else if (
        readable.has("phieu_chi") &&
        (e.type === "gia_cong_cho_chi" || e.type === "gia_cong_cho_chi_changed")
      ) {
        if (e.type === "gia_cong_cho_chi") {
          pushToast(
            `💸 Gia công ${e.ten_viec ?? ""} — ${e.nha_cung_cap_ten ?? ""}${e.lsx_ma ? ` (${e.lsx_ma})` : ""} đã chốt số, chờ lập phiếu chi`,
            "info",
            9000,
          );
        }
        api.giaCongNgoai
          .demChoChi(token)
          .then((r) => setBadges((prev) => ({ ...prev, "ke-toan-phieu-chi": r.so })))
          .catch(() => {});
```

(c) `reloadBadges` — sau khối `cham_cong` thêm:

```tsx
    // Badge Phiếu chi: số lần GIA CÔNG NGOÀI đã chốt mà chưa lập phiếu chi (spec 2026-09-26 §6).
    // Treo ở mục Phiếu chi, KHÔNG dùng kênh `ke_toan` — kênh đó gắn màn Đơn mua hàng.
    if (readable.has("phieu_chi")) {
      api.giaCongNgoai
        .demChoChi(token)
        .then((r) => setBadges((prev) => ({ ...prev, "ke-toan-phieu-chi": r.so })))
        .catch(() => {});
    }
```

- [ ] **Step 7: Chạy**

Run (trong `frontend/`): `npx tsc --noEmit` — sạch.
Run: `npx vitest run src/pages/gia-cong` — PASS.

- [ ] **Step 8: Commit (khi người dùng cho phép)**

```bash
git add frontend/src/api/client.ts frontend/src/pages/ke-toan/phieu-chi frontend/src/pages/accounting.css frontend/src/components/AppShell.tsx
git commit -m "phieu_chi: hàng Gia công chờ chi + hộp lập phiếu chi gia công, toast và badge tức thì"
```

---

### Task 16: Xác minh UI thật trên dev-browser (BẮT BUỘC trước khi báo xong)

Không dùng API/curl thay bất kỳ bước nào, kể cả để dựng dữ liệu. Báo cáo liệt kê TỪNG bước: bấm gì, gõ gì, thấy gì. Bước nào buộc phải đi đường khác thì nói ngay trong báo cáo.

**Chuẩn bị:**
- Backend đã restart sau mọi sửa route/schema. Không có hot-reload tin được.
- Migration 0339 / 0340 (và 0341 nếu Task 11 được duyệt) đã chạy — xem log uvicorn lúc khởi động.
- Dev DB giữ `SEED_DEMO=false`.
- Dùng HAI phiên trình duyệt độc lập (hai instance dev-browser, tối đa 5):
  - Phiên A: tài khoản vai Kế hoạch SX, hoặc admin.
  - Phiên B: tài khoản tổ In, hoặc kế toán.
  - Toast đích danh loại trừ người bấm, nên một phiên duy nhất không thấy được toast.
  - Không mở được hai phiên thì ghi rõ trong báo cáo: "toast đích danh chưa xem bằng mắt".

**Luồng:**

- [ ] **1. Nhà gia công:**
  - Mua hàng › Nhà cung cấp › mở một NCC.
  - Tích "Nhận gia công" › Lưu.
  - Mở lại NCC đó. Thấy ô tích còn giữ.

- [ ] **2. Bước thuê ngoài (lệnh nháp In → Cán màng → Bế):**
  - Mở bước Cán màng.
  - Loại bước: bấm "Thuê ngoài". Thấy tab còn "Cấu hình & Số lượng / Nhà gia công / Phụ thuộc".
  - Tab Nhà gia công: chọn NCC vừa tích.
  - Gõ đơn giá 150.
  - Đóng ngăn, bấm "Lưu công đoạn".
  - Mở lại bước. Thấy NCC + đơn giá còn giữ; bảng "còn thiếu" không nhắc nhà gia công.
  - Thử thêm bước thuê ngoài thứ hai liền sau, cùng NCC:
    - bước đầu hiện "Đơn giá cả lần khai ở bước cuối…";
    - bước sau hiện "Đi chung một lần gia công với bước …".

- [ ] **3. Phát hành:** qua luồng phát hành hiện có (Xếp lịch 3 → phát hành). Hồ sơ lệnh hiện khối "Gia công ngoài": Cán màng · NCC · "Chờ mang đi" · "Chờ bước trước bàn giao hàng sang".

- [ ] **4. Bàn giao sang gia công:**
  - Phiên B (tổ In): ghi mẻ In.
  - Bàn giao 1.660 tờ sang Cán màng.
  - Phiên A: thấy toast "📦 … chờ mang đi gia công" không cần F5.
  - Khối trên lệnh tự hiện "Bước trước đã bàn giao 1.660 tờ".

- [ ] **5. Đã mang đi:**
  - Phiên A bấm "Đã mang đi".
  - Trạng thái đổi "Đang ở nhà gia công".
  - Dòng tóm tắt "‹tên› mang đi 1.660 tờ".
  - Mở Nhật ký của lần thấy dòng "Mang hàng đi gia công ngoài".

- [ ] **6. Chốt về xưởng:**
  - Bấm "Chốt số nhận về". Thấy số điền sẵn 1660 và nơi về "Về xưởng làm tiếp" đã chọn.
  - Sửa thành 1650 › "Chốt".
  - Trạng thái "Đã xong"; tóm tắt có "chốt 1.650 tờ — về xưởng làm tiếp" và tiền, nếu tài khoản có quyền xem tiền.
  - Phiên B (tổ Bế): thấy bàn giao 1.650 chờ xác nhận.

- [ ] **7. Phiếu chi:**
  - Phiên B đổi sang tài khoản kế toán.
  - Thấy toast "💸 … chờ lập phiếu chi", badge Phiếu chi = 1.
  - Vào Phiếu chi: hàng "Gia công chờ chi (1)".
  - Bấm "Lập phiếu chi". Thấy số tiền điền sẵn 247.500, người nhận = tên NCC, nội dung "Gia công Cán màng — LSX… — …".
  - Sửa số tiền 250.000 › "Lập phiếu chi".
  - Phiếu mới được chọn trong bảng, nguồn "Gia công ngoài".
  - Hàng chờ biến mất, badge về 0.
  - Mở Kế toán › Công nợ phải trả: không có phiếu này.

- [ ] **8. Mở lại bị chặn:**
  - Phiên A trên lệnh: không còn nút "Mở lại", vì đã có phiếu chi.
  - Huỷ phiếu chi (Phiếu chi › Hủy, gõ lý do). Thấy nút "Mở lại" hiện lại và hàng "Gia công chờ chi" có lại dòng.

- [ ] **9. Trọn gói + xưởng cấp giấy (lệnh nháp khác, có khai giấy ở bước):**
  - Bấm "Gia công trọn gói".
  - Chọn NCC. Số đặt điền sẵn = SL lệnh. Đơn giá 900.
  - Tích "Xưởng cấp giấy" › "Đặt gia công trọn gói".
  - Lệnh sang "Đã phát hành"; khối hiện "Đang gia công trọn gói · Xưởng cấp giấy".
  - Bấm "Đề nghị xuất giấy". Thấy "Đề nghị xuất giấy ‹mã›".
  - Kho › Yêu cầu xuất có đề nghị đó.
  - Kế hoạch vật tư của lệnh chỉ còn giấy.

- [ ] **10. Chốt trọn gói về kho:**
  - "Chốt số nhận về". Nơi về chọn "Nhập kho thành phẩm".
  - Gõ số › "Chốt".
  - Kho › Yêu cầu nhập có đề nghị nhập thành phẩm của lệnh.

- [ ] **11. Huỷ trọn gói (lệnh thứ ba, NCC lo giấy):**
  - "Gia công trọn gói" › Đặt.
  - "Huỷ gia công trọn gói", gõ lý do "Khách đổi mẫu" › xác nhận.
  - Lệnh về "Nháp"; khối hiện "Đã huỷ" kèm lý do.

- [ ] **12. Lọc danh sách:**
  - Kế hoạch SX: ô "Gia công ngoài" chọn lần lượt "Chờ mang đi" / "Đang ở nhà gia công" / "Đang gia công trọn gói".
  - Bảng chỉ còn đúng lệnh tương ứng; số trên tab trạng thái đổi theo.
  - "Bỏ lọc" xoá cả ô này.

- [ ] **13. Màn hẹp:** thu cửa sổ về bề rộng điện thoại (~390px). Kiểm:
  - khối Gia công ngoài, hộp trọn gói, hàng "Gia công chờ chi", hộp lập phiếu chi;
  - không tràn ngang, nút xuống dòng, số không bị cắt "…".

- [ ] **14. Báo cáo:**
  - Liệt kê 13 bước trên, mỗi bước gồm: đã bấm / gõ / thấy gì, kèm ảnh chụp ở bước 5, 6, 7, 9, 13.
  - Nêu mọi chỗ lệch spec và mọi bước không làm được bằng UI.

---

## Tự rà (người viết plan đã chạy)

- **Độ phủ spec:**

  | Spec | Task |
  |---|---|
  | §1–2 lần gia công / trạng thái dẫn xuất | 1, 5 |
  | §3 một phần | 3, 5, 6, 7, 8 |
  | §4 trọn gói | 9, 14 |
  | §5 phiếu chi, không 331 | 10, 15 |
  | §6 quyền / tiền / SSE / nhật ký | 5–10, 15 |
  | §6 KHSX xem tiền | Task 11, CHỜ DUYỆT |
  | §7 màn hình | 2, 12, 13, 14, 15 |
  | §8 lịch & thời lượng | 3, 4 |
  | §9 không làm | không task nào đụng |

- **Tên xuyên task:** các tên dưới đây khớp giữa backend `GiaCongNgoaiOut` và TS `GiaCongNgoaiLan`:
  - `gom_lan_khi_phat_hanh`, `huy_lan_cua_goi`, `lan_dict` / `lan_cua_lenh`, `noi_ve_hop_le`;
  - `mot_phan.mang_di`, `chot.chot` / `chot.mo_lai`;
  - `tron_goi.dat_tron_goi` / `huy_tron_goi` / `de_nghi_xuat_giay`;
  - `GiaCongNgoaiRepository.khoa / cong_viec_cua / ban_giao_cho_mang_di / yeu_cau_nhap_cua / yeu_cau_xuat_cua / tron_goi_dang_chay / cho_chi / phieu_chi_song`.
- **SSE:** các sự kiện dưới đây khớp giữa router (Task 6, 7, 10) và `QuoteEvent` (Task 15):
  - `gia_cong_ngoai_changed`
  - `gia_cong_cho_chi`
  - `gia_cong_cho_chi_changed`
  - `san_xuat_ban_giao.su_kien = "cho_mang_di"`
