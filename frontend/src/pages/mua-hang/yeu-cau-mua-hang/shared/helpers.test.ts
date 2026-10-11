import { describe, expect, it } from "vitest";
import { laGiayDong } from "./helpers";

// 10/10/2026 bỏ dạng cuộn/tờ: dòng giấy chỉ còn khổ + ĐVT tự chọn — khổ KHÔNG còn quyết dạng.
describe("laGiayDong", () => {
  it("dòng giấy", () => {
    expect(laGiayDong({ hang_loai: "giay" })).toBe(true);
  });
  it("hàng khác không phải giấy", () => {
    expect(laGiayDong({ hang_loai: "vat_tu" })).toBe(false);
    expect(laGiayDong({ hang_loai: null })).toBe(false);
  });
});
