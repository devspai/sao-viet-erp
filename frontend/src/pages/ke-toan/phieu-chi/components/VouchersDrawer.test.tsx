/** Ngăn phiếu chi: dòng "Yêu cầu mua" (mã yêu cầu mua nguồn của đơn) — lối liên thông về màn Yêu
 *  cầu mua hàng; không có quyền xem màn đó thì chỉ hiện mã, không thành link. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { phieu } from "./phieuMau";

const P = phieu({
  id: 7, source_type: "purchase_request", purchase_request_id: 3, purchase_request_code: "DMH-261002-K4P1",
  payment_stage: "advance", source_request_codes: ["YC-2609-01", "YC-2609-07"],
});

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../../api/client")>()),
  api: {
    accounting: {
      voucher: vi.fn(async () => P),
      voucherAttachments: vi.fn(async () => ({ items: [] })),
    },
    purchaseRequests: { get: vi.fn(() => new Promise(() => {})) },
  },
}));

import { VouchersDrawer } from "./VouchersDrawer";

const QUYEN = { lap: true, huy: true, in: true, xemDonMua: false };

describe("VouchersDrawer — Yêu cầu mua nguồn", () => {
  it("mỗi mã yêu cầu mua là một link mở màn Yêu cầu mua hàng", async () => {
    const onMoYeuCau = vi.fn();
    render(<VouchersDrawer dau={P} eventTick={0} quyen={QUYEN} onDong={() => {}} onDoi={() => {}}
      onMoPhieuThu={() => {}} onMoYeuCau={onMoYeuCau} />);
    expect(screen.getByText("Yêu cầu mua")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "YC-2609-07" }));
    expect(onMoYeuCau).toHaveBeenCalledWith("YC-2609-07");
  });

  it("không có quyền xem Yêu cầu mua hàng: hiện mã, không có link", () => {
    render(<VouchersDrawer dau={P} eventTick={0} quyen={QUYEN} onDong={() => {}} onDoi={() => {}}
      onMoPhieuThu={() => {}} />);
    expect(screen.getByText("YC-2609-01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "YC-2609-01" })).toBeNull();
  });
});
