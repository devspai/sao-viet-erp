import { describe, expect, it } from "vitest";

import { doiSo, ngay, tien, trieu } from "./dinhDang";

describe("dinhDang", () => {
  it("tiền có dấu chấm và chữ đ, rỗng thành gạch", () => {
    expect(tien(1_204_000)).toBe("1.204.000 đ");
    expect(tien(0)).toBe("0 đ");
    expect(tien(null)).toBe("—");
    expect(tien(undefined)).toBe("—");
  });

  it("triệu rút gọn: từ 1 triệu ghi 'tr' tối đa một chữ số lẻ, dưới 1 triệu giữ số đủ", () => {
    expect(trieu(100_000_000)).toBe("100 tr");
    expect(trieu(96_540_000)).toBe("96,5 tr");
    expect(trieu(1_000_000)).toBe("1 tr");
    expect(trieu(1_250_000_000)).toBe("1.250 tr");
    expect(trieu(500_000)).toBe("500.000");
  });

  it("ngày dd/mm/yyyy", () => {
    expect(ngay("2026-10-05")).toBe("05/10/2026");
    expect(ngay(null)).toBe("—");
  });

  it("đổi so với cùng kỳ: hướng và phần trăm, cùng kỳ bằng 0 thì không có phần trăm", () => {
    expect(doiSo(128_450_000, 114_600_000)).toEqual({ huong: "len", phanTram: 12 });
    expect(doiSo(80, 100)).toEqual({ huong: "xuong", phanTram: 20 });
    expect(doiSo(100, 100)).toEqual({ huong: "bang", phanTram: 0 });
    expect(doiSo(50, 0)).toEqual({ huong: "len", phanTram: null });
    expect(doiSo(0, 0)).toEqual({ huong: "bang", phanTram: null });
    // Làm tròn ra 0% thì là "bằng" — khớp `soCungKy` của Thống kê khách hàng.
    expect(doiSo(1001, 1000)).toEqual({ huong: "bang", phanTram: 0 });
    expect(doiSo(999, 1000)).toEqual({ huong: "bang", phanTram: 0 });
  });
});
