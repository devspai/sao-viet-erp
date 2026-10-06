/** Bộ lọc nâng cao: mở/đóng không áp, chỉ nút "Xem n …" mới áp; chip đã áp bỏ được từng cái. */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Select } from "../../../components/Select";
import { BoLocNangCao, ChipDaAp, ChonNhieu, KhoangTien, NhomNut, O } from "./BoLocNangCao";

function Bao({ onAp = vi.fn(), onMo }: { onAp?: () => void; onMo?: (b: boolean) => void }) {
  const [mo, setMo] = useState(false);
  return (
    <>
      <BoLocNangCao soDieuKien={3} mo={mo} onMo={(b) => { setMo(b); onMo?.(b); }} khop={6} donVi="phiếu"
        onXoaHet={vi.fn()} onAp={onAp}>
        <O nhan="Người nhận"><input aria-label="Người nhận" /></O>
      </BoLocNangCao>
      <button type="button">Ngoài</button>
    </>
  );
}

describe("BoLocNangCao", () => {
  it("nút Bộ lọc mang viên số, mở bảng, nút chân áp rồi đóng", async () => {
    const onAp = vi.fn();
    const onMo = vi.fn();
    render(<Bao onAp={onAp} onMo={onMo} />);
    const nut = screen.getByRole("button", { name: /Bộ lọc/ });
    expect(nut).toHaveTextContent("3");
    expect(screen.queryByText("Bộ lọc nâng cao")).toBeNull();
    await userEvent.click(nut);
    expect(screen.getByText("Bộ lọc nâng cao")).toBeInTheDocument();
    expect(screen.getByText("Khớp 6 phiếu trong kỳ")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Xem 6 phiếu" }));
    expect(onAp).toHaveBeenCalledTimes(1);
    expect(onMo).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("Bộ lọc nâng cao")).toBeNull();
  });

  it("Esc và bấm ngoài đóng KHÔNG áp", async () => {
    const onAp = vi.fn();
    render(<Bao onAp={onAp} />);
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Bộ lọc nâng cao")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Bộ lọc/ }));
    await userEvent.click(screen.getByRole("textbox", { name: "Người nhận" }));
    expect(screen.getByText("Bộ lọc nâng cao")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ngoài" }));
    expect(screen.queryByText("Bộ lọc nâng cao")).toBeNull();
    expect(onAp).not.toHaveBeenCalled();
  });

  it("chưa đếm xong thì nút chân ghi chung, không bịa số", async () => {
    render(
      <BoLocNangCao soDieuKien={0} mo onMo={vi.fn()} khop={null} donVi="phiếu" onXoaHet={vi.fn()} onAp={vi.fn()}>
        <span />
      </BoLocNangCao>,
    );
    expect(screen.getByRole("button", { name: "Xem phiếu" })).toBeInTheDocument();
    expect(screen.queryByText(/Khớp/)).toBeNull();
  });

  it("ChipDaAp bấm × gọi onBo(khoa), bấm chip gọi onSua(khoa)", async () => {
    const onBo = vi.fn();
    const onSua = vi.fn();
    const onXoaHet = vi.fn();
    render(
      <ChipDaAp chips={[{ khoa: "tien", nhan: "Số tiền", giaTri: "từ 5.000.000" }, { khoa: "nguon", nhan: "Nguồn", giaTri: "Đơn mua" }]}
        onBo={onBo} onSua={onSua} onXoaHet={onXoaHet} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lọc Số tiền" }));
    expect(onBo).toHaveBeenCalledWith("tien");
    expect(onSua).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Nguồn: Đơn mua" }));
    expect(onSua).toHaveBeenCalledWith("nguon");
    await userEvent.click(screen.getByRole("button", { name: "Xoá hết" }));
    expect(onXoaHet).toHaveBeenCalled();
  });
});

describe("ô chọn (Select) bên trong bảng lọc", () => {
  function BaoSelect({ portal }: { portal: boolean }) {
    const [mo, setMo] = useState(true);
    const [nguoi, setNguoi] = useState<string | null>(null);
    return (
      <BoLocNangCao soDieuKien={0} mo={mo} onMo={setMo} khop={6} donVi="phiếu" onXoaHet={vi.fn()} onAp={vi.fn()}>
        <O nhan="Người lập">
          <Select<string | null> ariaLabel="Người lập" portal={portal} value={nguoi} onChange={setNguoi}
            options={[{ value: null, label: "Mọi người" }, { value: "luyen", label: "Nguyễn Thị Luyến" }]} />
        </O>
      </BoLocNangCao>
    );
  }

  it.each([false, true])("Esc chỉ đóng danh sách của ô chọn, bảng lọc còn mở (portal=%s)", async (portal) => {
    render(<BaoSelect portal={portal} />);
    await userEvent.click(screen.getByRole("button", { name: "Người lập" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("Bộ lọc nâng cao")).toBeInTheDocument();
    // Esc lần nữa (danh sách đã đóng) mới đóng bảng lọc.
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Bộ lọc nâng cao")).toBeNull();
  });

  it.each([false, true])("chọn một lựa chọn giữ bảng lọc mở (portal=%s)", async (portal) => {
    render(<BaoSelect portal={portal} />);
    await userEvent.click(screen.getByRole("button", { name: "Người lập" }));
    await userEvent.click(screen.getByRole("option", { name: "Nguyễn Thị Luyến" }));
    expect(screen.getByText("Bộ lọc nâng cao")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Người lập" })).toHaveTextContent("Nguyễn Thị Luyến");
  });
});

describe("chữ chân bảng lọc", () => {
  it("đuôi 'trong kỳ' đổi được qua prop", () => {
    render(
      <BoLocNangCao soDieuKien={0} mo onMo={vi.fn()} khop={26} donVi="khách hàng" duoiKhop="" onXoaHet={vi.fn()} onAp={vi.fn()}>
        <span />
      </BoLocNangCao>,
    );
    expect(screen.getByText("Khớp 26 khách hàng")).toBeInTheDocument();
  });
});

describe("kiểu ô trong bảng lọc", () => {
  it("KhoangTien hiện dấu chấm và trả số", async () => {
    const onDoi = vi.fn();
    render(<KhoangTien tu={5_000_000} onDoi={onDoi} />);
    expect(screen.getByLabelText("Từ")).toHaveValue("5.000.000");
    fireEvent.change(screen.getByLabelText("Đến"), { target: { value: "12.000.000" } });
    expect(onDoi).toHaveBeenLastCalledWith(5_000_000, 12_000_000);
    fireEvent.change(screen.getByLabelText("Từ"), { target: { value: "" } });
    expect(onDoi).toHaveBeenLastCalledWith(undefined, undefined);
  });

  it("NhomNut chọn một, ChonNhieu bật tắt từng viên", async () => {
    const doiMot = vi.fn();
    const doiNhieu = vi.fn();
    render(
      <>
        <NhomNut giaTri="tat_ca" luaChon={[["tat_ca", "Tất cả"], ["tm", "Tiền mặt"]]} onDoi={doiMot} />
        <ChonNhieu giaTri={["po"]} luaChon={[["po", "Đơn mua"], ["khac", "Khác"]]} onDoi={doiNhieu} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Tất cả" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Tiền mặt" }));
    expect(doiMot).toHaveBeenCalledWith("tm");
    await userEvent.click(screen.getByRole("button", { name: "Khác" }));
    expect(doiNhieu).toHaveBeenLastCalledWith(["po", "khac"]);
    await userEvent.click(screen.getByRole("button", { name: "Đơn mua" }));
    expect(doiNhieu).toHaveBeenLastCalledWith([]);
  });
});
