import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api, type ThanhPhamChuaGiaGocPage, type ThanhPhamChuaGiaGocRow } from "../api/client";
import { KhoGiaGocThanhPham } from "./KhoGiaGocThanhPham";

const lo = (p: Partial<ThanhPhamChuaGiaGocRow>): ThanhPhamChuaGiaGocRow => ({
  lot_id: 70, ma_lo: "LOT-TP-00010-260918-01", ngay_nhap: "2026-09-18", kho_id: 4, kho_ten: "Kho Vật tư đóng gói",
  hang_id: 64, ma_hang: "TP-00010", ten_hang: "Menu để bàn A4 in 2 mặt", dvt: "cai", dvt_ten: "cái",
  so_luong_nhap: 1500, don_gia: 0, don_gia_ban: 2708, lsx_ma: "LSX26-0006", order_ma: "DH003",
  khach_hang: "Công ty TNHH Thực phẩm Minh Long", sl_con_lai: 1500, don_vi_goc_ten: "cái", so_lo: 1, ...p,
});

const trang = (items: ThanhPhamChuaGiaGocRow[]): ThanhPhamChuaGiaGocPage => ({
  items, total: items.length, page: 1, size: 50,
  cac_kho: [{ id: 4, ten: "Kho Vật tư đóng gói" }, { id: 6, ten: "Kho thành phẩm" }],
  cac_khach: [{ id: 9, ten: "Công ty TNHH Thực phẩm Minh Long" }],
  cac_hang: [{ id: 64, ten: "Menu để bàn A4 in 2 mặt" }],
});

describe("KhoGiaGocThanhPham", () => {
  afterEach(() => vi.restoreAllMocks());

  it("nút Lọc: chọn nhiều kho nhập gửi danh sách id lên máy chủ; bỏ Trạng thái giá là xin mọi lô", async () => {
    const user = userEvent.setup();
    const ds = vi.spyOn(api.kho.baoCao, "thanhPhamChuaGiaGoc").mockResolvedValue(trang([lo({})]));
    render(<KhoGiaGocThanhPham token="t" />);
    await screen.findByText("LOT-TP-00010-260918-01");
    // Mặc định chỉ lô chưa có giá gốc.
    expect(ds).toHaveBeenLastCalledWith("t", expect.objectContaining({ gia: "chua", khoIds: [] }));

    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Kho nhập/ }));
    await user.click(screen.getByRole("checkbox", { name: /Kho Vật tư đóng gói/ }));
    await user.click(screen.getByRole("checkbox", { name: /Kho thành phẩm/ }));
    await waitFor(() => expect(ds).toHaveBeenLastCalledWith("t", expect.objectContaining({ khoIds: [4, 6], page: 1 })));
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /^Bỏ lọc Trạng thái giá/ }));
    await waitFor(() => expect(ds).toHaveBeenLastCalledWith("t", expect.objectContaining({ gia: "tat_ca" })));
  });

  it("ô giá: gõ là định dạng, nút Lưu giữ chỗ sẵn, Esc/để trống là trả về giá cũ", async () => {
    vi.spyOn(api.kho.baoCao, "thanhPhamChuaGiaGoc").mockResolvedValue(trang([lo({ don_gia: 1900 })]));
    render(<KhoGiaGocThanhPham token="t" />);
    const o = (await screen.findByLabelText("Giá gốc lô LOT-TP-00010-260918-01")) as HTMLInputElement;
    // Cụm nút ẩn bằng visibility (aria-hidden) nên không truy theo tên được — lấy cạnh ô giá.
    const nut = o.parentElement!.querySelector(".kgg-gia__nut") as HTMLElement;
    expect(o.value).toBe("1.900");
    expect(nut.style.visibility).toBe("hidden");

    fireEvent.change(o, { target: { value: "18500" } });
    expect(o.value).toBe("18.500");
    expect(nut.style.visibility).toBe("visible");
    fireEvent.keyDown(o, { key: "Escape" });
    expect(o.value).toBe("1.900");
    expect(nut.style.visibility).toBe("hidden");

    fireEvent.change(o, { target: { value: "" } });
    expect(o.value).toBe("");
    fireEvent.blur(o);
    expect(o.value).toBe("1.900");
  });

  it("chân bảng: mặc định xin 25 dòng, đổi Dòng/trang thì gửi cỡ mới và về trang 1", async () => {
    const ds = vi.spyOn(api.kho.baoCao, "thanhPhamChuaGiaGoc").mockResolvedValue(trang([lo({})]));
    render(<KhoGiaGocThanhPham token="t" />);
    await screen.findByText("LOT-TP-00010-260918-01");
    expect(ds).toHaveBeenLastCalledWith("t", expect.objectContaining({ page: 1, size: 25 }));
    expect(screen.getByRole("navigation", { name: "Phân trang giá gốc thành phẩm" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "50" } });
    await waitFor(() => expect(ds).toHaveBeenLastCalledWith("t", expect.objectContaining({ page: 1, size: 50 })));
  });

  it("Lưu mở hộp xác nhận giá cũ → mới rồi gọi sửa giá gốc", async () => {
    vi.spyOn(api.kho.baoCao, "thanhPhamChuaGiaGoc").mockResolvedValue(trang([lo({})]));
    const sua = vi.spyOn(api.kho.phieu, "suaGiaGoc").mockResolvedValue({
      lot_id: 70, ma_lo: "LOT-TP-00010-260918-01", don_gia_cu: 0, don_gia: 540, don_gia_nhap: 540, so_lo: 1,
    });
    render(<KhoGiaGocThanhPham token="t" />);
    const o = (await screen.findByLabelText("Giá gốc lô LOT-TP-00010-260918-01")) as HTMLInputElement;
    expect(o.placeholder).toBe("Chưa có giá");
    fireEvent.change(o, { target: { value: "540" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(screen.getByText(/giá gốc 0 → 540 đ\/cái/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá gốc" }));
    await waitFor(() => expect(sua).toHaveBeenCalledWith("t", 70, 540));
    expect(await screen.findByText(/Đã đổi giá gốc lô LOT-TP-00010-260918-01: 0 → 540 đ/)).toBeTruthy();
  });
});
