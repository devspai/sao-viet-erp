import { describe, expect, it } from "vitest";
import { moTaHanTra } from "./hanTra";

describe("moTaHanTra", () => {
  it("cho nợ 0 ngày, không ngày chốt: trả ngay khi có hoá đơn", () => {
    expect(moTaHanTra(0, null)).toEqual({ chinh: "Trả ngay khi có hoá đơn" });
  });

  it("cho nợ N ngày, không ngày chốt: mỗi đợt tính từ ngày hoá đơn", () => {
    expect(moTaHanTra(30, null)).toEqual({ chinh: "30 ngày sau ngày hoá đơn", phu: "mỗi đợt giao một hạn" });
  });

  it("có ngày chốt: cả đơn một hạn = ngày chốt cộng số ngày", () => {
    const h = moTaHanTra(30, "2026-10-31");
    expect(h.chinh).toBe("30/11/2026");
    expect(h.phu).toBe("ngày chốt 31/10/2026 cộng 30 ngày cho nợ");
  });

  it("có ngày chốt, cho nợ 0 ngày: hạn đúng ngày chốt", () => {
    expect(moTaHanTra(0, "2026-10-31")).toEqual({ chinh: "31/10/2026", phu: "đúng ngày chốt công nợ" });
  });

  it("NCC chưa khai số ngày cho nợ: chưa rõ, dù có ngày chốt", () => {
    expect(moTaHanTra(null, "2026-10-31").chuaRo).toBe(true);
  });
});
