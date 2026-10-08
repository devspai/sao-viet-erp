// Tab Sản lượng của bàn tổ trên lưới kiểu bảng tính: mỗi mẻ một dòng phẳng, dòng Cộng theo công đoạn.
import { render, screen, within } from "@testing-library/react";
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

  it("mỗi mẻ một dòng phẳng, lệnh lặp ở từng dòng, kèm dòng Cộng theo công đoạn", async () => {
    render(<ThsxSanLuongTab teamId={1} />);
    const bang = await screen.findByRole("table");
    expect(within(bang).getAllByText("LSX26-0007")).toHaveLength(2); // lệnh lặp ở cả hai dòng mẻ
    expect(within(bang).getByText("In offset")).toBeInTheDocument();
    expect(within(bang).getByText("Chưa khai việc khoán")).toBeInTheDocument();
    expect(within(bang).getByText("Nguyễn A")).toBeInTheDocument();
    expect(within(bang).getByText("Chưa ai vào mẻ")).toBeInTheDocument();
    // Khổ cm: 78,5 × 109 — số lẻ một chữ.
    expect(within(bang).getAllByText(/78,5×109/)).toHaveLength(2);
    const cong = bang.querySelector("tr.lds-cong") as HTMLElement;
    expect(cong).not.toBeNull();
    expect(within(cong).getByText(/Cộng LSX26-0007/)).toBeInTheDocument();
    expect(within(cong).getByText("1.500")).toBeInTheDocument();
    expect(within(cong).getByText("2 mẻ")).toBeInTheDocument();
  });

  it("ô tìm gửi lên máy chủ, không lọc trong JS", async () => {
    render(<ThsxSanLuongTab teamId={1} />);
    await screen.findByRole("table");
    expect(sanLuongTo).toHaveBeenCalledWith("t", expect.objectContaining({ team_id: 1, trang: 1, co_trang: 25 }));
  });
});
