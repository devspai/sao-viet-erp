# Đóng lệnh sản xuất THỦ CÔNG do KCS bấm — thiết kế

Ngày: 29/09/2026 · Trạng thái: CHỜ DUYỆT (chưa đụng code)

## 1. Vì sao đổi

Cổng tự đóng ở `services/san_xuat/dong_nhom.py` (4 điều kiện, tự đóng ĐỦ + trưởng KCS đóng THIẾU) vừa
rối vừa không có hiệu lực:

- Đóng rồi thì cũng không có gì dừng lại. Việc chưa làm vẫn nằm trên bàn tổ, tổ vẫn ghi mẻ, KCS vẫn
  kiểm được. Lệnh vẫn hiện "Đã phát hành" mãi, vì `Lsx.trang_thai` không có mốc sau phát hành.
- Có nhóm không bao giờ đóng được. Điều kiện "KCS đã kiểm hết công đoạn cuối" đòi số tốt > 0, nên
  nhóm dừng giữa chừng không đóng thiếu nổi. Chỉ đúng một người (trưởng phòng KCS) được đóng thiếu.
- Cổng cứng 100%: đạt 9.990/10.000 cũng phải bấm tay, và hồ sơ ghi là "thiếu".

Người dùng chốt ngày 29/09/2026: bỏ tự đóng. KCS kiểm xong, tạo yêu cầu nhập kho, rồi tự bấm
**Đóng lệnh**. Nút này KHÔNG bị chặn bởi điều kiện nào; những gì còn dở chỉ hiện thành CẢNH BÁO
trong hộp xác nhận. Lệnh đã đóng mang trạng thái riêng, **Đã đóng**, và mở lại được.

## 2. Mô hình

- **Đơn vị đóng = NHÓM thành phẩm.** Màn KCS theo lệnh vẫn là nơi bấm nút, nhưng khối đóng đã là theo
  nhóm từ trước (`KcsChotNhom nhomId=…`). Nhóm nhiều lệnh (bìa, ruột… ghép lại) chỉ có lệnh thân
  chính đi tới KCS cuối, nên bấm đóng là đóng TẤT CẢ lệnh của nhóm. Hộp xác nhận liệt kê từng mã lệnh
  sẽ đóng.
- **Hai nơi mang trạng thái, ghi cùng một giao dịch** (một hàm service duy nhất ghi cả hai):
  - `Lsx.trang_thai = "da_dong"`, nhãn "Đã đóng". Thêm vào `TRANG_THAI_LSX`. Đây là trạng thái nghiệp
    vụ mà các màn kế hoạch và đơn hàng đọc.
  - `SanXuatNhom.trang_thai` rút còn 2 giá trị: `in_production` | `closed`. Bỏ `closed_full`,
    `closed_short` và `waiting_conditions` (giá trị này không ai dùng). Các màn xưởng (bàn tổ, KCS,
    gia công ngoài) đọc trạng thái ở đây.
- **Không còn phân biệt đủ/thiếu bằng trạng thái.** Số đạt/mục tiêu lúc đóng được ghi vào audit, nên
  vẫn tra lại được lệnh nào đã đóng khi còn thiếu hàng.

## 3. Luồng

### 3.1 Đóng

KCS mở một lệnh ở màn KCS theo lệnh. Khối cuối (thay cho "Chốt nhóm") hiện một dòng tóm tắt:
"Đạt 9.990 / 10.000 hộp · đã gửi kho 9.990". Bên dưới là nút **Đóng lệnh**.

Bấm nút sẽ mở hộp xác nhận:

- Tiêu đề: "Đóng lệnh LSX26-0004?" Nếu nhóm có nhiều lệnh: "Đóng 2 lệnh: LSX26-0004, LSX26-0005?"
- Các CẢNH BÁO, chỉ dòng nào đang đúng mới hiện; không cảnh báo nào chặn nút xác nhận:
  - "Còn 120 hộp tổ đã ghi tốt mà KCS chưa kiểm." (Σ tốt − Σ(đạt + lỗi) ở công đoạn cuối, > 0)
  - "Còn 300 hộp đạt chưa gửi yêu cầu nhập kho." (Σ `so_con_gui_kho` của các việc công đoạn cuối, > 0)
  - "Đạt 9.690 / 10.000 hộp — thiếu 310." (đạt < mục tiêu; mục tiêu là Σ `so_luong_ra` công đoạn
    cuối như hiện nay)
  - "Còn 2 việc chưa xong (Tổ bế, Tổ dán) — sẽ rút khỏi bàn tổ."
- Nút: "Đóng lệnh" / "Để sau".

Xác nhận thì hệ thống:

1. Đặt trạng thái nhóm = `closed`; mọi lệnh của nhóm có trạng thái `da_phat_hanh` chuyển sang
   `da_dong`. Nhóm tăng `version`; nếu `expected_version` lệch thì báo "vừa có người cập nhật, tải lại".
2. Ghi audit `san_xuat_dong_lenh`: nhóm, danh sách mã lệnh, và ẢNH CHỤP các con số cảnh báo lúc đóng
   (đạt/mục tiêu, số chưa kiểm, số chưa gửi kho, số việc dở). Thêm nhãn vào `audit_registry.py`.
3. Phát SSE ngay: bàn tổ của các tổ có việc bị rút, KCS, Kế hoạch SX, Xếp lịch, Bán hàng/Giao hàng.
   Toast gửi Sale/Kế hoạch: "LSX26-0004 đã đóng — đạt 9.990/10.000 hộp".

### 3.2 Mở lại

Lệnh đã đóng hiện dòng "Đã đóng bởi Nguyễn Văn A lúc 14:20 29/09" và nút **Mở lại**. Hộp xác nhận
chỉ có một câu, không có ô nhập. Xác nhận thì nhóm về `in_production`, các lệnh `da_dong` về
`da_phat_hanh`, ghi audit `san_xuat_mo_lai_lenh`, phát SSE. Việc đã rút khỏi bàn tổ hiện lại đúng như
trước.

### 3.3 Ai được bấm

MỌI thành viên phòng ban có cờ `is_kcs` (`gate_kcs`), cho cả đóng lẫn mở lại. Trước đây chỉ trưởng
phòng được đóng thiếu; nay nới ra vì nút không còn là "ngoại lệ phải duyệt", và audit đã ghi tên người
bấm. KCS không phải module trong ma trận quyền mà là cờ phòng ban, nên không cần đẻ ô quyền mới.

## 4. Lệnh đã đóng thì những gì đổi

| Nơi | Hành vi khi lệnh/nhóm đã đóng |
|---|---|
| Kế hoạch SX (bảng lệnh) | Badge "Đã đóng" ở cột Trạng thái (`PILL` trong `keHoachSxShared.tsx`), đếm vào facet |
| Xếp lịch (hàng lệnh bên trái + thanh Gantt) | Badge "Đã đóng" thay "Đã phát hành"; thanh chuyển tông xám. Hàng tự rụng khi cửa sổ trôi qua, đúng luật `_xong_tron_truoc` đang có — KHÔNG ẩn ngay |
| Lệnh SX / Theo dõi SX | Vẫn hiện, badge "Đã đóng". `pham_vi.loc_lsx_da_phat_hanh` nhận cả `da_dong` |
| Tiến độ đơn hàng | `don_hang_tien_do` tính lệnh `da_dong` là đã xong |
| Kế hoạch vật tư (MRP) | Bỏ lệnh `da_dong` khỏi `TRANG_THAI_TINH`, không còn đòi vật tư |
| Bàn tổ + badge tổ | Ẩn việc chưa bắt đầu/tạm dừng của nhóm đã đóng. Việc ĐANG CHẠY vẫn hiện cho tới khi tổ bấm Kết thúc, để không bỏ treo đồng hồ giờ công. Việc chung bài ghép (`nhom_id` NULL) chỉ ẩn khi MỌI nhóm nó phục vụ đã đóng |
| Thao tác xưởng | CHẶN: bắt đầu, phân công, ghi mẻ mới, KCS kiểm/điều chỉnh, tạo yêu cầu nhập kho, bàn giao, đề nghị vật tư. Riêng việc đang chạy vẫn được tạm dừng / kết thúc, và ghi mẻ của chính việc đó. Lời chặn: "Lệnh đã đóng — KCS mở lại nếu cần ghi thêm." |
| Danh sách KCS theo lệnh | Mặc định chỉ hiện nhóm `in_production`; công tắc "Đã đóng" như hiện nay |
| Phát hành / thu hồi (Xếp lịch) | Lệnh `da_dong` không phát hành lại, không thu hồi được. Lời chặn: "Lệnh đã đóng" |
| Sửa / xoá lệnh, `set_trang_thai` tay | Chặn vào/ra `da_dong` bằng đường tay; chặn xoá |
| Gia công ngoài — chốt | Không tự đóng nhóm nữa. Gỡ số chốt (`_go_kcs_va_nhom`) khi nhóm đã đóng thì báo "Lệnh đã đóng — KCS mở lại trước", không tự mở lại |

## 5. Gỡ bỏ

- `dong_nhom.tu_dong_dong_neu_du`, `dong_thieu`, `_danh_gia` (4 điều kiện); hook `_thu_dong_nhom` ở 5
  route và lời gọi tự đóng trong `gia_cong_ngoai/chot.py`.
- Endpoint `GET …/nhom/{id}/dieu-kien-dong` và `POST …/nhom/{id}/dong-thieu`. Thay bằng:
  - `GET  /api/san-xuat/kcs/nhom/{nhom_id}/dong` — tóm tắt + danh sách cảnh báo + các lệnh sẽ đóng
    + người/lúc đóng (nếu đã đóng).
  - `POST /api/san-xuat/kcs/nhom/{nhom_id}/dong`    body `{expected_version}`
  - `POST /api/san-xuat/kcs/nhom/{nhom_id}/mo-lai`  body `{expected_version}`
- Toast "đóng THIẾU" / "đơn có thể giao" ở `AppShell.tsx` → một toast "đã đóng" / "đã mở lại".

## 6. Dữ liệu

- Không thêm cột. `lsx.trang_thai` là String(20) nên chứa được `da_dong`.
- Migration mới (số kế tiếp trong `db_migrations.py`), raw SQL:
  - `san_xuat_nhom.trang_thai`: `closed_full`/`closed_short` → `closed`; `waiting_conditions` →
    `in_production`.
  - Lệnh thuộc nhóm vừa chuyển `closed` mà đang `da_phat_hanh` → `da_dong`.
- Cập nhật mô tả giá trị trạng thái trong `docs/DB_SCHEMA.md` và `docs/spec-thuc-hien-san-xuat.md` §16
  (viết lại toàn mục; bản hiện tại còn liệt kê "phân bổ đã chốt" dù điều kiện này đã gỡ).

## 7. Kiểm thử

- Viết lại `test_san_xuat_dong_nhom.py` và `test_san_xuat_dong_nhom_api.py` theo luật mới:
  - đóng được khi còn dở, và trả đúng từng cảnh báo;
  - đóng hết lệnh của nhóm;
  - mở lại trả lệnh về `da_phat_hanh`;
  - version lệch thì báo lỗi;
  - người không thuộc KCS bị 403;
  - audit chụp đúng số.
- Test chặn: sau khi đóng, ghi mẻ / KCS kiểm / nhập kho / bắt đầu bị từ chối; việc đang chạy vẫn kết
  thúc được.
- Test lọc: bàn tổ và badge ẩn việc chưa bắt đầu của nhóm đã đóng, giữ việc đang chạy; việc chung bài
  ghép chỉ ẩn khi mọi nhóm đã đóng.
- Sửa test đang ghim hành vi cũ: `test_san_xuat_g5_tich_hop.py` (tự đóng sau KCS),
  `test_gia_cong_chot_cuoi.py` (chốt tự đóng; mở lại khi đóng thiếu), `test_san_xuat_con_thieu.py`,
  `KcsChotNhom.test.tsx`.
- Xác minh UI trọn luồng bằng chuột/bàn phím thật:
  1. KCS kiểm → tạo yêu cầu nhập kho → Đóng lệnh (thấy cảnh báo) → xác nhận.
  2. Thấy "Đã đóng" ở Kế hoạch SX và Xếp lịch; bàn tổ rút việc.
  3. Mở lại → mọi thứ trở về như trước khi đóng.

## 8. Ngoài phạm vi (ghi nhận, không làm lượt này)

- Giữ chỗ vật tư (`giu_cho_bat`) của lệnh đã đóng không tự nhả.
- `lsx_service.update` / `replace_routing` hiện chỉ chặn `da_lap_ke_hoach`, không chặn
  `da_phat_hanh` — lỗ có sẵn, không do thiết kế này sinh ra.
- Dung sai giao thiếu theo khách: không cần nữa vì KCS tự quyết lúc bấm.
