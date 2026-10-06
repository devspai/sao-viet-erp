# Kỳ + Bộ lọc + cột Ngày tạo cho MỌI danh sách chứng từ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi màn danh sách chứng từ (phiếu, đơn, lệnh, yêu cầu, phiếu kho, giao hàng, sửa chữa…) có cùng một thanh lọc: kỳ (mốc mặc định = Ngày tạo) + các điều kiện nâng cao + chip đã áp, lọc/đếm/phân trang ở máy chủ, ghi lên URL, và bảng luôn có cột Ngày tạo.

**Architecture:** Thành phần dùng chung `ThanhLoc` (`frontend/src/pages/thanh-loc/`, phương án 2 "nút Lọc + menu" khuôn Linear — user chọn 06/10/2026) nhận một mảng `DieuKien<L>`; mỗi màn chỉ khai điều kiện của mình (`useDieuKien<Man>()`) + nối tham số vào API. Kỳ gửi lên máy chủ theo MỘT quy ước cho mọi màn: `tu_ngay`, `den_ngay`, `moc` (mã mốc ngày của màn, vd `tao`, `can`, `han_sx`); backend chọn cột theo `moc` rồi dùng `dk_khoang_ngay`, và trả số đếm theo tab đã áp lọc. Thứ tự: dựng `ThanhLoc` → chuyển 3 màn Kinh doanh (XONG) → Kế toán → từng module.

**Tech Stack:** FastAPI + SQLAlchemy (routers → services → repositories), React + TS (Vite), vitest, pytest (SQLite in-memory).

**Spec:** `docs/mockups/bo-loc-nang-cao-3-phuong-an.html` phần "2. Nút Lọc + menu chọn điều kiện" + memory `moi-danh-sach-ban-ghi-co-ky-va-bo-loc` (phạm vi) + bản kiểm kê màn danh sách 06/10/2026 (Task 4+).

## Global Constraints

- Lọc, đếm tab, phân trang ở MÁY CHỦ. Cấm tải 200 dòng rồi lọc/cắt trong trình duyệt.
- Ranh ngày theo giờ VN: cột DateTime dùng `dk_khoang_ngay(col, tu, den)`; cột Date dùng `cot_ngay=True` (`backend/app/repositories/loc_danh_sach.py`).
- Kỳ mặc định khi mở màn lần đầu: "Tất cả" (không giấu dữ liệu cũ); mốc mặc định `tao`.
- Mọi bảng chứng từ có cột "Ngày tạo" (hiện `dd/MM/yyyy`, title đủ giờ). Đã có thì không thêm lần hai.
- UI tiếng Việt 100%; không nối mẩu dữ liệu bằng "·" hay dấu phẩy; không viền một cạnh; không hồng nhạt; mỗi thông tin nói một lần.
- Không đổi schema DB (mọi model trong phạm vi đã có `created_at`). Nếu buộc thêm cột: viết `backend/app/db_migrations.py` + `docs/DB_SCHEMA.md`.
- Kiểm: `pytest` nhắm file + `npx tsc -p frontend --noEmit` + `npx vitest run <file>`. KHÔNG chạy `./init.ps1`, không chạy `python` trần trong `backend/`.
- Mỗi task có UI: bấm thật trên dev-browser (khổ 1280×800 cho sidebar cố định, và 375px), báo cáo từng bước đã bấm/gõ/thấy. Sửa BE → restart uvicorn qua WMI.
- Commit chỉ khi user bảo; message tiếng Việt, không Co-Authored-By. `frontend/src/api/client.ts` có việc dở của phiên khác: chỉ THÊM, không viết lại khối có sẵn.
- PHẠM VI MỞ RỘNG 06/10/2026 (user: "tất cả module bên sidebar tôi đều muốn có bộ lọc như thế"): MỌI mục thanh bên có danh sách — kể cả danh mục, nhân sự, báo cáo, bảng điều phối (Task 20–26). Ngoài phạm vi chỉ còn màn KHÔNG có dữ liệu dạng danh sách: Tổng quan (lời chào), Quy trình kinh doanh (sơ đồ tĩnh); và danh sách nhúng trong ngăn/modal.
- Bảng điều phối có trục thời gian riêng (Gantt Xếp lịch, Theo dõi SX) dùng `ThanhLoc` KHÔNG truyền `ky` (chỉ điều kiện); báo cáo dùng nút kỳ của `ThanhLoc` thay ô từ/đến rời, mốc = ngày nghiệp vụ của báo cáo.

---

## Cấu trúc tệp (ĐÃ DỰNG ở Task 1)

```
frontend/src/pages/thanh-loc/
  thanh-loc.ts (+ .test.ts)   kiểu DieuKien<L> (mot | nhieu | khoang), daAp, tomTat, boDK, soDaAp, khopChu
  ThanhLoc.tsx (+ .test.tsx)  [Kỳ ▾] [khối trường|giá trị|×]… [Lọc] [Xoá lọc] — đặt TRONG thanh công cụ của màn
  ky-danh-sach.ts (+ .test.ts) KyDS, khoangKy, thamSoKy (→ tu_ngay/den_ngay/moc), kyTuUrl, kyLenUrl, soTuUrl, soLenUrl
  useLocMan.ts                state lọc ghi lên URL `?man=` + nhớ theo màn
  lua-chon.ts                 useLuaChonLoc(nap) → GiaTriDK[] (giá trị + số bản ghi), idThanhChu, chuThanhId
  thanh-loc.css               lớp `tl-`; `.tl-thanh` cho thanh công cụ chứa nó
frontend/src/pages/loc-kinh-doanh/dieu-kien-{tinh-gia,bao-gia,don-hang}.ts   khuôn mẫu cho mọi màn sau
backend/app/repositories/loc_danh_sach.py      dk_khoang_ngay, hom_nay_vn
```

### Task 1: Thành phần dùng chung `ThanhLoc` — XONG 06/10/2026

**Interfaces — Produces (mọi task sau dùng đúng tên này):**

```ts
// thanh-loc.ts
export type GiaTriDK = { value: string; nhan: string; so?: number };
export type DieuKien<L> = { khoa: string; nhan: string; icon: LucideIcon } & (
  | { kieu: "mot"; giaTri: GiaTriDK[]; doc(l: L): string | undefined; ghi(l: L, v: string | undefined): L }
  | { kieu: "nhieu"; giaTri: GiaTriDK[]; doc(l: L): string[]; ghi(l: L, v: string[]): L }
  | { kieu: "khoang"; donVi: string; doc(l: L): [number | undefined, number | undefined]; ghi(l: L, tu?: number, den?: number): L }
);
// ThanhLoc.tsx
export function ThanhLoc<L>(p: { ky: KyDS; moc: [string, string][]; onKy(k: KyDS): void;
  dieuKien: DieuKien<L>[]; loc: L; onLoc(l: L): void }): JSX.Element;
// useLocMan.ts
export function useLocMan<T>(man: string, macDinh: T, docUrl: (p: URLSearchParams) => T, lenUrl: (t: T) => GiaTriUrl): [T, (t: T) => void];
// lua-chon.ts
export function useLuaChonLoc(nap: (token: string) => Promise<LuaChonLoc[]>): GiaTriDK[];
```

Hành vi đã có: chọn giá trị là ÁP NGAY (không bản nháp, không "Khớp n"); "mot" chọn xong đóng menu, "nhieu" giữ menu mở; "khoang" có ô Từ/Đến có nhãn + Enter/Áp dụng, ngược thì báo lỗi; menu con >7 giá trị có ô gõ tìm không dấu; Esc trong menu con lùi về menu, Esc lần nữa đóng; lớp nổi canh theo mép phải của KHUNG CUỘN gần nhất (`.shell__content`), đặt con trỏ bằng `focus({preventScroll:true})`; ≤640px lớp nổi thành tấm sát đáy, menu con thay chỗ menu (nút quay lại). KHÔNG dùng `<form>` bên trong (màn Báo giá bọc thanh công cụ trong form tìm kiếm).

### Task 2: Chuyển Tính giá / Báo giá / Đơn hàng bán — XONG 06/10/2026 (chưa commit)

Đã thay `KyDanhSach` + `BoLoc*` + hàng chip bằng `<ThanhLoc>` trong thanh công cụ (lớp `tl-thanh`); `BoLoc*.tsx` → `dieu-kien-*.ts`; xoá `KyDanhSach.tsx`, `chung.tsx`. Khoá URL giữ nguyên. Đã bấm thật cả 3 màn ở 1280px + Báo giá ở 375px.

---

### Task 3: Chuyển các màn Kế toán sang `ThanhLoc`

**Files:**
- Modify: `frontend/src/pages/ke-toan/phieu-chi/*`, `ke-toan/phieu-thu/*`, `ke-toan/cong-no-phai-tra/*`, `ke-toan/cong-no-phai-thu/*`, `ke-toan/tai-khoan-ngan-hang/*` (chỗ dùng `ChonKy`, `BoLocPhieu`, `BoLocCongNo`)
- Modify: `frontend/src/pages/ke-toan/don-mua-hang/AccountingPurchaseInboxPage.tsx` (+ `InboxToolbar.tsx`): bỏ ô ngày rời, dùng `ThanhLoc` với mốc `tao` (Ngày tạo) / `can` (Ngày cần); NCC + Tiền cọc thành điều kiện.
- Backend `backend/app/routers/accounting.py:189` + repo: thêm `dem_theo_tab` vào response inbox (đếm sau lọc, trước lọc trạng thái).
- Delete khi hết người dùng: `ke-toan/shared/BoLocNangCao.tsx`, `BoLocPhieu.tsx`, `BoLocCongNo.tsx`, `ChonKy.tsx`.

- [ ] **Step 1: Test BE (fail)** — `backend/tests/test_loc_danh_sach_ke_toan.py`:

```python
def test_inbox_dem_theo_tab_sau_loc(client, db, auth_ke_toan):
    _tao_pmh(db, so="PMH-1", trang_thai="cho_duyet", created_at=datetime(2026, 10, 1, 3, tzinfo=timezone.utc))
    _tao_pmh(db, so="PMH-2", trang_thai="da_duyet", created_at=datetime(2026, 9, 1, 3, tzinfo=timezone.utc))
    r = client.get("/api/accounting/inbox", params={"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31", "moc": "tao"}, headers=auth_ke_toan)
    assert r.json()["dem_theo_tab"] == {"tat_ca": 1, "cho_duyet": 1, "da_duyet": 0}
```
(`_tao_pmh` dựng `PurchaseRequest` tối thiểu như fixture của `tests/test_accounting_inbox*.py` hiện có — đọc file đó, tái dùng helper nếu có.)

- [ ] **Step 2:** `cd backend && pytest tests/test_loc_danh_sach_ke_toan.py -q` → FAIL.
- [ ] **Step 3:** Repo inbox: tách `_dieu_kien_loc(...)` (mọi lọc trừ trạng thái) → `select(PurchaseRequest.status, func.count()).where(*dk).group_by(...)`; router nhận `tu_ngay/den_ngay/moc` (`moc` ∈ tao, can — thay `created_from/to`, `needed_from/to`, sửa FE cùng lúc).
- [ ] **Step 4:** pytest PASS; tsc sạch.
- [ ] **Step 5:** Bấm thật 6 màn Kế toán theo kịch bản Task 2 Step 3. Commit khi user bảo.

---

## Công thức chung cho Task 4 → 18 (mỗi task MỘT module)

Mỗi task dưới đây làm đủ 5 việc; phần riêng của từng module ghi trong task.

**A. Backend — tham số + điều kiện.** Router nhận đúng ba tham số kỳ (như 3 màn Kinh doanh):

```python
tu_ngay: date | None = Query(None), den_ngay: date | None = Query(None),
moc: str = Query("tao", pattern="^(tao|can|...)$"),   # các mốc của màn, task ghi rõ
```
Repo:
```python
from app.repositories.loc_danh_sach import dk_khoang_ngay
COT_MOC = {"tao": (Model.created_at, False), "can": (Model.needed_date, True)}   # (cột, là cột Date)
cot, la_ngay = COT_MOC[loc.moc]
dk += dk_khoang_ngay(cot, loc.tu_ngay, loc.den_ngay, cot_ngay=la_ngay)
```
Đếm tab: một truy vấn `group_by(trang_thai)` trên CÙNG `dk` (trừ điều kiện trạng thái) trả `dem_theo_tab` trong response. Trong từng task, "mốc `x`" = một giá trị của `moc`.

**B. Test BE** — thêm vào `backend/tests/test_loc_danh_sach_<module>.py`, chèn mốc UTC (SQLite):
```python
def test_loc_ngay_tao_ranh_gio_vn(client, db, auth_admin):
    # 30/09 17:30 UTC = 01/10 00:30 giờ VN ⇒ THUỘC tháng 10
    _tao(db, ma="A", created_at=datetime(2026, 9, 30, 17, 30))
    _tao(db, ma="B", created_at=datetime(2026, 9, 30, 16, 30))   # 30/09 23:30 VN ⇒ ngoài
    r = client.get(URL, params={"tu_ngay": "2026-10-01", "den_ngay": "2026-10-31", "moc": "tao"}, headers=auth_admin)
    assert [x["ma"] for x in r.json()["items"]] == ["A"]
```
+ một test mỗi điều kiện nâng cao mới + một test `dem_theo_tab`.

**C. Frontend — điều kiện + nối API.** Chép khuôn `pages/loc-kinh-doanh/dieu-kien-bao-gia.ts`: tạo `dieu-kien-<man>.ts` cạnh trang, export kiểu `Loc<Man>`, `LOC_<MAN>_TRONG`, `thamSoLoc<Man>`, `loc<Man>TuUrl`, `loc<Man>LenUrl`, `useDieuKien<Man>()`. Trang: `useLocMan("<man>", …)` với `kyTuUrl/kyLenUrl` + `MOC_<MAN>: [string,string][]`; đặt `<ThanhLoc …/>` trong thanh công cụ (thêm lớp `tl-thanh`); gửi `{...thamSoKy(ky), ...thamSoLoc<Man>(loc)}` vào API list + đếm tab; reset trang khi khoá lọc đổi. Giá trị cần danh sách từ máy chủ (khách, NCC, máy…) thì thêm endpoint `…/loc-<truong>` trả `[{id, ten, so}]` đếm trong tầm nhìn.

**D. Cột Ngày tạo** nếu chưa có: `<th>Ngày tạo</th>` / `<td title={dinhDangGio(r.created_at)}>{dinhDangNgay(r.created_at)}</td>` (hàm định dạng sẵn có của màn; thiếu thì dùng `lib/ngay.ts`). Schema Pydantic Out phải có `created_at` — nếu thiếu thêm đủ dict → schema → type TS (bẫy Pydantic nuốt field).

**E. Kiểm** — `pytest tests/test_loc_danh_sach_<module>.py -q`, `npx tsc -p frontend --noEmit`, restart uvicorn, bấm thật: chọn kỳ → đổi mốc (nếu có) → áp từng điều kiện → xem tab đếm đổi → bỏ một thẻ → tải lại giữ lọc → 375px. Báo cáo từng bước.

---

### Task 4: Kho — Phiếu nhập / Phiếu xuất / Điều chuyển (theo từng kho)

**Files:** `backend/app/routers/kho_voucher.py:362` (`list_vouchers`) + repo tương ứng; `frontend/src/pages/kho/KhoTonKhoPage.tsx` (3 tab phiếu); test `backend/tests/test_loc_danh_sach_kho.py`.

Hiện: tải `size=200` rồi lọc ngày/trạng thái/giá vốn/tìm + đếm tab trong trình duyệt ⇒ phiếu cũ hơn 200 dòng bị mất. Việc: chuyển toàn bộ sang máy chủ, bỏ `DateFilterHead` ở cột.
- Mốc kỳ: `tao` Ngày tạo (`StockVoucher.created_at`), `ngay` Ngày nhập/xuất (`StockVoucher.ngay`, Date ⇒ `cot_ngay=True`), `ghi_so` Ngày ghi sổ (`ghi_so_luc`).
- Điều kiện: Trạng thái (ChonMot), Giá vốn (KhoangSo, CHỈ khi người xem có `view_cost` của màn kho đó — gate ở máy chủ: không quyền thì bỏ qua tham số và không trả tổng), Người lập (ChonNhieu).
- Thêm cột Ngày tạo; giữ cột Ngày nhập/xuất.
- Test riêng: không quyền xem tiền mà gửi `gia_tu` ⇒ không lọc theo tiền (trả đủ dòng).

### Task 5: Kho — Yêu cầu nhập xuất + Phiếu từ yêu cầu

**Files:** `frontend/src/pages/kho/KhoDeNghiPage.tsx`, `frontend/src/pages/kho/KhoYeuCauPage.tsx` (+ `TransferTable`); BE `kho_request.py:318`, `:398` đang có `tao_tu/tao_den` — đổi sang `tu_ngay/den_ngay/moc` (tao, can, duyet) và đảm bảo `counts-by-status` nhận cùng bộ lọc.
- Mốc: `tao` Ngày yêu cầu, `can` Ngày cần (Date), `duyet` Ngày duyệt.
- Điều kiện: Phòng ban yêu cầu, Người yêu cầu, Kho.
- Bỏ `DateFilterHead` ở đầu cột. `KhoYeuCauPage` thêm cột Ngày tạo (hiện chỉ có "Cần lúc").

### Task 6: Giao hàng — Yêu cầu giao + Đơn giao hàng

**Files:** `backend/app/routers/delivery.py:392` (`danh_sach_yeu_cau`), `:759` (`bang_giao`) + repo; `frontend/src/pages/giao-hang/giao-hang/tabs/BangChoLenKeHoach.tsx`, `tabs/BangKeHoach.tsx`, `GiaoHangPage.tsx`.
- "Yêu cầu giao": `cho_len_ke_hoach=true` hiện lọc bằng Python SAU truy vấn ⇒ viết lại thành điều kiện SQL (NOT EXISTS lượt giao còn sống trỏ tới yêu cầu) để phân trang thật; bỏ cửa sổ 200 dòng. Mốc `tao` / `can` (Ngày cần giao). Điều kiện: Khách hàng, Đơn hàng. Thêm ô tìm (mã yêu cầu, mã đơn, khách) và cột Ngày tạo.
- "Đơn giao hàng" (theo lượt xe): mốc `tao` / `lay` (giờ lấy hàng) / `giao` (giờ dự kiến giao). Điều kiện: Xe, Tài xế, Trạng thái lượt. Thêm ô tìm.
- Test riêng: yêu cầu đã lên kế hoạch không xuất hiện ở `cho_len_ke_hoach=true` và `total` khớp số dòng.

### Task 7: Kế hoạch SX (tab Lệnh sản xuất) + Hồ sơ lệnh sản xuất

**Files:** `backend/app/routers/lsx.py:187`, `backend/app/routers/lenh_san_xuat.py:48` + repo; `frontend/src/pages/KeHoachSXPage.tsx`, `frontend/src/pages/LenhSanXuatPage.tsx`.
- Mốc: `tao` Ngày tạo lệnh (`Lsx.created_at`), `han_sx` Hạn SX (`han_hoan_thanh_sx`), `han_giao` Hạn giao khách — Hồ sơ lệnh đang lọc theo Hạn SX qua `tu_ngay/den_ngay`: đổi tên thành `han_sx_tu/han_sx_den`, mặc định mốc vẫn `tao`.
- Điều kiện: Khách, Đơn hàng, Gia công ngoài (đang là select rời trên KHSX — chuyển vào thẻ), Trạng thái bàn giao.
- Thêm cột Ngày tạo ở cả hai bảng. Tab "Hàng chờ" của KHSX: thêm `ThanhLoc` tối giản (kỳ theo `tao` = ngày đơn / `chuyen` = Chuyển lúc, điều kiện Khách).

### Task 8: KCS — danh sách lệnh

**Files:** `backend/app/routers/san_xuat.py:1037` + repo; `frontend/src/pages/kcs/KcsTheoLenhPage.tsx`.
- Mốc: `tao` Ngày tạo lệnh, `kcs` Lần KCS gần nhất (`max(SanXuatKcsBatch.ket_thuc)` — subquery tương quan).
- Điều kiện: "Chưa đóng / Tất cả" (đang là nút rời → CoKhong), Khách hàng.
- Thêm cột Ngày tạo + Lần KCS gần nhất (hiện không có cột ngày nào).

### Task 9: Bàn tổ sản xuất — chế độ "Bảng"

**Files:** `frontend/src/pages/ThucHienSxPage.tsx`, `ThsxDanhSach.tsx`, xoá `ThsxLocNangCao.tsx`; BE `san_xuat.py:346`: `nhan_tu/nhan_den` → `tu_ngay/den_ngay/moc` (nhan, tao, du_kien).
- Mốc: `nhan` Ngày tổ nhận lệnh (mặc định ở màn này, giữ hành vi cũ), `tao`, `du_kien` Dự kiến bắt đầu.
- Điều kiện: Trạng thái (ChonNhieu như cũ), "Chờ xác nhận" (CoKhong). Thứ tự sắp xếp giữ ở `phai`.
- Màn xưởng: thẻ cao 40px, chữ lớn (`.tl--xuong`), theo memory đa vai.
- Thêm cột Ngày tạo; thêm `dem_theo_tab` nếu bảng có tab.

### Task 10: Sửa chữa máy — Phiếu sửa chữa + Yêu cầu báo hỏng

**Files:** `backend/app/routers/ky_thuat_may.py:189`, `:315` + repo; `frontend/src/pages/SuaChuaMayPage.tsx` (`KhungPhieu`, `KhungYeuCau`).
- Hiện không có lọc ngày lẫn cột ngày. Mốc: `tao`, `thoi_diem` Thời điểm hỏng, `xong` Hoàn thành / Xử lý lúc.
- Điều kiện: Máy (BE đã nhận `may_id`), Mức độ (`muc_do`), "Của tôi" (đang là nút rời → CoKhong ở Yêu cầu).
- Thêm cột Ngày tạo + Thời điểm hỏng.

### Task 11: Phiếu bảo trì (chế độ Bảng)

**Files:** `ky_thuat_may.py:449` + repo; `frontend/src/pages/PhieuBaoTriPage.tsx`.
- Đang lọc theo THÁNG của Ngày kế hoạch (`type=month`, `tu/den`). Đổi thành kỳ đầy đủ; mốc `ke_hoach` (mặc định ở màn này vì lịch bảo trì đọc theo kế hoạch), `tao`, `hoan_thanh`. Đổi tham số `tu/den` → `ke_hoach_tu/ke_hoach_den`; chế độ Lịch giữ nguyên.
- Điều kiện: Máy, Loại bảo trì. Tab "Quá hạn" dẫn xuất giữ nguyên, đếm theo bộ lọc.
- Thêm cột Ngày tạo.

### Task 12: Yêu cầu mua hàng (phòng ban) + Mua hàng › Yêu cầu chờ xử lý

**Files:** `backend/app/routers/purchases.py:141` + repo; `frontend/src/pages/mua-hang/yeu-cau-mua-hang/DepartmentPurchaseRequestsPage.tsx` (`RequestsToolbar`, `RequestsTable`), `mua-hang/phieu-mua-hang/tabs/YeuCauInboxTab.tsx`.
- BE chưa có lọc ngày ⇒ thêm `tu_ngay/den_ngay/moc` (tao, can = `needed_date` kiểu Date). Thêm `dem_theo_tab`.
- Mốc: `tao`, `can`. Điều kiện: Phòng ban, Người yêu cầu, Mặt hàng. Trạng thái: select rời → tab có số.
- `RequestsTable` thêm cột Ngày tạo (đang sắp theo `-created_at` mà không hiện).

### Task 13: Mua hàng › Đơn mua hàng

**Files:** `backend/app/routers/purchases.py:484` + repo; `frontend/src/pages/mua-hang/phieu-mua-hang/tabs/PhieuListTab.tsx` (bỏ `ToolbarChuan` ở màn này).
- BE đã có `created_from/to`, `needed_from/to`, `expected_receipt_from/to` ⇒ đổi tên thành `tao_*`, `can_*`, `nhan_*` (sửa mọi chỗ gọi, kể cả inbox Kế toán ở Task 3); thêm `dem_theo_tab`.
- Mốc: `tao`, `can`, `nhan` Ngày dự kiến nhận. Điều kiện: Nhà cung cấp, Tiền cọc (CoKhong "Có cọc / Không cọc"), Tổng tiền (KhoangSo).
- Tab Nháp…Đã nhận hiện số.

### Task 14: Tài sản & CCDC › Sổ tài sản

**Files:** `backend/app/routers/tai_san.py:210` + repo; `frontend/src/pages/tai-san/DanhSachView.tsx`, `frontend/src/api/taiSan.ts`.
- Mốc: `tao`, `su_dung` Ngày đưa vào sử dụng (Date), `giam` Ngày ghi giảm (Date).
- Điều kiện: Loại, Bộ phận, Trạng thái (đang là 3 select rời → thẻ), Nguyên giá (KhoangSo, gate tiền như màn hiện tại).
- Thêm cột Ngày tạo + Ngày sử dụng (hiện không có cột ngày). Đọc memory `tai-san-lam-lai-muc-tieu-don-gian` trước khi đặt nhãn.

### Task 15: Chấm công — Nhật ký chấm công, Đi muộn/về sớm, Yêu cầu chỉnh công

**Files:** `backend/app/routers/attendance.py:539`, `:877`, `backend/app/routers/late_early.py:207`, `:285` + repo; `frontend/src/pages/nhan-su-luong/cham-cong/tabs/{LogsTab,LateEarlyTab,AdjustRequestsTab}.tsx`.
- Cả ba chưa phân trang ⇒ thêm `page/size` + `total` (khuôn `PhanTrangDayDu`). Nhật ký bỏ trần ~100 dòng.
- Nhật ký: mốc `cham` Giờ chấm (mặc định), `tao`; điều kiện Nhân viên, Điểm chấm công.
- Đi muộn/về sớm: mốc `tao`, `ngay_cong` (Date); điều kiện Trạng thái (→ tab có số), Kiểu (đang lọc trong trình duyệt → máy chủ), Nhân viên. Thêm cột Ngày tạo.
- Chỉnh công: mốc `tao`, `ngay_cong`; điều kiện Trạng thái (→ tab có số), Nhân viên. Thêm cột Ngày tạo.

### Task 16: Nghỉ phép + Tăng ca

**Files:** `backend/app/routers/leaves.py:247`, `:387`, `backend/app/routers/overtime.py:206`, `:301` + repo; `frontend/src/pages/nhan-su-luong/nghi-phep/tabs/{MyLeaveTab,ApproveTab}.tsx`, `components/LeaveTable.tsx`, `tang-ca/TangCaPage.tsx`, `components/RequestTable.tsx`; xoá `components/LocThangTao.tsx` khi hết người dùng.
- Đang chỉ chọn MỘT tháng theo ngày tạo (`thang`) ⇒ thay bằng kỳ đầy đủ `tu_ngay/den_ngay/moc`: mốc `tao` + mốc `nghi` (Nghỉ phép: giao khoảng `start_date..end_date` với kỳ — điều kiện `start_date <= den AND end_date >= tu`) / `ngay_cong` (Tăng ca).
- Điều kiện: Trạng thái (→ tab có số), Loại nghỉ (Nghỉ phép), Nhân viên (màn Duyệt). Cả hai bảng đã có cột Ngày tạo.
- Test riêng: đơn nghỉ 28/09–03/10 khớp kỳ tháng 10 theo mốc `nghi`.

### Task 17: Lương › Tạm ứng

**Files:** `backend/app/routers/payroll.py:668` + repo; `frontend/src/pages/nhan-su-luong/luong/tabs/{TamUngTab,TamUngBang,TamUngBoLoc}.tsx`, `tamUngLoc.ts`.
- Đang tải cả kỳ lương rồi lọc + phân trang 50 + đếm tab trong trình duyệt ⇒ chuyển hết lên máy chủ (`page/size/total/dem_theo_tab`).
- Kỳ ở màn này là KỲ LƯƠNG (MonthPicker giữ ở `phai`), thẻ kỳ ngày dùng mốc `ung` Ngày ứng / `tao` để thu hẹp trong kỳ lương.
- Điều kiện: Loại, Tổ, Số tiền (KhoangSo, gate tiền). Thêm cột Ngày tạo. Xoá `TamUngBoLoc.tsx` + `tamUngLoc.ts` (+ test của nó) khi đã thay.

### Task 18: Hồ sơ của tôi (yêu cầu cập nhật hồ sơ) + Nhật ký hệ thống

**Files:** `frontend/src/pages/nhan-su-luong/ho-so-cua-toi/HoSoCuaToiPage.tsx`, `backend/app/routers/employees.py:606`; `frontend/src/pages/ActivityLogPage.tsx`.
- Hồ sơ của tôi: thêm `tu_ngay/den_ngay` (một mốc `tao`); điều kiện Trạng thái (đã có `dem`). Cột "Ngày gửi" chính là created_at — đổi nhãn thành "Ngày tạo" để thống nhất.
- Nhật ký: đã lọc máy chủ + facets — chỉ thay giao diện lọc bằng `ThanhLoc` (Hành động, Nhóm, Người làm, Loại đối tượng = ChonNhieu lấy từ facets); giữ phân trang keyset `neo`. Không đổi BE.

### Task 19: Dọn + ghi nhớ

**Files:** xoá thành phần lọc cũ không còn ai dùng (`khoShared.DateFilterHead` nếu hết chỗ dùng, `ke-toan/components/ToolbarChuan` nếu hết, `danh-muc/LocNangCao` GIỮ vì danh mục ngoài phạm vi); cập nhật memory `loc-danh-sach-kinh-doanh` + `moi-danh-sach-ban-ghi-co-ky-va-bo-loc` (đường dẫn mới `pages/thanh-loc/`).
- [ ] `rg "DateFilterHead|ToolbarChuan|LocThangTao|BoLocNangCao" frontend/src` → chỉ còn chỗ ngoài phạm vi (ghi ra trong báo cáo).
- [ ] `npx tsc -p frontend --noEmit` sạch.

---

## Tự rà

- Phạm vi: 27 danh sách trong bản kiểm kê nhóm 1 — đã đủ: Kinh doanh 3 (T2), Kế toán 6 (T3), Kho 5 (T4–5), Giao hàng 2 (T6), KHSX/Hồ sơ lệnh 3 (T7), KCS (T8), Bàn tổ (T9), Sửa chữa 2 (T10), Bảo trì (T11), YCMH 2 (T12), PMH (T13), Tài sản (T14), Chấm công 3 (T15), Nghỉ phép + Tăng ca (T16), Tạm ứng (T17), Hồ sơ của tôi + Nhật ký (T18). "Nhân viên giao hàng", "Khấu hao tháng", "Bảng lương", "Công của tôi", "Tạm ứng của tôi" là bảng tổng hợp/cá nhân theo tháng — không phải danh sách chứng từ, ngoài phạm vi.
- Cột Ngày tạo: T4, T5, T6, T7, T8, T9, T10, T11, T12, T14, T15, T17 thêm; còn lại đã có (T18 đổi nhãn).
- Đổi tham số ngày cũ sang `tu_ngay/den_ngay/moc` (`created_from/to`, `needed_from/to`, `tu/den` của Bảo trì, `thang` của Nghỉ phép/Tăng ca, `tu_ngay/den_ngay` theo Hạn SX của Hồ sơ lệnh ⇒ `moc=han_sx`): mỗi task sửa CẢ FE gọi lẫn test BE cũ — `rg` tên cũ trong `backend/tests` + `frontend/src` trước khi đóng task.

---

## Mở rộng 06/10/2026 — mọi mục thanh bên (Task 20–26)

Kiểm kê 06/10: danh mục chung một trang `pages/danh-muc/CatalogListPage.tsx` + `rebuildCatalogConfigs.tsx`, BE `routers/catalog_base.py:make_catalog_router` (đã lọc/phân trang máy chủ, `facets`). Chỉ `MayThietBiRow`, `ThanhPhamRow` trả `created_at`.

### Task 20: Danh mục dùng chung (Thiết bị, Công đoạn, Đơn vị, Giấy, Vật tư khác, Thành phẩm, Khuôn, Khai báo kho, Xe)
- BE `catalog_base.py`: nhận `tu_ngay/den_ngay` (mốc `tao` = `Model.created_at`), cho phép khai thêm điều kiện qua `loc_them`; mọi Row schema thêm `created_at`.
- FE `CatalogListPage`: thay hàng tab facet + `locNangCao` + nút "đã ngừng" bằng `ThanhLoc` (facet → điều kiện "mot" có số đếm; "Đang dùng / Đã ngừng" → điều kiện); config khai `dieuKien`; cột "Ngày tạo" chung cho mọi config (thành phẩm đổi nhãn "Ngày khai" → giữ một cột, không lặp).
- Thêm điều kiện theo kiểm kê: Công đoạn (nhóm, tổ, cần khuôn), Đơn vị (họ — BE đã nhận `ho`), Giấy/Vật tư (đơn vị giá), Thành phẩm (khách), Xe (mức khoán), Khai báo kho (trạng thái).

### Task 21: Khách hàng + Nhà cung cấp
- `KhachHangPage.tsx` (BE `customers.py:188`): NV phụ trách, Nhãn, Trạng thái, Loại khách thành điều kiện; kỳ theo Ngày tạo; thêm cột Ngày tạo (bảng + thẻ).
- `SuppliersPage.tsx` (BE `purchases.py:314`): Trạng thái, Nhóm NCC, Số sao, Nhận gia công thành điều kiện; kỳ theo Ngày tạo; thêm cột.

### Task 22: Nhân sự — Hồ sơ nhân sự, Phòng ban, Nội quy
- Nhân sự (`employees.py:371`): Phòng ban, Trạng thái, Có tài khoản, Sắp hết hợp đồng thành điều kiện; mốc kỳ `tao` / `vao_lam` (hire_date, Date); thêm cột Ngày tạo cạnh Ngày vào làm.
- Phòng ban (cây): lọc ở máy chủ (`/api/departments` nhận tham số, trả nút khớp + tổ tiên); điều kiện = các cờ khối (sản xuất/kinh doanh/giao hàng/KCS), Thiếu trưởng phòng, Chưa có người; kỳ Ngày tạo.
- Nội quy: mốc `tao` = `uploaded_at`; điều kiện Người tải lên, Loại tệp.

### Task 23: Lương — Bảng lương tháng
- `BangLuongTab`: tìm + Phòng + Chính thức/Thử việc đang lọc trong JS ⇒ chuyển lên `/api/luong/table` (lọc máy chủ); `ThanhLoc` không kỳ (tháng chọn bằng MonthPicker giữ nguyên). Tạm ứng ở Task 17.

### Task 24: KCS tiêu chí
- `KcsKhaiBaoPage` + `san_xuat_kcs_tieu_chi.py:46`: tham số `q`, `nhom`, `bat_buoc`, `active`, kỳ Ngày tạo hạng mục; lọc máy chủ, cây chỉ giữ nhánh có hạng mục khớp.

### Task 25: Bảng điều phối — Theo dõi SX, Kế hoạch vật tư, Xếp lịch (hàng chờ)
- `ThanhLoc` không `ky`: Theo dõi SX (Khách, Máy, Bất thường — đã là tham số máy chủ), Kế hoạch vật tư (Chỉ thiếu, Không rõ → máy chủ; Cần lo, Giữ lâu), Xếp lịch hàng chờ (Khách, Hạn SX dạng kỳ có `ky` riêng của hàng chờ theo `tao`).

### Task 26: Báo cáo — kinh doanh, kho, công nợ
- Ô từ/đến rời → nút kỳ của `ThanhLoc` (mốc = ngày chứng từ của báo cáo, gửi `tu_ngay/den_ngay`; báo cáo kho đổi `tu/den` cùng lúc). Lọc khách/sale (kinh doanh), kho/loại (kho), tìm (công nợ, kho) chuyển hết lên máy chủ thành điều kiện.
