/** Bộ lọc nâng cao Công nợ phải thu: ô chung của khuôn công nợ + hai ô riêng phía thu (Người phụ
 *  trách, Nhãn khách hàng) cắm qua `oThem`; áp thành chip, chip mở lại đúng ô; không có danh sách
 *  (không quyền xem Khách hàng) thì ô ẩn. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { SaleOption } from "../../../../api/client";
import { LOC_CONG_NO_TRONG, type LocNangCaoCongNo } from "../../shared/locCongNo";
import { BoLocCongNoThu } from "./BoLocCongNoThu";

const NGUOI: SaleOption[] = [{ id: 5, name: "Trần Văn Nam" }, { id: 6, name: "Lê Thị Hoa" }];

function Bao({ onDoi = vi.fn(), demKhop = vi.fn().mockResolvedValue(3), nguoi = NGUOI, nhan = ["Nhà sách", "VIP"],
  dau = LOC_CONG_NO_TRONG, coQuyenKhach = true }: {
  onDoi?: (l: LocNangCaoCongNo) => void; demKhop?: (l: LocNangCaoCongNo) => Promise<number>;
  nguoi?: SaleOption[] | null; nhan?: string[] | null; dau?: LocNangCaoCongNo; coQuyenKhach?: boolean;
}) {
  const [loc, setLoc] = useState(dau);
  return (
    <div className="kt-tb">
      <BoLocCongNoThu loc={loc} onDoiLoc={(l) => { setLoc(l); onDoi(l); }} demKhop={demKhop}
        nguoi={nguoi} nhanKhach={nhan} coQuyenKhach={coQuyenKhach} />
    </div>
  );
}

describe("BoLocCongNoThu", () => {
  it("đủ ô phía thu; chọn người và nhãn là bản nháp, Xem n khách hàng áp và ra chip có tên", async () => {
    const onDoi = vi.fn();
    const demKhop = vi.fn().mockResolvedValue(3);
    render(<Bao onDoi={onDoi} demKhop={demKhop} />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    expect(screen.getByRole("group", { name: "Hạn thu" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hiện cả khách đã thu hết" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Người phụ trách" }), "5");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Nhãn khách hàng" }), "VIP");
    await userEvent.click(screen.getByRole("button", { name: "Đã quá hạn" }));
    expect(onDoi).not.toHaveBeenCalled();
    expect(await screen.findByText("Khớp 3 khách hàng")).toBeInTheDocument();
    await waitFor(() => expect(demKhop).toHaveBeenLastCalledWith(
      expect.objectContaining({ phu_trach_id: 5, nhan: "VIP", han_tra: "qua_han" })));

    await userEvent.click(screen.getByRole("button", { name: "Xem 3 khách hàng" }));
    expect(onDoi).toHaveBeenLastCalledWith(expect.objectContaining({ phu_trach_id: 5, nhan: "VIP", han_tra: "qua_han" }));
    expect(screen.getByRole("button", { name: /^Phụ trách:/ })).toHaveTextContent("Phụ trách: Trần Văn Nam");
    expect(screen.getByRole("button", { name: /^Nhãn:/ })).toHaveTextContent("Nhãn: VIP");
    expect(screen.getByRole("button", { name: /^Hạn thu:/ })).toHaveTextContent("Hạn thu: đã quá hạn");

    // Bấm chip mở lại bảng ở đúng ô.
    await userEvent.click(screen.getByRole("button", { name: /^Phụ trách:/ }));
    expect(screen.getByRole("combobox", { name: "Người phụ trách" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));

    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Phụ trách" }));
    expect(onDoi).toHaveBeenLastCalledWith(expect.objectContaining({ phu_trach_id: undefined, nhan: "VIP" }));
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Nhãn" }));
    expect(onDoi).toHaveBeenLastCalledWith(expect.objectContaining({ nhan: undefined }));
  });

  it("không có danh sách người / nhãn (không quyền xem Khách hàng): ô ẩn, bộ lọc còn lại vẫn chạy", async () => {
    render(<Bao nguoi={null} nhan={null} />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    expect(screen.queryByRole("combobox", { name: "Người phụ trách" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Nhãn khách hàng" })).toBeNull();
    expect(screen.getByRole("group", { name: "Hạn mức" })).toBeInTheDocument();
  });

  it("thứ tự ô theo bản xem: Còn nợ, Người phụ trách, Hạn thu, Hạn mức, Nhãn khách hàng, Khác", async () => {
    render(<Bao />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    const thuTu = [...document.querySelectorAll(".kt-boloc [data-o]")].map((e) => e.getAttribute("data-o"));
    expect(thuTu).toEqual(["no", "phu_trach", "han_tra", "han_muc", "nhan", "het"]);
  });

  it("không có quyền xem Khách hàng: ô người và nhãn ẩn, bảng lọc nói rõ một dòng vì sao", async () => {
    render(<Bao nguoi={null} nhan={null} coQuyenKhach={false} />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    expect(screen.queryByRole("combobox", { name: "Người phụ trách" })).toBeNull();
    expect(screen.getByText("Cần quyền xem Khách hàng để lọc theo người phụ trách và nhãn.")).toBeInTheDocument();
  });

  it("có quyền mà danh sách chưa về / tải hỏng: ô ẩn, KHÔNG nói thiếu quyền", async () => {
    render(<Bao nguoi={null} nhan={null} />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    expect(screen.queryByText(/Cần quyền xem Khách hàng/)).toBeNull();
  });

  it("nhãn đang áp từ link mà không còn trong danh mục vẫn hiện trong ô", async () => {
    render(<Bao dau={{ nhan: "Đại lý cũ" }} />);
    await userEvent.click(screen.getByRole("button", { name: /^Nhãn:/ }));
    expect(screen.getByRole("combobox", { name: "Nhãn khách hàng" })).toHaveValue("Đại lý cũ");
  });
});
