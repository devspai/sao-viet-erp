/** Ngăn khách hàng — phương án 2 (sổ chi tiết kiểu Xero, 06/10/2026) + ngăn chồng "Thu tiền" một hoá
 *  đơn (NPTh-3).
 *
 *  Khoá chặt: thẻ mã, khối số Còn nợ tới hôm nay | Tuổi nợ (chú thích chỉ mốc có tiền, bấm = lọc) |
 *  Hạn mức (còn được nợ / vượt, cho nợ) và KHÔNG có thẻ / dải vượt hạn mức nào khác; ba tab Còn nợ |
 *  Sao kê | Lịch sử; bảng hoá đơn "Số X" + ký hiệu + đơn + ngày đủ năm, hạn có "Còn / Trễ N ngày",
 *  một cột "Đã thu và trừ cọc"; sao kê có số dư chạy và in được; lịch sử mới nhất trên cùng; lập phiếu
 *  xong dòng hoá đơn đổi ngay; không nối mẩu thông tin bằng "·" / "•" / dấu phẩy.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgingBucket, ReceivablesDetail, SoChiTietCongNo } from "../../../../api/client";

const receivablesDetail = vi.fn();
const saoKeDoiTac = vi.fn();
const companyAccounts = vi.fn();
const createSalesInvoiceReceipt = vi.fn();
const contacts = vi.fn();

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../../api/client")>()),
  api: {
    accounting: {
      receivablesDetail: (...a: unknown[]) => receivablesDetail(...a),
      saoKeDoiTac: (...a: unknown[]) => saoKeDoiTac(...a),
      companyAccounts: (...a: unknown[]) => companyAccounts(...a),
      createSalesInvoiceReceipt: (...a: unknown[]) => createSalesInvoiceReceipt(...a),
    },
    customers: { contacts: (...a: unknown[]) => contacts(...a) },
  },
}));

import { ReceivablesDrawer } from "./ReceivablesDrawer";

const hd = {
  customer_id: 12, customer_name: "Thực phẩm An Phát", chua_dat_han: false, direct_received_amount: 0,
  deposit_offset_amount: 0, received_amount: 0,
};

const AGING: AgingBucket[] = [
  { key: "chua_toi_han", label: "Chưa tới hạn", amount: 150_000_000, count: 2 },
  { key: "d1_7", label: "Trễ 1–7 ngày", amount: 0, count: 0 },
  { key: "d8_15", label: "Trễ 8–15 ngày", amount: 0, count: 0 },
  { key: "d16_30", label: "Trễ 16–30 ngày", amount: 0, count: 0 },
  { key: "d31_60", label: "Trễ 31–60 ngày", amount: 36_000_000, count: 1 },
  { key: "d60_plus", label: "Trễ > 60 ngày", amount: 0, count: 0 },
];

function chiTiet(p: Partial<ReceivablesDetail> = {}): ReceivablesDetail {
  return {
    customer_id: 12, customer_name: "Thực phẩm An Phát", credit_limit: 250_000_000, payment_term_days: 30,
    vuot_han_muc: false, vuot_bao_nhieu: 0,
    items: [
      { ...hd, invoice_id: 1, invoice_symbol: "1C26TSV", invoice_number: "0001198", invoice_date: "2026-07-21",
        order_id: 40, order_code: "DH-0398", due_date: "2026-08-20", overdue_days: 46, aging_bucket: "d31_60",
        amount: 36_000_000, remaining_amount: 36_000_000 },
      { ...hd, invoice_id: 2, invoice_symbol: "1C26TSV", invoice_number: "0001234", invoice_date: "2026-09-22",
        order_id: 41, order_code: "DH-0412", due_date: "2026-10-22", overdue_days: 0, aging_bucket: null,
        amount: 96_000_000, deposit_offset_amount: 20_000_000, direct_received_amount: 32_000_000,
        received_amount: 52_000_000, remaining_amount: 44_000_000 },
      { ...hd, invoice_id: 3, invoice_symbol: null, invoice_number: "0001251", invoice_date: "2026-10-01",
        order_id: 42, order_code: "DH-0420", due_date: null, chua_dat_han: true, overdue_days: 0, aging_bucket: null,
        amount: 106_000_000, remaining_amount: 106_000_000 },
    ],
    paid: [],
    paid_total: 0,
    period_months: 3, all_history: false, total_due: 186_000_000, overdue_amount: 36_000_000, aging: AGING,
    received_in_period: 2_000_000, as_of: "2026-10-05",
    ...p,
  };
}

/** Sổ TK 131: hoá đơn ghi nợ, phiếu thu ghi có. Đầu kỳ khách nợ 36 tr. */
function soCai(p: Partial<SoChiTietCongNo> = {}): SoChiTietCongNo {
  return {
    tk: "131", tieu_de: "Sổ chi tiết", doi_tuong_id: 12, ma: "KH012", ten: "Thực phẩm An Phát",
    tu_ngay: "2026-10-01", den_ngay: "2026-10-31", dau_no: 36_000_000, dau_co: 0,
    dong: [
      { ngay: "2026-10-01", luc: null, loai: "hoa_don", so_ct: "1C26TSV 0001251", dien_giai: "Hoá đơn bán hàng",
        no: 106_000_000, co: 0, luy_ke_no: 142_000_000, luy_ke_co: 0 },
      { ngay: "2026-10-03", luc: null, loai: "phieu_thu", so_ct: "PT-300", dien_giai: "Thu tiền hoá đơn 0001234",
        no: 0, co: 32_000_000, luy_ke_no: 110_000_000, luy_ke_co: 0 },
    ],
    ps_no: 106_000_000, ps_co: 32_000_000, cuoi_no: 110_000_000, cuoi_co: 0,
    ...p,
  };
}

const KY = { tu: "2026-10-01", den: "2026-10-31" };
const navigate = vi.fn();
const onChanged = vi.fn();
const onClose = vi.fn();
const QUYEN = { thu: true, xemPhieuThu: true, xemKhach: true, xemDonBan: true };

function ve(o: {
  eventTick?: number; bucket?: "all" | "overdue" | "paid"; tuoi?: { khoa: string; nhan: string } | null;
  len?: () => void; xuong?: () => void;
} = {}) {
  return (
    <ReceivablesDrawer customerId={12} customerName="Thực phẩm An Phát" ma="KH012" bucket={o.bucket ?? "all"}
      tuoi={o.tuoi ?? null} ky={KY} eventTick={o.eventTick ?? 0} quyen={QUYEN} navigate={navigate} onClose={onClose}
      onChanged={onChanged} len={o.len} xuong={o.xuong} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  receivablesDetail.mockImplementation(async () => chiTiet());
  saoKeDoiTac.mockImplementation(async (_t, _ben, _id, ky: { tuNgay: string; denNgay: string }) =>
    soCai({ tu_ngay: ky.tuNgay, den_ngay: ky.denNgay }));
  contacts.mockResolvedValue({ items: [] });
  companyAccounts.mockResolvedValue([
    { id: 4, bank_name: "MB", account_number: "93313466 8", currency: "VND", is_active: true },
  ]);
});

async function moNgan(o?: Parameters<typeof ve>[0]) {
  render(ve(o));
  // Tab nhớ theo màn (bài trước có thể đã để ở Lịch sử) — đưa về Còn nợ.
  await userEvent.click(await screen.findByRole("tab", { name: /Còn nợ/ }));
}

describe("ReceivablesDrawer — đầu ngăn", () => {
  it("tên + thẻ mã, khối số còn nợ tới hôm nay, quá hạn, hạn mức còn được nợ, cho nợ; ba tab; hồ sơ khách", async () => {
    await moNgan();
    expect(screen.getByRole("heading", { name: "Thực phẩm An Phát" })).toBeInTheDocument();
    expect(screen.getByText("KH012")).toHaveClass("kt-the");
    expect(screen.getByText("Còn nợ tới 05/10/2026")).toBeInTheDocument();
    expect(screen.getByText("186.000.000 đ")).toHaveClass("kt-ndt__lon");
    expect(screen.getByText("36.000.000 đ")).toHaveClass("kt-do");
    expect(screen.getByText("250.000.000 đ")).toBeInTheDocument();
    expect(screen.getByText("Còn được nợ 64.000.000")).toBeInTheDocument();
    expect(screen.getByText("Cho nợ 30 ngày sau hoá đơn")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Còn nợ3", "Sao kê", "Lịch sử"]);
    await userEvent.click(screen.getByRole("button", { name: "Hồ sơ khách hàng" }));
    expect(navigate).toHaveBeenCalledWith("khach-hang", { openCustomerId: 12 });
  });

  it("chú thích tuổi nợ chỉ có mốc có tiền; bấm = lọc tab Còn nợ, thẻ lọc + Bỏ lọc; bấm lại = bỏ", async () => {
    await moNgan();
    const chu = within(screen.getByRole("group", { name: "Lọc theo tuổi nợ" })).getAllByRole("button");
    expect(chu.map((b) => b.textContent)).toEqual(["Chưa tới hạn150.000.000", "Trễ 31–60 ngày36.000.000"]);
    await userEvent.click(chu[1]);
    expect(chu[1]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Số 0001198")).toBeInTheDocument();
    expect(screen.queryByText("Số 0001234")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc" }));
    expect(screen.getByText("Số 0001234")).toBeInTheDocument();
    await userEvent.click(chu[0]);
    expect(screen.queryByText("Số 0001198")).toBeNull();
    await userEvent.click(chu[0]);
    expect(screen.getByText("Số 0001198")).toBeInTheDocument();
  });

  it("vượt hạn mức: chỉ nói ở khối hạn mức (đỏ, giải thích ở tooltip) — không thẻ cạnh tên, không dải cảnh báo", async () => {
    receivablesDetail.mockImplementation(async () =>
      chiTiet({ credit_limit: 150_000_000, vuot_han_muc: true, vuot_bao_nhieu: 36_000_000 }));
    await moNgan();
    const vuot = screen.getByText("Vượt 36.000.000");
    expect(vuot).toHaveClass("kt-do");
    expect(vuot).toHaveAttribute("title", "Chỉ là cảnh báo, vẫn bán và thu bình thường.");
    expect(screen.queryByText("Vượt hạn mức")).toBeNull();
    expect(document.querySelector(".kt-canh")).toBeNull();
  });

  it("chưa đặt hạn mức / chưa đặt số ngày cho nợ thì nói thẳng", async () => {
    receivablesDetail.mockImplementation(async () => chiTiet({ credit_limit: 0, payment_term_days: null }));
    await moNgan();
    expect(screen.getByText("Chưa đặt hạn mức")).toBeInTheDocument();
    expect(screen.getByText("Chưa đặt số ngày cho nợ")).toBeInTheDocument();
  });
});

describe("ReceivablesDrawer — tab Còn nợ", () => {
  it("hoá đơn 'Số X', ký hiệu, đơn (link), ngày đủ năm; hạn Trễ / Còn N ngày; một cột đã thu và trừ cọc", async () => {
    await moNgan();
    const dong = screen.getByText("Số 0001198").closest("tr")!;
    const o = within(dong);
    expect(o.getByText("Ký hiệu 1C26TSV")).toHaveClass("kt-the");
    expect(o.getByText("21/07/2026")).toBeInTheDocument();
    expect(o.getByText("Trễ 46 ngày")).toHaveClass("kt-pill--do");
    expect(o.getByText("36.000.000", { selector: "b" })).toHaveClass("kt-do");
    expect(dong.textContent).not.toMatch(/[·•]|, /);

    const dong2 = within(screen.getByText("Số 0001234").closest("tr")!);
    expect(dong2.getByText("Còn 17 ngày")).toHaveClass("kt-pill");
    expect(dong2.getByText("52.000.000")).toBeInTheDocument();
    expect(dong2.getByText("gồm trừ cọc 20.000.000")).toBeInTheDocument();
    expect(screen.getByText("Số 0001251").closest("tr")!).toHaveTextContent("Chưa đặt hạn");
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(
      ["Hoá đơn", "Hạn thu", "Giá trị", "Đã thu và trừ cọc", "Còn nợ", ""]);

    await userEvent.click(o.getByRole("button", { name: "Đơn DH-0398" }));
    expect(navigate).toHaveBeenCalledWith("don-hang-ban", { openOrderId: 40 });
    expect(screen.getByRole("dialog").textContent).not.toMatch(/[·•]/);
  });

  it("mở từ danh sách đang lọc mốc tuổi / bấm số Quá hạn: lọc sẵn và hiện thẻ lọc", async () => {
    await moNgan({ tuoi: { khoa: "chua_toi_han", nhan: "Chưa tới hạn" } });
    expect(screen.queryByText("Số 0001198")).toBeNull();
    expect(screen.getByText("Số 0001251")).toBeInTheDocument();
    expect(screen.getByText("Chưa tới hạn", { selector: ".kt-chip--loc" })).toHaveTextContent("Chưa tới hạn2");
  });

  it("bấm số Quá hạn ngoài bảng: thẻ lọc Quá hạn", async () => {
    await moNgan({ bucket: "overdue" });
    expect(screen.getByText("Quá hạn", { selector: ".kt-chip--loc" })).toHaveTextContent("Quá hạn1");
    expect(screen.queryByText("Số 0001234")).toBeNull();
  });

  it("sự kiện đẩy nạp lại ngăn", async () => {
    const { rerender } = render(ve());
    await screen.findByRole("tab", { name: /Còn nợ/ });
    receivablesDetail.mockClear();
    rerender(ve({ eventTick: 1 }));
    await waitFor(() => expect(receivablesDetail).toHaveBeenCalledTimes(1));
  });
});

describe("ReceivablesDrawer — Sao kê và Lịch sử", () => {
  it("bấm số Đã thu ngoài bảng mở thẳng Sao kê: đầu kỳ, số dư chạy, cuối kỳ; phiếu thu mở được", async () => {
    render(ve({ bucket: "paid" }));
    const bang = await screen.findByRole("table");
    expect(saoKeDoiTac).toHaveBeenCalledWith("token-test", "receivables", 12, { tuNgay: KY.tu, denNgay: KY.den });
    const dong = within(bang).getAllByRole("row").slice(1).map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(dong).toEqual([
      ["01/10/2026", "", "Số dư đầu kỳ", "", "", "36.000.000"],
      ["01/10/2026", "1C26TSV 0001251", "Hoá đơn bán hàng", "106.000.000", "", "142.000.000"],
      ["03/10/2026", "PT-300", "Thu tiền hoá đơn 0001234", "", "32.000.000", "110.000.000"],
      ["31/10/2026", "", "Số dư cuối kỳ", "106.000.000", "32.000.000", "110.000.000"],
    ]);
    expect(screen.getByText("Số dư = khách còn nợ mình")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "PT-300" }));
    expect(navigate).toHaveBeenCalledWith("ke-toan-phieu-thu", { focusReceiptQuery: "PT-300" });
  });

  it("đổi kỳ sao kê thì tải lại đúng khoảng; Tuỳ chọn ngược thì báo, không gọi máy chủ", async () => {
    render(ve({ bucket: "paid" }));
    await screen.findByRole("table");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Kỳ sao kê" }), "namtruoc");
    await waitFor(() => expect(saoKeDoiTac).toHaveBeenLastCalledWith("token-test", "receivables", 12,
      { tuNgay: expect.stringMatching(/-01-01$/), denNgay: expect.stringMatching(/-12-31$/) }));
    saoKeDoiTac.mockClear();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Kỳ sao kê" }), "tuy");
    const tu = screen.getByLabelText("Từ ngày");
    await userEvent.clear(tu);
    await userEvent.type(tu, "2026-12-01");
    expect(await screen.findByText("Ngày bắt đầu phải trước ngày kết thúc.")).toBeInTheDocument();
    expect(saoKeDoiTac).not.toHaveBeenCalledWith("token-test", "receivables", 12, { tuNgay: "2026-12-01", denNgay: KY.den });
  });

  it("In sao kê: sang tab Sao kê và mở bản in có tên, mã, kỳ, bảng và chỗ ký", async () => {
    await moNgan();
    await userEvent.click(screen.getByRole("button", { name: "In sao kê" }));
    expect(screen.getByRole("tab", { name: "Sao kê" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("SAO KÊ CÔNG NỢ")).toBeInTheDocument();
    const ban = document.querySelector(".psheet") as HTMLElement;
    expect(ban).toHaveTextContent("Thực phẩm An Phát");
    expect(ban).toHaveTextContent("KH012");
    expect(ban).toHaveTextContent("01/10/2026 đến 31/10/2026");
    expect(within(ban).getByText("Xác nhận của khách hàng")).toBeInTheDocument();
    // Bản in không có link mở phiếu.
    expect(within(ban).queryByRole("button", { name: "PT-300" })).toBeNull();
    // Esc lúc đang xem bản in không đóng ngăn.
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(within(document.querySelector(".ps-dialog-actions") as HTMLElement).getByRole("button", { name: "Đóng" }));
    expect(document.querySelector(".psheet")).toBeNull();
  });

  it("Lịch sử: mọi chứng từ từ đầu tới hôm nay, mới nhất trên cùng, kèm việc hoá đơn trễ hạn", async () => {
    await moNgan();
    await userEvent.click(screen.getByRole("tab", { name: "Lịch sử" }));
    await waitFor(() => expect(saoKeDoiTac).toHaveBeenLastCalledWith("token-test", "receivables", 12,
      { tuNgay: "2000-01-01", denNgay: "2026-10-05" }));
    const viec = [...document.querySelectorAll(".kt-ls__muc")].map((m) => [
      m.querySelector("b")!.textContent, m.querySelector(".kt-ls__gio")!.textContent]);
    expect(viec).toEqual([
      ["Thu 32.000.000 đ", "03/10/2026"],
      ["Xuất hoá đơn 1C26TSV 0001251", "01/10/2026"],
      ["Hoá đơn số 0001198 quá hạn chưa thu đủ", "21/08/2026"],
    ]);
  });
});

/** Bấm "Thu" ở dòng hoá đơn ⇒ ngăn chồng (lớp thứ hai, role dialog) mang tên hoá đơn. */
async function moThu(soHd: string, o?: Parameters<typeof ve>[0]) {
  await moNgan(o);
  await userEvent.click(screen.getByRole("button", { name: `Thu tiền hoá đơn số ${soHd}` }));
  return screen.findByRole("dialog", { name: new RegExp(`Thu tiền hoá đơn ${soHd}`) });
}

describe("ReceivablesDrawer — Thu tiền (NPTh-3)", () => {
  it("mở NGĂN CHỒNG trên ngăn khách; lập xong ngăn chồng đóng, dòng đổi ngay, thông báo đáy, Xem phiếu sang Phiếu thu", async () => {
    const ngan = await moThu("0001198");
    expect(screen.getAllByRole("dialog")).toHaveLength(2);

    // Nạp lại sau khi lập chưa về: dòng vẫn phải đổi ngay.
    createSalesInvoiceReceipt.mockResolvedValue({ id: 900, code: "PT-261006-AB12", amount_vnd: 10_000_000 });
    receivablesDetail.mockImplementation(() => new Promise(() => {}));
    const o = within(ngan).getByRole("textbox", { name: /Số tiền thu/ });
    await userEvent.clear(o);
    await userEvent.type(o, "10000000");
    await userEvent.click(within(ngan).getByRole("button", { name: "Lập phiếu thu" }));

    expect(await screen.findByText("Đã lập PT-261006-AB12")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const dongMoi = screen.getByText("Số 0001198").closest("tr")!;
    expect(within(dongMoi).getByText("26.000.000")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Xem phiếu" }));
    expect(navigate).toHaveBeenCalledWith("ke-toan-phieu-thu", { focusReceiptQuery: "PT-261006-AB12" });
  });
});

describe("ReceivablesDrawer — giữ nháp ngăn Thu tiền", () => {
  it("gõ dở rồi Esc: hỏi bằng hộp của app; Nhập tiếp thì ở lại, Bỏ thì chỉ đóng ngăn chồng, ngăn khách còn", async () => {
    const ngan = await moThu("0001198");
    await userEvent.type(within(ngan).getByRole("textbox", { name: /Người nộp tiền/ }), "x");
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByText("Bỏ phiếu đang nhập?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nhập tiếp" }));
    expect(screen.getByRole("dialog", { name: /Thu tiền hoá đơn 0001198/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await screen.findByRole("button", { name: "Bỏ" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Thu tiền hoá đơn/ })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /Còn nợ/ })).toBeInTheDocument();
  });

  it("chưa gõ gì: Esc đóng ngăn chồng không hỏi", async () => {
    await moThu("0001234");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Thu tiền hoá đơn/ })).toBeNull());
    expect(screen.queryByText("Bỏ phiếu đang nhập?")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("phím ↑ ↓ thuộc lớp trên cùng: ngăn chồng đang mở thì không sang khách khác", async () => {
    const len = vi.fn();
    const xuong = vi.fn();
    const ngan = await moThu("0001198", { len, xuong });
    await userEvent.click(within(ngan).getByRole("radio", { name: "Chuyển khoản" }));
    await userEvent.keyboard("{ArrowDown}");
    expect(xuong).not.toHaveBeenCalled();
  });
});
