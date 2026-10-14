import { describe, expect, it } from "vitest";
import type { WorkLocation } from "../../../../api/client";
import { tamDiemDaCo } from "./LocationsTab";

const diem = (id: number, latitude: number, longitude: number, is_active = true): WorkLocation => ({
  id, name: `Điểm ${id}`, latitude, longitude, radius_m: 150, is_active, note: null,
});

describe("tâm bản đồ cho điểm mới", () => {
  it("lấy điểm đang hoạt động có toạ độ", () => {
    expect(tamDiemDaCo([diem(1, 0, 0), diem(2, 11, 106, false), diem(3, 10.9, 106.7)])).toEqual([10.9, 106.7]);
  });
  it("không có điểm nào thì để bản đồ tự mở mặc định", () => {
    expect(tamDiemDaCo(null)).toBeNull();
    expect(tamDiemDaCo([diem(1, 0, 0)])).toBeNull();
  });
});
