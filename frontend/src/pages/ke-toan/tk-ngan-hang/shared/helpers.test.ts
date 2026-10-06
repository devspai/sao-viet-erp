/** Hàm thuần của màn Tài khoản ngân hàng (TK-1 … TK-3): cách viết số, chữ viết tắt, thứ tự thẻ, điền 0
 *  cho tài khoản vắng mặt trong thống kê, gộp hai sổ phiếu theo ngày, kiểm form và payload gửi máy chủ. */
import { describe, expect, it } from "vitest";

import {
  formTrong,
  formTuTaiKhoan,
  gopPhieu,
  loiFormTaiKhoan,
  maNganHang,
  nhomBon,
  payloadTaiKhoan,
  soChep,
  soLieuCua,
  soLieuTheoId,
  soTienCoDau,
  tieuDeTaiKhoan,
  vietTat,
  xepTaiKhoan,
} from "./helpers";
import { taiKhoan } from "./mauTaiKhoan";
import type { DongPhieuTk } from "./types";

describe("cách viết số tài khoản", () => {
  it("nhóm 4 chữ số, bỏ khoảng trắng gõ sẵn; chép thì không có khoảng trắng", () => {
    expect(nhomBon("933134668")).toBe("9331 3466 8");
    expect(nhomBon(" 0281 0004 56789 ")).toBe("0281 0004 5678 9");
    expect(nhomBon("18234567")).toBe("1823 4567");
    expect(soChep(" 9331 3466 8 ")).toBe("933134668");
  });

  it("số tiền có dấu: thu + xanh, chi − (dấu trừ thật), 0 không dấu", () => {
    expect(soTienCoDau(120_000_000, "thu")).toBe("+120.000.000");
    expect(soTienCoDau(86_500_000, "chi")).toBe("−86.500.000");
    expect(soTienCoDau(0, "chi")).toBe("0");
  });
});

describe("vietTat — chữ trong vòng 40px, không dùng logo, không bảng tên cứng", () => {
  it("lấy mã trong ngoặc; tên ngắn giữ nguyên; tên nhiều chữ lấy chữ đầu; một chữ dài lấy chữ hoa hoặc 3 chữ đầu", () => {
    expect(vietTat("Ngân hàng TMCP Quân đội (MB)")).toBe("MB");
    expect(vietTat("ACB")).toBe("ACB");
    expect(vietTat("BIDV")).toBe("BIDV");
    expect(vietTat("Ngân hàng Quân đội")).toBe("QĐ");
    expect(vietTat("VietinBank")).toBe("VB");
    expect(vietTat("Vietcombank")).toBe("VIE");
    expect(vietTat("   ")).toBe("?");
    // Đuôi chi nhánh và dấu câu không lọt vào chữ viết tắt.
    expect(vietTat("Ngân hàng TMCP Quân đội - CN THUẬN AN")).toBe("QĐ");
    expect(vietTat("Ngân hàng Công Thương Chi nhánh Bình Dương")).toBe("CT");
    // Mã trong ngoặc thắng luật suy: dữ liệu quyết định, không bảng tên cứng.
    expect(vietTat("Vietcombank (VCB)")).toBe("VCB");
  });
});

describe("tieuDeTaiKhoan — tiêu đề ngăn, aria-label thẻ, câu hỏi TK-4", () => {
  it("mã trong ngoặc nếu có, không thì NGUYÊN tên ngân hàng (không dùng chữ viết tắt suy ra)", () => {
    expect(tieuDeTaiKhoan(taiKhoan())).toBe("MB 9331 3466 8");
    expect(tieuDeTaiKhoan(taiKhoan({ bank_name: "Vietcombank (VCB)" }))).toBe("VCB 9331 3466 8");
    expect(tieuDeTaiKhoan(taiKhoan({ bank_name: " Vietcombank ", account_number: "0281000456789" }))).toBe(
      "Vietcombank 0281 0004 5678 9",
    );
    expect(maNganHang("Ngân hàng TMCP Quân đội (MB)")).toBe("MB");
    expect(maNganHang("Vietcombank")).toBeNull();
  });
});

describe("thứ tự thẻ và số liệu kỳ", () => {
  it("tài khoản ngừng dùng gom cuối, giữ thứ tự máy chủ trong từng nhóm", () => {
    const ds = [taiKhoan({ id: 1, is_active: false }), taiKhoan({ id: 2 }), taiKhoan({ id: 3, is_active: false }), taiKhoan({ id: 4 })];
    expect(xepTaiKhoan(ds).map((r) => r.id)).toEqual([2, 4, 1, 3]);
  });

  it("tài khoản không có phiếu trong kỳ vắng mặt ở máy chủ ⇒ điền 0", () => {
    const m = soLieuTheoId([{ tai_khoan_id: 2, thu: 5, chi: 7, so_phieu: 3 }]);
    expect(soLieuCua(m, 2)).toEqual({ thu: 5, chi: 7, so_phieu: 3 });
    expect(soLieuCua(m, 9)).toEqual({ thu: 0, chi: 0, so_phieu: 0 });
    // Chưa tải (null) thì KHÔNG giả làm 0.
    expect(soLieuCua(null, 2)).toBeNull();
  });
});

describe("gopPhieu — hai sổ phiếu, ngày giảm dần, không trùng, không xếp sai khi còn trang chưa tải", () => {
  const d = (loai: "chi" | "thu", id: number, ngay: string): DongPhieuTk => ({
    loai, id, ma: `${loai}-${id}`, ngay, noiDung: "", soTien: 1,
  });

  it("đã tải hết hai nguồn: trộn theo ngày giảm, trùng loại+id chỉ một dòng, cùng id khác loại vẫn hai dòng", () => {
    const ra = gopPhieu(
      { rows: [d("chi", 1, "2026-10-05"), d("chi", 2, "2026-10-01"), d("chi", 1, "2026-10-05")], total: 2 },
      { rows: [d("thu", 1, "2026-10-03")], total: 1 },
    );
    expect(ra.map((x) => `${x.loai}-${x.id}`)).toEqual(["chi-1", "thu-1", "chi-2"]);
  });

  it("nguồn còn trang chưa tải: phiếu nguồn kia cũ hơn phiếu cuối của nó chờ tới khi tải tiếp", () => {
    const ra = gopPhieu(
      { rows: [d("chi", 9, "2026-10-06"), d("chi", 8, "2026-10-04")], total: 5 },
      { rows: [d("thu", 1, "2026-10-05"), d("thu", 2, "2026-10-02")], total: 2 },
    );
    expect(ra.map((x) => `${x.loai}-${x.id}`)).toEqual(["chi-9", "thu-1", "chi-8"]);
  });

  it("thiếu quyền một sổ (null) thì chỉ gộp sổ còn lại", () => {
    expect(gopPhieu(null, { rows: [d("thu", 1, "2026-10-03")], total: 1 })).toHaveLength(1);
    expect(gopPhieu(null, null)).toEqual([]);
  });
});

describe("form TK-3", () => {
  it("form trống: VND, dùng cả nhận lẫn trả", () => {
    expect(formTrong()).toStrictEqual({
      bank_name: "", account_number: "", account_holder: "", bank_branch: "",
      loaiTien: "VND", tienKhac: "", use_for_receipts: true, use_for_payments: true, note: "",
    });
  });

  it("mở để sửa: loại tiền ngoài VND/USD thành Khác + mã", () => {
    expect(formTuTaiKhoan(taiKhoan({ currency: "EUR", note: "Ghi" }))).toMatchObject({ loaiTien: "khac", tienKhac: "EUR", note: "Ghi" });
    expect(formTuTaiKhoan(taiKhoan({ currency: "USD" }))).toMatchObject({ loaiTien: "USD", tienKhac: "" });
  });

  it("lỗi từng ô: bốn ô bắt buộc, mã tiền Khác 3 chữ in hoa, Dùng để ít nhất một", () => {
    const trong = { ...formTrong(), use_for_receipts: false, use_for_payments: false, loaiTien: "khac" as const, tienKhac: "E1" };
    expect(loiFormTaiKhoan(trong)).toStrictEqual({
      bank_name: "Nhập tên ngân hàng.",
      account_number: "Nhập số tài khoản.",
      account_holder: "Nhập tên chủ tài khoản.",
      bank_branch: "Nhập chi nhánh.",
      tien_khac: "Mã loại tiền gồm 3 chữ cái, ví dụ EUR.",
      dung: "Chọn ít nhất một: Nhận tiền hoặc Trả tiền.",
    });
    const du = { ...formTrong(), bank_name: "MB", account_number: "1", account_holder: "A", bank_branch: "B" };
    expect(loiFormTaiKhoan(du)).toStrictEqual({});
    expect(loiFormTaiKhoan({ ...du, loaiTien: "khac", tienKhac: "eur" })).toStrictEqual({});
  });

  it("payload thêm mới: đủ trường như bản cũ, cắt khoảng trắng, đang dùng, ghi chú rỗng thành null", () => {
    const f = {
      ...formTrong(), bank_name: "  MB ", account_number: " 933134668 ", account_holder: " Công ty ", bank_branch: " Bình Dương ",
      use_for_payments: false, note: "   ",
    };
    expect(payloadTaiKhoan(f, null)).toStrictEqual({
      account_holder: "Công ty", account_number: "933134668", bank_name: "MB", bank_branch: "Bình Dương",
      currency: "VND", is_default: false, is_active: true, use_for_receipts: true, use_for_payments: false, note: null,
    });
  });

  it("payload sửa: giữ trạng thái đang có (form không còn ô Đang hoạt động), loại tiền Khác viết hoa", () => {
    const cu = taiKhoan({ is_active: false });
    const f = { ...formTuTaiKhoan(cu), loaiTien: "khac" as const, tienKhac: "eur", note: " Ghi chú " };
    expect(payloadTaiKhoan(f, cu)).toStrictEqual({
      account_holder: "Công ty Cổ phần In Sao Việt Nhật", account_number: "933134668",
      bank_name: "Ngân hàng TMCP Quân đội (MB)", bank_branch: "Bình Dương",
      currency: "EUR", is_default: false, is_active: false, use_for_receipts: true, use_for_payments: true, note: "Ghi chú",
    });
  });
});
