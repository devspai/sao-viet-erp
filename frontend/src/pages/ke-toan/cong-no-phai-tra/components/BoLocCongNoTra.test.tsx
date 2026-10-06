/** Bộ lọc nâng cao Công nợ phải trả: sửa trong bảng là BẢN NHÁP, chỉ "Xem n nhà cung cấp" mới áp; mỗi
 *  điều kiện đã áp thành một chip (cùng hàng với chip Tuổi nợ của khối tổng quan). */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { LOC_CONG_NO_TRONG, type LocNangCaoCongNo } from "../../shared/locCongNo";
import { BoLocCongNoTra } from "./BoLocCongNoTra";

function Bao({ onDoi = vi.fn(), demKhop = vi.fn().mockResolvedValue(2), onBoDau = vi.fn() }: {
  onDoi?: (l: LocNangCaoCongNo) => void; demKhop?: (l: LocNangCaoCongNo) => Promise<number>;
  onBoDau?: (k: string | null) => void;
}) {
  const [loc, setLoc] = useState(LOC_CONG_NO_TRONG);
  return (
    <div className="kt-tb">
      <BoLocCongNoTra loc={loc} onDoiLoc={(l) => { setLoc(l); onDoi(l); }} demKhop={demKhop}
        chipDau={[{ khoa: "tuoi", nhan: "Tuổi nợ", giaTri: "Trễ 31–60 ngày" }]} onBoDau={onBoDau} />
    </div>
  );
}

describe("BoLocCongNoTra", () => {
  it("nháp không áp; Khớp đếm theo nháp; Xem n nhà cung cấp áp và ra chip từng điều kiện", async () => {
    const onDoi = vi.fn();
    const demKhop = vi.fn().mockResolvedValue(2);
    render(<Bao onDoi={onDoi} demKhop={demKhop} />);

    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Từ" }), "50000000");
    await userEvent.click(screen.getByRole("button", { name: "Tới hạn trong 7 ngày" }));
    await userEvent.click(screen.getByRole("button", { name: "Dùng trên 80%" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Hiện cả nhà cung cấp đã trả hết" }));
    expect(onDoi).not.toHaveBeenCalled();

    // "Khớp n nhà cung cấp" — không có đuôi "trong kỳ" (khớp theo nhà cung cấp, không theo kỳ).
    expect(await screen.findByText("Khớp 2 nhà cung cấp")).toBeInTheDocument();
    const mong = { no_tu: 50_000_000, han_tra: "7_ngay", han_muc: "tren_80", ca_da_tra_het: true };
    await waitFor(() => expect(demKhop).toHaveBeenLastCalledWith(expect.objectContaining(mong)));

    await userEvent.click(screen.getByRole("button", { name: "Xem 2 nhà cung cấp" }));
    expect(onDoi).toHaveBeenCalledWith(expect.objectContaining(mong));
    expect(screen.queryByText("Bộ lọc nâng cao")).toBeNull();

    expect(screen.getByRole("button", { name: /^Tuổi nợ:/ })).toHaveTextContent("Tuổi nợ: Trễ 31–60 ngày");
    expect(screen.getByRole("button", { name: /^Còn nợ:/ })).toHaveTextContent("Còn nợ: từ 50.000.000");
    expect(screen.getByRole("button", { name: /^Hạn trả:/ })).toHaveTextContent("Hạn trả: tới hạn trong 7 ngày");
    expect(screen.getByRole("button", { name: /^Hạn mức:/ })).toHaveTextContent("Hạn mức: dùng trên 80%");
    expect(screen.getByRole("button", { name: /^Hiện cả:/ })).toHaveTextContent("Hiện cả: nhà cung cấp đã trả hết");
    expect(screen.getByRole("button", { name: /Bộ lọc/ })).toHaveTextContent("4");
  });

  it("Đóng không áp; bỏ từng chip; chip Tuổi nợ báo ra ngoài; Xoá hết bỏ cả hai loại", async () => {
    const onDoi = vi.fn();
    const onBoDau = vi.fn();
    render(<Bao onDoi={onDoi} onBoDau={onBoDau} />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    await userEvent.click(screen.getByRole("button", { name: "Đã vượt" }));
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onDoi).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    await userEvent.click(screen.getByRole("button", { name: "Đã vượt" }));
    await userEvent.click(screen.getByRole("button", { name: /^Xem/ }));
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Hạn mức" }));
    expect(onDoi).toHaveBeenLastCalledWith(expect.objectContaining({ han_muc: undefined }));

    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Tuổi nợ" }));
    expect(onBoDau).toHaveBeenLastCalledWith("tuoi");

    await userEvent.click(screen.getByRole("button", { name: "Xoá hết" }));
    expect(onBoDau).toHaveBeenLastCalledWith(null);
    expect(onDoi).toHaveBeenLastCalledWith(LOC_CONG_NO_TRONG);
  });

  it("ô Có đợt giao chưa ghi hoá đơn nằm ở Khác, áp thành chip Hoá đơn", async () => {
    const onDoi = vi.fn();
    const demKhop = vi.fn().mockResolvedValue(1);
    render(<Bao onDoi={onDoi} demKhop={demKhop} />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Có đợt giao chưa ghi hoá đơn" }));
    await waitFor(() => expect(demKhop).toHaveBeenLastCalledWith(expect.objectContaining({ thieu_hoa_don: true })));
    await userEvent.click(screen.getByRole("button", { name: /^Xem/ }));
    expect(onDoi).toHaveBeenLastCalledWith(expect.objectContaining({ thieu_hoa_don: true }));
    expect(screen.getByRole("button", { name: /^Hoá đơn:/ })).toHaveTextContent("Hoá đơn: có đợt giao chưa ghi");
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Hoá đơn" }));
    expect(onDoi).toHaveBeenLastCalledWith(expect.objectContaining({ thieu_hoa_don: undefined }));
  });

  it("khuôn chung nhận ô thêm (đọc/ghi bản nháp) và chip thêm của màn", async () => {
    const onDoi = vi.fn();
    const onBoThem = vi.fn();
    function BaoThem() {
      const [loc, setLoc] = useState(LOC_CONG_NO_TRONG);
      return (
        <div className="kt-tb">
          <BoLocCongNoTra loc={loc} onDoiLoc={(l) => { setLoc(l); onDoi(l); }} demKhop={vi.fn().mockResolvedValue(3)}
            oThem={({ nhap, doi }) => (
              <div data-o="nhan">
                <input aria-label="Nhãn khách hàng" value={nhap.nhan ?? ""} onChange={(e) => doi({ nhan: e.target.value })} />
              </div>
            )}
            chipThem={[{ khoa: "rieng", nhan: "Riêng", giaTri: "x" }]} onBoThem={onBoThem} />
        </div>
      );
    }
    render(<BaoThem />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Nhãn khách hàng" }), "VIP");
    await userEvent.click(screen.getByRole("button", { name: /^Xem/ }));
    expect(onDoi).toHaveBeenLastCalledWith(expect.objectContaining({ nhan: "VIP" }));
    expect(screen.getByRole("button", { name: /^Nhãn:/ })).toHaveTextContent("Nhãn: VIP");

    // Bấm chip mở lại bảng, con trỏ ở ô của chip.
    await userEvent.click(screen.getByRole("button", { name: /^Nhãn:/ }));
    expect(screen.getByRole("textbox", { name: "Nhãn khách hàng" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));

    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Riêng" }));
    expect(onBoThem).toHaveBeenLastCalledWith("rieng");
    await userEvent.click(screen.getByRole("button", { name: "Xoá hết" }));
    expect(onBoThem).toHaveBeenLastCalledWith(null);
  });
});
