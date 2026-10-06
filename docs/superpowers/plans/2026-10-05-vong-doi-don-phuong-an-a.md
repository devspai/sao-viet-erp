# Vòng đời đơn — phương án A (thanh chặng + "việc tiếp theo")

Chốt 05/10/2026. Mockup: https://claude.ai/artifact/BWh7FDSa1audxpMmXNaV2z (phương án A).
Chỉ đụng FE: `frontend/src/pages/DonHangBanPage.tsx` (khối "Vòng đời đơn"), `giao-hang/tien-do-don/TienDoDon.tsx`,
`don-hang-ban.css`. Máy chủ KHÔNG đổi — mọi số đã có trong `GET /api/orders/{id}/tien-do`.

## Luật nghiệp vụ (giữ nguyên)

- Năm chặng: Chốt → Cọc → Sản xuất → Giao → Hóa đơn.
- Sản xuất = chạy công đoạn → KCS đạt → kho nhận. Nhập kho là khâu CUỐI của sản xuất, không phải chặng riêng.
  Sản xuất chỉ "xong" khi mọi món đã đủ trong kho (`tomTatTienDo().khoXong` + lệnh xong hết, như hiện tại).
- Món không qua xưởng (không lệnh) thì sản xuất của món đó = tồn kho gánh đủ.

## Thanh chặng

Ô chặng kiểu mũi tên, ba trạng thái: xong (xanh rêu) / đang (đậm) / dở dang song song (xám — Giao khi đã giao một
phần trong lúc SX chưa xong) / chưa tới. Chữ phụ dưới tên chặng:

| Chặng | Chữ phụ |
|---|---|
| Chốt | ngày chốt / "chưa chốt" |
| Cọc | "không cần" / "đủ dd/mm" / "thiếu X" |
| Sản xuất | "chờ lệnh" / "kho đủ a/b món" / "xong" / "a món chưa có nguồn" (chỉ sau khi Kế hoạch đã lên lệnh) |
| Giao | "hạn dd/mm" khi chưa giao gì / "a/b món" / "đã giao đủ" |
| Hóa đơn | chưa / một phần / đủ |

Bấm ô chặng = chọn chặng để xem khung bên dưới (giữ hành vi hiện tại). Điện thoại: ẩn chữ phụ.
Bỏ dòng "read-only · bấm chọn từng bước để xem chi tiết".

## Khung dưới thanh

Đầu khung luôn là MỘT câu "việc tiếp theo" + thẻ nhỏ (không nối bằng dấu ·) + một nút/link, suy theo thứ tự:

1. Nháp → "Chốt đơn" (nút chốt như cũ).
2. Chờ cọc → "Kế toán thu cọc, còn thiếu X".
3. Có món chưa có lệnh → "Chờ Kế hoạch lên lệnh sản xuất"; thẻ: chuyển xuống lúc (`san_xuat_released_at`),
   "đơn gấp" (`is_rush`), "còn N ngày tới hạn giao"; nút "Mở Kế hoạch SX".
4. Có món `cho_kho > 0` → "Kho chưa nhận N {đv} {món} KCS đã gửi"; link mở màn Kho.
5. Lệnh chưa xuống xưởng → "LSX-… chưa xuống xưởng".
6. Lệnh đang chạy → "Xưởng đang chạy LSX-… (đang {bước})"; thẻ "dự kiến xong dd/mm", "kịp hạn" / "trễ N ngày" (đỏ).
7. Sản xuất xong, chưa giao đủ → "Lập yêu cầu giao — giao được ngay N".
8. Giao đủ, hóa đơn chưa đủ → "Kế toán ghi hóa đơn".

Banner trễ (`CanhBaoTre`) chỉ hiện khi trễ thật; "chưa ước được ngày xong" chuyển thành thẻ nhỏ.

Chặng Sản xuất: dưới câu trên, mỗi món một khối, tên + thẻ (mã lệnh, công đoạn đang làm, số đặt) và ba thanh:

| Thanh | Số | Nguồn |
|---|---|---|
| Công đoạn | % | bình quân `lenh[].pct` của món; "chưa có lệnh" / "chưa xuống xưởng" |
| KCS đạt | số lượng | `kho_de_nghi` (KCS đã gửi kho) |
| Kho nhận | nhận / đặt | `kho_da_nhan`, đoạn sọc = `cho_kho` (gửi mà kho chưa nhận) |

Món không lệnh: không vẽ ba thanh, chỉ thẻ "không qua xưởng, lấy từ tồn kho" + chip "đủ trong kho" hoặc
"thiếu N" (thiếu chỉ báo khi Kế hoạch đã bắt đầu lên lệnh, như luật `baoThieuNguon` hiện tại).

Bỏ: chú giải 5 màu và thanh chồng 5 khúc ở chặng Sản xuất (`BangCum buoc="sanxuat"`). Chặng Giao giữ
`BuocGiaoHang` như cũ. Chặng Chốt / Cọc / Hóa đơn giữ nội dung cũ, chỉ thêm câu "việc tiếp theo" ở đầu.

## Chưa làm (không có số ở máy chủ)

Giờ KCS gửi kho / giờ kho nhận (mockup có "KCS gửi 14:20 06/10") — bỏ khỏi bản đầu, cần thì thêm vào `tien-do` sau.
