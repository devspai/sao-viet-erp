/** Bộ lọc nâng cao Phiếu chi: sửa trong bảng là BẢN NHÁP, chỉ "Xem n phiếu" mới áp; mỗi điều kiện
 *  đã áp thành một chip, nguồn nhiều giá trị nối bằng chữ "và". */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CompanyBankAccountRow } from "../../../../api/client";
import { LOC_TRONG, type LocPC } from "../shared/loc";
import { BoLocPhieuChi } from "./BoLocPhieuChi";

const TK = [{ id: 3, bank_name: "MB", account_number: "933134668" }] as unknown as CompanyBankAccountRow[];

function Bao({ dau = LOC_TRONG, onDoi = vi.fn(), demKhop = vi.fn().mockResolvedValue(6) }: {
  dau?: LocPC; onDoi?: (l: LocPC) => void; demKhop?: (l: LocPC) => Promise<number>;
}) {
  const [loc, setLoc] = useState(dau);
  return (
    <div className="kt-tb">
      <BoLocPhieuChi loc={loc} onDoiLoc={(l) => { setLoc(l); onDoi(l); }} demKhop={demKhop} taiKhoan={TK} />
    </div>
  );
}

describe("BoLocPhieuChi", () => {
  it("sửa trong bảng không áp; Khớp đếm theo bản nháp; Xem n phiếu mới áp và ra chip", async () => {
    // Đồng hồ giả: debounce 350ms của "Khớp n" không còn phụ thuộc tốc độ máy. Giữa các phím gõ
    // không có thời gian trôi, nên cả chuỗi chỉ ra ĐÚNG một lời đếm sau lần đổi cuối.
    vi.useFakeTimers();
    // RTL chỉ biết đồng hồ giả của Jest (nhìn global `jest`) nên sau mỗi cú bấm nó chờ một
    // setTimeout thật mà không ai tiến đồng hồ — treo. Chỉ cho nó cái hàm tiến đồng hồ.
    (globalThis as Record<string, unknown>).jest = { advanceTimersByTime: vi.advanceTimersByTime };
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onDoi = vi.fn();
      const demKhop = vi.fn().mockResolvedValue(6);
      render(<Bao onDoi={onDoi} demKhop={demKhop} />);

      await user.click(screen.getByRole("button", { name: /Bộ lọc/ }));
      await user.click(screen.getByRole("button", { name: "Chuyển khoản" }));
      await user.click(screen.getByRole("button", { name: "Khác" }));
      await user.click(screen.getByRole("button", { name: "Đơn mua" }));
      await user.type(screen.getByRole("textbox", { name: "Từ" }), "5000000");
      expect(onDoi).not.toHaveBeenCalled();
      expect(demKhop).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(screen.getByText("Khớp 6 phiếu trong kỳ")).toBeInTheDocument();
      expect(demKhop).toHaveBeenCalledTimes(1);
      expect(demKhop).toHaveBeenLastCalledWith(expect.objectContaining({
        hinh_thuc: "bank_transfer", nguon: ["khac", "purchase_request"], tien_tu: 5_000_000,
      }));

      await user.click(screen.getByRole("button", { name: "Xem 6 phiếu" }));
      expect(onDoi).toHaveBeenCalledWith(expect.objectContaining({
        hinh_thuc: "bank_transfer", nguon: ["khac", "purchase_request"], tien_tu: 5_000_000,
      }));
      expect(screen.queryByText("Bộ lọc nâng cao")).toBeNull();

      // Mỗi điều kiện một chip; nguồn nhiều giá trị nối bằng chữ "và", không bằng dấu phẩy.
      const chipNguon = screen.getByRole("button", { name: /^Nguồn:/ });
      expect(chipNguon).toHaveTextContent("Nguồn: Khác và Đơn mua");
      expect(chipNguon.textContent).not.toMatch(/[,·•]/);
      expect(screen.getByRole("button", { name: /^Hình thức:/ })).toHaveTextContent("Hình thức: Chuyển khoản");
      expect(screen.getByRole("button", { name: /^Số tiền:/ })).toHaveTextContent("Số tiền: từ 5.000.000");
      expect(screen.getByRole("button", { name: /Bộ lọc/ })).toHaveTextContent("3");
    } finally {
      delete (globalThis as Record<string, unknown>).jest;
      vi.useRealTimers();
    }
  });

  it("Đóng thì bỏ bản nháp, mở lại thấy đúng điều kiện đang áp", async () => {
    const onDoi = vi.fn();
    render(<Bao onDoi={onDoi} dau={{ ...LOC_TRONG, hinh_thuc: "cash" }} />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    const bang = screen.getByRole("dialog");
    await userEvent.click(within(bang).getByRole("button", { name: "Chuyển khoản" }));
    await userEvent.click(within(bang).getByRole("button", { name: "Đóng" }));
    expect(onDoi).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Tiền mặt" })).toHaveAttribute("aria-pressed", "true");
  });

  it("bỏ từng chip và Xoá hết", async () => {
    const onDoi = vi.fn();
    render(<Bao onDoi={onDoi} dau={{ ...LOC_TRONG, nguon: ["purchase_request"], tai_khoan_id: 3, chung_tu: "thieu" }} />);
    expect(screen.getByRole("button", { name: /^Trả từ tài khoản:/ })).toHaveTextContent("MB 933134668");
    expect(screen.getByRole("button", { name: /^Chứng từ:/ })).toHaveTextContent("Còn thiếu");
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Nguồn" }));
    expect(onDoi).toHaveBeenLastCalledWith(expect.objectContaining({ nguon: [], tai_khoan_id: 3 }));
    await userEvent.click(screen.getByRole("button", { name: "Xoá hết" }));
    expect(onDoi).toHaveBeenLastCalledWith(LOC_TRONG);
    expect(screen.queryByRole("button", { name: /^Chứng từ:/ })).toBeNull();
  });

  it("bấm chip mở lại bảng lọc", async () => {
    render(<Bao dau={{ ...LOC_TRONG, ten_nhan: "Bình Minh" }} />);
    await userEvent.click(screen.getByRole("button", { name: /^Người nhận:/ }));
    expect(screen.getByText("Bộ lọc nâng cao")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Người nhận" })).toHaveValue("Bình Minh");
  });
});
