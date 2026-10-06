/** Thẻ lọc + kỳ + điều kiện → tham số máy chủ của màn Phiếu thu (đặc tả PT-1, A.17, A.18). */
import { describe, expect, it } from "vitest";

import type { KyDS } from "../../../thanh-loc/ky-danh-sach";
import { LOC_TRONG, dangLoc, locLenUrl, locTuUrl, thamSoLoc, thamSoTai } from "./loc";

const KY: KyDS = { loai: "tuy", tu: "2026-10-01", den: "2026-10-05", moc: "thu" };

describe("thamSoTai — Phiếu thu", () => {
  it("kỳ đi vào tu_ngay/den_ngay/moc, sắp theo ngày thu mới nhất, không tự thêm trạng thái", () => {
    const p = thamSoTai("tat_ca", LOC_TRONG, "", KY, 3, 25);
    expect(p).toMatchObject({ tu_ngay: "2026-10-01", den_ngay: "2026-10-05", moc: "thu", page: 3, size: 25, sort: "-receipt_date" });
    expect(p.status).toBeUndefined();
    expect(p.chung_tu).toBeUndefined();
    expect(p.q).toBeUndefined();
    expect(p.nguon).toEqual([]);
  });

  it("thẻ → trạng thái: Đã thu = received; Thiếu chứng từ = received + chung_tu=thieu; Chờ thu; Đã hủy", () => {
    expect(thamSoLoc("xong", LOC_TRONG, "", KY)).toMatchObject({ status: "received" });
    expect(thamSoLoc("xong", LOC_TRONG, "", KY).chung_tu).toBeUndefined();
    expect(thamSoLoc("thieu", LOC_TRONG, "", KY)).toMatchObject({ status: "received", chung_tu: "thieu" });
    expect(thamSoLoc("cho", LOC_TRONG, "", KY)).toMatchObject({ status: "waiting_receipt" });
    expect(thamSoLoc("da_huy", LOC_TRONG, "", KY)).toMatchObject({ status: "cancelled" });
  });

  it("thẻ Thiếu chứng từ thắng điều kiện Chứng từ; thẻ khác thì điều kiện Chứng từ đi nguyên", () => {
    expect(thamSoLoc("thieu", { ...LOC_TRONG, chung_tu: "co" }, "", KY).chung_tu).toBe("thieu");
    expect(thamSoLoc("tat_ca", { ...LOC_TRONG, chung_tu: "co" }, "", KY).chung_tu).toBe("co");
  });

  it("điều kiện: khoảng tiền, hình thức, nguồn, vào tài khoản; ô tìm đi vào q", () => {
    const p = thamSoLoc(
      "tat_ca",
      { tien_tu: 1_000_000, tien_den: 9_000_000, hinh_thuc: "bank_transfer", nguon: ["sales_invoice", "other"],
        tai_khoan_id: 4, chung_tu: undefined },
      " PT-2610 ",
      KY,
    );
    expect(p).toMatchObject({
      q: "PT-2610", tien_tu: 1_000_000, tien_den: 9_000_000, hinh_thuc: "bank_transfer",
      nguon: ["sales_invoice", "other"], tai_khoan_id: 4,
    });
  });
});

describe("dangLoc", () => {
  it("chỉ kỳ thì không tính là lọc; thẻ, ô tìm hay một điều kiện thì có", () => {
    expect(dangLoc("tat_ca", LOC_TRONG, "  ")).toBe(false);
    expect(dangLoc("cho", LOC_TRONG, "")).toBe(true);
    expect(dangLoc("tat_ca", LOC_TRONG, "PT")).toBe(true);
    expect(dangLoc("tat_ca", { ...LOC_TRONG, hinh_thuc: "cash" }, "")).toBe(true);
  });
});

describe("URL (A.18)", () => {
  it("ghi rồi đọc lại ra đúng trạng thái; nguồn dùng mã ngắn đọc được", () => {
    const tt = {
      the: "thieu" as const,
      tim: "An Phát",
      loc: { tien_tu: 5_000_000, hinh_thuc: "cash" as const, nguon: ["order_deposit", "purchase_refund"],
        tai_khoan_id: 2, chung_tu: "co" as const },
    };
    const url = locLenUrl(tt);
    expect(url).toMatchObject({ the: "thieu", q: "An Phát", nguon: "coc,chi", tk: "2", tien_tu: "5000000" });
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(url)) if (v != null) p.set(k, v);
    expect(locTuUrl(p)).toEqual(tt);
  });

  it("mặc định không ghi khoá nào; rác bị bỏ từng khoá; thẻ Chờ thu đọc được", () => {
    expect(Object.values(locLenUrl({ the: "tat_ca", tim: "", loc: LOC_TRONG })).filter((v) => v != null)).toEqual([]);
    const r = locTuUrl(new URLSearchParams("the=cho&tien_tu=abc&nguon=coc,la&hinh_thuc=sec&tk=-1"));
    expect(r).toEqual({ the: "cho", tim: "", loc: { nguon: ["order_deposit"] } });
    expect(locTuUrl(new URLSearchParams("the=gc")).the).toBe("tat_ca");
    expect(locTuUrl(null)).toEqual({ the: "tat_ca", tim: "", loc: LOC_TRONG });
  });
});
