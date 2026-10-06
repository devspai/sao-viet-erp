import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PhanTrangDayDu } from "./PhanTrangDayDu";

describe("PhanTrangDayDu", () => {
  // KCS cắt 30 dòng/trang — không nằm trong [15, 25, 50, 100]. Ô chọn mà thiếu số đang dùng thì
  // trình duyệt lặng lẽ hiện "15", người dùng tưởng đang xem 15 dòng.
  it("giữ cỡ trang lạ trong ô chọn", () => {
    render(<PhanTrangDayDu trang={1} size={30} tong={90} soDong={30} onTrang={vi.fn()} onSize={vi.fn()} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("30");
  });

  it("in ghi chú sau dòng thông tin", () => {
    render(
      <PhanTrangDayDu trang={1} size={25} tong={3} soDong={3} onTrang={vi.fn()}
        ghiChu="duyệt hàng loạt chỉ áp cho trang đang xem" />,
    );
    expect(screen.getByText("duyệt hàng loạt chỉ áp cho trang đang xem")).toBeTruthy();
  });
});
