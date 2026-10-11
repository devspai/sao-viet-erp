import { describe, expect, it } from "vitest";

import type { SxKcsCongDoan, SxKcsLanKiem } from "../../api/client";
import { loiTheoCongDoan } from "./KcsSoDoNhom";

const lk = (id: number, p: Partial<SxKcsLanKiem>): SxKcsLanKiem => ({
  id, cong_viec_id: 31, cong_doan_ten: "Xén 3 mặt", nguoi_kiem: "Admin", luc: `2026-10-11T0${id}:00:00`,
  so_dat: 0, so_loi: 0, don_vi: "tay", ket_luan: "dat" as SxKcsLanKiem["ket_luan"], checklist: [], ghi_chu: null,
  version: 1, loi: [], ...p,
});
const loi = (id: number, cv: number, ten: string, so: number) => ({
  id, mo_ta: null, so_luong: so, don_vi: "tay", to_chiu_id: 1, to_chiu_ten: "Tổ keo", cong_doan_id: cv,
  cong_doan_ten: ten, da_xem_luc: null, nguoi_xem: null, anh: [],
});

const cuoi = (lan: SxKcsLanKiem[]) => ({
  cong_viec_id: 31, don_vi: "tay",
  checklist: [
    { cong_viec_id: 28, ten_cong_doan: "Bài in", thu_tu: 1, ten: "Màu đúng mẫu" },
    { cong_viec_id: 30, ten_cong_doan: "Vào keo", thu_tu: 1, ten: "Gáy chắc" },
    { cong_viec_id: 30, ten_cong_doan: "Vào keo", thu_tu: 2, ten: "Chồng màu khớp" },
  ],
  lan_kiem: lan,
}) as unknown as SxKcsCongDoan;

describe("loiTheoCongDoan", () => {
  it("không lỗi thì rỗng — không kê tiêu chí đạt", () => {
    expect(loiTheoCongDoan(cuoi([lk(1, { checklist: [{ cong_viec_id: 30, thu_tu: 1, dat: true }] })]))).toEqual([]);
  });

  it("cộng dồn theo công đoạn gây → tiêu chí, phần dư là Lỗi khác, theo thứ tự chuỗi", () => {
    const ds = loiTheoCongDoan(cuoi([
      lk(1, {
        checklist: [{ cong_viec_id: 30, thu_tu: 2, dat: false, so_luong: 10 }],
        loi: [loi(1, 30, "Vào keo", 10)],
      }),
      lk(2, {
        checklist: [{ cong_viec_id: 30, thu_tu: 2, dat: false, so_luong: 4 }, { cong_viec_id: 28, thu_tu: 1, dat: false, so_luong: 2 }],
        loi: [loi(2, 30, "Vào keo", 4), loi(3, 30, "Vào keo", 3), loi(4, 28, "Bài in", 2)],
      }),
    ]));
    expect(ds.map((g) => [g.ten, g.to, g.tc.map((r) => [r.ten, r.so, r.lan])])).toEqual([
      ["Bài in", "Tổ keo", [["Màu đúng mẫu", 2, 1]]],
      ["Vào keo", "Tổ keo", [["Chồng màu khớp", 14, 2], ["Lỗi khác", 3, 1]]],
    ]);
  });

  it("lần kiểm cũ không có số theo tiêu chí: dồn vào tiêu chí hỏng đầu", () => {
    const ds = loiTheoCongDoan(cuoi([lk(1, {
      checklist: [{ cong_viec_id: 30, thu_tu: 1, dat: false }, { cong_viec_id: 30, thu_tu: 2, dat: false }],
      loi: [loi(1, 30, "Vào keo", 6)],
    })]));
    expect(ds[0].tc.map((r) => [r.ten, r.so, r.lan])).toEqual([["Gáy chắc", 6, 1], ["Chồng màu khớp", 0, 1]]);
  });
});
