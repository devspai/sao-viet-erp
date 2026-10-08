import { describe, expect, it } from "vitest";

import { xepCot } from "./LuoiDs";

const COT = [
  { key: "chon", label: "Chọn", coDinh: true },
  { key: "ma", label: "Mã", coDinh: true },
  { key: "khach", label: "Khách" },
  { key: "tien", label: "Tiền" },
  { key: "nguoi", label: "Người" },
  { key: "nut", label: "Thao tác", coDinh: true },
];
const khoa = (ds: { key: string }[]) => ds.map((c) => c.key);

describe("xepCot — thứ tự cột người xem kéo thả", () => {
  it("chưa kéo gì thì giữ thứ tự mặc định", () => {
    expect(khoa(xepCot(COT, []))).toEqual(["chon", "ma", "khach", "tien", "nguoi", "nut"]);
  });

  it("đổi chỗ các cột thường, cột cố định đứng nguyên vị trí", () => {
    expect(khoa(xepCot(COT, ["nguoi", "khach", "tien"]))).toEqual(["chon", "ma", "nguoi", "khach", "tien", "nut"]);
  });

  it("cột mới chưa có trong thứ tự đã lưu đứng cuối nhóm; khoá cũ đã gỡ thì bỏ qua", () => {
    expect(khoa(xepCot(COT, ["tien", "cot_da_go", "khach"]))).toEqual(["chon", "ma", "tien", "khach", "nguoi", "nut"]);
  });
});
