/** Nút "Lập phiếu chi" ở hàng gia công mở CÙNG giao diện với nút trên đầu màn (`ThanPhieuChiRoi`):
 *  cùng ô, cùng tờ phiếu xem trước; thêm dải tóm tắt việc, số tiền gõ theo hoá đơn nhà gia công. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GiaCongChoChi } from "../../../../api/client";

vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../../../api/client")>()),
  api: { accounting: { companyAccounts: vi.fn().mockResolvedValue([]), createVoucher: vi.fn() } },
}));

import { LapPhieuChiGiaCongModal } from "./LapPhieuChiGiaCongModal";

const ROW = {
  gia_cong_ngoai_id: 7,
  lsx_id: 2,
  lsx_ma: "LSX26-0002",
  nhan_nguon: "LSX26-0002",
  ten_viec: "Trọn gói cả lệnh",
  nha_cung_cap_id: 3,
  nha_cung_cap_ten: "Cơ sở Gia công Cán màng Thành Công",
  sl_cuoi: 5000,
  don_vi: null,
  chot_luc: null,
  chot_boi_ten: null,
} as GiaCongChoChi;

describe("Lập phiếu chi gia công", () => {
  it("cùng giao diện với phiếu chi rời, điền sẵn người nhận và lý do", () => {
    render(<LapPhieuChiGiaCongModal row={ROW} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Lập phiếu chi" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Người nhận tiền/)).toHaveValue("Cơ sở Gia công Cán màng Thành Công");
    expect(screen.getByText("Gõ theo hoá đơn của nhà gia công.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Lý do chi/)).toHaveValue("Gia công Trọn gói cả lệnh — LSX26-0002 — Cơ sở Gia công Cán màng Thành Công");
    expect(screen.getByRole("radio", { name: "Chuyển khoản" })).toBeInTheDocument();
    expect(screen.getByLabelText("Xem trước phiếu chi")).toHaveTextContent("Cơ sở Gia công Cán màng Thành Công");
    expect(screen.getByText("Số chốt")).toBeInTheDocument();
  });
});
