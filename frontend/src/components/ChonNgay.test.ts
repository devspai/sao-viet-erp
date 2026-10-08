import { describe, expect, it } from "vitest";

import { docGioGo, docNgayGo, hienNgay } from "./ChonNgay";

describe("docNgayGo — chữ gõ tay thành ngày", () => {
  it("nhận các kiểu gõ quen tay", () => {
    expect(docNgayGo("8/10/2026")).toBe("2026-10-08");
    expect(docNgayGo("08-10-2026")).toBe("2026-10-08");
    expect(docNgayGo("8.10.26")).toBe("2026-10-08");
    expect(docNgayGo("08102026")).toBe("2026-10-08");
  });
  it("thiếu năm thì lấy năm mặc định", () => {
    expect(docNgayGo("2/9", 2027)).toBe("2027-09-02");
  });
  it("ngày không có thật thì trả null", () => {
    expect(docNgayGo("31/2/2026")).toBeNull();
    expect(docNgayGo("abc")).toBeNull();
    expect(docNgayGo("")).toBeNull();
  });
});

describe("docGioGo — chữ gõ tay thành giờ", () => {
  it("nhận 14:30, 14h30, 1430, 930, 9, 14h", () => {
    expect(docGioGo("14:30")).toBe("14:30");
    expect(docGioGo("14h30")).toBe("14:30");
    expect(docGioGo("1430")).toBe("14:30");
    expect(docGioGo("930")).toBe("09:30");
    expect(docGioGo("9")).toBe("09:00");
    expect(docGioGo("14h")).toBe("14:00");
  });
  it("giờ sai trả null", () => {
    expect(docGioGo("25:00")).toBeNull();
    expect(docGioGo("12:75")).toBeNull();
  });
});

describe("hienNgay", () => {
  it("ghi dd/mm/yyyy, rỗng thì rỗng", () => {
    expect(hienNgay("2026-10-08")).toBe("08/10/2026");
    expect(hienNgay("")).toBe("");
  });
});
