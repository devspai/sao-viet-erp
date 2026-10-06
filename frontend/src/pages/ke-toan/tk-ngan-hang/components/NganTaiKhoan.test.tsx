/** Ngăn tài khoản (TK-2): đầu ngăn (tiêu đề số nhóm 4 + pill, Sửa + "⋯", tóm tắt 4 ô), ba tab có số;
 *  "Phiếu qua tài khoản" gộp phiếu chi ĐÃ CHI + phiếu thu ĐÃ THU của tài khoản trong kỳ, ngày giảm dần,
 *  "Xem thêm" xin trang kế của TỪNG sổ ở máy chủ và nối không trùng; thiếu quyền một sổ thì không gọi
 *  sổ đó; sự kiện đẩy nạp lại; Lịch sử dựng từ trường của tài khoản. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PaymentReceiptRow, PaymentVoucherRow } from "../../../../api/client";
import { taiKhoan } from "../shared/mauTaiKhoan";

const goi = vi.hoisted(() => ({ vouchers: vi.fn(), receipts: vi.fn() }));
vi.mock("../../../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
vi.mock("../../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../../api/client")>()),
  api: { accounting: goi },
}));

import { NganTaiKhoan, lichSuTaiKhoan } from "./NganTaiKhoan";

const KY = { tu: "2026-10-01", den: "2026-10-06" };
const MB = taiKhoan({ id: 1, note: "Tài khoản chính để khách chuyển khoản vào." });

const chi = (id: number, ngay: string, so = 1_000_000) =>
  ({ id, code: `UNC-${id}`, voucher_date: ngay, content: `Chi ${id}`, amount_vnd: so, amount: so }) as unknown as PaymentVoucherRow;
const thu = (id: number, ngay: string, so = 1_000_000) =>
  ({ id, code: `PT-${id}`, receipt_date: ngay, content: `Thu ${id}`, amount_vnd: so, amount: so }) as unknown as PaymentReceiptRow;

function veNgan(p: Partial<Parameters<typeof NganTaiKhoan>[0]> = {}) {
  const props = {
    taiKhoan: MB,
    soLieu: { thu: 120_000_000, chi: 86_500_000, so_phieu: 14 },
    ky: KY,
    eventTick: 0,
    coSua: true,
    quyen: { xemChi: true, xemThu: true },
    navigate: vi.fn(),
    onDong: vi.fn(),
    onSua: vi.fn(),
    onDoiTrangThai: vi.fn(),
    ...p,
  };
  return { props, ...render(<NganTaiKhoan {...props} />) };
}

const moTabPhieu = () => userEvent.click(screen.getByRole("tab", { name: /^Phiếu qua tài khoản/ }));
const dongBang = () => [...document.querySelectorAll(".kt-nhom tbody tr")].map((tr) => tr.querySelector("td:nth-child(2)")!.textContent);

beforeEach(() => {
  goi.vouchers.mockReset();
  goi.receipts.mockReset();
  goi.vouchers.mockResolvedValue({ items: [chi(1, "2026-10-05", 45_200_000)], total: 1 });
  goi.receipts.mockResolvedValue({ items: [thu(7, "2026-10-06", 32_000_000), thu(6, "2026-10-02", 58_600_000)], total: 2 });
});

describe("NganTaiKhoan — đầu ngăn và Thông tin", () => {
  it("tiêu đề, pill, Sửa + ⋯ Ngừng dùng, tóm tắt 4 ô, tab có số; tab Thông tin không lặp số tài khoản / loại tiền", async () => {
    const { props } = veNgan();
    const ngan = screen.getByRole("dialog", { name: "MB 9331 3466 8" });
    expect(within(ngan).getByText("Đang dùng")).toHaveClass("kt-tt--xanh");
    const su = [...ngan.querySelectorAll(".kt-ngan__su > div")].map((d) => d.textContent);
    expect(su).toEqual([
      "Thu trong kỳ+120.000.000 đ", "Chi trong kỳ−86.500.000 đ", "Số phiếu trong kỳ14 phiếu", "Loại tiềnVND",
    ]);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Thông tin", "Phiếu qua tài khoản14", "Lịch sử1"]);

    const kv = ngan.querySelector(".kt-kv")!;
    expect([...kv.querySelectorAll("dt")].map((d) => d.textContent)).toEqual([
      "Ngân hàng", "Chi nhánh", "Chủ tài khoản", "Dùng để", "Ghi chú",
    ]);
    expect([...kv.querySelectorAll("dd .kt-the")].map((d) => d.textContent)).toEqual(["Nhận tiền", "Trả tiền"]);
    expect(ngan.textContent).not.toMatch(/[·•]/);
    // Chưa mở tab phiếu ⇒ chưa gọi sổ nào.
    expect(goi.vouchers).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Sửa" }));
    expect(props.onSua).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Thao tác khác" }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Ngừng dùng/ }));
    expect(props.onDoiTrangThai).toHaveBeenCalledTimes(1);
  });

  it("tài khoản ngừng dùng: pill xám, menu Dùng lại; không có quyền sửa thì không có Sửa / ⋯; chưa tải số thì —", () => {
    const { unmount } = veNgan({ taiKhoan: taiKhoan({ is_active: false }) });
    expect(screen.getByText("Ngừng dùng")).toHaveClass("kt-tt--xam");
    unmount();
    veNgan({ coSua: false, soLieu: null });
    expect(screen.queryByRole("button", { name: "Sửa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thao tác khác" })).toBeNull();
    const su = [...document.querySelectorAll(".kt-ngan__su > div b")].map((d) => d.textContent);
    expect(su.slice(0, 3)).toEqual(["—", "—", "—"]);
  });
});

describe("NganTaiKhoan — Phiếu qua tài khoản", () => {
  it("gọi hai sổ đúng tham số; gộp ngày giảm dần; + xanh cho thu, − cho chi; mã là link sang đúng màn", async () => {
    const { props } = veNgan();
    await moTabPhieu();
    await waitFor(() => expect(dongBang()).toEqual(["PT-7", "UNC-1", "PT-6"]));
    expect(goi.vouchers.mock.calls).toEqual([[
      "token-test",
      { tai_khoan_id: 1, tu_ngay: "2026-10-01", den_ngay: "2026-10-06", status: "paid", sort: "-voucher_date", page: 1, size: 20 },
    ]]);
    expect(goi.receipts.mock.calls).toEqual([[
      "token-test",
      { tai_khoan_id: 1, tu_ngay: "2026-10-01", den_ngay: "2026-10-06", status: "received", sort: "-receipt_date", page: 1, size: 20 },
    ]]);
    const hang = document.querySelectorAll(".kt-nhom tbody tr");
    expect(hang[0].querySelector(".kt-so")).toHaveTextContent("+32.000.000");
    expect(hang[0].querySelector(".kt-so")).toHaveClass("kt-xanh");
    expect(hang[1].querySelector(".kt-so")).toHaveTextContent("−45.200.000");
    expect(hang[1]).toHaveTextContent("05/10/2026");
    expect(hang[1]).toHaveTextContent("Chi 1");
    expect(screen.queryByRole("button", { name: "Xem thêm" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "UNC-1" }));
    expect(props.navigate).toHaveBeenCalledWith("ke-toan-phieu-chi", { focusVoucherQuery: "UNC-1" });
    await userEvent.click(screen.getByRole("button", { name: "PT-7" }));
    expect(props.navigate).toHaveBeenCalledWith("ke-toan-phieu-thu", { focusReceiptQuery: "PT-7" });
  });

  it("Xem thêm: trang kế của sổ còn phiếu, nối không trùng loại+id; sổ đã tải hết không gọi lại", async () => {
    const trang1 = Array.from({ length: 20 }, (_, i) => chi(100 - i, "2026-10-05"));
    goi.vouchers.mockResolvedValueOnce({ items: trang1, total: 22 });
    goi.receipts.mockResolvedValueOnce({ items: [thu(7, "2026-10-06"), thu(6, "2026-10-02")], total: 2 });
    veNgan();
    await moTabPhieu();
    // Phiếu thu 02/10 cũ hơn phiếu chi cuối đã tải (05/10) mà sổ chi còn trang ⇒ chưa hiện.
    await waitFor(() => expect(dongBang()).toHaveLength(21));
    expect(screen.getByText("Hiện 21 trên 24 phiếu")).toBeInTheDocument();

    // Trang 2 lặp lại dòng cuối trang 1 (có phiếu mới chen giữa hai lần tải) + 2 dòng mới.
    goi.vouchers.mockResolvedValueOnce({ items: [chi(81, "2026-10-05"), chi(80, "2026-10-04"), chi(79, "2026-10-03")], total: 22 });
    await userEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    await waitFor(() => expect(dongBang()).toHaveLength(24));
    expect(goi.vouchers.mock.calls[1][1]).toMatchObject({ page: 2, size: 20 });
    expect(goi.receipts).toHaveBeenCalledTimes(1);
    const ma = dongBang();
    expect(new Set(ma).size).toBe(ma.length);
    expect(ma[0]).toBe("PT-7");
    expect(ma.slice(-3)).toEqual(["UNC-80", "UNC-79", "PT-6"]);
    expect(screen.queryByRole("button", { name: "Xem thêm" })).toBeNull();
  });

  it("thiếu quyền một sổ: tab không mang số (số thống kê gồm cả sổ bị ẩn); tiêu đề dùng nguyên tên ngân hàng khi không có mã", () => {
    veNgan({ quyen: { xemChi: true, xemThu: false }, taiKhoan: taiKhoan({ bank_name: "Vietcombank" }) });
    expect(screen.getByRole("dialog", { name: "Vietcombank 9331 3466 8" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Thông tin", "Phiếu qua tài khoản", "Lịch sử1"]);
  });

  it("chỉ có quyền xem phiếu thu: không gọi sổ phiếu chi, nói rõ phần bị ẩn", async () => {
    veNgan({ quyen: { xemChi: false, xemThu: true } });
    await moTabPhieu();
    await waitFor(() => expect(dongBang()).toEqual(["PT-7", "PT-6"]));
    expect(goi.vouchers).not.toHaveBeenCalled();
    expect(screen.getByText("Không hiện phiếu chi vì bạn chưa có quyền xem Phiếu chi.")).toBeInTheDocument();
  });

  it("không có quyền xem sổ nào: không gọi máy chủ, một câu giải thích", async () => {
    veNgan({ quyen: { xemChi: false, xemThu: false } });
    await moTabPhieu();
    expect(screen.getByText("Cần quyền xem Phiếu chi hoặc Phiếu thu để xem phiếu qua tài khoản này.")).toBeInTheDocument();
    expect(goi.vouchers).not.toHaveBeenCalled();
    expect(goi.receipts).not.toHaveBeenCalled();
  });

  it("rỗng trong kỳ: một câu; tải hỏng: lỗi + Tải lại, không nói 'chưa có'", async () => {
    goi.vouchers.mockResolvedValue({ items: [], total: 0 });
    goi.receipts.mockResolvedValue({ items: [], total: 0 });
    const { unmount } = veNgan();
    await moTabPhieu();
    expect(await screen.findByText("Chưa có phiếu nào qua tài khoản này trong kỳ.")).toBeInTheDocument();
    unmount();
    goi.vouchers.mockResolvedValue({ items: [chi(1, "2026-10-05", 45_200_000)], total: 1 });
    goi.receipts.mockResolvedValue({ items: [thu(7, "2026-10-06", 32_000_000), thu(6, "2026-10-02", 58_600_000)], total: 2 });
    goi.vouchers.mockRejectedValueOnce(new Error("mạng"));
    veNgan();
    await moTabPhieu();
    expect(await screen.findByText("Không tải được phiếu qua tài khoản.")).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có phiếu/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(dongBang()).toEqual(["PT-7", "UNC-1", "PT-6"]));
  });

  it("sự kiện đẩy (eventTick đổi) nạp lại hai sổ khi tab phiếu đã mở", async () => {
    const { props, rerender } = veNgan();
    await moTabPhieu();
    await waitFor(() => expect(goi.vouchers).toHaveBeenCalledTimes(1));
    rerender(<NganTaiKhoan {...props} eventTick={1} />);
    await waitFor(() => expect(goi.vouchers).toHaveBeenCalledTimes(2));
    expect(goi.receipts).toHaveBeenCalledTimes(2);
  });
});

describe("NganTaiKhoan — Lịch sử (dựng từ trường của tài khoản)", () => {
  it("chưa đổi gì: một việc Thêm tài khoản; đã đổi: thêm việc Thay đổi gần nhất kèm trạng thái hiện tại, mới nhất trên", () => {
    expect(lichSuTaiKhoan(MB).map((v) => v.ten)).toEqual(["Thêm tài khoản"]);
    const doi = lichSuTaiKhoan(taiKhoan({ is_active: false, updated_at: "2026-08-12T03:00:00" }));
    expect(doi.map((v) => [v.ten, v.moc])).toEqual([
      ["Thay đổi gần nhất", "2026-08-12T03:00:00"],
      ["Thêm tài khoản", "2026-06-14T01:05:00"],
    ]);
  });

  it("tab Lịch sử hiện dòng thời gian + câu nói rõ nguồn", async () => {
    veNgan({ taiKhoan: taiKhoan({ updated_at: "2026-08-02T03:20:00" }) });
    await userEvent.click(screen.getByRole("tab", { name: /^Lịch sử/ }));
    expect(screen.getByText("Thay đổi gần nhất")).toBeInTheDocument();
    expect(screen.getByText("Thêm tài khoản")).toBeInTheDocument();
    expect(screen.getByText(/màn Nhật ký/)).toBeInTheDocument();
  });
});
