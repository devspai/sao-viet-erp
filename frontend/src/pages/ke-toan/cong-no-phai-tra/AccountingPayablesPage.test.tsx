/** Nối dây màn Công nợ phải trả: URL → kỳ + lọc → tham số máy chủ, lời gọi cùng kỳ, số đếm nhóm nút,
 *  bấm mốc tuổi nợ = lọc + chip, khối tổng quan thay dải KPI cũ. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PayablesSummary } from "../../../api/client";
import { homNayVN, kyCungKy, tinhKy } from "../../../utils/ky";
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
    ...p,
  };
}

beforeEach(() => {
  payables.mockReset();
  payables.mockImplementation(async (_t: string, p: { size?: number; dem_only?: boolean; filter?: string }) => {
    if (p.size === 1) return tomTat({ total_due: 80_000_000, overdue_amount: 10_000_000 });
    return tomTat();
  });
});
afterEach(() => window.history.replaceState(null, "", "/"));

const goiChinh = () => payables.mock.calls.filter((c) => !c[1].dem_only && c[1].size !== 1);

describe("AccountingPayablesPage — nối dây", () => {
  it("mở từ link: kỳ, nhóm nút, mốc tuổi, ô tìm, bộ lọc → đúng tham số; cùng kỳ size 1; đếm nhóm nút", async () => {
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
    const cung = kyCungKy(tinhKy("nam", homNayVN()));
    await waitFor(() => expect(payables.mock.calls.some((c) => c[1].size === 1)).toBe(true));
    const pc = payables.mock.calls.find((c) => c[1].size === 1)![1];
    expect(pc).toMatchObject({ tu_ngay: cung.tu, den_ngay: cung.den, filter: "overdue", aging: "d31_60", page: 1 });
    // Lời cùng kỳ chỉ cần số tổng: máy chủ khỏi dựng dòng. Lời của bảng thì không.
    expect(pc.chi_tong).toBe(true);
    expect(p.chi_tong).toBeUndefined();

    // Số trên nhóm nút: đọc `the_loc` của CHÍNH câu trả lời bảng — không lời đếm riêng nào.
    await waitFor(() => expect(screen.getByRole("button", { name: /^Quá hạn/ })).toHaveTextContent("Quá hạn4"));
    expect(screen.getByRole("button", { name: /^Tất cả/ })).toHaveTextContent("Tất cả18");
    expect(screen.getByRole("button", { name: /^Vượt hạn mức/ })).toHaveTextContent("Vượt hạn mức2");
    expect(payables.mock.calls.filter((c) => c[1].dem_only)).toEqual([]);

    expect(screen.getByRole("textbox", { name: "Tìm nhà cung cấp" })).toHaveValue("Bình");
    expect(screen.getByRole("button", { name: /^Tuổi nợ:/ })).toHaveAccessibleName("Tuổi nợ: Trễ 31–60 ngày. Bấm để sửa");
    expect(screen.getByRole("button", { name: /^Hạn trả:/ })).toBeInTheDocument();
  });

  it("khối tổng quan thay dải KPI: Còn nợ tới ngày cuối kỳ, cùng kỳ; bấm mốc = lọc aging + chip; × bỏ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang");
    const { container } = render(<AccountingPayablesPage navigate={() => {}} />);
    await screen.findByText("Còn nợ tới 05/10/2026");
    expect(container.querySelector(".pay-kpibar")).toBeNull();
    expect(container.querySelector(".aging-strip")).toBeNull();
    await waitFor(() => expect(screen.getByText("+21% so cùng kỳ")).toBeInTheDocument());
    expect(screen.getByText("+165% so cùng kỳ")).toHaveClass("kt-do");

    payables.mockClear();
    const moc = within(screen.getByRole("group", { name: /^Quá hạn theo số ngày trễ tới/ }));
    await userEvent.click(moc.getByRole("button", { name: /Trễ 31–60 ngày/ }));
    await waitFor(() => expect(goiChinh().some((c) => c[1].aging === "d31_60")).toBe(true));
    expect(new URLSearchParams(window.location.search).get("tuoi")).toBe("d31_60");
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Tuổi nợ" }));
    await waitFor(() => expect(goiChinh().at(-1)![1].aging).toBeNull());
  });

  it("bảng đủ cột: mã, số khoản, quá hạn đỏ, hạn trả so với hôm nay, mua thêm / đã trả, trả gần nhất, liên hệ, hạn mức vượt", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang");
    render(<AccountingPayablesPage navigate={() => {}} />);
    const dong = (await screen.findAllByText("Giấy Bình Minh"))[0].closest("tr")!;
    const o = within(dong);
    expect(o.getByText("NCC007")).toHaveClass("kt-the");
    expect(o.getByText("5 khoản")).toBeInTheDocument();
    expect(o.getByText("Vượt hạn mức")).toBeInTheDocument();
    expect(o.getByRole("button", { name: "quá hạn 26.500.000" })).toHaveClass("kt-do");
    expect(o.getByText("18/08/2026")).toBeInTheDocument();
    expect(o.getByText("trễ 48 ngày")).toBeInTheDocument();
    expect(o.getByText("cho nợ 30 ngày")).toBeInTheDocument();
    expect(o.getByText("Mua thêm")).toBeInTheDocument();
    expect(o.getByText("51.200.000")).toBeInTheDocument();
    expect(o.getByRole("button", { name: "42.000.000" })).toBeInTheDocument();
    expect(o.getByText("30/09/2026")).toBeInTheDocument();
    expect(o.getByText("Nguyễn Lan")).toBeInTheDocument();
    expect(o.getByText("0912 345 678")).toBeInTheDocument();
    expect(o.getByText("Đã dùng 121%")).toHaveClass("kt-do");
    expect(dong.textContent).not.toMatch(/[·•]/);
    expect(screen.getByText("1 nhà cung cấp")).toBeInTheDocument();
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
    expect(within(dong).getByText("còn 5 ngày")).toBeInTheDocument();
    expect(dong.textContent).not.toMatch(/còn 28\d ngày/);
  });

  it("máy chủ kẹp trang (trả trang khác trang hỏi) thì màn nhảy theo trang máy chủ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang");
    payables.mockImplementation(async (_t: string, p: { size?: number; page?: number }) => {
      if (p.size === 1) return tomTat();
      // Trang 2 vừa rỗng (danh sách co lại): máy chủ trả trang 1.
      return tomTat({ total: 60, pages: 3, page: p.page === 2 ? 1 : (p.page ?? 1) });
    });
    render(<AccountingPayablesPage navigate={() => {}} />);
    const nav = within(await screen.findByRole("navigation", { name: "Phân trang công nợ phải trả" }));
    await userEvent.click(nav.getByRole("button", { name: "2" }));
    await waitFor(() => expect(goiChinh().some((c) => c[1].page === 2)).toBe(true));
    await waitFor(() => expect(nav.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page"));
    expect(goiChinh().at(-1)![1].page).toBe(1);
  });

  it("hạn mức chưa đặt ghi Chưa đặt; dòng không mã nhà cung cấp: thẻ điện thoại không là nút", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-cong-no&ky=thang");
    const goc = tomTat().items[0];
    payables.mockImplementation(async () =>
      tomTat({
        items: [
          { ...goc, credit_limit: 0, vuot_han_muc: false, vuot_bao_nhieu: 0 },
          { ...goc, supplier_id: null, supplier_name: "Nhà cung cấp lẻ" },
        ],
        total: 2,
      }),
    );
    const { container } = render(<AccountingPayablesPage navigate={() => {}} />);
    const dong = (await screen.findAllByText("Giấy Bình Minh"))[0].closest("tr")!;
    expect(within(dong).getByText("Chưa đặt hạn mức")).toHaveClass("kt-mo");
    const the = container.querySelectorAll(".kt-the-dt > div");
    expect(the[0]).toHaveAttribute("role", "button");
    expect(the[1]).not.toHaveAttribute("role");
    expect(the[1]).not.toHaveAttribute("tabindex");
  });
});
