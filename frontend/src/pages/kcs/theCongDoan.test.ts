import { describe, expect, it } from "vitest";

import type { SxKcsChiTietTieuChi } from "../../api/client";
import {
  type AnhCho, type DongKiem, KHAC, gomThe, ketQuaChecklist, khoaTc, lyDoKiem, nhomTheoLenh,
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
const dong = (khoa: string, ten: string, p: Partial<DongKiem> = {}) =>
  ({ khoa, ten, d: { cvId: 11, so: "30", ghi: "", anh: [anh], ...p } });

describe("gomThe / nhomTheoLenh", () => {
  it("gom theo công việc nguồn, giữ thứ tự; mục cũ thiếu cong_viec_id về công việc đang kiểm", () => {
    expect(THE.map((t) => [t.cvId, t.ten, t.tieuChi.length])).toEqual([[7, "In offset", 2], [11, "Bế cấn", 2], [12, "Dán máy", 1]]);
  });
  it("lệnh phụ thành một nhóm riêng, tên lệnh nói một lần", () => {
    expect(nhomTheoLenh(THE).map((n) => [n.laPhu, n.tenLenh, n.lsxMa, n.cd.map((c) => c.cvId)])).toEqual([
      [true, "Ruột", "LSX-0412", [7]],
      [false, null, null, [11, 12]],
    ]);
  });
});

describe("lyDoKiem", () => {
  const ctx = { chuaKiem: 1000, dv: "hộp" };
  it("không tick gì là lưu được (tất cả đạt); chưa có gì để kiểm thì chặn", () => {
    expect(lyDoKiem([], ctx)).toBeNull();
    expect(lyDoKiem([], { ...ctx, chuaKiem: 0 })).toBe("Tổ chưa ghi thêm sản lượng từ lần kiểm trước");
  });
  it("đúng thứ tự: số → ghi chú Lỗi khác → ảnh → vượt chưa kiểm → quá ảnh", () => {
    expect(lyDoKiem([dong("11:1", "Bế đúng đường", { so: "" })], ctx)).toBe("Nhập số lỗi cho Bế đúng đường");
    expect(lyDoKiem([dong(KHAC, "Lỗi khác")], ctx)).toBe("Ghi chú Lỗi khác là lỗi gì");
    expect(lyDoKiem([dong("11:1", "Bế đúng đường", { anh: [] })], ctx)).toBe("Chụp ít nhất một ảnh cho Bế đúng đường");
    expect(lyDoKiem([dong("11:1", "Bế đúng đường", { so: "1200" })], ctx)).toBe("Tổng lỗi vượt số chưa kiểm (1.000 hộp)");
    const nhieu = Array.from({ length: 11 }, (_, i) => ({ ...anh, id: i }));
    expect(lyDoKiem([dong("11:1", "Bế đúng đường", { anh: nhieu })], ctx)).toBe("Tối đa 10 ảnh mỗi lần kiểm, bỏ bớt 1 ảnh");
    expect(lyDoKiem([dong("11:1", "Bế đúng đường"), dong(KHAC, "Lỗi khác", { ghi: "Rách" })], ctx)).toBeNull();
  });
});

describe("ketQuaChecklist", () => {
  it("tiêu chí đang tick là không đạt, còn lại đạt; mang cong_viec_id của công đoạn", () => {
    expect(ketQuaChecklist(THE, new Set([khoaTc(11, 2), KHAC]))).toEqual([
      { cong_viec_id: 7, thu_tu: 1, dat: true, ghi_chu: null },
      { cong_viec_id: 7, thu_tu: 2, dat: true, ghi_chu: null },
      { cong_viec_id: 11, thu_tu: 1, dat: true, ghi_chu: null },
      { cong_viec_id: 11, thu_tu: 2, dat: false, ghi_chu: null },
      { cong_viec_id: 12, thu_tu: 1, dat: true, ghi_chu: null },
    ]);
  });
});
