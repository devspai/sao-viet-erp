import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BuocVatTu from "./BuocVatTu";

const DM = [
  { id: 1, ma: "SUP", ten: "Support", chips: [
    { ma: "dai_support", ten: "Dài support", don_vi: "mm" },
    { ma: "rong_support", ten: "Rộng support", don_vi: "mm" } ] },
  { id: 2, ma: "KEO", ten: "Keo dán", chips: [] },
];
let n = 0;
const props = (over = {}) => ({
  tenBuoc: "Cán màng", dong: [], vatTuDm: DM as never, onChange: vi.fn(), taoUid: () => `u${++n}`, ...over,
});

describe("BuocVatTu", () => {
  it("bước chưa có vật tư thì nói rõ", () => {
    render(<BuocVatTu {...props()} />);
    expect(screen.getByText(/chưa có vật tư/i)).toBeTruthy();
  });

  it("vật tư có chip → mọc đúng ô nhập, gõ số báo ra ngoài", () => {
    const onChange = vi.fn();
    render(<BuocVatTu {...props({ onChange, dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: {} }] })} />);
    fireEvent.change(screen.getByLabelText(/Dài support/), { target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith([{ uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 5 } }]);
    expect(screen.getByLabelText(/Rộng support/)).toBeTruthy();
  });

  it("vật tư không chip thì không có ô nhập", () => {
    render(<BuocVatTu {...props({ dong: [{ uid: "b", vat_tu_id: 2, gia_tri_chip: {} }] })} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("xoá bớt và thêm vật tư chưa có", () => {
    const onChange = vi.fn();
    render(<BuocVatTu {...props({ onChange, dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: {} }] })} />);
    fireEvent.click(screen.getByRole("button", { name: /Xóa vật tư Support/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith([
      { uid: "a", vat_tu_id: 1, gia_tri_chip: {} }, { uid: "u1", vat_tu_id: 2, gia_tri_chip: {} }]);
  });

  it("ô để trống → bỏ khỏi gia_tri_chip (không gửi NaN)", () => {
    const onChange = vi.fn();
    render(<BuocVatTu {...props({ onChange, dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 5 } }] })} />);
    fireEvent.change(screen.getByLabelText(/Dài support/), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith([{ uid: "a", vat_tu_id: 1, gia_tri_chip: {} }]);
  });
});
