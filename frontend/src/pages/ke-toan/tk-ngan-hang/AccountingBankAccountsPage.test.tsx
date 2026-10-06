/** Màn Tài khoản ngân hàng (TK-1, TK-4): chỉ tải danh sách tài khoản + thu/chi trong kỳ (lỗi 1 — không
 *  gọi danh sách nhà cung cấp nữa), kỳ đọc từ URL, thẻ điền 0 cho tài khoản không có phiếu, số nhóm 4,
 *  nút Chép, tài khoản ngừng dùng gom cuối, không nối mẩu thông tin bằng dấu; sự kiện đẩy nạp lại;
 *  Ngừng dùng hỏi MỘT lần rồi gọi `toggleCompanyAccount`. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, type CompanyBankAccountRow } from "../../../api/client";
import { homNayVN, kyCungKy, tinhKy } from "../../../utils/ky";
import { khoangSo } from "../shared/kyKeToan";
import { taiKhoan } from "./shared/mauTaiKhoan";

const goi = vi.hoisted(() => ({
  companyAccounts: vi.fn(),
  thongKeTaiKhoan: vi.fn(),
  toggleCompanyAccount: vi.fn(),
  supplierAccounts: vi.fn(),
  vouchers: vi.fn(),
  receipts: vi.fn(),
  nganHangLoc: vi.fn(),
}));
const ncc = vi.hoisted(() => ({ list: vi.fn() }));
const quyen = vi.hoisted(() => ({ coSua: true }));
const nganMo = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
const formMo = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));

vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../auth/permissions", async (g) => ({
  ...(await g<typeof import("../../../auth/permissions")>()),
  useCan: () => (_m: string, a: string) => (a === "update" ? quyen.coSua : true),
}));
vi.mock("../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../api/client")>()),
  api: { accounting: goi, suppliers: ncc },
}));
vi.mock("./components/NganTaiKhoan", () => ({
  NganTaiKhoan: (p: { taiKhoan: CompanyBankAccountRow; onSua: () => void; onDoiTrangThai: () => void }) => {
    nganMo.props = p;
    return (
      <div role="dialog" aria-label={`Ngăn ${p.taiKhoan.id}`}>
        <button type="button" onClick={p.onSua}>Sửa ở ngăn</button>
        <button type="button" onClick={p.onDoiTrangThai}>Đổi trạng thái ở ngăn</button>
      </div>
    );
  },
}));
vi.mock("./modals/BankAccountModal", () => ({
  BankAccountModal: (p: { editing: CompanyBankAccountRow | null }) => {
    formMo.props = p;
    return <div role="dialog" aria-label={p.editing ? "Form sửa" : "Form thêm"} />;
  },
}));

import { AccountingBankAccountsPage } from "./AccountingBankAccountsPage";

const MB = taiKhoan({ id: 1 });
const VCB = taiKhoan({
  id: 2, bank_name: "Vietcombank", bank_branch: "Thủ Dầu Một", account_number: "0281000456789", use_for_payments: false,
});
const ACB = taiKhoan({
  id: 3, bank_name: "ACB", bank_branch: "Thuận An", account_number: "18234567", is_active: false, currency: "USD",
  updated_at: "2026-08-12T03:00:00",
});

const theTk = (ten: string) => screen.getByRole("article", { name: `Tài khoản ${ten}` });

beforeEach(() => {
  for (const f of Object.values(goi)) f.mockReset();
  ncc.list.mockReset();
  quyen.coSua = true;
  nganMo.props = null;
  formMo.props = null;
  goi.companyAccounts.mockResolvedValue([ACB, MB, VCB]);
  goi.nganHangLoc.mockResolvedValue([{ ten: "MB", so: 1 }, { ten: "Vietcombank", so: 1 }, { ten: "ACB", so: 1 }]);
  // VCB và ACB không có phiếu nào trong kỳ ⇒ máy chủ bỏ hẳn khỏi danh sách.
  goi.thongKeTaiKhoan.mockImplementation(async (_t: string, ky: { tu_ngay: string }) =>
    ky.tu_ngay === tinhKy("nam", homNayVN()).tu
      ? [{ tai_khoan_id: 1, thu: 120_000_000, chi: 86_500_000, so_phieu: 14 }]
      : [{ tai_khoan_id: 1, thu: 100_000_000, chi: 90_000_000, so_phieu: 9 }],
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("AccountingBankAccountsPage — tải (lỗi 1)", () => {
  it("chỉ gọi danh sách tài khoản + thu/chi trong kỳ đọc từ URL; không gọi nhà cung cấp hay sổ phiếu", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-tai-khoan-ngan-hang&ky=nam");
    render(<AccountingBankAccountsPage />);
    await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" });
    // Kỳ "Năm nay" của thanh lọc chung = trọn năm (khoangKy), không cắt ở hôm nay.
    const nam = khoangSo({ loai: "nam", moc: "gd" });
    expect(goi.companyAccounts.mock.calls).toEqual([["token-test", false, null, { ngan_hang: undefined, trang_thai: undefined }]]);
    // Kỳ có khoảng ngày ⇒ thêm đúng MỘT lời cho cùng kỳ năm trước (so sánh tự bật, không còn ô tích).
    expect(goi.thongKeTaiKhoan).toHaveBeenCalledTimes(2);
    expect(goi.thongKeTaiKhoan.mock.calls[0]).toEqual(["token-test", { tu_ngay: nam.tu, den_ngay: nam.den }]);
    expect(goi.supplierAccounts).not.toHaveBeenCalled();
    expect(ncc.list).not.toHaveBeenCalled();
    expect(goi.vouchers).not.toHaveBeenCalled();
    expect(goi.receipts).not.toHaveBeenCalled();
    // Không còn nhãn "KẾ TOÁN" lẫn câu phụ nhắc tài khoản nhà cung cấp.
    expect(screen.queryByText(/^Kế toán$/i)).toBeNull();
    expect(screen.queryByText(/nhà cung cấp/)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Tài khoản ngân hàng" })).toBeInTheDocument();
    expect(screen.getByText("Tài khoản công ty dùng khi lập phiếu chuyển khoản.")).toBeInTheDocument();
  });

  it("kỳ có khoảng ⇒ thêm MỘT lời thu/chi cho cùng kỳ năm trước, dòng 'Cùng kỳ' dưới số", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-tai-khoan-ngan-hang&ky=nam");
    render(<AccountingBankAccountsPage />);
    const cung = kyCungKy(tinhKy("nam", homNayVN()));
    await waitFor(() => expect(goi.thongKeTaiKhoan).toHaveBeenCalledTimes(2));
    expect(goi.thongKeTaiKhoan).toHaveBeenCalledWith("token-test", { tu_ngay: cung.tu, den_ngay: cung.den });
    const the = await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" });
    await waitFor(() => expect(within(the).getByText("Cùng kỳ 100.000.000")).toHaveClass("kt-cung-ky"));
    expect(within(the).getByText("Cùng kỳ 90.000.000")).toBeInTheDocument();
  });

  it("sự kiện đẩy (eventTick đổi) ⇒ nạp lại danh sách và thu/chi", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-tai-khoan-ngan-hang&ky=nam");
    const { rerender } = render(<AccountingBankAccountsPage eventTick={0} />);
    await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" });
    rerender(<AccountingBankAccountsPage eventTick={1} />);
    await waitFor(() => expect(goi.companyAccounts).toHaveBeenCalledTimes(2));
    expect(goi.thongKeTaiKhoan).toHaveBeenCalledTimes(4);
  });

  it("tải hỏng: nói không tải được + Tải lại, KHÔNG nói 'chưa có'", async () => {
    goi.companyAccounts.mockRejectedValueOnce(new ApiError("Máy chủ bận.", 500));
    render(<AccountingBankAccountsPage />);
    expect(await screen.findByText("Không tải được tài khoản ngân hàng.")).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có tài khoản/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" });
  });

  it("rỗng: một câu + nút Thêm tài khoản", async () => {
    goi.companyAccounts.mockResolvedValue([]);
    goi.thongKeTaiKhoan.mockResolvedValue([]);
    render(<AccountingBankAccountsPage />);
    expect(
      await screen.findByText("Chưa có tài khoản ngân hàng nào. Thêm tài khoản để lập phiếu chuyển khoản."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Thêm tài khoản" }).length).toBeGreaterThan(0);
  });
});

describe("AccountingBankAccountsPage — thẻ (TK-1)", () => {
  it("thẻ đang dùng: vòng chữ viết tắt, tên + chi nhánh, pill, số nhóm 4 + Chép, chủ tài khoản, thu/chi, thẻ nhỏ", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-tai-khoan-ngan-hang&ky=nam");
    render(<AccountingBankAccountsPage />);
    const the = await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" });
    expect(the.querySelector(".kt-tk__vong")).toHaveTextContent("MB");
    expect(within(the).getByText("Ngân hàng TMCP Quân đội (MB)")).toHaveClass("kt-tk__nh");
    expect(within(the).getByText("Chi nhánh Bình Dương")).toHaveClass("kt-tk__cn");
    expect(within(the).getByText("Đang dùng")).toHaveClass("kt-tt", "kt-tt--xanh");
    expect(the.querySelector(".kt-tk__so")).toHaveTextContent(/^9331 3466 8/);
    expect(within(the).getByText("Công ty Cổ phần In Sao Việt Nhật")).toHaveClass("kt-tk__chu");
    expect(within(the).getByText("Thu trong kỳ")).toBeInTheDocument();
    expect(within(the).getByText("+120.000.000")).toHaveClass("kt-xanh");
    expect(within(the).getByText("Chi trong kỳ")).toBeInTheDocument();
    expect(within(the).getByText("−86.500.000")).toBeInTheDocument();
    const the_ = [...the.querySelectorAll(".kt-tk__the .kt-the")].map((x) => x.textContent);
    expect(the_).toEqual(["Nhận tiền", "Trả tiền", "VND"]);

    await userEvent.click(within(the).getByRole("button", { name: "Chép" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("933134668");
    // Chép không mở ngăn.
    expect(nganMo.props).toBeNull();
    expect(await within(the).findByRole("button", { name: "Đã chép" })).toBeInTheDocument();
  });

  it("chép thất bại (trình duyệt chặn / không có clipboard) ⇒ nút báo ngắn 'Không chép được', không mở ngăn", async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("chặn"));
    render(<AccountingBankAccountsPage />);
    const the = await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" });
    await userEvent.click(within(the).getByRole("button", { name: "Chép" }));
    expect(await within(the).findByRole("button", { name: "Không chép được" })).toBeInTheDocument();
    expect(nganMo.props).toBeNull();

    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const vcb = theTk("Vietcombank 0281 0004 5678 9");
    await userEvent.click(within(vcb).getByRole("button", { name: "Chép" }));
    expect(await within(vcb).findByRole("button", { name: "Không chép được" })).toBeInTheDocument();
  });

  it("tài khoản không có phiếu trong kỳ (vắng ở máy chủ) hiện 0 mờ; chỉ thẻ nhỏ đúng mục đích", async () => {
    render(<AccountingBankAccountsPage />);
    const the = await screen.findByRole("article", { name: "Tài khoản Vietcombank 0281 0004 5678 9" });
    // Tên không có mã trong ngoặc: vòng 40px giữ chữ viết tắt suy ra làm dự phòng.
    expect(the.querySelector(".kt-tk__vong")).toHaveTextContent("VIE");
    const so = the.querySelectorAll(".kt-tk__so-lieu b");
    expect([...so].map((b) => b.textContent)).toEqual(["0", "0"]);
    expect(so[0]).toHaveClass("kt-mo");
    const the_ = [...the.querySelectorAll(".kt-tk__the .kt-the")].map((x) => x.textContent);
    expect(the_).toEqual(["Nhận tiền", "VND"]);
  });

  it("ngừng dùng gom cuối (dù máy chủ trả đầu), nền --paper, pill xám, 'Ngừng từ' + 'vẫn giữ số này'; thẻ Thêm ở cuối", async () => {
    render(<AccountingBankAccountsPage />);
    await screen.findByRole("article", { name: "Tài khoản ACB 1823 4567" });
    const cac = [...document.querySelectorAll(".kt-tks > *")];
    expect(cac.map((x) => x.getAttribute("aria-label") ?? x.textContent)).toEqual([
      "Tài khoản MB 9331 3466 8",
      "Tài khoản Vietcombank 0281 0004 5678 9",
      "Tài khoản ACB 1823 4567",
      "Thêm tài khoảnNhập ngân hàng và số tài khoản",
    ]);
    const acb = theTk("ACB 1823 4567");
    expect(acb).toHaveClass("kt-tk", "kt-tk--ngung");
    expect(within(acb).getByText("Ngừng dùng")).toHaveClass("kt-tt", "kt-tt--xam");
    expect(within(acb).getByText("Ngừng từ")).toBeInTheDocument();
    expect(within(acb).getByText("12/08/2026")).toBeInTheDocument();
    expect(within(acb).getByText("vẫn giữ số này")).toBeInTheDocument();
    expect(cac[3]).toHaveClass("kt-tk", "kt-tk--them");
  });

  it("không nối mẩu thông tin bằng · • hay dấu phẩy", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-tai-khoan-ngan-hang&ky=nam");
    render(<AccountingBankAccountsPage />);
    await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" });
    for (const the of document.querySelectorAll(".kt-tk")) {
      expect(the.textContent).not.toMatch(/[·•]|, /);
    }
  });

  it("không có quyền sửa: không có nút Thêm tài khoản lẫn thẻ Thêm", async () => {
    quyen.coSua = false;
    render(<AccountingBankAccountsPage />);
    await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" });
    expect(screen.queryByRole("button", { name: /Thêm tài khoản/ })).toBeNull();
  });

  it("bấm thẻ hoặc Enter mở ngăn đúng tài khoản kèm số trong kỳ (điền 0 khi vắng); nút Thêm mở form trống", async () => {
    window.history.replaceState(null, "", "/?man=ke-toan-tai-khoan-ngan-hang&ky=nam");
    render(<AccountingBankAccountsPage />);
    await userEvent.click(await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" }));
    expect(screen.getByRole("dialog", { name: "Ngăn 1" })).toBeInTheDocument();
    expect(nganMo.props).toMatchObject({ soLieu: { thu: 120_000_000, chi: 86_500_000, so_phieu: 14 }, coSua: true });
    // ↓ sang thẻ kế (VCB), không có phiếu ⇒ 0.
    (nganMo.props!.xuong as () => void)();
    await screen.findByRole("dialog", { name: "Ngăn 2" });
    expect(nganMo.props).toMatchObject({ soLieu: { thu: 0, chi: 0, so_phieu: 0 } });

    theTk("ACB 1823 4567").focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: "Ngăn 3" });

    await userEvent.click(screen.getAllByRole("button", { name: /Thêm tài khoản/ })[0]);
    expect(screen.getByRole("dialog", { name: "Form thêm" })).toBeInTheDocument();
    expect(formMo.props).toMatchObject({ editing: null });
  });
});

describe("AccountingBankAccountsPage — Ngừng dùng / Dùng lại (TK-4)", () => {
  it("hỏi một lần với câu hệ quả; Đóng không gọi gì; Ngừng dùng gọi toggle đúng một lần rồi nạp lại", async () => {
    goi.toggleCompanyAccount.mockResolvedValue({ ...MB, is_active: false });
    render(<AccountingBankAccountsPage />);
    await userEvent.click(await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" }));
    await userEvent.click(screen.getByRole("button", { name: "Đổi trạng thái ở ngăn" }));
    const hoi = screen.getByRole("alertdialog", { name: "Ngừng dùng tài khoản MB 9331 3466 8?" });
    expect(within(hoi).getByText("Phiếu mới sẽ không chọn được tài khoản này.")).toBeInTheDocument();
    expect(within(hoi).getByText(/Phiếu cũ vẫn giữ nguyên số tài khoản đã ghi\./)).toBeInTheDocument();
    await userEvent.click(within(hoi).getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(goi.toggleCompanyAccount).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Đổi trạng thái ở ngăn" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Ngừng dùng" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(goi.toggleCompanyAccount.mock.calls).toEqual([["token-test", 1]]);
    await waitFor(() => expect(goi.companyAccounts).toHaveBeenCalledTimes(2));
    // Ngăn vẫn mở trên tài khoản đó.
    expect(screen.getByRole("dialog", { name: "Ngăn 1" })).toBeInTheDocument();
  });

  it("tài khoản ngừng dùng: hỏi 'Dùng lại'; lỗi máy chủ nằm TRONG hộp, hộp không đóng", async () => {
    goi.toggleCompanyAccount.mockRejectedValue(new ApiError("Không có quyền.", 403));
    render(<AccountingBankAccountsPage />);
    await userEvent.click(await screen.findByRole("article", { name: "Tài khoản ACB 1823 4567" }));
    await userEvent.click(screen.getByRole("button", { name: "Đổi trạng thái ở ngăn" }));
    const hoi = screen.getByRole("alertdialog", { name: "Dùng lại tài khoản ACB 1823 4567?" });
    await userEvent.click(within(hoi).getByRole("button", { name: "Dùng lại" }));
    expect(await within(hoi).findByRole("alert")).toHaveTextContent("Không có quyền.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("con trỏ mở hộp ở 'Đóng' (không phải nút đổi trạng thái); Tab / Shift+Tab quẩn trong hộp; Enter ngay không gọi gì", async () => {
    render(<AccountingBankAccountsPage />);
    await userEvent.click(await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" }));
    await userEvent.click(screen.getByRole("button", { name: "Đổi trạng thái ở ngăn" }));
    const hoi = screen.getByRole("alertdialog");
    const dong = within(hoi).getByRole("button", { name: "Đóng" });
    const chinh = within(hoi).getByRole("button", { name: "Ngừng dùng" });
    expect(dong).toHaveFocus();
    await userEvent.tab();
    expect(chinh).toHaveFocus();
    await userEvent.tab();
    expect(dong).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(chinh).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(dong).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(goi.toggleCompanyAccount).not.toHaveBeenCalled();
  });

  it("Esc trong hộp hỏi chỉ đóng hộp", async () => {
    render(<AccountingBankAccountsPage />);
    await userEvent.click(await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" }));
    await userEvent.click(screen.getByRole("button", { name: "Đổi trạng thái ở ngăn" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Ngăn 1" })).toBeInTheDocument();
  });

  it("Sửa ở ngăn mở form sửa đúng tài khoản, chồng lên ngăn", async () => {
    render(<AccountingBankAccountsPage />);
    await userEvent.click(await screen.findByRole("article", { name: "Tài khoản MB 9331 3466 8" }));
    await userEvent.click(screen.getByRole("button", { name: "Sửa ở ngăn" }));
    expect(screen.getByRole("dialog", { name: "Form sửa" })).toBeInTheDocument();
    expect(formMo.props).toMatchObject({ editing: MB, tang: 1 });
  });
});
