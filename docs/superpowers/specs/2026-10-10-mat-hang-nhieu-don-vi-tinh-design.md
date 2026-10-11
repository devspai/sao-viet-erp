# Giấy và Vật tư khác khai được nhiều đơn vị tính — thiết kế (10/10/2026)

Trạng thái: user chốt hướng + ba điểm 10/10/2026. CHƯA code.
Nền: [giấy bỏ cuộn/tờ](../plans/2026-10-10-giay-bo-cuon-to.md) (mg 0388, cột `don_vi_goc`, khoá tồn 5 phần tử).

## 1. Vấn đề

Mỗi mã ở danh mục Giấy và Vật tư khác chỉ có MỘT ô ĐVT (`don_vi_gia`). Riêng giấy, máy ngầm thêm họ tờ
(tờ, ram) cạnh họ của ô ĐVT, nên:

- ô chọn đơn vị hiện hai chữ "(gốc)" (kg và tờ) khó hiểu;
- giấy khai ĐVT là tờ thì mất luôn kg — trái ví dụ của user (cùng loại giấy, lúc mua theo tờ, lúc mua theo kg);
- vật tư khác không có cách nào mua bằng hai đơn vị không quy đổi được (keo theo kg và theo thùng).

## 2. Luật nghiệp vụ (đã chốt)

1. Một mã khai một DANH SÁCH đơn vị tính, có thứ tự. Dòng đầu là **ĐVT chính**.
2. Mỗi đơn vị khai thêm kéo theo cả NHÓM của nó theo bảng quy đổi ở module Đơn vị & quy đổi
   (khai kg là có g, tấn; khai tờ là có ram). Ô thêm đơn vị **ẩn mọi đơn vị đã nằm trong nhóm của đơn vị
   đã khai** — khai kg rồi thì không thấy g, tấn nữa.
3. Hai đơn vị khai riêng là hai nhóm KHÔNG quy đổi lẫn nhau (như tờ và kg). Máy không tự trừ chéo.
4. **Đơn giá ở danh mục chỉ thuộc ĐVT chính** (Tính giá đang dùng đ/kg + định lượng). Đơn vị thêm sau
   không có ô đơn giá; giá của chúng lấy ở bảng giá nhà cung cấp.
5. **Xoá một đơn vị bị CHẶN** khi nó còn được dùng, kèm câu nói rõ còn gì: "Còn 3.070 tờ tồn ở Kho giấy
   và 1 đơn mua chưa về hết — chưa xoá được đơn vị tờ." Đổi ĐVT chính cũng theo luật này.
6. Vật tư khác áp y như giấy, chỉ không có khổ.

## 3. Hệ quả ở các module

| Chỗ | Hôm nay | Sau khi làm |
|---|---|---|
| Đơn vị gốc của một dòng (`don_vi_goc`) | giấy: họ tờ ⇒ `to`; họ ĐVT danh mục ⇒ ĐVT đó; lạ ⇒ chính mã đó | đơn vị đã khai mà nhóm của nó chứa ĐVT của dòng; không thuộc nhóm nào ⇒ máy chủ CHẶN (422) |
| Ô chọn đơn vị (bảng giá NCC, yêu cầu mua, đơn mua, yêu cầu kho, phiếu kho) | giấy: họ tờ + họ ĐVT; vật tư: một họ | gộp nhóm của mọi đơn vị đã khai, theo thứ tự khai; không còn chữ "(gốc)" khi có từ hai nhóm |
| Tồn kho | giấy tách mã + khổ + đơn vị gốc; vật tư khác gộp theo mã | vật tư khác cũng tách mã + đơn vị gốc; cột ĐVT ở bảng Tồn kho đã có (10/10) |
| Cân đối vật tư | giấy hiện "cùng khổ, khác đơn vị" cạnh nhau | vật tư khác cũng vậy |
| Rẻ nhất / tự gán NCC | cùng khổ + cùng nhóm đơn vị | giữ nguyên, áp cả vật tư khác |
| Tính giá | ĐVT + đơn giá danh mục | không đổi — chỉ đọc ĐVT chính |
| Sản xuất (nhu cầu giấy của bước) | đếm tờ, hoặc kg khi đầu vào là khổ rộng | không đổi cách tính; nhu cầu ra đơn vị mà mã CHƯA khai thì bảng cân đối báo ngay ở dòng đó "Chưa khai đơn vị tờ ở danh mục Giấy", không cho lập mua dòng ấy |

## 4. Dữ liệu

- Thêm `don_vi_them JSON NULL` (mảng mã đơn vị, có thứ tự) vào `giay_nguyen` và `vat_tu_in_an`. Không đẻ
  bảng mới: danh sách ngắn, chỉ đọc cùng bản ghi (cùng kiểu `thay_the_ids`). `don_vi_gia` giữ nguyên vai
  ĐVT chính + đơn vị của `don_gia`.
- `vat_tu_in_an` dùng chung cho Thành phẩm: cột có mặt nhưng màn Thành phẩm KHÔNG hiện ô này (thành phẩm
  vẫn một đơn vị).
- `giay_gia_version` không chụp `don_vi_them` — phiên bản là lịch sử GIÁ, mà đơn vị thêm không có giá.
- Migration `0389_mat_hang_don_vi_them` (raw SQL, đọc cột trước lệnh ghi đầu):
  1. backfill `don_vi_them` = các `don_vi_goc` KHÁC ĐVT chính đang có thật ở `stock_lots`,
     `supplier_items` (quy về gốc), `stock_request_lines`, dòng đơn mua — để không dòng cũ nào rơi vào
     "đơn vị chưa khai". Trên DB dev: 8 mã giấy đều ĐVT chính kg, lô cũ đếm tờ ⇒ giấy nhận thêm `["to"]`;
  2. backfill `don_vi_goc` cho dòng VẬT TƯ KHÁC ở các bảng đã có cột (mg 0388) = `lower(don_vi_gia)` của mã;
  3. dựng lại chỉ mục/unique có `don_vi_goc` để khoá vật tư khác đủ 5 phần (pg drop cả CONSTRAINT lẫn INDEX).
- `docs/DB_SCHEMA.md` ghi hai cột mới.

## 5. Máy chủ

- `kho_giay.GocGiay` → thay bằng lớp chung (vd. `services/don_vi_mat_hang.py`) `goc(hang, dvt) -> str | None`
  đọc danh sách đã khai; dùng cho cả giấy lẫn vật tư khác. Bỏ luật ngầm "giấy luôn có họ tờ".
- `vat_lieu_kho_service.don_vi_cua_mat_hang` trả `ds` gộp nhóm của mọi đơn vị đã khai, mỗi dòng mang `goc`.
- Khoá tồn hàng khác giấy từ `(loai, id)` thành `(loai, id, 0, 0, goc)` — chỗ ảnh hưởng rộng nhất (mọi
  nơi đang dùng khoá 2 phần: `stock_lot_repo`, `ton_kho_nhom_service`, giữ chỗ, kỳ tồn, cân đối, mua hàng).
- Sửa danh mục: kiểm luật §2.2 (đơn vị thêm không được cùng nhóm đơn vị đã khai — 422 "ram đã nằm trong
  nhóm của tờ") và §2.5 (đếm tồn, đơn mua/yêu cầu chưa xong, dòng bảng giá NCC đang dùng đơn vị bị xoá).
- Excel danh mục (`catalog_excel_specs`): thêm cột "ĐVT thêm" (mã cách nhau bằng dấu phẩy trong ô Excel).
- Nhật ký danh mục ghi thay đổi `don_vi_them` (nhãn ở `audit_registry.py`).

## 6. Giao diện

- Form danh mục Giấy / Vật tư khác: ô ĐVT thành danh sách — dòng ĐVT chính (cạnh ô Đơn giá như hôm nay)
  + các thẻ đơn vị thêm có nút xoá + "Thêm đơn vị" thả danh sách đã lọc theo §2.2. Dưới mỗi đơn vị ghi
  nhóm nó kéo theo ("gồm g, tấn"). Theo luật làm UI: vẽ 3 phương án HTML để chọn trước khi code.
- Lưới danh mục: cột ĐVT hiện ĐVT chính + đơn vị thêm dạng thẻ nhỏ, không nối bằng dấu phẩy.
- Mọi ô chọn đơn vị: danh sách đã gộp ở máy chủ, không chữ "(gốc)" khi có từ hai nhóm (giấy đã bỏ 10/10).

## 7. Ngoài phạm vi

Thành phẩm, khuôn; quy đổi riêng theo mã ("1 thùng keo này = 20 kg") — module Đơn vị đã gỡ quy đổi động,
thùng và kg là hai nhóm.

## 8. Việc tiếp

Viết plan (chạm > 5 module) → 3 phương án HTML cho form danh mục → code → bấm thử luồng: khai thêm đơn vị
→ bảng giá NCC → yêu cầu mua → đơn mua → nhập kho → tồn tách dòng → thử xoá đơn vị đang có tồn bị chặn.
