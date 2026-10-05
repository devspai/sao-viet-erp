import { describe, expect, it } from "vitest";

import { vtPayloadLines, vtPayloadNhapLai } from "./ThsxExecPanels";

/** Dòng kế hoạch mẫu — Ivory 350, kế hoạch 554 tờ. */
function dong(over: Partial<Parameters<typeof vtPayloadLines>[0][number]> = {}) {
  return {
    key: "vat_tu:7",
    hang_loai: "vat_tu",
    hang_id: 7,
    ten: "Ivory 350 79×109",
    dang_giay: null,
    kho_rong: 0,
    kho_dai: 0,
    dvt: "to",
    dvtKeHoach: "to",
    sl_ke_hoach: 554,
    sl_yeu_cau: 554,
    slText: "554",
    ly_do_chenh_lech: "",
    tuKeHoach: true,
    ...over,
  };
}

describe("vtPayloadLines — lý do chỉ đi theo khi ô Lý do đang mở", () => {
  it("dòng lệch: giữ nguyên lý do tổ vừa gõ", () => {
    const [ln] = vtPayloadLines([dong({ sl_yeu_cau: 600, slText: "600", ly_do_chenh_lech: "Bù hao chỉnh màu" })], "lan_dau");
    expect(ln.sl_yeu_cau).toBe(600);
    expect(ln.ly_do_chenh_lech).toBe("Bù hao chỉnh màu");
  });

  it("kéo về ĐÚNG kế hoạch: lý do cũ KHÔNG đi theo", () => {
    // Ô Lý do đã đóng (554 = 554) nhưng state vẫn giữ câu gõ lúc còn lệch. Gửi lên thì bảng đối
    // chiếu ghi "không lệch" mà vẫn kèm lý do — mâu thuẫn ngay trên một dòng.
    const [ln] = vtPayloadLines([dong({ ly_do_chenh_lech: "Đổi kế hoạch in, tổ chưa cần cấp giấy" })], "lan_dau");
    expect(ln.sl_yeu_cau).toBe(554);
    expect(ln.ly_do_chenh_lech).toBeNull();
  });

  it("về 0 vẫn là lệch: lý do đi theo", () => {
    const [ln] = vtPayloadLines([dong({ sl_yeu_cau: 0, slText: "0", ly_do_chenh_lech: "Tổ chưa cần" })], "lan_dau");
    expect(ln.sl_yeu_cau).toBe(0);
    expect(ln.ly_do_chenh_lech).toBe("Tổ chưa cần");
  });

  it("lần BỔ SUNG: lý do luôn bắt buộc nên luôn đi theo", () => {
    const ra = vtPayloadLines([dong({ sl_yeu_cau: 30, slText: "30", ly_do_chenh_lech: "Rách khi bế" })], "bo_sung");
    expect(ra).toHaveLength(1);
    expect(ra[0].ly_do_chenh_lech).toBe("Rách khi bế");
  });

  it("lý do toàn khoảng trắng → null, không phải chuỗi rỗng", () => {
    const [ln] = vtPayloadLines([dong({ sl_yeu_cau: 600, slText: "600", ly_do_chenh_lech: "   " })], "lan_dau");
    expect(ln.ly_do_chenh_lech).toBeNull();
  });
});

describe("vtPayloadLines — giấy mang dạng + khổ", () => {
  it("dòng giấy gửi dạng + khổ đã chuẩn hoá (ngắn × dài)", () => {
    const [ln] = vtPayloadLines([dong({
      key: "giay:3", hang_loai: "giay", hang_id: 3, dang_giay: "to", kho_rong: 905, kho_dai: 780,
      dvt: "to_nguyen", dvtKeHoach: "to_nguyen", sl_ke_hoach: 5000, sl_yeu_cau: 5000,
    })], "lan_dau");
    expect([ln.dang_giay, ln.kho_rong, ln.kho_dai]).toEqual(["to", 780, 905]);
  });

  it("giấy cuộn chỉ gửi khổ rộng", () => {
    const [ln] = vtPayloadLines([dong({
      key: "moi-1", hang_loai: "giay", hang_id: 3, dang_giay: "cuon", kho_rong: 1000, kho_dai: 0,
      dvt: "kg", dvtKeHoach: "kg", sl_ke_hoach: 0, sl_yeu_cau: 300, tuKeHoach: false,
      ly_do_chenh_lech: "Cắt tờ từ cuộn",
    })], "lan_dau");
    expect([ln.dang_giay, ln.kho_rong, ln.kho_dai]).toEqual(["cuon", 1000, 0]);
  });

  it("vật tư khác không mang dạng/khổ", () => {
    const [ln] = vtPayloadLines([dong()], "lan_dau");
    expect("dang_giay" in ln).toBe(false);
  });
});

describe("vtPayloadNhapLai — yêu cầu nhập lại vật tư thừa", () => {
  it("chỉ dòng dương, đổi sl_yeu_cau → so_luong, không mang lý do", () => {
    const ds = vtPayloadNhapLai([
      dong({ tuKeHoach: false, sl_yeu_cau: 2, slText: "2", dvt: "kg" }),
      dong({ key: "vat_tu:8", hang_id: 8, tuKeHoach: false, sl_yeu_cau: 0, slText: "0", dvt: "kg" }),
    ]);
    expect(ds).toEqual([{ hang_loai: "vat_tu", hang_id: 7, dvt: "kg", so_luong: 2 }]);
  });

  it("giấy mang dạng + khổ (ngắn × dài)", () => {
    const [ln] = vtPayloadNhapLai([dong({
      hang_loai: "giay", hang_id: 3, tuKeHoach: false, dang_giay: "to",
      kho_rong: 1090, kho_dai: 790, dvt: "to_nguyen", sl_yeu_cau: 70, slText: "70",
    })]);
    expect(ln).toMatchObject({ hang_loai: "giay", so_luong: 70, dang_giay: "to", kho_rong: 790, kho_dai: 1090 });
  });
});
