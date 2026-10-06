import { describe, expect, it } from "vitest";

import { LOC_KHSX_TRONG, locKhsxLenUrl, locKhsxTuUrl, thamSoLocLenhKhsx, type LocKhsx } from "./dieu-kien-ke-hoach-sx";

const sach = (g: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(g).filter(([, v]) => v != null)) as Record<string, string>;

describe("thanh lọc Kế hoạch SX — hai bảng chung một URL", () => {
  it("mặc định không ghi khoá nào", () => {
    expect(sach(locKhsxLenUrl(LOC_KHSX_TRONG))).toEqual({});
  });

  it("khoá hàng chờ mang tiền tố c_, đọc lại ra đúng trạng thái, không lẫn với bảng lệnh", () => {
    const t: LocKhsx = {
      lenh: { ky: { loai: "thang", moc: "han_sx" }, loc: { khach: 3, don: 7, gia_cong: "tron_goi" } },
      cho: { ky: { loai: "tuy", tu: "2026-10-01", den: "2026-10-31", moc: "chuyen" }, loc: { khach: 5 } },
    };
    const g = sach(locKhsxLenUrl(t));
    expect(g).toEqual({
      ky: "thang", moc: "han_sx", khach: "3", don: "7", gc: "tron_goi",
      c_ky: "tuy", c_tu: "2026-10-01", c_den: "2026-10-31", c_moc: "chuyen", c_khach: "5",
    });
    expect(locKhsxTuUrl(new URLSearchParams(g))).toEqual(t);
  });

  it("giá trị rác trên URL bị bỏ; tham số máy chủ đúng tên", () => {
    const t = locKhsxTuUrl(new URLSearchParams({ gc: "la", c_moc: "han_sx", khach: "x" }));
    expect(t.lenh.loc).toEqual({ khach: undefined, don: undefined, gia_cong: undefined });
    expect(t.cho.ky.moc).toBe("tao");
    expect(thamSoLocLenhKhsx({ khach: 1, don: 2, gia_cong: "cho_mang_di" }))
      .toEqual({ customer_id: 1, order_id: 2, gia_cong: "cho_mang_di" });
  });
});
