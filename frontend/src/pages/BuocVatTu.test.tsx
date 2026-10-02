import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BuocVatTu, { nhanNgan, soOChipTrong } from "./BuocVatTu";

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
  it("bước chưa có vật tư: không câu chữ thừa, chỉ có nút + vật tư", () => {
    const { container } = render(<BuocVatTu {...props()} />);
    expect(screen.queryByText(/chưa có vật tư/i)).toBeNull();
    expect(screen.queryByText(/Vật tư của bước/)).toBeNull();
    expect(container.querySelectorAll(".tg-bvt__tag, .tg-bvt__dong").length).toBe(0);
    expect(screen.getByRole("button", { name: /Thêm vật tư vào bước Cán màng/ }).textContent).toMatch(/\+ vật tư/);
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

  it("chưa nhập ≠ đã nhập 0: ô trống không placeholder \"0\", ô 0 hiện 0 viền thường", () => {
    const onChange = vi.fn();
    render(<BuocVatTu {...props({ onChange, dong: [{ uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 0 } }] })} />);
    const dai = screen.getByLabelText("Dài support") as HTMLInputElement;
    const rong = screen.getByLabelText("Rộng support") as HTMLInputElement;
    expect(dai.value).toBe("0");
    expect(dai.closest("label")?.className).not.toMatch(/--trong/);
    expect(rong.value).toBe("");
    expect(rong.getAttribute("placeholder") ?? "").toBe("");
    expect(rong.closest("label")?.className).toMatch(/--trong/);
    fireEvent.change(rong, { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith([
      { uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 0, rong_support: 0 } }]);
  });

  it("vật tư có chip mỗi món một dòng lưới trước; thẻ vật tư không chip + '+ vật tư' chung một hàng sau", () => {
    const dm = [...DM, { id: 4, ma: "MUC", ten: "Mực", chips: [] }];
    const { container } = render(<BuocVatTu {...props({ vatTuDm: dm as never, dong: [
      { uid: "b", vat_tu_id: 2, gia_tri_chip: {} }, { uid: "a", vat_tu_id: 1, gia_tri_chip: {} }] })} />);
    const khoi = container.querySelector(".tg-bvt")!;
    expect(Array.from(khoi.children).map((e) => e.className)).toEqual(["tg-bvt__dong", "tg-bvt__hang"]);
    const dong = khoi.querySelector(".tg-bvt__dong")!;
    expect(Array.from(dong.children).map((e) => e.className))
      .toEqual(["tg-bvt__ten", "tg-bvt__luoi", "tg-bvt__xoa"]);
    expect(dong.querySelector(".tg-bvt__ten")?.textContent).toBe("Support");
    const hang = khoi.querySelector(".tg-bvt__hang")!;
    expect(Array.from(hang.children).map((e) => e.className)).toEqual(["tg-bvt__tag", "tg-bvt__them"]);
    expect(hang.querySelector(".tg-bvt__tag")?.textContent).toMatch(/Keo dán/);
    expect(hang.querySelector('[aria-label^="Thêm vật tư vào bước"]')).toBeTruthy();
  });

  it("vật tư 5 chip: đủ 5 ô trong MỘT lưới, nhãn nằm trên khung ô", () => {
    const ten = ["Dài", "Rộng", "Số dao", "Dài đường bế", "Độ dày"];
    const dm = [{ id: 9, ma: "KB", ten: "Khuôn bế", chips: ten.map((t, k) => ({ ma: `c${k}`, ten: t, don_vi: "mm" })) }];
    const { container } = render(<BuocVatTu {...props({ vatTuDm: dm as never, dong: [
      { uid: "k", vat_tu_id: 9, gia_tri_chip: { c0: 420 } }] })} />);
    const luoi = container.querySelectorAll(".tg-bvt__luoi");
    expect(luoi).toHaveLength(1);
    const o = luoi[0].querySelectorAll(".tg-bvt__o");
    expect(o).toHaveLength(5);
    expect(Array.from(o[0].children).map((e) => e.className)).toEqual(["tg-bvt__o-nhan", "tg-bvt__o-khung"]);
    expect(container.querySelectorAll(".tg-bvt__o--trong")).toHaveLength(4);
  });
});

describe("soOChipTrong", () => {
  it("đếm ô chưa nhập theo chip danh mục; đã nhập 0 không tính", () => {
    expect(soOChipTrong([
      { uid: "a", vat_tu_id: 1, gia_tri_chip: { dai_support: 0 } },
      { uid: "b", vat_tu_id: 2, gia_tri_chip: {} },
    ], DM as never)).toBe(1);
    expect(soOChipTrong([], DM as never)).toBe(0);
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
