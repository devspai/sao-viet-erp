import { describe, expect, it } from "vitest";
import type { GiaCongNgoaiLan } from "../../api/client";
import { goiYChot, nutCuaLan, tomTat, viTriTrongDai, type BuocDai } from "./giaCong";

const b = (
  ten: string,
  loai: BuocDai["loai_buoc"],
  ncc: number | null = null,
  opts: { key?: string; phu_thuoc?: string[] } = {},
): BuocDai => ({
  key: opts.key ?? ten,
  ten,
  loai_buoc: loai,
  nha_cung_cap_id: ncc,
  phu_thuoc_step_keys: opts.phu_thuoc ?? [],
});

describe("viTriTrongDai — cùng luật gom lần của máy chủ", () => {
  const rows = [
    b("In", "may"), b("Cán màng", "thue_ngoai", 7), b("Ép kim", "thue_ngoai", 7),
    b("Bế", "thue_ngoai", 9), b("Dán", "to"),
  ];
  it("bước không thuê ngoài thì null", () => {
    expect(viTriTrongDai(rows, 0)).toBeNull();
  });
  it("đầu dải: ô đơn giá nằm ở bước sau", () => {
    expect(viTriTrongDai(rows, 1)).toEqual({ truoc: null, sau: "Ép kim", laCuoi: false });
  });
  it("cuối dải cùng nhà gia công", () => {
    expect(viTriTrongDai(rows, 2)).toEqual({ truoc: "Cán màng", sau: null, laCuoi: true });
  });
  it("khác nhà gia công là lần khác", () => {
    expect(viTriTrongDai(rows, 3)).toEqual({ truoc: null, sau: null, laCuoi: true });
  });
  it("chưa chọn nhà gia công thì không gom", () => {
    const r2 = [b("A", "thue_ngoai"), b("B", "thue_ngoai")];
    expect(viTriTrongDai(r2, 0)).toEqual({ truoc: null, sau: null, laCuoi: true });
  });
});

describe("viTriTrongDai — liền nhau đi theo CẠNH DAG, không phải thứ tự mảng", () => {
  it("hai nhánh song song cùng NCC đứng cạnh nhau trong mảng ⇒ KHÔNG cùng lần (không có cạnh nối)", () => {
    // "In" toả ra hai nhánh song song "Cán màng" và "Ép kim", cả hai cùng nhà gia công 7 nhưng
    // KHÔNG có cạnh nối trực tiếp giữa chúng — chỉ tình cờ đứng cạnh nhau trong `rows`.
    const rows = [
      b("In", "may", null, { key: "p" }),
      b("Cán màng", "thue_ngoai", 7, { key: "a", phu_thuoc: ["p"] }),
      b("Ép kim", "thue_ngoai", 7, { key: "c", phu_thuoc: ["p"] }),
    ];
    expect(viTriTrongDai(rows, 1)).toEqual({ truoc: null, sau: null, laCuoi: true });
    expect(viTriTrongDai(rows, 2)).toEqual({ truoc: null, sau: null, laCuoi: true });
  });

  it("routing không khai cạnh nào ⇒ lùi về so THỨ TỰ MẢNG (routing tuyến tính cũ)", () => {
    const rows = [
      b("Cán màng", "thue_ngoai", 7, { key: "a" }),
      b("Ép kim", "thue_ngoai", 7, { key: "c" }),
    ];
    expect(viTriTrongDai(rows, 0)).toEqual({ truoc: null, sau: "Ép kim", laCuoi: false });
    expect(viTriTrongDai(rows, 1)).toEqual({ truoc: "Cán màng", sau: null, laCuoi: true });
  });
});

const lan = (p: Partial<GiaCongNgoaiLan>): GiaCongNgoaiLan => ({
  id: 1, lsx_id: 9, lsx_ma: "LSX-001", kieu: "mot_phan", trang_thai: "cho_mang_di",
  nha_cung_cap_id: 7, nha_cung_cap_ten: "Cán màng Minh Long", ten_viec: "Cán màng",
  don_vi: "to", don_gia: 150, thanh_tien: null, sl_dat: null, xuong_cap_giay: false,
  don_vi_gui: "to", sl_cho_mang_di: 0, co_buoc_truoc: true, mang_di_boi_ten: null,
  mang_di_luc: null, sl_gui: null, chot_boi_ten: null, chot_luc: null, sl_cuoi: null,
  noi_ve: null, noi_ve_hop_le: ["xuong"], chang_sau: [{ id: 31, ten: "Bế" }],
  huy_boi_ten: null, huy_luc: null, ly_do_huy: null, phieu_chi: null, xuat_giay: null,
  lich_su: [], version: 1, ...p,
});

describe("nutCuaLan", () => {
  it("chờ mang đi mà bước trước chưa giao thì chưa bấm được", () => {
    expect(nutCuaLan(lan({})).mangDi).toBe(false);
  });
  it("có hàng chờ thì bấm Đã mang đi", () => {
    expect(nutCuaLan(lan({ sl_cho_mang_di: 1660 })).mangDi).toBe(true);
  });
  it("dải đầu lệnh (không bước trước) thì gõ số mà mang đi", () => {
    expect(nutCuaLan(lan({ co_buoc_truoc: false })).mangDi).toBe(true);
  });
  it("đang ở ngoài thì chốt được, còn hàng mới về thì mang thêm được", () => {
    const n = nutCuaLan(lan({ trang_thai: "dang_o_ngoai", sl_gui: 1660, sl_cho_mang_di: 40 }));
    expect([n.chot, n.mangDi]).toEqual([true, true]);
  });
  it("đã xong có phiếu chi thì KHÔNG mở lại", () => {
    expect(nutCuaLan(lan({ trang_thai: "da_xong", phieu_chi: { id: 3, code: "PC-1" } })).moLai).toBe(false);
    expect(nutCuaLan(lan({ trang_thai: "da_xong" })).moLai).toBe(true);
  });
  it("trọn gói xưởng cấp giấy, chưa đề nghị ⇒ nút xuất giấy + huỷ", () => {
    const n = nutCuaLan(lan({ kieu: "tron_goi", trang_thai: "dang_gia_cong", xuong_cap_giay: true }));
    expect([n.xuatGiay, n.huyTronGoi, n.chot, n.mangDi]).toEqual([true, true, true, false]);
  });
});

describe("goiYChot", () => {
  it("ưu tiên số máy chủ đã quy tờ → con", () => {
    expect(goiYChot(lan({ trang_thai: "dang_o_ngoai", sl_gui: 1660, sl_goi_y_chot: 3320 })).sl).toBe("3320");
  });
  it("điền sẵn số đã gửi, nơi về đầu tiên, bước sau duy nhất", () => {
    expect(goiYChot(lan({ trang_thai: "dang_o_ngoai", sl_gui: 1660 }))).toEqual({
      sl: "1660", noiVe: "xuong", dich: 31,
    });
  });
  it("trọn gói lấy số đặt", () => {
    expect(goiYChot(lan({ kieu: "tron_goi", sl_dat: 20000, noi_ve_hop_le: ["kho", "khach"], chang_sau: [] })))
      .toEqual({ sl: "20000", noiVe: "kho", dich: null });
  });
});

describe("tomTat", () => {
  it("một dòng đủ người, số, nơi về, tiền, phiếu chi", () => {
    const s = tomTat(
      lan({ trang_thai: "da_xong", mang_di_boi_ten: "Nguyễn A", sl_gui: 1660, chot_boi_ten: "Nguyễn A",
            sl_cuoi: 1650, noi_ve: "xuong", thanh_tien: 247500, phieu_chi: { id: 3, code: "PC-1" } }),
      () => "tờ",
    );
    expect(s).toBe("Nguyễn A mang đi 1.660 tờ · Nguyễn A chốt 1.650 tờ — về xưởng làm tiếp · 247.500đ · Phiếu chi PC-1");
  });
  it("không có quyền xem tiền thì không có đoạn tiền", () => {
    expect(tomTat(lan({ trang_thai: "da_xong", chot_boi_ten: "B", sl_cuoi: 5, noi_ve: "kho" }), () => "cái"))
      .toBe("B chốt 5 cái — nhập kho thành phẩm");
  });
});
