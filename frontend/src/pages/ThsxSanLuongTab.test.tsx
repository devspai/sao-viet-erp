// Tab Sản lượng của bàn tổ: bảng mỗi mẻ một dòng, lệnh và công đoạn gộp ô, dòng Cộng theo công đoạn.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SxSanLuongTo } from "../api/client";
import { ThsxSanLuongTab } from "./ThsxSanLuongTab";

const sanLuongTo = vi.fn();

vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ token: "t" }) }));
vi.mock("../api/client", async (orig) => {
  const m = await orig<typeof import("../api/client")>();
  return { ...m, api: { ...m.api, sanXuat: { ...m.api.sanXuat, sanLuongTo: (...a: unknown[]) => sanLuongTo(...a) } } };
});

const du_lieu = {
  team_id: 1, tu: "2026-10-01", den: "2026-10-08", to_id: null, trang: 1, co_trang: 25, tong_lenh: 1,
  co_pham_vi_tron: true, co_pham_vi_rieng: false, cac_to: [{ id: 1, ten: "Tổ in", cap: 0 }],
  tong: [{ don_vi: "to", tot: 1500, hong: 0, so_me: 2 }],
  cap_nhat_luc: null,
  lenh: [{
    nguon_loai: "lsx", nguon_id: 7, ma: "LSX26-0007", ten: "Hộp bánh 500g", so_me: 2,
    ngay_dau: "2026-10-02", ngay_cuoi: "2026-10-03",
    quy_cach: { giay: "Couche", dinh_luong: 300, to_nguyen: { dai: 785, rong: 1090 }, to_in: { dai: 540, rong: 780 }, con: null },
    san_luong: [],
    cong_doan: [{
      cong_viec_id: 11, ten_cong_doan: "In 4 màu", to_id: 1, to_ten: "Tổ in", la_khach: false, so_me: 2,
      san_luong: [{ don_vi: "to", tot: 1500, hong: 0 }],
      me: [
        {
          batch_id: 1, ngay: "2026-10-02", bat_dau: null, ket_thuc: null, viec_khoan_ten: "In offset",
          tot: 1000, hong: 0, don_vi: "to", phat_sinh: [],
          nguoi: [{ employee_id: 5, ho_ten: "Nguyễn A", to_ten: null }],
        },
        {
          batch_id: 2, ngay: "2026-10-03", bat_dau: null, ket_thuc: null, viec_khoan_ten: null,
          tot: 500, hong: 0, don_vi: "to", phat_sinh: [], nguoi: [],
        },
      ],
    }],
  }],
} as unknown as SxSanLuongTo;

describe("ThsxSanLuongTab (lưới)", () => {
  beforeEach(() => {
    localStorage.clear();
    sanLuongTo.mockReset();
    sanLuongTo.mockResolvedValue(du_lieu);
  });

  it("mỗi mẻ một dòng, lệnh và quy cách gộp ô một lần cho cả khối, kèm dòng Cộng theo công đoạn", async () => {
    render(<ThsxSanLuongTab teamId={1} />);
    const bang = await screen.findByRole("table");
    expect(within(bang).getAllByText("LSX26-0007")).toHaveLength(1); // ô lệnh gộp hai dòng mẻ
    expect(bang.querySelector("td.thsx-sl__o-lenh")?.getAttribute("rowspan")).toBe("2");
    expect(bang.querySelectorAll("td.thsx-sl__o-cd")).toHaveLength(1);
    // Không còn cột "Công việc": khoán là cấu hình của công đoạn (10/10/2026).
    expect(within(bang).queryByText("In offset")).toBeNull();
    expect(within(bang).queryByText(/việc khoán/i)).toBeNull();
    expect(within(bang).getByText("Việc phát sinh")).toBeInTheDocument();
    expect(within(bang).getByText("Nguyễn A")).toBeInTheDocument();
    expect(within(bang).getByText("Chưa ai tham gia")).toBeInTheDocument();
    // Khổ cm: 78,5 × 109 — số lẻ một chữ.
    expect(bang.querySelector("td.thsx-sl__o-qc")?.textContent).toContain("78,5×109");
    // Không còn dòng Cộng dưới lệnh (10/10/2026).
    expect(within(bang).queryByText(/^Cộng /)).toBeNull();
    expect(within(bang).queryByText(/lần ghi$/)).toBeNull();
  });

  it("thanh công cụ theo khuôn bàn tổ: kỳ mặc định tháng này, nút Lọc, nút Cột; không còn ô ngày rời", async () => {
    render(<ThsxSanLuongTab teamId={1} />);
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: /^Kỳ: Tháng này theo ngày bắt đầu/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lọc/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cột/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Từ ngày")).toBeNull();
    const loc = sanLuongTo.mock.calls[0][1] as { tu: string; den: string };
    expect(loc.tu.slice(8)).toBe("01");
    expect(loc.tu.slice(0, 7)).toBe(loc.den.slice(0, 7));
  });

  it("menu Lọc có đủ điều kiện; chọn công đoạn thì gửi lên máy chủ", async () => {
    sanLuongTo.mockResolvedValue({ ...du_lieu, lua_chon: { cong_doan: ["In 4 màu"], nguoi: [] } });
    render(<ThsxSanLuongTab teamId={1} />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: /^Lọc/ }));
    const pop = document.querySelector(".tl-pop") as HTMLElement;
    for (const ten of ["Đơn vị", "Công đoạn", "Người tham gia", "Việc phát sinh", "Loại lệnh", "Lệnh gấp"]) {
      expect(within(pop).getByText(ten)).toBeInTheDocument();
    }
    fireEvent.click(within(pop).getByText("Công đoạn"));
    fireEvent.click(await within(document.querySelector(".tl-pop") as HTMLElement).findByText("In 4 màu"));
    await waitFor(() => expect(sanLuongTo).toHaveBeenLastCalledWith(
      "t", expect.objectContaining({ cong_doan: ["In 4 màu"] })));
  });

  it("ô tìm gửi lên máy chủ, không lọc trong JS", async () => {
    render(<ThsxSanLuongTab teamId={1} />);
    await screen.findByRole("table");
    expect(sanLuongTo).toHaveBeenCalledWith("t", expect.objectContaining({ team_id: 1, trang: 1, co_trang: 25 }));
  });
});
