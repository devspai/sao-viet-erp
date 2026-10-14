/** Cọc đơn huỷ còn giữ trong ngăn khách: mỗi đơn một nút "Trả lại cọc" gắn đúng đơn; không quyền thì không có nút. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CocDonHuyBlock } from "./CocDonHuyBlock";

const DS = [{ order_id: 5, order_code: "DH005", da_nhan: 300_000, con_lai: 149_798 }];

describe("CocDonHuyBlock", () => {
  it("bấm Trả lại cọc gửi đúng đơn", () => {
    const onTraLai = vi.fn();
    render(<CocDonHuyBlock ds={DS} onTraLai={onTraLai} />);
    expect(screen.getByText("149.798")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trả lại cọc đơn DH005" }));
    expect(onTraLai).toHaveBeenCalledWith(DS[0]);
  });

  it("không quyền lập phiếu chi: không có nút", () => {
    render(<CocDonHuyBlock ds={DS} />);
    expect(screen.queryByRole("button", { name: /Trả lại cọc/ })).toBeNull();
  });
});
