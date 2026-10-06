import { describe, expect, it } from "vitest";

import { locManDonMuaHangLenUrl, locManDonMuaHangTuUrl, thamSoLocDonMuaHang } from "./dieu-kien-don-mua";
import { locManYeuCauLenUrl, locManYeuCauTuUrl, thamSoLocYeuCau } from "./dieu-kien-yeu-cau";

describe("thanh lọc Mua hàng — khoá URL", () => {
  it("hai danh sách chung một dấu man không đè khoá nhau nhờ tiền tố yc_", () => {
    const p = new URLSearchParams(
      "man=mua-hang&ky=thang&moc=nhan&ncc=4&coc=unpaid&tong_tu=100&yc_ky=nam&yc_moc=can&yc_pb=2&yc_mh=giay:7",
    );
    const don = locManDonMuaHangTuUrl(p);
    expect(don.ky).toEqual({ loai: "thang", moc: "nhan" });
    expect(don.loc).toEqual({ ncc: 4, coc: "unpaid", tong_tu: 100, tong_den: undefined });
    const yc = locManYeuCauTuUrl(p, "yc_");
    expect(yc.ky).toEqual({ loai: "nam", moc: "can" });
    expect(yc.loc).toEqual({ phong_ban: 2, nguoi: undefined, mat_hang: "giay:7" });
  });

  it("giá trị rác bị bỏ, mốc lạ về mặc định", () => {
    const p = new URLSearchParams("moc=nhan&mh=giay&coc=xx&pb=abc");
    expect(locManYeuCauTuUrl(p).ky.moc).toBe("tao");
    expect(locManYeuCauTuUrl(p).loc).toEqual({ phong_ban: undefined, nguoi: undefined, mat_hang: undefined });
    expect(locManDonMuaHangTuUrl(p).loc.coc).toBeUndefined();
  });

  it("ghi lên URL mang tiền tố và đọc lại ra đúng", () => {
    const t = { ky: { loai: "quy" as const, moc: "can" }, loc: { nguoi: 9, mat_hang: "vat_tu:3" } };
    const g = locManYeuCauLenUrl(t, "yc_");
    expect(g.yc_ky).toBe("quy");
    expect(g.yc_nyc).toBe("9");
    expect(g.ky).toBeUndefined();
    const p = new URLSearchParams(Object.entries(g).filter(([, v]) => v != null) as [string, string][]);
    expect(locManYeuCauTuUrl(p, "yc_")).toEqual({ ...t, loc: { phong_ban: undefined, ...t.loc } });
    expect(locManDonMuaHangLenUrl({ ky: { loai: "tat_ca", moc: "tao" }, loc: { tong_den: 5 } }).tong_den).toBe("5");
  });

  it("tham số máy chủ", () => {
    expect(thamSoLocYeuCau({ phong_ban: 1, nguoi: 2, mat_hang: "giay:7" })).toEqual({
      phong_ban: 1,
      nguoi_yeu_cau: 2,
      mat_hang: "giay:7",
    });
    expect(thamSoLocDonMuaHang({ ncc: 3, coc: "none", tong_tu: 1, tong_den: 2 })).toEqual({
      supplier_id: 3,
      deposit_status: "none",
      tong_tu: 1,
      tong_den: 2,
    });
  });
});
