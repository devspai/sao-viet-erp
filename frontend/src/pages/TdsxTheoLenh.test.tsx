// Góc Theo lệnh (làm gọn 05/10/2026, đặc tả 3.4): mỗi lệnh còn sống một dòng, vấn đề là pill đỏ,
// quá 200 dòng thì NÓI RA chứ không phân trang giả.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TdsxTheoLenhDong, TdsxTheoLenhOut } from "../api/client";
import { TdsxTheoLenh } from "./TdsxTheoLenh";

const DEM = { tre_han: 1, su_co: 1, tam_dung: 0, kcs_khong_dat: 0, may_hong: 0, chua_may: 0 };

function lenh(id: number, extra: Partial<TdsxTheoLenhDong> = {}): TdsxTheoLenhDong {
  return {
    lsx_id: id, ma: `LSX26-00${id}`, ten: `Hộp ${id}`, is_rush: false, so_luong_dat: 12000,
    don_vi_tinh: "cái", khach_hang: "Công ty Sao",
    chang: [
      { ten: "In", nhom: null, trang_thai: "xong", hien_tai: false },
      { ten: "Cán màng", nhom: null, trang_thai: "chay", hien_tai: true },
      { ten: "Bế", nhom: null, trang_thai: "cho", hien_tai: false },
    ],
    buoc_hien_tai: "Cán màng", khau: "dang_sx", khau_chi_tiet: null,
    han_hoan_thanh_sx: "2026-10-10", created_at: "2026-10-01T03:00:00Z", du_kien_xong: null,
    canh_bao: [], tre_ngay: null,
    ...extra,
  };
}

const DATA: TdsxTheoLenhOut = {
  items: [
    lenh(31, {
      is_rush: true, canh_bao: ["tre_han", "su_co"], tre_ngay: 2, du_kien_xong: "2026-10-12T15:00:00",
    }),
    lenh(32, { khau: "sau_sx", khau_chi_tiet: "cho_nhap_kho", buoc_hien_tai: null }),
  ],
  total: 2,
  bat_thuong: DEM,
};

function ve(data: TdsxTheoLenhOut | null = DATA, onMo = vi.fn()) {
  render(<TdsxTheoLenh data={data} dangTai={false} rong={<p>RỖNG</p>} onMo={onMo} />);
  return onMo;
}

describe("TdsxTheoLenh · bảng theo lệnh", () => {
  it("⭐ tám cột đúng thứ tự (Mã, Ngày tạo, Hạn SX, Khách, Hàng, Số lượng, Đang ở, Vấn đề)", () => {
    ve();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Lệnh", "Ngày tạo", "Hạn SX", "Khách hàng", "Sản phẩm", "Số lượng", "Đang ở", "Vấn đề",
    ]);
  });

  it("cột ẩn theo cotAn, thứ tự kéo thả theo thuTu (cột mã đứng yên)", () => {
    render(
      <TdsxTheoLenh data={DATA} dangTai={false} rong={<p>RỖNG</p>} onMo={() => {}}
        cotAn={new Set(["khach", "han"])} thuTu={["van_de", "sp"]} />,
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Lệnh", "Vấn đề", "Sản phẩm", "Ngày tạo", "Số lượng", "Đang ở",
    ]);
  });

  it("⭐ lệnh trễ: chip 'Trễ 2 ngày' + 'Sự cố đang mở', hạn kèm 'dự kiến 12/10' đỏ, GẤP, hạn đủ ngày/tháng/năm", () => {
    ve();
    const tr = screen.getByRole("button", { name: /LSX26-0031/ }).closest("tr")!;
    expect(within(tr).getByText("GẤP")).toBeInTheDocument();
    expect(within(tr).getByText("Trễ 2 ngày").className).toContain("lds-chip--do");
    expect(within(tr).getByText("Sự cố đang mở").className).toContain("lds-chip--cam");
    expect(within(tr).getByText("dự kiến 12/10").className).toContain("lds-do");
    expect(within(tr).getByText("10/10/2026")).toBeInTheDocument();
  });

  it("⭐ Đang ở: đang SX = dải chặng + bước + 'bước i trên n'; xong SX = chữ khâu", () => {
    ve();
    const tr31 = screen.getByRole("button", { name: /LSX26-0031/ }).closest("tr")!;
    expect(within(tr31).getByRole("img", { name: /công đoạn 2 trên 3, Cán màng đang chạy/ })).toBeInTheDocument();
    expect(within(tr31).getByText("bước 2 trên 3")).toBeInTheDocument();
    const tr32 = screen.getByRole("button", { name: /LSX26-0032/ }).closest("tr")!;
    expect(within(tr32).getByText("Chờ nhập kho")).toBeInTheDocument();
    expect(within(tr32).queryByRole("img")).toBeNull();
  });

  it("⭐ bấm mã lệnh mở hồ sơ đúng lệnh", async () => {
    const onMo = ve();
    await userEvent.click(screen.getByRole("button", { name: /LSX26-0032/ }));
    expect(onMo).toHaveBeenCalledWith(32);
  });

  it("⭐ bấm vào dòng (không phải nút mã) cũng mở hồ sơ; Enter trên dòng mở một lần", async () => {
    const onMo = ve();
    const tr = screen.getByRole("button", { name: /LSX26-0031/ }).closest("tr")!;
    await userEvent.click(within(tr).getByText("Hộp 31"));
    expect(onMo).toHaveBeenCalledTimes(1);
    expect(onMo).toHaveBeenCalledWith(31);
    tr.focus();
    await userEvent.keyboard("{Enter}");
    expect(onMo).toHaveBeenCalledTimes(2);
  });

  it("nút mã không thêm điểm dừng Tab (tabIndex -1); ô Vấn đề có title nối các nhãn bằng khoảng trắng", () => {
    ve();
    const nut = screen.getByRole("button", { name: /LSX26-0031/ });
    expect(nut).toHaveAttribute("tabindex", "-1");
    expect(nut.closest("tr")).toHaveAttribute("tabindex", "0");
    const tds = nut.closest("tr")!.querySelectorAll("td");
    expect(tds[tds.length - 1]).toHaveAttribute("title", "Trễ 2 ngày   Sự cố đang mở");
  });

  it("dòng đang mở hồ sơ viền đủ cạnh (is-chon)", () => {
    render(<TdsxTheoLenh data={DATA} dangTai={false} rong={<p>RỖNG</p>} onMo={() => {}} dangMo={32} />);
    const tr32 = screen.getByRole("button", { name: /LSX26-0032/ }).closest("tr")!;
    expect(tr32.className).toContain("is-chon");
    expect(screen.getByRole("button", { name: /LSX26-0031/ }).closest("tr")!.className).not.toContain("is-chon");
  });

  it("⭐ máy chủ cắt 200 dòng ⇒ nói 'Hiện 2 trên 350 lệnh, thu hẹp bằng ô tìm.'", () => {
    ve({ ...DATA, total: 350 });
    expect(screen.getByRole("note").textContent).toBe("Hiện 2 trên 350 lệnh, thu hẹp bằng ô tìm.");
  });

  it("không cắt ⇒ không có dòng nhắc; rỗng ⇒ ô báo của trang", () => {
    ve({ items: [], total: 0, bat_thuong: DEM });
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText("RỖNG")).toBeInTheDocument();
  });
});
