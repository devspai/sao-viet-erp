# Khách hàng + ghi chú chọn ở Phiếu tính giá, Báo giá kế thừa chỉ đọc

Mockup đã duyệt (phương án B): `docs/mockups/bao-gia-ke-thua-tu-ptg.html`. Chủ dự án chốt 04/10/2026.

## Luật nghiệp vụ

- Khách hàng, địa chỉ giao, người nhận, ghi chú nội bộ được CHỌN Ở PHIẾU TÍNH GIÁ. Báo giá lập từ phiếu
  chép bốn thứ đó và KHÔNG sửa được ở báo giá (máy chủ từ chối, không chỉ ẩn ô).
- Phiếu chưa có khách thì không lập được báo giá (nút khoá + máy chủ 422).
- Phiếu đổi khách/địa chỉ/người nhận/ghi chú ⇒ mọi báo giá NHÁP của phiếu cập nhật theo ngay. Báo giá đã
  qua Nháp giữ nguyên (đã/đang gửi khách với thông tin đó). Tạo phiên bản mới (sau khi bị từ chối) và
  "Đồng bộ từ phiếu" lấy lại thông tin mới nhất.
- Ghi chú phiếu THAY ô "Ghi chú nội bộ" riêng của báo giá (báo giá hiện ghi chú kế thừa).
- Danh sách khách để chọn ở phiếu = khách trong phạm vi Khách hàng của người thao tác (gồm nhóm dùng chung).
  Máy chủ kiểm lại khách gửi lên có trong phạm vi đó không.
- Tạo báo giá kiểm người bấm có thấy phiếu tính giá đó không (vá lỗ hổng: trước đây ai có quyền Tạo báo giá
  cũng tạo được từ phiếu của người khác bằng cách gọi thẳng API).
- Danh sách Phiếu tính giá có thêm cột Khách hàng và Ghi chú; ô tìm kiếm tìm cả tên khách.

## Dữ liệu

`phieu_tinh_gia` thêm: `customer_id` (soft → customers.id, index), `delivery_address`, `contact_name_snapshot`,
`contact_phone_snapshot`, `contact_title_snapshot`, `contact_email_snapshot` — cùng khuôn với `quotes`.
`ghi_chu` đã có sẵn. Migration 0363: thêm cột + backfill từ báo giá mới nhất của phiếu (raw SQL).

## Việc

1. Test máy chủ `backend/tests/test_khach_hang_o_ptg.py` (đỏ trước).
2. Model + migration 0363 + DB_SCHEMA.md.
3. Schema + router phiếu: POST nhận khách; `PATCH /phieu-tinh-gia/{id}/khach-hang` (quyền Sửa tính giá,
   không cần Xem chi tiết giá vốn, không tính lại giá); GET/list trả tên khách; list tìm theo tên khách.
4. Service báo giá: tạo từ phiếu chép khách + ghi chú, kiểm phạm vi phiếu, 422 khi phiếu chưa có khách;
   update từ chối đổi các ô kế thừa; requote + resync lấy lại từ phiếu; hàm đồng bộ nháp khi phiếu đổi.
5. Sửa test cũ tạo báo giá không có khách (seed khách vào phiếu).
6. FE client.ts, PhieuTinhGiaDetailView (dải 4 ô), PhieuTinhGiaListView (cột Khách hàng + Ghi chú),
   BaoGiaPage (dải chỉ đọc, ô Markup/Giá bán/Chiết khấu mới, bỏ cột Thành tiền khi không chiết khấu, bỏ hàng
   Tổng N dòng, bỏ thẻ Khách hàng và ô ghi chú nội bộ riêng).
7. Verify: pytest nhắm file, `npx tsc --noEmit`, thao tác thật trên dev-browser trọn luồng.
