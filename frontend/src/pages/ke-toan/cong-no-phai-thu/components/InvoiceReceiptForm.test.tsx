/** Khung "Thu tiền" một hoá đơn (NPTh-3) — TIỀN THẬT: payload gửi máy chủ khoá bằng `toStrictEqual`
 *  cho cả tiền mặt lẫn chuyển khoản (cùng trường, cùng giá trị như bản cũ; chỉ thêm `note` từ ô Ghi
 *  chú). Ngày thu từ ngày hoá đơn tới hôm nay (giờ Việt Nam); lỗi tại ô, lỗi mã giao dịch nói đúng
 *  "mã giao dịch"; không có tài khoản VND thì nói rõ và có link "Thêm tài khoản". */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReceivableItemRow } from "../../../../api/client";
import { homNayVN } from "../../../../utils/ky";

const companyAccounts = vi.fn();
const createSalesInvoiceReceipt = vi.fn();

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../../api/client")>()),
  api: {
    accounting: {
      companyAccounts: (...a: unknown[]) => companyAccounts(...a),
      createSalesInvoiceReceipt: (...a: unknown[]) => createSalesInvoiceReceipt(...a),
    },
  },
}));

import { InvoiceReceiptForm } from "./InvoiceReceiptForm";

const ITEM: ReceivableItemRow = {
  invoice_id: 1, invoice_symbol: "1C26TSV", invoice_number: "0001198", invoice_date: "2026-07-21", order_id: 40,
  order_code: "DH-0398", customer_id: 12, customer_name: "Thực phẩm An Phát", due_date: "2026-08-20",
  chua_dat_han: false, overdue_days: 46, aging_bucket: "d31_60", amount: 36_000_000, direct_received_amount: 0,
  deposit_offset_amount: 0, received_amount: 0, remaining_amount: 36_000_000,
};

const onDong = vi.fn();
const onDaLap = vi.fn();
const onMoTaiKhoan = vi.fn();

function ve() {
  return (
    <InvoiceReceiptForm item={ITEM} customerName="Thực phẩm An Phát" onDong={onDong} onDaLap={onDaLap}
      onMoTaiKhoan={onMoTaiKhoan} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  companyAccounts.mockResolvedValue([
    { id: 4, bank_name: "MB", account_number: "933134668", currency: "VND", is_active: true },
    { id: 5, bank_name: "VCB", account_number: "0281", currency: "USD", is_active: true },
  ]);
  createSalesInvoiceReceipt.mockResolvedValue({ id: 900, code: "PT-261006-AB12", amount_vnd: 36_000_000 });
});

const lap = () => userEvent.click(screen.getByRole("button", { name: "Lập phiếu thu" }));

describe("InvoiceReceiptForm — payload (tiền thật)", () => {
  it("tiền mặt mặc định: điền sẵn số còn nợ, người nộp, nội dung; payload y bản cũ", async () => {
    render(ve());
    expect(screen.getByRole("textbox", { name: /Số tiền/ })).toHaveValue("36.000.000");
    await lap();
    await waitFor(() => expect(createSalesInvoiceReceipt).toHaveBeenCalledTimes(1));
    const [token, invoiceId, payload] = createSalesInvoiceReceipt.mock.calls[0];
    expect(token).toBe("token-test");
    expect(invoiceId).toBe(1);
    expect(payload).toStrictEqual({
      payer_name: "Thực phẩm An Phát",
      payer_address: null,
      receipt_method: "cash",
      receipt_date: homNayVN(),
      amount: 36_000_000,
      exchange_rate: 1,
      content: "Thu hóa đơn 0001198 của đơn DH-0398",
      company_bank_account_id: null,
      bank_reference: null,
      note: null,
    });
    expect(onDaLap).toHaveBeenCalledWith(expect.objectContaining({ code: "PT-261006-AB12" }));
  });

  it("chuyển khoản, thu một phần, có chi tiết thêm: payload cắt khoảng trắng, chỉ tài khoản VND", async () => {
    render(ve());
    await userEvent.click(screen.getByRole("button", { name: /Chuyển khoản/ }));
    const chon = await screen.findByRole("combobox", { name: /Vào tài khoản/ });
    await waitFor(() => expect(chon).not.toBeDisabled());
    expect(screen.queryByRole("option", { name: /VCB/ })).toBeNull();
    await userEvent.selectOptions(chon, "4");
    await userEvent.type(screen.getByRole("textbox", { name: /Mã giao dịch ngân hàng/ }), "  FT26278055120 ");
    const tien = screen.getByRole("textbox", { name: /Số tiền/ });
    await userEvent.clear(tien);
    await userEvent.type(tien, "12500000");
    await userEvent.click(screen.getByRole("button", { name: /Thêm chi tiết/ }));
    const nguoi = screen.getByRole("textbox", { name: /Người nộp/ });
    expect(nguoi).toHaveValue("Thực phẩm An Phát");
    await userEvent.clear(nguoi);
    await userEvent.type(nguoi, "  Kế toán An Phát ");
    await userEvent.type(screen.getByRole("textbox", { name: /Ghi chú/ }), " đợt 1 ");
    await lap();
    await waitFor(() => expect(createSalesInvoiceReceipt).toHaveBeenCalledTimes(1));
    expect(createSalesInvoiceReceipt.mock.calls[0][2]).toStrictEqual({
      payer_name: "Kế toán An Phát",
      payer_address: null,
      receipt_method: "bank_transfer",
      receipt_date: homNayVN(),
      amount: 12_500_000,
      exchange_rate: 1,
      content: "Thu hóa đơn 0001198 của đơn DH-0398",
      company_bank_account_id: 4,
      bank_reference: "FT26278055120",
      note: "đợt 1",
    });
  });

  it("chuyển khoản, điền tài khoản và mã, rồi quay về Tiền mặt: payload KHÔNG mang dữ liệu ngân hàng cũ", async () => {
    render(ve());
    await userEvent.click(screen.getByRole("button", { name: /Chuyển khoản/ }));
    const chon = await screen.findByRole("combobox", { name: /Vào tài khoản/ });
    await waitFor(() => expect(chon).not.toBeDisabled());
    await userEvent.selectOptions(chon, "4");
    await userEvent.type(screen.getByRole("textbox", { name: /Mã giao dịch ngân hàng/ }), "FT26278055120");
    await userEvent.click(screen.getByRole("button", { name: /Tiền mặt/ }));
    expect(screen.queryByRole("combobox", { name: /Vào tài khoản/ })).toBeNull();
    await lap();
    await waitFor(() => expect(createSalesInvoiceReceipt).toHaveBeenCalledTimes(1));
    expect(createSalesInvoiceReceipt.mock.calls[0][2]).toStrictEqual({
      payer_name: "Thực phẩm An Phát",
      payer_address: null,
      receipt_method: "cash",
      receipt_date: homNayVN(),
      amount: 36_000_000,
      exchange_rate: 1,
      content: "Thu hóa đơn 0001198 của đơn DH-0398",
      company_bank_account_id: null,
      bank_reference: null,
      note: null,
    });
  });

  it("Thu đủ điền lại số còn nợ; quá số còn nợ thì lỗi tại ô, không gọi máy chủ", async () => {
    render(ve());
    const tien = screen.getByRole("textbox", { name: /Số tiền/ });
    await userEvent.clear(tien);
    await userEvent.type(tien, "36000001");
    await lap();
    expect(await screen.findByText("Số tiền thu phải từ 1 đến 36.000.000 đ.")).toBeInTheDocument();
    expect(createSalesInvoiceReceipt).not.toHaveBeenCalled();
    await userEvent.clear(tien);
    await userEvent.click(screen.getByRole("button", { name: "Thu đủ" }));
    expect(tien).toHaveValue("36.000.000");
  });

  it("chuyển khoản thiếu tài khoản và mã giao dịch: lỗi tại từng ô, câu lỗi nói 'mã giao dịch'", async () => {
    render(ve());
    await userEvent.click(screen.getByRole("button", { name: /Chuyển khoản/ }));
    await lap();
    expect(await screen.findByText("Chọn tài khoản công ty nhận tiền.")).toBeInTheDocument();
    // Ô tên "Mã giao dịch ngân hàng" thì lỗi cũng nói "mã giao dịch" — không còn "số báo có" (đặc tả NPTh-3).
    expect(screen.getByText("Nhập mã giao dịch ngân hàng in trên sao kê hoặc tin nhắn báo có.")).toBeInTheDocument();
    expect(screen.queryByText(/số báo có/)).toBeNull();
    expect(createSalesInvoiceReceipt).not.toHaveBeenCalled();
  });
});

describe("InvoiceReceiptForm — ngày thu", () => {
  it("ô ngày: min là ngày hoá đơn, max là hôm nay giờ Việt Nam; trước ngày hoá đơn thì lỗi", async () => {
    render(ve());
    const o = screen.getByLabelText(/Ngày thu/);
    expect(o).toHaveAttribute("min", "2026-07-21");
    expect(o).toHaveAttribute("max", homNayVN());
    expect(screen.getByText("Từ 21/07/2026 tới hôm nay")).toBeInTheDocument();
    fireEvent.change(o, { target: { value: "2026-07-20" } });
    await lap();
    expect(await screen.findByText("Ngày thu không được trước ngày hoá đơn 21/07/2026.")).toBeInTheDocument();
    expect(createSalesInvoiceReceipt).not.toHaveBeenCalled();
  });

  it("ngày sau hôm nay (gõ tay vượt max của trình duyệt) thì lỗi tại ô, không gọi máy chủ", async () => {
    render(ve());
    const mai = new Date(`${homNayVN()}T00:00:00Z`);
    mai.setUTCDate(mai.getUTCDate() + 1);
    fireEvent.change(screen.getByLabelText(/Ngày thu/), { target: { value: mai.toISOString().slice(0, 10) } });
    await lap();
    expect(await screen.findByText("Ngày thu không được sau hôm nay.")).toBeInTheDocument();
    expect(createSalesInvoiceReceipt).not.toHaveBeenCalled();
  });
});

describe("InvoiceReceiptForm — không có tài khoản VND", () => {
  it("câu giải thích + link Thêm tài khoản sang màn Tài khoản ngân hàng", async () => {
    companyAccounts.mockResolvedValue([{ id: 5, bank_name: "VCB", account_number: "0281", currency: "USD", is_active: true }]);
    render(ve());
    await userEvent.click(screen.getByRole("button", { name: /Chuyển khoản/ }));
    expect(await screen.findByText(/Chưa có tài khoản công ty nhận tiền VND/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
    expect(onMoTaiKhoan).toHaveBeenCalled();
  });
});
