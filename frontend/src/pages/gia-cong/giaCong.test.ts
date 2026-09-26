import { describe, expect, it } from "vitest";
import { viTriTrongDai, type BuocDai } from "./giaCong";

const b = (
  ten: string,
  loai: BuocDai["loai_buoc"],
  ncc: number | null = null,
  opts: { key?: string; phu_thuoc?: string[] } = {},
): BuocDai => ({
  key: opts.key ?? ten,
  ten,
  loai_buoc: loai,
  nha_cung_cap_id: ncc,
  phu_thuoc_step_keys: opts.phu_thuoc ?? [],
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

describe("viTriTrongDai — liền nhau đi theo CẠNH DAG, không phải thứ tự mảng", () => {
  it("hai nhánh song song cùng NCC đứng cạnh nhau trong mảng ⇒ KHÔNG cùng lần (không có cạnh nối)", () => {
    // "In" toả ra hai nhánh song song "Cán màng" và "Ép kim", cả hai cùng nhà gia công 7 nhưng
    // KHÔNG có cạnh nối trực tiếp giữa chúng — chỉ tình cờ đứng cạnh nhau trong `rows`.
    const rows = [
      b("In", "may", null, { key: "p" }),
      b("Cán màng", "thue_ngoai", 7, { key: "a", phu_thuoc: ["p"] }),
      b("Ép kim", "thue_ngoai", 7, { key: "c", phu_thuoc: ["p"] }),
    ];
    expect(viTriTrongDai(rows, 1)).toEqual({ truoc: null, sau: null, laCuoi: true });
    expect(viTriTrongDai(rows, 2)).toEqual({ truoc: null, sau: null, laCuoi: true });
  });

  it("routing không khai cạnh nào ⇒ lùi về so THỨ TỰ MẢNG (routing tuyến tính cũ)", () => {
    const rows = [
      b("Cán màng", "thue_ngoai", 7, { key: "a" }),
      b("Ép kim", "thue_ngoai", 7, { key: "c" }),
    ];
    expect(viTriTrongDai(rows, 0)).toEqual({ truoc: null, sau: "Ép kim", laCuoi: false });
    expect(viTriTrongDai(rows, 1)).toEqual({ truoc: "Cán màng", sau: null, laCuoi: true });
  });
});
