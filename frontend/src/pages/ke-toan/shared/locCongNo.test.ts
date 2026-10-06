/** Hàm thuần bộ lọc công nợ: ba khoá thêm (`thieu_hoa_don` phía trả, `phu_trach_id` + `nhan` phía
 *  thu) đi đủ đếm điều kiện, điều kiện trên thanh lọc, tham số máy chủ và URL. */
import { describe, expect, it } from "vitest";

import {
  congNoLenUrl,
  congNoTuUrl,
  dieuKienCongNo,
  soDieuKienCongNo,
  thamSoCongNo,
  type LocNangCaoCongNo,
  type LocThanhCongNo,
  type TrangThaiCongNo,
} from "./locCongNo";

const KY = { tu: "2026-07-01", den: "2026-09-30" } as Parameters<typeof thamSoCongNo>[1];

describe("locCongNo: khoá thêm", () => {
  const loc: LocNangCaoCongNo = { thieu_hoa_don: true, phu_trach_id: 7, nhan: " VIP " };

  it("đếm điều kiện", () => {
    expect(soDieuKienCongNo(loc)).toBe(3);
  });

  it("điều kiện trên thanh lọc: tuổi nợ lấy từ máy chủ, ô riêng mỗi phía", () => {
    const aging = [{ key: "qua_60", label: "Trễ > 60 ngày", amount: 5, count: 2 }];
    const tra = dieuKienCongNo({ nhanHan: "Hạn trả", nhanHet: "Nhà cung cấp đã trả hết", coThieuHd: true }, aging);
    expect(tra.map((d) => d.khoa)).toEqual(["tuoi", "no", "han_tra", "han_muc", "het", "thieu_hd"]);
    const tuoi = tra[0];
    expect(tuoi.kieu === "mot" && tuoi.giaTri).toEqual([{ value: "qua_60", nhan: "Trễ trên 60 ngày", so: 2 }]);

    const thu = dieuKienCongNo({ nhanHan: "Hạn thu", nhanHet: "Khách đã thu hết" }, [], [{ id: 7, name: "Chị Luyến" }], ["VIP"]);
    expect(thu.map((d) => d.khoa)).toEqual(["tuoi", "no", "phu_trach", "han_tra", "han_muc", "nhan", "het"]);

    const l: LocThanhCongNo = { tuoi: null, loc: {} };
    const pt = thu.find((d) => d.khoa === "phu_trach");
    const het = thu.find((d) => d.khoa === "het");
    if (pt?.kieu !== "mot" || het?.kieu !== "mot") throw new Error("sai kiểu");
    expect(pt.ghi(l, "7").loc.phu_trach_id).toBe(7);
    expect(het.ghi(l, "hien").loc.ca_da_tra_het).toBe(true);
    expect(het.ghi({ tuoi: null, loc: { ca_da_tra_het: true } }, undefined).loc.ca_da_tra_het).toBeUndefined();
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
