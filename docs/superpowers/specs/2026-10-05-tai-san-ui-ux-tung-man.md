# Tài sản — thiết kế lại UI/UX từng màn (05/10/2026)

Nối tiếp spec `2026-10-05-tai-san-lam-lai-design.md` (nghiệp vụ, cách dùng từ — GIỮ NGUYÊN).
Bản này chỉ đổi CÁCH TRÌNH BÀY và CÁCH THAO TÁC. Không thêm bảng, không thêm cột DB, không
đổi API. Bản xem: `docs/mockups/tai-san-ui-ux-tung-man.html`.

Nền: ảnh chụp 10 màn hiện tại (`.playwright-mcp/ts-01…11*.png`, 1440×900) + `docs/UI_DESIGN.md`.

## Nguồn tham khảo và điều lấy về

| Nguồn | Lấy gì |
|---|---|
| Stripe Apps — ContextView / FocusView | Xem chi tiết là ngăn BÊN CẠNH, danh sách vẫn nhìn thấy; việc dài mới chặn màn. Đầu trang có vài con số tóm tắt, ít mà chắc. |
| Linear — peek | Chọn dòng bằng ↑↓, Enter/Space mở ngăn; ngăn đang mở thì ↑↓ đổi sang tài sản kế bên, khỏi đóng-mở. |
| Polaris — Index table | Bảng để LƯỚT: một dòng một tài sản, bấm cả dòng là vào chi tiết, lọc ngay trên bảng. |
| Carbon — Data table | Thanh công cụ: tối đa một nút chính. Thao tác trên dòng ≥3 thì gom vào menu "⋯". Cột số căn phải, tiêu đề không xuống dòng. |
| NN/g — Form | Một cột; ô dài bằng dữ liệu sẽ gõ; nhãn sát ô; ít ô tuỳ chọn; 2–4 lựa chọn dùng nút chọn chứ không dùng hộp thả; lỗi nói cụ thể, không chỉ bằng màu. |
| NN/g — Empty state | Nói đang ở đâu, gợi ý làm gì, cho đúng một nút đi tiếp. |
| Primer (GitHub) — Saving | Nút lưu là động từ cụ thể; phản hồi đặt sát nút lưu; thao tác phá huỷ thì cho HOÀN TÁC thay vì hỏi đi hỏi lại. |

## Lỗi chung đang có (sửa ở mọi màn)

1. **Sai chuẩn chữ của app**: `tai-san.css` dùng 11.5/12.5/13.5px và `tabular-nums` — UI_DESIGN
   cấm cả hai (font không có `tnum`, cỡ nửa điểm bị làm tròn khác nhau giữa trình duyệt). Về thang
   `--fs-2xs…--fs-xl`.
2. **Bảng không theo chuẩn `.rdx-quote`**: tiêu đề cột xuống 2 dòng ("ĐÃ KHẤU / HAO", "GIÁ TRỊ CÒN /
   LẠI"), mã bị cắt "CC-0…". Tiêu đề 11px/600 in hoa, một dòng (`white-space: nowrap`), cột mã đủ
   rộng cho `TS-0000`.
3. **Mã đóng khung** (`rc__code-badge`) ở mọi dòng: sáu cái hộp xếp dọc là thứ nặng nhất trên bảng
   trong khi mã là thứ ít đọc nhất. Đổi thành chữ thường màu `--ash-2`, đậm vừa.
4. **Lớp phủ mờ (blur) phía sau ngăn**: làm mất danh sách — đi ngược ContextView. Ngăn chi tiết dùng
   lớp phủ trong 20% KHÔNG blur, danh sách vẫn đọc được; dòng đang mở được tô `--rule-hair`.
5. **Ô đang gõ có viền cam-đỏ** trông như ô lỗi (ảnh Tiền sửa, Tên, Khấu hao trong). Trong module
   này lỗi phải có chữ + biểu tượng; viền lỗi dùng `--signal`. Viền đang gõ giữ chuẩn `.input:focus-visible`
   của global — không tô thêm ở `tai-san.css`.
6. **Nút chính bị mờ khi chưa đủ ô** (Lưu, Chuyển, Thôi dùng màu cam nhạt): người dùng không biết
   vì sao không bấm được. Theo NN/g: nút luôn bấm được, bấm thiếu thì báo lỗi ngay dưới ô thiếu và
   đưa con trỏ tới đó.
7. **Hai cách viết "Hủy"/"Huỷ"** trong cùng một luồng (form dùng "Hủy", hộp Nhập Excel "Huỷ").
   Cả app: 170 chỗ "Hủy", 69 chỗ "Huỷ". Module này thống nhất **"Hủy"**; hộp Excel là component dùng
   chung nên chỉ đổi nhãn qua prop, không sửa chữ cứng của nó.
8. **Phím Esc không đóng ngăn chi tiết** (đã thử: Esc không tác dụng, phải bấm "Đóng"). Esc đóng
   lớp trên cùng.
9. **Khối màu lớn**: ô xem trước khấu hao là nền xanh đặc cả bề ngang — UI_DESIGN chỉ cho màu phụ
   ở liều nhỏ. Đổi sang nền `--paper`, viền `--rule-soft`, số in đậm màu `--ink`.

## Màn 1 — Tab "Tài sản" (danh sách)

Hiện tại: tốt về nội dung, nhưng 2 nút ngang hàng ("Thêm tài sản đang dùng" và "Thêm tài sản"),
4 hộp thả rộng bằng nhau, cột Trạng thái lặp "Đang dùng" ở mọi dòng khi đang lọc "Đang dùng",
cột Loại lặp chữ dài "Tài sản cố định".

Thiết kế mới:

- **Dải số đầu trang** (`CompactKpiStrip`, cao ~38px, theo bộ lọc đang chọn): *Đang dùng 6* —
  *Tổng giá mua 1.320.500.000 đ* — *Giá trị còn lại 875.125.001 đ* — *Khấu hao tháng này
  10.433.466 đ*. Ô cuối bấm được → nhảy sang tab Khấu hao từng tháng. Trả lời ngay câu chủ hay hỏi
  "xưởng đang có bao nhiêu tài sản, còn lại bao nhiêu".
- **Thanh lọc gọn**: ô tìm (rộng nhất) — nhóm nút "Tất cả | Tài sản cố định | Công cụ dụng cụ"
  kèm số đếm (thay hộp thả Loại: 3 lựa chọn thì nút chọn nhanh hơn, NN/g) — hộp thả Bộ phận có ô
  tìm và gộp nhóm (`Select searchable` + `group`, 40 bộ phận thả phẳng hiện giờ rất khó tìm) —
  hộp thả Trạng thái. Có lọc khác mặc định thì hiện chữ "Bỏ lọc".
- **Một nút chính duy nhất**: "Thêm tài sản ▾" (cam) — bấm thân nút là mở form mua mới (việc hay
  làm nhất); bấm mũi tên ra menu 3 dòng: *Mua mới* / *Đang dùng từ trước* / *Nhập nhiều từ Excel*.
  Bỏ nút "Thêm tài sản đang dùng" riêng (Carbon: tối đa một nút chính trên thanh công cụ).
- **Cột bảng** (7 cột, bỏ Loại và Trạng thái thành cột riêng):
  Mã | Tên (dòng phụ: loại + "bắt đầu 05/10/2026" + "10 cái", mỗi mẩu một thẻ nhỏ cách nhau, không
  nối bằng "·") | Bộ phận (cho xuống 2 dòng, không cắt "Nhóm thợ in má…") | Giá mua | Đã khấu hao |
  Giá trị còn lại (kèm thanh tiến độ 3px bên dưới: phần đã khấu hao) | ›.
  Trạng thái chỉ hiện thành thẻ cạnh tên khi KHÁC "Đang dùng" ("Đã thôi dùng", "Đã khấu hao hết")
  — lọc "Đang dùng" thì 6 dòng không còn 6 chữ "Đang dùng" thừa.
- **"gồm sửa chữa lớn 60.000.000"** ở ô Giá mua đẩy dòng cao gấp đôi → chuyển thành dấu "+" nhỏ
  cạnh số, rê chuột/nhấn giữ hiện câu đầy đủ; chi tiết vẫn ở ngăn.
- **Bàn phím** (Linear): ↑↓ chọn dòng, Enter mở ngăn; ngăn đang mở thì ↑↓ đổi tài sản.
- **Màn trống** — 3 trường hợp, mỗi cái một câu + một nút:
  - Chưa có tài sản nào: "Chưa có tài sản nào. Thêm máy vừa mua, hoặc nhập danh sách máy đang dùng từ
    Excel." — nút "Thêm tài sản" + liên kết "Nhập từ Excel".
  - Lọc không ra: "Không có tài sản khớp bộ lọc." — nút "Bỏ lọc".
  - Tìm không ra: "Không tìm thấy “abc”." — nút "Xoá ô tìm".
- **Điện thoại** (<640px): bảng thành danh sách thẻ — tên + mã trên, "Còn lại X đ" dưới (số không
  xuống dòng), thanh tiến độ; dải số cuộn ngang; nhóm nút Loại trở lại hộp thả "Mọi loại (6)" vì
  ba nút không vừa bề ngang.

## Màn 2 — Ngăn chi tiết

Hiện tại: 5 nút cùng hàng, "Thôi dùng" đỏ đậm đứng cạnh các nút thường; bảng khấu hao 120+ dòng
cuộn LỒNG trong ngăn đang cuộn; nút "Đóng" màu đen ở chân chiếm 56px vô ích; Lịch sử nằm dưới cùng
sau 120 dòng.

Thiết kế mới (từ trên xuống):

1. **Đầu ngăn**: dòng nhỏ "TS-0001" + thẻ trạng thái; tên to; nút ↑ ↓ (tài sản trước/sau trong
   danh sách đang lọc) và ✕. Bỏ chân "Đóng".
2. **Hàng thao tác**: 2 nút thường hay dùng — "Chuyển bộ phận", "Sửa chữa lớn" — rồi "Sửa" và nút
   "⋯" chứa *Thêm cái giống thế này*, *Thôi dùng*, *Xoá* (Xoá chỉ hiện khi chưa có lịch sử). Thôi
   dùng là việc hiếm và khó quay lại nên không đứng ngang hàng nút thường (Carbon: ≥3 thao tác thì
   gom vào menu).
3. **Ba con số chính** thành dải 3 ô: Giá mua / Đã khấu hao (tới hết 09/2026) / Giá trị còn lại —
   dưới là thanh tiến độ "Đã khấu hao 0,5% — còn 132 tháng, hết vào 10/2037".
4. **Thông tin** 2 cột nhãn–giá trị: Mỗi tháng, Bắt đầu dùng, Khấu hao trong, Bộ phận dùng, Người giữ.
5. **Lịch sử** (lên trước lịch khấu hao — thường chỉ vài dòng, mà là thứ người ta mở ngăn để xem):
   dòng thời gian, mỗi việc một dòng ngày | việc | chi tiết.
6. **Lịch khấu hao**: gộp THEO NĂM, mỗi năm một dòng (2026: 4 tháng, 13.759.468 đ, còn 496.240.532 đ);
   bấm năm mở 12 tháng. Năm đang chạy mở sẵn, tháng hiện tại có vạch nhấn. Ngăn chỉ còn MỘT thanh
   cuộn. Chip "Ghi chú tháng" giữ nguyên.

## Màn 3–4 — Form Thêm tài sản (mua mới / đang dùng từ trước)

Hiện tại: ô nào cũng dài 680px (ô Giá mua dài gấp 4 con số); Loại nằm sau Giá mua dù nó quyết định
gợi ý số tháng và trần 36 tháng; ô xem trước nền xanh đặc; hai form là hai cửa riêng.

Thiết kế mới — MỘT form, đầu form có nhóm nút "Mua mới | Đang dùng từ trước" (mở từ menu nào thì
chọn sẵn cái đó):

- Thứ tự ô: **Loại** (2 nút chọn) → **Tên** → **Giá mua** (rộng ~240px, căn phải, tự chấm nghìn) +
  **Bắt đầu dùng từ ngày** cùng một hàng → **Khấu hao trong** (ô ~120px + chữ "tháng") kèm nút
  chọn nhanh: tài sản cố định "5 năm · 7 năm · 10 năm · 15 năm" → điền 60/84/120/180; công cụ
  dụng cụ "12 · 24 · 36 tháng". Dưới ô hiện quy đổi "84 tháng = 7 năm". → Bộ phận dùng (hộp thả có
  tìm) + Người giữ.
- **Đang dùng từ trước**: hiện thêm khối "Đã khấu hao tới lúc này" như hiện nay (Tính tiếp từ tháng
  — chỉ đọc; Đã khấu hao mấy tháng; Đã khấu hao trước đó). Liên kết "Nhiều tài sản? Nhập từ Excel"
  nằm ngay dưới nhóm nút chọn.
- **Xem trước sát nút lưu** (Primer): chân form bên trái là một dòng "Mỗi tháng khoảng
  **1.428.571 đ** — khấu hao hết vào **10/2033**", cập nhật khi gõ; bên phải "Hủy" (chữ, nhạt) và
  "Lưu tài sản" (cam). Không còn khối xanh ở giữa form.
- **Lỗi**: bấm "Lưu tài sản" khi thiếu → mỗi ô thiếu có dòng đỏ "Nhập giá mua" + biểu tượng, con
  trỏ nhảy tới ô đầu tiên. Công cụ dụng cụ quá 36 tháng: "Công cụ dụng cụ khấu hao tối đa 36 tháng."
  ngay dưới ô tháng (không ẩn xem trước một cách im lặng như bây giờ).
- "Thêm chi tiết" giữ nguyên (gập), đổi mũi tên sang icon Lucide `chevron-right` xoay.

## Màn 5 — Hộp Nhập Excel

Hiện tại: thứ tự ngược — vùng thả file ở giữa, "Tải file mẫu" ở dưới cùng; khối "QUY TẮC NHẬP DỮ
LIỆU" chữ in hoa như cảnh báo; nút "Xác nhận nhập" xám đậm như đang khoá.

Thiết kế mới — ba bước đánh số, đọc từ trên xuống đúng thứ tự làm:

1. **Tải file mẫu** — nút "Tải file mẫu (.xlsx)" + 1 câu "Mỗi dòng một tài sản đang dùng".
2. **Điền vào file** — 1 câu: "Ô trống phần mềm tự điền: loại theo giá, số tháng, số đã khấu hao."
3. **Chọn file đã điền** — vùng thả file.

Sau khi chọn file: hiện bảng xem trước (số dòng hợp lệ / số dòng lỗi, dòng lỗi ghi rõ ô nào sai)
rồi mới có nút "Nhập N tài sản". Câu "Một dòng sai là không dòng nào được ghi" chuyển thành thông
báo khi có lỗi: "Sửa 2 dòng lỗi rồi chọn lại file — chưa dòng nào được ghi."

Hộp này là component dùng chung (`ImportExcelDialog` — Danh mục, Nhân sự cũng dùng). Thay đổi
qua prop có mặc định giữ nguyên dáng cũ; chỉ Tài sản bật dáng ba bước. Muốn áp cho mọi nơi thì
làm riêng sau.

## Màn 6–8 — Chuyển bộ phận, Sửa chữa lớn, Thôi dùng

Hiện tại: mỗi việc 3–4 ô lại mở ngăn MỚI phủ toàn chiều cao, che mất ngăn chi tiết — người dùng
không còn thấy số tiền đang bàn tới; 60% ngăn bỏ trống.

Thiết kế mới: mở **ngay trong ngăn chi tiết**, thay chỗ hàng thao tác (khung viền `--rule`, nền
`--canvas`); phần thông tin bên dưới vẫn thấy được. Mỗi khung có dòng **"Trước → Sau"** để người
dùng biết bấm lưu thì đổi gì:

- **Chuyển bộ phận**: "Nhóm thợ in máy 4 màu → [chọn bộ phận]" (hộp thả có tìm, gộp nhóm), Ngày
  chuyển, Người giữ mới, Lý do. Câu "Không đổi số tiền nào." giữ. Nút "Chuyển bộ phận".
- **Sửa chữa lớn**: Tiền sửa, Ngày sửa xong, Dùng thêm (mặc định = số tháng còn, có chữ "đang còn
  132 tháng"), Sửa gì. Dòng sau: "Mỗi tháng 3.750.000 đ → 3.817.234 đ — hết vào 09/2036 →
  10/2037" (số thật của TS-0001). Nút "Lưu sửa chữa lớn".
- **Thôi dùng**: Lý do (4 nút chọn Bán / Thanh lý / Hỏng / Mất), Ngày thôi dùng, Ghi chú. Dòng
  sau: "Ngừng khấu hao từ 10/2026. Còn lại lúc thôi dùng **503.875.000 đ** — kế toán ghi giảm số
  này." Nút "Thôi dùng tài sản" (đỏ `--signal`, đây là chỗ DUY NHẤT dùng nút đỏ).
  Lưu xong: thông báo nhỏ "Đã thôi dùng Máy in Komori 4 màu. **Hoàn tác**" trong 8 giây (gọi
  `DELETE /{id}/thoi-dung` sẵn có). Không thêm hộp "Bạn chắc chưa?" — hoàn tác tốt hơn hỏi lại.

## Màn 9 — Hộp xác nhận Xoá / Bỏ thôi dùng

- **Xoá** (chỉ khi chưa có lịch sử): giữ `ConfirmDialog`, tiêu đề là câu hỏi cụ thể "Xoá Máy cán
  màng nhiệt?", thân "Xoá vì nhập nhầm. Không khôi phục được." Nút "Xoá tài sản" đỏ, "Hủy" chữ.
- **Bỏ thôi dùng**: "Dùng lại Máy in Komori 4 màu?" — "Khấu hao chạy tiếp từ tháng đã dừng." Nút
  "Dùng lại". (Chữ "Bỏ thôi dùng" là phủ định của phủ định — khó đọc; đổi thành "Dùng lại".)

## Màn 10 — Tab "Khấu hao từng tháng"

Hiện tại: tổng tháng — con số kế toán cần chép — nằm ở dòng cuối bảng; mã bị cắt "CC-0…"; tiêu đề
cột xuống dòng; đổi tháng phải mở bộ chọn.

Thiết kế mới:

- **Thanh tháng**: ‹ **Tháng 10/2026** › + nút "Tháng này" (chỉ hiện khi đang xem tháng khác) +
  "Xuất Excel" bên phải. Bấm mũi tên là sang tháng; bộ chọn tháng vẫn mở được khi bấm vào chữ.
- **Con số chính lên đầu**: "Tổng khấu hao tháng 10/2026" **10.433.466 đ** (cỡ `--fs-2xl`) +
  nút nhỏ "Chép số" (chép số trần 10433466 vào bộ nhớ tạm, báo "Đã chép") + "5 tài sản — 3 có ghi
  chú". Dòng tổng cuối bảng vẫn giữ.
- **Cột**: Mã | Tên | Bộ phận | Giá mua | Khấu hao tháng (đậm) | Đã khấu hao | Còn lại | Ghi chú tháng.
  Tiêu đề một dòng (rút "Khấu hao tháng này" → "Khấu hao tháng" vì tháng đã ghi to ở trên; "Giá trị
  còn lại" → "Còn lại" ở bảng này, tiêu đề đầy đủ ở rê chuột).
- Câu "Phần mềm tự tính, không cần bấm gì…" giữ, đặt dưới con số tổng, chữ `--ash-2`.
- Bấm dòng mở cùng ngăn chi tiết như tab Tài sản; ↑↓ như Màn 1.

## Không đổi

Nghiệp vụ, API, DB, chữ đã duyệt ở spec trước (trừ "Bỏ thôi dùng" → "Dùng lại" và "Khấu hao tháng
này" → "Khấu hao tháng" ở tiêu đề cột — cần chủ gật). File Excel xuất giữ tiêu đề cột kế toán.

## Để ngỏ — chờ chủ quyết

1. Nút "Chép số" ở tab tháng: có cần không, hay kế toán chỉ dùng file Excel.
2. Nhãn sidebar "Tài sản & CCDC" còn viết tắt — phải đổi cùng `seed.MODULES` (có guard test), đụng
   phiên RBAC đang sửa `seed.py`.

## Phạm vi khi làm

Chỉ trong `frontend/src/pages/tai-san/` + `tai-san.css`, cộng một prop mới có mặc định ở
`ImportExcelDialog`. Không đụng backend. Verify: `npx tsc`, rồi đi lại cả 10 màn bằng thao tác thật
trên trình duyệt như lần trước.

## Chỉnh sau khi chủ xem bản chạy thật (05/10/2026)

- **Ngăn chi tiết rộng 1040px, hai cột.** Bản một cột 680px bị chê "thông tin nhìn xấu". Cột chính:
  thẻ "Giá trị còn lại" (20px) + thanh tiến độ + MỘT hàng ba số phụ 13px (Mỗi tháng, Còn, Số tính
  tới) + lịch khấu hao (không trần chiều cao). Cột bên 300px: Thông tin (nhãn 11px trên giá trị 13px)
  và Lịch sử dạng dòng thời gian, mới nhất ở trên. Nút thao tác ngay dưới tiêu đề. ≤960px về một cột.
- **Cỡ chữ:** bản đầu dùng 26px cho số chính và 16px đậm cho ba số phụ — chủ chê "to đùng". Giữ thang
  20 / 13 / 11.
- **Không "khựng" khi mở:** lúc đang nạp vẫn là cùng một ngăn rộng (khung xương), không dựng ngăn hẹp
  rồi bật rộng.
- **Màn 6–8 (Chuyển bộ phận, Sửa chữa lớn, Thôi dùng) thành HỘP GIỮA MÀN**, không còn khung chen trong
  ngăn (chủ chê "bấm vào ui/ux chán"). Trái là ô nhập, phải là "Sau khi lưu": thẻ số mới to + số cũ
  gạch ngang, đổi theo từng phím gõ. Chuyển bộ phận: hai thẻ "Đang ở → Chuyển sang" ở trên cùng.
- **Thông báo Hoàn tác:** 10 giây và DỪNG đếm khi rê chuột / đặt focus vào (WCAG 2.2.1), thay 8 giây.
- **Form Thêm / Sửa tài sản (màn 3) cũng thành ngăn RỘNG 1040px hai cột** (chủ chê "kì lắm"). Trái là
  form chia phần có tiêu đề nhỏ, ô xếp lưới đều cột, mọi ô cao bằng nhau (ô chọn bộ phận và ô chọn
  tháng khoác đúng mặt ô nhập). "Mua mới / Đang dùng từ trước" thành hai thẻ chọn có câu giải thích.
  Phải là thẻ "Mỗi tháng khấu hao" dính khi cuộn: số mỗi tháng, hết vào tháng nào, giá, loại, số
  tháng, bắt đầu tính, và với tài sản đang dùng thì đã khấu hao ở sổ cũ + còn lại để tính tiếp. Chân
  ngăn chỉ còn Hủy + Lưu; câu tóm tắt ở chân chỉ hiện khi màn hẹp (thẻ xem trước rơi xuống cuối form).
