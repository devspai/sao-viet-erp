import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThsxBaoSuCoDialog } from "./ThsxBaoSuCoDialog";

function mo(p: Partial<Parameters<typeof ThsxBaoSuCoDialog>[0]> = {}) {
  const onGui = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  render(
    <ThsxBaoSuCoDialog mayNhan="M6M · Máy 6 màu Mitsubishi 72×102" dangChay busy={false}
      onGui={onGui} onClose={onClose} {...p} />,
  );
  return { onGui, onClose };
}

describe("ThsxBaoSuCoDialog — cùng khuôn ngăn kéo Báo máy hỏng", () => {
  it("dựng đủ các ô của Yêu cầu mới, máy khoá theo công việc", () => {
    mo();
    const dlg = screen.getByRole("dialog", { name: "Báo máy hỏng — Yêu cầu mới" });
    expect(dlg.textContent).toContain("Báo máy hỏng");
    expect(dlg.textContent).toContain("Yêu cầu mới");
    // Khung thẻ lồng "Thông tin báo sự cố máy" đã gỡ (09/10/2026) — ô đứng thẳng trong thân ngăn kéo.
    expect(dlg.textContent).not.toContain("Thông tin báo sự cố máy");
    const may = screen.getByRole("textbox", { name: /^Máy/ }) as HTMLInputElement;
    expect(may.disabled).toBe(true);
    expect(may.value).toBe("M6M · Máy 6 màu Mitsubishi 72×102");
    // Mức độ là dãy nút bấm, mặc định Trung bình.
    expect(screen.getByRole("button", { name: "Trung bình" }).getAttribute("aria-pressed")).toBe("true");
    // Ô bộ phận hỏng đã gỡ (11/10/2026).
    expect(dlg.textContent).not.toContain("Bộ phận hỏng");
    expect(screen.getByRole("checkbox", { name: /Máy đang dừng, không chạy được/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gửi yêu cầu" })).toBeTruthy();
  });

  it("tick máy dừng mà chưa ghi triệu chứng vẫn gửi được", async () => {
    const { onGui, onClose } = mo();
    fireEvent.click(screen.getByRole("checkbox", { name: /Máy đang dừng/ }));
    expect(screen.getByText(/sẽ tạm dừng và phiên máy đóng lại/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onGui).toHaveBeenCalledWith({
      mo_ta: null, muc_do: "trung_binh", dung_san_xuat: true,
    });
  });

  it("ghi triệu chứng + mức độ thì gửi đủ rồi đóng", async () => {
    const { onGui, onClose } = mo();
    fireEvent.click(screen.getByRole("checkbox", { name: /Máy đang dừng/ }));
    fireEvent.change(screen.getByPlaceholderText(/Kể đúng cái mình thấy/), { target: { value: "Kêu to" } });
    fireEvent.click(screen.getByRole("button", { name: "Nghiêm trọng" }));
    expect(screen.getByRole("button", { name: "Nghiêm trọng" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onGui).toHaveBeenCalledWith({
      mo_ta: "Kêu to", muc_do: "nghiem_trong", dung_san_xuat: true,
    });
  });

  it("không tick: gửi được khi chưa ghi triệu chứng; lỗi server thì giữ ngăn kéo", async () => {
    const onGui = vi.fn().mockResolvedValue(false);
    const { onClose } = mo({ onGui, dangChay: false });
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    await waitFor(() => expect(onGui).toHaveBeenCalledWith({
      mo_ta: null, muc_do: "trung_binh", dung_san_xuat: false,
    }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Việc đang tạm dừng nên không đóng thêm phiên nào/)).toBeTruthy();
  });
});
