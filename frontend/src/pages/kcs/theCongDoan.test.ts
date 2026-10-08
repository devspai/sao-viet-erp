import { describe, expect, it } from "vitest";

import type { SxKcsChiTietTieuChi } from "../../api/client";
import {
  type AnhCho, type TrangThaiThe, datHetConLai, gomThe, ketQuaChecklist, lyDoKhoa, moTaThe, moTaTuDien,
} from "./theCongDoan";

const tc = (cv: number | null, ten_cong_doan: string, thu_tu: number, ten: string, phu?: string): SxKcsChiTietTieuChi => ({
  cong_viec_id: cv, ten_cong_doan, thu_tu, ten,
  ...(phu ? { la_lenh_phu: true, lsx_ma: "LSX-0412", ten_lenh: phu } : {}),
});

const DS = [
  tc(7, "In offset", 1, "Màu đúng mẫu", "Ruột"),
  tc(7, "In offset", 2, "Không lem mực", "Ruột"),
  tc(11, "Bế cấn", 1, "Bế đúng đường"),
  tc(11, "Bế cấn", 2, "Mép không xơ"),
  tc(null, "Dán máy", 1, "Dán chắc"),
];
const THE = gomThe(DS, 12);
const anh = { id: 1, file: new File(["x"], "a.jpg"), url: "blob:a", goc: 1 } as AnhCho;
const loi = (p: Partial<Extract<TrangThaiThe, { loai: "loi" }>> = {}): TrangThaiThe =>
  ({ loai: "loi", hong: new Set([1]), so: "30", moTa: "", suaTay: false, anh: [anh], ...p });

describe("gomThe", () => {
  it("gom theo công việc nguồn, giữ thứ tự, mục cũ thiếu cong_viec_id về công việc đang kiểm", () => {
    expect(THE.map((t) => [t.cvId, t.ten, t.tieuChi.length])).toEqual([[7, "In offset", 2], [11, "Bế cấn", 2], [12, "Dán máy", 1]]);
    expect(THE[0].phu).toBe("Lệnh phụ Ruột LSX-0412");
    expect(THE[1].phu).toBeNull();
  });
});

describe("moTaTuDien / moTaThe", () => {
  it("mỗi mục hỏng một dòng; đã sửa tay thì thôi tự điền", () => {
    expect(moTaTuDien(THE[1], new Set([2, 1]))).toBe("Bế đúng đường\nMép không xơ");
    const s = loi({ hong: new Set([1, 2]) }) as Extract<TrangThaiThe, { loai: "loi" }>;
    expect(moTaThe(THE[1], s)).toBe("Bế đúng đường\nMép không xơ");
    expect(moTaThe(THE[1], { ...s, suaTay: true, moTa: "Xơ mép góc trái" })).toBe("Xơ mép góc trái");
  });
});

describe("datHetConLai", () => {
  it("chỉ thẻ chưa xét sang Đạt, không đè thẻ đã chọn Có lỗi", () => {
    const tt = datHetConLai(THE, new Map([[11, loi()]]));
    expect(tt.get(7)).toEqual({ loai: "dat" });
    expect(tt.get(11)?.loai).toBe("loi");
    expect(tt.get(12)).toEqual({ loai: "dat" });
  });
});

describe("lyDoKhoa", () => {
  const ctx = { chuaKiem: 1000, tongLoi: 30, soAnh: 1 };
  it("đúng thứ tự: chưa xét → tick → số → ảnh → vượt chưa kiểm → quá ảnh", () => {
    expect(lyDoKhoa(THE, new Map([[7, { loai: "dat" }]]), ctx)).toBe("Còn 2 công đoạn chưa xét");
    const nen = (s: TrangThaiThe) => new Map<number, TrangThaiThe>([[7, { loai: "dat" }], [11, s], [12, { loai: "dat" }]]);
    expect(lyDoKhoa(THE, nen(loi({ hong: new Set(), so: "", anh: [] })), ctx)).toBe("Tick mục hỏng của bế cấn");
    expect(lyDoKhoa(THE, nen(loi({ so: "", anh: [] })), ctx)).toBe("Gõ số lỗi cho bế cấn");
    expect(lyDoKhoa(THE, nen(loi({ anh: [] })), ctx)).toBe("Chụp ít nhất một ảnh lỗi bế cấn");
    expect(lyDoKhoa(THE, nen(loi()), { ...ctx, tongLoi: 1200 })).toBe("Tổng lỗi vượt phần chưa kiểm (1.000)");
    expect(lyDoKhoa(THE, nen(loi()), { ...ctx, soAnh: 11 })).toBe("Tối đa 10 ảnh mỗi lần kiểm");
    expect(lyDoKhoa(THE, nen(loi()), ctx)).toBeNull();
  });
});

describe("ketQuaChecklist", () => {
  it("dat từng mục, mang cong_viec_id của thẻ, ghi chú null", () => {
    const kq = ketQuaChecklist(THE, new Map<number, TrangThaiThe>([[7, { loai: "dat" }], [11, loi({ hong: new Set([2]) })], [12, { loai: "dat" }]]));
    expect(kq).toEqual([
      { cong_viec_id: 7, thu_tu: 1, dat: true, ghi_chu: null },
      { cong_viec_id: 7, thu_tu: 2, dat: true, ghi_chu: null },
      { cong_viec_id: 11, thu_tu: 1, dat: true, ghi_chu: null },
      { cong_viec_id: 11, thu_tu: 2, dat: false, ghi_chu: null },
      { cong_viec_id: 12, thu_tu: 1, dat: true, ghi_chu: null },
    ]);
  });
});
