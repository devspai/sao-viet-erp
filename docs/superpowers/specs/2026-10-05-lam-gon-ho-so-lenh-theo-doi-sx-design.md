# Làm gọn Hồ sơ lệnh sản xuất và Theo dõi sản xuất — thiết kế

Ngày: 05/10/2026. Bản bấm thử và bảng đối chiếu từng thông tin:
`docs/mockups/lam-gon-ho-so-lenh-theo-doi-sx.html`. Đặc tả này là bản chốt; chỗ nào mockup lệch
đặc tả thì theo đặc tả.

## 1. Mục tiêu và phạm vi

Hai màn hiện là một màn bị tách đôi: chung người dùng (cả 12 vai có Theo dõi đều có Hồ sơ lệnh,
cùng phạm vi), chung bộ lọc, mỗi bên một dải 4 con số, cùng mở một khung hồ sơ, và hiểu "trễ" hai
kiểu. Hồ sơ một lệnh có 11 khối mà bước đang làm hiện ở 3 chỗ, dòng thời gian lặp 4 khối. Việc này
bỏ phần thừa, chia lại cho mỗi màn trả lời đúng một câu hỏi, và sửa các lỗi số liệu đã kiểm.

Trong phạm vi: màn Theo dõi sản xuất (`theo-doi-san-xuat`, module `theo_doi_san_xuat`), màn Hồ sơ
lệnh sản xuất (`lenh-san-xuat`, module `lenh_san_xuat`), khung hồ sơ một lệnh dùng chung.

Ngoài phạm vi: màn Kế hoạch sản xuất, Xếp lịch, Thực hiện sản xuất (bàn tổ), phiếu công nghệ PDF
(giữ nguyên, chỉ không được gãy).

Chủ dự án đã chốt 05/10/2026: đồng ý ranh giới ở mục 2, bỏ hẳn tab Theo ca.

## 2. Ranh giới hai màn

| Màn | Trả lời | Chứa lệnh nào |
|---|---|---|
| Theo dõi sản xuất | Bây giờ xưởng thế nào, máy nào đứng, lệnh nào có vấn đề | Đã phát hành và chưa rụng (luật rụng 28/09 giữ nguyên: giao đủ, lần giao cuối quá 3 ngày, không còn việc đang chạy hay tạm dừng — `bang_theo_doi._bo_lenh_da_rung`) |
| Hồ sơ lệnh sản xuất | Lệnh này là gì, đã đi qua những gì | Mọi lệnh đã phát hành (`TT_DA_XUONG_XUONG`), kể cả đã đóng từ lâu |
| Hồ sơ một lệnh | Chi tiết một lệnh | Mở từ cả hai màn, chung một khung như hiện nay |

Theo dõi không tra lệnh cũ. Hồ sơ lệnh không theo dõi trực tiếp, không đếm cảnh báo.

## 3. Màn Theo dõi sản xuất

Từ trên xuống: tiêu đề + nút đổi góc nhìn **Theo máy / Theo lệnh** (mặc định Theo máy, nhớ lựa chọn
trong `localStorage` như các màn khác), dải bất thường, hàng lọc, bảng.

Bỏ: dấu "trực tiếp", nút Làm mới, dải 4 con số, tab Kanban, tab Theo ca, tab Gantt theo lệnh, lọc
Nhóm công đoạn, Trạng thái, Ưu tiên, Công nhân, nút "Thêm bộ lọc", chọn khoảng ngày của Theo máy.

### 3.1 Dải bất thường

Một dải pill gộp (UI_DESIGN §4), sáu mục theo thứ tự cố định. Mỗi mục là số + chữ; bằng 0 thì xám
và không bấm được; bấm thì lọc bảng đang xem theo mục đó (chip đang chọn màu charcoal), bấm lại để
bỏ. Chỉ một mục được chọn một lúc. Số đếm trên toàn bộ tập lệnh còn sống trong phạm vi, KHÔNG theo
ô tìm hay ô lọc — để người ta không gõ tìm xong rồi tưởng sự cố đã hết.

| Mục | Đếm gì | Nguồn |
|---|---|---|
| lệnh trễ hạn | lệnh có cờ `tre_han` | `trang_thai.co_canh_bao` (dự kiến xong vượt hạn SX, giờ xưởng) |
| sự cố đang mở | lệnh có cờ `su_co` | cùng hàm; chỉ yêu cầu `cho_tiep_nhan` |
| việc tạm dừng | lệnh có cờ `tam_dung` | cùng hàm |
| KCS không đạt | lệnh có cờ `kcs_khong_dat` | cùng hàm; "đạt một phần" không tính |
| máy hỏng | máy có trạng thái `may_dung` | `may_trang_thai.trang_thai_may` |
| bước chưa có máy | công việc chưa xong, `loai_buoc = may`, `may_id` rỗng | `SanXuatCongViec` |

Cờ `thieu_vat_tu` KHÔNG vào dải: nó đòi chạy `can_doi()` cho mọi lệnh mỗi lần tải. Gọi
`co_canh_bao` với `den_vat_tu=None` là đúng hợp đồng sẵn có của hàm (không truyền thì không xét).

Bấm "máy hỏng" ở góc Theo máy: chỉ còn các dòng máy hỏng. Ở góc Theo lệnh: lệnh có bước chưa xong
nằm trên máy hỏng. Bấm "bước chưa có máy": Theo máy chỉ còn nhóm "Chưa có máy"; Theo lệnh chỉ còn
lệnh có bước như thế. Bốn mục cờ lệnh: Theo lệnh lọc lệnh mang cờ; Theo máy giữ máy nào có việc
(đang chạy hoặc kế tiếp) thuộc lệnh mang cờ.

### 3.2 Hàng lọc

Ô tìm (mã lệnh, sản phẩm, số đơn, khách — đúng phép `q` hiện tại, phím Ctrl+K giữ), ô Khách. Góc
Theo lệnh có thêm ô Máy. Lọc ở máy chủ, trước lượt nạp nặng (khuôn `_loc_ban` hiện có).

### 3.3 Góc Theo máy

Một bảng, mỗi máy một dòng, chia nhóm:

1. **Chưa có máy** (luôn đứng đầu khi có): mỗi công việc chưa xong, `loai_buoc = may`, `may_id`
   rỗng là một dòng. Cột Máy để "–", tình trạng "Chờ xếp máy", Đang chạy ghi mã lệnh + tên bước,
   Kế hoạch xong ghi giờ bắt đầu kế hoạch nếu có.
2. **Theo nhóm máy**: nhóm theo `may_thiet_bi.loai_may` — giá trị lấy từ danh mục `nhom_may`, không
   phải chữ tự do. Nhóm xếp theo tên, máy trong nhóm theo tên. Không hardcode tên nhóm nào.
3. **Gia công ngoài**: công việc chưa xong có `loai_buoc = thue_ngoai` (bất kể `may_id`), mỗi nhà
   gia công (`nha_cung_cap` chụp trên công việc) một dòng. Công việc này KHÔNG hiện lại trong nhóm
   máy.

Máy không có việc đang chạy, không có việc kế tiếp, tình trạng bình thường thì gập vào một dòng
"▸ N máy đang trống" ở cuối bảng, bấm để mở. Máy ngừng dùng (`active=False`) chỉ hiện khi còn nợ
việc (giữ luật C132), có thẻ "Ngừng dùng".

Cột:

| Cột | Luật |
|---|---|
| Máy | `ten`. |
| Tình trạng | Bốn trạng thái máy chủ dẫn xuất đi trước, dùng đúng nhãn `may_trang_thai.NHAN`: `may_dung` (đỏ), `bao_tri`, `khoa`, `co_phieu_sua` (vàng). Không có thì đọc công việc THẬT trên máy: có việc `running` → "Đang chạy" (xám thép); có việc `paused` → "Tạm dừng" (đỏ); không có → "Đang trống" (xám). KHÔNG dùng nhánh `dang_chay` của `trang_thai_may` — nhánh đó đọc kế hoạch Xếp lịch, không phải máy có chạy thật. |
| Đang chạy | Công việc `running`/`paused` trên máy. Việc thường: mã lệnh (bấm mở hồ sơ), GẤP nếu có, tên bước, tên sản phẩm chữ nhỏ. Việc ghép (`bai_ghep_cong_doan_id`): "Bài <mã bài>" + thẻ "N lệnh"; bấm thì bật bảng chọn lệnh (luật cũ: từ hai lệnh trở lên bắt chọn, tái dùng `tdsxChonLenh.tsx`). Hơn một việc cùng lúc trên một máy (dữ liệu bất thường) thì hiện việc đầu + thẻ "+N". |
| Sản lượng tốt | Σ `tot` các mẻ của công việc đó, "x trên `so_luong_ra` `don_vi_ra`" + thanh mảnh. Mẻ ghi khác đơn vị với `don_vi_ra` thì chỉ ghi số theo từng đơn vị, không vẽ thanh, không cộng. Việc ghép ghi thêm "(cả bài)". Đỏ khi tạm dừng. |
| Kế hoạch xong | `du_kien_ket_thuc` của việc đang chạy, giờ xưởng; trong ngày thì "HH:MM hôm nay". Không có mốc thì "–". Không tự bịa +1 giờ. |
| Kế tiếp | Tối đa 3 công việc `released` kế tiếp trên máy, xếp theo `du_kien_bat_dau` (chưa có giờ xếp cuối). Mỗi việc một thẻ 4 số cuối mã lệnh, bấm mở hồ sơ, rê chuột ra tên bước + sản phẩm. Hơn 3 thì "+N". |

Cả nhóm Gia công ngoài: Máy = tên nhà gia công (`gia_cong_ngoai.nha_cung_cap_ten`, chưa có lần gia
công thì `cv.nha_cung_cap`); Tình trạng = "Đang ở nhà gia công" khi lần gia công của công việc đã có
`mang_di_luc`, ngược lại "Chờ mang đi"; Sản lượng "–"; Kế hoạch xong = `du_kien_ket_thuc`. Nhóm này
gồm công việc chưa xong có `loai_buoc = thue_ngoai` hoặc `gia_cong_ngoai_id` khác rỗng. Đọc bảng
`gia_cong_ngoai` bằng MỘT câu cho cả lô.

### 3.4 Góc Theo lệnh

Mỗi lệnh còn sống một dòng. Cột: **Lệnh** (mã, GẤP) · **Sản phẩm** (tên + số lượng đặt, đơn vị chữ
nhỏ) · **Khách** · **Đang ở** (dải chặng nhỏ `danh_sach.chang` + tên bước hiện tại + "bước i trên
n"; lệnh đã xong sản xuất thì ghi khâu: Đang KCS / Chờ nhập kho / Sẵn sàng giao) · **Hạn SX** (kèm
"dự kiến dd/mm" màu đỏ khi trễ) · **Vấn đề** (pill đỏ cho từng cờ trong 4 cờ ở 3.1; trễ ghi "Trễ N
ngày").

Sắp: số cờ giảm dần → GẤP trước → hạn SX tăng dần → mã. Không phân trang ở mức mặc định (tập còn
sống, cùng giả định với Kanban hiện nay); quá 200 dòng thì cắt và ghi "Hiện 200 trên N lệnh, thu
hẹp bằng ô tìm" — không phân trang giả ở trình duyệt.

### 3.5 Trạng thái màn

Đang tải lần đầu: khung xám, không hiện số 0. Tải lại theo realtime: giữ nội dung cũ, thay khi lượt
mới về. Lỗi: một dòng báo + nút Thử lại. 403: báo thiếu quyền "Theo dõi sản xuất". Rỗng: nói rõ
vì sao (chưa có lệnh nào đang chạy / bộ lọc không ra kết quả + nút Bỏ lọc). Giữ đúng khuôn trạng
thái đang có, chỉ gom về một chỗ thay vì chép tay ở 4 tab.

## 4. Màn Hồ sơ lệnh sản xuất

### 4.1 Danh sách

Từ trên xuống: tiêu đề + "N lệnh", hàng lọc, 4 tab, bảng, chân bảng chuẩn `PhanTrangDayDu`.

Bỏ: chip "Chỉ xem" (cả ở hồ sơ), dòng phụ dưới tiêu đề, 4 KPI và dòng chú, lọc Nhóm công đoạn, Máy,
Ưu tiên, nút gạt "Chỉ lệnh trễ", "Vừa cập nhật HH:MM", gợi ý "Vuốt ngang".

Hàng lọc: ô tìm (`q` như cũ), ô Khách (mới, `khach_hang_id`), một ô khoảng ngày **Hạn SX** (gộp
hai ô từ/đến hiện có thành một ô chọn khoảng, cùng cột `han_hoan_thanh_sx`).

Tab (facet theo `dem_theo_tab`, cùng ngữ nghĩa hiện tại: đổi lọc thì số đổi, đổi tab thì đứng yên):

| Tab | Gồm |
|---|---|
| Tất cả | mọi lệnh khớp lọc |
| Đang sản xuất | chưa giao đủ, chưa xong mọi công việc |
| Sau sản xuất | chưa giao đủ, sản xuất đã xong: Đang KCS, Chờ nhập kho, Sẵn sàng giao |
| Đã giao đủ | `giao_du` |

Tab mới tính bằng hàm KHÂU (mục 5.2), không qua cờ cảnh báo: lệnh có sự cố vẫn ở đúng khâu của
nó; cảnh báo là việc của Theo dõi.

Cột (tĩnh, không cột nào cần đường găng hay cân đối vật tư):

| Cột | Nguồn |
|---|---|
| Lệnh | `ma` (bấm mở hồ sơ), thẻ GẤP |
| Sản phẩm | `ten` |
| Số lượng | `so_luong_dat` + `don_vi_tinh`, căn phải |
| Khách | tên khách |
| Đơn | `order_no` |
| Hạn SX | `han_hoan_thanh_sx` |
| Trạng thái | pill khâu (Đang sản xuất xám thép / chi tiết khâu sau SX vàng / Đã giao đủ xanh) + thẻ "Đã đóng lệnh" khi `lsx.trang_thai = da_dong` |

Sắp: tab Đang sản xuất và Sau sản xuất giữ thứ tự cũ (GẤP → hạn SX tăng → mã). Tab Tất cả và Đã
giao đủ: hạn SX GIẢM dần → mã, để lệnh mới nhất ở trên — danh sách tra cứu xếp tăng dần thì trang 1
toàn lệnh cũ.

### 4.2 Hồ sơ một lệnh

Lớp phủ như hiện nay (`LenhSxHoSoView`), mở từ cả hai màn, Esc / Quay lại để đóng. Phần đầu dính
khi cuộn (màn rộng), gồm:

- Hàng tiêu đề: Quay lại · mã · pill khâu · "Đã đóng lệnh" nếu có · GẤP · tên sản phẩm · nút **In
  phiếu công nghệ** bên phải.
- Hàng thẻ nhỏ: Khách · Đơn (bấm sang đơn) · Phiên bản · Nhóm (tên nhóm, "N lệnh") khi lệnh thuộc
  nhóm. Không nối bằng dấu "·": thẻ nhãn + giá trị, cách bằng khoảng trống.
- Băng QR "Phiếu giấy là bản vX, lệnh hiện tại đã là vY" — giữ nguyên, chỉ khi mở bằng `#lsx=&pv=`.
- **Dòng cảnh báo**, mỗi cờ đang bật một dòng có việc cụ thể, theo thứ tự `CO_CANH_BAO`:
  sự cố đang mở (mã, máy, bộ phận hỏng, mô tả, từ lúc nào, "máy dừng" nếu `may_dung`) · KCS không
  đạt (lô nào, lúc nào) · thiếu vật tư (số mặt hàng thiếu, bấm nhảy tới mục Vật tư). Trễ và tạm
  dừng không có dòng riêng — đã hiện trong ô Hạn và ô Tiến độ. Sự cố đã có phiếu sửa chưa xong:
  dòng màu vàng "Đang sửa, phiếu <mã>", không đỏ (cùng luật `_co_su_co_dang_mo`).
- **Ba ô tổng quan**:
  - Tiến độ: tên bước hiện tại + "bước i trên n", thanh, phần trăm + "đo theo sản lượng đã ghi"
    hoặc "ước theo thời lượng kế hoạch vì chưa ghi sản lượng" (`tien_do.uoc_tinh`). Thanh đỏ khi
    tạm dừng. Lệnh xong sản xuất: ghi khâu.
  - Hạn xong sản xuất: `han_hoan_thanh_sx`; dòng dưới "Dự kiến xong dd/mm, kịp" / "trễ N ngày"
    (đỏ) / "Chưa đủ dữ liệu để dự kiến" / "Đã xong sản xuất".
  - Đã giao khách: `tien_do.da_giao` trên `so_luong_dat`; dòng dưới hạn giao khách.
- Hàng neo 5 mục: Công đoạn · Quy cách · Vật tư · Sau sản xuất · Nhật ký.

Bỏ khỏi đầu hồ sơ: ô Bước hiện tại (gộp vào Tiến độ), ô Sản lượng tốt (đang cộng tờ in với thành
phẩm), ô Giờ máy (vào cột Thực tế từng bước), toàn bộ cờ cạnh pill.

#### Mục Công đoạn

Một bảng từ `routing.nodes`, theo thứ tự `lop` rồi `thu_tu`. Cột: Bước (số thứ tự + tên; thẻ "Bài
ghép <mã>" khi `la_buoc_ghep`; thẻ "Song song" khi cùng `lop` với bước khác) · Trạng thái · Máy,
người (`may` hoặc `to`, hoặc thẻ "Gia công ngoài" + `nha_cung_cap`; kèm `nguoi`; bước máy chưa có
máy ghi đỏ "Chưa có máy") · Kế hoạch (`du_kien_bat_dau` → `du_kien_ket_thuc`) · Thực tế (mẻ đầu →
`hoan_thanh_luc` hoặc "đến nay"; chưa có thì "chưa bắt đầu") · Tốt, hỏng (Σ mẻ của `cong_viec_id`
đó, gộp theo đơn vị — khác đơn vị thì ghi từng đơn vị) · Vào → ra (`so_luong_vao don_vi_vao →
so_luong_ra don_vi_ra`).

Bấm một dòng có dữ liệu để mở ra dòng chi tiết: các mẻ sản lượng của bước (giờ, tốt, hỏng, mô tả
lỗi), các lần giao/rút người, đổi máy (`nhan_luc.lich_su` lọc theo `cong_viec_id`), sự cố của bước,
khuôn (`khuon_be_ma`, đã nhận chưa) nếu `can_khuon`. Bước ghép ghi một câu: "Số trên dòng này là của
cả ca in ghép, không riêng lệnh này."

Khối "Tổ, máy, người" và "Sản lượng theo lượt ghi" cũ không còn: nội dung nằm ở cột và ở dòng mở ra.

#### Mục Quy cách

Lưới 4 cột, 8 ô hiện sẵn: Giấy · Định lượng · Khổ tờ in · Cách in (`quy_cach_in`) · Số màu
(`so_mau_a`/`so_mau_b`) · Con trên tờ · Số tờ in (`so_to_ke_hoach`) · Số kẽm. Nút "Xem đủ thông
số" mở 9 ô còn lại: Khổ nguyên · Khổ thành phẩm · Mực (`muc_a`/`muc_b`) · Số trang · Trang mỗi tay
· Số mảnh xả · Số tờ nguyên · Loại lệnh · Người bán. Ô trống (`None`) không hiện. Ghi chú kỹ thuật
hiện dưới lưới khi có. Bàn giao lúc, tạo lệnh lúc chuyển sang Nhật ký.

#### Mục Vật tư

Một bảng, ba nút lọc thay cho ba bảng: **Bước đang làm** (`vat_tu.hien_tai.dong`) · **Bước sắp tới
đang thiếu** (`vat_tu.canh_bao_sau`) · **Kho đã cấp** (`vat_tu.da_cap`), mỗi nút kèm số dòng. Mặc
định chọn nút đầu tiên có dòng. Giữ nguyên ba câu hỏi máy chủ đang trả lời; chỉ không bày một dòng
ở hai bảng cùng lúc. Cột: Mặt hàng (`hang_ten`) · Bước (`ten_viec`) · Cần (`nhu_cau_hien_thi`) · Đã
cấp · Thiếu (đỏ khi > 0) · Tình trạng (nhãn tiếng Việt của `trang_thai` màu cân đối). Tồn kho, đang
lĩnh, ngày cần không hiện ở đây — là việc của Kế hoạch vật tư.

#### Mục Sau sản xuất

Ba khung cạnh nhau (xếp dọc trên điện thoại):

- **KCS lần cuối**: các lô có `la_kcs_cuoi` — lúc, nhận, đạt, không đạt, kết luận (nhãn tiếng Việt),
  ghi chú. Lô giữa chuyền không hiện ở đây (đã có trong dòng mở ra của bước). Rỗng: "Chưa kiểm lần
  cuối."
- **Nhập kho**: `kho.yeu_cau` — mã, lúc, đề nghị, kho nhận, trạng thái. Rỗng: "Chưa đề nghị nhập kho."
- **Giao hàng**: "đã giao trên đặt"; nút **Tạo yêu cầu giao hàng** chỉ khi `giao_hang.co_the_giao`
  và người xem có quyền giao hàng (giữ điều kiện hiện tại). `don_vi_lech` thì ghi rõ không cộng được.

Lệnh thuộc nhóm (`so_lenh_trong_nhom > 1`): khung Nhập kho và Giao hàng có thẻ "Cả nhóm, N lệnh",
khung KCS có thẻ "Riêng lệnh này".

#### Mục Nhật ký

`timeline` của máy chủ, mới nhất ở trên. Nút lọc: Tất cả · Phát hành, đóng lệnh (`phat_hanh`) ·
Chạy máy (các loại phiên: bắt đầu, tạm dừng, tiếp tục, kết thúc) · Người, máy (`giao_nguoi`,
`rut_nguoi`, `doi_may`) · Sự cố (`su_co`) · Kho (`de_nghi_nhap_kho`, `kho_nhan`). Nút bật/tắt riêng
"Sản lượng, KCS" (`san_luong`, `kcs`), mặc định TẮT vì hai loại này đã có bảng. Loại lạ (máy chủ
thêm sau) chỉ hiện ở Tất cả. Dòng: giờ · người · nội dung.

#### Bỏ hẳn

Khoảng 15 câu chú thích giải thích số. Ba câu bắt buộc còn lại đứng tại chỗ: "ước theo thời lượng",
"số của cả ca in ghép", "cả nhóm, N lệnh". Câu nào khác còn cần thì vào tooltip của nhãn.

## 5. Máy chủ

Không bảng mới, không cột mới, không migration. `docs/DB_SCHEMA.md` không đổi.

### 5.1 `/api/theo-doi-san-xuat`

| Đường | Việc |
|---|---|
| `GET /meta` | Xoá. |
| `GET /kanban` | Xoá. |
| `GET /theo-ca` | Xoá (cùng `_ca_cua_moc`, `_cua_so_ngay_xuong`, `_khung_ca`, `_viec_theo_ca_dict`… chỉ phục vụ nó; `attendance_repo`/`xep_lich_service` chỉ nhắc trong docstring, sửa chữ). |
| `GET /gantt` | Xoá. |
| `GET /bo-loc` | Còn hai nhóm: `may`, `khach_hang`. |
| `GET /theo-may` | Viết lại theo 3.3. Tham số: `q`, `khach_hang_id`, `bat_thuong`. Bỏ `tu`/`den`, `may_id`, các lọc đã bỏ. Trả `{nhom: [{loai, ten, dong: [...]}], may_trong: [...], bat_thuong: {...}}`. |
| `GET /theo-lenh` (mới) | Theo 3.4. Tham số: `q`, `khach_hang_id`, `may_id`, `bat_thuong`. Trả `{items, total, bat_thuong}`. |

`bat_thuong` (tham số) nhận một trong sáu khoá của 3.1, khai `Literal` để giá trị lạ ăn 422.
`bat_thuong` (trường trả về) là `{tre_han, su_co, tam_dung, kcs_khong_dat, may_hong, chua_may}`,
cùng một hàm dựng cho cả hai đường, đếm trên tập còn sống trong phạm vi TRƯỚC `q`/khách/máy và
trước chính `bat_thuong`. Nhờ vậy mỗi lượt tải chỉ một yêu cầu.

Lượt nạp của cả hai đường: tập id = `_ids_trong_pham_vi` → `_bo_lenh_da_rung` → một
`boi_canh.nap()` → `tien_do.du_kien_xong` + `trang_thai.co_canh_bao(den_vat_tu=None)` cho từng lệnh
→ `may_trang_thai.trang_thai_may` cho các máy (Theo máy, và để đếm `may_hong`). Không `can_doi()`.
Số câu SQL hằng theo số lệnh — khoá bằng bài đếm câu như `test_khong_n_plus_1` hiện có.

Theo máy lấy sản lượng từ `bc.batch[cv.id]`, không câu mới. Kế tiếp lấy từ công việc `released`
của tập đã nạp.

### 5.2 `/api/lenh-san-xuat`

| Đường | Việc |
|---|---|
| `GET /summary` | Xoá cùng `danh_sach.summary`, `LenhSxSummaryOut`. |
| `GET /bo-loc` | Xoá cùng `danh_sach.bo_loc`, `LenhSxBoLocOut`. |
| `GET ""` | Sửa theo 4.1. Tham số: `tab` (`tat_ca`, `dang_sx`, `sau_sx`, `da_giao`), `q`, `khach_hang_id`, `tu_ngay`, `den_ngay`, `page`, `page_size`. Bỏ `nhom_cong_doan`, `may_id`, `uu_tien`, `tre`. Dòng trả về chỉ còn các trường của 4.1 + `khau_chi_tiet` + `da_dong`. |
| `GET /{id}` | Giữ khung 13 khối (`ho_so.KHOI`) — phiếu công nghệ gọi `ho_so(chi_khoi=...)` trên cùng khung. Chỉ bỏ ba tổng `san_luong.tong/tot/hong` (cộng mọi bước, sai); `batch` giữ. Thêm `tien_do.buoc_thu`/`so_buoc` nếu FE không tự đếm được từ `routing` (FE đếm được thì không thêm). |
| `GET /{id}/phieu-cong-nghe.pdf` | Không đổi. |

Hàm KHÂU mới ở `trang_thai.py`: `khau(bc, lsx_id) -> (khau, khau_chi_tiet)` với `khau ∈ {dang_sx,
sau_sx, da_giao}`. Dùng lại đúng các vị ngữ đang có, theo đúng thứ tự `trang_thai_chinh` nhưng BỎ
nhánh cảnh báo: `_da_giao_het` → `da_giao`; `_co_ton_thanh_pham` → `sau_sx`/"Sẵn sàng giao";
`_kcs_dat_cho_nhap` → `sau_sx`/"Chờ nhập kho"; `_dang_o_kcs` → `sau_sx`/"Đang KCS"; còn lại
`dang_sx`. Không đổi `trang_thai_chinh` (đơn hàng bán đang dùng qua `danh_sach._soi`).

Danh sách mới: tầng 1 SQL như cũ (thêm `khach_hang_id`, bỏ máy/nhóm/ưu tiên); lệnh đã giao hết
tách bằng `_tach_da_giao_het` như A7; lệnh còn sống qua MỘT `boi_canh.nap()` rồi `khau()` — KHÔNG
`_den_vat_tu_co_cache`, KHÔNG `du_kien_xong`. Đây là chỗ nặng nhất của màn hôm nay bị bỏ.
`danh_sach._soi`, `buoc_hien_tai`, `chang` giữ nguyên chữ ký vì `don_hang_tien_do.py` gọi chúng; Theo
lệnh của Theo dõi dùng lại `chang` và `buoc_hien_tai`.

`danh_sach._dong` cũ và các trường `LenhSxItem` chỉ phục vụ cột tiến độ trực tiếp (`buoc_hien_tai`,
`nhom_cong_doan`, `may`, `nguoi`, `chang`, `tien_do_*`, `gio_may`, `du_kien_xong`, `canh_bao`,
`sale`, `da_giao`) chuyển sang schema dòng của `/theo-lenh` hoặc bỏ. Thêm trường nào cũng phải đi
hết chuỗi service → schema → type TS (Pydantic nuốt trường lạ im lặng).

### 5.3 Realtime

Giữ kênh SSE hiện tại, không đổi sự kiện. Mỗi màn gộp nhịp bằng `useTre` sẵn có rồi chỉ tải ĐÚNG góc
đang xem (Theo dõi: một yêu cầu `/theo-may` hoặc `/theo-lenh`; Hồ sơ lệnh: một yêu cầu danh sách).
Hồ sơ đang mở nhận nhịp ĐÃ gộp (hiện cả `LenhSanXuatPage.tsx:814` lẫn `TheoDoiSanXuatPage.tsx:518`
truyền `eventTick` thô xuống `LenhSxHoSoView`, nên mỗi sự kiện là một lượt 69–100 câu SQL). Tải lại
không chớp khung xám.

### 5.4 Quyền và phạm vi

Không đổi: hai mục thanh bên, hai ô quyền, `sale_ids` luôn từ token qua `pham_vi`. Hồ sơ mở từ Theo
dõi vẫn gọi đường của Hồ sơ lệnh, nên vai có `theo_doi_san_xuat` phải có `lenh_san_xuat` cùng phạm
vi — seed hiện đúng như vậy; thêm một bài kiểm giữ điều này trên seed.

Tổ trưởng SX không có hai quyền này là quyết định 31/08/2026 (`seed.py`, khối vai Tổ trưởng): scope
`own` trên hai màn này luôn rỗng với tổ trưởng, tổ trưởng vào lệnh qua Thực hiện sản xuất. Việc này
KHÔNG đổi. Hệ quả còn treo: QR trên phiếu công nghệ dẫn vào Hồ sơ lệnh nên tổ trưởng quét ra 403 —
ghi vào mục 9, không xử ở đây.

## 6. Giao diện

| Tệp | Việc |
|---|---|
| `pages/TdsxKanban.tsx`, `TdsxTheoCa.tsx`, `TdsxGantt.tsx`, `tdsxTimeline.ts` | Xoá. |
| `pages/TdsxTheoMay.tsx` (+ test) | Viết lại thành bảng theo 3.3. |
| `pages/TdsxTheoLenh.tsx` (mới) | Bảng theo 3.4. |
| `pages/tdsxChonLenh.tsx` | Giữ, dùng cho khối bài ghép. |
| `pages/TheoDoiSanXuatPage.tsx` | Khung màn mới: đổi góc nhìn, dải bất thường, hàng lọc, realtime một yêu cầu. |
| `pages/LenhSanXuatPage.tsx` (+ test) | Bỏ KPI, lọc thừa, tab cũ; 4 tab, 7 cột tĩnh. |
| `pages/LenhSxHoSoView.tsx` (+ test) | Dựng lại theo 4.2. Giữ chữ ký props (`lsxId`, `pv`, `eventTick`, `onClose`). |
| `pages/theo-doi-san-xuat.css`, `pages/lenh-san-xuat.css` | Theo dõi thôi mượn lớp `.hslsx__*`: lớp dùng chung của khung hồ sơ tách thành một khối riêng trong `lenh-san-xuat.css`; lớp của tab đã xoá xoá theo. Đếm định nghĩa selector trước khi xoá (bẫy CSS nhân đôi). |
| `api/client.ts` | Xoá hàm và type của 6 đường bị xoá; thêm `theoLenh`; sửa type `/theo-may`, danh sách, hồ sơ. |
| `pages/QuyTrinhKinhDoanhPage.tsx:61` | Bước "Chạy công đoạn" trỏ sang màn Thực hiện sản xuất (đúng như mô tả của bước). |

Luật giao diện phải theo: chỉ Be Vietnam Pro, token `tokens.css`; hover `--rule-hair`; chọn = viền
đủ cạnh; dải pill thay KPI; chip lọc đang chọn charcoal, nút đổi/bật màu rust; tiêu đề cột 11px chữ
hoa giãn .07em, nền `--paper`, viền 1.5px; số căn phải; không nối bằng "·"; không chữ tiếng Anh;
điện thoại: bảng cuộn ngang trong khung của nó, trang không cuộn ngang, ba ô tổng quan xếp dọc, phần
đầu hồ sơ thôi dính.

## 7. Kiểm thử

Máy chủ (pytest nhắm file, không chạy cả bộ):

- Xoá: `test_theo_doi_kanban.py`; phần Theo ca / Gantt / meta trong `test_theo_doi_may_ca_gantt.py`;
  phần summary / bo-loc trong `test_lenh_sx_api.py`. Giữ các bài phạm vi, quyền, 403/404, không lộ
  tiền, phiếu công nghệ.
- Thêm `test_theo_doi_theo_may.py`: nhóm Chưa có máy đứng đầu; gom theo `loai_may`; gia công ngoài
  không lặp ở nhóm máy; máy hỏng hiện `may_dung` dù Xếp lịch có dòng phủ giờ này; tình trạng chạy
  đọc công việc thật chứ không đọc kế hoạch; việc ghép ra MỘT dòng mang đủ lệnh; mẻ khác đơn vị
  không cộng; máy ngừng dùng hết nợ không hiện; thiếu `du_kien_ket_thuc` trả rỗng.
- Thêm `test_theo_doi_theo_lenh.py`: lệnh rụng không hiện; sắp theo số cờ; lọc `bat_thuong` từng
  khoá; `bat_thuong` không đổi theo `q`; không gọi `can_doi` (đếm câu SQL hằng theo số lệnh).
- `test_lenh_sx_trang_thai.py`: thêm bài cho `khau()` — lệnh có sự cố vẫn ở `dang_sx`/`sau_sx` đúng
  khâu; ba nhánh sau SX; giao đủ ăn trước.
- `test_lenh_sx_api.py`: 4 tab + facet; lọc khách; sắp giảm dần ở Tất cả; số câu SQL không có lượt
  cân đối vật tư.
- `test_lenh_sx_ho_so.py`: `san_luong` không còn ba tổng; phiếu công nghệ vẫn in.
- Bài seed: mọi vai có `theo_doi_san_xuat` có `lenh_san_xuat` cùng scope.

Giao diện: `npx tsc`, cập nhật test Vitest của ba trang. Rồi thao tác thật trên dev-browser, đủ
luồng: mở Theo dõi → đổi góc nhìn → bấm từng mục dải bất thường → bấm khối bài ghép, chọn lệnh →
hồ sơ mở, bấm từng neo, mở một dòng công đoạn, đổi nút lọc vật tư, bật "Sản lượng, KCS" → đóng →
sang Hồ sơ lệnh → đổi 4 tab, lọc khách, tìm → mở lệnh đã giao của nhóm. Kiểm thêm màn 375px và chế
độ tối. DB dev hiện chưa có lệnh đã phát hành nên phải dựng dữ liệu qua chính giao diện Kế hoạch SX
(không dùng API thay bước), hoặc dựng worktree DB trắng với `SEED_DEMO=true`.

## 8. Thứ tự làm

1. Máy chủ Hồ sơ lệnh: `khau()`, danh sách mới, bỏ summary/bo-loc, sửa `san_luong` + test.
2. Máy chủ Theo dõi: `/theo-may` mới, `/theo-lenh`, hàm đếm bất thường, xoá 4 đường + test.
3. Giao diện Hồ sơ lệnh (danh sách) + client.
4. Khung hồ sơ một lệnh.
5. Giao diện Theo dõi + xoá tệp tab cũ + CSS.
6. Realtime gộp nhịp, sửa link Quy trình kinh doanh, xác minh UI trọn luồng.

Mỗi bước để app chạy được (FE build xanh) trước khi sang bước sau, vì CI chạy build FE trước test
backend.

## 9. Ngoài phạm vi, ghi lại để không mất

- Màn Kế hoạch SX cho sửa chuỗi công đoạn của lệnh đã phát hành (`lsx_service.py` chỉ chặn
  `da_lap_ke_hoach`).
- QR phiếu công nghệ với tổ trưởng: cần đường vào thẻ việc ở Thực hiện SX thay vì Hồ sơ lệnh.
- "Sẵn sàng giao" của nhóm nhiều lệnh báo sớm khi một thành viên còn chạy (đã ghi ở
  `trang_thai._co_ton_thanh_pham`).
- Thiếu vật tư trong dải bất thường: chỉ thêm khi đèn vật tư có nguồn rẻ (vật chất hoá hoặc cache
  dài hơn).

## 10. Giả định đã tự chốt

- Theo máy nhóm theo `loai_may` (danh mục Nhóm máy), không theo nhóm công đoạn của việc đang chạy:
  bảng máy không có cột tổ, còn nhóm công đoạn chỉ có 4 mã hằng.
- Dải bất thường đếm toàn phạm vi, không theo ô tìm.
- Hồ sơ lệnh lọc ngày theo Hạn SX (cột sẵn có), không theo ngày phát hành — `lsx` không có cột ngày
  phát hành, lấy từ gói phát hành là thêm một lượt đọc cho mọi dòng.
- Khung trả về của hồ sơ giữ 13 khối; gọn là việc của giao diện, trừ ba tổng sai bị bỏ.
