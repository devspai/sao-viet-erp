# Thiết kế — Làm lại Tiêu chí KCS (logic + giao diện)

Trạng thái: **ĐÃ CODE + bấm thử 08/10/2026.** Mockup CHỐT (gom mọi thứ dưới đây, có màu):
`docs/mockups/tieu-chi-kcs-chot.html`. Bản so sánh lúc chọn: `docs/mockups/tieu-chi-kcs-3-phuong-an.html` và luồng chép `docs/mockups/tieu-chi-kcs-chep-3-phuong-an.html`
(cách 2 — hộp soạn trước khi chép, có ô tìm tương đối) (chọn phương án A + nút "Xem KCS cuối thấy gì"; đã chọn B rồi đổi sang A cùng ngày).
Mục tiêu chủ chốt đặt: đơn giản, dễ hiểu, dễ thao tác nhưng vẫn đủ.

Giữ nguyên từ `design-kcs-theo-cong-doan.md`: tiêu chí THUỘC ĐÚNG MỘT công đoạn; giai đoạn là
`cong_doan.nhom`, không phải bản ghi. Giữ nguyên từ `design-kcs-theo-lenh.md`: công đoạn giữa chuỗi
chỉ ghi lỗi, chỉ bước KCS cuối (`la_kcs_cuoi`) mới kiểm đạt.

---

## 1. Vì sao làm lại

- **Tiêu chí của công đoạn giữa chuỗi không tới tay ai.** Từ 19/09 form kiểm chỉ bày checklist ở
  bước cuối (`KcsKiemForm.tsx`, điều kiện `cuoi && …`), và checklist đó chỉ là tiêu chí của CHÍNH
  công đoạn cuối. Tiêu chí khai cho In, Cán màng, Bế… nằm chết trong danh mục.
- Model có `bat_buoc`, `active` nhưng màn không có ô nào cho chúng: mọi hạng mục mới đều bắt buộc,
  muốn bỏ chỉ có xoá. `thu_tu` có cột nhưng không sắp lại được.
- Thêm công đoạn cần kiểm phải chọn qua hai ô; không thấy công đoạn nào còn trống.
- Màn bày thẻ xếp gạch có ruy-băng, số tô màu — trang trí thừa, trái gu đã chốt (không chữ đậm,
  không tô màu trang trí). Bộ lọc kỳ theo ngày tạo vô nghĩa với danh mục (các màn danh mục khác không có).

## 2. Đã chốt với chủ chốt (08/10/2026)

1. Một tiêu chí = **một câu chữ**, hết. **Bỏ "Cách kiểm"** (`huong_dan`) — chốt sau cùng 08/10.
   Kết quả lúc kiểm chỉ Đạt / Không
   đạt. **Không có kiểu đo số** — xưởng soi bằng mắt là chính.
2. **Bỏ "Bắt buộc"**: mọi tiêu chí đều phải xét. **Bỏ "Ngừng dùng"**: xoá là đủ, vì lệnh đã phát hành
   giữ bản chép riêng (`san_xuat_cong_viec.kcs_tieu_chi_json`), báo cáo đọc bản chép.
3. Không có "Không áp dụng": tiêu chí lấy theo đúng các công đoạn lệnh đã chạy nên luôn liên quan.
4. **Bước KCS cuối gộp tiêu chí của cả chuỗi** công đoạn lệnh đã chạy qua, đúng thứ tự chuỗi, và
   **xét THEO CÔNG ĐOẠN** (mockup `docs/mockups/kcs-cuoi-tieu-chi-3-phuong-an.html`, cách 3): mỗi
   công đoạn một thẻ, bấm "Đạt" cho cả thẻ hoặc "Có lỗi" để tick mục hỏng + số lỗi + ảnh ngay trong
   thẻ. Bỏ ô tick "chưa tick = không đạt" và ô ghi chú từng tiêu chí (mục 3a).
5. Giao diện danh mục: **phương án A — hai ô** (công đoạn bên trái, tiêu chí bên phải), kèm nút
   **"Xem KCS cuối thấy gì"**.
6. Thứ tự kéo thả. **Chép = hộp soạn trước khi chép** (mục 6): sửa, bỏ, thêm tiêu chí ngay trong
   hộp rồi chép vào MỘT HAY NHIỀU công đoạn một lần; ô chọn công đoạn đích có tìm tương đối.

Ngoài phạm vi (hoãn): mức độ lỗi nặng/nhẹ, tần suất lấy mẫu, ảnh mẫu chuẩn, nối tiêu chí với danh
mục mã lỗi. "Không đạt" vẫn KHÔNG chặn gì (chốt 08/09).

## 3. Logic — gộp tiêu chí ở bước KCS cuối

**Gộp lúc ĐỌC, không gộp lúc phát hành.** Mỗi thẻ việc giữ nguyên bản chép tiêu chí của công đoạn
mình như hiện nay (`snapshot._checklist` không đổi cách chép). Bước cuối lấy danh sách gộp bằng một
hàm dùng chung:

```
checklist_gop(cv_cuoi, chuoi) -> [
  {cong_viec_id, ten_cong_doan, nhom_cong_doan, thu_tu, ten}   # theo thứ tự chuỗi
]
```

- `chuoi` = đúng chuỗi công đoạn màn KCS đang bày cho lệnh (`chuoi_cong_doan_kcs`, xếp theo
  `_thu_tu_cong_doan`), lấy từ đầu tới chính bước cuối.
- Mỗi công việc góp các mục trong `kcs_tieu_chi_json` của nó, gắn `cong_viec_id` nguồn.
- Công đoạn tách nhiều phân đoạn (cùng `cong_doan_id`, "lần 1/2", "lần 2/2"): chỉ lấy MỘT lần, gắn
  vào phân đoạn CUỐI — tiêu chí không lặp, lỗi quy về lần chạy sau cùng.
- Vì sao không gộp lúc phát hành: `chot_giay.py` còn đẻ thêm công việc sau phát hành; gộp lúc phát
  hành thì phải nhớ gộp lại ở mọi cửa đẻ việc. Gộp lúc đọc luôn khớp chuỗi đang bày.

**Khoá kết quả đổi từ `thu_tu` sang `(cong_viec_id, thu_tu)`.** `san_xuat_kcs_batch.checklist_json`
mỗi phần tử thành `{cong_viec_id, thu_tu, dat, ghi_chu}`. Phần tử cũ không có `cong_viec_id` ⇒ hiểu
là của chính công việc của lần kiểm (đúng nghĩa cũ) — không cần nắn dữ liệu.

Những chỗ đọc/ghi checklist phải đi qua `checklist_gop`:

- `kcs.chuoi_cong_doan_kcs` — dòng `la_kcs_cuoi` trả checklist gộp; dòng giữa chuỗi trả `[]`
  (form không dùng, khỏi gửi thừa).
- `kcs.ket_qua_kcs_cong_viec` (drawer bàn tổ) — công việc cuối trả checklist gộp để hiện kết quả
  từng lần kiểm cho đúng.
- `kcs._validate_checklist_bat_buoc` → đổi tên `_validate_checklist`: MỌI mục trong danh sách gộp
  phải có một kết quả (khớp theo cặp khoá). Bỏ đọc cờ `bat_buoc`.
- `kcs_bao_cao._checklist_rows_cho_batch` — tra theo cặp khoá; Excel bỏ cột "Bắt buộc", thêm cột
  "Công đoạn".

- `kcs.dieu_chinh_ket_qua` — cũng gọi `_validate_checklist`, nên cũng phải tra danh sách gộp theo cặp
  khoá (hiện chưa màn nào gọi `dieuChinhKcs`, nhưng API còn sống).

- Máy chủ chặn thêm: có mục `dat=false` của công việc X mà lần kiểm không có dòng lỗi nào quy về X
  ⇒ 400 "Công đoạn {tên} có tiêu chí không đạt nhưng chưa ghi lỗi". Form đã chặn trước, máy chủ
  chặn lại cho chắc. Hiện form đã chặn gần giống thế: tiêu chí bắt buộc chưa tick mà Số lỗi = 0 thì
  không cho lưu. Luật mới chỉ siết thêm hai điều: áp cho MỌI tiêu chí (vì cột `bat_buoc` đã bỏ), và
  số lỗi phải quy về đúng công đoạn có tiêu chí hỏng.

**Không đụng luật số đạt → yêu cầu nhập kho.** Tiêu chí KHÔNG tự sinh ra số nào; số vẫn đi đúng
đường hiện nay:

- Một lần kiểm bước cuối kiểm cả phần tổ đã làm mà chưa kiểm: số đạt = phần chưa kiểm − Σ số lỗi mọi
  dòng (`_dat_cong_doan_cuoi`). Tổng số đạt không được vượt tổng số tốt tổ đã ghi (`_chan_vuot_tot`).
- Nút "YC Kho" ở `KcsChuoiCongDoan` gửi `so_con_gui_kho` = min(Σ đạt, Σ tốt) − phần đã đề nghị còn hiệu
  lực. Hàng lỗi ở bước cuối không vào kho. Dòng nhập kho của nhóm nhiều lệnh mang `lsx_id` của lệnh
  thân chính.
- `dieu_chinh_ket_qua` không cho kéo Σ đạt xuống dưới phần đã đề nghị nhập kho. Đóng nhóm vẫn đếm
  theo số đạt của bước cuối.

Hệ quả cần nói rõ với xưởng: thẻ "Có lỗi" luôn đi kèm số lỗi, và số lỗi đó TRỪ THẲNG vào số được nhập
kho. Lỗi nhẹ mà hàng vẫn giao được thì bấm "Đạt" và ghi vào ghi chú chung. Ô Số lỗi trên mọi thẻ
(kể cả thẻ của công đoạn In, vốn đếm bằng tờ) phải tính theo ĐƠN VỊ CỦA BƯỚC CUỐI, vì nó trừ vào số
đạt của bước cuối. Nhãn ô ghi rõ, vd "Số lỗi (hộp)".

**Nhóm thành phẩm nhiều lệnh — gộp cả lệnh phụ (chốt 08/10).** Lệnh phụ (vd ruột, tờ lót) chảy sang
lệnh thân chính qua cạnh nối chéo. Bước KCS cuối nằm ở lệnh thân chính và là chỗ DUY NHẤT hàng ra
thành phẩm. Luật `cong_doan_cuoi_theo_nhom` bảo đảm nhóm hợp lệ chỉ có một bước cuối, nên mọi lệnh
khác trong nhóm đều chảy vào nó. Vì vậy bước cuối gộp tiêu chí của MỌI lệnh trong nhóm:

- Nhóm của bước cuối = `cv.nhom_id`. Việc chung bài ghép (`nhom_id` NULL, hai lệnh chạy chung bước
  cuối) thì lấy nhóm của lệnh KCS đang mở (`lsx_id` form đã gửi sẵn). Lệnh không thuộc nhóm nào thì
  chỉ có chuỗi của chính nó, như cũ.
- `chuoi` của `checklist_gop` = các lệnh trong nhóm (`lenh_cua_nhom`), nạp chung một lượt bằng
  `boi_canh.nap(db, ids)`. Lệnh phụ xếp trước, theo mã lệnh, mỗi lệnh theo thứ tự routing của nó
  (`_thu_tu_cong_doan`). Lệnh thân chính xếp sau cùng, tới chính bước cuối. Việc chung phủ nhiều lệnh
  chỉ góp MỘT lần (khử trùng theo `cong_viec_id`).
- Mỗi mục gộp mang thêm `lsx_id`, `lsx_ma`, `ten_lenh`. Thẻ công đoạn của lệnh phụ ghi tên lệnh phụ
  bằng chữ phụ dưới tên công đoạn (vd "Bế · lệnh Ruột LSX-0412"), chữ trung tính, không thêm màu.
- `_cong_doan_nguon_hop_le` khi `cv.la_kcs_cuoi`: tập hợp lệ = mọi công việc của các lệnh phụ trong
  nhóm, cộng các công đoạn của lệnh thân chính từ đầu tới `cv`. Công đoạn GIỮA giữ luật cũ (chỉ cùng
  lệnh): nó không phải chỗ ra thành phẩm, mở rộng là thừa.
- Lối "+ Lỗi ở công đoạn khác" lấy danh sách công đoạn từ máy chủ (`nguon_loi` trên dòng bước cuối
  của `chuoi_cong_doan_kcs`: `[{cong_viec_id, ten, lsx_ma, to_ten}]`), không tự cắt từ `chuoi` của
  lệnh đang mở như hiện nay, vì `chuoi` đó thiếu lệnh phụ.
- Màn chuỗi công đoạn của LỆNH PHỤ phải thấy "+N lỗi bắt ở {bước cuối}". Hiện `quy_ve` chỉ duyệt các
  lần kiểm trong chuỗi của lệnh đang mở, nên lỗi ghi ở lệnh thân chính bị sót. Phải đọc thêm qua
  `repo.batch_quy_loi_ve` cho các công việc của chuỗi; hàm này ngăn bàn tổ đã dùng.
- Số và kho KHÔNG đổi. Lỗi quy về lệnh phụ vẫn đếm theo đơn vị bước cuối và trừ vào số đạt của bước
  cuối. Số tốt của công đoạn lệnh phụ không bị trừ. Yêu cầu nhập kho vẫn mang lệnh thân chính.
  Thông báo đi về tổ của công đoạn lệnh phụ (`chiu.department_id`), như lỗi quy về công đoạn trước.

Bước cuối bị tách lần chạy thì MỌI phân đoạn đều mang `la_kcs_cuoi`, nên phân đoạn nào cũng bày danh
sách gộp.

## 3a. Form KCS cuối — xét theo công đoạn (chốt 08/10, cách 3)

Chỉ thay khối "Tiêu chí kiểm" + "Số lỗi" của `KcsKiemForm` ở bước `la_kcs_cuoi`. Các khối khác
(đầu lệnh, dải tiến độ, mẻ tổ đã ghi, thẻ quy cách, các lần kiểm trước) giữ nguyên. Một cột, dùng
được trên điện thoại (KCS đứng ở chồng hàng); trên máy tính vẫn là ngăn kéo như cũ.

**Thẻ công đoạn** — mỗi công đoạn trong chuỗi CÓ tiêu chí một thẻ, theo thứ tự chuỗi:

- Đầu thẻ: tên công đoạn + trạng thái bên phải: "N tiêu chí" (chưa xét) / "Đạt" / "N mục hỏng".
- Chưa xét hoặc Đạt: tiêu chí bày dạng gạch đầu dòng để ĐỌC, dưới là hai nút cao 40px "Đạt" |
  "Có lỗi". Bấm Đạt lần nữa không đổi gì; bấm "Có lỗi" để chuyển.
- Có lỗi: thẻ mở ra —
  - danh sách tiêu chí thành dòng tick được (cao 42px), tick = mục HỎNG (chữ đỏ, dấu ✕);
  - khối lỗi ngay dưới: **Số lỗi** (ô số to, tính theo đơn vị của BƯỚC CUỐI, không phải đơn vị của công đoạn trên thẻ; xem mục 3) · **Mô tả** tự điền tên các mục
    hỏng, mỗi mục một dòng, sửa được (đã sửa tay thì thôi tự điền) · **Chụp ảnh** (mở camera, cộng
    dồn như hiện nay);
  - nút "Thôi, đạt" để quay về Đạt (bỏ dòng lỗi của thẻ).
- Mỗi thẻ "Có lỗi" = MỘT dòng lỗi: `cvId` = `cong_viec_id` nguồn của công đoạn đó (bỏ ô chọn "Lỗi do
  công đoạn" cho dòng này — đã rõ từ thẻ). Một dòng mỗi công đoạn chứ không mỗi tiêu chí: mỗi dòng
  lỗi bắt ≥1 ảnh, ba mục hỏng cùng chồng hàng mà bắt ba bộ ảnh là thừa.

**Trên danh sách thẻ:** "Đã xét X/Y công đoạn" + nút "Đạt hết N công đoạn còn lại" (chỉ áp cho thẻ
chưa xét, không đè thẻ đã chọn Có lỗi).

**Lỗi ở công đoạn không có tiêu chí** (vd Gỡ phôi): dưới danh sách thẻ giữ lối "+ Lỗi ở công đoạn
khác" — đúng dòng lỗi thủ công hiện nay (chọn công đoạn đứng trước trong chuỗi, số, mô tả, ảnh).
Chuỗi không có tiêu chí nào ⇒ không có thẻ, form chỉ còn lối này như hiện tại.

**Ghi chú:** bỏ ô ghi chú từng tiêu chí; còn MỘT ô "Ghi chú chung (nếu có)" cuối form = `ghi_chu` của
lần kiểm (đã có). `checklist_json[].ghi_chu` không ghi nữa (để null, không đổi cấu trúc).

**Thanh đáy ghim:** số **đạt** (= phần chưa kiểm − Σ số lỗi, như hiện nay) · số **lỗi** · "trên N chưa
kiểm" · nút "Lưu kết quả kiểm". Nút khoá kèm MỘT dòng lý do, theo thứ tự: "Còn N công đoạn chưa xét"
→ "Tick mục hỏng của {công đoạn}" → "Gõ số lỗi cho {công đoạn}" → "Chụp ít nhất một ảnh lỗi
{công đoạn}" → "Tổng lỗi vượt phần chưa kiểm (N)" → "Tối đa 10 ảnh mỗi lần kiểm". Hai lý do cuối
là trần có sẵn của máy chủ (`_dat_cong_doan_cuoi`, giới hạn 10 ảnh của router), tính trên TỔNG mọi
thẻ, không tính riêng từng thẻ.

**Vì sao không phải đường mới:** form hiện tại đã cho thêm dòng lỗi quy về công đoạn trước ("+ Thêm
dòng lỗi do công đoạn khác"). Dòng đó đếm theo đơn vị bước cuối và trừ vào số đạt; công đoạn bị quy
lỗi thì chỉ hiện "+N lỗi bắt ở …" (`loi_buoc_sau`), số của nó không đổi, và tổ của nó nhận thông báo.
Thẻ công đoạn chỉ xếp lại đúng những dòng lỗi ấy theo từng công đoạn, payload `cac_loi` gửi lên giữ
nguyên.

**Ghi kết quả:** thẻ Đạt ⇒ mọi tiêu chí của thẻ `dat=true`; thẻ Có lỗi ⇒ mục tick `dat=false`, mục
còn lại `dat=true`. Vẫn lưu từng tiêu chí với cặp khoá `(cong_viec_id, thu_tu)`. Mỗi lần kiểm mới bắt
đầu với mọi thẻ "chưa xét".

**Xem lại lần kiểm** (`KcsLanKiemList`, `ThsxKetQuaKcs`): gom theo công đoạn; công đoạn có lỗi lên
đầu, ghi các mục hỏng (mỗi mục một dòng); công đoạn đạt chỉ một dòng "Đạt" (không liệt kê lại từng
mục).

**Màu:** theo luật mục 6 — trung tính; chỉ chữ đỏ cho mục hỏng, số lỗi và trạng thái "N mục hỏng".

## 4. Mô hình dữ liệu

`san_xuat_kcs_tieu_chi`:

- **DROP `bat_buoc`, DROP `active`, DROP `huong_dan`.** Migration: `DELETE … WHERE active = false` TRƯỚC (dòng ngừng
  dùng không được sống lại), rồi drop hai cột. Cập nhật `docs/DB_SCHEMA.md` cùng lúc.
- `thu_tu` giữ; server tự gán `max + 1` khi thêm, đánh lại `1..n` khi sắp xếp. Client không gửi.
- `ma` (`KM####`) giữ, sinh ngầm như cũ.
- Snapshot (`snapshot._checklist`) bỏ ba khoá `bat_buoc`, `nguon`, `huong_dan`. Bản chép cũ còn khoá đó thì bỏ
  qua, không đọc nữa.

Dọn theo: `schemas/san_xuat_kcs_tieu_chi.py`, `schemas/san_xuat.py` (`huong_dan` của dòng checklist),
`repositories/san_xuat_kcs_tieu_chi_repo.py` (`fields`, tìm theo `huong_dan`), `nhat_ky_danh_muc.py`
(nhãn "Bắt buộc"), comment `models/san_xuat.py:257`,
`SxKcsChiTietTieuChi.bat_buoc` ở `api/client.ts`, `catalog_registry` nếu có khai cột.

## 5. API

Đăng ký TRƯỚC `make_catalog_router` (không thì `GET/PUT /{item_id}` nuốt đường).

- `GET /api/san-xuat-kcs-tieu-chi/khai-bao?q=&nhom=` — giữ một cửa tải cả cây. **Bỏ** tham số kỳ
  (`tu_ngay/den_ngay/moc`), `active`, `bat_buoc`. Trả kèm công đoạn CHƯA có tiêu chí (cờ để FE bật
  "Hiện công đoạn chưa có tiêu chí") thay cho mảng `cong_doan_chon` riêng.
- `POST ""` / `PUT /{id}` / `DELETE /{id}` — CRUD nền, body chỉ `cong_doan_id, ten`.
- `PUT /sap-xep` `{cong_doan_id, ids: [...]}` — đánh lại `thu_tu` theo đúng thứ tự gửi; `ids` phải
  là đủ và chỉ các tiêu chí của công đoạn đó, lệch thì 400.
- `POST /chep` `{den_cong_doan_ids: [...], tieu_chi: ["câu chữ", ...]}` — trình duyệt gửi bộ đã
  soạn trong hộp (đã sửa/bỏ/thêm), KHÔNG gửi id nguồn: máy chủ không cần biết nguồn, và bản soạn có
  thể khác nguồn. Với từng công đoạn đích: nối vào cuối (`thu_tu` tiếp theo), bỏ qua câu chữ đích đã
  có (so sau khi cắt khoảng trắng, theo unique `cong_doan_id, ten`). MỘT giao dịch cho mọi đích — lỗi
  ở một đích thì không đích nào được ghi. Trả `{da_chep, bo_qua, theo_dich: [{cong_doan_id, da_chep,
  bo_qua}]}`. `ten` rỗng ⇒ 400; trùng câu trong chính `tieu_chi` gửi lên ⇒ gộp làm một.
- Quyền: `dm_kcs_tieu_chi` — sửa/thêm/sắp xếp/chép cần `update`, xoá cần `delete`.

## 6. Giao diện — phương án A (hai ô)

Đổi từ B sang A cùng ngày 08/10/2026. Một màn chia hai ô, không ngăn chi tiết riêng.

**Đầu màn:** tiêu đề "Tiêu chí KCS" + số công đoạn có tiêu chí + nút "Xem KCS cuối thấy gì". Bỏ
`ThanhLoc` (kỳ + nút Lọc) và `dieu-kien-kcs-tieu-chi.ts`.

**Ô trái — danh sách công đoạn** (rộng ~300px):

- Ô tìm (công đoạn hoặc câu chữ tiêu chí, lọc ở máy chủ): công đoạn nào có tiêu chí khớp thì còn lại.
- Ô tick "Ẩn công đoạn chưa có tiêu chí" (mặc định tắt — thấy chỗ trống là mục đích của ô này).
- Gom theo giai đoạn (nhãn nhỏ có chấm màu giai đoạn), mỗi dòng: tên công đoạn + số tiêu chí ở
  bên phải. Công đoạn chưa có tiêu chí: chữ mờ, số thay bằng "chưa có".
- Dòng đang chọn: viền đủ bốn cạnh, không tô nền đậm. Rê chuột: nền `--rule-hair`.
- Công đoạn đang chọn ghi lên URL (`?cd=`) để F5 / gửi link vẫn mở đúng công đoạn. Mở màn lần đầu
  chọn công đoạn đầu tiên có tiêu chí.

**Ô phải — tiêu chí của công đoạn đang chọn:**

- Đầu ô: tên công đoạn + mã nhỏ + thẻ giai đoạn + nút "Chép sang…" (công đoạn đã có tiêu chí) hoặc
  "Chép từ công đoạn khác" (công đoạn đang trống). Dưới một dòng phụ:
  "N tiêu chí. KCS cuối sẽ thấy nhóm này khi lệnh có chạy {công đoạn}."
- Mỗi tiêu chí MỘT dòng đơn: tay nắm kéo · số thứ tự (chấm tròn màu giai đoạn) · câu chữ · thùng
  rác hiện khi rê chuột.
- Bấm vào câu chữ ⇒ sửa tại chỗ. Enter hoặc rời ô ⇒ lưu; Esc ⇒ huỷ. Câu chữ rỗng
  không lưu.
- Dòng cuối luôn là ô "Gõ tiêu chí mới rồi bấm Enter": Enter lưu, ô trống lại, con trỏ ở yên để gõ
  tiếp. Công đoạn chưa có tiêu chí thì đây là chỗ khai tiêu chí đầu tiên — thay hẳn hộp "chọn giai
  đoạn → chọn công đoạn" cũ.
- Kéo tay nắm đổi thứ tự ⇒ `PUT /sap-xep`.
- Xoá: thùng rác, hỏi xác nhận một câu. Xoá tiêu chí cuối thì công đoạn chuyển sang mờ ở ô trái,
  vẫn đang chọn.
- Hai nút chép mở CÙNG một hộp soạn (dưới đây), chỉ khác chỗ điền sẵn: "Chép sang…" lấy công đoạn
  đang chọn làm nguồn; "Chép từ công đoạn khác" bắt chọn nguồn trước (ô chọn có tìm tương đối) và
  tick sẵn công đoạn đang chọn làm đích.

**Hộp soạn trước khi chép** (cửa sổ giữa màn, ~920px):

- Tiêu đề: "Chép tiêu chí của {nguồn}" + thẻ giai đoạn.
- Cột trái — bộ sẽ chép, nạp từ nguồn: mỗi dòng ô tick (bỏ tick = không chép, chữ gạch mờ) · câu
  chữ sửa tại chỗ · thùng rác để bỏ hẳn khỏi bản soạn. Dòng cuối ô "Thêm tiêu chí chỉ
  cho bản chép rồi bấm Enter". Một dòng nhắc: sửa ở đây không đổi công đoạn nguồn.
- Cột phải — "Chép vào (chọn được nhiều)":
  - **Ô tìm tương đối** trên cùng, dùng lại `khopGanDung` (`frontend/src/utils/timGanDung.ts`): bỏ
    dấu, đ→d, mọi từ gõ vào phải có mặt, thứ tự nào cũng được; so trên chuỗi "mã + tên công đoạn +
    tên giai đoạn" — "dan", "thu dan", "sau in boi", "DAN-MAY" đều ra. Không xếp hạng lại, giữ thứ tự
    giai đoạn → công đoạn. Có nút × xoá chữ tìm.
  - Lọc ở trình duyệt: danh sách công đoạn đã có đủ trong lần tải `khai-bao` (vài chục dòng, không
    phân trang) — khác luật "lọc ở máy chủ" của danh sách bản ghi có phân trang.
  - Hàng **"Đã chọn"** dưới ô tìm: thẻ tên từng công đoạn đã tick, có × để bỏ — công đoạn đã chọn
    không "biến mất" khi bị lọc khuất.
  - Khi đang tìm: dòng "N công đoạn khớp" + nút "Chọn cả N" (chỉ đếm công đoạn chưa chọn, trừ nguồn).
    Không khớp gì: "Không có công đoạn nào khớp “…”".
  - Danh sách gom theo giai đoạn (giai đoạn rỗng sau lọc thì ẩn nhãn). Mỗi dòng: ô tick · tên · số
    tiêu chí đang có ("chưa có" nếu trống). Dòng nguồn mờ, không tick được ("đang chép từ đây").
    Dòng đã chọn viền đậm đủ bốn cạnh; nếu có câu trùng thì dòng nhắc "N câu đã có, sẽ bỏ qua".
- Chân hộp: "X tiêu chí, Y công đoạn đích. Thêm mới Z dòng." · Huỷ · "Chép vào Y công đoạn" (khoá
  khi chưa chọn đích hoặc không còn tiêu chí nào được tick).
- Chép xong: đóng hộp, ở lại công đoạn đang xem, báo "Đã chép N tiêu chí vào Y công đoạn, bỏ qua M
  câu đã có"; ô trái cập nhật số tiêu chí của các công đoạn đích.
- Người không có quyền `update`: không có ô gõ mới, không tay nắm, không nút chép; câu chữ chỉ đọc.

**Màu sắc — CHỈ ở chip giai đoạn** (chủ chốt sửa 08/10: "không dùng màu lung tung, chỉ chỗ cần phân
biệt mới có màu"). Bốn chip Trước in / In / Gia công sau in / Dịch vụ khác mỗi chip một sắc từ bộ
`--tt-*` (`cyan`, `xanh`, `tim`, `cam`), xuất hiện ở: nhãn nhóm giai đoạn ở ô trái, chip giai đoạn
đầu ô phải, nhãn nhóm trong hộp chép và ngăn xem trước. Mọi thứ khác trung tính: ô đếm số tiêu chí,
số thứ tự, viền dòng đang chọn, thẻ "Đã chọn", tiêu đề nhóm công đoạn ở ngăn xem trước và ở bước
KCS cuối. Ngoại lệ duy nhất: chữ đỏ cho tiêu chí không đạt, chữ vàng cho "câu đã có, sẽ bỏ qua" —
chỉ đổi màu chữ, không tô nền, không đóng khung màu.

**Chân màn** một dòng: "Sửa ở đây áp cho lệnh phát hành từ nay. Lệnh đã phát hành giữ bộ tiêu chí
lúc phát hành."

**Nút "Xem KCS cuối thấy gì"** mở ngăn phải (vỏ ngăn chung, cùng độ rộng các ngăn khác):

- Chọn các công đoạn một lệnh sẽ chạy qua bằng thẻ bật/tắt, gom theo giai đoạn; công đoạn chưa có
  tiêu chí thẻ mờ.
- Bên dưới: danh sách KCS sẽ tick, gom theo công đoạn, đếm tổng số tiêu chí.
- Lúc mở ngăn gọi `khai-bao` MỘT lần không kèm tìm/lọc (ô trái có thể đang lọc theo ô tìm nên dữ liệu
  đang tải không đủ), sau đó bật/tắt thẻ tính ở trình duyệt, không gọi thêm máy chủ. Thứ tự: giai đoạn rồi
  thứ tự công đoạn ở ô trái — lệnh thật theo thứ tự routing, ghi một dòng nhỏ nói vậy.
- Không chọn từ lệnh sản xuất có thật: người chỉ có quyền danh mục KCS sẽ bị chặn quyền lệnh.

## 7. Kiểm thử

Backend (pytest nhắm file):

- `checklist_gop`: chuỗi 3 công đoạn có tiêu chí + 1 không có ⇒ đúng thứ tự, đúng `cong_viec_id`;
  công đoạn hai phân đoạn chỉ góp một lần, gắn phân đoạn cuối.
- Kiểm bước cuối thiếu kết quả của một tiêu chí công đoạn giữa ⇒ 400; đủ ⇒ lưu, `checklist_json`
  mang cặp khoá. Kết quả cũ không `cong_viec_id` vẫn đọc ra đúng ở báo cáo.
- Số nhập kho không đổi luật: tổ ghi 1.000 tốt, KCS cuối có thẻ In "Có lỗi" 30 + thẻ Bế "Có lỗi" 20
  ⇒ đạt 950, `so_con_gui_kho` = 950. Gửi kho 950 rồi `dieu_chinh_ket_qua` hạ đạt ⇒ vẫn 400 như cũ.
- `dieu_chinh_ket_qua` với checklist gộp: thiếu mục của công đoạn giữa ⇒ 400; đủ ⇒ lưu.
- Nhóm hai lệnh (thân chính Hộp + lệnh phụ Ruột, Ruột có tiêu chí ở In): bước cuối của Hộp bày cả
  tiêu chí In của Ruột, xếp trước. Lỗi quy về In của Ruột ⇒ lưu được, tổ In nhận thông báo, màn
  chuỗi của Ruột hiện "+N lỗi bắt ở …", số tốt của Ruột giữ nguyên. Quy lỗi về công đoạn của một lệnh
  NGOÀI nhóm ⇒ 400. Công đoạn giữa của Hộp quy lỗi về Ruột ⇒ vẫn 400 như cũ.
- Bước cuối là việc chung bài ghép (`nhom_id` NULL): danh sách gộp lấy theo nhóm của `lsx_id` gửi lên.
- `PUT /sap-xep` lệch tập id ⇒ 400; đúng ⇒ `thu_tu` 1..n. `POST /chep` nhiều đích: bỏ qua trùng từng đích, đếm đúng, lỗi
  một đích thì không đích nào được ghi.
- Migration: dòng `active=false` bị xoá, hai cột hết; guard `DB_SCHEMA.md` xanh.

Frontend: `npx tsc`; test hộp chép (lọc tương đối, giữ "Đã chọn" khi lọc khuất, "Chọn cả N", đếm trùng); test `KcsKiemForm` (thẻ công đoạn: Đạt/Có lỗi/Thôi đạt, "Đạt hết còn lại" không đè thẻ có lỗi, mô tả tự điền thôi khi đã sửa tay, thứ tự lý do khoá nút Lưu, payload `dat` từng tiêu chí; gỡ dòng khi tick
lại).

**Xác minh bằng thao tác thật trên trình duyệt** (luồng nhiều bước, bắt buộc theo CLAUDE.md):
khai tiêu chí cho In offset, Bế, Dán ở ô phải (thêm bằng Enter, sửa, kéo đổi thứ tự, chép, xoá) → mở "Xem KCS
cuối thấy gì" chọn ba công đoạn → phát hành một lệnh chạy qua ba công đoạn đó → tổ ghi sản lượng →
KCS mở bước cuối thấy đủ ba thẻ công đoạn, nút Lưu khoá "Còn 3 công đoạn chưa xét" → bấm "Có lỗi" ở
thẻ Bế, tick một mục hỏng, thấy mô tả tự điền → gõ số lỗi, chụp ảnh → "Đạt hết 2 công đoạn còn lại"
→ Lưu → tổ Bế nhận thông báo, drawer bàn tổ hiện kết quả gom theo công đoạn (Bế có lỗi lên đầu).

## 8. Thứ tự làm

1. Migration + model + `DB_SCHEMA.md` + schema/nhãn nhật ký.
2. API danh mục: khai-bao gọn, `sap-xep`, `chep`, server tự gán `thu_tu`. Test.
3. `checklist_gop` theo nhóm (cả lệnh phụ) + các chỗ đọc/ghi ở mục 3 (kể cả `dieu_chinh_ket_qua`),
   nới `_cong_doan_nguon_hop_le` cho bước cuối, `nguon_loi`, `quy_ve` đọc thêm lỗi từ lệnh thân chính. Test.
4. Màn danh mục phương án A + ngăn xem trước. Gỡ thẻ xếp gạch, `kcs-khai-bao.css` cũ, bộ lọc kỳ.
5. `KcsKiemForm`: khối thẻ công đoạn (mục 3a) + chặn máy chủ "không đạt mà chưa ghi lỗi"; `KcsLanKiemList` / `ThsxKetQuaKcs` đọc cặp khoá.
6. Xác minh trên trình duyệt (mục 7).
