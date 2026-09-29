# Chấm đỏ thanh bên

Luật (chủ chốt 29/09/2026): **có chấm đỏ là có bản ghi mới; nhìn thấy bản ghi mới là mất chấm đỏ.**
Thanh bên không in số. "Nhìn thấy" = mở màn của mục đó.

## Cơ chế

- Mỗi bản ghi mới là một dòng `module_notifications` (kênh = khoá module của màn; bàn tổ là
  `to_sx_<id phòng ban>`). Ghi qua MỘT hàm: `services/thong_bao_man.bao(...)`, gọi SAU commit của
  nghiệp vụ (hoặc `commit=False` để đi chung giao dịch — SSE chỉ bắn khi giao dịch đó commit).
- Mốc "đã xem" là `module_notification_reads.last_read_notification_id` theo người × kênh. Mở màn ⇒
  `POST /api/module-notifications/{kenh}/mark-read` dời mốc tới dòng mới nhất của kênh.
- Cả thanh bên hỏi MỘT lượt `GET /api/module-notifications/summary` → `{kenh: {id, loai, ma}}`, chỉ
  trả kênh đang có bản ghi mới. Sự kiện SSE `thong_bao_man` báo "hỏi lại"; toast khi id mới nhất
  của một kênh tăng (lời nhắc ở `frontend/src/lib/thongBaoMan.ts`).

## Ai thấy một dòng

- Dòng **đích danh** (`recipient_user_id`): chỉ người nhận, không xét quyền màn (thợ không có quyền
  Chấm công vẫn thấy chấm khi bị đổi ca).
- Dòng **phát rộng**: người có Xem module kênh, cộng ô quyền `required_action` nếu dòng đòi
  (vd `approve`), lọc theo phạm vi của người xem trên module đó: toàn công ty thấy mọi phòng; phạm vi
  phòng thấy cây phòng mình; phạm vi cá nhân chỉ thấy dòng không gắn phòng. Dòng kênh tổ: người có
  Xem ở dòng quyền của tổ đó.
- Người tạo ra bản ghi không bao giờ thấy chấm của chính mình.

## Kênh và bản ghi mới

| Mục thanh bên | Kênh | Loại → người thấy |
| --- | --- | --- |
| Lương | `luong` | `tam_ung_moi` → người duyệt (theo phòng NV) · `tam_ung_quyet_dinh` → người đứng tên |
| Nghỉ phép | `nghi_phep` | `nghi_phep_moi`, `nghi_phep_xin_huy` → người duyệt · `nghi_phep_quyet_dinh` → người đứng tên |
| Tăng ca | `tang_ca` | `tang_ca_moi`, `tang_ca_xin_huy` → người duyệt · `tang_ca_quyet_dinh` → người đứng tên |
| Chấm công | `cham_cong` | `di_muon_moi` → người duyệt đi muộn/về sớm · `di_muon_quyet_dinh`, `doi_ca` → đích danh |
| Báo giá | `bao_gia` | `bao_gia_cho_duyet` → người duyệt đặc thù (theo phòng Sale) · `bao_gia_quyet_dinh` → Sale |
| Đơn hàng bán | `don_hang_ban` | `don_cho_coc` → người ghi cọc · `don_du_coc` → Sale |
| Kế hoạch SX | `san_xuat` | `don_chuyen_sx` (một lần mỗi đơn) |
| Xếp lịch | `xep_lich` | `lenh_cho_xep` — lệnh vào/quay lại hàng chờ |
| Bàn tổ | `to_sx_<id>` | `viec_moi`, `ban_giao_den`, `ho_tro_cheo`, `kcs_bao_loi` |
| Kho | `kho` | `kho_yeu_cau_moi` → người xử lý kho · `kho_phan_hoi` → người tạo |
| Phiếu chi | `phieu_chi` | `gia_cong_cho_chi` → người lập phiếu chi |
| Sửa chữa máy | `ky_thuat_may` | `bao_hong_moi` → tổ sửa chữa |
| Phiếu bảo trì | `phieu_bao_tri` | `bao_tri_den_han` (một lần mỗi phiếu) |
| Khách hàng | `khach_hang` | `cham_soc_duoc_giao`, `cham_soc_den_han` (một lần mỗi hẹn) → người phụ trách |
| Mua hàng / Đơn mua hàng | `thu_mua` / `ke_toan` | như trước |

Thêm module mới: khai kênh + ô quyền ở `thong_bao_man.KENH`, ánh xạ mục thanh bên ở
`thongBaoMan.ts` (`KENH_NAV`), rồi gọi `bao(...)` ở đúng chỗ nghiệp vụ vừa sinh bản ghi.
