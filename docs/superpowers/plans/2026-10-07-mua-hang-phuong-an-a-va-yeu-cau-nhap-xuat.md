# Mua hàng phương án A + Yêu cầu nhập xuất P2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa các màn Mua hàng về đúng mockup phương án A (A1–A9), làm lại form Yêu cầu nhập xuất theo P2, và sửa logic giấy: kho/mua chỉ đếm "tờ", bảng giá NCC theo dạng bán Tờ+khổ/Cuộn, so giá theo dạng+khổ, đợt giao ghi khổ thực nhận, máy chủ chặn nhập kho hai lần một đợt.

**Architecture:** Backend làm trước (4 task, mỗi task một mảng logic có test pytest), rồi frontend dựng hai mảnh dùng chung (khung khổ `KhungKho`, bố cục bảng trái + cột phải `.mr`) và làm lại từng màn theo mockup. Không thêm bảng mới; thêm cột qua `db_migrations.py` (0375–0377) và ghi `docs/DB_SCHEMA.md` cùng lúc.

**Tech Stack:** FastAPI + SQLAlchemy (Postgres dev/prod, SQLite in-memory cho test), React + TypeScript (Vite, vitest).

**Spec:**
- `docs/mockups/mua-hang-phuong-an-A.html` — màn A1–A9 (mỗi màn có khối "why" nói rõ luật).
- `docs/mockups/yeu-cau-nhap-xuat-3-phuong-an.html` — chọn **P2** (bảng trái, cột phải).
- Bộ nhớ dự án `kho-mua-hang-chi-dem-to.md` (luật tờ/cuộn đã chốt 07/10/2026).

## Global Constraints

- UI tiếng Việt hoàn toàn; không nối mẩu dữ liệu bằng `·` hay dấu phẩy — tách bằng thẻ nhỏ + khoảng trống.
- Không hồng nhạt (`--rust-soft` đã gỡ); không viền một cạnh; chọn = viền đủ cạnh; hover dùng `--rule-hair`.
- Chip trạng thái dùng bộ `--tt-*` ở `frontend/src/styles/tokens.css`, mỗi trạng thái một sắc.
- Mỗi thông tin nói một lần; không đóng hộp/tô nền ô dữ liệu.
- Ngăn chi tiết: mọi ngăn cùng độ rộng `--kt-ngan-w` (1180px), có tab Lịch sử, kéo rộng được.
- Tiền chỉ hiện với người có quyền xem tiền — gate ở MÁY CHỦ theo ô `view_cost` của màn đó.
- Kho và mua hàng: giấy tờ chỉ có đơn vị **tờ** (mã danh mục `to`); chữ "tờ nguyên / tờ in" chỉ còn ở sản xuất. Giấy cuộn đếm kg, nhập kho theo **tổng kg** (không ghi từng cuộn). Máy **không** quy tờ ↔ kg (cấm gsm × dài × rộng).
- Đơn vị không ghi cứng: lấy từ module Đơn vị & quy đổi theo cặp quy đổi về đơn vị gốc của dạng.
- Mọi danh sách bản ghi giữ `pages/thanh-loc/ThanhLoc` + phân trang/lọc ở máy chủ + `PhanTrangDayDu`.
- Boolean `server_default` là `false`/`true`, không phải `"0"`/`"1"`. Thêm cột ⇒ ghi `docs/DB_SCHEMA.md` (guard `backend/tests/test_schema_documented.py`).
- Migration backfill dùng raw SQL đích danh cột, không ORM full-select.
- Verify: `pytest` nhắm file (cwd `backend/`), `npx tsc --noEmit -p .` và `npx vitest run <file>` (cwd `frontend/`). KHÔNG chạy `./init.ps1`, không pytest full.
- `python` trần trong `backend/` trỏ vào Postgres DEV — muốn thăm dò dữ liệu thì viết test tạm.
- File CRLF sửa bằng Edit tool, không `sed -i`.
- Cây làm việc đang có ~140 file sửa dở của các việc trước (Tồn kho, ngăn 1180…). KHÔNG `git stash`, không `git checkout --` file nào; chỉ `git add` đúng file của task khi commit. Commit message tiếng Việt, không Co-Authored-By.

## File Structure

Backend
- `backend/app/services/kho_giay.py` — hằng `DON_VI_TO_KHO`, `la_ma_to_giay()`; `don_vi_goc_to()` trả `to`.
- `backend/app/services/vat_lieu_kho_service.py` — `_don_vi_giay_to` gắn cờ `giay_to`; `_dong_don_vi` nhận mã chặng tờ như đơn vị gốc.
- `backend/app/services/ke_hoach_vat_tu_service.py` — `_ve_goc` cầu chặng tờ → kho hệ số 1.
- `backend/app/services/lsx_service.py`, `kho_giay.goi_y_dong_giay` — dữ liệu SẢN XUẤT giữ mã chặng `TRAM_TO_NGUYEN`.
- `backend/app/models/purchase.py` — `SupplierItem.dang_ban/kho_rong/kho_dai`; `PurchaseDeliveryLine.kho_rong/kho_dai`.
- `backend/app/schemas/purchase.py`, `backend/app/repositories/purchase_repo.py`, `backend/app/services/purchase_service.py`, `backend/app/routers/purchases.py`.
- `backend/app/services/stock_request_service.py`, `backend/app/repositories/stock_request_repo.py` — chặn nhập kho hai lần.
- `backend/app/routers/kho_voucher.py`, `backend/app/repositories/stock_lot_repo.py` — API tồn theo khoá của một mặt hàng.
- `backend/app/db_migrations.py` — 0375, 0376, 0377. `docs/DB_SCHEMA.md`.

Frontend
- `frontend/src/components/kho-giay/KhungKho.tsx` (+ `khungKho.css`, `khungKho.ts` thuần, `khungKho.test.ts`) — khung khổ ghép A2b.
- `frontend/src/styles/bo-cuc-mr.css` — `.mr` (bảng trái + cột phải 316px), `.pp`, `.kv2`, `.cs`, `.gi`, `.lt` (khuôn bản A).
- Màn: `mua-hang/nha-cung-cap/tabs/SupplierItemsTab.tsx`; `mua-hang/yeu-cau-mua-hang/components/{RequestsTable,RequestFormDrawer,RequestDetailDrawer}.tsx`; `mua-hang/phieu-mua-hang/{components/PurchaseFormDrawer,components/LineSupplierPicker,tabs/PhieuListTab,components/PurchaseDetailDrawer,components/DeliveriesBlock,modals/DeliveryDialog}.tsx`; `ke-toan/don-mua-hang/components/InboxDrawer.tsx`; `KhoDeNghiPage.tsx` (form tạo).
- `frontend/src/api/client.ts` — kiểu mới (dang_ban, kho nhận, tồn theo khoá).

---

### Task 1: Kho và mua hàng đếm giấy tờ bằng "tờ"

**Files:**
- Modify: `backend/app/services/kho_giay.py:68-73` (và `goi_y_dong_giay` ~:99)
- Modify: `backend/app/services/vat_lieu_kho_service.py:502-557`
- Modify: `backend/app/services/ke_hoach_vat_tu_service.py:277-311`
- Modify: `backend/app/services/lsx_service.py:3252`
- Modify: `backend/app/db_migrations.py` (cuối file, sau 0374)
- Modify: `frontend/src/pages/KhoTonKhoPage.tsx:2042` (chuỗi "…đổi ra tờ nguyên…")
- Test: `backend/tests/test_kho_to_mot_don_vi.py` (mới)

**Interfaces:**
- Produces: `kho_giay.DON_VI_TO_KHO = "to"`; `kho_giay.la_ma_to_giay(dvt: str | None) -> bool` (True cho `"to"`, `"to_nguyen"`); `don_vi_goc_to() -> "to"`. `don_vi_cua_mat_hang("giay", id, dang="to")` trả `{"don_vi_goc": "to", "giay_to": True, ...}`.

Ý: mã danh mục `to` ("tờ") là đơn vị kho/mua cho giấy tờ. Dòng giấy của lệnh vẫn mang mã CHẶNG (`to_nguyen` hoặc `to`) — khi qua cửa kho, mọi mã chặng tờ quy về `to` hệ số 1 (khổ đã phân biệt tờ nào). Không thêm cặp quy đổi chặng ↔ chặng (mg 7816 cấm).

- [ ] **Step 1: Viết test hỏng**

```python
# backend/tests/test_kho_to_mot_don_vi.py
"""Kho/mua đếm giấy tờ bằng MỘT đơn vị "tờ" (mã `to`); mã chặng của lệnh qua cửa kho hệ số 1."""
from app.models.don_vi_do import DonViDo, DonViQuyDoi
from app.models.vat_lieu_kho import GiayNguyen  # chỉnh import theo model giấy thật nếu khác
from app.services.kho_giay import DON_VI_TO_KHO, don_vi_goc_to, la_ma_to_giay
from app.services.vat_lieu_kho_service import VatLieuKhoService


def _dv(db, ma, ten, ho):
    db.add(DonViDo(ma=ma, ten=ten, ho=ho, is_active=True))


def _nen(db):
    _dv(db, "to", "tờ", "to"); _dv(db, "to_nguyen", "tờ nguyên", "to")
    _dv(db, "ram", "ram", "to"); _dv(db, "kg", "kg", "khoi_luong")
    db.add(DonViQuyDoi(tu_don_vi="ram", ve_don_vi="to", he_so=500))
    g = GiayNguyen(ma="C80", ten="COUCHE 80GSM", don_vi_gia="kg")
    db.add(g); db.commit()
    return g


def test_don_vi_goc_giay_to_la_to(db):
    assert DON_VI_TO_KHO == "to" and don_vi_goc_to() == "to"
    assert la_ma_to_giay("to_nguyen") and la_ma_to_giay("to") and not la_ma_to_giay("kg")


def test_giay_to_doi_duoc_ram_va_ma_chang(db):
    g = _nen(db)
    svc = VatLieuKhoService(db)
    ra = svc.don_vi_cua_mat_hang("giay", g.id, dang="to")
    assert ra["don_vi_goc"] == "to" and ra["don_vi_goc_ten"] == "tờ"
    assert svc.quy_ve_goc("giay", g.id, "ram", 2, dang="to")["sl_goc"] == 1000
    # mã chặng của dòng giấy lệnh: hệ số 1, lưu về mã kho `to`
    q = svc.quy_ve_goc("giay", g.id, "to_nguyen", 300, dang="to")
    assert q["sl_goc"] == 300 and q["ma_don_vi"] == "to"
    # tờ không bao giờ đổi ra kg
    import pytest
    from app.services.vat_lieu_kho_service import VatLieuKhoValidationError
    with pytest.raises(VatLieuKhoValidationError):
        svc.quy_ve_goc("giay", g.id, "kg", 1, dang="to")
```

Ghi chú cho người làm: tên model/cột (`DonViDo.ho`, `DonViQuyDoi.tu_don_vi/ve_don_vi/he_so`, model giấy) phải đối chiếu `backend/app/models/don_vi_do.py:225` và model giấy thật; fixture `db` ở `backend/tests/conftest.py`. Nếu test cũ đã có helper dựng đơn vị (vd `tests/test_kho_lo_giay.py:31-34`) thì tái dùng.

- [ ] **Step 2: Chạy test, thấy hỏng**

Run (cwd `backend/`): `python -m pytest tests/test_kho_to_mot_don_vi.py -q`
Expected: FAIL — `ImportError: cannot import name 'DON_VI_TO_KHO'`.

- [ ] **Step 3: Sửa `kho_giay.py`**

```python
#: Đơn vị đếm giấy TỜ ở KHO và MUA HÀNG (chủ chốt 07/10/2026): một chữ "tờ" — tờ nào khác tờ nào
#: là do KHỔ. Chữ "tờ nguyên / tờ in" chỉ còn trong sản xuất (mã chặng, xem `don_vi_do.TRAM_*`).
DON_VI_TO_KHO = "to"


def la_ma_to_giay(dvt: str | None) -> bool:
    """Mã đếm TỜ của dòng giấy: đơn vị kho `to` hoặc mã chặng tờ của lệnh (`to_nguyen`, `to`).
    Qua cửa kho các mã này là MỘT đơn vị, hệ số 1."""
    from ..models.don_vi_do import TRAM_TO, TRAM_TO_NGUYEN

    return (dvt or "").strip().lower() in {DON_VI_TO_KHO, TRAM_TO_NGUYEN, TRAM_TO}


def don_vi_goc_to() -> str:
    """MÃ đơn vị đếm lô/dòng giấy TỜ ở kho và mua hàng."""
    return DON_VI_TO_KHO
```

Trong `goi_y_dong_giay` (gợi ý dòng giấy của BƯỚC lệnh — dữ liệu sản xuất) đổi `"don_vi": don_vi_goc_to()` thành mã chặng:

```python
    from ..models.don_vi_do import TRAM_TO_NGUYEN
    out = {"kho_rong": kr, "kho_dai": kd, "don_vi": TRAM_TO_NGUYEN,
           "so_luong": None, "dien_giai": None, "ly_do": None}
```

Ngoại lệ: `san_xuat/chot_giay.py:548` dùng `goi_y_dong_giay` nhưng đặt `"don_vi": don_vi_goc_to()` riêng — giữ nguyên (đó là dòng đi sang kho, nay ra `to`).

- [ ] **Step 4: Sửa `vat_lieu_kho_service.py`**

`_don_vi_giay_to` dùng `don_vi_goc_to()` và gắn cờ:

```python
    def _don_vi_giay_to(self, obj, dvs: dict, cap_rows: list) -> dict:
        """Giấy dạng TỜ: gốc là đơn vị kho `to` ("tờ"); ram… theo cặp ở module Đơn vị."""
        goc = don_vi_goc_to()
        ds = don_vi_dung_duoc(goc, dvs, cap_rows, None)
        return {
            "hang_loai": "giay", "hang_id": obj.id, "ma": obj.ma, "ten": obj.ten,
            "don_vi_goc": goc,
            "don_vi_goc_ten": (dvs.get(goc.lower()) or {}).get("ten") or "tờ",
            "ds": ds, "ly_do": None, "giay_to": True,
        }
```

`_dong_don_vi` nhận mã chặng tờ như dòng gốc (chỉ khi `ra["giay_to"]`):

```python
    @staticmethod
    def _dong_don_vi(ra: dict, dvt: str | None) -> dict | None:
        ma = (dvt or "").strip().lower()
        if not ma:
            return None
        hop = {d["ma"].lower(): d for d in ra["ds"]}
        hop.update({(d["ten"] or "").strip().lower(): d for d in ra["ds"] if d["ten"]})
        if ma not in hop and ra.get("giay_to") and la_ma_to_giay(ma):
            # Mã chặng của dòng giấy lệnh qua cửa kho: cùng một tờ, hệ số 1.
            return hop.get(ra["don_vi_goc"].lower())
        return hop.get(ma)
```

Import `don_vi_goc_to, la_ma_to_giay` từ `.kho_giay` ở đầu file (đã import `DANG_TO`/`DANG_CUON` từ đó).

- [ ] **Step 5: Sửa `ke_hoach_vat_tu_service._ve_goc`** — ngay sau `goc = self._dv_to()` trong nhánh `giay_to`:

```python
        if giay_to and la_ma_to_giay(dvt):
            goc_ten = (self._dvs.get(goc.lower()) or {}).get("ten") or "tờ"
            sl = _f(so_luong)
            return {"sl": sl, "don_vi_goc_ten": goc_ten, "hien_thi": f"{_so(so_luong)} {goc_ten}"}
```

(`la_ma_to_giay` import từ `.kho_giay`.)

- [ ] **Step 6: `lsx_service.py:3252`** — `don_vi_snapshot` là dữ liệu sản xuất: thay `don_vi_goc_to()` bằng `TRAM_TO_NGUYEN` (import từ `..models.don_vi_do`).

- [ ] **Step 7: Migration 0375** (cuối `db_migrations.py`):

```python
def _migrate_kho_mua_dem_to(db: Session) -> None:
    """0375 — kho & mua hàng đếm giấy tờ bằng đơn vị `to` ("tờ") thay mã chặng `to_nguyen`
    (chủ chốt 07/10/2026). Đảm bảo danh mục có `to`; đổi mã đơn vị đã lưu ở các dòng KHO/MUA
    của giấy tờ. Dòng giấy của LỆNH (`lsx_cong_doan_vat_tu.don_vi_snapshot`) là mã chặng, không đụng."""
    insp = inspect(db.get_bind())
    bang = set(insp.get_table_names())
    if "don_vi_do" in bang:
        co = db.execute(text("SELECT 1 FROM don_vi_do WHERE lower(ma) = 'to'")).first()
        if co is None:
            db.execute(text(
                "INSERT INTO don_vi_do (ma, ten, ho, is_active) VALUES ('to', 'tờ', 'to', true)"))
    viec = [
        ("stock_request_lines", "dvt", "hang_loai = 'giay' AND dang_giay = 'to'"),
        ("san_xuat_vat_tu_de_nghi_dong", "dvt", "hang_loai = 'giay' AND dang_giay = 'to'"),
        ("san_xuat_vat_tu_de_nghi_dong", "dvt_goc", "hang_loai = 'giay' AND dang_giay = 'to'"),
        ("department_purchase_request_lines", "unit", "hang_loai = 'giay'"),
        ("purchase_request_lines", "unit", "hang_loai = 'giay'"),
        ("supplier_items", "unit", "hang_loai = 'giay'"),
    ]
    for ten_bang, cot, dk in viec:
        if ten_bang not in bang or cot not in _existing_columns(insp, ten_bang):
            continue
        db.execute(text(f"UPDATE {ten_bang} SET {cot} = 'to' WHERE {cot} = 'to_nguyen' AND {dk}"))
    db.commit()


MIGRATIONS.append(("0375_kho_mua_dem_to", _migrate_kho_mua_dem_to))
```

Đối chiếu tên cột thật của `don_vi_do` (có thể có thêm cột NOT NULL không default — nếu có, thêm vào INSERT) trước khi chạy.

- [ ] **Step 8: Chạy test mới + các test liên quan**

Run: `python -m pytest tests/test_kho_to_mot_don_vi.py tests/test_kho_lo_giay.py tests/test_kho_de_nghi.py tests/test_ke_hoach_vat_tu_buoc_dau.py tests/test_vat_lieu_kho.py tests/test_quy_doi.py -q`
Expected: PASS. Test cũ nào đang assert `"to_nguyen"` là đơn vị KHO/MUA (không phải mã chặng sản xuất) thì sửa assert sang `"to"`; test về chặng sản xuất giữ nguyên. Grep: `grep -rn "to_nguyen" backend/tests | grep -v don_vi_vao`.

- [ ] **Step 9: Frontend** — `KhoTonKhoPage.tsx:2042` thay "tờ nguyên" bằng "tờ". Grep thêm chuỗi người dùng thấy: `grep -rn "tờ nguyên" frontend/src --include=*.tsx | grep -v "//"` — chỉ sửa ở màn kho/mua, giữ màn Công đoạn/lệnh (nhãn chặng).

- [ ] **Step 10: Commit**

```bash
git add backend/app/services/kho_giay.py backend/app/services/vat_lieu_kho_service.py backend/app/services/ke_hoach_vat_tu_service.py backend/app/services/lsx_service.py backend/app/db_migrations.py backend/tests/test_kho_to_mot_don_vi.py frontend/src/pages/KhoTonKhoPage.tsx
git commit -m "Kho và mua hàng đếm giấy tờ bằng một đơn vị tờ (mã to); mã chặng của lệnh qua cửa kho hệ số 1 (mg 0375)"
```

---

### Task 2: Bảng giá NCC theo dạng bán Tờ + khổ / Cuộn

**Files:**
- Modify: `backend/app/models/purchase.py:175-207` (SupplierItem)
- Modify: `backend/app/schemas/purchase.py:24-45,87-111,182-208`
- Modify: `backend/app/repositories/purchase_repo.py:384-396,411-423,468-485,562+`
- Modify: `backend/app/services/purchase_service.py:632-677,734-768,857-914,1020-1228`
- Modify: `backend/app/routers/purchases.py:345-375,466-484`
- Modify: `backend/app/db_migrations.py`, `docs/DB_SCHEMA.md:2039`
- Test: `backend/tests/test_ncc_gia_theo_dang.py` (mới); sửa `tests/test_ncc_so_gia.py` nếu vỡ

**Interfaces:**
- Consumes: Task 1 — `don_vi_cua_mat_hang("giay", id, dang="to")` gốc `to`.
- Produces:
  - Cột `supplier_items.dang_ban VARCHAR(8) NULL` (`'to'|'cuon'`, NULL cho vật tư không phải giấy), `kho_rong INTEGER NOT NULL DEFAULT 0`, `kho_dai INTEGER NOT NULL DEFAULT 0`.
  - `SupplierItemIn`/`SupplierItemRow` thêm `dang_ban: str | None`, `kho_rong: int = 0`, `kho_dai: int = 0`.
  - `GET /api/supplier-items/so-gia?hang_loai=&hang_id=&dang=&kho_rong=&kho_dai=` — `dang`/khổ tuỳ chọn; có `dang` thì chỉ trả dòng cùng dạng (tờ: cùng khổ tuyệt đối). `SoGiaRow` thêm `dang_ban, kho_rong, kho_dai`.
  - `SoGiaOut.don_vi_goc` = `to` (tờ) hoặc đơn vị giá (cuộn) theo `dang` gửi lên.

Luật:
- Giấy: `dang_ban` bắt buộc. `to` ⇒ đủ hai cạnh (`chuan_kho`), đơn vị phải đổi được về `to`. `cuon` ⇒ `kho_dai = 0`, `kho_rong` tuỳ chọn (0 = mọi khổ), đơn vị phải đổi được về `don_vi_gia` khối lượng.
- Không phải giấy: `dang_ban = NULL`, khổ 0 — như cũ.
- Quy đổi (`gia_quy_doi`) tính với `dang` của chính dòng.
- So giá dòng giấy tờ: chỉ xếp hạng dòng cùng `dang_ban='to'` và cùng `(kho_rong, kho_dai)`; cuộn: dòng `cuon` (khổ cuộn của dòng NCC = 0 hoặc bằng khổ yêu cầu).

- [ ] **Step 1: Viết test hỏng**

```python
# backend/tests/test_ncc_gia_theo_dang.py
"""Bảng giá NCC giấy theo dạng bán: tờ (khổ, so đ/tờ) và cuộn (so đ/kg); so giá chỉ cùng dạng+khổ."""
import pytest

# Dựng nền: đơn vị to/ram/kg/tan + cặp ram→to=500, tan→kg=1000, một mã giấy don_vi_gia=kg,
# hai NCC. Tái dùng helper trong tests/test_ncc_so_gia.py (đọc file đó để lấy cách dựng NCC
# qua API `/api/suppliers` với `items`).


def test_dong_to_luu_khổ_va_quy_ve_gia_mot_to(client, admin_headers, nen_giay):
    r = client.post("/api/suppliers", headers=admin_headers, json={
        "name": "Tân Mai", "items": [
            {"hang_loai": "giay", "hang_id": nen_giay.id, "item_name": nen_giay.ten,
             "dang_ban": "to", "kho_rong": 870, "kho_dai": 650, "unit": "ram",
             "unit_price": 520000, "vat_percent": 8},
            {"hang_loai": "giay", "hang_id": nen_giay.id, "item_name": nen_giay.ten,
             "dang_ban": "cuon", "kho_rong": 0, "kho_dai": 0, "unit": "tan",
             "unit_price": 22600000, "vat_percent": 8},
        ]})
    assert r.status_code == 201, r.text
    items = {i["dang_ban"]: i for i in r.json()["items"]}
    assert (items["to"]["kho_rong"], items["to"]["kho_dai"]) == (650, 870)  # chuẩn hoá cạnh ngắn trước
    assert items["to"]["gia_quy_doi"] == 1040
    assert items["cuon"]["gia_quy_doi"] == 22600


def test_dong_to_khong_nhan_don_vi_kg(client, admin_headers, nen_giay):
    r = client.post("/api/suppliers", headers=admin_headers, json={
        "name": "X", "items": [{"hang_loai": "giay", "hang_id": nen_giay.id,
                               "item_name": nen_giay.ten, "dang_ban": "to", "kho_rong": 650,
                               "kho_dai": 870, "unit": "kg", "unit_price": 1}]})
    assert r.status_code == 400


def test_giay_bat_buoc_dang_ban_va_to_du_hai_canh(client, admin_headers, nen_giay):
    base = {"hang_loai": "giay", "hang_id": nen_giay.id, "item_name": nen_giay.ten,
            "unit": "kg", "unit_price": 1}
    assert client.post("/api/suppliers", headers=admin_headers,
                       json={"name": "A", "items": [base]}).status_code in (400, 422)
    to_thieu = {**base, "unit": "to", "dang_ban": "to", "kho_rong": 650, "kho_dai": 0}
    assert client.post("/api/suppliers", headers=admin_headers,
                       json={"name": "B", "items": [to_thieu]}).status_code in (400, 422)


def test_so_gia_chi_so_cung_dang_cung_kho(client, admin_headers, nen_giay, hai_ncc_giay):
    q = f"/api/supplier-items/so-gia?hang_loai=giay&hang_id={nen_giay.id}&dang=to&kho_rong=650&kho_dai=870"
    rows = client.get(q, headers=admin_headers).json()
    assert rows["don_vi_goc"] == "to"
    assert [r["supplier_name"] for r in rows["items"]] == ["Tân Mai", "An Phát"]  # 1.040 < 1.080
    assert all(r["dang_ban"] == "to" and (r["kho_rong"], r["kho_dai"]) == (650, 870) for r in rows["items"])
```

Fixture `nen_giay` (mã giấy `don_vi_gia="kg"`, đơn vị to/ram/kg/tan, cặp ram→to 500, tan→kg 1000) và `hai_ncc_giay` (Tân Mai tờ 650×870 ram 520.000; An Phát tờ 650×870 tờ 1.080; Việt Trì chỉ cuộn) đặt trong chính file test. Fixture `client`/`admin_headers`: dùng đúng tên trong `backend/tests/conftest.py` (đọc trước; nếu tên khác thì đổi theo).

- [ ] **Step 2: Chạy, thấy hỏng** — `python -m pytest tests/test_ncc_gia_theo_dang.py -q` → FAIL (field `dang_ban` bị `extra="forbid"` từ chối, 422).

- [ ] **Step 3: Model + migration + DB_SCHEMA**

`SupplierItem` thêm (sau `hang_id`):

```python
    # DẠNG BÁN của dòng giá GIẤY (chủ chốt 07/10/2026): `to` = bán tờ đúng khổ (kho_rong ×
    # kho_dai, cạnh ngắn trước), `cuon` = bán cuộn (kho_rong = khổ cuộn, 0 = mọi khổ). Dạng quyết
    # đơn vị gốc để so giá: tờ so đ/tờ, cuộn so đ/kg. NULL cho vật tư không phải giấy.
    dang_ban: Mapped[str | None] = mapped_column(String(8), nullable=True)
    kho_rong: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    kho_dai: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
```

Migration (theo khuôn 0352/0360):

```python
def _migrate_ncc_gia_theo_dang(db: Session) -> None:
    """0376 — `supplier_items.dang_ban/kho_rong/kho_dai`. Dòng giấy cũ: đơn vị khối lượng ⇒
    `cuon` (giá theo kg vẫn đúng), đơn vị đếm tờ ⇒ `to` khổ 0×0 (phải khai khổ mới so được)."""
    insp = inspect(db.get_bind())
    if "supplier_items" not in insp.get_table_names():
        return
    co = _existing_columns(insp, "supplier_items")
    if "dang_ban" not in co:
        db.execute(text("ALTER TABLE supplier_items ADD COLUMN dang_ban VARCHAR(8)"))
    for ten in ("kho_rong", "kho_dai"):
        if ten not in co:
            db.execute(text(f"ALTER TABLE supplier_items ADD COLUMN {ten} INTEGER NOT NULL DEFAULT 0"))
    db.execute(text(
        "UPDATE supplier_items SET dang_ban = CASE WHEN lower(unit) IN ('to', 'to_nguyen', 'ram') "
        "THEN 'to' ELSE 'cuon' END WHERE hang_loai = 'giay' AND dang_ban IS NULL"))
    db.commit()


MIGRATIONS.append(("0376_ncc_gia_theo_dang", _migrate_ncc_gia_theo_dang))
```

`docs/DB_SCHEMA.md` mục `### supplier_items` (~:2039) thêm ba dòng cột `dang_ban`, `kho_rong`, `kho_dai` đúng khuôn bảng đang dùng ở đó.

- [ ] **Step 4: Schema** — `SupplierItemIn` thêm field + validator dùng `_chuan_kho_dong` có sẵn (`schemas/purchase.py:11-21`):

```python
    dang_ban: Literal["to", "cuon"] | None = None
    kho_rong: int = Field(default=0, ge=0)
    kho_dai: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _dang_giay(self):
        if self.hang_loai == "giay":
            if self.dang_ban is None:
                raise ValueError("Dòng giá giấy phải chọn dạng bán: Tờ hoặc Cuộn.")
            if self.dang_ban == "to":
                if not (self.kho_rong and self.kho_dai):
                    raise ValueError("Giấy bán tờ phải đủ hai cạnh khổ.")
                self.kho_rong, self.kho_dai = chuan_kho(self.kho_rong, self.kho_dai)
            else:
                self.kho_dai = 0
        else:
            self.dang_ban, self.kho_rong, self.kho_dai = None, 0, 0
        return self
```

`SupplierItemRow`, `SoGiaRow` thêm `dang_ban: str | None = None`, `kho_rong: int = 0`, `kho_dai: int = 0`. `SupplierItemImportRow` thêm cùng ba field.

- [ ] **Step 5: Repo** — `SupplierItemInput` nhận thêm `dang_ban=None, kho_rong=0, kho_dai=0`; `create`/`update` truyền ba cột vào `SupplierItem(...)`. `items_for_hang(hang_loai, hang_id, *, dang=None, kho_rong=0, kho_dai=0)`:

```python
        if dang is not None:
            q = q.filter(SupplierItem.dang_ban == dang)
            if dang == "to":
                q = q.filter(SupplierItem.kho_rong == kho_rong, SupplierItem.kho_dai == kho_dai)
            elif kho_rong:
                q = q.filter(SupplierItem.kho_rong.in_([0, kho_rong]))
```

- [ ] **Step 6: Service**
  - `_kiem_don_vi_ncc(hang_loai, hang_id, unit, dang=None)` → `self.hang.quy_ve_goc(hang_loai, hang_id, unit, 1, dang=dang)["ma_don_vi"]`; `_clean_supplier_items` truyền `dang_ban` và chép ba field vào `SupplierItemInput`.
  - `quy_doi_bang_gia`: dòng giấy gọi `self.hang.don_vi_cua_mat_hang("giay", id, dang=it.dang_ban)` (nhớ theo cặp `(id, dang)` trong một dict cục bộ); vật tư khác giữ `don_vi_nhieu_mat_hang`.
  - `so_gia_ncc(hang_loai, hang_id, *, dang=None, kho_rong=0, kho_dai=0)`: `info = self.hang.don_vi_cua_mat_hang(hang_loai, hang_id, dang=dang)`, gọi repo với bộ lọc; mỗi row thêm `dang_ban/kho_rong/kho_dai`. Không truyền `dang` với giấy ⇒ giữ hành vi cũ nhưng mỗi dòng quy theo `dang_ban` của chính nó (để màn Tồn kho tổng quát vẫn chạy).
  - Excel: `COT_VAT_TU = ("Tên hàng*", "Dạng bán", "Khổ (mm)", "Đơn vị*", "Đơn giá*", "VAT %", "Ghi chú")`. "Dạng bán" nhận `Tờ`/`Cuộn`/trống; "Khổ (mm)" nhận `650x870` hoặc `1090` (tách bằng `x`/`×`, rồi `chuan_kho`). Header detection (`:1141-1147`) chỉ đòi hai cột đầu — đổi sang tìm theo TÊN cột để file cũ 5 cột vẫn đọc được (thiếu cột Dạng bán ⇒ giấy suy theo đơn vị như migration 0376). Khoá trùng trong file (`_khoa_vat_tu`, `:1026`) thêm dạng + khổ. Cập nhật 2 dòng ví dụ mẫu (`:1078-1080`).
- [ ] **Step 7: Router** — `GET /api/supplier-items/so-gia` thêm query `dang: Literal["to","cuon"] | None = None, kho_rong: int = 0, kho_dai: int = 0` và truyền xuống; `_dong_ncc` chép ba field.
- [ ] **Step 8: Chạy test** — `python -m pytest tests/test_ncc_gia_theo_dang.py tests/test_ncc_so_gia.py tests/test_don_vi_ncc_luu_ma.py tests/test_mua_hang_khong_n_cong_1.py tests/test_schema_documented.py -q` và nhóm Excel trong `tests/test_purchases_api.py -k "vat_tu or xlsx"`. Test cũ dựng dòng giá giấy không có `dang_ban` ⇒ thêm `dang_ban` vào dữ liệu test (đó là luật mới, không phải lùi luật).
- [ ] **Step 9: Commit** — `git add` các file trên + test; message: `Bảng giá NCC giấy theo dạng bán Tờ+khổ/Cuộn: so giá chỉ cùng dạng cùng khổ, tờ so đ/tờ, cuộn so đ/kg (mg 0376)`.

---

### Task 3: Đợt giao ghi khổ thực nhận

**Files:**
- Modify: `backend/app/models/purchase.py:462-490` (PurchaseDeliveryLine)
- Modify: `backend/app/schemas/purchase.py:506-517,561-564`
- Modify: `backend/app/services/purchase_service.py:2595-2647,2674-2732,3480-3509`
- Modify: `backend/app/db_migrations.py`, `docs/DB_SCHEMA.md:2103`
- Test: `backend/tests/test_dot_giao_kho_nhan.py` (mới)

**Interfaces:**
- Produces: `purchase_delivery_lines.kho_rong/kho_dai INTEGER NOT NULL DEFAULT 0` (0×0 = theo khổ đặt). `PurchaseDeliveryLineIn` thêm `kho_rong: int = 0, kho_dai: int = 0`. `PurchaseDeliveryLineOut` thêm `kho_rong, kho_dai` (khổ THỰC NHẬN, đã điền khổ đặt khi 0) và `khac_kho_dat: bool`.

Luật: chỉ dòng giấy tờ (dòng đơn có đủ hai cạnh) mới sửa khổ nhận; gửi đủ hai cạnh ⇒ `chuan_kho`; bằng khổ đặt ⇒ lưu 0×0. Giấy cuộn/vật tư khác: bỏ qua khổ (lưu 0×0).

- [ ] **Step 1: Test hỏng**

```python
# backend/tests/test_dot_giao_kho_nhan.py
"""Đợt giao ghi khổ THỰC NHẬN của dòng giấy tờ; mặc định = khổ đặt."""
# Dựng đơn mua có dòng giấy tờ 790×1090 bằng helper `_giay_co_ncc` ở tests/test_purchases_api.py:2429
# (import hoặc chép), duyệt đơn, rồi POST /api/purchase-requests/{id}/deliveries.


def test_mac_dinh_kho_nhan_bang_kho_dat(client, admin_headers, don_giay_to):
    pr, dong = don_giay_to
    r = client.post(f"/api/purchase-requests/{pr}/deliveries", headers=admin_headers, json={
        "delivery_date": "2026-10-14",
        "lines": [{"purchase_request_line_id": dong, "quantity": 2000}]})
    assert r.status_code == 201, r.text
    ln = r.json()["lines"][0]
    assert (ln["kho_rong"], ln["kho_dai"], ln["khac_kho_dat"]) == (790, 1090, False)


def test_ghi_kho_nhan_khac_kho_dat(client, admin_headers, don_giay_to):
    pr, dong = don_giay_to
    r = client.post(f"/api/purchase-requests/{pr}/deliveries", headers=admin_headers, json={
        "delivery_date": "2026-10-14",
        "lines": [{"purchase_request_line_id": dong, "quantity": 2000,
                   "kho_rong": 1080, "kho_dai": 790}]})
    ln = r.json()["lines"][0]
    assert (ln["kho_rong"], ln["kho_dai"], ln["khac_kho_dat"]) == (790, 1080, True)
```

(Đường dẫn/khuôn trả về đối chiếu `routers/purchases.py:897-941` — nếu POST trả cả đơn thì lấy đợt cuối trong `deliveries`.)

- [ ] **Step 2: Chạy, thấy hỏng** — 422 vì `extra="forbid"` hoặc thiếu field.
- [ ] **Step 3: Model + migration 0377 + DB_SCHEMA**

```python
    # KHỔ THỰC NHẬN của dòng giấy tờ (mm, cạnh ngắn trước). 0×0 = đúng khổ đặt. NCC giao khác khổ
    # thì hàng vào tồn theo khổ này (kho so khổ bằng nhau tuyệt đối). mg 0377.
    kho_rong: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    kho_dai: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
```

```python
def _migrate_dot_giao_kho_nhan(db: Session) -> None:
    """0377 — `purchase_delivery_lines.kho_rong/kho_dai` (khổ thực nhận; 0×0 = khổ đặt)."""
    insp = inspect(db.get_bind())
    if "purchase_delivery_lines" not in insp.get_table_names():
        return
    co = _existing_columns(insp, "purchase_delivery_lines")
    for ten in ("kho_rong", "kho_dai"):
        if ten not in co:
            db.execute(text(
                f"ALTER TABLE purchase_delivery_lines ADD COLUMN {ten} INTEGER NOT NULL DEFAULT 0"))
    db.commit()


MIGRATIONS.append(("0377_dot_giao_kho_nhan", _migrate_dot_giao_kho_nhan))
```

- [ ] **Step 4: Service** — `_clean_dot_lines` đọc `kho_rong/kho_dai`, với dòng đơn có đủ hai cạnh: chuẩn hoá bằng `chuan_kho`; bằng khổ đặt ⇒ 0,0; một cạnh ⇒ `PurchaseValidationError("Khổ nhận của giấy tờ phải đủ hai cạnh.")`; dòng không phải giấy tờ ⇒ 0,0. Trả thêm hai khoá trong dict. `sua_dot_giao` chép thêm `kho_rong/kho_dai` (cạnh `quantity`/`note` ở `:2719-2720`). `_to_request_out` (`:3480-3509`): khổ ra = khổ lưu nếu > 0, không thì khổ của dòng đơn; `khac_kho_dat = khổ lưu > 0`.
- [ ] **Step 5: Chạy** — `python -m pytest tests/test_dot_giao_kho_nhan.py tests/test_payables_api.py -k "dot or giao" tests/test_purchases_api.py -k "deliver" tests/test_schema_documented.py -q` → PASS.
- [ ] **Step 6: Commit** — message: `Đợt giao ghi khổ thực nhận của giấy tờ, mặc định khổ đặt, khác khổ thì đánh dấu (mg 0377)`.

---

### Task 4: Chặn nhập kho hai lần một đợt + API tồn theo khoá của một mặt hàng

**Files:**
- Modify: `backend/app/repositories/stock_request_repo.py:141-158` (thêm `tim_theo_purchase_delivery`)
- Modify: `backend/app/services/stock_request_service.py:131-192`
- Modify: `backend/app/repositories/stock_lot_repo.py`, `backend/app/routers/kho_voucher.py`
- Modify: `backend/app/schemas/stock.py`
- Test: `backend/tests/test_kho_de_nghi.py` (thêm 2 test cạnh `:1060`), `backend/tests/test_ton_theo_khoa.py` (mới)

**Interfaces:**
- Produces:
  - `StockRequestRepository.tim_theo_purchase_delivery(delivery_id: int) -> StockRequest | None` (bỏ qua `REQ_CANCELLED`, `REQ_REJECTED`).
  - `StockRequestService.create` ném `StockRequestError("Đợt {n} của {mã đơn} đã có yêu cầu nhập kho {mã YC}.")` khi đợt đã có yêu cầu sống; router đổi thành 409.
  - `GET /api/kho/phieu/lo/ton-khoa?hang_loai=&hang_id=` → `list[TonKhoaRow]` với `TonKhoaRow{dang_giay: str|None, kho_rong: int, kho_dai: int, ton: float, don_vi_goc: str}` — tồn TOÀN XƯỞNG theo từng khoá (mã + dạng + khổ) của một mặt hàng; cùng cửa quyền đọc tồn với `/lo/danh-sach` (không có tiền). Dùng cho cột Tồn và gợi ý khổ ở FE.

- [ ] **Step 1: Test hỏng** — trong `test_kho_de_nghi.py`, cạnh `test_yeu_cau_nhap_tu_dot_giao_tra_ma_don_mua_va_so_dot` (dựng `PurchaseDelivery` thẳng DB như test đó):

```python
def test_mot_dot_giao_chi_nhap_kho_mot_lan(client, admin_headers, dot_giao_giay):
    body = _body_nhap_tu_dot(dot_giao_giay)          # chép khuôn body của test :1060
    assert client.post("/api/kho/de-nghi", headers=admin_headers, json=body).status_code == 201
    body2 = {**body, "ghi_chu": "gửi lại sau vài phút"}  # khác nội dung ⇒ không dính chong_gui_lai
    r = client.post("/api/kho/de-nghi", headers=admin_headers, json=body2)
    assert r.status_code == 409 and "đã có yêu cầu nhập kho" in r.json()["detail"]


def test_dot_da_huy_yeu_cau_thi_nhap_lai_duoc(client, admin_headers, dot_giao_giay):
    body = _body_nhap_tu_dot(dot_giao_giay)
    yc = client.post("/api/kho/de-nghi", headers=admin_headers, json=body).json()
    client.post(f"/api/kho/de-nghi/{yc['id']}/huy", headers=admin_headers, json={"ly_do": "sai"})
    assert client.post("/api/kho/de-nghi", headers=admin_headers,
                       json={**body, "ghi_chu": "lần 2"}).status_code == 201
```

(Đường huỷ yêu cầu: đối chiếu `routers/kho_request.py`; dùng đúng route huỷ đang có.)

```python
# backend/tests/test_ton_theo_khoa.py
def test_ton_theo_khoa_tach_tung_kho(client, admin_headers, lo_giay_hai_kho):
    g = lo_giay_hai_kho  # 7.240 tờ 650×870 + 3.200 tờ 790×1090 + 1.840 kg cuộn, dựng bằng phiếu nhập
    rows = client.get(f"/api/kho/phieu/lo/ton-khoa?hang_loai=giay&hang_id={g}",
                      headers=admin_headers).json()
    got = {(r["dang_giay"], r["kho_rong"], r["kho_dai"]): r["ton"] for r in rows}
    assert got[("to", 650, 870)] == 7240 and got[("to", 790, 1090)] == 3200
    assert got[("cuon", 0, 0)] == 1840
```

(Dựng lô: dùng helper tạo phiếu nhập ở `tests/test_kho_lo_giay.py`.)

- [ ] **Step 2: Chạy, thấy hỏng** (lần POST thứ hai trả 201; route `ton-khoa` 404).
- [ ] **Step 3: Repo + service guard**

```python
    def tim_theo_purchase_delivery(self, delivery_id: int) -> StockRequest | None:
        """Yêu cầu nhập kho CÒN SỐNG của một đợt giao — một đợt chỉ nhập kho một lần."""
        return (
            self.db.query(StockRequest)
            .filter(StockRequest.purchase_delivery_id == delivery_id,
                    StockRequest.trang_thai.notin_([REQ_CANCELLED, REQ_REJECTED]))
            .order_by(StockRequest.id.desc())
            .first()
        )
```

Trong `create`, sau `_validate_lines` và trong vùng khoá (`:156-160`):

```python
        dot_id = header.get("purchase_delivery_id")
        if dot_id:
            cu = self.repo.tim_theo_purchase_delivery(int(dot_id))
            if cu is not None:
                raise StockRequestConflict(f"Đợt giao này đã có yêu cầu nhập kho {cu.ma}.")
```

`StockRequestConflict(StockRequestError)` mới; router `kho_request.py:547-565` bắt → `HTTPException(409, detail=str(exc))`. Câu lỗi phải chứa "đã có yêu cầu nhập kho". Khoá chống hai request song song: dùng `SELECT … FOR UPDATE` trên dòng `purchase_deliveries` (Postgres) — `self.db.query(PurchaseDelivery).filter_by(id=dot_id).with_for_update().first()` trước khi tìm (SQLite bỏ qua `FOR UPDATE`, test vẫn chạy).

- [ ] **Step 4: Tồn theo khoá** — `stock_lot_repo`: `ton_theo_khoa(hang_loai, hang_id) -> list[tuple[dang, kho_rong, kho_dai, sl]]` (SUM số còn của lô còn sống, GROUP BY dạng + khổ — đọc cách `khoa_trong_kho` và cột số còn của `StockLot` đang dùng ở `/lo/danh-sach`). Router `GET /lo/ton-khoa` theo khuôn quyền của `/lo/danh-sach` (`kho_voucher.py:914`), `don_vi_goc` lấy từ `don_vi_cua_mat_hang(…, dang=…)`.
- [ ] **Step 5: Chạy** — `python -m pytest tests/test_kho_de_nghi.py tests/test_ton_theo_khoa.py -q` → PASS.
- [ ] **Step 6: Commit** — message: `Máy chủ chặn nhập kho hai lần cho một đợt giao (409); API tồn theo khoá mã + dạng + khổ của một mặt hàng`.

---

### Task 5: Hai mảnh giao diện dùng chung — khung khổ và bố cục bảng trái + cột phải

**Files:**
- Create: `frontend/src/components/kho-giay/khungKho.ts`, `khungKho.test.ts`, `KhungKho.tsx`, `khungKho.css`
- Create: `frontend/src/styles/bo-cuc-mr.css`
- Modify: `frontend/src/api/client.ts` (kiểu + hàm `api.kho.tonKhoa(token, hangLoai, hangId)`, `SupplierItemRow.dang_ban/kho_rong/kho_dai`, `SoGiaRow` ba field, `soGia(..., opts?: {dang, kho_rong, kho_dai})`, `PurchaseDeliveryLineIn/Out.kho_rong/kho_dai/khac_kho_dat`)

**Interfaces:**
- Produces:
  - `tachKho(chu: string): {rong: number; dai: number} | null` — nhận "790x1090", "790 × 1090", "1090x790" (trả cạnh ngắn trước), "1090" (cuộn: `{rong:1090, dai:0}`).
  - `chuanKho(a: number, b: number): [number, number]`.
  - `<KhungKho dang="to"|"cuon" rong dai onChange({dang, rong, dai}) goiY?: {rong,dai,nhan}[] chiDoc? loi? coTheDoiDang? />` — mockup A2b: một khung viền, nút Tờ/Cuộn đầu khung, `Rộng × Dài mm` hoặc `Khổ … mm`, danh sách gợi ý mở khi focus, Enter chọn dòng sáng, thiếu cạnh ⇒ class `loi` + dòng "Giấy tờ cần đủ hai cạnh".
  - CSS bản A (lấy NGUYÊN từ `docs/mockups/mua-hang-phuong-an-A.html`, khối `/* bản A tinh gọn */` và `/* ô khổ giấy */`): `.mr`, `.sec-h`, `.lt`, `.gi`, `.gi.chon`, `.them`, `.canh`, `.pp`, `.pp-h`, `.pp-b`, `.kv2`, `.cs`, `.rail`, `.dong-them`, `.nccb`. Đặt tiền tố `ma-` để không đụng class cũ (vd `.ma-mr`, `.ma-lt`…); màu dùng token có sẵn ở `tokens.css`.

- [ ] **Step 1: Test hỏng `khungKho.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { chuanKho, tachKho } from "./khungKho";

describe("tachKho", () => {
  it("tách 790x1090 và chuẩn cạnh ngắn trước", () => {
    expect(tachKho("790x1090")).toEqual({ rong: 790, dai: 1090 });
    expect(tachKho("1090 × 790")).toEqual({ rong: 790, dai: 1090 });
    expect(tachKho("1090X790")).toEqual({ rong: 790, dai: 1090 });
  });
  it("một số là khổ cuộn", () => {
    expect(tachKho("1090")).toEqual({ rong: 1090, dai: 0 });
  });
  it("rác trả null", () => {
    expect(tachKho("abc")).toBeNull();
    expect(tachKho("")).toBeNull();
  });
  it("chuanKho", () => {
    expect(chuanKho(1090, 790)).toEqual([790, 1090]);
    expect(chuanKho(0, 1090)).toEqual([1090, 0]);
  });
});
```

- [ ] **Step 2: Chạy** — `npx vitest run src/components/kho-giay/khungKho.test.ts` → FAIL (module chưa có).
- [ ] **Step 3: Cài `khungKho.ts`**

```ts
/** Khổ giấy (mm): luôn cạnh ngắn trước; một cạnh = cuộn (khổ rộng). Khớp `kho_giay.chuan_kho` ở BE. */
export function chuanKho(a: number, b: number): [number, number] {
  const x = Math.max(0, Math.round(a || 0));
  const y = Math.max(0, Math.round(b || 0));
  if (x && y) return x <= y ? [x, y] : [y, x];
  return [x || y, 0];
}

/** Đọc chữ người gõ: "790x1090", "790 × 1090", "1090" (cuộn). Không đọc được ⇒ null. */
export function tachKho(chu: string): { rong: number; dai: number } | null {
  const so = (chu || "").split(/[x×X*\s]+/).map((s) => s.replace(/\D/g, "")).filter(Boolean).map(Number);
  if (so.length === 0 || so.length > 2) return null;
  const [rong, dai] = chuanKho(so[0], so[1] ?? 0);
  return rong ? { rong, dai } : null;
}
```

- [ ] **Step 4: Chạy lại test** → PASS.
- [ ] **Step 5: `KhungKho.tsx` + `khungKho.css`** — dựng đúng DOM/CSS của mockup A2b (`.kho`, `.dang`, `.o`, `.x2`, `.mm`, `.nhan`, `.kho.dang-go`, `.kho.loi`, `.kho-loi`, `.goi`, `.gh`, `.gr`, `.gf`, `.kbd` — đổi tiền tố thành `kk-`). Hai ô số là `<input inputMode="numeric">` không mũi tên; ô đầu nhận dán "790x1090" (gọi `tachKho`). `chiDoc` ⇒ render chữ, không input. Nút Tờ/Cuộn là menu nhỏ khi `coTheDoiDang`.
- [ ] **Step 6: `bo-cuc-mr.css`** chép từ mockup (khối CSS bản A) với tiền tố `ma-`; import ở các màn dùng.
- [ ] **Step 7: Kiểu + hàm API trong `client.ts`** như Interfaces trên. `npx tsc --noEmit -p .` → không lỗi.
- [ ] **Step 8: Commit** — `Khung khổ giấy dùng chung (Tờ/Cuộn, gõ 790x1090, gợi ý khổ) + CSS bố cục bảng trái cột phải bản A; kiểu API mới`.

---

### Task 6: Tab Bảng giá vật tư của NCC (A8)

**Files:** Modify `frontend/src/pages/mua-hang/nha-cung-cap/tabs/SupplierItemsTab.tsx`, `tabs/ncc-form.css`, `nha-cung-cap/shared/helpers.ts` (`emptySupplierItem` thêm `dang_ban:null,kho_rong:0,kho_dai:0`).

Spec: mockup A8 phần trên. Cột: Vật tư | Dạng bán (`KhungKho`, chỉ dòng giấy; vật tư khác ô trống) | Đơn vị (`DonViChonTheoHang` truyền thêm `dang` để danh sách đơn vị theo dạng — kiểm component đó có prop `dang` chưa; chưa có thì thêm, gọi `don_vi_cua_mat_hang` qua endpoint đơn vị mặt hàng với `dang`) | Đơn giá | So giá theo (số đậm + dòng nhỏ "mỗi kg"/"mỗi tờ") | xoá. Đổi dạng ⇒ xoá đơn vị đã chọn. Chân tab: "N dòng giá cho M mã giấy".

- [ ] Step 1: Sửa component theo spec; giữ Excel template/import/export.
- [ ] Step 2: `npx tsc --noEmit -p .` sạch.
- [ ] Step 3: Commit `Bảng giá NCC: cột Dạng bán Tờ+khổ/Cuộn, đơn vị theo dạng, cột So giá theo`.

---

### Task 7: Yêu cầu mua hàng — danh sách, form tạo, chi tiết (A1, A2, A2b, A3)

**Files:** `mua-hang/yeu-cau-mua-hang/components/RequestsTable.tsx`, `RequestFormDrawer.tsx`, `RequestDetailDrawer.tsx`, `purchase.css` (chỉ thêm), `DepartmentPurchaseRequestsPage.tsx` (nạp tồn/dự báo).

Spec theo mockup:
- **A1 danh sách:** cột Mã | Nội dung (mục đích đậm + "TÊN MÓN ĐẦU và N món khác") | Người tạo (tên trên, thẻ bộ phận dưới) | Ngày tạo | Ngày cần (kèm "Còn N ngày" vàng ≤ 3 ngày, "Quá N ngày" đỏ) | Đã có đơn (thanh nhỏ + "x/y món") | Trạng thái. Dữ liệu "đã có đơn" lấy từ trạng thái dòng sẵn có (`LineFulfilmentCell`/`requestCells.tsx`) — nếu list API chưa trả số món đã vào đơn thì thêm `so_mon_co_don`, `so_mon` vào schema list YCMH ở backend (service list department requests) trong cùng task, kèm test pytest nhỏ.
- **A2 form tạo:** ngăn `--kt-ngan-w`, `.ma-mr`. Bảng trái: Vật tư (thumb + tên + `KhungKho` cho giấy + ghi chú dòng phụ / nút "Ghi chú") | Tồn | Dự kiến | Ngưỡng | Số lượng mua (đơn vị chữ mờ trong ô; giấy tờ = "tờ") | xoá. Tồn theo khoá lấy `api.kho.tonKhoa` (Task 4); giấy chưa có khổ ⇒ "Theo khổ". Dự kiến/Ngưỡng: dùng dữ liệu đang có ở màn Tồn kho (`/lo/du-bao`, `nguong-ton`) nếu đã nạp được theo mặt hàng; không có thì "Chưa khai". Ô tìm "Thêm vật tư". Nút "Thêm hàng dưới tối thiểu" giữ nếu đang có. Rail: Ngày cần (+ chọn nhanh Hôm nay/+3/+7/+14 ngày), Nội dung mục đích, kv Người yêu cầu/Bộ phận/Gửi tới/Nguồn (từ tài khoản — không có ô gõ tên). Chân: "N món" + lỗi đỏ gọn ("IVORY còn thiếu cạnh dài") + Huỷ + **Gửi yêu cầu**. Mở từ Tồn kho (seed) giữ điền sẵn ngày cần.
- **A2b:** `KhungKho` với gợi ý = khổ đang có trong kho (`tonKhoa`, kèm "Tồn N tờ") + khổ đã mua (bỏ qua nếu chưa có API — không bịa). Đổi dạng Tờ ↔ Cuộn đổi đơn vị dòng (tờ ↔ đơn vị gốc của mã).
- **A3 chi tiết:** một bảng dòng: Vật tư (+ khổ) | Yêu cầu | Đơn mua (mã + NCC, "Chưa có") | Đã đặt | Đã về | Tình trạng (chip + ngày dự kiến) | bỏ món. Món chưa có đơn đứng đầu. Đầu ngăn: nút chính "Lập đơn mua cho N món" (Thu mua); "Huỷ yêu cầu" vào menu ba chấm. Tab: Nội dung, Lịch sử.

- [ ] Step 1: A1 (+ backend `so_mon_co_don` nếu thiếu, test pytest).
- [ ] Step 2: A2/A2b form.
- [ ] Step 3: A3 chi tiết.
- [ ] Step 4: `npx tsc --noEmit -p .`; `npx vitest run src/pages/mua-hang` sạch.
- [ ] Step 5: Commit `Yêu cầu mua hàng theo bản A: danh sách có Nội dung, Đã có đơn, hạn còn lại; form bảng trái cột phải có Tồn theo khổ; chi tiết một bảng dòng`.

---

### Task 8: Lập đơn mua từ yêu cầu + chọn NCC theo dạng/khổ (A4, A8b)

**Files:** `mua-hang/phieu-mua-hang/components/PurchaseFormDrawer.tsx`, `components/LineSupplierPicker.tsx`, `shared/helpers.ts` (`chaoGiaChoMatHang`), `shared/helpers.test.ts`, `PurchaseRequestsPage.tsx` (`openCreatePurchaseRequest`).

Spec:
- `chaoGiaChoMatHang(line, suppliers)` đổi chữ ký nhận dòng (cần `hang_loai/hang_id/kho_rong/kho_dai`): ghép NCC theo `hang_loai+hang_id` (fallback tên khi dòng ngoài danh mục). Dòng giấy tờ (đủ hai cạnh) ⇒ nhóm "cùng dạng" = item `dang_ban==="to"` cùng khổ; dòng cuộn ⇒ item `dang_ban==="cuon"` (khổ item 0 hoặc bằng). Trả `{xepHang: ChaoGia[], khongSo: {supplier_id, supplier_name, ly_do: "Chỉ bán cuộn" | "Tờ 790 × 1090"}[]}`.
- Chọn NCC ở nhóm xếp hạng ⇒ điền `expected_unit_price = gia_quy_doi` (đã theo đơn vị gốc của dạng — tờ hoặc kg). Chọn NCC nhóm dưới ⇒ đơn giá để trống (0) cho Thu mua gõ — **bỏ** lùi về giá thô.
- Test `helpers.test.ts` thêm: dòng tờ 650×870 chỉ xếp NCC bán tờ đúng khổ, rẻ trước; NCC chỉ bán cuộn vào `khongSo` với lý do "Chỉ bán cuộn"; NCC bán tờ khổ khác vào `khongSo` với lý do "Tờ 790 × 1090".
- Bố cục A4: ngăn `--kt-ngan-w`, `.ma-mr`. Trái: "Sẽ tạo N đơn", mỗi NCC một thẻ (`.nccb`: avatar chữ, tên, thẻ "Cho nợ N ngày", "Đang nợ X đ" nếu có quyền tiền, nút "Đổi" mở danh sách A8b), bảng `.ma-lt` cột Vật tư (tên + "Yêu cầu N tờ" + `KhungKho` khổ mua chỉ khi bấm "+ Khổ mua", để trống = khổ cần) | Số lượng | Đơn giá (+ dòng "Cao hơn giá sổ 300" khi lệch giá sổ) | VAT (ô chọn nhỏ) | Thành tiền | menu ba chấm (Giảm giá %). Cảnh báo vượt hạn mức nợ là một dòng `.canh` viền đủ bốn cạnh. Rail: Ngày cần hàng, Dự kiến nhận, Nội dung; thẻ "Tóm tắt chi phí" (mỗi NCC: tổng, Tiền hàng, VAT; "Tổng N đơn"). Chân: "N món vào N đơn" + Huỷ + "Lưu N đơn".
- [ ] Step 1: test helpers đỏ → sửa `chaoGiaChoMatHang` → xanh (`npx vitest run src/pages/mua-hang/phieu-mua-hang/shared/helpers.test.ts`).
- [ ] Step 2: `LineSupplierPicker` thành danh sách hai nhóm như A8b ("Bán tờ khổ này, giá một tờ" / "Không bán khổ này, chọn thì tự gõ đơn giá").
- [ ] Step 3: Bố cục A4.
- [ ] Step 4: tsc sạch; commit `Lập đơn mua theo bản A; chọn NCC so giá đúng dạng đúng khổ, NCC khác dạng thì để trống đơn giá`.

---

### Task 9: Danh sách đơn mua, chi tiết đơn, tab Đợt giao, Kế toán (A5, A6, A9b, A7)

**Files:** `phieu-mua-hang/tabs/PhieuListTab.tsx`, `components/purchaseCells.tsx`, `components/PurchaseDetailDrawer.tsx`, `components/DeliveriesBlock.tsx`, `components/ContractBlock.tsx`, `ke-toan/don-mua-hang/components/InboxDrawer.tsx`, `InboxTable.tsx`.

Spec:
- **A5:** cột Mã đơn (+ thẻ mã yêu cầu nguồn dưới, không gạch chân) | Nhà cung cấp (xuống dòng, không cắt) | Ngày tạo | Ngày cần/nhận | Nhận hàng (thanh % + mốc dự kiến) | Tổng dự kiến | Còn nợ (+ hạn trả gần nhất; ẩn khi không `view_cost`) | Trạng thái. Bỏ Tiền cọc và Người tạo/duyệt (vẫn lọc được). "Chưa phát sinh" không gãy dòng. Số liệu Nhận hàng/Còn nợ: lấy từ trường list API đang có; thiếu thì bổ sung ở schema/service list đơn mua (backend) + test.
- **A6:** đầu ngăn hai chip song song (hàng: Chưa nhận/Nhận một phần/Đã nhận; tiền: Chưa thanh toán/Thanh toán một phần/Đã thanh toán), dải 4 ô (Nhà cung cấp, Yêu cầu nguồn, Ngày cần hàng, Còn nợ + hạn trả). Tab: Tổng quan (bảng dòng có cột Khổ cho giấy, tổng ở chân bảng; cột phải: thẻ NCC + hạn mức, thẻ người lập/duyệt/dự kiến nhận) | Đợt giao | Thanh toán | Chứng từ | Lịch sử.
- **A9b Đợt giao:** mỗi đợt một thẻ: chip Chưa nhập kho/Đã nhập kho, "Đợt N", thẻ Nhận ngày, thẻ Hoá đơn số; nút Nhập kho (đợt chưa nhập) hoặc nút mã yêu cầu nhập kho (đợt đã nhập ⇒ mở yêu cầu, không nhập lại). Bảng: Mặt hàng | Khổ (khổ thực nhận, thẻ "Khác khổ đặt") | Số lượng | Giá trị. Dòng đầu tab: "Đã nhận đủ số đặt sau N đợt" / "Còn chờ …" + nút "Ghi đợt giao".
- `nhapKhoTuDot` (`PurchaseRequestsPage.tsx:122-151`) dùng khổ THỰC NHẬN của dòng đợt (Task 3) thay khổ dòng đơn; 409 từ máy chủ ⇒ toast câu lỗi + mở yêu cầu đã có.
- **A7 Kế toán:** cùng ngăn đơn; mở từ màn Kế toán thì vào thẳng tab Thanh toán; nút "Lập phiếu chi" lên đầu ngăn (màu chính); bảng nợ theo đợt có nút lập phiếu cho đúng đợt; cảnh báo vượt hạn mức = hộp vàng viền đủ bốn cạnh; đơn huỷ: lý do trong hộp viền đỏ đủ cạnh, tổng gạch ngang, không nút.
- [ ] Step 1: A5 (+ backend nếu thiếu số).
- [ ] Step 2: A6 + A9b + `nhapKhoTuDot`.
- [ ] Step 3: A7.
- [ ] Step 4: tsc; `npx vitest run src/pages/ke-toan/cong-no-phai-tra` (PayablesDrawer.test giữ xanh); commit `Đơn mua theo bản A: danh sách có Nhận hàng và Còn nợ, ngăn hai chip hàng/tiền, tab Đợt giao mỗi đợt một thẻ có khổ thực nhận; Kế toán vào thẳng Thanh toán`.

---

### Task 10: Ghi đợt giao kèm hoá đơn (A9)

**Files:** `phieu-mua-hang/modals/DeliveryDialog.tsx` (chuyển thành ngăn `.ma-mr` như mockup A9), `InvoiceDialog.tsx` (giữ).

Spec: trái "Hàng nhận đợt này" (nút "Nhận đủ phần còn lại"): Vật tư (+ `KhungKho` khổ nhận, mặc định khổ đặt, sửa được với giấy tờ; khác khổ ⇒ viền vàng + "Khác khổ đặt 790 × 1090") | Đặt | Đã nhận | Đợt này (ô số + đơn vị dòng; dòng đã nhận đủ ⇒ chữ "Đã nhận đủ"). Rail: Ngày nhận; Hoá đơn (số + ngày; chọn nhanh "Cùng đợt N" điền số/ngày hoá đơn của đợt gần nhất có hoá đơn, "Hoá đơn mới", "Chưa có"); Ảnh hoá đơn, biên bản giao (kéo thả, dùng upload đang có); thẻ "Tiền đợt này" (từng dòng, VAT, Cộng đợt — chỉ khi có quyền tiền). Gửi `kho_rong/kho_dai` khi khác khổ đặt. Giữ phần "Ghi vào công nợ" nếu đang có logic, đặt trong rail.
- [ ] Step 1: Dựng lại dialog thành ngăn; tsc sạch.
- [ ] Step 2: Commit `Ghi đợt giao theo bản A: khổ nhận sửa được, hoá đơn ở cột phải có Cùng đợt trước, tiền đợt tự tính`.

---

### Task 11: Form Yêu cầu nhập xuất P2

**Files:** `frontend/src/pages/KhoDeNghiPage.tsx` (phần form tạo, ~:1160-1600), `kho-request.css` hoặc css mới `kho-de-nghi-p2.css`.

Spec (mockup `yeu-cau-nhap-xuat-3-phuong-an.html` P2, cả hai trạng thái):
- Ngăn `--kt-ngan-w`, `.ma-mr`. Tiêu đề "Yêu cầu xuất kho"/"Yêu cầu nhập kho" theo chiều; từ đợt giao thêm thẻ "Từ DMH-…" + "Đợt N".
- Trái: bảng Vật tư (tên; dòng phụ: `KhungKho` cho giấy + thẻ lệnh `.lenh` hoặc nút viền đứt "Không theo lệnh" bấm để chọn lệnh của dòng) | Tồn (theo mã + khổ, `api.kho.tonKhoa`, toàn xưởng) | Số lượng xin (ô số có chữ đơn vị; vật tư nhiều đơn vị ⇒ chữ đơn vị bấm đổi; xin > tồn ⇒ dòng vàng "Thiếu N tờ", không chặn) | xoá. Ô "Thêm vật tư". Bỏ cột STT, cột ĐVT, "Tổng SL".
- Rail tạo tay: chiều Nhập/Xuất (segmented, ẩn khi mở từ đợt), Ngày cần (+ Hôm nay/Mai/+3 ngày), thẻ "Lệnh sản xuất — dòng mới lấy lệnh này" (chọn lệnh + kv Việc/Khách/Hạn sản xuất), Ghi chú (ô textarea, gửi `ghi_chu` — trường đã có ở API create).
- Từ đợt giao: dòng khoá (số chữ đậm, không ô), cột "Nhập" + "Tồn khổ này sau nhập" (thẻ "Khổ mới trong kho" khi chưa có tồn khổ đó); rail "Nguồn" (Đơn mua link, Đợt, NCC, Ngày nhận, Hoá đơn) + "Giá trị nhập" chỉ khi `canViewCost`.
- Chân: "N mặt hàng" + cảnh báo vàng gọn nếu có dòng thiếu + Huỷ + "Gửi kho".
- Phần XEM yêu cầu đã gửi (ngăn khuôn A đã có, `khoNganA.tsx`) không đổi.
- [ ] Step 1: Dựng form; tsc sạch.
- [ ] Step 2: Commit `Form Yêu cầu nhập xuất theo P2: bảng trái có Tồn theo khổ và cảnh báo thiếu, cột phải chiều, ngày cần, lệnh, ghi chú; nhập từ đợt giao khoá dòng`.

---

### Task 12: Xác minh luồng thật trên trình duyệt dev

CLAUDE.md bắt buộc: thao tác chuột/bàn phím thật, KHÔNG dùng API thay bước nào; báo cáo liệt kê đã bấm gì/gõ gì/thấy gì.

- [ ] Restart uvicorn (migration 0375–0377 chạy lúc khởi động; xem log có dòng migration). Dev server theo bộ nhớ `bat-dev-server-uvicorn-tach-roi.md` (FE localhost:5173, BE `--host localhost`), đăng nhập admin/admin123.
- [ ] Luồng 1: NCC Tân Mai → Bảng giá: thêm dòng COUCHE 80GSM Tờ 650×870 ram (nếu danh mục chưa có cặp ram→tờ thì khai ở module Đơn vị trước, bằng UI) → thấy "So giá theo 1.040 mỗi tờ"; thêm dòng cuộn tấn → "mỗi kg". Lưu.
- [ ] Luồng 2: Tồn kho → Tạo yêu cầu mua (seed) → form A2: nhập khổ bằng gõ "650x870", thấy Tồn theo khổ, Gửi yêu cầu.
- [ ] Luồng 3: Mua hàng → yêu cầu vừa gửi → Lập đơn: dòng tờ 650×870 → danh sách NCC chỉ xếp NCC bán đúng khổ, chọn Tân Mai → đơn giá 1.040 đ/tờ; Lưu đơn → duyệt (bằng UI).
- [ ] Luồng 4: Đơn → Ghi đợt giao: một dòng sửa khổ nhận khác khổ đặt, hoá đơn số + "Cùng đợt" ở đợt 2 → Lưu → tab Đợt giao thấy "Khác khổ đặt".
- [ ] Luồng 5: Đợt → Nhập kho → sang Yêu cầu nhập xuất (P2), dòng khoá, "Tồn khổ này sau nhập" → Gửi kho. Quay lại đợt: nút thành mã yêu cầu; bấm Nhập kho lần nữa không còn (và nếu cố gửi trùng thì thấy câu 409).
- [ ] Luồng 6: Yêu cầu nhập xuất → tạo Xuất tay: chọn lệnh ở rail, thêm giấy tờ, xin quá tồn ⇒ thấy "Thiếu N tờ", Gửi kho.
- [ ] Không còn chữ "tờ nguyên" ở mọi màn kho/mua đã đi qua.
- [ ] Báo cáo cho user từng bước + ảnh chụp.
