import { describe, expect, it } from "vitest";
import { toLaDauTien } from "./banToLa";

const CAY = [
  { id: 1, cap: 0 }, // Sản xuất
  { id: 2, cap: 1 }, //   Tổ in
  { id: 3, cap: 2 }, //     Nhóm 2 màu
  { id: 4, cap: 2 }, //     Nhóm 4 màu
  { id: 5, cap: 1 }, //   Tổ Cán màng
  { id: 6, cap: 0 }, // Tổ lẻ không con
];

describe("toLaDauTien", () => {
  it("tổ cha trỏ về tổ lá đầu tiên của nhánh, kể cả khi phải xuống hai cấp", () => {
    expect(toLaDauTien(CAY, 1)).toBe(3);
    expect(toLaDauTien(CAY, 2)).toBe(3);
  });

  it("tổ lá và tổ không có trong danh sách thì để nguyên", () => {
    expect(toLaDauTien(CAY, 4)).toBeNull();
    expect(toLaDauTien(CAY, 5)).toBeNull();
    expect(toLaDauTien(CAY, 6)).toBeNull();
    expect(toLaDauTien(CAY, 99)).toBeNull();
  });
});
