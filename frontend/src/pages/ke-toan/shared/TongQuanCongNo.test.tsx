/** Khối tổng quan công nợ: hàng số + dòng cùng kỳ, thanh tuổi nợ (đoạn 0 đồng không vẽ), bấm ô = lọc. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AgingBucket } from "../../../api/client";
import { TongQuanCongNo } from "./TongQuanCongNo";

const AGING: AgingBucket[] = [
  { key: "chua_toi_han", label: "Chưa tới hạn", amount: 715_800_000, count: 21 },
  { key: "d1_7", label: "Trễ 1–7 ngày", amount: 48_200_000, count: 3 },
  { key: "d8_15", label: "Trễ 8–15 ngày", amount: 0, count: 0 },
  { key: "d16_30", label: "Trễ 16–30 ngày", amount: 19_800_000, count: 2 },
  { key: "d31_60", label: "Trễ 31–60 ngày", amount: 26_500_000, count: 1 },
  { key: "d60_plus", label: "Trễ > 60 ngày", amount: 10_000_000, count: 1 },
];

function ve(p: Partial<Parameters<typeof TongQuanCongNo>[0]> = {}) {
  const onChon = vi.fn();
  const kq = render(
    <TongQuanCongNo
      con={[
        { nhan: "Còn nợ tới", so: 842_300_000, cungKy: 731_000_000 },
        { nhan: "Trong đó quá hạn", so: 126_500_000, cungKy: 64_000_000, xau: true },
        { nhan: "Mua thêm trong kỳ", so: 286_000_000, cungKy: 240_500_000 },
        { nhan: "Đã trả trong kỳ", so: 152_000_000, cungKy: 175_000_000 },
      ]}
      aging={AGING}
      dangChon={null}
      onChon={onChon}
      denNgay="2026-10-05"
      {...p}
    />,
  );
  return { ...kq, onChon };
}

describe("TongQuanCongNo", () => {
  it("số đầu mang ngày cuối kỳ; số xấu đỏ; dòng cùng kỳ chỉ đỏ ở số xấu khi TĂNG", () => {
    const { container } = ve();
    expect(screen.getByText("Còn nợ tới 05/10/2026")).toBeInTheDocument();
    expect(screen.getByText("842.300.000 đ").closest(".kt-tq__lon")).not.toBeNull();
    expect(screen.getByText("126.500.000 đ")).toHaveClass("kt-do");
    expect(screen.getByText("152.000.000 đ")).not.toHaveClass("kt-do");

    const cung = [...container.querySelectorAll(".kt-cung-ky")];
    expect(cung.map((c) => c.textContent)).toEqual([
      "Cùng kỳ 731.000.000", "Cùng kỳ 64.000.000", "Cùng kỳ 240.500.000", "Cùng kỳ 175.000.000",
    ]);
    // Quá hạn tăng ⇒ đỏ; Còn nợ tăng nhưng không phải chỉ số xấu ⇒ xám.
    expect(cung[1]).toHaveClass("kt-cung-ky--do");
    expect(cung[0]).not.toHaveClass("kt-cung-ky--do");
  });

  it("số xấu GIẢM so với cùng kỳ thì dòng cùng kỳ không đỏ; không có cùng kỳ thì không có dòng", () => {
    const { container } = ve({
      con: [
        { nhan: "Còn nợ tới", so: 10, cungKy: null },
        { nhan: "Trong đó quá hạn", so: 5, cungKy: 9, xau: true },
      ],
    });
    const cung = container.querySelectorAll(".kt-cung-ky");
    expect(cung).toHaveLength(1);
    expect(cung[0]).not.toHaveClass("kt-cung-ky--do");
  });

  it("thanh: đoạn 0 đồng không vẽ, độ dài theo số tiền; chú thích đủ 6 ô với tên mốc viết chữ", () => {
    const { container } = ve();
    const doan = container.querySelectorAll(".kt-tq__vach i");
    expect(doan).toHaveLength(5);
    expect((doan[0] as HTMLElement).style.flex).toMatch(/^715800000/);
    expect(doan[0]).toHaveClass("kt-m0");
    // Đoạn thứ 3 trên thanh là mốc 16–30 (mốc 8–15 bằng 0 bị bỏ) nhưng vẫn giữ màu của mốc đó.
    expect(doan[2]).toHaveClass("kt-m3");
    const moc = within(screen.getByRole("group", { name: "Tuổi nợ tới 05/10/2026" })).getAllByRole("button");
    expect(moc).toHaveLength(6);
    expect(moc[5]).toHaveTextContent("Trễ trên 60 ngày");
    expect(moc[5]).toHaveTextContent("1 khoản");
    expect(within(moc[4]).getByText("26.500.000")).toHaveClass("kt-do");
    expect(within(moc[1]).getByText("48.200.000")).not.toHaveClass("kt-do");
  });

  it("bấm ô chú thích hoặc đoạn thanh = lọc mốc đó; bấm lại mốc đang chọn = bỏ", async () => {
    const { onChon, container, rerender } = ve();
    await userEvent.click(screen.getByRole("button", { name: /Trễ 31–60 ngày/ }));
    expect(onChon).toHaveBeenLastCalledWith("d31_60");
    await userEvent.click(container.querySelectorAll(".kt-tq__vach i")[1] as HTMLElement);
    expect(onChon).toHaveBeenLastCalledWith("d1_7");

    rerender(
      <TongQuanCongNo con={[{ nhan: "Còn nợ tới", so: 1 }]} aging={AGING} dangChon="d31_60" onChon={onChon}
        denNgay="2026-10-05" />,
    );
    const on = screen.getByRole("button", { name: /Trễ 31–60 ngày/ });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".kt-tq__vach")).toHaveClass("kt-co-chon");
    await userEvent.click(on);
    expect(onChon).toHaveBeenLastCalledWith(null);
  });

  it("không nợ đồng nào thì không vẽ thanh lẫn chú thích", () => {
    const { container } = ve({ aging: AGING.map((b) => ({ ...b, amount: 0, count: 0 })) });
    expect(container.querySelector(".kt-tq__vach")).toBeNull();
    expect(container.querySelector(".kt-tq__moc")).toBeNull();
  });
});
