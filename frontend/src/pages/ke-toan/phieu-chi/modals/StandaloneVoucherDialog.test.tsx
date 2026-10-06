import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createVoucher = vi.fn();

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../../api/client")>()),
  api: {
    accounting: {
      companyAccounts: vi.fn().mockResolvedValue([]),
      createVoucher: (...a: unknown[]) => createVoucher(...a),
      uploadVoucherAttachment: vi.fn(),
    },
  },
}));

import { StandaloneVoucherDialog } from "./StandaloneVoucherDialog";

describe("Form lập phiếu chi rời (PC-3)", () => {
  beforeEach(() => createVoucher.mockReset());

  it("bấm lập khi trống: lỗi nằm tại từng ô, con trỏ nhảy về ô Chi cho, không gọi máy chủ", async () => {
    const u = userEvent.setup();
    render(<StandaloneVoucherDialog onClose={() => {}} onSaved={() => {}} />);
    await u.click(screen.getByRole("button", { name: "Lập phiếu chi" }));
    expect(screen.getByText("Ghi người hoặc đơn vị nhận tiền.")).toBeInTheDocument();
    expect(screen.getByText("Số tiền chi phải lớn hơn 0.")).toBeInTheDocument();
    expect(screen.getByText("Ghi nội dung chi.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Chi cho/)).toHaveFocus();
    expect(createVoucher).not.toHaveBeenCalled();
  });

  it("đủ ô: gửi phiếu nguồn other, số tiền gõ có dấu chấm nghìn, chân hiện câu xem trước", async () => {
    const u = userEvent.setup();
    const onSaved = vi.fn();
    createVoucher.mockResolvedValue({ id: 9, code: "PC-1" });
    render(<StandaloneVoucherDialog onClose={() => {}} onSaved={onSaved} />);
    await u.type(screen.getByLabelText(/Chi cho/), "Điện lực Thuận An");
    await u.type(screen.getByLabelText(/Số tiền/), "5200000");
    expect(screen.getByLabelText(/Số tiền/)).toHaveValue("5.200.000");
    await u.type(screen.getByLabelText(/Nội dung chi/), "Tiền điện tháng 9");
    expect(screen.getByText(/Lập xong không sửa được/).textContent).toContain("Chi 5.200.000");
    await u.click(screen.getByRole("button", { name: "Lập phiếu chi" }));
    expect(createVoucher).toHaveBeenCalledTimes(1);
    const gui = createVoucher.mock.calls[0][1];
    expect(gui).toMatchObject({
      source_type: "other",
      payment_stage: "other",
      voucher_type: "cash",
      amount: 5200000,
      cash_recipient_name: "Điện lực Thuận An",
      content: "Tiền điện tháng 9",
      company_bank_account_id: null,
    });
    expect(onSaved).toHaveBeenCalled();
  });
});
