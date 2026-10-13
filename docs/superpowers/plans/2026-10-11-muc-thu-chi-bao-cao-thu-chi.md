# Mục thu chi + Báo cáo thu chi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi phiếu thu, phiếu chi mang một Mục chọn từ danh mục Mục thu chi; báo cáo thu chi bày Mục × tháng theo khuôn Tổng hợp công nợ; hai màn công nợ thôi cộng nhầm phiếu không thuộc nhà cung cấp/khách.

**Architecture:** Danh mục mới `muc_thu_chi` đi trên nền danh mục chung (`CatalogRepo`/`CatalogService`/`make_catalog_router`, màn `RebuildCatalogPage`). Phiếu chi/thu thêm cột `muc_thu_chi_id` (phiếu chi thêm `customer_id`). Báo cáo là module quyền riêng `bao_cao_thu_chi`, router + service + repo riêng, tính tại chỗ từ phiếu đã chi/đã thu (không bảng lưu).

**Tech Stack:** FastAPI, SQLAlchemy 2, Postgres (dev/prod) + SQLite in-memory (test), React + TS (Vite), khuôn lưới `lds` (`components/luoi-ds.css`), `ThanhLoc`, `NganPhai`.

**Spec:** chốt trong hội thoại 11/10/2026 + mockup `docs/mockups/bao-cao-thu-chi-khuon-cong-no.html` (báo cáo), `docs/mockups/bao-cao-thu-chi-3-phuong-an.html` phần 2–3 (danh mục, ô chọn mục — trừ chữ "khác" đã cấm). Bộ nhớ: `bao-cao-thu-chi-theo-muc`.

## Global Constraints

- Chữ trên giao diện: **Thu / Chi**, cấm "tiền vào / tiền ra". Cấm khái niệm "thu chi khác" — không nút, không nhãn, không dòng gom "khác".
- Không nhắc số tài khoản kế toán (331, 131…) ở bất cứ chữ nào hiện ra; gọi tên màn "Công nợ phải trả" / "Công nợ phải thu". Ô TK Nợ / TK Có trên phiếu giữ nguyên (chữ gõ tay để in), mục KHÔNG có ô tài khoản.
- Báo cáo bỏ hẳn: chiều Quỹ, cột Tỷ trọng / Số phiếu / Xu hướng / Ghi chú, khối 30 ngày tới, thẻ "máy tự gán".
- Báo cáo tính theo **ngày thực chi / thực thu**; phiếu đã huỷ không tính. Ngày phiếu chi = `paid_at` (lùi `voucher_date`) — dùng chung `bao_cao_cong_no.ngay_chi`.
- `SEED_DEMO=false` ⇒ không seed gì: KHÔNG tạo sẵn mục nào, kể cả qua migration.
- Thêm cột ⇒ viết vào `backend/app/db_migrations.py` + cập nhật `docs/DB_SCHEMA.md` cùng lúc. Boolean `server_default` dùng `sa_true()/sa_false()`.
- Verify: pytest nhắm file + `npx tsc --noEmit` (KHÔNG chạy `./init.ps1`, không pytest full). Luồng UI phải bấm thật trên trình duyệt trước khi báo xong.
- Commit message tiếng Việt, không Co-Authored-By; chỉ commit khi user bảo.

## Review Focus

1. Kỳ nằm gọn trong một tháng → bảng không có cột tháng, chỉ Cộng kỳ (không nói một số hai lần).
2. Kỳ dài hơn 12 tháng → cột theo quý; kỳ cắt ngang tháng → nhãn cột ghi khoảng ngày ("Tháng 10 (1 – 11/10)").
3. Mục đổi loại / ngừng dùng khi đã có phiếu → phiếu cũ vẫn hiện đúng tên mục; ô chọn trên form chỉ còn mục đang dùng đúng loại.
4. Hai mục cùng khai "điền sẵn" cho một nguồn → bị chặn với câu nói rõ mục nào đang giữ nguồn đó.
5. Chuyển mục hàng loạt sang mục khác loại (phiếu chi → mục thu) → bị chặn, không phiếu nào đổi.

---

### Task 1: Hai màn công nợ chỉ cộng phiếu thuộc đúng đối tượng

**Files:**
- Modify: `backend/app/services/bao_cao_cong_no.py` (`_nap_phai_tra`, `_nap_phai_thu`, `_chung_tu_phai_thu`, `_khoan_phai_thu`, chú thích đầu file)
- Modify: `backend/app/repositories/accounting_repo.py` (`phieu_chi_cho_bao_cao`, thêm `phieu_chi_hoan_khach`)
- Test: `backend/tests/test_bao_cao_cong_no_doi_tuong.py` (mới)

**Interfaces:**
- Consumes: cột `payment_vouchers.customer_id` (Task 2 tạo — làm Task 2 phần model trước nếu chạy tách).
- Produces: `AccountingRepository.phieu_chi_hoan_khach(den_ngay) -> list[PaymentVoucher]`.

Luật:
- Công nợ phải trả: phiếu chi chỉ vào khi truy được nhà cung cấp (`_ncc_cua_phieu_chi(v)` khác `None`). Phiếu chi tạm ứng lương, chi lặt vặt không nhà cung cấp → rời hẳn khỏi sổ (không còn dòng gom "không gắn nhà cung cấp").
- Công nợ phải thu: phiếu thu chỉ vào khi truy được khách (qua hoá đơn hoặc đơn bán). Phiếu chi có `customer_id` (hoàn tiền khách) vào sổ khách đó với `net = +tien` (khách nợ thêm / bớt phần trả dư), loại `hoan_tien_khach`, diễn giải mặc định "Hoàn tiền cho khách".

- [ ] Step 1: Viết test đỏ — dựng NCC + đơn mua + 1 phiếu chi trả NCC + 1 phiếu chi tạm ứng lương + 1 phiếu chi "other" không NCC; `tong_hop_phai_tra` chỉ có dòng NCC, không dòng `doi_tuong_id=None`. Dựng khách + hoá đơn 10tr + phiếu thu 12tr + phiếu chi hoàn khách 2tr + phiếu thu "other" không khách 1tr; `tong_hop_phai_thu` của khách: phát sinh nợ 12tr (10 + 2), có 12tr, cuối kỳ 0; không có dòng `doi_tuong_id=None`.
- [ ] Step 2: Chạy `pytest backend/tests/test_bao_cao_cong_no_doi_tuong.py -q` → FAIL.
- [ ] Step 3: Sửa loader/chứng từ như luật trên; `_khoan_phai_thu` coi phiếu hoàn khách là khoản nợ thêm (vào hàng khoản như hoá đơn, hạn = ngày chi).
- [ ] Step 4: Chạy lại test mới + `pytest backend/tests -q -k "cong_no"` → PASS (test cũ nào kỳ vọng dòng "không gắn" phải sửa theo luật mới, ghi lý do trong test).

### Task 2: Danh mục Mục thu chi (backend)

**Files:**
- Create: `backend/app/models/muc_thu_chi.py`, `backend/app/repositories/muc_thu_chi_repo.py`, `backend/app/services/muc_thu_chi_service.py`, `backend/app/schemas/muc_thu_chi.py`, `backend/app/routers/muc_thu_chi.py`
- Modify: `backend/app/models/__init__.py`, `backend/app/models/accounting.py` (cột mới + relationship), `backend/app/catalog_registry.py`, `backend/app/main.py`, `backend/app/db_migrations.py` (mg `0395_muc_thu_chi`), `docs/DB_SCHEMA.md`
- Test: `backend/tests/test_muc_thu_chi.py`

**Interfaces — Produces:**
- Bảng `muc_thu_chi(id, ma String(30) unique, ten String(150), loai String(8) 'thu'|'chi', dien_san_cho String(32) null, can_khach_hang Boolean default false, ghi_chu String(500) null, active, created_at, updated_at)`.
- `NGUON_DIEN_SAN = {"purchase_request": ("chi", "Phiếu chi trả đơn mua"), "gia_cong_ngoai": ("chi", "Phiếu chi gia công ngoài"), "salary_advance": ("chi", "Phiếu chi tạm ứng lương"), "sales_invoice": ("thu", "Phiếu thu theo hoá đơn"), "order_deposit": ("thu", "Phiếu thu cọc đơn bán"), "purchase_refund": ("thu", "Phiếu thu nhà cung cấp hoàn tiền")}` trong `models/muc_thu_chi.py`.
- `payment_vouchers.muc_thu_chi_id`, `payment_vouchers.customer_id`, `payment_receipts.muc_thu_chi_id` (FK, null, index).
- API `/api/muc-thu-chi` (CRUD danh mục chung, `loc="loai"`, `co_ky=True`, `ma_goi_y=True`, `ma_prefix="MTC-"`), đọc mở cho `dm_muc_thu_chi`, `phieu_chi`, `phieu_thu`, `bao_cao_thu_chi`.
- `MucThuChiService.muc_dien_san(nguon) -> MucThuChi | None`, `MucThuChiService.kiem_muc(muc_id, loai) -> MucThuChi` (ném lỗi nếu không có / ngừng / sai loại).

Luật service (`_validate`):
- `ten` bắt buộc; `loai ∈ {thu, chi}`.
- `dien_san_cho` phải thuộc `NGUON_DIEN_SAN` và cùng loại; mỗi nguồn chỉ một mục đang dùng giữ — trùng thì "Phiếu chi trả đơn mua đang điền sẵn mục «X». Bỏ ở mục đó trước."
- `can_khach_hang` chỉ cho loại chi (loại thu ⇒ ép false).
- `_sau_ghi`: mục có `dien_san_cho` ⇒ phiếu nguồn đó còn `muc_thu_chi_id IS NULL` (chưa huỷ) nhận mục này (một câu UPDATE trong repo) — đây là cách phiếu cũ tự vào mục.
- Không cho xoá cứng mục đang có phiếu (`XOA_MEM = True`).

Migration `0395_muc_thu_chi`: ADD COLUMN ba cột (idempotent, kiểm `inspect` trước lệnh ghi đầu); INSERT module `dm_muc_thu_chi` + `bao_cao_thu_chi`; cấp `dm_muc_thu_chi` (đủ quyền như vai đó có ở `phieu_chi`) cho vai đang có `phieu_chi` hoặc `phieu_thu` đọc; cấp `bao_cao_thu_chi` (đọc + thao tác theo `bao_cao_cong_no`) cho vai đang đọc `bao_cao_cong_no`. Không tạo mục nào.

- [ ] Step 1: Test đỏ: tạo mục chi "Điện nước" → 201, mã tự gợi `MTC-0001`; hai mục cùng `dien_san_cho="purchase_request"` → 422 có tên mục cũ; mục thu với `dien_san_cho="purchase_request"` → 422; mục thu `can_khach_hang=true` → lưu thành false; tạo mục `dien_san_cho="purchase_request"` khi đã có phiếu chi đơn mua chưa mục → phiếu nhận mục.
- [ ] Step 2: FAIL. Step 3: viết model/repo/service/schema/router + registry + migration + DB_SCHEMA. Step 4: PASS + `pytest backend/tests -q -k "db_schema or ma_tran or catalog_registry or module"`.

### Task 3: Phiếu chi / phiếu thu mang mục (backend)

**Files:**
- Modify: `backend/app/services/accounting_service.py` (`_prepare_*` phiếu chi rời, `_new_voucher`, bốn chỗ dựng `PaymentReceipt`, `_voucher_out`, `_receipt_out`, `list_vouchers`/`list_receipts` nhận `muc`)
- Modify: `backend/app/repositories/accounting_repo.py` (`_dieu_kien_phieu_chi`, điều kiện phiếu thu, nạp sẵn `muc_thu_chi`)
- Modify: `backend/app/schemas/accounting.py` (input `muc_thu_chi_id`, `customer_id`; out `muc_thu_chi_id`, `muc_thu_chi_ten`, `customer_id`, `customer_name`)
- Modify: `backend/app/routers/accounting.py` (query `muc: list[int]`, 0 = chưa phân loại)
- Test: `backend/tests/test_phieu_muc_thu_chi.py`

Luật:
- Phiếu chi rời (`other`/`internal_expense`/`customer_refund`) và phiếu thu rời (`other`): `muc_thu_chi_id` bắt buộc, phải là mục đang dùng đúng loại. Mục `can_khach_hang` ⇒ `customer_id` bắt buộc (khách phải tồn tại); mục không cờ ⇒ bỏ `customer_id`.
- Phiếu sinh từ đơn mua / gia công / tạm ứng / hoá đơn / cọc / NCC hoàn tiền: `muc_thu_chi_id` = payload nếu có (kiểm như trên) else `muc_dien_san(nguon)` (có thể None ⇒ "Chưa phân loại").
- Lọc danh sách: `muc=[ids]`, `0` nghĩa là `muc_thu_chi_id IS NULL`.

- [ ] Step 1: Test đỏ: lập phiếu chi rời thiếu mục → 422 "Chọn mục chi."; mục thu → 422; mục cần khách thiếu khách → 422; đủ → out có `muc_thu_chi_ten`, `customer_name`. Phiếu chi từ đơn mua khi có mục điền sẵn → nhận mục. Lọc `muc=0` ra đúng phiếu chưa mục.
- [ ] Step 2–4: FAIL → code → PASS + `pytest backend/tests -q -k "voucher or receipt or phieu_chi or phieu_thu"`.

### Task 4: Báo cáo thu chi (backend)

**Files:**
- Create: `backend/app/services/bao_cao_thu_chi.py`, `backend/app/repositories/bao_cao_thu_chi_repo.py`, `backend/app/routers/bao_cao_thu_chi.py`, `backend/app/schemas/bao_cao_thu_chi.py`
- Modify: `backend/app/main.py`, `backend/app/seed.py` (`MODULES` thêm `bao_cao_thu_chi`), `backend/app/deps.py` (ô chết `create`/`delete`)
- Test: `backend/tests/test_bao_cao_thu_chi.py`

**Interfaces — Produces:**
- `GET /api/bao-cao-thu-chi?tu_ngay&den_ngay&theo=muc|nguoi&hinh_thuc&muc&q&the=all|thu|chi|chua|tm5&page&size` →
  `{cot:[{khoa,nhan}], dong:[{ben,khoa,ten,chua,o:{khoa:int},cong:int,tm5:int}], nhom:{thu:{o,cong,tm5,so_dong},chi:{...}}, chenh_lech:{o,cong}, the_loc:{all,thu,chi,chua,tm5}, total, page, size}`.
- `GET /api/bao-cao-thu-chi/phieu?tu_ngay&den_ngay&ben&theo&khoa&cot&tm5&hinh_thuc` → `{items:[{loai,id,so,ngay,tien,nguoi,ly_do,hinh_thuc,muc_id,muc_ten}], tong}`.
- `POST /api/bao-cao-thu-chi/chuyen-muc {phieu_chi_ids, phieu_thu_ids, muc_id}` (gác `bao_cao_thu_chi:update`) → `{so_phieu}`.
- `GET /api/bao-cao-thu-chi/excel` cùng tham số bảng.
- Hằng `NGUONG_TIEN_MAT = 5_000_000`.

Luật cột: cùng tháng ⇒ không cột kỳ; ≤ 12 tháng ⇒ cột tháng (`2026-08`), nhãn "Tháng 8", kỳ qua hai năm thì "Tháng 8/2025", tháng bị cắt thì thêm "(1 – 11/10)"; > 12 tháng ⇒ cột quý ("Quý 3/2026"). Dòng xếp: nhóm Thu trước Chi, trong nhóm "Chưa phân loại" cuối, còn lại tiền giảm dần. Thẻ đếm theo ô tìm + Lọc nhưng không theo thẻ đang chọn. `tm5` = phiếu chi tiền mặt ≥ 5 triệu.

- [ ] Step 1: Test đỏ với 6 phiếu ở 3 tháng: số ô tháng, cộng kỳ, chênh lệch, thẻ đếm, dòng chưa phân loại, kỳ 1 tháng không cột, kỳ 14 tháng ra quý, `/phieu` lọc theo cột, chuyển mục khác loại 422, không quyền 403.
- [ ] Step 2–4: FAIL → code → PASS.

### Task 5: Giao diện danh mục + quyền + thanh bên

**Files:**
- Modify: `frontend/src/pages/rebuildCatalogConfigs.tsx` (`CFG_MUC_THU_CHI`, khoá `"muc-thu-chi"`), `frontend/src/components/Sidebar.tsx` (mục "Mục thu chi" trong Cấu hình danh mục; "Báo cáo thu chi" trong Báo cáo), `frontend/src/components/PermissionMatrix.tsx` (mô tả, nhóm, phạm vi `all`), `frontend/src/components/AppShell.tsx` (route báo cáo, lazy)
- Modify: `frontend/src/api/client.ts` (kiểu `MucThuChiRow`, hàm đọc mục đang dùng theo loại)

- [ ] Cấu hình màn: cột Loại (chip Thu xanh dương / Chi cam), Điền sẵn cho, Phải chọn khách, Ghi chú; ô Loại (select, bắt buộc), Điền sẵn cho (select 6 nguồn, gợi ý chỉ chọn nguồn cùng loại), Phải chọn khách hàng (checkbox, hiện khi Loại = Chi), Ghi chú; điều kiện lọc Loại.
- [ ] `npx tsc --noEmit` sạch; test guard ma trận ↔ thanh bên (`pytest -k ma_tran_quyen_khop_thanh_ben`) xanh.

### Task 6: Form, bản in, danh sách phiếu mang mục

**Files:**
- Create: `frontend/src/pages/ke-toan/shared/OChonMuc.tsx` (ô chọn mục, gõ để tìm, chỉ mục đang dùng đúng loại; kèm ô chọn khách khi mục cần khách)
- Modify: `phieu-chi/components/ThanPhieuChiRoi.tsx`, `phieu-chi/modals/StandaloneVoucherDialog.tsx`, `phieu-chi/components/KhoiPhieuChi.tsx` (thứ tự ô), `phieu-chi/print.ts`, bản xem trước `BanXemPhieuChi`; `phieu-thu/modals/OtherReceiptDialog.tsx`, `phieu-thu/print.ts`, bản xem trước phiếu thu; `phieu-chi/components/VouchersTable.tsx`, `phieu-thu/components/ReceiptsTable.tsx` (cột Mục); `phieu-chi/shared/loc.ts`, `shared/locPhieu.ts` (lọc Mục thay Nguồn); hai ngăn chi tiết (dòng Mục)

- [ ] Ô "Mục chi" / "Mục thu" bắt buộc, đặt trên ô Lý do; bản in thay dòng "Nguồn chi/thu" bằng "Mục chi/thu"; danh sách có cột Mục và lọc Mục (gồm "Chưa phân loại").
- [ ] `npx tsc --noEmit` + vitest các file test đã có của hai màn.

### Task 7: Màn Báo cáo thu chi

**Files:**
- Create: `frontend/src/pages/bao-cao-thu-chi/BaoCaoThuChiPage.tsx`, `NganThuChi.tsx`, `bao-cao-thu-chi.css`
- Modify: `frontend/src/api/client.ts` (hàm `baoCaoThuChi.*`)

- [ ] Bám mockup khuôn công nợ: thẻ lọc nhanh có đếm, ô tìm, kỳ (`ThanhLoc`), Lọc (Hình thức, Mục), Theo mục | Theo người nhận, nộp, nút Cột (ẩn/hiện, ghim, kéo rộng qua `useCauHinhLuoi`), dòng Chênh lệch đầu bảng, nhóm Thu/Chi, chân `PhanTrangDayDu`, Xuất Excel. Bấm dòng/ô mở `NganPhai` có ↑ ↓: dải tháng + Cả kỳ (bấm lọc), tab Phiếu | Người nhận (theo người thì tab Mục), dòng chưa phân loại có "Chuyển sang mục…" (chọn phiếu → chọn mục).
- [ ] Biểu đồ: KHÔNG làm đợt này (nút Bảng | Biểu đồ bỏ khỏi màn) — ghi vào báo cáo cuối.

### Task 8: Xác minh luồng thật trên trình duyệt

- [ ] Restart uvicorn (migration chạy), mở dev-browser đăng nhập admin.
- [ ] Danh mục: thêm "Trả nhà cung cấp" (Chi, điền sẵn đơn mua), "Điện nước" (Chi), "Hoàn tiền khách" (Chi, phải chọn khách), "Khách trả tiền hàng" (Thu, điền sẵn hoá đơn), "Bán phế liệu" (Thu); thử khai trùng điền sẵn để thấy câu chặn.
- [ ] Lập phiếu chi: chọn mục Điện nước → xem bản in có "Mục chi: Điện nước"; lập phiếu Hoàn tiền khách chọn khách → mở Công nợ phải thu thấy dòng khách.
- [ ] Lập phiếu thu chọn Bán phế liệu.
- [ ] Báo cáo thu chi: đổi kỳ, bấm thẻ, bấm ô mở ngăn, chuyển phiếu chưa phân loại sang mục, Theo người.
- [ ] Ghi lại từng bước đã bấm/gõ/thấy cho báo cáo.
