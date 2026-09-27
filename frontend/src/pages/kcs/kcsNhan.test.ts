import { describe, expect, it } from "vitest";
import { loiHoiNhapKho } from "./kcsNhan";

describe("loiHoiNhapKho", () => {
  it("không lặp chữ khi đơn vị ra là thành phẩm", () => {
    const s = loiHoiNhapKho("20.000", "thành phẩm", "LSX26-0015", "Đóng gói");
    expect(s).toBe("Đề nghị kho nhập 20.000 thành phẩm đã kiểm đạt của LSX26-0015 (Đóng gói).");
    expect(s).not.toContain("thành phẩm thành phẩm");
  });
});
