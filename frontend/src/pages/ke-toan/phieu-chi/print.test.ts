import { describe, expect, it } from "vitest";
import { dongPhuPhieuChi } from "./print";

const goc = {
  voucher_type: "cash" as const,
  source_type: "purchase_request" as const,
  company_account_number: null,
  company_bank_name: null,
  beneficiary_account_number: null,
  beneficiary_bank_name: null,
  invoice_number: null,
  bank_reference: null,
};
const dot = (row: Parameters<typeof dongPhuPhieuChi>[0]) =>
  dongPhuPhieuChi(row).find((l) => l.label === "Đợt thanh toán")?.value;

describe("dongPhuPhieuChi — dòng Đợt thanh toán", () => {
  it("phiếu trả một đợt giao in số đợt, không in 'thanh toán cuối' khi đợt sau còn nợ", () => {
    expect(dot({ ...goc, payment_stage: "final", delivery_seq_no: 1 })).toBe("Đợt 1");
  });
  it("phiếu cọc vẫn in đặt cọc dù có số đợt", () => {
    expect(dot({ ...goc, payment_stage: "advance", delivery_seq_no: 1 })).toBe("Tạm ứng / đặt cọc");
  });
  it("phiếu cũ không theo đợt in nhãn tiền hàng", () => {
    expect(dot({ ...goc, payment_stage: "final", delivery_seq_no: null })).toBe("Thanh toán tiền hàng");
  });
});
