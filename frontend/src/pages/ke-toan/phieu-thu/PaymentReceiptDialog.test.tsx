/** Form sửa phiếu thu lại tiền đã chi (đặc tả PT-4): điền lại sẵn Mã giao dịch (lỗi 4), số ngoại tệ
 *  gõ được phần lẻ mà không bị đọc sai (lỗi 5), hạn mức "Còn được thu" và payload giữ đúng bản cũ. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PaymentVoucherRow } from "../../../api/client";
import { phieu } from "../phieu-chi/components/phieuMau";
import { phieuThu } from "./components/phieuMau";

const goi = vi.hoisted(() => ({
  companyAccounts: vi.fn(),
  createReceipt: vi.fn(),
  updateReceipt: vi.fn(),
}));

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../api/client")>()),
  api: { accounting: goi },
}));

import { PaymentReceiptDialog } from "./PaymentReceiptDialog";

const TK = [
  { id: 3, bank_name: "MB", account_number: "933134668", currency: "VND" },
  { id: 4, bank_name: "VCB", account_number: "0281000456789", currency: "USD" },
];

const PC_VND: PaymentVoucherRow = phieu({
  id: 9, code: "UNC-260810-AB12", amount: 10_000_000, amount_vnd: 10_000_000, receipt_received_amount: 2_000_000,
  receipt_pending_amount: 3_000_000, supplier_name: "Giấy Bình Minh",
});

describe("Form sửa phiếu thu lại tiền đã chi (PT-4)", () => {
  beforeEach(() => {
    goi.updateReceipt.mockReset();
    goi.createReceipt.mockReset();
    goi.companyAccounts.mockResolvedValue(TK);
  });

  it("sửa phiếu chuyển khoản: Mã giao dịch điền lại sẵn và gửi lại nguyên (lỗi 4)", async () => {
    const u = userEvent.setup();
    const r = phieuThu({
      id: 5, code: "PT-260820-OLD1", status: "waiting_receipt", source_type: "purchase_refund", payment_voucher_id: 9,
      receipt_method: "bank_transfer", company_bank_account_id: 3, bank_reference: "FT2608", amount: 3_000_000,
      amount_vnd: 3_000_000, receipt_date: "2026-08-20", content: "Thu hồi tiền thừa UNC-260810-AB12",
      payer_name: "Nguyễn Văn An",
    });
    goi.updateReceipt.mockResolvedValue(r);
    render(<PaymentReceiptDialog voucher={PC_VND} receipt={r} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByLabelText(/Mã giao dịch/)).toHaveValue("FT2608");
    // Còn được thu = 10tr − 2tr − 3tr + 3tr (chính phiếu này đang chiếm chỗ).
    expect(screen.getAllByText("Còn được thu")[0].nextSibling).toHaveTextContent("8.000.000 đ");
    await screen.findByRole("option", { name: "933134668 tại MB" });
    await u.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(goi.updateReceipt).toHaveBeenCalledTimes(1);
    const [, id, gui] = goi.updateReceipt.mock.calls[0];
    expect(id).toBe(5);
    expect(gui).toMatchObject({
      payer_name: "Nguyễn Văn An", receipt_method: "bank_transfer", company_bank_account_id: 3,
      bank_reference: "FT2608", amount: 3_000_000, exchange_rate: 1, receipt_date: "2026-08-20",
    });
  });

  it("vượt Còn được thu: câu đỏ tại ô Số tiền, nút lập khoá; Thu đủ điền lại 5 tr", async () => {
    const u = userEvent.setup();
    render(<PaymentReceiptDialog voucher={PC_VND} onClose={() => {}} onSaved={() => {}} />);
    await u.type(screen.getByLabelText(/Số tiền/), "6000000");
    expect(screen.getByText("Thu quá số còn được thu 1.000.000 đ.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lập phiếu thu" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Thu đủ" }));
    expect(screen.getByLabelText(/Số tiền/)).toHaveValue("5.000.000");
    expect(goi.createReceipt).not.toHaveBeenCalled();
  });

  it("ngoại tệ: gõ '12,5' là mười hai phẩy năm (không thành 125), báo phần lẻ chưa lưu được; tỷ giá nhận số lẻ", async () => {
    const u = userEvent.setup();
    const pc = phieu({ ...PC_VND, currency: "USD", amount: 1000, amount_vnd: 25_400_000, exchange_rate: 25400,
      receipt_received_amount: 0, receipt_pending_amount: 0 });
    goi.createReceipt.mockResolvedValue(phieuThu({ id: 11 }));
    render(<PaymentReceiptDialog voucher={pc} onClose={() => {}} onSaved={() => {}} />);
    const o = screen.getByLabelText(/Số tiền/);
    await u.type(o, "12,5");
    expect(o).toHaveValue("12,5");
    expect(screen.getByText("Quy đổi 317.500 đ")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
    expect(screen.getByText(/chưa lưu được phần lẻ/)).toBeInTheDocument();
    expect(goi.createReceipt).not.toHaveBeenCalled();

    await u.clear(o);
    await u.type(o, "12");
    const tyGia = screen.getByLabelText(/Tỷ giá/);
    await u.clear(tyGia);
    await u.type(tyGia, "25400,5");
    await u.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
    expect(goi.createReceipt).toHaveBeenCalledTimes(1);
    const [, voucherId, gui] = goi.createReceipt.mock.calls[0];
    expect(voucherId).toBe(9);
    expect(gui).toMatchObject({ amount: 12, exchange_rate: 25400.5, receipt_method: "cash", company_bank_account_id: null });
  });
});
