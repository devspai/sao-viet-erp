# Làm lại module Tài sản & Công cụ dụng cụ — thiết kế

Ngày: 05/10/2026. Thay cho `2026-09-07-quan-ly-tai-san-ccdc-design.md` (bản đó còn kỳ chốt, ghi giảm,
kiểm kê — đã bỏ từ 08/09, nay lỗi thời).

## 1. Mục tiêu

Đơn giản, dễ hiểu, dễ dùng, dễ thao tác — cho cả người không phải kế toán. Mỗi thay đổi dưới đây
phải trả lời được "nó làm màn dễ hơn ở chỗ nào". Cách dùng từ là một phần của thiết kế, không phải
việc trang trí sau.

Phạm vi giữ như chủ chốt 08/09: **module chỉ theo dõi khấu hao**. Không định khoản, không khoá kỳ,
không kiểm kê, không tem QR. Đầu ra cho kế toán vẫn là file Excel khấu hao tháng.

## 2. Giữ nguyên

- Engine `services/tai_san/khau_hao.py`: đường thẳng, chia theo ngày ở tháng đầu và tháng thôi dùng,
  kỳ cuối trích nốt phần lẻ, không trừ giá trị thu hồi. Đúng TT 45/2013 (còn hiệu lực 2026; TT 30/2025
  chỉ sửa cho doanh nghiệp nhà nước).
- Bốn bảng `tai_san`, `tai_san_chi_phi`, `tai_san_moc`, `tai_san_bien_dong`; lũy kế tính lại mỗi lần,
  không lưu.
- Chuyển bộ phận và Sửa chữa lớn: luật tính giữ nguyên, chỉ đổi chữ và chỗ đặt nút.
- File Excel xuất: giữ tiêu đề chuẩn kế toán (Nguyên giá, Lũy kế, Còn lại…) để kế toán nhập vào phần
  mềm kế toán không lệch.
- Quyền: module `tai_san`, không phạm vi (`SCOPELESS_MODULES`).

## 3. Cách dùng từ

Bốn quy tắc:

1. Một khái niệm một từ. Dùng "khấu hao", bỏ hẳn "hao mòn" trên màn.
2. Không viết tắt TSCĐ / CCDC trên màn (tên file, mã `TS-`/`CC-` thì giữ).
3. Nút là động từ đời thường.
4. Thuật ngữ kế toán chỉ giữ trong file Excel xuất.

| Chỗ | Cũ | Mới |
|---|---|---|
| Mô tả màn | Sổ những thứ xưởng mua về dùng nhiều năm… Ghi tăng một lần rồi mỗi tháng trích một phần vào chi phí. | Máy móc và dụng cụ xưởng mua về dùng nhiều năm. Nhập một lần, phần mềm tự chia giá mua ra từng tháng. |
| Tab | Danh sách / Bảng khấu hao tháng | Tài sản / Khấu hao từng tháng |
| Nút chính | Ghi tăng | Thêm tài sản |
| Nhập máy cũ | ô tích "Số dư đầu kỳ" trong form | nút riêng **Thêm tài sản đang dùng** |
| Loại | TSCĐ / CCDC | Tài sản cố định / Công cụ dụng cụ |
| Cột tiền | Nguyên giá / Đã hao mòn / Còn lại | Giá mua / Đã khấu hao / Giá trị còn lại |
| Ô form | Số tháng | Khấu hao trong (tháng) |
| | Ngày đưa vào sử dụng | Bắt đầu dùng từ ngày |
| | Bộ phận sử dụng / Người quản lý | Bộ phận dùng / Người giữ |
| | Số hóa đơn | Số hoá đơn mua |
| | Hao mòn lũy kế / Số tháng đã trích | Đã khấu hao trước đó (đồng) / Đã khấu hao mấy tháng |
| | Bắt đầu tính trên phần mềm từ | Tính tiếp trên phần mềm từ tháng |
| Thao tác | biểu tượng "Biến động" | Chuyển bộ phận / Sửa chữa lớn / Thôi dùng |
| Trạng thái | Đang dùng | Đang dùng / Đã thôi dùng |
| Bộ lọc | Mọi trạng thái | Đang dùng (mặc định) / Đã thôi dùng / Tất cả |

Câu nhắc tại chỗ (chép nguyên văn khi làm):

- Ô Giá mua: "Cộng cả vận chuyển, lắp đặt, chạy thử."
- Ô Khấu hao trong, loại Tài sản cố định: "Máy ngành in thường 84–180 tháng (7–15 năm)."
- Ô Khấu hao trong, loại Công cụ dụng cụ: "Tối đa 36 tháng."
- Lệch luật 30 triệu: "Từ 30 triệu trở lên, luật tính là tài sản cố định." / "Dưới 30 triệu, luật tính
  là công cụ dụng cụ." — chỉ nhắc, không chặn.
- Sửa chữa lớn: "Chỉ nhập khi sửa làm máy tốt hơn hoặc dùng được lâu hơn. Sửa vặt hằng ngày không nhập
  ở đây."
- Hộp xác nhận Xoá: "Chỉ dùng khi nhập nhầm. Máy đã bán hay hỏng thì bấm Thôi dùng để giữ lịch sử."
- Màn trống: "Chưa có tài sản nào. Máy mới mua thì bấm Thêm tài sản; máy đã chạy từ trước thì bấm
  Thêm tài sản đang dùng."
- Ô Giá trị còn lại khi bằng 0 mà vẫn đang dùng: hiện chữ "Đã khấu hao hết" thay cho "0 đ".

## 4. Tab Tài sản

- Thanh trên: ô tìm "Tìm theo mã hoặc tên…", lọc Loại, lọc Bộ phận, lọc Trạng thái (mặc định Đang dùng),
  hai nút **Thêm tài sản đang dùng** (nút phụ) và **Thêm tài sản** (nút chính).
- Cột: Mã, Tên, Loại, Bộ phận, Giá mua, Đã khấu hao, Giá trị còn lại, Trạng thái. Bỏ cột Thao tác.
- Bấm vào dòng → mở ngăn chi tiết. Mọi thao tác nằm trong ngăn này, xếp theo mức hay dùng:
  **Sửa**, **Chuyển bộ phận**, **Sửa chữa lớn**, **Thêm cái giống thế này**, **Thôi dùng**; cuối ngăn
  là **Xoá** dạng chữ nhỏ. Lý do: năm sáu thao tác không nhét vừa một dòng bảng; dồn vào ngăn thì bảng
  sạch, và người dùng xem số trước rồi mới quyết định làm gì.
- Ngăn chi tiết có: thông tin chính, lịch khấu hao trọn đời (đã có `/du-kien`), và lịch sử (thêm,
  chuyển bộ phận, sửa chữa lớn, thôi dùng) theo thời gian.
- Chân bảng `PhanTrangDayDu`, lọc và phân trang ở máy chủ.

## 5. Thêm tài sản (máy mới mua)

Ngăn bên phải, sáu ô theo thứ tự người ta nghĩ:

1. **Tên** — gợi ý "Máy in Komori 4 màu".
2. **Giá mua**.
3. **Loại** — tự chọn theo Giá mua (≥ 30 triệu → Tài sản cố định, < 30 triệu → Công cụ dụng cụ) cho tới
   khi người dùng tự bấm đổi; sau đó không tự đổi nữa. Lệch luật thì hiện câu nhắc ở mục 3.
4. **Khấu hao trong (tháng)** — câu nhắc theo loại.
5. **Bắt đầu dùng từ ngày** — mặc định hôm nay.
6. **Bộ phận dùng** và **Người giữ** (người giữ lọc theo bộ phận, như hiện nay).

Công cụ dụng cụ: ô Giá mua đổi thành hai ô **Số lượng** và **Giá một cái**, kèm dòng "Tổng: …".

Mục gấp **Thêm chi tiết**: bảng chi phí cấu thành giá mua (khi có, Giá mua = tổng các dòng, ô Giá mua
khoá lại), Số hoá đơn mua, Ghi chú.

Dưới form, một dòng xem trước tính ngay trên trình duyệt bằng đúng phép chia của engine:
"Mỗi tháng khoảng 8.333.000 đ, khấu hao hết vào tháng 09/2036." Tháng đầu lẻ ngày thì thêm
"Tháng đầu chỉ tính từ ngày 12."

Nút lưu: **Lưu tài sản**.

## 6. Thêm cái giống thế này

Trong ngăn chi tiết. Mở form Thêm tài sản với Loại, Khấu hao trong, Bộ phận dùng, Người giữ chép sẵn;
Tên để trống con trỏ đặt sẵn, Giá mua để trống. Thay cho một danh mục "nhóm tài sản" — xưởng chỉ có
vài chục tài sản, thêm danh mục là thêm một màn phải khai.

## 7. Thêm tài sản đang dùng (máy đã chạy trước khi dùng phần mềm)

Hai cách, cùng một nút mở ra:

**Từng cái.** Các ô: Tên, Giá mua, Loại, Khấu hao trong (tháng), Bắt đầu dùng từ ngày, Bộ phận dùng,
Người giữ, và khối "Đã khấu hao tới lúc này":

- **Tính tiếp trên phần mềm từ tháng** — mặc định tháng hiện tại; nhớ giá trị vừa chọn cho lần thêm sau
  trong cùng phiên.
- **Đã khấu hao mấy tháng** — tự điền = số tháng từ Bắt đầu dùng tới tháng trên, sửa được.
- **Đã khấu hao trước đó (đồng)** — tự điền = Giá mua × số tháng ÷ Khấu hao trong (làm tròn xuống), sửa
  được; câu nhắc "Có sổ cũ thì gõ đúng số trên sổ."

**Từ file Excel.** Dùng `ImportExcelDialog` có sẵn (chọn file → xem trước → Xác nhận nhập), có nút tải
file mẫu. Cột file mẫu: Tên, Loại, Giá mua, Số lượng, Khấu hao trong (tháng), Bắt đầu dùng từ ngày,
Đã khấu hao mấy tháng, Đã khấu hao trước đó, Bộ phận. "Tính tiếp trên phần mềm từ tháng" chọn một lần
trong hộp, áp cho cả file. (Khi làm: cột "Tính tiếp trên phần mềm từ tháng" nằm TRONG file, bỏ trống =
tháng hiện tại — `ImportExcelDialog` dùng chung không có chỗ chọn tháng.) Dòng sai thì báo theo số dòng, không ghi dòng nào cho tới khi xác nhận.

**Máy đã khấu hao hết mà vẫn chạy** phải nhập được — ngày đầu sẽ có nhiều máy như vậy. Hiện máy chủ
chặn (`nap_dau_ky`: hao mòn phải < nguyên giá, tháng đã trích phải < số tháng). Đổi luật: cho phép
bằng; khi đó mốc có cơ sở trích 0, số tháng còn 0, engine không trích tháng nào. Ô Giá trị còn lại hiện
"Đã khấu hao hết".

## 8. Chuyển bộ phận, Sửa chữa lớn

Giữ luật hiện tại. Tách hộp "Biến động" thành hai hộp riêng, mỗi hộp mở từ nút của nó:

- **Chuyển bộ phận**: Ngày chuyển, Sang bộ phận, Người giữ mới, Lý do. Không đụng số.
- **Sửa chữa lớn**: Ngày xong, Tiền sửa, Dùng thêm được bao nhiêu tháng nữa, Lý do. Câu nhắc ở mục 3.
  Xem trước: "Từ tháng 11/2026 mỗi tháng khoảng … đ."

## 9. Thôi dùng (mới)

Hộp **Thôi dùng**: Lý do (Bán / Thanh lý / Hỏng / Mất — chọn một), Ngày thôi dùng (mặc định hôm nay),
Ghi chú. Câu xác nhận: "Từ ngày này phần mềm ngừng khấu hao <tên>. Tài sản vẫn còn để xem lại."

Máy chủ: `POST /api/tai-san/{id}/thoi-dung`.

- Tạo một dòng `tai_san_bien_dong` loại `thoi_dung`, lưu lý do vào cột mới `kieu_thoi_dung`
  (`ban` | `thanh_ly` | `hong` | `mat`) và ghi chú vào `ly_do`.
- Đặt `tai_san.trang_thai = 'da_giam'`, `ngay_giam = ngày`. Engine đã đọc sẵn hai cột này (chia theo
  ngày ở tháng thôi dùng, các tháng sau không trích) — không sửa engine.
- Chặn: ngày thôi dùng trước ngày bắt đầu dùng hoặc trước chứng từ biến động mới nhất; tài sản đã thôi
  dùng.

**Bỏ thôi dùng** (cho trường hợp bấm nhầm): nút trong ngăn chi tiết của tài sản đã thôi dùng.
`DELETE /api/tai-san/{id}/thoi-dung` xoá dòng biến động đó, trả `trang_thai = 'dang_dung'`,
`ngay_giam = NULL`.

Tài sản đã thôi dùng: không Sửa ô ảnh hưởng số, không Chuyển bộ phận, không Sửa chữa lớn.

## 10. Xoá

Giữ endpoint `DELETE /api/tai-san/{id}`, nhưng chỉ cho tài sản **chưa có** dòng biến động nào (đúng
nghĩa "nhập nhầm"). Đã có chuyển bộ phận / sửa chữa lớn / thôi dùng thì báo: "Tài sản đã có lịch sử,
không xoá được. Máy đã bán hay hỏng thì bấm Thôi dùng."

## 11. Tab Khấu hao từng tháng

- Đổi chữ theo mục 3. Cột trên màn: Mã, Tên, Bộ phận, Giá mua, Khấu hao tháng này, Đã khấu hao, Giá trị
  còn lại, Ghi chú tháng.
- Chip trong cột Ghi chú tháng, viết thành câu ngắn: "Tháng đầu, tính từ ngày 12", "Tháng cuối",
  "Chuyển từ <bộ phận cũ>", "Sửa chữa lớn", "Thôi dùng từ ngày 20 (Bán)", "Mang sang từ sổ cũ".
- Tài sản thôi dùng hiện ở tháng thôi dùng (trích lẻ ngày), từ tháng sau không còn.
- Nút **Xuất Excel** giữ nguyên; tiêu đề cột trong file giữ chuẩn kế toán.

## 12. Thay đổi máy chủ

- Cột mới `tai_san_bien_dong.kieu_thoi_dung` String(16) nullable — migration mới trong
  `db_migrations.py` (số kế tiếp sau 0366), cập nhật `docs/DB_SCHEMA.md` cùng lúc.
- Endpoint mới: `POST /{id}/thoi-dung`, `DELETE /{id}/thoi-dung`, `GET /mau-excel`, `POST /import-excel`
  (mode `preview` | `commit`).
- Kiểm mới ở service: Công cụ dụng cụ `so_thang ≤ 36`; xoá chỉ khi chưa có biến động.
- Nới `nap_dau_ky`: cho phép hao mòn = nguyên giá và tháng đã trích = số tháng (máy đã khấu hao hết).
  Engine đã trả 0 khi `so_thang_con <= 0` trước phép chia (`_muc_ky`, `khau_hao.py:74`) — chỉ cần
  test khẳng định, không sửa engine.
- Lọc trạng thái: `dang_dung` | `da_giam` | bỏ trống = tất cả; mặc định phía màn là `dang_dung`.
- Thông điệp lỗi trả về theo cách dùng từ ở mục 3 (ví dụ "Đã khấu hao trước đó phải nhỏ hơn hoặc bằng
  Giá mua", không còn "Hao mòn lũy kế").

Không đổi: model chính, bảng tháng, Excel xuất.

Đổi engine (phát hiện khi bấm thử 05/10/2026): trước đây mỗi tháng làm tròn xuống rồi phần dư mọc
thành một tháng THỪA (vd 205.833.334 đ chia 65 tháng ra 65 × 3.166.666 rồi tháng 66 trích 44 đ — "120
tháng" mà lịch kéo 121). Nay tháng cuối theo số tháng của mốc trích nốt phần lẻ (`_muc_ky`); mốc bắt
đầu giữa tháng thì tháng cuối là tháng thứ N + 1 như cũ.

Bổ sung khi làm: ngăn chi tiết có dòng "Khấu hao hết vào tháng MM/YYYY" (sau sửa chữa lớn, ô "Khấu hao
trong" vẫn là số tháng lúc mua nên cần mốc thật); tài sản đã thôi dùng thì ô Giá trị còn lại (bảng, ngăn,
tab tháng) hiện số còn lại LÚC thôi dùng — máy chủ trả 0, nhưng kế toán cần số đó để ghi giảm. Chip
chuyển bộ phận viết "Chuyển sang <bộ phận mới> dd/mm".

## 13. Không làm

- Danh mục nhóm tài sản — thay bằng "Thêm cái giống thế này".
- Thôi dùng một phần lô công cụ dụng cụ (vd 2 trong 10 cái pallet hỏng) — không đáng lên phần mềm.
- Tiền bán / tiền thanh lý, lãi lỗ thanh lý, định khoản — kế toán làm ở phần mềm kế toán.
- Khoá kỳ, chốt kỳ, kiểm kê, tem QR, ảnh tài sản — chủ đã bỏ 08/09.
- Nối với Kho / Mua hàng / Thiết bị & Máy móc.
- Bản kẽm, mực, tấm cao su: vật tư kho, không vào module này.

## 14. Kiểm thử

Máy chủ (pytest nhắm file `test_tai_san_*`):

- Thôi dùng: chia theo ngày ở tháng thôi dùng, tháng sau không trích; chặn ngày sai; Bỏ thôi dùng trả
  lại lịch như cũ.
- Xoá: chặn khi đã có biến động.
- Công cụ dụng cụ > 36 tháng bị chặn.
- Nạp máy đã khấu hao hết: lưu được, mọi tháng trích 0, không lỗi chia.
- Nhập Excel: preview không ghi gì; commit ghi đủ; dòng sai báo đúng số dòng.
- Migration mới chạy được trên DB đang có dữ liệu.

Giao diện (`npx tsc`, rồi bấm thật trên trình duyệt, báo từng bước):

1. Màn trống hiện đúng câu; bấm Thêm tài sản, gõ giá 450.000.000 → Loại tự thành Tài sản cố định, dòng
   xem trước hiện mức tháng; lưu.
2. Thêm một công cụ dụng cụ số lượng 10, thử gõ 48 tháng → bị chặn với câu "Tối đa 36 tháng".
3. Thêm cái giống thế này từ máy ở bước 1.
4. Thêm tài sản đang dùng: một máy còn khấu hao, một máy đã khấu hao hết; rồi nhập file Excel mẫu.
5. Chuyển bộ phận, Sửa chữa lớn trên một máy, xem lịch sử trong ngăn chi tiết.
6. Thôi dùng (Bán) giữa tháng → tab Khấu hao từng tháng: tháng đó trích lẻ ngày, tháng sau không còn;
   lọc Đã thôi dùng thấy máy; Bỏ thôi dùng → về Đang dùng.
7. Xoá máy có lịch sử → bị chặn đúng câu; xoá máy nhập nhầm → xoá được.
8. Rà toàn màn: không còn chữ "hao mòn", "ghi tăng", "biến động", "TSCĐ", "CCDC".
