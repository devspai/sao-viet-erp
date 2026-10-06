import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TRAN_LAN_TRA, noiKhongTrung, useChiTietCongNo } from "./chiTietCongNo";

describe("noiKhongTrung", () => {
  const k = (x: { id: number }) => x.id;
  it("nối trang kế, bỏ dòng đã có và dòng trùng ngay trong trang mới", () => {
    const cu = [{ id: 1 }, { id: 2 }];
    expect(noiKhongTrung(cu, [{ id: 2 }, { id: 3 }, { id: 3 }, { id: 4 }], k)).toEqual([
      { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 },
    ]);
  });
  it("không có gì mới thì trả lại chính mảng cũ", () => {
    const cu = [{ id: 1 }];
    expect(noiKhongTrung(cu, [{ id: 1 }], k)).toBe(cu);
  });
});

describe("useChiTietCongNo — nạp lại không vượt trần cỡ trang của máy chủ", () => {
  type Dong = { id: number };
  type ChiTiet = { paid: Dong[]; paid_total: number };
  const TONG = 400;
  const goi = vi.fn(async (_t: string, trang: { paid_page: number; paid_size: number }): Promise<ChiTiet> => {
    const dau = (trang.paid_page - 1) * trang.paid_size;
    const paid = Array.from({ length: Math.max(0, Math.min(trang.paid_size, TONG - dau)) }, (_, i) => ({ id: dau + i }));
    return { paid, paid_total: TONG };
  });

  it("đã mở 21 trang × 10: nạp lại xin đúng 200 dòng, Xem thêm sau đó nối tiếp từ dòng 201", async () => {
    const { result, rerender } = renderHook(({ tick }) =>
      useChiTietCongNo<Dong, ChiTiet>({
        token: "t", khoa: "k", coTrang: 10, goi, khoaDong: (p) => p.id, eventTick: tick,
        chuLoi: "lỗi", chuLoiThem: "lỗi thêm",
      }), { initialProps: { tick: 0 } });
    await waitFor(() => expect(result.current.detail?.paid).toHaveLength(10));
    for (let i = 2; i <= 21; i += 1) {
      act(() => result.current.xemThem());
      await waitFor(() => expect(result.current.detail?.paid).toHaveLength(i * 10));
    }
    expect(TRAN_LAN_TRA).toBe(200);
    goi.mockClear();
    rerender({ tick: 1 });
    await waitFor(() => expect(goi).toHaveBeenCalledTimes(1));
    expect(goi.mock.calls[0][1]).toEqual({ paid_page: 1, paid_size: 200 });
    await waitFor(() => expect(result.current.detail?.paid).toHaveLength(200));
    act(() => result.current.xemThem());
    await waitFor(() => expect(result.current.detail?.paid).toHaveLength(210));
    expect(goi.mock.calls[1][1]).toEqual({ paid_page: 21, paid_size: 10 });
    expect(result.current.detail!.paid.map((p) => p.id)).toEqual(Array.from({ length: 210 }, (_, i) => i));
  });
});
