/** `useTrangPhieu`: `eventTick` là bộ đếm cộng dồn từ lúc mở app. Mở màn khi nó đã > 0 chỉ được tải
 *  MỘT lượt (lần tải đầu); tick đổi sau đó mới tải lại bảng và chạy việc riêng của màn. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTrangPhieu, type ThamSoSo } from "./trangPhieu";

type Dong = { id: number };
const trong = () => ({ items: [] as Dong[], total: 0, the_loc: {} as never });

describe("useTrangPhieu — sự kiện đẩy", () => {
  it("mở màn với eventTick > 0 chỉ tải một lượt; tick đổi thì tải lại và gọi onSuKien", async () => {
    const goi = vi.fn(async (_t: string, _p: ThamSoSo) => trong());
    const onSuKien = vi.fn();
    window.history.replaceState(null, "", "/?man=man-phieu-tick&ky=thang&so=0");
    const cauHinh = {
      man: "man-phieu-tick",
      locTuUrl: () => ({ the: "tat_ca" as const, tim: "", loc: {} }),
      locLenUrl: () => ({}),
      locTrong: {},
      thamSoLoc: () => ({}),
      thamSoTai: () => ({}),
      goiDanhSach: goi,
      chuLoi: "lỗi",
      coTrang: 25,
      coXemTaiKhoan: false,
      mucDichTaiKhoan: "pay" as const,
      onSuKien,
    };
    const { rerender } = renderHook(({ tick }) => useTrangPhieu<Dong, "tat_ca", object>(cauHinh, "t", tick, null), {
      initialProps: { tick: 5 },
    });
    await waitFor(() => expect(goi).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(goi).toHaveBeenCalledTimes(1);
    expect(onSuKien).not.toHaveBeenCalled();

    rerender({ tick: 6 });
    await waitFor(() => expect(goi).toHaveBeenCalledTimes(2));
    expect(onSuKien).toHaveBeenCalledTimes(1);
    window.history.replaceState(null, "", "/");
  });
});
