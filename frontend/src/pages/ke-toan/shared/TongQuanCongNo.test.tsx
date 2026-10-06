/** Khối tổng quan công nợ (khuôn thẻ Xero): số chính + chưa tới hạn / quá hạn, 5 cột quá hạn theo ngày
 *  trễ (bấm = lọc), số trong kỳ; so cùng kỳ chỉ hiện khi cùng kỳ có số. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AgingBucket } from "../../../api/client";
import { TongQuanCongNo, type SoTongQuan } from "./TongQuanCongNo";

const AGING: AgingBucket[] = [
  { key: "chua_toi_han", label: "Chưa tới hạn", amount: 715_800_000, count: 21 },
  { key: "d1_7", label: "Trễ 1–7 ngày", amount: 48_200_000, count: 3 },
  { key: "d8_15", label: "Trễ 8–15 ngày", amount: 0, count: 0 },
  { key: "d16_30", label: "Trễ 16–30 ngày", amount: 19_800_000, count: 2 },
  { key: "d31_60", label: "Trễ 31–60 ngày", amount: 26_500_000, count: 1 },
  { key: "d60_plus", label: "Trễ > 60 ngày", amount: 10_000_000, count: 1 },
];
const SO: SoTongQuan = { conNo: 820_300_000, quaHan: 104_500_000, them: 286_000_000, da: 152_000_000 };
const CUNG: SoTongQuan = { conNo: 731_000_000, quaHan: 64_000_000, them: 286_000_000, da: 175_000_000 };

function ve(p: Partial<Parameters<typeof TongQuanCongNo>[0]> = {}) {
  const onChon = vi.fn();
  const kq = render(
    <TongQuanCongNo so={SO} cung={CUNG} nhan={{ them: "Mua thêm", da: "Đã trả", khoan: "khoản" }} aging={AGING}
      dangChon={null} onChon={onChon} tuNgay="2026-10-01" denNgay="2026-10-05" {...p} />,
  );
  return { ...kq, onChon };
}

describe("TongQuanCongNo", () => {
  it("cột trái: còn nợ tới cuối kỳ, số khoản, chưa tới hạn và quá hạn (đỏ khi > 0)", () => {
    ve();
    expect(screen.getByText("Còn nợ tới 05/10/2026")).toBeInTheDocument();
    expect(screen.getByText("820.300.000 đ")).toHaveClass("kt-tq__lon");
    expect(screen.getByText("28 khoản")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chưa tới hạn/ })).toHaveTextContent("715.800.000 đ");
    expect(screen.getByText("104.500.000 đ")).toHaveClass("kt-do");
    expect(screen.getByText("Trong kỳ 01/10 đến 05/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Mua thêm")).toBeInTheDocument();
    expect(screen.getByText("Đã trả")).toBeInTheDocument();
  });

  it("so cùng kỳ ra phần trăm; chỉ đỏ ở quá hạn khi TĂNG; bằng thì nói bằng", () => {
    const { container } = ve();
    const ck = [...container.querySelectorAll(".kt-tq__ck")];
    expect(ck.map((c) => c.textContent)).toEqual([
      "+12% so cùng kỳ", "+63% so cùng kỳ", "Bằng cùng kỳ", "−13% so cùng kỳ",
    ]);
    expect(ck[1]).toHaveClass("kt-do");
    expect(ck[0]).not.toHaveClass("kt-do");
    expect(ck[3]).not.toHaveClass("kt-do");
    expect(ck[0]).toHaveAttribute("title", "Cùng kỳ năm trước 731.000.000 đ");
  });

  it("không có cùng kỳ, hoặc cùng kỳ bằng 0, thì không có dòng so sánh nào", () => {
    const { container, rerender } = ve({ cung: null });
    expect(container.querySelectorAll(".kt-tq__ck")).toHaveLength(0);
    rerender(
      <TongQuanCongNo so={SO} cung={{ conNo: 0, quaHan: 0, them: 0, da: 0 }} nhan={{ them: "Mua thêm", da: "Đã trả", khoan: "khoản" }}
        aging={AGING} dangChon={null} onChon={() => {}} tuNgay="2026-10-01" denNgay="2026-10-05" />,
    );
    expect(container.querySelectorAll(".kt-tq__ck")).toHaveLength(0);
  });

  it("5 cột quá hạn: cao theo mốc trễ lớn nhất, cột 0 đồng không có chiều cao, số mốc nặng đỏ", () => {
    ve();
    const cot = within(screen.getByRole("group", { name: "Quá hạn theo số ngày trễ tới 05/10/2026" })).getAllByRole("button");
    expect(cot).toHaveLength(5);
    expect(cot.map((c) => c.querySelector(".kt-tq__ten")!.textContent)).toEqual(["1–7", "8–15", "16–30", "31–60", "Trên 60"]);
    expect((cot[0].querySelector("i") as HTMLElement).style.height).toBe("100%");
    expect((cot[1].querySelector("i") as HTMLElement).style.height).toBe("");
    expect(cot[0]).toHaveAccessibleName("Trễ 1–7 ngày 48.200.000 đ 3 khoản");
    expect(within(cot[0]).getByText("48,2 tr")).not.toHaveClass("kt-do");
    expect(within(cot[3]).getByText("26,5 tr")).toHaveClass("kt-do");
    expect(cot[4].querySelector("i")).toHaveClass("kt-m5");
  });

  it("bấm cột hoặc dòng Chưa tới hạn = lọc mốc đó; bấm lại mốc đang chọn = bỏ", async () => {
    const { onChon, rerender } = ve();
    await userEvent.click(screen.getByRole("button", { name: /Trễ 31–60 ngày/ }));
    expect(onChon).toHaveBeenLastCalledWith("d31_60");
    await userEvent.click(screen.getByRole("button", { name: /Chưa tới hạn/ }));
    expect(onChon).toHaveBeenLastCalledWith("chua_toi_han");

    rerender(
      <TongQuanCongNo so={SO} cung={null} nhan={{ them: "Mua thêm", da: "Đã trả", khoan: "khoản" }} aging={AGING}
        dangChon="d31_60" onChon={onChon} tuNgay="2026-10-01" denNgay="2026-10-05" />,
    );
    const on = screen.getByRole("button", { name: /Trễ 31–60 ngày/ });
    expect(on).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(on);
    expect(onChon).toHaveBeenLastCalledWith(null);
  });

  it("không có khoản trễ nào thì thay các cột bằng một câu báo", () => {
    ve({ aging: AGING.map((b, i) => (i === 0 ? b : { ...b, amount: 0, count: 0 })), so: { ...SO, quaHan: 0 } });
    expect(screen.queryByRole("group", { name: /^Quá hạn theo số ngày trễ/ })).toBeNull();
    expect(screen.getByText("Không có khoản nào quá hạn")).toBeInTheDocument();
    expect(screen.getByText("0 đ")).not.toHaveClass("kt-do");
  });
});
