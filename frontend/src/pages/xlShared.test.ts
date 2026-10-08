import { describe, expect, it } from "vitest";

import { congPhut, khungLuoi, loiKhoangNgay, nacCuaSo, nhanKhoang, soNgayDu, soNgayGiua } from "./xlShared";

describe("khungLuoi với khoảng ngày tự chọn", () => {
  it("ba nút 7/14/30 giữ đúng số cũ trên màn rộng", () => {
    expect(khungLuoi(1600, 7).ngayW).toBe(168);
    expect(khungLuoi(1600, 14).ngayW).toBe(96);
    expect(khungLuoi(1600, 30).ngayW).toBe(54);
  });

  it("khoảng lẻ rơi vào nấc gần nhất thay vì về cỡ 7 ngày", () => {
    expect(nacCuaSo(9)).toBe(7);
    expect(nacCuaSo(10)).toBe(14);
    expect(nacCuaSo(20)).toBe(14);
    expect(nacCuaSo(21)).toBe(30);
    expect(khungLuoi(1600, 20).ngayW).toBe(96);
    expect(khungLuoi(1600, 45).ngayW).toBe(54);
  });
});

describe("soNgayGiua", () => {
  it("đếm cả hai đầu, qua tháng và qua năm", () => {
    expect(soNgayGiua("2026-09-14", "2026-09-14")).toBe(1);
    expect(soNgayGiua("2026-09-14", "2026-10-13")).toBe(30);
    expect(soNgayGiua("2026-12-30", "2027-01-02")).toBe(4);
  });
});

describe("loiKhoangNgay", () => {
  it("khoảng hợp lệ trả null", () => {
    expect(loiKhoangNgay("2026-09-14", "2026-10-03")).toBeNull();
  });

  it("chặn ô trống, năm 6 chữ số, ngày cuối trước ngày đầu, quá trần", () => {
    expect(loiKhoangNgay("", "2026-10-03")).toMatch(/Chọn đủ/);
    expect(loiKhoangNgay("202026-09-14", "2026-10-03")).toMatch(/không hợp lệ/);
    expect(loiKhoangNgay("0020-09-14", "2026-10-03")).toMatch(/không hợp lệ/);
    expect(loiKhoangNgay("2026-10-03", "2026-09-14")).toMatch(/từ ngày bắt đầu/);
    expect(loiKhoangNgay("2026-09-01", "2026-11-30")).toBeNull();
    expect(loiKhoangNgay("2026-09-01", "2026-12-02")).toMatch(/tối đa 3 tháng/);
  });
});

describe("màn A cải tiến", () => {
  it("nhanKhoang ghi gọn theo tháng và năm", () => {
    expect(nhanKhoang("2026-10-05", "2026-10-18")).toBe("5 đến 18 tháng 10, 2026");
    expect(nhanKhoang("2026-09-28", "2026-10-11")).toBe("28 tháng 9 đến 11 tháng 10, 2026");
    expect(nhanKhoang("2026-12-28", "2027-01-10")).toBe("28 tháng 12, 2026 đến 10 tháng 1, 2027");
  });

  it("soNgayDu đếm tới hết ngày hạn, âm khi trễ", () => {
    expect(soNgayDu("2026-10-14T16:40:00", "2026-10-16")).toBe(2);
    expect(soNgayDu("2026-10-16T23:00:00", "2026-10-16")).toBe(0);
    expect(soNgayDu("2026-10-17T08:00:00", "2026-10-16")).toBe(-1);
    expect(soNgayDu(null, "2026-10-16")).toBeNull();
  });

  it("congPhut cộng qua ngày", () => {
    expect(congPhut("2026-10-12T23:50:00", 15)).toBe("2026-10-13T00:05:00");
    expect(congPhut("2026-10-12T14:00:00", -15)).toBe("2026-10-12T13:45:00");
  });
});
