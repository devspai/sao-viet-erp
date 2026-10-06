/** Form lập phiếu thu khác (đặc tả PT-3): lỗi tại ô, câu xem trước ở chân, payload giữ đúng bản cũ. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const goi = vi.hoisted(() => ({
  companyAccounts: vi.fn(),
  createOtherReceipt: vi.fn(),
  uploadReceiptAttachment: vi.fn(),
}));

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../../api/client")>()),
  api: { accounting: goi },
}));

import { OtherReceiptDialog } from "./OtherReceiptDialog";

const TK = [
  { id: 3, bank_name: "MB", account_number: "933134668", currency: "VND" },
  { id: 4, bank_name: "VCB", account_number: "0281000456789", currency: "USD" },
];

describe("Form lập phiếu thu khác (PT-3)", () => {
  beforeEach(() => {
    goi.createOtherReceipt.mockReset();
    goi.companyAccounts.mockResolvedValue(TK);
  });

  it("bấm lập khi trống: lỗi tại từng ô, con trỏ về ô Thu của, không gọi máy chủ", async () => {
    const u = userEvent.setup();
    render(<OtherReceiptDialog onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Thu của ai và bao nhiêu")).toBeInTheDocument();
    expect(screen.getByText("Nhận bằng")).toBeInTheDocument();
    expect(screen.getByText("Khi nào")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
    expect(screen.getByText("Ghi người hoặc đơn vị nộp tiền.")).toBeInTheDocument();
    expect(screen.getByText("Số tiền thu phải lớn hơn 0.")).toBeInTheDocument();
    expect(screen.getByText("Ghi nội dung thu.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Thu của/)).toHaveFocus();
    expect(goi.createOtherReceipt).not.toHaveBeenCalled();
  });

  it("tiền mặt: payload như bản cũ, chân nói 'Thu X đ tiền mặt của Y.'", async () => {
    const u = userEvent.setup();
    const onSaved = vi.fn();
    goi.createOtherReceipt.mockResolvedValue({ id: 9, code: "PT-1" });
    render(<OtherReceiptDialog onClose={() => {}} onSaved={onSaved} />);
    await u.type(screen.getByLabelText(/Thu của/), "  Phế liệu Tư Hải ");
    await u.type(screen.getByLabelText(/Số tiền/), "2350000");
    expect(screen.getByLabelText(/Số tiền/)).toHaveValue("2.350.000");
    await u.type(screen.getByLabelText(/Nội dung thu/), "Bán giấy vụn");
    expect(document.querySelector(".kt-ngan__xt")?.textContent).toBe("Thu 2.350.000 đ tiền mặt của Phế liệu Tư Hải.");
    await u.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
    expect(goi.createOtherReceipt).toHaveBeenCalledTimes(1);
    expect(goi.createOtherReceipt.mock.calls[0][1]).toEqual({
      payer_name: "Phế liệu Tư Hải",
      payer_address: null,
      receipt_method: "cash",
      receipt_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      amount: 2350000,
      exchange_rate: 1,
      content: "Bán giấy vụn",
      debit_account: null,
      credit_account: null,
      company_bank_account_id: null,
      bank_reference: null,
      note: null,
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("chuyển khoản: chỉ tài khoản VND; thiếu tài khoản và mã giao dịch thì lỗi tại ô; đủ thì gửi cả hai", async () => {
    const u = userEvent.setup();
    goi.createOtherReceipt.mockResolvedValue({ id: 9, code: "PT-1" });
    render(<OtherReceiptDialog onClose={() => {}} onSaved={() => {}} />);
    await u.type(screen.getByLabelText(/Thu của/), "Bao bì Việt Hưng");
    await u.type(screen.getByLabelText(/Số tiền/), "58600000");
    await u.type(screen.getByLabelText(/Nội dung thu/), "Thu tiền hàng");
    await u.click(screen.getByRole("button", { name: /Chuyển khoản/ }));
    const chon = await screen.findByLabelText(/Vào tài khoản/);
    expect(Array.from((chon as HTMLSelectElement).options).map((o) => o.value)).toEqual(["", "3"]);
    await u.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
    expect(screen.getByText("Chọn tài khoản công ty nhận tiền.")).toBeInTheDocument();
    expect(screen.getByText("Thu qua ngân hàng phải có mã giao dịch hoặc số báo có.")).toBeInTheDocument();
    expect(goi.createOtherReceipt).not.toHaveBeenCalled();

    await u.selectOptions(chon, "3");
    await u.type(screen.getByLabelText(/Mã giao dịch ngân hàng/), " FT26278 ");
    await u.click(screen.getByRole("button", { name: "Lập phiếu thu" }));
    expect(goi.createOtherReceipt.mock.calls[0][1]).toMatchObject({
      receipt_method: "bank_transfer", company_bank_account_id: 3, bank_reference: "FT26278", amount: 58600000,
    });
  });
});
