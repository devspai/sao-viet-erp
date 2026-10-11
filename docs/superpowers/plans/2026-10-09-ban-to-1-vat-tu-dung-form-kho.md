# Bàn tổ 1/4 — Yêu cầu vật tư dùng thẳng form Yêu cầu nhập xuất của Kho

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tổ bấm Yêu cầu cấp vật tư / bổ sung / sửa / nhập lại thì mở ĐÚNG form "Yêu cầu nhập xuất" của Kho (`TaoYeuCauP2`), có thêm GIỜ cần, khoá lệnh theo công việc, ẩn Nhập/Xuất, bỏ hẳn Lý do; trên điện thoại là phương án C (danh sách chỉ đọc, chạm dòng mở khay dưới để sửa).

**Architecture:** Thêm cột `stock_requests.can_luc` (giờ cần, khuôn wall-clock nhãn UTC như `san_xuat_vat_tu_de_nghi.can_luc`). Form Kho nhận thêm ô giờ cho MỌI yêu cầu. `TaoYeuCauP2` được export và nhận prop `tuCongViec` — khi có prop này form khoá lệnh, nạp dòng kế hoạch, thêm cột nền (Kế hoạch / Đã xin), nút Về 0, ẩn seg Nhập/Xuất, và gửi qua callback của bàn tổ (endpoint `material-requests` / `material-returns` giữ nguyên) thay vì `api.kho.deNghi.create`. Luật bắt lý do ở `_chuan_hoa` bị gỡ.

**Tech Stack:** FastAPI + SQLAlchemy (không Alembic, migration tay ở `db_migrations.py`), React + TS, Vitest, pytest.

**Spec:** `docs/mockups/ban-to-hop-thoai-B.html` mục `#vat-tu` (bản máy tính `#vtSheet`, điện thoại `#vtPhone`, switch `#swVt` bốn chế độ moi/bo_sung/sua/nhap_lai) và bảng đối chiếu `#doi-chieu`; `docs/mockups/ban-to-vat-tu-dien-thoai-3-phuong-an.html` (phương án C đã chọn).

## Global Constraints

- UI tiếng Việt hoàn toàn; không chữ đậm; không nối mẩu dữ liệu bằng "·" hay dấu phẩy; không hồng; không viền một cạnh.
- KHÔNG chạy `./init.ps1`. Verify: `cd backend && python -m pytest <file> -q` nhắm file; FE `cd frontend && npx tsc --noEmit -p .` và `npx vitest run <file>`.
- Postgres dev là DB thật: không `python -c` trần trong `backend/`. Cột mới PHẢI qua migration + `docs/DB_SCHEMA.md` (guard test `test_schema_documented.py`).
- Migration: id kế tiếp sau `0383_module_kcs`; nếu lúc làm đã có số lớn hơn thì lấy số kế tiếp. Kiểm cột bằng `_existing_columns(inspect(...))`, không PRAGMA. Không ORM full-select trong migration.
- Cây làm việc đang có rất nhiều thay đổi chưa commit của phiên khác (KCS, phân quyền). KHÔNG `git stash`, KHÔNG `git checkout --` file nào; sửa bằng Edit chèn đúng chỗ. Không commit trừ khi người dùng bảo.
- Ô ngày/giờ dùng `ChonNgay` / `ChonGio` / `ChonNgayGio` (cấm ô gốc trình duyệt); giờ chặn bằng `GIO_NHAP_MIN/MAX` + `gioNhapHopLe` từ `frontend/src/lib/gioNhap`.
- Tên người lấy từ tài khoản ở máy chủ, không đưa vào schema In.

---

### Task 1: Cột giờ cần `stock_requests.can_luc` + form Kho gửi/nhận giờ (backend)

**Files:**
- Modify: `backend/app/models/stock_request.py` (class `StockRequest`, cạnh `ngay_can` ~L92)
- Modify: `backend/app/db_migrations.py` (cuối file, sau `0383_module_kcs`)
- Modify: `backend/app/repositories/stock_request_repo.py:30` (`_HEADER_FIELDS` thêm `"can_luc"`)
- Modify: `backend/app/schemas/stock.py` (`StockRequestCreate`, `StockRequestUpdate`: `can_luc: datetime | None = None`)
- Modify: `backend/app/routers/kho_request.py` (`create_request` L561, `update` L582, `_serialize` dòng `can_luc=` ~L295)
- Modify: `docs/DB_SCHEMA.md` (mục `### \`stock_requests\`` ~L5635: thêm dòng bảng + tên cột vào `**Tất cả cột:**`)
- Test: `backend/tests/test_migration_0384_stock_request_can_luc.py` (mới), `backend/tests/test_kho_yeu_cau_can_luc.py` (mới)

**Interfaces:**
- Produces: `StockRequest.can_luc: DateTime(timezone=True) | None` — wall-clock giờ nhà máy gắn nhãn UTC; `StockRequestService.create(..., can_luc=<datetime đã qua _can_luc_luu>)` nhận qua `**header`; `StockRequestOut.can_luc` = `req.can_luc` nếu có, không thì giá trị bối cảnh sản xuất cũ.
- Hàm dùng chung: `from app.services.san_xuat.vat_tu_de_nghi import _ngay_vn, _can_luc_luu, can_luc_hien_thi` (nếu import vòng thì chuyển ba hàm này sang `backend/app/services/gio_can.py` và để `vat_tu_de_nghi.py` import lại từ đó — giữ nguyên tên).

- [ ] **Step 1: Test migration (viết trước)**

```python
# backend/tests/test_migration_0384_stock_request_can_luc.py
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.db_migrations import MIGRATIONS, _migrate_stock_request_can_luc


def _engine_co_bang():
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE stock_requests (id INTEGER PRIMARY KEY, ngay_can DATE)"))
        c.execute(text("INSERT INTO stock_requests (id, ngay_can) VALUES (1, '2026-10-09')"))
    return eng


def test_them_cot_khong_dong_du_lieu_cu():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_stock_request_can_luc(db)
    cols = {c["name"] for c in inspect(eng).get_columns("stock_requests")}
    assert "can_luc" in cols
    with eng.connect() as c:
        assert c.execute(text("SELECT ngay_can, can_luc FROM stock_requests")).one() == ("2026-10-09", None)


def test_chay_lai_khong_loi():
    eng = _engine_co_bang()
    with Session(eng) as db:
        _migrate_stock_request_can_luc(db)
        _migrate_stock_request_can_luc(db)


def test_chua_co_bang_thi_im_lang():
    eng = create_engine("sqlite:///:memory:")
    with Session(eng) as db:
        _migrate_stock_request_can_luc(db)


def test_da_dang_ky():
    assert "0384_stock_request_can_luc" in {m[0] for m in MIGRATIONS}
```

- [ ] **Step 2: Chạy thấy đỏ** — `cd backend && python -m pytest tests/test_migration_0384_stock_request_can_luc.py -q` → ImportError `_migrate_stock_request_can_luc`.

- [ ] **Step 3: Migration + model + DB_SCHEMA**

```python
# cuối backend/app/db_migrations.py
def _migrate_stock_request_can_luc(db: Session) -> None:
    """0384 — `stock_requests.can_luc`: GIỜ cần hàng (09/10/2026, form Yêu cầu nhập xuất thêm giờ;
    bàn tổ xin vật tư mở thẳng form này). Wall-clock giờ nhà máy gắn nhãn UTC — cùng khuôn
    `san_xuat_vat_tu_de_nghi.can_luc`. `ngay_can` giữ nguyên làm ngày (lọc kỳ "Ngày cần" vẫn chạy
    trên cột ngày). Idempotent; không backfill — yêu cầu cũ chỉ có ngày."""
    insp = inspect(db.get_bind())
    if "stock_requests" not in set(insp.get_table_names()):
        return
    if "can_luc" not in _existing_columns(insp, "stock_requests"):
        kieu = "TIMESTAMP WITH TIME ZONE" if db.get_bind().dialect.name == "postgresql" else "DATETIME"
        db.execute(text(f"ALTER TABLE stock_requests ADD COLUMN can_luc {kieu}"))
    db.commit()

MIGRATIONS.append(("0384_stock_request_can_luc", _migrate_stock_request_can_luc))
```

Model (cạnh `ngay_can`):
```python
    # Giờ cần hàng (mg 0384). Wall-clock nhà máy nhãn UTC; `ngay_can` là ngày của chính giờ này.
    can_luc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```
DB_SCHEMA.md, ngay dưới dòng `ngay_can`:
```
| `can_luc` | `DateTime(timezone=True)` → `DATETIME` / `TIMESTAMPTZ` | — | yes | — | **GIỜ CẦN** (mg 0384) — wall-clock giờ nhà máy gắn nhãn UTC; `ngay_can` là ngày của giờ này. Bàn tổ xin vật tư và form Kho cùng ghi. |
```
và thêm `` `can_luc` `` vào danh sách `**Tất cả cột:**` của mục `stock_requests`.

- [ ] **Step 4: Chạy lại test migration + guard** — `python -m pytest tests/test_migration_0384_stock_request_can_luc.py tests/test_schema_documented.py -q` → PASS.

- [ ] **Step 5: Test API form Kho gửi giờ**

Tìm fixture tạo yêu cầu kho có sẵn: `grep -ln "api/kho/de-nghi" backend/tests | head` rồi bắt chước một test POST hiện có (client + token người có `kho:request`, một mặt hàng `vat_tu`). Viết:
```python
def test_tao_yeu_cau_co_gio_can_thi_ngay_can_theo_gio(client, ...):
    r = client.post("/api/kho/de-nghi", headers=h, json={
        "loai": "XUAT", "can_luc": "2026-10-09T17:30:00", "lines": [<một dòng hợp lệ>]})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ngay_can"] == "2026-10-09"
    assert body["can_luc"].startswith("2026-10-09T17:30")

def test_khong_gui_gio_van_tao_duoc_va_can_luc_rong(client, ...):
    r = client.post(..., json={"loai": "XUAT", "ngay_can": "2026-10-10", "lines": [...]})
    assert r.status_code == 201
    assert r.json()["can_luc"] is None and r.json()["ngay_can"] == "2026-10-10"
```

- [ ] **Step 6: Router + schema**

`StockRequestCreate`/`StockRequestUpdate`: `can_luc: datetime | None = None`. Trong `create_request` (và nhánh update tương ứng):
```python
can_luc = _can_luc_luu(payload.can_luc) if payload.can_luc else None
ngay_can = _ngay_vn(payload.can_luc) if payload.can_luc else payload.ngay_can
req = svc.create(..., ngay_can=ngay_can, can_luc=can_luc, ...)
```
`_serialize`: `can_luc=can_luc_hien_thi(getattr(req, "can_luc", None) or bc.get("can_luc")),`. `_HEADER_FIELDS` thêm `"can_luc"` (thiếu là bị NUỐT IM LẶNG). Kiểm `StockRequestService.update` (nếu nó lọc header theo danh sách riêng thì thêm `can_luc` vào đó).

- [ ] **Step 7: Chạy** `python -m pytest tests/test_kho_yeu_cau_can_luc.py tests/test_migration_0384_stock_request_can_luc.py -q` → PASS; chạy thêm file test kho đề nghị hiện có (`grep -l "de-nghi" tests/test_kho*.py`) để chắc không vỡ.

---

### Task 2: Bàn tổ gửi giờ + ghi chú vào yêu cầu kho; gỡ luật bắt lý do (backend)

**Files:**
- Modify: `backend/app/services/san_xuat/vat_tu_de_nghi.py` (`_chuan_hoa` L121-228, `tao` L409-521, `sua` L524-631)
- Modify: `backend/app/services/san_xuat/vat_tu_nhap_lai.py` (`tao` L117, create L155-160)
- Modify: `backend/app/services/stock_request_service.py` (`dong_bo_tu_san_xuat` L358, `khoi_phuc_tu_san_xuat` L434: nhận và ghi `can_luc`)
- Modify: `backend/app/schemas/san_xuat.py` (`VatTuDeNghiDongIn` L1490 bỏ `ly_do_chenh_lech`; `VatTuDeNghiIn` L1502 thêm `ghi_chu`; `VatTuNhapLaiIn` L1519 thêm `can_luc`; output `cac_ly_do` L831 bỏ)
- Modify: `backend/app/services/san_xuat/board.py` (~L972 bỏ dựng `cac_ly_do`)
- Modify: `backend/app/routers/san_xuat.py` (L627-695 truyền `ghi_chu`, `can_luc` xuống service)
- Test: `backend/tests/test_sx_vat_tu_de_nghi.py`, `backend/tests/test_sx_vat_tu_nhap_lai.py`

**Interfaces:**
- Consumes: Task 1 (`StockRequest.can_luc`, `_HEADER_FIELDS` có `can_luc`).
- Produces: `vat_tu_de_nghi.tao(db, *, user, cong_viec_id, can_luc, lines, ghi_chu: str | None = None, ...)`; `sua(..., ghi_chu: str | None = None)`; `vat_tu_nhap_lai.tao(db, *, user, cong_viec_id, lines, ghi_chu=None, can_luc: datetime | None = None, ...)`. Body FE: `SxVatTuDeNghiIn {can_luc, ghi_chu?, lines}`, `SxVatTuNhapLaiIn {can_luc?, ghi_chu?, lines}`. Dòng không còn `ly_do_chenh_lech`.

- [ ] **Step 1: Sửa test cho luật mới (đỏ trước)**

Trong `test_sx_vat_tu_de_nghi.py`:
- `test_lech_ke_hoach_ma_thieu_ly_do_thi_chan` (L386) → đổi tên `test_lech_ke_hoach_khong_can_ly_do_van_gui_duoc`, bỏ `pytest.raises`, assert tạo được và dòng kho có đúng `sl_de_nghi` đã xin.
- `test_xin_giay_khac_kho_la_dong_ngoai_ke_hoach_can_ly_do` (L709) → `..._khong_can_ly_do`, assert tạo được.
- `test_bo_sung_van_bat_ly_do_cho_dong_khac_0` (L1829) → `test_bo_sung_khong_bat_ly_do`, assert tạo được lần 2.
- Bỏ mọi `ly_do_chenh_lech=` trong payload test còn lại (grep `ly_do_chenh_lech` trong 3 file test).
- Thêm:
```python
def test_gio_can_va_ghi_chu_di_vao_yeu_cau_kho(db, ...):  # dùng fixture cv có kế hoạch vật tư sẵn trong file
    ra = vat_tu_de_nghi.tao(db, user=tt, cong_viec_id=cv.id, can_luc=datetime(2026, 10, 9, 17, 30),
                            lines=[...dòng kế hoạch...], ghi_chu="Anh Hoan ra nhận")
    req = db.get(StockRequest, ra["stock_request_id"])
    assert req.ngay_can == date(2026, 10, 9)
    assert can_luc_hien_thi(req.can_luc) == datetime(2026, 10, 9, 17, 30)
    assert req.ghi_chu == "Anh Hoan ra nhận"

def test_sua_doi_gio_thi_yeu_cau_kho_doi_gio(db, ...):
    # tạo lúc 17:30 rồi sua(... can_luc=datetime(2026,10,10,8,0) ...) → req.can_luc, ngay_can đổi theo

def test_khong_ghi_chu_thi_giu_cau_mac_dinh(db, ...):
    # ghi_chu=None → req.ghi_chu bắt đầu bằng "Cấp vật tư công đoạn «"
```
`test_sx_vat_tu_nhap_lai.py` thêm `test_nhap_lai_co_gio_can` (can_luc → `req.ngay_can`, `req.can_luc`).

- [ ] **Step 2: Chạy thấy đỏ** — `python -m pytest tests/test_sx_vat_tu_de_nghi.py tests/test_sx_vat_tu_nhap_lai.py -q`.

- [ ] **Step 3: Gỡ luật lý do trong `_chuan_hoa`**

Bỏ tham số `bat_buoc_ly_do`, bỏ khối L214-218 (`khong_doi_chieu`, `can_ly_do`, `raise ... phải ghi lý do`), bỏ `ly_do = ...` L191 và khoá `ly_do_chenh_lech` khỏi dict ra. Sửa hai chỗ gọi (`tao` L~458, `sua` L563). Ở chỗ dựng `SanXuatVatTuDeNghiDong(...)` bỏ đối số `ly_do_chenh_lech` (cột DB GIỮ NGUYÊN cho dữ liệu cũ, không ghi mới — ghi rõ một dòng chú thích ở model). Giữ nguyên các lỗi khác (trùng dòng, số âm, thiếu đơn vị "…báo kỹ thuật…", giấy ngoài kế hoạch thiếu khổ).

- [ ] **Step 4: Giờ + ghi chú**

`tao`:
```python
def tao(db, *, user, cong_viec_id: int, can_luc: datetime, lines: list[dict],
        ghi_chu: str | None = None, kh_svc=None, req_svc=None) -> dict:
    ...
    req = req_svc.create(user=user, loai=REQ_XUAT, lines=kho_lines, commit=False,
        bo_phan_id=cv.department_id, ngay_can=_ngay_vn(can_luc), can_luc=_can_luc_luu(can_luc),
        ghi_chu=((ghi_chu or "").strip()[:1000]
                 or f"Cấp vật tư công đoạn «{cv.ten_cong_doan}» (lần {lan_so})."))
```
`sua`: nhận `ghi_chu`, truyền `can_luc=_can_luc_luu(can_luc)` (và `ghi_chu` nếu có) vào cả ba nhánh `create` / `khoi_phuc_tu_san_xuat` / `dong_bo_tu_san_xuat`; hai hàm service kia nhận thêm `can_luc: datetime | None = None, ghi_chu: str | None = None` và gán `req.can_luc = can_luc` (khi không None), `req.ghi_chu = ghi_chu` (khi không rỗng) ngay cạnh `req.ngay_can = ngay_can` (L393).
`vat_tu_nhap_lai.tao`: thêm `can_luc: datetime | None = None`; khi có thì `ngay_can=_ngay_vn(can_luc), can_luc=_can_luc_luu(can_luc)` vào `req_svc.create`.
Schema: `VatTuDeNghiIn.ghi_chu: str | None = Field(default=None, max_length=1000)`; `VatTuNhapLaiIn.can_luc: datetime | None = None`. Router truyền `ghi_chu=body.ghi_chu`, `can_luc=body.can_luc`.

- [ ] **Step 5: Bỏ `cac_ly_do` ở đầu ra** — xoá field ở schema (L831) và khối append ở `board.py` ~L972; `grep -rn cac_ly_do backend/` phải rỗng.

- [ ] **Step 6: Chạy** `python -m pytest tests/test_sx_vat_tu_de_nghi.py tests/test_sx_vat_tu_de_nghi_api.py tests/test_sx_vat_tu_nhap_lai.py tests/test_san_xuat_board.py -q` → PASS.

---

### Task 3: Form Kho có ô giờ cần (frontend, mọi yêu cầu)

**Files:**
- Modify: `frontend/src/api/client.ts` (`StockRequestInput` ~L9384 thêm `can_luc?: string | null`)
- Modify: `frontend/src/pages/KhoDeNghiPage.tsx` (`TaoYeuCauP2` L982-1423: state, thẻ ngày L1331-1354, `guiKho` L1065-1100)

**Interfaces:**
- Consumes: Task 1 (`can_luc` ở POST/PUT `/api/kho/de-nghi`).
- Produces: state `gioCan: string` ("HH:mm", rỗng = không đặt giờ) trong `TaoYeuCauP2`; helper `ghepCanLuc(ngay: string, gio: string): string | null` (export, trả `"yyyy-mm-ddTHH:mm:00"` khi đủ cả hai, null nếu thiếu ngày; thiếu giờ ⇒ null để máy chủ chỉ lưu ngày).

- [ ] **Step 1: Test helper** — `frontend/src/pages/khoCanLuc.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ghepCanLuc } from "./KhoDeNghiPage";
describe("ghepCanLuc", () => {
  it("đủ ngày và giờ thì ghép ISO wall-clock", () => expect(ghepCanLuc("2026-10-09", "17:30")).toBe("2026-10-09T17:30:00"));
  it("thiếu giờ thì null", () => expect(ghepCanLuc("2026-10-09", "")).toBeNull());
  it("thiếu ngày thì null", () => expect(ghepCanLuc("", "17:30")).toBeNull());
});
```
- [ ] **Step 2:** `cd frontend && npx vitest run src/pages/khoCanLuc.test.ts` → FAIL.
- [ ] **Step 3: Cài đặt.** Thẻ ngày đổi nhãn "Cần xuất lúc" / "Cần nhập lúc" (theo `loai`), bên trong là hàng `.ngay-gio` gồm `ChonNgay` (giữ `min={todayISO()}`) + `ChonGio` (tìm component: `grep -rn "export function ChonGio" frontend/src`). Chip nhanh `CHON_NGAY` giữ nguyên. `guiKho` gửi `ngay_can: ngayCan || null, can_luc: ghepCanLuc(ngayCan, gioCan)`. Khi mở lại / "Tạo lại từ yêu cầu này": `seedNgayCan` giữ, giờ lấy từ `r.can_luc` nếu có (thêm `seedGioCan?: string` vào `RequestDrawerProps`).
- [ ] **Step 4:** vitest PASS + `npx tsc --noEmit -p .` sạch.

---

### Task 4: `TaoYeuCauP2` chế độ "mở từ công việc" (frontend)

**Files:**
- Modify: `frontend/src/pages/KhoDeNghiPage.tsx` (export `TaoYeuCauP2`, `SeedLine`, thêm prop `tuCongViec`)
- Modify: `frontend/src/pages/kho-ngan-a.css` hoặc css form hiện dùng (`grep -n "kna-luoi" frontend/src -r --include=*.css`) cho cột nền, nút Về 0, khổ chỉ đọc
- Test: `frontend/src/pages/KhoFormTuCongViec.test.tsx` (mới)

**Interfaces:**
- Produces:
```ts
export interface DongTuCongViec extends SeedLine {
  /** Số nền hiện ở cột thứ hai: kế hoạch (moi/sua) hoặc đã xin (bo_sung). null = dòng ngoài kế hoạch ("—"). */
  sl_nen: number | null;
  /** Dòng theo kế hoạch: không xoá được, khổ chỉ đọc, có nút "Về 0". */
  theo_ke_hoach: boolean;
}
export interface TuCongViec {
  duongDan: string;               // "Bàn tổ Cắt 2 › Cắt tờ của LSX26-0004 › Tạo mới"
  tieuDe: string;                 // "Yêu cầu xuất kho" | "Sửa yêu cầu xuất kho YC26-0031" | "Yêu cầu nhập kho"
  loai: StockRequestKind;         // XUAT cho moi/bo_sung/sua, NHAP cho nhap_lai — seg Nhập/Xuất ẨN
  cotNen: string | null;          // "Kế hoạch" | "Đã xin" | null (nhập lại không có cột nền)
  nhanSoLuong: string;            // "Số lượng xin" | "Số xin thêm" | "Số lượng nhập"
  nutGui: string;                 // "Gửi kho" | "Lưu thay đổi"
  lenh: { ma: string; ten: string; congDoan: string; to: string; lan?: { so: number; nguoi: string; luc: string } | null };
  canLuc: string;                 // "yyyy-mm-ddTHH:mm" giá trị đầu
  lucBatDauViec: string | null;   // chip "Lúc bắt đầu việc" (chỉ XUAT) đặt ngày+giờ về mốc này
  goiY: string | null;            // câu xám dưới ô Thêm vật tư
  dong: DongTuCongViec[];
  ghiChu: string;
  onGui: (p: { can_luc: string; ghi_chu: string | null; dong: DraftLine[] }) => Promise<void>;
}
```
`TaoYeuCauP2` thêm prop `tuCongViec?: TuCongViec`. Khi có:
  - `NganPhai duongDan={tuCongViec.duongDan} tieuDe={tuCongViec.tieuDe}`; không seg Nhập/Xuất; thẻ "Lệnh sản xuất" bên phải đổi thành ô khoá `LSX… Tên` + `dl` Công đoạn / Tổ (+ Lần khi sửa) với nhãn phụ "khoá theo công việc"; `LenhDong` từng dòng KHÔNG hiện (lệnh đã rõ).
  - Bảng: Vật tư (tên + khổ: `KhungKho chiDoc` khi `theo_ke_hoach`) | cột nền (`cotNen`, số + đơn vị, "—" khi null) | Tồn (giữ logic `tonCuaDong`) | `nhanSoLuong` (ô số + `DonViChonTheoHang`) | Về 0 (dòng kế hoạch) hoặc ✕.
  - Thẻ đầu "Vật tư" có tag "N mặt hàng"; câu `goiY` dưới ô thêm.
  - Ô giờ bắt buộc (`*`, nút gửi khoá khi thiếu ngày hoặc giờ); chip thêm "Lúc bắt đầu việc" khi `loai==="XUAT" && lucBatDauViec`.
  - Ghi chú placeholder: XUAT "Lý do xin, ai ra nhận…", NHAP "Ví dụ thừa do hỏng ít".
  - Gửi: `await tuCongViec.onGui({ can_luc, ghi_chu, dong: lines })` thay cho `api.kho.deNghi.create`; vẫn chạy kiểm trùng + `loiGiayDong`; dòng kế hoạch được gửi cả khi số 0 (đó là tín hiệu "không cần cấp").
  - Chân: "N mặt hàng" + cảnh báo quá tồn (chỉ XUAT, như cũ) + Huỷ + `nutGui`.

- [ ] **Step 1: Test hiển thị** (`@testing-library/react`, mock `api.kho.phieu.tonKhoa` resolve `[]`):
  - render với `tuCongViec` moi (1 dòng kế hoạch Ivory 175, 1 dòng ngoài kế hoạch) → không có chữ "Nhập" dạng nút seg (`queryByRole("button",{name:"Nhập"})` null), có cột "Kế hoạch", dòng kế hoạch có nút "Về 0" và không có nút xoá, dòng ngoài có nút xoá; không có chữ "Lý do".
  - bấm "Về 0" → ô số dòng đó thành 0.
  - nhap_lai (`cotNen:null`) → không có cột "Kế hoạch"/"Đã xin".
  - bấm Gửi kho → `onGui` nhận `can_luc` dạng `yyyy-mm-ddTHH:mm:00` và `dong` đủ dòng kể cả dòng 0.
- [ ] **Step 2:** chạy thấy FAIL. **Step 3:** cài đặt. **Step 4:** vitest PASS, `tsc` sạch, các test hiện có của Kho (`grep -l KhoDeNghiPage frontend/src -r --include=*.test.tsx`) vẫn xanh.

---

### Task 5: Bàn tổ mở form Kho thay `VatTuDeNghiForm`; bỏ cột Lý do (frontend)

**Files:**
- Modify: `frontend/src/pages/ThsxExecPanels.tsx` (`VatTuSection` L1407-1554, `VtLyDoCacLanCell` L1717, `VtDeNghiLanRow` L1728-1770, `VtDongForm` L1783, `vtCanLyDo` L1827, `vtCanTro` L1882, `vtPayloadLines` L1941, `vtDongKhoiTao` L2008, `VatTuDeNghiForm` L2057-2412)
- Modify: `frontend/src/api/client.ts` (`SxVatTuDeNghiDongIn` L2221 bỏ `ly_do_chenh_lech`; `SxVatTuDeNghiIn` thêm `ghi_chu?`; `SxVatTuNhapLaiIn` thêm `can_luc?`; `SxVatTuCapDoiChieu.cac_ly_do` bỏ; `SxVatTuCapDong.ly_do_chenh_lech` giữ nếu máy chủ còn trả cho dữ liệu cũ, không hiển thị)
- Modify: `frontend/src/pages/thsxVtPayload.test.ts` (bỏ describe "lý do chỉ đi theo khi ô Lý do đang mở", giữ hai describe còn lại)
- Test: `frontend/src/pages/ThsxVatTuMoFormKho.test.tsx` (mới)

**Interfaces:**
- Consumes: Task 4 `TaoYeuCauP2`, `TuCongViec`, `DongTuCongViec`; Task 2 body mới.
- Produces: `function dungTuCongViec(cv: SxWorkItem, cap: SxVatTuCap, mode: VtFormMode, lanSua: SxVatTuCapLan | null, toTen: string): Omit<TuCongViec, "onGui">` (export, thuần, test được) — gom logic `vtDongKhoiTao` cũ: moi/sua ⇒ mọi dòng kế hoạch (`sl_nen = sl_ke_hoach`, số đầu = số đã xin lần sửa hoặc = kế hoạch), bo_sung ⇒ `sl_nen` = đã xin, số đầu 0, nhap_lai ⇒ dòng trống thêm tay (`cotNen:null`). Dòng thiếu đơn vị hiện câu cam "Chưa có đơn vị tính. Để ở 0 thì vẫn gửi được, muốn xin thì nhờ kỹ thuật kiểm lại đơn vị." (giữ nguyên microcopy đã duyệt).

- [ ] **Step 1: Test `dungTuCongViec`** cho 4 chế độ (tieuDe, cotNen, nhanSoLuong, nutGui, số dòng, `theo_ke_hoach`, `sl_nen`) — dữ liệu dựng tay theo type `SxVatTuCap`.
- [ ] **Step 2:** FAIL. **Step 3:** cài đặt; nút của `VatTuSection` (Yêu cầu cấp vật tư / Yêu cầu bổ sung / Sửa đề nghị / Yêu cầu nhập kho) mở `<TaoYeuCauP2 token tuCongViec={{...dungTuCongViec(...), onGui}} canRequest onClose onSaved />`; `onGui` đổi `DraftLine[]` → `SxVatTuDeNghiDongIn[]` bằng `vtPayloadLines` (đã bỏ lý do) rồi gọi `exec.deNghiVatTu(cv.id, {can_luc, ghi_chu, lines})` / `exec.suaDeNghiVatTu(...)` / `exec.nhapLaiVatTu(cv.id, {can_luc, ghi_chu, lines: vtPayloadNhapLai(...)})`; lỗi máy chủ ném ra để form hiện ở `error` như cũ. Xoá `VatTuDeNghiForm`, `vtCanLyDo`, `VtLyDoCacLanCell`, cột Lý do ở bảng đối chiếu và ở `VtDeNghiLanRow`. `vtCanTro` giữ phần chặn thiếu đơn vị/thiếu khổ, bỏ mọi nhánh lý do.
- [ ] **Step 4:** `npx vitest run src/pages/thsxVtPayload.test.ts src/pages/thsxVtDonVi.test.ts src/pages/ThsxVatTuMoFormKho.test.tsx src/pages/ThsxDrawer.test.tsx` PASS; `tsc` sạch; `grep -n "Lý do" frontend/src/pages/ThsxExecPanels.tsx` chỉ còn những chỗ không thuộc vật tư (tạm dừng, sự cố…).

---

### Task 6: Điện thoại phương án C cho form (frontend)

**Files:**
- Modify: `frontend/src/pages/KhoDeNghiPage.tsx` (nhánh hẹp trong `TaoYeuCauP2`)
- Create: `frontend/src/pages/kho/kho-form-dien-thoai.css` (import trong KhoDeNghiPage)
- Test: bổ sung `frontend/src/pages/KhoFormTuCongViec.test.tsx`

**Interfaces:**
- Consumes: Task 4.
- Produces: hook `useHep(truyVan = "(max-width: 640px)")` — dùng lại hook ở `KyThuatMayChung.tsx:23` (chuyển sang `frontend/src/lib/useHep.ts` nếu nó chưa export; jsdom không có `matchMedia` ⇒ trả false).

Bám `#vtPhone` + phương án C: app bar (‹, tiêu đề, "Cắt tờ của LSX…"), hàng `dt-ctx` "Cần xuất lúc 09/10 10:00 ›" (chạm mở khay chọn ngày giờ + chip), các dòng `dt-dong` chỉ đọc (tên, khổ, Tồn, số to + đơn vị bên phải, dòng phụ "kế hoạch 175" / "ngoài kế hoạch" / "đã xin 175", câu cam thiếu đơn vị), "+ Thêm vật tư", dòng Ghi chú, chân "N mặt hàng" + nút gửi. Chạm dòng ⇒ `.dt-phu > .dt-khay` (khay dưới): tên, kế hoạch/tồn, khổ (sửa được chỉ khi dòng thêm tay), ô số lớn, nút Về 0 (dòng kế hoạch) hoặc Bỏ dòng, Xong; chạm nền hoặc nút thì đóng. Áp cho cả form Kho mở từ trang Kho (cùng component), không chỉ bàn tổ.

- [ ] **Step 1: Test** với `matchMedia` giả trả `matches:true`: render ⇒ không có `table`; chạm dòng ⇒ có `role="dialog"` tên mặt hàng, sửa số 10 bấm Xong ⇒ dòng hiện 10.
- [ ] **Step 2:** FAIL. **Step 3:** cài đặt. **Step 4:** PASS + `tsc`.

---

### Task 7: Bấm thử thật trên trình duyệt

Bật dev server theo memory (`bat-dev-server-uvicorn-tach-roi`, FE localhost:5173, BE `--host localhost`; restart uvicorn sau khi sửa route/schema), đăng nhập `admin/admin123`.

- [ ] Kho → Yêu cầu nhập xuất → Tạo yêu cầu: chọn ngày + giờ, thêm 1 vật tư, Gửi kho ⇒ cột "Cần lúc" ở danh sách hiện đúng giờ.
- [ ] Thực hiện SX → một tổ có việc có kế hoạch vật tư → mở việc → tab Vật tư → Yêu cầu cấp vật tư: thấy form Kho, đường dẫn "Bàn tổ … › … › Tạo mới", không có Nhập/Xuất, lệnh khoá, cột Kế hoạch + Tồn, nút Về 0, không có Lý do. Đổi giờ, bấm Gửi kho ⇒ bảng vật tư có lần 1; sang Kho thấy yêu cầu đúng giờ + ghi chú.
- [ ] Sửa đề nghị ⇒ tiêu đề "Sửa yêu cầu xuất kho …", nút "Lưu thay đổi", có dòng Lần. Bổ sung ⇒ cột "Đã xin", "Số xin thêm". Nhập lại ⇒ "Yêu cầu nhập kho", không cột nền.
- [ ] Thu viewport về mobile (375): form thành danh sách, chạm dòng mở khay, sửa số, Xong.
- [ ] Báo cáo liệt kê cụ thể từng bước đã bấm/gõ/thấy.
