import { describe, expect, it } from "vitest";
import { chipsThanhBien, maTuTenChip } from "./VatTuChips";

describe("maTuTenChip — khớp backend ma_tu_ten_chip", () => {
  it.each([
    ["Định lượng support", "dinh_luong_support"],
    ["  Dài  support (mm) ", "dai_support_mm"],
    ["2 mặt", "c_2_mat"],
    ["!!!", "chip"],
  ])("%s → %s", (ten, ma) => expect(maTuTenChip(ten)).toBe(ma));
});

describe("chipsThanhBien", () => {
  it("chip chưa có mã vẫn ra biến (mã sinh từ tên)", () => {
    const b = chipsThanhBien([{ ten: "Dài support", don_vi: "mm" }]);
    expect(b).toHaveLength(1);
    expect(b[0].ma).toBe("dai_support");
    expect(b[0].nhan).toBe("Dài support");
    expect(b[0].don_vi).toBe("mm");
  });
  it("bỏ chip chưa gõ tên", () => {
    expect(chipsThanhBien([{ ten: "  " }])).toEqual([]);
  });
});
