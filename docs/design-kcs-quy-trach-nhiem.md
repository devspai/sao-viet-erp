# Làm lại logic KCS: lỗi tính theo công đoạn gây ra

Ngày 08/10/2026. Trạng thái: ĐÃ CODE 08–09/10/2026. Bản GỌN (chốt 08/10, sau khi bỏ bản đầu quá
phức tạp). §2.4 viết lại 09/10: bỏ cờ "Tổ KCS đích danh", KCS thành một module trong ma trận vai.

Nối tiếp `design-kcs-theo-lenh.md` (KCS theo lệnh, mg 0306) và `design-tieu-chi-kcs-lam-lai.md`
(tiêu chí gộp ở KCS cuối, form xét theo thẻ công đoạn). Hai bản đó vẫn đúng.

## 1. Vì sao làm lại

Bấm thử 08/10 trên cụm LSX26-0003 (Ruột) + LSX26-0004 (Bìa, lệnh phụ): Xén 3 mặt bắt 5 cuốn bọt
khí, quy về Cán màng của Bìa. Kết quả hiện:

- Dòng Cán màng: "Không lỗi", kèm chữ nhỏ "+5 tay lỗi bắt ở Xén 3 mặt".
- Dòng Xén 3 mặt: "Có lỗi" dù không chịu lỗi nào.
- Dashboard xếp theo tổ chịu, ma trận theo nơi bắt ⇒ hai nơi lệch số.

Gốc: số đếm và tình trạng tính theo NƠI BẮT (`so_luong_khong_dat` của lần kiểm), trong khi mỗi dòng
lỗi đã có sẵn NƠI GÂY (`san_xuat_kcs_loi.cong_doan_ref_id`, `to_chiu_id`).

## 2. Đổi gì

### 2.1 Đếm lỗi theo công đoạn gây

Tình trạng KCS và số lỗi của mỗi công đoạn = tổng các dòng lỗi có `cong_doan_ref_id` là công đoạn
đó, bất kể bắt ở đâu. Số giữ ĐÚNG đơn vị lúc bắt, không quy đổi.

- Cán màng: "Có lỗi" — "5 cuốn, bắt ở Xén 3 mặt".
- Xén 3 mặt: "Không lỗi" (nó chỉ là nơi bắt).
- Lỗi do bước khác ghi ở các đơn vị khác nhau thì liệt kê riêng từng đơn vị, không cộng gộp.

Màn chuỗi công đoạn, dashboard, ma trận, Excel dùng CHUNG một hàm đếm này. Không thêm bảng, không
thêm cột.

### 2.2 Tổ chịu lỗi thấy lỗi của mình

Tổ chịu thấy mọi lỗi quy về mình kể cả bắt ở tổ khác (hiện bị lọc mất nếu không có quyền xem tổ bắt).

### 2.3 Gỡ điều chỉnh kết quả

Gỡ `PATCH /kcs/{id}` (`dieu_chinh_ket_qua`) và `dieuChinhKcs` ở client: không có UI, còn lỗi.
Ghi sai thì ghi lần kiểm mới.

### 2.4 Module KCS thay cờ "Tổ KCS đích danh" (chốt 09/10)

Chủ chốt: *"bỏ logic chỉ đích danh tổ KCS đi, mà sẽ có module KCS với quyền liên quan — quyền xem,
thao tác và một số quyền chi tiết"*. Ai làm KCS không còn tuỳ người đó đứng ở phòng ban nào, mà tuỳ
vai của họ được bật ô nào ở dòng KCS.

Trước: cờ `departments.is_kcs` (công tắc "Tổ KCS đích danh" ở màn Phòng ban) quyết định năm việc —
mục menu KCS (khoá giả `kcs_theo_lenh`), ghi lần kiểm (`gate_kcs`), báo cáo thấy mọi tổ, ô Đóng
lệnh thiếu trên dòng tổ có cờ, chip lọc khối "KCS" ở Phòng ban. Cả năm chuyển sang module.

Module `kcs`, nhãn "KCS", mục menu đứng cuối khối **Sản xuất** (sau Xếp lịch) — ma trận đặt dòng
đúng chỗ đó (luật một mục menu = một dòng). Không chọn phạm vi: KCS kiểm cả chuỗi của mọi tổ.

| Ô | Cột | Cho phép |
|---|---|---|
| Xem | `can_read` | mục menu KCS, danh sách lệnh, chuỗi công đoạn, ảnh lỗi, báo cáo lỗi MỌI tổ, Xuất Excel |
| Thao tác | `can_create` | ghi lần kiểm (đạt, lỗi, ảnh, công đoạn gây), gửi yêu cầu nhập kho thành phẩm, đóng lệnh khi đã đủ |
| Đóng lệnh thiếu (chi tiết) | `can_close_short` | đóng khi còn cảnh báo (chưa kiểm, chưa gửi kho, thiếu số, còn việc đang làm) và mở lại nhóm đã đóng; bật kèm Thao tác |

- Thiếu Đóng lệnh thiếu: nút vẫn hiện, khoá kèm lý do "Còn N việc chưa xong — cần quyền Đóng lệnh
  thiếu" / "Cần quyền Đóng lệnh thiếu để mở lại".
- `can_update` / `can_delete` của dòng `kcs` là ô chết (lần kiểm đã ghi không sửa, không xoá).
- Gỡ: cột `departments.is_kcs` (DROP), công tắc ở màn Phòng ban, chip khối "KCS", nhãn KCS và ô
  Đóng lệnh thiếu trên dòng tổ. Dòng tổ "Thành phẩm / KCS" thành một tổ thường.
- Migration: thêm dòng `modules('kcs')`, tắt `can_close_short` còn sót trên dòng tổ, DROP
  `is_kcs`. KHÔNG tự cấp ô KCS cho vai nào: vai dùng chung nhiều phòng ban, cấp theo "có người đứng
  trong phòng KCS" là cấp lan cho người ngoài. Dự án chưa có người dùng thật — admin bật tay.
- Tổ bị báo lỗi vẫn xem lỗi của mình qua dòng quyền tổ như cũ (không cần ô KCS).

### 2.5 Vá kèm

1. Nhóm có từ 2 ứng viên bước cuối ⇒ không việc nào được `la_kcs_cuoi`, mất đường nhập kho
   (`snapshot.py` ~603).
2. Excel sheet tiêu chí đổi giờ hai lần (`kcs_bao_cao.py` :142 rồi :407), nghi lệch +7 giờ.
3. Nhãn `dat_mot_phan`: màn "Có lỗi", Excel "Đạt một phần" — dùng chung "Có lỗi".
4. Comment cũ: "tổ chịu = tổ của công đoạn, không chọn" (`models/san_xuat_kcs.py:9`,
   `KcsKiemForm.tsx:4-5`), "chỉ trưởng KCS đóng thiếu"; `design-tieu-chi-kcs-lam-lai.md` ghi "CHƯA CODE".

## 3. Không đổi

Kết luận lần kiểm (cả bước giữa); trần số lỗi đặt ở bước bắt; luật đạt ở KCS cuối (đạt = phần chưa
kiểm − lỗi); hàng lỗi trừ khỏi số đạt (10/10/2026 thêm: lỗi bắt tại công đoạn còn trừ khỏi trần
ghi mẻ của tổ, xem `design-kcs-ghi-loi-giua.md` mục 5); tiêu chí gộp
cả chuỗi; form xét theo thẻ; thông báo tức thì tới tổ chịu lỗi.

## 4. Đã cân nhắc và BỎ (08/10)

Quy đổi số lỗi sang đơn vị bước gây (kéo theo hệ số qua bước ghép), dời trần sang bước gây, kết
luận "báo lỗi" cho bước giữa, tỷ lệ đạt lần đầu, Pareto, xử lý hàng lỗi (làm lại / loại / nhận có
điều kiện), AQL, đo màu, tờ OK. Lý do: không phải gốc của lỗi hiển thị, thêm phức tạp chưa ai cần.
