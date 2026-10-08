/** Ngăn chồng "Thu tiền" một hoá đơn (NPTh-3, kiểu mới 06/10/2026) — TIỀN THẬT: payload gửi máy chủ
 *  khoá bằng `toStrictEqual` cho cả tiền mặt lẫn chuyển khoản (cùng trường, cùng giá trị như khung cũ).
 *  Thu quá số còn nợ: báo đỏ tại ô, khoá nút lập. Ngày thu từ ngày hoá đơn tới hôm nay. Khối "Hoá đơn
 *  này" đối chiếu số + các lần thu trước của chính hoá đơn này; chip người nộp lấy từ danh bạ liên hệ. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReceivableItemRow, ReceivablesDetail } from "../../../../api/client";
import { homNayVN } from "../../../../utils/ky";

const companyAccounts = vi.fn();
const createSalesInvoiceReceipt = vi.fn();
const receivablesDetail = vi.fn();
const contacts = vi.fn();

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test", user: { name: "Lê Thông" } }) }));
vi.mock("../../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../../api/client")>()),
  api: {
    accounting: {
      companyAccounts: (...a: unknown[]) => companyAccounts(...a),
      createSalesInvoiceReceipt: (...a: unknown[]) => createSalesInvoiceReceipt(...a),
      receivablesDetail: (...a: unknown[]) => receivablesDetail(...a),
    },
    customers: { contacts: (...a: unknown[]) => contacts(...a) },
  },
}));

import { ThuTienHoaDon } from "./ThuTienHoaDon";

const ITEM: ReceivableItemRow = {
  invoice_id: 1, invoice_symbol: "1C26TSV", invoice_number: "0001198", invoice_date: "2026-07-21", order_id: 40,
  order_code: "DH-0398", customer_id: 12, customer_name: "Thực phẩm An Phát", due_date: "2026-08-20",
  chua_dat_han: false, overdue_days: 46, aging_bucket: "d31_60", amount: 46_000_000, direct_received_amount: 10_000_000,
  deposit_offset_amount: 0, received_amount: 10_000_000, remaining_amount: 36_000_000,
};

const CHI_TIET = {
  customer_id: 12, customer_name: "Thực phẩm An Phát", credit_limit: 250_000_000, payment_term_days: 30,
  vuot_han_muc: false, vuot_bao_nhieu: 0,
  items: [ITEM, { ...ITEM, invoice_id: 2, invoice_number: "0001234", remaining_amount: 44_000_000, overdue_days: 0 }],
  paid: [
    { receipt_id: 300, code: "PT-260801-AA11", doc_no: null, order_id: 40, order_code: "DH-0398",
      source_type: "sales_invoice", sales_invoice_id: 1, sales_invoice_number: "0001198", applied_to: "sales_invoice",
      receipt_method: "bank_transfer", amount: 10_000_000, receipt_date: "2026-08-01", payer_name: "An Phát",
      bank_reference: "FT1", created_by_name: "Nguyễn Thị Luyến" },
    { receipt_id: 301, code: "PT-260901-BB22", doc_no: null, order_id: 41, order_code: "DH-0412",
      source_type: "sales_invoice", sales_invoice_id: 2, sales_invoice_number: "0001234", applied_to: "sales_invoice",
      receipt_method: "cash", amount: 5_000_000, receipt_date: "2026-09-01", payer_name: "An Phát",
      bank_reference: null, created_by_name: "Nguyễn Thị Luyến" },
  ],
  paid_total: 2, period_months: 0, all_history: true, total_due: 80_000_000, overdue_amount: 36_000_000, aging: [],
  received_in_period: 0, as_of: "2026-10-06",
} as unknown as ReceivablesDetail;

const onDong = vi.fn();
const onDaLap = vi.fn();
const onMoTaiKhoan = vi.fn();

function ve() {
  return (
    <ThuTienHoaDon item={ITEM} customerId={12} customerName="Thực phẩm An Phát" onDong={onDong} onDaLap={onDaLap}
      onMoTaiKhoan={onMoTaiKhoan} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  companyAccounts.mockResolvedValue([
    { id: 4, bank_name: "MB", account_number: "933134668", currency: "VND", is_active: true, account_holder: "SAO VIỆT NHẬT" },
    { id: 5, bank_name: "VCB", account_number: "0281", currency: "USD", is_active: true },
  ]);
  createSalesInvoiceReceipt.mockResolvedValue({ id: 900, code: "PT-261006-AB12", amount_vnd: 36_000_000 });
  receivablesDetail.mockResolvedValue(CHI_TIET);
  contacts.mockResolvedValue({
    items: [
      { id: 7, name: "Trần Văn Kế", phone: null, is_primary: false },
      { id: 8, name: "Phạm Thu Hà", phone: "0912345678", is_primary: true },
    ],
  });
});

const lap = () => userEvent.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
const oTien = () => screen.getByRole("textbox", { name: /Số tiền thu/ });

describe("ThuTienHoaDon — payload (tiền thật)", () => {
  it("tiền mặt mặc định: điền sẵn số còn nợ, người nộp, lý do; payload y khung cũ", async () => {
    render(ve());
    expect(oTien()).toHaveValue("36.000.000");
    // Bằng chữ: dưới ô tiền và trên tờ phiếu xem trước.
    expect(screen.getAllByText("Ba mươi sáu triệu đồng.")).toHaveLength(2);
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

  it("chuyển khoản, thu một phần, người nộp từ chip liên hệ, địa chỉ + ghi chú: payload cắt khoảng trắng, chỉ tài khoản VND", async () => {
    render(ve());
    await userEvent.click(screen.getByRole("radio", { name: "Chuyển khoản" }));
    const chon = await screen.findByRole("combobox", { name: /Tài khoản nhận/ });
    await waitFor(() => expect(chon).not.toBeDisabled());
    expect(screen.queryByRole("option", { name: /VCB/ })).toBeNull();
    await userEvent.selectOptions(chon, "4");
    await userEvent.type(screen.getByRole("textbox", { name: /Mã giao dịch/ }), "  FT26278055120 ");
    await userEvent.clear(oTien());
    await userEvent.type(oTien(), "12500000");
    const goiY = await screen.findByRole("group", { name: "Gợi ý người nộp tiền" });
    // Liên hệ chính đứng đầu danh bạ, kèm số điện thoại.
    const chips = within(goiY).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["Tên khách", "Phạm Thu Hàliên hệ chính 0912 345 678", "Trần Văn Kế"]);
    await userEvent.click(chips[1]);
    expect(screen.getByRole("textbox", { name: /Người nộp tiền/ })).toHaveValue("Phạm Thu Hà");
    expect(chips[1]).toHaveAttribute("aria-pressed", "true");
    await userEvent.type(screen.getByRole("textbox", { name: /Địa chỉ người nộp/ }), " 12 Lê Lợi ");
    await userEvent.type(screen.getByRole("textbox", { name: /Ghi chú nội bộ/ }), " đợt 1 ");
    await lap();
    await waitFor(() => expect(createSalesInvoiceReceipt).toHaveBeenCalledTimes(1));
    expect(createSalesInvoiceReceipt.mock.calls[0][2]).toStrictEqual({
      payer_name: "Phạm Thu Hà",
      payer_address: "12 Lê Lợi",
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
    await userEvent.click(screen.getByRole("radio", { name: "Chuyển khoản" }));
    const chon = await screen.findByRole("combobox", { name: /Tài khoản nhận/ });
    await waitFor(() => expect(chon).not.toBeDisabled());
    await userEvent.selectOptions(chon, "4");
    await userEvent.type(screen.getByRole("textbox", { name: /Mã giao dịch/ }), "FT26278055120");
    await userEvent.click(screen.getByRole("radio", { name: "Tiền mặt" }));
    expect(screen.queryByRole("combobox", { name: /Tài khoản nhận/ })).toBeNull();
    await lap();
    await waitFor(() => expect(createSalesInvoiceReceipt).toHaveBeenCalledTimes(1));
    expect(createSalesInvoiceReceipt.mock.calls[0][2]).toMatchObject({
      receipt_method: "cash",
      company_bank_account_id: null,
      bank_reference: null,
    });
  });

  it("thu quá số còn nợ: câu đỏ tại ô, nút lập khoá; Thu đủ điền lại số còn nợ và mở khoá", async () => {
    render(ve());
    await userEvent.clear(oTien());
    await userEvent.type(oTien(), "36000001");
    expect(screen.getByText("Thu quá số còn phải thu 1 đ. Phiếu thu một hoá đơn không được vượt số còn nợ.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lập phiếu thu" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Thu đủ" }));
    expect(oTien()).toHaveValue("36.000.000");
    expect(screen.getByRole("button", { name: "Lập phiếu thu" })).toBeEnabled();
  });

  it("chuyển khoản thiếu tài khoản và mã giao dịch: lỗi tại từng ô, không gọi máy chủ", async () => {
    render(ve());
    await userEvent.click(screen.getByRole("radio", { name: "Chuyển khoản" }));
    await lap();
    expect(await screen.findByText("Chọn tài khoản công ty nhận tiền.")).toBeInTheDocument();
    expect(screen.getByText("Nhập mã giao dịch ngân hàng in trên sao kê hoặc tin nhắn báo có.")).toBeInTheDocument();
    expect(createSalesInvoiceReceipt).not.toHaveBeenCalled();
  });
});

describe("ThuTienHoaDon — bối cảnh hoá đơn", () => {
  it("hàng đối chiếu, chỉ các lần thu của CHÍNH hoá đơn này, hoá đơn khác còn nợ, dải sau phiếu này", async () => {
    render(ve());
    const bang = await screen.findByRole("table", { name: "Các lần thu trước của hoá đơn này" });
    expect(within(bang).getByText("PT-260801-AA11")).toBeInTheDocument();
    expect(within(bang).queryByText("PT-260901-BB22")).toBeNull();
    expect(screen.getByText("Còn phải thu").nextElementSibling).toHaveTextContent("36.000.000");
    expect(screen.getByText("HĐ 0001234")).toBeInTheDocument();
    const sau = screen.getByLabelText("Sau phiếu này");
    // Thu đủ 36 tr: hoá đơn về 0, khách còn 80 − 36 = 44 tr, hạn mức còn được nợ 250 − 44 = 206 tr.
    expect(within(sau).getByText("Hoá đơn còn nợ").nextElementSibling).toHaveTextContent("0 đ");
    expect(within(sau).getByText("Khách còn nợ").nextElementSibling).toHaveTextContent("44.000.000 đ");
    expect(within(sau).getByText("Hạn mức còn được nợ").nextElementSibling).toHaveTextContent("206.000.000 đ");
    expect(receivablesDetail).toHaveBeenCalledWith("token-test", 12, true);
  });

  it("tờ phiếu xem trước: tên người lập lấy từ tài khoản đang đăng nhập", async () => {
    render(ve());
    expect(screen.getByLabelText("Xem trước phiếu thu")).toHaveTextContent("Lê Thông");
  });
});

describe("ThuTienHoaDon — ngày thu", () => {
  it("ô ngày: min là ngày hoá đơn, max là hôm nay giờ Việt Nam; ngoài khoảng thì ô không nhận", async () => {
    render(ve());
    // Ô ngày tự vẽ (ChonNgay): gõ dd/mm/yyyy, rời ô là chốt; ngày ngoài [min, max] bị trả về như cũ.
    const o = screen.getByLabelText(/Ngày thu/) as HTMLInputElement;
    const cu = o.value;
    fireEvent.change(o, { target: { value: "20/07/2026" } });
    fireEvent.blur(o);
    expect(o.value).toBe(cu);
    const [y, m, d] = homNayVN().split("-").map(Number);
    const mai = new Date(y, m - 1, d + 1);
    const chuMai = `${String(mai.getDate()).padStart(2, "0")}/${String(mai.getMonth() + 1).padStart(2, "0")}/${mai.getFullYear()}`;
    fireEvent.change(o, { target: { value: chuMai } });
    fireEvent.blur(o);
    expect(o.value).toBe(cu);
    fireEvent.change(o, { target: { value: "21/07/2026" } });
    fireEvent.blur(o);
    expect(o.value).toBe("21/07/2026");
    expect(createSalesInvoiceReceipt).not.toHaveBeenCalled();
  });
});

describe("ThuTienHoaDon — không có tài khoản VND", () => {
  it("câu giải thích + link Thêm tài khoản sang màn Tài khoản ngân hàng", async () => {
    companyAccounts.mockResolvedValue([{ id: 5, bank_name: "VCB", account_number: "0281", currency: "USD", is_active: true }]);
    render(ve());
    await userEvent.click(screen.getByRole("radio", { name: "Chuyển khoản" }));
    expect(await screen.findByText(/Chưa có tài khoản công ty nhận tiền VND/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
    expect(onMoTaiKhoan).toHaveBeenCalled();
  });
});
