# Ghi lỗi ở công đoạn giữa — tick tiêu chí (thiết kế 09/10/2026)

Trạng thái: ĐÃ CODE 09/10/2026 (chưa commit). Mockup: `docs/mockups/kcs-ghi-loi-don-gian.html`.
Mã: hộp `pages/kcs/KcsGhiLoiGiua.tsx` (+ `kcs-ghi-loi.css`), đối chiếu dùng chung `pages/kcs/KcsDoiChieu.tsx`,
sơ đồ `KcsSoDoNhom.tsx` (nút Tệp của lệnh, ba tab khung công đoạn giữa); máy chủ `services/san_xuat/kcs.py`
(`_chuan_hoa_dong_giua`), `GET /api/san-xuat/kcs/lenh/{id}/tep` (`tep_lenh.tep_nhom_kcs`), sự kiện tệp đổi nghe
thêm `kcs` (`routers/lsx.py` `_NGHE_DINH_KEM`). Toast tổ nhận ở bước giữa nói "ghi lỗi … : N đơn vị" (cờ `la_kcs_cuoi`).
(Bản 3 phương án `kcs-ghi-loi-3-phuong-an.html` bị chê rối, không dùng.)

## 1. Logic chủ chốt (09/10)

"Tiêu chí này không đạt thì tick vào, nhập bao nhiêu lỗi, có thể đính kèm ảnh và ghi chú."

1. Bấm Ghi lỗi ở một công đoạn → hiện tiêu chí của CHÍNH công đoạn đó (bản chụp `kcs_tieu_chi_json`),
   cuối danh sách có dòng "Lỗi khác, không có trong danh sách".
2. Tick tiêu chí không đạt → dòng mở ra: Số lỗi (bắt buộc, đơn vị của công đoạn), Ảnh (không bắt
   buộc), Ghi chú (không bắt buộc). "Lỗi khác" thì Ghi chú bắt buộc.
3. ~~Tổng số lỗi các dòng ≤ số tốt tổ đã ghi − lỗi đã ghi trước.~~ BỎ 10/10/2026: công đoạn đã bắt đầu là ghi lỗi được, không chờ tổ ghi mẻ, không trần theo số tổ đã ghi.
4. Lưu: mỗi dòng tick = một `SanXuatKcsLoi` quy về chính công đoạn, báo tổ ngay (SSE như cũ).
5. 10/10/2026: lỗi KCS bắt tại công đoạn TRỪ khỏi trần ghi mẻ của tổ — *"tổng nhận 1000 tờ in, KCS
   ghi lỗi 200 thì tổng các mẻ tối đa 800"* (`dau_vao.tran_ghi`). Mẻ đã ghi giữ nguyên; tổ chỉ ghi
   thêm được tới trần mới. Bước đầu chuỗi lấy số vào kế hoạch làm số nhận (175 tờ nguyên × 2 = 350).
   Lỗi bắt ở bước sau quy ngược về KHÔNG trừ (hàng đã rời công đoạn, đơn vị nơi bắt). Hộp Ghi mẻ ghi
   "Mẻ này ghi tối đa N" kèm câu số nhận trừ lỗi; khối Tiến độ có dòng "KCS bắt lỗi".

## 2. Đổi so với hiện nay

- BỎ ô "Lỗi do công đoạn" và "+ Thêm dòng lỗi do công đoạn khác" ở công đoạn giữa. Lỗi gốc ở bước
  trước: bấm ô bước đó trên sơ đồ rồi ghi ở đó (đếm theo đơn vị bước đó).
- Ảnh hết bắt buộc ở công đoạn giữa (máy chủ đang bắt mỗi dòng ≥1 ảnh). Bước cuối GIỮ luật cũ.
- Mô tả không phải gõ: dòng tiêu chí lưu mô tả = câu tiêu chí, ghi chú (nếu có) nối sau.
- Đếm lỗi theo tiêu chí: `checklist_json` của lần ghi = các câu đã tick
  `{cong_viec_id, thu_tu, dat:false, so_luong}` — thêm khoá `so_luong` trong JSON có sẵn, KHÔNG thêm
  cột, không migration. "Lỗi khác" không vào checklist, chỉ là dòng lỗi.
- Lần ghi có tick khoá "Cập nhật tiêu chí" cho công đoạn đó (đã đúng sẵn qua
  `cong_viec_da_xet_tieu_chi`).

## 3. Chỗ hiển thị đổi theo

- Khung công đoạn trên sơ đồ nhóm: bảng tiêu chí đổi cột thành "Lỗi ghi ở đây" (số, có đơn vị) |
  "Kiểm cuối đã xét" (lần) | "Kiểm cuối thấy hỏng" (lần); thêm dòng "Lỗi khác". Nút Ghi lỗi đứng
  cạnh tên công đoạn.
- Báo cáo lỗi, cách xem Theo tiêu chí: thêm cột "Lỗi ghi ở công đoạn" (số).

## 3b. Đối chiếu quy cách và tệp của lệnh (09/10 tối)

- Hộp Ghi lỗi trên máy tính chia hai cột: trái là danh sách tick, phải là khung "Đối chiếu" (chỉ
  xem) có hai tab "Quy cách" (dùng lại `ThsxQuyCachThe` + dặn dò kỹ thuật) và "Tệp của lệnh (N)".
  Điện thoại: ba tab Ghi lỗi | Quy cách | Tệp lệnh, thanh đáy luôn thấy.
- Sơ đồ nhóm: nút "Tệp của lệnh (N)" ở đầu, mở khung nổi liệt kê tệp theo từng lệnh trong nhóm.
  Khung công đoạn có ba tab Tiêu chí | Quy cách | Lỗi đã ghi, nút Ghi lỗi cạnh tên công đoạn.
  Điện thoại: bảng tiêu chí thành từng dòng, số xếp dưới tên.
- Máy chủ: thêm API tệp của lệnh cho KCS, gate quyền xem `kcs` (API `tep-lenh` hiện gate quyền tổ
  nên KCS bị 403), dùng lại `tep_lenh.tep_cua_cong_viec`, chỉ đọc. Thêm/xoá tệp vẫn ở hồ sơ lệnh.
  Tệp đổi thì nạp lại qua SSE `lsx_dinh_kem_changed` có sẵn. Quy cách đã nằm sẵn trong payload KCS.

## 3c. Chi tiết dùng

- Tick → ô Số lỗi tự đặt con trỏ. Bấm Xong hoặc tick dòng khác → dòng gọn thành thẻ nhỏ (số, số
  ảnh, ghi chú) + "Sửa". Bấm tên tiêu chí cũng tick được.
- Dòng tiêu chí đã từng ghi lỗi hiện "trước đã ghi N {đơn vị}".
- Ảnh hiện ô nhỏ có × để bỏ, bấm để xem lớn. Điện thoại chỉ một nút "Chụp ảnh".
- "Lỗi khác" tách khỏi danh sách tiêu chí bằng một khoảng trống.
- "Lỗi đã ghi trước": máy tính là bảng Lúc | Tiêu chí và ghi chú | Số lỗi | Ảnh | Người ghi | Tổ (đã
  xem/chưa xem); điện thoại là thẻ.

## 4. Chữ trên màn

Tiêu đề "Ghi lỗi {công đoạn}"; dòng số "Tổ đã làm / Đã ghi lỗi" (bỏ "Ghi thêm được tối đa" 10/10/2026); câu dẫn "Tick
tiêu chí không đạt" + "Tiêu chí đạt thì để trống"; nhãn ô nói rõ "không bắt buộc" / "bắt buộc, lỗi
gì"; thanh đáy nói MỘT lý do cụ thể ("Nhập số lỗi cho Màu đúng mẫu đã ký"), lưu được thì "Lỗi sẽ báo
ngay về {tổ}".

## 5. Không làm

- Không đổi bước cuối (thẻ Đạt / Có lỗi, một số mỗi thẻ) — muốn đồng bộ thì làm sau.
- Không thêm "Đạt" ở công đoạn giữa.
