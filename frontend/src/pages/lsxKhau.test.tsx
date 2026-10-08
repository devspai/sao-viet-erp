import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DaiChang, PillKhau, buocThu, nhanKhau } from "./lsxKhau";

describe("lsxKhau", () => {
  it("Sau sản xuất nói luôn chi tiết; khâu khác nói tên khâu; khoá lạ hiện nguyên chuỗi", () => {
    expect(nhanKhau("dang_sx", null)).toBe("Đang sản xuất");
    expect(nhanKhau("sau_sx", "cho_nhap_kho")).toBe("Chờ nhập kho");
    expect(nhanKhau("sau_sx", null)).toBe("Sau sản xuất");
    expect(nhanKhau("da_giao", null)).toBe("Đã giao đủ");
    expect(nhanKhau("khau_moi", null)).toBe("khau_moi");
  });

  it("pill khâu mang màu theo chi tiết khâu", () => {
    const { container } = render(<PillKhau khau="sau_sx" ct="san_sang_giao" />);
    expect(screen.getByText("Sẵn sàng giao")).toBeInTheDocument();
    expect(container.querySelector(".lsc-pill--teal")).not.toBeNull();
  });

  it("dải chặng: một đốt mỗi công đoạn, đúng thứ tự, có chữ cho trình đọc màn hình", () => {
    const chang = [
      { ten: "Cắt tờ", nhom: null, trang_thai: "xong", hien_tai: false },
      { ten: "In", nhom: null, trang_thai: "chay", hien_tai: true },
      { ten: "Bế", nhom: null, trang_thai: "cho", hien_tai: false },
    ];
    const { container } = render(<DaiChang chang={chang} />);
    const dot = container.querySelectorAll(".lsc-chang__dot");
    expect(Array.from(dot).map((d) => d.getAttribute("title"))).toEqual([
      "Cắt tờ — đã xong",
      "In — đang chạy",
      "Bế — chưa tới",
    ]);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "công đoạn 2 trên 3, In đang chạy",
    );
    expect(buocThu(chang)).toBe("bước 2 trên 3");
  });

  it("dải chặng rỗng thì không vẽ gì", () => {
    const { container } = render(<DaiChang chang={[]} />);
    expect(container.firstChild).toBeNull();
    expect(buocThu([])).toBeNull();
  });
});
