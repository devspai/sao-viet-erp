/** Form Thêm / sửa tài khoản (TK-3): vỏ NganPhai, cột ô hẹp 560px, lỗi từng ô + nhảy tới ô sai đầu
 *  tiên, Loại tiền "VND | USD | Khác" (Khác ⇒ mã 3 chữ in hoa), Dùng để bắt buộc ít nhất một, bỏ ô
 *  "Đang hoạt động", trùng số (máy chủ 409) báo dưới ô Số tài khoản, Esc đóng; payload khoá bằng
 *  toStrictEqual. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../../api/client";
import { taiKhoan } from "../shared/mauTaiKhoan";

const goi = vi.hoisted(() => ({ createCompanyAccount: vi.fn(), updateCompanyAccount: vi.fn() }));
vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../../api/client")>()),
  api: { accounting: goi },
}));

import { BankAccountModal } from "./BankAccountModal";

// Nhãn ô bắt buộc mang dấu * đỏ ⇒ tên truy cập là "Ngân hàng*".
const o = (ten: string) => screen.getByRole("textbox", { name: new RegExp(`^${ten}\\*?$`) });

beforeEach(() => {
  goi.createCompanyAccount.mockReset().mockImplementation(async (_t, p) => taiKhoan({ id: 9, ...p }));
  goi.updateCompanyAccount.mockReset().mockImplementation(async (_t, id, p) => taiKhoan({ id, ...p }));
});

describe("BankAccountModal — thêm", () => {
  it("vỏ ngăn + form hẹp, đủ nhóm ô theo bản xem, không có ô Đang hoạt động", () => {
    render(<BankAccountModal editing={null} onDong={vi.fn()} onDaLuu={vi.fn()} />);
    const ngan = screen.getByRole("dialog", { name: "Thêm tài khoản" });
    expect(ngan).toHaveClass("kt-ngan");
    expect(ngan.querySelector("form")).toHaveClass("kt-f", "kt-f--hep");
    expect(within(ngan).getByText("Dùng thế nào")).toHaveClass("kt-f__tieu");
    expect(o("Ngân hàng")).toHaveFocus();
    expect(within(ngan).getByText("Ghi mã viết tắt trong ngoặc, ví dụ Vietcombank (VCB)")).toHaveClass("kt-o__goi");
    for (const ten of ["Số tài khoản", "Chủ tài khoản", "Chi nhánh", "Ghi chú"]) expect(o(ten)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VND" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("checkbox", { name: /^Nhận tiền/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^Trả tiền/ })).toBeChecked();
    expect(screen.getByText("Hiện khi lập phiếu thu chuyển khoản")).toBeInTheDocument();
    expect(screen.getByText("Hiện khi lập phiếu chi chuyển khoản")).toBeInTheDocument();
    expect(screen.queryByText(/Đang hoạt động/)).toBeNull();
    expect(screen.getByRole("button", { name: "Lưu tài khoản" })).toBeEnabled();
  });

  it("bấm Lưu khi trống: lỗi dưới từng ô, nhảy tới ô sai đầu tiên, không gọi máy chủ", async () => {
    render(<BankAccountModal editing={null} onDong={vi.fn()} onDaLuu={vi.fn()} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /^Nhận tiền/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /^Trả tiền/ }));
    await userEvent.click(screen.getByRole("button", { name: "Khác" }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu tài khoản" }));
    const loi = screen.getAllByRole("alert").map((a) => a.textContent);
    expect(loi).toEqual([
      "Nhập tên ngân hàng.", "Nhập số tài khoản.", "Nhập tên chủ tài khoản.", "Nhập chi nhánh.",
      "Mã loại tiền gồm 3 chữ cái, ví dụ EUR.", "Chọn ít nhất một: Nhận tiền hoặc Trả tiền.",
    ]);
    expect(o("Ngân hàng")).toHaveFocus();
    expect(o("Ngân hàng")).toHaveAttribute("aria-invalid", "true");
    expect(goi.createCompanyAccount).not.toHaveBeenCalled();
  });

  it("gõ đủ, Loại tiền Khác (tự viết hoa), chỉ Nhận tiền ⇒ payload đúng y; xong báo trang", async () => {
    const onDaLuu = vi.fn();
    render(<BankAccountModal editing={null} onDong={vi.fn()} onDaLuu={onDaLuu} />);
    await userEvent.type(o("Ngân hàng"), " Vietcombank ");
    await userEvent.type(o("Số tài khoản"), "0281000456789");
    await userEvent.type(o("Chủ tài khoản"), "Công ty Cổ phần In Sao Việt Nhật");
    await userEvent.type(o("Chi nhánh"), "Thủ Dầu Một");
    await userEvent.click(screen.getByRole("button", { name: "Khác" }));
    await userEvent.type(o("Mã loại tiền"), "eur");
    expect(o("Mã loại tiền")).toHaveValue("EUR");
    await userEvent.click(screen.getByRole("checkbox", { name: /^Trả tiền/ }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu tài khoản" }));
    await waitFor(() => expect(goi.createCompanyAccount).toHaveBeenCalledTimes(1));
    expect(goi.createCompanyAccount.mock.calls[0][0]).toBe("token-test");
    expect(goi.createCompanyAccount.mock.calls[0][1]).toStrictEqual({
      account_holder: "Công ty Cổ phần In Sao Việt Nhật",
      account_number: "0281000456789",
      bank_name: "Vietcombank",
      bank_branch: "Thủ Dầu Một",
      currency: "EUR",
      is_default: false,
      is_active: true,
      use_for_receipts: true,
      use_for_payments: false,
      note: null,
    });
    await waitFor(() => expect(onDaLuu).toHaveBeenCalledTimes(1));
    expect(goi.updateCompanyAccount).not.toHaveBeenCalled();
  });

  it("máy chủ báo trùng (409) ⇒ lỗi ngay dưới ô Số tài khoản, con trỏ về ô đó, form không đóng", async () => {
    goi.createCompanyAccount.mockRejectedValueOnce(new ApiError("Tài khoản ngân hàng công ty đã tồn tại.", 409));
    const onDaLuu = vi.fn();
    render(<BankAccountModal editing={null} onDong={vi.fn()} onDaLuu={onDaLuu} />);
    await userEvent.type(o("Ngân hàng"), "MB");
    await userEvent.type(o("Số tài khoản"), "933134668");
    await userEvent.type(o("Chủ tài khoản"), "Công ty");
    await userEvent.type(o("Chi nhánh"), "Bình Dương");
    await userEvent.click(screen.getByRole("button", { name: "Lưu tài khoản" }));
    const loi = await screen.findByText("Tài khoản này đã có trong danh sách.");
    expect(loi.closest(".kt-o")).toContainElement(o("Số tài khoản"));
    expect(o("Số tài khoản")).toHaveFocus();
    expect(onDaLuu).not.toHaveBeenCalled();
    // Gõ lại số thì lỗi trùng biến mất.
    await userEvent.type(o("Số tài khoản"), "1");
    expect(screen.queryByText("Tài khoản này đã có trong danh sách.")).toBeNull();
  });

  it("lỗi máy chủ khác hiện ở đầu form, trong ngăn", async () => {
    goi.createCompanyAccount.mockRejectedValueOnce(new ApiError("Loại tiền phải gồm 3 ký tự, ví dụ VND.", 422));
    render(<BankAccountModal editing={null} onDong={vi.fn()} onDaLuu={vi.fn()} />);
    for (const [ten, chu] of [["Ngân hàng", "MB"], ["Số tài khoản", "1"], ["Chủ tài khoản", "A"], ["Chi nhánh", "B"]]) {
      await userEvent.type(o(ten), chu);
    }
    await userEvent.click(screen.getByRole("button", { name: "Lưu tài khoản" }));
    const ngan = screen.getByRole("dialog", { name: "Thêm tài khoản" });
    expect(await within(ngan).findByText("Loại tiền phải gồm 3 ký tự, ví dụ VND.")).toBeInTheDocument();
  });

  it("Esc đóng form chưa gõ gì", async () => {
    const onDong = vi.fn();
    render(<BankAccountModal editing={null} onDong={onDong} onDaLuu={vi.fn()} />);
    await userEvent.keyboard("{Escape}");
    expect(onDong).toHaveBeenCalledTimes(1);
  });
});

describe("BankAccountModal — sửa", () => {
  it("điền sẵn, USD được chọn, giữ trạng thái ngừng dùng, gọi update đúng id + payload", async () => {
    const cu = taiKhoan({ id: 4, currency: "USD", is_active: false, use_for_payments: false, note: "Cũ" });
    const onDaLuu = vi.fn();
    render(<BankAccountModal editing={cu} onDong={vi.fn()} onDaLuu={onDaLuu} />);
    expect(screen.getByRole("dialog", { name: "Sửa tài khoản" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "USD" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("checkbox", { name: /^Trả tiền/ })).not.toBeChecked();
    await userEvent.clear(o("Ghi chú"));
    await userEvent.type(o("Ghi chú"), " Mới ");
    await userEvent.click(screen.getByRole("button", { name: "Lưu tài khoản" }));
    await waitFor(() => expect(goi.updateCompanyAccount).toHaveBeenCalledTimes(1));
    expect(goi.updateCompanyAccount.mock.calls[0].slice(0, 2)).toEqual(["token-test", 4]);
    expect(goi.updateCompanyAccount.mock.calls[0][2]).toStrictEqual({
      account_holder: "Công ty Cổ phần In Sao Việt Nhật",
      account_number: "933134668",
      bank_name: "Ngân hàng TMCP Quân đội (MB)",
      bank_branch: "Bình Dương",
      currency: "USD",
      is_default: false,
      is_active: false,
      use_for_receipts: true,
      use_for_payments: false,
      note: "Mới",
    });
    await waitFor(() => expect(onDaLuu).toHaveBeenCalledTimes(1));
    expect(goi.createCompanyAccount).not.toHaveBeenCalled();
  });
});
