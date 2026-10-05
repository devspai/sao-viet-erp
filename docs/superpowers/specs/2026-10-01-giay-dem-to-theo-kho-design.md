# Giấy đếm theo TỜ và KHỔ, tổ Cắt chốt giấy sau phát hành — thiết kế

Ngày: 01/10/2026 · Trạng thái: đã sang lập plan (`docs/superpowers/plans/2026-10-01-giay-dem-to-theo-kho.md`);
chưa đụng code, chưa commit. §8 ghi những chỗ sửa lúc lập plan sau khi đọc code.

## 1. Vì sao đổi

Ngoài đời (người dùng kể 30/09–01/10/2026):

- Lệnh cần giấy theo tờ và khổ, ví dụ C-300 · 78×90,5 · 5.000 tờ. Người mua mua cũng theo tờ và khổ
  ("c300 KT95*80, 5000"). Không khâu nào đếm giấy tờ bằng kg; chỉ giấy cuộn là cân kg.
- Kho không có đúng khổ thì cắt cuộn hoặc tề từ tờ khổ lớn hơn; không được nữa thì mua. Cắt làm tại
  kho giấy, do tổ Cắt. Chị tổ trưởng tổ Cắt kiêm thu mua và quản lý mọi kho.
- Báo giá chỉ có In → sau in. Tổ trưởng Cắt không cấu hình tuyến. Phần mềm cũ: phát lệnh thì lệnh tới
  kho giấy, tổ trưởng quyết cắt hay mua. Cắt vẫn phải ghi sản lượng từng công đoạn để tính khoán
  (Cắt xả cuộn, Cắt tờ, Đóng gói cắt — một lệnh có thể chỉ qua một trong ba).
- Máy không tự quyết mua hay cắt; người quyết.

Phần mềm hiện tại (đã kiểm code 01/10/2026) lệch ở ba chỗ:

1. **Giấy tính bằng kg, gộp mọi khổ.** Dòng giấy của lệnh lấy số từ "Công thức tính định mức" của mã
   giấy (`giay_nguyen.cong_thuc_luong`, mặc định `dinh_luong × dai_nguyen × rong_nguyen × to_nguyen`).
   Lô kho không có khổ, tồn = tổng kg mọi lô cùng mã (`stock_lot.py`, `on_hand_map`). Kho chỉ có
   C-300 65×86 mà lệnh cần 78×90,5 vẫn báo đủ.
2. **Xếp lịch và phát hành bị chặn vì vật tư** (`xep_lich_service._chan_chua_giu_du` lúc đặt lịch;
   `xep_lich/release.py::van_de_vat_tu` lúc phát hành) — người dùng không muốn. Giữ cổng phát hành thì
   lệnh cần cắt (kho không có đúng khổ ⇒ giữ chỗ không đủ) không bao giờ phát hành được, nên không
   bao giờ tới tổ Cắt.
3. **Khâu cắt chỉ ghi được nếu người lập lệnh đặt sẵn bước cắt trước khi phát hành**; phát hành xong
   tuyến đóng băng (`release_update.py:25`). Người quyết cắt thật là tổ Cắt, sau khi lệnh xuống.

## 2. Luồng mới

1. **Lập lệnh** (Kế hoạch sản xuất) như hiện nay: tuyến In + sau in. Dòng giấy ghi mã + khổ + số tờ.
2. **Kế hoạch vật tư** so số tờ cần với tồn lô tờ ĐÚNG mã + ĐÚNG khổ. Giữ chỗ vẫn có, nhưng không
   chặn Xếp lịch. Người kế hoạch gom dòng của lệnh, bấm Đề nghị mua ⇒ yêu cầu mua (có khổ).
3. **Thu mua** lập đơn mua từ các dòng mình chọn: bỏ tick dòng không mua (vd 79×109 vì kho có 80×109,
   sau tổ Cắt sẽ tề), sửa số lượng, sửa khổ mua. Rồi kế toán duyệt, nhập kho như hiện nay.
4. **Phát hành**: lệnh có dòng giấy tự tới tổ Cắt (tổ mang cờ `la_to_cat`), đẩy ngay. Bước mang dòng
   giấy (thường là In) bị khoá: **cổng "chờ tổ Cắt"**.
5. **Tổ Cắt chốt**, một trong hai:
   - **Chèn bước trước in** (một hay vài công đoạn cắt). Tổ Cắt xin giấy nguồn bằng Đề nghị cấp vật tư,
     cắt, ghi mẻ (tính khoán), rồi **Bàn giao** sang bước mang giấy (In); tổ In xác nhận — ngoài đời
     chưa cần cầm gì qua tay. Cổng bàn giao hiện có mở In.
   - **"Không cần cắt — đủ giấy"**: In mở ngay.
6. **Giấy tới tổ In — tuỳ người làm, máy không ép**: tổ In lập Đề nghị cấp vật tư chọn giấy + khổ + số
   lượng trong kho, hoặc sang tổ Cắt lấy thẳng. Giấy đã cắt, tờ dư, cuộn thừa muốn cất thì tổ Cắt tạo
   yêu cầu nhập kho (luồng hiện có) ⇒ lô mới đúng dạng, đúng khổ.
7. In và sau in chạy như hiện nay.

Máy chặn đúng một chỗ: cổng "chờ tổ Cắt" (và cổng bàn giao sẵn có khi đã chèn bước). Còn lại chỉ ghi
nhận.

## 3. Mô hình dữ liệu

### 3.1 Khổ và dạng

- **Khổ** lưu hai số nguyên mm `kho_rong` (cạnh NGẮN) · `kho_dai` (cạnh DÀI) — cùng tên, cùng đơn vị
  với `giay_nguyen.kho_rong/kho_dai` và quy cách lệnh (`kho_nguyen_*`, `kho_in_*`). Chuẩn hoá lúc ghi:
  780×905 và 905×780 là một khổ. `0` = không có cạnh đó (đúng quy ước sẵn của `giay_nguyen`); cột
  NOT NULL default 0 để khoá so sánh / unique / `tuple_ IN` không vướng NULL. Cuộn: `kho_rong` = khổ
  rộng, `kho_dai` = 0. Vật tư khác: 0 · 0.
- **Dạng** `dang_giay`: `to` | `cuon`. Chỉ hàng Giấy có; vật tư khác để trống.
- So khổ = **bằng nhau tuyệt đối** trên hai số đã chuẩn hoá. KHÔNG so lớn hơn / bé hơn (người dùng
  chốt 01/10: giữ đơn giản).

### 3.2 Đơn vị đếm

- **Lô tờ** đếm bằng đơn vị chặng tờ nguyên (`TRAM_TO_NGUYEN` — chặng cố định trong code, không phải
  tên danh mục). Nhập bằng ram thì đổi theo cặp quy đổi khai ở module Đơn vị (ram → tờ nguyên). Seed
  cũ chỉ có cặp ram → tờ IN; thiếu cặp ram → tờ nguyên thì form nhập báo đúng câu "không đổi được…"
  sẵn có, người khai cặp ở module Đơn vị — máy không tự suy.
- **Lô cuộn** đếm bằng đơn vị gốc của mã giấy (`giay_nguyen.don_vi_gia`), phải thuộc họ Khối lượng —
  nhập cuộn cho mã có đơn vị gốc không phải khối lượng thì báo lỗi, không đoán.
- Không có phép đổi tờ ↔ kg ở đâu cả. Máy không quy cuộn ra tờ.

### 3.3 Cột mới / bỏ (migration trong `db_migrations.py` + `docs/DB_SCHEMA.md`)

| Bảng | Thêm | Ghi chú |
|---|---|---|
| `giay_nguyen` | — | BỎ `cong_thuc_luong`; DROP bảng `cong_thuc_lich_su` (Giấy là danh mục DUY NHẤT còn ghi lịch sử công thức — gỡ ô là cả cụm thành code chết) |
| `departments` | `la_to_cat` bool (false) | đích danh, không kế thừa cây con — như `is_kcs` / `la_to_in` |
| `stock_lots` | `dang_giay`, `kho_rong`, `kho_dai` | bắt buộc với hàng Giấy |
| `stock_voucher_lines` | `dang_giay`, `kho_rong`, `kho_dai` | phiếu nhập sinh lô mang theo |
| `stock_request_lines` | `dang_giay`, `kho_rong`, `kho_dai` | yêu cầu nhập/xuất, đề nghị cấp |
| `san_xuat_vat_tu_de_nghi_dong` | `dang_giay`, `kho_rong`, `kho_dai` | dòng Đề nghị cấp vật tư của tổ (đẩy sang `stock_request_lines`) |
| `department_purchase_request_lines` | `kho_rong`, `kho_dai` | khổ CẦN |
| `purchase_request_lines` | `kho_rong`, `kho_dai` | khổ MUA, mặc định chép từ khổ cần, sửa được |
| `lsx_cong_doan_vat_tu` | `kho_rong`, `kho_dai` | dòng giấy của bước (unique giữ nguyên: một mã một khổ mỗi bước) |
| `vat_tu_giu_cho` | `kho_rong`, `kho_dai` | giữ chỗ giấy theo (mã, khổ) |
| `stock_thresholds` | `kho_rong`, `kho_dai` | unique đổi thành (hàng, kho, khổ) |
| `lsx`, `bai_ghep` | `giay_chot_cach` (`cat` / `khong_cat`), `giay_chot_luc`, `giay_chot_boi_id` | trống = chưa chốt |
| `lsx_cong_doan`, `bai_ghep_cong_doan` | `chen_boi_to_cat` bool (false) | bước tổ Cắt chèn sau phát hành — để "Sửa chốt" chỉ gỡ đúng các bước này, không đụng bước cắt người lập lệnh tự đặt |

Cột Boolean dùng `server_default` Python bool. Prod DB trắng ⇒ không backfill; dev đang có dòng giấy
kg thì migration để trống khổ, dòng đó hiện "chưa có khổ" cho người sửa tay.

## 4. Chi tiết từng khâu

### 4.1 Danh mục Giấy

Bỏ ô "Công thức tính định mức" ở form, Excel, nhật ký danh mục. Giữ nguyên công thức GIÁ (Tính giá /
báo giá không đổi). Đơn vị gốc của mã giấy còn hai vai: tính giá, và đơn vị đếm lô cuộn.

### 4.2 Dòng giấy của lệnh

- Vẫn là dòng vật tư người lập lệnh gắn vào một bước (`lsx_cong_doan_vat_tu`, `hang_loai='giay'`).
- Chọn mã giấy thì điền sẵn: khổ = khổ nguyên của quy cách lệnh (thiếu thì khổ in), số tờ = số tờ
  nguyên (thiếu khổ nguyên thì số tờ in), đơn vị = tờ nguyên. Người lập lệnh sửa được cả ba — hộp
  carton có giấy mặt, sóng, đáy mỗi loại một khổ.
- Bỏ nhánh giấy của `_luong_vat_tu` / `_goi_y_luong_vat_tu` (không còn công thức nào cho giấy).
- **Bài ghép**: dòng giấy của bài = `bai_ghep.giay_id` + khổ + số tờ, cùng luật mặc định: khổ nguyên
  của bài (`quy_cach_bien_bai`) với `tinh_so_to()["to_nguyen_can"]`; thiếu khổ nguyên thì khổ in của
  bài (`bai_ghep.kho_in_dai/rong`) với `tinh_so_to()["tong_to"]`. Dẫn xuất, KHÔNG thêm cột: bài đã có
  ô khổ in riêng để sửa, còn khổ nguyên đi theo thành viên.

### 4.3 Kế hoạch vật tư

- Dòng giấy hiện "C-300 · 78×90,5 · 5.000 tờ". Khoá nhu cầu và tồn của giấy là (mã, khổ); vật tư khác
  giữ khoá (mã) như cũ.
- Tồn đem so = Σ lô `to` đúng mã + đúng khổ ở mọi kho. Hàng đang về = dòng đơn mua đúng mã + đúng khổ
  MUA. Lô cuộn không đem so.
- Bỏ `_ve_goc(tong_lenh)` chạy công thức giấy, `_quy_cach_cua`, và nội suy tỉ lệ kg ở
  `vat_tu_de_nghi._ve_goc_dong` cho giấy: số tờ là số tờ, không quy đổi.
- **Giữ chỗ** giữ nguyên cơ chế, đổi khoá giấy sang (mã, khổ), đếm tờ. `kiem_xuat` so theo cùng khoá.
- **Bỏ cổng** `_chan_chua_giu_du` ở Xếp lịch cho mọi vật tư (người dùng chốt 01/10). Cổng phát hành
  `van_de_vat_tu` hạ từ CHẶN xuống CẢNH BÁO: vẫn nói thiếu gì, không chặn.
- **Đề nghị mua**: dòng yêu cầu mua mang khổ cần.

### 4.4 Thu mua

Đã có: huỷ từng dòng yêu cầu không mua (mg 0233); số lượng dòng đơn mua là cột riêng ở máy chủ.

Chưa có (kiểm code 01/10/2026, phải làm mới):
- Form lập đơn mua (`PurchaseFormDrawer`) bày tên, ĐVT, số lượng CHỈ ĐỌC; `openCreatePurchaseRequest`
  lấy TẤT CẢ dòng yêu cầu, không có bước chọn. Mới: mỗi dòng một ô tick (bỏ tick = không đưa vào đơn
  này, dòng yêu cầu vẫn mở — muốn đóng hẳn thì dùng nút huỷ dòng sẵn có), số lượng sửa được, khổ mua
  sửa được. ĐVT vẫn chỉ đọc.
- Ô khổ trên dòng yêu cầu mua (khổ cần) và dòng đơn mua (khổ mua, mặc định chép khổ cần).
- Đợt giao "Nhập kho" chép khổ + dạng sang yêu cầu nhập (khổ đủ hai cạnh ⇒ tờ, còn lại ⇒ cuộn); thủ
  kho sửa theo hàng thực.

### 4.5 Kho

- Form yêu cầu nhập / phiếu nhập với hàng Giấy: hiện và bắt buộc ô dạng + khổ. Sinh lô mang theo.
- Giá lô tờ mua theo kg: đơn giá nhập mỗi tờ = thành tiền dòng ÷ số tờ nhập. Tiền vẫn gate
  `kho:view_cost` ở máy chủ.
- **Tồn**: giấy tờ gom theo (mã, khổ), đơn vị tờ; giấy cuộn gom theo mã, đơn vị kg (khổ rộng ghi trên
  từng lô để xem, không dùng để gom). Áp cho màn tồn từng kho, báo cáo kho, `on_hand_map`.
- **Ngưỡng tồn**: giấy tờ khai theo (mã, khổ), đơn vị tờ; giấy cuộn theo mã, đơn vị kg.
- Phiếu xuất cho yêu cầu có khổ: danh sách lô để chọn lọc đúng mã + dạng + khổ. Xin cuộn (tổ Cắt xin
  giấy nguồn) chỉ cần mã + kg, khổ rộng tuỳ chọn; kho chọn lô cuộn, trừ đúng số kg trên phiếu xuất.
- Khoá chống trùng dòng của phiếu (`_validate_lines`) và của yêu cầu thêm dạng + khổ: cùng mã hai khổ
  là hai dòng hợp lệ.

### 4.6 Tổ Cắt sau phát hành

- **Cờ tổ**: `departments.la_to_cat`, tick ở màn phòng ban như `is_kcs`. Không có tổ nào mang cờ thì
  không có cổng "chờ tổ Cắt" (lệnh chạy như hiện nay).
- **Lệnh tới tổ Cắt**: lúc phát hành, lệnh có ít nhất một dòng giấy ⇒ vào danh sách "Chờ chốt giấy"
  trên bàn tổ Cắt. Bài ghép vào theo BÀI (bước In là bước chung). Đẩy SSE ngay: badge + toast.
- **Khối chốt giấy** trên bàn tổ Cắt, mỗi lệnh/bài một dòng: dòng giấy cần (mã · khổ · số tờ), tồn lô
  tờ đúng khổ, và các lô cuộn cùng mã (khổ rộng, kg) để người xem — máy không kết luận.
- **Chèn bước**: chọn một hay nhiều công đoạn trong danh mục Công đoạn có tổ phụ trách là tổ mang cờ
  `la_to_cat` (đúng luật mg 0312, không hardcode tên), sắp thứ tự. Hệ thống thêm các bước vào ĐẦU tuyến
  lệnh (`chen_boi_to_cat=true`) và nối bằng CẠNH TƯỜNG MINH: Cắt₁ → … → Cắtₙ → bước mang giấy. Cạnh
  tường minh làm thứ tự `thu_tu` không còn quyết chặng trước, nên lệnh CTP → In vẫn đúng: CTP không
  phải chờ Cắt, In chờ cả CTP lẫn Cắt. Công việc dựng bằng chính phần thân của `dung_cong_viec` (tách
  thành hàm dựng cho MỘT bước, hành vi phát hành không đổi), cùng gói đang chạy; công đoạn trước tính
  lúc chạy từ tuyến lệnh nên KHÔNG cần dòng `san_xuat_phu_thuoc`. Ghi `giay_chot_cach='cat'`. Bước
  chèn không có giờ xếp lịch; số vào/ra tổ tự ghi (hệ số quy đổi trống ⇒ không trần, đúng luật
  `dau_vao.py`). Phát hành cập nhật không xoá/tạo lại công việc nên giữ nguyên các bước này.
- **Bài ghép**: chèn MỘT `lsx_cong_doan` cho mỗi lệnh thành viên + MỘT `bai_ghep_cong_doan` phủ các
  bước đó (đúng khuôn bước chung của bài) ⇒ một công việc cắt cho cả bài. Bước mang giấy của bài =
  bước chung đầu tiên theo `thu_tu` (cùng mốc neo ngày cần giấy của Kế hoạch vật tư).
- **Không cần cắt**: ghi `giay_chot_cach='khong_cat'`.
- **Sửa chốt**: được gỡ chốt rồi chốt lại khi bước mang giấy chưa bắt đầu; bước cắt đã có mẻ thì
  không gỡ được.
- **Ai bấm**: người có quyền Thực hiện (`run_order`) của tổ Cắt. Mọi lần chốt/sửa ghi audit (nhãn
  trong `audit_registry.py`).

### 4.7 Cổng "chờ tổ Cắt"

Thêm vào `kiem_bat_dau`: công việc là BƯỚC MANG GIẤY (lệnh: bước có dòng `hang_loai='giay'`; bài:
bước chung đầu tiên của bài có `giay_id`), có ít nhất một tổ mang cờ `la_to_cat`, và lệnh/bài chưa
chốt giấy ⇒ chặn, câu báo "Chờ tổ Cắt chốt giấy cho LSX… — tổ Cắt chèn bước cắt hoặc bấm Không cần
cắt". Bước khác (CTP, sau in) không bị cổng này. Bước cắt tổ Cắt chèn không mang giấy nên không bị
chặn. Sau chèn, In có công đoạn trước ⇒ cổng bàn giao sẵn có lo phần còn lại. Chốt xong đẩy SSE cho
tổ của bước mang giấy.

(Bản trước ghi "bước KHÔNG có công đoạn trước". Sửa lúc lập plan: lệnh có CTP trước In thì bước đầu
là CTP — chặn CTP là chặn nhầm, còn In có CTP đứng trước nên lọt cổng. Người dùng lo đúng chỗ "tổ In
nhấn bắt đầu".)

## 5. Không đổi

Tính giá / báo giá; luồng duyệt đơn mua của kế toán; Đề nghị cấp vật tư và xác nhận nhận; ghi mẻ,
bàn giao, trần ghi mẻ; vật tư khác (định mức theo dòng vật tư của công đoạn, tồn theo mã).

Ngoài phạm vi, ghi để nhớ: cột Khoán ở bảng lương vẫn bằng 0 (chờ màn Khoán theo kỳ).

## 6. Kiểm thử

- pytest nhắm file: chuẩn hoá khổ; tồn/nhu cầu giấy theo (mã, khổ); lô cuộn không vào so sánh; giữ chỗ
  theo khổ; Xếp lịch không còn chặn vì vật tư; cổng "chờ tổ Cắt" (chặn / mở sau chèn / mở sau Không
  cần cắt / không có tổ cờ thì không chặn); chèn bước dựng công việc + phụ thuộc và cổng bàn giao
  chặn In; migration trên SQLite + Postgres trắng; guard `DB_SCHEMA.md`.
- `npx tsc` cho frontend.
- Thao tác thật trên dev-browser trọn luồng: lập lệnh có giấy → Đề nghị mua → thu mua bỏ tick một
  dòng, sửa số → phát hành → tổ Cắt thấy lệnh ngay (không tải lại) → chèn Cắt tờ → tổ In bấm bắt đầu
  bị chặn → tổ Cắt ghi mẻ, bàn giao → tổ In xác nhận, bắt đầu được → tổ In đề nghị cấp chọn lô đúng
  khổ. Nhánh thứ hai: "Không cần cắt" mở In ngay.

## 7. Chỗ code chạm (số dòng tại 01/10/2026)

`ke_hoach_vat_tu_service.py`, `giu_cho_service.py` đang có thay đổi chưa commit của phiên khác — số dòng
có thể trôi.

- Danh mục Giấy: `frontend/src/pages/rebuildCatalogConfigs.tsx:474-481, 520-522`;
  `models/vat_lieu_kho.py:77`; `schemas/vat_lieu_kho.py:60,83-86`; `routers/vat_lieu_kho.py:123`;
  `services/catalog_excel_specs.py:321`; `services/vat_lieu_kho_service.py:38-41`;
  `services/nhat_ky_danh_muc.py:40,170,536`; `seed_rebuild.py:271-283`; `import_danh_muc_prod.py`.
- Lệnh: `services/lsx_service.py:716-721, 763-774`.
- Kế hoạch vật tư: `services/ke_hoach_vat_tu_service.py:226-331, 391-408, 772, 954-984`.
- Giữ chỗ / cổng: `services/giu_cho_service.py`; `services/xep_lich_service.py:1210`.
- Đề nghị cấp: `services/san_xuat/vat_tu_de_nghi.py:89-115`.
- Kho: `models/stock_lot.py`, `repositories/stock_lot_repo.py:212`, voucher/request models.
- Mua: `routers/ke_hoach_vat_tu.py:247-271`, `services/purchase_service.py:1880-1912`.
- Tổ Cắt + cổng: `models/department.py`, `services/san_xuat/snapshot.py` (`dung_cong_viec`,
  `dung_phu_thuoc`), `services/san_xuat/release.py`, `release_update.py`, `services/san_xuat/dau_vao.py:208`.
- `services/bien_cong_thuc.py:103-107`: chú thích "tờ→kg là thứ DUY NHẤT…" hết đúng, sửa theo.

Việc chạm hơn 5 module ⇒ bản kế hoạch triển khai chia mỗi Task một module.

## 8. Sửa lúc lập plan (01/10/2026, sau khi đọc code)

1. Tên cột khổ `kho_ngan` → `kho_rong` (cạnh ngắn) cho khớp `giay_nguyen` và quy cách; số nguyên mm,
   NOT NULL default 0 (§3.1).
2. §4.4: chọn dòng / sửa số lượng / sửa khổ trên form lập đơn mua là việc MỚI, không phải "đã có".
3. Cổng phát hành `van_de_vat_tu` cũng chặn vì vật tư ⇒ hạ xuống cảnh báo (§1, §4.3).
4. Cổng "chờ tổ Cắt" đặt ở BƯỚC MANG GIẤY, không ở "bước đầu" (§4.7); bước cắt chèn ở đầu tuyến và
   nối bằng cạnh tường minh tới bước mang giấy (§4.6).
5. Thêm cột: `san_xuat_vat_tu_de_nghi_dong` (dạng + khổ), `chen_boi_to_cat` trên `lsx_cong_doan` /
   `bai_ghep_cong_doan`; DROP bảng `cong_thuc_lich_su` (§3.3).
6. Khổ giấy của bài ghép dẫn xuất, không thêm cột (§4.2).
7. Khoá chống trùng dòng phiếu/yêu cầu kho thêm dạng + khổ (§4.5).
