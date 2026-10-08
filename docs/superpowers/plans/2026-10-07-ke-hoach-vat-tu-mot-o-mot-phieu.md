# Kế hoạch vật tư: một ô một phiếu + lưới bảng tính — kế hoạch làm

Spec: `docs/spec-ke-hoach-vat-tu-mot-o-mot-phieu.md`. Mockup: `docs/mockups/ke-hoach-vat-tu-mot-o-mot-phieu.html`.
User nói "làm đi" 07/10/2026.

## Quyết định khi làm (ngoài spec)

- Công tắc giữ chỗ theo lệnh (`giu_cho_bat`) GIỮ NGUYÊN. Lệnh chưa bật thì dòng ở tình trạng
  "Chưa giữ" (hàng có nhưng chưa giữ) — thêm tình trạng thứ 6. Dòng không quy đổi được đơn vị là
  "Chưa tính được" — thứ 7. Nút "Giữ hàng" ở dòng nhóm lệnh và ở ngăn lệnh.
- Liên kết yêu cầu ↔ lệnh (`yeu_cau_mua_nguon_lenh`) thêm `kho_rong`, `kho_dai`, `so_luong` (đơn
  vị gốc) — "phần đặt cho lệnh" cần số của từng ô khi một dòng yêu cầu gộp nhiều lệnh. Liên kết cũ
  `so_luong` NULL ⇒ coi bằng số cần hiện tại của ô.
- Thứ tự giữ của một ô: phần đặt cho nó trên đơn đang về → tồn tự do → phần dư đang về (sớm trước).
- Endpoint cũ `/can-doi`, `/theo-lenh` để nguyên (test + chỗ khác còn gọi); màn mới đọc `/luoi`.

## Việc

1. [x] Migration + model + DB_SCHEMA: 3 cột mới của `yeu_cau_mua_nguon_lenh`.
2. [x] `services/mach_mua.py` (thuần hàm): dựng mạch phiếu từ dòng yêu cầu + dòng đơn; bước;
       sống/xong; chọn phiếu của ô, phiếu trùng; chia phần đặt cho lệnh trên từng dòng đơn.
3. [x] Repo: đọc liên kết sống + dòng đơn theo `department_request_line_id`.
4. [x] `can_doi`: con trỏ dùng phần đặt cho ô trước, hàng đang về chung chỉ là phần dư.
5. [x] Giữ chỗ: `_lo_dang_ve` tách phần đặt/phần dư; `nhat_them` theo thứ tự mới; bỏ `xep_som_nhat`.
6. [x] Bỏ `xep_som_nhat` ở `xep_lich/release.py`, `lsx_tong_quan.py`, schema, client.ts.
7. [x] Đề nghị mua: `gom_de_nghi` chặn ô có phiếu sống, mang `so_luong` + khổ; tạo yêu cầu chặn ô có phiếu.
8. [x] Router `/luoi`, `/luoi/lenh`, `/luoi/hang` + schema.
9. [x] Test backend nhắm file.
10. [x] FE: client.ts kiểu mới; màn lưới + 2 ngăn; gỡ `VatTuKeHoachView`, `GiuChoTheoLenhView`.
11. [x] `npx tsc`, vitest nhắm file.
12. [x] Bấm thử thật: Đề nghị mua → lập yêu cầu → dòng sang Đang mua, nút mất; Giữ hàng; Nhả; Huỷ phiếu trùng.
13. [x] Cập nhật spec + memory.
