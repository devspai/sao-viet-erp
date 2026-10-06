# Công nợ bảng đủ cột + form thu/chi kiểu mới — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa danh sách Công nợ phải thu VÀ phải trả sang "bảng đủ cột" (phương án 1). Thu tiền một hoá đơn thành ngăn chồng theo form kiểu 3 bản 2. Đưa cùng kiểu form đó sang mọi form lập phiếu thu và phiếu chi.

**Architecture:**
- Hai màn công nợ dùng chung `ThanTrangCongNo`. Bảng mới cũng nằm ở đó, đối xứng tuyệt đối; màn chỉ khai chữ và cách đọc trường.
- Máy chủ bổ sung trường cho dòng (mã, liên hệ, phụ trách, lần thu/trả gần nhất) và nhận tham số sắp xếp. Sắp xếp làm ở MÁY CHỦ, trước khi cắt trang.
- Bộ form chung `shared/KhungFormPhieu.tsx` thêm các khối của kiểu mới: khối có tiêu đề, ô tiền to kèm bằng chữ, dải "sau phiếu này", gợi ý tên, hàng chứng từ, tờ A5. Mọi form lập phiếu chỉ ghép các khối đó.
- Luật kiểm và payload tiền thật GIỮ NGUYÊN.

**Tech Stack:** FastAPI + SQLAlchemy (Postgres dev, SQLite test), React + TS + Vite, vitest.

**Spec:**
- `docs/mockups/cong-no-phai-thu-danh-sach-3-phuong-an.html`: phương án 1 "Bảng đủ cột".
- `docs/mockups/thu-tien-ngan-chong-phuong-an-3-ban-2.html`: form thu tiền đã chọn.

## Global Constraints

- UI tiếng Việt.
- Không nối mẩu dữ liệu bằng `·` hoặc dấu phẩy; tách bằng thẻ nhỏ và khoảng trống.
- Hover nền `--rule-hair`; chọn = viền đủ cạnh; không hồng nhạt; không viền một cạnh.
- Mỗi thông tin nói một lần.
- Nhãn theo mẫu 01-TT / 02-TT:
  - phiếu thu: "Người nộp tiền", "Lý do nộp";
  - phiếu chi: "Người nhận tiền", "Lý do chi";
  - chung: "Ghi chú nội bộ", "Chứng từ gốc".
- Tên người lập lấy từ tài khoản đang đăng nhập (`useAuth().user.name`), không có ô gõ.
- Lọc, sắp xếp và cắt trang ở MÁY CHỦ.
- Không có Alembic. Task này KHÔNG thêm cột DB (chỉ thêm trường suy ra), nên không cần migration hay sửa DB_SCHEMA.md.
- Verify bằng pytest nhắm file, `npx tsc --noEmit -p .` và `npx vitest run <file>`. KHÔNG chạy `./init.ps1`.
- Sửa route/schema BE thì restart uvicorn qua WMI.
- Luồng có UI phải bấm thật trên dev browser, rồi báo từng bước.
- Không commit khi chưa được bảo.

---

### Task 1: BE: trường mới + sắp xếp cho danh sách phải thu

**Files:**
- Modify: `backend/app/services/accounting_service.py` (`receivables_summary`)
- Modify: `backend/app/repositories/accounting_repo.py`, thêm hai hàm:
  - `lan_thu_cuoi_theo_hoa_don_don(invoice_ids, order_ids)`: chọn cột thô (sales_invoice_id, order_id, receipt_date, id, amount_vnd) của phiếu thu ĐÃ THU, mới nhất trước.
  - `lien_he_chinh_theo_khach(customer_ids)`: `{cid: (ten, sdt)}`. Lấy `CustomerContact.is_primary`; khách không có thì lùi về `Customer.contact_name/phone`.
- Modify: `backend/app/schemas/accounting.py` (`ReceivableCustomerOut`)
- Modify: `backend/app/routers/accounting.py` (`/api/accounting/receivables`): thêm `sap_xep`, `chieu`.
- Test: `backend/tests/test_cong_no_bang_du_cot.py` (mới)

**Interfaces — Produces** (trường mới của `ReceivableCustomerOut`, đều tuỳ chọn):
`customer_code: str|None`, `lien_he_ten: str|None`, `lien_he_sdt: str|None`, `sale_user_name: str|None`, `thu_gan_nhat_ngay: date|None`, `thu_gan_nhat_tien: int = 0`.

Query mới:
- `sap_xep ∈ {"con_no","han","gan_nhat"}`, mặc định `con_no`. Khoá lạ thì bỏ qua.
- `chieu ∈ {"asc","desc"}`. Mặc định theo cột: `con_no` desc, `han` asc, `gan_nhat` asc (im lâu nhất trước).
- Dòng thiếu giá trị (không hạn, chưa thu lần nào) LUÔN nằm cuối, trừ `gan_nhat` asc: "chưa thu lần nào" là im lâu nhất nên đứng đầu.

Cách làm:
- Lần thu gần nhất tính trên TOÀN lịch sử, không theo kỳ, cho mọi khách trong `theo_khach`: một truy vấn cột thô, quy về khách bằng `invoice_to_customer` / `order_to_customer`.
- Liên hệ, mã, tên phụ trách chỉ nạp cho DÒNG CỦA TRANG, sau khi cắt trang: tối đa 3 truy vấn.

- [ ] Viết test: dựng 2 khách × hoá đơn + phiếu thu, rồi kiểm:
  - trường liên hệ chính (có is_primary, và lùi về contact_name);
  - `thu_gan_nhat_*` lấy đúng phiếu mới nhất, kể cả ngoài kỳ;
  - `sap_xep=han` asc thì khách không hạn đứng cuối;
  - `sap_xep=gan_nhat` asc thì khách chưa thu đứng đầu;
  - mặc định vẫn theo còn nợ giảm dần.
- [ ] Chạy test, thấy FAIL.
- [ ] Code repo + service + schema + router.
- [ ] Chạy `python -m pytest tests/test_cong_no_bang_du_cot.py tests/test_accounting*.py -q -k receivable`, thấy PASS.

### Task 2: BE: trường mới + sắp xếp cho danh sách phải trả (đối xứng Task 1)

**Files:** như Task 1, phần `payables_summary`, `PayableSupplierOut`, route `/api/accounting/payables`.

**Produces:** `supplier_code`, `lien_he_ten`, `lien_he_sdt`, `tra_gan_nhat_ngay`, `tra_gan_nhat_tien`.

Cách làm:
- Phiếu chi đã chi lấy từ `row.payment_vouchers` đã nạp sẵn trong `don_ds` (không thêm truy vấn). Ngày lấy `self._ngay_chi(v)`.
- Liên hệ lấy `Supplier.contact_name` / `phone`. Mã lấy `Supplier.code`. NCC không có phụ trách.
- Cùng `sap_xep` / `chieu` và cùng hàm sắp xếp dùng chung `_sap_xep_cong_no(items, sap_xep, chieu, khoa_gan_nhat)`, đặt cạnh `_loc_the_cong_no`.

- [ ] Test trong cùng file: liên hệ NCC, lần trả gần nhất, sắp xếp.
- [ ] Code, rồi pytest PASS.

### Task 3: FE: bảng đủ cột cho hai màn công nợ

**Files:**
- Modify `frontend/src/api/client.ts`:
  - `ReceivableCustomerRow` / `PayableSupplierRow` thêm trường của Task 1–2;
  - `LocCongNo` thêm `sap_xep?`, `chieu?`;
  - `locCongNoVaoQuery` thêm hai tham số đó.
- Modify `pages/ke-toan/shared/trangCongNo.ts`: state `sapXep: {cot, chieu}`.
  - Đổi cột sắp xếp thì về trang 1.
  - Ghi lên URL qua `congNoLenUrl` / `congNoTuUrl` (khoá `sx`) trong `locCongNo.ts`.
- Modify `pages/ke-toan/shared/ThanTrangCongNo.tsx`: bảng 7 cột.
  1. Đối tác: tên xuống dòng được; thẻ mã; "N hoá đơn/khoản"; thẻ "Vượt hạn mức" (hoặc thẻ "Đã thu hết").
  2. Còn nợ: số; vạch tuổi 6 màu 130px; "quá hạn X" là nút đỏ mở ngăn ở "overdue".
  3. Hạn gần nhất: ngày + `ConHan`; dòng phụ "cho nợ N ngày".
  4. Trong kỳ: hai dòng "Bán thêm/Mua thêm" và "Đã thu/Đã trả". Số đã thu/trả là nút mở ngăn ở "paid".
  5. Thu gần nhất / Trả gần nhất: ngày + số tiền, hoặc "Chưa thu lần nào".
  6. Liên hệ: tên + số điện thoại; phụ trách (chấm chữ cái đầu + tên) nếu có.
  7. Hạn mức: "Đã dùng X%" + vạch + "hạn mức N triệu", hoặc "Chưa đặt hạn mức".
  - Tiêu đề sắp xếp được: Còn nợ, Hạn gần nhất, Thu/Trả gần nhất. Dùng `aria-sort`; bấm lại thì đảo chiều.
  - Màn < 1100px ẩn cột 4 và 5. Thẻ điện thoại giữ như cũ, thêm dòng liên hệ.
  - `CauHinhThanCongNo` thêm `ma(r)`, `choNo(r)`, `trongKy(r) → {them, da}`, `ganNhat(r) → {ngay, tien}|null`, `lienHe(r) → {ten, sdt, phuTrach}|null`, cùng các nhãn `nhanThem`, `nhanDa`, `nhanGanNhat`, `chuChuaGanNhat`.
  - `OHanMuc` cũ thay bằng `OHanMucDong` (phần trăm + vạch). Ngăn vẫn dùng `OHanMuc` cũ.
- Modify `AccountingReceivablesPage.tsx`, `AccountingPayablesPage.tsx`: khai thêm cấu hình.
- CSS `ke-toan.css`: `.kt-vach-tuoi`, `.kt-hm-vach`, `.kt-sx`, `.kt-an-hep`, `.kt-cham-ten`.
- Test: sửa `AccountingReceivablesPage.test.tsx` / `AccountingPayablesPage.test.tsx` cho đúng cột mới. Thêm ca bấm "Còn nợ" thì gọi API với `sap_xep=con_no&chieu=asc`.

- [ ] Sửa test trước (cột mới, sắp xếp), thấy FAIL.
- [ ] Code, rồi `npx vitest run src/pages/ke-toan/cong-no-phai-thu src/pages/ke-toan/cong-no-phai-tra src/pages/ke-toan/shared` + tsc PASS.

### Task 4: FE: bộ khối form kiểu mới (dùng chung)

**Files:** `pages/ke-toan/shared/KhungFormPhieu.tsx`, `shared/BanXemPhieu.tsx`, `shared/tepChungTu.tsx` (thêm biến thể hàng), `ke-toan.css`.

**Produces:**
- `KhoiForm({ tieu, children })`: `<section class="kt-khoi"><h4>…</h4>`.
- `OTienLon({ khoa, nhan, value, onChange, loi, nutDu?: {nhan, so}, vuot?: string|null })`: ô cao 56px chữ 26px hậu tố "đ". Dưới ô: bằng chữ (nghiêng) bên trái, nút "Thu đủ/Trả đủ" bên phải. `vuot` có chữ thì viền đỏ + câu đỏ.
- `SauPhieu({ o: {nhan, tu?, den}[] })`: dải nền `--paper`, 2–3 ô; `tu` gạch ngang trước `den`.
- `GoiYTen({ goiY: {ten, phu?}[], dangChon, onChon })`: chip tròn.
- `ChonCach` thêm `kieu="seg"`: hai nút trong khung 40px. Biến thể `gon` cũ bỏ hẳn, mọi nơi chuyển sang `seg`.
- `OChungTu` thêm `hang`: hàng nền `--paper` có icon, chữ "Ảnh chứng từ gốc" + giải thích + nút "Chọn ảnh"; danh sách tệp hiện dưới hàng.
- `KhungFormPhieu` có `banXem` thì lưới `minmax(0,1fr) 330px`, cột phải sticky. Chân chỉ còn câu "Lập xong không sửa được, chỉ hủy được." (hoặc câu lỗi).
- `BanXemPhieu`, tờ A5 (`aspect-ratio:148/210`, Times):
  - đầu: tên + địa chỉ công ty, mẫu số + "(TT 200/2014/TT-BTC)";
  - tiêu đề; ngày; "Số: PT-yymmdd-*tự cấp*" (chi: "PC-");
  - các dòng chấm;
  - chữ ký 5 cột: tên người nộp/nhận (nếu ≤ 22 ký tự) và tên người lập (prop `nguoiLap`).
  - Dưới tờ: "Bản in đổi theo từng phím gõ".
- Test: `KhungFormPhieu.test.tsx` thêm ca `OTienLon` (bằng chữ, nút đủ) và ca `BanXemPhieu` (số phiếu có tiền tố theo ngày, người lập).

- [ ] Test trước, thấy FAIL. Code, rồi vitest + tsc PASS.

### Task 5: FE: Thu tiền hoá đơn ở ngăn chồng

**Files:**
- Create `cong-no-phai-thu/components/ThuTienHoaDon.tsx`, thay `InvoiceReceiptForm.tsx`. Giữ nguyên payload và luật kiểm của bản cũ; đổi tên test tương ứng.
- Modify `HoaDonConNoBlock.tsx`: bỏ dòng khung mở dưới; nút "Thu tiền" gọi `onThu(item)`.
- Modify `ReceivablesDrawer.tsx`: state `dangThu: ReceivableItemRow|null` mở `<ThuTienHoaDon tang={1} …/>`. Bỏ `moThu/formBan/banNhap`: ngăn chồng tự hỏi khi đóng.

Đầu ngăn:
- đường dẫn "Khách › Hoá đơn N";
- tiêu đề "Thu tiền hoá đơn N";
- thẻ: Ngày hoá đơn, Ký hiệu, Đơn (link), Hạn thu + còn/trễ ngày.

Khối "Hoá đơn này":
- hàng 4 số: Giá trị hoá đơn | Trừ cọc | Đã thu | Còn phải thu;
- bảng lần thu trước: `detail.paid` lọc theo `sales_invoice_id`. Lưu ý rổ này chỉ có trang đầu; ghi chú rằng đây là các lần thu đang nạp;
- dòng hoá đơn khác còn nợ: `detail.items` trừ hoá đơn này, mỗi cái một thẻ (đỏ nếu trễ). Không có thì ghi "Khách không còn hoá đơn nào khác chưa thu."

Khối "Tiền thu":
- `OTienLon` với "Thu đủ";
- `vuot` khi số > còn nợ, và lúc đó khoá nút;
- `SauPhieu`: Hoá đơn còn nợ, Khách còn nợ (`detail.total_due`), Hạn mức còn được nợ (chỉ khi có hạn mức);
- Ngày thu | Nhận bằng (seg);
- chuyển khoản thêm Tài khoản nhận (rộng hết) + Mã giao dịch.

Khối "Người nộp":
- Người nộp tiền + `GoiYTen`: tên khách, rồi liên hệ từ `api.customers.contacts`. Liên hệ chính kèm "liên hệ chính" + sđt. Nạp hỏng thì chỉ còn chip tên khách;
- Lý do nộp;
- Địa chỉ người nộp (không bắt buộc), gửi `payer_address`. Máy chủ vốn nhận trường này.

Khối "Chứng từ":
- `OChungTu hang`; tải lên sau khi lập bằng `taiTepSauKhiLap`, giống form Thu khác;
- Ghi chú nội bộ.

Bên phải: `BanXemPhieu` với Nguồn thu "Thu hoá đơn N".

- Test `ThuTienHoaDon.test.tsx` (chuyển từ `InvoiceReceiptForm.test.tsx`): payload đúng; vượt số thì khoá; chip liên hệ điền người nộp; bằng chữ hiện. Sửa `ReceivablesDrawer.test.tsx`: bấm Thu tiền thì ra ngăn chồng.

- [ ] Test, code, vitest + tsc PASS.

### Task 6: FE: các form lập phiếu thu còn lại theo kiểu mới

**Files:** `phieu-thu/modals/OtherReceiptDialog.tsx`, `phieu-thu/modals/DepositReceiptDialog.tsx`, `phieu-thu/PaymentReceiptDialog.tsx`, `phieu-thu/components/PhanNhanBang.tsx` (`seg`).

Mỗi form dùng `KhoiForm` theo thứ tự: [Đối chiếu nếu có chứng từ nguồn] → Tiền thu (`OTienLon` + Ngày + Nhận bằng) → Người nộp → Chứng từ.

- Thu khác: không có đối chiếu, không có "sau phiếu này".
- Cọc đơn bán:
  - đối chiếu = Cọc quy định | Đã thu | Còn thiếu (dải cũ chuyển thành hàng số);
  - "Thu đủ" = còn thiếu;
  - sau phiếu = Cọc còn thiếu;
  - gợi ý tên = khách của đơn + liên hệ.
- Thu lại tiền đã chi: đối chiếu = Phiếu chi gốc | Đã chi | Đã thu lại | Còn thu được; "Thu đủ".
- Test: chạy lại test có sẵn của ba form; sửa selector nếu đổi nhãn.

- [ ] Code, rồi vitest + tsc PASS.

### Task 7: FE: các form lập phiếu chi theo kiểu mới

**Files:** `phieu-chi/PaymentVoucherDialog.tsx`, `phieu-chi/modals/StandaloneVoucherDialog.tsx`, `phieu-chi/modals/LapPhieuChiGiaCongModal.tsx`, `phieu-chi/components/ThanPhieuChiRoi.tsx`, `VoucherAmountFields.tsx`, `VoucherSegments.tsx` (`seg`), `VoucherRecipientSection.tsx`, `cong-no-phai-tra/components/BatchPaymentDialog.tsx`.

- Theo đơn mua:
  - đối chiếu = Giá trị đơn | Đã cọc | Đã trả | Còn nợ (hoặc theo đợt đang chọn);
  - "Trả đủ" = trần hiện có (`maxAmountVnd`);
  - sau phiếu = Đơn còn nợ.
- Chi khác / gia công: gia công giữ dải tóm tắt việc gia công thành hàng số đối chiếu.
- Trả nhiều đợt (ngăn chồng từ Công nợ phải trả):
  - "Các đợt sẽ trả" là khối đối chiếu;
  - sau phiếu = NCC còn nợ (`total_due` của ngăn) và Hạn mức còn được nợ;
  - không có ô tiền (giữ luật cũ);
  - tờ xem trước ghi tổng.
- Khối "Người nhận": gợi ý tên NCC + liên hệ NCC (contact_name).
- Test: chạy lại test có sẵn; sửa selector nếu cần.

- [ ] Code, rồi vitest + tsc PASS.

### Task 8: Kiểm thật trên dev browser

- [ ] Restart uvicorn.
- [ ] Công nợ phải thu:
  - xem cột mới;
  - bấm sắp xếp Hạn gần nhất và Thu gần nhất;
  - mở Cao Lợi Hưng → Thu tiền → ngăn chồng;
  - gõ số vượt (thấy báo đỏ, nút khoá) → Thu đủ → chọn chip liên hệ → Chuyển khoản + tài khoản + mã → Lập;
  - thấy ngăn khách cập nhật.
- [ ] Công nợ phải trả: xem cột mới, sắp xếp. Có dữ liệu thì mở trả nhiều đợt; không có thì nói rõ.
- [ ] Phiếu thu → Lập phiếu thu khác (gõ, xem tờ đổi). Phiếu chi → Lập phiếu chi (gõ, xem tờ đổi).
- [ ] Báo cáo từng bước đã bấm / gõ / thấy.
