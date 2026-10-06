/** Vỏ form lập phiếu: đang lưu thì KHÔNG đóng được (Esc, nút X) — lời gọi lập còn chạy, đóng giữa
 *  chừng là mất báo lỗi tải chứng từ và trang không được báo phiếu mới. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KhungFormPhieu } from "./KhungFormPhieu";

function Khung({ dangLuu, onDong }: { dangLuu: boolean; onDong: () => void }) {
  return (
    <KhungFormPhieu duongDan="Phiếu chi > Lập mới" tieuDe="Lập phiếu chi" xemTruoc="" dangLuu={dangLuu}
      loiChung={null} onDong={onDong} chanDong={() => false} onSubmit={() => {}}>
      <input aria-label="ô" />
    </KhungFormPhieu>
  );
}

describe("KhungFormPhieu", () => {
  it("đang lưu: Esc và nút Đóng ở đầu ngăn đều không đóng", async () => {
    const onDong = vi.fn();
    render(<Khung dangLuu onDong={onDong} />);
    await userEvent.keyboard("{Escape}");
    // Nút X "Đóng" ở đầu ngăn (nút "Đóng" ở chân đã khoá khi đang lưu).
    await userEvent.click(screen.getAllByRole("button", { name: "Đóng" })[0]);
    expect(onDong).not.toHaveBeenCalled();
  });

  it("không lưu: Esc đóng như thường", async () => {
    const onDong = vi.fn();
    render(<Khung dangLuu={false} onDong={onDong} />);
    await userEvent.keyboard("{Escape}");
    expect(onDong).toHaveBeenCalledTimes(1);
  });
});
