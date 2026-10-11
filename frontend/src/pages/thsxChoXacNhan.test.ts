// Việc chờ tổ bấm gắn vào công đoạn (§11.5): một nguồn `cho-xac-nhan` → chấm đỏ + tab mở sẵn.
import { describe, expect, it } from "vitest";
import type { SxChoXacNhan } from "../api/client";
import { choNgoaiBan, choTheoViec, coCho, nhanCho, tabCho, tongCho } from "./thsxChoXacNhan";

const d = {
  team_id: 3,
  ban_giao: [
    { id: 1, dich_cong_viec_id: 24, tren_ban: true },
    { id: 2, dich_cong_viec_id: 24, tren_ban: true },
  ],
  kcs_loi: [
    { loi_id: 4, cong_viec_id: 30, tren_ban: true },
    { loi_id: 5, cong_viec_id: null, tren_ban: false },
  ],
} as unknown as SxChoXacNhan;

describe("thsxChoXacNhan", () => {
  it("gom theo công đoạn, đếm riêng từng loại; lỗi KCS không rõ công đoạn thì không gắn dòng nào", () => {
    const m = choTheoViec(d);
    expect(m.get(24)).toMatchObject({ nhan: 2, kcs: 0 });
    expect(m.get(24)?.hang).toHaveLength(2);
    expect(m.get(30)).toEqual({ nhan: 0, kcs: 1 });
    expect(m.size).toBe(2);
    expect(tongCho(d)).toBe(4);
    expect(choTheoViec(null).size).toBe(0);
    expect(tongCho(null)).toBe(0);
  });

  it("tab mở sẵn đi theo chỗ bấm: Nhận trước, rồi KCS", () => {
    expect(tabCho({ nhan: 1, kcs: 1 })).toBe("gn");
    expect(tabCho({ nhan: 0, kcs: 2 })).toBe("kcs");
    expect(tabCho(undefined)).toBeUndefined();
    expect(tabCho({ nhan: 0, kcs: 0 })).toBeUndefined();
  });

  it("chỉ việc không có dòng trên bàn mới vào danh sách riêng", () => {
    const n = choNgoaiBan(d)!;
    expect(n.ban_giao).toHaveLength(0);
    expect(n.kcs_loi.map((l) => l.loi_id)).toEqual([5]);
    expect(choNgoaiBan(null)).toBeNull();
  });

  it("câu mô tả chấm nói rõ đang chờ gì", () => {
    expect(nhanCho({ nhan: 2, kcs: 1 })).toBe("2 bàn giao chờ nhận · 1 lỗi KCS chờ xem");
    expect(coCho({ nhan: 0, kcs: 0 })).toBe(false);
    expect(coCho(undefined)).toBe(false);
  });
});
