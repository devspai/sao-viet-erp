/** Ngăn khách hàng (NPTh-2) + khung "Thu tiền" ngay dưới dòng hoá đơn (NPTh-3).
 *
 *  Khoá chặt: tóm tắt Còn nợ | Quá hạn | Hạn mức (còn được nợ + vạch) | Cho nợ; hai tab có số; mở từ
 *  danh sách đang lọc một mốc tuổi thì lọc sẵn hoá đơn theo `aging_bucket`; tab Đã thu cắt trang ở máy
 *  chủ, "Xem thêm" nối trang không trùng dòng; lập phiếu xong dòng hoá đơn đổi ngay + thông báo đáy;
 *  không nối mẩu thông tin bằng "·" / "•" / dấu phẩy.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReceivablesDetail, ReceivableReceiptRow } from "../../../../api/client";

const receivablesDetail = vi.fn();
const companyAccounts = vi.fn();
const createSalesInvoiceReceipt = vi.fn();

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../../api/client")>()),
  api: {
    accounting: {
      receivablesDetail: (...a: unknown[]) => receivablesDetail(...a),
      companyAccounts: (...a: unknown[]) => companyAccounts(...a),
      createSalesInvoiceReceipt: (...a: unknown[]) => createSalesInvoiceReceipt(...a),
    },
  },
}));

import { ReceivablesDrawer } from "./ReceivablesDrawer";

const hd = {
  customer_id: 12, customer_name: "Thực phẩm An Phát", chua_dat_han: false, direct_received_amount: 0,
  deposit_offset_amount: 0, received_amount: 0,
};

const lanThu = (i: number): ReceivableReceiptRow => ({
  receipt_id: 300 + i, code: `PT-${300 + i}`, doc_no: null, order_id: 41, order_code: "DH-0412",
  source_type: "sales_invoice", sales_invoice_id: 2, sales_invoice_number: "0001234", applied_to: "sales_invoice",
  receipt_method: "bank_transfer", amount: 1_000_000, receipt_date: "2026-10-05", payer_name: "An Phát",
  bank_reference: "FT1", created_by_name: "Nguyễn Thị Luyến",
});

function chiTiet(p: Partial<ReceivablesDetail> = {}): ReceivablesDetail {
  return {
    customer_id: 12, customer_name: "Thực phẩm An Phát", credit_limit: 250_000_000, payment_term_days: 30,
    vuot_han_muc: false, vuot_bao_nhieu: 0,
    items: [
      { ...hd, invoice_id: 1, invoice_symbol: "1C26TSV", invoice_number: "0001198", invoice_date: "2026-07-21",
        order_id: 40, order_code: "DH-0398", due_date: "2026-08-20", overdue_days: 46, aging_bucket: "d31_60",
        amount: 36_000_000, remaining_amount: 36_000_000 },
      { ...hd, invoice_id: 2, invoice_symbol: "1C26TSV", invoice_number: "0001234", invoice_date: "2026-09-22",
        order_id: 41, order_code: "DH-0412", due_date: "2026-10-22", overdue_days: 0, aging_bucket: null,
        amount: 96_000_000, deposit_offset_amount: 20_000_000, direct_received_amount: 32_000_000,
        received_amount: 52_000_000, remaining_amount: 44_000_000 },
      { ...hd, invoice_id: 3, invoice_symbol: null, invoice_number: "0001251", invoice_date: "2026-10-01",
        order_id: 42, order_code: "DH-0420", due_date: null, chua_dat_han: true, overdue_days: 0, aging_bucket: null,
        amount: 106_000_000, remaining_amount: 106_000_000 },
    ],
    paid: [lanThu(0), { ...lanThu(1), applied_to: "deposit_offset", source_type: "order_deposit", sales_invoice_id: null,
      sales_invoice_number: null, receipt_method: "cash" }],
    paid_total: 2,
    period_months: 3, all_history: false, total_due: 186_000_000, overdue_amount: 36_000_000, aging: [],
    received_in_period: 2_000_000, as_of: "2026-10-05",
    ...p,
  };
}

const KY = { tu: "2026-10-01", den: "2026-10-31" };
const navigate = vi.fn();
const onChanged = vi.fn();
const onClose = vi.fn();
const QUYEN = { thu: true, xemPhieuThu: true, xemKhach: true, xemDonBan: true };

function ve(o: {
  eventTick?: number; bucket?: "all" | "overdue" | "paid"; tuoi?: { khoa: string; nhan: string } | null;
  ky?: { tu: string; den: string }; len?: () => void; xuong?: () => void;
} = {}) {
  return (
    <ReceivablesDrawer customerId={12} customerName="Thực phẩm An Phát" bucket={o.bucket ?? "all"} tuoi={o.tuoi ?? null}
      ky={o.ky ?? KY} eventTick={o.eventTick ?? 0} quyen={QUYEN} navigate={navigate} onClose={onClose} onChanged={onChanged}
      len={o.len} xuong={o.xuong} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  receivablesDetail.mockImplementation(async () => chiTiet());
  companyAccounts.mockResolvedValue([
    { id: 4, bank_name: "MB", account_number: "93313466 8", currency: "VND", is_active: true },
  ]);
});

async function moTabNo(o?: Parameters<typeof ve>[0]) {
  render(ve(o));
  await screen.findByRole("tab", { name: /Hoá đơn còn nợ/ });
  await userEvent.click(screen.getByRole("tab", { name: /Hoá đơn còn nợ/ }));
}

describe("ReceivablesDrawer — NPTh-2", () => {
  it("đầu ngăn: tóm tắt còn nợ, quá hạn, hạn mức còn được nợ, cho nợ; hai tab có số; hồ sơ khách", async () => {
    await moTabNo();
    expect(screen.getByRole("heading", { name: "Thực phẩm An Phát" })).toBeInTheDocument();
    expect(screen.getByText("250.000.000 đ")).toBeInTheDocument();
    expect(screen.getByText("Còn được nợ 64.000.000")).toBeInTheDocument();
    expect(screen.getByText("30 ngày sau hoá đơn")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Hoá đơn còn nợ/ })).toHaveTextContent("Hoá đơn còn nợ3");
    expect(screen.getByRole("tab", { name: /Đã thu/ })).toHaveTextContent("Đã thu2");
    expect(receivablesDetail).toHaveBeenCalledWith("token-test", 12, false, { tu_ngay: KY.tu, den_ngay: KY.den },
      { paid_page: 1, paid_size: 10 });
    await userEvent.click(screen.getByRole("button", { name: "Hồ sơ khách hàng" }));
    expect(navigate).toHaveBeenCalledWith("khach-hang");
  });

  it("bảng hoá đơn: ký hiệu + số, dòng phụ ngày và thẻ đơn bán (link), hạn thu trễ; không nối bằng dấu", async () => {
    await moTabNo();
    const dong = screen.getByText("1C26TSV 0001198").closest("tr")!;
    const o = within(dong);
    expect(o.getByText("21/07")).toBeInTheDocument();
    expect(o.getByText("Trễ 46 ngày")).toHaveClass("kt-pill--do");
    expect(dong.textContent).not.toMatch(/[·•]|, /);
    expect(screen.getByText("0001251").closest("tr")!).toHaveTextContent("Chưa đặt hạn");
    await userEvent.click(o.getByRole("button", { name: "DH-0398" }));
    expect(navigate).toHaveBeenCalledWith("don-hang-ban", { openOrderId: 40 });
    const ngan = screen.getByRole("dialog");
    expect(ngan.textContent).not.toMatch(/[·•]/);
  });

  it("mở từ danh sách đang lọc mốc tuổi: lọc sẵn hoá đơn theo aging_bucket; bấm Tất cả hiện lại đủ", async () => {
    await moTabNo({ tuoi: { khoa: "d31_60", nhan: "Trễ 31–60 ngày" } });
    expect(screen.getByRole("button", { name: "Trễ 31–60 ngày" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1C26TSV 0001198")).toBeInTheDocument();
    expect(screen.queryByText("1C26TSV 0001234")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    expect(screen.getByText("1C26TSV 0001234")).toBeInTheDocument();
  });

  it("mốc 'Chưa tới hạn' lọc các hoá đơn chưa trễ (máy chủ để aging_bucket trống)", async () => {
    await moTabNo({ tuoi: { khoa: "chua_toi_han", nhan: "Chưa tới hạn" } });
    expect(screen.queryByText("1C26TSV 0001198")).toBeNull();
    expect(screen.getByText("1C26TSV 0001234")).toBeInTheDocument();
    expect(screen.getByText("0001251")).toBeInTheDocument();
  });

  it("tab Đã thu: Trong kỳ | Tất cả, thẻ số lần thu, cột Áp vào là thẻ, Hoá đơn và đơn", async () => {
    render(ve({ bucket: "paid" }));
    const dong = (await screen.findByRole("button", { name: "PT-300" })).closest("tr")!;
    expect(screen.getByText("2 lần thu")).toHaveClass("kt-the");
    expect(screen.getByText("Tổng 2.000.000 đ")).toBeInTheDocument();
    expect(within(dong).getByText("Thu hoá đơn")).toHaveClass("kt-the");
    expect(within(dong).getByText("DH-0412")).toHaveClass("kt-the");
    expect(within(dong).getByText("Chuyển khoản")).toBeInTheDocument();
    const coc = screen.getByRole("button", { name: "PT-301" }).closest("tr")!;
    expect(within(coc).getByText("Trừ cọc")).toHaveClass("kt-the");
    expect(dong.textContent).not.toMatch(/[·•]|, /);
    await userEvent.click(screen.getByRole("button", { name: "PT-300" }));
    expect(navigate).toHaveBeenCalledWith("ke-toan-phieu-thu", { focusReceiptQuery: "PT-300" });
    await userEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    await waitFor(() => expect(receivablesDetail).toHaveBeenLastCalledWith("token-test", 12, true, undefined,
      { paid_page: 1, paid_size: 10 }));
  });

  it("Đã thu: Xem thêm tải trang kế và NỐI vào, bỏ dòng trùng khi trang trượt", async () => {
    receivablesDetail.mockImplementation(async (_t, _id, _all, _ky, trang?: { paid_page: number }) =>
      trang?.paid_page === 2
        ? chiTiet({ paid: [lanThu(9), lanThu(10), lanThu(11)], paid_total: 13 })
        : chiTiet({ paid: Array.from({ length: 10 }, (_, i) => lanThu(i)), paid_total: 12 }),
    );
    render(ve({ bucket: "paid" }));
    await screen.findByRole("button", { name: "PT-300" });
    expect(screen.getByText("Hiện 10 trên 12 lần thu")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    expect(receivablesDetail).toHaveBeenLastCalledWith("token-test", 12, false, { tu_ngay: KY.tu, den_ngay: KY.den },
      { paid_page: 2, paid_size: 10 });
    expect(await screen.findByRole("button", { name: "PT-311" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "PT-309" })).toHaveLength(1);
    expect(screen.getByText("Hiện 12 trên 13 lần thu")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Đã thu/ })).toHaveTextContent("Đã thu13");
  });

  it("sự kiện đẩy nạp lại ngăn", async () => {
    const { rerender } = render(ve());
    await screen.findByRole("tab", { name: /Hoá đơn còn nợ/ });
    receivablesDetail.mockClear();
    rerender(ve({ eventTick: 1 }));
    await waitFor(() => expect(receivablesDetail).toHaveBeenCalledTimes(1));
  });
});

describe("ReceivablesDrawer — Thu tiền (NPTh-3)", () => {
  it("khung mở NGAY DƯỚI dòng hoá đơn; lập xong dòng đổi ngay, thông báo đáy, Xem phiếu sang Phiếu thu", async () => {
    await moTabNo();
    const dong = screen.getByText("1C26TSV 0001198").closest("tr")!;
    await userEvent.click(within(dong).getByRole("button", { name: "Thu tiền" }));
    const khung = dong.nextElementSibling as HTMLElement;
    expect(khung).toHaveClass("kt-khung-dong");
    expect(within(khung).getByRole("heading", { name: /Thu hoá đơn 0001198/ })).toBeInTheDocument();
    expect(within(khung).getByText("Còn phải thu 36.000.000 đ")).toHaveClass("kt-the");

    // Nạp lại sau khi lập chưa về: dòng vẫn phải đổi ngay.
    createSalesInvoiceReceipt.mockResolvedValue({ id: 900, code: "PT-261006-AB12", amount_vnd: 10_000_000 });
    receivablesDetail.mockImplementation(() => new Promise(() => {}));
    const o = within(khung).getByRole("textbox", { name: /Số tiền/ });
    await userEvent.clear(o);
    await userEvent.type(o, "10000000");
    await userEvent.click(within(khung).getByRole("button", { name: "Lập phiếu thu" }));

    expect(await screen.findByText("Đã lập PT-261006-AB12")).toBeInTheDocument();
    const dongMoi = screen.getByText("1C26TSV 0001198").closest("tr")!;
    expect(within(dongMoi).getByText("26.000.000")).toBeInTheDocument();
    expect(dongMoi.nextElementSibling?.classList.contains("kt-khung-dong")).toBe(false);
    expect(onChanged).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Xem phiếu" }));
    expect(navigate).toHaveBeenCalledWith("ke-toan-phieu-thu", { focusReceiptQuery: "PT-261006-AB12" });
  });
});

describe("ReceivablesDrawer — giữ nháp khung Thu tiền", () => {
  afterEach(() => vi.restoreAllMocks());

  async function moKhungGoDo(soHd = "1C26TSV 0001198", o?: Parameters<typeof ve>[0]) {
    await moTabNo(o);
    const dong = screen.getByText(soHd).closest("tr")!;
    await userEvent.click(within(dong).getByRole("button", { name: "Thu tiền" }));
    const khung = dong.nextElementSibling as HTMLElement;
    await userEvent.type(within(khung).getByRole("textbox", { name: /Số tiền/ }), "5");
    return khung;
  }

  it("đổi tab khi đang gõ dở: hỏi trước; không đồng ý thì ở lại, đồng ý thì sang tab và đóng ngăn không hỏi nữa", async () => {
    const hoi = vi.spyOn(window, "confirm").mockReturnValue(false);
    await moKhungGoDo();
    await userEvent.click(screen.getByRole("tab", { name: /Đã thu/ }));
    expect(hoi).toHaveBeenCalledWith("Bỏ nội dung đang nhập?");
    expect(screen.getByRole("heading", { name: /Thu hoá đơn 0001198/ })).toBeInTheDocument();
    hoi.mockReturnValue(true);
    await userEvent.click(screen.getByRole("tab", { name: /Đã thu/ }));
    expect(await screen.findByRole("button", { name: "PT-300" })).toBeInTheDocument();
    // Khung đã gỡ ⇒ ngăn không còn "gõ dở": đóng không hỏi.
    hoi.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(hoi).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("đổi nút lọc làm dòng đang thu biến mất: hỏi trước; dòng vẫn còn thì không hỏi", async () => {
    const hoi = vi.spyOn(window, "confirm").mockReturnValue(false);
    await moKhungGoDo("1C26TSV 0001198");
    // 0001198 đang trễ ⇒ vẫn nằm trong "Quá hạn": không hỏi, khung giữ nguyên.
    await userEvent.click(screen.getByRole("button", { name: "Quá hạn" }));
    expect(hoi).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /Thu hoá đơn 0001198/ })).toBeInTheDocument();
  });

  it("đổi nút lọc làm dòng đang thu biến mất thì hỏi; không đồng ý thì giữ lọc cũ", async () => {
    const hoi = vi.spyOn(window, "confirm").mockReturnValue(false);
    await moKhungGoDo("1C26TSV 0001234");
    await userEvent.click(screen.getByRole("button", { name: "Quá hạn" }));
    expect(hoi).toHaveBeenCalledWith("Bỏ nội dung đang nhập?");
    expect(screen.getByRole("heading", { name: /Thu hoá đơn 0001234/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true");
  });

  it("đang gõ dở thì tắt ↑ ↓ sang khách khác", async () => {
    const len = vi.fn();
    const xuong = vi.fn();
    await moTabNo({ len, xuong });
    expect(screen.getByRole("button", { name: "Bản ghi sau" })).toBeInTheDocument();
    const dong = screen.getByText("1C26TSV 0001198").closest("tr")!;
    await userEvent.click(within(dong).getByRole("button", { name: "Thu tiền" }));
    const khung = dong.nextElementSibling as HTMLElement;
    await userEvent.type(within(khung).getByRole("textbox", { name: /Số tiền/ }), "5");
    expect(screen.queryByRole("button", { name: "Bản ghi sau" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Bản ghi trước" })).toBeNull();
    await userEvent.click(within(khung).getByRole("button", { name: /Chuyển khoản/ }));
    await userEvent.keyboard("{ArrowDown}");
    expect(xuong).not.toHaveBeenCalled();
  });

  it("kỳ đã qua: nhắc hoá đơn trong ngăn tính tới hôm nay", async () => {
    await moTabNo({ ky: { tu: "2020-01-01", den: "2020-01-31" } });
    expect(screen.getByText("Hoá đơn tính tới hôm nay")).toBeInTheDocument();
  });

  it("kỳ đang chạy: không nhắc", async () => {
    await moTabNo({ ky: { tu: "2020-01-01", den: "2999-12-31" } });
    expect(screen.queryByText("Hoá đơn tính tới hôm nay")).toBeNull();
  });
});
