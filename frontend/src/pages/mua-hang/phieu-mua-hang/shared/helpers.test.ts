import { describe, expect, it } from "vitest";

import type { SupplierItemRow, SupplierRow } from "../../../../api/client";
import { chaoGiaChoMatHang, khoNhapTuDongMua, nhanKhoMua } from "./helpers";

describe("nhanKhoMua", () => {
  it("giấy có khổ mua ⇒ ghi khổ", () => {
    expect(nhanKhoMua({ hang_loai: "giay", kho_rong: 800, kho_dai: 1090 })).toBe("Khổ 800 × 1090 mm");
  });
  it("giấy không khổ hoặc hàng khác ⇒ rỗng", () => {
    expect(nhanKhoMua({ hang_loai: "giay", kho_rong: 0, kho_dai: 0 })).toBe("");
    expect(nhanKhoMua({ hang_loai: "vat_tu", kho_rong: 0, kho_dai: 0 })).toBe("");
  });
});

/** Nhập kho từ đợt giao: dòng yêu cầu nhập (form khoá) phải mang đúng dạng + khổ MUA của dòng đơn,
 *  vì tồn giấy tờ tách theo khổ — nhập sai khổ là giữ chỗ/kiểm xuất đếm nhầm lô. */
describe("khoNhapTuDongMua", () => {
  it("giấy có khổ mua ⇒ tờ đúng khổ", () => {
    expect(khoNhapTuDongMua({ hang_loai: "giay", kho_rong: 800, kho_dai: 1090 })).toEqual({
      dang_giay: "to",
      kho_rong: 800,
      kho_dai: 1090,
    });
  });

  it("giấy không khổ ⇒ cuộn", () => {
    expect(khoNhapTuDongMua({ hang_loai: "giay", kho_rong: 0, kho_dai: 0 })).toEqual({
      dang_giay: "cuon",
      kho_rong: 0,
      kho_dai: 0,
    });
  });

  it("hàng khác giấy hoặc không khớp được dòng đơn ⇒ không có dạng", () => {
    const rong = { dang_giay: null, kho_rong: 0, kho_dai: 0 };
    expect(khoNhapTuDongMua({ hang_loai: "vat_tu", kho_rong: 0, kho_dai: 0 })).toEqual(rong);
    expect(khoNhapTuDongMua(undefined)).toEqual(rong);
  });
});

/** Chọn NCC cho dòng giấy theo DẠNG BÁN + KHỔ (07/10/2026): tờ chỉ so NCC bán tờ đúng khổ; NCC bán
 *  khổ khác hoặc bán cuộn đứng nhóm sau, không có giá. */
describe("chaoGiaChoMatHang theo dạng + khổ", () => {
  const item = (o: Partial<SupplierItemRow>): SupplierItemRow =>
    ({
      id: 1, hang_loai: "giay", hang_id: 7, item_name: "COUCHE 150", unit: "to",
      unit_price: 1000, vat_percent: 8, is_active: true, gia_quy_doi: null,
      dang_ban: "to", kho_rong: 790, kho_dai: 1090, ...o,
    }) as SupplierItemRow;
  const ncc = (id: number, items: SupplierItemRow[]): SupplierRow =>
    ({ id, name: `NCC ${id}`, status: "active", items }) as unknown as SupplierRow;
  const ds = [
    ncc(1, [item({ unit_price: 1200, gia_quy_doi: 1200 })]),
    ncc(2, [item({ unit_price: 1100, gia_quy_doi: 1100 })]),
    ncc(3, [item({ kho_rong: 650, kho_dai: 860 })]),
    ncc(4, [item({ dang_ban: "cuon", kho_rong: 0, kho_dai: 0, unit: "kg", gia_quy_doi: 24500 })]),
  ];
  const dong = { item_name: "COUCHE 150", hang_loai: "giay" as const, hang_id: 7 };

  it("tờ: chỉ NCC bán tờ cùng khổ được xếp giá, khác khổ và cuộn sang nhóm sau", () => {
    const out = chaoGiaChoMatHang({ ...dong, kho_rong: 1090, kho_dai: 790 }, ds);
    expect(out.filter((c) => !c.khac_kho).map((c) => c.supplier_id)).toEqual([2, 1]);
    const khac = out.filter((c) => c.khac_kho);
    expect(khac.map((c) => c.supplier_id)).toEqual([3, 4]);
    expect(khac[0].nhan_dang).toBe("Tờ 650 × 860");
    expect(khac.every((c) => c.unit_price === 0 && c.gia_quy_doi === null)).toBe(true);
  });

  it("cuộn: chỉ NCC bán cuộn được xếp giá", () => {
    const out = chaoGiaChoMatHang({ ...dong, kho_rong: 0, kho_dai: 0 }, ds);
    expect(out.filter((c) => !c.khac_kho).map((c) => c.supplier_id)).toEqual([4]);
  });

  it("hàng khác giấy khớp theo mã, không chia nhóm", () => {
    const vt = [ncc(5, [item({ hang_loai: "vat_tu", hang_id: 9, dang_ban: null, kho_rong: 0, kho_dai: 0 })])];
    const out = chaoGiaChoMatHang({ item_name: "x", hang_loai: "vat_tu", hang_id: 9 }, vt);
    expect(out.map((c) => [c.supplier_id, !!c.khac_kho])).toEqual([[5, false]]);
  });
});
