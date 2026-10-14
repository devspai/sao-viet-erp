/** Thẻ lọc + kỳ + điều kiện → tham số máy chủ của màn Phiếu chi. */
import { describe, expect, it } from "vitest";

import type { KyDS } from "../../../thanh-loc/ky-danh-sach";
import { dieuKienPhieu } from "../../shared/locPhieu";
import { CAU_HINH_LOC_PC, LOC_TRONG, dangLoc, locLenUrl, locTuUrl, soDieuKien, thamSoLoc, thamSoTai } from "./loc";

const KY: KyDS = { loai: "tuy", tu: "2026-10-01", den: "2026-10-05", moc: "tao" };

describe("thamSoTai", () => {
  it("kỳ đi vào tu_ngay/den_ngay/moc, sắp theo ngày chi mới nhất", () => {
    const p = thamSoTai("tat_ca", LOC_TRONG, "", KY, 2, 25);
    expect(p).toMatchObject({ tu_ngay: "2026-10-01", den_ngay: "2026-10-05", moc: "tao", page: 2, size: 25, sort: "-voucher_date" });
    expect(p.status).toBeUndefined();
    expect(p.chung_tu).toBeUndefined();
    expect(p.q).toBeUndefined();
    expect(p.muc).toEqual([]);
  });

  it("kỳ Tất cả thì không gửi ngày lẫn mốc", () => {
    const p = thamSoLoc("tat_ca", LOC_TRONG, "", { loai: "tat_ca", moc: "chi" });
    expect(p.tu_ngay).toBeUndefined();
    expect(p.den_ngay).toBeUndefined();
    expect(p.moc).toBeUndefined();
  });

  it("thẻ Đã chi → status=paid; Đã hủy → status=cancelled", () => {
    expect(thamSoLoc("xong", LOC_TRONG, "", KY).status).toBe("paid");
    expect(thamSoLoc("da_huy", LOC_TRONG, "", KY).status).toBe("cancelled");
    expect(thamSoLoc("gc", LOC_TRONG, "", KY).status).toBeUndefined();
  });

  it("thẻ Thiếu chứng từ gửi CẢ status=paid lẫn chung_tu=thieu (tổng khớp số trên thẻ)", () => {
    const p = thamSoLoc("thieu", { ...LOC_TRONG, chung_tu: "co" }, "", KY);
    expect(p.status).toBe("paid");
    expect(p.chung_tu).toBe("thieu");
  });

  it("thẻ khác thẻ Thiếu thì Chứng từ lấy từ điều kiện", () => {
    expect(thamSoLoc("tat_ca", { ...LOC_TRONG, chung_tu: "co" }, "", KY).chung_tu).toBe("co");
  });

  it("điều kiện đi đủ khoá; ô tìm đi vào q", () => {
    const p = thamSoLoc("tat_ca", {
      tien_tu: 5_000_000, tien_den: 9_000_000, hinh_thuc: "bank_transfer", muc: [4, 0],
      tai_khoan_id: 3, chung_tu: "thieu",
    }, " UNC-2610 ", KY);
    expect(p).toMatchObject({
      q: "UNC-2610", tien_tu: 5_000_000, tien_den: 9_000_000, hinh_thuc: "bank_transfer", tai_khoan_id: 3, chung_tu: "thieu",
    });
    expect(p.muc).toEqual([4, 0]);
  });
});

describe("mục, đếm điều kiện và điều kiện trên thanh lọc", () => {
  it("điều kiện Mục chi: Chưa phân loại (0) đứng đầu, rồi các mục; ghi ra số", () => {
    const dk = dieuKienPhieu(CAU_HINH_LOC_PC, null, [{ id: 4, ten: "Tiền điện" }]).find((d) => d.khoa === "muc");
    expect(dk?.nhan).toBe("Mục chi");
    expect(dk?.kieu === "nhieu" && dk.giaTri).toEqual([
      { value: "0", nhan: "Chưa phân loại" },
      { value: "4", nhan: "Tiền điện" },
    ]);
    if (dk?.kieu === "nhieu") expect(dk.ghi(LOC_TRONG, ["4", "0"]).muc).toEqual([4, 0]);
  });

  it("đếm mỗi điều kiện một lần (khoảng tiền là một)", () => {
    const loc = { ...LOC_TRONG, tien_tu: 1, tien_den: 2, muc: [3], hinh_thuc: "cash" as const };
    expect(soDieuKien(loc)).toBe(3);
  });

  it("không có quyền xem tài khoản thì không có điều kiện tài khoản", () => {
    expect(dieuKienPhieu(CAU_HINH_LOC_PC, null).map((d) => d.khoa)).toEqual(["tien", "hinh_thuc", "muc", "chung_tu"]);
    const ds = dieuKienPhieu(CAU_HINH_LOC_PC, [{ id: 3, bank_name: "VCB", account_number: "0011" } as never]);
    const tk = ds.find((d) => d.khoa === "tai_khoan");
    expect(tk?.kieu === "mot" && tk.giaTri).toEqual([{ value: "3", nhan: "VCB 0011" }]);
    if (tk?.kieu === "mot") expect(tk.ghi(LOC_TRONG, "3").tai_khoan_id).toBe(3);
  });

  it("dangLoc: chỉ kỳ thì không tính là lọc", () => {
    expect(dangLoc("tat_ca", LOC_TRONG, "")).toBe(false);
    expect(dangLoc("xong", LOC_TRONG, "")).toBe(true);
    expect(dangLoc("tat_ca", LOC_TRONG, "abc")).toBe(true);
    expect(dangLoc("tat_ca", { ...LOC_TRONG, chung_tu: "co" }, "")).toBe(true);
  });
});

describe("lọc lên URL (A.18)", () => {
  it("ghi rồi đọc lại đủ: thẻ, ô tìm, mọi điều kiện; mục ghi id nối phẩy", () => {
    const tt = {
      the: "thieu" as const,
      tim: "UNC-26",
      loc: { tien_tu: 5_000_000, tien_den: 9_000_000, hinh_thuc: "bank_transfer" as const,
        muc: [4, 0], tai_khoan_id: 3, chung_tu: "co" as const },
    };
    const g = locLenUrl(tt);
    expect(g).toMatchObject({ the: "thieu", q: "UNC-26", tien_tu: "5000000", muc: "4,0", tk: "3" });
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(g)) if (v != null) p.set(k, v);
    expect(locTuUrl(p)).toEqual(tt);
  });

  it("mặc định thì không ghi khoá nào; URL rỗng hoặc rác thì về mặc định", () => {
    expect(Object.values(locLenUrl({ the: "tat_ca", tim: "", loc: LOC_TRONG })).filter((v) => v != null)).toEqual([]);
    expect(locTuUrl(null)).toEqual({ the: "tat_ca", tim: "", loc: LOC_TRONG });
    // Mục: id âm là mục cố định (Trả nhà cung cấp…) nên hợp lệ; chữ và số lẻ thì bỏ.
    const rac = new URLSearchParams("the=xyz&tien_tu=abc&hinh_thuc=sec&muc=4,zz,-1,1.5&chung_tu=no&tk=-1");
    expect(locTuUrl(rac)).toEqual({ the: "tat_ca", tim: "", loc: { muc: [4, -1] } });
  });
});
