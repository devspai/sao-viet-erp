import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createVoucher = vi.fn();

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../../api/client")>()),
  api: { mucThuChi: { list: vi.fn().mockResolvedValue({ items: [{ id: -1, ma: "HT-01", ten: "Trả nhà cung cấp", loai: "chi", co_dinh: true, nguon: "purchase_request", ghi_chu: "Phiếu chi trả đơn mua", active: true }, { id: 5, ma: "DIEN", ten: "Tiền điện", loai: "chi", ghi_chu: null, active: true }] }) },
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

  it("bấm lập khi trống: lỗi nằm tại từng ô, con trỏ nhảy về ô sai đầu tiên (Số tiền chi — khối Tiền chi đứng đầu), không gọi máy chủ", async () => {
    const u = userEvent.setup();
    render(<StandaloneVoucherDialog onClose={() => {}} onSaved={() => {}} />);
    await u.click(screen.getByRole("button", { name: "Lập phiếu chi" }));
    expect(screen.getByText("Ghi người hoặc đơn vị nhận tiền.")).toBeInTheDocument();
    expect(screen.getByText("Số tiền chi phải lớn hơn 0.")).toBeInTheDocument();
    expect(screen.getByText("Ghi lý do chi.")).toBeInTheDocument();
    expect(screen.getByText("Chọn mục chi.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Số tiền chi/)).toHaveFocus();
    expect(createVoucher).not.toHaveBeenCalled();
  });

  it("đủ ô: gửi phiếu nguồn other, số tiền gõ có dấu chấm nghìn, tờ phiếu xem trước hiện theo phím gõ", async () => {
    const u = userEvent.setup();
    const onSaved = vi.fn();
    createVoucher.mockResolvedValue({ id: 9, code: "PC-1" });
    render(<StandaloneVoucherDialog onClose={() => {}} onSaved={onSaved} />);
    await u.type(screen.getByLabelText(/Người nhận tiền/), "Điện lực Thuận An");
    await u.type(screen.getByLabelText(/Số tiền/), "5200000");
    expect(screen.getByLabelText(/Số tiền/)).toHaveValue("5.200.000");
    const oMuc = await screen.findByRole("combobox", { name: /Mục chi/ });
    // Mục cố định (phiếu sinh từ nghiệp vụ) không chọn tay được.
    expect(within(oMuc).queryByRole("option", { name: "Trả nhà cung cấp" })).toBeNull();
    await u.selectOptions(oMuc, "Tiền điện");
    await u.type(screen.getByLabelText(/Lý do chi/), "Tiền điện tháng 9");
    const giay = screen.getByLabelText("Xem trước phiếu chi");
    // Bản xem trước in "Mục chi: …" thay dòng "Nguồn chi: Khác".
    expect(giay).toHaveTextContent("Mục chi");
    expect(giay).not.toHaveTextContent("Nguồn chi");
    expect(giay).toHaveTextContent("Điện lực Thuận An");
    expect(giay).toHaveTextContent("5.200.000 đ");
    expect(giay).toHaveTextContent("Năm triệu hai trăm nghìn đồng");
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
      muc_thu_chi_id: 5,
      customer_id: null,
    });
    expect(onSaved).toHaveBeenCalled();
  });
});
