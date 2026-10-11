import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThsxSapXepNut } from "./ThsxSapXep";

describe("ThsxSapXepNut", () => {
  it("nút nói cách xếp đang dùng; mở menu chọn cách khác thì gọi onChange và đóng menu", () => {
    const onChange = vi.fn();
    render(<ThsxSapXepNut value="moi_nhan" onChange={onChange} />);
    const nut = screen.getByRole("button", { name: "Sắp xếp: Mới nhận trước" });
    fireEvent.click(nut);
    expect(screen.getByRole("menuitemradio", { name: "Mới nhận trước" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Theo giờ dự kiến" }));
    expect(onChange).toHaveBeenLastCalledWith("du_kien");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Esc đóng menu", () => {
    render(<ThsxSapXepNut value="cu_nhan" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sắp xếp: Nhận lâu nhất trước" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
