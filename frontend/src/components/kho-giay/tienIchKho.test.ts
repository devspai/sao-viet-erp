import { describe, expect, it } from "vitest";
import { chuanKho, nhanKho, tachKho } from "./tienIchKho";

describe("tachKho", () => {
  it("tách 790x1090 và chuẩn cạnh ngắn trước", () => {
    expect(tachKho("790x1090")).toEqual({ rong: 790, dai: 1090 });
    expect(tachKho("1090 × 790")).toEqual({ rong: 790, dai: 1090 });
    expect(tachKho("1090X790")).toEqual({ rong: 790, dai: 1090 });
  });
  it("một số là khổ cuộn", () => {
    expect(tachKho("1090")).toEqual({ rong: 1090, dai: 0 });
  });
  it("rác trả null", () => {
    expect(tachKho("abc")).toBeNull();
    expect(tachKho("")).toBeNull();
    expect(tachKho("1x2x3")).toBeNull();
  });
  it("chuanKho", () => {
    expect(chuanKho(1090, 790)).toEqual([790, 1090]);
    expect(chuanKho(0, 1090)).toEqual([1090, 0]);
  });
  it("nhanKho", () => {
    expect(nhanKho("to", 790, 1090)).toBe("790 × 1090");
    expect(nhanKho("cuon", 1090, 0)).toBe("Khổ 1090");
    expect(nhanKho("cuon", 0, 0)).toBe("Mọi khổ");
    expect(nhanKho("to", 790, 0)).toBe("");
  });
});
