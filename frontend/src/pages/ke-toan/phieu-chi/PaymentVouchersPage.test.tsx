/** Nối dây màn Phiếu chi: URL ↔ lọc + kỳ (A.18), lời gọi cùng kỳ, đường dẫn sâu không đè kỳ đã nhớ. */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TRAN_KHOANG_NGAY, congNgay, homNayVN, tinhKy } from "../../../utils/ky";

const vouchers = vi.fn();

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../auth/permissions", async (goc) => ({
  ...(await goc<typeof import("../../../auth/permissions")>()),
  useCan: () => () => true,
}));
vi.mock("../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../api/client")>()),
  api: {
    accounting: {
      vouchers: (...a: unknown[]) => vouchers(...a),
      companyAccounts: vi.fn().mockResolvedValue([]),
    },
    giaCongNgoai: { choChi: vi.fn().mockResolvedValue([]) },
  },
}));

import { PaymentVouchersPage } from "./PaymentVouchersPage";

const THE = { tat_ca: 7, xong: 5, xong_tien: 12_000_000, thieu_chung_tu: 2, da_huy: 1, cho: 0 };
const traVe = (the_loc = THE) => ({ items: [], total: 0, the_loc });

beforeEach(() => {
  vouchers.mockReset();
  vouchers.mockImplementation(async (_t: string, p: { size?: number }) =>
    p.size === 1 ? traVe({ ...THE, tat_ca: 3 }) : traVe(),
  );
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("PaymentVouchersPage — nối dây", () => {
  it("mở từ link có lọc + kỳ: lời gọi đầu mang đúng tham số; so=0 thì không gọi cùng kỳ", async () => {
    window.history.replaceState(
      null, "",
      "/?man=ke-toan-phieu-chi&ky=nam&so=0&the=thieu&q=UNC&nhan=B%C3%ACnh%20Minh&nguon=po&tien_tu=5000000",
    );
    render(<PaymentVouchersPage navigate={() => {}} />);
    await waitFor(() => expect(vouchers).toHaveBeenCalled());
    expect(vouchers).toHaveBeenCalledTimes(1);
    const p = vouchers.mock.calls[0][1];
    const nam = tinhKy("nam", homNayVN());
    expect(p).toMatchObject({
      status: "paid", chung_tu: "thieu", q: "UNC", nhan: "Bình Minh", nguon: ["purchase_request"],
      tien_tu: 5_000_000, tu_ngay: nam.tu, den_ngay: nam.den, page: 1,
    });
    expect(screen.getByRole("textbox", { name: "Tìm phiếu chi" })).toHaveValue("UNC");
    expect(screen.getByRole("button", { name: /^Người nhận:/ })).toBeInTheDocument();
  });

  it("so=1: hai lời gọi (bảng + cùng kỳ size 1); thẻ lấy số từ lời gọi chính; URL ghi man + kỳ", async () => {
    // Bộ nhớ kỳ là biến cấp module (sống qua các test) — đặt kỳ bằng URL cho test này độc lập.
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=thang&so=1");
    render(<PaymentVouchersPage navigate={() => {}} />);
    await waitFor(() => expect(vouchers).toHaveBeenCalledTimes(2));
    const sizes = vouchers.mock.calls.map((c) => c[1].size);
    expect(sizes).toContain(1);
    await waitFor(() => expect(screen.getByRole("button", { name: /Tất cả/ })).toHaveTextContent("7"));
    const u = new URLSearchParams(window.location.search);
    expect(u.get("man")).toBe("ke-toan-phieu-chi");
    expect(u.get("ky")).toBe("thang");
    expect(u.has("the")).toBe(false);
  });

  it("đường dẫn sâu mở kỳ 10 năm nhưng KHÔNG đè kỳ đã nhớ của màn", async () => {
    const { unmount } = render(<PaymentVouchersPage navigate={() => {}} focusQuery="PC-2610-01" />);
    const hn = homNayVN();
    await waitFor(() =>
      expect(vouchers.mock.calls.some((c) => c[1].q === "PC-2610-01" && c[1].tu_ngay === congNgay(hn, -TRAN_KHOANG_NGAY))).toBe(true),
    );
    unmount();
    vouchers.mockClear();
    render(<PaymentVouchersPage navigate={() => {}} />);
    await waitFor(() => expect(vouchers).toHaveBeenCalled());
    expect(vouchers.mock.calls[0][1].tu_ngay).toBe(tinhKy("thang", hn).tu);
  });
});
