# Thành phẩm thuộc về khách + tái bản theo mã — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Danh tính thành phẩm do người lập phiếu CHỌN (ô Sản phẩm tái bản lọc theo khách), không đoán bằng tên. Tồn kho đi theo mã thành phẩm của khách, nên đơn sau của cùng khách dùng được hàng làm dư của đơn trước.

**Architecture:**
- Mã thành phẩm (`vat_tu_in_an`, `la_thanh_pham`) thuộc ĐÚNG một khách (`customer_id`, trước chỉ là vết "khách đặt lần đầu"). Mã giữ luôn cấu hình kỹ thuật của lần chốt gần nhất (`cau_hinh_tai_ban`), dùng làm nguồn cho ô tái bản ở cấp MÓN BÁN (sách = ruột + bìa).
- Thẻ phiếu tính giá mang `tai_ban_thanh_pham_id`. Lúc chốt đơn, mỗi cụm bán gắn thẳng vào mã đó (`order_lines.thanh_pham_id`). Cụm từ phiếu tính giá mà không gắn thì đẻ mã MỚI. Dòng nhập tay thì tìm-hoặc-khai theo (khách, tên).
- Giao được = tồn thật của mã − phần các yêu cầu giao (mọi đơn) đang giữ mà kho chưa xuất. Bỏ nhãn "của đơn nào".

**Tech Stack:** FastAPI + SQLAlchemy (không Alembic, migration tay ở `backend/app/db_migrations.py`), React + TS (Vite), pytest, vitest.

**Spec:** chốt trong hội thoại 11/10/2026 (không có file spec riêng). Các điểm chủ đã gật:
1. Ô tái bản chỉ hiện hàng của khách đã chọn ở đầu phiếu. Chưa chọn khách thì nhắc chọn trước.
2. Chọn tái bản thì mang mã TP theo; chốt đơn gắn thẳng vào mã đó. Không chọn thì đẻ mã mới thuộc khách.
3. Mỗi mã TP thuộc đúng một khách; tồn của mã là hàng của khách đó; bỏ nhãn "của đơn nào".
4. Mã cũ: khách = "Khách đặt lần đầu".
5. Tái bản ở cấp món bán: chọn "Sách A5 64 trang" là nạp đủ ruột và bìa.
6. Chọn tái bản rồi sửa: người lập phiếu bấm "Tách thành sản phẩm mới" nếu không còn là hàng cũ; mặc định giữ mã cũ.
7. Kế hoạch SX thấy "kho đang có N" của sản phẩm lúc lên lệnh.

## Global Constraints

- UI tiếng Việt, không chữ đậm, không nối mẩu dữ liệu bằng "·" hay dấu phẩy, không viền một cạnh.
- Migration mới = `0394_thanh_pham_theo_khach`, đọc inspector TRƯỚC lệnh ghi đầu tiên, backfill bằng raw SQL đích danh cột (cấm ORM full-select), idempotent.
- Thêm cột ⇒ ghi `docs/DB_SCHEMA.md` cùng lúc (guard test).
- Pydantic nuốt field im lặng: field mới phải đi đủ model → schema In/Out → type TS.
- Bảng `san_pham_tai_ban` giữ nguyên (lệ không drop), thôi ghi/đọc.
- Verify: pytest nhắm file + `npx tsc --noEmit` + vitest; KHÔNG chạy `./init.ps1`.

## Review Focus

1. Phiếu tính giá đổi khách sau khi đã gắn tái bản → chốt đơn không được gắn đơn vào mã của khách khác (chặn lúc chốt, FE gỡ gắn khi đổi khách).
2. Hai đơn cùng khách cùng mã đang mở → một đơn lập yêu cầu giao giữ 500 thì đơn kia thấy giao được giảm ngay (test ở Task 4).
3. Hàng đã xuất kho đang trên xe → không bị trừ hai lần (tồn đã giảm + vẫn đang giữ) — test ở Task 4.
4. Đơn cũ chốt trước đợt này (dòng chưa có `thanh_pham_id`) → vẫn tìm ra mã theo (khách, tên) để giao/nhập kho được (test ở Task 2).
5. Mã TP chưa có cấu hình (khai tay / nhập Excel) → vẫn chọn được ở ô tái bản, chỉ gắn mã (test ở Task 3).

---

### Task 1: Cột mới + migration 0394

**Files:**
- Modify: `backend/app/models/vat_lieu_kho.py` (VatTuInAn: `cau_hinh_tai_ban` JSON, `tai_ban_luc` DateTime tz)
- Modify: `backend/app/models/order.py` (OrderLine: `thanh_pham_id` Integer index)
- Modify: `backend/app/models/phieu_tinh_gia.py` (PhieuThanhPhan: `tai_ban_thanh_pham_id` Integer; relationship viewonly `tai_ban_thanh_pham` → VatTuInAn; docstring SanPhamTaiBan "NGƯNG GHI")
- Modify: `backend/app/db_migrations.py` (append `_migrate_thanh_pham_theo_khach`)
- Modify: `docs/DB_SCHEMA.md`

- [ ] Thêm cột vào model, ghi DB_SCHEMA.md.
- [ ] Migration: `ADD COLUMN IF NOT EXISTS` cho 4 cột (đọc `_existing_columns` trước). Backfill `cau_hinh_tai_ban` cho mã có `order_id`: đọc `order_lines(id, nhom, description, qty, phieu_thanh_phan_id)` của đơn đầu tiên, gom cụm như `cum_ban` (nhãn nhóm lower + SL; không nhãn = từng dòng), cụm có tên chuẩn hoá trùng tên mã → `phieu_thanh_phan.ten` → `san_pham_tai_ban.cau_hinh_json` theo `ten_chuan_hoa`. Ghi list JSON + `tai_ban_luc = now`. Chỉ ghi khi `cau_hinh_tai_ban IS NULL`.
- [ ] Chạy `pytest tests/test_db_schema_doc.py -q` (guard) — PASS.

### Task 2: Luật mã thành phẩm theo khách + gắn lúc chốt đơn

**Files:**
- Modify: `backend/app/services/thanh_pham_khai_bao.py`
- Modify: `backend/app/services/order_service.py` (confirm: bỏ `snapshot_tu_thanh_phan`, gọi `khai_cho_don` mới)
- Modify: `backend/app/services/san_xuat/kho.py:484`, `backend/app/services/delivery_service.py:280` (đọc qua `thanh_pham_cua_cum`)
- Test: `backend/tests/test_thanh_pham_danh_muc.py`, `backend/tests/test_thanh_pham_theo_khach.py` (mới)

**Interfaces (Produces):**
- `tim_theo_khach_ten(db, customer_id, ten) -> VatTuInAn | None`
- `thanh_pham_cua_cum(db, order, cum) -> VatTuInAn | None` — dòng có `thanh_pham_id` thì lấy đúng mã đó; không thì (khách của đơn, tên cụm). Chỉ đọc.
- `khai_cum(db, order, cum) -> VatTuInAn` — có thì dùng, không thì đẻ mã mới thuộc khách; luôn đóng dấu `thanh_pham_id` lên mọi dòng của cụm.
- `khai_cho_don(db, order, actor_id=None) -> list[VatTuInAn]` — luật lúc chốt (dưới), rồi chụp cấu hình vào mã.
- `ThanhPhamKhacKhach(ValueError)` — gắn tái bản sang mã của khách khác.

Luật `khai_cho_don` cho mỗi cụm:
1. Có dòng mà `phieu_thanh_phan.tai_ban_thanh_pham_id` khác NULL → mã đó; mã không tồn tại / không phải thành phẩm / khác khách → raise `ThanhPhamKhacKhach("«tên» đang gắn tái bản mã TP-x của khách khác — mở phiếu tính giá, bấm Tách thành sản phẩm mới hoặc chọn lại")`.
2. Không gắn mà cụm có dòng từ phiếu tính giá → đẻ mã MỚI (không so tên).
3. Không có dòng nào từ phiếu tính giá (nhập tay) → `khai_cum` (tìm theo khách + tên, không có thì đẻ).
4. Đóng dấu `order_lines.thanh_pham_id`; nếu cụm có dòng từ phiếu tính giá thì `tp.cau_hinh_tai_ban = [cấu hình từng thành phần theo thứ tự dòng]`, `tp.tai_ban_luc = now`.

- [ ] Viết test (fail trước): hai khách cùng tên → hai mã; cùng khách đơn sau gắn tái bản → cùng mã + `thanh_pham_id` đóng dấu; cùng khách không gắn mà từ PTG → mã mới; nhập tay cùng khách cùng tên → dùng lại mã; gắn mã khách khác → chốt bị chặn và rollback; đơn cũ không dấu → `thanh_pham_cua_cum` tìm theo (khách, tên); chốt ghi `cau_hinh_tai_ban` đủ ruột + bìa.
- [ ] Sửa `test_HAI_KHACH_cung_ten_thi_DUNG_CHUNG_mot_dong` thành tách hai mã.
- [ ] Code; chạy `pytest tests/test_thanh_pham_theo_khach.py tests/test_thanh_pham_danh_muc.py tests/test_thanh_pham_cum.py -q` — PASS.

### Task 3: API tái bản theo khách + field trên thẻ phiếu

**Files:**
- Modify: `backend/app/services/san_pham_tai_ban_service.py` (`tim_kiem(db, customer_id, q, size)`, `lay_chi_tiet(db, tp_id)`; giữ `_cau_hinh_tu_thanh_phan` làm hàm chụp; `snapshot_tu_thanh_phan` gỡ)
- Modify: `backend/app/schemas/phieu_tinh_gia.py` (`SanPhamTaiBanGoiY{id, ma, ten, don_vi, so_thanh_phan, tai_ban_luc}`, `SanPhamTaiBanChiTiet{id, ma, ten, thanh_phans: list[ThanhPhanIn]}`, `ThanhPhanIn.tai_ban_thanh_pham_id`, `ThanhPhanOut.tai_ban_thanh_pham_id` + `tai_ban_thanh_pham: {id, ma, ten} | None`)
- Modify: `backend/app/routers/phieu_tinh_gia.py:576-599` (`customer_id` bắt buộc)
- Test: `backend/tests/test_san_pham_tai_ban.py` (viết lại)

- [ ] Test: gợi ý chỉ trả mã của khách hỏi, cả mã chưa có cấu hình (`so_thanh_phan = 0`); chi tiết trả đủ thành phần; lưu phiếu giữ `tai_ban_thanh_pham_id` và trả nhãn mã; thẻ bỏ gắn → NULL.
- [ ] Code; chạy `pytest tests/test_san_pham_tai_ban.py tests/test_khach_hang_o_ptg.py -q` — PASS.

### Task 4: Giao được theo tồn của mã (mọi đơn của khách)

**Files:**
- Modify: `backend/app/repositories/delivery_repo.py` (`dong_giu_theo_ma(tp_ids)`, `da_xuat_theo_yeu_cau_giao(request_ids)`)
- Modify: `backend/app/services/delivery_service.py` (`kha_dung_theo_ma(tp_ids) -> {tp_id: {"ton": float, "giu": {order_id: float}}}`; `nguon_giao_theo_cum` dùng nó; `_chan_vuot_giao_duoc` câu báo)
- Modify: `backend/app/services/don_hang_san_xuat.py` (`co = da_giao + dang_giu + giao_duoc` cho mọi cụm)
- Test: `backend/tests/test_giao_hang_giao_duoc.py`

Công thức: `giu_chua_xuat(yêu cầu, mã) = max(0, SL dòng − Σ đã xuất kho ghi sổ của các chuyến thuộc yêu cầu)`, chỉ tính yêu cầu `dang_giu_hang`. `con_kho(mã) = max(0, tồn thật − Σ giu_chua_xuat mọi đơn)`. `giao_duoc = min(còn phải giao, con_kho)`. `ton_kho` = `[{kho_id, kho_ten, so_luong}]`; thêm `giu_don_khac`.

- [ ] Test: đơn A làm 1.500 giao 1.000, đơn B cùng khách cùng mã lên lệnh 500 → B giao được 500 ngay; A lập yêu cầu giữ 300 chưa xuất → B thấy giảm 300; xuất kho chuyến của A → B không bị trừ thêm; khách khác cùng tên không thấy hàng.
- [ ] Sửa `test_DON_CO_LENH_chi_giao_phan_kho_DA_NHAN_cua_chinh_don`, `test_TIEN_DO_tra_ton_theo_kho_va_cua_ai` theo luật mới.
- [ ] Chạy `pytest tests/test_giao_hang_giao_duoc.py tests/test_don_hang_san_xuat.py tests/test_thanh_pham_cum.py tests/test_giao_hang_ngan_luot.py -q` — PASS.

### Task 5: Kế hoạch SX thấy tồn của sản phẩm

**Files:**
- Modify: `backend/app/schemas/lsx.py` (`PreviewLine.ton_san: float | None`, `ton_giu: float | None`)
- Modify: `backend/app/services/lsx_service.py` (`preview`: cụm của dòng → mã → `kha_dung_theo_ma`)
- Modify: FE nơi hiện preview (bảng lệnh dự kiến) — dòng phụ "kho đang có N {đv}"
- Test: `backend/tests/test_lsx_service.py`

- [ ] Test preview trả `ton_san` = phần chưa ai giữ; không có mã → None.
- [ ] Code + chạy test — PASS.

### Task 6: Giao diện

**Files:**
- `frontend/src/api/client.ts` (types + `timSanPhamTaiBan(token, customerId, q, size)`, `chiTietSanPhamTaiBan`; `DonTienDoTonKho` bỏ `order_*`/`cua_don`; `DonTienDoCum.giu_don_khac`; `PreviewLine.ton_san`)
- `frontend/src/components/SanPhamTaiBanGoiY.tsx` (nhận `customerId`, hiện mã + tên + "chưa có cấu hình")
- `frontend/src/pages/PhieuTinhGiaDetailView.tsx` (EditableComponent `tai_ban`; chọn → thay thẻ bằng N thẻ; dòng "Tái bản TP-x tên" + nút "Tách thành sản phẩm mới"; nhắc trùng tên; đổi khách thì gỡ gắn)
- `frontend/src/pages/giao-hang/tien-do-don/TienDoDon.tsx`, `SanXuatMon.tsx` (bảng tồn Kho | Đang có, chân "N đang giữ cho đơn khác của khách")
- `frontend/src/pages/rebuildCatalogConfigs.tsx` ("Khách đặt lần đầu" → "Khách hàng", gợi ý mới)
- [ ] `npx tsc --noEmit` sạch; vitest tien-do-don PASS.

### Task 7: Xác minh luồng thật

- [ ] Restart uvicorn (migration 0394 chạy). Trên trình duyệt: phiếu tính giá mới cho BIBICA → ô tái bản chỉ hiện hàng BIBICA → chọn "Sách A5 64 trang" → ra hai thẻ ruột + bìa, dòng "Tái bản TP-00002"; đổi sang KATINAT thì danh sách khác và gắn bị gỡ. Ngăn DH002: bảng tồn không còn cột "Của ai".
