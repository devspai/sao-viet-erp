import { describe, expect, it } from "vitest";

import {
  LOC_MAN_BAN_TO_TRONG, dieuKienBanTo, locBanToLenUrl, locBanToTuUrl, thamSoLocBanTo,
} from "./dieu-kien-ban-to";
import {
  locKcsTieuChiLenUrl, locKcsTieuChiTuUrl, thamSoLocKcsTieuChi,
} from "./dieu-kien-kcs-tieu-chi";

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

describe("thanh lọc tiêu chí KCS", () => {
  it("cờ đổi sang true/false cho máy chủ, đi về qua URL", () => {
    expect(thamSoLocKcsTieuChi({ batBuoc: "khong", dung: "dang", nhom: "print" }))
      .toEqual({ nhom: "print", bat_buoc: false, active: true });
    const t = { ky: { loai: "nam" as const, moc: "tao" }, loc: { nhom: "finishing", batBuoc: "co" as const, dung: "ngung" as const } };
    expect(locKcsTieuChiTuUrl(quaUrl(locKcsTieuChiLenUrl(t)))).toEqual(t);
    expect(locKcsTieuChiTuUrl(new URLSearchParams("nhom=la&bb=x")).loc).toEqual({ nhom: undefined, batBuoc: undefined, dung: undefined });
  });
});
