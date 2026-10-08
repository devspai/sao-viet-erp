import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SxDongLenhTinhTrang } from "../../api/client";
import { KcsDongLenh } from "./KcsDongLenh";

vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ token: "token-test" }) }));
const tinhTrang = vi.fn();
const dong = vi.fn();
const moLai = vi.fn();
vi.mock("../../api/client", async (goc) => ({
  ...(await goc<typeof import("../../api/client")>()),
  api: {
    sanXuat: {
      tinhTrangDongLenh: (...a: unknown[]) => tinhTrang(...a),
      dongLenh: (...a: unknown[]) => dong(...a),
      moLaiLenh: (...a: unknown[]) => moLai(...a),
    },
  },
}));

function tt(over: Partial<SxDongLenhTinhTrang> = {}): SxDongLenhTinhTrang {
  return {
    nhom_id: 4, trang_thai: "in_production", version: 1,
    lenh: [{ id: 1, ma: "LSX26-0004" }], muc_tieu: 10000, da_dat: 9690, don_vi: "hộp",
    canh_bao: [
      { ma: "chua_gui_kho", cau: "Còn 300 hộp đạt chưa gửi yêu cầu nhập kho." },
      { ma: "thieu_muc_tieu", cau: "Đạt 9.690 / 10.000 hộp — thiếu 310." },
    ],
    dong_boi: null, dong_luc: null, duoc_dong_thieu: true, ...over,
  };
}

describe("KcsDongLenh", () => {
  beforeEach(() => { tinhTrang.mockReset(); dong.mockReset(); moLai.mockReset(); });

  it("bấm Đóng lệnh → hộp xác nhận bày cảnh báo, không chặn nút", async () => {
    tinhTrang.mockResolvedValueOnce(tt())
      .mockResolvedValueOnce(tt({ trang_thai: "closed", version: 2, canh_bao: [],
        dong_boi: "KCS A", dong_luc: "2026-09-29T07:20:00Z" }));
    dong.mockResolvedValue({});
    const onDone = vi.fn();
    render(<KcsDongLenh nhomId={4} canDong onDone={onDone} />);

    fireEvent.click(await screen.findByRole("button", { name: "Đóng lệnh" }));
    expect(screen.getByText("Đóng lệnh LSX26-0004?")).toBeTruthy();
    expect(screen.getByText("Còn 300 hộp đạt chưa gửi yêu cầu nhập kho.")).toBeTruthy();
    expect(screen.getByText("Đạt 9.690 / 10.000 hộp — thiếu 310.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận đóng" }));
    await waitFor(() => expect(dong).toHaveBeenCalledWith("token-test", 4, { expected_version: 1 }));
    expect(await screen.findByText(/Đã đóng bởi KCS A/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mở lại" })).toBeTruthy();
    expect(onDone).toHaveBeenCalled();
  });

  it("nhóm nhiều lệnh thì tiêu đề liệt kê đủ", async () => {
    tinhTrang.mockResolvedValueOnce(tt({ lenh: [{ id: 1, ma: "LSX26-0004" }, { id: 2, ma: "LSX26-0005" }] }));
    render(<KcsDongLenh nhomId={4} canDong onDone={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Đóng lệnh" }));
    expect(screen.getByText("Đóng 2 lệnh: LSX26-0004, LSX26-0005?")).toBeTruthy();
  });

  it("mở lại gọi API với version", async () => {
    tinhTrang.mockResolvedValue(tt({ trang_thai: "closed", version: 3, canh_bao: [], dong_boi: "KCS A",
      dong_luc: "2026-09-29T07:20:00Z" }));
    moLai.mockResolvedValue({});
    render(<KcsDongLenh nhomId={4} canDong onDone={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mở lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận mở lại" }));
    await waitFor(() => expect(moLai).toHaveBeenCalledWith("token-test", 4, { expected_version: 3 }));
  });

  it("thiếu ô Đóng lệnh thiếu: còn cảnh báo thì nút khoá kèm lý do + danh sách việc", async () => {
    tinhTrang.mockResolvedValueOnce(tt({ duoc_dong_thieu: false }));
    render(<KcsDongLenh nhomId={4} canDong onDone={() => {}} />);
    const nut = await screen.findByRole("button", { name: "Đóng lệnh" });
    expect((nut as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Còn 2 việc chưa xong — cần quyền Đóng lệnh thiếu.")).toBeTruthy();
    expect(screen.getByText("Còn 300 hộp đạt chưa gửi yêu cầu nhập kho.")).toBeTruthy();
  });

  it("thiếu ô Đóng lệnh thiếu: hết cảnh báo vẫn đóng được, nhưng không mở lại được", async () => {
    tinhTrang.mockResolvedValueOnce(tt({ duoc_dong_thieu: false, canh_bao: [] }));
    const { unmount } = render(<KcsDongLenh nhomId={4} canDong onDone={() => {}} />);
    expect(((await screen.findByRole("button", { name: "Đóng lệnh" })) as HTMLButtonElement).disabled)
      .toBe(false);
    unmount();
    tinhTrang.mockResolvedValueOnce(tt({ duoc_dong_thieu: false, canh_bao: [], trang_thai: "closed" }));
    render(<KcsDongLenh nhomId={4} canDong onDone={() => {}} />);
    expect(((await screen.findByRole("button", { name: "Mở lại" })) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(screen.getByText("Cần quyền Đóng lệnh thiếu để mở lại.")).toBeTruthy();
  });

  it("không phải người KCS thì không có nút", async () => {
    tinhTrang.mockResolvedValueOnce(tt());
    render(<KcsDongLenh nhomId={4} canDong={false} onDone={() => {}} />);
    expect(await screen.findByText(/9.690/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Đóng lệnh" })).toBeNull();
  });
});
