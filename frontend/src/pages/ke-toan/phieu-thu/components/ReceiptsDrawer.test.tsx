/** Ngăn phiếu thu (đặc tả PT-2): menu Hủy nói hệ quả lên hoá đơn; phiếu cọc đã thu thì mục Hủy mờ
 *  kèm lý do (lỗi 3 — máy chủ không cho hủy); phiếu cũ chờ thu có khung "Xác nhận đã thu" tại chỗ. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { phieuThu } from "./phieuMau";

const HD = {
  id: 7, order_id: 40, order_code: "DH-0412", customer_id: 12, customer_name: "Thực phẩm An Phát",
  invoice_symbol: "1C26TSV", invoice_number: "0001234", invoice_date: "2026-09-22", amount_vnd: 96_000_000,
  payment_term_days_snapshot: 30, due_date: "2026-10-22", status: "issued", direct_received_amount: 32_000_000,
  deposit_offset_amount: 20_000_000, received_amount: 52_000_000, remaining_amount: 44_000_000,
  created_by_user_id: 1, created_by_name: "Phạm Thu Trang", created_at: "2026-09-22T02:00:00Z",
  cancelled_by_user_id: null, cancelled_by_name: null, cancelled_at: null, cancel_reason: null,
};

const goi = vi.hoisted(() => ({
  salesInvoices: vi.fn(),
  receiptAttachments: vi.fn(),
  markReceiptReceived: vi.fn(),
  cancelReceipt: vi.fn(),
}));

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../../api/client")>()),
  api: { accounting: goi },
}));

import { ReceiptsDrawer } from "./ReceiptsDrawer";

const QUYEN = { lap: true, huy: true, xacNhan: true, in: true, sua: true };

function ve(dau: ReturnType<typeof phieuThu>, over: Partial<Parameters<typeof ReceiptsDrawer>[0]> = {}) {
  const props = { dau, eventTick: 0, quyen: QUYEN, onDong: vi.fn(), onDoi: vi.fn(), onSua: vi.fn(), ...over };
  render(<ReceiptsDrawer {...props} />);
  return props;
}

beforeEach(() => {
  goi.salesInvoices.mockResolvedValue({ items: [HD] });
  goi.receiptAttachments.mockResolvedValue({ items: [] });
});

describe("ReceiptsDrawer", () => {
  it("phiếu cọc đã thu: mục Hủy phiếu mờ kèm lý do, không mở khung hủy", async () => {
    ve(phieuThu({ id: 2, code: "PT-261004-R7VN", source_type: "order_deposit", order_id: 41, order_code: "DH-0415" }));
    await userEvent.click(screen.getByRole("button", { name: "Thao tác khác" }));
    const muc = screen.getByRole("menuitem", { name: /Hủy phiếu/ });
    expect(muc).toBeDisabled();
    expect(muc).toHaveTextContent("Phiếu cọc đã thu — hủy từ đơn bán");
  });

  it("phiếu thu hoá đơn: Hủy nói hoá đơn quay lại còn nợ bao nhiêu; khối Áp vào hoá đơn đủ bốn số", async () => {
    const onMoCongNo = vi.fn();
    ve(phieuThu({
      id: 1, code: "PT-261005-K2M9", payer_name: "Thực phẩm An Phát", source_type: "sales_invoice",
      sales_invoice_id: 7, sales_invoice_number: "0001234", order_id: 40, order_code: "DH-0412",
      customer_name: "Thực phẩm An Phát", amount: 32_000_000, amount_vnd: 32_000_000,
    }), { onMoCongNo });
    const khoi = (await screen.findByText("Áp vào hoá đơn")).closest(".kt-hop") as HTMLElement;
    await waitFor(() => expect(within(khoi).getByText("44.000.000")).toBeInTheDocument());
    for (const [nhan, so] of [["Giá trị", "96.000.000"], ["Trừ cọc", "20.000.000"], ["Phiếu này", "32.000.000"]]) {
      expect(within(khoi).getByText(nhan).nextSibling).toHaveTextContent(so);
    }
    await userEvent.click(within(khoi).getByRole("button", { name: /Mở công nợ khách này/ }));
    expect(onMoCongNo).toHaveBeenCalledWith({ id: 12, name: "Thực phẩm An Phát" });

    await userEvent.click(screen.getByRole("button", { name: "Thao tác khác" }));
    const muc = screen.getByRole("menuitem", { name: /Hủy phiếu/ });
    expect(muc).toBeEnabled();
    expect(muc).toHaveTextContent("Hoá đơn 0001234 sẽ quay lại còn nợ 76.000.000 đ");
  });

  it("hoá đơn đã hủy: không hứa 'quay lại còn nợ', dùng câu chung", async () => {
    goi.salesInvoices.mockResolvedValue({ items: [{ ...HD, status: "cancelled", remaining_amount: 0 }] });
    ve(phieuThu({
      id: 1, source_type: "sales_invoice", sales_invoice_id: 7, sales_invoice_number: "0001234", order_id: 40,
      order_code: "DH-0412",
    }));
    await screen.findByText("Hoá đơn đã hủy");
    await userEvent.click(screen.getByRole("button", { name: "Thao tác khác" }));
    const muc = screen.getByRole("menuitem", { name: /Hủy phiếu/ });
    expect(muc).toHaveTextContent("Phiếu còn trong sổ với dấu Đã hủy");
    expect(muc).not.toHaveTextContent("quay lại còn nợ");
  });

  it("phiếu thu hoá đơn thiếu mã hoá đơn: báo không đọc được, không treo 'Đang tải'", async () => {
    ve(phieuThu({ id: 3, source_type: "sales_invoice", sales_invoice_id: null, order_id: 40 }));
    expect(await screen.findByText("Không đọc được số của hoá đơn này.")).toBeInTheDocument();
    expect(screen.queryByText("Đang tải hoá đơn…")).toBeNull();
  });

  it("phiếu cũ chờ thu chuyển khoản: Xác nhận đã thu mở khung tại chỗ, thiếu mã giao dịch thì lỗi trong khung", async () => {
    const dau = phieuThu({
      id: 5, code: "PT-260820-OLD1", status: "waiting_receipt", receipt_method: "bank_transfer",
      source_type: "purchase_refund", payment_voucher_id: 9, payment_voucher_code: "UNC-260810-AB12",
      received_at: null, received_by_name: null, received_by_user_id: null,
    });
    goi.markReceiptReceived.mockResolvedValue({ ...dau, status: "received", bank_reference: "FT2608" });
    const p = ve(dau);
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận đã thu" }));
    const khung = screen.getByRole("region", { name: "Xác nhận đã thu PT-260820-OLD1" });
    await userEvent.click(within(khung).getByRole("button", { name: "Xác nhận đã thu" }));
    expect(within(khung).getByRole("alert")).toHaveTextContent("Thu qua ngân hàng phải có mã giao dịch hoặc số báo có.");
    expect(goi.markReceiptReceived).not.toHaveBeenCalled();

    await userEvent.type(within(khung).getByLabelText(/Mã giao dịch ngân hàng/), " FT2608 ");
    await userEvent.click(within(khung).getByRole("button", { name: "Xác nhận đã thu" }));
    expect(goi.markReceiptReceived).toHaveBeenCalledWith("token-test", 5, "FT2608");
    await waitFor(() => expect(p.onDoi).toHaveBeenCalled());

    // Sửa chỉ còn cho phiếu cũ chờ thu từ phiếu chi.
    expect(screen.queryByRole("region", { name: /Xác nhận đã thu/ })).toBeNull();
  });

  it("phiếu cũ chờ thu TIỀN MẶT có mã giao dịch sót lại: xác nhận gửi null như bản cũ", async () => {
    const dau = phieuThu({
      id: 8, code: "PT-260820-OLD2", status: "waiting_receipt", receipt_method: "cash", bank_reference: "FT-SOT",
      source_type: "purchase_refund", payment_voucher_id: 9, received_at: null,
    });
    goi.markReceiptReceived.mockReset();
    goi.markReceiptReceived.mockResolvedValue({ ...dau, status: "received" });
    ve(dau);
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận đã thu" }));
    const khung = screen.getByRole("region", { name: "Xác nhận đã thu PT-260820-OLD2" });
    expect(within(khung).queryByLabelText(/Mã giao dịch ngân hàng/)).toBeNull();
    await userEvent.click(within(khung).getByRole("button", { name: "Xác nhận đã thu" }));
    expect(goi.markReceiptReceived).toHaveBeenCalledWith("token-test", 8, null);
  });

  it("Sửa hiện cho phiếu cũ chờ thu từ phiếu chi; phiếu đã thu thì không", async () => {
    const dau = phieuThu({ id: 5, status: "waiting_receipt", source_type: "purchase_refund", payment_voucher_id: 9 });
    const p = ve(dau);
    await userEvent.click(screen.getByRole("button", { name: "Sửa" }));
    expect(p.onSua).toHaveBeenCalledWith(dau);
  });

  it("Lịch sử: Lập, Xác nhận đã thu (phiếu cũ, xác nhận sau khi lập) và Hủy có người + lý do", async () => {
    ve(phieuThu({
      id: 6, status: "cancelled", source_type: "other", created_at: "2026-08-20T02:00:00Z",
      received_at: "2026-08-21T03:00:00Z", received_by_name: "Nguyễn Thị Luyến",
      cancelled_at: "2026-10-01T04:00:00Z", cancelled_by_name: "Phạm Thu Trang", cancel_reason: "Thu nhầm nên lập lại",
    }));
    await userEvent.click(screen.getByRole("tab", { name: /Lịch sử/ }));
    expect(screen.getByText("Lập phiếu thu")).toBeInTheDocument();
    expect(screen.getByText("Xác nhận đã thu")).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Thị Luyến")).toBeInTheDocument();
    expect(screen.getByText("Hủy phiếu")).toBeInTheDocument();
    expect(screen.getAllByText("Thu nhầm nên lập lại").length).toBeGreaterThan(0);
  });
});
