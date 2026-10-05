/** Ngày của kỳ xem và cách so cùng kỳ — sai một ngày là số kỳ này lệch số cùng kỳ mà vẫn trông hợp lý. */
import { describe, expect, it } from "vitest";

import { buocTuDong, homNayVN, loiKhoang, luiNam, nhanCot, soCungKy, tinhKy } from "./khachHangSo";

describe("ngày giờ Việt Nam", () => {
  it("23h giờ UTC đã là ngày hôm sau ở Việt Nam", () => {
    expect(homNayVN(Date.UTC(2026, 9, 3, 18, 0))).toBe("2026-10-04");
    expect(homNayVN(Date.UTC(2026, 9, 3, 16, 59))).toBe("2026-10-03");
  });
  it("lùi năm từ 29/02 thành 28/02", () => {
    expect(luiNam("2028-02-29")).toBe("2027-02-28");
    expect(luiNam("2026-10-04")).toBe("2025-10-04");
  });
});

describe("kỳ xem", () => {
  const hn = "2026-10-04";
  it("các kỳ có sẵn kết thúc ở hôm nay, trừ năm trước", () => {
    expect(tinhKy("thang", hn)).toEqual({ tu: "2026-10-01", den: hn });
    expect(tinhKy("quy", hn)).toEqual({ tu: "2026-10-01", den: hn });
    expect(tinhKy("quy", "2026-08-15")).toEqual({ tu: "2026-07-01", den: "2026-08-15" });
    expect(tinhKy("nam", hn)).toEqual({ tu: "2026-01-01", den: hn });
    expect(tinhKy("12t", hn)).toEqual({ tu: "2025-10-05", den: hn });
    expect(tinhKy("namtruoc", hn)).toEqual({ tu: "2025-01-01", den: "2025-12-31" });
  });
  it("khoảng tự chọn phải đúng chiều và không quá 10 năm", () => {
    expect(loiKhoang("2026-03-01", "2026-03-31")).toBeNull();
    expect(loiKhoang("2026-04-01", "2026-03-31")).not.toBeNull();
    expect(loiKhoang("2010-01-01", "2026-03-31")).not.toBeNull();
    expect(loiKhoang("", "2026-03-31")).not.toBeNull();
  });
  it("kỳ ngắn vẽ theo tuần, dài vẽ theo tháng", () => {
    expect(buocTuDong({ tu: "2026-07-01", den: "2026-09-30" })).toBe("tuan");
    expect(buocTuDong({ tu: "2026-01-01", den: "2026-10-04" })).toBe("thang");
  });
  it("nhãn cột tháng ghi năm ở cột đầu và tháng 1", () => {
    expect(nhanCot("2025-11-01", "2025-11-30", "thang", true).ngan).toBe("T11/25");
    expect(nhanCot("2025-12-01", "2025-12-31", "thang", false).ngan).toBe("T12");
    expect(nhanCot("2026-01-01", "2026-01-31", "thang", false).ngan).toBe("T1/26");
    expect(nhanCot("2026-07-01", "2026-09-30", "quy", false).du).toBe("Quý 3/2026");
  });
});

describe("so cùng kỳ", () => {
  it("phần trăm, mới, bằng", () => {
    expect(soCungKy(120, 100)).toEqual({ huong: "len", chu: "▲ 20% so cùng kỳ" });
    expect(soCungKy(80, 100)).toEqual({ huong: "xuong", chu: "▼ 20% so cùng kỳ" });
    expect(soCungKy(50, 0).chu).toBe("Mới so cùng kỳ");
    expect(soCungKy(0, 0).chu).toBe("Cùng kỳ: 0");
    expect(soCungKy(100, 100).huong).toBe("bang");
  });
  it("số đếm ra chênh lệch, không ra phần trăm", () => {
    expect(soCungKy(5, 3, "so").chu).toBe("▲ 2 so cùng kỳ");
    expect(soCungKy(3, 0, "so").chu).toBe("▲ 3 so cùng kỳ");
  });
});
