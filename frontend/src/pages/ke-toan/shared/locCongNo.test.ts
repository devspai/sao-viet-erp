/** Hàm thuần bộ lọc công nợ: ba khoá thêm (`thieu_hoa_don` phía trả, `phu_trach_id` + `nhan` phía
 *  thu) đi đủ đếm điều kiện, chip, bỏ chip, tham số máy chủ và URL. */
import { describe, expect, it } from "vitest";

import {
  boDieuKienCongNo,
  chipsLocCongNo,
  congNoLenUrl,
  congNoTuUrl,
  soDieuKienCongNo,
  thamSoCongNo,
  type LocNangCaoCongNo,
  type TrangThaiCongNo,
} from "./locCongNo";

const CH = { nhanHan: "Hạn thu", nhanHet: "khách đã thu hết" };
const KY = { tu: "2026-07-01", den: "2026-09-30" } as Parameters<typeof thamSoCongNo>[1];

describe("locCongNo: khoá thêm", () => {
  const loc: LocNangCaoCongNo = { thieu_hoa_don: true, phu_trach_id: 7, nhan: " VIP " };

  it("đếm, chip và bỏ từng chip", () => {
    expect(soDieuKienCongNo(loc)).toBe(3);
    const chips = chipsLocCongNo(loc, { ...CH, tenPhuTrach: (id) => (id === 7 ? "Chị Luyến" : undefined) });
    expect(chips.map((c) => [c.khoa, c.nhan, c.giaTri])).toEqual([
      ["thieu_hd", "Hoá đơn", "có đợt giao chưa ghi"],
      ["phu_trach", "Phụ trách", "Chị Luyến"],
      ["nhan", "Nhãn", "VIP"],
    ]);
    expect(chipsLocCongNo({ phu_trach_id: 9 }, CH)[0].giaTri).toBe("đã chọn");
    expect(boDieuKienCongNo(loc, "thieu_hd").thieu_hoa_don).toBeUndefined();
    expect(boDieuKienCongNo(loc, "phu_trach").phu_trach_id).toBeUndefined();
    expect(boDieuKienCongNo(loc, "nhan").nhan).toBeUndefined();
  });

  it("ra tham số máy chủ", () => {
    const tt: TrangThaiCongNo = { the: "all", tuoi: null, tim: "", loc };
    expect(thamSoCongNo(tt, KY)).toEqual(
      expect.objectContaining({ thieu_hoa_don: true, phu_trach_id: 7, nhan: "VIP" }),
    );
    expect(thamSoCongNo({ ...tt, loc: {} }, KY).thieu_hoa_don).toBeUndefined();
  });

  it("đi và về qua URL; giá trị rác bị bỏ", () => {
    const tt: TrangThaiCongNo = { the: "all", tuoi: null, tim: "", loc };
    const url = congNoLenUrl(tt);
    expect(url).toEqual(expect.objectContaining({ thd: "1", pt: "7", nhan: "VIP" }));
    const p = new URLSearchParams(Object.entries(url).filter((e): e is [string, string] => e[1] != null));
    expect(congNoTuUrl(p).loc).toEqual({ thieu_hoa_don: true, phu_trach_id: 7, nhan: "VIP" });
    expect(congNoTuUrl(new URLSearchParams("thd=x&pt=-3&nhan=%20")).loc).toEqual({});
  });
});
