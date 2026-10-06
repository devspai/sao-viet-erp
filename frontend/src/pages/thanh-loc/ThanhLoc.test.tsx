import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BadgeCheck, Banknote, Users } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ThanhLoc } from "./ThanhLoc";
import type { KyDS } from "./ky-danh-sach";
import { dkTheoTab, type DieuKien } from "./thanh-loc";

type L = { khach?: number; duyet: string[]; gia_tu?: number; gia_den?: number };

const DK: DieuKien<L>[] = [
  {
    khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true,
    giaTri: [{ value: "3", nhan: "BIBICA", so: 2 }, { value: "4", nhan: "CAO LỢI HƯNG", so: 1 }],
    doc: (l) => (l.khach == null ? undefined : String(l.khach)),
    ghi: (l, v) => ({ ...l, khach: v == null ? undefined : Number(v) }),
  },
  {
    khoa: "duyet", nhan: "Kết quả duyệt", icon: BadgeCheck, kieu: "nhieu",
    giaTri: [{ value: "cho", nhan: "Đang chờ duyệt" }, { value: "duyet", nhan: "Đã duyệt" }],
    doc: (l) => l.duyet,
    ghi: (l, v) => ({ ...l, duyet: v }),
  },
  {
    khoa: "gia", nhan: "Giá bán", icon: Banknote, kieu: "khoang", donVi: "đ",
    doc: (l) => [l.gia_tu, l.gia_den],
    ghi: (l, tu, den) => ({ ...l, gia_tu: tu, gia_den: den }),
  },
];

/** Dựng thanh lọc TRONG một form tìm kiếm như màn Báo giá — để bắt lỗi form lồng form. */
function KhungThu({ locDau = { duyet: [] }, onGuiForm }: { locDau?: L; onGuiForm: () => void }) {
  const [loc, setLoc] = useState<L>(locDau);
  const [ky, setKy] = useState<KyDS>({ loai: "tat_ca", moc: "tao" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGuiForm();
      }}
    >
      <ThanhLoc ky={ky} moc={[["tao", "Ngày tạo"], ["gui", "Ngày gửi khách"]]} onKy={setKy}
        dieuKien={DK} loc={loc} onLoc={setLoc} />
      <output data-testid="loc">{JSON.stringify(loc)}</output>
      <output data-testid="ky">{JSON.stringify(ky)}</output>
    </form>
  );
}

const loc = () => JSON.parse(screen.getByTestId("loc").textContent ?? "{}");

describe("ThanhLoc", () => {
  it("Lọc → Khách hàng → chọn một khách: áp ngay, đóng menu, hiện khối có số đếm trong menu con", async () => {
    const user = userEvent.setup();
    render(<KhungThu onGuiForm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Khách hàng/ }));
    const bibica = screen.getByRole("radio", { name: /BIBICA/ });
    expect(bibica).toHaveTextContent("2");
    await user.click(bibica);
    expect(loc().khach).toBe(3);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Khách hàng: BIBICA. Bấm để sửa" })).toBeInTheDocument();
  });

  it("điều kiện lấy từ dữ liệu (tim) có ô tìm dù chỉ 2 giá trị, gõ không dấu vẫn khớp; danh sách cố định ngắn thì không", async () => {
    const user = userEvent.setup();
    render(<KhungThu onGuiForm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Khách hàng/ }));
    await user.type(screen.getByRole("textbox", { name: "Tìm Khách hàng" }), "loi hung");
    expect(screen.queryByRole("radio", { name: /BIBICA/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /CAO LỢI HƯNG/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("menuitem", { name: /Kết quả duyệt/ }));
    expect(screen.queryByRole("textbox", { name: "Tìm Kết quả duyệt" })).toBeNull();
  });

  it("chọn nhiều: tích từng giá trị, menu vẫn mở", async () => {
    const user = userEvent.setup();
    render(<KhungThu onGuiForm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Kết quả duyệt/ }));
    await user.click(screen.getByRole("checkbox", { name: /Đang chờ duyệt/ }));
    await user.click(screen.getByRole("checkbox", { name: /Đã duyệt/ }));
    expect(loc().duyet).toEqual(["cho", "duyet"]);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("khoảng tiền: Enter áp điều kiện và KHÔNG gửi form tìm kiếm bao ngoài", async () => {
    const user = userEvent.setup();
    const onGuiForm = vi.fn();
    render(<KhungThu onGuiForm={onGuiForm} />);
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Giá bán/ }));
    const tu = screen.getByLabelText("Từ");
    expect(tu).toHaveFocus();
    await user.type(tu, "5000000");
    expect(tu).toHaveValue("5.000.000");
    await user.keyboard("{Enter}");
    expect(loc().gia_tu).toBe(5_000_000);
    expect(onGuiForm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Giá bán: từ 5\.000\.000 đ/ })).toBeInTheDocument();
  });

  it("khoảng ngược (Từ > Đến) thì báo lỗi, không áp", async () => {
    const user = userEvent.setup();
    render(<KhungThu onGuiForm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Giá bán/ }));
    await user.type(screen.getByLabelText("Từ"), "9");
    await user.type(screen.getByLabelText("Đến"), "1");
    expect(screen.getByRole("alert")).toHaveTextContent('Số "Từ" đang lớn hơn số "Đến".');
    expect(screen.getByRole("button", { name: "Áp dụng" })).toBeDisabled();
  });

  it("× trên khối chỉ bỏ điều kiện đó; Xoá lọc bỏ hết", async () => {
    const user = userEvent.setup();
    render(<KhungThu locDau={{ khach: 3, duyet: ["cho"], gia_tu: 1 }} onGuiForm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Bỏ lọc Giá bán" }));
    expect(loc()).toEqual({ khach: 3, duyet: ["cho"] });
    await user.click(screen.getByRole("button", { name: "Xoá lọc" }));
    expect(loc()).toEqual({ duyet: [] });
    expect(screen.queryByRole("button", { name: "Xoá lọc" })).toBeNull();
  });

  it("Esc trong menu con lùi về menu điều kiện, Esc lần nữa đóng hẳn", async () => {
    const user = userEvent.setup();
    render(<KhungThu onGuiForm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Khách hàng/ }));
    expect(screen.getByRole("radiogroup", { name: "Khách hàng" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("radiogroup", { name: "Khách hàng" })).toBeNull();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("kỳ: đổi Tính theo giữ bảng mở; chọn kỳ thì áp và đóng", async () => {
    const user = userEvent.setup();
    render(<KhungThu onGuiForm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Mọi thời gian/ }));
    await user.click(screen.getByRole("radio", { name: "Ngày gửi khách" }));
    expect(screen.getByRole("dialog", { name: "Kỳ xem danh sách" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Quý này/ }));
    expect(JSON.parse(screen.getByTestId("ky").textContent ?? "{}")).toEqual({ moc: "gui", loai: "quy" });
    expect(screen.queryByRole("dialog", { name: "Kỳ xem danh sách" })).toBeNull();
    expect(screen.getByRole("button", { name: /Quý này theo ngày gửi khách/ })).toBeInTheDocument();
  });

  it("Trạng thái theo tab: chọn trong Lọc là đổi tab, × là về Tất cả", async () => {
    const user = userEvent.setup();
    function Khung() {
      const [tab, setTab] = useState("all");
      const [l, setL] = useState<L>({ duyet: [] });
      const dk = [dkTheoTab<L>({
        tabs: [{ id: "all", nhan: "Tất cả" }, { id: "cho", nhan: "Chờ duyệt", so: 3 }, { id: "xong", nhan: "Hoàn tất", so: 1 }],
        tatCa: "all", dang: tab, dat: setTab,
      })];
      return (
        <>
          <ThanhLoc dieuKien={dk} loc={l} onLoc={setL} />
          <output data-testid="tab">{tab}</output>
        </>
      );
    }
    render(<Khung />);
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Trạng thái/ }));
    expect(screen.queryByRole("radio", { name: /Tất cả/ })).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Chờ duyệt/ }));
    expect(screen.getByTestId("tab")).toHaveTextContent("cho");
    await user.click(screen.getByRole("button", { name: /Bỏ lọc Trạng thái/ }));
    expect(screen.getByTestId("tab")).toHaveTextContent("all");
  });
});

