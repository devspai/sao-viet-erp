import { describe, expect, it } from "vitest";

import { kyBaoCaoLenUrl, kyBaoCaoTuUrl } from "./ky-bao-cao";

describe("kỳ của màn báo cáo", () => {
  it("không có khoá kỳ trên URL thì về kỳ mặc định của báo cáo, không về Tất cả", () => {
    expect(kyBaoCaoTuUrl(new URLSearchParams(""), ["chot"], "chot", "thang")).toEqual({ loai: "thang", moc: "chot" });
  });

  it("Tất cả được ghi rõ lên URL và đọc lại đúng", () => {
    const g = kyBaoCaoLenUrl({ loai: "tat_ca", moc: "chot" }, "chot", "thang");
    expect(g.ky).toBe("tat_ca");
    expect(kyBaoCaoTuUrl(new URLSearchParams("ky=tat_ca"), ["chot"], "chot", "thang").loai).toBe("tat_ca");
  });

  it("kỳ mặc định thì bỏ khoá; tuỳ chọn giữ hai ngày", () => {
    expect(kyBaoCaoLenUrl({ loai: "thang", moc: "chot" }, "chot", "thang").ky).toBeUndefined();
    const g = kyBaoCaoLenUrl({ loai: "tuy", tu: "2026-09-01", den: "2026-09-30", moc: "chot" }, "chot", "thang");
    expect(g).toMatchObject({ ky: "tuy", tu: "2026-09-01", den: "2026-09-30" });
  });
});
