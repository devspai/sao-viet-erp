# Theo dõi SX theo đơn + Hồ sơ lệnh gọn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps dùng checkbox (`- [ ]`).

**Goal:** Làm lại hai màn chỉ-xem: Theo dõi sản xuất thành bảng MỘT DÒNG MỘT ĐƠN (ngăn mở bằng bảng mặt
hàng, bấm món bung routing dọc), Hồ sơ lệnh thành bảng có tuyến bước ngang trong dòng + ngăn gọn.

**Architecture:** Phạm vi hai màn đổi sang đúng luật Đơn hàng bán (chủ = sale của khách, thiếu thì sale
của đơn; "của tôi" gồm nhóm dùng chung) — vẫn lấy MỨC phạm vi từ ô quyền của chính màn. Số theo đơn
dùng lại `tom_tat_nhieu_don` + `danh_sach._soi` + `ho_so._routing`, không engine mới. FE dùng vỏ
`NganPhai` (độ rộng chung `--kt-ngan-w`).

**Tech Stack:** FastAPI + SQLAlchemy, React + TS, vitest, pytest.

**Spec:** `docs/mockups/theo-doi-don-san-xuat-3-phuong-an.html` (A, bản 3) và
`docs/mockups/ho-so-lenh-san-xuat-3-phuong-an.html` (A). Chốt 12/10/2026.

## Global Constraints

- Không một số tiền nào trên hai màn.
- Lọc, đếm chip, cắt trang ở MÁY CHỦ; FE không `rows.filter`/`rows.slice`.
- Trễ đo theo HẠN GIAO KHÁCH (`orders.delivery_committed_date`), không theo hạn SX của lệnh.
- Không mốc thời gian / nhật ký trong ngăn; không máy, người, giờ kế hoạch, vào-ra, vật tư từng bước.
- Lệnh gia công trọn gói = MỘT bước "Gia công trọn gói" + tên nhà gia công.
- In phiếu công nghệ chỉ hiện khi `can("san_xuat","read")`.
- Mã lệnh trong ngăn Theo dõi bấm sang Hồ sơ lệnh, chỉ khi `can("lenh_san_xuat","read")`.
- Thêm field: đi hết dict → schema Pydantic → type TS (Pydantic nuốt field im lặng).
- Không cột DB mới ⇒ không migration, không sửa DB_SCHEMA.md.
- Không chữ đậm, không nối mẩu dữ liệu bằng dấu "·" hay dấu phẩy; chip trạng thái dùng bộ `--tt-*`.
- Verify: pytest nhắm file + `npx tsc --noEmit` + vitest nhắm file + bấm thật trên dev-browser.

## Review Focus

1. Đơn 20 mặt hàng: dòng danh sách không bung; ngăn sắp món vướng lên đầu; chip lọc món có số đếm.
2. Đơn không có lệnh nào (mọi món "Chưa có lệnh"): chặng ở Lệnh, không nổ khi `bc=None`.
3. Khách đã chuyển cho sale khác: sale mới thấy đơn + lệnh, sale cũ không thấy (403 ở chi tiết).
4. Lệnh trọn gói đã xong: vẫn hiện một bước "Gia công trọn gói" với tên nhà gia công.
5. Đơn quá hạn giao mà chưa có dự kiến xong: vẫn báo trễ theo ngày hôm nay.

---

### Task 1: Phạm vi theo luật Đơn hàng bán

**Files:** Modify `backend/app/services/lenh_sx/pham_vi.py`; Test `backend/tests/test_lenh_sx_pham_vi.py`.

**Produces:** `sale_ids_theo_pham_vi(db,user,authz,module) -> set[int]|None` (own = nhóm dùng chung);
`chu_don()` (biểu thức SQL chủ đơn); `loc_lsx_da_phat_hanh(stmt, sale_ids)` lọc theo `chu_don()`;
`loc_don(stmt, sale_ids)`; `chan_ngoai_pham_vi` so `chu_cua(...)`; `chan_don_ngoai_pham_vi(db, order, sale_ids)`.

- [ ] Test: khách của sale B nhưng đơn ghi sale A ⇒ B thấy lệnh, A không thấy; 403 cho A ở chi tiết.
- [ ] Test: own gồm người cùng nhóm dùng chung.
- [ ] Sửa `pham_vi.py`; chạy `pytest tests/test_lenh_sx_pham_vi.py`.

### Task 2: API Theo dõi theo đơn

**Files:** Create `backend/app/services/lenh_sx/theo_doi_don.py`; Modify `backend/app/schemas/theo_doi_san_xuat.py`,
`backend/app/routers/theo_doi_san_xuat.py`; Test `backend/tests/test_theo_doi_theo_don.py`.

**Produces:**
- `GET /api/theo-doi-san-xuat/theo-don?q&khach_hang_id&phu_trach_id&chip&tu_ngay&den_ngay&moc&page&page_size`
  ⇒ `TheoDonOut{items: DonDongOut[], total, page, page_size, dem: {tat_ca,can_de_y,dang_lam,cho_giao,da_giao}}`.
- `GET /api/theo-doi-san-xuat/theo-don/{order_id}` ⇒ `DonChiTietOut{don: DonDongOut, mon: MonOut[]}`.
- `GET /api/theo-doi-san-xuat/phu-trach-loc` ⇒ `LuaChonLoc[]`.
- `DonDongOut`: order_id, order_no, khach_hang, phu_trach, so_mon, mon_dau, so_luong, don_vi, chang
  (`lenh|sx|kho|giao|xong`), chang_ket, dai_dien (MonTomTat), so_mon_kho, so_mon_giao, han_giao,
  du_kien_xong, tre_ngay, con_ngay, vuong{so_mon, ly_do, buoc}|null, nhom, can_de_y.
- `MonOut`: khoa, ten, dat, don_vi, o, nhom (`vuong|dang|chua|kho|giao`), co[], kho_da_nhan, da_giao,
  buoc, buoc_so, buoc_tong, pct, nha_gia_cong, lenh: LenhBuocOut[].
- `LenhBuocOut`: lsx_id, ma, ten, da_xuong, tron_goi, nha_gia_cong, buoc: BuocOut[].
- `BuocOut`: ten, to, ngoai, nha_cung_cap, trang_thai (`xong|chay|dung|cho`), hien_tai, hoan_thanh_luc,
  kcs_khong_dat.

Luật: đơn = `status=ordered` và đã giao xưởng (`san_xuat_released_at`); nhóm món theo thứ tự
khach_nhan_du→giao, đủ hàng→kho, có cờ (sự cố, tạm dừng, thiếu vật tư, KCS không đạt, đóng thiếu)→vuong,
chưa lệnh/chưa xuống xưởng→chua, còn lại→dang. Chặng đơn = chặng của món chậm nhất. Chip đơn: da_giao
(mọi món khách nhận đủ), cho_giao (mọi món đủ hàng), còn lại dang_lam; can_de_y = có vướng hoặc trễ hoặc
còn ≤3 ngày mà chưa đủ hàng.

- [ ] Test danh sách: một đơn một dòng dù hai lệnh; đếm chip; lọc chip; ngoài phạm vi không thấy.
- [ ] Test chi tiết: món có `lenh[].buoc` đúng số bước; đơn chưa lệnh ⇒ `chang=lenh`, món `chua`; 403/404.
- [ ] Test trễ: hạn giao đã qua ⇒ `tre_ngay>0`.
- [ ] Viết service + schema + router; chạy test.

### Task 3: Hồ sơ lệnh — dòng có tuyến bước, hạn giao, lọc phụ trách, API ngăn gọn

**Files:** Modify `backend/app/services/lenh_sx/danh_sach.py`, `ho_so.py`, `schemas/lenh_san_xuat.py`,
`routers/lenh_san_xuat.py`; Test `backend/tests/test_lenh_sx_api.py` (thêm ca).

**Produces:** `LenhSxItem` thêm `chang: LenhSxChang[]` (chặng thêm `ngoai`, `kcs_loi`), `tron_goi`,
`nha_gia_cong`, `han_giao_khach`; tham số `phu_trach_id`; `GET /api/lenh-san-xuat/phu-trach-loc`;
`GET /api/lenh-san-xuat/{id}/ngan` ⇒ `LenhSxNganOut{thong_tin, tien_do, thong_so, routing, kcs, kho,
phien_ban, tron_goi}`; `RoutingNodeOut.kcs_khong_dat`.

- [ ] Test: dòng có `chang`; lệnh trọn gói ⇒ `tron_goi=true`; `/ngan` không có khoá vat_tu/timeline.
- [ ] Code; chạy test.

### Task 4: FE Theo dõi theo đơn

**Files:** Rewrite `frontend/src/pages/TheoDoiSanXuatPage.tsx`; Create `TdsxNganDon.tsx`, `tdsxDon.ts`;
rewrite `theo-doi-san-xuat.css`; client types + api; xoá `TdsxTheoLenh*`, `TdsxTheoMay*`, `tdsxChonLenh.tsx`
nếu không còn ai dùng; test `TheoDoiSanXuatPage.test.tsx`.

- [ ] Bảng: Đơn, Khách hàng, Mặt hàng, Số lượng, Chặng (4 chấm), Đang làm, Hạn giao, Đang vướng.
- [ ] Chip lọc + ô tìm + thanh lọc (kỳ chốt đơn/hạn giao, khách, phụ trách) + phân trang chuẩn.
- [ ] Ngăn: đầu (mã đơn, khách, phụ trách, hạn giao, dự kiến xong, mặt hàng), dải vướng, chip lọc món,
  bảng mặt hàng; bấm món bung routing dọc; đơn một món bung sẵn.
- [ ] tsc + vitest.

### Task 5: FE Hồ sơ lệnh

**Files:** Modify `LenhSanXuatPage.tsx`; Create `LenhSxNgan.tsx`; CSS trong `lenh-sx-chung.css`;
xoá `LenhSxHoSoView*`, `LsxHoSo*` nếu không còn ai dùng; test.

- [ ] Cột: Lệnh, Đơn, Khách hàng, Mặt hàng, Số lượng, Các bước (tuyến ngang), Trạng thái, Hạn giao.
- [ ] Ngăn: tiêu đề mã lệnh + chip, In phiếu (có quyền SX), dòng đơn/khách/phụ trách, 3 ô (Số lượng,
  Hạn giao, Sản xuất), quy cách 1 dòng, dải vướng, Các bước (routing dọc), Sau xưởng (KCS cuối,
  Nhập kho, Giao khách). Deep link QR + băng phiên bản giữ nguyên.
- [ ] tsc + vitest.

### Task 6: Xác minh luồng thật

- [ ] Restart uvicorn; dev-browser: Theo dõi → bấm chip, tìm, mở đơn DH002, bấm món, bấm mã lệnh sang
  Hồ sơ; Hồ sơ lệnh → mở LSX26-0003, LSX26-0002 (trọn gói), In phiếu. Ghi lại từng bước.
