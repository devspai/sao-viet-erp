# Giấy + Vật tư khác nhiều ĐVT — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mã Giấy và Vật tư khác khai được một danh sách ĐVT (ĐVT chính + đơn vị thêm); mọi nơi chọn đơn vị, suy đơn vị gốc, tách tồn đọc từ danh sách đó.

**Architecture:** Cột `don_vi_them JSON` cạnh `don_vi_gia` (ĐVT chính). Lõi `kho_giay` có MỘT bộ suy gốc `GocMatHang.goc(dvt, khai)` dùng chung giấy + vật tư; khoá tồn 5 phần tử áp cả `vat_tu` (khổ 0·0). Ô chọn đơn vị lấy danh sách gộp nhóm của mọi đơn vị đã khai từ `vat_lieu_kho_service.don_vi_cua_mat_hang`.

**Tech Stack:** FastAPI + SQLAlchemy (migration tay ở `db_migrations.py`), React + TS.

**Spec:** `docs/superpowers/specs/2026-10-10-mat-hang-nhieu-don-vi-tinh-design.md`

## Global Constraints

- `hang_loai` có đơn vị gốc: `{"giay", "vat_tu"}` (`kho_giay.CO_DON_VI_GOC`). Thành phẩm, khuôn giữ `""`.
- Danh sách khai `khai = [don_vi_gia] + don_vi_them` (chữ thường, bỏ rỗng, bỏ trùng). Đơn giá danh mục chỉ thuộc `don_vi_gia`.
- Hai đơn vị khai không được cùng nhóm quy đổi (`quy_doi_service.don_vi_dung_duoc`). Lỗi 422: "«ram» đã nằm trong nhóm của «tờ»".
- Bỏ một đơn vị (kể cả đổi ĐVT chính) mà còn dùng ⇒ 422 nói rõ còn gì ("Còn 3.070 tờ tồn kho và 1 yêu cầu kho chưa xong — chưa bỏ được đơn vị tờ.").
- ĐVT dòng không thuộc nhóm nào đã khai ⇒ 422 "Đơn vị «X» chưa khai ở danh mục cho «tên mã»."
- Mọi chữ UI tiếng Việt; không nối mẩu dữ liệu bằng "·" hay dấu phẩy; không chữ đậm cho mã/tên.
- Không `git stash`, không commit, không `checkout --`; file CRLF sửa bằng Edit/python bytes; `python` trần trong backend/ trỏ DB dev.
- Verify: pytest nhắm file + `npx tsc --noEmit -p .`; không chạy `./init.ps1`, không cả bộ.

## Review Focus

1. Vật tư khác đã có tồn (đơn vị gốc rỗng trước mg 0389) ⇒ sau migration vẫn ra đúng một dòng tồn, số không đổi.
2. Giấy cũ có lô tờ + ĐVT chính kg ⇒ sau migration `don_vi_them=["to"]`, nhập tờ vẫn được.
3. Khai thêm `ram` khi đã có `tờ` ⇒ 422; khai `tấn` khi ĐVT chính `kg` ⇒ 422.
4. Bỏ `tờ` khi còn lô tờ > 0 ⇒ 422 có số; khi tồn 0 và không chứng từ mở ⇒ cho bỏ.
5. Vật tư khai kg + thùng ⇒ nhập 2 thùng và 5 kg là hai dòng tồn, Tồn kho hiện hai dòng ĐVT khác nhau.

---

### Task 1: Lõi — dữ liệu, migration, suy gốc, danh mục (backend)

**Files:**
- Modify: `backend/app/models/vat_lieu_kho.py` (GiayNguyen, VatTuInAn: `don_vi_them`)
- Modify: `backend/app/db_migrations.py` (`_migrate_mat_hang_don_vi_them`, `0389_mat_hang_don_vi_them`)
- Modify: `docs/DB_SCHEMA.md`
- Modify: `backend/app/services/kho_giay.py` (CO_DON_VI_GOC, khoa_*, `GocMatHang`, `don_vi_khai`)
- Modify: `backend/app/services/vat_lieu_kho_service.py` (đơn vị theo khai, `_validate` khai + chặn bỏ)
- Modify: `backend/app/schemas/vat_lieu_kho.py`, `backend/app/repositories/vat_lieu_kho_repo.py`, `backend/app/services/catalog_excel_specs.py`, `backend/app/services/nhat_ky_danh_muc.py`
- Test: `backend/tests/test_migration_0389_don_vi_them.py`, `backend/tests/test_mat_hang_nhieu_don_vi.py`

**Interfaces — Produces:**
- `kho_giay.CO_DON_VI_GOC: frozenset[str]`, `co_don_vi_goc(loai) -> bool`
- `khoa_ton(loai, id, *, goc, kho_rong, kho_dai)`: vat_tu ⇒ `("vat_tu", id, 0, 0, goc)`
- `khoa_dong(loai, id, goc, ...)`: vat_tu ⇒ `("vat_tu", id, goc, 0, 0)`
- `khoa_ton_cua(obj)`: giấy + vat_tu ⇒ 5 phần tử
- `don_vi_khai(obj) -> list[str]`
- `class GocMatHang(dvs, cap_rows)`, `.tu_db(db)`, `.ho(goc)`, `.goc(dvt, khai) -> str | None` (thay `GocGiay.goc(dvt, don_vi_gia)`; xoá `GocGiay`)
- `VatLieuKhoService.goc_mat_hang() -> GocMatHang` (thay `goc_giay`)
- `don_vi_cua_mat_hang(loai, id, *, goc=None)`: giấy/vat_tu khai ≥ 2 nhóm và không truyền goc ⇒ `ds` gộp, mỗi dòng có `goc`, `goc_ten`
- API danh mục `GiayIn/GiayRow/VatTuIn/VatTuRow.don_vi_them: list[str] | None`

- [ ] Step 1: test migration (sqlite): giấy ĐVT kg ⇒ `don_vi_them == ["to"]`; giấy ĐVT `to` ⇒ NULL; dòng vat_tu ở stock_lots/stock_voucher_lines/stock_request_lines/stock_thresholds/kho_ky_ton/vat_tu_giu_cho/lsx_cong_doan_vat_tu có `don_vi_goc == lower(don_vi_gia)`; chạy lại không đè.
- [ ] Step 2: test lõi: `GocMatHang.goc("tan", ["kg","to"]) == "kg"`, `goc("ram", ["kg","to"]) == "to"`, `goc("thung", ["kg"]) is None`; `khoa_ton("vat_tu", 5, goc="KG") == ("vat_tu",5,0,0,"kg")`.
- [ ] Step 3: test danh mục qua API: PUT vật tư `don_vi_them=["tan"]` khi ĐVT chính kg ⇒ 422; `["thung"]` ⇒ 200; bỏ `to` khi còn lô tờ ⇒ 422 nêu số; `/vat-lieu-kho/don-vi/vat_tu/{id}` trả cả kg lẫn thùng có `goc`.
- [ ] Step 4: chạy fail → code → chạy pass (`python -m pytest tests/test_migration_0389_don_vi_them.py tests/test_mat_hang_nhieu_don_vi.py tests/test_schema_documented.py -q`).
- [ ] Step 5: chạy migration trên DB dev (khởi động lại uvicorn) và soi lại số liệu bằng psql.

### Task 2: Kho (backend)

**Files:** `repositories/stock_lot_repo.py`, `stock_voucher_repo.py`, `stock_request_repo.py`, `services/stock_voucher_service.py`, `stock_request_service.py`, `ton_kho_nhom_service.py`, `du_bao_ton_service.py`, `giu_cho_service.py`, `routers/kho_voucher.py`, `kho_request.py`, `kho_baocao.py`, `schemas/stock.py`, model comments `stock_lot.py`, `vat_tu_giu_cho.py`.

**Consumes:** Task 1. Mọi nhánh `hang_loai == "giay"` quyết `don_vi_goc`/khoá 5 phần ⇒ `co_don_vi_goc(loai)` (khổ vẫn chỉ giấy). Vật tư ghi `don_vi_goc` = `GocMatHang.goc(dvt, khai)`; `None` ⇒ 422 theo Global Constraints. Tồn, NXT, giữ chỗ, ngưỡng, kỳ tồn của vật tư tách theo đơn vị gốc.

- [ ] Test: vật tư khai kg + thùng — nhập 2 thùng + 5 kg ⇒ hai lô `don_vi_goc` khác nhau; `/kho/ton-nhom` hai dòng khoá `vat_tu:id:0:0:kg` và `...:thung`; xuất 1 thùng chỉ trừ lô thùng; nhập đơn vị chưa khai ⇒ 422. Chạy lại toàn bộ test kho đã chạm ở đợt 0388.

### Task 3: Mua hàng + kế hoạch vật tư + sản xuất (backend)

**Files:** `services/purchase_service.py`, `schemas/purchase.py`, `services/ke_hoach_vat_tu_service.py`, `routers/ke_hoach_vat_tu.py`, `services/mach_mua.py`, `services/luoi_vat_tu*`, `services/lsx_service.py`, `services/san_xuat/{board,vat_tu_de_nghi,vat_tu_nhap_lai,chot_giay}.py`, `repositories/san_xuat_san_luong_repo.py`, `repositories/ke_hoach_vat_tu_repo.py`.

**Consumes:** Task 1. `GocGiay(...).goc(dvt, don_vi_gia)` ⇒ `GocMatHang(...).goc(dvt, don_vi_khai(obj))`. Rẻ nhất / tự gán NCC: cùng nhóm áp cả vật tư. Cân đối: nhóm/dòng có thêm `don_vi_chua_khai: bool` (nhu cầu ra đơn vị không thuộc nhóm nào đã khai) — khi true không cho lập mua dòng đó; `cung_kho_khac_don_vi` áp cả vật tư.

- [ ] Test: so-giá vật tư khai kg + thùng trả `cung_ho` đúng; cân đối vật tư hai đơn vị hiện hai số cạnh nhau; nhu cầu tờ của mã giấy chỉ khai kg ⇒ `don_vi_chua_khai == True`.

### Task 4: Frontend

**Files:** `pages/rebuildCatalogConfigs.tsx`, `pages/danh-muc/CatalogDrawer.tsx`, `pages/danh-muc/types.ts`, ô mới `pages/danh-muc/ODonViNhieu.tsx`, `lib/khoGiay.ts` (+ test), `api/client.ts` (`donVi()` gửi `goc` cho vat_tu, kiểu `don_vi_chua_khai`), `components/MaterialCombobox.tsx`, các chỗ rẽ `"giay"` ở KhoDeNghiPage, KhoTonKhoPage, ton-kho/HopNguong, ton-kho/TongQuanTon, lsxBuoc, LsxBuocDrawer, PurchaseFormDrawer, PurchaseRequestsPage, LuoiVatTu.

**Consumes:** Task 1–3 hợp đồng API.

- Form Giấy + Vật tư khác: dòng "ĐVT" giữ ô chọn ĐVT chính; dưới đó "Đơn vị thêm": thẻ từng đơn vị (nút xoá) + "Thêm đơn vị" thả danh sách đã ẩn đơn vị cùng nhóm với đơn vị đã khai; dưới mỗi đơn vị một dòng mờ "gồm g, tấn". Thành phẩm không có ô này.
- Lưới danh mục: cột ĐVT hiện ĐVT chính + đơn vị thêm thành thẻ nhỏ.
- `khoaTon` vat_tu ⇒ `vat_tu:id:0:0:goc`. MaterialCombobox bỏ "(gốc)" khi `ds` có ≥ 2 `goc` khác nhau.
- Cân đối: dòng `don_vi_chua_khai` hiện "Chưa khai đơn vị «X» ở danh mục" thay nút lập mua.

- [ ] `npx vitest run src/lib/khoGiay.test.ts` + `npx tsc --noEmit -p .` sạch.

### Task 5: Bấm thử trên trình duyệt

Luồng: danh mục Vật tư khác khai thêm "thùng" cho một mã kg (thử thêm "tấn" bị chặn) → bảng giá NCC dòng thùng → yêu cầu mua theo thùng → đơn mua → đợt giao → nhập kho → Tồn kho có hai dòng ĐVT → thử bỏ "thùng" ở danh mục bị chặn kèm số tồn.
