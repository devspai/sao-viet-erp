import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BuocVatTu, { nhanNgan, tomTatBuoc } from "./BuocVatTu";

vi.mock("./tenDonVi", () => ({
  useNapTenDonVi: () => 1,
  tenDonVi: (ma?: string | null) => ({ mm: "milimét", ghi: "gam" } as Record<string, string>)[ma ?? ""],
}));

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

  it("đơn vị hiện bằng TÊN trong danh mục, mã lạ thì không in mã trần", () => {
    const dm = [{ id: 3, ma: "X", ten: "Cũ", chips: [{ ma: "a", ten: "Dài", don_vi: "mm" }, { ma: "b", ten: "Rộng", don_vi: "khong_co" }] }];
    render(<BuocVatTu {...props({ vatTuDm: dm as never, dong: [{ uid: "c", vat_tu_id: 3, gia_tri_chip: {} }] })} />);
    expect(screen.getByText("milimét")).toBeTruthy();
    expect(screen.queryByText("mm")).toBeNull();
    expect(screen.queryByText("khong_co")).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: /Thêm vật tư vào bước/ }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Keo dán/ }));
    expect(onChange).toHaveBeenLastCalledWith([
      { uid: "a", vat_tu_id: 1, gia_tri_chip: {} }, { uid: "u1", vat_tu_id: 2, gia_tri_chip: {} }]);
  });

  it("ô để trống → bỏ khỏi gia_tri_chip (không gửi NaN)", () => {
    const onChange = vi.fn();
    render(<BuocVatTu {...props({ onChange, dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 5 } }] })} />);
    fireEvent.change(screen.getByLabelText(/Dài support/), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith([{ uid: "a", vat_tu_id: 1, gia_tri_chip: {} }]);
  });

  it("ô chip hiện NHÃN NGẮN, tên đầy đủ vẫn ở tooltip + aria-label", () => {
    render(<BuocVatTu {...props({ dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: {} }] })} />);
    expect(screen.getByText("Dài")).toBeTruthy();
    expect(screen.getByText("Rộng")).toBeTruthy();
    expect(screen.queryByText("Dài support")).toBeNull();
    const o = screen.getByLabelText("Dài support");
    expect(o.closest("label")?.getAttribute("title")).toMatch(/^Dài support/);
  });

  it("ô chip chưa có số thì viền cảnh báo, có số thì hết", () => {
    render(<BuocVatTu {...props({ dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 5 } }] })} />);
    expect(screen.getByLabelText("Dài support").closest("label")?.className).not.toMatch(/--trong/);
    expect(screen.getByLabelText("Rộng support").closest("label")?.className).toMatch(/tg-bvt__o--trong/);
  });

  it("vật tư không chip thành thẻ nhỏ chung hàng với nút Thêm", () => {
    const { container } = render(<BuocVatTu {...props({ dong: [{ uid: "b", vat_tu_id: 2, gia_tri_chip: {} }] })} />);
    const hang = container.querySelector(".tg-bvt__tags")!;
    expect(hang.querySelector(".tg-bvt__tag")?.textContent).toMatch(/Keo dán/);
    expect(hang.querySelector('[aria-label^="Thêm vật tư vào bước"]')).toBeTruthy();
  });
});

describe("nhanNgan", () => {
  it("bỏ cụm trùng tên vật tư, không phân biệt hoa thường/dấu", () => {
    expect(nhanNgan("Dài support", "Support")).toBe("Dài");
    expect(nhanNgan("Định lượng support", "SUPPORT")).toBe("Định lượng");
    expect(nhanNgan("Độ dày màng BOPP", "mang bopp")).toBe("Độ dày");
  });
  it("bỏ xong rỗng hoặc không trùng thì giữ nguyên tên chip", () => {
    expect(nhanNgan("Support", "Support")).toBe("Support");
    expect(nhanNgan("Chiều dài", "Support")).toBe("Chiều dài");
    expect(nhanNgan("Supportx dài", "Support")).toBe("Supportx dài");
  });
});

describe("tomTatBuoc", () => {
  it("đếm vật tư và ô chip chưa nhập số", () => {
    expect(tomTatBuoc([
      { uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 5 } },
      { uid: "b", vat_tu_id: 2, gia_tri_chip: {} },
    ], DM as never)).toEqual({ so: 2, chipTrong: 1 });
    expect(tomTatBuoc([], DM as never)).toEqual({ so: 0, chipTrong: 0 });
  });
});
