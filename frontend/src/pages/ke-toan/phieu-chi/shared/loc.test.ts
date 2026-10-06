/** Thẻ lọc + kỳ + bộ lọc nâng cao → tham số máy chủ của màn Phiếu chi. */
import { describe, expect, it } from "vitest";

import { LOC_TRONG, boDieuKien, dangLoc, locLenUrl, locTuUrl, nguonGui, soDieuKien, thamSoLoc, thamSoTai } from "./loc";

const KY = { tu: "2026-10-01", den: "2026-10-05" };

describe("thamSoTai", () => {
  it("kỳ đi vào tu_ngay/den_ngay, sắp theo ngày chi mới nhất", () => {
    const p = thamSoTai("tat_ca", LOC_TRONG, "", KY, 2, 25);
    expect(p).toMatchObject({ tu_ngay: "2026-10-01", den_ngay: "2026-10-05", page: 2, size: 25, sort: "-voucher_date" });
    expect(p.status).toBeUndefined();
    expect(p.chung_tu).toBeUndefined();
    expect(p.q).toBeUndefined();
    expect(p.nguon).toEqual([]);
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

  it("thẻ khác thẻ Thiếu thì Chứng từ lấy từ bộ lọc nâng cao", () => {
    expect(thamSoLoc("tat_ca", { ...LOC_TRONG, chung_tu: "co" }, "", KY).chung_tu).toBe("co");
  });

  it("bộ lọc nâng cao đi đủ khoá; Người nhận đi vào `nhan`, không chiếm `q`", () => {
    const p = thamSoLoc("tat_ca", {
      tien_tu: 5_000_000, tien_den: 9_000_000, hinh_thuc: "bank_transfer", nguon: ["purchase_request", "khac"],
      tai_khoan_id: 3, ten_nhan: " Bình Minh ", chung_tu: "thieu",
    }, "  ", KY);
    expect(p.q).toBeUndefined();
    expect(p).toMatchObject({
      nhan: "Bình Minh", tien_tu: 5_000_000, tien_den: 9_000_000, hinh_thuc: "bank_transfer", tai_khoan_id: 3, chung_tu: "thieu",
    });
    expect(p.nguon).toEqual(["purchase_request", "internal_expense", "customer_refund", "other"]);
  });

  it("ô tìm và Người nhận cùng sống: q là ô tìm, nhan là Người nhận", () => {
    const p = thamSoLoc("tat_ca", { ...LOC_TRONG, ten_nhan: "Bình Minh" }, "UNC", KY);
    expect(p.q).toBe("UNC");
    expect(p.nhan).toBe("Bình Minh");
  });

  it("ô tìm có chữ thì q là ô tìm", () => {
    expect(thamSoLoc("tat_ca", LOC_TRONG, " UNC-2610 ", KY).q).toBe("UNC-2610");
  });
});

describe("nguồn và đếm điều kiện", () => {
  it('"Khác" gửi cả internal_expense lẫn other', () => {
    const g = nguonGui(["khac"]);
    expect(g).toContain("internal_expense");
    expect(g).toContain("other");
  });

  it("đếm mỗi điều kiện một lần (khoảng tiền là một), bỏ từng cái theo khoá chip", () => {
    const loc = { ...LOC_TRONG, tien_tu: 1, tien_den: 2, nguon: ["khac"], hinh_thuc: "cash" as const };
    expect(soDieuKien(loc)).toBe(3);
    expect(soDieuKien(boDieuKien(loc, "tien"))).toBe(2);
    expect(boDieuKien(loc, "nguon").nguon).toEqual([]);
    expect(boDieuKien(loc, "hinh_thuc").hinh_thuc).toBeUndefined();
  });

  it("dangLoc: chỉ kỳ thì không tính là lọc", () => {
    expect(dangLoc("tat_ca", LOC_TRONG, "")).toBe(false);
    expect(dangLoc("xong", LOC_TRONG, "")).toBe(true);
    expect(dangLoc("tat_ca", LOC_TRONG, "abc")).toBe(true);
    expect(dangLoc("tat_ca", { ...LOC_TRONG, chung_tu: "co" }, "")).toBe(true);
  });
});

describe("lọc lên URL (A.18)", () => {
  it("ghi rồi đọc lại đủ: thẻ, ô tìm, mọi điều kiện; nguồn dùng mã ngắn po,gc,tu,khac", () => {
    const tt = {
      the: "thieu" as const,
      tim: "UNC-26",
      loc: { tien_tu: 5_000_000, tien_den: 9_000_000, hinh_thuc: "bank_transfer" as const,
        nguon: ["purchase_request", "khac"], tai_khoan_id: 3, ten_nhan: "Bình Minh", chung_tu: "co" as const },
    };
    const g = locLenUrl(tt);
    expect(g).toMatchObject({ the: "thieu", q: "UNC-26", tien_tu: "5000000", nguon: "po,khac", tk: "3", nhan: "Bình Minh" });
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(g)) if (v != null) p.set(k, v);
    expect(locTuUrl(p)).toEqual(tt);
  });

  it("mặc định thì không ghi khoá nào; URL rỗng hoặc rác thì về mặc định", () => {
    expect(Object.values(locLenUrl({ the: "tat_ca", tim: "", loc: LOC_TRONG })).filter((v) => v != null)).toEqual([]);
    expect(locTuUrl(null)).toEqual({ the: "tat_ca", tim: "", loc: LOC_TRONG });
    const rac = new URLSearchParams("the=xyz&tien_tu=abc&hinh_thuc=sec&nguon=po,zz&chung_tu=no&tk=-1");
    expect(locTuUrl(rac)).toEqual({ the: "tat_ca", tim: "", loc: { nguon: ["purchase_request"] } });
  });
});
