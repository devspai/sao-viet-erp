# Plan — Gia công ngoài cho bước chung bài ghép (đợt 2)

Spec: `docs/superpowers/specs/2026-09-27-gia-cong-ngoai-bai-ghep-design.md` (nền đợt 1:
`2026-09-26-gia-cong-ngoai-design.md`). Mỗi Task: test nhắm file trước → code → chạy test nhắm file →
commit riêng (tiếng Việt, chỉ `git add` file/hunk của mình — working tree có việc của session khác).

## Task 1 — Dữ liệu (migration + model + DB_SCHEMA)
- `gia_cong_ngoai.lsx_id` nullable; thêm `bai_ghep_id` FK `bai_ghep` RESTRICT + index; CHECK đúng một
  trong hai (`ck_gia_cong_ngoai_mot_nguon`).
- `bai_ghep_cong_doan.nha_cung_cap_id` FK `suppliers`; gỡ `sl_gui`, `ngay_gui_dk`,
  `van_chuyen_ngay`, `gia_cong_ngay`, `ngay_nhan_dk`, `hao_hut_cho_phep`, `don_gia_gia_cong`,
  `yeu_cau_ky_thuat` (model + schema + serialize + DB).
- Migration số trống kế tiếp trong `db_migrations.py` (Postgres: ALTER … DROP NOT NULL + ADD
  CONSTRAINT; SQLite chỉ thêm/bỏ cột). Idempotent. `docs/DB_SCHEMA.md` cập nhật cùng lúc.
- Test: `tests/test_gia_cong_bai_ghep_du_lieu.py` (model, migration chạy hai lượt no-op).

## Task 2 — Bài ghép: lập kế hoạch bước chung / gộp / "Còn thiếu"
- `lap_ke_hoach_buoc_chung` nhận `nha_cung_cap_id` (kiểm qua `GiaCongNgoaiRepository.nha_gia_cong`,
  tên do máy chủ ghi); thuê ngoài ⇒ gỡ tổ/máy; đổi khỏi thuê ngoài ⇒ dọn NCC. Client không gửi tên.
- `gop()` chép `nha_cung_cap_id` + tên nếu mọi bước gộp cùng một nhà gia công.
- `_thieu_buoc_chung`: thuê ngoài thiếu nhà gia công ⇒ "Chưa chọn nhà gia công" (chặn Sẵn sàng).
- Serialize trả `nha_cung_cap_id`. `xoa()` bài ghép dọn lần đã huỷ (FK RESTRICT).
- Test: `tests/test_gia_cong_bai_ghep_ke_hoach.py`.

## Task 3 — Gom lần lúc phát hành + đồng bộ lúc phát hành cập nhật (sửa lỗi lần rỗng)
- `lan.gom_lan_bai_ghep_khi_phat_hanh`: dải bước CHUNG thuê ngoài liền nhau (liền ở MỌI lệnh
  thành viên), cùng nhà gia công ⇒ một lần gắn `bai_ghep_id`. Gọi trong `release.phat_hanh`.
- `dong_bo_lan_khi_cap_nhat`: bỏ qua bước lệnh bị bài ghép phủ (lỗi lần rỗng / "thiếu nhà gia
  công"); thêm đồng bộ cho lần của bài ghép khi phát hành cập nhật nguồn `in_ghep`.
- Test: `tests/test_gia_cong_bai_ghep_phat_hanh.py`.

## Task 4 — Mang đi / chốt toả / nhập kho từng lệnh / mở lại
- Mang đi: `co_buoc_truoc` cho công việc chung suy theo chặng trước.
- Chốt rẽ ba nhánh: còn bước chung ⇒ một bàn giao; tới bước riêng (điểm toả) ⇒ `_toa_san_luong`
  (mỗi lệnh `số chốt × so_con_tren_to`); hết bước ⇒ nhập kho từng lệnh (KCS ngoài phần mềm + đề
  nghị nhập theo nhóm của lệnh, số = chốt × số con). Không nhánh giao thẳng.
- Mở lại: chặn khi phiếu chi / kho đã lập phiếu / bất kỳ lệnh nào đã ghi mẻ ở bước nhận phần toả
  (nêu tên lệnh); không chặn ⇒ gỡ sạch kết quả toả + bàn giao + mẻ.
- `lan_dict` thêm `bai_ghep_id`, `bai_ghep_ma`, `nhan_nguon`, `lenh`, `chia_theo_lenh`.
- Test: `tests/test_gia_cong_bai_ghep_chot.py` (ví dụ §2: 3.920 / 1.960; về bước chung kế; cuối ⇒
  kho từng lệnh; mở lại bị chặn khi một lệnh đã ghi mẻ).

## Task 5 — Router + quyền + SSE + lọc KHSX + phiếu chi
- `GET /api/gia-cong-ngoai/bai-ghep/{id}`; `/lenh/{lsx_id}` trả thêm lần của bài ghép chứa lệnh
  (chỉ đọc). Ghi trên lần bài ghép: `san_xuat:update` + phạm vi trên MỌI lệnh thành viên (thiếu ⇒
  403 "chỉ xem"); `chi_xem` trong dict.
- SSE `gia_cong_ngoai_changed` kèm `bai_ghep_id` + `lsx_ids`; toast chờ mang đi / chờ chi mang nhãn
  bài ghép.
- `lsx_ids_loc_gia_cong` bắt lệnh thành viên qua bài ghép. Phiếu chi: `_ma_lenh_gia_cong` + hàng
  chờ chi mang nhãn "BG-01 (LSX-A, LSX-B)".
- Test: `tests/test_gia_cong_bai_ghep_api.py`.

## Task 6 — FE
- `BaiGhepBuocChungForm`: tab Gia công ngoài → ô chọn Nhà gia công (danh mục, không ô chữ); gỡ các
  ô dự kiến; `client.ts` type + patch.
- `GiaCongNgoaiPanel` nhận nguồn lệnh | bài ghép; hộp chốt hiện bảng chia từng lệnh; lần của bài
  ghép trên màn lệnh là dòng chỉ đọc bấm sang bài ghép (`BaiGhep2Page` nhận `openBaiGhepId`).
- Phiếu chi: nhãn `nhan_nguon`. `npx tsc --noEmit -p .` + vitest nhắm file.

## Task 7 — E2E UI thật (§9 spec) trên `svn_erp_e2e`, cổng 8010/5174
Đơn hàng → 2 lệnh → bài ghép (In chung xưởng, Cán màng chung thuê ngoài) → phát hành → In chung ghi
mẻ + bàn giao → mang đi → chốt (xem bảng chia) → Bế từng lệnh → KCS → nhập kho → giao → phiếu chi.
Báo cáo từng bước vào scratchpad `bai-ghep-gcn-report.md`.
