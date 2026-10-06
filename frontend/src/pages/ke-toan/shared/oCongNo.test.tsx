/** `ConHan`: "còn n ngày / trễ n ngày" của cột hạn gần nhất luôn so với HÔM NAY, không so với cuối kỳ
 *  đang xem — `han_gan_nhat` là hạn của các khoản còn nợ tại hôm nay. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConHan } from "./oCongNo";

describe("ConHan", () => {
  it("còn n ngày khi hạn ở sau hôm nay", () => {
    render(<ConHan han="2026-10-10" homNay="2026-10-06" />);
    expect(screen.getByText("còn 4 ngày")).toBeInTheDocument();
  });

  it("trễ n ngày (đỏ) khi hạn đã qua, và 'tới hạn' đúng hôm nay", () => {
    const { rerender } = render(<ConHan han="2026-10-01" homNay="2026-10-06" />);
    expect(screen.getByText("trễ 5 ngày")).toHaveClass("kt-do");
    rerender(<ConHan han="2026-10-06" homNay="2026-10-06" />);
    expect(screen.getByText("tới hạn")).toBeInTheDocument();
  });
});
