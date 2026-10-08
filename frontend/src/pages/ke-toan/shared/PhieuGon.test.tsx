/** Mảnh chung sổ phiếu gọn A: số phiếu của dòng Cộng phải KHỚP tổng tiền máy chủ cộng (tổng cộng
 *  trên bộ lọc có tab + ô Chứng từ, còn `the_loc` đếm trên nền không có hai thứ đó). */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaiKhoanO, soPhieuCong } from "./PhieuGon";

const N = { tat_ca: 9, xong: 6, xong_tien: 50_000_000, thieu_chung_tu: 2, da_huy: 2, cho: 1 };

describe("soPhieuCong", () => {
  it("tab chỉ chứa phiếu đã xong (Đã chi, Thiếu chứng từ): số dòng của bảng", () => {
    expect(soPhieuCong({ the: "xong", chungTu: undefined, n: N, tong: 4 })).toBe(4);
    expect(soPhieuCong({ the: "thieu", chungTu: undefined, n: N, tong: 2 })).toBe(2);
    // Ô Chứng từ đã lọc trên máy chủ ⇒ tổng dòng vẫn đúng, không lấy the_loc.
    expect(soPhieuCong({ the: "xong", chungTu: "co", n: N, tong: 3 })).toBe(3);
  });

  it("tab Tất cả: theo ô Chứng từ", () => {
    expect(soPhieuCong({ the: "tat_ca", chungTu: undefined, n: N, tong: 9 })).toBe(6);
    expect(soPhieuCong({ the: "tat_ca", chungTu: "thieu", n: N, tong: 4 })).toBe(2);
    expect(soPhieuCong({ the: "tat_ca", chungTu: "co", n: N, tong: 5 })).toBe(4);
  });

  it("tab không có phiếu đã xong hoặc chưa có số: null (không vẽ dòng Cộng)", () => {
    expect(soPhieuCong({ the: "da_huy", chungTu: undefined, n: N, tong: 2 })).toBeNull();
    expect(soPhieuCong({ the: "cho", chungTu: undefined, n: N, tong: 1 })).toBeNull();
    expect(soPhieuCong({ the: "tat_ca", chungTu: undefined, n: null, tong: 0 })).toBeNull();
  });
});

describe("TaiKhoanO", () => {
  it("không có ngân hàng, số lẫn chi nhánh thì null (ô cột thuộc tính ẩn cả nhãn)", () => {
    expect(TaiKhoanO({ nganHang: null, so: null, chiNhanh: null })).toBeNull();
  });

  it("có dữ liệu: ngân hàng + số chung một mẩu, chi nhánh là thẻ nhỏ", () => {
    const { getByText } = render(<>{TaiKhoanO({ nganHang: "BIDV", so: "6501", chiNhanh: "CN Bình Dương" })}</>);
    expect(getByText("BIDV 6501")).toBeInTheDocument();
    expect(getByText("CN Bình Dương")).toHaveClass("kt-the");
  });
});
