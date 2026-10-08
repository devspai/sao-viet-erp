# Yêu cầu mua hàng: ba loại mua

07/10/2026. Bản bàn thiết kế, CHƯA code. Đi cùng mockup lập một đơn từ nhiều yêu cầu
(`docs/mockups/mua-hang-lap-don-tu-nhieu-yeu-cau.html`).

## 1. Hiện trạng (đã rà code FE + BE)

- Yêu cầu mua (`department_purchase_requests`) KHÔNG có cột nào ghi loại mua.
- `source_type` là PHÒNG BAN của người lập. Máy chủ ghi đè bằng `_source_type_for_actor`
  (`purchase_service.py:1796`), giá trị client gửi bị bỏ, không logic nào rẽ nhánh theo nó.
- Ba lối tạo yêu cầu đều đi qua MỘT form (`RequestFormDrawer`) và MỘT endpoint
  `POST /api/department-purchase-requests`:
  - Form gõ tay ở màn Yêu cầu mua hàng: không lệnh, không nguồn.
  - Kế hoạch vật tư › Đề nghị mua: mở form điền sẵn, gửi kèm `nguon_lenh` + `related_document_code`
    (mã lệnh). Đây là dấu hiệu duy nhất của "mua cho LSX".
  - Tồn kho › Tạo yêu cầu mua: mở form điền sẵn nội dung "Bổ sung tồn <tên kho> dưới mức tối thiểu".
    Khác form tay đúng ở câu chữ đó.
- Hàng về: chỉ yêu cầu có `nguon_lenh` mới sinh "phần đặt cho lệnh" (`mach_mua.py`); mọi thứ khác là
  hàng chung, nhập kho thành tồn tự do.
- Lỗi đang có: lưới Kế hoạch vật tư đưa mọi yêu cầu không gắn lệnh mà mặt hàng không còn lệnh nào
  thiếu vào danh sách "nên huỷ" (`luoi_vat_tu.py:321-326`). Yêu cầu bổ sung tồn bị gợi ý huỷ oan.
- Sửa yêu cầu giữ nguyên nguồn lệnh, chỉ thay dòng hàng.

## 2. Ba loại

| Loại | Nhãn UI | Lập từ đâu | Hàng về đi đâu |
|---|---|---|---|
| `theo_yeu_cau` | Theo yêu cầu | Form gõ tay (mặc định) | Hàng chung, tồn tự do |
| `cho_lsx` | Cho lệnh SX | CHỈ Kế hoạch vật tư › Đề nghị mua | Phần đặt cho lệnh giữ đúng ô; phần dư là hàng chung (luật một ô một phiếu, không đổi) |
| `mua_ton` | Mua tồn | Tồn kho › Tạo yêu cầu mua, hoặc form gõ tay chọn loại này | Hàng chung, tồn tự do |

Luật:
1. Loại là của CẢ yêu cầu, chốt lúc lập. Một yêu cầu không trộn dòng cho lệnh với dòng mua tồn.
2. Máy chủ chốt loại, không tin client: có `nguon_lenh` ⇒ `cho_lsx`; gửi `cho_lsx` mà không có nguồn
   lệnh ⇒ 422 "Mua cho lệnh thì lập từ Kế hoạch vật tư". Còn lại nhận `theo_yeu_cau` hoặc `mua_ton`,
   thiếu thì `theo_yeu_cau`.
3. Form gõ tay có ô chọn hai giá trị Theo yêu cầu, Mua tồn. Lối từ Tồn kho mở sẵn Mua tồn. Lối từ Kế
   hoạch vật tư hiện chữ "Cho lệnh SX" kèm mã lệnh, không đổi được.
4. Sửa yêu cầu đang Chờ lập đơn: đổi qua lại Theo yêu cầu ↔ Mua tồn được; không đổi sang hoặc ra khỏi
   Cho lệnh SX.
5. "Nên huỷ" trên lưới Kế hoạch vật tư chỉ xét yêu cầu `cho_lsx`.
6. Lập đơn mua: một đơn được gom món của nhiều yêu cầu, KHÁC LOẠI cũng được (đơn là theo nhà cung
   cấp). Mỗi dòng đơn trỏ đúng một món yêu cầu nên loại và lệnh đi theo dòng; phần đặt cho lệnh tính
   theo dòng như hiện nay.

## 3. Giao diện: cột "Mua cho" ở MỌI chỗ hiện món, yêu cầu, đơn

Một cột "Mua cho", nói loại và đích trong một ô. Ba dạng:
- Cho lệnh SX: mã lệnh hoặc mã bài ghép, bấm mở lệnh. Một món phục vụ nhiều lệnh thì hiện mã đầu +
  "+2", trỏ chuột (hoặc mở ngăn) thấy từng lệnh kèm số đặt cho lệnh đó, ví dụ LSX26-0003 32 bản,
  LSX26-0004 8 bản.
- Mua tồn: `Tồn kho`.
- Theo yêu cầu: chữ `Theo yêu cầu`. Bộ phận đã xin nằm ở cột Bộ phận hoặc chú thích mã yêu cầu,
  không lặp lại ở đây.

Mockup chốt (phương án 1): `docs/mockups/mua-hang-ba-loai-va-lap-don-gop.html`.

| Màn | Cấp | Ô "Mua cho" lấy từ |
|---|---|---|
| Yêu cầu chờ xử lý › Từng món | món | lệnh của đúng món đó (nguồn lệnh khớp mặt hàng + khổ của dòng) |
| Yêu cầu chờ xử lý › Yêu cầu, màn Yêu cầu mua hàng | yêu cầu | gộp lệnh của mọi món |
| Ngăn chi tiết yêu cầu, tab món | món | như Từng món |
| Form lập đơn mua | dòng đơn | theo món yêu cầu mà dòng trỏ tới |
| Mua hàng › Đơn mua hàng, Kế toán đơn mua | đơn | gộp các dòng; đơn trộn cho lệnh với tồn kho thì hiện cả hai |
| Ngăn đơn mua, tab Mặt hàng | dòng đơn | như form lập đơn |

Tag mã lệnh đang nằm trong cột Nội dung chuyển sang cột này, không nói hai lần.
Thanh Lọc thêm "Mua cho": Cho lệnh SX, Tồn kho, Theo yêu cầu, và ô tìm theo mã lệnh. Lọc ở máy chủ.

Máy chủ trả cho mỗi món, mỗi dòng đơn một danh sách `mua_cho`:
`[{lsx_id | bai_ghep_id, ma, so_luong}]` (rỗng với tồn kho và theo yêu cầu) cùng `loai_mua`.

## 4. Máy chủ

- Cột mới `department_purchase_requests.loai_mua` `String(16)` NOT NULL, server_default
  `'theo_yeu_cau'`, có index. Migration: thêm cột rồi backfill bằng SQL thô — có `yeu_cau_mua_nguon_lenh`
  ⇒ `cho_lsx`; nội dung bắt đầu "Bổ sung tồn" ⇒ `mua_ton`. Ghi `docs/DB_SCHEMA.md`.
- Schema vào: `loai_mua` tuỳ chọn. Schema ra: `loai_mua` ở `DepartmentPurchaseRequestOut`,
  `YeuCauMonOut` (kèm `related_document_code`), `PurchaseRequestSourceOut`.
- Bộ lọc `loai_mua` ở `GET /department-purchase-requests` và `/mon`.
- `luoi_vat_tu.py`: lọc "nên huỷ" theo `cho_lsx`.

## 5. Kiểm

- Test máy chủ: lập ba lối ra đúng loại; `cho_lsx` thiếu nguồn ⇒ 422; client gửi `mua_ton` kèm nguồn
  lệnh ⇒ vẫn `cho_lsx`; sửa đổi loại; lọc; yêu cầu mua tồn không vào "nên huỷ"; một đơn gom yêu cầu
  hai loại.
- Bấm thử trên trình duyệt đủ ba lối tạo, lọc theo loại, lập một đơn từ yêu cầu khác loại.

## 6. Chưa chốt

- Hàng Theo yêu cầu khi về có giữ riêng cho bộ phận đã xin không. Bản này để là hàng chung như hiện
  nay (máy chỉ ghi nhận; kho tự cấp theo yêu cầu xuất).
