# Kế toán gọn: phương án A + ngăn kiểu 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm lại 9 màn kế toán theo phương án A của mockup: danh sách là lưới kiểu bảng tính, còn ngăn chi tiết theo kiểu 3 (nội dung bên trái, cột thuộc tính xếp dọc bên phải). Chín màn gồm danh sách và ngăn của Phiếu chi, Phiếu thu, Công nợ phải trả, Công nợ phải thu, cộng với danh sách Tài sản & CCDC.

**Architecture:**
- **Bộ kit dùng chung** ở `frontend/src/pages/ke-toan/shared/`:
  - lưới `.kt-g`;
  - dải tab có số `DaiTab`;
  - dòng Cộng;
  - cột thuộc tính `RayThuocTinh`;
  - ô `cot` của `NganPhai` để ngăn chia hai cột.
- **Máy chủ chỉ thêm số đọc**, không đổi luật tiền:
  - "trả/thu trước đó" của một phiếu;
  - tổng theo bộ lọc của công nợ;
  - liên hệ, phụ trách, tài khoản nhận trong chi tiết đối tác;
  - mức khấu hao tháng này và tổng theo nhóm của tài sản.
- **Mỗi module một Task.** Các Task máy chủ chạy song song với Task kit. Task giao diện chạy sau Task kit và Task máy chủ của module đó.

**Tech Stack:** React 18 + TypeScript + Vitest (frontend), FastAPI + SQLAlchemy + pytest (backend).

**Spec:** `docs/mockups/ke-toan-gon-3-phuong-an.html`, gồm:
- phương án A: các hàm `phieuA`, `cnA`, `tsA`;
- ngăn kiểu 3: nhánh cuối của `nganPhieuA` và `nganCnA`, khi `?pa=A&kieu=3`;
- bảng "Đổi chữ" ở đầu file.

Mở file bằng `python -m http.server` trong `docs/mockups`, xem `?pa=A&man=pc|pcN|pt|ptN|npt|nptN|nth|nthN|ts&kieu=3`.

## Global Constraints

- **Ngôn ngữ giao diện:** toàn bộ tiếng Việt, không chữ tiếng Anh.
- **Cách viết:**
  - Không nối mẩu dữ liệu bằng "·" hay dấu phẩy. Tách bằng `Cum` / `TheNho` / khoảng trống.
  - Không chữ đậm cho mã, tên, tiêu đề nhóm (font-weight ≤ 500).
  - Mỗi thông tin nói một lần trong một màn.
- **Viền và màu:**
  - Hover dùng `--rule-hair`. Chọn thì viền đủ 4 cạnh.
  - Không viền một cạnh, không hồng nhạt.
  - Chip trạng thái dùng bộ `--tt-*`.
- **Ngăn:**
  - Mọi ngăn rộng `--kt-ngan-w` (1180px), kéo được mép trái.
  - Có tab Lịch sử.
  - Vỏ là `NganPhai`, không đổi hành vi phím Esc / ↑ ↓.
- **Danh sách:**
  - Có nút kỳ (`ThanhLoc`), nút Lọc, cột Ngày tạo.
  - Chân bảng là `PhanTrangDayDu`.
  - Lọc và phân trang ở MÁY CHỦ.
- **Tiền:** chỉ người có quyền xem mới thấy, gác ở máy chủ. Task này không đổi quyền nào.
- **Logic đã chốt, không đổi:**
  - Phiếu chi chỉ có Đã chi / Đã hủy.
  - Phiếu thu chỉ có Đã thu / Đã hủy. "Chờ thu" chỉ là dữ liệu cũ, vẫn phải hiện đúng nếu có.
  - Gia công không có đơn giá.
  - Công nợ phải trả tính theo đợt giao, phải thu tính theo hoá đơn.
  - Tuổi nợ có 5 mốc: 1–7, 8–15, 16–30, 31–60, trên 60.
- **Chữ đổi theo mockup:**
  - "Chi cho" → "Người nhận tiền"; "Thu của" → "Người nộp tiền".
  - Cột "Lý do chi" / "Lý do nộp".
  - "Nguồn" → "Chi theo" (Đơn mua, Cọc đơn mua, Gia công, Tạm ứng lương, Khác) và "Thu theo" (Hoá đơn, Cọc đơn bán, Thu lại tiền chi, Khác).
  - "Thiếu chứng từ" → "Thiếu chứng từ gốc"; "Chứng từ" (tab) → "Chứng từ gốc".
  - "Hạn trả gần nhất" → "Hạn sớm nhất".
  - "Mua thêm" / "Đã trả" → "Mua trong kỳ" / "Trả trong kỳ"; "Bán thêm" / "Đã thu" → "Bán trong kỳ" / "Thu trong kỳ".
  - "khoản" → "đợt" (phải trả) / "hoá đơn" (phải thu).
  - "Giá trị còn lại" → "Còn lại".
- **Số phiếu:** cột đầu bảng phiếu là `doc_no` (PC00018 / PT00013). Phiếu cũ không có `doc_no` thì hiện `code`. Mã hệ thống `code` chỉ còn ở ngăn.
- **Không làm:** nút Xuất Excel của mockup (chưa có endpoint, là tính năng mới).
- **Không bỏ:**
  - Thẻ điện thoại `TheDienThoai`. Dưới 640px vẫn là thẻ hai hàng.
  - Đi dòng bằng bàn phím (`diChuyen`).
- **CSS:** thêm vào `frontend/src/pages/ke-toan/ke-toan.css`, tiền tố `kt-`. Riêng Tài sản thêm vào `frontend/src/pages/tai-san/tai-san.css`.
- **Verify:**
  - Backend: `cd backend && python -m pytest tests/<file> -q`, chỉ file liên quan.
  - Frontend: `cd frontend && npx vitest run <đường dẫn test>` và `npx tsc --noEmit -p .`.
  - KHÔNG chạy `./init.ps1`, KHÔNG chạy pytest cả bộ.
- **Bối cảnh git:**
  - Cây làm việc đang có rất nhiều thay đổi chưa commit của các phiên khác. KHÔNG `git stash`, KHÔNG `git checkout --`, KHÔNG commit.
  - Người điều phối commit cuối cùng, sau khi chủ dự án xem.
  - `frontend/src/pages/tai-san/TaiSanPage.tsx` và `tai-san.css` có sửa dở của phiên khác: sửa tại chỗ, giữ nguyên phần của họ.

---

## Task 1: Kit dùng chung (lưới, dải tab, dòng Cộng, cột thuộc tính, ngăn hai cột)

**Files:**
- Create: `frontend/src/pages/ke-toan/shared/LuoiGon.tsx`
- Create: `frontend/src/pages/ke-toan/shared/LuoiGon.test.tsx`
- Modify: `frontend/src/pages/ke-toan/shared/NganPhai.tsx` (thêm prop `cot`)
- Modify: `frontend/src/pages/ke-toan/shared/trangPhieu.ts` (đưa `tongTien` của danh sách ra ngoài)
- Modify: `frontend/src/pages/ke-toan/ke-toan.css` (thêm khối `/* ===== Gọn A ===== */` cuối file)

**Interfaces:**
- **Produces:**
  - `DaiTab({ muc, dangChon, onChon })`
    - `muc: { id: string; nhan: string; cham?: "xanh"|"amber"|"xam"|"do"; so?: number|null; an?: boolean }[]`
    - Vẽ `<div className="kt-dai-tab" role="group">` gồm các `<button aria-pressed>`: chấm màu, nhãn, rồi `<span className="kt-dai-tab__so">so</span>`. Mục `an: true` không vẽ.
  - `RayThuocTinh({ o })`
    - `o: { nhan: string; giaTri: ReactNode }[]`. Mục có `giaTri` null / "" / false không hiện.
    - Vẽ `<dl className="kt-ray">`. Mỗi mục là `<div className="kt-ray__o"><dt/><dd/></div>`, nhãn nằm trên giá trị.
  - `soPhieu(row: { doc_no?: string|null; code: string }): string`, trả về `doc_no || code`.
  - `NganPhai` thêm prop `cot?: ReactNode`.
    - Khi có `cot`, thân ngăn thành `<div className="kt-ngan__than kt-ngan__than--hai"><div className="kt-ngan__chinh">{children}</div><aside className="kt-ngan__cot" aria-label="Thuộc tính">{cot}</aside></div>`.
    - Không có `cot` thì giữ nguyên như cũ.
  - Lớp CSS:
    - lưới: `.kt-g`;
    - dòng: `.kt-g tr.kt-g__nhom`, `.kt-g tr.kt-g__cong`, `.kt-g .kt-g__so`;
    - dải tab: `.kt-dai-tab`;
    - đầu trang gọn: `.kt-dau-gon`;
    - khác: `.kt-ghi-chu--thieu`, `.kt-ngan__than--hai`, `.kt-ray`, `.kt-ngan__soLon`.
  - `useTrangPhieu` trả thêm `tongTien: number | null`, lấy từ `total_paid_amount` hoặc `total_received_amount` của lần tải.

- [ ] **Step 1: Viết test hỏng cho `DaiTab`, `RayThuocTinh`, `soPhieu`, và `NganPhai` có `cot`**

```tsx
// frontend/src/pages/ke-toan/shared/LuoiGon.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DaiTab, RayThuocTinh, soPhieu } from "./LuoiGon";
import { NganPhai } from "./NganPhai";

describe("DaiTab", () => {
  it("vẽ nhãn kèm số, ẩn mục an, bấm thì chọn", () => {
    const onChon = vi.fn();
    render(<DaiTab dangChon="tat_ca" onChon={onChon} muc={[
      { id: "tat_ca", nhan: "Tất cả", so: 20 },
      { id: "thieu", nhan: "Thiếu chứng từ gốc", cham: "amber", so: 3 },
      { id: "gc", nhan: "Gia công chờ chi", so: 0, an: true },
    ]} />);
    expect(screen.getByRole("button", { name: /Tất cả/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Thiếu chứng từ gốc/ })).toHaveTextContent("3");
    expect(screen.queryByText("Gia công chờ chi")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Thiếu chứng từ gốc/ }));
    expect(onChon).toHaveBeenCalledWith("thieu");
  });
});

describe("RayThuocTinh", () => {
  it("nhãn trên giá trị, bỏ ô trống", () => {
    render(<RayThuocTinh o={[
      { nhan: "Hình thức", giaTri: "Chuyển khoản" },
      { nhan: "Mã giao dịch", giaTri: null },
    ]} />);
    expect(screen.getByText("Hình thức").tagName).toBe("DT");
    expect(screen.getByText("Chuyển khoản").tagName).toBe("DD");
    expect(screen.queryByText("Mã giao dịch")).toBeNull();
  });
});

describe("soPhieu", () => {
  it("lấy số chứng từ, thiếu thì lấy mã", () => {
    expect(soPhieu({ doc_no: "PC00018", code: "UNC-261007-MD21" })).toBe("PC00018");
    expect(soPhieu({ doc_no: null, code: "UNC-261007-MD21" })).toBe("UNC-261007-MD21");
  });
});

describe("NganPhai có cột thuộc tính", () => {
  it("chia thân ngăn hai cột", () => {
    render(<NganPhai tieuDe="31.817.000 đ" onDong={() => undefined} cot={<p>cột phải</p>}><p>nội dung</p></NganPhai>);
    expect(screen.getByRole("complementary", { name: "Thuộc tính" })).toHaveTextContent("cột phải");
    expect(screen.getByText("nội dung").closest(".kt-ngan__chinh")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, phải hỏng**

Run: `cd frontend && npx vitest run src/pages/ke-toan/shared/LuoiGon.test.tsx`
Expected: FAIL. Lỗi là "Failed to resolve import ./LuoiGon".

- [ ] **Step 3: Viết `LuoiGon.tsx`**

```tsx
// frontend/src/pages/ke-toan/shared/LuoiGon.tsx
/** Mảnh của phương án A (docs/mockups/ke-toan-gon-3-phuong-an.html, 07/10/2026): dải tab có số cạnh
 *  tiêu đề thay hàng thẻ lọc cao, và cột thuộc tính xếp dọc (nhãn trên, giá trị dưới) của ngăn kiểu 3.
 *  Lưới kiểu bảng tính là lớp CSS `.kt-g` — bảng của từng màn tự vẽ dòng. */
import type { ReactNode } from "react";

export type MucTab = { id: string; nhan: string; cham?: "xanh" | "amber" | "xam" | "do"; so?: number | null; an?: boolean };

export function DaiTab({ muc, dangChon, onChon }: { muc: MucTab[]; dangChon: string; onChon: (id: string) => void }) {
  return (
    <div className="kt-dai-tab" role="group" aria-label="Lọc nhanh">
      {muc.filter((m) => !m.an).map((m) => (
        <button key={m.id} type="button" aria-pressed={m.id === dangChon} className={m.id === dangChon ? "on" : undefined}
          onClick={() => onChon(m.id)}>
          {m.cham && <i className={`kt-dai-tab__cham kt-dai-tab__cham--${m.cham}`} aria-hidden="true" />}
          {m.nhan}
          {m.so != null && <span className="kt-dai-tab__so">{m.so.toLocaleString("vi-VN")}</span>}
        </button>
      ))}
    </div>
  );
}

export type ORay = { nhan: string; giaTri: ReactNode };

export function RayThuocTinh({ o }: { o: ORay[] }) {
  const con = o.filter((x) => x.giaTri != null && x.giaTri !== "" && x.giaTri !== false);
  return (
    <dl className="kt-ray">
      {con.map((x) => (
        <div key={x.nhan} className="kt-ray__o">
          <dt>{x.nhan}</dt>
          <dd>{x.giaTri}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Số in trên tờ phiếu (PC00018); phiếu cũ chưa có số thì dùng mã hệ thống. */
export function soPhieu(row: { doc_no?: string | null; code: string }): string {
  return row.doc_no || row.code;
}
```

- [ ] **Step 4: Thêm `cot` vào `NganPhai`**

Trong props của `NganPhai`, thêm ngay sau `chanDong?`:

```tsx
  /** Cột thuộc tính bên phải (ngăn kiểu 3, 07/10/2026): thân ngăn chia hai cột, cột phải cuộn riêng. */
  cot?: ReactNode;
```

Thêm `cot` vào phần destructure. Thay dòng `<div className="kt-ngan__than">{children}</div>` bằng:

```tsx
          {cot != null ? (
            <div className="kt-ngan__than kt-ngan__than--hai">
              <div className="kt-ngan__chinh">{children}</div>
              <aside className="kt-ngan__cot" aria-label="Thuộc tính">{cot}</aside>
            </div>
          ) : (
            <div className="kt-ngan__than">{children}</div>
          )}
```

- [ ] **Step 5: Đưa tổng tiền của danh sách ra `useTrangPhieu`**

Trong `frontend/src/pages/ke-toan/shared/trangPhieu.ts`:

1. Đổi type:

   ```ts
   type DanhSachSo<R> = { items: R[]; total: number; the_loc: SoTheLoc; total_paid_amount?: number; total_received_amount?: number };
   ```

2. Thêm state:

   ```ts
   const [tongTien, setTongTien] = useState<number | null>(null);
   ```

3. Trong `.then`, đặt:

   ```ts
   setTongTien(coBang ? (r.total_paid_amount ?? r.total_received_amount ?? null) : null);
   ```

4. Trong `.catch`, đặt `setTongTien(null)`.

5. Trả `tongTien` trong object kết quả, kèm chú thích: "Tổng tiền phiếu đã xong theo kỳ + bộ lọc (mọi trang) — dòng Cộng của bảng."

- [ ] **Step 6: CSS**

Thêm vào cuối `frontend/src/pages/ke-toan/ke-toan.css`:

```css
/* ===== Gọn A (07/10/2026, docs/mockups/ke-toan-gon-3-phuong-an.html) ===== */
/* Đầu trang một hàng: tiêu đề + dải tab có số — ô tìm, kỳ, Lọc — nút chính. */
.kt-dau-gon { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.kt-dau-gon h1 { font-size: 18px; font-weight: 500; margin: 0 6px 0 0; letter-spacing: -.01em; white-space: nowrap; }
.kt-dau-gon__gian { flex: 1; }
.kt-dai-tab { display: flex; gap: 2px; flex-wrap: wrap; }
.kt-dai-tab button { border: 1px solid transparent; background: transparent; border-radius: 7px; padding: 4px 10px; font: inherit;
  font-size: 13px; color: var(--ash); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.kt-dai-tab button:hover { background: var(--rule-hair); }
.kt-dai-tab button.on { border-color: var(--rule); background: var(--canvas); color: var(--ink); }
.kt-dai-tab__so { color: var(--ash-3, var(--ash-2)); font-size: 12px; font-variant-numeric: tabular-nums; }
.kt-dai-tab__cham { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.kt-dai-tab__cham--xanh { background: var(--tt-la-dot, var(--moss)); }
.kt-dai-tab__cham--amber { background: var(--tt-vang-dot, var(--amber)); }
.kt-dai-tab__cham--xam { background: #9ca3af; }
.kt-dai-tab__cham--do { background: var(--tt-do-dot, var(--signal)); }

/* Lưới kiểu bảng tính: dòng 34px, chữ 13px, vạch dọc mảnh, cắt chữ bằng "…" (title giữ chữ đủ). */
.kt-bang .kt-g { width: 100%; border-collapse: collapse; table-layout: fixed; }
.kt-bang .kt-g th, .kt-bang .kt-g td { border-right: 1px solid var(--rule-hair); border-bottom: 1px solid var(--rule-hair);
  padding: 6px 9px; height: 34px; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
.kt-bang .kt-g th { height: 32px; background: var(--paper); color: var(--ash-2); font-size: 12px; font-weight: 500;
  text-transform: none; letter-spacing: 0; text-align: left; border-bottom-color: var(--rule-soft); }
.kt-bang .kt-g th:last-child, .kt-bang .kt-g td:last-child { border-right: 0; }
.kt-bang .kt-g .kt-g__so { text-align: right; font-variant-numeric: tabular-nums; }
.kt-bang .kt-g .kt-g__giua { text-align: center; }
.kt-bang .kt-g .kt-g__mo { color: var(--ash-2); }
.kt-bang .kt-g .kt-g__mo3 { color: var(--ash-3, var(--ash-2)); }
.kt-bang .kt-g .kt-g__do { color: var(--tt-do-fg); }
.kt-bang .kt-g .kt-g__vang { color: var(--tt-vang-fg); }
.kt-bang .kt-g tr.kt-g__nhom td { background: var(--rule-hair); color: var(--ink-2, var(--ink)); }
.kt-bang .kt-g tr.kt-g__cong td { background: var(--paper); color: var(--ink-2, var(--ink)); }
.kt-bang .kt-g thead tr.kt-g__t2 th { height: 26px; text-align: center; border-bottom-color: var(--rule-hair); }
.kt-bang .kt-g tbody tr.kt-dong:hover td { background: var(--rule-hair); }
.kt-bang .kt-g tbody tr.kt-dang-xem td { background: var(--rule-hair); }
.kt-bang .kt-g tbody tr.kt-da-huy td { color: var(--ash-3, var(--ash-2)); }
.kt-bang .kt-g tbody tr.kt-da-huy .kt-g__ten { text-decoration: line-through; text-decoration-color: var(--rule); }
.kt-ghi-chu--thieu { color: var(--tt-vang-fg); }
.kt-g a.kt-lk, .kt-g button.kt-lk { font-size: 13px; }

/* Ngăn kiểu 3: nội dung trái, cột thuộc tính phải 290px cuộn riêng. */
.kt-ngan__than--hai { display: grid; grid-template-columns: minmax(0, 1fr) 290px; padding: 0; overflow: hidden; }
.kt-ngan__chinh { overflow-y: auto; padding: 16px 24px 32px; min-width: 0; border-right: 1px solid var(--rule-soft); }
.kt-ngan__cot { overflow-y: auto; padding: 14px 20px 24px; background: #fcfdfe; }
.kt-ray { margin: 0; }
.kt-ray__o { padding: 6px 0; border-bottom: 1px solid var(--rule-hair); }
.kt-ray__o:last-child { border-bottom: 0; }
.kt-ray dt { font-size: 12px; color: var(--ash-3, var(--ash-2)); }
.kt-ray dd { margin: 1px 0 0; font-size: 13px; color: var(--ink); overflow-wrap: anywhere; }
.kt-ngan__soLon { font-size: 22px; font-weight: 500; letter-spacing: -.015em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.kt-ngan__muc { font-size: 12.5px; color: var(--ash-2); margin: 16px 0 6px; display: flex; align-items: baseline; gap: 10px; }
.kt-ngan__muc:first-child { margin-top: 0; }
.kt-ngan__muc > :last-child:not(:first-child) { margin-left: auto; }
.kt-ngan__ly { font-size: 16px; color: var(--ink); margin: 1px 0 14px; }
@media (max-width: 760px) {
  .kt-ngan__than--hai { grid-template-columns: 1fr; overflow-y: auto; }
  .kt-ngan__chinh { overflow: visible; border-right: 0; }
  .kt-ngan__cot { overflow: visible; border-top: 1px solid var(--rule-soft); }
}
```

- [ ] **Step 7: Chạy test và tsc**

Run: `cd frontend && npx vitest run src/pages/ke-toan/shared/LuoiGon.test.tsx src/pages/ke-toan/shared/NganPhai.test.tsx src/pages/ke-toan/shared/trangPhieu.test.ts && npx tsc --noEmit -p .`
Expected: PASS hết. tsc không lỗi mới trong `pages/ke-toan/shared`.

---

## Task 2: Máy chủ: "trả trước đó" của phiếu chi, đọc một phiếu thu kèm "thu trước đó"

Bảng đối chiếu trong ngăn phiếu cần số **trước phiếu này**. `paid_amount` của đợt và `received_amount` của hoá đơn tính cả phiếu lập SAU nên không dùng được.

**Files:**
- Modify: `backend/app/schemas/accounting.py`
  - `PaymentVoucherOut`: thêm `truoc_do: int | None = None` và `con_no_sau: int | None = None`.
  - `PaymentReceiptOut`: thêm các trường giống hệt.
- Modify: `backend/app/services/accounting_service.py`
  - `get_voucher` điền hai số.
  - Thêm `get_receipt(receipt_id)` điền hai số.
- Modify: `backend/app/routers/accounting.py`: thêm `GET /api/accounting/payment-receipts/{receipt_id}`. Quyền là `require_permission(MODULE_PT, "read")`, cùng biến quyền mà route danh sách phiếu thu đang dùng.
- Modify: `frontend/src/api/client.ts`
  - Thêm `truoc_do?: number | null; con_no_sau?: number | null` vào `PaymentVoucherRow` và `PaymentReceiptRow`.
  - Thêm `api.accounting.receipt(token, id)`, viết theo khuôn `api.accounting.voucher`.
- Test: `backend/tests/test_phieu_truoc_do.py` (mới)

**Luật tính:**
- **Phiếu chi có `delivery_id`:**
  - `truoc_do` = Σ `amount_vnd` của các phiếu chi `status == "paid"`, cùng `delivery_id`, `id < phiếu này`, trừ chính nó.
  - `con_no_sau` = giá trị đợt − trừ cọc của đợt − `truoc_do` − (`amount_vnd` của phiếu này nếu nó `paid`, nếu đã hủy thì 0), chặn dưới 0.
  - Giá trị đợt và trừ cọc lấy từ chỗ đang dựng `amount` / `coc_bu` của đợt cho `purchase_service`. Dùng lại hàm đó, đừng tính lại công thức. Tìm theo `coc_bu` trong `backend/app/services/purchase_service.py`.
- **Phiếu chi không có `delivery_id`:** cọc, gia công, tạm ứng, khác thì cả hai là `None`.
- **Phiếu thu có `sales_invoice_id`:**
  - `truoc_do` = Σ `amount_vnd` của phiếu thu `status == "received"`, cùng `sales_invoice_id`, `id <` phiếu này.
  - `con_no_sau` = giá trị hoá đơn − `deposit_offset_amount` của hoá đơn − `truoc_do` − (phiếu này nếu `received`), chặn dưới 0.
  - Không có `sales_invoice_id` thì `None`.
- Danh sách (`list_vouchers`, `list_receipts`) KHÔNG tính hai số này, để `None`, tránh N truy vấn.

- [ ] **Step 1: Viết test hỏng.**
  - Dựng 1 đơn mua có 1 đợt giao, giá trị 100.000.000, không cọc.
  - Lập 3 phiếu chi theo thứ tự: A 30tr, B 20tr, C 10tr. Hủy B.
  - `GET /api/accounting/payment-vouchers/{C}` phải ra `truoc_do == 30_000_000` và `con_no_sau == 60_000_000`.
  - `GET` phiếu A phải ra `truoc_do == 0` và `con_no_sau == 70_000_000`.
  - Phần phiếu thu làm tương tự: hoá đơn 10tr, hai phiếu 4tr và 3tr. Phiếu sau phải có `truoc_do == 4_000_000` và `con_no_sau == 3_000_000`.
  - `GET` phiếu thu không tồn tại → 404.
  - Dựng dữ liệu theo khuôn sẵn có trong `backend/tests/test_payables_api.py` (đợt giao, phiếu chi) và `backend/tests/test_accounting_receipts*.py` hoặc tệp test phiếu thu hoá đơn tương ứng. Tìm bằng `grep -l "createSalesInvoiceReceipt\|sales-invoices/.*/receipts\|sales_invoice_id" backend/tests`.
- [ ] **Step 2:** `cd backend && python -m pytest tests/test_phieu_truoc_do.py -q`. Expected: FAIL.
- [ ] **Step 3: Cài đặt.**
  - Truy vấn bằng `select(func.coalesce(func.sum(...), 0))` của SQLAlchemy, đặt trong repository (`accounting_repo.py`) theo kiến trúc routers → services → repositories.
  - Router chỉ gọi service.
  - Trả 404 qua `AccountingNotFound` và `_map_error` như `get_payment_voucher`.
- [ ] **Step 4:** chạy lại test mới, cùng `python -m pytest tests/test_payables_api.py -q` và các test phiếu thu đang có. Expected: PASS.
- [ ] **Step 5: Nối frontend.** Thêm type và hàm `api.accounting.receipt` vào `frontend/src/api/client.ts`, rồi `npx tsc --noEmit -p .` (từ `frontend/`).

---

## Task 3: Máy chủ: tổng theo bộ lọc của công nợ, thêm thông tin đối tác vào chi tiết

**Files:**
- Modify: `backend/app/schemas/accounting.py`
  - Thêm vào `PayablesSummaryOut` và `ReceivablesSummaryOut`: `tong_loc: TongLocCongNoOut | None = None`.
  - Thêm vào `PayablesDetailOut`: `lien_he_ten: str | None = None`, `lien_he_sdt: str | None = None`, `tk_nhan: str | None = None`.
  - Thêm vào `ReceivablesDetailOut`: `lien_he_ten: str | None = None`, `lien_he_sdt: str | None = None`, `phu_trach: str | None = None`.
- Modify: `backend/app/services/accounting_service.py`, trong `payables_summary`, `receivables_summary`, `payables_detail`, `receivables_detail`.
- Modify: `frontend/src/api/client.ts`: thêm type tương ứng.
- Test: `backend/tests/test_cong_no_tong_loc.py` (mới)

```python
class TongLocCongNoOut(BaseModel):
    """Tổng của MỌI dòng khớp bộ lọc (trước khi cắt trang) — dòng Cộng của bảng. Khác số tổng đầu
    màn (`total_due`, `aging`…) vốn không theo bộ lọc nâng cao."""
    so_doi_tac: int
    so_khoan: int          # phải trả: số đợt còn nợ; phải thu: số hoá đơn còn nợ
    con_no: int
    aging: dict[str, int]  # khoá như AGING_KEYS: chua_toi_han, d1_7, d8_15, d16_30, d31_60, d60_plus
    qua_han: int
    trong_ky_1: int        # mua/bán trong kỳ
    trong_ky_2: int        # trả/thu trong kỳ
```

**Luật:**
- `tong_loc` cộng trên đúng danh sách dòng ĐÃ lọc. Danh sách này có trước bước cắt trang trong `*_summary`: đọc hàm để tìm biến danh sách sau khi lọc `q`, `filter_`, `aging_bucket`, `no_tu`… và trước `page/size`.
- Với `chi_tong=True` và `dem_only=True` thì `tong_loc = None`, giữ hai lối nhanh đó nhẹ.
- `so_khoan`:
  - phải trả = Σ `aging[*].count` của từng dòng (giao diện đang làm thế ở `ThanTrangCongNo.tsx:232`);
  - phải thu = Σ `invoice_count`.
- `lien_he_ten` / `lien_he_sdt` / `phu_trach` lấy bằng đúng hàm mà dòng danh sách đang dùng. Tìm `lien_he_ten` và `sale_user_name` trong service, rồi tách thành hàm nhỏ dùng cho cả hai chỗ.
- `tk_nhan`:
  - Lấy tài khoản ngân hàng mặc định của NCC (`SupplierBankAccount.is_default`, `models/accounting.py`), dạng chuỗi `"{ngân hàng} {số tài khoản}"`.
  - Không có thì `None`.
  - Không đòi thêm quyền: người xem được công nợ phải trả đã thấy số tiền phải trả cho NCC này.

- [ ] **Step 1: Test hỏng.**
  - Dựng 2 NCC còn nợ: NCC1 có 2 đợt, một đợt quá hạn 10 ngày; NCC2 có 1 đợt chưa tới hạn.
  - `GET /api/accounting/payables?q=<tên NCC1>` phải ra `tong_loc.so_doi_tac == 1`, `tong_loc.so_khoan == 2`, `tong_loc.con_no` bằng tổng nợ của NCC1, `tong_loc.aging["d8_15"]` bằng số đợt quá hạn.
  - Không lọc thì `tong_loc.con_no` bằng tổng hai NCC.
  - `chi_tong=true` thì `tong_loc` là null.
  - `GET /api/accounting/payables/{ncc1}` trả `lien_he_ten` và `tk_nhan` khi NCC có liên hệ chính và tài khoản mặc định.
  - Làm tương tự cho `/receivables` với 2 khách và `phu_trach`.
  - Lấy khuôn dựng dữ liệu từ `backend/tests/test_payables_api.py` và `backend/tests/test_receivables*.py`.
- [ ] **Step 2:** chạy, phải FAIL.
- [ ] **Step 3:** cài đặt.
- [ ] **Step 4:** chạy test mới, cùng `python -m pytest tests/test_payables_api.py tests/test_phan_tuoi_cong_no.py -q` và các tệp test receivables đang có. Expected: PASS.
- [ ] **Step 5:** thêm type vào `client.ts` (`TongLocCongNo`, các trường mới), rồi chạy `npx tsc --noEmit -p .`.

---

## Task 4: Máy chủ: tài sản có mức tháng này, nhóm và tổng theo nhóm

**Files:**
- Modify: `backend/app/routers/tai_san.py` (route danh sách `GET /api/tai-san`, khoảng dòng 220–255)
- Modify: `backend/app/repositories/tai_san_repo.py` (`danh_sach`: sắp theo nhóm)
- Modify: `backend/app/schemas/tai_san.py` (`TaiSanRow`, `TaiSanListOut`)
- Modify: `frontend/src/api/taiSan.ts` (type + tham số `nhom_theo`)
- Test: `backend/tests/test_tai_san_nhom.py` (mới)

**Thêm:**
- **`TaiSanRow.muc_thang_nay: int`**: mức trích của tháng hiện tại, theo giờ Việt Nam. Dùng `svc.muc_thang(t, nam, thang)` sẵn có (`services/tai_san*/service.py`, quanh dòng 200). Tài sản đã khấu hao hết hoặc đã thôi dùng thì 0.
- **Tham số `nhom_theo: str = Query("loai", pattern="^(loai|bo_phan|khong)$")`.**
  - `loai`: sắp `(loai == "ccdc", ma)`, tức Tài sản cố định trước rồi tới Công cụ dụng cụ, trong nhóm sắp theo mã.
  - `bo_phan`: sắp `(bo_phan_ten nulls last, ma)`.
  - `khong`: sắp theo `ma` như cũ.
- **`TaiSanListOut`:**
  - `nhom: list[NhomTaiSanOut]`, mỗi phần tử `{khoa: str, ten: str, so: int, nguyen_gia: int, hao_mon: int, con_lai: int, muc_thang: int}`.
    - Tính trên MỌI dòng khớp bộ lọc, không chỉ trang đang xem, theo thứ tự nhóm như trên.
    - Tên nhóm: "Tài sản cố định" / "Công cụ dụng cụ", hoặc tên bộ phận, hoặc "Chưa gán bộ phận".
    - `nhom_theo == "khong"` thì là `[]`.
  - Thêm `tong_hao_mon: int` và `tong_muc_thang: int` theo bộ lọc. `tong_gia` và `tong_con_lai` đã có.
- Vòng lặp tổng ở router dòng 243–249 mở rộng để cộng thêm theo nhóm. Đẩy phần cộng xuống service nếu router đang tự cộng: router chỉ điều phối.

- [ ] **Step 1: Test hỏng.**
  - Dựng 2 TSCĐ và 3 CCDC (một CCDC đã khấu hao hết).
  - `GET /api/tai-san?limit=2&offset=0` (mặc định `nhom_theo=loai`) phải trả 2 dòng đầu đều là TSCĐ.
  - `nhom` có 2 phần tử: `so` là 2 và 3; `nguyen_gia` của nhóm bằng tổng nhóm.
  - `muc_thang_nay` của CCDC đã hết khấu hao là 0.
  - `tong_muc_thang` bằng Σ `muc_thang_nay` của cả 5.
  - `nhom_theo=khong` cho `nhom == []`.
  - Dựng dữ liệu theo khuôn `backend/tests/test_tai_san_api.py`.
- [ ] **Step 2:** chạy, phải FAIL.
- [ ] **Step 3:** cài đặt.
- [ ] **Step 4:** chạy `python -m pytest tests/test_tai_san_nhom.py tests/test_tai_san_api.py tests/test_loc_danh_sach_tai_san_nhat_ky.py -q`. Expected: PASS. Nếu test cũ giả định thứ tự theo `ma` thì truyền `nhom_theo=khong` trong test đó, đừng sửa kỳ vọng số.
- [ ] **Step 5:** cập nhật type ở `frontend/src/api/taiSan.ts`, rồi chạy `npx tsc --noEmit -p .`.

---

## Task 5: Phiếu chi: danh sách A và ngăn kiểu 3

**Phụ thuộc:** Task 1, Task 2.

**Files:**
- Modify: `frontend/src/pages/ke-toan/phieu-chi/PaymentVouchersPage.tsx`
- Modify: `frontend/src/pages/ke-toan/phieu-chi/components/VouchersTable.tsx`
- Modify: `frontend/src/pages/ke-toan/phieu-chi/components/VouchersDrawer.tsx`
- Modify: `frontend/src/pages/ke-toan/phieu-chi/shared/list-constants.ts` (`nguonPhieu`: thêm nhãn "Cọc đơn mua")
- Tests sửa theo: `phieu-chi/components/VouchersTable.test.tsx`, `phieu-chi/components/VouchersDrawer.test.tsx`, `phieu-chi/PaymentVouchersPage.test.tsx`

### Trang (mockup `phieuA('pc')`)

- **Đầu trang:** thay `header.kt-ph` + `TheLoc` + `div.kt-tb` bằng MỘT hàng `.kt-dau-gon`, theo thứ tự:
  1. `<h1>{VOUCHER_PAGE_LABEL}</h1>`
  2. `DaiTab`
  3. `<span className="kt-dau-gon__gian" />`
  4. ô tìm `.kt-tim`. Giữ `aria-label="Tìm phiếu chi"`, placeholder "Tìm số phiếu, người nhận, lý do, mã đơn".
  5. `ThanhLoc`
  6. nút "Lập phiếu chi" (`kt-btn kt-btn--chinh`, chỉ khi `coLap`)
- Bỏ `span.kt-tb__dem`, vì số phiếu đã ở tab "Tất cả" và ở chân bảng.
- **Các mục của `DaiTab`** (lấy số từ `sp.soThe`):
  - `tat_ca` "Tất cả" (`tat_ca`)
  - `xong` "Đã chi" chấm xanh (`xong`)
  - `thieu` "Thiếu chứng từ gốc" chấm amber (`thieu_chung_tu`)
  - `gc` "Gia công chờ chi" chấm amber, số là `gc?.length`. Có `an: (gc?.length ?? 0) === 0 && the !== "gc"`, tức không có việc thì ẩn.
  - `da_huy` "Đã hủy" chấm xám (`da_huy`)
- `theLocSo` / `TheLoc` không còn dùng ở trang này. Đừng xoá chúng nếu nơi khác còn import. Kiểm bằng `grep -rn "theLocSo\|shared/TheLoc" frontend/src`; hết người dùng thì xoá luôn hàm và tệp, cùng test của nó.
- Điều kiện `dkTrangThaiPhieu` trong `ThanhLoc` hiện lấy `muc` của thẻ lọc. Dựng lại từ mảng mục của `DaiTab`, bỏ mục `gc`, giữ nguyên hành vi lọc.

### Bảng (mockup cột `[82, 104, 288, *, 248, 114, 104, 142, 104]`)

- `table.kt-g` bên trong `div.kt-bang`.
- 9 cột:

  | Cột | Rộng | Nội dung |
  |---|---|---|
  | Số phiếu | 82 | `soPhieu(row)` |
  | Ngày chi | 104 | `ngay(voucher_date)` |
  | Người nhận tiền | 288 | `<span className="kt-g__ten" title>` với `supplier_name` |
  | Lý do chi | * | `kt-g__mo` + `title`, nội dung `content` |
  | Chi theo | 248 | `TheNho(nhãn)` + mã; mã là nút `kt-lk` khi là đơn mua và có `onMoDonMua`, không thì chữ thường |
  | Hình thức | 114 | `VOUCHER_METHOD_LABELS[voucher_type]` |
  | Số tiền | 104 | `kt-g__so`, `vietSo(amount_vnd)`, không có " đ" |
  | Ghi chú | 142 | xem dưới |
  | Ngày tạo | 104 | `kt-g__mo`, `title={ngayGio}` |

  - Số tiền khi ngoại tệ: thêm `title` "USD 1.200 tỷ giá 25.400".
  - Nhãn Chi theo:
    - Đơn mua, hoặc Cọc đơn mua khi `payment_stage === "advance"`, kèm `purchase_request_code`;
    - Gia công, kèm mã lệnh;
    - Tạm ứng lương, kèm mã;
    - Khác.
  - Ghi chú:
    - đã hủy thì chip `kt-tt kt-tt--xam` "Đã hủy";
    - đã chi mà `attachment_count === 0` thì `<span className="kt-ghi-chu--thieu">Thiếu chứng từ gốc</span>`;
    - còn lại để trống.
- Dòng: giữ `lopDong`, `tabIndex`, `onClick`, `diChuyen`. Bỏ cột mũi tên.
- **Dòng Cộng cuối `tbody`:** `<tr className="kt-g__cong">`
  - `<td colSpan={6}>`: "Cộng {the_loc.xong} phiếu đã chi", kèm `<span className="kt-g__mo3">không tính phiếu đã hủy</span>` cách 8px.
  - `<td className="kt-g__so">{vietSo(tongTien)}</td>`, rồi 2 ô trống.
  - Chỉ vẽ khi `tongTien != null`.
  - Dòng Cộng KHÔNG có `kt-dong`, nên không nhận phím và không mở ngăn. Test bàn phím lọc `tr.kt-dong`.
- `TheDienThoai` và `PhanTrangDayDu` giữ nguyên.
- Truyền vào bảng: `tongTien={sp.tongTien}` và `soXong={sp.soThe?.xong ?? 0}`.

### Ngăn (mockup `nganPhieuA('pc')` kiểu 3)

- **Vỏ `NganPhai`:**
  - `duongDan={<DuongDanPhieu loai="Phiếu chi" ma={soPhieu(phieu)} />}`, nút chép sẽ chép số phiếu.
  - `tieuDe={<span className="kt-ngan__soLon">{tien(phieu.amount_vnd)}</span>}`.
  - `the` = chip trạng thái + `<span className="kt-ngan__chu">{amountInWords(amount_vnd)}</span>`. Ngoại tệ thì thay chữ bằng `TheNho("USD 1.200")` + "tỷ giá …", giống `SoLonPhieu`.
  - `hanhDong`: giữ In phiếu, In bảng kê, menu Hủy phiếu.
  - Bỏ prop `bienLai`, bỏ `BienLaiPhieu` khỏi ngăn này. Nếu không còn ai dùng `BienLaiPhieu` sau Task 6 thì xoá ở Task 6.
- **Tabs:** `tt` "Chi tiết", `ct` "Chứng từ gốc", `ls` "Lịch sử" (`dem`). Tab "Chứng từ gốc":
  - có tệp: `dem: tep.length`;
  - không tệp và phiếu đã chi: nhãn đổi thành "Chứng từ gốc" + `<span class="kt-ghi-chu--thieu">chưa có</span>`.
  - Muốn vậy, đổi `TabNgan.nhan` của `NganPhai` sang `ReactNode`. Sửa type ở `NganPhai.tsx`, đây là thay đổi nhỏ trong Task này.
- **`cot` = `RayThuocTinh`**, theo thứ tự:
  1. Người nhận tiền: `beneficiary_account_holder` khi chuyển khoản, `cash_recipient_name` khi tiền mặt, thiếu thì `supplier_name`.
  2. Hình thức
  3. Ngày chi
  4. Từ tài khoản (chỉ chuyển khoản): `Cum[ngân hàng + số, TheNho(chi nhánh)]`
  5. Tới tài khoản (chỉ chuyển khoản): giống trên
  6. Chủ tài khoản nhận: `beneficiary_account_holder`
  7. Địa chỉ người nhận / CCCD (chỉ tiền mặt, nếu có)
  8. Đơn mua (nút `kt-lk` khi có quyền)
  9. Yêu cầu mua: các mã, nút khi có `onMoYeuCau`
  10. Hoá đơn (+ ngày)
  11. Số hợp đồng
  12. Mã giao dịch ngân hàng
  13. Người lập: `Cum[tên, TheNho(ngayGio)]`
  14. Mã hệ thống: `code`
  15. Ghi chú
- **Thân ngăn (`children`), tab `tt`:**
  - giữ `BangDaHuy`, khung lỗi in, `KhungHuyPhieu`;
  - dòng `<div className="kt-ngan__muc">Lý do chi</div><p className="kt-ngan__ly">{content}</p>`;
  - khối đã thu lại (`coThuLai`), giữ nguyên;
  - khối đợt giao, chỉ khi `source_type === "purchase_request"`. Thay `kt-hop` + `TienDot` bằng:
    - Tiêu đề `.kt-ngan__muc`: "Trả cho đợt giao", hoặc "Đặt cọc cho đơn mua" nếu `advance`, kèm nút "Mở đơn mua" bên phải.
    - Đặt cọc: một dòng chữ "Phiếu đặt cọc không gắn đợt giao. Cọc trừ dần vào công nợ của cả đơn."
    - Không theo đợt: "Đơn không theo dõi theo đợt giao."
    - Có đợt: bảng `div.kt-bang > table.kt-g`, cột `[52, 104, *, 108, 74, 100, 100, 104]`: Đợt | Hoá đơn | Hàng | Giá trị đợt | Trừ cọc | Trả trước đó | Phiếu này | Còn nợ.
      - Ô Hàng: `white-space: normal` (style inline `{ whiteSpace: "normal", lineHeight: "24px" }`), các `TheNho(item_name)`.
      - Trả trước đó và Còn nợ dùng `phieu.truoc_do` / `phieu.con_no_sau` từ Task 2. `null` thì hiện "–".
      - Số 0 hiện "–", màu `kt-g__mo3`.
      - Giá trị đợt / Trừ cọc lấy từ `dot.amount` / `dot.coc_bu` như cũ (cần quyền xem đơn mua). Không có `dot` thì hai ô "–".
  - Bỏ `LuoiThongTin` khỏi ngăn này, vì mọi ô đã lên cột phải.
- Tab `ct` và `ls` giữ nguyên.

- [ ] **Step 1: Sửa test trước theo cấu trúc mới (hỏng).**
  - `VouchersTable.test.tsx`:
    - Tiêu đề cột đúng 9 nhãn trên.
    - Dòng 1 có "PC00018" (đặt `doc_no` trong dữ liệu mẫu).
    - Phiếu cọc hiện "Cọc đơn mua" trong `kt-the`.
    - Phiếu thiếu tệp có "Thiếu chứng từ gốc".
    - Phiếu hủy có class `kt-da-huy`, chip "Đã hủy", không có "Thiếu chứng từ gốc".
    - Dòng Cộng có "Cộng 2 phiếu đã chi" và tổng số.
    - Vẫn không có "·" / "•" / ", " trong ô.
    - Test bàn phím lấy `container.querySelectorAll("tr.kt-dong")`.
  - `VouchersDrawer.test.tsx`:
    - Có `complementary` "Thuộc tính" chứa "Người nhận tiền" và "Mã hệ thống".
    - Bảng đợt có cột "Trả trước đó".
    - Giữ test "Yêu cầu mua" là nút / không nút.
  - `PaymentVouchersPage.test.tsx`:
    - Nút "Tất cả" có số 7 (giờ trong `DaiTab`).
    - "Gia công chờ chi" không hiện khi API gia công trả `[]`.
    - Giữ test tham số API.
- [ ] **Step 2:** `cd frontend && npx vitest run src/pages/ke-toan/phieu-chi`. Expected: FAIL.
- [ ] **Step 3:** cài đặt theo mô tả trên.
- [ ] **Step 4:** `npx vitest run src/pages/ke-toan/phieu-chi src/pages/ke-toan/shared && npx tsc --noEmit -p .`. Expected: PASS.

---

## Task 6: Phiếu thu: danh sách A và ngăn kiểu 3

**Phụ thuộc:** Task 1, Task 2, Task 5 (dùng lại cách làm, KHÔNG sửa tệp phiếu chi).

**Files:**
- Modify: `frontend/src/pages/ke-toan/phieu-thu/PaymentReceiptsPage.tsx`
- Modify: `frontend/src/pages/ke-toan/phieu-thu/components/ReceiptsTable.tsx`
- Modify: `frontend/src/pages/ke-toan/phieu-thu/components/ReceiptsDrawer.tsx`
- Modify: `frontend/src/pages/ke-toan/phieu-thu/shared/constants.ts` (`SOURCE_LABELS`)
- Modify: `frontend/src/pages/ke-toan/phieu-thu/shared/loc.ts` (`NGUON_LUA_CHON` đổi nhãn)
- Tests: `phieu-thu/components/ReceiptsTable.test.tsx`, `phieu-thu/components/ReceiptsDrawer.test.tsx`, `phieu-thu/PaymentReceiptsPage.test.tsx`

### Trang và bảng

Làm đối xứng Task 5, với các khác biệt sau:

- **`DaiTab`:**
  - `tat_ca`
  - `xong` "Đã thu" (xanh)
  - `cho` "Chờ thu" (amber), với `an: !(soThe?.cho > 0) && the !== "cho"`. Giữ cơ chế tự về `tat_ca` đang có.
  - `thieu` "Thiếu chứng từ gốc" (amber)
  - `da_huy` "Đã hủy" (xám)
- **Placeholder ô tìm:** "Tìm số phiếu, người nộp, số hoá đơn".
- **Cột:** Số phiếu | Ngày thu | Người nộp tiền (`payer_name`) | Lý do nộp (`content`) | Thu theo | Hình thức | Số tiền | Ghi chú | Ngày tạo. Độ rộng `[82, 104, 312, *, 206, 114, 104, 142, 104]`.
- **Thu theo:**

  | `source_type` | Nhãn | Mã kèm theo |
  |---|---|---|
  | sales_invoice | Hoá đơn | số hoá đơn |
  | order_deposit | Cọc đơn bán | `order_code` |
  | purchase_refund | Thu lại tiền chi | `payment_voucher_code` |
  | other | Khác | |

  Mã giữ hành vi bấm `moNguon` đang có.
- **Ghi chú:**
  - đã hủy: chip "Đã hủy";
  - `waiting_receipt`: chip `kt-tt--amber` "Chờ thu";
  - đã thu thiếu tệp: "Thiếu chứng từ gốc";
  - còn lại để trống.
- **Dòng Cộng:** "Cộng {the_loc.xong} phiếu đã thu" + "không tính phiếu đã hủy", tổng là `tongTien`.

### Ngăn

- **Số liệu:** dùng `api.accounting.receipt(token, id)` từ Task 2 để nạp bản mới nhất. Nạp lúc mở, khi `eventTick` đổi và sau mỗi thao tác, theo khuôn `VouchersDrawer`. Lấy `truoc_do` / `con_no_sau` từ đó.
- **Đầu ngăn:** giống phiếu chi. Số tiền làm tiêu đề, chip, chữ số tiền, `DuongDanPhieu` với `soPhieu`. `hanhDong` giữ:
  - Xác nhận đã thu (chỉ phiếu `waiting_receipt`)
  - Sửa
  - In phiếu
  - menu Hủy
- **Tabs:** Chi tiết | Chứng từ gốc ("chưa có" khi thiếu và đã thu) | Lịch sử.
- **`cot`:**
  1. Người nộp tiền
  2. Hình thức
  3. Ngày thu
  4. Vào tài khoản (`company_bank_name` + số + `TheNho(chi nhánh)`)
  5. Mã giao dịch (`bank_reference`)
  6. Đơn bán (`order_code`, nút nếu đang có cách mở)
  7. Phiếu chi gốc (nếu purchase_refund)
  8. Người lập (+ giờ)
  9. Xác nhận đã thu: CHỈ hiện khi `received_by_name` khác `created_by_name`, hoặc `received_at` cách `created_at` hơn 60 giây (cùng ngưỡng `TabLichSu`)
  10. Mã hệ thống
  11. Ghi chú
- **Thân, tab `tt`:**
  - `BangDaHuy`, `KhungXacNhanDaThu`, `KhungHuyPhieu` giữ như cũ;
  - dòng "Lý do nộp" + nội dung;
  - khối "Áp vào hoá đơn" khi có hoá đơn: tiêu đề `.kt-ngan__muc` kèm nút "Mở công nợ khách này" (giữ hành vi đang có). Bảng `kt-g` cột `[*, 104, 124, 92, 104, 116, 124]`: Hoá đơn (ký hiệu + số) | Ngày | Giá trị | Trừ cọc | Thu trước đó | Phiếu này | Còn nợ.
    - Giá trị / Trừ cọc lấy từ hoá đơn đang nạp (`salesInvoices`).
    - Thu trước đó / Còn nợ lấy `truoc_do` / `con_no_sau`.
  - Bỏ `LuoiThongTin`, `BienLaiPhieu`.
- **Dọn:** sau Task 5 và 6, nếu `BienLaiPhieu`, `LuoiThongTin`, `TienDot` trong `shared/NganPhieu.tsx` không còn ai import (kiểm bằng `grep -rn`), xoá chúng và CSS `kt-bl*` / `kt-ltt*` / `kt-tien-dot` không còn dùng.

- [ ] **Step 1:** sửa ba test cho đúng cấu trúc mới:
  - tiêu đề cột;
  - nhãn "Hoá đơn" / "Cọc đơn bán" / "Khác" / "Thu lại tiền chi";
  - "Thiếu chứng từ gốc";
  - "Chờ thu" là chip ở Ghi chú;
  - `complementary` "Thuộc tính";
  - cột "Thu trước đó";
  - "Xác nhận đã thu" không hiện ở cột phải khi cùng người cùng phút;
  - tab "Chờ thu" chỉ có khi `cho > 0`.

  Chạy test, phải FAIL.
- [ ] **Step 2:** cài đặt.
- [ ] **Step 3:** `npx vitest run src/pages/ke-toan/phieu-thu src/pages/ke-toan/phieu-chi src/pages/ke-toan/shared && npx tsc --noEmit -p .`. Expected: PASS.

---

## Task 7: Công nợ phải trả / phải thu: danh sách A (hai bộ cột)

**Phụ thuộc:** Task 1, Task 3.

**Files:**
- Modify: `frontend/src/pages/ke-toan/shared/ThanTrangCongNo.tsx` (thân chung của hai màn)
- Modify: `frontend/src/pages/ke-toan/cong-no-phai-tra/AccountingPayablesPage.tsx`
- Modify: `frontend/src/pages/ke-toan/cong-no-phai-thu/AccountingReceivablesPage.tsx` (chỉ phần `CAU_HINH`: nhãn)
- Delete nếu hết người dùng: `frontend/src/pages/ke-toan/shared/TongQuanCongNo.tsx` và `TongQuanCongNo.test.tsx`
- Tests: `cong-no-phai-tra/AccountingPayablesPage.test.tsx`, `cong-no-phai-thu/AccountingReceivablesPage.test.tsx`

### Đầu trang (mockup `cnA`)

- **Hàng 1, `.kt-dau-gon`:**
  1. h1
  2. `DaiTab`: Tất cả, Quá hạn (đỏ), Vượt hạn mức (cam/amber). Số lấy từ `the_loc` đang có.
  3. gian
  4. ô tìm. Placeholder "Tìm nhà cung cấp, kể cả đã trả hết" / "Tìm khách hàng, kể cả đã thu hết".
  5. `ThanhLoc`
- **Hàng 2:**
  - trái: chữ mờ "Còn nợ tới {ngày as_of}";
  - phải: "Xem cột" + nhóm hai nút `.kt-dai-tab`, "Tuổi nợ" | "Trong kỳ và liên hệ".
  - Lựa chọn nhớ ở `localStorage` khoá `kt-cong-no-cot`, bọc try/catch.
- **Bỏ `TongQuanCongNo`.** Lọc theo mốc tuổi nợ vẫn còn trong `ThanhLoc` (điều kiện Tuổi nợ), nên không mất chức năng.

### Bảng, bộ cột "Tuổi nợ"

- Hai hàng tiêu đề:

  | Cột | Rộng | Ghi chú |
  |---|---|---|
  | Đối tác | * | "Nhà cung cấp" / "Khách hàng", rowSpan 2 |
  | Đợt / Hoá đơn | 56 / 72 | rowSpan 2 |
  | Còn nợ | 120 | |
  | Chưa tới hạn | 120 | |
  | "Quá hạn, theo số ngày trễ" | colSpan 5 | hàng 2: `tr.kt-g__t2` gồm 1–7, 8–15, 16–30, 31–60, Trên 60, mỗi ô 96 |
  | Hạn sớm nhất | 186 | |
  | Hạn mức | 84 | |
  | Đã dùng | 76 | |
- **Dòng Cộng ở ĐẦU `tbody`** (`kt-g__cong`), từ `tong_loc`:
  - "Cộng {so_doi_tac} {nhà cung cấp|khách hàng}"
  - `so_khoan`, `con_no`
  - 6 ô aging; các ô quá hạn > 0 màu `kt-g__do`, số 0 hiện "–"
  - ô hạn: "quá hạn {vietSo(qua_han)}" màu mờ
  - 2 ô trống
- **Dòng đối tác:**
  - tên (`kt-g__ten`, `title`)
  - số khoản (mờ)
  - còn nợ
  - 6 ô aging (đỏ khi > 0 ở mốc quá hạn, "–" khi 0)
  - Hạn sớm nhất: ngày + `<span>` "trễ N ngày" (đỏ) hoặc "còn N ngày" (mờ), tính từ `han_gan_nhat` và `as_of` như `ConHan` đang làm; không có hạn thì "chưa đặt hạn nợ" mờ
  - Hạn mức: `tr()` rút gọn "100 tr", tách hàm `trieu(n)` trong `dinhDang.ts`: ≥ 1.000.000 thì `(n/1e6)` tối đa 1 chữ số thập phân + " tr"; 0 thì "chưa đặt" mờ
  - Đã dùng: `Math.round(con_no / credit_limit * 100)` + "%"; > 100 đỏ, > 80 amber; không hạn mức thì "–"
- Bấm dòng mở ngăn như cũ. Sắp xếp ở máy chủ giữ cho tiêu đề Còn nợ và Hạn sớm nhất (nút trong `th`).

### Bảng, bộ cột "Trong kỳ và liên hệ"

- Cột:
  - Đối tác *
  - Đợt / Hoá đơn 70
  - Còn nợ 120
  - Mua / Bán trong kỳ 124
  - Trả / Thu trong kỳ 124
  - Trả / Thu gần nhất 130: ngày, hoặc "chưa trả lần nào" / "chưa thu lần nào" mờ
  - Số tiền 112: số của lần gần nhất
  - Cho nợ 86: "N ngày" hoặc "chưa đặt"
  - [Phụ trách 140, chỉ phải thu]
  - Người liên hệ 150
  - Điện thoại 120
- Dòng Cộng đầu bảng lấy `tong_loc`, cộng hai cột trong kỳ.
- Sắp xếp "gần nhất" giữ ở tiêu đề cột.

### Khác

- `PhanTrangDayDu` giữ nguyên.
- Thẻ điện thoại giữ nguyên.
- Đổi chữ "khoản" thành "đợt" / "hoá đơn" mọi nơi trong màn.

- [ ] **Step 1:** sửa hai test trang, bỏ các khẳng định về `.kt-tq` / "+21% so cùng kỳ" / "Mua thêm". Khẳng định mới:
  - columnheader "Hạn sớm nhất";
  - dòng Cộng "Cộng 2 nhà cung cấp";
  - ô quá hạn "–" khi 0;
  - "Đã dùng" ra "121%" đỏ;
  - đổi sang "Trong kỳ và liên hệ" thì có columnheader "Mua trong kỳ" và "Người liên hệ";
  - "chưa đặt" ở Hạn mức.

  Chạy test, phải FAIL.
- [ ] **Step 2:** cài đặt.
- [ ] **Step 3:** `npx vitest run src/pages/ke-toan/cong-no-phai-tra src/pages/ke-toan/cong-no-phai-thu src/pages/ke-toan/shared && npx tsc --noEmit -p .`. Expected: PASS.

---

## Task 8: Ngăn nhà cung cấp / khách hàng: kiểu 3

**Phụ thuộc:** Task 1, Task 3, Task 7 (làm tuần tự sau Task 7 vì cùng thư mục shared).

**Files:**
- Modify: `frontend/src/pages/ke-toan/shared/NganCongNo.tsx`
- Modify: `frontend/src/pages/ke-toan/cong-no-phai-tra/components/PayablesDrawer.tsx`
- Modify: `frontend/src/pages/ke-toan/cong-no-phai-tra/components/DotConNoBlock.tsx`
- Modify: `frontend/src/pages/ke-toan/cong-no-phai-thu/components/ReceivablesDrawer.tsx`
- Modify: `frontend/src/pages/ke-toan/cong-no-phai-thu/components/HoaDonConNoBlock.tsx`
- Delete nếu hết người dùng: `frontend/src/pages/ke-toan/shared/TomTatDoiTac.tsx`
- Tests: `PayablesDrawer.test.tsx`, `ReceivablesDrawer.test.tsx`

### Đầu ngăn

- Giữ đường dẫn, tiêu đề tên đối tác + `TheNho(mã)`, nút In sao kê, nút Hồ sơ.
- Bỏ `TomTatDoiTac` (dải số + thanh tuổi nợ + chú giải bấm lọc).
- Tabs Còn nợ (dem) | Sao kê | Lịch sử giữ nguyên.

### `cot` = `RayThuocTinh`

1. "Còn nợ tới {ngày as_of}": số 18px (`<span style={{ fontSize: 18 }}>`).
2. Quá hạn: đỏ khi > 0; = 0 thì "không có".
3. Hạn sớm nhất: tính ở client = `due_date` nhỏ nhất trong các item còn nợ > 0. Có thì hiện ngày + "trễ N ngày" đỏ / "còn N ngày"; không có thì BỎ mục.
4. Hạn mức + Cho nợ:
   - Có ít nhất một trong hai:
     - Hạn mức: số + "đã dùng N%", màu theo ngưỡng như Task 7. Không có thì "chưa đặt".
     - Cho nợ: "N ngày sau mỗi đợt giao" / "N ngày sau mỗi hoá đơn". Không có thì "chưa đặt".
   - Thiếu cả hai: MỘT mục "Hạn mức và cho nợ" = "chưa đặt" + nút `kt-lk` "Đặt trong hồ sơ", gọi đúng hành vi của nút Hồ sơ.
5. Người liên hệ: tên + số điện thoại, lấy từ `lien_he_ten` / `lien_he_sdt` của chi tiết (Task 3).
6. Phải trả: "Tài khoản nhận tiền" (`tk_nhan`). Phải thu: "Phụ trách" (`phu_trach`).

### Thân, tab Còn nợ

**Bỏ "Lọc theo tuổi nợ" ở đầu ngăn.** Mở ngăn với bucket "overdue" từ danh sách vẫn phải lọc, nếu luồng đó đang có: giữ `TheLocNo`.

**Phải trả: một lưới `kt-g` gộp mọi đơn**, thay mỗi đơn một bảng.
- Hàng đầu `.kt-ngan__muc`:
  - trái: "Nhóm theo đơn mua, tick đợt muốn trả";
  - phải: nhóm 2 nút "Đơn mua" | "Hạn trả".
- Bấm "Hạn trả" thì bỏ dòng nhóm, xếp đợt theo `due_date` tăng dần, `null` cuối.
- Cột `[36, 80, 104, 182, 110, 92, 100, 112]`: ☐ | Đợt | Hoá đơn | Hạn trả | Giá trị | Trừ cọc | Đã trả | Còn nợ.
- Dòng nhóm `kt-g__nhom`:
  - ô ☐ chọn cả đơn (checked khi mọi đợt của đơn đều chọn; `indeterminate` khi chọn một phần);
  - mã đơn là nút `kt-lk`, kèm "N đợt" mờ;
  - ô trống;
  - 4 ô tổng của đơn.
- Dòng đợt:
  - ☐ chọn đợt;
  - "Đợt N";
  - số hoá đơn, hoặc chữ mờ "chưa có" nếu thiếu;
  - Hạn trả: ngày + trễ/còn, hoặc "chưa đặt hạn";
  - các số.
  - Giữ bấm dòng mở `HangCuaDot` như cũ, vẽ thành dòng `<tr>` con `colSpan` toàn bảng.
- Dòng Cộng cuối: "Cộng N đợt" + các tổng.
- Cọc chưa trừ của đơn (Cọc / Đã trừ / Còn) đang ở đầu mỗi section: đưa thành chữ mờ trong ô tên dòng nhóm, "cọc còn X". Chỉ khi còn > 0.
- Thanh chọn ở chân ngăn: "Đã chọn N đợt {tiền}" | Bỏ chọn | nút chính "Lập phiếu chi trả". Hành vi `BatchPaymentDialog` giữ nguyên.

**Phải thu: một lưới `kt-g`, nhóm theo đơn bán.**
- Hàng đầu: "Nhóm theo đơn bán" + nhóm "Đơn bán" | "Hạn thu".
- Cột `[142, 100, 136, 104, 92, 100, 112, 92]`: Hoá đơn (ký hiệu + số) | Ngày | Hạn thu | Giá trị | Trừ cọc | Đã thu | Còn nợ | (ô nút).
- Trừ cọc là `deposit_offset_amount`, Đã thu là `direct_received_amount` (tách cột, không gộp).
- Dòng nhóm: mã đơn + "N hoá đơn" + tổng.
- Mỗi dòng hoá đơn còn nợ có nút `kt-btn kt-btn--nho` "Thu", với `aria-label="Thu tiền hoá đơn số X"`. Mở `ThuTienHoaDon` như cũ.
  - KHÔNG làm tick nhiều hoá đơn: chưa có máy chủ thu nhiều hoá đơn một lượt. Ghi chú này vào đầu tệp.
- Khách chưa đặt cho nợ (`payment_term_days` null) thì cột Hạn thu hiện "–" mờ, không lặp chữ "chưa đặt hạn nợ", vì cột phải đã nói.
- Dòng Cộng cuối: "Cộng N hoá đơn".

- [ ] **Step 1:** sửa hai test ngăn:
  - bỏ khẳng định `.kt-ndt__lon` / "Lọc theo tuổi nợ" / checkbox trong `th`;
  - khẳng định `complementary` "Thuộc tính" có "Còn nợ tới", "Hạn sớm nhất", "Người liên hệ";
  - tick dòng nhóm chọn cả đơn → "Đã chọn 2 đợt";
  - nút "Lập phiếu chi trả";
  - phải thu có columnheader "Trừ cọc" và "Đã thu" tách nhau;
  - nút "Thu tiền hoá đơn số X" vẫn mở form;
  - khách thiếu cả hạn mức và cho nợ thì có "Đặt trong hồ sơ".

  Chạy test, phải FAIL.
- [ ] **Step 2:** cài đặt.
- [ ] **Step 3:** `npx vitest run src/pages/ke-toan && npx tsc --noEmit -p .`. Expected: PASS.

---

## Task 9: Tài sản & CCDC: danh sách A

**Phụ thuộc:** Task 1 (lấy lớp `.kt-g` qua import `../ke-toan/ke-toan.css`, hoặc chép khối lưới vào `tai-san.css` với tiền tố `ts-g` nếu màn không nạp CSS kế toán; chọn cách ít đụng nhất), Task 4.

**Files:**
- Modify: `frontend/src/pages/tai-san/TaiSanPage.tsx`: chuyển tab "Tài sản | Khấu hao từng tháng" thành nhóm nút cạnh tiêu đề. Giữ chỗ phiên khác đã xoá `rc__sub`.
- Modify: `frontend/src/pages/tai-san/DanhSachView.tsx`
- Modify: `frontend/src/pages/tai-san/tai-san.css`
- Test (mới): `frontend/src/pages/tai-san/DanhSachView.test.tsx`

### Bố cục (mockup `tsA` + `tsTool`)

- **Hàng 1:**
  - h1 "Tài sản và công cụ dụng cụ";
  - nhóm nút "Tài sản" | "Khấu hao từng tháng";
  - gian;
  - nút tách "Thêm tài sản" (`NutThem` giữ nguyên).
- **Hàng 2:**
  - `DaiTab` lấy số từ `dem_trang_thai`: Đang dùng (xanh), Đã thôi dùng (xám), Tất cả. Ánh xạ vào điều kiện `trang_thai` của bộ lọc đang có: `dang_dung` / `da_giam` / bỏ trống.
  - ô tìm;
  - `ThanhLoc`;
  - gian;
  - "Nhóm theo" + nhóm nút "Loại" | "Bộ phận" | "Không nhóm". Gửi `nhom_theo` lên máy chủ, ghi lên URL theo khuôn `useLocMan` đang dùng.
- **Bỏ dải 4 số `.ts-so`.**

### Bảng

- 11 cột `[86, *, 56, 150, 108, 120, 136, 128, 136, 120, 100]`:

  | Cột | Nội dung |
  |---|---|
  | Mã | mờ |
  | Tên | kèm badge "Đã thôi dùng" khi `da_giam` (chip xám); "Đã khấu hao hết" bỏ, vì ô Tháng này hiện "–" và Còn lại 0 đã nói |
  | SL | |
  | Bộ phận | |
  | Bắt đầu dùng | |
  | Khấu hao trong | số + `<span>tháng</span>` nhỏ mờ |
  | Giá mua | |
  | Đã khấu hao | |
  | Còn lại | |
  | "Tháng {MM/YYYY}" | tháng hiện tại, `muc_thang_nay`, 0 thì "–" |
  | Ngày tạo | mờ |
- Bỏ thẻ loại và "N cái" dưới tên, bỏ thanh tiến độ Còn lại.
- **Dòng nhóm `kt-g__nhom`**, từ `nhom` của máy chủ: chèn trước dòng đầu tiên của mỗi nhóm có mặt trong trang, so khoá nhóm của dòng (`loai` hoặc `bo_phan_ten`).
  - Ô 1–2 gộp: tên nhóm + "N mục" mờ.
  - 4 ô trống.
  - Giá mua, Đã khấu hao, Còn lại, Tháng của nhóm (số của cả nhóm theo bộ lọc, không chỉ trang).
  - 1 ô trống.
- **Dòng Cộng cuối:** "Cộng {tong} {đang dùng|đã thôi dùng|tài sản}" + `tong_gia`, `tong_hao_mon`, `tong_con_lai`, `tong_muc_thang`.
- Thẻ điện thoại `.ts-the-ds`, `PhanTrangDayDu`, các dialog giữ nguyên.

- [ ] **Step 1: Viết test hỏng.**
  - Render `DanhSachView` với api giả (`vi.mock("../../api/taiSan")` theo khuôn test khác trong repo), trả 2 dòng TSCĐ, `nhom` 2 phần tử.
  - Khẳng định:
    - columnheader "Tháng {MM/YYYY}" và "Khấu hao trong";
    - dòng nhóm "Tài sản cố định" có "2 mục";
    - dòng "Cộng";
    - không còn chữ "Tổng giá mua" của dải số cũ.
- [ ] **Step 2:** chạy, phải FAIL.
- [ ] **Step 3:** cài đặt.
- [ ] **Step 4:** `npx vitest run src/pages/tai-san && npx tsc --noEmit -p .`. Expected: PASS.

---

## Task 10: Rà cuối (người điều phối)

- [ ] Chạy đủ: `cd frontend && npx vitest run src/pages/ke-toan src/pages/tai-san && npx tsc --noEmit -p .`
- [ ] Chạy đủ: `cd backend && python -m pytest tests/test_phieu_truoc_do.py tests/test_cong_no_tong_loc.py tests/test_tai_san_nhom.py tests/test_tai_san_api.py tests/test_payables_api.py -q`
- [ ] Restart uvicorn. Mở 9 màn trên trình duyệt dev:
  - nhìn có cắt chữ, chồng chữ, chữ to bất thường không;
  - đo `scrollWidth > clientWidth` ở mọi ô có `title` và mọi ô số. Ô số KHÔNG được cắt.
- [ ] Cập nhật bộ nhớ `ke-toan-thu-chi-cong-no-ui-ux.md`.
- [ ] Báo chủ dự án. KHÔNG commit khi chưa được bảo.
