# Giấy bỏ dạng cuộn/tờ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps dùng checkbox (`- [ ]`).

**Goal:** Gỡ hẳn khái niệm DẠNG giấy (`dang_giay`, `supplier_items.dang_ban`, DANG_TO/DANG_CUON) ở cả backend và frontend; giấy chỉ còn KHỔ + ĐƠN VỊ TÍNH tự chọn.

**Architecture:** Khoá tồn giấy đổi từ 4 phần tử (cuộn gom về `(giay,id,0,0)`) sang 5 phần tử `(loai, id, kho_rong, kho_dai, don_vi_goc)`; `don_vi_goc` của dòng giấy suy từ ĐVT dòng: thuộc họ tờ (đổi được về `to`) ⇒ `"to"`, còn lại ⇒ `don_vi_gia` của mã giấy. Cột `dang_giay` trên các bảng kho/lệnh thay bằng `don_vi_goc`; bảng ngưỡng / kỳ tồn / giữ chỗ thêm `don_vi_goc` vào khoá.

**Tech Stack:** FastAPI + SQLAlchemy (migration tay ở `db_migrations.py`), React + TS.

**Spec:** memory `giay-bo-cuon-to-chi-con-kho-va-dvt` (chốt với user 10/10/2026).

## Global Constraints

- Tờ ↔ kg KHÔNG quy đổi. Quy đổi cùng họ (ram = 500 tờ, tấn = 1000 kg) đi qua `don_vi_quy_doi` như cũ.
- Cân đối vật tư khớp mã + khổ + đơn vị gốc; cùng khổ khác đơn vị ⇒ hiện hai số cạnh nhau, máy KHÔNG trừ chéo.
- Khổ chỉ-rộng `(r, 0)` KHÔNG tự khớp khổ hai cạnh.
- NCC "rẻ nhất"/tự gán chỉ trong dòng bảng giá cùng khổ + cùng họ đơn vị; chọn NCC khác đơn vị ⇒ dòng đơn đổi ĐVT + giá theo NCC, số lượng để người lập gõ lại.
- Tồn kho tách theo mã + khổ + đơn vị gốc.
- Giữ tính kg cuộn từ gsm cho bước cắt cuộn (`kho_giay.dong_giay_theo_dau_vao`), chỉ bỏ trường `dang`.
- Cột mới: `don_vi_goc VARCHAR(16) NOT NULL DEFAULT ''` ('' = hàng không phải giấy). Cập nhật `docs/DB_SCHEMA.md`.
- UI tiếng Việt; không chữ "cuộn/tờ" làm phân loại dạng.
- Verify: pytest nhắm file + `npx tsc --noEmit -p .`; không chạy `./init.ps1`.

## Review Focus

- Lô giấy cũ `dang_giay` NULL (trước mg 0349): backfill về `don_vi_gia` của mã, khổ giữ nguyên.
- Dòng giấy ĐVT mã chặng `to_nguyen` của lệnh qua cửa kho: vẫn là họ tờ, hệ số 1.
- Mã giấy có `don_vi_gia = 'to'`: hai họ trùng ⇒ danh sách ĐVT không lặp.
- Ngưỡng / giữ chỗ / kỳ tồn dòng cũ: backfill `don_vi_goc` theo đúng luật lô.
- Bảng giá NCC dòng `unit` không đổi về họ nào của mã giấy ⇒ báo lỗi rõ, không lùi hệ số 1.

---

### Task 1: Lõi khoá + đơn vị gốc
- `services/kho_giay.py`: xoá `DANG_*`, `dang_tu_kho`, `la_khoa_to`; `Khoa` 5 phần tử; `khoa_ton(loai, id, *, goc, kho_rong, kho_dai)`; `khoa_dong(loai, id, goc, kr, kd)`; `khoa_ton_cua(obj)` đọc `obj.don_vi_goc`; `dong_giay_theo_dau_vao` bỏ khoá `dang`.
- `services/vat_lieu_kho_service.py`: `dang=` → `goc=`; giấy không truyền `goc` ⇒ danh sách ĐVT là HỢP họ tờ + họ `don_vi_gia`, mỗi dòng mang `goc`; `quy_tu_don_vi` trả `don_vi_goc` theo dòng đơn vị đã chọn; thêm `goc_cua_dvt(loai, id, dvt) -> str`.
- Test: `tests/test_kho_giay.py`, test mới `tests/test_giay_don_vi_goc.py`.

### Task 2: Model + migration 0388
- Thay `dang_giay` bằng `don_vi_goc` ở `stock_lots`, `stock_voucher_lines`, `stock_request_lines`, `lsx_cong_doan_vat_tu`; thêm `don_vi_goc` ở `stock_thresholds`, `kho_ky_ton`, `vat_tu_giu_cho` (+ unique/index); `san_xuat_vat_tu_de_nghi_dong` bỏ `dang_giay`, unique thêm `dvt_goc`; `supplier_items` bỏ `dang_ban`.
- Migration `0388_giay_bo_dang`: thêm cột, backfill raw SQL ('to'→'to', còn lại giấy → `giay_nguyen.don_vi_gia`), dựng lại unique/index, DROP cột cũ. Đọc inspector trước lệnh ghi đầu.
- `docs/DB_SCHEMA.md`.

### Task 3: Kho (repo/service/router/schema + test)
`stock_lot_repo`, `giu_cho_repo`, `stock_voucher_repo`, `stock_request_repo`, `kho_ky_ton_repo`, `stock_voucher_service` (gỡ `bo_sung_dang_kho_lo` → bổ sung KHỔ), `stock_request_service`, `giu_cho_service`, `ton_kho_nhom_service`, `du_bao_ton_service`, routers `kho_voucher`/`kho_request`/`kho_baocao`/`vat_lieu_kho`, `public_scan`, `schemas/stock.py`; test kho.

### Task 4: Mua hàng / NCC
`schemas/purchase.py`, `purchase_repo.items_for_hang`, `purchase_service` (so_gia_ncc, quy_doi_bang_gia, Excel, _dang_ban_dong, _kiem_don_vi_ncc, nhập kho từ dòng mua), `mua_cho.py`, `mach_mua.py`; test `test_ncc_gia_theo_dang` → `test_ncc_gia_theo_kho_don_vi`, `test_purchases_api`.

### Task 5: Kế hoạch vật tư + Sản xuất
`ke_hoach_vat_tu_service` (khoá 5, `cung_kho_khac_don_vi`), `luoi_vat_tu`, `schemas/ke_hoach_vat_tu.py`, `lsx_service`, `san_xuat/{chot_giay,board,vat_tu_de_nghi,vat_tu_nhap_lai,kho}.py`, `gia_cong_ngoai/tron_goi.py`, `san_xuat_san_luong_repo`, schemas `san_xuat`/`lsx`, seed_kh_vat_tu; test MRP/SX.

### Task 6: Frontend
client.ts types + hàm; `lib/khoGiay.ts` (bỏ DangGiay, khoá 5); `KhungKho` bỏ nút dạng; `MaterialCombobox` bỏ `dang`; Mua hàng (NCC bảng giá, yêu cầu, lập đơn, giao hàng, ngăn đơn); Kho (đề nghị, yêu cầu, tồn kho + bỏ hộp "Bổ sung dạng/khổ" → "Bổ sung khổ", báo cáo); SX (lsxBuoc, LsxBuocDrawer, ThsxExecPanels, ThsxChotGiay); MRP LuoiVatTu hiện "cùng khổ khác đơn vị". Sửa luôn 2 lỗi nhìn của form Lập đơn (Tổng bị cắt, nhãn NCC kèm giá).

### Task 7: Kiểm
pytest các file test đã chạm; `npx tsc`; vitest file đã chạm; bấm thử luồng: bảng giá NCC giấy → yêu cầu mua giấy → lập đơn chọn NCC → nhận hàng nhập kho → tồn theo khổ + đơn vị.
