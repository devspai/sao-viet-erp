/** `useTrangCongNo` trả kèm `ttData` — bộ lọc (nhóm nút, mốc tuổi, ô tìm, bộ lọc nâng cao) ĐÃ SINH RA
 *  `data` đang hiện. Màn cần biết "số đang hiện có phải của bộ lọc X chưa" (liên thông mở ngăn theo
 *  khách) đọc nó thay vì so ô tìm hiện tại: câu trả lời cũ có thể về sau khi ô tìm đã đổi. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LocCongNo } from "../../../api/client";
import { LOC_CONG_NO_TRONG } from "./locCongNo";
import { useTrangCongNo } from "./trangCongNo";

type TomTat = { items: unknown[]; total: number; page: number };

describe("useTrangCongNo — ttData", () => {
  it("ttData là bộ lọc của lượt tải đã sinh ra data, không phải ô tìm hiện tại", async () => {
    const cho: { q?: string; xong: (r: TomTat) => void }[] = [];
    const goi = vi.fn(
      (_t: string, p: LocCongNo) => new Promise<TomTat>((xong) => cho.push({ q: p.q, xong })),
    );
    window.history.replaceState(null, "", "/?man=man-thu&ky=tat_ca");
    const { result } = renderHook(() =>
      useTrangCongNo({ man: "man-thu", coTrang: 25, goi, chuLoi: "lỗi", dau: { the: "all", tuoi: null, tim: "A", loc: LOC_CONG_NO_TRONG } }, "t", 0),
    );
    await waitFor(() => expect(cho.length).toBeGreaterThan(0));
    expect(result.current.ttData).toBeNull();
    // Lời bảng và lời cùng kỳ (nếu đang so sánh) chạy song song — trả hết các lời của lượt A.
    await act(async () => cho.filter((c) => c.q === "A").forEach((c) => c.xong({ items: [], total: 0, page: 1 })));
    expect(result.current.ttData).toEqual({ the: "all", tuoi: null, tim: "A", loc: LOC_CONG_NO_TRONG });

    act(() => result.current.datTim("B"));
    await waitFor(() => expect(cho.some((c) => c.q === "B")).toBe(true));
    // Ô tìm đã là B nhưng số đang hiện vẫn của A.
    expect(result.current.timTre).toBe("B");
    expect(result.current.ttData?.tim).toBe("A");
    await act(async () => cho.filter((c) => c.q === "B").forEach((c) => c.xong({ items: [], total: 0, page: 1 })));
    expect(result.current.ttData?.tim).toBe("B");
    window.history.replaceState(null, "", "/");
  });
});

describe("useTrangCongNo — lời cùng kỳ và sự kiện đẩy", () => {
  const trong = (): TomTat => ({ items: [], total: 0, page: 1 });
  const cauHinh = (goi: (t: string, p: LocCongNo) => Promise<TomTat>) => ({
    man: "man-cung", coTrang: 25, goi, chuLoi: "lỗi",
    dau: { the: "all" as const, tuoi: null, tim: "", loc: LOC_CONG_NO_TRONG },
  });

  it("lời cùng kỳ gửi chi_tong, lời của bảng thì không", async () => {
    const goi = vi.fn(async (_t: string, _p: LocCongNo) => trong());
    window.history.replaceState(null, "", "/?man=man-cung&ky=thang");
    renderHook(() => useTrangCongNo(cauHinh(goi), "t", 0));
    await waitFor(() => expect(goi.mock.calls.length).toBe(2));
    const cung = goi.mock.calls.map((c) => c[1]).find((p) => p.size === 1)!;
    const chinh = goi.mock.calls.map((c) => c[1]).find((p) => p.size === 25)!;
    expect(cung).toMatchObject({ page: 1, size: 1, chi_tong: true });
    expect(chinh.chi_tong).toBeUndefined();
    window.history.replaceState(null, "", "/");
  });

  it("mở màn khi eventTick đã > 0 chỉ tải một lượt (kỳ Tất cả: không có lời cùng kỳ); tick đổi sau đó thì tải lại", async () => {
    const goi = vi.fn(async (_t: string, _p: LocCongNo) => trong());
    window.history.replaceState(null, "", "/?man=man-tick&ky=tat_ca");
    const { rerender } = renderHook(({ tick }) => useTrangCongNo({ ...cauHinh(goi), man: "man-tick" }, "t", tick), {
      initialProps: { tick: 7 },
    });
    await waitFor(() => expect(goi).toHaveBeenCalledTimes(1));
    // Chờ thêm một nhịp: không có lượt thứ hai âm thầm chạy sau effect `eventTick`.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(goi).toHaveBeenCalledTimes(1);

    rerender({ tick: 8 });
    await waitFor(() => expect(goi).toHaveBeenCalledTimes(2));
    window.history.replaceState(null, "", "/");
  });
});
