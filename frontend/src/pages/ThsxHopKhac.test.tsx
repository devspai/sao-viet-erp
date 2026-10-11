import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThsxDoiMay } from "./ThsxDoiMay";
import { lanTheoId } from "./ThsxExecPanels";
import { ThsxTamDungHop } from "./thsx/ThsxTamDungHop";

vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ token: "t" }) }));
vi.mock("../api/client", async (goc) => {
  const m = await goc<typeof import("../api/client")>();
  return {
    ...m,
    api: {
      ...m.api,
      sanXuat: {
        ...m.api.sanXuat,
        mayDoi: vi.fn().mockResolvedValue({
          theo_cong_doan: true,
          items: [
            { id: 2, ma: "CT-02", ten: "Máy cắt Kyodo 132", loai_may: null, trang_thai: "ranh", nhan: "Rảnh", chi_tiet: null },
            { id: 3, ma: "CT-03", ten: "Máy cắt Polar 115", loai_may: null, trang_thai: "dang_chay", nhan: "Đang chạy", chi_tiet: "Cắt tờ của LSX26-0015" },
          ],
        }),
      },
    },
  };
});

describe("Hộp Tạm dừng", () => {
  it("nút khoá khi chưa ghi lý do, ghi rồi mới sáng và gửi lý do", () => {
    const onTamDung = vi.fn();
    render(<ThsxTamDungHop phuDe="Cắt tờ của LSX26-0004" busy={false} onDong={vi.fn()} onTamDung={onTamDung} />);
    const hop = screen.getByRole("dialog", { name: "Tạm dừng việc" });
    const nut = within(hop).getByRole("button", { name: "Tạm dừng" });
    expect(nut).toBeDisabled();
    expect(within(hop).getByText(/Phiên chạy đóng lại, giờ máy ngừng tính từ lúc bấm/)).toBeInTheDocument();
    fireEvent.change(within(hop).getByRole("textbox"), { target: { value: "  Thay dao  " } });
    expect(nut).toBeEnabled();
    fireEvent.click(nut);
    expect(onTamDung).toHaveBeenCalledWith("Thay dao");
  });
});

describe("Hộp Đổi máy", () => {
  it("có ô Máy đang dùng, gợi ý theo công đoạn, chọn máy đang chạy thì hiện ô vàng", async () => {
    render(<ThsxDoiMay congViecId={9} mayHienTaiId={1} mayHienTai="CT-01 Máy cắt tờ ITO 100" tenCongDoan="Cắt tờ"
      phuDe="Cắt tờ của LSX26-0004" busy={false} onDoi={vi.fn().mockResolvedValue(true)} onClose={vi.fn()} />);
    const hop = screen.getByRole("dialog", { name: "Đổi máy" });
    expect((within(hop).getByLabelText("Máy đang dùng") as HTMLInputElement).value).toBe("CT-01 Máy cắt tờ ITO 100");
    await waitFor(() => expect(within(hop).getByText("Chỉ hiện máy khai cho công đoạn Cắt tờ.")).toBeInTheDocument());
    expect(within(hop).getByRole("button", { name: "Đổi máy" })).toBeDisabled();
    fireEvent.click(within(hop).getByRole("button", { name: /Đổi sang máy/ }));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /CT-03/ }));
    expect(within(hop).getByRole("status").textContent).toContain("CT-03 đang ở tình trạng đang chạy");
    expect(within(hop).getByRole("button", { name: "Đổi máy" })).toBeEnabled();
  });
});

describe("Số lần", () => {
  it("lần 1 là lần bắt đầu sớm nhất", () => {
    const lan = lanTheoId([
      { id: 9, bat_dau: "2026-10-09T11:58" }, { id: 4, bat_dau: "2026-10-09T07:00" },
    ]);
    expect([lan.get(4), lan.get(9)]).toEqual([1, 2]);
  });
});
