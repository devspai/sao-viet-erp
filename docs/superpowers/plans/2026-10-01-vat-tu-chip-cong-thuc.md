# Vật tư có chip riêng + công thức giá/định mức, vật tư theo bước, gỡ logic khuôn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi vật tư tự khai chip riêng + công thức giá + công thức định mức; vật tư đi theo bước từ Công đoạn → Phiếu tính giá → Lệnh sản xuất; gỡ toàn bộ logic khuôn cũ (khuôn trở thành một vật tư thường).

**Architecture:** Thêm trước, đổi đường đi, gỡ sau — ứng dụng chạy được sau mỗi giai đoạn. Chip riêng là dữ liệu (bảng `vat_tu_chip`), không đưa vào từ điển biến tĩnh `bien_cong_thuc.py`; validator nhận chip qua tham số `bien_them`. Vật tư theo bước ở phiếu là bảng `phieu_buoc_vat_tu` (replace-all như mọi bảng con của phiếu); lệnh chép chip xuống `lsx_cong_doan_vat_tu.gia_tri_chip` lúc tạo lệnh và tự tính định mức bằng `vat_tu_in_an.cong_thuc_dinh_muc`.

**Tech Stack:** FastAPI + SQLAlchemy 2 (SQLite in-memory cho test, PostgreSQL cho dev/prod), pytest; React + TypeScript + Vite, vitest; không có Alembic (migration viết tay trong `backend/app/db_migrations.py`).

**Spec:** `docs/superpowers/specs/2026-10-01-vat-tu-chip-cong-thuc-design.md` (plan này CHỐT thêm các điểm mở của spec ở mục "Quyết định chốt trong plan" bên dưới; chỗ nào lệch spec thì plan thắng).

## Global Constraints

- UI toàn tiếng Việt, cấm chữ Anh lộ ra người dùng. Màn xưởng: nút to, số lớn.
- DB: KHÔNG có Alembic. Bảng mới do `create_all` dựng (model PHẢI import ở `backend/app/models/__init__.py`, kèm `__all__`); cột mới trên bảng cũ PHẢI có migration idempotent trong `db_migrations.py`. Số kế tiếp là `0357` (kiểm lại ngay trước khi merge — số có thể bị đánh lại khi gộp nhánh). Khoá thật là CẢ chuỗi id.
- Migration: không `PRAGMA` ở nhánh chung (test `test_migration_khong_dung_pragma` bắt); đọc hết siêu dữ liệu (`inspect`) TRƯỚC mọi `ALTER`; backfill bằng SQL thô đích danh cột, cấm ORM full-select; chạy lại lần hai phải no-op.
- Cột Boolean: `server_default` là `false`/`true` (Python bool hoặc `sa_false()`), KHÔNG `"0"`/`"1"`.
- Mọi FK trỏ `users.id` phải `ondelete="CASCADE"`; cột tên `may_id` không FK cứng.
- `docs/DB_SCHEMA.md`: mọi bảng/cột mới phải có mục `` ### `ten_bang` `` và tên cột xuất hiện trong mục đó (guard `backend/tests/test_schema_documented.py`).
- Pydantic nuốt field IM LẶNG: thêm field phải đi hết dict → schema In/Out → type TS. `PhieuTinhGiaOutRutGon` KHÔNG được thêm vật tư theo bước (vai thiếu `kho:view_cost` không được thấy giá).
- Tiền chỉ người có quyền xem: Out mới của plan này (`BuocVatTuOut`, `LsxBuocVatTuOut`) KHÔNG chứa số tiền, chỉ id + chip + định mức.
- Phân trang/lọc ở MÁY CHỦ; không cắt trang trong JS.
- Xác minh: KHÔNG chạy `./init.ps1`, KHÔNG chạy pytest cả bộ. Chạy pytest nhắm file (`python -m pytest backend/tests/<file>.py -q` từ gốc repo) + `cd frontend && npx tsc --noEmit` (~100 s) + `npx vitest run <file>`. Muốn chạy cả bộ thì hỏi trước.
- Task có UI: PHẢI thao tác lại đúng luồng bằng chuột/bàn phím thật trên trình duyệt dev (admin / admin123), KHÔNG dùng curl/API thay bước; báo cáo liệt kê từng bước đã bấm/gõ/thấy. Sửa route/schema backend → RESTART uvicorn (không tin hot-reload).
- Không dùng `python -c` trong `backend/` để thăm dò DB (trỏ thẳng Postgres dev). Thăm dò bằng test tạm hoặc gọi API.
- `SEED_DEMO=false` giữ nguyên; không bật lại trên DB dev có dữ liệu.
- Commit: message tiếng Việt, KHÔNG thêm dòng `Co-Authored-By`. Trước khi `git add`, chạy `git status` — làm việc trong worktree/nhánh riêng vì cây làm việc đang có thay đổi chưa commit của phiên khác; chỉ `git add` đúng file của Task.
- Ngoài phạm vi: hệ tính giá cũ `Operation`/`plate_die_rate`/`Estimate` (`has_tooling`, `tooling_rate_id`…) — mô hình riêng, KHÔNG đụng. "KhuonCalc / tính số khuôn từ số trang" ở `PhieuTinhGiaDetailView.tsx` là số BÀI IN, không phải khuôn dụng cụ — KHÔNG gỡ.

## Quyết định chốt trong plan (lệch/bổ sung spec)

1. **Bảng `phieu_buoc_vat_tu` KHÔNG có cột `nguon`** (không ai đọc — "vắng dòng = đã xoá" là đủ) và KHÔNG có `don_gia`/`so_luong` riêng (giá chỉ tính theo công thức; đơn giá cơ sở lấy từ `vat_tu_in_an.don_gia` như engine đang làm).
2. **Công thức giá của vật tư** dùng tập biến `LOAI_VAT_TU` (không đổi, 18 biến) + chip riêng + `don_gia_vat_tu`. **Công thức định mức** dùng tập `LOAI_QUY_DOI` (đã có `sl_vao`, `sl_ra`, `so_luot_chay`) + chip riêng. Không thêm `LOAI` mới ⇒ test khoá bộ biến chỉ đổi số khi gỡ ba biến khuôn.
3. **Chép từ công đoạn sang phiếu làm ở frontend** (`themCongDoan` → `addFin`): FE đã có `congDoans[*].vat_tus`. Server chỉ lưu những gì FE gửi.
4. **Phiếu cũ**: `phieu_vat_tu` (gắn thành phần) ngưng đọc/ghi, giữ bảng + class (không drop, quy ước dự án), KHÔNG backfill (dự án dev, chưa user thật). Ảnh chụp tái bản cũ mất vật tư cũ — chấp nhận.
5. **Lệnh**: vật tư khác chỉ lấy chip từ phiếu (UI chỉ đọc chip + định mức). Giấy giữ nguyên hành vi cũ. Dòng vật tư người kế hoạch thêm tay ở lệnh có chip = 0 (cảnh báo "chip chưa có số").
6. **Backfill định mức**: migration `0357` chép `cong_doan_vat_tu.cong_thuc_luong` sang `vat_tu_in_an.cong_thuc_dinh_muc` khi vật tư đó chỉ có ĐÚNG MỘT công thức khác rỗng; vật tư có ≥2 công thức khác nhau thì để trống (người dùng khai lại).
7. **Cột khuôn cũ giữ trong DB** (quy ước không drop) nhưng gỡ khỏi model; Task 8 kiểm trên Postgres dev rằng các cột NOT NULL có `DEFAULT` ở DB, thiếu thì thêm migration `SET DEFAULT`.
8. **Màn Khuôn & khung**: gỡ màn/route/sidebar/quyền; bảng `khuon_be` + class model + dữ liệu giữ nguyên. Migration `0359` xoá dòng `role_permissions` của `khuon_be` (theo tiền lệ mg 0330–0332).

## Cấu trúc file (khoá quyết định tách file)

| Việc | File mới | File sửa chính |
|---|---|---|
| Chip + định mức của vật tư (BE) | `backend/tests/test_vat_tu_chip.py`, `backend/tests/test_migration_0357_vat_tu_dinh_muc.py` | `models/vat_lieu_kho.py`, `schemas/vat_lieu_kho.py`, `repositories/vat_lieu_kho_repo.py`, `services/vat_lieu_kho_service.py`, `services/bien_cong_thuc.py`, `services/thanh_phan_engine.py` (chỉ `kiem_cong_thuc`), `services/nhat_ky_danh_muc.py`, `services/catalog_excel_specs.py`, `db_migrations.py`, `models/__init__.py` |
| Chip + định mức của vật tư (FE) | `frontend/src/pages/danh-muc/fields/VatTuChips.tsx` (+ test) | `danh-muc/types.ts`, `danh-muc/CatalogDrawer.tsx`, `danh-muc/fields/FormulaField.tsx`, `danh-muc/fields/index.ts`, `rebuildCatalogConfigs.tsx` (+ test) |
| Vật tư theo bước ở phiếu | `backend/tests/test_phieu_buoc_vat_tu.py`, `frontend/src/pages/BuocVatTu.tsx` (+ test) | `models/phieu_tinh_gia.py`, `schemas/phieu_tinh_gia.py`, `routers/phieu_tinh_gia.py`, `services/tinh_gia_service.py`, `services/thanh_phan_engine.py`, `services/san_pham_tai_ban_service.py`, `services/danh_muc_tham_chieu.py`, `PhieuTinhGiaDetailView.tsx`, `api/client.ts`, `tinh-gia.css` |
| Lệnh lấy vật tư từ phiếu | `backend/tests/test_lsx_vat_tu_tu_phieu.py` | `models/lsx.py`, `schemas/lsx.py`, `services/lsx_service.py`, `db_migrations.py`, `LsxBuocDrawer.tsx`, `lsxBuoc.ts`, `api/client.ts` |

---

## GIAI ĐOẠN A — THÊM MỚI (chưa phá cũ)

### Task 1: Vật tư — chip riêng + công thức định mức (backend)

**Files:**
- Modify: `backend/app/models/vat_lieu_kho.py` (class `VatTuInAn` ~121-190; thêm `VatTuChip`)
- Modify: `backend/app/models/__init__.py:95` (+ `__all__`)
- Modify: `backend/app/db_migrations.py` (cuối file, sau `0356_chot_giay_to_cat` dòng ~16605)
- Modify: `backend/app/services/bien_cong_thuc.py` (sau định nghĩa `BIEN`, ~dòng 204)
- Modify: `backend/app/services/thanh_phan_engine.py:310-345` (`kiem_cong_thuc`)
- Modify: `backend/app/schemas/vat_lieu_kho.py:88-115`
- Modify: `backend/app/repositories/vat_lieu_kho_repo.py:27-38`
- Modify: `backend/app/services/vat_lieu_kho_service.py` (`_O_CONG_THUC` ~41, `_validate` ~123-147, `_kiem_cong_thuc` ~149-163, `clone` ~244)
- Modify: `backend/app/services/nhat_ky_danh_muc.py` (`NHAN` ~42; hàm gom bảng con ~490-544)
- Modify: `backend/app/services/catalog_excel_specs.py:375-386` (`VAT_TU.loai_tru`)
- Modify: `docs/DB_SCHEMA.md` (mục `vat_tu_in_an` ~3338; thêm `vat_tu_chip` ngay sau)
- Test: `backend/tests/test_vat_tu_chip.py`, `backend/tests/test_migration_0357_vat_tu_dinh_muc.py`

**Interfaces:**
- Produces (backend, Task 2/3/5 dùng):
  - `app.services.bien_cong_thuc.ma_tu_ten_chip(ten: str) -> str`
  - `app.services.bien_cong_thuc.ma_chip_hop_le(ma: str) -> bool`
  - `app.services.thanh_phan_engine.kiem_cong_thuc(cong_thuc, *, nhan, loai=None, bien_them: Iterable[str] = ())`
  - `VatTuInAn.cong_thuc_dinh_muc: str | None`, `VatTuInAn.chips: list[VatTuChip]`
  - `VatTuChip(id, vat_tu_id, ma, ten, don_vi, thu_tu)`
  - API `/api/vat-lieu-kho/vat-tu-in-an` nhận/trả `cong_thuc_dinh_muc` và `chips: [{ma, ten, don_vi}]` (`chips` vắng trong PUT = không đụng).

- [ ] **Step 1: Viết test hàm sinh mã chip (fail)**

`backend/tests/test_vat_tu_chip.py`:

```python
from app.services.bien_cong_thuc import ma_chip_hop_le, ma_tu_ten_chip


def test_ma_tu_ten_bo_dau_va_snake_case():
    assert ma_tu_ten_chip("Định lượng support") == "dinh_luong_support"
    assert ma_tu_ten_chip("  Dài  support (mm) ") == "dai_support_mm"
    assert ma_tu_ten_chip("2 mặt") == "c_2_mat"
    assert ma_tu_ten_chip("!!!") == "chip"


def test_ma_hop_le_chan_trung_bien_he_thong_va_tu_khoa():
    assert ma_chip_hop_le("dai_support")
    assert not ma_chip_hop_le("so_mau")        # biến hệ thống
    assert not ma_chip_hop_le("dinh_luong")    # biến hệ thống của giấy
    assert not ma_chip_hop_le("in")            # từ khoá Python
    assert not ma_chip_hop_le("if")            # hàm
    assert not ma_chip_hop_le("Dai")           # chữ hoa
    assert not ma_chip_hop_le("2dai")          # bắt đầu bằng số
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `python -m pytest backend/tests/test_vat_tu_chip.py -q`
Expected: FAIL `ImportError: cannot import name 'ma_chip_hop_le'`

- [ ] **Step 3: Thêm hai hàm vào `bien_cong_thuc.py`**

Đầu file thêm `import keyword` và `import unicodedata` (file đã `import re`). Ngay sau định nghĩa `BIEN` (~dòng 204) thêm:

```python
# Tên hàm công thức — chip riêng của vật tư không được trùng, kẻo `if`/`max`… bị hiểu thành biến.
TEN_HAM_CAM = frozenset({"if", "if_", "ceil", "floor", "round", "max", "min", "abs"})


def ma_tu_ten_chip(ten: str) -> str:
    """Mã biến sinh từ tên chip: bỏ dấu, thường, ký tự lạ → `_`. `Định lượng support` → `dinh_luong_support`.

    Mã sinh MỘT lần lúc tạo chip rồi KHÔNG đổi theo tên (công thức đang trỏ vào mã)."""
    s = unicodedata.normalize("NFD", (ten or "").replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    if not s:
        return "chip"
    return f"c_{s}" if s[0].isdigit() else s


def ma_chip_hop_le(ma: str) -> bool:
    """Mã chip dùng được làm tên biến: snake_case, không trùng biến hệ thống / hàm / từ khoá Python."""
    return (
        bool(re.fullmatch(r"[a-z][a-z0-9_]*", ma or ""))
        and ma not in TEN_HAM_CAM
        and not keyword.iskeyword(ma)
        and ma not in {b["ma"] for b in BIEN}
    )
```

- [ ] **Step 4: Chạy lại, thấy pass**

Run: `python -m pytest backend/tests/test_vat_tu_chip.py -q`
Expected: 2 passed

- [ ] **Step 5: Test validator nhận biến bổ sung (fail)**

Thêm vào `test_vat_tu_chip.py`:

```python
import pytest

from app.services.bien_cong_thuc import LOAI_VAT_TU
from app.services.thanh_phan_engine import kiem_cong_thuc


def test_kiem_cong_thuc_nhan_bien_them_cho_dung_loai():
    kiem_cong_thuc("dai_support * rong_support", nhan="Công thức giá", loai=LOAI_VAT_TU,
                   bien_them=("dai_support", "rong_support"))
    with pytest.raises(ValueError):
        kiem_cong_thuc("dai_support * 2", nhan="Công thức giá", loai=LOAI_VAT_TU)
```

Run: `python -m pytest backend/tests/test_vat_tu_chip.py::test_kiem_cong_thuc_nhan_bien_them_cho_dung_loai -q` → FAIL `TypeError: unexpected keyword 'bien_them'`.

- [ ] **Step 6: Thêm `bien_them` vào `kiem_cong_thuc` (`thanh_phan_engine.py:310`)**

Đổi chữ ký và dòng dựng `bien`:

```python
def kiem_cong_thuc(cong_thuc: str | None, *, nhan: str, loai: str | None = None,
                   bien_them: Iterable[str] = ()) -> None:
    ...
    # dòng cũ: bien = dict.fromkeys(ma_hop_le(loai), 1.0) if loai else _MoiBienDeuCo()
    if loai:
        bien = {**dict.fromkeys(ma_hop_le(loai), 1.0), **dict.fromkeys(bien_them, 1.0)}
    else:
        bien = _MoiBienDeuCo()
```

(`Iterable` import từ `collections.abc` nếu file chưa có.) Chạy lại test Step 5 + `python -m pytest backend/tests/test_kiem_cong_thuc.py -q` → pass cả hai.

- [ ] **Step 7: Model — thêm cột + bảng chip**

`backend/app/models/vat_lieu_kho.py`, trong `VatTuInAn` (sau `cong_thuc_gia`, dòng ~139) thêm:

```python
    # CÔNG THỨC ĐỊNH MỨC (mg 0357, 01/10/2026) — "bước này tiêu hao bao nhiêu <ĐVT> vật tư này". Khác
    # `cong_thuc_gia` (ra TIỀN). Biến: bộ `LOAI_QUY_DOI` + chip riêng (`chips`). Trước 06/09/2026 từng
    # có ô cùng nghĩa (`cong_thuc_luong`, mg 0274 đã drop) rồi chuyển xuống dòng công đoạn × vật tư
    # (`cong_doan_vat_tu.cong_thuc_luong`, nay ngưng đọc) — nay về lại vật tư theo yêu cầu 01/10/2026.
    cong_thuc_dinh_muc: Mapped[str | None] = mapped_column(Text, nullable=True)
    # CHIP RIÊNG do người dùng đặt tên cho vật tư này, dùng làm biến trong hai công thức trên.
    chips: Mapped[list["VatTuChip"]] = relationship(
        "VatTuChip", back_populates="vat_tu", order_by="VatTuChip.thu_tu",
        cascade="all, delete-orphan",
    )
```

Cuối file thêm class (bổ sung import `ForeignKey`, `UniqueConstraint` nếu file chưa có):

```python
class VatTuChip(Base):
    """Một CHIP riêng của một vật tư (vd Support: "Dài support", "Rộng support").

    `ma` là tên biến trong công thức — sinh từ tên LÚC TẠO và KHÔNG đổi khi đổi tên chip (công thức
    đang trỏ vào mã). Số cụ thể của chip nhập ở phiếu tính giá, theo từng bước (`phieu_buoc_vat_tu`)."""

    __tablename__ = "vat_tu_chip"
    __table_args__ = (UniqueConstraint("vat_tu_id", "ma", name="uq_vat_tu_chip_ma"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vat_tu_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vat_tu_in_an.id", ondelete="CASCADE"), index=True, nullable=False
    )
    ma: Mapped[str] = mapped_column(String(40), nullable=False)
    ten: Mapped[str] = mapped_column(String(80), nullable=False)
    don_vi: Mapped[str | None] = mapped_column(String(24), nullable=True)
    thu_tu: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)

    vat_tu: Mapped["VatTuInAn"] = relationship("VatTuInAn", back_populates="chips")
```

`backend/app/models/__init__.py:95`: `from .vat_lieu_kho import GiayGiaVersion, GiayNguyen, VatTuChip, VatTuInAn` và thêm `"VatTuChip"` vào `__all__`.

- [ ] **Step 8: Migration `0357` + test migration (fail rồi pass)**

`backend/tests/test_migration_0357_vat_tu_dinh_muc.py` (khuôn 4 test của `test_migration_0269_go_khuon_ngay_du_kien.py`):

```python
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_vat_tu_cong_thuc_dinh_muc


def _db(*, co_cot: bool):
    engine = create_engine("sqlite+pysqlite:///:memory:")
    cot = "cong_thuc_dinh_muc TEXT, " if co_cot else ""
    with engine.begin() as cn:
        cn.execute(text(f"CREATE TABLE vat_tu_in_an (id INTEGER PRIMARY KEY, ma VARCHAR(30), {cot}ghi_chu TEXT)"))
        cn.execute(text(
            "CREATE TABLE cong_doan_vat_tu (id INTEGER PRIMARY KEY, cong_doan_id INTEGER, "
            "vat_tu_id INTEGER, cong_thuc_luong TEXT)"))
        cn.execute(text("INSERT INTO vat_tu_in_an (id, ma) VALUES (1,'A'),(2,'B'),(3,'C')"))
        # vật tư 1: một công thức duy nhất ở hai công đoạn → backfill
        cn.execute(text("INSERT INTO cong_doan_vat_tu (cong_doan_id, vat_tu_id, cong_thuc_luong) VALUES "
                        "(10,1,'sl_vao / 40000'),(11,1,'sl_vao / 40000'),"
                        # vật tư 2: hai công thức khác nhau → để trống
                        "(10,2,'so_mau * 0.3'),(11,2,'sl_vao'),"
                        # vật tư 3: chỉ rỗng → để trống
                        "(10,3,''),(11,3,NULL)"))
    return engine


def _chay(engine):
    with Session(engine) as db:
        _migrate_vat_tu_cong_thuc_dinh_muc(db)


def _lay(engine):
    with engine.begin() as cn:
        return dict(cn.execute(text("SELECT id, cong_thuc_dinh_muc FROM vat_tu_in_an")).all())


def test_them_cot_va_backfill_chi_khi_dung_mot_cong_thuc():
    engine = _db(co_cot=False)
    _chay(engine)
    assert "cong_thuc_dinh_muc" in {c["name"] for c in inspect(engine).get_columns("vat_tu_in_an")}
    assert _lay(engine) == {1: "sl_vao / 40000", 2: None, 3: None}


def test_chay_lai_la_no_op_va_khong_de_cong_thuc_da_sua():
    engine = _db(co_cot=False)
    _chay(engine)
    with engine.begin() as cn:
        cn.execute(text("UPDATE vat_tu_in_an SET cong_thuc_dinh_muc = 'sl_ra' WHERE id = 1"))
    _chay(engine)
    assert _lay(engine)[1] == "sl_ra"


def test_db_da_co_cot_thi_khong_nem():
    engine = _db(co_cot=True)
    _chay(engine)
    assert _lay(engine)[1] == "sl_vao / 40000"


def test_db_chua_co_bang_thi_bo_qua():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    _chay(engine)
    assert set(inspect(engine).get_table_names()) == set()


def test_da_dang_ky_trong_danh_sach():
    assert "0357_vat_tu_cong_thuc_dinh_muc" in [m for m, _ in MIGRATIONS]
```

Run → FAIL (import). Thêm cuối `db_migrations.py` (sau dòng `MIGRATIONS.append(("0356_chot_giay_to_cat", ...))`, cách hai dòng trống):

```python
def _migrate_vat_tu_cong_thuc_dinh_muc(db: Session) -> None:
    """0357 — cột CÔNG THỨC ĐỊNH MỨC trên vật tư (spec 2026-10-01 Đ2).

    Bảng `vat_tu_chip` do `create_all` dựng (chạy trước chuỗi migration). Ở đây: (1) thêm cột nếu thiếu,
    (2) backfill từ `cong_doan_vat_tu.cong_thuc_luong` khi vật tư đó chỉ có ĐÚNG MỘT công thức khác
    rỗng — vật tư có ≥2 công thức khác nhau thì để trống (không đoán). Chỉ điền ô còn trống nên chạy
    lại không đè công thức người dùng đã sửa. SQL thô đích danh cột."""
    insp = inspect(db.get_bind())
    bang = set(insp.get_table_names())
    if "vat_tu_in_an" not in bang:
        return
    if "cong_thuc_dinh_muc" not in _existing_columns(insp, "vat_tu_in_an"):
        db.execute(text("ALTER TABLE vat_tu_in_an ADD COLUMN cong_thuc_dinh_muc TEXT"))
    if "cong_doan_vat_tu" in bang:
        co_ct = "cv.vat_tu_id = vat_tu_in_an.id AND cv.cong_thuc_luong IS NOT NULL AND TRIM(cv.cong_thuc_luong) <> ''"
        db.execute(text(
            "UPDATE vat_tu_in_an SET cong_thuc_dinh_muc = ("
            f"SELECT MIN(cv.cong_thuc_luong) FROM cong_doan_vat_tu cv WHERE {co_ct}) "
            "WHERE (cong_thuc_dinh_muc IS NULL OR TRIM(cong_thuc_dinh_muc) = '') AND ("
            f"SELECT COUNT(DISTINCT cv.cong_thuc_luong) FROM cong_doan_vat_tu cv WHERE {co_ct}) = 1"
        ))
    db.commit()


MIGRATIONS.append(("0357_vat_tu_cong_thuc_dinh_muc", _migrate_vat_tu_cong_thuc_dinh_muc))
```

Chạy: `python -m pytest backend/tests/test_migration_0357_vat_tu_dinh_muc.py backend/tests/test_migration_khong_dung_pragma.py -q` → pass.

- [ ] **Step 9: Schema In/Row**

`backend/app/schemas/vat_lieu_kho.py` (mượn khuôn `CongDoanVatTuIn/Row` ở `schemas/cong_doan.py:9-27`). Thêm trước `VatTuIn`:

```python
class VatTuChipIn(BaseModel):
    ma: str | None = None            # vắng = máy sinh từ `ten`; có = chip cũ, GIỮ mã (công thức trỏ vào)
    ten: str = Field(min_length=1, max_length=80)
    don_vi: str | None = Field(default=None, max_length=24)


class VatTuChipRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ma: str
    ten: str
    don_vi: str | None = None
```

Trong `VatTuIn` thêm `cong_thuc_dinh_muc: str | None = None` và `chips: list[VatTuChipIn] | None = None` (None/vắng = không đụng). Trong `VatTuRow` thêm `cong_thuc_dinh_muc: str | None = None` và `chips: list[VatTuChipRow] = Field(default_factory=list)`.

- [ ] **Step 10: Repo — lưu chip + nạp sẵn**

`backend/app/repositories/vat_lieu_kho_repo.py`, trong `_VatTuRepo`: thêm `"cong_thuc_dinh_muc"` vào `fields`; thêm (mirror `cong_doan_repo._base_select` L36-44, `_sau_gan` L118-122, `_replace_vat_tu` L167-184):

```python
    def _base_select(self):
        return super()._base_select().options(selectinload(VatTuInAn.chips))

    def _sau_gan(self, obj, data) -> None:
        if "chips" in data:
            self._replace_chips(obj, data["chips"] or [])

    def _replace_chips(self, obj, chips: list[dict]) -> None:
        obj.chips.clear()
        self.db.flush()            # xoá trước khi chèn lại: UNIQUE (vat_tu_id, ma)
        for i, c in enumerate(chips):
            obj.chips.append(VatTuChip(ma=c["ma"], ten=c["ten"], don_vi=c.get("don_vi"), thu_tu=i))
```

(import `selectinload` từ `sqlalchemy.orm`, `VatTuChip` từ model.) Nếu `CatalogRepo` gọi `self._sau_gan` với chữ ký khác, theo chữ ký thật ở `repositories/catalog_base.py:180`.

- [ ] **Step 11: Service — validate chip, công thức, clone**

`backend/app/services/vat_lieu_kho_service.py`:

(a) `_O_CONG_THUC["vat_tu"]` (dòng ~41-44) thành hai ô (import `LOAI_QUY_DOI`):

```python
    "vat_tu": (
        ("cong_thuc_gia", "Công thức tính giá", LOAI_VAT_TU),
        ("cong_thuc_dinh_muc", "Công thức định mức", LOAI_QUY_DOI),
    ),
```

(b) Thêm hàm module-level:

```python
_MAX_CHIP = 12


def _chuan_chips(chips_in: list) -> list[dict]:
    """Chuẩn hoá chip vào: giữ `ma` đã có, sinh `ma` cho dòng mới, chặn trùng/không hợp lệ."""
    if len(chips_in) > _MAX_CHIP:
        raise VatLieuKhoValidationError(f"Tối đa {_MAX_CHIP} chip cho một vật tư.")
    ra: list[dict] = []
    da_dung: set[str] = set()
    for c in chips_in:
        c = c if isinstance(c, dict) else c.model_dump()
        ten = (c.get("ten") or "").strip()
        if not ten:
            raise VatLieuKhoValidationError("Chip chưa có tên.")
        ma = (c.get("ma") or "").strip() or ma_tu_ten_chip(ten)
        if not ma_chip_hop_le(ma):
            raise VatLieuKhoValidationError(
                f"Chip '{ten}': mã biến '{ma}' trùng biến có sẵn của hệ thống hoặc không hợp lệ — đổi tên chip.")
        if ma in da_dung:
            raise VatLieuKhoValidationError(f"Hai chip cùng mã biến '{ma}' — đổi tên một trong hai.")
        da_dung.add(ma)
        ra.append({"ma": ma, "ten": ten, "don_vi": (c.get("don_vi") or "").strip() or None})
    return ra
```

(c) `_kiem_cong_thuc` đổi thành (giữ vòng lặp cũ, chỉ thêm `chips_ma` và `bien_them`):

```python
    @staticmethod
    def _kiem_cong_thuc(kind, data, chips_ma=()):
        for cot, nhan_o, loai in _O_CONG_THUC.get(kind, ()):
            if cot not in data:
                continue
            try:
                kiem_cong_thuc(data.get(cot), nhan=nhan_o, loai=loai, bien_them=chips_ma)
            except ValueError as e:
                raise VatLieuKhoValidationError(str(e)) from e
```

(giữ nguyên cách bắt/đổi lỗi đang có ở L149-163 nếu khác) và thêm:

```python
    def _kiem_chip_va_cong_thuc(self, kind, data, obj=None):
        """Vật tư: chuẩn hoá chip rồi kiểm công thức với tập biến = hệ thống ∪ chip của chính vật tư.
        Đổi bộ chip thì soi lại cả công thức ĐANG LƯU — xoá một chip mà công thức còn dùng thì bị chặn."""
        if kind != "vat_tu":
            return self._kiem_cong_thuc(kind, data)
        if "chips" in data:
            data["chips"] = _chuan_chips(list(data["chips"] or []))
            ma = [c["ma"] for c in data["chips"]]
        else:
            ma = [c.ma for c in (obj.chips if obj is not None else [])]
        kiem = dict(data)
        if obj is not None and "chips" in data:
            for cot, _nhan, _loai in _O_CONG_THUC["vat_tu"]:
                kiem.setdefault(cot, getattr(obj, cot, None))
        self._kiem_cong_thuc(kind, kiem, ma)
```

(d) Trong `_validate` (L123-147) thay lời gọi cuối `self._kiem_cong_thuc(kind, data)` bằng `self._kiem_chip_va_cong_thuc(kind, data, obj)`.

(e) `clone` (L244-251): sau `data = nk.anh_chup(goc)` thêm cho vật tư:

```python
        if kind == "vat_tu":
            data["chips"] = [{"ma": c.ma, "ten": c.ten, "don_vi": c.don_vi} for c in goc.chips]
```

- [ ] **Step 12: Test API (fail → pass)**

Thêm vào `test_vat_tu_chip.py`:

```python
from tests.test_danh_muc_http_contract import _admin

URL = "/api/vat-lieu-kho/vat-tu-in-an"
BA_CHIP = [
    {"ten": "Định lượng support", "don_vi": "g/m2"},
    {"ten": "Dài support", "don_vi": "mm"},
    {"ten": "Rộng support", "don_vi": "mm"},
]
CT_GIA = "dinh_luong_support * dai_support * rong_support"


def _tao(client, h, ma="ZZSUP1", **kw):
    return client.post(URL, json={"ma": ma, "ten": "ZZ Support", **kw}, headers=h)


def test_tao_sinh_ma_chip_tu_ten_va_nhan_hai_cong_thuc(client):
    h = _admin(client)
    r = _tao(client, h, chips=BA_CHIP, cong_thuc_gia=CT_GIA, cong_thuc_dinh_muc="dai_support * rong_support / 1000000")
    assert r.status_code == 201, r.text
    assert [c["ma"] for c in r.json()["chips"]] == ["dinh_luong_support", "dai_support", "rong_support"]
    assert r.json()["cong_thuc_dinh_muc"] == "dai_support * rong_support / 1000000"


def test_cong_thuc_dung_chip_chua_khai_bi_chan(client):
    h = _admin(client)
    r = _tao(client, h, cong_thuc_gia="dai_support * 2")
    assert r.status_code in (400, 422), r.text


def test_chip_trung_bien_he_thong_bi_chan(client):
    h = _admin(client)
    r = _tao(client, h, chips=[{"ten": "Số màu"}])
    assert r.status_code in (400, 422) and "so_mau" in r.text


def test_sua_giu_ma_chip_khi_doi_ten(client):
    h = _admin(client)
    vt = _tao(client, h, chips=BA_CHIP, cong_thuc_gia=CT_GIA).json()
    chips = [{"ma": c["ma"], "ten": c["ten"] + " (mới)", "don_vi": c["don_vi"]} for c in vt["chips"]]
    r = client.put(f"{URL}/{vt['id']}", json={"chips": chips}, headers=h)
    assert r.status_code == 200, r.text
    assert [c["ma"] for c in r.json()["chips"]] == ["dinh_luong_support", "dai_support", "rong_support"]


def test_xoa_chip_dang_dung_trong_cong_thuc_bi_chan(client):
    h = _admin(client)
    vt = _tao(client, h, chips=BA_CHIP, cong_thuc_gia=CT_GIA).json()
    r = client.put(f"{URL}/{vt['id']}", json={"chips": vt["chips"][:2]}, headers=h)
    assert r.status_code in (400, 422), r.text


def test_put_khong_gui_chips_thi_khong_dung_vao_chip(client):
    h = _admin(client)
    vt = _tao(client, h, chips=BA_CHIP).json()
    r = client.put(f"{URL}/{vt['id']}", json={"ghi_chu": "x"}, headers=h)
    assert r.status_code == 200 and len(r.json()["chips"]) == 3


def test_clone_mang_chip_theo(client):
    h = _admin(client)
    vt = _tao(client, h, chips=BA_CHIP, cong_thuc_gia=CT_GIA).json()
    r = client.post(f"{URL}/{vt['id']}/clone", headers=h)
    assert r.status_code in (200, 201), r.text
    assert len(r.json()["chips"]) == 3


def test_cong_thuc_dinh_muc_dung_chip_he_thong_cua_buoc(client):
    h = _admin(client)
    r = _tao(client, h, cong_thuc_dinh_muc="sl_vao / 40000")      # sl_vao: biến tầng bước của ô quy đổi
    assert r.status_code == 201, r.text
```

Chạy `python -m pytest backend/tests/test_vat_tu_chip.py -q`. Sửa tới khi pass (route clone/HTTP code theo `routers/catalog_base.py:371-384`).

- [ ] **Step 13: Excel guard + nhật ký + docs**

`catalog_excel_specs.py:375-386`: thêm `"cong_thuc_dinh_muc"` vào `loai_tru` của `VAT_TU` (Excel không mang công thức; chip đi qua `_sau_gan`, không nằm trong `fields` nên không vướng guard). Chạy `python -m pytest backend/tests/test_import_excel.py -q`.

`nhat_ky_danh_muc.py`: thêm `NHAN["cong_thuc_dinh_muc"] = "Công thức định mức"`; đọc hàm gom bảng con ở L490-544 (`_con_cua_cong_doan`) và thêm nhánh `vat_tu_in_an` gom `chips` thành chuỗi `"Dài support (dai_support), …"` đúng khuôn đang có. Test: `python -m pytest backend/tests/test_nhat_ky_nhan_du.py backend/tests/test_nhat_ky_cong_doan_bang_con.py -q`.

`docs/DB_SCHEMA.md`: trong mục `vat_tu_in_an` (~3338-3366) thêm dòng cột `cong_thuc_dinh_muc` (Text, nullable) vào `**Tất cả cột:**`; thêm mục mới ngay sau:

```markdown
### `vat_tu_chip`

**Purpose:** Chip RIÊNG do người dùng đặt tên cho MỘT vật tư (vd "Dài support"); dùng làm biến trong `vat_tu_in_an.cong_thuc_gia` và `cong_thuc_dinh_muc`. Bảng mới (spec 2026-10-01).

| Column | Type (SQLAlchemy → SQLite / Postgres) | Key | Null | Default | Meaning |
| --- | --- | --- | --- | --- | --- |
| `id` | `Integer` → `INTEGER` / `SERIAL` | **PK** | no | auto | Surrogate PK. |
| `vat_tu_id` | `Integer` | FK→`vat_tu_in_an.id` (CASCADE), IX | no | — | Vật tư chủ. |
| `ma` | `String(40)` | U (`vat_tu_id`, `ma`) | no | — | Tên biến trong công thức; sinh từ tên lúc tạo, KHÔNG đổi khi đổi tên chip. |
| `ten` | `String(80)` | — | no | — | Nhãn chip hiện trên màn. |
| `don_vi` | `String(24)` | — | yes | — | Đơn vị hiện sau ô nhập (g/m², mm…). |
| `thu_tu` | `Integer` | — | no | `0` | Thứ tự hiển thị. |

**Keys & indexes**

- Primary key: `id`. Unique: `uq_vat_tu_chip_ma` trên (`vat_tu_id`, `ma`). Index `vat_tu_id`.

**Relationships**

- Mỗi `vat_tu_in_an` có nhiều `vat_tu_chip` (CASCADE xoá).

**Tất cả cột:** `id`, `vat_tu_id`, `ma`, `ten`, `don_vi`, `thu_tu`.

---
```

Chạy `python -m pytest backend/tests/test_schema_documented.py backend/tests/test_danh_muc_http_contract.py backend/tests/test_danh_muc_so_truy_van.py -q` (nếu test đếm truy vấn đỏ vì chip, kiểm `selectinload` đã nạp trong `_base_select`; chỉ nâng ngưỡng khi đã chắc chỉ thêm đúng 1 truy vấn).

- [ ] **Step 14: Commit**

```bash
git status
git add backend/app/models/vat_lieu_kho.py backend/app/models/__init__.py backend/app/db_migrations.py backend/app/services/bien_cong_thuc.py backend/app/services/thanh_phan_engine.py backend/app/schemas/vat_lieu_kho.py backend/app/repositories/vat_lieu_kho_repo.py backend/app/services/vat_lieu_kho_service.py backend/app/services/nhat_ky_danh_muc.py backend/app/services/catalog_excel_specs.py docs/DB_SCHEMA.md backend/tests/test_vat_tu_chip.py backend/tests/test_migration_0357_vat_tu_dinh_muc.py
git commit -m "Vật tư: chip riêng + công thức định mức (bảng vat_tu_chip, mg 0357), validator nhận chip"
```

---

### Task 2: Vật tư — hai tab công thức + bảng chip (frontend)

**Files:**
- Create: `frontend/src/pages/danh-muc/fields/VatTuChips.tsx`, `frontend/src/pages/danh-muc/fields/VatTuChips.test.tsx`
- Modify: `frontend/src/pages/danh-muc/types.ts` (FieldDef ~18-38)
- Modify: `frontend/src/pages/danh-muc/CatalogDrawer.tsx` (`KIEU_MANG` ~31, `isFullWidth` ~282, nhánh `formula` ~409-432)
- Modify: `frontend/src/pages/danh-muc/fields/FormulaField.tsx` (~192-243)
- Modify: `frontend/src/pages/danh-muc/fields/index.ts`
- Modify: `frontend/src/pages/rebuildCatalogConfigs.tsx` (`CFG_VAT_TU` ~510-576)
- Modify: `frontend/src/pages/rebuildCatalogConfigs.test.tsx` (L62-121, L157-170)
- Test: `frontend/src/pages/FormulaField.test.tsx` (thêm ca `bienThem`)

**Interfaces:**
- Consumes: API Task 1 (`chips`, `cong_thuc_dinh_muc`).
- Produces:
  - `VatTuChips` (default export): props `{ value: VatTuChipRow[]; onChange(v: VatTuChipRow[]): void; disabled?: boolean }`
  - `export interface VatTuChipRow { ma?: string; ten: string; don_vi?: string | null }`
  - `export function maTuTenChip(ten: string): string` (khớp BE `ma_tu_ten_chip`)
  - `export function chipsThanhBien(chips: VatTuChipRow[]): BienCongThuc[]`
  - `FieldDef.type = "vat-tu-chip"`, `FieldDef.chipsTu?: string`
  - `FormulaField` prop `bienThem?: BienCongThuc[]`

- [ ] **Step 1: Test `maTuTenChip` (fail)**

`VatTuChips.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { chipsThanhBien, maTuTenChip } from "./VatTuChips";

describe("maTuTenChip — khớp backend ma_tu_ten_chip", () => {
  it.each([
    ["Định lượng support", "dinh_luong_support"],
    ["  Dài  support (mm) ", "dai_support_mm"],
    ["2 mặt", "c_2_mat"],
    ["!!!", "chip"],
  ])("%s → %s", (ten, ma) => expect(maTuTenChip(ten)).toBe(ma));
});

describe("chipsThanhBien", () => {
  it("chip chưa có mã vẫn ra biến (mã sinh từ tên) để công thức dùng ngay", () => {
    const b = chipsThanhBien([{ ten: "Dài support", don_vi: "mm" }]);
    expect(b).toHaveLength(1);
    expect(b[0].ma).toBe("dai_support");
    expect(b[0].nhan).toBe("Dài support");
    expect(b[0].don_vi).toBe("mm");
  });
  it("bỏ chip chưa gõ tên", () => {
    expect(chipsThanhBien([{ ten: "  " }])).toEqual([]);
  });
});
```

Run `cd frontend && npx vitest run src/pages/danh-muc/fields/VatTuChips.test.tsx` → FAIL (không có module).

- [ ] **Step 2: Viết `VatTuChips.tsx`**

Mở `fields/ChuanBiKhoan.tsx` làm khuôn (nó dùng `RowEditor` — đối chiếu props thật `rows, cot, trong, themNhan, onThem, onXoa, xoaTitle, lopHang, khoaXoa, khoa, chan, veHang` trước khi gõ) rồi viết:

```tsx
import type { BienCongThuc } from "../bienCongThuc";
import RowEditor from "./RowEditor";

export interface VatTuChipRow { ma?: string; ten: string; don_vi?: string | null }

/** Khớp backend `bien_cong_thuc.ma_tu_ten_chip`: bỏ dấu, thường, ký tự lạ → `_`. */
export function maTuTenChip(ten: string): string {
  const s = (ten || "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) return "chip";
  return /^[0-9]/.test(s) ? `c_${s}` : s;
}

/** Chip của vật tư → từ điển biến cho ô công thức (chip mới chưa lưu cũng dùng được ngay). */
export function chipsThanhBien(chips: VatTuChipRow[]): BienCongThuc[] {
  return chips
    .filter((c) => c.ten.trim() !== "")
    .map((c) => ({
      ma: c.ma || maTuTenChip(c.ten),
      nhan: c.ten.trim(),
      mo_ta: `Chip riêng của vật tư này${c.don_vi ? ` (${c.don_vi})` : ""}`,
      don_vi: c.don_vi ?? "",
      nguon: "số nhập ở phiếu tính giá, theo từng bước",
      loai: ["vat_tu", "quy_doi"],
    }));
}

interface Props {
  value: VatTuChipRow[];
  onChange: (next: VatTuChipRow[]) => void;
  disabled?: boolean;
}

export default function VatTuChips({ value, onChange, disabled }: Props) {
  const set = (i: number, patch: Partial<VatTuChipRow>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <RowEditor
      rows={value}
      cot={[
        { key: "ten", nhan: "Tên chip", render: (r: VatTuChipRow, i: number) => (
          <>
            <input
              aria-label={`Tên chip ${i + 1}`}
              value={r.ten}
              disabled={disabled}
              maxLength={80}
              placeholder="vd Dài support"
              onChange={(e) => set(i, { ten: e.target.value })}
            />
            <small>Biến trong công thức: {r.ma || maTuTenChip(r.ten)}</small>
          </>
        ) },
        { key: "don_vi", nhan: "Đơn vị", render: (r: VatTuChipRow, i: number) => (
          <input
            aria-label={`Đơn vị chip ${i + 1}`}
            value={r.don_vi ?? ""}
            disabled={disabled}
            maxLength={24}
            placeholder="mm, g/m²…"
            onChange={(e) => set(i, { don_vi: e.target.value })}
          />
        ) },
      ]}
      trong="Vật tư này chưa có chip riêng."
      themNhan="+ Thêm chip"
      onThem={() => onChange([...value, { ten: "", don_vi: "" }])}
      onXoa={(i: number) => onChange(value.filter((_, j) => j !== i))}
      xoaTitle="Xoá chip"
      khoa={disabled}
    />
  );
}
```

(Tên thuộc tính `cot`/`render` của `RowEditor` lấy theo `ChuanBiKhoan.tsx` thật; nếu khác thì sửa cho khớp — chữ ký ở trên là theo báo cáo khảo sát, chưa kiểm bằng trình biên dịch.) Export trong `fields/index.ts`: `export { default as VatTuChips } from "./VatTuChips";` + `export * from "./VatTuChips";` theo cách các field khác đang export.

Run lại test Step 1 → pass.

- [ ] **Step 3: Kiểu field + `bienThem` trong `FormulaField` (test fail → pass)**

`types.ts`: thêm `"vat-tu-chip"` vào union `FieldDef.type` (dòng ~18) và `chipsTu?: string;` (kèm doc: "tên field mảng chip của CHÍNH form này; ô công thức nhận chip đó làm biến bổ sung").

`FormulaField.tsx`: thêm prop `bienThem?: BienCongThuc[]` vào Props (192-222). Sau `const tuDien = useBienCongThuc()` (dòng 227):

```tsx
  const tuDienDay = useMemo(
    () => (bienThem && bienThem.length ? [...tuDien, ...bienThem] : tuDien),
    [tuDien, bienThem],
  );
```

và thay mọi chỗ trong hàm dùng `tuDien` làm nguồn (whitelist ở 229-232, `traBien(tuDien)` ở 228, `bienHienThi` 235-239, `validVars` 240-243) bằng `tuDienDay`; riêng `whitelist` khi có `bienThem` phải gồm cả `bienThem.map(b => b.ma)` (whitelist hiện `bienGoiY ?? tuDien.filter(b => b.loai.includes(loaiO)).map(b => b.ma)` — `bienThem` mang `loai: ["vat_tu","quy_doi"]` nên tự lọt vào cả hai ô).

Test thêm vào `frontend/src/pages/FormulaField.test.tsx` (theo harness hiện có của file):

```tsx
it("chip riêng (bienThem) hiện thành chip bấm được và không bị gạch đỏ", async () => {
  const onChange = vi.fn();
  renderFormula({
    value: "dai_support * 2",
    onChange,
    bienThem: [{ ma: "dai_support", nhan: "Dài support", mo_ta: "", don_vi: "mm", nguon: "", loai: ["vat_tu"] }],
  });
  expect(screen.getByText("Dài support")).toBeTruthy();
  expect(screen.queryByText(/chưa biết biến/i)).toBeNull();
});
```

(`renderFormula` = helper harness của file; nếu tên khác, dùng helper thật. Đọc 40 dòng đầu file test để biết.) Chạy `npx vitest run src/pages/FormulaField.test.tsx` → pass.

- [ ] **Step 4: Gắn vào `CatalogDrawer`**

- `KIEU_MANG` (L31-34): thêm `"vat-tu-chip"` (khởi tạo `[]`).
- `isFullWidth` (~282-285): thêm `"vat-tu-chip"`.
- Chuỗi `renderField` (286-459): thêm nhánh

```tsx
    if (f.type === "vat-tu-chip") {
      return (
        <VatTuChips
          value={(form[f.key] as VatTuChipRow[]) ?? []}
          onChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
          disabled={khoa}
        />
      );
    }
```

(`setForm`/`khoa` đặt đúng tên biến đang dùng trong nhánh `viec-phat-sinh` ngay cạnh — mượn nguyên.) Trong nhánh `formula` (409-432) truyền thêm `bienThem={f.chipsTu ? chipsThanhBien((form[f.chipsTu] as VatTuChipRow[]) ?? []) : undefined}`.

- [ ] **Step 5: Cấu hình `CFG_VAT_TU`**

`rebuildCatalogConfigs.tsx` (~543-576). Thêm `tabsKhai` (mẫu `CFG_CONG_DOAN` L315-319) và ba field; cập nhật comment cũ ("Vật tư khác nay KHÔNG còn ô công thức nào…") thành lịch sử có ngày:

```tsx
  tabsKhai: [
    { id: "info", label: "Thông tin", groups: ["Thông số", "Ghi chú"] },
    { id: "chip", label: "Chip riêng", groups: ["Chip"] },
  ],
  transformSubmit: (body) => ({ ...body, chips: body.chips ?? [] }),
  fields: [
    { key: "don_vi_gia", label: "Đơn vị tính (ĐVT)", ...F_DON_VI, group: "Thông số" },
    { key: "ghi_chu", label: "Ghi chú", type: "text", group: "Ghi chú" },
    { key: "chips", label: "Chip riêng của vật tư", type: "vat-tu-chip", group: "Chip",
      hint: "Tên các số bạn nhập khi tính giá cho vật tư này (vd Dài support, Rộng support). Dùng làm biến trong hai công thức." },
    { key: "cong_thuc_gia", label: "Công thức tính giá", type: "formula",
      nhanTab: "Công thức tính giá", loaiO: "vat_tu", chipsTu: "chips",
      hint: "Ra TIỀN của vật tư này ở phiếu tính giá." },
    { key: "cong_thuc_dinh_muc", label: "Công thức định mức", type: "formula",
      nhanTab: "Công thức định mức", loaiO: "quy_doi", chipsTu: "chips",
      hint: "Số lượng vật tư này tiêu hao cho MỘT bước; lệnh sản xuất tự tính, không nhập tay." },
  ],
```

(giữ nguyên các field `don_vi_gia`/`ghi_chu` đang có; nếu `transformSubmit` chữ ký khác — `(body, form, existing)` ở types.ts:209-213 — theo chữ ký thật.)

- [ ] **Step 6: Sửa test khoá cấu hình cũ**

`rebuildCatalogConfigs.test.tsx`: L108-121 ("ô Cách đo lượng ĐÃ GỠ khỏi Máy · Vật tư khác") — giữ phần Máy, đổi phần Vật tư khác: `CFG_VAT_TU.fields.some(f => f.key === "cong_thuc_luong")` vẫn `false` (tên cũ không quay lại), bỏ assert `nhanTabCongThuc undefined` nếu không còn đúng. L157-162 ("Vật tư khác: drawer KHÔNG còn ô công thức nào") đổi thành:

```tsx
it("Vật tư khác: có chip riêng + hai ô công thức, mỗi ô một tab", () => {
  const ct = CFG_VAT_TU.fields.filter((f) => f.type === "formula");
  expect(ct.map((f) => f.key)).toEqual(["cong_thuc_gia", "cong_thuc_dinh_muc"]);
  expect(ct.map((f) => f.nhanTab)).toEqual(["Công thức tính giá", "Công thức định mức"]);
  expect(ct.every((f) => f.chipsTu === "chips")).toBe(true);
  expect(CFG_VAT_TU.fields.some((f) => f.type === "vat-tu-chip")).toBe(true);
});
```

Giữ nguyên các assert còn đúng (ẩn `don_gia`/`thay_the_ids` L164-170; ĐVT `ref-search-ma` L71-83).

- [ ] **Step 7: Kiểm kiểu + test**

Run: `cd frontend && npx tsc --noEmit` (exit 0) và `npx vitest run src/pages/danh-muc src/pages/FormulaField.test.tsx src/pages/rebuildCatalogConfigs.test.tsx`. Expected: pass. `CatalogDrawer.test.tsx` có test "tabsKhai: tab không còn ô nào thì BỎ HẲN" — chạy trong lượt trên, phải pass.

- [ ] **Step 8: Xác minh luồng thật trên trình duyệt dev**

Restart uvicorn (đã đổi schema), mở FE `localhost:5173`, đăng nhập admin/admin123. Luồng: Danh mục → Vật tư khác → "Thêm" → mã `ZZSUP`, tên `Support`, ĐVT chọn một đơn vị → tab "Chip riêng" bấm "+ Thêm chip" 3 lần gõ `Định lượng support` / `Dài support` / `Rộng support` (đơn vị g/m², mm, mm) → tab "Công thức tính giá": bấm chip `Định lượng support`, gõ `*`, bấm `Dài support`, gõ `*`, bấm `Rộng support` → tab "Công thức định mức": gõ `sl_vao / 40000` → "Lưu". Kỳ vọng: lưu được, không gạch đỏ; mở lại dòng thấy đủ 3 chip + 2 công thức; xoá chip `Dài support` rồi lưu → báo lỗi nêu rõ biến chưa biết, KHÔNG lưu. Báo cáo ghi từng bước đã bấm/gõ/thấy.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/danh-muc/fields/VatTuChips.tsx frontend/src/pages/danh-muc/fields/VatTuChips.test.tsx frontend/src/pages/danh-muc/types.ts frontend/src/pages/danh-muc/CatalogDrawer.tsx frontend/src/pages/danh-muc/fields/FormulaField.tsx frontend/src/pages/danh-muc/fields/index.ts frontend/src/pages/rebuildCatalogConfigs.tsx frontend/src/pages/rebuildCatalogConfigs.test.tsx frontend/src/pages/FormulaField.test.tsx
git commit -m "Vật tư: tab Chip riêng + Công thức tính giá + Công thức định mức, ô công thức nhận chip của chính vật tư"
```

---

## GIAI ĐOẠN B — ĐỔI ĐƯỜNG ĐI

### Task 3: Phiếu tính giá — vật tư theo bước (backend + engine)

**Files:**
- Modify: `backend/app/models/phieu_tinh_gia.py` (thêm `PhieuBuocVatTu`; `PhieuThanhPham` ~211-279; `PhieuThanhPhan.vat_tus` ~192; `PhieuVatTu` ~305)
- Modify: `backend/app/schemas/phieu_tinh_gia.py` (`ThanhPhamIn` 15-35, `ThanhPhamOut` 38-58, `ThanhPhanIn.vat_tus` ~167, `ThanhPhanOut.vat_tus` ~222, `VatTuLineIn/Out` 72-92)
- Modify: `backend/app/routers/phieu_tinh_gia.py:99-132` (`_con_cua_thanh_phan`, `_build_thanh_phan`, `_ghi_de_thanh_phan` ~152-162)
- Modify: `backend/app/services/tinh_gia_service.py` (L92-104, L175-213, L302-332)
- Modify: `backend/app/services/thanh_phan_engine.py:993-1032`
- Modify: `backend/app/services/san_pham_tai_ban_service.py:14, 66-90`
- Modify: `backend/app/services/danh_muc_tham_chieu.py:201-209`
- Modify: `backend/app/services/lsx_service.py:1164-1166` (nạp quan hệ)
- Modify: `docs/DB_SCHEMA.md` (~3908-3925)
- Test: `backend/tests/test_phieu_buoc_vat_tu.py`; sửa `test_phieu_tinh_gia.py`, `test_thanh_phan_engine.py`, `test_bien_cong_thuc.py:24-31`, `test_san_pham_tai_ban.py:70-104,135-153,312-356`

**Interfaces:**
- Consumes: `VatTuInAn.cong_thuc_gia`, `.chips`, `.don_gia`, `.don_vi_gia` (Task 1).
- Produces:
  - ORM `PhieuBuocVatTu(id, thanh_pham_id, thu_tu, vat_tu_id, gia_tri_chip: dict)`; `PhieuThanhPham.vat_tus: list[PhieuBuocVatTu]`
  - Schema `BuocVatTuIn(vat_tu_id: int, thu_tu: int | None, gia_tri_chip: dict[str, float] | None)`, `BuocVatTuOut(id, thu_tu, vat_tu_id, gia_tri_chip)`; `ThanhPhamIn.vat_tus`, `ThanhPhamOut.vat_tus`
  - Dict bước cho engine/lệnh: `row["vat_tus"] = [{"vat_tu_id", "ten", "don_gia", "don_vi_gia", "cong_thuc_gia", "chips": [{ma,ten,don_vi}], "gia_tri_chip": {ma: số}}]` (từ `tinh_gia_service._vat_tus_cua_buoc`)

- [ ] **Step 1: Test engine tính giá vật tư theo bước (fail)**

`backend/tests/test_phieu_buoc_vat_tu.py` — đọc chữ ký `_buoc` và `_component` ở `test_thanh_phan_engine.py:83-93, 243-246` trước:

```python
from app.services.thanh_phan_engine import compute_phieu
from tests.test_thanh_phan_engine import _buoc, _component, _grp

BA_CHIP = [
    {"ma": "dinh_luong_support", "ten": "Định lượng support", "don_vi": "g/m2"},
    {"ma": "dai_support", "ten": "Dài support", "don_vi": "mm"},
    {"ma": "rong_support", "ten": "Rộng support", "don_vi": "mm"},
]


def _vat_tu_support(**kw):
    return {
        "vat_tu_id": 77, "ten": "Support", "don_gia": 0, "don_vi_gia": "kg",
        "cong_thuc_gia": "dinh_luong_support * dai_support * rong_support",
        "chips": BA_CHIP,
        "gia_tri_chip": {"dinh_luong_support": 2, "dai_support": 3, "rong_support": 4},
        **kw,
    }


def _phieu(vat_tus):
    tp = _component()
    tp["thanh_phams"] = [{**_buoc("Cán màng", "to", "to"), "vat_tus": vat_tus}]
    return compute_phieu(so_luong=1000, thanh_phans=[tp])


def test_chip_the_vao_cong_thuc_gia_cua_vat_tu_trong_buoc():
    dong = [r for r in _grp(_phieu([_vat_tu_support()]), "nvl")["rows"] if "Support" in r["ten"]]
    assert len(dong) == 1
    assert dong[0]["thanh_tien"] == 24          # 2 × 3 × 4
    assert dong[0]["vat_tu_id"] == 77


def test_chip_chua_nhap_so_thi_tinh_0_va_canh_bao():
    res = _phieu([_vat_tu_support(gia_tri_chip={"dai_support": 3})])
    dong = [r for r in _grp(res, "nvl")["rows"] if "Support" in r["ten"]]
    assert dong[0]["thanh_tien"] == 0
    assert any("chưa nhập số" in w and "Định lượng support" in w for w in res["warnings"])


def test_hai_buoc_cung_dung_mot_vat_tu_ra_hai_dong():
    tp = _component()
    tp["thanh_phams"] = [
        {**_buoc("Cán màng", "to", "to"), "vat_tus": [_vat_tu_support()]},
        {**_buoc("Bế", "to", "to"), "vat_tus": [_vat_tu_support(gia_tri_chip={"dinh_luong_support": 1, "dai_support": 1, "rong_support": 1})]},
    ]
    res = compute_phieu(so_luong=1000, thanh_phans=[tp])
    tien = [r["thanh_tien"] for r in _grp(res, "nvl")["rows"] if "Support" in r["ten"]]
    assert sorted(tien) == [1, 24]


def test_vat_tu_khong_co_cong_thuc_tinh_0_va_canh_bao():
    res = _phieu([_vat_tu_support(cong_thuc_gia=None)])
    assert any("chưa có công thức" in w for w in res["warnings"])
```

(`res["warnings"]`/`_grp` theo cấu trúc kết quả thật của `compute_phieu`: xem `_grp` ở test_thanh_phan_engine.py:96-97 và nơi test cũ đọc `warnings`.) Run → FAIL (engine chưa đọc `row["vat_tus"]`).

- [ ] **Step 2: Engine — vòng vật tư theo bước (`thanh_phan_engine.py:993-1032`)**

Thay `for vt in tp.get("vat_tus") or []:` bằng vòng lồng (giữ nguyên thân), cộng chip vào `eval_ctx`:

```python
    # --- Vật tư THEO BƯỚC (01/10/2026): mỗi bước mang danh sách vật tư riêng + số chip nhập ở phiếu.
    # Công thức giá dùng tập biến LOAI_VAT_TU (ngữ cảnh CẢ thành phần) + `don_gia_vat_tu` + chip riêng của
    # vật tư — không cần ngữ cảnh từng bước nên chạy một lượt trước vòng công đoạn như trước.
    for row_buoc in tp.get("thanh_phams") or []:
      for vt in row_buoc.get("vat_tus") or []:
        ...  # thân cũ, thụt vào một cấp (dòng 996-1032 hiện tại)
```

Trong nhánh `else` (có công thức), ngay sau `eval_ctx["don_gia_vat_tu"] = ...` thêm:

```python
            gia_tri = vt.get("gia_tri_chip") or {}
            for c in vt.get("chips") or []:
                v_chip = _f(gia_tri.get(c["ma"]))
                eval_ctx[c["ma"]] = v_chip
                if v_chip == 0 and re.search(rf"\b{re.escape(c['ma'])}\b", vt_formula):
                    warnings.append(
                        f"Vật tư '{vt_ten}': chip '{c.get('ten') or c['ma']}' chưa nhập số — tính theo 0.")
```

(`re` import nếu file chưa có.) Giữ nguyên mọi câu cảnh báo cũ để các test cũ không vỡ. Xoá khối cũ đọc `tp["vat_tus"]` (không còn nguồn). Run `python -m pytest backend/tests/test_phieu_buoc_vat_tu.py -q` → pass.

- [ ] **Step 3: Model `PhieuBuocVatTu`**

`models/phieu_tinh_gia.py`: trong `PhieuThanhPham` thêm quan hệ (cạnh `thanh_phan`, dòng ~278):

```python
    vat_tus: Mapped[list["PhieuBuocVatTu"]] = relationship(
        "PhieuBuocVatTu", back_populates="buoc", order_by="PhieuBuocVatTu.thu_tu",
        cascade="all, delete-orphan", passive_deletes=True,
    )
```

Thêm class (mẫu `PhieuChiPhiKhac` L334-372):

```python
class PhieuBuocVatTu(Base):
    """Một VẬT TƯ của một BƯỚC trong phiếu tính giá (spec 2026-10-01 Đ3).

    Chép từ danh sách vật tư của công đoạn lúc thêm bước (ở frontend); người lập phiếu thêm/xoá bớt
    được. Vắng dòng = đã xoá — KHÔNG tự mọc lại khi mở phiếu. `gia_tri_chip` = {mã chip: số} cho các
    chip riêng của vật tư (xem `vat_tu_chip`); lệnh sản xuất chép nó xuống bước lệnh. Không có đơn giá
    riêng: giá chỉ tính theo công thức của vật tư. Replace-all như mọi bảng con của phiếu, nên id đổi
    mỗi lần lưu — không nơi nào được ghim `phieu_buoc_vat_tu.id`."""

    __tablename__ = "phieu_buoc_vat_tu"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thanh_pham_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("phieu_thanh_pham.id", ondelete="CASCADE"), index=True, nullable=False
    )
    thu_tu: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vat_tu_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)  # → vat_tu_in_an.id (soft)
    gia_tri_chip: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    buoc: Mapped["PhieuThanhPham"] = relationship("PhieuThanhPham", back_populates="vat_tus")
```

Ngưng dùng vật tư cấp thành phần: xoá quan hệ `PhieuThanhPhan.vat_tus` (~192) VÀ `PhieuVatTu.thanh_phan` (~331) (cả hai đầu `back_populates`); GIỮ class `PhieuVatTu` + bảng, thêm vào docstring: `"NGƯNG ĐỌC/GHI từ 01/10/2026 — thay bằng PhieuBuocVatTu. Giữ bảng, không drop."` (script seed cũ `scripts/reseed_tinh_gia_5.py`, `scripts/seed_hop_doi_add.py` tạo `PhieuVatTu(thanh_phan_id=…)` trực tiếp vẫn chạy được.) Không cần sửa `models/__init__.py` (class cùng file tự đăng ký).

- [ ] **Step 4: Schema**

`schemas/phieu_tinh_gia.py`: thêm trước `ThanhPhamIn`:

```python
class BuocVatTuIn(BaseModel):
    """1 vật tư của một bước (đầu vào)."""
    thu_tu: int | None = None
    vat_tu_id: int
    gia_tri_chip: dict[str, float] | None = None


class BuocVatTuOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thu_tu: int
    vat_tu_id: int
    gia_tri_chip: dict[str, float] = Field(default_factory=dict)

    @field_validator("gia_tri_chip", mode="before")
    @classmethod
    def _none_thanh_rong(cls, v):
        return v or {}
```

`ThanhPhamIn` thêm `vat_tus: list[BuocVatTuIn] | None = None`; `ThanhPhamOut` thêm `vat_tus: list[BuocVatTuOut] = Field(default_factory=list)` (import `field_validator`). Xoá `ThanhPhanIn.vat_tus` (~167), `ThanhPhanOut.vat_tus` (~222), `VatTuLineIn`, `VatTuLineOut` (72-92). KHÔNG thêm gì vào `ThanhPhanRutGonOut`/`PhieuTinhGiaOutRutGon`.

- [ ] **Step 5: Router — lưu theo bước**

`routers/phieu_tinh_gia.py`: viết lại `_con_cua_thanh_phan` (bỏ tham số `vt_in`):

```python
def _con_cua_thanh_phan(tp: PhieuThanhPhan, rows_in: list[dict], cpk_in: list[dict] | None = None) -> None:
    """... (giữ docstring cũ, thêm:) Vật tư của từng BƯỚC lưu cùng lúc: `vat_tus` bị `pop` khỏi dict bước
    trước khi dựng `PhieuThanhPham(**rd)` — để nguyên thì SQLAlchemy nổ vì list-dict không phải ORM."""
    tp.thanh_phams.clear()
    for j, row in enumerate(rows_in):
        rd = dict(row)
        vt_in = rd.pop("vat_tus", None) or []
        rd.setdefault("thu_tu", j)
        buoc = PhieuThanhPham(**rd)
        for k, vt in enumerate(vt_in):
            vd = dict(vt)
            vd.setdefault("thu_tu", k)
            buoc.vat_tus.append(PhieuBuocVatTu(**vd))
        tp.thanh_phams.append(buoc)
    tp.chi_phi_khacs.clear()
    for m, cp in enumerate(cpk_in or []):
        cd = dict(cp)
        cd.setdefault("thu_tu", m)
        tp.chi_phi_khacs.append(PhieuChiPhiKhac(**cd))
```

Trong `_build_thanh_phan` (123-132) và `_ghi_de_thanh_phan` (152-162): bỏ `vt_in = data.pop("vat_tus", None) or []` và bỏ đối số `vt_in` khi gọi `_con_cua_thanh_phan(tp, rows_in, cpk_in)`. (Mọi nơi khác gọi `_con_cua_thanh_phan`/`_build_thanh_phan` — `/preview` ở `routers/tinh_gia.py:76-92` — dùng chung nên tự theo.) Import `PhieuBuocVatTu`.

- [ ] **Step 6: `tinh_gia_service` — dựng dict bước kèm vật tư**

(a) Thêm hàm (cạnh `_cong_doan_to_dict`):

```python
def _vat_tus_cua_buoc(db: Session, buoc: PhieuThanhPham) -> list[dict]:
    """Vật tư của MỘT bước kèm công thức giá + chip của vật tư (engine không tự tra DB).
    Vật tư đã xoá khỏi danh mục thì bỏ im lặng — danh mục là nguồn sống."""
    out: list[dict] = []
    for vt in sorted(buoc.vat_tus or [], key=lambda r: (r.thu_tu or 0, r.id or 0)):
        m = db.get(VatTuInAn, vt.vat_tu_id)
        if m is None:
            continue
        out.append({
            "vat_tu_id": m.id,
            "ten": m.ten,
            "don_gia": _f(m.don_gia),
            "don_vi_gia": m.don_vi_gia,
            "cong_thuc_gia": m.cong_thuc_gia,
            "chips": [{"ma": c.ma, "ten": c.ten, "don_vi": c.don_vi} for c in m.chips],
            "gia_tri_chip": dict(vt.gia_tri_chip or {}),
        })
    return out
```

(b) Trong vòng bước (L175-190), sau `rd` dựng xong thêm `rd["vat_tus"] = _vat_tus_cua_buoc(db, row)`. (c) Xoá khối `vts` cấp thành phần (L192-213) và dòng `d["vat_tus"] = vts`. (d) `danh_muc_doi_sau_khi_tinh` (L302-332): thay vòng `for vt in tp.vat_tus:` bằng

```python
        for f in tp.thanh_phams:
            for vt in f.vat_tus:
                if vt.vat_tu_id:
                    vt_ids.add(int(vt.vat_tu_id))
```

(e) `lsx_service.py:1164-1166`: `selectinload(PhieuThanhPhan.vat_tus)` → `selectinload(PhieuThanhPhan.thanh_phams).selectinload(PhieuThanhPham.vat_tus)`.

- [ ] **Step 7: Tái bản + tham chiếu**

`san_pham_tai_ban_service.py`: bỏ import `VatTuLineIn` (L14), trong `ThanhPhamIn(...)` (66-86) thêm

```python
                  vat_tus=[
                      BuocVatTuIn(vat_tu_id=v.vat_tu_id, gia_tri_chip=dict(v.gia_tri_chip or {}))
                      for v in sorted(cd.vat_tus, key=lambda x: x.thu_tu)
                  ],
```

và xoá khối `vat_tus=[VatTuLineIn(...)]` cấp thành phần (87-90). `danh_muc_tham_chieu.py:201-209`: đổi `PhieuVatTu`/`PhieuVatTu.vat_tu_id` thành `PhieuBuocVatTu`/`PhieuBuocVatTu.vat_tu_id` (xoá vật tư đang có trong phiếu vẫn bị chặn).

- [ ] **Step 8: Sửa test cũ dính vật tư cấp thành phần**

- `test_bien_cong_thuc.py:24-31` (`_phieu`): chuyển `tp["vat_tus"] = [...]` thành vật tư của bước: `tp["thanh_phams"] = [{**_buoc(...), "vat_tus": [...]}]` hoặc thêm vào bước đầu — bảo đảm test `test_moi_bien_khai_trong_tu_dien_deu_co_gia_tri_that` còn soi được ô `LOAI_VAT_TU` (assert dòng nvl của vật tư có mặt, kẻo pass rỗng).
- `test_thanh_phan_engine.py:756` và `:996-1013` (`test_dong_vat_tu_phoi_luong_va_don_vi_ra_ngoai`): chuyển `tp["vat_tus"]` thành `tp["thanh_phams"][0]["vat_tus"]`.
- `test_san_pham_tai_ban.py`: `_thanh_phan` (70-104) tạo `PhieuBuocVatTu(vat_tu_id=…, gia_tri_chip={...})` gắn vào bước thay `PhieuVatTu`; L153 đổi assert thành `cfg["thanh_phams"][0]["vat_tus"][0]["vat_tu_id"] == …`; `test_snapshot_chep_du_moi_o_nhap` (L354) thêm `"vat_tus"` vào bộ `bo_qua` và viết kiểm riêng từng vật tư của bước (khuôn dòng 355 đang làm cho `VatTuLineIn`).
- `test_phieu_tinh_gia.py`: thêm test round-trip API (viết ở Step 9).

- [ ] **Step 9: Test API lưu/mở lại + đổi công đoạn không nuốt field**

Thêm vào `test_phieu_buoc_vat_tu.py`:

```python
from tests.test_danh_muc_http_contract import _admin
from tests.test_phieu_tinh_gia import _component as _comp_api
from tests.test_phieu_tinh_gia import _seed_catalog


def _tao_vat_tu(client, h):
    r = client.post("/api/vat-lieu-kho/vat-tu-in-an", headers=h, json={
        "ma": "ZZSUPB", "ten": "ZZ Support bước", "don_vi_gia": "kg",
        "chips": [{"ten": "Dài support"}, {"ten": "Rộng support"}],
        "cong_thuc_gia": "dai_support * rong_support",
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_luu_va_mo_lai_phieu_giu_vat_tu_va_chip_cua_buoc(client):
    h = _admin(client)
    giay_id, cd_id = _seed_catalog()
    vt_id = _tao_vat_tu(client, h)
    tp = _comp_api(giay_id, cd_id)
    tp["thanh_phams"][0]["vat_tus"] = [{"vat_tu_id": vt_id, "gia_tri_chip": {"dai_support": 5, "rong_support": 6}}]
    r = client.post("/api/phieu-tinh-gia", json={"so_luong": 1000, "thanh_phans": [tp]}, headers=h)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    got = client.get(f"/api/phieu-tinh-gia/{pid}", headers=h).json()
    vts = got["thanh_phans"][0]["thanh_phams"][0]["vat_tus"]
    assert [v["vat_tu_id"] for v in vts] == [vt_id]
    assert vts[0]["gia_tri_chip"] == {"dai_support": 5, "rong_support": 6}


def test_xoa_vat_tu_khoi_buoc_roi_luu_thi_het_vat_tu(client):
    h = _admin(client)
    giay_id, cd_id = _seed_catalog()
    vt_id = _tao_vat_tu(client, h)
    tp = _comp_api(giay_id, cd_id)
    tp["thanh_phams"][0]["vat_tus"] = [{"vat_tu_id": vt_id}]
    pid = client.post("/api/phieu-tinh-gia", json={"so_luong": 1000, "thanh_phans": [tp]}, headers=h).json()["id"]
    tp["thanh_phams"][0]["vat_tus"] = []
    client.put(f"/api/phieu-tinh-gia/{pid}", json={"thanh_phans": [tp]}, headers=h)
    got = client.get(f"/api/phieu-tinh-gia/{pid}", headers=h).json()
    assert got["thanh_phans"][0]["thanh_phams"][0]["vat_tus"] == []


def test_xoa_vat_tu_dang_nam_trong_phieu_bi_chan(client):
    h = _admin(client)
    giay_id, cd_id = _seed_catalog()
    vt_id = _tao_vat_tu(client, h)
    tp = _comp_api(giay_id, cd_id)
    tp["thanh_phams"][0]["vat_tus"] = [{"vat_tu_id": vt_id}]
    client.post("/api/phieu-tinh-gia", json={"so_luong": 1000, "thanh_phans": [tp]}, headers=h)
    r = client.delete(f"/api/vat-lieu-kho/vat-tu-in-an/{vt_id}", headers=h)
    # xoá mềm: còn nơi dùng thì chỉ ngừng dùng chứ không xoá hẳn (xem danh_muc_tham_chieu)
    assert r.status_code in (200, 204, 409), r.text
```

(`_comp_api` trả thành phần có `thanh_phams[0]` — nếu `_component` ở test_phieu_tinh_gia.py:46-56 không dựng sẵn bước thì thêm bước theo `cong_doan_id` trước khi gán `vat_tus`; nhìn hàm để chỉnh.) Chạy:

`python -m pytest backend/tests/test_phieu_buoc_vat_tu.py backend/tests/test_phieu_tinh_gia.py backend/tests/test_thanh_phan_engine.py backend/tests/test_bien_cong_thuc.py backend/tests/test_san_pham_tai_ban.py backend/tests/test_danh_muc_tham_chieu.py backend/tests/test_schema_documented.py -q`

Expected: pass. (Test `_row_khuon…`/`test_khuon_*` còn đó vì khuôn gỡ ở Task 8.)

- [ ] **Step 10: DB_SCHEMA + commit**

`docs/DB_SCHEMA.md`: thêm mục `phieu_buoc_vat_tu` ngay sau `phieu_thanh_pham` (~3908-3920) — cột `id`, `thanh_pham_id` (FK CASCADE), `thu_tu`, `vat_tu_id` (soft→`vat_tu_in_an.id`), `gia_tri_chip` (JSON), `created_at`, `updated_at`, kèm dòng `**Tất cả cột:**`; ở mục `phieu_vat_tu` (~3922) ghi "NGƯNG ĐỌC/GHI từ 01/10/2026, thay bằng `phieu_buoc_vat_tu`".

```bash
git status
git add backend/app/models/phieu_tinh_gia.py backend/app/schemas/phieu_tinh_gia.py backend/app/routers/phieu_tinh_gia.py backend/app/services/tinh_gia_service.py backend/app/services/thanh_phan_engine.py backend/app/services/san_pham_tai_ban_service.py backend/app/services/danh_muc_tham_chieu.py backend/app/services/lsx_service.py docs/DB_SCHEMA.md backend/tests/test_phieu_buoc_vat_tu.py backend/tests/test_phieu_tinh_gia.py backend/tests/test_thanh_phan_engine.py backend/tests/test_bien_cong_thuc.py backend/tests/test_san_pham_tai_ban.py
git commit -m "Phiếu tính giá: vật tư theo từng bước (phieu_buoc_vat_tu) + chip, engine thế chip vào công thức giá vật tư"
```

---

### Task 4: Phiếu tính giá — giao diện vật tư theo bước (frontend)

**Files:**
- Create: `frontend/src/pages/BuocVatTu.tsx`, `frontend/src/pages/BuocVatTu.test.tsx`
- Modify: `frontend/src/api/client.ts` (~4077-4310)
- Modify: `frontend/src/pages/PhieuTinhGiaDetailView.tsx` (types 487-521/584; `blankFinishing` 587-610; `fromFinishing` 655-674; `toThanhPhanIn` 733-802; `fromThanhPhanIn` 807-882; `duplicateComp` 1392-1413; `addFin` 1438-1480; `previewSig` 1547-1576; nạp danh mục ~1317; `themCongDoan` 2696-2712; chèn khối UI trước ~3224)
- Modify: `frontend/src/pages/tinh-gia.css` (thêm `.tg-bvt*`)

**Interfaces:**
- Consumes: `ThanhPhamIn/Out.vat_tus` (Task 3); vật tư danh mục `{id, ten, chips: [{ma,ten,don_vi}]}` từ `/api/vat-lieu-kho/vat-tu-in-an` (Task 1); `congDoans[*].vat_tus: [{vat_tu_id}]`.
- Produces: `BuocVatTu` (default export) props `{ tenBuoc: string; dong: BuocVatTuDong[]; vatTuDm: Row[]; onChange(next: BuocVatTuDong[]): void; taoUid(): string }`; `export interface BuocVatTuDong { uid: string; vat_tu_id: number; gia_tri_chip: Record<string, number> }`.

- [ ] **Step 1: Test component (fail)**

`BuocVatTu.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BuocVatTu from "./BuocVatTu";

const DM = [
  { id: 1, ma: "SUP", ten: "Support", chips: [
    { ma: "dai_support", ten: "Dài support", don_vi: "mm" },
    { ma: "rong_support", ten: "Rộng support", don_vi: "mm" } ] },
  { id: 2, ma: "KEO", ten: "Keo dán", chips: [] },
];
let n = 0;
const props = (over = {}) => ({
  tenBuoc: "Cán màng", dong: [], vatTuDm: DM as never, onChange: vi.fn(), taoUid: () => `u${++n}`, ...over,
});

describe("BuocVatTu", () => {
  it("bước chưa có vật tư thì nói rõ", () => {
    render(<BuocVatTu {...props()} />);
    expect(screen.getByText(/chưa có vật tư/i)).toBeTruthy();
  });

  it("vật tư có chip → mọc đúng ô nhập, gõ số báo ra ngoài", () => {
    const onChange = vi.fn();
    render(<BuocVatTu {...props({ onChange, dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: {} }] })} />);
    fireEvent.change(screen.getByLabelText(/Dài support/), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith([{ uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 5 } }]);
    expect(screen.getByLabelText(/Rộng support/)).toBeTruthy();
  });

  it("vật tư không chip thì không có ô nhập", () => {
    render(<BuocVatTu {...props({ dong: [{ uid: "b", vat_tu_id: 2, gia_tri_chip: {} }] })} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("xoá bớt và thêm vật tư chưa có", () => {
    const onChange = vi.fn();
    render(<BuocVatTu {...props({ onChange, dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: {} }] })} />);
    fireEvent.click(screen.getByRole("button", { name: /Xóa vật tư Support/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith([
      { uid: "a", vat_tu_id: 1, gia_tri_chip: {} }, { uid: "u1", vat_tu_id: 2, gia_tri_chip: {} }]);
  });

  it("ô để trống → bỏ khỏi gia_tri_chip (không gửi NaN)", () => {
    const onChange = vi.fn();
    render(<BuocVatTu {...props({ onChange, dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 5 } }] })} />);
    fireEvent.change(screen.getByLabelText(/Dài support/), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith([{ uid: "a", vat_tu_id: 1, gia_tri_chip: {} }]);
  });
});
```

Run `cd frontend && npx vitest run src/pages/BuocVatTu.test.tsx` → FAIL.

- [ ] **Step 2: Viết `BuocVatTu.tsx`**

```tsx
import type { Row } from "../api/rebuildCatalog";

export interface BuocVatTuDong { uid: string; vat_tu_id: number; gia_tri_chip: Record<string, number> }
interface Chip { ma: string; ten: string; don_vi?: string | null }

const chipsCua = (vt: Row | undefined): Chip[] =>
  Array.isArray(vt?.chips) ? (vt!.chips as Chip[]) : [];

interface Props {
  tenBuoc: string;
  dong: BuocVatTuDong[];
  vatTuDm: Row[];
  onChange: (next: BuocVatTuDong[]) => void;
  taoUid: () => string;
}

export default function BuocVatTu({ tenBuoc, dong, vatTuDm, onChange, taoUid }: Props) {
  const tra = new Map(vatTuDm.map((v) => [v.id, v]));
  const chuaCo = vatTuDm.filter((v) => !dong.some((d) => d.vat_tu_id === v.id));

  const setChip = (i: number, ma: string, raw: string) =>
    onChange(dong.map((d, j) => {
      if (j !== i) return d;
      const { [ma]: _bo, ...con } = d.gia_tri_chip;
      const so = Number(raw);
      return { ...d, gia_tri_chip: raw.trim() === "" || !Number.isFinite(so) ? con : { ...con, [ma]: so } };
    }));

  return (
    <div className="tg-bvt">
      <div className="tg-bvt__head">Vật tư của bước {tenBuoc}</div>
      {dong.length === 0 && <p className="tg-bvt__rong">Bước này chưa có vật tư.</p>}
      {dong.map((d, i) => {
        const vt = tra.get(d.vat_tu_id);
        const ten = vt ? String(vt.ten) : `Vật tư #${d.vat_tu_id} (đã ngừng dùng)`;
        return (
          <div className="tg-bvt__row" key={d.uid}>
            <span className="tg-bvt__ten">{ten}</span>
            <div className="tg-bvt__chips">
              {chipsCua(vt).map((c) => (
                <label key={c.ma} className="tg-bvt__chip">
                  <span>{c.ten}</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    aria-label={`${c.ten} của ${ten}`}
                    value={d.gia_tri_chip[c.ma] ?? ""}
                    placeholder="0"
                    onChange={(e) => setChip(i, c.ma, e.target.value)}
                  />
                  {c.don_vi ? <small>{c.don_vi}</small> : null}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="tg-bvt__xoa"
              aria-label={`Xóa vật tư ${ten}`}
              onClick={() => onChange(dong.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        );
      })}
      {chuaCo.length > 0 && (
        <select
          className="tg-bvt__them"
          aria-label={`Thêm vật tư vào bước ${tenBuoc}`}
          value=""
          onChange={(e) => {
            const id = Number(e.target.value);
            if (id) onChange([...dong, { uid: taoUid(), vat_tu_id: id, gia_tri_chip: {} }]);
          }}
        >
          <option value="">+ Thêm vật tư…</option>
          {chuaCo.map((v) => <option key={v.id} value={v.id}>{String(v.ten)}</option>)}
        </select>
      )}
    </div>
  );
}
```

Run lại test → pass.

- [ ] **Step 3: Kiểu API (`client.ts`)**

Thêm:

```ts
export interface BuocVatTuIn { vat_tu_id: number; thu_tu?: number; gia_tri_chip?: Record<string, number> }
export interface BuocVatTuOut { id: number; thu_tu: number; vat_tu_id: number; gia_tri_chip: Record<string, number> }
```

`ThanhPhamOut` (4077-4105) thêm `vat_tus: BuocVatTuOut[]`; `ThanhPhamIn` (4226-4242) thêm `vat_tus?: BuocVatTuIn[]`. Xoá `vat_tus` ở `ThanhPhanOut` (4164) và `ThanhPhanIn` (4287), xoá `VatTuLineOut` (4180-4189) và `VatTuLineIn` (4304-4310) (kiểm `grep -n "VatTuLine" frontend/src` không còn chỗ dùng).

- [ ] **Step 4: Màn phiếu — dữ liệu và chép từ công đoạn**

`PhieuTinhGiaDetailView.tsx`:

1. Kiểu: thay `EditableVatTu` (514-521) bằng `import type { BuocVatTuDong } from "./BuocVatTu"`; `EditableFinishing` thêm `vat_tus: BuocVatTuDong[];`; `EditableComponent` bỏ `vat_tus` (584).
2. `blankFinishing(ten, cong_doan_id, vat_tus: BuocVatTuDong[] = [])` (587-610) gán `vat_tus`.
3. Nạp danh mục vật tư cạnh `congDoans` (L1239 state, L1317 nạp): thêm state `const [vatTuDm, setVatTuDm] = useState<Row[]>([]);` và nạp `crud("/api/vat-lieu-kho/vat-tu-in-an").list(token, { size: 200 })` (đúng hàm/kiểu mà `congDoan.list` đang dùng ở L1317; lấy `.items`).
4. `addFin(cuid, cong_doan_id, ten, insertIndex, vat_tus = [])` (1438-1480) truyền `vat_tus` vào `blankFinishing`.
5. `themCongDoan` (2696-2712): tính vật tư mặc định từ công đoạn:

```tsx
    const macDinh: BuocVatTuDong[] = Array.isArray(cd?.vat_tus)
      ? (cd!.vat_tus as Array<{ vat_tu_id: number }>).map((v) => ({
          uid: nextUid(), vat_tu_id: v.vat_tu_id, gia_tri_chip: {},
        }))
      : [];
    addFin(c.uid, cd ? cd.id : null, cd ? cdName(cd) : "", insertIdx, macDinh);
```

(nhánh "+ Tự nhập…" L2699 `addFin(c.uid, null, "", insertIdx)` giữ nguyên — không có công đoạn thì không có vật tư mặc định.)
6. Chuyển đổi: `fromFinishing` (655-674) thêm `vat_tus: []` ; `toThanhPhanIn` (770-786) mỗi bước thêm `vat_tus: f.vat_tus.map((v, k) => ({ vat_tu_id: v.vat_tu_id, thu_tu: k, gia_tri_chip: v.gia_tri_chip }))` và bỏ ánh xạ `vat_tus` cấp thành phần (787); `fromThanhPhanIn` (855-872) mỗi bước `vat_tus: (f.vat_tus ?? []).map((v) => ({ uid: nextUid(), vat_tu_id: v.vat_tu_id, gia_tri_chip: v.gia_tri_chip ?? {} }))` và bỏ cấp thành phần (873); `duplicateComp` (1392-1413) sao `vat_tus` của từng bước với uid mới (bỏ dòng 1406).
7. `previewSig` (1547-1576): trong mảng `cds` thêm `f.vat_tus.map((v) => [v.vat_tu_id, JSON.stringify(v.gia_tri_chip)])` (luật dòng 1566: ô nào ảnh hưởng số engine phải vào chữ ký).

- [ ] **Step 5: Gắn khối UI + CSS**

Ngay SAU dãy chip chuỗi công đoạn (kết thúc ~L3222, trước IIFE Phí khuôn ở 3224) thêm khối: với mỗi bước `f` của `c.thanh_phams` (chỉ bước có `cong_doan_id != null` hoặc đã có `vat_tus`):

```tsx
              <div className="tg-bvt-khoi">
                {c.thanh_phams.map((f) => (
                  <BuocVatTu
                    key={f.uid}
                    tenBuoc={tenBuoc(f, congDoans) || "(công đoạn)"}
                    dong={f.vat_tus}
                    vatTuDm={vatTuDm}
                    taoUid={nextUid}
                    onChange={(next) => patchFin(c.uid, f.uid, { vat_tus: next })}
                  />
                ))}
              </div>
```

(`patchFin` nhận `Partial<EditableFinishing>` — OK.) `tinh-gia.css` thêm (dùng token màu có sẵn của file, mẫu `.tg-khuon__row`):

```css
.tg-bvt-khoi { display: grid; gap: 12px; margin-top: 12px; }
.tg-bvt { border: 1px solid var(--line, #e3e1dc); border-radius: 8px; padding: 10px 12px; }
.tg-bvt__head { font-weight: 600; margin-bottom: 6px; }
.tg-bvt__rong { color: var(--muted, #6b6b6b); margin: 4px 0; }
.tg-bvt__row { display: grid; grid-template-columns: minmax(120px, 1fr) 2fr auto; gap: 8px; align-items: center; padding: 4px 0; }
.tg-bvt__chips { display: flex; flex-wrap: wrap; gap: 8px; }
.tg-bvt__chip { display: inline-flex; align-items: center; gap: 4px; }
.tg-bvt__chip input { width: 88px; text-align: right; }
.tg-bvt__xoa { min-width: 32px; min-height: 32px; }
@media (max-width: 640px) { .tg-bvt__row { grid-template-columns: 1fr; } }
```

Import `BuocVatTu` ở đầu file. Chạy `cd frontend && npx tsc --noEmit` → exit 0; `npx vitest run src/pages/BuocVatTu.test.tsx` → pass.

- [ ] **Step 6: Xác minh luồng thật trên trình duyệt dev**

Cần có sẵn (làm TRƯỚC bằng UI, không curl): vật tư `Support` (Task 2 Step 8) và công đoạn `Bế` có vật tư `Support` ở tab "Vật tư" của công đoạn (Danh mục → Công đoạn → Bế → tab Vật tư → chọn `Support` → Lưu). Restart uvicorn. Luồng: Tính giá → tạo phiếu mới → thêm sản phẩm → ở "Chuỗi công đoạn" bấm "+ Thêm công đoạn…" chọn `Bế` → thấy dưới chuỗi khối "Vật tư của bước Bế" TỰ có `Support` với 3 ô Định lượng/Dài/Rộng → gõ 2, 3, 4 → xem "Giá vốn" bên phải: dòng nguyên vật liệu `Support` ra 24 → bấm × xoá `Support` → dòng biến mất khỏi giá vốn → "+ Thêm vật tư…" chọn lại `Support` → Lưu phiếu → đóng/mở lại phiếu: vật tư và số đã nhập còn nguyên; xoá rồi lưu rồi mở lại thì KHÔNG tự mọc lại. Báo cáo từng bước.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/BuocVatTu.tsx frontend/src/pages/BuocVatTu.test.tsx frontend/src/api/client.ts frontend/src/pages/PhieuTinhGiaDetailView.tsx frontend/src/pages/tinh-gia.css
git commit -m "Tính giá: vật tư tự hiện theo công đoạn của bước, thêm/xoá bớt, ô nhập số cho chip riêng"
```

---

### Task 5: Lệnh sản xuất — BOM lấy từ phiếu, định mức theo công thức vật tư (backend)

**Files:**
- Modify: `backend/app/models/lsx.py:364-404` (`LsxCongDoanVatTu.gia_tri_chip`)
- Modify: `backend/app/db_migrations.py` (migration `0358`)
- Modify: `backend/app/schemas/lsx.py` (`LsxBuocVatTuIn`, `LsxBuocVatTuOut`)
- Modify: `backend/app/services/lsx_service.py` (`_tinh_dong` 1262-1305; `tao` 1514-1606; `_vat_tu_bung` 613-674; `_goi_y_luong_vat_tu` 676-732; `_bung_lai_vat_tu` 1440-1479; `_bung_vat_tu_cong_doan` 1481-1512; `_cong_doan_dict` 2341-2350; `_soi_danh_muc` 2710-2768; `dong_bo_danh_muc` 2787-2830; `replace_routing` 3001-3060, 3093)
- Modify: `docs/DB_SCHEMA.md` (mục `lsx_cong_doan_vat_tu`)
- Test: `backend/tests/test_lsx_vat_tu_tu_phieu.py`; sửa `test_lsx_service.py` (~1180/1310/1324/3572), `test_cong_thuc_ve_cong_doan.py` (88/111/140), `test_ke_hoach_vat_tu.py` (~1328), `test_migration_*` mới

**Interfaces:**
- Consumes: `row["vat_tus"]` của bước từ `_resolve_thanh_phan` (Task 3); `VatTuInAn.cong_thuc_dinh_muc`, `.chips` (Task 1).
- Produces:
  - `LsxCongDoanVatTu.gia_tri_chip: dict | None` (JSON)
  - `LsxService._vat_tu_bung(self, cd_obj, buoc, quy_cach, dong_nguon: list[tuple[int, dict]] | None = None) -> tuple[list[dict], list[str]]` — giữ nguyên ba tham số vị trí hiện có; `dong_nguon=None` ⇒ lấy vật tư của `cd_obj.vat_tus` (danh mục công đoạn) với chip rỗng; dòng trả thêm khoá `gia_tri_chip`
  - `calc["routing"][i]["vat_tus"] = [{"vat_tu_id": int, "gia_tri_chip": dict}]`
  - API `LsxBuocVatTuOut` có thêm `gia_tri_chip: dict[str, float]` và `chips: list[{ma, ten, don_vi}]`; `LsxBuocVatTuIn.so_luong` thành tuỳ chọn cho `hang_loai="vat_tu"` (máy tự tính), bắt buộc cho giấy.

> **Trước khi sửa:** đọc nguyên văn các hàm sau trong `lsx_service.py` vì plan chỉ quote phần chắc chắn: `_bung_lai_vat_tu` (L1440-1479), `_bung_vat_tu_cong_doan` (L1481-1512), `_soi_danh_muc` (L2710-2768), `dong_bo_danh_muc` (L2787-2830), `replace_routing` (L2835-3114, riêng 3001-3060 và 3093). Quy tắc áp dụng thống nhất cho mọi nơi: **nguồn vật tư của bước = (a) các dòng vật tư khác đang có ở bước (giữ chip) khi công đoạn không đổi; (b) danh sách vật tư của công đoạn trong danh mục với chip rỗng khi công đoạn mới được chọn; (c) lúc `tao` = vật tư của bước tương ứng trong phiếu (khớp theo VỊ TRÍ `thu_tu`, chưa có khoá khác).**

- [ ] **Step 1: Test lệnh lấy vật tư + chip từ phiếu (fail)**

Fixture và helper (`db`, `orders`, `lsx_svc`, `admin`, `customer`, `_ptg_2_san_pham`, `_don_da_chuyen_sx`) lấy từ `test_lsx_service.py` — import lại, không chép. `_ptg_2_san_pham` dựng phiếu "Hộp" có 3 bước `In offset` / `Bế` / `Dán hộp` (thứ tự này = `thu_tu` 0/1/2 ở cả phiếu lẫn lệnh); các test dưới dùng bước **Dán hộp** để không dính logic khuôn của bước Bế. Viết `backend/tests/test_lsx_vat_tu_tu_phieu.py`:

```python
"""Lệnh sản xuất lấy vật tư + chip từ phiếu tính giá, định mức tính bằng công thức của vật tư."""
from __future__ import annotations

import pytest

from tests.test_lsx_service import (  # noqa: F401 — fixture + helper dùng chung
    _don_da_chuyen_sx,
    _ptg_2_san_pham,
    admin,
    customer,
    db,
    lsx_svc,
    orders,
)

from app.models.cong_doan import CongDoan, CongDoanVatTu
from app.models.don_vi_do import DonViDo
from app.models.phieu_tinh_gia import PhieuBuocVatTu
from app.models.vat_lieu_kho import VatTuChip, VatTuInAn
from app.schemas.lsx import LsxCongDoanIn
from app.services.bien_cong_thuc import quy_cach_bien

CT_DAI_RONG = "dai_support * rong_support / 1000000"


def _support(db, *, cong_thuc=CT_DAI_RONG) -> VatTuInAn:
    db.add(DonViDo(ma="m2_sup", ten="m² support"))
    vt = VatTuInAn(ma="SUP-T", ten="Support", don_vi_gia="m2_sup", don_gia=1_000,
                   cong_thuc_dinh_muc=cong_thuc)
    vt.chips = [
        VatTuChip(ma="dai_support", ten="Dài support", don_vi="mm", thu_tu=0),
        VatTuChip(ma="rong_support", ten="Rộng support", don_vi="mm", thu_tu=1),
    ]
    db.add(vt)
    db.flush()
    return vt


def _gan_vao_buoc_phieu(db, ptg, ten_buoc: str, vt: VatTuInAn, chip: dict) -> None:
    hop = ptg.thanh_phans[0]
    buoc = next(f for f in hop.thanh_phams if f.ten == ten_buoc)
    buoc.vat_tus.append(PhieuBuocVatTu(vat_tu_id=vt.id, thu_tu=0, gia_tri_chip=chip))
    db.commit()


def _tao_lenh_hop(db, orders, lsx_svc, admin, customer, ptg):
    d = _don_da_chuyen_sx(db, orders, admin, customer, ptg)
    line = lsx_svc.preview(d.id)["lines"][0]
    created = lsx_svc.tao(order_id=d.id, order_line_ids=[line["order_line_id"]], actor=admin)
    return lsx_svc.get(created[0].id)


def _buoc(lsx, ten="Dán hộp"):
    return next(c for c in lsx.cong_doans if c.ten == ten)


def test_tao_lenh_bung_vat_tu_cua_buoc_voi_chip_tu_phieu(db, orders, lsx_svc, admin, customer):
    ptg = _ptg_2_san_pham(db)
    vt = _support(db)
    _gan_vao_buoc_phieu(db, ptg, "Dán hộp", vt, {"dai_support": 500, "rong_support": 400})

    lsx = _tao_lenh_hop(db, orders, lsx_svc, admin, customer, ptg)

    buoc = _buoc(lsx)
    assert [v.vat_tu_id for v in buoc.vat_tus] == [vt.id]
    v = buoc.vat_tus[0]
    assert v.gia_tri_chip == {"dai_support": 500, "rong_support": 400}
    assert float(v.so_luong) == pytest.approx(0.2)            # 500 × 400 / 1_000_000
    assert v.tu_dong is True
    assert all(not c.vat_tus for c in lsx.cong_doans if c.ten != "Dán hộp")


def test_phieu_khong_gan_vat_tu_thi_lenh_khong_bung_tu_danh_muc_cong_doan(
    db, orders, lsx_svc, admin, customer,
):
    """Phiếu là nơi CHỐT vật tư của bước: danh mục công đoạn có Support nhưng phiếu đã xoá thì lệnh
    KHÔNG tự đẻ lại."""
    ptg = _ptg_2_san_pham(db)
    vt = _support(db)
    cd_dan = db.query(CongDoan).filter(CongDoan.ma == "CD-DAN-T").one()
    cd_dan.vat_tus.append(CongDoanVatTu(vat_tu_id=vt.id, thu_tu=0))
    db.commit()

    lsx = _tao_lenh_hop(db, orders, lsx_svc, admin, customer, ptg)

    assert _buoc(lsx).vat_tus == []


def test_cong_thuc_dung_sl_vao_thi_doi_so_luong_la_doi_dinh_muc_va_chip_giu_nguyen(
    db, orders, lsx_svc, admin, customer,
):
    ptg = _ptg_2_san_pham(db)
    vt = _support(db, cong_thuc="sl_vao * dai_support / 1000000")
    _gan_vao_buoc_phieu(db, ptg, "Dán hộp", vt, {"dai_support": 500})
    lsx = _tao_lenh_hop(db, orders, lsx_svc, admin, customer, ptg)
    buoc = _buoc(lsx)
    cd_dan = db.query(CongDoan).filter(CongDoan.ma == "CD-DAN-T").one()
    nguon = [(vt.id, {"dai_support": 500})]

    rows, _ = lsx_svc._vat_tu_bung(cd_dan, buoc, quy_cach_bien(lsx), dong_nguon=nguon)
    assert rows[0]["so_luong"] == pytest.approx(round(float(buoc.so_luong_vao) * 500 / 1_000_000, 3))
    assert rows[0]["gia_tri_chip"] == {"dai_support": 500}

    buoc.so_luong_vao = float(buoc.so_luong_vao) * 2
    rows2, _ = lsx_svc._vat_tu_bung(cd_dan, buoc, quy_cach_bien(lsx), dong_nguon=nguon)
    assert rows2[0]["so_luong"] == pytest.approx(rows[0]["so_luong"] * 2, abs=0.002)


def test_chip_thieu_so_thi_khong_bung_va_noi_ro_chip_nao(db, orders, lsx_svc, admin, customer):
    ptg = _ptg_2_san_pham(db)
    vt = _support(db)
    lsx = _tao_lenh_hop(db, orders, lsx_svc, admin, customer, ptg)
    cd_dan = db.query(CongDoan).filter(CongDoan.ma == "CD-DAN-T").one()

    rows, canh_bao = lsx_svc._vat_tu_bung(
        cd_dan, _buoc(lsx), quy_cach_bien(lsx),
        dong_nguon=[(vt.id, {"dai_support": 500})])          # thiếu "Rộng support"

    assert rows == []                                         # công thức ra 0 ⇒ không bung
    assert any("Rộng support" in c and "chưa có số" in c for c in canh_bao)


def test_khong_co_nguon_phieu_thi_bung_tu_danh_muc_cong_doan_voi_chip_rong(
    db, orders, lsx_svc, admin, customer,
):
    """Lệnh không có phiếu (hoặc bài ghép): `dong_nguon=None` ⇒ lấy vật tư của công đoạn trong danh
    mục, chip = 0. Công thức không dùng chip thì vẫn ra số."""
    ptg = _ptg_2_san_pham(db)
    vt = _support(db, cong_thuc="sl_vao / 40000")
    cd_dan = db.query(CongDoan).filter(CongDoan.ma == "CD-DAN-T").one()
    cd_dan.vat_tus.append(CongDoanVatTu(vat_tu_id=vt.id, thu_tu=0))
    db.commit()
    lsx = _tao_lenh_hop(db, orders, lsx_svc, admin, customer, ptg)
    buoc = _buoc(lsx)

    rows, _ = lsx_svc._vat_tu_bung(cd_dan, buoc, quy_cach_bien(lsx))      # không truyền dong_nguon

    assert [r["vat_tu_id"] for r in rows] == [vt.id]
    assert rows[0]["gia_tri_chip"] == {}
    assert rows[0]["so_luong"] == pytest.approx(round(float(buoc.so_luong_vao) / 40_000, 3))


def test_replace_routing_bo_so_luong_gui_len_cho_vat_tu_khac_va_tinh_lai(
    db, orders, lsx_svc, admin, customer,
):
    ptg = _ptg_2_san_pham(db)
    vt = _support(db)
    lsx = _tao_lenh_hop(db, orders, lsx_svc, admin, customer, ptg)

    lsx_svc.replace_routing(lsx_id=lsx.id, actor=admin, rows_in=[
        LsxCongDoanIn(
            ten="Dán hộp", nhom="finishing", so_luong_vao=1000, so_luong_ra=1000, don_vi_vao="cai",
            phu_thuoc_step_keys=[],
            vat_tus=[{"vat_tu_id": vt.id, "so_luong": 999, "tu_dong": False,
                      "gia_tri_chip": {"dai_support": 500, "rong_support": 400}}],
        ),
    ])

    buoc = _buoc(lsx_svc.get(lsx.id))
    assert float(buoc.vat_tus[0].so_luong) == pytest.approx(0.2)    # số 999 gửi lên bị bỏ
    assert buoc.vat_tus[0].gia_tri_chip == {"dai_support": 500, "rong_support": 400}
```

Chạy `python -m pytest backend/tests/test_lsx_vat_tu_tu_phieu.py -q` → FAIL (chưa có cột `gia_tri_chip`, `dong_nguon`, `cong_thuc_dinh_muc` đọc ở lệnh).

- [ ] **Step 2: Model + migration `0358` (+ test)**

`models/lsx.py` trong `LsxCongDoanVatTu` thêm:

```python
    # CHIP của dòng này (spec 2026-10-01 Đ5): {mã chip: số}, CHÉP từ phiếu tính giá lúc tạo lệnh —
    # không tra ngược phiếu lúc chạy, để phiếu sửa sau không làm đổi lệnh đã lập. Dùng để tính
    # `so_luong` bằng `vat_tu_in_an.cong_thuc_dinh_muc` mỗi lần bung/bung lại.
    gia_tri_chip: Mapped[dict | None] = mapped_column(JSON, nullable=True)
```

Migration `0358` — trước hết `grep -n "thay_the_ids" backend/app/db_migrations.py` (mg `0239`) để COPY ĐÚNG kiểu DDL JSON đang dùng cho Postgres/SQLite, rồi:

```python
def _migrate_lsx_vat_tu_gia_tri_chip(db: Session) -> None:
    """0358 — cột `gia_tri_chip` (JSON) cho dòng vật tư của bước lệnh. Idempotent; không backfill
    (lệnh cũ không có chip, định mức đã tính giữ nguyên)."""
    insp = inspect(db.get_bind())
    if "lsx_cong_doan_vat_tu" not in set(insp.get_table_names()):
        return
    if "gia_tri_chip" not in _existing_columns(insp, "lsx_cong_doan_vat_tu"):
        db.execute(text("ALTER TABLE lsx_cong_doan_vat_tu ADD COLUMN gia_tri_chip JSON"))   # kiểu theo mg 0239
    db.commit()


MIGRATIONS.append(("0358_lsx_vat_tu_gia_tri_chip", _migrate_lsx_vat_tu_gia_tri_chip))
```

Test `test_migration_0358_lsx_vat_tu_chip.py` theo khuôn 4 test (có cột / chạy lại / DB trắng / chưa có bảng). Run → pass. `docs/DB_SCHEMA.md` thêm `gia_tri_chip` vào mục `lsx_cong_doan_vat_tu`.

- [ ] **Step 3: `_tinh_dong` mang vật tư của bước; `tao` chép chip**

`_tinh_dong` (vòng `for i, row in enumerate(resolved.get("thanh_phams") or [])`, dict `routing.append({...})` ~L1262-1305) thêm khoá:

```python
            "vat_tus": [
                {"vat_tu_id": v["vat_tu_id"], "gia_tri_chip": dict(v.get("gia_tri_chip") or {})}
                for v in (row.get("vat_tus") or [])
            ],
```

Mục `quy_cach["vat_tus"]` (L1244-1247, chỉ hiển thị "Vật tư in ấn" ở `LsxDetailView`) đổi nguồn: gom từ `resolved["thanh_phams"][*]["vat_tus"]` (`[{"ten": v["ten"], "so_luong": None}]`) để màn chi tiết lệnh không rỗng; kiểm `LsxDetailView.tsx:664/1395` còn đọc đúng khoá.

`tao` (L1585-1592): sau `_ap_chuoi_nguoc(lsx)` gọi `self._bung_vat_tu_cong_doan(lsx, quy_cach_bien(lsx), nguon=calc["routing"])` thay lời gọi cũ.

- [ ] **Step 4: `_vat_tu_bung` đọc công thức của vật tư + chip**

Thay hàm (L613-674) — thân cũ giữ gần nguyên, đổi nguồn danh sách và công thức. Trước khi gõ: đọc chữ ký THẬT của `_luong_vat_tu` (L740-784) và `_vat_tu_active` rồi truyền công thức của vật tư vào đúng tham số đang nhận công thức dòng (đoạn dưới viết theo `_luong_vat_tu(dvt, ctx, mat=…, cong_thuc=…)`; tên tham số có thể khác). Chữ ký `_vat_tu_bung(cd_obj, buoc, quy_cach)` và kiểu trả `(rows, canh_bao)` được GIỮ để các nơi gọi cũ (`bai_ghep_service.py`, test) không vỡ:

```python
    def _vat_tu_bung(self, cd_obj, buoc, quy_cach: dict | None,
                     dong_nguon: list[tuple[int, dict]] | None = None) -> tuple[list[dict], list[str]]:
        """Vật tư của MỘT BƯỚC kèm số lượng tính cho ĐÚNG bước này — nền BOM.

        01/10/2026 (spec Đ5): danh sách + chip do PHIẾU TÍNH GIÁ chốt (`dong_nguon` = [(vat_tu_id,
        {mã chip: số})]); `dong_nguon=None` (lệnh không có phiếu, bài ghép, đổi công đoạn) ⇒ lấy danh sách
        vật tư của `cd_obj` trong danh mục với chip rỗng. Định mức tính bằng CÔNG THỨC CỦA CHÍNH VẬT TƯ
        (`vat_tu_in_an.cong_thuc_dinh_muc`) với ngữ cảnh lệnh + `sl_vao`/`sl_ra`/`so_luot_chay` của bước +
        chip. Trước đó công thức treo ở dòng công đoạn × vật tư (`cong_doan_vat_tu.cong_thuc_luong`, nay
        ngưng đọc). KHÔNG ĐOÁN: chưa khai công thức → bỏ dòng + trả lý do. Trả `([], [])` khi chưa đủ ngữ cảnh."""
        if buoc is None:
            return [], []
        if dong_nguon is None:
            dong_nguon = [(v.vat_tu_id, {}) for v in (getattr(cd_obj, "vat_tus", None) or [])]
        if not dong_nguon:
            return [], []
        sl = _f(getattr(buoc, "so_luong_vao", 0))
        can = {vid for vid, _ in dong_nguon}
        mats = {m.id: m for m in self._vat_tu_active() if m.id in can}
        base = {**ngu_canh_lenh(quy_cach or {}), **MAC_DINH_TANG_LENH,
                "sl_vao": sl, "sl_ra": _f(getattr(buoc, "so_luong_ra", 0)),
                "so_luot_chay": float(max(int(getattr(buoc, "so_luot_chay", 1) or 1), 1))}
        ra: list[dict] = []
        canh_bao: list[str] = []
        for vid, chip_val in dong_nguon:
            mat = mats.get(vid)
            if mat is None:
                continue        # đã ngừng dùng — danh mục là nguồn sống
            dvt = (mat.don_vi_gia or "").strip()
            if not dvt:
                canh_bao.append(f"{mat.ten}: chưa chọn đơn vị tính ở danh mục Vật tư khác.")
                continue
            chip_val = dict(chip_val or {})
            ctx = {**base, **{c.ma: _f(chip_val.get(c.ma)) for c in mat.chips}}
            for c in mat.chips:
                if _f(chip_val.get(c.ma)) == 0 and re.search(rf"\b{re.escape(c.ma)}\b", mat.cong_thuc_dinh_muc or ""):
                    canh_bao.append(f"{mat.ten}: chip '{c.ten}' chưa có số (nhập ở phiếu tính giá) — tính theo 0.")
            so_luong, dien_giai, ly_do = self._luong_vat_tu(
                dvt, ctx, mat=mat, cong_thuc=(mat.cong_thuc_dinh_muc or ""))
            if so_luong is None:
                canh_bao.append(f"{mat.ten}: {ly_do}")
                continue
            ra.append({
                "hang_loai": HANG_VAT_TU, "vat_tu_id": mat.id, "ma": mat.ma, "ten": mat.ten,
                "don_vi": dvt, "so_luong": round(so_luong, 3), "dien_giai": dien_giai,
                "gia_tri_chip": chip_val,
            })
        return ra, canh_bao
```

Sửa thông điệp lý do trong `_luong_vat_tu` (L740-784) từ "…Mở danh mục Công đoạn → …" thành "chưa khai công thức định mức. Mở danh mục Vật tư khác → <tên> → tab Công thức định mức." (tìm chuỗi trong hàm; test cũ so chuỗi thì sửa theo).

- [ ] **Step 5: Các nơi gọi `_vat_tu_bung`**

Với mỗi nơi, dựng `dong_nguon` theo quy tắc ở khung "Trước khi sửa":

- `_bung_vat_tu_cong_doan(self, lsx, quy_cach, nguon=None)` (L1481-1512): với bước thứ `idx` (sắp theo `thu_tu`), `dong_nguon = [(v["vat_tu_id"], v["gia_tri_chip"]) for v in nguon[idx]["vat_tus"]]` nếu `nguon` và `idx < len(nguon)`; không có `nguon` (lệnh không có phiếu / bài ghép) thì `[(v.vat_tu_id, {}) for v in cd_obj.vat_tus]` (danh mục công đoạn, chip rỗng). Ghi dòng như cũ nhưng thêm `gia_tri_chip=r["gia_tri_chip"]`. (Bước thuê ngoài vẫn bỏ qua như cũ.)
- `_bung_lai_vat_tu(self, lsx, doi_cd)` (L1440-1479): TRƯỚC khi xoá dòng `tu_dong`, chụp `cu = [(v.vat_tu_id, dict(v.gia_tri_chip or {})) for v in bước.vat_tus if v.hang_loai == HANG_VAT_TU and v.tu_dong]`; nguồn = `cu` nếu công đoạn của bước KHÔNG đổi, ngược lại = danh mục công đoạn mới với chip rỗng. Giữ `flush` giữa xoá và chèn (UNIQUE). Ghi `gia_tri_chip` khi tạo `LsxCongDoanVatTu`.
- `_soi_danh_muc` (L2740) và `dong_bo_danh_muc` (L2814): `dong_nguon` = các dòng vật tư khác đang có của bước (giữ chip); phần "lệch" nay chỉ còn nghĩa "định mức lưu ≠ định mức tính lại từ công thức hiện hành" — bỏ nhánh so sánh danh sách vật tư với danh mục công đoạn (BOM do phiếu chốt, danh mục công đoạn đổi sau không còn là lệch).
- `_goi_y_luong_vat_tu(self, buoc, quy_cach)` (L676-732): bỏ `ct_theo_mon` từ `cd_obj.vat_tus`; với món khác dùng `mat.cong_thuc_dinh_muc`, chip lấy từ dòng hiện có của bước với cùng `vat_tu_id` (nếu có) hoặc 0. Chữ ký giữ nguyên (`bai_ghep_service.py:981,1645` và test gọi trực tiếp).

- [ ] **Step 6: `replace_routing` — định mức không nhập tay**

Trong khối dựng `row.vat_tus` từ payload (L3001-3060): với `hang_loai == "vat_tu"`, KHÔNG dùng `item["so_luong"]`; lấy `gia_tri_chip = item.get("gia_tri_chip") or {}`, gọi `_vat_tu_bung(buoc_tạm, quy_cach, [(vat_tu_id, gia_tri_chip)])` và ghi `so_luong` kết quả (nếu không tính được: giữ `so_luong` cũ của dòng cùng `vat_tu_id`, chưa có thì 0, và đẩy lý do vào cảnh báo trả về như cách hàm đang trả cảnh báo khác); luôn ghi `gia_tri_chip`. Giấy giữ nguyên. Schema `schemas/lsx.py`:

```python
class LsxBuocVatTuIn(BaseModel):
    hang_loai: Literal["giay", "vat_tu"] = "vat_tu"       # GIỮ mặc định hiện có (client cũ không gửi)
    vat_tu_id: int
    so_luong: float | None = Field(default=None, gt=0)    # vật tư khác: máy tự tính, bỏ qua số gửi lên
    tu_dong: bool = False
    kho_rong: int = 0
    kho_dai: int = 0
    gia_tri_chip: dict[str, float] | None = None

    @model_validator(mode="after")
    def _kho_giay(self):                                   # validator HIỆN CÓ, thêm một nhánh đòi số lượng
        if self.hang_loai != "giay":
            self.kho_rong, self.kho_dai = 0, 0
            return self
        if self.so_luong is None:
            raise ValueError("Dòng giấy phải có số lượng.")
        kr, kd = chuan_kho(self.kho_rong, self.kho_dai)
        if not (kr and kd):
            raise ValueError("Dòng giấy phải có khổ (rộng × dài, mm).")
        self.kho_rong, self.kho_dai = kr, kd
        return self
```

Hợp nhất vào validator `_kho_giay` đang có ở `schemas/lsx.py:126-135`, không thêm validator thứ hai. Test `test_lsx_service.py:1195-1196` vẫn gửi `so_luong` cho vật tư khác — hợp lệ (server bỏ số đó). `LsxBuocVatTuOut` thêm `gia_tri_chip: dict[str, float] = Field(default_factory=dict)` và `chips: list[dict] = Field(default_factory=list)`. `_cong_doan_dict` (L2341-2348) xuất thêm hai khoá: `"gia_tri_chip": dict(vt.gia_tri_chip or {})`, `"chips": [{"ma": c.ma, "ten": c.ten, "don_vi": c.don_vi} for c in (mat.chips if mat else [])]` (tra `mat` từ `_vat_tu_active()` — đã có map sẵn ở hàm hay dựng một lần ngoài vòng).

- [ ] **Step 7: Sửa các test cũ + chạy**

Test cũ dựng định mức bằng `cong_doan_vat_tu.cong_thuc_luong` (`test_lsx_service.py` ~1180/1310/1324/3572, `test_cong_thuc_ve_cong_doan.py` 88/111/140, `test_ke_hoach_vat_tu.py` ~1328, và mọi nơi `grep -rn "cong_thuc_luong" backend/tests`): đổi fixture để đặt `cong_thuc_dinh_muc` trên `VatTuInAn` và danh sách vật tư ở phiếu/công đoạn. Chạy lần lượt (mỗi file, không cả bộ):

```
python -m pytest backend/tests/test_lsx_vat_tu_tu_phieu.py -q
python -m pytest backend/tests/test_lsx_service.py -q
python -m pytest backend/tests/test_cong_thuc_ve_cong_doan.py backend/tests/test_ke_hoach_vat_tu.py backend/tests/test_bai_ghep_service.py -q
python -m pytest backend/tests/test_schema_documented.py backend/tests/test_migration_0358_lsx_vat_tu_chip.py -q
```

Expected: pass. (Nếu `test_bai_ghep_service.py` không tồn tại, dùng `grep -ln "_goi_y_luong_vat_tu\|BaiGhepCongDoanVatTu" backend/tests` để chọn đúng file bài ghép.)

- [ ] **Step 8: Commit**

```bash
git status
git add backend/app/models/lsx.py backend/app/db_migrations.py backend/app/schemas/lsx.py backend/app/services/lsx_service.py docs/DB_SCHEMA.md backend/tests/test_lsx_vat_tu_tu_phieu.py backend/tests/test_migration_0358_lsx_vat_tu_chip.py backend/tests/test_lsx_service.py backend/tests/test_cong_thuc_ve_cong_doan.py backend/tests/test_ke_hoach_vat_tu.py
git commit -m "Lệnh sản xuất: BOM bước lấy vật tư + chip từ phiếu, định mức tính bằng công thức của vật tư (mg 0358)"
```

---

### Task 6: Lệnh sản xuất — tab Vật tư của bước chỉ đọc (frontend)

**Files:**
- Modify: `frontend/src/api/client.ts` (`LsxCongDoan` ~2705-2776, `LsxCongDoanBody` ~2777-2796)
- Modify: `frontend/src/pages/lsxBuoc.ts` (`EditRow`, `toEdit` 143-196, `toBody` 342-392)
- Modify: `frontend/src/pages/LsxBuocDrawer.tsx` (tab "Vật tư" 871-1149; ô định mức 1048-1064)
- Test: `frontend/src/pages/lsxBuoc.test.ts` (thêm), `frontend/src/pages/LsxBuocDrawer.test.tsx` (nếu có; không thì thêm ca vào test hiện có của lệnh)

**Interfaces:**
- Consumes: `LsxBuocVatTuOut.gia_tri_chip`, `.chips` (Task 5).
- Produces: dòng vật tư khác trên drawer: định mức hiển thị chữ (không `<input>`), chip hiển thị `Tên: số đơn vị`; `toBody` không gửi `so_luong` cho vật tư khác, gửi `gia_tri_chip`.

- [ ] **Step 1: Test `toBody` (fail)**

Thêm vào `lsxBuoc.test.ts`, theo khuôn test hiện có của file (dùng `emptyRow`/`toEdit`):

```ts
it("toBody: vật tư khác gửi chip, KHÔNG gửi so_luong; giấy vẫn gửi so_luong", () => {
  const r = { ...emptyRow(), vat_tus: [
    { hang_loai: "vat_tu", vat_tu_id: 1, so_luong: "0.2", tu_dong: true, gia_tri_chip: { dai_support: 500 }, chips: [] },
    { hang_loai: "giay", vat_tu_id: 9, so_luong: "10", tu_dong: false, kho_rong: 0, kho_dai: 0 },
  ] } as never;
  const body = toBody([r])[0];
  expect(body.vat_tus![0]).toEqual({ hang_loai: "vat_tu", vat_tu_id: 1, tu_dong: true, gia_tri_chip: { dai_support: 500 } });
  expect(body.vat_tus![1].so_luong).toBe(10);
});
```

(đối chiếu chữ ký `toBody` thật ở `lsxBuoc.ts:342`.) Run `npx vitest run src/pages/lsxBuoc.test.ts` → FAIL.

- [ ] **Step 2: Kiểu + `toEdit`/`toBody`**

`client.ts`: dòng vật tư của `LsxCongDoan` (2751-2754) thêm `gia_tri_chip?: Record<string, number>; chips?: Array<{ma: string; ten: string; don_vi?: string | null}>`; `LsxCongDoanBody.vat_tus` (2793-2794) `so_luong?: number` (tuỳ chọn) + `gia_tri_chip?: Record<string, number>`. `lsxBuoc.ts`: `toEdit` mang `gia_tri_chip`/`chips` sang `EditRow`; `toBody` (379-384): với `hang_loai === "vat_tu"` trả `{hang_loai, vat_tu_id, tu_dong, gia_tri_chip}` (không `so_luong`), với giấy giữ `so_luong`/`kho_*` như cũ.

Run test Step 1 → pass.

- [ ] **Step 3: Drawer — chỉ đọc**

`LsxBuocDrawer.tsx`: ở cột "ĐỊNH MỨC TIÊU HAO" (L1048-1064) với dòng `hang_loai === "vat_tu"` thay `<input type="number" …>` bằng chữ `<strong>{v.so_luong}</strong> {don_vi}` kèm badge "Tự tính" (đã có badge L1041-1045) và dưới tên vật tư hiện dòng chip chỉ đọc:

```tsx
{(v.chips ?? []).length > 0 && (
  <div className="lsx-vt-chip">
    {(v.chips ?? []).map((c) => (
      <span key={c.ma}>{c.ten}: <b>{v.gia_tri_chip?.[c.ma] ?? 0}</b>{c.don_vi ? ` ${c.don_vi}` : ""}</span>
    ))}
  </div>
)}
```

Giấy giữ nguyên ô nhập (L978-1005, 1048-1064 nhánh giấy). Bỏ nút "Dùng số này" (L1014-1031) và nút "Đồng bộ tất cả theo công thức" (L905-933) cho vật tư khác nếu chúng chỉ phục vụ nhập tay; giữ nút xoá dòng và thanh "Thêm vật tư" (dòng thêm tay có chip = 0, server cảnh báo). Class `.lsx-vt-chip` thêm vào CSS đang dùng của drawer (cùng file css với `LsxBuocDrawer`, tìm bằng `grep -rn "lsx-" frontend/src/pages/*.css | head`): `display:flex; flex-wrap:wrap; gap:4px 12px; color:var(--muted); font-size:12px;`.

- [ ] **Step 4: Kiểm kiểu + test**

`cd frontend && npx tsc --noEmit` (exit 0); `npx vitest run src/pages/lsxBuoc.test.ts src/pages/lsxVatTu.test.ts` → pass.

- [ ] **Step 5: Xác minh luồng thật trên trình duyệt dev**

Restart uvicorn. Luồng: Tính giá → phiếu có sản phẩm với bước `Bế` mang `Support` (chip 2/3/4, hoặc dài 500/rộng 400 theo công thức định mức đã khai) → lưu → chốt thành đơn/báo giá theo luồng bán hàng hiện hành tới khi tạo được Lệnh sản xuất từ dòng đơn đó → mở Lệnh → công đoạn `Bế` → tab "Vật tư": thấy `Support`, các chip chỉ đọc đúng số đã nhập ở phiếu, định mức = kết quả công thức định mức, KHÔNG sửa tay được → đổi số lượng của lệnh (nếu công thức dùng `sl_vao`) và lưu → định mức tính lại, chip giữ nguyên. Báo cáo từng bước đã bấm/gõ/thấy.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/lsxBuoc.ts frontend/src/pages/lsxBuoc.test.ts frontend/src/pages/LsxBuocDrawer.tsx
git commit -m "Lệnh sản xuất: tab Vật tư của bước hiện chip từ phiếu, định mức tự tính chỉ đọc"
```

---

### Task 7: Công đoạn — bỏ ô định mức ở dòng vật tư

> Làm SAU Task 5 (lệnh đã thôi đọc `cong_doan_vat_tu.cong_thuc_luong`).

**Files:**
- Modify: `backend/app/schemas/cong_doan.py:9-27, 119, 162` (`CongDoanVatTuIn/Row`)
- Modify: `backend/app/services/cong_doan_service.py:308-315, 364-368`
- Modify: `backend/app/repositories/cong_doan_repo.py:167-184` (`_replace_vat_tu`)
- Modify: `backend/app/services/catalog_excel_specs.py:497-503, 407-419`
- Modify: `backend/app/services/nhat_ky_danh_muc.py:490-544`
- Modify: `frontend/src/pages/danh-muc/fields/VatTuCongDoan.tsx` (cột công thức + `FormulaPopover`), `frontend/src/pages/danh-muc/types.ts:279` (`VatTuCongDoanRow`)
- Modify: `docs/DB_SCHEMA.md` (mục `cong_doan_vat_tu`: ghi cột `cong_thuc_luong` NGƯNG DÙNG từ 01/10/2026)
- Test: `backend/tests/test_cong_doan_bon_cong_thuc_http.py`, `test_cong_doan.py`, `test_nhat_ky_cong_doan_bang_con.py`, `test_import_excel.py`

**Interfaces:** Consumes: Task 5 (lệnh không đọc `cong_thuc_luong`). Produces: `CongDoanVatTuIn/Row` chỉ còn `vat_tu_id` (+ `id` ở Row); cột DB `cong_doan_vat_tu.cong_thuc_luong` giữ nguyên nhưng không còn ai đọc/ghi.

- [ ] **Step 1: Test hợp đồng mới (fail)**

Trong `test_cong_doan_bon_cong_thuc_http.py` (đọc khuôn test hiện có) thêm: PUT công đoạn với `vat_tus: [{"vat_tu_id": X, "cong_thuc_luong": "sl_vao"}]` → 200, response `vat_tus[0]` KHÔNG có khoá `cong_thuc_luong`, và DB (`CongDoanVatTu.cong_thuc_luong`) vẫn `None`. Sửa các test cũ khẳng định `cong_thuc_luong` được lưu/kiểm (`grep -n cong_thuc_luong backend/tests/test_cong_doan*.py backend/tests/test_nhat_ky_cong_doan_bang_con.py backend/tests/test_import_excel.py`) cho khớp hợp đồng mới. Run → FAIL.

- [ ] **Step 2: Backend**

`CongDoanVatTuIn`/`Row`: xoá field `cong_thuc_luong` (Pydantic bỏ khoá thừa client gửi — đúng ý). `cong_doan_service.py`: xoá lời gọi `_kiem_o` cho ô định mức dòng vật tư (L364-368). `_replace_vat_tu` (L167-184): chỉ gán `vat_tu_id`, `thu_tu`. Excel `CONG_DOAN` sheet con "Vật tư công đoạn" (L497-503): bỏ cột `Công thức định mức`; `_giu_vat_tu_cong_doan` (L407-419) bỏ phần gán lại công thức. `nhat_ky_danh_muc._con_cua_cong_doan` (490-544): bỏ phần in công thức định mức của dòng vật tư.

- [ ] **Step 3: Frontend**

`VatTuCongDoan.tsx`: bỏ cột công thức + `FormulaPopover` (mở file thấy ở dòng bấm ô công thức); bảng còn: Vật tư (chọn từ danh mục), nút xoá, thêm. Thêm dòng chú thích dưới bảng: "Định mức khai ở danh mục Vật tư → tab Công thức định mức." `types.ts:279` `VatTuCongDoanRow { vat_tu_id: number }`. Cập nhật `CatalogDrawer.test.tsx`/`rebuildCatalogConfigs.test.tsx` nếu có assert về cột công thức dòng vật tư (grep `cong_thuc_luong frontend/src`).

- [ ] **Step 4: Chạy**

```
python -m pytest backend/tests/test_cong_doan_bon_cong_thuc_http.py backend/tests/test_cong_doan.py backend/tests/test_nhat_ky_cong_doan_bang_con.py backend/tests/test_import_excel.py backend/tests/test_schema_documented.py -q
cd frontend && npx tsc --noEmit && npx vitest run src/pages/danh-muc src/pages/rebuildCatalogConfigs.test.tsx
```

Expected: pass.

- [ ] **Step 5: Xác minh luồng thật trên trình duyệt dev**

Restart uvicorn. Danh mục → Công đoạn → mở `Bế` → tab "Vật tư": bảng chỉ có cột chọn vật tư (không còn ô công thức/ô nhập định mức) → thêm `Support` → Lưu → mở lại thấy `Support`. Rồi tạo phiếu mới thêm công đoạn `Bế` (Task 4 Step 6) để thấy `Support` tự hiện. Báo cáo từng bước.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/cong_doan.py backend/app/services/cong_doan_service.py backend/app/repositories/cong_doan_repo.py backend/app/services/catalog_excel_specs.py backend/app/services/nhat_ky_danh_muc.py frontend/src/pages/danh-muc/fields/VatTuCongDoan.tsx frontend/src/pages/danh-muc/types.ts docs/DB_SCHEMA.md backend/tests
git commit -m "Công đoạn: bỏ ô định mức ở dòng vật tư (định mức nay khai ở vật tư)"
```

---

## GIAI ĐOẠN C — GỠ LOGIC KHUÔN CŨ

### Task 8: Gỡ khuôn phía tính giá, công đoạn và biến công thức

**Files:**
- Modify: `backend/app/services/thanh_phan_engine.py` (L478-518, 1070-1075, ~1094, 1131-1172, 1228-1229, 1280, 1320)
- Modify: `backend/app/services/bien_cong_thuc.py` (L151-173, `_TANG_BUOC` 218-220, `MA_TANG_BUOC_TIEN` 230-232, `KHUON_MAC_DINH` 238-240, `MAC_DINH_TANG_LENH` 244-251)
- Modify: `backend/app/services/tinh_gia_service.py` (`_ROW_SCALAR_FIELDS` 92-104; `_cong_doan_to_dict` 60-61)
- Modify: `backend/app/schemas/phieu_tinh_gia.py` (28-35, 54-58), `backend/app/services/san_pham_tai_ban_service.py` (77-83)
- Modify: `backend/app/models/phieu_tinh_gia.py` (5 cột khuôn ở `PhieuThanhPham`)
- Modify: `backend/app/models/cong_doan.py` (L46 `TOOLING_TYPE`, L129-130), `backend/app/schemas/cong_doan.py` (111-112, 155-156), `backend/app/services/cong_doan_service.py` (221-226), `backend/app/repositories/cong_doan_repo.py` (22-23)
- Modify: `backend/app/services/lsx_service.py` (`MAC_DINH_TANG_LENH` chỗ import/bơm 66, 649, 702, 1010; `routing` 1299-1300)
- Modify: `frontend/src/pages/PhieuTinhGiaDetailView.tsx` (danh sách dòng ở mục 5.4 bên dưới), `frontend/src/api/client.ts` (3957-3963, 4091-4104, 4237-4241), `frontend/src/pages/tinh-gia.css` (`__kl`, `__nguon`, `__row--phu`), `frontend/src/pages/rebuildCatalogConfigs.tsx` (L48-50, 400, 496 và field cờ khuôn của `CFG_CONG_DOAN` ~387-425)
- Test: sửa `test_phieu_tinh_gia.py`, `test_thanh_phan_engine.py`, `test_bien_cong_thuc.py`, `test_san_pham_tai_ban.py`, `test_cong_doan.py`; thêm `test_migration_0359...` nếu Step 2 cần

**Interfaces:** Consumes: Task 3/4/7 (vật tư theo bước đã chạy, công đoạn không còn nhờ cờ khuôn). Produces: không còn biến `dai_khuon`/`rong_khuon`/`so_khuon`; không còn `phi_khuon`/`khuon_nguon` ở phiếu; không còn `requires_tooling`/`tooling_type` ở công đoạn.

- [ ] **Step 1: Kiểm công thức đang dùng ba biến khuôn (CHẶN nếu có)**

Không dùng `python -c` trong backend. Viết script ngoài repo `<scratchpad>/kiem_khuon.py` gọi API (backend dev đang chạy; đăng nhập admin/admin123):

```python
import json, re, urllib.request
BASE = "http://localhost:8000"   # đổi theo cổng backend dev đang chạy
def goi(p, tok=None, body=None):
    rq = urllib.request.Request(BASE + p, data=json.dumps(body).encode() if body else None,
                                headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {tok}"} if tok else {})})
    return json.load(urllib.request.urlopen(rq))
tok = goi("/api/auth/login", body={"username": "admin", "password": "admin123"})["access_token"]
RE = re.compile(r"\b(dai_khuon|rong_khuon|so_khuon)\b")
for cd in goi("/api/cong-doan?size=200", tok)["items"]:
    txt = json.dumps(cd, ensure_ascii=False)
    if RE.search(txt):
        print("CÔNG ĐOẠN", cd["ma"], cd["ten"], RE.findall(txt))
for kind in ("vat-tu-in-an", "giay"):
    for m in goi(f"/api/vat-lieu-kho/{kind}?size=200", tok)["items"]:
        if RE.search(json.dumps(m, ensure_ascii=False)):
            print(kind.upper(), m["ma"], m["ten"])
```

Run: `python <scratchpad>\kiem_khuon.py`. **Nếu in ra bất kỳ dòng nào → DỪNG, báo người dùng danh sách công thức sẽ vỡ** (cần họ chuyển sang vật tư có chip trước). Không in gì → tiếp tục. Công thức khoán/máy dạng con (`cong_doan_may.cong_thuc_gia`) cũng nằm trong JSON công đoạn; nếu API không trả, kiểm thêm bằng `GET /api/cong-doan/{id}` từng dòng.

- [ ] **Step 2: Kiểm default của cột khuôn trên Postgres dev (an toàn insert sau khi gỡ khỏi model)**

Gỡ cột khỏi model nghĩa là INSERT sẽ không còn ghi chúng; cột `NOT NULL` không có `DEFAULT` ở DB sẽ làm insert vỡ. Xem container Postgres bằng `docker ps` rồi chạy (đổi tên container/db/user cho đúng `backend/.env`):

```bash
docker exec <ten-container-postgres> psql -U <user> -d <db> -c "SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns WHERE (table_name='phieu_thanh_pham' AND column_name IN ('phi_khuon','khuon_nguon','dai_khuon','rong_khuon','so_khuon')) OR (table_name='cong_doan' AND column_name IN ('requires_tooling','tooling_type')) OR (table_name='lsx_cong_doan' AND column_name IN ('khuon_be_id','khuon_nguon','khuon_phi')) OR (table_name='san_xuat_cong_viec' AND column_name LIKE 'khuon%');"
```

Cột nào có `is_nullable = NO` mà `column_default` rỗng → thêm migration `0359_khuon_cot_cho_phep_bo_trong`: `ALTER TABLE <bảng> ALTER COLUMN <cột> SET DEFAULT <0|false>` (hoặc `DROP NOT NULL` với cột chuỗi) bằng khuôn idempotent (đọc `insp` trước, ALTER sau; SQLite bỏ qua nhánh này vì test dựng bảng từ model). Kèm test migration 4 ca. Nếu mọi cột đều có default/nullable → không cần migration, ghi kết quả vào mô tả commit. (Số `0359` dành cho Task 10; nếu Step này cần migration thì dùng `0359` và đẩy Task 10 sang `0360`.)

- [ ] **Step 3: Test khoá hợp đồng mới (fail)**

Thêm vào `test_bien_cong_thuc.py`:

```python
def test_khong_con_bien_khuon():
    from app.services.bien_cong_thuc import BIEN, LOAI_CONG_DOAN, LOAI_QUY_DOI, ma_hop_le
    for ma in ("dai_khuon", "rong_khuon", "so_khuon"):
        assert ma not in {b["ma"] for b in BIEN}
        assert ma not in ma_hop_le(LOAI_CONG_DOAN) and ma not in ma_hop_le(LOAI_QUY_DOI)
```

Thêm vào `test_thanh_phan_engine.py` một ca: bước có `phi_khuon`/`khuon_nguon` trong dict (dữ liệu rác cũ) KHÔNG sinh dòng `loai: "khuon"` và không có `phi_khuon` trong `result["meta"]`. Run → FAIL.

- [ ] **Step 4: Backend — gỡ**

Làm lần lượt, mỗi mục một `grep` xác nhận (`grep -n "khuon" <file>`) để không sót:

1. `bien_cong_thuc.py`: xoá ba tuple `dai_khuon`/`rong_khuon`/`so_khuon` ở `_BANG` (151-173) và comment kèm; `_TANG_BUOC` còn `{"sl_vao","sl_ra","so_luot_chay"}`; `MA_TANG_BUOC_TIEN` còn `sl_vao`, `sl_ra`; xoá `KHUON_MAC_DINH`; `MAC_DINH_TANG_LENH` còn `so_luot_chay`, `don_gia_khoan`. Cập nhật docstring đầu file (số biến theo ô: Giấy 19 · Vật tư 18 · Công đoạn 19 · Quy đổi 22).
2. `thanh_phan_engine.py`: xoá `TOOLING_CO_PHI`, `TOOLING_NHAN`, `_canh_bao_khuon` (478-518) và vòng cảnh báo (1169-1172); xoá bơm `ctx["dai_khuon"]`… (1070-1075) và chép chúng vào `eval_ctx` (`MA_TANG_BUOC_TIEN` đã co lại); xoá khối "PHÍ KHUÔN" (1131-1168) và các khoá trả `phi_khuon_dong`/`phi_khuon` (1228-1229, 1280, 1320). Kiểm `grep -n "khuon" backend/app/services/thanh_phan_engine.py` — chỉ còn từ "khuôn" nghĩa template trong comment (nếu có).
3. `tinh_gia_service.py`: bỏ `phi_khuon`, `khuon_nguon`, `dai_khuon`, `rong_khuon`, `so_khuon` khỏi `_ROW_SCALAR_FIELDS`; bỏ `requires_tooling`/`tooling_type` ở `_cong_doan_to_dict` (60-61).
4. `schemas/phieu_tinh_gia.py`: xoá 5 field ở `ThanhPhamIn` (28-35) và `ThanhPhamOut` (54-58). `san_pham_tai_ban_service.py`: xoá 5 đối số (77-83). Ảnh chụp tái bản cũ còn khoá khuôn → Pydantic bỏ khoá thừa (đúng).
5. `models/phieu_tinh_gia.py`: xoá 5 cột khuôn của `PhieuThanhPham` (L245, 258, 270-272) kèm comment; thêm một dòng "Cột `phi_khuon`/`khuon_nguon`/`dai_khuon`/`rong_khuon`/`so_khuon` còn trong DB (không drop), KHÔNG còn model/đọc/ghi từ 01/10/2026".
6. Công đoạn: `models/cong_doan.py` xoá `requires_tooling`, `tooling_type` (L129-130) và `TOOLING_TYPE` (L46) — `grep -rn "TOOLING_TYPE" backend/app` để đổi chỗ còn import (`models/khuon_be.py` cảnh báo cùng bộ mã: giữ `LOAI_KHUON` riêng trong khuon_be.py cho Task 10 dọn); `schemas/cong_doan.py` (111-112, 155-156), `cong_doan_service.py` (221-226 kiểm loại khuôn), `cong_doan_repo.py` (22-23 `ASSIGNABLE`) bỏ hai cột.
7. `lsx_service.py` chỉ phần liên quan biến khuôn: `MAC_DINH_TANG_LENH` vẫn import nhưng dict đã co; trong `_tinh_dong` bỏ `"khuon_nguon"`/`"khuon_phi"` ở routing (1299-1300) — phần còn lại của khuôn ở lệnh gỡ ở Task 9, nên Task này chỉ cần bảo đảm `row.get("khuon_nguon")` không nổ (đã `.get`). Nếu `can_chot_khuon(cd.get("requires_tooling"), …)` (1262-1305) đọc khoá vừa bỏ thì để nó nhận `None` — Task 9 xoá hẳn.

- [ ] **Step 5: Sửa/xoá test khuôn phía giá**

Xoá: `test_phieu_tinh_gia.py` `_row_khuon`, `test_khuon_nguon_*`, `test_khuon_da_co_tien_thi_im_lang`, `test_buoc_khong_can_dung_cu_thi_khong_xet` (720-755); `test_thanh_phan_engine.py` `_buoc_dao`, `_phieu_co_dao`, `test_phi_khuon_CONG_vao_gia_von…`, `test_ba_buoc_can_dao_thi_ba_dong_phi_rieng`, `test_ban_kem_khong_co_phi_khuon`, `test_buoc_khong_can_dao_thi_khong_nhac` và dòng 754 trong `test_moi_dong_tien_deu_khep_bang_don_gia_moi_san_pham`; `test_san_pham_tai_ban.py` `test_snapshot_giu_nguon_khuon` và `phi_khuon` ở L151-152. Sửa `test_bien_cong_thuc.py`: số biến mỗi ô (`{GIAY: 19, VAT_TU: 18, CONG_DOAN: 19, QUY_DOI: 22}`), bỏ `dai_khuon…` khỏi `CUA_BUOC` (L110-111), bỏ nhắc chip khuôn ở 88/135/352. `test_cong_doan.py`: bỏ assert `requires_tooling`/`tooling_type` của hệ CongDoan (phần `tooling_cost` thuộc hệ Operation cũ — KHÔNG đụng).

Chạy: `python -m pytest backend/tests/test_bien_cong_thuc.py backend/tests/test_thanh_phan_engine.py backend/tests/test_phieu_tinh_gia.py backend/tests/test_san_pham_tai_ban.py backend/tests/test_cong_doan.py backend/tests/test_schema_documented.py -q` → pass.

- [ ] **Step 6: Frontend phiếu + công đoạn — gỡ**

`PhieuTinhGiaDetailView.tsx` (số dòng theo bản trước Task 4; định vị lại bằng `grep -n`): gỡ `DAO_CO_PHI` (432-441) + doc mồ côi (443-447), `daoCuaBuoc` (470-475), `loaiDaoCuaBuoc` (477-484), 5 field khuôn của `EditableFinishing` (499-512), khởi tạo ở `blankFinishing` (604-608), `fromFinishing` (668-672), `toThanhPhanIn` (781-785), `fromThanhPhanIn` (867-871), mảng `cds` trong `previewSig` (1571-1574) + comment, `dsKhuon`/`tienKhuon` (2546-2547), thành phần trong `lechTien` (2582) và `coTien` (2587), `dongKhuon` + `if (r.loai === "khuon") continue;` (273-275, 304-324), IIFE khối **Phí khuôn** (3224-3391), khối `dsKhuon` ở panel Giá vốn (3785-3809) và comment liên quan. **GIỮ**: `KhuonCalc`/`KhuonCalcIcon`/biến `khuon`/`calcUid`/`khuon-lbl-`/`khuon-calc-` (số BÀI IN). `client.ts`: gỡ `phi_khuon`/`phi_khuon_dong` ở `TinhGiaComponentMeta` (3957-3963), 5 field ở `ThanhPhamOut` (4091-4104) và `ThanhPhamIn` (4237-4241). `tinh-gia.css`: xoá `.tg-khuon__kl*`, `.tg-khuon__nguon*`, `.tg-khuon__row--phu*`; GIỮ `.tg-khuon`, `__head`, `__title`, `__note`, `__row`, `__ten`, `__input`, `__num`, `__foot`, `__hint` (mục ⑤ Giao hàng và ⑥ Chi phí khác còn dùng; kiểm `styles/responsive-chu.css:1192-1196`). `rebuildCatalogConfigs.tsx`: xoá `CHIP_KHUON`/`AN_CHIP_KHUON` (48-50) và các chỗ dùng (400, 496), xoá field cờ khuôn ("Bước này cần khuôn", "Loại khuôn", `TOOLING_TYPE` const 31-38) khỏi `CFG_CONG_DOAN`; cập nhật `rebuildCatalogConfigs.test.tsx` nếu có assert.

Chạy: `cd frontend && npx tsc --noEmit` (exit 0) và `npx vitest run src/pages` (các file liên quan: `rebuildCatalogConfigs.test.tsx`, `CatalogDrawer.test.tsx`, `FormulaField.test.tsx`).

- [ ] **Step 7: Xác minh luồng thật trên trình duyệt dev**

Restart uvicorn. (1) Danh mục → Công đoạn → mở `Bế`/`Ép kim`: không còn khối "Khuôn & dụng cụ"/công tắc "Bước này cần khuôn"; ô công thức không còn chip Dài/Rộng/Số khuôn ép kim. (2) Danh mục → Vật tư khác: tạo `Khuôn ép kim` với 3 chip `Dài khuôn`, `Rộng khuôn`, `Số khuôn`, công thức giá `dai_khuon_ep * rong_khuon_ep * so_khuon` (đặt tên chip tránh trùng — nếu chip tên `Dài khuôn` sinh mã `dai_khuon` thì hợp lệ vì biến hệ thống đã gỡ). (3) Gắn vật tư đó vào công đoạn `Ép kim` (tab Vật tư). (4) Tính giá: thêm công đoạn `Ép kim` → vật tư `Khuôn ép kim` tự hiện với 3 ô → nhập → giá vốn có dòng; xoá vật tư khỏi bước = dùng khuôn cũ, giá không còn dòng đó. (5) Trong khối Chuỗi công đoạn KHÔNG còn "Phí khuôn" nào. Báo cáo từng bước.

- [ ] **Step 8: Commit**

```bash
git status
git add backend/app frontend/src docs backend/tests
git commit -m "Gỡ logic khuôn ở tính giá + công đoạn + biến công thức (khuôn nay là vật tư thường có chip)"
```

(Trước `git add`, dùng `git diff --stat` để chắc chỉ có file của Task này; không `git add` các file ngoài Task đang chờ của phiên khác.)

---

### Task 9: Gỡ khuôn phía lệnh sản xuất, xếp lịch, bàn tổ, phiếu công nghệ, kế hoạch

**Files (backend):**
- Modify: `models/lsx.py` (`khuon_be_id` 245, `khuon_nguon` 250, `khuon_phi` 251-258 và comment 234-257), `schemas/lsx.py` (`LsxCongDoanIn.khuon_be_id`; `LsxCongDoanOut` các field khuôn; `KhuonMoiIn`), `routers/lsx.py:302,326` (`khuon-chon-duoc`, `khuon-moi`)
- Modify: `services/lsx_service.py`: L94-104 (`TOOLING_CO_KHO`, `can_chot_khuon`), L468-481 (`canh_bao_lech_khuon`), L1067-1155 (`khuon_chon_duoc`, `tao_khuon_cho_lenh`, `_khuon_map`), L1262-1305 (khoá khuôn của `routing`), L1571-1583 (chép `khuon_nguon`/`khuon_phi`), L1672-1682 (`thieu_khuon` chặn sẵn sàng), L1748-1749, L2145, L2275-2291, L2657-2672 (`khuon_be_id` trong tập field `replace_routing`)
- Modify: `models/san_xuat.py:307-319` (`khuon_json`, `khuon_nhan_luc`, `khuon_nhan_by_id`, `khuon_tra_luc`), `schemas/san_xuat.py:56-66,130-135`, `routers/san_xuat.py:643-663`, `services/san_xuat/thuc_thi.py` (282-290, 542-615), `services/san_xuat/snapshot.py:237-254,416`, `services/san_xuat/board.py:347-351`, `repositories/san_xuat_thuc_thi_repo.py:36-47`
- Modify: `services/xep_lich_service.py` (29, 64, 82-85, 981-1019, 2302, 2363-2367), `services/lenh_sx/ho_so.py` (68, 250-376, 1038-1040), `services/lenh_sx/phieu_cong_nghe.py:368-378`, `services/lenh_sx/bang_theo_doi.py:700-717`, `schemas/lenh_san_xuat.py:236-244`, `schemas/theo_doi_san_xuat.py:39-48`, `services/ke_hoach_vat_tu_service.py` (docstring 10, comment 1228) + `schemas/ke_hoach_vat_tu.py:109` (`khuon_tinh_trang`) + `repositories/ke_hoach_vat_tu_repo.py`, `audit_registry.py:193-194`
- Modify (frontend): `components/ChipBuoc.tsx` (+ test, `chip-buoc.css`: `ChipKhuon`, `KhuonChip`, `NhanBuoc.khuon_*`, `nhanKhuon()`), `components/DagNodeCard.tsx:5,128-135`, `pages/LenhSxHoSoView.tsx:31,1323-1331`, `pages/LsxBuocDrawer.tsx` (thẻ khuôn 855-866; `KhuonCuaBuoc`, `NHAN_TOOLING` 1634-1900; props 90-133), `pages/lsxBuoc.ts` (khuôn fields), `pages/LsxRoutingTable.tsx` (104-139, 296-366, 681, 1031-1036), `pages/LsxDetailView.tsx` (251-257, 278, 348-357, 1482-1487), `pages/lsxVatTu.ts` (nhóm `dung_cu`: 9, 16-18, 24, 121-131, 145, 167-178), `pages/LsxVatTuPanel.tsx`, `pages/VatTuKeHoachView.tsx` (54-70, 934-945), `pages/ThsxDrawer.tsx` (+ test) , `pages/ThucHienSxPage.tsx` (30, 578-588, 912-913, 1014), `pages/ThsxLichNgay.tsx`, `pages/ThsxDanhSach.tsx`, `pages/TdsxKanban.tsx`, `pages/TdsxTheoCa.tsx`, `pages/TdsxTheoMay.tsx:471`, `api/client.ts` (1616 `SxKhuonChip`, 2710-2723, 2783, 8213/8229 `KhuonBeRow`/`KhuonChonDuoc`, 12414/12418, 13047-13054), CSS `ke-hoach-sx.css`, `thuc-hien-sx.css` (`.thsx-khuon*`)
- Test: xoá/sửa các test liệt kê ở Step 6

**Interfaces:** Consumes: Task 8 (công đoạn không còn `requires_tooling`/`tooling_type`). Produces: không còn khái niệm "dao/khuôn" ở lệnh, xếp lịch, bàn tổ, phiếu công nghệ, kế hoạch vật tư.

> Task này là gỡ thuần, không có hành vi mới nên không có test viết trước; kiểm chứng bằng (a) test đã sửa pass, (b) kiểm `grep` ở Step 7 không còn tham chiếu, (c) xác minh luồng thật. Giữ nguyên các cột DB (không drop): `lsx_cong_doan.khuon_be_id/khuon_nguon/khuon_phi`, `san_xuat_cong_viec.khuon_json/khuon_nhan_luc/khuon_nhan_by_id/khuon_tra_luc`. Gỡ khỏi model kéo theo rủi ro NOT NULL: Step 2 của Task 8 đã kiểm các cột này; nếu `lsx_cong_doan.khuon_phi` NOT NULL thiếu default thì migration `SET DEFAULT 0` đã được thêm ở đó.

- [ ] **Step 1: Backend — lệnh (`lsx_service`, model, schema, router)**

Xoá theo danh sách ở "Files": hằng/hàm khuôn, khoá khuôn ở `routing`/`_cong_doan_dict`/`mac_dinh_buoc`/`detail_dict`, `thieu_khuon` khỏi `thieu_cua` (cửa "sẵn sàng lập kế hoạch" không còn đòi dao), `khuon_be_id` khỏi `_ROUTING_FIELD_THUAN`/`_ROUTING_FIELD_NULLABLE`, 2 route `khuon-chon-duoc`/`khuon-moi`, schema `KhuonMoiIn` và field khuôn của `LsxCongDoanIn/Out`. Sau mỗi file `grep -n "khuon" <file>` để xác nhận chỉ còn comment lịch sử (nếu có).

- [ ] **Step 2: Backend — sản xuất/bàn tổ**

`thuc_thi.py`: bỏ cổng "Chưa nhận khuôn/khung" khi bắt đầu (282-290), `nhan_khuon`, `_lat_dao_da_ve`, `tra_khuon` (542-615); `snapshot.py`: bỏ `_khuon()` và `khuon_json=…` (237-254, 416); `board.py`: bỏ `khuon`, `khuon_da_nhan`, `khuon_da_tra` (347-351); `san_xuat_thuc_thi_repo.py`: bỏ `cong_viec_mo_theo_khuon`; `routers/san_xuat.py`: bỏ hai route nhận/trả khuôn; `schemas/san_xuat.py`: bỏ `KhuonChipOut` và 3 field; `models/san_xuat.py`: bỏ 4 cột khuôn (cột còn trong DB); `audit_registry.py`: bỏ hai nhãn `san_xuat_nhan_khuon`/`san_xuat_tra_khuon` (log cũ vẫn đọc được — kiểm `audit_registry` có xử lý nhãn lạ; nếu không, giữ hai nhãn và ghi chú "lịch sử").

- [ ] **Step 3: Backend — hồ sơ lệnh, xếp lịch, phiếu công nghệ, theo dõi, kế hoạch vật tư**

`ho_so.py` (`_khuon_buoc`, `_buoc_can_khuon`, khoá khuôn trong `_routing`, điểm gọi 1038-1040), `xep_lich_service.py` (`_khuon_theo_buoc`, `_KHUON_TRONG`, spread vào dòng lịch), `phieu_cong_nghe.py` (nối mã dao vào ô "Loại bước" 368-378), `bang_theo_doi.py` (`khuon_*` ở `_nhan`), `schemas/lenh_san_xuat.py` (`RoutingNodeOut`: `can_khuon, khuon_da_nhan, khuon_be_ma/ten/so_ke/tinh_trang`), `schemas/theo_doi_san_xuat.py` (39-48), `ke_hoach_vat_tu_*` (`khuon_tinh_trang` và nhóm "khuôn"). Kiểm `grep -rn "khuon" backend/app/services/lenh_sx backend/app/services/xep_lich_service.py backend/app/services/ke_hoach_vat_tu_service.py backend/app/schemas`.

- [ ] **Step 4: Frontend — gỡ**

Theo danh sách "Files (frontend)": xoá `ChipKhuon`/`KhuonChip`/`nhanKhuon` và mọi chỗ gắn (`DagNodeCard`, `LenhSxHoSoView`, `ThsxLichNgay`, `ThsxDanhSach`, `TdsxKanban`, `TdsxTheoCa`, `TdsxTheoMay`, `ThucHienSxPage`), khối "Khuôn & khung" + nút "Đã nhận khuôn/Đã trả khuôn về kệ" + cảnh báo "Chưa nhận khuôn/khung" + `khuonChoNhan` chặn nút Bắt đầu ở `ThsxDrawer.tsx`, thẻ `KhuonCuaBuoc` ở `LsxBuocDrawer.tsx` cùng props `khuonRefs`/`onTaoKhuon` (và nơi truyền ở `LsxRoutingTable.tsx`, `LsxDetailView.tsx`), nhóm `dung_cu` ở `lsxVatTu.ts` + `LsxVatTuPanel.tsx` + `VatTuKeHoachView.tsx`, các trường khuôn của `EditRow`/`toBody`/`emptyRow` ở `lsxBuoc.ts`, kiểu/hàm API khuôn ở `client.ts`, CSS `.thsx-khuon*`, `chip-buoc.css` phần khuôn. **GIỮ** mọi chữ "khuôn" nghĩa template/số bài in (vd `ThsxExecPanels.tsx` L79, 393, 1270… không phải khuôn dụng cụ).

Chạy `cd frontend && npx tsc --noEmit` — lỗi biên dịch chỉ ra đúng chỗ còn tham chiếu; sửa tới exit 0. Rồi `npx vitest run src/components/ChipBuoc.test.tsx src/pages/ThsxDrawer.test.tsx src/pages/lsxBuoc.test.ts src/pages/lsxVatTu.test.ts src/pages/LenhSxHoSoView.test.tsx` (xoá/sửa các test khuôn trong các file này).

- [ ] **Step 5: Test backend — xoá/sửa**

Xoá test khuôn: `test_lsx_service.py` (`_gan_dao_cho_buoc_can`, `test_mac_dinh_buoc_tra_kem_co_dung_cu`, `test_buoc_khung_lua_o_lenh_la_buoc_binh_thuong`, `test_khuon_chon_duoc_*`, `test_tao_khuon_moi_*`, `test_khuon_lech_*`, `test_khuon_khong_lech_thi_im_lang`, `_buoc_can_dao`, `test_thieu_khuon_chan_san_sang`, `test_buoc_thue_ngoai_can_dao_khong_bi_doi_khuon`, `test_tro_dao_roi_thi_het_thieu_khuon` và dòng 438-442, 745-754, 2568-2610 dựng `requires_tooling`); `test_san_xuat_thuc_thi.py` (`_cv_co_khuon`, `test_chua_nhan_khuon…`, `test_tich_nhan_khuon…`, `test_buoc_khong_can_khuon…`, `test_tra_khuon…`, `_dao`, `test_nhan_khuon_*`); `test_san_xuat_release.py` `test_phat_hanh_chup_khuon_va_nha_gia_cong` (432-451: chỉ bỏ phần khuôn, giữ phần nhà gia công); `test_lenh_sx_pdf.py` `test_giay_in_ma_dao_va_so_ke`, `test_giay_noi_thang_dao_chua_ve` + fixture `lenh_co_khuon`/`KHUON_MA` ở `lenh_sx_fixtures.py`; `test_theo_doi_kanban.py:324-335`, `test_theo_doi_may_ca_gantt.py:332-340` (bỏ phần khuôn của chip nhãn); `test_san_xuat_board.py:280` (bỏ ba tham số `khuon_*=None`); `test_ke_hoach_vat_tu.py:719` (comment). Sau đó:

```
python -m pytest backend/tests/test_lsx_service.py backend/tests/test_san_xuat_thuc_thi.py backend/tests/test_san_xuat_release.py backend/tests/test_lenh_sx_pdf.py backend/tests/test_theo_doi_kanban.py backend/tests/test_theo_doi_may_ca_gantt.py backend/tests/test_san_xuat_board.py backend/tests/test_ke_hoach_vat_tu.py backend/tests/test_xep_lich_dot2.py backend/tests/test_schema_documented.py -q
```

Expected: pass.

- [ ] **Step 6: Kiểm sạch tham chiếu**

```bash
grep -rnE "khuon_be_id|khuon_nguon|khuon_phi|requires_tooling|tooling_type|khuon_json|khuon_nhan_luc|khuon_tra_luc|ChipKhuon|nhanKhuon|traKhuon|KhuonCuaBuoc" backend/app frontend/src --include=*.py --include=*.ts --include=*.tsx
```

Expected: chỉ còn (a) `db_migrations.py` (lịch sử), (b) `models/khuon_be.py` + comment lịch sử, (c) hệ `Operation`/`plate_die_rate` (`has_tooling`, `tooling_type` của `Operation` — không nằm trong regex trừ `tooling_type`: loại file `models/operation.py`, `services/operation_service.py`, `schemas/operation.py`, `repositories/operation_repo.py`, `seed*.py` cho hệ cũ). Còn gì khác thì gỡ nốt.

- [ ] **Step 7: Xác minh luồng thật trên trình duyệt dev**

Restart uvicorn. (1) Mở một Lệnh sản xuất → công đoạn `Bế`: drawer không còn thẻ khuôn/dụng cụ; bảng công đoạn/DAG không còn chip khuôn; bấm "Sẵn sàng lập kế hoạch" không bị chặn vì thiếu dao. (2) Hồ sơ lệnh: sơ đồ không chip khuôn; tab Vật tư không còn nhóm "Dụng cụ / Khuôn". (3) Xếp lịch → thẻ bước không chip khuôn. (4) Phát hành lệnh xuống tổ → Thực hiện sản xuất (bàn tổ): mở việc `Bế`: không còn khối "Khuôn & khung", nút "Bắt đầu" bấm được ngay, không đòi tích "Đã nhận khuôn". (5) In phiếu công nghệ: cột "Loại bước" không còn mã dao/số kệ. Báo cáo từng bước.

- [ ] **Step 8: Commit**

```bash
git status
git add backend/app frontend/src backend/tests
git commit -m "Gỡ logic khuôn ở lệnh sản xuất, xếp lịch, bàn tổ, phiếu công nghệ, kế hoạch vật tư"
```

---

### Task 10: Gỡ màn Khuôn & khung, quyền, tài liệu

**Files:**
- Delete: `backend/app/routers/khuon_be.py`, `backend/app/services/khuon_be_service.py`, `backend/app/repositories/khuon_be_repo.py`, `backend/app/schemas/khuon_be.py`, `backend/tests/test_khuon_be.py`, `backend/tests/test_doan_loai_khuon_migration.py` (kiểm nội dung: nếu test chỉ đúng với migration lịch sử thì giữ, nếu import module xoá thì xoá)
- Modify: `backend/app/main.py:56,209`, `backend/app/catalog_registry.py:72`, `backend/app/services/danh_muc_tham_chieu.py` (`_khuon_be`, đăng ký 284), `backend/app/services/catalog_excel_specs.py` (32, 199, 239 `KHUON_BE`), `backend/app/services/nhat_ky_danh_muc.py:278` (`_DUNG_CU`), `backend/app/seed.py` (~168-170, 533 `"khuon_be": _read(SCOPE_ALL)`), `backend/app/seed_rebuild.py:370-379`, `backend/app/import_danh_muc_prod.py:324,402-424`, `backend/app/models/__init__.py:118,290`, `backend/app/models/khuon_be.py` (docstring), `backend/app/db_migrations.py` (migration `0359`/`0360`)
- Modify: `frontend/src/components/Sidebar.tsx:299-302`, `Sidebar.test.tsx:3`, `pages/PermissionMatrix.tsx:710`, `pages/rebuildCatalogConfigs.tsx` (`CFG_KHUON_BE` 803-830, đăng ký 961, `TINH_TRANG_KHUON`/`LOAI_KHUON`), `pages/danh-muc/CatalogListPage.test.tsx:220,255`, `api/client.ts:13545`
- Modify: `docs/DB_SCHEMA.md` (mục `khuon_be`, `lsx_cong_doan`, `san_xuat_cong_viec`, `cong_doan`, `phieu_thanh_pham`: ghi cột/bảng NGƯNG DÙNG 01/10/2026), `docs/design-khuon-khung-xuyen-suot.md` (banner đầu file), `docs/superpowers/specs/2026-10-01-vat-tu-chip-cong-thuc-design.md` (cập nhật theo "Quyết định chốt trong plan")
- Test: `backend/tests/test_ma_tran_quyen_khop_thanh_ben.py`, `test_catalog_registry.py`, `test_rbac_seed.py`, `test_danh_muc_http_contract.py`, `test_danh_muc_so_truy_van.py`, `test_danh_muc_tham_chieu.py`, `test_import_excel.py`, `test_import_danh_muc_prod.py`, `test_catalog_repo_base.py`, `test_catalog_service_base.py`, `test_danh_muc_bug_fixes.py`

**Interfaces:** Consumes: Task 9 (không còn nơi nào tham chiếu `khuon_be`). Produces: không còn route `/api/khuon-be`, module quyền `khuon_be`, mục sidebar "Khuôn". Bảng `khuon_be` + class `KhuonBe` + dữ liệu giữ nguyên.

- [ ] **Step 1: Đọc tiền lệ gỡ module và guard RBAC**

Đọc `db_migrations.py` migration `0332` (gỡ `yeu_cau_sua_chua`; cũng `0330`, `0331`) để COPY đúng cách xoá module khỏi `modules` + `role_permissions` (và bảng khác nếu tiền lệ có). Đọc `backend/tests/test_ma_tran_quyen_khop_thanh_ben.py` (6 test) và `test_catalog_registry.py:46,91,109,150` (`test_khuon_be_giu_nguyen_chuoi_quyen` sẽ bị xoá/đảo).

- [ ] **Step 2: Test migration xoá quyền (fail → pass)**

`backend/tests/test_migration_khuon_be_go_quyen.py` theo khuôn tiền lệ `0332`: dựng `role_permissions` (+`modules` nếu tiền lệ có) có dòng `module_key='khuon_be'` và dòng của module khác; chạy migration; khẳng định dòng `khuon_be` mất, dòng khác còn; chạy lại là no-op; DB chưa có bảng thì bỏ qua. Run → FAIL. Viết migration (số kế tiếp sau `0358`/`0359` đã dùng — kiểm lại `tail` của `MIGRATIONS` trước khi đặt số):

```python
def _migrate_go_quyen_khuon_be(db: Session) -> None:
    """0360 — gỡ module quyền `khuon_be` (màn Khuôn & khung đã gỡ 01/10/2026; khuôn nay là vật tư).
    Chỉ xoá dòng PHÂN QUYỀN; bảng `khuon_be` và dữ liệu giữ nguyên. Theo tiền lệ mg 0330–0332."""
    insp = inspect(db.get_bind())
    bang = set(insp.get_table_names())
    if "role_permissions" in bang:
        db.execute(text("DELETE FROM role_permissions WHERE module_key = 'khuon_be'"))
    # nếu tiền lệ 0332 còn xoá ở bảng `modules`/khác thì lặp lại đúng như vậy ở đây
    db.commit()


MIGRATIONS.append(("0360_go_quyen_khuon_be", _migrate_go_quyen_khuon_be))
```

(Sửa tên cột/bảng cho khớp 0332.) Run test → pass.

- [ ] **Step 3: Backend — gỡ route/service/registry/seed**

Xoá 4 file router/service/repo/schema; sửa `main.py` (import + `include_router`), `catalog_registry.py` (bỏ dòng `DanhMuc("khuon_be", …)`; comment 13-14, 67 cập nhật), `danh_muc_tham_chieu.py` (bỏ `_khuon_be` và đăng ký), `catalog_excel_specs.py` (bỏ `KHUON_BE`, `_NHAN_LOAI_KHUON`, import), `nhat_ky_danh_muc.py` (`_DUNG_CU` và chỗ dùng; nếu `_DUNG_CU` còn dùng cho nhật ký công đoạn cũ thì bỏ cùng), `seed.py` (mẫu quyền dispatcher `"khuon_be"`; module sinh từ registry nên tự mất), `seed_rebuild.py` (370-379 tạo `KhuonBe(...)`), `import_danh_muc_prod.py` (324, 402-424 nhập khuôn KB-1001..1020), `models/__init__.py` (GIỮ import `KhuonBe` để `create_all`/DB_SCHEMA vẫn thấy bảng — chỉ đổi comment), `models/khuon_be.py` (docstring: "MÀN ĐÃ GỠ 01/10/2026; bảng giữ để không mất dữ liệu; không còn ai đọc/ghi"; bỏ `TINH_TRANG`/`LOAI_KHUON` nếu không ai import).

- [ ] **Step 4: Test backend — sửa/xoá**

Xoá `test_khuon_be.py`; `test_catalog_registry.py` (đổi `test_khuon_be_giu_nguyen_chuoi_quyen` thành khẳng định `khuon_be` KHÔNG còn trong registry/`seed.MODULES`; sửa danh sách khoá L46/91/109); `test_danh_muc_http_contract.py:46,203` (bỏ dòng `/api/khuon-be`); `test_danh_muc_so_truy_van.py:33`; `test_danh_muc_tham_chieu.py:47` (`_mau` bỏ `"khuon_be": KhuonBe(...)`); `test_import_excel.py` (4 hàm, `SPECS`); `test_import_danh_muc_prod.py:25,58,79`; `test_catalog_repo_base.py`, `test_catalog_service_base.py`, `test_danh_muc_bug_fixes.py` (mỗi file 3 hàm dùng khuôn làm mẫu — đổi sang danh mục khác đang còn, ví dụ `vat_tu`). `test_rbac_seed.py` (`test_modules_seeded` đếm số module: giảm 1). Chạy:

```
python -m pytest backend/tests/test_migration_khuon_be_go_quyen.py backend/tests/test_catalog_registry.py backend/tests/test_danh_muc_http_contract.py backend/tests/test_danh_muc_so_truy_van.py backend/tests/test_danh_muc_tham_chieu.py backend/tests/test_import_excel.py backend/tests/test_import_danh_muc_prod.py backend/tests/test_catalog_repo_base.py backend/tests/test_catalog_service_base.py backend/tests/test_danh_muc_bug_fixes.py backend/tests/test_rbac_seed.py backend/tests/test_schema_documented.py -q
```

- [ ] **Step 5: Frontend + guard ma trận quyền**

`Sidebar.tsx` bỏ mục `khuon-be` (299-302); `PermissionMatrix.tsx` bỏ `"khuon_be"` khỏi `MODULE_GROUPS` (710); `rebuildCatalogConfigs.tsx` bỏ `CFG_KHUON_BE` + đăng ký `"khuon-be"` + hằng chỉ dùng cho nó; `Sidebar.test.tsx` chỉnh test chống khai trùng "Khuôn"; `CatalogListPage.test.tsx:220,255` đổi sang danh mục khác; `client.ts:13545` bỏ. Chạy:

```
python -m pytest backend/tests/test_ma_tran_quyen_khop_thanh_ben.py backend/tests/test_giao_dien_khop_may_chu.py -q
cd frontend && npx tsc --noEmit && npx vitest run src/components/Sidebar.test.tsx src/pages/danh-muc
```

Nếu guard `test_khong_con_khoa_nao_roi_vao_nhom_khac` hay `test_moi_dong_ma_tran_deu_co_mot_muc_menu` đỏ: kiểm `seed.MODULES` đã hết `khuon_be` (nó sinh từ `catalog_registry`) và `MODULE_GROUPS`/`MODULE_DA_NGUNG` không còn nhắc; chỉ thêm vào `MODULE_DA_NGUNG` khi thật sự cần (hỏi người dùng trước vì comment ở đó ghi "xoá không hoàn tác cần chủ phê duyệt").

- [ ] **Step 6: Tài liệu**

`docs/DB_SCHEMA.md`: mục `khuon_be` thêm dòng đầu "🔴 MÀN GỠ 01/10/2026 — bảng giữ dữ liệu, không còn ai đọc/ghi"; ở `lsx_cong_doan`, `san_xuat_cong_viec`, `cong_doan`, `phieu_thanh_pham` ghi cột khuôn "NGƯNG DÙNG 01/10/2026 (không còn trong model; cột còn trong DB)". `docs/design-khuon-khung-xuyen-suot.md`: thêm banner đầu file "⚠️ Phần KHUÔN/KHUNG của tài liệu này LỖI THỜI từ 01/10/2026 — xem `docs/superpowers/specs/2026-10-01-vat-tu-chip-cong-thuc-design.md`; phần NHÃN LOẠI BƯỚC vẫn còn hiệu lực." Spec 2026-10-01: sửa Đ3 (bỏ `nguon`), Đ7 (cột khuôn gỡ khỏi model nhưng giữ trong DB; mg `0360` xoá dòng quyền; `KhuonBe` model giữ), §6 (các điểm mở đã chốt ở plan).

- [ ] **Step 7: Xác minh luồng thật trên trình duyệt dev**

Restart uvicorn (+ chạy migration khi khởi động). (1) Thanh bên → nhóm "Cấu hình danh mục": KHÔNG còn mục "Khuôn". (2) Vai trò & quyền → ma trận: không còn hàng "Khuôn". (3) Gõ tay `/danh-muc/khuon-be` (hoặc đường dẫn cũ): màn không còn / không lỗi trắng trang. (4) Quay lại luồng đầy đủ: Vật tư `Support` → Công đoạn `Bế` → Phiếu tính giá → Lệnh sản xuất → bàn tổ: mọi thứ vẫn chạy. Báo cáo từng bước.

- [ ] **Step 8: Kiểm sạch lần cuối + commit**

```bash
grep -rnE "khuon[_-]be|KhuonBe|khuon-be" backend/app frontend/src --include=*.py --include=*.ts --include=*.tsx
```

Expected: chỉ còn `models/khuon_be.py`, `models/__init__.py` (import giữ bảng), `db_migrations.py` (lịch sử). Rồi:

```bash
git status
git add backend/app frontend/src docs backend/tests
git commit -m "Gỡ màn Khuôn & khung và module quyền khuon_be (bảng + dữ liệu giữ nguyên), cập nhật tài liệu"
```

---

## Self-Review (đối chiếu spec)

| Yêu cầu spec | Task |
|---|---|
| Ý 1 — chip riêng có tên + công thức giá/định mức ở vật tư; hai tab | 1, 2 |
| Ý 2 — công đoạn chọn vật tư, bỏ ô định mức ở dòng vật tư | 7 (+5 để lệnh thôi đọc) |
| Ý 3 — phiếu: vật tư tự hiện theo bước, thêm/xoá, ô chip, thế vào công thức | 3, 4 |
| Ý 4 — lệnh: BOM từ phiếu, định mức theo công thức vật tư, chỉ đọc | 5, 6 |
| Ý 5 — gỡ khuôn (công đoạn/phiếu/biến) | 8; (lệnh/bàn tổ/…) 9; (màn + quyền) 10 |
| Đ1 chip là dữ liệu, mã không trùng biến hệ thống, không đổi `_BANG` | 1 (`ma_chip_hop_le`, `bien_them`) |
| Đ3 chép một lần, vắng = đã xoá, danh mục đổi không đè | 4 (chép ở FE lúc thêm bước), 3 (replace-all) |
| Đ5 chép chip xuống lệnh, không tra ngược | 5 (`gia_tri_chip` + migration 0358) |
| Đ6 đảo quyết định 06/09 — công thức tự phân biệt bằng chip bước | 5 (`sl_vao`/`sl_ra`/`so_luot_chay` có trong ngữ cảnh định mức), 1 (định mức dùng `LOAI_QUY_DOI`) |
| Đ7 kho khuôn giữ bảng/dữ liệu, gỡ quyền | 10 (migration 0360) |
| §6 điểm mở: lệnh không có phiếu / ánh xạ bước / công thức khuôn / phiếu cũ | 5 (fallback danh mục + khớp theo vị trí), 8 Step 1 (chặn nếu còn công thức dùng biến khuôn), "Quyết định chốt" mục 4 |

**Rủi ro đã biết, cần người dùng biết khi chạy plan:**
1. Task 8 Step 1 có thể DỪNG nếu DB dev còn công thức dùng `dai_khuon/rong_khuon/so_khuon` — người dùng phải chuyển sang vật tư có chip trước.
2. Task 5 sửa nhiều hàm của `lsx_service.py` mà plan chỉ quote phần chắc chắn — người thực hiện phải đọc nguyên hàm (đã ghi trong khung "Trước khi sửa") và chạy `test_lsx_service.py` đầy đủ.
3. Task 10 xoá dòng `role_permissions` của `khuon_be` (dữ liệu phân quyền, không phải dữ liệu nghiệp vụ) — không hoàn tác được ngoài việc cấp lại quyền; đã theo tiền lệ mg 0330–0332.
4. Phí khuôn đã nhập trong phiếu dev, vật tư cấp thành phần cũ (`phieu_vat_tu`), con dao đã gán ở lệnh dev: dữ liệu còn trong DB nhưng không còn hiện/được dùng.
5. Số migration `0357`–`0360` phải kiểm lại ngay trước khi merge (nhánh khác có thể đã chiếm số).
