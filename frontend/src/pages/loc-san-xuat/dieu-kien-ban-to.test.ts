import { describe, expect, it } from "vitest";

import {
  LOC_MAN_BAN_TO_TRONG, dieuKienBanTo, locBanToLenUrl, locBanToTuUrl, thamSoLocBanTo,
} from "./dieu-kien-ban-to";

const quaUrl = (g: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(g).filter((e): e is [string, string] => e[1] != null));

describe("thanh lọc bàn tổ", () => {
  it("mặc định không ghi khoá nào, mốc mặc định là ngày tổ nhận", () => {
    expect(Object.values(locBanToLenUrl(LOC_MAN_BAN_TO_TRONG)).filter(Boolean)).toEqual([]);
    expect(locBanToTuUrl(new URLSearchParams()).ky.moc).toBe("nhan");
  });

  it("đi về qua URL giữ nguyên, rác thì bỏ", () => {
    const t = {
      ky: { loai: "thang" as const, moc: "tao" },
      loc: { trangThai: ["running" as const, "paused" as const], cho: true },
      sapXep: "du_kien" as const,
    };
    expect(locBanToTuUrl(quaUrl(locBanToLenUrl(t)))).toEqual(t);
    const rac = locBanToTuUrl(new URLSearchParams("tt=chay.running&sap=la&moc=x&cho=2"));
    expect(rac).toEqual({ ...LOC_MAN_BAN_TO_TRONG, loc: { trangThai: ["running"], cho: undefined } });
  });

  it("trạng thái gửi mảng, chờ xác nhận không đi trong tham số lọc", () => {
    expect(thamSoLocBanTo({ trangThai: ["released"], cho: true })).toEqual({ trang_thai: ["released"] });
    expect(thamSoLocBanTo({ trangThai: [] })).toEqual({ trang_thai: undefined });
    const cho = dieuKienBanTo(3).find((d) => d.khoa === "cho");
    expect(cho?.kieu === "mot" && cho.giaTri[0].so).toBe(3);
  });
});
