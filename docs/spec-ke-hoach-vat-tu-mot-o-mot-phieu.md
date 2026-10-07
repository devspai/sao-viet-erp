# Kế hoạch vật tư: mỗi chỗ thiếu một phiếu mua

Chốt 07/10/2026, đã code cùng ngày (chưa commit). Sửa đè lên `spec-ke-hoach-vat-tu.md` ở
những điểm ghi rõ ở mục 7. Giao diện: `docs/mockups/ke-hoach-vat-tu-mot-o-mot-phieu.html`.

## 1. Vì sao đổi

Màn hiện tại để một chỗ thiếu có nhiều phiếu mua mà không biết phiếu nào là của nó:

- Nút Đề nghị mua chỉ tắt khi số thiếu về 0, mà số thiếu chỉ giảm khi đơn mua đã đặt và có
  ngày về. Lúc yêu cầu mới lập, đang lập đơn hay chờ duyệt, dòng vẫn đỏ và nút vẫn còn. Keo nhiệt
  3 kg của LSX26-0003 vì thế có 3 yêu cầu: 45DR, 3QIT, 5TOX.
- Ô phiếu mua liệt kê mọi phiếu đang chạy của mặt hàng, không theo lệnh. Ngăn LSX26-0003 hiện 7
  mã bản kẽm, có cả phiếu lập cho lệnh khác.
- Hàng đang về được chia cho lệnh nào có ngày cần sớm nhất, không theo lệnh đã đặt mua.
  Đơn lập cho 0003 có thể bị 0004 lấy mất, ô của 0003 lại đỏ, người ta lại đề nghị mua thêm.

## 2. Luật mới

**Ô mua** = một lệnh (hoặc bài ghép) với một mặt hàng (giấy thì thêm khổ). Lệnh dùng cùng món ở
nhiều công đoạn vẫn chỉ là MỘT ô, số cần là tổng các công đoạn. Trên màn, mỗi ô là một dòng của
lưới.

**Mỗi ô có tối đa một phiếu còn sống.** Phiếu là cả một mạch: dòng yêu cầu mua → dòng đơn mua
lập từ nó → hàng về nhập kho. Màn hiện một mã phiếu (mã đơn nếu đã có đơn, không thì mã yêu cầu)
và một cột "Bước của phiếu": Mới đề nghị, Đang lập đơn, Chờ duyệt, Đã đặt hàng, Đã nhập kho.
Đơn bị trả thì bước ghi "Đơn bị trả, chờ lập lại".

Mỗi dòng ở đúng một trong bảy tình trạng, mỗi cái một màu (năm cái chính + hai cái phụ thêm lúc
code):

| Tình trạng | Khi nào | Nút |
|---|---|---|
| Cần mua | Còn thiếu và ô không có phiếu sống | tick được, gom nhiều dòng bấm Đề nghị mua một lần |
| Đang mua | Có phiếu sống, chưa tới bước đặt hàng có ngày về | không |
| Chờ hàng về | Đã giữ đủ, trong đó có phần trên đơn đã đặt có ngày về (của phiếu ô hoặc phần dư đơn khác) | không |
| Có trong kho | Đã giữ đủ bằng hàng trong kho | không |
| Đã xuất kho | Kho đã xuất cho lệnh | không |
| Chưa giữ | Kho hoặc hàng đang về đủ cho ô nhưng lệnh chưa bấm giữ | Giữ hàng ở dòng nhóm lệnh / chân ngăn |
| Chưa tính được | Có bước của lệnh chưa quy đổi được đơn vị | không, Ghi chú nói lý do |

Thứ tự xét: chưa tính được → đã xuất → giữ đủ (chờ về / có kho) → chưa giữ → đang mua → cần mua.
Lọc nhanh "Chưa tính được" chỉ hiện khi có dòng như vậy.

Ở "Đang mua", số còn thiếu vẫn hiện nhưng không còn nút mua. Dòng thiếu một phần mà chưa có
phiếu vẫn là "Cần mua", số đề nghị là phần còn thiếu.

**Ô trống lại (được lập phiếu mới) chỉ khi:**

- món bị huỷ khỏi yêu cầu, hoặc cả yêu cầu bị huỷ;
- phiếu đã xong (dòng đơn đã nhận đủ hoặc thu mua đóng dòng) mà ô vẫn còn thiếu, ví dụ nhà cung
  cấp giao thiếu. Dòng quay về "Cần mua" cho đúng phần còn thiếu.

Đơn mua bị từ chối hay bị huỷ KHÔNG làm ô trống: dòng yêu cầu vẫn sống, thu mua lập lại đơn từ
chính nó.

## 3. Hàng về giữ đúng cho ô đã đặt

Mỗi đơn mua tách làm hai phần:

- **Phần đặt cho lệnh**: đúng số trên các dòng yêu cầu mà đơn lập từ đó. Phần này chỉ giữ cho
  đúng ô đã đặt nó, không ai khác lấy được dù ngày cần sớm hơn.
- **Phần dư**: số đặt hơn tổng các ô (thu mua làm tròn kiện, mua thêm), cả đơn không gắn lệnh nào
  (mua dự trữ, đơn gõ tay). Phần này là hàng chung.

Hàng chung (tồn kho có sẵn + phần dư đang về) chia theo ngày cần sớm trước như luật cũ. Chỉ giữ
từ hàng đang về khi đơn đã đặt nhà cung cấp và có ngày về. Khi nhập kho, phần đặt cho lệnh chuyển
thẳng thành giữ trong kho cho chính ô đó; phần dư thành tồn chung.

Ví dụ: LSX26-0003 cần 32 bản kẽm, kho 0. Tick dòng, bấm Đề nghị mua → yêu cầu 32 bản, dòng sang
"Đang mua". Thu mua lập đơn 337Y đặt 68 bản, hẹn 21/10 → dòng 0003 "Chờ hàng về", đã giữ 32. 36
bản dư là hàng chung: LSX26-0004 cần 4 bản giữ từ phần dư này, dòng 0004 ghi "dư từ 337Y" và cũng
"Chờ hàng về", không phải lập phiếu. Lệnh khác có ngày cần sớm hơn 0003 cũng chỉ lấy được từ 36
bản dư, không đụng 32 bản của 0003.

## 4. Các trường hợp lệch

Đều hiện ở cột Ghi chú của dòng (hoặc dòng nhóm mặt hàng), bấm vào mở ngăn để xử lý.

- **Thu mua gộp nhiều yêu cầu vào một đơn**: được. Một đơn lo cho nhiều ô; mỗi ô vẫn chỉ trỏ một
  phiếu. Hàng về chia cho các ô theo đúng số trên từng dòng yêu cầu.
- **Phiếu ít hơn số cần** (lệnh tăng số sau khi đã lập phiếu; luật cũ đã buộc nhả giữ chỗ trước
  khi sửa nhu cầu): Ghi chú "Phiếu thiếu X". Phiếu còn ở bước yêu cầu hoặc đơn chưa gửi nhà cung
  cấp thì sửa số ngay trên phiếu đó. Đơn đã gửi nhà cung cấp thì huỷ món trên yêu cầu, dòng về
  "Cần mua", đề nghị lại đủ số. Không đẻ phiếu thứ hai cho cùng ô.
- **Phiếu thừa** (lệnh giảm, lệnh huỷ, kho tự đủ): Ghi chú "1 phiếu không còn cần" để người huỷ.
  Máy không tự huỷ.
- **Đặt dư**: dòng nhóm mặt hàng ghi "Đặt dư X" khi hàng đang về nhiều hơn số các lệnh cần. Chỉ để
  biết.
- **Dữ liệu cũ một ô nhiều phiếu** (như keo nhiệt 0003): phiếu đi xa nhất là phiếu của ô, các
  phiếu kia là "N phiếu trùng", ngăn lệnh có nút Huỷ phiếu từng cái. Không tự huỷ. Dự án chưa có
  người dùng thật nên không cần migration khớp ngược.

## 5. Màn hình

Một lưới dạng bảng tính cho cả màn, dòng thấp, chữ 13px, không ô số to.

- **Xem theo Lệnh | Mặt hàng**: hai cách nhóm cùng các dòng. Dòng nhóm nền xám.
  - Theo lệnh: dòng nhóm ghi mã lệnh, sản phẩm, khách, ngày giao. Cột: Mặt hàng, ĐVT, Cần, Đã giữ,
    Còn thiếu, Phiếu mua, Bước của phiếu, Ngày có hàng, Tình trạng, Ghi chú.
  - Theo mặt hàng: dòng nhóm ghi tên, ĐVT, cộng sẵn Cần / Đã giữ / Còn thiếu trong cột, Tồn kho
    và Đang về của cả mặt hàng, Ghi chú đặt dư. Dòng con là lệnh.
- **Lọc nhanh theo tình trạng** (các tình trạng + "Có ghi chú", không số đếm), ô tìm, nút Lọc
  chung (loại mặt hàng), Xuất Excel (đúng điều kiện đang lọc, 15 cột).
- Dòng nhóm lệnh chưa giữ hàng có nút Giữ hàng nhỏ (người có quyền sửa Kế hoạch vật tư).
- Số và Ghi chú đọc tên đơn vị ("tờ", "kg"), không đọc mã.
- **Ngày có hàng**: "Có sẵn" khi giữ trong kho, ngày về của đơn khi chờ hàng về, "hẹn dd/mm" khi
  đơn chưa đặt (chỉ để biết, chưa giữ), "xuất dd/mm" khi đã xuất.
- **Ngăn lệnh** (1180px, kéo mép trái): đầu ngăn một dòng (mã, sản phẩm, khách, ngày giao, Mở lệnh
  SX). Tab Vật tư = các dòng của lệnh, thêm cột Công đoạn. Tab Phiếu mua = phiếu đang lo cho từng
  món + phiếu trùng nên huỷ. Tab Lịch sử. Chân ngăn: Nhả hàng đã giữ.
- **Ngăn mặt hàng**: một dòng số tóm tắt (Cần cho lệnh, Đã giữ, Còn thiếu, Tồn kho, Đang về, đặt
  dư). Tab Đơn mua: mỗi đơn số còn về (cột "Còn về", không phải số đặt ban đầu: phần đã nhập
  đã thành tồn kho), đặt cho lệnh nào, dư bao nhiêu, phần dư đang giữ cho ai, dư chưa ai giữ; dưới
  là phiếu nên huỷ kèm lý do. Tab Lệnh dùng. Tab Lịch sử. Nút "Mở màn Tồn kho" của mockup BỎ: tồn
  kho chia theo từng kho động, không có một màn chung để nhảy tới.

API: `GET /ke-hoach-vat-tu/luoi` (xem, q, tinh_trang, hang_loai, page, size), `/luoi/xuat.xlsx`,
`/luoi/lenh?lsx_id|bai_ghep_id`, `/luoi/hang?hang_loai&hang_id&kho_rong&kho_dai`. Phân trang
theo nhóm, ở máy chủ. Mã trong `services/luoi_vat_tu.py`, màn `pages/ke-hoach-vat-tu/LuoiVatTu.tsx`.
Lập yêu cầu mua cho ô đã có phiếu sống bị chặn ở cả hai cửa (gom đề nghị và tạo yêu cầu, 409).

## 6. Bỏ "Chạy được từ"

Bỏ cả cột lẫn logic. `xep_som_nhat` (ngày về muộn nhất trong các phần giữ từ hàng đang về,
`giu_cho_service.trang_thai`) đang nuôi ba chỗ, bỏ cả ba:

- cột "Chạy được từ" ở Kế hoạch vật tư;
- cảnh báo "Một phần vật tư dựa vào lô đang về, hứa ngày …" khi phát hành lịch
  (`xep_lich/release.py`);
- đèn vàng "Đủ, nhưng hàng về dd/mm — xếp từ ngày đó trở đi" ở Hồ sơ lệnh (`lsx_tong_quan.py`):
  đủ là xanh.

Ai cần biết hàng về ngày nào thì xem cột Ngày có hàng của dòng.

## 7. Đè lên spec cũ (`spec-ke-hoach-vat-tu.md`)

- §1 bước 5 "phân bổ thử hàng đang về" và §3.3 "chuyển dòng giữ hứa cũ nhất trước theo mặt
  hàng": đổi thành chuyển theo ĐÚNG dòng đơn mua của ô (đã có `purchase_request_line_id` trên giữ
  chỗ và `department_request_line_id` trên dòng đơn nối về dòng yêu cầu).
- §3.5 PMH đổi (lùi ngày, giảm, huỷ): chỉ đụng các ô của phiếu đó.
- §2 "gợi ý mua lấy phần thiếu sau phân bổ": thêm điều kiện ô chưa có phiếu sống.
- Mọi chỗ nói tới `xep_som_nhat` / "xếp sớm nhất" / "chạy được từ": bỏ (mục 6).
- Các luật khác giữ nguyên (không khoá lô, không tự nhả, cờ gấp chỉ để bày, sửa nhu cầu phải nhả
  trước).
