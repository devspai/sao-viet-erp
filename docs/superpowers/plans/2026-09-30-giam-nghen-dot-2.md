# Giảm nghẽn đợt 2 — nhập kho, danh sách Lệnh SX, ảnh thu nhỏ, dọn tệp mồ côi

> Làm tuần tự trong worktree `suc-chiu-tai`, mỗi Task một commit. Verify: pytest nhắm file + `npx tsc`
> (KHÔNG chạy `./init.ps1` / pytest full). Task có UI phải thao tác lại luồng thật trên trình duyệt.

**Nguồn:** `docs/audit-suc-chiu-tai-2026-09-28.md` (mục B còn mở) + rà code 30/09/2026.

## Đã cân nhắc và KHÔNG làm

**Cache quyền giữa các request.** Mỗi request tốn 2 câu SQL: đọc `users` (bắt buộc giữ — chặn tài khoản
bị khoá / đổi `token_version` ngay) + 1 câu `role_permissions` theo (role_id, module_key) có chỉ mục.
Nhiều worker chỉ dùng chung cache qua Redis — một lượt GET Redis là một vòng mạng, ngang câu SQL đó ⇒
không nhanh hơn, mà thêm ~15 điểm phải xoá cache (ma trận quyền, vai, quyền tổ theo cây phòng ban,
migration, seed) và 43 chỗ test ghi quyền thẳng DB. Sót một điểm = người bị rút quyền vẫn vào được.

---

### Task 1: Ghi sổ phiếu kho — bỏ commit giữa chừng, cân đối chạy SAU commit

**Lỗi đúng/sai (có trước):** `GiuChoService.chuyen_dang_ve_sang_kho` (NHẬP) và `tieu_thu` (XUẤT) tự
`db.commit()` bên trong `StockVoucherService.post` ⇒ nhả khoá dòng phiếu khi phiếu còn NHÁP; lượt
`/post` thứ hai đang chờ khoá đọc thấy NHÁP ⇒ tạo lô / trừ tồn LẦN HAI.

**Nghẽn:** `nhat_them()` chạy `can_doi()` toàn xưởng (docstring can_doi_cache: 23,8s ở 100k lệnh) +
`_khoa_nguon` FOR UPDATE trên MỌI mặt hàng, bên trong luồng ghi sổ; `dieu_chinh_xuat` chạy nó khi còn
giữ khoá phiếu + dòng lô.

- `chuyen_dang_ve_sang_kho` / `tieu_thu`: thêm `commit: bool = True`; `_apply_post` gọi với `commit=False`
  ⇒ `post()` còn đúng MỘT commit. Việc sau-commit (xoá cache can_doi, báo SSE) dời ra sau commit.
- `nhat_them()` KHÔNG gọi trong `_apply_post` / `dieu_chinh_xuat` nữa: service trả cờ "cần nhặt thêm",
  router chạy `nhat_them` bằng BackgroundTasks với session DB MỚI sau khi trả phản hồi. Ngữ nghĩa giữ
  nguyên (vẫn nhặt cho mọi chủ thể đang bật công tắc), chỉ không còn trong giao dịch ghi sổ và thủ kho
  không phải chờ.
- Test: hai lượt `post` cùng phiếu (lượt 2 sau commit lượt 1) ⇒ lượt 2 bị chặn, tồn chỉ cộng một lần;
  `post` không gọi `can_doi` (đếm lượt gọi); `nhat_them` chạy sau post vẫn giữ chỗ đúng như cũ.

### Task 2: Danh sách / tổng hợp Lệnh SX — không chạy cân đối toàn xưởng mỗi lượt xem

`danh_sach()` và `summary()` gọi `_soi` ⇒ `den_vat_tu_theo_lo` ⇒ `KeHoachVatTuService.can_doi()` đầy đủ
MỖI request (cờ `thieu_vat_tu`), và màn tải lại cả hai sau mỗi sự kiện SSE.
- Đường ĐỌC dùng cache can_doi 45s sẵn có (`services/can_doi_cache.py`, xoá khi kho/giữ chỗ đổi).
  Đường GHI giữ nguyên tính tươi.
- Đo số câu SQL trước/sau bằng test sẵn có `test_so_cau_sql_hang_tren_truc_lenh`.
- Cắt trang trong SQL (bản `gantt`) KHÔNG làm đợt này: bộ đếm theo tab vẫn cần trạng thái suy ra của
  MỌI lệnh còn sống, nên cắt trang SQL không bớt phần nặng. Muốn bớt hẳn phải lưu trạng thái suy ra
  thành cột — việc lớn, để riêng.

### Task 3: Ảnh thu nhỏ theo yêu cầu — `/api/files/<key>?w=160|320`

- Kiểm quyền y như ảnh gốc. Ảnh raster (jpeg/png/webp) và có `w` hợp lệ ⇒ khoá ảnh nhỏ
  `_thumb/w<W>/<key>.jpg`; chưa có thì đọc gốc, Pillow thu nhỏ (JPEG 80, xoay theo EXIF), lưu, rồi phục vụ
  qua đúng đường X-Accel/stream. ETag = khoá + w. Ảnh không thu nhỏ được ⇒ trả ảnh gốc.
- `Storage`: thêm `ton_tai(key)`. Pillow ghim thẳng trong requirements (đang đi ké reportlab).
- Frontend: `anhNho(url, w)` cạnh `assetUrl`; áp vào các lưới/danh sách nhiều ảnh (Sửa chữa máy, KCS,
  đính kèm, tồn kho, yêu cầu kho, báo giá, avatar danh sách). Lightbox giữ ảnh gốc.

### Task 4: Dọn tệp mồ côi trong kho tệp (chạy mỗi ngày, một worker)

- `Storage.liet_ke()` (MinIO `list_objects_v2`, Local `rglob`) trả (key, thời điểm sửa).
- Tập tham chiếu = mọi cột lưu tệp (21 cột, xem bảng trong rà code) + `<img src>` trong
  `noi_quy_versions.noi_dung`; chuẩn hoá cả `/api/files/` lẫn `/static/`.
- Xoá object KHÔNG ai tham chiếu và cũ hơn 7 ngày (che tải lên dở). Ảnh `_thumb/` xoá khi gốc không còn.
- Chốt an toàn: đọc tham chiếu lỗi ⇒ bỏ lượt; số sắp xoá > 20% số object ⇒ KHÔNG xoá, ghi log cảnh báo
  (dấu hiệu DB vừa khôi phục từ bản cũ). Tối đa 500 object mỗi lượt. Tắt được bằng `DON_TEP_MO_COI=false`.
- Sao lưu hằng ngày giữ bản đã xoá 14 ngày ở `minio-cu` ⇒ lỡ tay vẫn lấy lại được.
