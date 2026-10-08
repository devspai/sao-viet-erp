/** Bảng Phiếu thu (khuôn lưới chung `lds-g`, đối xứng Phiếu chi): mười cột, mẩu thông tin
 *  không nối bằng "·" hay dấu phẩy, link nguồn mở đúng nơi (Hoá đơn → Công nợ phải thu, không phải
 *  đơn bán — lỗi 11), dòng Cộng cuối bảng, rỗng nói đúng câu mới. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { phieuThu } from "./phieuMau";
import { COT_PHIEU_THU, ReceiptsTable } from "./ReceiptsTable";

const ROWS = [
  phieuThu({
    id: 1, code: "PT-261005-K2M9", doc_no: "PT00013", payer_name: "Thực phẩm An Phát", receipt_method: "bank_transfer",
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
  phieuThu({
    id: 5, code: "PT-260820-OLD1", status: "waiting_receipt", source_type: "purchase_refund", payment_voucher_id: 9,
    payment_voucher_code: "UNC-260810-AB12", attachment_count: 0,
  }),
];

function ve(over: Partial<Parameters<typeof ReceiptsTable>[0]> = {}) {
  const props = {
    cot: COT_PHIEU_THU, rows: ROWS, loading: false, loi: null, onTaiLai: vi.fn(), dangXem: null, onMo: vi.fn(),
    coLoc: false, onBoLoc: vi.fn(), onLap: vi.fn(), trang: 1, size: 25, tong: ROWS.length, onTrang: vi.fn(), onSize: vi.fn(),
    moNguon: vi.fn(() => vi.fn()), tongTien: 72_450_000, soXong: 3, ...over,
  };
  const r = render(<ReceiptsTable {...props} />);
  return { ...props, container: r.container };
}

function chuTran(el: Element): string[] {
  const out: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent?.trim()) out.push(n.textContent);
  return out;
}

describe("ReceiptsTable", () => {
  it("mười cột đúng thứ tự: Trạng thái đứng sau Số tiền, Ghi chú cuối", () => {
    ve();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Số phiếu", "Ngày thu", "Người nộp tiền", "Lý do nộp", "Thu theo", "Hình thức", "Số tiền", "Trạng thái",
      "Ngày tạo", "Ghi chú",
    ]);
    expect(screen.getByRole("table")).toHaveClass("lds-g");
  });

  it("không nối mẩu bằng · • hay dấu phẩy; nhãn Thu theo là thẻ nhỏ; Trạng thái và Ghi chú nói đúng", () => {
    const { container } = ve({ moNguon: undefined });
    const bang = screen.getByRole("table");
    for (const t of chuTran(bang)) expect(t).not.toMatch(/[·•]|,\s/);
    const dong = container.querySelectorAll<HTMLElement>("tr.lds-dong");
    // Cột đầu là số in trên tờ phiếu; phiếu chưa có số thì mã hệ thống.
    expect(within(dong[0]).getByText("PT00013")).toBeInTheDocument();
    expect(within(dong[1]).getByText("PT-261004-R7VN")).toBeInTheDocument();
    expect(within(dong[0]).getByText("Thực phẩm An Phát")).toHaveAttribute("title", "Thực phẩm An Phát");
    expect(within(dong[0]).getByText("Chuyển khoản")).toBeInTheDocument();
    expect(within(dong[0]).getByText("Hoá đơn")).toHaveClass("lds-tag");
    expect(within(dong[0]).getByText("0001234")).toBeInTheDocument();
    // Ngoại tệ: số VND không kèm " đ", nguyên tệ + tỷ giá ở chữ nổi khi trỏ chuột.
    expect(within(dong[1]).getByText("38.100.000")).toHaveAttribute("title", "USD 1.500 tỷ giá 25.400");
    expect(within(dong[1]).getByText("Cọc đơn bán")).toHaveClass("lds-tag");
    expect(within(dong[1]).getByText("DH-0415")).toBeInTheDocument();
    expect(within(dong[2]).getByText("Khác")).toHaveClass("lds-tag");
    // Phiếu đã thu: chip xanh lá; thiếu chứng từ gốc nhắc bằng chữ vàng ở Ghi chú.
    expect(within(dong[0]).getByText("Đã thu")).toHaveClass("lds-chip", "lds-chip--la");
    expect(within(dong[2]).getByText("Thiếu chứng từ gốc")).toHaveClass("lds-vang");
    // Phiếu đã hủy: dòng mờ, chip "Đã hủy", không bị nhắc thiếu chứng từ.
    expect(dong[3]).toHaveClass("kt-da-huy");
    expect(within(dong[3]).getByText("Đã hủy")).toHaveClass("lds-chip", "lds-chip--xam");
    expect(within(dong[3]).queryByText("Thiếu chứng từ gốc")).toBeNull();
    // Phiếu cũ chờ thu: chip "Chờ thu" (màu cam, khác Thiếu chứng từ), chưa thu nên chưa đòi chứng từ.
    expect(within(dong[4]).getByText("Chờ thu")).toHaveClass("lds-chip", "lds-chip--cam");
    expect(within(dong[4]).queryByText("Thiếu chứng từ gốc")).toBeNull();
    expect(within(dong[4]).getByText("Thu lại tiền chi")).toHaveClass("lds-tag");
    expect(within(dong[4]).getByText("UNC-260810-AB12")).toBeInTheDocument();
    // Ô Thu theo hẹp: chữ nổi giữ đủ nhãn + mã khi mã bị cắt.
    expect(within(dong[4]).getByText("UNC-260810-AB12").closest("td")).toHaveAttribute("title", "Thu lại tiền chi UNC-260810-AB12");
    expect(within(dong[2]).getByText("Khác").closest("td")).toHaveAttribute("title", "Khác");
  });

  it("mã nguồn là nút khi mở được; bấm nút không mở ngăn phiếu", async () => {
    const mo = vi.fn();
    const p = ve({ moNguon: (r) => (r.source_type === "sales_invoice" ? mo : undefined) });
    const dong = p.container.querySelectorAll<HTMLElement>("tr.lds-dong");
    await userEvent.click(within(dong[0]).getByRole("button", { name: "0001234" }));
    expect(mo).toHaveBeenCalled();
    expect(p.onMo).not.toHaveBeenCalled();
    expect(within(dong[1]).queryByRole("button", { name: "DH-0415" })).toBeNull();
  });

  it("dòng Cộng cuối bảng: số phiếu đã thu + tổng tiền, không phải dòng mở được", () => {
    const { container } = ve();
    const cong = container.querySelector<HTMLElement>("tr.lds-cong")!;
    expect(cong).not.toHaveClass("lds-dong");
    expect(cong.parentElement!.lastElementChild).toBe(cong);
    expect(cong).toHaveTextContent("Cộng 3 phiếu đã thu");
    expect(within(cong).getByText("không tính phiếu đã hủy")).toBeInTheDocument();
    expect(within(cong).getByText("72.450.000")).toHaveClass("n");
  });

  it("thẻ không có phiếu đã thu (Chờ thu, Đã hủy) thì không vẽ dòng Cộng", () => {
    const { container } = ve({ soXong: null });
    expect(container.querySelector("tr.lds-cong")).toBeNull();
  });

  it("↑ ↓ chuyển dòng, Enter mở phiếu", () => {
    const { container, onMo } = ve();
    const dong = container.querySelectorAll<HTMLElement>("tr.lds-dong");
    dong[0].focus();
    fireEvent.keyDown(dong[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(dong[1]);
    fireEvent.keyDown(dong[1], { key: "Enter" });
    expect(onMo).toHaveBeenCalledWith(2);
  });

  it("rỗng: câu mới chỉ đường lập cọc và thu hoá đơn, kèm nút Lập phiếu thu", async () => {
    const p = ve({ rows: [], tong: 0 });
    expect(screen.getByText(/Chưa có phiếu thu nào trong kỳ này/)).toBeInTheDocument();
    expect(screen.getByText(/Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
    expect(p.onLap).toHaveBeenCalled();
  });
});
