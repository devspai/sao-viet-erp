/** Nối dây màn Công nợ phải thu (NPTh-1): URL → kỳ + lọc → tham số máy chủ, cùng kỳ, số nhóm nút từ
 *  `the_loc`, khối tổng quan, bảng, dòng lỗi riêng; mở ngăn đúng mốc tuổi đang lọc.
 *
 *  Liên thông từ Phiếu thu (lỗi 11): mở theo một khách thì chỉ tải MỘT lượt bảng, đã tìm sẵn theo tên
 *  khách và mở ngăn đúng khách đó. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReceivablesSummary } from "../../../api/client";
import { homNayVN, kyCungKy, tinhKy } from "../../../utils/ky";

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
};

function tomTat(p: Partial<ReceivablesSummary> = {}): ReceivablesSummary {
  return {
    items: [AN_PHAT],
    total: 1, page: 1, size: 25, pages: 1,
    total_due: 1_316_700_000, overdue_amount: 184_000_000, received_in_period: 318_500_000, ban_trong_ky: 412_000_000,
    vuot_han_muc_count: 1, the_loc: { tat_ca: 26, qua_han: 7, vuot_han_muc: 1 }, aging: AGING, period_months: 3,
    tu_ngay: "2026-10-01", den_ngay: "2026-10-05", as_of: "2026-10-05",
    ...p,
  };
}

const goiChinh = () => goi.receivables.mock.calls.filter((c) => !c[1].dem_only && c[1].size !== 1);

beforeEach(() => {
  goi.receivables.mockReset();
  goi.receivables.mockImplementation(async (_t: string, p: { size?: number }) =>
    p.size === 1 ? tomTat({ total_due: 1_102_000_000, overdue_amount: 150_000_000 }) : tomTat(),
  );
  kh.sales.mockReset().mockResolvedValue([{ id: 5, name: "Trần Văn Nam" }, { id: 6, name: "Lê Thị Hoa" }]);
  kh.tagLabels.mockReset().mockResolvedValue(["Nhà sách", "VIP"]);
  nganMo.props = null;
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("AccountingReceivablesPage — nối dây", () => {
  it("mở từ link: kỳ, nhóm nút, mốc tuổi, ô tìm, bộ lọc (cả người phụ trách và nhãn) → đúng tham số", async () => {
    window.history.replaceState(
      null, "",
      "/?man=ke-toan-cong-no-phai-thu&ky=nam&so=1&the=overdue&tuoi=d31_60&q=An&no_tu=5000000&han_tra=7_ngay&han_muc=vuot&het=1&pt=5&nhan=VIP",
    );
    render(<AccountingReceivablesPage navigate={() => {}} />);
    await waitFor(() => expect(goiChinh().length).toBeGreaterThan(0));
    const nam = tinhKy("nam", homNayVN());
    expect(goiChinh()[0][1]).toEqual({
      q: "An", filter: "overdue", aging: "d31_60", tu_ngay: nam.tu, den_ngay: nam.den,
      no_tu: 5_000_000, no_den: undefined, han_tra: "7_ngay", han_muc: "vuot", ca_da_tra_het: true,
      thieu_hoa_don: undefined, phu_trach_id: 5, nhan: "VIP", page: 1, size: 25,
    });
    expect(goiChinh()).toHaveLength(1);
    const cung = kyCungKy(nam);
    await waitFor(() => expect(goi.receivables.mock.calls.some((c) => c[1].size === 1)).toBe(true));
    expect(goi.receivables.mock.calls.find((c) => c[1].size === 1)![1]).toMatchObject({
      tu_ngay: cung.tu, den_ngay: cung.den, phu_trach_id: 5, nhan: "VIP", chi_tong: true,
    });
    expect(goiChinh()[0][1].chi_tong).toBeUndefined();

    // Số nhóm nút đọc `the_loc` — không có lời `dem_only` nào ngoài bảng lọc.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Quá hạn/ })).toHaveTextContent("Quá hạn7"));
    expect(screen.getByRole("button", { name: /^Tất cả/ })).toHaveTextContent("Tất cả26");
    expect(goi.receivables.mock.calls.filter((c) => c[1].dem_only)).toEqual([]);

    expect(screen.getByRole("textbox", { name: "Tìm khách hàng" })).toHaveValue("An");
    expect(screen.getByRole("button", { name: /^Tuổi nợ:/ })).toHaveTextContent("Tuổi nợ: Trễ 31–60 ngày");
    expect(screen.getByRole("button", { name: /^Hạn thu:/ })).toBeInTheDocument();
    // Tên người phụ trách dịch từ danh sách màn Khách hàng dùng.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Phụ trách:/ })).toHaveTextContent("Phụ trách: Trần Văn Nam"));
    expect(screen.getByRole("button", { name: /^Nhãn:/ })).toHaveTextContent("Nhãn: VIP");
    expect(kh.sales).toHaveBeenCalledWith("token-test");
    expect(kh.tagLabels).toHaveBeenCalledWith("token-test");
  });

  it("đặt kỳ qua URL (Tuỳ chọn) và khối tổng quan bốn số phía thu", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=tuy&tu=2026-08-01&den=2026-09-30&so=1");
    render(<AccountingReceivablesPage navigate={() => {}} />);
    await waitFor(() => expect(goiChinh().length).toBeGreaterThan(0));
    expect(goiChinh()[0][1]).toMatchObject({ tu_ngay: "2026-08-01", den_ngay: "2026-09-30" });
    await screen.findByText("Còn nợ tới 05/10/2026");
    expect(screen.getByText("Trong đó quá hạn")).toBeInTheDocument();
    expect(screen.getByText("Bán thêm trong kỳ")).toBeInTheDocument();
    expect(screen.getByText("Đã thu trong kỳ", { selector: ".kt-tq *" })).toBeInTheDocument();
    // Quá hạn tăng so với cùng kỳ (184 triệu so với 150 triệu) ⇒ dòng cùng kỳ đỏ.
    await waitFor(() => expect(screen.getByText("Cùng kỳ 150.000.000")).toHaveClass("kt-cung-ky--do"));
  });

  it("bảng: dòng phụ số hoá đơn, quá hạn đỏ, hạn thu gần nhất, đã thu trong kỳ, hạn mức; không nối bằng dấu", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=thang&so=0");
    goi.receivables.mockImplementation(async () =>
      tomTat({ items: [AN_PHAT, { ...AN_PHAT, customer_id: 13, customer_name: "Nhà sách Minh Tâm", total_due: 0,
        overdue_amount: 0, aging: {}, han_gan_nhat: null, credit_limit: 0 }], total: 2 }),
    );
    render(<AccountingReceivablesPage navigate={() => {}} />);
    const dong = (await screen.findAllByText("Thực phẩm An Phát"))[0].closest("tr")!;
    const o = within(dong);
    expect(o.getByText("4 hoá đơn")).toBeInTheDocument();
    expect(o.getByRole("button", { name: "36.000.000" })).toHaveClass("kt-do");
    expect(o.getByText("20/08/2026")).toBeInTheDocument();
    expect(o.getByRole("button", { name: "310.000.000" })).toBeInTheDocument();
    expect(o.getByText("186 trên 250 triệu")).toBeInTheDocument();
    expect(dong.textContent).not.toMatch(/[·•]|, /);
    const het = screen.getAllByText("Nhà sách Minh Tâm")[0].closest("tr")!;
    expect(within(het).getByText("Đã thu hết")).toHaveClass("kt-the");
    expect(within(het).getByText("Chưa đặt")).toHaveClass("kt-mo");
    expect(screen.getByText("2 khách hàng")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Hạn thu gần nhất" })).toBeInTheDocument();
  });

  it("tải lỗi: dòng lỗi riêng, không nói 'chưa có khách hàng'", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=thang&so=0");
    goi.receivables.mockRejectedValue(new Error("mạng"));
    render(<AccountingReceivablesPage navigate={() => {}} />);
    expect((await screen.findAllByText("Không tải được công nợ phải thu."))[0].closest("[role=alert]")).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có khách hàng|Không còn khách hàng/)).toBeNull();
    expect(screen.getByText(/KHÔNG phải bằng 0/)).toBeInTheDocument();
  });

  it("đang lọc một mốc tuổi nợ: bấm dòng mở ngăn kèm mốc đó; bấm số Quá hạn / Đã thu mở đúng chỗ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no-phai-thu&ky=thang&so=0&tuoi=d31_60");
    render(<AccountingReceivablesPage navigate={() => {}} />);
    const dong = (await screen.findAllByText("Thực phẩm An Phát"))[0].closest("tr")!;
    await userEvent.click(dong);
    await screen.findByRole("dialog");
    expect(nganMo.props).toMatchObject({
      customerId: 12, customerName: "Thực phẩm An Phát", bucket: "all",
      tuoi: { khoa: "d31_60", nhan: "Trễ 31–60 ngày" },
    });
    await userEvent.click(within(dong).getByRole("button", { name: "310.000.000" }));
    await waitFor(() => expect(nganMo.props).toMatchObject({ bucket: "paid" }));
  });
});

describe("AccountingReceivablesPage — mở theo khách", () => {
  it("focusCustomer: một lượt tải bảng, đã mang tên khách, không tải thừa lần rỗng, ngăn mở đúng khách", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-thu");
    render(<AccountingReceivablesPage navigate={() => {}} focusCustomer={{ id: 12, name: "Thực phẩm An Phát" }} />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("Ngăn Thực phẩm An Phát");
    await new Promise((r) => setTimeout(r, 400));
    // Một lượt tải = một lời bảng (+ một lời cùng kỳ size 1 nếu đang so sánh); mọi lời đều mang tên khách.
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
