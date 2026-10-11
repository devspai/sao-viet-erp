import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ThsxHop } from "./ThsxHop";

function ve(p: Partial<Parameters<typeof ThsxHop>[0]> = {}) {
  const onDong = vi.fn();
  const onChinh = vi.fn();
  const onPhimTat = vi.fn();
  render(
    <ThsxHop tieuDe="Ghi sản lượng" phuDe="Cắt tờ của LSX26-0004" nutChinh="Ghi sản lượng" phimTat="Ctrl + Enter để ghi"
      onDong={onDong} onChinh={onChinh} onPhimTat={onPhimTat} {...p}>
      <input aria-label="Số lượng" />
    </ThsxHop>,
  );
  return { onDong, onChinh, onPhimTat };
}

describe("ThsxHop", () => {
  it("có tiêu đề, phụ đề, gắn nhãn hộp bằng tiêu đề", () => {
    ve();
    expect(screen.getByRole("dialog", { name: "Ghi sản lượng" })).toBeInTheDocument();
    expect(screen.getByText("Cắt tờ của LSX26-0004")).toBeInTheDocument();
    expect(screen.getByText("Ctrl + Enter để ghi")).toBeInTheDocument();
  });

  it("Esc đóng, trừ khi đang gửi", () => {
    const { onDong } = ve();
    fireEvent.keyDown(screen.getByLabelText("Số lượng"), { key: "Escape" });
    expect(onDong).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+Enter gọi phím tắt khi nút chính không khoá", () => {
    const { onPhimTat } = ve();
    fireEvent.keyDown(screen.getByLabelText("Số lượng"), { key: "Enter", ctrlKey: true });
    expect(onPhimTat).toHaveBeenCalledTimes(1);
  });

  it("nút chính khoá thì disabled và Ctrl+Enter không gọi", () => {
    const { onPhimTat, onChinh } = ve({ nutChinhKhoa: true });
    const nut = screen.getByRole("button", { name: "Ghi sản lượng" });
    expect(nut).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText("Số lượng"), { key: "Enter", ctrlKey: true });
    fireEvent.click(nut);
    expect(onPhimTat).not.toHaveBeenCalled();
    expect(onChinh).not.toHaveBeenCalled();
  });

  it("đang gửi: Esc không đóng, có câu lỗi thì hiện", () => {
    const { onDong } = ve({ dangGui: true, loi: "Mất kết nối" });
    fireEvent.keyDown(screen.getByLabelText("Số lượng"), { key: "Escape" });
    expect(onDong).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Mất kết nối");
  });

  it("nút phụ mặc định Huỷ gọi onDong", () => {
    const { onDong } = ve();
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(onDong).toHaveBeenCalled();
  });
});
