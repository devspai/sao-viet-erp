# Bàn tổ 3/4 — Ngăn công việc phương án B + 10 hộp thoại

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ngăn chi tiết công việc ở bàn tổ thành phương án B: rộng 1180px, tab làm việc ở cột lớn bên trái (Quy cách, Sản lượng, Giao và nhận, Vật tư, KCS, Lịch sử), cột phải ghim thông tin việc (vướng mắc, Hàng đang tới đâu, Tiến độ, Việc, Dặn dò, Tệp của lệnh); điện thoại một cột, cột phải thành tab Tổng quan, nút chạy máy ở đáy. Mọi hộp thoại vẽ lại theo một khuôn chung.

**Architecture:** Giữ nguyên dữ liệu và `ThsxExec` (mọi callback chạy máy, ghi mẻ, giao, vật tư, hỗ trợ). Tách `ThsxExecPanels` thành các phần export riêng để mỗi tab gắn đúng phần của nó. Thêm khuôn hộp `ThsxHop` dùng chung (máy tính: hộp giữa màn; điện thoại: hộp ngắn trồi từ đáy, hộp dài gần toàn màn, nút ở đáy). Máy chủ bổ sung `routing` (dải công đoạn đầy đủ của lệnh) vào chi tiết công việc cho khối "Hàng đang tới đâu".

**Tech Stack:** React + TS, CSS thuần (`thuc-hien-sx.css`), Vitest + Testing Library; FastAPI cho phần `routing`.

**Spec:** `docs/mockups/ban-to-ngan-B-day-du.html` (ngăn máy tính `#D`, điện thoại `#P`, công tắc trạng thái `#sw` và vị trí bước `#sw2` cho biết nội dung từng trạng thái); `docs/mockups/ban-to-hop-thoai-B.html` mục `#ghi-me` … `#giao-nguoi`, `#dien-thoai`, và bảng `#doi-chieu` (chỗ nào khác bản đang chạy). Ô/nút không ghi ở bảng đối chiếu là GIỮ NGUYÊN.

## Global Constraints

- KHÔNG bỏ thông tin hay chức năng nào của ngăn hiện tại. Danh sách phải còn đủ sau khi làm (đối chiếu từng mục trong Task 9): mini KPI (Dự kiến, Nhận, Đã giao N thợ), Ghi chú kỹ thuật, Tiến độ thực tế, Quy cách, Thông tin kế hoạch (Dự kiến, Chạy máy, Máy, Khối lượng, Nguồn LSX, Khách hàng), Khuôn + Đã nhận khuôn + Trả khuôn về kệ + câu thiếu quyền hai biến thể, Tổ thực hiện + Giao người + Rút, Tệp lệnh, Lịch sử phiên chạy + Khoảng tham gia, tab Nhận, Sản lượng/Bàn giao/Vật tư/Hỗ trợ chéo, KCS, bốn câu cảnh báo chân ngăn, Bắt đầu/Tiếp tục/Tạm dừng/Kết thúc, Đổi máy, Báo sự cố.
- UI tiếng Việt; không chữ đậm; không "·"/dấu phẩy nối dữ liệu; không hồng; không viền một cạnh; chip trạng thái bộ `--tt-*`; màu chỉ cho chip phân loại.
- Ngăn dùng độ rộng chung `--kt-ngan-w` (1180px), có kéo mép trái như các ngăn khác (xem memory "ngăn chi tiết: chia tab + kéo rộng" — tìm hook kéo rộng đang dùng: `grep -rn "kt-ngan-w" frontend/src --include=*.tsx`).
- Màn có thanh bên ⇒ hẹp dùng `@container`, không `@media`, cho bố cục trong ngăn (`.thsx-panel { container-type: inline-size }`).
- Sáu khuôn lỗi điện thoại (memory `bay-giao-dien-dien-thoai-svn`): không `space-between` ép giãn, bảng không ép 100% khi cuộn ngang, không hover-only, không ellipsis cắt số, không lưới đều cứng, không cỡ chữ cứng.
- Ô ngày/giờ dùng `ChonNgay`/`ChonGio`/`ChonNgayGio`; ô tiền/số chịu bộ gõ Việt (`OGoDinhDang` nếu định dạng theo phím).
- KHÔNG chạy `./init.ps1`; `npx tsc --noEmit -p .`, `npx vitest run <file>`; pytest nhắm file cho phần backend.
- `ThsxDrawer.tsx`, `ThsxDrawer.test.tsx`, `thuc-hien-sx.css` đang có thay đổi chưa commit của phiên khác (KCS): Edit chèn đúng chỗ, không stash/checkout, không commit trừ khi được bảo.

---

### Task 1: `routing` trong chi tiết công việc (backend + type)

**Files:**
- Modify: `backend/app/services/san_xuat/board.py` (`chi_tiet_cong_viec` L1116: thêm khoá `routing`)
- Modify: `backend/app/schemas/san_xuat.py` (`WorkItemChiTietOut`: `routing: list[RoutingBuocOut] = []` — dùng lại đúng schema ô routing đang dùng cho `SxLenhNhom.routing`)
- Modify: `frontend/src/api/client.ts` (`SxWorkItemChiTiet` L2282: `routing?: SxRoutingBuoc[]`)
- Test: `backend/tests/test_san_xuat_board.py` (thêm một test)

**Interfaces:**
- Produces: `chiTiet.routing: SxRoutingBuoc[]` — `routing_dai.dung_routing(db, repo, khoa=[(loai, id) của cv], cv_cua_toi=<mọi cv của tổ trong lệnh đó mà user đọc được>)`; bài ghép ⇒ `[]`.

- [ ] Step 1: test `test_chi_tiet_co_dai_routing_du_buoc` (lệnh 3 bước, tổ làm bước 2 ⇒ `len(routing)==3`, ô 2 `la_cua_toi` và `cong_viec_id == cv.id`). Step 2: FAIL. Step 3: cài. Step 4: `python -m pytest tests/test_san_xuat_board.py -q -k routing` PASS + `tests/test_san_xuat_board_api.py` xanh.

---

### Task 2: Khuôn hộp thoại chung `ThsxHop`

**Files:**
- Create: `frontend/src/pages/thsx/ThsxHop.tsx`
- Create: `frontend/src/pages/thsx/thsx-hop.css`
- Test: `frontend/src/pages/thsx/ThsxHop.test.tsx`

**Interfaces:**
- Produces:
```tsx
export function ThsxHop(p: {
  tieuDe: string;               // "Ghi mẻ"
  phuDe?: string;               // "Cắt tờ của LSX26-0004"
  co?: "thuong" | "hep";        // hep cho Sửa mẻ, Huỷ hỗ trợ, Tạm dừng
  dienThoai?: "day" | "toan";   // điện thoại: trồi từ đáy (mặc định hep) hoặc gần toàn màn (mặc định thuong)
  phimTat?: string | null;      // "Ctrl + Enter để ghi" hiện góc trái chân
  onPhimTat?: () => void;       // Ctrl/Cmd+Enter gọi hàm này (khi nút chính không khoá)
  nutPhu?: string;              // mặc định "Huỷ"
  nutChinh: string;
  nutChinhKhoa?: boolean;
  dangGui?: boolean;
  loi?: string | null;          // hiện ô đỏ trên chân
  onDong: () => void;
  onChinh: () => void;
  children: React.ReactNode;
}): JSX.Element
```
Render qua `createPortal` vào `document.body`, `role="dialog"` `aria-modal`, `aria-labelledby` tiêu đề; Esc đóng (trừ khi `dangGui`); bấm nền đóng; khoá cuộn nền. Thay `ThsxModal` (ExecPanels L2640) — giữ `ThsxModal` làm vỏ gọi lại `ThsxHop` cho tới khi mọi chỗ gọi đã chuyển, rồi xoá ở Task 8. CSS bám khối `.dlg/.dh/.db/.df/.bs/.grip` của `ban-to-hop-thoai-B.html` (nút chính màu cam `--rust` hiện dùng cho nút chính của hệ, nếu token khác thì dùng token nút chính đang dùng ở `ThsxModal`). Khối báo `.bao.xam/.xanh/.vang`, nhóm ô `.f > .n`, `.g` (gợi ý), `.chips` dùng chung cho các hộp.

- [ ] Step 1: test — có tiêu đề + phụ đề; Esc gọi `onDong`; Ctrl+Enter gọi `onPhimTat` khi nút không khoá, không gọi khi khoá; nút chính khoá thì `disabled`. Step 2: FAIL. Step 3: cài. Step 4: PASS + `tsc`.

---

### Task 3: Khung ngăn B — đầu ngăn, tab trái, cột phải, điện thoại

**Files:**
- Modify: `frontend/src/pages/ThsxDrawer.tsx` (toàn bộ phần render L227-725; giữ nguyên props L38-79 và luật bật nút L155-186)
- Create: `frontend/src/pages/thsx/ThsxCotPhai.tsx` (cột phải / tab Tổng quan)
- Modify: `frontend/src/pages/ThucHienSxPage.tsx` (map `tabDau` cũ → tab mới; L905-946 vỏ `aside.thsx-panel`)
- Modify: `frontend/src/pages/thuc-hien-sx.css` (khối mới `.thsx-b-*`; bỏ khối cũ không còn dùng ở cuối Task 8)
- Modify: `frontend/src/pages/ThsxDrawer.test.tsx`

**Interfaces:**
- Consumes: Task 1 `chiTiet.routing`; Task 2 (kế hoạch 2/4) `viTriHang`, `cauViTri` từ `frontend/src/pages/thsxTuyen.ts` — nếu kế hoạch 2/4 chưa làm thì tạo file này ở đây đúng chữ ký đã ghi ở kế hoạch 2/4 Task 4.
- Produces:
```ts
export type ThsxDrawerTab = "tq" | "qc" | "sl" | "gn" | "vt" | "kcs" | "ls";
// map tab cũ: van_hanh→qc, nhan→gn, ban_giao→gn, kcs→kcs (giữ hàm `tabTuCu(t: string): ThsxDrawerTab` export để ThucHienSxPage và link cũ trong thông báo dùng)
```
Bố cục máy tính (bám `#D`):
- Đầu ngăn: dòng mờ "LSX26-0004 Bìa sách A5 › Công ty …" (bài ghép: mã bài ghép); tiêu đề `ten_cong_doan` + thẻ "việc máy"/"việc tổ"/"thuê ngoài" (`ChipLoaiBuoc`) + chip trạng thái có giờ ("Đang chạy từ 11:41", "Tạm dừng từ 12:10", "Hoàn thành 12:40" — giờ lấy từ phiên chạy cuối); phải: nút theo trạng thái (đang chạy: Tạm dừng + Kết thúc; chờ làm: Bắt đầu; tạm dừng: Kết thúc + Tiếp tục; hoàn thành: không nút), nút ⋯ (Đổi máy, Báo sự cố — chỉ việc máy/thuê ngoài như `isMay` cũ), ✕. Nút Bắt đầu khoá đúng `canBatDau` cũ.
- Thân: lưới `minmax(0,1fr) 340px`; trái = hàng tab + thân tab cuộn riêng (đổi tab cuộn về đầu — giữ `bodyRef`); phải = cột ghim cuộn riêng.
- Tab có số/chấm: "Sản lượng" kèm "N mẻ" (chữ mờ, không badge), "Giao và nhận" chấm khi `cho.nhan || cho.hoTro`, "KCS" chấm khi `cho.kcs` hoặc `kcsLoiChoXem` có phần tử. Không tab nào có badge số.
Cột phải (`ThsxCotPhai`, bám hàm `side()`):
1. Ô vàng "Chưa bắt đầu được vì" — liệt kê ĐÚNG các câu cảnh báo chân ngăn cũ (L637-670: chưa giao thợ kèm nút Giao người, khuôn chưa nhận ba biến thể, chờ chốt giấy câu máy chủ, chưa nhận hàng bước trước chỉ tab "Giao và nhận") khi việc released/paused; tạm dừng thì thêm "Tạm dừng lúc 12:10" + lý do phiên. Ẩn khi đang chạy (như cũ).
2. "Hàng đang tới đâu": câu dài `cauViTri(..., false)` có chấm màu + "bước m trên N"; danh sách dọc từng bước (chấm, tên bước, tổ; bước của tổ đậm viền, chữ "tổ mình"; thuê ngoài viền cam). Không có routing ⇒ ẩn khối.
3. "Tiến độ": số to tốt + "trên X {đơn vị} tốt" + %, thanh, `dl` Nhận vào / Lỗi / Đã giao đi / Chờ giao (màu cảnh báo khi >0) / Còn phải làm — số lấy từ `tienDoThucTe`, `san_luong.tong_tot`, `san_luong.da_giao`, `cv.loi`, `nhan_ra - da_lam` như hiện tại.
4. "Việc": `dl` Máy (tên + "Dự kiến … đến …" + "Chạy máy N phút, có thể a đến b"), Thợ (avatar + tên + ✕ rút, "+ Giao người" mở popover Task 7; chưa ai ⇒ "chưa giao ai"; dòng "Đã giao: N thợ"), Khuôn (khi có: tên, "Lấy ở kệ …", nút "Đã nhận khuôn" hoặc chip "Đã nhận 11:38" + "Trả khuôn về kệ"; thiếu quyền ⇒ câu thiếu quyền cũ), Nguồn (LSX + khách), Khối lượng.
5. "Dặn dò": ghi chú kỹ thuật của việc (cũ 1A), rỗng ⇒ "Không có dặn dò riêng".
6. "Tệp của lệnh N": `ThsxTepLenh` (Xem, Tải).
Điện thoại (≤ 640px theo `@container` của panel): một cột; tab đầu "Tổng quan" = nội dung cột phải; đầu ngăn rút gọn (‹ quay lại, dòng lệnh mờ, tiêu đề + chip, ⋯); nút chạy máy thành chân cố định ở đáy, nút to.

- [ ] Step 1: Sửa `ThsxDrawer.test.tsx` theo tab mới TRƯỚC: đổi tên tab trong các truy vấn ("Vận hành & Quy cách" → "Quy cách", "Nhận"/"Bàn giao & Vật tư" → "Giao và nhận", thêm "Vật tư", "Sản lượng", "Lịch sử"); các câu cảnh báo giờ tìm trong cột phải (`within(screen.getByRole("complementary"))` — cột phải là `<aside>`); giữ nguyên MỌI ý kiểm cũ (26 test). Thêm: "có đủ 6 tab", "cột phải có Hàng đang tới đâu khi có routing", "hoàn thành thì không còn nút chạy máy".
- [ ] Step 2: chạy `npx vitest run src/pages/ThsxDrawer.test.tsx` → FAIL.
- [ ] Step 3: cài khung + cột phải; tạm gắn nội dung tab bằng các khối cũ (Task 4 tách sau).
- [ ] Step 4: PASS + `tsc`.

---

### Task 4: Nội dung các tab Quy cách, Sản lượng, Giao và nhận, Vật tư, KCS

**Files:**
- Modify: `frontend/src/pages/ThsxExecPanels.tsx` (export `SanLuongSection`, `BanGiaoSection`, `VatTuSection`, `HoTroSection`, `ThsxNhanVe`; `ThsxExecPanels` giữ làm vỏ gọi bốn phần cho tới Task 8)
- Modify: `frontend/src/pages/ThsxDrawer.tsx`
- Modify: `frontend/src/pages/thuc-hien-sx.css`
- Test: `frontend/src/pages/ThsxDrawer.test.tsx`

Bám hàm `P.qc/sl/gn/vt/kcs` của `ban-to-ngan-B-day-du.html`:
- **Quy cách**: `ThsxQuyCachThe` (lưới ô nhãn trên giá trị dưới, mực in ô màu) + khối "Kế hoạch" (`dl` Khối lượng "175 tờ nguyên → 350 tờ in", Dự kiến, Chạy máy) + "Ghi chú kỹ thuật" (rỗng ⇒ "Không có").
- **Sản lượng**: "Các mẻ đã ghi" N mẻ + nút "+ Ghi mẻ" (khoá khi hoàn thành hoặc thiếu quyền `run_order`); bài ghép có câu xanh "mỗi mẻ tự chia sang … theo số con trên tờ"; bảng mẻ mở dòng xem chi tiết (`BatchRow` hiện có: khoán, phát sinh, số, máy, ca, người, dừng máy, lô vào, ghi chú, "Sửa mẻ", băng "danh mục đổi" + "Cập nhật theo danh mục"/"Giữ số cũ"); "Phiên chạy" (bảng Phiên/Từ/Đến/Máy/Cách đóng — dữ liệu 1G cũ) + "▸ Khoảng tham gia (N)".
- **Giao và nhận**: hai thẻ cao bằng nhau "Nhận vào" (`ThsxNhanVe`; bước đầu ghi "từ kho", phiếu xuất + Đã nhận; bước giữa danh sách lần giao đến + Xác nhận; câu "Giao trong cùng tổ thì tự nhận"; thiếu quyền ⇒ "Nhờ tổ trưởng xác nhận") và "Giao đi" (sang bước sau, nút "Đề xuất giao", rỗng ⇒ "Còn X tốt chưa giao"); "Các lần giao" (thẻ từng lần: số, đơn vị, số mẻ, chip trạng thái, Sửa mẻ / Điều chỉnh số, tuyến giao → nhận có người và giờ, "Đã điều chỉnh N lần" mở lịch sử điều chỉnh, lệch đếm); bước cuối thay Giao đi bằng câu "Bước cuối, hàng tốt đề nghị nhập kho ở tab KCS"; "Hỗ trợ chéo" (bảng Thợ/Từ tổ/Sang tổ/Ngày làm/Tổ gốc/Tổ làm + Huỷ/Xác nhận + "+ Đề xuất hỗ trợ").
- **Vật tư**: `VatTuSection` (sau kế hoạch 1/4 đã bỏ Lý do): băng "Đề nghị này lập trước khi kế hoạch vật tư đổi… Sửa đề nghị", ba ô số (Tổng mặt hàng, Tiến độ yêu cầu, Trạng thái kho), bảng Vật tư/Kế hoạch/Đã yêu cầu/Thực dùng/Chênh lệch, "Các lần đề nghị", "Phiếu xuất kho".
- **KCS**: `ThsxKetQuaKcs` giữ nguyên props.
Rỗng thì một câu ngắn + nút làm việc đó, không kẻ bảng rỗng.

- [ ] Step 1: test — mỗi tab hiện đúng tiêu đề khối ("Các mẻ đã ghi", "Phiên chạy", "Nhận vào", "Giao đi", "Các lần giao", "Hỗ trợ chéo", "Vật tư theo kế hoạch"); bài ghép có câu chia mẻ; bước cuối có câu "Bước cuối". Step 2: FAIL. Step 3: cài. Step 4: PASS + `tsc`.

---

### Task 5: Hộp Ghi mẻ

**Files:** Modify `frontend/src/pages/ThsxExecPanels.tsx` (`BatchForm` L380); Test `frontend/src/pages/ThsxGhiMe.test.tsx` (mới).

Bám `#ghi-me`: `ThsxHop tieuDe="Ghi mẻ" phuDe="{công đoạn} của {lệnh}" dienThoai="toan" phimTat="Ctrl + Enter để ghi"`. Khối khoán (tên việc khoán + đơn giá "15 đ một tờ in"; "Việc phát sinh, không cộng vào sản lượng" — danh sách tick, tick thì hiện ô số lần) — không biểu tượng; khối "Còn ghi được" từ `tranGhi` (thanh + "đã ghi a trên b"; hết số và gõ vượt giữ đúng câu báo hiện có; bước đầu không giới hạn thì không có khối); Bắt đầu / Kết thúc (`ChonNgayGio`) cùng hàng + chip "Nối mẻ trước", "Bây giờ", "Lùi 15 phút", "Lùi 30 phút" + "mẻ dài N phút" cuối hàng; "Số lượng làm được" ô số lớn có đơn vị trong ô + chip "+10" "+50" "+100" "+1.000" "Tối đa {con_ghi_duoc}" "Về 0" (một nút Tối đa duy nhất — bỏ trùng "Max"); Ghi chú "Không bắt buộc". Body gửi giữ nguyên `SxBatchIn`.
- [ ] Step 1: test — bấm "+50" hai lần ⇒ ô 100; "Tối đa" ⇒ `con_ghi_duoc`; "Về 0" ⇒ 0; Ctrl+Enter gửi `exec.taoBatch` với đúng `tong`; không còn chữ "Max". Step 2: FAIL. Step 3: cài. Step 4: PASS.

---

### Task 6: Hộp Đề xuất giao, Sửa mẻ, Điều chỉnh số giao

**Files:** Modify `ThsxExecPanels.tsx` (`BanGiaoForm` L998, `SuaMeForm` L1205, `DieuChinhForm` L1237, `MeChon` L961, `BanGiaoRow` L1075); Test `frontend/src/pages/ThsxGiaoHop.test.tsx`.

- **Đề xuất giao** (`#de-xuat-giao`): "Giao cho" (một bước sau ⇒ chữ chỉ đọc tên bước + tổ; lệnh rẽ nhánh ⇒ lựa chọn), danh sách mẻ chưa giao chọn sẵn, dòng cuối "Chọn a trên b mẻ" + tổng (không nối "·"); hết hàng ⇒ câu + nút khoá; câu xám "Bên nhận bấm xác nhận thì lần giao mới tính…". Body `{dich_cong_viec_id, don_vi, batch_ids}` giữ nguyên.
- **Sửa mẻ** (`#sua-me`): thành hộp riêng `co="hep"` (trước là khối trong thẻ), phụ đề "Lần giao 120 tờ in sang …", cùng danh sách mẻ, nút "Lưu" chỉ sáng khi đã đổi. Body `{batch_ids, expected_version}`.
- **Điều chỉnh số giao** (`#dieu-chinh`): hai ô số "Số đang ghi" / "Số sau điều chỉnh" + chênh "bớt 2"/"thêm 2"; ô số; nút −100 −10 −1 +1 +10 +100 + "Về số cũ {n}"; "Lý do điều chỉnh" ô chữ + chip chọn nhanh Đếm lại / Gõ nhầm / Giao thiếu / Bổ sung (bấm chip điền ô), "Không bắt buộc"; câu xanh "Số mới sẽ gửi {tổ nhận} xác nhận lại."; Ctrl+Enter để lưu. Body `{so_luong_sau, mo_ta, expected_version}`.
- [ ] Step 1: test — bấm −1 hai lần từ 120 ⇒ 118 và "bớt 2"; "Về số cũ 120"; chip "Gõ nhầm" điền ô; Sửa mẻ chưa đổi thì nút Lưu khoá. Step 2: FAIL. Step 3: cài. Step 4: PASS.

---

### Task 7: Hộp Hỗ trợ chéo, Huỷ hỗ trợ, Tạm dừng, Đổi máy, Báo sự cố + ô Giao người

**Files:** Modify `ThsxExecPanels.tsx` (`HoTroForm` L2462, `HoTroRow` L2564), `frontend/src/pages/ThsxDoiMay.tsx`, `frontend/src/pages/ThsxBaoSuCoDialog.tsx` (tìm đúng file: `grep -rln "ThsxDoiMay\|ThsxBaoSuCoDialog" frontend/src/pages`), `ThsxDrawer.tsx` (tạm dừng, popover giao người), `ThucHienSxPage.tsx` (nếu hộp tạm dừng đang dựng ở đó: `grep -n "tamDung" frontend/src/pages/ThucHienSxPage.tsx`); Test `frontend/src/pages/ThsxHopKhac.test.tsx`.

- **Đề xuất hỗ trợ chéo** (`#ho-tro`): phụ đề "Thợ tổ khác sang làm …"; hàng một: "Lọc theo tổ" (kèm "N người") + "Ngày làm" (`ChonNgay`); "Thợ sang hỗ trợ" ô chọn tìm theo tên, mã, tổ, gom theo tổ, mỗi người kèm tình trạng ở ngày làm (Rảnh xanh / đang chạy việc khác vàng / có tên ở việc chưa xong xám / bị chặn đỏ mờ không chọn được) — dùng `tinhTrangChon` và dữ liệu `hoTroUngVien`/`ungVienHomNay` sẵn có; chọn người đang bận ⇒ ô vàng "… Hỏi tổ gốc trước khi đề xuất."; "Việc nhờ làm" (đổi tên từ Mô tả). Rỗng ⇒ "Không có thợ tổ khác đang làm để đề xuất". Body giữ `{employee_id, ngay_lam_viec, mo_ta}`.
- **Huỷ hỗ trợ** (`#huy-ho-tro`): `co="hep"`, phụ đề "Lê Minh Tú từ Cắt 1 sang Cắt 2 ngày 09/10", "Lý do huỷ" không bắt buộc, nút phụ "Đóng", nút chính "Huỷ hỗ trợ". Body `ly_do`.
- **Tạm dừng** (`#tam-dung`): hộp riêng `co="hep"` "Tạm dừng việc", "Vì sao dừng *" (bắt buộc, nút chỉ sáng khi đã ghi), câu xám "Phiên chạy đóng lại, giờ máy ngừng tính từ lúc bấm. Bấm Tiếp tục để chạy phiên mới."; điện thoại trồi từ đáy. `api.sanXuat.tamDung({ly_do, expected_version})` giữ nguyên. Kết thúc/Bắt đầu/Tiếp tục không hỏi gì (như cũ).
- **Đổi máy** (`#doi-may`): thành hộp (trước là khối dưới hàng nút), "Máy đang dùng" khoá; "Đổi sang máy" ô chọn tìm theo mã/tên/tình trạng, gom nhóm Rảnh / Có phiếu sửa / Đang chạy / Máy dừng (dữ liệu `api.sanXuat.mayDoi` hiện có, nạp lại mỗi lần mở); máy không rảnh vẫn chọn được + ô vàng; gợi ý "Chỉ hiện máy khai cho công đoạn …" hoặc "Công đoạn … chưa khai máy, đang hiện mọi máy còn dùng"; lỗi nạp ⇒ "Không nạp được danh sách máy"; "Lý do đổi" không bắt buộc; nút "Đổi máy". `doiMay(mayId, lyDo)` giữ nguyên.
- **Báo sự cố** (`#su-co`): giữ ngăn kéo cùng khuôn Sửa chữa máy và đủ ô (`SxSuCoIn {bo_phan_hong, mo_ta, muc_do, dung_san_xuat}`), chỉ bỏ khung thẻ lồng và biểu tượng cảm xúc ở nhãn ưu tiên; ô tick "Máy đang dừng, không chạy được" + nhãn đỏ "Ưu tiên cao và tạm dừng việc" khi tick; việc đang tạm dừng ⇒ câu "Việc đang tạm dừng nên không đóng thêm phiên nào"; Triệu chứng bắt buộc khi máy dừng; gửi xong báo "Đã gửi {mã} tới tổ sửa chữa".
- **Giao người** (`#giao-nguoi`): popover nhỏ ngay dưới "+ Giao người" ở cột phải, ô tìm tên/mã, mỗi người kèm tình trạng màu như trên, chọn là giao luôn (`onGiao`), người bị chặn mờ không chọn được ("không giao chồng được"), hết người ⇒ "Không còn ai để giao". Rút bằng ✕ cạnh tên (`onRut`).
- [ ] Step 1: test — Tạm dừng: nút khoá khi trống, gõ lý do thì sáng, bấm gọi `onTamDung` với lý do; Đổi máy: có dòng "Máy đang dùng", chọn máy đang chạy hiện ô vàng; Hỗ trợ: người bị chặn `aria-disabled`; Giao người: chọn một người gọi `onGiao(id)`. Step 2: FAIL. Step 3: cài. Step 4: PASS + `tsc`.

---

### Task 8: Dọn khối cũ

- [ ] Xoá `ThsxModal` (khi không còn chỗ gọi), vỏ `ThsxExecPanels` nếu không còn dùng, các khối CSS cũ của ngăn không còn class nào trỏ tới (`grep` từng class trước khi xoá — đếm định nghĩa trùng theo memory "CSS redesign bị nhân đôi"). Chạy `npx tsc --noEmit -p .` và `npx vitest run src/pages/Thsx*` xanh.

---

### Task 9: Bấm thử thật + đối chiếu "không mất gì"

- [ ] Restart uvicorn (Task 1 đổi schema). Thực hiện SX → tổ có việc đang chạy → mở việc: thấy ngăn 1180px, tab trái, cột phải. Bấm lần lượt 6 tab.
- [ ] Ghi một mẻ bằng chip "+50" và Ctrl+Enter; thấy mẻ ở tab Sản lượng, Tiến độ ở cột phải nhảy số.
- [ ] Đề xuất giao → bên nhận (tài khoản tổ sau) thấy chấm ở tab Giao và nhận không cần F5 → Xác nhận; bên giao Điều chỉnh số bằng −1 và chip "Đếm lại".
- [ ] Tạm dừng (nút khoá khi trống, gõ lý do) → Tiếp tục → Kết thúc. Đổi máy qua ⋯. Báo sự cố qua ⋯ (tick máy dừng).
- [ ] Giao người từ cột phải, rút bằng ✕. Đề xuất hỗ trợ, Huỷ hỗ trợ.
- [ ] Viewport 375: tab Tổng quan, nút ở đáy, Ghi mẻ toàn màn, Tạm dừng trồi từ đáy.
- [ ] Đi hết danh sách "không bỏ thông tin" ở Global Constraints, đánh dấu từng mục thấy ở đâu trong ngăn mới; báo cáo liệt kê từng bước đã bấm/gõ/thấy.
