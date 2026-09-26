import { describe, expect, it } from "vitest";
import { viTriTrongDai, type BuocDai } from "./giaCong";

const b = (ten: string, loai: BuocDai["loai_buoc"], ncc: number | null = null): BuocDai => ({
  ten, loai_buoc: loai, nha_cung_cap_id: ncc,
});

describe("viTriTrongDai — cùng luật gom lần của máy chủ", () => {
  const rows = [
    b("In", "may"), b("Cán màng", "thue_ngoai", 7), b("Ép kim", "thue_ngoai", 7),
    b("Bế", "thue_ngoai", 9), b("Dán", "to"),
  ];
  it("bước không thuê ngoài thì null", () => {
    expect(viTriTrongDai(rows, 0)).toBeNull();
  });
  it("đầu dải: ô đơn giá nằm ở bước sau", () => {
    expect(viTriTrongDai(rows, 1)).toEqual({ truoc: null, sau: "Ép kim", laCuoi: false });
  });
  it("cuối dải cùng nhà gia công", () => {
    expect(viTriTrongDai(rows, 2)).toEqual({ truoc: "Cán màng", sau: null, laCuoi: true });
  });
  it("khác nhà gia công là lần khác", () => {
    expect(viTriTrongDai(rows, 3)).toEqual({ truoc: null, sau: null, laCuoi: true });
  });
  it("chưa chọn nhà gia công thì không gom", () => {
    const r2 = [b("A", "thue_ngoai"), b("B", "thue_ngoai")];
    expect(viTriTrongDai(r2, 0)).toEqual({ truoc: null, sau: null, laCuoi: true });
  });
});
