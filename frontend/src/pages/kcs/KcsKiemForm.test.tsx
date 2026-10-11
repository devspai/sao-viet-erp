import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { api, type SxKcsCongDoan, type SxKcsKiemKetQua, type SxKcsLenhDau } from "../../api/client";
import { KcsKiemForm } from "./KcsKiemForm";

vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));

const lenh = { id: 4, ma: "LSX26-0004", ten: "Hộp bánh", khach: null, nhom_id: null, nhom_ma: null, nhom_trang_thai: null } as SxKcsLenhDau;
// 120 tổ làm − (50 đạt + 3 lỗi) đã kiểm = 67 chưa kiểm.
const cd = {
  cong_viec_id: 11, ten: "Bế", phan_doan_so: 1, phan_doan_tong: 1, to_id: 3, to_ten: "Tổ bế",
  trang_thai: "running", tot: 120, hong: 0, don_vi: "con", la_kcs_cuoi: true, checklist: [],
  so_lan_kiem: 2, tong_dat: 50, tong_loi: 3, loi_tai_cho: 3, da_yeu_cau_kho: 0, con_gui_kho: 0, yeu_cau_kho: [], lan_kiem: [],
  so_luong_ra: null, may: null, ghi_chu_ky_thuat: null, quy_cach: null, me: [],
} as SxKcsCongDoan;

// Tiêu chí gộp: In của lệnh phụ (cv 9) xếp trước, Bế là chính bước cuối (cv 11).
const checklist = [
  { cong_viec_id: 9, ten_cong_doan: "In offset", thu_tu: 1, ten: "Đúng màu", la_lenh_phu: true, lsx_ma: "LSX26-0003", ten_lenh: "Ruột" },
  { cong_viec_id: 11, ten_cong_doan: "Bế", thu_tu: 1, ten: "Bế đúng đường", lsx_ma: "LSX26-0004" },
  { cong_viec_id: 11, ten_cong_doan: "Bế", thu_tu: 2, ten: "Mép bế sạch", lsx_ma: "LSX26-0004" },
] as SxKcsCongDoan["checklist"];
const nguon_loi = [
  { cong_viec_id: 9, ten: "In offset", lsx_ma: "LSX26-0003", to_ten: "Tổ in", la_dang_kiem: false },
  { cong_viec_id: 10, ten: "Gỡ phôi", lsx_ma: "LSX26-0004", to_ten: "Tổ gỡ", la_dang_kiem: false },
  { cong_viec_id: 11, ten: "Bế", lsx_ma: "LSX26-0004", to_ten: "Tổ bế", la_dang_kiem: true },
];
const cdTc = { ...cd, checklist, nguon_loi } as SxKcsCongDoan;

const anh = (ten: string) => new File(["x"], ten, { type: "image/png" });

function chon(nhan: string, ...files: File[]) {
  const o = screen.getByLabelText(nhan) as HTMLInputElement;
  Object.defineProperty(o, "files", { value: files, configurable: true });
  fireEvent.change(o);
}

const luu = () => screen.getByRole("button", { name: "Lưu kết quả kiểm" }) as HTMLButtonElement;
const lyDo = () => document.querySelector(".kgl-day__ly:not(.is-ok)")?.textContent ?? null;

let dem = 0;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:anh-${++dem}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("KcsKiemForm · tick tiêu chí không đạt", () => {
  it("chia nhóm theo lệnh rồi công đoạn; không tick gì là tất cả đạt", async () => {
    const kiem = vi.spyOn(api.sanXuat, "kiemCongDoan").mockResolvedValue({} as SxKcsKiemKetQua);
    render(<KcsKiemForm lenh={lenh} cd={cdTc} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(Array.from(document.querySelectorAll(".kkf2-lenh__h")).map((x) => x.textContent))
      .toEqual(["RuộtLSX26-0003", "Hộp bánhLSX26-0004"]);
    expect(Array.from(document.querySelectorAll(".kkf2-cd__h")).map((x) => x.textContent)).toEqual(["In offset", "Bế"]);
    // Không còn nút Đạt / Có lỗi từng công đoạn.
    expect(screen.queryByRole("button", { name: /Có lỗi/ })).toBeNull();
    expect(lyDo()).toBeNull();
    expect(document.querySelector(".kgl-day")?.textContent).toContain("Lần này kiểm67 con");
    expect(document.querySelector(".kgl-day")?.textContent).toContain("Đạt 67");

    fireEvent.click(luu());
    await waitFor(() => expect(kiem).toHaveBeenCalledTimes(1));
    const body = kiem.mock.calls[0][2];
    expect(body.so_loi).toBe(0);
    expect(body.loi).toEqual([]);
    expect(body.checklist).toEqual([
      { cong_viec_id: 9, thu_tu: 1, dat: true, ghi_chu: null },
      { cong_viec_id: 11, thu_tu: 1, dat: true, ghi_chu: null },
      { cong_viec_id: 11, thu_tu: 2, dat: true, ghi_chu: null },
    ]);
  });

  it("tick tiêu chí: số lỗi rồi ảnh mới lưu được; gửi thu_tu + công đoạn chịu, số trừ vào đạt", async () => {
    const kiem = vi.spyOn(api.sanXuat, "kiemCongDoan").mockResolvedValue({} as SxKcsKiemKetQua);
    render(<KcsKiemForm lenh={lenh} cd={cdTc} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mép bế sạch" }));
    expect(lyDo()).toBe("Nhập số lỗi cho Mép bế sạch");
    expect(luu().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Số lỗi Mép bế sạch"), { target: { value: "80" } });
    expect(lyDo()).toBe("Chụp ít nhất một ảnh cho Mép bế sạch");
    fireEvent.click(screen.getByRole("button", { name: /Chụp ảnh/ }));
    chon("Chụp ảnh lỗi", anh("be.png"));
    await screen.findByAltText("be.png");
    expect(lyDo()).toBe("Tổng lỗi vượt số chưa kiểm (67 con)");
    fireEvent.change(screen.getByLabelText("Số lỗi Mép bế sạch"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Ghi chú Mép bế sạch"), { target: { value: "góc trái" } });
    expect(lyDo()).toBeNull();
    expect(document.querySelector(".kgl-day")?.textContent).toContain("Đạt 62");

    // Tiêu chí của lệnh phụ ⇒ lỗi quy về công việc nguồn của nó.
    fireEvent.click(screen.getByRole("checkbox", { name: "Đúng màu" }));
    fireEvent.change(screen.getByLabelText("Số lỗi Đúng màu"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Chọn ảnh/ }));
    chon("Chọn ảnh lỗi", anh("mau.png"));
    await screen.findByAltText("mau.png");

    fireEvent.click(luu());
    await waitFor(() => expect(kiem).toHaveBeenCalledTimes(1));
    const body = kiem.mock.calls[0][2];
    expect(body.so_loi).toBe(7);
    expect(body.checklist!.map((k) => [k.cong_viec_id, k.thu_tu, k.dat])).toEqual([[9, 1, false], [11, 1, true], [11, 2, false]]);
    expect(body.loi!.map((d) => [d.cong_viec_id, d.thu_tu, d.so_luong, d.mo_ta, d.files.map((f) => f.name)])).toEqual([
      [9, 1, 2, "", ["mau.png"]],
      [null, 2, 5, "góc trái", ["be.png"]],
    ]);
  });

  it("bỏ tick là bỏ dòng (dọn ảnh); dòng gọn lại khi bấm Xong, bấm Sửa mở lại", async () => {
    render(<KcsKiemForm lenh={lenh} cd={cdTc} onClose={vi.fn()} onSaved={vi.fn()} />);
    const o = screen.getByRole("checkbox", { name: "Bế đúng đường" });
    fireEvent.click(o);
    fireEvent.change(screen.getByLabelText("Số lỗi Bế đúng đường"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Chụp ảnh/ }));
    chon("Chụp ảnh lỗi", anh("a.png"));
    await screen.findByAltText("a.png");
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(screen.queryByLabelText("Số lỗi Bế đúng đường")).toBeNull();
    expect(screen.getByText("3 con")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
    expect(screen.getByLabelText("Số lỗi Bế đúng đường")).toBeTruthy();
    fireEvent.click(o);
    expect(screen.queryByLabelText("Số lỗi Bế đúng đường")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(lyDo()).toBeNull();
  });
});

describe("KcsKiemForm · Lỗi khác", () => {
  it("ghi chú bắt buộc, chọn công đoạn gây lỗi; ảnh cộng dồn, bỏ được từng ảnh", async () => {
    const kiem = vi.spyOn(api.sanXuat, "kiemCongDoan").mockResolvedValue({} as SxKcsKiemKetQua);
    render(<KcsKiemForm lenh={lenh} cd={cdTc} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Lỗi khác" }));
    fireEvent.change(screen.getByLabelText("Số lỗi Lỗi khác"), { target: { value: "3" } });
    expect(lyDo()).toBe("Ghi chú Lỗi khác là lỗi gì");
    fireEvent.change(screen.getByLabelText("Ghi chú Lỗi khác"), { target: { value: "Rách khi gỡ" } });
    const sel = screen.getByLabelText("Lỗi do công đoạn nào") as HTMLSelectElement;
    expect(Array.from(sel.options).map((x) => x.textContent)).toEqual([
      "In offset (lệnh LSX26-0003) — Tổ in", "Gỡ phôi — Tổ gỡ", "Bế — Tổ bế",
    ]);
    expect(sel.value).toBe("11");
    fireEvent.change(sel, { target: { value: "10" } });
    expect((screen.getByLabelText("Chụp ảnh lỗi") as HTMLInputElement).getAttribute("capture")).toBe("environment");
    chon("Chụp ảnh lỗi", anh("chup-1.png"));
    await screen.findByAltText("chup-1.png");
    chon("Chọn ảnh lỗi", anh("co-san-1.png"), anh("co-san-2.png"));
    await screen.findByAltText("co-san-2.png");
    expect(screen.getByAltText("chup-1.png")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh co-san-1.png" }));
    expect(screen.queryByAltText("co-san-1.png")).toBeNull();

    fireEvent.click(luu());
    await waitFor(() => expect(kiem).toHaveBeenCalledTimes(1));
    const body = kiem.mock.calls[0][2];
    expect(body.lsx_id).toBe(4);
    expect(body.loi!.map((d) => [d.cong_viec_id, d.thu_tu, d.so_luong, d.mo_ta, d.files.map((f) => f.name)])).toEqual([
      [10, null, 3, "Rách khi gỡ", ["chup-1.png", "co-san-2.png"]],
    ]);
  });

  it("lệnh không có tiêu chí: chỉ còn dòng Lỗi khác, không có ô chọn công đoạn khi chỉ một nguồn", () => {
    render(<KcsKiemForm lenh={lenh} cd={cd} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/Lệnh không giữ tiêu chí nào/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Lỗi khác" }));
    expect(screen.queryByLabelText("Lỗi do công đoạn nào")).toBeNull();
  });

  it("tổ chưa ghi thêm gì từ lần kiểm trước ⇒ nói rõ, không cho lưu", () => {
    render(<KcsKiemForm lenh={lenh} cd={{ ...cd, tot: 53 }} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/chưa có gì để kiểm/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(luu().disabled).toBe(true);
  });
});

describe("KcsKiemForm · bối cảnh để kiểm", () => {
  const me = (id: number, so_luong: number, gio: string) => ({
    id, so_luong, bat_dau: `2026-09-18T${gio}:00`, ket_thuc: `2026-09-18T${gio}:30`, don_vi: "con",
    nguoi_ghi: "Tổ trưởng A", nguoi: ["Thợ B", "Thợ C"],
  });

  it("đầu ngăn một dòng số; quy cách và dặn dò ở Đối chiếu; lần ghi chưa kiểm (mới nhất trước)", () => {
    // Chưa kiểm 67 = lần ghi 30 mới nhất + 37 của lần 50 kế đó; lần 40 cũ nhất đã kiểm.
    const cdDu = {
      ...cd, may: "Máy bế 1", so_luong_ra: 200, ghi_chu_ky_thuat: "Bế nhẹ tay, giữ mép",
      quy_cach: { giay: "C300", so_mau: 4 },
      me: [me(3, 30, "10:00"), me(2, 50, "09:00"), me(1, 40, "08:00")],
    } as SxKcsCongDoan;
    render(<KcsKiemForm lenh={lenh} cd={cdDu} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Kiểm hàng Bế" })).toBeTruthy();
    expect(screen.getByText("LSX26-0004")).toBeTruthy();
    expect(screen.getByText("Máy bế 1")).toBeTruthy();
    expect(document.querySelector(".kgl-so")?.textContent).toBe("Tổ đã làm120 / 200 conChưa kiểm67 con");
    const doiChieu = screen.getByRole("region", { name: "Đối chiếu" });
    expect(within(doiChieu).getByText("C300")).toBeTruthy();
    expect(within(doiChieu).getByText("Bế nhẹ tay, giữ mép")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("tab", { name: /Tổ đã ghi/ })[0]);
    const dong = document.querySelectorAll(".kkf-me__it");
    expect(Array.from(dong).map((d) => d.querySelector(".kkf-me__tt")?.textContent)).toEqual([
      "Chưa kiểm", "Còn 37 chưa kiểm", "Đã kiểm",
    ]);
    expect(Array.from(dong).map((d) => d.querySelector(".kkf-me__viec")?.textContent))
      .toEqual(["Sản lượng lần 3", "Sản lượng lần 2", "Sản lượng lần 1"]);
    expect(dong[0].textContent).toContain("Thợ B, Thợ C");
    expect(dong[0].textContent).toContain("ghi: Tổ trưởng A");
    expect(screen.getByText("Chưa có lần kiểm nào.")).toBeTruthy();
  });

  it("quá 5 lần ghi thì gấp, bấm Xem thêm mới hiện lần cũ", () => {
    const nhieu = Array.from({ length: 7 }, (_, i) => me(10 - i, 10, `0${i + 1}:00`));
    render(<KcsKiemForm lenh={lenh} cd={{ ...cd, me: nhieu } as SxKcsCongDoan} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("tab", { name: /Tổ đã ghi/ })[0]);
    expect(document.querySelectorAll(".kkf-me__it")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm 2 lần ghi cũ hơn" }));
    expect(document.querySelectorAll(".kkf-me__it")).toHaveLength(7);
  });
});
