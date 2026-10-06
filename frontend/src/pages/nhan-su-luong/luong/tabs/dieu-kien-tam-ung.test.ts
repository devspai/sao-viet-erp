import { describe, expect, it } from "vitest";

import type { SalaryAdvance } from "../../../../api/client";
import { LOC_TU_TRONG, locTamUngLenUrl, locTamUngTuUrl, tachLoai, thamSoLocTamUng } from "./dieu-kien-tam-ung";
import { locBangLuongLenUrl, locBangLuongTuUrl } from "./dieu-kien-bang-luong";

const url = (g: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(g).filter((e): e is [string, string] => e[1] != null));

describe("thanh lọc Tạm ứng", () => {
  it("URL đi về giữ nguyên kỳ, tab và điều kiện; khoá lạ bị bỏ", () => {
    const t = {
      ky: { loai: "thang" as const, moc: "ung" },
      tab: "cho_chi" as const,
      loc: { loai: "luong_dot_1" as const, to: 7, tien_tu: 1_000_000, tien_den: 5_000_000 },
    };
    const g = locTamUngLenUrl(t);
    expect(g.tab).toBe("tamung");
    expect(locTamUngTuUrl(url(g))).toEqual(t);
    expect(locTamUngTuUrl(url({ tu_tab: "rac", tu_loai: "x", moc: "rac" }))).toEqual(LOC_TU_TRONG);
  });

  it("tham số máy chủ chỉ mang điều kiện đã đặt", () => {
    expect(thamSoLocTamUng({ to: 3 })).toEqual({ loai: undefined, to: 3, tien_tu: undefined, tien_den: undefined });
  });

  it("hộp xác nhận tách theo loại, không nối bằng dấu chấm giữa", () => {
    const p = (id: number, amount: number, kind = "tam_ung") => ({ id, amount, kind }) as SalaryAdvance;
    expect(tachLoai([p(1, 1_000_000), p(2, 2_500_000, "luong_dot_1"), p(3, 500_000)])).toBe(
      "2 tạm ứng và 1 lương đợt 1 — tổng 4.000.000đ",
    );
  });
});

describe("thanh lọc Bảng lương tháng", () => {
  it("khoá URL riêng `bl_` không ăn nhầm khoá của Tạm ứng", () => {
    expect(locBangLuongTuUrl(url(locBangLuongLenUrl({ phong: 4, hd: "tv" })))).toEqual({ phong: 4, hd: "tv" });
    expect(locBangLuongTuUrl(url({ tu_to: "4", tab: "tamung" }))).toEqual({ phong: undefined, hd: undefined });
  });
});
