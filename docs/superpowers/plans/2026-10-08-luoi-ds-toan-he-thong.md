# Lưới danh sách kiểu Kinh doanh cho mọi module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi màn danh sách bản ghi ở thanh bên (trừ Nhân sự, Lương, Báo cáo) dùng chung khuôn lưới của 5 màn Kinh doanh: đầu trang `lds-dau`, thẻ lọc `lds-loc` dính lưới, lưới `lds-g` kiểu bảng tính, hộp "Cột" ẩn/hiện + kéo đổi vị trí, cố định khung (tiêu đề bám trên, cột mã đứng yên khi cuộn ngang), chân `PhanTrangDayDu` trong thẻ lưới.

**Architecture:** Bộ kit đã có và ĐÃ XONG — `frontend/src/components/LuoiDs.tsx` + `luoi-ds.css` (chủ sở hữu: phiên "ui - kinh doanh - tk"; task con KHÔNG sửa hai file này, cần gì thêm thì báo về). Mỗi Task chuyển một module: thay khung đầu trang/thanh lọc/bảng cũ của màn bằng khuôn kit, giữ nguyên dữ liệu, bộ lọc, ngăn chi tiết, hành vi bấm dòng. Máy chủ chỉ đụng khi màn đã có lọc trạng thái mà số đếm đang tính ở trình duyệt, hoặc khi màn đã có dòng tổng mà đang cộng trong trang.

**Tech Stack:** React 18 + TypeScript + Vite + Vitest (frontend); FastAPI + SQLAlchemy + pytest (backend).

**Spec:** Màn mẫu đã được user duyệt 07–08/10/2026: `frontend/src/pages/BaoGiaPage.tsx` (đọc đoạn `return (` của danh sách), `KhachHangPage.tsx`, `DonHangBanPage.tsx`. Mockup gốc: `docs/mockups/danh-sach-kinh-doanh-gon-3-phuong-an.html` (phương án A). Bộ nhớ: `luoi-danh-sach-phuong-an-a.md`.

## Global Constraints

- UI tiếng Việt hoàn toàn. Không chữ đậm cho mã/tên/tiêu đề (font-weight 400/500). Không nối mẩu dữ liệu bằng `·` hay dấu phẩy.
- Không hồng nhạt, không viền một cạnh; dòng đang mở = viền đủ cạnh (`tr.is-chon`); hover `--rule-hair`.
- Chip trạng thái dùng `ChipTT` (bộ `--tt-*`), mỗi trạng thái một sắc, không hai trạng thái trùng màu trong một màn.
- Khung bảng KHÔNG trần chiều cao (cả trang cuộn). Bọc bảng bằng `CuonLuoi`, không dùng `div.lds-cuon` trần.
- Lọc, đếm, cộng ở MÁY CHỦ trên cả tập đã lọc — cấm cắt trang/đếm trong JS khi endpoint có phân trang.
- Không đổi luật nghiệp vụ, không đổi API trả về (chỉ được THÊM field). Không đổi ngăn chi tiết / form.
- Thứ tự cột theo nhóm nghĩa: Mã → Ngày → Đối tác/Khách → Hàng/Nội dung → Số lượng → Tiền → Trạng thái → các khâu theo luồng → Người → Ghi chú cuối. Cột mã (và ô chọn nếu có) `coDinh: true`, đứng đầu.
- Không chạy `./init.ps1`, không chạy pytest toàn bộ. Kiểm bằng vitest file liên quan + pytest file liên quan. `npx tsc --noEmit -p .` (chạy trong `frontend/`, mất ~3–5 phút) chạy MỘT lần cuối mỗi đợt, không mỗi task.
- File CRLF thì sửa bằng Edit/Python giữ nguyên đuôi dòng, không `sed -i`.
- Không commit (user chưa yêu cầu).
- NÉ (phiên "mua hàng" đang sửa, làm sau cùng khi phiên đó báo xong): `pages/mua-hang/yeu-cau-mua-hang/**`, `pages/mua-hang/phieu-mua-hang/**`, `pages/mua-hang/yeu-cau-chung/**`, `pages/mua-hang/don-mua-chung/**`, `pages/mua-hang/loc-mua-hang/**`, `pages/mua-hang/mua-cho/**`, `mua-hang/nha-cung-cap/tabs/SupplierHistoryTab.tsx`, `ke-toan/don-mua-hang/AccountingPurchaseInboxPage.tsx`, `pages/KhoYeuCauPage.tsx`, `pages/ton-kho/**`, `pages/KhoTonKhoPage.tsx`, `pages/KeHoachVatTuPage.tsx`, `components/AppShell.tsx`. `api/client.ts` dùng chung: chỉ THÊM field/kiểu bằng Edit nhỏ, không sắp xếp lại.

## Khuôn chuẩn (mọi Task áp đúng khuôn này)

```tsx
import {
  CuonLuoi, soCotGhim, ChipTT, ChonCot, LocNhanhTrangThai, OTim, TieuDeSapXep,
  rongLuoi, soVN, ngayVN, useCotAn, useThuTuCot, xepCot, type CotLuoi,
} from "<đường tương đối>/components/LuoiDs";
import { EmptyRow } from "<…>/components/EmptyState";
import { PhanTrangDayDu } from "<…>/components/PhanTrangDayDu";
import { ThanhLoc } from "<…>/pages/thanh-loc/ThanhLoc";

interface CotX extends CotLuoi { w?: number; n?: boolean; sx?: string }
const COT_X: CotX[] = [
  { key: "ma", label: "Mã …", coDinh: true, w: 120, sx: "code" },
  { key: "ngay", label: "Ngày tạo", w: 104, sx: "created" },
  // … theo thứ tự nhóm nghĩa; cột cuối (Ghi chú/Người) không đặt w
];

// trong component:
const [cotAn, setCotAn] = useCotAn("<khoa-man>");
const [thuTu, setThuTu] = useThuTuCot("<khoa-man>");
const cotHien = xepCot(COT_X, thuTu).filter((c) => !cotAn.has(c.key));

return (
  <main className="<lớp cũ của màn> lds">
    <header className="lds-dau">
      <h1 className="lds-dau__ten">Tên màn</h1>
      <div className="lds-dau__nut">{/* nút chính, vd "+ Tạo …" */}</div>
    </header>
    {/* banner/cảnh báo (nếu có) đặt TẠI ĐÂY, trên lds-loc */}
    <section className="lds-loc">
      <LocNhanhTrangThai muc={muc} dang={trangThai} onChon={chonTrangThai} />{/* chỉ khi màn có lọc trạng thái */}
      <div className="lds-loc__thanh tl-thanh" role="search">
        <OTim value={q} onChange={…} placeholder="Tìm …" ariaLabel="Tìm …" />
        <ThanhLoc … />{/* giữ nguyên props đang dùng */}
        <ChonCot cot={COT_X} an={cotAn} onAn={setCotAn} thuTu={thuTu} onThuTu={setThuTu} />
      </div>
    </section>
    <div className="lds-sheet">
      <CuonLuoi ghim={soCotGhim(cotHien)}>
        <table className="lds-g" style={{ minWidth: rongLuoi(cotHien) }}>
          <colgroup>{cotHien.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}</colgroup>
          <thead><tr>{cotHien.map((c) => (
            <th key={c.key} className={c.n ? "n" : undefined}>
              {c.sx ? <TieuDeSapXep label={c.label} cot={c.sx} sort={sort} onSort={setSort} /> : c.label}
            </th>))}</tr></thead>
          <tbody>
            {/* đang tải: <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
                lỗi: <tr><td colSpan className="lds-trong"><span className="lds-do">…</span> <button className="lds-lk">Thử lại</button></td></tr>
                rỗng: <tr><td colSpan className="lds-trong">Chưa có … / Không có … khớp điều kiện đang lọc.</td></tr> */}
            {rows.map((r) => (
              <tr key={r.id} className={`lds-dong${r.id === dangMo ? " is-chon" : ""}`} tabIndex={0}
                  onClick={() => mo(r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mo(r); } }}>
                {cotHien.map((c) => <OX key={c.key} cot={c.key} r={r} />)}
              </tr>
            ))}
            {/* dòng Cộng (chỉ khi máy chủ trả tổng): <tr className="lds-cong"><td className="lead" colSpan={viTri}>Cộng N …</td><td className="n">{soVN(tong)}</td>…</tr> */}
          </tbody>
        </table>
      </CuonLuoi>
      {total > 0 && <PhanTrangDayDu trang={page} size={size} tong={total} soDong={rows.length} onTrang={setPage} onSize={…} loading={loading} />}
    </div>
  </main>
);
```

Ô dữ liệu: một component `O<X>` switch theo `cot`, trả `<td>` có `title` khi chữ dài; số `className="n"` + `soVN`; ngày `ngayVN`; trạng thái `<ChipTT mau=…>`; chữ phụ mờ `lds-mu`; đơn vị nhỏ `lds-u`. Nút trong ô dùng `td.lds-nut` và `e.stopPropagation()`.

Màn có TAB thật (đổi nội dung khác nhau, vd Kế hoạch SX "Hàng chờ"/"Lệnh"): tab giữ nguyên là tab (role tablist) đặt trong `lds-dau` dưới tên hoặc ngay trên `lds-loc`; mỗi tab một lưới khuôn trên. Bộ lọc trạng thái của CÙNG một danh sách (StatusTabs, DaiTab, "Tất cả/Đang SX/…") đổi sang `LocNhanhTrangThai`.

CSS riêng của màn: chỉ giữ lớp cho ngăn/form; xoá CSS bảng cũ không còn dùng (grep chắc không còn ai dùng). Nếu lớp cũ của màn đè `th/td` (đệm, chữ hoa), thêm lớp đè vào CSS của màn bằng `.lds .lds-g …` — KHÔNG sửa `luoi-ds.css`.

## Kiểm tra mỗi Task

- [ ] grep: màn không còn `<table className="<lớp cũ>"` ở danh sách chính; có `CuonLuoi`, `lds-dau`, `lds-loc`, `lds-sheet`.
- [ ] `cd frontend && npx vitest run <test của màn nếu có>` → PASS (test cũ dò theo chữ/role của bảng cũ thì sửa test theo DOM mới, không xoá kiểm định nghiệp vụ).
- [ ] Backend có đổi: `cd backend && python -m pytest tests/<file liên quan> -q` → PASS; thêm field vào schema Out + `api/client.ts`.
- [ ] Báo cáo: file đã sửa, cột (thứ tự), lọc trạng thái lấy số từ đâu, có gì không làm được.

---

## Đợt 1 — module không vướng phiên khác

### Task 1: Danh mục (9 màn chung `CatalogListPage`)

**Files:** Modify `frontend/src/pages/danh-muc/CatalogListPage.tsx`, `frontend/src/pages/danh-muc/rebuildCatalogConfigs.tsx` (khai cột `w`/`n`/`coDinh` nếu cấu hình cột nằm ở đây), `frontend/src/pages/danh-muc/rebuild-catalog.css`.
**Interfaces:** Consumes kit. Khoá màn cho `useCotAn`/`useThuTuCot` = `dm-${configKey}` (mỗi danh mục nhớ riêng).
- [ ] Đọc cấu hình cột hiện tại trong `rebuildCatalogConfigs.tsx`; ánh xạ sang `CotX` (cột mã `coDinh`).
- [ ] Đổi `CatalogListPage` sang khuôn chuẩn; lọc nhóm/trạng thái đang có (facet `dem` qua `kem_dem=true`) → `LocNhanhTrangThai` với số từ máy chủ.
- [ ] Giữ nút Thêm, nhập/xuất Excel ở `lds-dau__nut`; giữ ngăn sửa.
- [ ] vitest các test trong `pages/danh-muc/` → PASS.
- Ngoài phạm vi: Tiêu chí KCS (`KcsKhaiBaoPage`, dạng cây khai báo, không phải danh sách bản ghi).

### Task 2: Nhật ký (`ActivityLogPage`)

**Files:** Modify `frontend/src/pages/ActivityLogPage.tsx` + CSS của nó. Khoá màn `nhat-ky`.
- [ ] Đổi `act-table` sang khuôn chuẩn. Cột: Thời điểm (`coDinh`), Người, Phân hệ, Hành động, Đối tượng, Chi tiết (co giãn). Giữ cơ chế phân trang `trang/limit/neo` và facets `/api/audit/facets`; chân trang giữ đúng phân trang hiện có.
- [ ] vitest test của Nhật ký (nếu có) → PASS.

### Task 3: Kế hoạch sản xuất (2 tab)

**Files:** Modify `frontend/src/pages/KeHoachSXPage.tsx` (+ file con của 2 tab nếu tách), `frontend/src/pages/ke-hoach-sx.css`. Khoá `khsx-hang-cho`, `khsx-lenh`.
- [ ] Tab "Hàng chờ tiếp nhận" (`khsx__table--queue`, counts `dem` từ `/api/lsx/hang-cho`) → khuôn chuẩn.
- [ ] Tab "Lệnh sản xuất" (`khsx__table--lenh`, `StatusTabs` + `facets` từ `/api/lsx`) → khuôn chuẩn, `StatusTabs` → `LocNhanhTrangThai`.
- [ ] Giữ hai tab là tab thật; nút chính ở `lds-dau__nut`.

### Task 4: Hồ sơ lệnh sản xuất

**Files:** Modify `frontend/src/pages/LenhSanXuatPage.tsx`, `frontend/src/pages/lenh-sx-chung.css` (chỉ phần bảng danh sách). Khoá `ho-so-lenh`.
- [ ] `lsc-bang` → khuôn chuẩn; 4 tab lọc (Tất cả/Đang SX/Sau SX/Đã giao đủ, số `dem_theo_tab`) → `LocNhanhTrangThai`. Giữ `page_size`.
- [ ] Lưu ý `lsc-bang` còn dùng ở Theo dõi SX — không xoá CSS lớp này.
- [ ] vitest `LenhSxHoSoView.test`, `lsxKhau.test` → PASS.

### Task 5: Theo dõi sản xuất

**Files:** Modify `frontend/src/pages/TheoDoiSanXuatPage.tsx`, `TdsxTheoLenh.tsx`, `TdsxTheoMay.tsx` (+ CSS). Khoá `tdsx-lenh`, `tdsx-may`.
- [ ] Đầu trang + thẻ lọc theo khuôn; nút đổi "Theo máy/Theo lệnh" ở `lds-loc__thanh` (bên phải, trước ChonCot).
- [ ] "Theo lệnh" → khuôn chuẩn (không phân trang máy chủ: giữ nguyên, KHÔNG thêm PhanTrangDayDu giả).
- [ ] "Theo máy" (nhóm theo máy): giữ cấu trúc nhóm, chỉ đổi bảng sang `lds-g` trong `lds-sheet` + `CuonLuoi`; dòng tiêu đề nhóm dùng `tr.lds-so`.

### Task 6: Tổ sản xuất (Bảng + Sản lượng) và KCS

**Files:** Modify `frontend/src/pages/ThsxDanhSach.tsx` (đường thật: tìm bằng glob), `ThsxSanLuongTab.tsx`, `ThucHienSxPage.tsx` (đầu trang), `frontend/src/pages/kcs/KcsTheoLenhPage.tsx` + CSS. Khoá `thsx-ds`, `thsx-sl`, `kcs-lenh`.
- [ ] `thsx-ds__tbl`, `thsx-sl__bang`, `kcs-table--lenh` → khuôn chuẩn; phân trang `trang/co_trang` giữ nguyên.
- [ ] Màn tổ là màn xưởng (nút to/số lớn theo bộ nhớ đa vai): giữ cỡ nút thao tác trong ngăn; lưới danh sách vẫn theo khuôn.
- [ ] Không thêm lọc trạng thái mới (endpoint không trả counts).

### Task 7: Sửa chữa máy + Phiếu bảo trì (đã lai khuôn)

**Files:** Modify `frontend/src/pages/SuaChuaMayPage.tsx`, `frontend/src/pages/PhieuBaoTriPage.tsx`, `KyThuatMayChung.tsx` (nếu `Luoi` cục bộ nằm đây), `ky-thuat-may.css`.
- [ ] Thay `Luoi` cục bộ / `div.lds-cuon` bằng `CuonLuoi ghim={soCotGhim(cotHien)}`; thêm `ChonCot` + `useThuTuCot` nếu chưa có; đầu trang theo `lds-dau`/`lds-loc`.
- [ ] Không đổi ngăn 2 cột (đã duyệt 07/10).

### Task 8: Nhà cung cấp

**Files:** Modify `frontend/src/pages/mua-hang/nha-cung-cap/components/SuppliersTable.tsx`, `SuppliersToolbar.tsx`, `SuppliersPage.tsx`. KHÔNG đụng `tabs/SupplierHistoryTab.tsx`.
- [ ] `lds-cuon` → `CuonLuoi`; đầu trang `lds-dau`; toolbar thành `lds-loc` (LocNhanhTrangThai số từ `/api/suppliers/tong-quan` như hiện tại); `ChonCot` + kéo thứ tự.

### Task 9: Giao hàng — tab Nhân viên giao hàng

**Files:** Modify `frontend/src/pages/giao-hang/giao-hang/tabs/BangNhanVien.tsx`, `giao-hang.css`.
- [ ] `rc__table gh-nv` → `lds-sheet` + `CuonLuoi` + `lds-g` (bảng tổng theo tháng, không phân trang). Cột tên NV `coDinh`.
- [ ] vitest `GiaoHangPage.test.tsx` → PASS.

### Task 10: Kho — tab "Yêu cầu" (`KhoDeNghiPage`) + vỏ `KhoPage`

**Files:** Modify `frontend/src/pages/KhoDeNghiPage.tsx`, `frontend/src/pages/KhoPage.tsx` (đầu trang + tab), `kho-request.css` (chỉ phần bảng đề nghị). KHÔNG đụng `KhoYeuCauPage.tsx`.
- [ ] `kho-ds-bang` → khuôn chuẩn; lọc trạng thái lấy số từ `/api/kho/de-nghi/counts-by-status` (đã có) → `LocNhanhTrangThai`.
- [ ] Đầu trang `lds-dau` ở `KhoPage` bao cả 2 tab; tab "Phiếu từ yêu cầu" tạm giữ nguyên nội dung (đợt 3).

### Task 11: Kế toán (Phiếu chi, Phiếu thu, Công nợ phải trả/thu, Tài sản)

**Files:** Modify `frontend/src/pages/ke-toan/phieu-chi/components/VouchersTable.tsx` + `PaymentVouchersPage.tsx`, `phieu-thu/components/ReceiptsTable.tsx` + `PaymentReceiptsPage.tsx`, `ke-toan/shared/ThanTrangCongNo.tsx`, `ke-toan/shared/LuoiGon.tsx` (kit kt: `DaiTab` → dùng `LocNhanhTrangThai` thay ở các màn trên), `tai-san/DanhSachView.tsx`, CSS `ke-toan.css`/`tai-san.css`. KHÔNG đụng `don-mua-hang/**`.
- [ ] `kt-g kt-chinh` → `lds-g` trong khuôn chuẩn; `DaiTab` (số `the_loc`) → `LocNhanhTrangThai`; dòng Cộng giữ số máy chủ đang trả.
- [ ] Tài sản: `offset/limit` giữ nguyên; `dem_loai`/`dem_trang_thai` → `LocNhanhTrangThai`. Tab "Khấu hao từng tháng" chỉ đổi bảng sang `lds-g` trong `lds-sheet`.
- [ ] Ngăn chi tiết, form lập phiếu: KHÔNG đổi.
- [ ] vitest `LuoiGon.test`, `PhieuGon.test`, `DanhSachView.test.tsx` và test trong `ke-toan/**` → PASS.
- Ngoài phạm vi: Tài khoản ngân hàng (thẻ, vài bản ghi, không phải danh sách chứng từ).

## Đợt 2 — chờ phiên "mua hàng" nhắn xong

### Task 12: Yêu cầu mua hàng + Mua hàng + Kế toán Đơn mua hàng

**Files:** `pages/mua-hang/yeu-cau-chung/BangYeuCau.tsx`, `BangMonYeuCau.tsx`, `pages/mua-hang/don-mua-chung/BangDonMua.tsx`, `pages/mua-hang/loc-mua-hang/ThanhCongCuMuaHang.tsx`, `DepartmentPurchaseRequestsPage.tsx`, `PurchaseRequestsPage.tsx`, `tabs/YeuCauInboxTab.tsx`, `tabs/PhieuListTab.tsx`, `ke-toan/don-mua-hang/AccountingPurchaseInboxPage.tsx`, `purchase.css`.
- [ ] `mh-g` → khuôn chuẩn (bảng dùng chung nên 3 màn đổi cùng lúc); `ThanhCongCuMuaHang` thành `lds-loc`.

### Task 13: Kho — "Phiếu từ yêu cầu" + màn từng kho (Tồn kho, Phiếu nhập, Phiếu xuất)

**Files:** `pages/KhoYeuCauPage.tsx`, `pages/KhoTonKhoPage.tsx`, `kho-request.css`.
- [ ] `rc__table` → khuôn chuẩn. Tồn kho đang cắt trang ở trình duyệt (`/api/kho/phieu/lo/danh-sach` trả mảng): chuyển phân trang + lọc lên máy chủ (thêm `page/size` + `total`, pytest).

### Task 14: Kế hoạch vật tư

**Files:** `pages/KeHoachVatTuPage.tsx`, `ke-hoach-vat-tu/LuoiVatTu.tsx`.
- [ ] Lưới `lvt-g` vừa làm theo kiểu bảng tính (commit ba091956): chỉ đổi đầu trang/thẻ lọc theo khuôn và bọc `CuonLuoi`; giữ nguyên ô lưới.

## Ngoài phạm vi (không phải danh sách bản ghi)

Quy trình kinh doanh (sơ đồ), Xếp lịch (Gantt + thẻ hàng chờ), các khung "Lịch" (bảo trì, tổ), Tài khoản ngân hàng (thẻ), Tiêu chí KCS (cây khai báo), Hồ sơ của tôi (thuộc Nhân sự).
