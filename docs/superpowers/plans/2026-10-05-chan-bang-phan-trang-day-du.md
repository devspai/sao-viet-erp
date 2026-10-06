# Chân bảng phân trang kiểu Nhật ký cho mọi module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi bảng danh sách của các module trên sidebar dùng chung chân bảng `PhanTrangDayDu` (khuôn màn Nhật ký: "Trang x/y · n dòng / tổng N …" + ô Dòng/trang + dãy số trang), và khung bảng KHÔNG còn trần chiều cao — trang cuộn, không cuộn trong khung.

**Architecture:** `frontend/src/components/PhanTrangDayDu.tsx` đã có (Nhật ký + 9 màn danh mục đang dùng). Việc là: (1) bổ sung cho component hai thứ các màn khác cần (`ghiChu`, giữ cỡ trang lạ trong ô chọn); (2) gỡ trần `max-height` ở các khung bảng dùng chung; (3) thay từng chân bảng cũ (`Pager`, `.ptg-pager`, `.foot`, `.dhb__pager`, `.kh__pager`, `md-page__pager`, `kho-pager`, `ThanhTrang`, `ns__pager`, `depts__pager`…) bằng `PhanTrangDayDu`, thêm state `size` + `onSize` ở màn nào API nhận cỡ trang.

**Tech Stack:** React 18 + TypeScript + Vite (frontend), vitest; FastAPI + SQLAlchemy (backend, chỉ 1 chỗ: KCS).

**Spec:** yêu cầu chủ dự án 05/10/2026 — ảnh 1 (Nhật ký) là khuôn, ảnh 2 (Tính giá) là kiểu cũ phải thay; "nhớ không giới hạn chiều cao bảng như nhật ký". Kiểm kê hiện trạng: phần **Phụ lục A** cuối file.

## Global Constraints

- Chân bảng = `<PhanTrangDayDu …/>`, không tự vẽ lại. Hiện khi `tong > 0` (bảng rỗng thì khối "chưa có/không tìm thấy" đã nói).
- `tong` là tổng MÁY CHỦ trả khi màn cắt trang ở máy chủ. Màn đang cắt trang ở client (Phụ lục A, cột "client") thì truyền độ dài danh sách đã lọc — KHÔNG đổi cơ chế nạp trong đợt này.
- Cỡ trang: mặc định **25**, ô chọn `[15, 25, 50, 100]` (mặc định của component) cho mọi màn có `onSize`. Đổi cỡ trang ⇒ về trang 1.
- Đổi bộ lọc/tìm ⇒ về trang 1 (giữ hành vi sẵn có của từng màn).
- Khung bảng: chỉ `overflow-x: auto`; không `max-height`, không `overflow-y` cuộn trong khung.
- Bỏ "dòng đệm" (`rc__filler`) ở các bảng kho — chúng tồn tại để GIỮ chiều cao cố định, trái với yêu cầu.
- UI tiếng Việt, không tiếng Anh. Không nối thông tin bằng dấu `·` MỚI ngoài chính khuôn của component (component giữ nguyên chữ của Nhật ký).
- Không commit trừ khi chủ dự án bảo. Cây làm việc đang có thay đổi dở của phiên khác — chỉ sửa đúng đoạn chân bảng/khung bảng, không ghi đè cả tệp.
- Verify: `cd frontend && npx tsc --noEmit` + `npx vitest run <tệp test liên quan>`; backend `cd backend && python -m pytest tests/<tệp> -q`. KHÔNG chạy `./init.ps1`. Mỗi màn: thao tác thật trên trình duyệt dev (bấm trang 2, đổi Dòng/trang) trước khi đánh dấu xong.

---

### Task 0: Bổ sung `PhanTrangDayDu`

**Files:**
- Modify: `frontend/src/components/PhanTrangDayDu.tsx`
- Modify: `frontend/src/components/phan-trang-day-du.css`
- Test: `frontend/src/components/PhanTrangDayDu.test.tsx` (tạo mới)

**Interfaces — Produces:** prop mới `ghiChu?: ReactNode` (in sau dòng thông tin bên trái, chữ mờ); ô Dòng/trang luôn chứa `size` hiện tại kể cả khi `size ∉ coTrang`.

- [ ] **Step 1: Viết test hỏng**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhanTrangDayDu } from "./PhanTrangDayDu";

describe("PhanTrangDayDu", () => {
  it("giữ cỡ trang lạ trong ô chọn", () => {
    render(<PhanTrangDayDu trang={1} size={30} tong={90} soDong={30} onTrang={vi.fn()} onSize={vi.fn()} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("30");
  });
  it("in ghi chú sau dòng thông tin", () => {
    render(<PhanTrangDayDu trang={1} size={25} tong={3} soDong={3} onTrang={vi.fn()} ghiChu="chỉ áp cho trang đang xem" />);
    expect(screen.getByText("chỉ áp cho trang đang xem")).toBeTruthy();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/PhanTrangDayDu.test.tsx` → FAIL (value "15", không có ghi chú).
- [ ] **Step 3: Sửa component**

```tsx
// trong props
ghiChu?: ReactNode;
// trước return
const luaChon = coTrang.includes(size) ? coTrang : [...coTrang, size].sort((a, b) => a - b);
// trong .ptdd__info, sau phần tổng
{ghiChu && <span className="ptdd__ghichu">{ghiChu}</span>}
// select dùng luaChon thay coTrang
```

```css
.ptdd__ghichu { margin-left: 8px; opacity: 0.85; }
```

- [ ] **Step 4:** chạy lại test → PASS; `npx tsc --noEmit` sạch.

---

### Task 1: Gỡ trần chiều cao khung bảng dùng chung

**Files:**
- Modify: `frontend/src/pages/rebuild-catalog.css:1011-1022` — `.rc__tablewrap` bỏ `max-height: calc(100vh - 320px)`, `overflow: auto` → `overflow-x: auto`. Rule `.rc--dm .rc__tablewrap { max-height: none }` (~:1243) thành thừa → xoá. (Ảnh hưởng: Giao hàng – Yêu cầu giao/Nhân viên, KCS, Sửa chữa máy, Phiếu bảo trì, Tài sản 2 tab, Kho – Hộp yêu cầu.)
- Modify: `frontend/src/pages/lenh-san-xuat.css:619-621` và `:1077` — `.hslsx__tablewrap` bỏ `max-height`, `overflow: auto` → `overflow-x: auto`.
- Modify: `frontend/src/pages/kho-request.css:59-66`, `:1504-1518` — `.kho-bc-wrap`, `.kho-list .kho-tablewrap` bỏ `max-height`, `overflow-x: auto`.
- GIỮ `frontend/src/pages/luong.css:3618-3626` (`.ns__tablewrap.lg-table`): Bảng lương là bảng tính không phân trang (Phụ lục B), trần đó tồn tại để ghim tiêu đề hai tầng khi cuộn — gỡ trần mà chưa có chân phân trang thì mất tiêu đề trên bảng dài.
- Modify: `frontend/src/pages/nhan-su-luong/cham-cong/tabs/CalendarTab.tsx:215-217` — bỏ inline `maxHeight: "250px"`, `overflowY`.
- `frontend/src/styles/responsive.css:148-155` — rule `max-height: none` ở ≤1024px thành thừa nhưng vô hại (còn phục vụ `.md-page__tablewrap`) → để nguyên.

Ngoài phạm vi có chủ ý: lưới Phân ca (`.cc-sp-scroll`, là bảng soạn có thanh thao tác dính đáy), Gantt Theo dõi SX (`.tdsx-tm__scroll`), hàng chờ Xếp lịch (`.xl-cho__list`) — không phải bảng danh sách.

- [ ] **Step 1:** sửa CSS như trên.
- [ ] **Step 2:** `grep -n "max-height" ` lại từng selector → không còn trần trên khung bảng.
- [ ] **Step 3:** mở Sửa chữa máy, Hồ sơ LSX, Báo cáo kho trên trình duyệt dev: bảng dài ra theo nội dung, thanh cuộn là của trang.

---

### Task 2: Kinh doanh + Tổng quan

**Files / thay thế:**
- `pages/nhan-su-luong/ho-so-cua-toi/HoSoCuaToiPage.tsx:618-623` — `Pager` → `PhanTrangDayDu trang={reqPage} size={reqSize} tong={reqTotal} soDong={rows.length} onTrang={setReqPage} onSize={setReqSize} donVi="đề nghị"`; `REQ_PAGE_SIZE` thành state mặc định 25.
- `pages/PhieuTinhGiaListView.tsx:318-343` — `.ptg-pager` → `PhanTrangDayDu … donVi="phiếu"`; `PAGE_SIZE` → state `size` (25), đưa vào tham số `api.phieuTinhGia.list` và deps; đổi size ⇒ `setPage(1)`. Gỡ CSS `.ptg-pager*` trong `tinh-gia.css` nếu không còn ai dùng.
- `pages/BaoGiaPage.tsx:406-428` — `.foot` → `PhanTrangDayDu … donVi="phiếu báo giá"`, `PAGE_SIZE` (10) → state 25.
- `pages/DonHangBanPage.tsx:341-366` — `.dhb__pager` → `PhanTrangDayDu … donVi="đơn"`; `PAGE_SIZE` → state. Hai tab client (Chờ cọc / Sẵn sàng chốt) giữ cửa sổ 200 + `slice`, chỉ đổi `size` theo state.
- `pages/giao-hang/giao-hang/GiaoHangPage.tsx:228-244` (tab Đơn giao hàng) — `tong={khoiTotal}` (đúng đại lượng đang cắt trang — sửa luôn lệch "chữ đếm đơn, số trang đếm khối"), `donVi` = danh từ của khối (đọc `KhoiLuot` để đặt đúng: "lượt"/"đơn"); `:251-267` (Yêu cầu giao) → `PhanTrangDayDu … donVi="yêu cầu"`; `PAGE_SIZE` → state.
- `pages/KhachHangPage.tsx:1017-1063` — `.kh__pager` (đã có Select 25/50/100) → `PhanTrangDayDu trang={page} size={pageSize} tong={total} … onSize={setPageSize} donVi="khách hàng"`; bỏ `PAGE_SIZES`.

- [ ] **Step 1:** sửa từng tệp; mỗi màn thêm `import { PhanTrangDayDu } from "../components/PhanTrangDayDu"` (đường dẫn tương đối đúng).
- [ ] **Step 2:** `npx tsc --noEmit`; `npx vitest run src/pages/giao-hang/giao-hang/GiaoHangPage.test.tsx` — test nào khẳng định chữ cũ ("Tổng … đơn giao", "Trước/Sau") thì cập nhật theo chữ mới.
- [ ] **Step 3:** trình duyệt: mỗi màn bấm trang 2, đổi Dòng/trang 50 → về trang 1, số "tổng" khớp.

---

### Task 3: Báo cáo kho

**Files:** `pages/KhoBaoCaoPage.tsx` (Sổ kho Nhập/Xuất `:1587`, Chuyển kho `:1478`, Lịch sử `:2041`, Kỳ đã khoá `:2141`), `pages/KhoGiaGocThanhPham.tsx:375`.
- Bốn tab client: `kho-bc-pager` (PageSizeSelect + Trước/Sau) → `PhanTrangDayDu trang={page} size={pageSize} tong={filteredRows.length} soDong={pageRows.length} onTrang={setPage} onSize={(n)=>{setPageSize(n);setPage(1);}}`; mặc định 25. `tfoot` tổng tiền giữ nguyên (cộng trên toàn bộ dòng đã lọc).
- Giá gốc: `Pager` → `PhanTrangDayDu … donVi="lô gốc"`; `CO_TRANG` → state 25 gửi `size`.
- [ ] tsc + trình duyệt từng tab.

---

### Task 4: Sản xuất + Sửa chữa

**Files:**
- `pages/KeHoachSXPage.tsx:501, :807` — hai `Pager` → `PhanTrangDayDu` (`donVi="đơn chờ"`, `"lệnh"`); `SIZE_TRANG` → state chung 25 (comment ở :44 nói "cho CẢ hai bảng" — giữ chung một state).
- `pages/LenhSanXuatPage.tsx:786-797` — `Pager` → `PhanTrangDayDu … donVi="lệnh" ghiChu={<>Vừa cập nhật …</>}` (chuyển nhãn "Vừa cập nhật" vào `ghiChu`); `PAGE_SIZE` → state, gửi `page_size`.
- `pages/ThucHienSxPage.tsx:863, :1095` — `ThanhTrang` → `PhanTrangDayDu … donVi="lệnh"`; `CO_TRANG` → state, gửi `co_trang` (máy chủ ≤100). Xoá hàm `ThanhTrang` nếu hết người dùng.
- `pages/ThsxSanLuongTab.tsx:498-513` — footer tự viết → `PhanTrangDayDu tong={tong_lenh} donVi="lệnh"`; `CO_TRANG` → state.
- `pages/kcs/KcsTheoLenhPage.tsx:234` — `Pager` → `PhanTrangDayDu … donVi="lệnh" onSize={…}`; cần backend (dưới).
- `pages/SuaChuaMayPage.tsx:388, :927`, `pages/PhieuBaoTriPage.tsx:440` — `Pager` → `PhanTrangDayDu` (`"phiếu"`, `"yêu cầu"`, `"phiếu"`); `SIZE` → state.
- Backend KCS: `backend/app/routers/san_xuat.py:1037` thêm `co_trang: int = Query(30, ge=1, le=100)`; `backend/app/services/san_xuat/kcs.py:725` nhận `co_trang: int = _CO_TRANG`, dùng thay `_CO_TRANG` ở offset/limit/trả về. FE `api.sanXuat.kcsLenh` (client.ts ~13345) thêm tham số `co_trang`.
- Test backend: thêm vào `backend/tests/test_san_xuat_kcs.py` sau `test_danh_sach_lenh_kcs`:

```python
def test_danh_sach_lenh_kcs_co_trang(db, orders, lsx_svc, admin, customer):
    res = _dung_lenh_kcs(db, orders, lsx_svc, admin, customer)  # dùng đúng helper mà test_danh_sach_lenh_kcs đang dùng
    out = kcs.danh_sach_lenh_kcs(db, res["nguoi_kcs"], gom_da_dong=True, co_trang=1)
    assert out["co_trang"] == 1 and len(out["items"]) <= 1
```

  (Đọc `test_danh_sach_lenh_kcs` ở :588 để lấy đúng cách dựng `res`; thay dòng `_dung_lenh_kcs` bằng đúng đoạn dựng đó.)
- Thực hiện SX — khung: `.thsx` (`thuc-hien-sx.css:12-33`) là bố cục làm việc cao 100% có ngăn trượt; gỡ `overflow-y: auto` của `.thsx-ds__scroll` (:968) và `overflow: hidden` của `.thsx-grid` (:320) chỉ khi ngăn trượt vẫn đúng chỗ — kiểm trên trình duyệt; nếu vỡ ngăn trượt thì DỪNG, báo lại.
- [ ] pytest tệp KCS; tsc; vitest `LenhSanXuatPage.test.tsx`, `ThsxChotGiay.test.tsx`; trình duyệt từng màn.

---

### Task 5: Thu mua + Kế toán

**Files** (đều đang SERVER, `md-page__pager` hoặc `purchase__source-foot` tự viết, `PAGE_SIZE = 20`):
- `pages/mua-hang/yeu-cau-mua-hang/components/RequestsTable.tsx:149-173` (`donVi="yêu cầu"`) — bỏ điều kiện chỉ hiện khi >1 trang.
- `pages/mua-hang/phieu-mua-hang/tabs/YeuCauInboxTab.tsx:199-222` (`"yêu cầu"`), `tabs/PhieuListTab.tsx:350-373` (`"đơn"`).
- `pages/mua-hang/nha-cung-cap/components/SuppliersTable.tsx:486-512` (`"nhà cung cấp"`).
- `pages/ke-toan/don-mua-hang/components/InboxTable.tsx:138-160` (`"đơn"`), `ke-toan/phieu-chi/components/VouchersTable.tsx:133+` (`"chứng từ"`), `ke-toan/cong-no-phai-tra/AccountingPayablesPage.tsx:358-379` (`"nhà cung cấp"`), `ke-toan/phieu-thu/components/ReceiptsTable.tsx:147+` (`"phiếu thu"`), `ke-toan/cong-no-phai-thu/AccountingReceivablesPage.tsx:231-249` (`"khách hàng"`).
- `pages/tai-san/DanhSachView.tsx:248` — `Pager` → `PhanTrangDayDu … donVi="món"`; API dùng offset/limit: `offset=(page-1)*size, limit=size`.
- Bảng nằm trong component con nhận `page/total/onPage` qua props ⇒ thêm prop `size` + `onSize` đi từ trang cha (nơi giữ state và gọi API).
- [ ] tsc; trình duyệt từng màn.

---

### Task 6: Kho hàng

**Files:**
- `pages/KhoDeNghiPage.tsx:422-445`, `pages/KhoYeuCauPage.tsx:523-546` — `kho-pager` → `PhanTrangDayDu … donVi="yêu cầu"`; bỏ dòng đệm `:410-418`, `:506-515`, `:702-708`; mặc định 25 (đổi `DEFAULT_PAGE_SIZE` ở `khoShared.tsx:36` thành 25 và `PAGE_SIZES` — nếu còn nơi khác dùng `PageSizeSelect` thì giữ export).
- `pages/KhoTonKhoPage.tsx:956-975` — `kho-pager` → `PhanTrangDayDu tong={<độ dài danh sách đã lọc của tab>}`; bỏ dòng đệm `:814-820`, `:940-946`. Vẫn cắt client (ghi chú Phụ lục B).
- [ ] tsc; trình duyệt: Đề nghị, Hộp yêu cầu Nhập/Xuất/Điều chuyển, một kho bất kỳ 4 tab.

---

### Task 7: Nhân sự & Lương

**Files:**
- `pages/nhan-su-luong/nhan-su/NhanSuPage.tsx:615-640` — `.ns__pager` → `PhanTrangDayDu … donVi="nhân viên"`; `size` state.
- `nghi-phep/tabs/ApproveTab.tsx:187`, `MyLeaveTab.tsx:270`, `CalendarTab.tsx:376`, `LeaveTypesTab.tsx:276` — `Pager` → `PhanTrangDayDu` (`"đơn"`…); `note` cũ → `ghiChu`.
- `tang-ca/TangCaPage.tsx:330, :466` — như trên, `note` → `ghiChu`.
- `luong/tabs/NhanVienTab.tsx:547`, `luong/tabs/TamUngTab.tsx:304` — `Pager` → `PhanTrangDayDu`.
- `noi-quy/NoiQuyPage.tsx:304` — `Pager` → `PhanTrangDayDu … donVi="tài liệu"`.
- `luong/modals/LapHangLoatModal.tsx:820` — là modal, giữ `Pager`.
- `phong-ban/DepartmentsPage.tsx:2333-2379` — `.depts__pager` → `PhanTrangDayDu … donVi="người"`; bỏ `minHeight: memberPageSize*54` (:2225).
- [ ] tsc; vitest các test trong `nhan-su-luong`; trình duyệt từng tab.

---

### Task 8: Dọn dẹp

- [ ] `grep -rn "<Pager" frontend/src` — chỉ còn modal/drawer (LapHangLoatModal, Gantt Theo dõi SX). Nếu `Pager` chỉ còn 1-2 nơi, giữ (không phải việc của đợt này).
- [ ] Gỡ CSS chết: `.ptg-pager`, `.dhb__pager`, `.kh__pager`, `.gh-pager`, `kho-pager`, `kho-bc-pager`, `.depts__pager`, `.ns__pager` (grep trước khi xoá — còn chỗ dùng thì để).
- [ ] Cập nhật comment đầu `PhanTrangDayDu.tsx` và `phan-trang-day-du.css` ("Dùng chung: …").

---

## Phụ lục A — Kiểm kê (05/10/2026)

| Màn | Bảng | Chân cũ | Cắt trang | Trần cao |
|---|---|---|---|---|
| Hồ sơ của tôi | Đề nghị của tôi | Pager | máy chủ | — |
| Tính giá | danh sách PTG | `.ptg-pager` | máy chủ | — |
| Báo giá | danh sách | `.foot` | máy chủ | — |
| Đơn hàng bán | danh sách | `.dhb__pager` | máy chủ (2 tab client) | — |
| Giao hàng | Đơn giao / Yêu cầu giao | `.gh-pager` | máy chủ / client | `.rc__tablewrap` |
| Khách hàng | danh sách | `.kh__pager` | máy chủ | — |
| Báo cáo kho | 4 tab sổ/lịch sử, Giá gốc | `kho-bc-pager`, Pager | client, máy chủ | `.kho-bc-wrap` |
| KH sản xuất | 2 tab | Pager | máy chủ | — |
| Hồ sơ LSX | danh sách | Pager | máy chủ | `.hslsx__tablewrap` |
| Tổ SX | Danh sách, Sản lượng | tự viết | máy chủ | `.thsx` bố cục |
| KCS | lệnh | Pager | máy chủ (cỡ cố định 30) | `.rc__tablewrap` |
| Sửa chữa máy | 2 view | Pager | máy chủ | `.rc__tablewrap` |
| Phiếu bảo trì | Bảng | Pager | máy chủ | `.rc__tablewrap` |
| Thu mua (3) + Kế toán (5) | | `md-page__pager` | máy chủ | — |
| Tài sản | Sổ tài sản | Pager | máy chủ (offset) | `.rc__tablewrap` |
| Kho | Đề nghị, Hộp yêu cầu, Tồn kho | `kho-pager` | máy chủ, máy chủ, client | `.rc__tablewrap`, `.kho-tablewrap` |
| Hồ sơ nhân sự | danh sách | `.ns__pager` | máy chủ | — |
| Nghỉ phép | 4 tab | Pager | 2 máy chủ, 2 client | — |
| Tăng ca | 2 tab | Pager | máy chủ | — |
| Lương | NV, Tạm ứng | Pager | máy chủ, client | `.lg-table` (Bảng lương) |
| Nội quy | danh sách | Pager | máy chủ | — |
| Phòng ban | thành viên | `.depts__pager` | client | — |
| 9 màn danh mục | | ĐÃ `PhanTrangDayDu` | máy chủ | đã gỡ |

## Phụ lục B — Chưa làm trong đợt này (chờ chủ dự án chốt)

Hiện KHÔNG phân trang (bày hết), muốn có chân bảng thì phải thêm phân trang ở máy chủ trước:
Báo cáo kinh doanh, Báo cáo công nợ, Báo cáo kho (Nhập-Xuất-Tồn, Kỳ đã tính), Bảng lương — đều có dòng TỔNG cộng trên toàn bộ dòng, cắt trang thì tổng phải chuyển lên máy chủ; Kế hoạch vật tư (2 view), Bài ghép (đang ẩn), Tài khoản ngân hàng, Tài sản – Khấu hao tháng, Giao hàng – Nhân viên giao hàng, Chấm công (Nhật ký chấm công, Yêu cầu chỉnh công, Đi muộn/về sớm, Lịch & Ngày lễ), Lương – Tạm ứng của tôi, Lương – Danh mục.

Đang cắt client (đợt này chỉ đổi chân, chưa đổi cơ chế): Đơn hàng bán 2 tab, Giao hàng – Yêu cầu giao (cửa sổ 200 dòng mọi trạng thái — có thể sót yêu cầu đang chờ), Báo cáo kho 4 tab, Kho – Tồn kho (phiếu chỉ lấy 200 dòng đầu), Nghỉ phép – Lịch nghỉ/Loại nghỉ, Lương – Tạm ứng, Phòng ban – thành viên.

Không phải bảng danh sách: Quy trình kinh doanh, Theo dõi sản xuất (kanban/làn/ca/Gantt), Xếp lịch, Tiêu chí KCS (lưới thẻ), Chấm công – Bảng công tháng / Phân ca / Công của tôi.
