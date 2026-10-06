/** Ngăn nhà cung cấp — phương án 2 (sổ chi tiết kiểu Xero, 06/10/2026) + ngăn chồng "Trả nhiều đợt"
 *  (NPT-3).
 *
 *  Khoá chặt: ba tab Còn nợ | Sao kê | Lịch sử; số trên tab Còn nợ = số đợt CÒN nợ (lỗi 7); vượt hạn
 *  mức chỉ nói ở khối hạn mức; chú thích tuổi nợ bấm = lọc đợt; sao kê TK 331 đọc ngược chiều (nhận
 *  hàng tăng, trả tiền giảm); tích đợt ⇒ chân tối có tổng; Esc ở ngăn chồng chỉ đóng ngăn chồng (lỗi
 *  6); sự kiện đẩy nạp lại ngăn (lỗi 8); payload lập phiếu GIỮ Y NGUYÊN như bản cũ (tiền thật); không
 *  nối mẩu thông tin bằng "·" / "•".
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgingBucket, PayablesDetail, PurchaseRequestStatus, SoChiTietCongNo } from "../../../../api/client";
import { homNayVN } from "../../../../utils/ky";

const payablesDetail = vi.fn();
const saoKeDoiTac = vi.fn();
const companyAccounts = vi.fn();
const createVouchersBatch = vi.fn();
const uploadVoucherAttachment = vi.fn();

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../tenDonVi", () => ({ useNapTenDonVi: () => 0, tenDonVi: (u: string) => (u === "to" ? "tờ" : u) }));
vi.mock("../../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../../api/client")>()),
  api: {
    accounting: {
      payablesDetail: (...a: unknown[]) => payablesDetail(...a),
      saoKeDoiTac: (...a: unknown[]) => saoKeDoiTac(...a),
      companyAccounts: (...a: unknown[]) => companyAccounts(...a),
      createVouchersBatch: (...a: unknown[]) => createVouchersBatch(...a),
      uploadVoucherAttachment: (...a: unknown[]) => uploadVoucherAttachment(...a),
    },
  },
}));

import { BatchPaymentDialog } from "./BatchPaymentDialog";
import { PayablesDrawer } from "./PayablesDrawer";

const ST = "purchased" as PurchaseRequestStatus;
const dot = {
  status: ST, lines: [], invoice_number: null, invoice_date: null, hoa_don_files: [], paid: 0, coc_bu: 0,
  chua_dat_han: false, overdue_days: 0, aging_bucket: null, da_tat_toan: false,
};

const AGING: AgingBucket[] = [
  { key: "chua_toi_han", label: "Chưa tới hạn", amount: 70_000_000, count: 2 },
  { key: "d1_7", label: "Trễ 1–7 ngày", amount: 0, count: 0 },
  { key: "d8_15", label: "Trễ 8–15 ngày", amount: 0, count: 0 },
  { key: "d16_30", label: "Trễ 16–30 ngày", amount: 0, count: 0 },
  { key: "d31_60", label: "Trễ 31–60 ngày", amount: 26_500_000, count: 1 },
  { key: "d60_plus", label: "Trễ > 60 ngày", amount: 0, count: 0 },
];

/** Sổ TK 331: đợt giao ghi CÓ (mình nợ thêm), phiếu chi ghi NỢ. Đầu kỳ mình nợ 50 tr. */
function soCai(p: Partial<SoChiTietCongNo> = {}): SoChiTietCongNo {
  return {
    tk: "331", tieu_de: "Sổ chi tiết", doi_tuong_id: 7, ma: "NCC007", ten: "Giấy Bình Minh",
    tu_ngay: "2026-10-01", den_ngay: "2026-10-31", dau_no: 0, dau_co: 50_000_000,
    dong: [
      { ngay: "2026-10-02", luc: null, loai: "phieu_chi", so_ct: "PC-0090", dien_giai: "Chi trả nhà cung cấp",
        no: 30_000_000, co: 0, luy_ke_no: 0, luy_ke_co: 20_000_000 },
      { ngay: "2026-10-04", luc: null, loai: "dot_giao", so_ct: "PMH-0015 đợt 1", dien_giai: "Hàng đã nhận",
        no: 0, co: 68_400_000, luy_ke_no: 0, luy_ke_co: 88_400_000 },
    ],
    ps_no: 30_000_000, ps_co: 68_400_000, cuoi_no: 0, cuoi_co: 88_400_000,
    ...p,
  };
}

function chiTiet(p: Partial<PayablesDetail> = {}): PayablesDetail {
  return {
    supplier_id: 7, supplier_name: "Giấy Bình Minh", credit_limit: 80_000_000, credit_days: 30,
    vuot_han_muc: true, vuot_bao_nhieu: 16_500_000,
    items: [
      { ...dot, purchase_request_id: 12, code: "PMH-0012", delivery_id: 101, seq_no: 1, delivery_date: "2026-07-01",
        due_date: "2026-07-31", amount: 20_000_000, coc_bu: 20_000_000, con_no: 0, da_tat_toan: true },
      { ...dot, purchase_request_id: 12, code: "PMH-0012", delivery_id: 102, seq_no: 2, delivery_date: "2026-07-19",
        due_date: "2026-08-18", overdue_days: 48, aging_bucket: "d31_60", invoice_number: "0001234",
        invoice_date: "2026-07-19", amount: 36_500_000, coc_bu: 10_000_000, con_no: 26_500_000,
        lines: [{ item_name: "Giấy Couche 150", unit: "to", quantity: 5000, unit_price: 5300, thanh_tien: 26_500_000, du: 200 }] },
      { ...dot, purchase_request_id: 15, code: "PMH-0015", delivery_id: 103, seq_no: 1, delivery_date: "2026-09-20",
        due_date: "2026-10-20", amount: 68_400_000, con_no: 68_400_000 },
      { ...dot, purchase_request_id: 9, code: "PMH-0009", delivery_id: null, seq_no: null, delivery_date: null,
        due_date: null, chua_dat_han: true, amount: 1_600_000, con_no: 1_600_000 },
    ],
    coc_chung: [{ purchase_request_id: 12, code: "PMH-0012", status: ST, amount: 30_000_000, da_dung: 30_000_000, con_du: 0 }],
    coc_chung_amount: 30_000_000,
    paid: [
      { voucher_id: 90, code: "PC-0090", doc_no: null, voucher_type: "cash", payment_stage: "advance", delivery_id: null,
        delivery_seq_no: null, purchase_request_id: 12, purchase_code: "PMH-0012", amount: 30_000_000,
        invoice_number: null, invoice_date: null, has_attachment: false, paid_date: "2026-06-20",
        created_by_user_id: 3, created_by_name: "Nguyễn Thu Hà" },
    ],
    period_months: 3, all_history: false, total_due: 96_500_000, overdue_amount: 26_500_000, aging: AGING,
    paid_in_period: 30_000_000, as_of: "2026-10-05",
    ...p,
  };
}

const KY = { tu: "2026-10-01", den: "2026-10-31" };
const navigate = vi.fn();
const onChanged = vi.fn();
const onClose = vi.fn();

function ve(eventTick = 0, bucket: "all" | "overdue" | "paid" = "all") {
  return (
    <PayablesDrawer supplierId={7} supplierName="Giấy Bình Minh" ma="NCC007" bucket={bucket} ky={KY} eventTick={eventTick}
      quyen={{ lap: true, xemDonMua: true, xemNcc: true, xemPhieuChi: true }}
      navigate={navigate} onClose={onClose} onChanged={onChanged} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  payablesDetail.mockImplementation(async () => chiTiet());
  saoKeDoiTac.mockImplementation(async (_t, _ben, _id, ky: { tuNgay: string; denNgay: string }) =>
    soCai({ tu_ngay: ky.tuNgay, den_ngay: ky.denNgay }));
  companyAccounts.mockResolvedValue([
    { id: 4, bank_name: "Vietcombank", account_number: "0281000456789", currency: "VND", is_active: true },
  ]);
  createVouchersBatch.mockResolvedValue({
    vouchers: [
      { id: 501, code: "PC-0101", voucher_date: homNayVN() },
      { id: 502, code: "PC-0102", voucher_date: homNayVN() },
    ],
    total_amount: 94_900_000,
  });
});

async function moTabNo() {
  render(ve());
  await screen.findByRole("tab", { name: /Còn nợ/ });
  await userEvent.click(screen.getByRole("tab", { name: /Còn nợ/ }));
}

describe("PayablesDrawer — NPT-2", () => {
  it("đầu ngăn: thẻ mã, vượt hạn mức CHỈ ở khối hạn mức; ba tab, Còn nợ đếm đợt CÒN nợ (lỗi 7)", async () => {
    await moTabNo();
    expect(screen.getByRole("heading", { name: "Giấy Bình Minh" })).toBeInTheDocument();
    expect(screen.getByText("NCC007")).toHaveClass("kt-the");
    expect(screen.getByText("Còn nợ tới 05/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Vượt 16.500.000")).toHaveAttribute("title", "Chỉ là cảnh báo, vẫn đặt mua được.");
    expect(screen.queryByText("Vượt hạn mức")).toBeNull();
    expect(document.querySelector(".kt-canh")).toBeNull();
    expect(screen.getByText("Cho nợ 30 ngày sau mỗi đợt giao")).toBeInTheDocument();
    // 4 dòng nhưng 1 đợt đã trả xong (mờ, để dò cọc) ⇒ còn nợ 3.
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Còn nợ3", "Sao kê", "Lịch sử"]);
    await userEvent.click(screen.getByRole("button", { name: "Hồ sơ nhà cung cấp" }));
    expect(navigate).toHaveBeenCalledWith("nha-cung-cap", { openSupplierId: 7 });
  });

  it("nhóm theo đơn: đầu nhóm cọc bằng thẻ nhỏ, không nối bằng dấu chấm giữa / dấu phẩy", async () => {
    await moTabNo();
    const nhom = screen.getByRole("group", { name: "Đơn PMH-0012" });
    expect(within(nhom).getByText("Cọc 30.000.000")).toHaveClass("kt-the");
    // Chỉ "Cọc" là thẻ; "Đã trừ" / "Còn" là chữ thường mờ.
    expect(within(nhom).getByText("Đã trừ 30.000.000")).toHaveClass("kt-mo");
    expect(within(nhom).getByText("Đã trừ 30.000.000")).not.toHaveClass("kt-the");
    // Ô "chọn mọi đợt của đơn" nằm ở ô đầu cột của bảng, như bản xem.
    expect(within(nhom).getByRole("checkbox", { name: "Chọn mọi đợt còn nợ của PMH-0012" }).closest("th")).not.toBeNull();
    expect(within(nhom).getByText("Trễ 48 ngày")).toBeInTheDocument();
    const ngan = screen.getByRole("dialog", { name: "Giấy Bình Minh" });
    expect(ngan.textContent).not.toMatch(/[·•]/);
    expect(ngan.textContent).not.toMatch(/\d, đã trừ|, còn dư/);
    await userEvent.click(within(nhom).getByRole("button", { name: "PMH-0012" }));
    expect(navigate).toHaveBeenCalledWith("ke-toan-don-mua-hang", { focusRequestCode: "PMH-0012" });
  });

  it("tích đợt ⇒ chân tối 'Đã chọn n đợt' + tổng; đợt Cả đơn không tích được; Bỏ chọn", async () => {
    await moTabNo();
    expect(screen.getByRole("checkbox", { name: "Chọn Cả đơn của PMH-0009" })).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: "Chọn Đợt 1 của PMH-0012" })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn Đợt 2 của PMH-0012" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn Đợt 1 của PMH-0015" }));
    const chan = document.querySelector(".kt-ngan__chan--toi") as HTMLElement;
    expect(chan).not.toBeNull();
    expect(within(chan).getByText(/Đã chọn 2 đợt/)).toBeInTheDocument();
    expect(within(chan).getByText("94.900.000 đ").tagName).toBe("B");
    expect(within(chan).getByRole("button", { name: "Trả 2 đợt" })).toBeInTheDocument();
    await userEvent.click(within(chan).getByRole("button", { name: "Bỏ chọn" }));
    expect(document.querySelector(".kt-ngan__chan--toi")).toBeNull();
  });

  it("bấm dòng mở khối Hàng của đợt GẤP ngay dưới, bấm lại thì gấp", async () => {
    await moTabNo();
    const dong = screen.getByText("Đợt 2").closest("tr")!;
    await userEvent.click(dong);
    expect(screen.getByText("Giấy Couche 150")).toBeInTheDocument();
    expect(screen.getByText("5.000 tờ")).toBeInTheDocument();
    expect(screen.getByText("Dư 200 tờ")).toHaveClass("kt-the");
    expect(dong).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(dong);
    expect(screen.queryByText("Giấy Couche 150")).toBeNull();
  });

  it("Esc trên dòng đang mở khối hàng thì gấp khối, ngăn vẫn mở; Esc lần nữa mới đóng ngăn", async () => {
    await moTabNo();
    const dong = screen.getByText("Đợt 2").closest("tr")!;
    await userEvent.click(dong);
    expect(dong).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Giấy Couche 150")).toBeNull();
    expect(dong).toHaveAttribute("aria-expanded", "false");
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("sự kiện đẩy nạp lại ngăn (lỗi 8)", async () => {
    const { rerender } = render(ve(0));
    await waitFor(() => expect(payablesDetail).toHaveBeenCalledTimes(1));
    expect(payablesDetail).toHaveBeenLastCalledWith("token-test", 7, false, { tu_ngay: KY.tu, den_ngay: KY.den },
      { paid_page: 1, paid_size: 10 });
    rerender(ve(1));
    await waitFor(() => expect(payablesDetail).toHaveBeenCalledTimes(2));
  });

  it("bấm mốc tuổi nợ: chỉ còn đợt CÒN nợ của mốc đó, xoá lựa chọn; Bỏ lọc hiện lại đủ", async () => {
    await moTabNo();
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn Đợt 1 của PMH-0015" }));
    const chu = within(screen.getByRole("group", { name: "Lọc theo tuổi nợ" })).getAllByRole("button");
    expect(chu.map((b) => b.textContent)).toEqual(["Chưa tới hạn70.000.000", "Trễ 31–60 ngày26.500.000"]);
    await userEvent.click(chu[1]);
    expect(document.querySelector(".kt-ngan__chan--toi")).toBeNull();
    expect(screen.getByText("Trễ 31–60 ngày", { selector: ".kt-chip--loc" })).toHaveTextContent("Trễ 31–60 ngày1");
    expect(screen.queryByRole("group", { name: "Đơn PMH-0015" })).toBeNull();
    expect(screen.queryByText("Đợt 1")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc" }));
    expect(screen.getByRole("group", { name: "Đơn PMH-0015" })).toBeInTheDocument();
  });

  it("hạn trả chưa tới: thẻ Còn N ngày so với ngày máy chủ tính nợ", async () => {
    await moTabNo();
    const dong = within(screen.getByRole("group", { name: "Đơn PMH-0015" })).getByText("20/10/2026").closest("tr")!;
    expect(within(dong).getByText("Còn 15 ngày")).toHaveClass("kt-pill");
  });

  it("bấm số Đã trả ngoài bảng mở Sao kê: nhận hàng là cột tăng, trả tiền là cột giảm, số dư = mình còn nợ", async () => {
    render(ve(0, "paid"));
    const bang = await screen.findByRole("table");
    expect(saoKeDoiTac).toHaveBeenCalledWith("token-test", "payables", 7, { tuNgay: KY.tu, denNgay: KY.den });
    expect(within(bang).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(
      ["Ngày", "Chứng từ", "Diễn giải", "Nhận hàng", "Đã trả", "Số dư"]);
    const dong = within(bang).getAllByRole("row").slice(1).map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(dong).toEqual([
      ["01/10/2026", "", "Số dư đầu kỳ", "", "", "50.000.000"],
      ["02/10/2026", "PC-0090", "Chi trả nhà cung cấp", "", "30.000.000", "20.000.000"],
      ["04/10/2026", "PMH-0015 đợt 1", "Hàng đã nhận", "68.400.000", "", "88.400.000"],
      ["31/10/2026", "", "Số dư cuối kỳ", "68.400.000", "30.000.000", "88.400.000"],
    ]);
    expect(screen.getByText("Số dư = mình còn nợ nhà cung cấp")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "PC-0090" }));
    expect(navigate).toHaveBeenCalledWith("ke-toan-phieu-chi", { focusVoucherQuery: "PC-0090" });
  });

  it("Lịch sử: mới nhất trên cùng, có việc đợt trễ hạn", async () => {
    await moTabNo();
    await userEvent.click(screen.getByRole("tab", { name: "Lịch sử" }));
    await waitFor(() => expect(document.querySelectorAll(".kt-ls__muc").length).toBe(3));
    const viec = [...document.querySelectorAll(".kt-ls__muc")].map((m) => [
      m.querySelector("b")!.textContent, m.querySelector(".kt-ls__gio")!.textContent]);
    expect(viec).toEqual([
      ["Nhận hàng PMH-0015 đợt 1", "04/10/2026"],
      ["Trả 30.000.000 đ", "02/10/2026"],
      ["PMH-0012 đợt 2 quá hạn chưa trả đủ", "19/08/2026"],
    ]);
  });
});

describe("BatchPaymentDialog — NPT-3", () => {
  async function moTra() {
    await moTabNo();
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn Đợt 2 của PMH-0012" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn Đợt 1 của PMH-0015" }));
    await userEvent.click(screen.getByRole("button", { name: "Trả 2 đợt" }));
    return screen.findByRole("dialog", { name: "Trả 2 đợt cùng lúc" });
  }

  it("ngăn chồng giữ ẢNH CHỤP các đợt lúc mở: ngăn dưới nạp lại hỏng vẫn không mất form", async () => {
    const { rerender } = render(ve(0));
    await screen.findByRole("tab", { name: /Còn nợ/ });
    await userEvent.click(screen.getByRole("tab", { name: /Còn nợ/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn Đợt 2 của PMH-0012" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Chọn Đợt 1 của PMH-0015" }));
    await userEvent.click(screen.getByRole("button", { name: "Trả 2 đợt" }));
    await screen.findByRole("dialog", { name: "Trả 2 đợt cùng lúc" });
    payablesDetail.mockRejectedValue(new Error("mất mạng"));
    rerender(ve(1));
    await waitFor(() => expect(payablesDetail).toHaveBeenCalledTimes(2));
    await screen.findByText("Không tải được chi tiết công nợ.");
    const ngan = screen.getByRole("dialog", { name: "Trả 2 đợt cùng lúc" });
    expect(within(ngan).getByRole("button", { name: "Lập 2 phiếu chi" })).toBeEnabled();
  });

  it("không có đợt nào thì nút lập bị khoá", async () => {
    render(<BatchPaymentDialog supplierName="Giấy Bình Minh" items={[]} onClose={() => {}} onSaved={() => {}} />);
    const ngan = await screen.findByRole("dialog", { name: "Trả 0 đợt cùng lúc" });
    expect(within(ngan).getByRole("button", { name: "Lập 0 phiếu chi" })).toBeDisabled();
  });

  it("chứng từ hỏng ở từ ba phiếu: 'PC-a, PC-b và PC-c'", async () => {
    uploadVoucherAttachment.mockRejectedValue(new Error("mất mạng"));
    createVouchersBatch.mockResolvedValueOnce({
      vouchers: [
        { id: 501, code: "PC-0101", voucher_date: homNayVN() },
        { id: 502, code: "PC-0102", voucher_date: homNayVN() },
        { id: 503, code: "PC-0103", voucher_date: homNayVN() },
      ],
      total_amount: 94_900_000,
    });
    const ngan = await moTra();
    const o = ngan.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(o, { target: { files: [new File(["x"], "unc.pdf", { type: "application/pdf" })] } });
    });
    await userEvent.click(within(ngan).getByRole("button", { name: "Lập 2 phiếu chi" }));
    expect(await within(ngan).findByText(/PC-0101, PC-0102 và PC-0103/)).toBeInTheDocument();
  });

  it("Esc chỉ đóng ngăn chồng, ngăn nhà cung cấp vẫn mở (lỗi 6)", async () => {
    await moTra();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Trả 2 đợt cùng lúc" })).toBeNull());
    expect(screen.getByRole("dialog", { name: "Giấy Bình Minh" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("tiền mặt: payload Y NGUYÊN bản cũ; lập xong báo 'Đã lập 2 phiếu chi' và nạp lại", async () => {
    const ngan = await moTra();
    expect(within(ngan).getByText("Mỗi đợt ra một phiếu chi riêng")).toBeInTheDocument();
    expect(within(ngan).getByText("Tổng phải trả").nextElementSibling).toHaveTextContent("94.900.000 đ");
    expect(within(ngan).getByText("Ảnh chứng từ gắn vào cả 2 phiếu")).toBeInTheDocument();
    const chan = ngan.querySelector(".kt-ngan__xt") as HTMLElement;
    expect(chan.textContent).toBe("Lập 2 phiếu chi tổng 94.900.000 đ");
    expect(within(ngan).getByRole("textbox", { name: /Người nhận tiền/ })).toHaveValue("Giấy Bình Minh");
    const goiTruoc = payablesDetail.mock.calls.length;
    await userEvent.click(within(ngan).getByRole("button", { name: "Lập 2 phiếu chi" }));
    await waitFor(() => expect(createVouchersBatch).toHaveBeenCalledTimes(1));
    expect(createVouchersBatch.mock.calls[0][1]).toStrictEqual({
      items: [
        { purchase_request_id: 12, delivery_id: 102 },
        { purchase_request_id: 15, delivery_id: 103 },
      ],
      voucher_type: "cash",
      voucher_date: homNayVN(),
      currency: "VND",
      exchange_rate: 1,
      content: null,
      company_bank_account_id: null,
      cash_recipient_name: "Giấy Bình Minh",
      cash_recipient_address: null,
      cash_recipient_identity: null,
      beneficiary_account_holder: null,
      beneficiary_account_number: null,
      beneficiary_bank_name: null,
      beneficiary_bank_branch: null,
      bank_fee_bearer: "payer",
    });
    expect(await screen.findByText("Đã lập 2 phiếu chi")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Trả 2 đợt cùng lúc" })).toBeNull();
    await waitFor(() => expect(payablesDetail.mock.calls.length).toBeGreaterThan(goiTruoc));
    expect(onChanged).toHaveBeenCalled();
    // "Xem phiếu" đưa sang tab Lịch sử (phiếu vừa lập đứng đầu).
    await userEvent.click(screen.getByRole("button", { name: "Xem phiếu" }));
    expect(screen.getByRole("tab", { name: "Lịch sử" })).toHaveAttribute("aria-selected", "true");
  });

  it("chuyển khoản: thiếu ô thì lỗi tại ô, không gọi; đủ thì payload đúng trường ngân hàng", async () => {
    const ngan = await moTra();
    await userEvent.click(within(ngan).getByRole("radio", { name: "Chuyển khoản" }));
    await userEvent.click(within(ngan).getByRole("button", { name: "Lập 2 phiếu chi" }));
    expect(createVouchersBatch).not.toHaveBeenCalled();
    expect(within(ngan).getByText("Chọn tài khoản công ty dùng để chi.")).toBeInTheDocument();
    expect(within(ngan).getByText("Ghi số tài khoản người nhận.")).toBeInTheDocument();

    await userEvent.selectOptions(within(ngan).getByRole("combobox", { name: /Trả từ tài khoản/ }), "4");
    await userEvent.type(within(ngan).getByRole("textbox", { name: /Số tài khoản/ }), "0011223344");
    await userEvent.type(within(ngan).getByRole("textbox", { name: /^Ngân hàng/ }), "ACB");
    await userEvent.click(within(ngan).getByRole("button", { name: "Lập 2 phiếu chi" }));
    await waitFor(() => expect(createVouchersBatch).toHaveBeenCalledTimes(1));
    expect(createVouchersBatch.mock.calls[0][1]).toStrictEqual({
      items: [
        { purchase_request_id: 12, delivery_id: 102 },
        { purchase_request_id: 15, delivery_id: 103 },
      ],
      voucher_type: "bank_transfer",
      voucher_date: homNayVN(),
      currency: "VND",
      exchange_rate: 1,
      content: null,
      company_bank_account_id: 4,
      cash_recipient_name: null,
      cash_recipient_address: null,
      cash_recipient_identity: null,
      beneficiary_account_holder: "Giấy Bình Minh",
      beneficiary_account_number: "0011223344",
      beneficiary_bank_name: "ACB",
      beneficiary_bank_branch: null,
      bank_fee_bearer: "payer",
    });
  });

  it("chứng từ: gắn vào TỪNG phiếu; tải hỏng thì ở lại, nêu mã phiếu nối bằng 'và'", async () => {
    uploadVoucherAttachment.mockRejectedValue(new Error("mất mạng"));
    const ngan = await moTra();
    const tep = new File(["x"], "unc.pdf", { type: "application/pdf" });
    const o = ngan.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(o, { target: { files: [tep] } });
    });
    await userEvent.click(within(ngan).getByRole("button", { name: "Lập 2 phiếu chi" }));
    await waitFor(() => expect(uploadVoucherAttachment).toHaveBeenCalledTimes(2));
    expect(uploadVoucherAttachment.mock.calls.map((c) => c[1])).toEqual([501, 502]);
    expect(await within(ngan).findByText(/PC-0101 và PC-0102/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Trả 2 đợt cùng lúc" })).toBeInTheDocument();
    await userEvent.click(within(ngan).getByRole("button", { name: "Xong" }));
    expect(await screen.findByText("Đã lập 2 phiếu chi")).toBeInTheDocument();
  });
});
