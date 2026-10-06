import { Users } from "lucide-react";
import { describe, expect, it } from "vitest";

import { boDK, daAp, docSo, khopChu, soDaAp, tomTat, tomTatDu, type DieuKien } from "./thanh-loc";

type L = { khach?: number; duyet: string[]; gia_tu?: number; gia_den?: number };

const KHACH: DieuKien<L> = {
  khoa: "khach",
  nhan: "Khách hàng",
  icon: Users,
  kieu: "mot",
  giaTri: [{ value: "3", nhan: "CÔNG TY BIBICA", so: 2 }],
  doc: (l) => (l.khach == null ? undefined : String(l.khach)),
  ghi: (l, v) => ({ ...l, khach: v == null ? undefined : Number(v) }),
};
const DUYET: DieuKien<L> = {
  khoa: "duyet",
  nhan: "Kết quả duyệt",
  icon: Users,
  kieu: "nhieu",
  giaTri: [
    { value: "cho", nhan: "Đang chờ duyệt" },
    { value: "duyet", nhan: "Đã duyệt" },
    { value: "tu_choi", nhan: "Bị từ chối" },
  ],
  doc: (l) => l.duyet,
  ghi: (l, v) => ({ ...l, duyet: v }),
};
const GIA: DieuKien<L> = {
  khoa: "gia",
  nhan: "Giá bán",
  icon: Users,
  kieu: "khoang",
  donVi: "đ",
  doc: (l) => [l.gia_tu, l.gia_den],
  ghi: (l, tu, den) => ({ ...l, gia_tu: tu, gia_den: den }),
};
const TAT_CA = [KHACH, DUYET, GIA];

describe("thanh lọc", () => {
  it("đếm điều kiện đã áp", () => {
    expect(soDaAp(TAT_CA, { duyet: [] })).toBe(0);
    expect(soDaAp(TAT_CA, { khach: 3, duyet: ["cho"], gia_den: 5 })).toBe(3);
  });

  it("tóm tắt từng kiểu", () => {
    const l: L = { khach: 3, duyet: ["cho", "duyet"], gia_tu: 5_000_000 };
    expect(tomTat(KHACH, l)).toBe("CÔNG TY BIBICA");
    expect(tomTat(DUYET, l)).toBe("Đang chờ duyệt hoặc Đã duyệt");
    expect(tomTat(GIA, l)).toBe("từ 5.000.000 đ");
    expect(tomTat(GIA, { duyet: [], gia_tu: 1_000, gia_den: 2_000 })).toBe("1.000 đến 2.000 đ");
    expect(tomTat(GIA, { duyet: [], gia_den: 2_000 })).toBe("đến 2.000 đ");
  });

  it("chọn từ ba giá trị trở lên thì ghi số, title đủ tên", () => {
    const l: L = { duyet: ["cho", "duyet", "tu_choi"] };
    expect(tomTat(DUYET, l)).toBe("3 lựa chọn");
    expect(tomTatDu(DUYET, l)).toBe("Đang chờ duyệt hoặc Đã duyệt hoặc Bị từ chối");
  });

  it("giá trị lạ (không còn trong danh sách) vẫn hiện mã chứ không rỗng", () => {
    expect(tomTat(KHACH, { khach: 99, duyet: [] })).toBe("99");
  });

  it("bỏ một điều kiện không đụng điều kiện khác", () => {
    const l: L = { khach: 3, duyet: ["cho"], gia_tu: 1, gia_den: 2 };
    expect(boDK(GIA, l)).toEqual({ khach: 3, duyet: ["cho"], gia_tu: undefined, gia_den: undefined });
    expect(daAp(DUYET, boDK(DUYET, l))).toBe(false);
    expect(daAp(KHACH, boDK(KHACH, l))).toBe(false);
  });

  it("đọc số bỏ dấu chấm, rác thì undefined", () => {
    expect(docSo("5.000.000")).toBe(5_000_000);
    expect(docSo("")).toBeUndefined();
    expect(docSo("abc")).toBeUndefined();
  });

  it("gõ không dấu vẫn khớp", () => {
    expect(khopChu("Kết quả duyệt", "ket qua")).toBe(true);
    expect(khopChu("Khách hàng", "gia")).toBe(false);
  });
});
