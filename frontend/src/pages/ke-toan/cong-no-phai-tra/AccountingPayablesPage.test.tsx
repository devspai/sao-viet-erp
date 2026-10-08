/** Nối dây màn Công nợ phải trả (khuôn lưới chung `lds-*`, 08/10/2026): URL → kỳ + lọc → tham số máy
 *  chủ, số trên hàng lọc nhanh, lưới hai bộ cột ("Tuổi nợ" | "Trong kỳ và liên hệ") với dòng Cộng cuối
 *  bảng đọc `tong_loc` của máy chủ. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PayablesSummary } from "../../../api/client";
import { khoangSo } from "../shared/kyKeToan";

const payables = vi.fn();

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../auth/permissions", async (goc) => ({
  ...(await goc<typeof import("../../../auth/permissions")>()),
  useCan: () => () => true,
}));
vi.mock("../../tenDonVi", () => ({ useNapTenDonVi: () => 0, tenDonVi: (u: string) => u }));
vi.mock("../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../api/client")>()),
  api: {
    accounting: {
      payables: (...a: unknown[]) => payables(...a),
      payablesDetail: vi.fn(() => new Promise(() => {})),
      companyAccounts: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { AccountingPayablesPage } from "./AccountingPayablesPage";

const AGING = [
  { key: "chua_toi_han", label: "Chưa tới hạn", amount: 70_000_000, count: 4 },
  { key: "d1_7", label: "Trễ 1–7 ngày", amount: 0, count: 0 },
  { key: "d8_15", label: "Trễ 8–15 ngày", amount: 0, count: 0 },
  { key: "d16_30", label: "Trễ 16–30 ngày", amount: 0, count: 0 },
  { key: "d31_60", label: "Trễ 31–60 ngày", amount: 26_500_000, count: 1 },
  { key: "d60_plus", label: "Trễ > 60 ngày", amount: 0, count: 0 },
];

function tomTat(p: Partial<PayablesSummary> = {}): PayablesSummary {
  return {
    items: [
      {
        supplier_id: 7, supplier_name: "Giấy Bình Minh", order_count: 2, overdue_amount: 26_500_000,
        no_han_amount: 70_000_000, credit_limit: 80_000_000, credit_days: 30, vuot_han_muc: true,
        vuot_bao_nhieu: 16_500_000, paid_in_period: 42_000_000, mua_trong_ky: 51_200_000,
        han_gan_nhat: "2026-08-18", total_due: 96_500_000, supplier_code: "NCC007",
        lien_he_ten: "Nguyễn Lan", lien_he_sdt: "0912345678", tra_gan_nhat_ngay: "2026-09-30", tra_gan_nhat_tien: 42_000_000,
        aging: { chua_toi_han: { amount: 70_000_000, count: 4 }, d31_60: { amount: 26_500_000, count: 1 } },
      },
    ],
    total: 1, page: 1, size: 25, pages: 1,
    total_due: 96_500_000, overdue_amount: 26_500_000, paid_in_period: 42_000_000, mua_trong_ky: 51_200_000,
    vuot_han_muc_count: 1, aging: AGING, period_months: 3,
    tu_ngay: "2026-01-01", den_ngay: "2026-10-05", as_of: "2026-10-05",
    the_loc: { tat_ca: 18, qua_han: 4, vuot_han_muc: 2 },
    // Dòng Cộng của bộ lọc (mọi trang) — cố ý khác dòng đang hiện để biết màn đọc đúng `tong_loc`.
    tong_loc: {
      so_doi_tac: 2, so_khoan: 7, con_no: 131_700_000,
      aging: { chua_toi_han: 105_200_000, d1_7: 0, d8_15: 0, d16_30: 0, d31_60: 26_500_000, d60_plus: 0 },
      qua_han: 26_500_000, trong_ky_1: 63_000_000, trong_ky_2: 55_000_000,
    },
    ...p,
  };
}

beforeEach(() => {
  payables.mockReset();
  payables.mockImplementation(async () => tomTat());
  window.localStorage.removeItem("kt-cong-no-cot");
});
afterEach(() => window.history.replaceState(null, "", "/"));

const goiChinh = () => payables.mock.calls.filter((c) => !c[1].dem_only && c[1].size !== 1);

describe("AccountingPayablesPage — nối dây", () => {
  it("mở từ link: kỳ, dải tab, mốc tuổi, ô tìm, bộ lọc → đúng tham số; số trên dải tab từ the_loc", async () => {
    // Bộ nhớ kỳ là Map cấp module (sống qua các test) — đặt kỳ bằng URL cho test này độc lập.
    window.history.replaceState(
      null, "",
      "/?man=ke-toan-cong-no&ky=nam&the=overdue&tuoi=d31_60&q=B%C3%ACnh&no_tu=5000000&han_tra=7_ngay&han_muc=vuot&het=1",
    );
    render(<AccountingPayablesPage navigate={() => {}} />);
    await waitFor(() => expect(goiChinh().length).toBeGreaterThan(0));
    // "Năm nay" của thanh lọc chung = trọn năm; máy chủ tự chặn cuối kỳ ở hôm nay.
    const nam = khoangSo({ loai: "nam", moc: "ps" });
    const p = goiChinh()[0][1];
    expect(p).toEqual({
      q: "Bình", filter: "overdue", aging: "d31_60", tu_ngay: nam.tu, den_ngay: nam.den,
      no_tu: 5_000_000, no_den: undefined, han_tra: "7_ngay", han_muc: "vuot", ca_da_tra_het: true,
      page: 1, size: 25,
    });
    expect(p.chi_tong).toBeUndefined();

    // Số trên dải tab: đọc `the_loc` của CHÍNH câu trả lời bảng — không lời đếm riêng, không lời cùng kỳ
    // (khối tổng quan đã bỏ nên không còn ai đọc số cùng kỳ).
    await waitFor(() => expect(screen.getByRole("button", { name: /^Quá hạn/ })).toHaveTextContent("Quá hạn4"));
    expect(screen.getByRole("button", { name: /^Tất cả/ })).toHaveTextContent("Tất cả18");
    expect(screen.getByRole("button", { name: /^Vượt hạn mức/ })).toHaveTextContent("Vượt hạn mức2");
    expect(payables.mock.calls.filter((c) => c[1].dem_only || c[1].chi_tong || c[1].size === 1)).toEqual([]);

    const tim = screen.getByRole("textbox", { name: "Tìm nhà cung cấp" });
    expect(tim).toHaveValue("Bình");
    expect(tim).toHaveAttribute("placeholder", "Tìm nhà cung cấp, kể cả đã trả hết");
    expect(screen.getByRole("button", { name: /^Tuổi nợ:/ })).toHaveAccessibleName("Tuổi nợ: Trễ 31–60 ngày. Bấm để sửa");
    expect(screen.getByRole("button", { name: /^Hạn trả:/ })).toBeInTheDocument();
  });

  it("không còn khối tổng quan: 'Còn nợ tới' ngày máy chủ; lọc mốc tuổi vẫn ở thanh lọc, × bỏ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang&tuoi=d31_60");
    const { container } = render(<AccountingPayablesPage navigate={() => {}} />);
    await screen.findByText("Còn nợ tới 05/10/2026");
    expect(container.querySelector(".kt-tq")).toBeNull();
    expect(screen.queryByText(/so cùng kỳ/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Xuất Excel/ })).toBeNull();

    payables.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Tuổi nợ" }));
    await waitFor(() => expect(goiChinh().at(-1)![1].aging).toBeNull());
  });

  it("bộ cột Tuổi nợ: dòng Cộng từ tong_loc, mỗi mốc một cột (0 thành –, quá hạn đỏ), hạn sớm nhất, hạn mức, đã dùng", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang");
    render(<AccountingPayablesPage navigate={() => {}} />);
    const dong = (await screen.findAllByText("Giấy Bình Minh"))[0].closest("tr")!;
    // Mỗi mốc trễ là một cột riêng, tiêu đề một hàng (nhãn máy chủ, "> 60" viết thành chữ).
    for (const ten of ["Nhà cung cấp", "Đợt", "Còn nợ", "Chưa tới hạn", "Trễ 1–7 ngày", "Trễ 31–60 ngày",
      "Trễ trên 60 ngày", "Hạn sớm nhất", "Hạn mức", "Đã dùng"]) {
      expect(screen.getByRole("columnheader", { name: ten })).toBeInTheDocument();
    }

    // Bề rộng tối thiểu = 220 (tên) + 56 + 120 + 112 + 118 × 5 + 184 + 84 + 76; khung hẹp hơn thì cuộn
    // ngang (cột tên cố định do CuonLuoi ghim).
    expect(dong.closest("table")).toHaveClass("lds-g");
    expect(dong.closest("table")).toHaveStyle({ minWidth: "1442px" });
    const cong = screen.getByText("Cộng 2 nhà cung cấp", { selector: ".lds-dinh-trai" }).closest("tr")!;
    expect(cong).toHaveClass("lds-cong");
    expect(dong).toHaveClass("lds-dong");
    // Dòng Cộng nằm CUỐI tbody, sau dòng nhà cung cấp.
    expect(cong.parentElement!.lastElementChild).toBe(cong);
    const oc = within(cong);
    expect(oc.getByText("7")).toBeInTheDocument();
    expect(oc.getByText("131.700.000")).toBeInTheDocument();
    expect(oc.getByText("105.200.000")).toBeInTheDocument();
    expect(oc.getByText("26.500.000").closest("td")).toHaveClass("lds-do");
    expect(oc.getAllByText("–")).toHaveLength(4);
    expect(oc.getByText("quá hạn 26.500.000")).toBeInTheDocument();

    const o = within(dong);
    expect(o.getByText("Giấy Bình Minh")).toHaveAttribute("title", "Giấy Bình Minh");
    expect(o.getByText("5")).toBeInTheDocument();
    expect(o.getByText("96.500.000")).toBeInTheDocument();
    expect(o.getByText("70.000.000")).toBeInTheDocument();
    // Mốc quá hạn có tiền: chữ đỏ, bấm được (mở ngăn lọc sẵn quá hạn); mốc 0 thành gạch mờ.
    expect(o.getByRole("button", { name: "26.500.000" }).closest("td")).toHaveClass("lds-do");
    expect(o.getAllByText("–")).toHaveLength(4);
    expect(o.getByText("18/08/2026")).toBeInTheDocument();
    expect(o.getByText("trễ 48 ngày")).toHaveClass("lds-do");
    expect(o.getByText("80 tr")).toBeInTheDocument();
    expect(o.getByText("121%")).toHaveClass("lds-do");
    expect(dong.textContent).not.toMatch(/[·•]|khoản/);
  });

  it("đổi sang bộ cột Trong kỳ và liên hệ: cột trong kỳ, trả gần nhất, cho nợ, liên hệ; nhớ lựa chọn", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang");
    const { unmount } = render(<AccountingPayablesPage navigate={() => {}} />);
    await screen.findAllByText("Giấy Bình Minh");
    const nhom = screen.getByRole("group", { name: "Xem cột" });
    expect(within(nhom).getByRole("button", { name: "Tuổi nợ" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(nhom).getByRole("button", { name: "Trong kỳ và liên hệ" }));

    for (const ten of ["Mua trong kỳ", "Trả trong kỳ", "Trả gần nhất", "Số tiền", "Cho nợ", "Người liên hệ", "Điện thoại"]) {
      expect(screen.getByRole("columnheader", { name: ten })).toBeInTheDocument();
    }
    expect(screen.queryByRole("columnheader", { name: "Hạn sớm nhất" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Phụ trách" })).toBeNull();

    const cong = within(screen.getByText("Cộng 2 nhà cung cấp", { selector: ".lds-dinh-trai" }).closest("tr")!);
    expect(cong.getByText("63.000.000")).toBeInTheDocument();
    expect(cong.getByText("55.000.000")).toBeInTheDocument();

    const o = within(screen.getAllByText("Giấy Bình Minh")[0].closest("tr")!);
    expect(o.getByText("51.200.000")).toBeInTheDocument();
    expect(o.getByRole("button", { name: "42.000.000" })).toBeInTheDocument();
    expect(o.getByText("30/09/2026")).toBeInTheDocument();
    expect(o.getByText("30 ngày")).toBeInTheDocument();
    expect(o.getByText("Nguyễn Lan")).toBeInTheDocument();
    expect(o.getByText("0912 345 678")).toBeInTheDocument();

    expect(window.localStorage.getItem("kt-cong-no-cot")).toBe("ky");
    unmount();
    render(<AccountingPayablesPage navigate={() => {}} />);
    await screen.findAllByText("Giấy Bình Minh");
    expect(screen.getByRole("columnheader", { name: "Mua trong kỳ" })).toBeInTheDocument();
  });

  it("xem kỳ đã qua: 'còn n ngày' đếm từ HÔM NAY (as_of), không từ cuối kỳ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang");
    const goc = tomTat().items[0];
    // Kỳ năm trước kết thúc 31/12/2025, hôm nay 05/10/2026, hạn gần nhất 10/10/2026 (còn 5 ngày).
    payables.mockImplementation(async () =>
      tomTat({
        items: [{ ...goc, han_gan_nhat: "2026-10-10" }],
        tu_ngay: "2025-01-01", den_ngay: "2025-12-31", as_of: "2026-10-05",
      }),
    );
    render(<AccountingPayablesPage navigate={() => {}} />);
    const dong = (await screen.findAllByText("Giấy Bình Minh"))[0].closest("tr")!;
    expect(within(dong).getByText("10/10/2026")).toBeInTheDocument();
    expect(within(dong).getByText("còn 5 ngày")).toHaveClass("lds-mu");
    expect(dong.textContent).not.toMatch(/còn 28\d ngày/);
  });

  it("máy chủ kẹp trang (trả trang khác trang hỏi) thì màn nhảy theo trang máy chủ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang");
    payables.mockImplementation(async (_t: string, p: { page?: number }) =>
      // Trang 2 vừa rỗng (danh sách co lại): máy chủ trả trang 1.
      tomTat({ total: 60, pages: 3, page: p.page === 2 ? 1 : (p.page ?? 1) }),
    );
    render(<AccountingPayablesPage navigate={() => {}} />);
    const nav = within(await screen.findByRole("navigation", { name: "Phân trang công nợ phải trả" }));
    await userEvent.click(nav.getByRole("button", { name: "2" }));
    await waitFor(() => expect(goiChinh().some((c) => c[1].page === 2)).toBe(true));
    await waitFor(() => expect(nav.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page"));
    expect(goiChinh().at(-1)![1].page).toBe(1);
  });

  it("hạn mức chưa đặt ghi 'chưa đặt', Đã dùng '–'; dòng không mã nhà cung cấp không mở được ngăn", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang");
    const goc = tomTat().items[0];
    payables.mockImplementation(async () =>
      tomTat({
        items: [
          { ...goc, credit_limit: 0, vuot_han_muc: false, vuot_bao_nhieu: 0, han_gan_nhat: null },
          { ...goc, supplier_id: null, supplier_name: "Nhà cung cấp lẻ" },
        ],
        total: 2,
      }),
    );
    const { container } = render(<AccountingPayablesPage navigate={() => {}} />);
    const dong = (await screen.findAllByText("Giấy Bình Minh"))[0].closest("tr")!;
    const o = within(dong);
    expect(o.getByText("chưa đặt")).toHaveClass("lds-mu3");
    expect(o.getByText("chưa đặt hạn nợ")).toHaveClass("lds-mu3");
    // 4 mốc trễ bằng 0 + ô Đã dùng.
    expect(o.getAllByText("–")).toHaveLength(5);
    // Dòng không có mã đối tác không đi được bằng phím (không mở ngăn), dòng có mã thì có.
    const hang = container.querySelectorAll("tr.lds-dong");
    expect(hang).toHaveLength(2);
    expect(hang[0]).toHaveAttribute("tabindex", "0");
    expect(hang[1]).not.toHaveAttribute("tabindex");
    // Khuôn lưới chung không còn thẻ điện thoại riêng.
    expect(container.querySelector(".kt-the-dt")).toBeNull();
  });
});
