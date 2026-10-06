/** Nối dây màn Phiếu chi: URL ↔ lọc + kỳ (A.18), lời gọi cùng kỳ, đường dẫn sâu mở kỳ Tất cả. */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { khoangSo } from "../shared/kyKeToan";

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
  it("mở từ link có lọc + kỳ: lời gọi chính mang đúng tham số (kỳ theo Ngày tạo mặc định)", async () => {
    window.history.replaceState(
      null, "",
      "/?man=ke-toan-phieu-chi&ky=nam&the=thieu&q=UNC&nguon=po&tien_tu=5000000",
    );
    render(<PaymentVouchersPage navigate={() => {}} />);
    await waitFor(() => expect(vouchers).toHaveBeenCalled());
    const p = vouchers.mock.calls.find((c) => c[1].size !== 1)![1];
    const nam = khoangSo({ loai: "nam", moc: "tao" });
    expect(p).toMatchObject({
      status: "paid", chung_tu: "thieu", q: "UNC", nguon: ["purchase_request"],
      tien_tu: 5_000_000, tu_ngay: nam.tu, den_ngay: nam.den, moc: "tao", page: 1,
    });
    expect(p.nhan).toBeUndefined();
    expect(screen.getByRole("textbox", { name: "Tìm phiếu chi" })).toHaveValue("UNC");
  });

  it("kỳ Tất cả: một lời gọi, không gửi ngày lẫn mốc, không gọi cùng kỳ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=tat_ca");
    render(<PaymentVouchersPage navigate={() => {}} />);
    await waitFor(() => expect(vouchers).toHaveBeenCalled());
    expect(vouchers).toHaveBeenCalledTimes(1);
    expect(vouchers.mock.calls[0][1].tu_ngay).toBeUndefined();
    expect(vouchers.mock.calls[0][1].moc).toBeUndefined();
  });

  it("kỳ có khoảng: hai lời gọi (bảng + cùng kỳ size 1); thẻ lấy số từ lời gọi chính; URL ghi man + kỳ", async () => {
    // Bộ nhớ kỳ là biến cấp module (sống qua các test) — đặt kỳ bằng URL cho test này độc lập.
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=thang");
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

  it("đường dẫn sâu tìm đúng mã trên kỳ Tất cả (kỳ hiện trên thanh lọc khớp lời gọi)", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-phieu-chi&ky=thang");
    render(<PaymentVouchersPage navigate={() => {}} focusQuery="PC-2610-01" />);
    await waitFor(() =>
      expect(vouchers.mock.calls.some((c) => c[1].q === "PC-2610-01" && c[1].tu_ngay === undefined)).toBe(true),
    );
    // Tất cả là kỳ mặc định của màn ⇒ URL bỏ khoá `ky`.
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("ky")).toBe(false));
  });
});
