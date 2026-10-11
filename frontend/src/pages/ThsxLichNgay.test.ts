/** Lịch bàn tổ: lưới hai làn (kế hoạch trên, thực tế dưới) dính theo NGUYÊN NGÀY + tổng giờ chạy
 *  trong khoảng của dòng tóm tắt. */
import { describe, expect, it } from "vitest";

import type { SxWorkItem } from "../api/client";
import { chuKeHoach, chuThucTe, coThanh, dayThucTe, oNgay, phutTrongCuaSo } from "./ThsxLichNgay";
import { moc } from "./xlShared";

function viec(p: Partial<SxWorkItem>): SxWorkItem {
  return { trang_thai: "released", thuc_te: [], chay_phut: null, ...p } as SxWorkItem;
}

const TU = "2026-09-14"; // thứ Hai
const luc = (iso: string) => moc(iso) as number;

describe("oNgay — ô ngày mà quãng kế hoạch chạm", () => {
  it("việc 4 phút trong một ngày vẫn chiếm trọn ô ngày đó", () => {
    expect(oNgay("2026-09-15T08:17:00", "2026-09-15T08:21:00", TU, 7))
      .toEqual({ dau: 1, cuoi: 1, tranTrai: false, tranPhai: false });
  });

  it("mốc kết thúc đúng 00:00 KHÔNG chạm sang ngày sau", () => {
    expect(oNgay("2026-09-15T20:00", "2026-09-16T00:00", TU, 7)).toMatchObject({ dau: 1, cuoi: 1 });
    // Việc 0 phút lúc nửa đêm: không được ra ô cuối nằm trước ô đầu.
    expect(oNgay("2026-09-16T00:00", "2026-09-16T00:00", TU, 7)).toMatchObject({ dau: 2, cuoi: 2 });
  });

  it("vắt qua mép cửa sổ thì kẹp lại và báo tràn", () => {
    expect(oNgay("2026-09-12T08:00", "2026-09-15T10:00", TU, 7))
      .toEqual({ dau: 0, cuoi: 1, tranTrai: true, tranPhai: false });
    expect(oNgay("2026-09-19T08:00", "2026-09-23T10:00", TU, 7))
      .toEqual({ dau: 5, cuoi: 6, tranTrai: false, tranPhai: true });
  });

  it("nằm hẳn ngoài cửa sổ hoặc thiếu mốc ⇒ null", () => {
    expect(oNgay("2026-09-01T08:00", "2026-09-02T08:00", TU, 7)).toBeNull();
    expect(oNgay(null, null, TU, 7)).toBeNull();
  });
});

describe("dayThucTe — dải ngày có phiên chạy thật", () => {
  it("gộp các ngày liền nhau, tách ngày nghỉ giữa chừng; phiên mở kéo tới bây giờ", () => {
    const r = dayThucTe([
      { bat_dau: "2026-09-14T08:00", ket_thuc: "2026-09-14T10:00" },
      { bat_dau: "2026-09-15T08:00", ket_thuc: "2026-09-15T09:00" },
      { bat_dau: "2026-09-17T08:00", ket_thuc: null },
    ], TU, 7, "2026-09-18T07:00");
    expect(r).toEqual([
      { dau: 0, cuoi: 1, mo: false },
      { dau: 3, cuoi: 4, mo: true },
    ]);
  });
});

describe("chữ trong thanh", () => {
  it("coThanh theo bề rộng", () => {
    expect(coThanh(130)).toBe("du");
    expect(coThanh(90)).toBe("gon");
    expect(coThanh(50)).toBe("mini");
  });

  it("chuKeHoach: một ngày ghi giờ, nhiều ngày ghi ngày đầu → ngày cuối", () => {
    const motNgay = viec({ du_kien_bat_dau: "2026-09-15T08:17", du_kien_ket_thuc: "2026-09-15T08:21" });
    expect(chuKeHoach(motNgay, "du")).toBe("KH 08:17–08:21");
    expect(chuKeHoach(motNgay, "gon")).toBe("08:17–08:21");
    expect(chuKeHoach(motNgay, "mini")).toBe("08:17");
    const nhieuNgay = viec({ du_kien_bat_dau: "2026-09-15T20:00", du_kien_ket_thuc: "2026-09-17T09:00" });
    expect(chuKeHoach(nhieuNgay, "du")).toBe("KH 15/9 → 17/9");
    expect(chuKeHoach(nhieuNgay, "mini")).toBe("→ 17/9");
  });

  it("chuThucTe theo trạng thái", () => {
    const chay = viec({ trang_thai: "running", thuc_te: [{ bat_dau: "2026-09-16T10:05", ket_thuc: null }] });
    expect(chuThucTe(chay, "du", false)).toBe("Chạy từ 10:05");
    expect(chuThucTe(chay, "du", true)).toBe("Chạy từ 16/9 10:05");
    expect(chuThucTe(viec({ trang_thai: "paused" }), "du", false)).toBe("Tạm dừng");
    const xong = viec({ trang_thai: "completed", thuc_te: [{ bat_dau: "2026-09-16T10:00", ket_thuc: "2026-09-16T14:30" }] });
    expect(chuThucTe(xong, "du", false)).toBe("Xong 14:30");
    expect(chuThucTe(viec({}), "du", false)).toBe("");
  });
});

describe("phutTrongCuaSo — dòng tóm tắt", () => {
  it("cắt phiên theo cửa sổ; kế hoạch chia chay_phut theo phần quãng nằm trong", () => {
    const w = viec({
      // Quãng kế hoạch 24 giờ vắt qua mép trái cửa sổ, chạy dự kiến 4 giờ ⇒ nửa quãng nằm trong ⇒ 2 giờ.
      du_kien_bat_dau: "2026-09-13T12:00",
      du_kien_ket_thuc: "2026-09-14T12:00",
      chay_phut: 240,
      thuc_te: [
        { bat_dau: "2026-09-13T23:00", ket_thuc: "2026-09-14T01:00" }, // 1 giờ trong cửa sổ
        { bat_dau: "2026-09-20T23:30", ket_thuc: null }, // mở, cắt ở mép phải 21/09 00:00 ⇒ 30 phút
      ],
    });
    const r = phutTrongCuaSo([w], TU, 7, luc("2026-09-21T03:00"));
    expect(r.keHoach).toBeCloseTo(120);
    expect(r.thucTe).toBeCloseTo(90);
  });

  it("không khai chay_phut thì kế hoạch là phần quãng nằm trong cửa sổ", () => {
    const w = viec({ du_kien_bat_dau: "2026-09-15T08:00", du_kien_ket_thuc: "2026-09-15T09:15" });
    expect(phutTrongCuaSo([w], TU, 7, luc("2026-09-15T00:00")).keHoach).toBeCloseTo(75);
  });
});
