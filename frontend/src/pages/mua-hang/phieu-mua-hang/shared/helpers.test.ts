import { describe, expect, it } from "vitest";

import { khoNhapTuDongMua, nhanKhoMua } from "./helpers";

describe("nhanKhoMua", () => {
  it("giấy có khổ mua ⇒ ghi khổ", () => {
    expect(nhanKhoMua({ hang_loai: "giay", kho_rong: 800, kho_dai: 1090 })).toBe("Khổ 800 × 1090 mm");
  });
  it("giấy không khổ hoặc hàng khác ⇒ rỗng", () => {
    expect(nhanKhoMua({ hang_loai: "giay", kho_rong: 0, kho_dai: 0 })).toBe("");
    expect(nhanKhoMua({ hang_loai: "vat_tu", kho_rong: 0, kho_dai: 0 })).toBe("");
  });
});

/** Nhập kho từ đợt giao: dòng yêu cầu nhập (form khoá) phải mang đúng dạng + khổ MUA của dòng đơn,
 *  vì tồn giấy tờ tách theo khổ — nhập sai khổ là giữ chỗ/kiểm xuất đếm nhầm lô. */
describe("khoNhapTuDongMua", () => {
  it("giấy có khổ mua ⇒ tờ đúng khổ", () => {
    expect(khoNhapTuDongMua({ hang_loai: "giay", kho_rong: 800, kho_dai: 1090 })).toEqual({
      dang_giay: "to",
      kho_rong: 800,
      kho_dai: 1090,
    });
  });

  it("giấy không khổ ⇒ cuộn", () => {
    expect(khoNhapTuDongMua({ hang_loai: "giay", kho_rong: 0, kho_dai: 0 })).toEqual({
      dang_giay: "cuon",
      kho_rong: 0,
      kho_dai: 0,
    });
  });

  it("hàng khác giấy hoặc không khớp được dòng đơn ⇒ không có dạng", () => {
    const rong = { dang_giay: null, kho_rong: 0, kho_dai: 0 };
    expect(khoNhapTuDongMua({ hang_loai: "vat_tu", kho_rong: 0, kho_dai: 0 })).toEqual(rong);
    expect(khoNhapTuDongMua(undefined)).toEqual(rong);
  });
});
