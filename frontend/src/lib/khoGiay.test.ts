import { describe, expect, it } from "vitest";
import { nhanDongTon } from "./khoGiay";

describe("nhanDongTon", () => {
  it("giấy tờ ghi khổ", () => {
    expect(nhanDongTon("to", 780, 905)).toBe("780 × 905 mm");
  });
  it("cuộn không biết khổ chỉ ghi cuộn", () => {
    expect(nhanDongTon("cuon", 0, 0)).toBe("cuộn");
  });
  it("cuộn ghi khổ các lô, bỏ trùng và sắp tăng", () => {
    expect(nhanDongTon("cuon", 0, 0, { khoCuon: [790] })).toBe("cuộn · khổ 790 mm");
    expect(nhanDongTon("cuon", 0, 0, { khoCuon: [1090, 790, 790, 0] })).toBe("cuộn · khổ 790, 1090 mm");
  });
  it("giấy chưa có dạng ghi chưa rõ", () => {
    expect(nhanDongTon(null, 0, 0, { laGiay: true })).toBe("chưa rõ dạng/khổ");
  });
  it("hàng khác không nhãn", () => {
    expect(nhanDongTon(null, 0, 0)).toBe("");
    expect(nhanDongTon(null, 0, 0, { laGiay: false })).toBe("");
  });
});
