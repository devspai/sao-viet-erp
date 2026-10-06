import { describe, expect, it } from "vitest";

import { docLocDM, ghiLocDM, gopGiaTri, locMacDinh, ngayTao } from "./locDanhMuc";

const CFG = { softDelete: true, dieuKien: [{ key: "nhom", nhan: "Giai đoạn" }] };

describe("locDanhMuc", () => {
  it("mặc định Đang dùng không ghi lên URL; bỏ Trạng thái ghi `tat_ca`; đọc ngược khớp", () => {
    const md = locMacDinh(CFG);
    expect(md.loc).toEqual({ active: "true" });
    expect(ghiLocDM(md, CFG).active).toBeUndefined();
    const tat = { ...md, loc: { nhom: "print", active: undefined } };
    const url = ghiLocDM(tat, CFG);
    expect(url).toMatchObject({ nhom: "print", active: "tat_ca" });
    const p = new URLSearchParams({ nhom: "print", active: "tat_ca", ky: "thang" });
    expect(docLocDM(p, CFG)).toEqual({ ky: { loai: "thang", moc: "tao" }, loc: { nhom: "print", active: undefined } });
    expect(docLocDM(new URLSearchParams({ active: "false" }), CFG).loc.active).toBe("false");
  });

  it("gộp nền khai sẵn (số 0 vẫn hiện) với giá trị máy chủ đếm được; nhãn máy chủ thắng mã", () => {
    const ds = gopGiaTri([{ value: "print", label: "In" }, { value: "prepress", label: "Chế bản" }],
      [{ value: "print", so: 3 }, { value: "cu", so: 1 }, { value: "7", nhan: "Minh Long", so: 2 }],
      { cu: "Nhóm cũ" });
    expect(ds).toEqual([
      { value: "print", nhan: "In", so: 3 },
      { value: "prepress", nhan: "Chế bản", so: 0 },
      { value: "7", nhan: "Minh Long", so: 2 },
      { value: "cu", nhan: "Nhóm cũ", so: 1 },
    ]);
  });

  it("Ngày tạo theo giờ VN, dd/MM/yyyy", () => {
    expect(ngayTao("2026-09-30T17:30:00Z")).toBe("01/10/2026");
    expect(ngayTao(null)).toBe("—");
  });
});
