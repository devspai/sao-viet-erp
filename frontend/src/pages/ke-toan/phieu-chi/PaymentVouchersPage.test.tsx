/** Nối dây màn Phiếu chi: URL ↔ lọc + kỳ (A.18), một lời gọi mỗi lượt tải, đường dẫn sâu mở kỳ Tất cả. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { khoangSo } from "../shared/kyKeToan";

const vouchers = vi.fn();
const choChi = vi.fn();
const muaHangChoChi = vi.fn();

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../auth/permissions", async (goc) => ({
  ...(await goc<typeof import("../../../auth/permissions")>()),
  useCan: () => () => true,
}));
vi.mock("../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../api/client")>()),
  api: {
    mucThuChi: { list: vi.fn().mockResolvedValue({ items: [] }) },
    accounting: {
      vouchers: (...a: unknown[]) => vouchers(...a),
      companyAccounts: vi.fn().mockResolvedValue([]),
      muaHangChoChi: (...a: unknown[]) => muaHangChoChi(...a),
    },
    giaCongNgoai: { choChi: (...a: unknown[]) => choChi(...a) },
  },
}));

import { PaymentVouchersPage } from "./PaymentVouchersPage";

const THE = { tat_ca: 7, xong: 5, xong_tien: 12_000_000, thieu_chung_tu: 2, da_huy: 1, cho: 0 };
const traVe = (the_loc = THE) => ({ items: [], total: 0, the_loc });

beforeEach(() => {
  vouchers.mockReset();
  choChi.mockReset();
  choChi.mockResolvedValue([]);
  muaHangChoChi.mockReset();
  muaHangChoChi.mockResolvedValue([]);
  vouchers.mockImplementation(async () => traVe());
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("PaymentVouchersPage — nối dây", () => {
  it("mở từ link có lọc + kỳ: lời gọi chính mang đúng tham số (kỳ theo Ngày tạo mặc định)", async () => {
    window.history.replaceState(
      null, "",
      "/?man=ke-toan-phieu-chi&ky=nam&the=thieu&q=UNC&muc=5&tien_tu=5000000",
    );
    render(<PaymentVouchersPage navigate={() => {}} />);
    await waitFor(() => expect(vouchers).toHaveBeenCalled());
    const p = vouchers.mock.calls[0][1];
    const nam = khoangSo({ loai: "nam", moc: "tao" });
    expect(p).toMatchObject({
      status: "paid", chung_tu: "thieu", q: "UNC", muc: [5],
      tien_tu: 5_000_000, tu_ngay: nam.tu, den_ngay: nam.den, moc: "tao", page: 1,
    });
    expect(p.nhan).toBeUndefined();
    expect(screen.getByRole("textbox", { name: "Tìm phiếu chi" })).toHaveValue("UNC");
  });

  it("kỳ Tất cả: một lời gọi, không gửi ngày lẫn mốc", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=tat_ca");
    render(<PaymentVouchersPage navigate={() => {}} />);
    await waitFor(() => expect(vouchers).toHaveBeenCalled());
    expect(vouchers).toHaveBeenCalledTimes(1);
    expect(vouchers.mock.calls[0][1].tu_ngay).toBeUndefined();
    expect(vouchers.mock.calls[0][1].moc).toBeUndefined();
  });

  it("kỳ có khoảng: vẫn MỘT lời gọi (không còn lời cùng kỳ năm trước); dải tab lấy số từ nó; URL ghi man + kỳ", async () => {
    // Bộ nhớ kỳ là biến cấp module (sống qua các test) — đặt kỳ bằng URL cho test này độc lập.
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=thang");
    render(<PaymentVouchersPage navigate={() => {}} />);
    // Số nằm trong dải tab cạnh tiêu đề (phương án A).
    const dai = screen.getByRole("group", { name: "Lọc theo trạng thái" });
    await waitFor(() => expect(within(dai).getByRole("button", { name: /Tất cả/ })).toHaveTextContent("7"));
    expect(vouchers).toHaveBeenCalledTimes(1);
    expect(vouchers.mock.calls[0][1].size).not.toBe(1);
    expect(within(dai).getByRole("button", { name: /Thiếu chứng từ gốc/ })).toHaveTextContent("2");
    const u = new URLSearchParams(window.location.search);
    expect(u.get("man")).toBe("ke-toan-phieu-chi");
    expect(u.get("ky")).toBe("thang");
    expect(u.has("the")).toBe(false);
  });

  it("không có việc gia công chờ chi thì dải tab không có mục đó", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=tat_ca");
    render(<PaymentVouchersPage navigate={() => {}} />);
    const dai = screen.getByRole("group", { name: "Lọc theo trạng thái" });
    await waitFor(() => expect(within(dai).getByRole("button", { name: /Tất cả/ })).toHaveTextContent("7"));
    // API gia công ĐÃ trả về (mảng rỗng) — không phải ẩn vì còn đang tải.
    await waitFor(() => expect(choChi).toHaveBeenCalled());
    expect(within(dai).queryByRole("button", { name: /Gia công chờ chi/ })).toBeNull();
    expect(within(dai).getByRole("button", { name: /Đã chi/ })).toBeInTheDocument();
  });

  it("có việc gia công chờ chi thì dải tab có mục đó kèm số việc", async () => {
    choChi.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=tat_ca");
    render(<PaymentVouchersPage navigate={() => {}} />);
    const dai = screen.getByRole("group", { name: "Lọc theo trạng thái" });
    await waitFor(() => expect(within(dai).getByRole("button", { name: /Gia công chờ chi/ })).toHaveTextContent("2"));
  });

  it("tải việc gia công lỗi: mục vẫn hiện (không số) để bấm vào thấy lỗi", async () => {
    choChi.mockRejectedValue(new Error("mất mạng"));
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=tat_ca");
    render(<PaymentVouchersPage navigate={() => {}} />);
    const dai = screen.getByRole("group", { name: "Lọc theo trạng thái" });
    await waitFor(() => expect(within(dai).getByRole("button", { name: /Gia công chờ chi/ })).toBeInTheDocument());
  });

  it("đường dẫn sâu tìm đúng mã trên kỳ Tất cả (kỳ hiện trên thanh lọc khớp lời gọi)", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=thang");
    render(<PaymentVouchersPage navigate={() => {}} focusQuery="PC-2610-01" />);
    await waitFor(() =>
      expect(vouchers.mock.calls.some((c) => c[1].q === "PC-2610-01" && c[1].tu_ngay === undefined)).toBe(true),
    );
    // Tất cả là kỳ mặc định của màn ⇒ URL bỏ khoá `ky`.
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("ky")).toBe(false));
  });

  it("tab Mua hàng chờ chi: luôn có mục kèm số đơn; mỗi đơn một dòng, bấm dòng mở cọc + từng đợt kèm nút lập phiếu", async () => {
    const u = userEvent.setup();
    const dongDot = {
      id: 31, item_name: "Giấy Duplex", unit: "tờ", quantity: 400, quantity_du: 0, kho_rong: 790, kho_dai: 1090,
      don_gia: 2_200, thanh_tien: 880_000,
    };
    const dotNo = {
      id: 21, seq_no: 1, con_no: 880_000, amount: 880_000, paid_amount: 0, coc_bu: 0,
      delivery_date: "2026-10-01", due_date: "2026-10-31", invoice_number: null, lines: [dongDot],
    };
    const daTra = { id: 22, seq_no: 2, con_no: 0, delivery_date: "2026-10-05", due_date: "2026-11-04", lines: [] };
    muaHangChoChi.mockResolvedValue([
      {
        don: {
          id: 9, code: "PMH26-0009", supplier_name: "Giấy Tân Mai", deposit_expected: 500_000, coc_da_chi: 100_000,
          tran_dat_coc: 400_000, deliveries: [dotNo, daTra], total_estimate: 2_200_000, gia_tri_da_giao: 880_000,
          net_paid: 100_000,
          lines: [{ id: 41, item_name: "Giấy Duplex", unit: "tờ", quantity: 1000, kho_rong: 790, kho_dai: 1090,
            expected_unit_price: 2_200, line_total: 2_200_000 }],
        },
        coc_can_chi: 400_000, so_dot_no: 1, no_dot: 880_000, tong_can_chi: 1_280_000,
        han_gan_nhat: "2026-10-31", qua_han: false,
      },
    ]);
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=tat_ca");
    render(<PaymentVouchersPage navigate={() => {}} />);
    const dai = screen.getByRole("group", { name: "Lọc theo trạng thái" });
    const muc = await within(dai).findByRole("button", { name: /Mua hàng chờ chi/ });
    await waitFor(() => expect(muc).toHaveTextContent("1"));

    await u.click(muc);
    const dong = await screen.findByRole("row", { name: /PMH26-0009/ });
    expect(dong).toHaveTextContent("1 đợt ·");
    expect(screen.queryByRole("list", { name: /Các khoản cần chi/ })).toBeNull();

    await u.click(dong);
    const khoan = screen.getByRole("list", { name: "Các khoản cần chi của PMH26-0009" });
    const cac = within(khoan).getAllByRole("listitem");
    // Cọc + đúng một đợt còn nợ — đợt đã trả đủ không hiện.
    expect(cac).toHaveLength(2);
    expect(cac[0]).toHaveTextContent("Cọc");
    expect(within(cac[0]).getByRole("button", { name: "Lập phiếu chi cọc" })).toBeInTheDocument();
    expect(cac[1]).toHaveTextContent("Đợt 1");
    expect(within(cac[1]).getByRole("button", { name: "Lập phiếu chi" })).toBeInTheDocument();
    // Đợt kể đủ vật tư về trong đợt — tên, khổ, số nhận, đơn giá, thành tiền.
    const hang = within(cac[1]).getByRole("row", { name: /Giấy Duplex/ });
    expect(hang).toHaveTextContent("790×1090");
    expect(hang).toHaveTextContent("400");
    expect(hang).toHaveTextContent("880.000");
    // Cọc kể hàng đã đặt của cả đơn.
    expect(within(cac[0]).getByRole("row", { name: /Giấy Duplex/ })).toHaveTextContent("2.200.000");
  });

  it("mở từ link của ngăn Đơn mua hàng: đứng ở tab Mua hàng chờ chi, đơn đó bung sẵn", async () => {
    muaHangChoChi.mockResolvedValue([
      {
        don: { id: 9, code: "PMH26-0009", supplier_name: "Giấy Tân Mai", deposit_expected: 500_000, coc_da_chi: 0,
          tran_dat_coc: 500_000, deliveries: [], lines: [], total_estimate: 500_000, gia_tri_da_giao: 0, net_paid: 0 },
        coc_can_chi: 500_000, so_dot_no: 0, no_dot: 0, tong_can_chi: 500_000, han_gan_nhat: null, qua_han: false,
      },
    ]);
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=tat_ca");
    render(<PaymentVouchersPage navigate={() => {}} focusChoChi="PMH26-0009" />);
    expect(await screen.findByRole("list", { name: "Các khoản cần chi của PMH26-0009" })).toBeInTheDocument();
  });
});
