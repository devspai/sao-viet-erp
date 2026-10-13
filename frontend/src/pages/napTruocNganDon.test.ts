/** Nạp sẵn ngăn đơn bán: bắn lúc bấm mở, ngăn lấy lại đúng lời gọi đó; lệnh SX chỉ khi ngăn sẽ hỏi. */
import { afterEach, describe, expect, it, vi } from "vitest";

const salesInvoices = vi.fn(async () => ({ items: [] }));
const activity = vi.fn(async () => ({ items: [] }));
const lsxList = vi.fn(async () => ({ items: [] }));

vi.mock("../api/client", () => ({
  api: {
    accounting: { salesInvoices: (...a: unknown[]) => salesInvoices(...(a as [])) },
    orders: { activity: (...a: unknown[]) => activity(...(a as [])) },
    lsx: { list: (...a: unknown[]) => lsxList(...(a as [])) },
  },
}));

import { layHoaDonNapTruoc, layLenhNapTruoc, layNhatKyNapTruoc, napTruocNganDon } from "./napTruocNganDon";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("napTruocNganDon", () => {
  it("đơn đã chuyển xuống SX: bắn cả ba, ngăn lấy lại đúng lời gọi đó (không gọi thêm)", () => {
    napTruocNganDon("t", 1, { status: "ordered", san_xuat_released_at: "2026-10-12T08:00:00Z" });
    expect(salesInvoices).toHaveBeenCalledWith("t", 1);
    expect(activity).toHaveBeenCalledWith("t", 1);
    expect(lsxList).toHaveBeenCalledWith("t", { order_id: 1 });
    const hd = layHoaDonNapTruoc(1);
    expect(hd).not.toBeNull();
    // StrictMode mount hai lần: lần hai vẫn lấy được, cùng một lời gọi.
    expect(layHoaDonNapTruoc(1)).toBe(hd);
    expect(layNhatKyNapTruoc(1)).not.toBeNull();
    expect(layLenhNapTruoc(1)).not.toBeNull();
  });

  it("đơn chưa chuyển xuống SX hoặc mở qua liên kết: không bắn lệnh SX", () => {
    napTruocNganDon("t", 2, { status: "ordered", san_xuat_released_at: null });
    napTruocNganDon("t", 3);
    expect(lsxList).not.toHaveBeenCalled();
    expect(layLenhNapTruoc(2)).toBeNull();
    expect(layHoaDonNapTruoc(3)).not.toBeNull();
  });

  it("quá 15 giây thì bỏ, ngăn tự hỏi lại", () => {
    vi.useFakeTimers();
    napTruocNganDon("t", 4);
    vi.advanceTimersByTime(15_001);
    expect(layHoaDonNapTruoc(4)).toBeNull();
    expect(layNhatKyNapTruoc(4)).toBeNull();
  });
});
