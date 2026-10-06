# Kế toán (Phiếu chi, Công nợ phải trả, Phiếu thu, Công nợ phải thu, Tài khoản ngân hàng) — thiết kế lại UI/UX từng màn (05/10/2026)

Chỉ đổi CÁCH TRÌNH BÀY, CÁCH THAO TÁC và CÁCH DÙNG TỪ. Không thêm bảng, không thêm cột DB. Các
chỗ cần thêm API ĐỌC (không đổi DB) được đánh dấu **[API đọc]**. Thứ cần cột mới thì để ở mục
"Để ngỏ". Bản xem: `docs/mockups/ke-toan-ui-ux-tung-man.html` (dữ liệu trong bản xem là số giả).

**Bản 2 (05/10/2026, chiều)** — chủ duyệt phần THÔNG TIN, bác phần NHÌN và THAO TÁC ("UI/UX cực
tệ"; ngăn chi tiết phải chia tab, có tab Lịch sử, kéo rộng sang trái được). Đã làm lại: khuôn ngăn
chung có tab + kéo rộng (A.5), khung trang chung với thẻ lọc + chip (A.16), form chia nhóm với ô tiền
to và thẻ chọn hình thức, ngăn công nợ hai tab với thanh tối chọn nhiều, thẻ tài khoản mới. Các
mục bên dưới đã viết lại theo bản 2.

**Bản 3 (05/10/2026, tối)** — chủ chê: không chọn được kỳ (mốc và khoảng thời gian như màn Thống kê
khách hàng), không có bộ lọc nâng cao; nhắc lại hai luật: KHÔNG nối thông tin bằng dấu chấm hay dấu
phẩy, và mọi ngăn mở từ bên phải RỘNG BẰNG NHAU. Đã thêm: thanh chọn kỳ + so cùng kỳ (A.17), bộ lọc
nâng cao (A.18), một độ rộng ngăn chung (A.5), luật tách thông tin viết lại (A.9). Để ngỏ mục 3 đã
đưa vào thiết kế.

**Đã triển khai (06/10/2026, chưa commit)** — theo kế hoạch
`docs/superpowers/plans/2026-10-05-ke-toan-thu-chi-cong-no-ui-ux.md`, đủ 5 màn. Đã thao tác thật Phiếu
chi, Phiếu thu, Tài khoản ngân hàng; hai màn công nợ mới kiểm bằng test vì DB dev chưa có công nợ.

Nền:
- Đã mở thật 5 màn trên trình duyệt (1440×900 và 375×812), gồm form Tạo phiếu chi (cả hai hình thức),
  form Tạo phiếu thu (cả hai hình thức), bấm Lưu khi form trống, Esc, và form Thêm/Sửa tài khoản.
- DB dev chưa có phiếu thu/chi hay công nợ nào nên chỉ thấy màn trống và form. Không tạo dữ liệu
  thử để khỏi làm bẩn DB. Phần có dữ liệu dựa trên đọc code (5 bản kiểm kê, trích file:dòng).
- Luật thị giác: `docs/UI_DESIGN.md`. Khuôn ngăn kéo, khung thao tác tại chỗ, Esc theo tầng đã
  làm ở màn Tài sản (`2026-10-05-tai-san-ui-ux-tung-man.md`) — dùng lại cho đồng bộ.

## Nguồn tham khảo và điều lấy về

| Nguồn | Lấy gì |
|---|---|
| Xero — Invoices / Bills to pay | Tab trạng thái kèm SỐ ĐẾM và TỔNG TIỀN ngay trên tab. Một danh sách cho một loại chứng từ, lọc bằng tab chứ không tách màn. |
| QuickBooks — Money bar | Một thanh ngang chia đoạn "Chưa tới hạn / Quá hạn / Đã trả gần đây", mỗi đoạn là số tiền, bấm đoạn để lọc. Thay cho cụm thẻ số + dải tuổi nợ chồng nhau. |
| Ramp / Brex — Bill pay | Chọn nhiều khoản → thanh nổi đáy "Đã chọn 3 khoản, 45.000.000 đ — Trả 3 khoản". Form trả tiền mở chồng lên, không rời màn. |
| Mercury — Accounts | Vài tài khoản thì hiện dạng THẺ (ngân hàng, số tài khoản có nút chép, mục đích), bấm thẻ ra giao dịch của tài khoản đó. |
| Stripe Dashboard — Payments | Hàng THẺ LỌC đầu danh sách (mỗi thẻ: nhãn, con số, dòng phụ; bấm là lọc) thay cho cặp dải số + tab lặp số. Bộ lọc phụ là chip viền đứt "+ Hình thức", đặt rồi thành chip đặc "Hình thức: Chuyển khoản ×". Trang chi tiết: số tiền to ở đầu, dải tóm tắt 4 ô. |
| Linear / Jira — panel | Ngăn chi tiết kéo mép trái để nới rộng, bấm đúp mép hoặc nút "mở rộng" để rộng hết; ↑↓ đổi sang dòng kế bên khi ngăn đang mở. |
| Mercury — Transaction detail | Khối "Dòng tiền": tài khoản đi → mũi tên kèm số tiền → tài khoản đến. |
| Carbon — Data table | Tối đa MỘT nút chính trên thanh công cụ; thao tác hiếm/nguy hiểm vào menu "⋯". |
| NN/g — Form, Error message | Một cột, ô dài bằng dữ liệu, lỗi nằm NGAY DƯỚI ô và nói cách sửa; nút lưu luôn bấm được. |
| Primer — Saving / Destructive | Nút lưu là động từ cụ thể; phản hồi sát nút; phá huỷ không hoàn tác được thì hỏi một lần, kèm lý do. |

## Phần A — Lỗi chung của cả 5 màn (sửa một lần, dùng chung)

1. **Báo lỗi nằm sau lớp phủ.** Lỗi kiểm dữ liệu của hộp Hủy phiếu, Xác nhận đã thu, tải/xoá đính
   kèm, form Tài khoản ngân hàng đều đổ ra banner ĐẦU TRANG — nằm dưới lớp phủ, người dùng bấm mà
   không thấy gì (PaymentVouchersPage.tsx:270/284, PaymentReceiptsPage.tsx:257/284/299,
   AccountingBankAccountsPage.tsx:225). Banner cũng không tự xoá khi thao tác sau thành công.
   → Lỗi nằm trong chính hộp đang mở, sát ô sai; banner đầu trang chỉ cho lỗi TẢI danh sách.
2. **Form báo lỗi gom một băng, có khi sai.** Đã thử: form Tạo phiếu chi để trống, bấm Lưu →
   băng hồng "Vui lòng nhập ngày chứng từ và nội dung chi." trong khi ô ngày ĐÃ có sẵn hôm nay.
   → Lỗi từng ô (chữ đỏ `--signal` + biểu tượng, viền ô đỏ), nhảy con trỏ tới ô sai đầu tiên,
   nút lưu luôn bấm được (giống màn Tài sản).
3. **Esc lộn xộn.** Form Tạo phiếu chi/thu: Esc không làm gì (đã thử). Ngăn Công nợ phải trả:
   Esc trong hộp Trả gộp đóng CẢ ngăn, mất form đang gõ (PayablesDrawer.tsx:74-80); Esc trong
   popup hàng của đợt cũng đóng luôn ngăn. → Esc đóng đúng LỚP TRÊN CÙNG; lớp có form đang gõ dở
   thì hỏi "Bỏ nội dung đang nhập?" thay vì nuốt phím (dùng lại ngăn xếp `KhungNgan` của Tài sản).
4. **Một khái niệm nhiều tên.** Bảng từ dưới đây là chuẩn cho cả 5 màn (và các form lập phiếu ở
   màn khác dùng chung component).

   | Đang có | Thống nhất thành | Ghi chú |
   |---|---|---|
   | "Tổng phải trả" / "Còn nợ" / "Đang nợ"; "Tổng phải thu" / "Còn nợ" | **Còn nợ** | Ở KPI, cột, ngăn chi tiết |
   | "Trừ cọc" / "Cấn cọc" | **Trừ cọc** | Cả hai phía |
   | "Đơn còn nợ" / "HĐ còn nợ" | **Số khoản còn nợ** | Mỗi khoản = một đợt giao (trả) / một hoá đơn (thu) |
   | "Mã chứng từ" / "Mã phiếu thu" | **Mã phiếu** | |
   | "Trích nợ" | **Trả từ tài khoản** | Chữ ngân hàng, người dùng hay hỏi |
   | "Thụ hưởng", "Tên thụ hưởng", "Chủ tài khoản nhận", "Tên chủ tài khoản" | **Tài khoản người nhận**: Chủ tài khoản / Số tài khoản / Ngân hàng / Chi nhánh | |
   | "Tài khoản nhận", "Tài khoản công ty nhận tiền", "Về TK ngân hàng" | **Vào tài khoản** | Phiếu thu |
   | "Nhập quỹ tiền mặt" / "Tiền mặt" | **Tiền mặt** | |
   | "Lưu phiếu" / "Lập chứng từ" / "Lập phiếu chi" / "Lưu phiếu thu" / "Lập phiếu thu" | **Lập phiếu chi** / **Lập phiếu thu** | Phiếu lập là tiền đã đi/đã về — động từ "lập" đúng nghĩa hơn "lưu" |
   | "Hủy" (đóng form) và "Hủy" (huỷ phiếu, nút đỏ) | **Đóng** (đóng form) — **Hủy phiếu** (huỷ chứng từ) | Hai việc trái nghĩa đang trùng một chữ |
   | "Hủy chứng từ" / "Hủy phiếu" / "Hủy phiếu thu" | **Hủy phiếu** | |
   | "Mã giao dịch" / "Mã giao dịch / số báo có" / "Số báo có" | **Mã giao dịch ngân hàng** | gợi ý dưới ô: "In trên sao kê hoặc tin nhắn báo có" |
   | "Lập lúc" (giờ tạo) | **Ngày chi** / **Ngày thu** (ngày chứng từ) | Cột đang hiện giờ tạo, không phải ngày tiền đi |
   | PC, UNC, PMH, YCMH, PT, HĐ, TK, NCC trong chữ giao diện | Viết đủ: phiếu chi, chuyển khoản, đơn mua, yêu cầu mua, phiếu thu, hoá đơn, tài khoản, nhà cung cấp | Mã (`PC-261005-X7K2`) vẫn giữ nguyên |
   | "Tổng quan" / "Thanh toán" (tab phiếu THU) / "Chứng từ đính kèm" / "Lịch sử" | **Chi tiết / Chứng từ / Lịch sử** | Ba tab giống nhau ở mọi ngăn phiếu — xem mục 5 |

   Chính tả: **"Hủy", "hóa đơn"** (đa số trong app). Ô tìm Phiếu chi ghi "PMH" — mã đơn mua đã đổi
   sang `DMH-` từ 25/08/2026.
5. **Ngăn chi tiết: tab đặt sai chỗ, hẹp, lặp.** Hiện các tab chia vụn và lặp nhau (Phiếu thu:
   "Nguồn thu" hiện 3 lần, "Ngày thu" 2 lần; Công nợ phải thu: "Hạn mức" 3 lần); ngăn 640px cố
   định. → **Khuôn ngăn chung** (bản 2, theo góp ý chủ 05/10 — bản 1 gộp một trang cuộn bị bác):
   - **Đầu ngăn CỐ ĐỊNH, không cuộn**: dòng đường dẫn nhỏ (loại phiếu > mã, nút chép mã) bên phải
     ↑ ↓ | mở rộng | ✕ — tiêu đề 20px + pill trạng thái, bên phải nút phụ ("In phiếu", "⋯") — SỐ TIỀN
     26px + bằng chữ — dải tóm tắt 4 ô nền `--paper` (nhãn trên, giá trị dưới: Ngày, Hình thức,
     Nguồn có link, Người lập) — hàng tab.
   - **Tab** (nút bo, tab đang mở nền charcoal chữ trắng, số đếm trong viên nhỏ): phiếu thu/chi
     **Chi tiết | Chứng từ (n) | Lịch sử (n)**; ngăn công nợ **Còn nợ (n) | Đã trả/Đã thu (n)**;
     ngăn tài khoản **Thông tin | Phiếu qua tài khoản (n) | Lịch sử (n)**. Mở lại ngăn nhớ tab đang
     xem cho tới khi đóng trang. Không lặp trong tab thứ đã có ở đầu ngăn.
   - **Độ rộng — MỘT số cho MỌI ngăn mở từ bên phải** (chủ chốt bản 3): ngăn phiếu, ngăn công nợ,
     ngăn tài khoản, form lập phiếu, form tài khoản, ngăn chồng "Trả nhiều đợt" đều mặc định
     **920px**. Mép trái có thanh kéo (vạch xám dọc, rê vào đậm lên, con trỏ `col-resize`) — KÉO
     sang trái để nới, tối thiểu 480px, tối đa sát thanh bên; **bấm đúp** thanh kéo hoặc nút "mở
     rộng" ở đầu ngăn để bật/tắt rộng hết. Kéo ngăn nào thì MỌI ngăn đổi theo: độ rộng là một biến
     CSS chung `--kt-ngan-w` đặt ở gốc, nhớ trong localStorage một khoá duy nhất `kt-ngan-rong` (đọc
     lỗi thì 920px). Form hẹp nội dung (form tài khoản) giữ cột ô tối đa 560px canh trái trong ngăn,
     KHÔNG thu hẹp ngăn. Ngăn chồng cùng độ rộng nên che kín ngăn dưới; đường dẫn ở đầu ngăn chồng
     ("Giấy Bình Minh > Trả 3 đợt") cho biết đang ở lớp trên, Esc về lớp dưới. Điện thoại: ngăn rộng
     hết màn, không có thanh kéo.
   - Tab **Chi tiết** của phiếu: hai cột (ngăn hẹp hơn 680px thì một cột) — trái "Thông tin phiếu"
     (nhãn 168px một dòng, giá trị bên phải), phải "Dòng tiền" (khuôn Mercury: tài khoản đi → mũi
     tên + số tiền → tài khoản đến); dưới là khối liên quan ("Trả cho đợt giao" / "Áp vào hoá đơn":
     Giá trị — Trừ cọc — Phiếu này — Còn nợ, kèm thẻ "Đợt đã trả đủ").
   - Tab **Chứng từ**: ô kéo-thả một hàng (vòng icon — chữ — nút "Chọn tệp"), lưới ảnh xem trước
     cao 132px, dưới mỗi ảnh tên tệp, loại + dung lượng, nút Xem / Xoá. Thông báo "Đã xoá … —
     Hoàn tác" nằm TRONG ngăn (bản 1 nằm giữa trang, bị ngăn che mất nửa).
   - Tab **Lịch sử**: dòng thời gian mới nhất ở trên; mỗi việc một vòng icon (lập: xanh, hủy: đỏ,
     còn lại xám) nối bằng vạch dọc; tên việc đậm, dưới là chi tiết + người làm; giờ ở cột phải.
6. **Đầu ngăn/hộp ba kiểu.** Ngăn chi tiết nền charcoal phẳng; form lập phiếu nền gradient tối +
   vạch tím 3px (purchase.css:1774-1779, viền một cạnh, màu ngoài hệ); hộp gia công dùng khuôn
   `ns-modal` của Nhân sự. → Một kiểu: đầu ngăn nền `--canvas`, nhãn nhỏ + tiêu đề 20px + nút
   đóng icon Lucide, kẻ dưới `--rule-soft`. Không gradient, không vạch màu.
7. **Thẻ KPI to trong ngăn** (`acct-kpi-grid` 4 thẻ, hover nhấc thẻ, nền hồng cả thẻ khi quá hạn,
   mã màu hỏng `#fffbebf` ở accounting.css:710) — vi phạm §3, §4. → Trong ngăn: dải tóm tắt 4 ô
   (mục 5). Ở danh sách phiếu: **hàng thẻ lọc** (mục 16).
8. **Vi phạm thang chữ và màu**: 9.5/10/10.5/11.5/12.5/13.5px, `tabular-nums`, hex thô, emoji 📎,
   ký tự ✕/× làm biểu tượng, dòng đang chọn có vạch rust bên trái (accounting.css:2606, 3200),
   pill "Ngừng dùng" mượn màu đỏ của "Đã hủy". → Về token; icon Lucide `paperclip`, `x`.
9. **Nối thông tin bằng "·" / "•"** ở gần như mọi ô phụ (Tiền mặt · Đơn mua hàng, ngân hàng ·
   số tài khoản, Đợt 2 · ngày · còn nợ…). → KHÔNG nối các mẩu thông tin bằng dấu chấm giữa, dấu
   chấm hay dấu PHẨY (chủ nhắc lại bản 3). Mỗi mẩu đứng riêng: mẩu loại/nhóm/trạng thái là **thẻ
   nhỏ** (`kt-the`: cao 20px, nền `--rule-hair`, chữ 12px đậm vừa), mẩu còn lại chữ thường; cách
   nhau bằng khoảng trống 8px (flex `gap`), xuống hàng được. Ví dụ: `Giao 28/09/2026` [Couche 150
   gsm 79×109] `8.800 tờ`; [USD 1.200] `tỷ giá 25.400`; `21/07` [DH-0398]; lịch sử `45.200.000 đ`
   [Chuyển khoản] `Nguyễn Thị Luyến`. Hai mẩu cùng loại thì dùng chữ "và" ("Đơn mua và đợt").
   Danh sách trường ẩn sau "Thêm chi tiết" cũng là các thẻ nhỏ. Câu văn giải thích (câu dẫn, cảnh
   báo) vẫn viết câu bình thường — luật này nói về các MẨU dữ liệu đứng cạnh nhau.
10. **Dòng bảng không dùng được bằng bàn phím** (cả 5 bảng chỉ có `onClick`). → `tabIndex`,
    ↑↓ chuyển dòng, Enter mở, ngăn đang mở thì ↑↓ đổi phiếu (peek).
11. **Ô tìm gọi máy chủ từng phím, không về trang 1** (Phiếu chi, Phiếu thu). Đang ở trang 3 gõ
    tìm sẽ ra trang 3 của kết quả mới — dễ thấy "trống" oan. → Chờ 350ms như hai màn công nợ, đổi
    từ khoá thì về trang 1.
12. **Trạng thái rỗng một câu cho mọi ca.** → Ba câu: chưa có gì (kèm nút lập), lọc không ra (kèm
    "Bỏ lọc"), tải lỗi (không nói "chưa có").
13. **Điện thoại**: cả 5 bảng chỉ cuộn ngang (Phiếu chi `min-width:1090px`). → Dưới 640px mỗi dòng
    thành một thẻ hai hàng (tên + số tiền; ngày + trạng thái).
14. **Lỗi ngày theo UTC** (phieu-chi/shared/constants.ts:4, helpers.ts:1-3): từ 0h tới 7h sáng ngày
    mặc định là HÔM QUA và không chọn được hôm nay; `HOM_NAY` tính một lần lúc nạp trang. → Ngày
    theo giờ máy (đã có ở hộp gia công).
15. **Real-time**: ngăn Công nợ phải trả không nhận sự kiện đẩy (ngăn phải thu thì có) — trái nguyên
    tắc REAL-TIME. → Cả hai ngăn tự nạp lại khi có phiếu mới.
16. **Khung trang chung (bản 2).** Đầu trang: tiêu đề 26px + một câu nói màn này để làm gì; nút
    chính rust cùng hàng bên phải. Danh sách phiếu: **hàng thẻ lọc** (Stripe) — mỗi thẻ là MỘT bộ
    lọc kèm số của nó (nhãn 12px có chấm màu, con số 20px, dòng phụ 12px); thẻ đang chọn viền
    charcoal đủ 4 cạnh; thay cả dải pill lẫn hàng tab (bản 1 hiện "Đã chi 42" hai lần). Bộ lọc phụ:
    chip viền đứt "+ Hình thức", "+ Nguồn chi"; đã đặt thì chip đặc "Hình thức: Chuyển khoản ×".
    Bên phải thanh lọc: "44 phiếu". Bảng: dòng cuối có mũi tên ›  mờ (đậm khi rê) báo bấm được; dòng
    đã hủy chữ xám, tên gạch ngang mảnh; chân bảng "Hiện 1–8 trên 44 phiếu" — "25 dòng mỗi trang"
    — ‹ "Trang 1 / 2" ›. Điện thoại: thẻ lọc thành một hàng cuộn ngang, bảng thành thẻ.
    **Lệch `UI_DESIGN.md` §4** (KPI phải là dải pill mảnh): thẻ lọc cao ~76px — cần chủ duyệt, xem
    "Để ngỏ" mục 7.

17. **Chọn kỳ (bản 3).** Mọi màn danh sách (Phiếu chi, Phiếu thu, Công nợ phải trả, Công nợ phải
    thu, Tài khoản ngân hàng) có một thanh chọn kỳ ngay dưới đầu trang, TRÊN thẻ lọc / khối tổng
    quan — y khuôn màn Thống kê khách hàng để người dùng gặp lại đúng thứ đã quen:
    - Nhóm nút liền (nền `--rule-hair`, nút đang chọn nền trắng + bóng mảnh): **Tháng này | Quý này
      | Năm nay | 12 tháng qua | Năm trước | Tuỳ chọn**. Mặc định "Tháng này".
    - "Tuỳ chọn" hiện HAI ô ngày ngay cạnh ("Từ ngày" đến "Đến ngày"; min 01/01/2000, max hôm nay;
      tối đa 3650 ngày như `TRAN_KHOANG_NGAY`). Ô gõ dở / ngày ngược thì giữ kỳ cũ, không gọi máy.
    - Ô tích **"So với cùng kỳ năm trước"** (mặc định bật).
    - Bên phải: nhãn kỳ "01/01/2026 – 05/10/2026" và chữ xám "so với 01/01/2025 – 05/10/2025".
      Điện thoại: nhãn xuống hàng, canh trái.
    - Bật so sánh thì dưới số của mỗi thẻ lọc / mỗi số tổng quan có một dòng nhỏ kẻ đứt trên:
      mũi tên Lucide `arrow-up`/`arrow-down` + "Cùng kỳ 39 phiếu" / "12% so với 114.600.000". Màu
      chữ `--ash`; chỉ số NỢ QUÁ HẠN tăng mới đỏ (`--signal`). Tắt so sánh thì dòng này biến mất.
    - Logic DÙNG LẠI, không viết mới: tách `LoaiKy`, `LOAI_KY`, `tinhKy`, `luiNam`, `homNayVN`,
      `congNgay`, `soNgay`, `TRAN_KHOANG_NGAY` từ `pages/khachHangSo.ts` ra `utils/ky.ts`, và phần
      nút + hai ô ngày + ô tích + nhãn từ `khachHangThongKe.tsx` ra component `components/ChonKy.tsx`
      (Thống kê khách hàng chuyển sang dùng nó, hành vi giữ nguyên). Kỳ đang chọn nhớ theo màn trong
      phiên (biến cấp module như `nho` hiện tại), mở lại màn không về "Tháng này".
    - Số cùng kỳ: frontend gọi CÙNG endpoint lần hai với `luiNam(tu)`/`luiNam(den)` (29/02 → 28/02,
      khớp `lui_nam` phía máy chủ) — không cần endpoint so sánh riêng.
    - Kỳ ở đây là kỳ LỊCH để XEM. Kỳ khoá sổ vẫn ở Báo cáo công nợ (nơi đó bỏ nút nhanh từ 04/09
      vì kỳ kế toán tự đặt khi khoá) — xem "Để ngỏ" mục 8.
18. **Bộ lọc nâng cao (bản 3).** Thanh lọc mỗi danh sách có nút phụ **"Bộ lọc"** (icon Lucide
    `sliders-horizontal`), đang áp n điều kiện thì mang viên số n nền charcoal. Bấm mở **bảng thả
    xuống** ngay dưới thanh lọc (rộng 660px, hai cột ô; điện thoại một cột, rộng hết khung):
    - Đầu bảng "Bộ lọc nâng cao" + link "Xoá hết". Chân bảng: bên trái "Khớp 6 phiếu trong kỳ"
      (máy chủ đếm trước khi áp, chờ 350ms sau lần đổi cuối), bên phải "Đóng" / nút chính "Xem 6
      phiếu". Esc hoặc bấm ngoài = đóng, KHÔNG áp.
    - Kiểu ô: khoảng số tiền "Từ … đến Không giới hạn" (ô tiền có dấu chấm); một-trong-nhiều là nhóm
      nút liền; nhiều-trong-nhiều là viên chọn (đã chọn nền charcoal + dấu ✓ Lucide); người / tài
      khoản là ô chọn có tìm.
    - Đã áp: MỖI điều kiện thành một chip đặc trên thanh lọc "Số tiền: **từ 5.000.000** ×",
      "Nguồn: **Đơn mua** và **Khác** ×"; bấm chip mở lại bảng ở đúng ô đó; có link "Xoá hết".
      Chip thay hẳn các chip viền đứt "+ Hình thức", "+ Nguồn chi" của bản 2 (gom về một chỗ).
    - Trạng thái lọc + kỳ ghi lên URL (`?ky=nam&so=1&tien_tu=5000000&nguon=po,khac`) để gửi link
      cho người khác thấy đúng danh sách đó; tải lại trang không mất lọc.
    - Danh sách trường theo từng màn ghi ở PC-1, PT-1, NPT-1, NPTh-1. Tài khoản ngân hàng: ít dòng,
      KHÔNG có bộ lọc nâng cao, chỉ có kỳ.
    - Mọi lọc chạy ở MÁY CHỦ (phân trang và tổng theo đúng bộ lọc), không lọc trong JS.

**CSS**: các lớp `acct-*`, `pay-*`, `purchase__*`, `rc-drawer*`, `md-page*` dùng chung với Đơn mua
hàng, Phiếu mua hàng, Yêu cầu mua, Lương, Báo cáo công nợ (trên 20 màn). KHÔNG sửa các lớp đó. Năm
màn này chuyển sang một tệp riêng `pages/ke-toan/ke-toan.css` với tiền tố `kt-`; lớp chung cũ để
nguyên cho các màn kia.

---

## Phần B — Phiếu chi

Người dùng: kế toán, thủ quỹ. Việc chính: tra phiếu đã chi, in phiếu, bổ sung hoá đơn còn thiếu,
hủy phiếu ghi nhầm. Luật giữ nguyên: lập phiếu = tiền đã ra khỏi két; không sửa, sai thì hủy (có
lý do) rồi lập lại.

### Màn PC-1 — Danh sách

Hiện tại: tab "Tất cả | Đã chi | Đã hủy" không có số; dải "Gia công chờ chi" vàng cả khối, mỗi dòng
một nút rust ngang hàng nút "+ Tạo phiếu chi"; cột "Lập lúc" là giờ tạo; không có cột Nội dung
(muốn biết chi cho việc gì phải mở từng phiếu); máy chủ đã trả sẵn tổng tiền nhưng không hiện.

Thiết kế mới (khung trang mục A.16):
- Đầu trang: "Phiếu chi" — "Sổ tiền ra: mọi phiếu chi tiền mặt và chuyển khoản." — nút "Lập phiếu
  chi".
- **Thanh chọn kỳ** (A.17) ở trên cùng. Mọi số trên thẻ lọc và bảng theo kỳ đang chọn (lọc theo
  `voucher_date` — ngày chứng từ, không phải giờ tạo).
- **Thẻ lọc**: *Tất cả 44 (phiếu trong kỳ; cùng kỳ 39)* — *Đã chi 128.450.000 đ (42 phiếu; ↑ 12% so
  với 114.600.000)* — *Thiếu chứng từ 5 (chưa có hoá đơn hoặc biên nhận)* — *Gia công chờ chi 18.600.000 đ (3 việc đã chốt)* — *Đã hủy 2*.
- **Gia công chờ chi** là một thẻ lọc, KHÔNG còn băng chiếm đầu trang: bấm thẻ thì bảng đổi sang
  hàng chờ (Nhà gia công + lệnh | Việc | Số chốt | Chốt bởi + ngày | Thành tiền | nút phụ "Lập phiếu
  chi"), kèm một câu "Việc thuê ngoài đã chốt số lượng, chưa trả tiền. Lập phiếu chi xong thì việc
  rời khỏi danh sách này."
- **Thanh lọc**: ô tìm "Tìm mã phiếu, người nhận, nội dung, mã đơn mua" — nút **"Bộ lọc"** (A.18)
  — các chip điều kiện đã áp — "Xoá hết" — bên phải "6 phiếu".
- **Bộ lọc nâng cao Phiếu chi**: Số tiền (khoảng) — Hình thức (Tất cả | Tiền mặt | Chuyển khoản) —
  Nguồn chi (nhiều: Đơn mua, Gia công, Tạm ứng lương, Khác; máy chủ đã có `source_type`) — Trả từ
  tài khoản (`company_bank_account_id`) — Người nhận (tìm tên) — Người lập (`created_by_user_id`) —
  Chứng từ (Tất cả | Đã có | Còn thiếu).
- **[API đọc]** `GET /api/accounting/payment-vouchers` thêm tham số: `tu_ngay`, `den_ngay` (trên
  `voucher_date`, kiểm bằng `_khoang_ngay` sẵn có), `tien_tu`, `tien_den`, `payment_method`,
  `source_type` nhận NHIỀU giá trị, `company_bank_account_id`, `created_by_user_id`, `co_chung_tu`
  (true/false — EXISTS trên bảng đính kèm). `totals` và số đếm từng thẻ tính theo cùng bộ lọc. Thêm
  `dem_only=true` trả mỗi số đếm cho chân bảng lọc "Khớp n phiếu". Không đổi DB.
- **Bảng** (thứ tự theo cách đọc: ai — bao nhiêu — xong chưa — vì đâu — khi nào — mã): Chi cho
  (người nhận đậm, dưới là nội dung, cắt "…") | Số tiền (phải; dưới là "Chuyển khoản"/"Tiền mặt",
  ngoại tệ thì thẻ [USD 1.200] cạnh chữ "tỷ giá 25.400") | Trạng thái (pill; dưới là "Thiếu chứng từ" amber có
  icon kẹp giấy) | Nguồn (loại, dưới là mã: "Đơn mua" / "DMH-…") | Ngày chi | Mã phiếu (xám) | ›.
- Rỗng: "Chưa có phiếu chi nào" + nút "Lập phiếu chi" / "Không có phiếu nào khớp bộ lọc" + "Bỏ lọc".

### Màn PC-2 — Ngăn chi tiết phiếu chi

Hiện tại: 3 tab; nhiều trường đã nhập lúc lập KHÔNG hiện ở đâu (số hoá đơn, ngày hoá đơn, số hợp
đồng, ghi chú, CCCD, chi nhánh); "Đợt thanh toán" lặp đúng chữ "Nguồn chi"; mã đơn mua là chữ trơn;
"Ghi nhận đã chi" trùng "Lập phiếu".

Thiết kế mới (khuôn ngăn chung mục A.5, độ rộng chung 920px, kéo rộng được):
- Đường dẫn "Phiếu chi > UNC-261005-X7K2" + nút chép mã; ↑ ↓ | mở rộng | ✕.
- Tiêu đề = người nhận ("Giấy Bình Minh") + pill "Đã chi"; bên phải "In phiếu", "In bảng kê" (chỉ
  phiếu tạm ứng lương), "⋯" → "Hủy phiếu" (đỏ, dòng phụ "Phiếu còn trong sổ với dấu Đã hủy"). Không
  hủy được thì mục mờ kèm lý do: "Phiếu đã có phiếu thu lại — hủy phiếu thu trước" / "Kỳ lương đã
  chốt".
- **Số tiền** 26px + bằng chữ. Không ghi "quy đổi" khi đã là VND.
- Dải tóm tắt: Ngày chi — Hình thức — Nguồn (link: đơn mua `DMH-…` → màn Đơn mua; gia công → lệnh
  sản xuất) — Người lập.
- **Tab Chi tiết**: "Thông tin phiếu" (Nội dung chi, Người nhận, địa chỉ + giấy tờ nếu tiền mặt, Mã
  giao dịch ngân hàng, Hoá đơn số + ngày, Số hợp đồng, Ghi chú; ô trống không hiện dòng) — "Dòng
  tiền" (Trả từ tài khoản → số tiền → Tài khoản người nhận; tiền mặt thì "Quỹ tiền mặt → người
  nhận") — "Trả cho đợt giao" (đợt, ngày giao, hàng; Giá trị đợt — Trừ cọc — Phiếu này — Còn nợ;
  thẻ "Đợt đã trả đủ") + link "Mở đơn mua". Đã có phiếu thu lại: dải "Đã thu lại 1.000.000 đ —
  PT-261007-K2M9" (link).
- **Tab Chứng từ (n)**: như A.5; xoá tệp → "Đã xoá hoá đơn.jpg — **Hoàn tác**" 8 giây (máy chỉ gọi
  xoá thật khi hết hạn — tệp xoá trên kho là mất hẳn). Phiếu đã hủy: chỉ xem. Phiếu chưa có chứng
  từ thì tab ghi "Chứng từ 0" và ô kéo-thả nói "Chưa có chứng từ. Kéo ảnh biên nhận vào đây".
- **Tab Lịch sử (n)**: Lập phiếu, Thêm/Xoá chứng từ (kèm tên tệp), Hủy phiếu (kèm lý do trong hộp
  xám). Bỏ mục "Ghi nhận đã chi".
- Phiếu đã hủy: băng xám dưới dải tóm tắt "Đã hủy ngày …, lý do: …" — một lần, mọi tab đều thấy.

### Màn PC-3 — Lập phiếu chi (lập rời, không theo đơn mua)

Hiện tại: Ngày đứng đầu một mình nửa hàng; thiếu Ghi chú, đính kèm; không nhắc "lập xong không sửa
được"; nút "Lưu phiếu" nền đen.

Thiết kế mới (ngăn độ rộng chung A.5, kéo rộng được; thứ tự theo cách người ta nghĩ: chi cho ai → bao nhiêu →
vì sao → trả bằng gì → khi nào). Form chia nhóm có tiêu đề nhỏ in hoa + vạch mảnh: "CHI CHO AI, BAO
NHIÊU" — "TRẢ BẰNG" — "KHI NÀO". Ô số tiền cao 52px chữ 20px đậm, hậu tố "đ". "Trả bằng" là HAI THẺ
CHỌN (vòng icon + tên + một dòng giải thích: "Tiền mặt — Thủ quỹ chi và người nhận ký phiếu";
"Chuyển khoản — Ghi tài khoản hai bên"), thẻ chọn viền charcoal đủ cạnh, vòng icon đen.
1. **Chi cho** * (người, đơn vị nhận tiền).
2. **Số tiền** * — ô tiền có dấu chấm hàng nghìn (dùng `OTien` của Tài sản), dưới ô hiện bằng chữ.
3. **Nội dung chi** * — gợi ý "VD: Tiền điện tháng 9 xưởng in".
4. **Trả bằng**: nút chọn "Tiền mặt | Chuyển khoản". Tiền mặt → "Địa chỉ người nhận", "Giấy tờ
   (CCCD)" gấp trong "Thêm thông tin người nhận". Chuyển khoản → "Trả từ tài khoản" * (chỉ tài khoản
   công ty đang dùng để chi; không có thì câu "Chưa có tài khoản công ty dùng để chi — thêm ở Tài
   khoản ngân hàng" kèm link) + khối "Tài khoản người nhận" (Chủ tài khoản *, Số tài khoản *, Ngân
   hàng *, Chi nhánh).
5. **Ngày chi** * — mặc định hôm nay (giờ máy), không cho sau hôm nay.
6. Gấp "Thêm chi tiết": Số hoá đơn, Ngày hoá đơn, Ghi chú, Chứng từ đính kèm.
- Chân: dòng xem trước "Chi **5.200.000 đ** tiền mặt cho **Điện lực Thuận An**. Lập xong không sửa
  được, chỉ hủy được." — "Đóng" — **"Lập phiếu chi"** (rust).

### Màn PC-4 — Lập phiếu chi theo đơn mua (mở từ màn Đơn mua hàng)

Hiện tại: dải 4 ô chữ 10px; phiếu VND tiền mặt vẫn bắt nhìn ô "Loại tiền", "Tỷ giá"; ô "Đợt thanh
toán" chỉ hiện khi đặt cọc mà lúc đó luôn bị khoá; nút "Thanh toán" bị khoá, lý do giấu trong
tooltip; cảnh báo cọc trùng bảo "sửa đúng phiếu đó" trong khi phiếu không sửa được.

Thiết kế mới:
- Đầu: đường dẫn "Lập phiếu chi > DMH-261003-7QW2", tiêu đề "Giấy Bình Minh". Dải 4 ô nền `--paper`: Giá trị đơn — Hàng đã
  giao — Đã chi — **Còn được chi** (đậm).
- **Chi để**: hai thẻ chọn "Trả tiền hàng đã giao" / "Đặt cọc, ứng trước". Đơn chưa có đợt giao
  thì thẻ đầu vẫn hiện nhưng có dòng giải thích ngay dưới: "Đơn chưa nhận đợt hàng nào — chỉ đặt
  cọc được."
- Trả tiền hàng: chọn **Đợt giao** * dạng danh sách có nút tròn (mỗi đợt một dòng: "Đợt 2 — giao
  28/09, hoá đơn 0004571 — còn nợ 45.200.000"; đợt đã trả đủ mờ, thẻ "Đã trả đủ"); chọn đợt thì Số
  tiền tự điền bằng số còn nợ, sửa được, không vượt. Chân: "… Đợt này sẽ trả đủ." khi số = còn nợ.
- Đặt cọc: bỏ ô "Đợt thanh toán" khoá. Đã có phiếu cọc → "Đơn đã có 1 phiếu đặt cọc 10.000.000 đ
  (PC-261001-A1B2). Cọc thêm thì lập tiếp; cọc nhầm thì hủy phiếu đó rồi lập lại."
- Số tiền: mặc định VND. Link nhỏ "Trả bằng ngoại tệ" mới mở Loại tiền + Tỷ giá + "= … đ".
- Phần còn lại giống PC-3 (Trả bằng, Ngày chi, Thêm chi tiết có Số hợp đồng).

### Màn PC-5 — Lập phiếu chi gia công

Hiện tại: khuôn `ns-modal` của Nhân sự, hình thức chi là hộp thả (hai form kia là nút chọn), không
Esc. → Dùng đúng khung PC-3, đầu ngăn có dải chỉ đọc "Nhà gia công — Việc — Số chốt × Đơn giá =
Thành tiền"; Số tiền điền sẵn thành tiền, gợi ý "Sửa theo số thật đã trả".

### Màn PC-6 — Hủy phiếu

Hiện tại: hộp ngăn kéo 640px riêng; nút xác nhận bấm được khi chưa có lý do, lỗi rơi ra sau lớp
phủ; ba nhãn cho một việc.

Thiết kế mới: khung viền đỏ nhạt ở ĐẦU tab Chi tiết của ngăn (như "Thôi dùng" của Tài sản), mở từ
"⋯" → "Hủy phiếu": icon cấm + "Hủy phiếu PC-…" — ô
"Lý do hủy" * (tự focus) — câu hệ quả "Phiếu vẫn còn trong sổ với dấu Đã hủy, in ra có chữ ĐÃ HỦY.
Cần chi lại thì lập phiếu mới." — "Đóng" / **"Hủy phiếu"** (đỏ). Thiếu lý do → lỗi dưới ô. Lỗi
từ máy chủ hiện trong khung.

### In phiếu

Giữ mẫu 02-TT. Bỏ dòng "Đợt thanh toán: Khác" cho phiếu không theo đơn mua (vô nghĩa).

---

## Phần C — Phiếu thu

Người dùng: kế toán, thủ quỹ. Phiếu thu cọc lập ở Đơn hàng bán, phiếu thu hoá đơn lập ở Công nợ
phải thu, màn này lập "thu khác" và là SỔ THU. Mọi phiếu mới ở trạng thái "Đã thu" ngay.

### Màn PT-1 — Danh sách

Đối xứng PC-1 (cùng khung, cùng thứ tự cột), chỉ khác chữ:
- Đầu trang: "Sổ tiền vào. Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu."
- Thẻ lọc: *Tất cả 32* — *Đã thu 245.000.000 đ (31 phiếu)* — *Thiếu chứng từ 3* — *Đã hủy 1*; thẻ
  **"Chờ thu"** chỉ hiện khi CÒN phiếu cũ chờ thu (đếm > 0) — phiếu mới không bao giờ vào trạng
  thái này.
- Thanh chọn kỳ như PC-1 (lọc theo `receipt_date`); thẻ lọc có dòng cùng kỳ.
- **Bộ lọc nâng cao Phiếu thu**: Số tiền (khoảng) — Hình thức — Nguồn thu (nhiều: Cọc đơn bán, Thu
  hoá đơn, Thu khác, Thu lại tiền đã chi) — Vào tài khoản — Người nộp (tìm tên) — Người lập —
  Chứng từ (Đã có | Còn thiếu). Hình thức hiện Phiếu thu chưa có trên thanh lọc — có ở đây.
- **[API đọc]** `GET /api/accounting/payment-receipts` thêm đúng bộ tham số như phiếu chi
  (`tu_ngay`/`den_ngay` trên `receipt_date`), `totals` + số đếm theo bộ lọc, `dem_only`.
- Cột: Thu của (người nộp đậm + nội dung) | Số tiền (+ hình thức) | Trạng thái | Nguồn (loại + mã,
  link) | Ngày thu | Mã phiếu | ›.
- Link nguồn "Thu hoá đơn" đang mở ĐƠN BÁN dù hiện số hoá đơn (PaymentReceiptsPage.tsx:124-136) →
  mở Công nợ phải thu, ngăn khách đó.
- Rỗng: câu hiện tại nhắc "lập từ phiếu chi nguồn" — đường đó đã gỡ. Câu mới: "Chưa có phiếu thu
  nào. Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu; khoản thu khác lập ở đây."
  + nút "Lập phiếu thu".

### Màn PT-2 — Ngăn chi tiết phiếu thu

Đối xứng PC-2 (cùng khuôn ngăn, cùng ba tab). Dải tóm tắt: Ngày thu — Hình thức — Nguồn (link) —
Người lập. Tab Chi tiết: "Thông tin phiếu" (Nội dung thu, Người nộp + địa chỉ, Đơn bán link, Mã
giao dịch ngân hàng, Ghi chú) — "Dòng tiền" (Người nộp → số tiền → Vào tài khoản / Quỹ tiền mặt) —
"Áp vào hoá đơn" (Giá trị — Trừ cọc — Phiếu này — Còn nợ; link "Mở công nợ khách này"). Tab Lịch
sử: Lập, Xác nhận đã thu (phiếu cũ), Hủy — người + giờ (`cancelled_by/at` đang có mà không hiện).
- Menu "⋯" → "Hủy phiếu", dòng phụ nói hệ quả: "Hoá đơn 0001234 sẽ quay lại còn nợ 76.000.000 đ".
  Phiếu cọc ĐÃ THU thì máy chủ không cho hủy (accounting_service.py:1952)
  nhưng nút vẫn hiện, bấm ra lỗi → mục menu mờ kèm lý do "Phiếu cọc đã thu — hủy từ đơn bán".
- Phiếu cũ "Chờ thu": nút chính "Xác nhận đã thu" mở khung tại chỗ (ô Mã giao dịch ngân hàng nếu
  chuyển khoản).
- "Sửa" chỉ còn cho phiếu cũ chờ thu từ phiếu chi; ô Mã giao dịch phải được điền lại sẵn (đang mất
  khi sửa, helpers.ts:21-33).

### Màn PT-3 — Lập phiếu thu (thu khác)

Cùng khung PC-3, thứ tự: **Thu của** * → **Số tiền** * (có dấu chấm, bằng chữ) → **Nội dung thu** *
→ **Nhận bằng** "Tiền mặt | Chuyển khoản" (chuyển khoản: "Vào tài khoản" * + "Mã giao dịch ngân
hàng" *) → **Ngày thu** * → "Thêm chi tiết" (Địa chỉ người nộp, Ghi chú, Chứng từ). Chân: "Thu
**3.000.000 đ** tiền mặt của **Nguyễn Văn An**." — "Đóng" — **"Lập phiếu thu"**.

### Màn PT-4 — Thu lại tiền đã chi (form cũ)

Đường mở từ Phiếu chi đã gỡ; form chỉ còn mở qua "Sửa" phiếu cũ. Giữ khung PT-3, nhãn hình thức
dùng chung "Tiền mặt | Chuyển khoản" (đang là "Nhập quỹ tiền mặt | Về TK ngân hàng"); số nguyên tệ
cho nhập số lẻ (đang `step=1` + làm tròn, PaymentReceiptDialog.tsx:110/291). Bỏ hẳn hay giữ: để ngỏ.

---

## Phần D — Công nợ phải trả

Người dùng: kế toán công nợ, chủ. Câu hỏi của màn: "Đang nợ ai, bao nhiêu, ai trễ nặng, trả ai
trước?" Nợ tính theo ĐỢT GIAO; hạn mức là cảnh báo, không chặn.

### Màn NPT-1 — Danh sách nhà cung cấp còn nợ

Hiện tại: dải 4 số + dải 6 ô tuổi nợ + tab "Tất cả | Quá hạn | Chưa tới hạn | Vượt hạn mức" — ba bộ
điều khiển cho cùng một thứ (tab "Quá hạn" = gộp 5 ô trễ; tab "Chưa tới hạn" = ô đầu); ô tuổi nợ
rỗng bị khoá không lời giải thích; tên tổng ba kiểu.

Thiết kế mới:
- Đầu trang: "Đang nợ nhà cung cấp nào, bao nhiêu, khoản nào trễ. Nợ tính theo từng đợt giao hàng."
- **Khối tổng quan** (QuickBooks money bar), một khối nền trắng thay cả dải số lẫn dải tuổi nợ:
  - Thanh chọn kỳ (A.17) đặt TRÊN khối tổng quan; bỏ hẳn "3 tháng gần đây" cứng.
  - Hàng số (nhãn trên, số dưới, dòng cùng kỳ dưới mỗi số): "Còn nợ tới 05/10/2026" **842.300.000
    đ** (26px; ngày = ngày cuối kỳ) — "Trong đó quá hạn" **126.500.000 đ** (đỏ) — "Mua thêm trong
    kỳ" **286.000.000 đ** — "Đã trả trong kỳ" **152.000.000 đ**. Còn nợ và tuổi nợ tính TỚI ngày
    cuối kỳ; mua thêm và đã trả tính TRONG kỳ — chọn "Năm trước" là thấy ngay nợ cuối năm trước.
  - Thanh ngang cao 12px chia đoạn theo 6 mốc tuổi nợ, khe 3px; độ dài theo số tiền; màu một họ:
    chưa tới hạn xám, trễ 1–30 ngày amber nhạt dần đậm, trễ trên 30 ngày `--signal`. Dưới thanh là
    6 ô chú thích thẳng hàng (ô màu + tên mốc, số tiền, số khoản). Bấm đoạn hoặc ô = lọc: ô đó viền
    charcoal, các đoạn khác mờ đi, thanh lọc hiện chip "Tuổi nợ: Trễ 31–60 ngày ×"; bấm lại hoặc ×
    = bỏ. Đoạn 0 đồng không vẽ.
- **Thanh lọc**: nhóm nút "Tất cả 18 | Quá hạn 4 | Vượt hạn mức 2" — ô tìm "Tìm nhà cung cấp, kể cả
  người đã trả hết" — nút "Bộ lọc" (A.18) — chip tuổi nợ và chip bộ lọc (nếu có) — bên phải "1 nhà
  cung cấp".
- **Bộ lọc nâng cao công nợ phải trả**: Còn nợ (khoảng) — Hạn trả (Tất cả | Đã quá hạn | Tới hạn
  trong 7 ngày | Trong 30 ngày) — Hạn mức (Tất cả | Dùng trên 80% | Đã vượt | Chưa đặt) — Khác: "Có
  đợt giao chưa ghi hoá đơn", "Hiện cả nhà cung cấp đã trả hết". Bỏ tab "Chưa tới hạn" (đã
  có trên thanh).
- **Bảng**: Nhà cung cấp (tên; dưới là thẻ "Đã trả hết" nếu có) | Còn nợ | Quá hạn (đỏ khi > 0) |
  Hạn trả gần nhất (ngày + "còn 3 ngày" / "trễ 12 ngày") | Đã trả trong kỳ | Hạn mức (thanh mảnh đã
  dùng / hạn mức; vượt thì chữ đỏ "Vượt 20.000.000 đ"). Bỏ cột "Đơn còn nợ" (đưa thành dòng phụ
  "5 khoản" dưới tên). Bấm dòng hoặc số đều mở ngăn; giữ cơ chế bấm số Quá hạn → ngăn lọc sẵn quá
  hạn.
- **[API đọc]** cột "Hạn trả gần nhất": máy chủ đã tính hạn từng đợt, chỉ cần trả thêm min.
- **[API đọc]** `GET /api/accounting/payables` thêm `tu_ngay`, `den_ngay` (thay khoảng 3 tháng
  cứng) và các tham số bộ lọc: `no_tu`, `no_den`, `han_tra` (qua_han | 7_ngay | 30_ngay),
  `han_muc` (tren_80 | vuot | chua_dat), `thieu_hoa_don`, `ca_da_tra_het`. Số "còn nợ tới ngày cuối
  kỳ", "mua thêm", "đã trả" DÙNG LẠI phần tính của Báo cáo công nợ (`/reports/payables?tu_ngay&
  den_ngay` đã trả đầu kỳ / phát sinh / cuối kỳ và tuổi nợ tại `den_ngay` cho từng nhà cung cấp) —
  không viết công thức thứ hai. Hạn mức và "hạn trả gần nhất" luôn theo hiện tại.

### Màn NPT-2 — Ngăn nhà cung cấp

Hiện tại: mở vào tab "Tổng quan & Hạn mức" (4 thẻ to lặp số ở đầu ngăn và banner); "Lập phiếu
chi" ở mỗi đơn dẫn RỜI màn, song song với ô tích + "Thanh toán gộp" trả ngay tại chỗ; số đếm trên tab
"Đợt còn nợ" đếm cả đợt đã trả xong; tên nhà cung cấp không dẫn sang hồ sơ dù câu dẫn bảo khai
"Số ngày cho nợ" ở hồ sơ.

Thiết kế mới (khuôn ngăn chung A.5, độ rộng chung 920px, kéo rộng được):
- Đường dẫn "Công nợ phải trả > Nhà cung cấp"; ↑ ↓ | mở rộng | ✕. Tiêu đề = tên + pill đỏ "Vượt
  hạn mức" (nếu vượt); bên phải nút phụ "Hồ sơ nhà cung cấp" (sửa hạn mức, số ngày cho nợ ở đó).
- Dải tóm tắt 4 ô: Còn nợ (16px đậm) — Quá hạn (đỏ) — Hạn mức (số + vạch mảnh đã dùng / hạn mức,
  hoặc "Chưa đặt hạn mức") — Cho nợ "30 ngày sau mỗi đợt giao". Vượt hạn mức: dải amber dưới "Đang
  vượt hạn mức 12.400.000 đ. Chỉ là cảnh báo, vẫn đặt mua được."
- Hai tab: **Còn nợ (n)** (n = số đợt CÒN nợ, sửa lỗi 7) và **Đã trả (n)**.
- Tab **Còn nợ** (mặc định): "Tất cả | Quá hạn" lọc tại chỗ (đợt còn nợ của MỘT nhà cung cấp là tập nhỏ, đã nạp đủ để đếm và tích chọn) + câu dẫn "Tích các đợt muốn trả rồi
  bấm Trả ở thanh dưới."; nhóm theo đơn mua — đầu nhóm "DMH-…
  (link mở đơn) — thẻ [Cọc 10.000.000] — "Đã trừ 6.000.000" — "Còn 4.000.000" — bên phải "còn nợ
  X" (mỗi mẩu đứng riêng, không nối bằng dấu). Bảng: ☐ | Đợt | Ngày giao | Hoá đơn (số + biểu tượng tệp) | Hạn trả (ngày + thẻ "Trễ 12
  ngày") | Giá trị | Đã trả | Trừ cọc | Còn nợ. Ô ☐ ở tiêu đề = chọn hết đợt còn nợ. Đợt không chọn
  được ("Cả đơn", đơn cũ không theo đợt) hiện ô ☐ mờ + chú thích khi rê "Đơn cũ không theo đợt —
  lập phiếu từ màn Đơn mua". Bấm dòng đợt (ngoài ô ☐) → **Hàng của đợt** mở dạng khối gấp ngay dưới
  dòng (không popup chồng thêm lớp).
- Bỏ nút "Lập phiếu chi" từng đơn (rời màn). Mọi lần trả đi qua chọn đợt → chân ngăn đổi thành
  **thanh tối** (nền charcoal) "Đã chọn 3 đợt **94.900.000 đ** — Bỏ chọn — **Trả 3 đợt**" (Ramp);
  dòng đã tích nền `--rule-hair`. Thanh chỉ hiện ở tab Còn nợ và khi có ít nhất một đợt được tích.
- Tab **Đã trả**: "Trong kỳ | Tất cả" (kỳ = kỳ đang chọn ở danh sách, mặc định "Trong kỳ") + thẻ
  [12 lần trả] cạnh "Tổng 420.000.000 đ"; bảng Ngày trả | Mã phiếu (link) | Đơn mua và đợt (thẻ
  "Đợt 2" / "Đặt cọc") | Hoá đơn | Người lập | Số tiền; phân trang
  máy chủ ("Xem thêm" gọi máy chủ, không cắt mảng).

### Màn NPT-3 — Trả nhiều đợt (thanh toán gộp)

Hiện tại: mở trong ngăn, Esc đóng cả ngăn; lỗi gom một băng.

Thiết kế mới: ngăn CHỒNG lên (lớp trên, Esc chỉ đóng lớp này, có nội dung đang gõ thì hỏi). Đầu:
"Trả 3 đợt cùng lúc" (đường dẫn "Giấy Bình Minh > Trả 3 đợt"; tổng tiền ở chân ngăn). Bảng nhỏ chỉ đọc 3 đợt. Câu "Mỗi đợt ra một phiếu
chi riêng, số tiền đúng bằng còn nợ của đợt." Tiếp theo đúng khung PC-3 từ bước "Trả bằng"
(người nhận / tài khoản người nhận điền sẵn tên nhà cung cấp). Chứng từ đính kèm: "Gắn vào cả 3
phiếu". Nút **"Lập 3 phiếu chi"**. Lập xong: thông báo "Đã lập 3 phiếu chi" kèm link "Xem phiếu",
ngăn nhà cung cấp tự nạp lại.

---

## Phần E — Công nợ phải thu

Đối xứng TUYỆT ĐỐI với Công nợ phải trả: cùng thanh tiền nợ, cùng thứ tự cột, cùng ngăn. Người
dùng: kế toán công nợ (đi đòi, thu tiền), chủ, sale (xem khách mình).

### Màn NPTh-1 — Danh sách khách còn nợ

- Thanh chọn kỳ như NPT-1. Khối tổng quan: "Còn nợ tới [ngày cuối kỳ]" — "Trong đó quá hạn" — "Bán
  thêm trong kỳ" — "Đã thu trong kỳ", mỗi số có dòng cùng kỳ; dưới là 6 đoạn tuổi nợ.
- Tab "Tất cả | Quá hạn | Vượt hạn mức" kèm số; ô tìm "Tìm khách hàng (cả khách đã thu hết)"; nút
  "Bộ lọc".
- **Bộ lọc nâng cao công nợ phải thu**: Còn nợ (khoảng) — Người phụ trách (sale; người chỉ có phạm
  vi "của mình" thì ô này khoá ở chính họ) — Hạn thu (Đã quá hạn | Tới hạn trong 7 ngày | Trong 30
  ngày) — Hạn mức (Dùng trên 80% | Đã vượt | Chưa đặt) — Nhãn khách hàng (DB không có cột nhóm,
  dùng nhãn `customer_tags`) — "Hiện cả khách đã thu hết". **[API đọc]** `/receivables` nhận đúng bộ tham số như `/payables` cộng `phu_trach_id`,
  `nhan`; số theo kỳ dùng lại `/reports/receivables`.
- Bảng: Khách hàng (dòng phụ "4 hoá đơn"; thẻ "Đã thu hết") | Còn nợ | Quá hạn | Hạn thu gần nhất |
  Đã thu trong kỳ | Hạn mức.
- Cột "Đã thu" hiện là TỪ TRƯỚC TỚI NAY trong khi số đầu màn "Đã thu (3 tháng)" là trong kỳ — cùng
  chữ hai nghĩa. → Cả hai theo kỳ đang chọn, cột tên "Đã thu trong kỳ" (lấy từ báo cáo kỳ ở trên).
- Tải lỗi đang vẫn hiện "Chưa có khách hàng…" (AccountingReceivablesPage.tsx:190) → dòng lỗi riêng.

### Màn NPTh-2 — Ngăn khách hàng

Hiện tại: tab "Hạn mức & Điều khoản" lặp gần hết số đã có; "Đang thu ▲" là di tích; không có
đường sang hồ sơ khách để sửa hạn mức.

Thiết kế mới: giống NPT-2 (độ rộng chung 920px, kéo rộng được, hai tab).
- Đầu: tên khách + nút phụ "Hồ sơ khách hàng"; dải tóm tắt Còn nợ — Quá hạn — Hạn mức (số
  "250.000.000 đ", dòng dưới "Còn được nợ 64.000.000", vạch đã dùng) — Cho nợ "30 ngày sau hoá đơn".
- Tab **Hoá đơn còn nợ (n)**: Hoá đơn (ký hiệu + số; dòng phụ là ngày và thẻ link đơn bán [DH-0398]) | Hạn thu (thẻ "Trễ N
  ngày") | Giá trị | Trừ cọc | Đã thu | Còn nợ | nút phụ **"Thu tiền"**. Mở từ danh sách đang lọc một
  mốc tuổi nợ thì lọc sẵn hoá đơn của mốc đó (máy chủ đã trả `aging_bucket` từng hoá đơn).
- Tab **Đã thu (n)**: "Trong kỳ | Tất cả" + thẻ [9 lần thu] cạnh "Tổng …"; Ngày thu | Mã phiếu
  (link) | Áp vào (thẻ "Thu hoá đơn" / "Trừ cọc") | Hoá đơn và đơn | Hình thức | Số tiền.

### Màn NPTh-3 — Thu tiền một hoá đơn

Hiện tại: hộp giữa màn; ô tiền là ô số trần không dấu chấm; thiếu ô Ghi chú dù máy chủ nhận;
"Mã giao dịch" nhưng lỗi nói "số báo có"; không có tài khoản VND thì hộp chọn rỗng không giải thích.

Thiết kế mới: khung NGAY DƯỚI dòng hoá đơn trong ngăn (không thêm lớp): tiêu đề "Thu hoá đơn
0001234" + thẻ [Còn phải thu 32.000.000 đ]. Ô: **Số tiền** * (ô tiền to như PC-3, điền sẵn số còn nợ; nút nhanh "Thu
đủ") — **Nhận bằng** hai thẻ chọn "Tiền mặt | Chuyển khoản" (chuyển khoản: Vào tài khoản *, Mã giao
dịch ngân hàng *)
— **Ngày thu** * (từ ngày hoá đơn tới hôm nay) — "Thêm chi tiết": Người nộp (điền sẵn tên khách),
Nội dung thu (điền sẵn), Ghi chú. Chân khung: "Đóng" / **"Lập phiếu thu"**. Lập xong: dòng hoá đơn
cập nhật ngay, thông báo đáy "Đã lập PT-… — Xem phiếu".

---

## Phần F — Tài khoản ngân hàng

Người dùng: kế toán (khai), thủ quỹ và kế toán (chọn khi lập phiếu), chủ (muốn biết tiền ra vào
tài khoản nào). Hiện chỉ là danh mục, không số dư, không sổ, không xoá.

### Màn TK-1 — Danh sách tài khoản

Hiện tại: bảng 7 cột cho 1–3 dòng; nút chính màu charcoal (bốn màn kia rust); không có màn xem —
bấm dòng là vào sửa luôn, người không có quyền sửa không xem được ghi chú; "Ngừng dùng" màu đỏ như
"Đã hủy"; điện thoại cuộn ngang. **Lỗi nặng**: trang tải kèm danh sách nhà cung cấp cho tab đã bỏ
(AccountingBankAccountsPage.tsx:58-67) — người chỉ có quyền xem tài khoản (thủ quỹ) bị 403, màn báo
lỗi và ghi "Chưa có tài khoản ngân hàng".

Thiết kế mới (thẻ, Mercury):
- Đầu trang như bốn màn kia (bỏ nhãn "KẾ TOÁN" và câu phụ nhắc "tài khoản của nhà cung cấp" đã bỏ).
  Nút chính rust "Thêm tài khoản".
- Lưới thẻ (2–3 cột, điện thoại 1 cột). Mỗi thẻ: vòng tròn 40px chữ viết tắt ngân hàng ("MB",
  "VCB" — chữ, không dùng logo thương hiệu) — tên ngân hàng (đậm) + chi nhánh — pill "Đang dùng" —
  **số tài khoản** 20px, cách nhóm 4 số, nút phụ "Chép" — chủ tài khoản — hai ô "Thu trong kỳ
  +120.000.000" (xanh) / "Chi trong kỳ −86.500.000" theo thanh chọn kỳ ở đầu trang **[API đọc]** (cộng phiếu thu/chi theo
  `company_bank_account_id`, không cần cột mới) — thẻ nhỏ "Nhận tiền", "Trả tiền", "VND".
- Thẻ cuối viền đứt "+ Thêm tài khoản" (bấm như nút chính).
- Tài khoản ngừng dùng: gom cuối, nền `--paper`, chữ xám, pill xám "Ngừng dùng" (không đỏ), hai ô
  dưới đổi thành "Ngừng từ 12/08/2026" / "Phiếu cũ vẫn giữ số này".
- Rỗng: "Chưa có tài khoản ngân hàng nào. Thêm tài khoản để lập phiếu chuyển khoản." + nút.

### Màn TK-2 — Ngăn tài khoản (mới, để xem)

Bấm thẻ mở ngăn (khuôn A.5, độ rộng chung): tiêu đề "MB 9331 3466 8" + pill; nút "Sửa" + "⋯" (Ngừng
dùng / Dùng lại); dải tóm tắt Thu trong kỳ — Chi trong kỳ — Số phiếu trong kỳ — Loại tiền (kỳ = kỳ
đang chọn ở danh sách). Ba tab:
**Thông tin** (ngân hàng, chi nhánh, chủ tài khoản, dùng để, ghi chú) — **Phiếu qua tài khoản (n)**
(ngày, mã link, nội dung, +/− số tiền, "Xem thêm" gọi máy chủ; lọc theo kỳ) **[API đọc]** (chính là
tham số `company_bank_account_id` + `tu_ngay`/`den_ngay` thêm ở PC-1/PT-1) — **Lịch sử (n)**: thêm, sửa, ngừng/dùng lại
(nhật ký đã ghi 3 hành động này).

### Màn TK-3 — Thêm / sửa tài khoản

Hiện tại: ngăn rộng tới 900px cho 6 ô; "Loại tiền" gõ tự do (gõ "VN" chỉ máy chủ bắt); ô "Đang hoạt
động" nằm trong form; Esc không đóng.

Thiết kế mới (ngăn độ rộng chung, cột ô tối đa 560px canh trái): **Ngân hàng** * — **Số tài khoản** * — **Chủ tài khoản** * —
**Chi nhánh** * — nhóm "DÙNG THẾ NÀO": **Loại tiền** (nút chọn "VND | USD | Khác", mặc định VND) —
**Dùng để**: hai hàng ô tích có dòng giải thích "Nhận tiền — Hiện khi lập phiếu thu chuyển khoản",
"Trả tiền — Hiện khi lập phiếu chi chuyển khoản", phải chọn ít nhất một — Ghi chú. Bỏ ô "Đang
hoạt động" khỏi form (thành thao tác riêng). Trùng số tài khoản → lỗi ngay dưới ô Số tài khoản
"Tài khoản này đã có trong danh sách." Nút "Lưu tài khoản".

### Màn TK-4 — Ngừng dùng / Dùng lại

Hộp xác nhận một lần: "Ngừng dùng tài khoản MB 9331 3466 8? Phiếu mới sẽ không chọn được tài khoản
này. Phiếu cũ vẫn giữ nguyên số tài khoản đã ghi." — "Đóng" / "Ngừng dùng". Dùng endpoint
`toggle-active` đã có sẵn (UI chưa gọi).

---

## Lỗi thật phát hiện khi rà (sửa cùng đợt — không phải chuyện giao diện)

1. Tài khoản ngân hàng: 403 với người chỉ có quyền xem (gọi danh sách nhà cung cấp thừa).
2. Ngày mặc định theo UTC ở form phiếu chi: 0h–7h ra ngày hôm qua.
3. Phiếu thu: nút Hủy hiện với phiếu cọc đã thu, bấm ra lỗi máy chủ.
4. Phiếu thu: sửa phiếu chuyển khoản làm mất Mã giao dịch.
5. Phiếu thu: không nhập được số lẻ ngoại tệ.
6. Esc trong Trả gộp / Hàng của đợt đóng cả ngăn nhà cung cấp, mất form.
7. Số đếm tab "Đợt còn nợ" tính cả đợt đã trả xong.
8. Ngăn Công nợ phải trả không tự cập nhật (thiếu sự kiện đẩy).
9. Lỗi của hộp đang mở rơi ra banner sau lớp phủ (Hủy phiếu, Xác nhận đã thu, đính kèm, Tài khoản).
10. Ô tìm Phiếu chi/Phiếu thu: gọi máy chủ từng phím, không về trang 1.
11. Link "Thu hoá đơn" ở Phiếu thu mở nhầm đơn bán.
12. Xoá tệp đính kèm khi phiếu đã hủy vẫn được (thêm thì không).
13. Mã màu hỏng `#fffbebf` (accounting.css:710) làm thẻ "Quá hạn" mất nền.
14. Code chết: tab tài khoản nhà cung cấp (TK), hộp sửa / lập phiếu thu trên trang Phiếu chi,
    `OrderDepositQueue` không nơi nào mount.

## Không đổi

Luật nghiệp vụ (phiếu không sửa, hủy có lý do, công nợ tính theo đợt giao, hạn mức chỉ cảnh báo),
quyền RBAC, API ghi, mẫu in 01-TT / 02-TT, phân trang máy chủ ở các danh sách chính.

## Để ngỏ — chờ chủ quyết

1. **Đóng / Hủy**: đề xuất "Đóng" cho nút thoát form, "Hủy phiếu" cho huỷ chứng từ. Nếu áp thì nên
   áp cả app (hiện 170 chỗ "Hủy" là nút thoát).
2. **Số dư tài khoản**: muốn thẻ tài khoản hiện "Số dư" thì phải thêm cột số dư đầu kỳ + migration
   (ngoài phạm vi bản này). Bản này chỉ hiện thu/chi trong kỳ.
3. ~~Lọc theo ngày ở Phiếu chi/Phiếu thu~~ — ĐÃ đưa vào thiết kế bản 3 (A.17, PC-1, PT-1).
4. **Form "Thu lại tiền đã chi"** (PT-4) chỉ còn phục vụ phiếu cũ: giữ hay gỡ hẳn cùng tab "Chờ thu".
5. **Thu nhiều hoá đơn một lần** (như Trả gộp bên phải trả): cần API ghi mới — chưa làm.
6. Mô tả vai "Kế toán" trong seed ghi "sửa số dư, KHÔNG tự mở hay xoá tài khoản" nhưng không có số
   dư và quyền update lại cho thêm tài khoản — cần chủ chốt lại mô tả.
7. **Thẻ lọc lệch `UI_DESIGN.md` §4** (A.16): §4 bảo số đầu màn phải là dải pill mảnh. Bản 2 dùng
   hàng thẻ lọc cao ~76px vì mỗi thẻ đồng thời là bộ lọc (bỏ được hàng tab lặp số). Chủ duyệt thì
   sửa §4 thêm ngoại lệ "thẻ lọc"; không duyệt thì quay về dải pill + tab có số.
8. **Kỳ lịch hay kỳ khoá sổ**: thanh chọn kỳ ở các danh sách dùng kỳ LỊCH (để xem). Báo cáo công nợ
   đã bỏ nút nhanh từ 04/09/2026 vì kỳ kế toán do người dùng tự đặt lúc khoá sổ. Nếu chủ muốn danh
   sách cũng chọn được "kỳ đã khoá" (vd "Kỳ T9/2026 — đã khoá") thì thêm một mục vào nhóm nút sau.
9. **Lưu bộ lọc thành "góc nhìn"** (Linear/Stripe saved views, vd "Chuyển khoản trên 50 triệu thiếu
   chứng từ"): bản này chỉ ghi lọc lên URL; lưu tên góc nhìn theo người dùng cần bảng mới — chưa làm.

## Phạm vi khi làm

Năm màn là năm module sidebar, cộng form lập phiếu dùng chung ở Đơn mua hàng, Đơn hàng bán, Lương
→ theo luật ">5 module phải viết plan", khi được duyệt sẽ viết plan một Task một màn. Thứ tự đề
xuất: (1) khung chung `ke-toan.css` + ngăn/khung/Esc/ô tiền; (2) Phiếu chi; (3) Phiếu thu; (4) Công
nợ phải trả; (5) Công nợ phải thu; (6) Tài khoản ngân hàng; lỗi thật ở mục trên sửa kèm màn của nó.
