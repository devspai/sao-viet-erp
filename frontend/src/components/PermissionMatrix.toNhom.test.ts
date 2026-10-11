import { describe, expect, it } from "vitest";
import { cayDongTo } from "./PermissionMatrix";

describe("Dòng quyền tổ: nhận ra nhóm, cha và tổ lá bên trong", () => {
  it("nhóm gom cả tổ lá ở cấp cháu; tổ lá không phải nhóm", () => {
    const { cha, laCuaNhom } = cayDongTo([
      { key: "to_sx_1", cap: 0 }, // Sản xuất
      { key: "to_sx_2", cap: 1 }, //   Tổ in
      { key: "to_sx_3", cap: 2 }, //     Nhóm 2 màu
      { key: "to_sx_4", cap: 2 }, //     Nhóm 4 màu
      { key: "to_sx_5", cap: 1 }, //   Tổ Cán màng
      { key: "to_sx_6", cap: 0 }, // tổ lẻ
    ]);
    expect(Object.fromEntries(laCuaNhom)).toEqual({
      to_sx_1: ["to_sx_3", "to_sx_4", "to_sx_5"],
      to_sx_2: ["to_sx_3", "to_sx_4"],
    });
    expect(cha.get("to_sx_3")).toBe("to_sx_2");
    expect(cha.get("to_sx_5")).toBe("to_sx_1");
    expect(cha.has("to_sx_6")).toBe(false);
  });
});
