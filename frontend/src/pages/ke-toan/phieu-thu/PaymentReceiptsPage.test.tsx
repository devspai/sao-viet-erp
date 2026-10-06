/** Nối dây màn Phiếu thu (đặc tả PT-1, A.17, A.18): URL ↔ lọc + kỳ, lời gọi cùng kỳ, thẻ "Chờ thu" chỉ
 *  hiện khi còn phiếu cũ chờ thu, link "Thu hoá đơn" mở Công nợ phải thu đúng khách (lỗi 11). */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { khoangSo } from "../shared/kyKeToan";
import { phieuThu } from "./components/phieuMau";

const goi = vi.hoisted(() => ({
  receipts: vi.fn(),
  companyAccounts: vi.fn(),
  salesInvoices: vi.fn(),
  receiptAttachments: vi.fn(),
}));

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../auth/permissions", async (goc) => ({
  ...(await goc<typeof import("../../../auth/permissions")>()),
  useCan: () => () => true,
}));
vi.mock("../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../api/client")>()),
  api: { accounting: goi },
}));

import { PaymentReceiptsPage } from "./PaymentReceiptsPage";

const THE = { tat_ca: 32, xong: 31, xong_tien: 245_000_000, thieu_chung_tu: 3, da_huy: 1, cho: 0 };
const HD_ROW = phieuThu({
  id: 1, code: "PT-261005-K2M9", payer_name: "Thực phẩm An Phát", source_type: "sales_invoice",
  sales_invoice_id: 7, sales_invoice_number: "0001234", order_id: 40, order_code: "DH-0412",
  customer_name: "Thực phẩm An Phát",
});
const traVe = (the_loc = THE, items = [HD_ROW]) => ({ items, total: items.length, page: 1, size: 25, total_received_amount: 0, the_loc });

beforeEach(() => {
  goi.receipts.mockReset();
  goi.receipts.mockImplementation(async (_t: string, p: { size?: number; dem_only?: boolean }) =>
    p.size === 1 ? traVe({ ...THE, xong_tien: 266_300_000 }, []) : traVe(),
  );
  goi.companyAccounts.mockResolvedValue([]);
  goi.receiptAttachments.mockResolvedValue({ items: [] });
  goi.salesInvoices.mockResolvedValue({ items: [{ id: 7, customer_id: 12, customer_name: "Công ty CP Thực phẩm An Phát" }] });
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("PaymentReceiptsPage — nối dây", () => {
  it("mở từ link có lọc + kỳ: lời gọi chính mang đúng tham số, sắp theo ngày thu; mốc Ngày thu đọc từ URL", async () => {
    window.history.replaceState(
      null, "",
      "/?man=ke-toan-phieu-thu&ky=nam&moc=thu&the=thieu&q=PT-26&nguon=hd,coc&hinh_thuc=bank_transfer",
    );
    render(<PaymentReceiptsPage navigate={() => {}} />);
    await waitFor(() => expect(goi.receipts).toHaveBeenCalled());
    const nam = khoangSo({ loai: "nam", moc: "thu" });
    const p = goi.receipts.mock.calls.find((c) => c[1].size !== 1)![1];
    expect(p).toMatchObject({
      status: "received", chung_tu: "thieu", q: "PT-26", nguon: ["sales_invoice", "order_deposit"],
      hinh_thuc: "bank_transfer", tu_ngay: nam.tu, den_ngay: nam.den, moc: "thu", page: 1, sort: "-receipt_date",
    });
    expect(p.nhan).toBeUndefined();
    expect(screen.getByRole("textbox", { name: "Tìm phiếu thu" })).toHaveValue("PT-26");
    expect(screen.getByText("Sổ tiền vào. Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu.")).toBeInTheDocument();
  });

  it("kỳ có khoảng: thêm lời gọi cùng kỳ size 1; thẻ Đã thu lấy tiền + số phiếu + dòng cùng kỳ; không có thẻ Chờ thu khi cho = 0", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-thu&ky=thang");
    render(<PaymentReceiptsPage navigate={() => {}} />);
    await waitFor(() => expect(goi.receipts).toHaveBeenCalledTimes(2));
    expect(goi.receipts.mock.calls.map((c) => c[1].size)).toContain(1);
    const daThu = await screen.findByRole("button", { name: /Đã thu/ });
    await waitFor(() => expect(daThu).toHaveTextContent("245.000.000 đ"));
    expect(daThu).toHaveTextContent("31 phiếu");
    expect(daThu).toHaveTextContent("8% so với 266.300.000");
    expect(screen.getByRole("button", { name: /Thiếu chứng từ/ })).toHaveTextContent("chưa có báo có hoặc biên nhận");
    expect(screen.queryByRole("button", { name: /Chờ thu/ })).toBeNull();
    const u = new URLSearchParams(window.location.search);
    expect(u.get("man")).toBe("ke-toan-phieu-thu");
    expect(u.get("ky")).toBe("thang");
  });

  it("còn phiếu cũ chờ thu (cho > 0) thì hiện thẻ Chờ thu; bấm thẻ gửi status waiting_receipt", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-thu&ky=thang");
    goi.receipts.mockImplementation(async () => traVe({ ...THE, cho: 2 }));
    render(<PaymentReceiptsPage navigate={() => {}} />);
    const cho = await screen.findByRole("button", { name: /Chờ thu/ });
    expect(cho).toHaveTextContent("2");
    await userEvent.click(cho);
    await waitFor(() =>
      expect(goi.receipts.mock.calls.some((c) => c[1].status === "waiting_receipt" && !c[1].dem_only)).toBe(true),
    );
  });

  it("URL the=cho mà không còn phiếu chờ thu (cho = 0) thì về Tất cả", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-thu&ky=thang&the=cho");
    render(<PaymentReceiptsPage navigate={() => {}} />);
    await waitFor(() =>
      expect(goi.receipts.mock.calls.some((c) => c[1].status == null && !c[1].dem_only)).toBe(true),
    );
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("the")).toBe(false));
    expect(screen.getByRole("button", { name: /Tất cả/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("link Thu hoá đơn mở Công nợ phải thu, ngăn của đúng khách — không mở đơn bán (lỗi 11)", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-thu&ky=thang");
    const navigate = vi.fn();
    render(<PaymentReceiptsPage navigate={navigate} />);
    const dong = (await screen.findAllByRole("row"))[1];
    await userEvent.click(within(dong).getByRole("button", { name: "0001234" }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("ke-toan-cong-no-phai-thu", {
        focusReceivableCustomer: { id: 12, name: "Công ty CP Thực phẩm An Phát" },
      }),
    );
    expect(navigate).not.toHaveBeenCalledWith("don-hang-ban", expect.anything());
  });
});
