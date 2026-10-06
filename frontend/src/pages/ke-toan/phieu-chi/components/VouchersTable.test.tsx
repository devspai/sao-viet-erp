/** Bảng Phiếu chi: mẩu thông tin không nối bằng "·" hay dấu phẩy, dòng đi được bằng bàn phím,
 *  rỗng có ba câu tách bạch. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { phieu } from "./phieuMau";
import { VouchersTable } from "./VouchersTable";

const ROWS = [
  phieu({
    id: 1, code: "UNC-260930-W4PB", supplier_name: "Máy in Hoà Phát", voucher_type: "bank_transfer",
    source_type: "purchase_request", purchase_request_code: "DMH-260920-9MKD", payment_stage: "final",
    amount: 1200, amount_vnd: 30_480_000, currency: "USD", exchange_rate: 25400, content: "Phụ tùng trục ép nhập khẩu",
  }),
  phieu({
    id: 2, code: "UNC-261003-Z8WE", supplier_name: "Mực in Đông Á", voucher_type: "bank_transfer",
    source_type: "purchase_request", purchase_request_code: "DMH-261002-K4P1", payment_stage: "advance",
    content: "Đặt cọc mực 4 màu", attachment_count: 0,
  }),
  phieu({ id: 3, code: "PC-261001-T5JC", status: "cancelled", supplier_name: "Kẽm CTP Phương Nam", attachment_count: 0 }),
];

function ve(over: Partial<Parameters<typeof VouchersTable>[0]> = {}) {
  const props = {
    rows: ROWS, loading: false, loi: null, onTaiLai: vi.fn(), dangXem: null, onMo: vi.fn(), coLoc: false,
    onBoLoc: vi.fn(), onLap: vi.fn(), trang: 1, size: 25, tong: ROWS.length, onTrang: vi.fn(), onSize: vi.fn(), ...over,
  };
  render(<VouchersTable {...props} />);
  return props;
}

/** Mọi đoạn chữ TRẦN (text node) trong vùng — dấu nối nằm giữa các mẩu thì phải lộ ra ở đây. */
function chuTran(el: Element): string[] {
  const out: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent?.trim()) out.push(n.textContent);
  return out;
}

describe("VouchersTable", () => {
  it("không nối mẩu thông tin bằng · • hay dấu phẩy; mẩu loại là thẻ nhỏ", () => {
    ve();
    const bang = screen.getByRole("table");
    for (const t of chuTran(bang)) expect(t).not.toMatch(/[·•]|,\s/);
    const dong = screen.getAllByRole("row").slice(1);
    // Ngoại tệ: thẻ [USD 1.200] cạnh chữ "tỷ giá 25.400", không gộp một chuỗi.
    const usd = within(dong[0]).getByText("USD 1.200");
    expect(usd).toHaveClass("kt-the");
    expect(within(dong[0]).getByText("tỷ giá 25.400")).not.toHaveClass("kt-the");
    expect(within(dong[0]).getByText("30.480.000 đ")).toBeInTheDocument();
    // Nguồn: loại + thẻ phụ "Đặt cọc", dưới là mã đơn.
    expect(within(dong[1]).getByText("Đặt cọc")).toHaveClass("kt-the");
    expect(within(dong[1]).getByText("Đơn mua")).toBeInTheDocument();
    expect(within(dong[1]).getByText("DMH-261002-K4P1")).toBeInTheDocument();
    expect(within(dong[1]).getByText("Thiếu chứng từ")).toBeInTheDocument();
    // Phiếu đã hủy không bị nhắc thiếu chứng từ.
    expect(within(dong[2]).queryByText("Thiếu chứng từ")).toBeNull();
    expect(dong[2]).toHaveClass("kt-da-huy");
    // Thẻ điện thoại cũng theo luật: ngày + thẻ nguồn, không dấu nối.
    const theDt = document.querySelector(".kt-the-dt")!;
    for (const t of chuTran(theDt)) expect(t).not.toMatch(/[·•]|,\s/);
  });

  it("↑ ↓ chuyển dòng, Enter mở phiếu", async () => {
    const p = ve();
    const dong = screen.getAllByRole("row").slice(1);
    dong[0].focus();
    fireEvent.keyDown(dong[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(dong[1]);
    fireEvent.keyDown(dong[1], { key: "Enter" });
    expect(p.onMo).toHaveBeenCalledWith(2);
    fireEvent.keyDown(dong[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(dong[0]);
    await userEvent.click(within(dong[2]).getByText("Kẽm CTP Phương Nam"));
    expect(p.onMo).toHaveBeenLastCalledWith(3);
  });

  it("ba câu rỗng: chưa có, lọc không ra, tải lỗi", async () => {
    const a = ve({ rows: [], tong: 0 });
    expect(screen.getByText("Chưa có phiếu chi nào trong kỳ này")).toBeInTheDocument();
    // Rust chỉ cho MỘT hành động chính (nút đầu trang) — nút ở trạng thái rỗng là nút phụ.
    expect(screen.getByRole("button", { name: "Lập phiếu chi" })).not.toHaveClass("kt-btn--chinh");
    await userEvent.click(screen.getByRole("button", { name: "Lập phiếu chi" }));
    expect(a.onLap).toHaveBeenCalled();
  });

  it("lọc không ra thì mời Bỏ lọc", async () => {
    const p = ve({ rows: [], tong: 0, coLoc: true });
    expect(screen.getByText("Không có phiếu nào khớp bộ lọc")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc" }));
    expect(p.onBoLoc).toHaveBeenCalled();
  });

  it("tải lỗi không nói 'chưa có'", () => {
    ve({ rows: [], tong: 0, loi: "Mất kết nối" });
    expect(screen.getByText(/Không tải được danh sách phiếu chi/)).toBeInTheDocument();
    expect(screen.queryByText("Chưa có phiếu chi nào trong kỳ này")).toBeNull();
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeInTheDocument();
  });
});
