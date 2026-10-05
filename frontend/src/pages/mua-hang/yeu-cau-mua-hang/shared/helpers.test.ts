import { describe, expect, it } from "vitest";
import { dangGiayDong } from "./helpers";

// ĐVT dòng yêu cầu mua theo dạng giấy (spec giấy theo khổ §4.4): KHVT gửi 5.000 tờ nguyên kèm
// khổ — ô ĐVT phải hiện "tờ nguyên", không phải đơn vị gốc kg của mã.
describe("dangGiayDong", () => {
  it("giấy đủ hai cạnh khổ là tờ", () => {
    expect(dangGiayDong({ hang_loai: "giay", kho_rong: 780, kho_dai: 905 })).toBe("to");
  });
  it("giấy thiếu khổ là cuộn", () => {
    expect(dangGiayDong({ hang_loai: "giay", kho_rong: 780, kho_dai: 0 })).toBe("cuon");
    expect(dangGiayDong({ hang_loai: "giay" })).toBe("cuon");
  });
  it("không phải giấy thì không có dạng", () => {
    expect(dangGiayDong({ hang_loai: "vat_tu", kho_rong: 780, kho_dai: 905 })).toBeNull();
  });
});
