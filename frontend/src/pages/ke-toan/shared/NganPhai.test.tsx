/** Ngăn phải dùng chung của 5 màn kế toán: MỘT độ rộng cho mọi ngăn, Esc đóng đúng lớp trên cùng. */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NganPhai } from "./NganPhai";
import { KHOA_LUU } from "./doRongNgan";

// Mỗi bài tự đặt viewport và xoá độ rộng cũ — không bài nào được ăn ké trạng thái bài trước
// (trước đây bài đầu gán 1600px rồi để nguyên, che mất lỗi nút Mở rộng ở màn 1024px).
const BE_NGANG_GOC = Object.getOwnPropertyDescriptor(window, "innerWidth");
const datBeNgang = (px: number) => Object.defineProperty(window, "innerWidth", { value: px, configurable: true });
const doRong = () => document.documentElement.style.getPropertyValue("--kt-ngan-w");

beforeEach(() => {
  datBeNgang(1600);
  localStorage.removeItem(KHOA_LUU);
  document.documentElement.style.removeProperty("--kt-ngan-w");
});

afterEach(() => {
  vi.restoreAllMocks();
  if (BE_NGANG_GOC) Object.defineProperty(window, "innerWidth", BE_NGANG_GOC);
});

describe("độ rộng chung", () => {
  it("mặc định 1180px, kéo mép trái đổi độ rộng chung và nhớ", () => {
    render(<NganPhai tieuDe="Phiếu" onDong={() => {}}>x</NganPhai>);
    expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe("1180px");
    const keo = screen.getByRole("separator", { name: "Kéo để đổi độ rộng" });
    fireEvent.pointerDown(keo, { clientX: 680, pointerId: 1 });
    fireEvent.pointerMove(keo, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(keo, { pointerId: 1 });
    expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe("1100px");
    expect(localStorage.getItem(KHOA_LUU)).toBe("1100");
  });

  it("rê chuột mà chưa bấm thì không đổi; kéo quá hẹp dừng ở 480px", () => {
    localStorage.setItem(KHOA_LUU, "920");
    render(<NganPhai tieuDe="P" onDong={() => {}}>x</NganPhai>);
    const keo = screen.getByRole("separator", { name: "Kéo để đổi độ rộng" });
    fireEvent.pointerMove(keo, { clientX: 100, pointerId: 1 });
    expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe("920px");
    fireEvent.pointerDown(keo, { clientX: 680, pointerId: 1 });
    fireEvent.pointerMove(keo, { clientX: 1500, pointerId: 1 });
    fireEvent.pointerUp(keo, { pointerId: 1 });
    expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe("480px");
  });

  it("bấm đúp thanh kéo bật rộng hết rồi trả về", () => {
    localStorage.setItem(KHOA_LUU, "920");
    render(<NganPhai tieuDe="P" onDong={() => {}}>x</NganPhai>);
    const keo = screen.getByRole("separator", { name: "Kéo để đổi độ rộng" });
    fireEvent.doubleClick(keo);
    expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe(`${window.innerWidth - 232}px`);
    fireEvent.doubleClick(keo);
    expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe("1180px");
  });

  it("số lưu hỏng thì về 1180px", () => {
    localStorage.setItem(KHOA_LUU, "rác");
    render(<NganPhai tieuDe="P" onDong={() => {}}>x</NganPhai>);
    expect(document.documentElement.style.getPropertyValue("--kt-ngan-w")).toBe("1180px");
  });

  it("màn 1024px: mặc định kẹp sát thanh bên, nút Mở rộng không bao giờ làm ngăn hẹp lại", () => {
    datBeNgang(1024); // trần = 1024 − 232 = 792px
    render(<NganPhai tieuDe="P" onDong={() => {}}>x</NganPhai>);
    expect(doRong()).toBe("792px");
    const moRong = screen.getByRole("button", { name: "Mở rộng" });
    fireEvent.click(moRong);
    expect(doRong()).toBe("792px");
    fireEvent.click(moRong);
    expect(doRong()).toBe("792px");
    // Từ một độ rộng hẹp hơn thì Mở rộng bung lên trần, bấm lại cũng không thu xuống dưới trần.
    const keo = screen.getByRole("separator", { name: "Kéo để đổi độ rộng" });
    fireEvent.pointerDown(keo, { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(keo, { clientX: 424, pointerId: 1 });
    fireEvent.pointerUp(keo, { pointerId: 1 });
    expect(doRong()).toBe("600px");
    fireEvent.click(moRong);
    expect(doRong()).toBe("792px");
    fireEvent.click(moRong);
    expect(doRong()).toBe("792px");
  });

  it("localStorage bị chặn: ngăn mới mở giữ độ rộng vừa kéo trong phiên", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bị chặn");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bị chặn");
    });
    const { unmount } = render(<NganPhai tieuDe="P" onDong={() => {}}>x</NganPhai>);
    expect(doRong()).toBe("1180px");
    const keo = screen.getByRole("separator", { name: "Kéo để đổi độ rộng" });
    fireEvent.pointerDown(keo, { clientX: 680, pointerId: 1 });
    fireEvent.pointerMove(keo, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(keo, { pointerId: 1 });
    expect(doRong()).toBe("1100px");
    unmount();
    render(<NganPhai tieuDe="Q" onDong={() => {}}>y</NganPhai>);
    expect(doRong()).toBe("1100px");
  });
});

describe("Esc và phím mũi tên", () => {
  it("Esc khi đang gõ dở: hỏi bằng hộp của app, Nhập tiếp thì ở lại", () => {
    const dong = vi.fn();
    const hoi = vi.spyOn(window, "confirm");
    render(<NganPhai tieuDe="P" onDong={dong} chanDong={() => true}>x</NganPhai>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(hoi).not.toHaveBeenCalled();
    expect(screen.getByText("Bỏ phiếu đang nhập?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nhập tiếp" }));
    expect(dong).not.toHaveBeenCalled();
    expect(screen.queryByText("Bỏ phiếu đang nhập?")).not.toBeInTheDocument();
  });

  it("đồng ý bỏ nội dung dở thì đóng", () => {
    const dong = vi.fn();
    render(<NganPhai tieuDe="P" onDong={dong} chanDong={() => true}>x</NganPhai>);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Bỏ" }));
    expect(dong).toHaveBeenCalledTimes(1);
  });

  it("hai ngăn chồng: Esc chỉ đóng ngăn trên", () => {
    const duoi = vi.fn();
    const tren = vi.fn();
    render(
      <>
        <NganPhai tieuDe="Dưới" onDong={duoi}>a</NganPhai>
        <NganPhai tieuDe="Trên" onDong={tren} tang={1}>b</NganPhai>
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(tren).toHaveBeenCalledTimes(1);
    expect(duoi).not.toHaveBeenCalled();
  });

  it("bấm lớp phủ thì đóng, bấm trong ngăn thì không", async () => {
    const dong = vi.fn();
    render(<NganPhai tieuDe="P" onDong={dong}><p>nội dung</p></NganPhai>);
    await userEvent.click(screen.getByText("nội dung"));
    expect(dong).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("presentation"));
    expect(dong).toHaveBeenCalledTimes(1);
  });

  it("bôi chữ trong ngăn rồi thả chuột ra lớp phủ thì KHÔNG đóng", () => {
    const dong = vi.fn();
    render(<NganPhai tieuDe="P" onDong={dong}><p>nội dung</p></NganPhai>);
    fireEvent.mouseDown(screen.getByText("nội dung"));
    fireEvent.mouseUp(screen.getByRole("presentation"));
    fireEvent.click(screen.getByRole("presentation"));
    expect(dong).not.toHaveBeenCalled();
  });

  it("↑ ↓ đổi bản ghi, trừ khi đang gõ trong ô nhập", () => {
    const len = vi.fn();
    const xuong = vi.fn();
    render(<NganPhai tieuDe="P" onDong={() => {}} len={len} xuong={xuong}><input aria-label="Ghi chú" /></NganPhai>);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(xuong).toHaveBeenCalledTimes(1);
    expect(len).toHaveBeenCalledTimes(1);
    const o = screen.getByLabelText("Ghi chú");
    o.focus();
    fireEvent.keyDown(o, { key: "ArrowDown" });
    expect(xuong).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Bản ghi sau" }));
    expect(xuong).toHaveBeenCalledTimes(2);
  });
});

describe("đầu ngăn", () => {
  it("tab charcoal: bấm tab gọi onTab", () => {
    const onTab = vi.fn();
    render(
      <NganPhai tieuDe="P" onDong={() => {}} tabs={[{ id: "tt", nhan: "Chi tiết" }, { id: "ls", nhan: "Lịch sử", dem: 3 }]}
        tab="tt" onTab={onTab}>x</NganPhai>,
    );
    expect(screen.getByRole("tab", { name: "Chi tiết" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /Lịch sử/ }));
    expect(onTab).toHaveBeenCalledWith("ls");
  });

  it("dải tóm tắt và chân ngăn tối", () => {
    render(
      <NganPhai tieuDe="P" onDong={() => {}} tomTat={[{ nhan: "Ngày chi", giaTri: "05/10/2026" }]}
        chan={<span>Đã chọn 2 đợt</span>} chanToi>x</NganPhai>,
    );
    expect(screen.getByText("Ngày chi")).toBeInTheDocument();
    expect(screen.getByText("05/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Đã chọn 2 đợt").closest("footer")).toHaveClass("kt-ngan__chan--toi");
    expect(screen.getByRole("dialog")).toHaveAccessibleName("P");
  });
});
