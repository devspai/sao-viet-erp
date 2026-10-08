/** Nối dây màn Công nợ phải thu (NPTh-1, phương án A 07/10/2026): URL → kỳ + lọc → tham số máy chủ, số
 *  dải tab từ `the_loc`, lưới hai bộ cột với dòng Cộng từ `tong_loc`, dòng lỗi riêng; mở ngăn đúng mốc
 *  tuổi đang lọc.
 *
 *  Liên thông từ Phiếu thu (lỗi 11): mở theo một khách thì chỉ tải MỘT lượt bảng, đã tìm sẵn theo tên
 *  khách và mở ngăn đúng khách đó. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReceivablesSummary } from "../../../api/client";
import { khoangSo } from "../shared/kyKeToan";

const goi = vi.hoisted(() => ({ receivables: vi.fn() }));
const kh = vi.hoisted(() => ({ sales: vi.fn(), tagLabels: vi.fn() }));
const nganMo = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../auth/permissions", async (g) => ({
  ...(await g<typeof import("../../../auth/permissions")>()),
  useCan: () => () => true,
}));
vi.mock("../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../api/client")>()),
  api: { accounting: goi, customers: kh },
}));
vi.mock("./components/ReceivablesDrawer", () => ({
  ReceivablesDrawer: (p: { customerName: string }) => {
    nganMo.props = p;
    return <div role="dialog">{`Ngăn ${p.customerName}`}</div>;
  },
}));

import { AccountingReceivablesPage } from "./AccountingReceivablesPage";

const AGING = [
  { key: "chua_toi_han", label: "Chưa tới hạn", amount: 150_000_000, count: 3 },
  { key: "d1_7", label: "Trễ 1–7 ngày", amount: 0, count: 0 },
  { key: "d8_15", label: "Trễ 8–15 ngày", amount: 0, count: 0 },
  { key: "d16_30", label: "Trễ 16–30 ngày", amount: 0, count: 0 },
  { key: "d31_60", label: "Trễ 31–60 ngày", amount: 36_000_000, count: 1 },
  { key: "d60_plus", label: "Trễ > 60 ngày", amount: 0, count: 0 },
];

const AN_PHAT = {
  customer_id: 12, customer_name: "Thực phẩm An Phát", invoice_count: 4, invoiced_amount: 500_000_000,
  received_amount: 314_000_000, total_due: 186_000_000, overdue_amount: 36_000_000, no_han_amount: 150_000_000,
  credit_limit: 250_000_000, payment_term_days: 30, vuot_han_muc: false, vuot_bao_nhieu: 0,
  aging: { chua_toi_han: { amount: 150_000_000, count: 3 }, d31_60: { amount: 36_000_000, count: 1 } },
  received_in_period: 310_000_000, ban_trong_ky: 412_000_000, han_gan_nhat: "2026-08-20", sale_user_id: 5,
  customer_code: "KH004", lien_he_ten: "Ngô Hoàng Thắng", lien_he_sdt: "0355325423", sale_user_name: "Nguyễn Thị Huyền",
  thu_gan_nhat_ngay: "2026-10-03", thu_gan_nhat_tien: 15_000_000,
};

/** Khách đã thu hết (hiện nhờ "kể cả đã thu hết"): không hạn mức, không cho nợ, không liên hệ. */
const HET = {
  ...AN_PHAT, customer_id: 13, customer_name: "Nhà sách Minh Tâm", total_due: 0, overdue_amount: 0, aging: {},
  han_gan_nhat: null, credit_limit: 0, payment_term_days: null, customer_code: "KH009", lien_he_ten: null,
  lien_he_sdt: null, sale_user_name: null, thu_gan_nhat_ngay: null, thu_gan_nhat_tien: 0,
};

function tomTat(p: Partial<ReceivablesSummary> = {}): ReceivablesSummary {
  return {
    items: [AN_PHAT],
    total: 1, page: 1, size: 25, pages: 1,
    total_due: 1_316_700_000, overdue_amount: 184_000_000, received_in_period: 318_500_000, ban_trong_ky: 412_000_000,
    vuot_han_muc_count: 1, the_loc: { tat_ca: 26, qua_han: 7, vuot_han_muc: 1 }, aging: AGING, period_months: 3,
    tu_ngay: "2026-10-01", den_ngay: "2026-10-05", as_of: "2026-10-05",
    tong_loc: {
      so_doi_tac: 3, so_khoan: 9, con_no: 1_316_700_000,
      aging: { chua_toi_han: 1_132_700_000, d1_7: 0, d8_15: 148_000_000, d16_30: 0, d31_60: 36_000_000, d60_plus: 0 },
      qua_han: 184_000_000, trong_ky_1: 412_000_000, trong_ky_2: 318_500_000,
    },
    ...p,
  };
}

const goiChinh = () => goi.receivables.mock.calls.filter((c) => !c[1].dem_only && c[1].size !== 1);

beforeEach(() => {
  goi.receivables.mockReset();
  goi.receivables.mockImplementation(async () => tomTat());
  kh.sales.mockReset().mockResolvedValue([{ id: 5, name: "Trần Văn Nam" }, { id: 6, name: "Lê Thị Hoa" }]);
  kh.tagLabels.mockReset().mockResolvedValue(["Nhà sách", "VIP"]);
  nganMo.props = null;
  window.localStorage.removeItem("kt-cong-no-cot");
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("AccountingReceivablesPage — nối dây", () => {
  it("mở từ link: kỳ, dải tab, mốc tuổi, ô tìm, bộ lọc (cả người phụ trách và nhãn) → đúng tham số", async () => {
    window.history.replaceState(
      null, "",
      "/?man=ke-toan-cong-no-phai-thu&ky=nam&the=overdue&tuoi=d31_60&q=An&no_tu=5000000&han_tra=7_ngay&han_muc=vuot&het=1&pt=5&nhan=VIP",
    );
    render(<AccountingReceivablesPage navigate={() => {}} />);
    await waitFor(() => expect(goiChinh().length).toBeGreaterThan(0));
    // "Năm nay" của thanh lọc chung = trọn năm; máy chủ tự chặn cuối kỳ ở hôm nay.
    const nam = khoangSo({ loai: "nam", moc: "ps" });
    expect(goiChinh()[0][1]).toEqual({
      q: "An", filter: "overdue", aging: "d31_60", tu_ngay: nam.tu, den_ngay: nam.den,
      no_tu: 5_000_000, no_den: undefined, han_tra: "7_ngay", han_muc: "vuot", ca_da_tra_het: true,
      thieu_hoa_don: undefined, phu_trach_id: 5, nhan: "VIP", page: 1, size: 25,
    });
    expect(goiChinh()).toHaveLength(1);
    expect(goiChinh()[0][1].chi_tong).toBeUndefined();

    // Số dải tab đọc `the_loc` — không lời `dem_only` nào, không lời cùng kỳ.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Quá hạn/ })).toHaveTextContent("Quá hạn7"));
    expect(screen.getByRole("button", { name: /^Tất cả/ })).toHaveTextContent("Tất cả26");
    expect(goi.receivables.mock.calls.filter((c) => c[1].dem_only || c[1].chi_tong || c[1].size === 1)).toEqual([]);

    expect(screen.getByRole("textbox", { name: "Tìm khách hàng" })).toHaveValue("An");
    expect(screen.getByRole("button", { name: /^Tuổi nợ:/ })).toHaveAccessibleName("Tuổi nợ: Trễ 31–60 ngày. Bấm để sửa");
    expect(screen.getByRole("button", { name: /^Hạn thu:/ })).toBeInTheDocument();
    // Tên người phụ trách dịch từ danh sách màn Khách hàng dùng.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Người phụ trách:/ })).toHaveAccessibleName("Người phụ trách: Trần Văn Nam. Bấm để sửa"));
    expect(screen.getByRole("button", { name: /^Nhãn khách hàng:/ })).toHaveAccessibleName("Nhãn khách hàng: VIP. Bấm để sửa");
    expect(kh.sales).toHaveBeenCalledWith("token-test");
    expect(kh.tagLabels).toHaveBeenCalledWith("token-test");
  });

  it("đặt kỳ qua URL (Tuỳ chọn); không còn khối tổng quan, dòng Cộng cuối bảng đọc tong_loc phía thu", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=tuy&tu=2026-08-01&den=2026-09-30");
    const { container } = render(<AccountingReceivablesPage navigate={() => {}} />);
    await waitFor(() => expect(goiChinh().length).toBeGreaterThan(0));
    expect(goiChinh()[0][1]).toMatchObject({ tu_ngay: "2026-08-01", den_ngay: "2026-09-30" });
    await screen.findByText("Còn nợ tới 05/10/2026");
    expect(container.querySelector(".kt-tq")).toBeNull();
    expect(screen.queryByText(/so cùng kỳ/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Tìm khách hàng" })).toHaveAttribute("placeholder", "Tìm khách hàng, kể cả đã thu hết");
    const cong = screen.getByText("Cộng 3 khách hàng", { selector: ".lds-dinh-trai" }).closest("tr")!;
    expect(cong).toHaveClass("lds-cong");
    const oc = within(cong);
    expect(oc.getByText("9")).toBeInTheDocument();
    expect(oc.getByText("1.316.700.000")).toBeInTheDocument();
    expect(oc.getByText("148.000.000").closest("td")).toHaveClass("lds-do");
    expect(oc.getByText("quá hạn 184.000.000")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Hoá đơn" })).toBeInTheDocument();
  });

  it("bộ cột Tuổi nợ: số hoá đơn, mốc tuổi, hạn mức rút gọn, đã dùng; khách đã thu hết", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=thang");
    goi.receivables.mockImplementation(async () => tomTat({ items: [AN_PHAT, HET], total: 2 }));
    render(<AccountingReceivablesPage navigate={() => {}} />);
    const dong = (await screen.findAllByText("Thực phẩm An Phát"))[0].closest("tr")!;
    const o = within(dong);
    expect(o.getByText("4")).toBeInTheDocument();
    expect(o.getByText("186.000.000")).toBeInTheDocument();
    expect(o.getByText("150.000.000")).toBeInTheDocument();
    expect(o.getByRole("button", { name: "36.000.000" }).closest("td")).toHaveClass("lds-do");
    expect(o.getByText("20/08/2026")).toBeInTheDocument();
    expect(o.getByText("250 tr")).toBeInTheDocument();
    expect(o.getByText("74%")).not.toHaveClass("lds-do");
    expect(o.getByText("74%")).not.toHaveClass("lds-vang");
    expect(dong.textContent).not.toMatch(/[·•]|, |khoản/);
    const het = within(screen.getAllByText("Nhà sách Minh Tâm")[0].closest("tr")!);
    expect(het.getByText("đã thu hết")).toHaveClass("lds-mu3");
    expect(het.getByText("chưa đặt")).toHaveClass("lds-mu3");
    expect(screen.getByRole("columnheader", { name: "Hạn sớm nhất" })).toBeInTheDocument();
  });

  it("bộ cột Trong kỳ và liên hệ: bán / thu trong kỳ, thu gần nhất, cho nợ, phụ trách, liên hệ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=thang");
    goi.receivables.mockImplementation(async () => tomTat({ items: [AN_PHAT, HET], total: 2 }));
    render(<AccountingReceivablesPage navigate={() => {}} />);
    await screen.findAllByText("Thực phẩm An Phát");
    await userEvent.click(screen.getByRole("button", { name: "Trong kỳ và liên hệ" }));
    for (const ten of ["Hoá đơn", "Bán trong kỳ", "Thu trong kỳ", "Thu gần nhất", "Số tiền", "Cho nợ", "Phụ trách",
      "Người liên hệ", "Điện thoại"]) {
      expect(screen.getByRole("columnheader", { name: ten })).toBeInTheDocument();
    }
    const cong = within(screen.getByText("Cộng 3 khách hàng", { selector: ".lds-dinh-trai" }).closest("tr")!);
    expect(cong.getByText("412.000.000")).toBeInTheDocument();
    expect(cong.getByText("318.500.000")).toBeInTheDocument();
    const o = within(screen.getAllByText("Thực phẩm An Phát")[0].closest("tr")!);
    expect(o.getByText("412.000.000")).toBeInTheDocument();
    expect(o.getByRole("button", { name: "310.000.000" })).toBeInTheDocument();
    expect(o.getByText("03/10/2026")).toBeInTheDocument();
    expect(o.getByText("15.000.000")).toBeInTheDocument();
    expect(o.getByText("30 ngày")).toBeInTheDocument();
    expect(o.getByText("Nguyễn Thị Huyền")).toBeInTheDocument();
    expect(o.getByText("Ngô Hoàng Thắng")).toBeInTheDocument();
    expect(o.getByText("0355 325 423")).toBeInTheDocument();
    const het = within(screen.getAllByText("Nhà sách Minh Tâm")[0].closest("tr")!);
    expect(het.getByText("chưa thu lần nào")).toHaveClass("lds-mu3");
    expect(het.getByText("chưa đặt")).toHaveClass("lds-mu3");
    expect(het.getByText("chưa có")).toHaveClass("lds-mu3");
  });

  it("sắp xếp ở máy chủ: bấm tiêu đề cột gửi sap_xep + chieu, bấm lại đảo chiều, ghi lên URL", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=thang");
    render(<AccountingReceivablesPage navigate={() => {}} />);
    await screen.findAllByText("Thực phẩm An Phát");
    const conNo = screen.getByRole("columnheader", { name: "Còn nợ" });
    expect(conNo).toHaveAttribute("aria-sort", "descending");
    await userEvent.click(within(conNo).getByRole("button"));
    await waitFor(() => expect(goi.receivables).toHaveBeenCalledWith("token-test",
      expect.objectContaining({ sap_xep: "con_no", chieu: "asc" })));
    await userEvent.click(within(screen.getByRole("columnheader", { name: "Hạn sớm nhất" })).getByRole("button"));
    await waitFor(() => expect(goi.receivables).toHaveBeenCalledWith("token-test",
      expect.objectContaining({ sap_xep: "han", chieu: "asc" })));
    await userEvent.click(screen.getByRole("button", { name: "Trong kỳ và liên hệ" }));
    await userEvent.click(within(screen.getByRole("columnheader", { name: "Thu gần nhất" })).getByRole("button"));
    await waitFor(() => expect(goi.receivables).toHaveBeenCalledWith("token-test",
      expect.objectContaining({ sap_xep: "gan_nhat", chieu: "asc", page: 1 })));
    expect(screen.getByRole("columnheader", { name: "Thu gần nhất" })).toHaveAttribute("aria-sort", "ascending");
    expect(window.location.search).toContain("sx=gan_nhat.asc");
  });

  it("đổi sang bộ cột không có cột đang sắp thì sắp xếp về mặc định (còn nợ giảm dần)", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=thang");
    render(<AccountingReceivablesPage navigate={() => {}} />);
    await screen.findAllByText("Thực phẩm An Phát");
    await userEvent.click(within(screen.getByRole("columnheader", { name: "Hạn sớm nhất" })).getByRole("button"));
    await waitFor(() => expect(goiChinh().at(-1)![1]).toMatchObject({ sap_xep: "han", chieu: "asc" }));
    // Bộ "Trong kỳ và liên hệ" không có cột Hạn sớm nhất.
    await userEvent.click(screen.getByRole("button", { name: "Trong kỳ và liên hệ" }));
    await waitFor(() => expect(goiChinh().at(-1)![1].sap_xep).toBeUndefined());
    expect(screen.getByRole("columnheader", { name: "Còn nợ" })).toHaveAttribute("aria-sort", "descending");
    expect(window.location.search).not.toContain("sx=");

    // Ngược lại: sắp "Thu gần nhất" rồi về bộ Tuổi nợ (không có cột đó) ⇒ cũng về mặc định.
    await userEvent.click(within(screen.getByRole("columnheader", { name: "Thu gần nhất" })).getByRole("button"));
    await waitFor(() => expect(goiChinh().at(-1)![1]).toMatchObject({ sap_xep: "gan_nhat" }));
    await userEvent.click(screen.getByRole("button", { name: "Tuổi nợ" }));
    await waitFor(() => expect(goiChinh().at(-1)![1].sap_xep).toBeUndefined());

    // Còn nợ có ở cả hai bộ ⇒ đổi bộ cột giữ nguyên.
    await userEvent.click(within(screen.getByRole("columnheader", { name: "Còn nợ" })).getByRole("button"));
    await waitFor(() => expect(goiChinh().at(-1)![1]).toMatchObject({ sap_xep: "con_no", chieu: "asc" }));
    const truoc = goiChinh().length;
    await userEvent.click(screen.getByRole("button", { name: "Trong kỳ và liên hệ" }));
    expect(screen.getByRole("columnheader", { name: "Còn nợ" })).toHaveAttribute("aria-sort", "ascending");
    expect(goiChinh()).toHaveLength(truoc);
  });

  it("tải lỗi: dòng lỗi riêng, không nói 'chưa có khách hàng'", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=thang");
    goi.receivables.mockRejectedValue(new Error("mạng"));
    render(<AccountingReceivablesPage navigate={() => {}} />);
    // Câu lỗi nói MỘT lần, trong khối bảng rỗng: chữ đậm là lỗi, dòng dưới là luật "để trống, không phải 0".
    const loi = await screen.findByText("Không tải được công nợ phải thu.");
    const khoi = loi.closest("[role=alert]")!;
    expect(khoi).toBeInTheDocument();
    expect(within(khoi as HTMLElement).getByText("Các con số đang để trống, KHÔNG phải bằng 0.")).toBeInTheDocument();
    expect(screen.getAllByText(/KHÔNG phải bằng 0/)).toHaveLength(1);
    expect(screen.queryByText("Còn nợ tới", { exact: false })).toBeNull();
    expect(screen.queryByText(/Chưa có khách hàng|Không còn khách hàng/)).toBeNull();
  });

  it("đang lọc một mốc tuổi nợ: bấm dòng mở ngăn kèm mốc đó; bấm số quá hạn / thu trong kỳ mở đúng chỗ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=thang&tuoi=d31_60");
    render(<AccountingReceivablesPage navigate={() => {}} />);
    const dong = (await screen.findAllByText("Thực phẩm An Phát"))[0].closest("tr")!;
    await userEvent.click(dong);
    await screen.findByRole("dialog");
    expect(nganMo.props).toMatchObject({
      customerId: 12, customerName: "Thực phẩm An Phát", bucket: "all",
      tuoi: { khoa: "d31_60", nhan: "Trễ 31–60 ngày" },
    });
    await userEvent.click(within(dong).getByRole("button", { name: "36.000.000" }));
    await waitFor(() => expect(nganMo.props).toMatchObject({ bucket: "overdue" }));
    await userEvent.click(screen.getByRole("button", { name: "Trong kỳ và liên hệ" }));
    const dong2 = screen.getAllByText("Thực phẩm An Phát")[0].closest("tr")!;
    await userEvent.click(within(dong2).getByRole("button", { name: "310.000.000" }));
    await waitFor(() => expect(nganMo.props).toMatchObject({ bucket: "paid" }));
  });
});

describe("AccountingReceivablesPage — mở theo khách", () => {
  it("focusCustomer: một lượt tải bảng, đã mang tên khách, không tải thừa lần rỗng, ngăn mở đúng khách", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-thu");
    render(<AccountingReceivablesPage navigate={() => {}} focusCustomer={{ id: 12, name: "Thực phẩm An Phát" }} />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("Ngăn Thực phẩm An Phát");
    await new Promise((r) => setTimeout(r, 400));
    // Một lượt tải = một lời bảng; mọi lời đều mang tên khách.
    expect(goiChinh()).toHaveLength(1);
    expect(goiChinh()[0][1]).toMatchObject({ q: "Thực phẩm An Phát", filter: "all", page: 1 });
    expect(goi.receivables.mock.calls.every((c) => c[1].q === "Thực phẩm An Phát")).toBe(true);
    expect(nganMo.props).toMatchObject({ customerId: 12 });
  });

  it("khách không có trong danh sách (đã thu đủ) vẫn mở ngăn theo mã khách", async () => {
    goi.receivables.mockImplementation(async () => tomTat({ items: [], total: 0 }));
    render(<AccountingReceivablesPage navigate={() => {}} focusCustomer={{ id: 99, name: "Khách đã thu đủ" }} />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("Ngăn Khách đã thu đủ");
    expect(nganMo.props).toMatchObject({ customerId: 99 });
  });
});
