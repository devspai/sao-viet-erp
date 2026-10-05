# Thiết kế — Vật tư có chip riêng + công thức giá/định mức, vật tư đi theo bước, gỡ logic khuôn

> Trạng thái: **BẢN NHÁP THIẾT KẾ** (01/10/2026) — chốt qua hội thoại với chủ dự án, CHƯA đụng code.
> Plan triển khai: `docs/superpowers/plans/2026-10-01-vat-tu-chip-cong-thuc.md` (10 Task, 3 giai đoạn).
> **Plan CHỐT thêm các điểm mở ở §6 và LỆCH spec ở các chỗ sau — chỗ nào lệch thì plan thắng:**
> bảng `phieu_buoc_vat_tu` không có cột `nguon` (Đ3); chép từ công đoạn sang phiếu làm ở frontend; `phieu_vat_tu`
> ngưng đọc/ghi và KHÔNG backfill; cột khuôn gỡ khỏi model nhưng giữ trong DB (Đ7); lệnh không phiếu thì bung từ
> danh mục công đoạn với chip = 0; migration `0357`–`0360`, `0360` xoá dòng phân quyền `khuon_be`.
> Việc tiếp theo: người dùng nói "làm đi" mới được đụng code.

## 1. Ý định (nguyên văn tinh thần của chủ dự án)

1. Mỗi **vật tư** tự khai được **chip riêng có tên** (vd vật tư *Support*: "Định lượng support", "Dài support",
   "Rộng support") và hai công thức: **công thức tính giá** và **công thức định mức**, viết bằng chip đó.
2. Ở **công đoạn** (danh mục) chọn danh sách vật tư công đoạn dùng. Ô nhập định mức ở dòng vật tư của công
   đoạn **bỏ** — định mức ăn theo công thức ở vật tư, không nhập tay.
3. Ở **phiếu tính giá**, thêm công đoạn vào chuỗi thì vật tư của nó **tự hiện** dưới bước đó (không phải chọn),
   thêm/xoá bớt được cho riêng phiếu. Mỗi vật tư tự mọc ô nhập số cho chip của nó; công thức giá thế số vào.
4. Xuống **lệnh sản xuất**, tab Vật tư của bước lấy đúng danh sách + số chip đã chốt ở phiếu, tính định mức bằng
   công thức định mức. Ô định mức chỉ đọc.
5. **Khuôn chỉ là một vật tư**, không có cờ riêng, không có logic riêng. Gỡ toàn bộ logic khuôn cũ.

## 2. Hiện trạng đã đọc (01/10/2026)

| Thứ | Nơi | Hiện trạng |
|---|---|---|
| Danh sách vật tư của công đoạn | `cong_doan_vat_tu` (mg 0316) | có `cong_thuc_luong` theo dòng (công đoạn × vật tư) |
| Công thức giá vật tư | `vat_tu_in_an.cong_thuc_gia` | cột còn, ô trên màn đã ẩn; engine vẫn đọc |
| Công thức lượng ở vật tư | — | `vat_tu_in_an.cong_thuc_luong` đã gỡ mg 0274 (06/09) |
| Vật tư ở phiếu | `phieu_vat_tu` | gắn vào **thành phần** (`phieu_thanh_phan`), gõ tay, KHÔNG theo bước |
| Bước của phiếu | `phieu_thanh_pham` | mang `phi_khuon`, `khuon_nguon`, `dai_khuon`, `rong_khuon`, `so_khuon` |
| Bảng chip công thức | `services/bien_cong_thuc.py` | **danh sách cố định**, bốn ô (giấy · vật tư · công đoạn · quy đổi); validator FE+BE đọc từ đây |
| Bung BOM ở lệnh | `lsx_service._vat_tu_bung` (dòng 612) | bung từ `cong_doan.vat_tus` + `cong_thuc_luong` của dòng; KHÔNG đi qua phiếu |
| Liên kết lệnh ↔ phiếu | `lsx.phieu_thanh_phan_id` | đã có — đường kế thừa sẵn |

## 3. Quyết định thiết kế

**Đ1 — Chip riêng của vật tư là dữ liệu, không phải code.** Bảng mới (tên tạm `vat_tu_chip`): `vat_tu_id`, `ma`
(sinh từ tên, bỏ dấu, snake_case, duy nhất trong vật tư), `ten`, `don_vi`, `thu_tu`. Người khai bấm chip để chèn
vào công thức (như `FormulaField` hiện có) nên không phải gõ mã. `ma` **không được trùng** biến hệ thống trong
`bien_cong_thuc.py`. Bộ chip hệ thống (dài/rộng sản phẩm, `sl_vao`, `so_mau`…) vẫn dùng được chung trong cả hai
công thức của vật tư.

**Đ2 — Hai công thức nằm ở vật tư.** `cong_thuc_gia` (đã có, mở lại trên màn) + `cong_thuc_dinh_muc` (cột mới;
kiểm mg 0274 xem tên cũ `cong_thuc_luong` còn hay đã drop rồi mới đặt tên). Màn danh mục Vật tư thêm hai tab:
*Công thức tính giá* (khai chip + công thức giá) và *Công thức định mức*. Chip khai MỘT lần, dùng ở cả hai tab.

**Đ3 — Vật tư theo bước ở phiếu.** Bảng mới (tên tạm `phieu_buoc_vat_tu`): `thanh_pham_id` (bước của phiếu),
`vat_tu_id`, `thu_tu`, `gia_tri_chip` (JSON `{ma: số}`), `nguon` (`cong_doan` | `them_tay`). Chép từ danh sách vật
tư của công đoạn **một lần** lúc bước nhận công đoạn (đổi công đoạn của bước ⇒ chép lại). Vắng dòng = đã xoá, **không
tự mọc lại** khi mở lại phiếu; danh mục công đoạn đổi sau đó **không đè** phiếu đã chép (băng "Danh mục đã đổi" đã
có sẵn để báo lệch). Vật tư gõ tay cấp thành phần (`phieu_vat_tu`) **thay** bằng bảng này (dự án chưa có user
thật, không cần tương thích ngược).

**Đ4 — Engine tính giá.** Vòng lặp vật tư trong `thanh_phan_engine` (dòng ~995) chuyển từ `tp["vat_tus"]` sang vật
tư của từng bước; ngữ cảnh eval = ngữ cảnh bước + giá trị chip của dòng. Tiền vẫn vào nhóm nguyên vật liệu (giả
định, xem §6).

**Đ5 — Lệnh sản xuất.** `_vat_tu_bung` đọc vật tư + chip từ phiếu (qua `lsx.phieu_thanh_phan_id`, bước tương ứng),
tính bằng `cong_thuc_dinh_muc`; ô định mức ở bảng BOM chỉ đọc. Giá trị chip chép xuống bước lệnh (không tra ngược
phiếu lúc chạy, để phiếu sửa sau không làm đổi lệnh đã lập).

**Đ6 — Định mức ở công đoạn.** `cong_doan_vat_tu.cong_thuc_luong` thôi được đọc/ghi; ô trên màn Công đoạn bỏ. Cột
giữ nguyên trong DB (quy ước dự án: không drop). ⚠️ Đây là **đảo quyết định 06/09/2026** (định mức theo dòng
công đoạn × vật tư). Hệ quả: một vật tư dùng ở hai bước có định mức khác nhau thì phải để công thức tự phân biệt
bằng chip bước (`sl_vao`, `so_luot_chay`…), không khai riêng theo bước được nữa.

**Đ7 — Gỡ toàn bộ logic khuôn.** Khuôn là vật tư bình thường (vd *Khuôn ép kim* có chip dài/rộng/số khuôn, công
thức giá = dài × rộng × số × đơn giá). Dùng lại dao cũ = không có dòng vật tư đó ở bước. Gỡ:
- Công đoạn: cờ `requires_tooling`, `tooling_type`, tab "Khuôn & dụng cụ".
- Phiếu: khối Phí khuôn, `phi_khuon`, `khuon_nguon`, `dai_khuon`, `rong_khuon`, `so_khuon` (cột giữ, thôi dùng).
- Công thức: ba biến `dai_khuon`/`rong_khuon`/`so_khuon` + `KHUON_MAC_DINH`/`MAC_DINH_TANG_LENH`; công thức công
  đoạn đang dùng ba biến này phải được rà và chuyển sang vật tư trước khi gỡ.
- Lệnh/kế hoạch/xếp lịch/bàn tổ: `lsx_cong_doan.khuon_be_id`, `khuon_nguon`, `khuon_phi`; cửa "sẵn sàng lập kế
  hoạch" đòi dao; snapshot dao khi phát hành; mã dao + số kệ ở phiếu công nghệ; ô tích nhận/trả khuôn ở bàn tổ.
- Danh mục **Khuôn & khung** (`khuon_be`): gỡ màn, route, mục sidebar, ô quyền và nhật ký liên quan. **Bảng DB và
  dữ liệu giữ nguyên, không drop** (cùng quy ước; chuỗi quyền `khuon_be` nằm trong `role_permissions` của DB thật).
  Guard `test_ma_tran_quyen_khop_thanh_ben` phải được cập nhật cùng lúc.
- Tài liệu: `docs/design-khuon-khung-xuyen-suot.md` (phần khuôn) thành lỗi thời — ghi chú đầu file.

## 4. Luồng đầu–cuối

```
Vật tư (danh mục)   chip riêng + công thức giá + công thức định mức
   ↓
Công đoạn (danh mục) danh sách vật tư mặc định (không còn ô định mức)
   ↓  chép MỘT lần khi thêm bước
Phiếu tính giá       vật tư theo bước: thêm/xoá + nhập số chip → giá
   ↓  kế thừa qua lsx.phieu_thanh_phan_id, chép chip xuống bước
Lệnh sản xuất        BOM của bước = vật tư đã chốt, định mức = công thức, chỉ đọc
```

## 5. Đụng tới những module nào (một Task một module khi lập plan)

1. Vật tư: model + migration + schema + màn danh mục (hai tab) + `vat_tu_chip`.
2. Biến công thức: `bien_cong_thuc.py` + validator BE/FE nhận chip động theo vật tư; `FormulaField`.
3. Công đoạn: gỡ ô định mức dòng vật tư + gỡ cờ khuôn; Excel danh mục (`catalog_excel_specs`).
4. Phiếu tính giá: bảng theo bước, API, UI từng bước, chép lúc thêm bước, sản phẩm tái bản (`cau_hinh_json`).
5. Engine giá: `thanh_phan_engine`, `tinh_gia_service`.
6. Lệnh sản xuất: `_vat_tu_bung`, `_goi_y_luong_vat_tu`, bảng BOM ở drawer bước, kế hoạch vật tư.
7. Gỡ khuôn: lệnh, xếp lịch, snapshot/thực thi, phiếu công nghệ, bàn tổ, danh mục Khuôn & khung, RBAC, nhật ký.
8. Migration + `docs/DB_SCHEMA.md` + test (đã có test khoá bộ biến, test migration khuôn, test phiếu, test lệnh).

## 6. Giả định chưa được chủ dự án xác nhận / điểm mở cho bước plan

- Tiền vật tư theo bước vẫn rơi vào dòng **nguyên vật liệu** (không gộp vào dòng công đoạn).
- Lệnh **không có phiếu** (`phieu_thanh_phan_id` rỗng): bung từ danh sách vật tư của công đoạn, chip = 0 và báo
  "thiếu chip" thay vì đoán. Cần xác nhận lệnh nào có thể không có phiếu.
- Cách ánh xạ **bước phiếu ↔ bước lệnh** (step_key / thứ tự) — đọc kỹ ở bước plan.
- Công thức công đoạn đang gõ ba biến khuôn: số lượng và cách chuyển sang vật tư — đếm trên DB dev trước khi gỡ.
- Phiếu cũ trên DB dev đang dùng `phi_khuon`: số tiền khuôn đã nhập sẽ không còn nguồn — chấp nhận (dev, chưa user thật).
- Chip có **đơn vị** hay không: đề xuất có (hiện sau ô nhập), không bắt buộc.

## 7. Ngoài phạm vi

Không đổi cách tính giấy, công đoạn khoán, quy đổi đơn vị; không đổi báo giá (chỉ nhận số mới từ phiếu).
