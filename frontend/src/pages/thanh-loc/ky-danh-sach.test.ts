import { describe, expect, it } from "vitest";

import { khoangKy, kyLenUrl, kyTuUrl, thamSoKy } from "./ky-danh-sach";

describe("kỳ của danh sách Kinh doanh", () => {
  const homNay = "2026-11-14";

  it("trọn tháng / quý / năm, không dừng ở hôm nay", () => {
    expect(khoangKy({ loai: "thang", moc: "tao" }, homNay)).toEqual({ tu: "2026-11-01", den: "2026-11-30" });
    expect(khoangKy({ loai: "quy", moc: "tao" }, homNay)).toEqual({ tu: "2026-10-01", den: "2026-12-31" });
    expect(khoangKy({ loai: "nam", moc: "tao" }, homNay)).toEqual({ tu: "2026-01-01", den: "2026-12-31" });
    expect(khoangKy({ loai: "thang", moc: "tao" }, "2028-02-10")).toEqual({ tu: "2028-02-01", den: "2028-02-29" });
  });

  it("Tất cả và Tuỳ chọn ngày ngược thì không chặn ngày, không gửi mốc", () => {
    expect(khoangKy({ loai: "tat_ca", moc: "gui" }, homNay)).toBeNull();
    expect(thamSoKy({ loai: "tat_ca", moc: "gui" })).toEqual({});
    expect(thamSoKy({ loai: "tuy", tu: "2026-10-05", den: "2026-10-01", moc: "gui" })).toEqual({});
    expect(thamSoKy({ loai: "tuy", tu: "2026-10-01", den: "2026-10-05", moc: "gui" })).toEqual({
      tu_ngay: "2026-10-01",
      den_ngay: "2026-10-05",
      moc: "gui",
    });
  });

  it("ghi lên URL rồi đọc lại ra đúng kỳ; khoá rác về mặc định", () => {
    const ky = { loai: "tuy" as const, tu: "2026-09-01", den: "2026-09-30", moc: "giao" };
    const url = kyLenUrl(ky, "tao");
    const p = new URLSearchParams(Object.entries(url).filter(([, v]) => v) as [string, string][]);
    expect(kyTuUrl(p, ["tao", "chot", "giao"], "tao")).toEqual(ky);
    expect(kyLenUrl({ loai: "tat_ca", moc: "tao" }, "tao")).toEqual({
      ky: undefined, tu: undefined, den: undefined, moc: undefined,
    });
    expect(kyTuUrl(new URLSearchParams("ky=xyz&moc=bay"), ["tao"], "tao")).toEqual({ loai: "tat_ca", moc: "tao" });
    expect(kyTuUrl(new URLSearchParams("ky=tuy&tu=2026-09-30&den=2026-09-01"), ["tao"], "tao").loai).toBe("tat_ca");
  });
});
