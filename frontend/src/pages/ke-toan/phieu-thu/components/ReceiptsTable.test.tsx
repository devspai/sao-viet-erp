/** Bảng Phiếu thu (đặc tả PT-1): mẩu thông tin không nối bằng "·" hay dấu phẩy, link nguồn mở đúng
 *  nơi (Thu hoá đơn → Công nợ phải thu, không phải đơn bán — lỗi 11), rỗng nói đúng câu mới. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { phieuThu } from "./phieuMau";
import { ReceiptsTable } from "./ReceiptsTable";

const ROWS = [
  phieuThu({
    id: 1, code: "PT-261005-K2M9", payer_name: "Thực phẩm An Phát", receipt_method: "bank_transfer",
    source_type: "sales_invoice", sales_invoice_id: 7, sales_invoice_number: "0001234", order_id: 40,
    order_code: "DH-0412", customer_name: "Thực phẩm An Phát", amount: 32_000_000, amount_vnd: 32_000_000,
    content: "Thu hoá đơn 0001234 của đơn DH-0412",
  }),
  phieuThu({
    id: 2, code: "PT-261004-R7VN", payer_name: "Nhà sách Minh Tâm", source_type: "order_deposit",
    order_id: 41, order_code: "DH-0415", amount: 1500, amount_vnd: 38_100_000, currency: "USD", exchange_rate: 25400,
    content: "Cọc 30% đơn in sách tô màu",
  }),
  phieuThu({ id: 3, code: "PT-261003-C4EQ", attachment_count: 0 }),
  phieuThu({ id: 4, code: "PT-261001-F2AZ", status: "cancelled", attachment_count: 0, payer_name: "Nhà sách Minh Tâm" }),
];

function ve(over: Partial<Parameters<typeof ReceiptsTable>[0]> = {}) {
  const props = {
    rows: ROWS, loading: false, loi: null, onTaiLai: vi.fn(), dangXem: null, onMo: vi.fn(), coLoc: false,
    onBoLoc: vi.fn(), onLap: vi.fn(), trang: 1, size: 25, tong: ROWS.length, onTrang: vi.fn(), onSize: vi.fn(),
    moNguon: vi.fn(() => vi.fn()), ...over,
  };
  render(<ReceiptsTable {...props} />);
  return props;
}

function chuTran(el: Element): string[] {
  const out: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent?.trim()) out.push(n.textContent);
  return out;
}

describe("ReceiptsTable", () => {
  it("cột theo PT-1; không nối mẩu bằng · • hay dấu phẩy; ngoại tệ là thẻ nhỏ", () => {
    ve({ moNguon: undefined });
    const bang = screen.getByRole("table");
    expect(within(bang).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Thu của", "Số tiền", "Trạng thái", "Nguồn", "Ngày thu", "Ngày tạo", "Mã phiếu", "",
    ]);
    for (const t of chuTran(bang)) expect(t).not.toMatch(/[·•]|,\s/);
    const dong = screen.getAllByRole("row").slice(1);
    expect(within(dong[0]).getByText("Thực phẩm An Phát")).toHaveClass("kt-ten");
    expect(within(dong[0]).getByText("Chuyển khoản")).toBeInTheDocument();
    expect(within(dong[0]).getByText("Thu hoá đơn")).toBeInTheDocument();
    expect(within(dong[0]).getByText("0001234")).toBeInTheDocument();
    expect(within(dong[1]).getByText("USD 1.500")).toHaveClass("kt-the");
    expect(within(dong[1]).getByText("tỷ giá 25.400")).not.toHaveClass("kt-the");
    expect(within(dong[1]).getByText("Cọc đơn bán")).toBeInTheDocument();
    expect(within(dong[2]).getByText("Thiếu chứng từ")).toBeInTheDocument();
    expect(within(dong[2]).getByText("Thu khác")).toBeInTheDocument();
    expect(within(dong[3]).queryByText("Thiếu chứng từ")).toBeNull();
    expect(dong[3]).toHaveClass("kt-da-huy");
    expect(within(dong[3]).getByText("Đã hủy")).toHaveClass("kt-tt--xam");
    const theDt = document.querySelector(".kt-the-dt")!;
    for (const t of chuTran(theDt)) expect(t).not.toMatch(/[·•]|,\s/);
  });

  it("mã nguồn là link khi mở được; bấm link không mở ngăn phiếu", async () => {
    const mo = vi.fn();
    const p = ve({ moNguon: (r) => (r.source_type === "sales_invoice" ? mo : undefined) });
    const dong = screen.getAllByRole("row").slice(1);
    await userEvent.click(within(dong[0]).getByRole("button", { name: "0001234" }));
    expect(mo).toHaveBeenCalled();
    expect(p.onMo).not.toHaveBeenCalled();
    expect(within(dong[1]).queryByRole("button", { name: "DH-0415" })).toBeNull();
  });

  it("↑ ↓ chuyển dòng, Enter mở phiếu", () => {
    const p = ve();
    const dong = screen.getAllByRole("row").slice(1);
    dong[0].focus();
    fireEvent.keyDown(dong[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(dong[1]);
    fireEvent.keyDown(dong[1], { key: "Enter" });
    expect(p.onMo).toHaveBeenCalledWith(2);
  });

  it("rỗng: câu mới chỉ đường lập cọc và thu hoá đơn, kèm nút Lập phiếu thu", async () => {
    const p = ve({ rows: [], tong: 0 });
    expect(screen.getByText("Chưa có phiếu thu nào trong kỳ này")).toBeInTheDocument();
    expect(
      screen.getByText("Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu; khoản thu khác lập ở đây."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
    expect(p.onLap).toHaveBeenCalled();
  });
});
