/** Bộ lọc nâng cao Phiếu thu: sửa trong bảng là BẢN NHÁP, chỉ "Xem n phiếu" mới áp; mỗi điều kiện
 *  đã áp thành một chip với chữ của sổ thu (Nguồn thu, Vào tài khoản, Người nộp). */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CompanyBankAccountRow } from "../../../../api/client";
import { LOC_TRONG, type LocPT } from "../shared/loc";
import { BoLocPhieuThu } from "./BoLocPhieuThu";

const TK = [{ id: 5, bank_name: "Vietcombank", account_number: "0281000456789" }] as unknown as CompanyBankAccountRow[];

function Bao({ dau = LOC_TRONG, onDoi = vi.fn(), demKhop = vi.fn().mockResolvedValue(4) }: {
  dau?: LocPT; onDoi?: (l: LocPT) => void; demKhop?: (l: LocPT) => Promise<number>;
}) {
  const [loc, setLoc] = useState(dau);
  return (
    <div className="kt-tb">
      <BoLocPhieuThu loc={loc} onDoiLoc={(l) => { setLoc(l); onDoi(l); }} demKhop={demKhop} taiKhoan={TK} />
    </div>
  );
}

describe("BoLocPhieuThu", () => {
  it("ô của sổ thu; nháp không áp; Khớp đếm theo nháp; Xem n phiếu mới áp và ra chip", async () => {
    const onDoi = vi.fn();
    const demKhop = vi.fn().mockResolvedValue(4);
    render(<Bao onDoi={onDoi} demKhop={demKhop} />);

    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    const bang = screen.getByRole("dialog");
    expect(within(bang).getByText("Nguồn thu")).toBeInTheDocument();
    expect(within(bang).getByRole("combobox", { name: "Vào tài khoản" })).toBeInTheDocument();
    for (const ten of ["Cọc đơn bán", "Thu hoá đơn", "Thu khác", "Thu lại tiền đã chi"]) {
      expect(within(bang).getByRole("button", { name: ten })).toBeInTheDocument();
    }

    await userEvent.click(within(bang).getByRole("button", { name: "Thu hoá đơn" }));
    await userEvent.click(within(bang).getByRole("button", { name: "Cọc đơn bán" }));
    await userEvent.click(within(bang).getByRole("button", { name: "Chuyển khoản" }));
    await userEvent.selectOptions(within(bang).getByRole("combobox", { name: "Vào tài khoản" }), "5");
    await userEvent.type(within(bang).getByRole("textbox", { name: "Người nộp" }), "An Phát");
    expect(onDoi).not.toHaveBeenCalled();

    expect(await screen.findByText("Khớp 4 phiếu trong kỳ")).toBeInTheDocument();
    await waitFor(() =>
      expect(demKhop).toHaveBeenLastCalledWith(expect.objectContaining({
        nguon: ["sales_invoice", "order_deposit"], hinh_thuc: "bank_transfer", tai_khoan_id: 5, ten_nhan: "An Phát",
      })),
    );

    await userEvent.click(screen.getByRole("button", { name: "Xem 4 phiếu" }));
    expect(onDoi).toHaveBeenCalledWith(expect.objectContaining({
      nguon: ["sales_invoice", "order_deposit"], hinh_thuc: "bank_transfer", tai_khoan_id: 5, ten_nhan: "An Phát",
    }));
    expect(screen.queryByText("Bộ lọc nâng cao")).toBeNull();

    const chipNguon = screen.getByRole("button", { name: /^Nguồn:/ });
    expect(chipNguon).toHaveTextContent("Nguồn: Thu hoá đơn và Cọc đơn bán");
    expect(chipNguon.textContent).not.toMatch(/[,·•]/);
    expect(screen.getByRole("button", { name: /^Vào tài khoản:/ })).toHaveTextContent("Vietcombank 0281000456789");
    expect(screen.getByRole("button", { name: /^Người nộp:/ })).toHaveTextContent("Người nộp: An Phát");
    expect(screen.getByRole("button", { name: /Bộ lọc/ })).toHaveTextContent("4");
  });

  it("Đóng bỏ nháp; bỏ từng chip; Xoá hết", async () => {
    const onDoi = vi.fn();
    render(<Bao onDoi={onDoi} dau={{ ...LOC_TRONG, nguon: ["other"], chung_tu: "thieu" }} />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Tiền mặt" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đóng" }));
    expect(onDoi).not.toHaveBeenCalled();

    expect(screen.getByRole("button", { name: /^Chứng từ:/ })).toHaveTextContent("Còn thiếu");
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Nguồn" }));
    expect(onDoi).toHaveBeenLastCalledWith(expect.objectContaining({ nguon: [], chung_tu: "thieu" }));
    await userEvent.click(screen.getByRole("button", { name: "Xoá hết" }));
    expect(onDoi).toHaveBeenLastCalledWith(LOC_TRONG);
  });
});
