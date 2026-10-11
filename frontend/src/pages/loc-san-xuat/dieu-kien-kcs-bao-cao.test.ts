import { describe, expect, it } from "vitest";
import { KY_BC_MAC_DINH, bcLenUrl, bcTuUrl, dieuKienBcKcs, thamSoBcKcs } from "./dieu-kien-kcs";
import type { SxKcsBaoCao } from "../../api/client";

describe("thanh lọc tab Báo cáo lỗi KCS", () => {
  it("mặc định Tháng này theo ngày kiểm; Mọi thời gian phải ghi rõ lên URL", () => {
    expect(bcTuUrl(new URLSearchParams("tab=bao_cao"))).toEqual({ ky: KY_BC_MAC_DINH, loc: { khach: undefined, cong_doan: undefined } });
    expect(bcLenUrl(KY_BC_MAC_DINH, {})).toEqual({ bc_ky: undefined, bc_tu: undefined, bc_den: undefined, bc_khach: undefined, bc_cd: undefined });
    const url = bcLenUrl({ loai: "tat_ca", moc: "kiem" }, { khach: 7, cong_doan: "Bế" });
    expect(url).toMatchObject({ bc_ky: "tat_ca", bc_khach: "7", bc_cd: "Bế" });
    const p = new URLSearchParams(Object.entries(url).filter(([, v]) => v != null) as [string, string][]);
    expect(bcTuUrl(p)).toEqual({ ky: { loai: "tat_ca", moc: "kiem" }, loc: { khach: 7, cong_doan: "Bế" } });
  });

  it("không đè khoá kỳ của tab Lệnh và đọc lại Tuỳ chọn", () => {
    const p = new URLSearchParams("ky=nam&tu=2026-01-01&bc_ky=tuy&bc_tu=2026-10-01&bc_den=2026-10-05");
    expect(bcTuUrl(p).ky).toEqual({ loai: "tuy", tu: "2026-10-01", den: "2026-10-05", moc: "kiem" });
  });

  it("tham số máy chủ theo quy ước tu_ngay/den_ngay/moc; Mọi thời gian không gửi ngày", () => {
    expect(thamSoBcKcs({ loai: "tuy", tu: "2026-10-01", den: "2026-10-05", moc: "kiem" }, { khach: 3 }, "LSX"))
      .toEqual({ tu_ngay: "2026-10-01", den_ngay: "2026-10-05", moc: "kiem", tu_khoa: "LSX", khach_id: 3, cong_doan: undefined });
    expect(thamSoBcKcs({ loai: "tat_ca", moc: "kiem" }, {}, "")).toEqual({ tu_khoa: undefined, khach_id: undefined, cong_doan: undefined });
  });

  it("giá trị menu Lọc lấy từ kết quả báo cáo, kèm số", () => {
    const [cd, khach] = dieuKienBcKcs({ loc_cong_doan: [{ ten: "In", so: 4 }], loc_khach: [{ id: 2, ten: "Cty A", so: 3 }] } as SxKcsBaoCao);
    expect(cd.kieu === "mot" && cd.giaTri).toEqual([{ value: "In", nhan: "In", so: 4 }]);
    expect(khach.kieu === "mot" && khach.giaTri).toEqual([{ value: "2", nhan: "Cty A", so: 3 }]);
    expect(dieuKienBcKcs(null).every((d) => d.kieu === "mot" && d.giaTri.length === 0)).toBe(true);
  });
});
