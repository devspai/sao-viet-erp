/** Hộp chép tiêu chí (§6 cách 2): lọc tương đối, "Đã chọn" giữ được khi lọc khuất, "Chọn cả N",
 *  đếm câu trùng, payload gửi máy chủ là bản soạn (bỏ câu bỏ tick, có câu thêm riêng). */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KcsKhaiBaoCongDoan } from "../../../api/client";

const goi = vi.hoisted(() => ({ khaiBao: vi.fn(), chep: vi.fn() }));
vi.mock("../../../api/client", async (g) => ({
  ...(await g<typeof import("../../../api/client")>()),
  api: { kcsHangMuc: goi },
}));

import { HopChepTieuChi } from "./HopChepTieuChi";

function cd(id: number, ma: string, ten: string, nhom: string, cau: string[] = []): KcsKhaiBaoCongDoan {
  return {
    cong_doan_id: id, ma, ten, nhom,
    hang_muc: cau.map((t, i) => ({ id: id * 100 + i, ma: `KM${id}${i}`, cong_doan_id: id, ten: t, thu_tu: i + 1 })),
  };
}

const DS = [
  cd(1, "IN-OFS", "In offset", "print", ["Màu đúng mẫu"]),
  cd(2, "BOI-SONG", "Bồi sóng carton", "finishing"),
  cd(3, "DAN-MAY", "Dán máy", "finishing", ["Dán chắc", "Không tràn keo"]),
  cd(4, "DAN-TAY", "Dán thủ công", "finishing", ["Không tràn keo"]),
];

beforeEach(() => {
  goi.khaiBao.mockReset().mockResolvedValue({ giai_doan: [{ nhom: "", cong_doan: DS }] });
  goi.chep.mockReset().mockResolvedValue({ da_chep: 3, bo_qua: 1, theo_dich: [] });
});

const dichCua = (ten: string) => screen.getByText(ten, { selector: ".ktc-dich__ten" }).closest("label")!;

describe("HopChepTieuChi", () => {
  it("lọc tương đối, Đã chọn giữ khi lọc khuất, Chọn cả N, đếm trùng, chép bản soạn", async () => {
    const u = userEvent.setup();
    const xong = vi.fn();
    render(<HopChepTieuChi token="t" nguon={DS[2]} dichSan={null} onDong={() => {}} onXong={xong} />);
    await waitFor(() => expect(screen.getByText("Bồi sóng carton")).toBeTruthy());

    // Nguồn mờ, không tick được.
    expect(within(dichCua("Dán máy")).getByRole("checkbox")).toHaveProperty("disabled", true);

    const tim = screen.getByLabelText("Tìm công đoạn đích");
    await u.type(tim, "thu dan");
    expect(screen.getByText("1 công đoạn khớp")).toBeTruthy();
    expect(screen.queryByText("Bồi sóng carton")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Chọn cả 1" }));
    expect(within(dichCua("Dán thủ công")).getByText("1 câu đã có, sẽ bỏ qua")).toBeTruthy();

    // Lọc sang chữ khác: Dán thủ công khuất khỏi danh sách nhưng còn ở hàng Đã chọn.
    await u.clear(tim);
    await u.type(tim, "boi");
    const daChon = screen.getByLabelText("Đã chọn");
    expect(within(daChon).getByText("Dán thủ công")).toBeTruthy();
    await u.click(within(dichCua("Bồi sóng carton")).getByRole("checkbox"));

    // Không khớp gì.
    await u.clear(tim);
    await u.type(tim, "zzz");
    expect(screen.getByText("Không có công đoạn nào khớp “zzz”.")).toBeTruthy();

    // Bản soạn: bỏ tick "Dán chắc", thêm một câu riêng.
    await u.click(screen.getByLabelText("Chép “Dán chắc”"));
    await u.type(screen.getByLabelText("Thêm tiêu chí cho bản chép"), "Mép dán thẳng{Enter}");
    expect(screen.getByText("2 tiêu chí, 2 công đoạn đích. Thêm mới 3 dòng.")).toBeTruthy();

    await u.click(screen.getByRole("button", { name: "Chép vào 2 công đoạn" }));
    expect(goi.chep).toHaveBeenCalledWith("t", [4, 2], ["Không tràn keo", "Mép dán thẳng"]);
    await waitFor(() => expect(xong).toHaveBeenCalledWith(expect.objectContaining({ da_chep: 3 }), 2));
  });

  it("Chép từ công đoạn khác: chọn nguồn trước, đích tick sẵn, nút khoá khi chưa có câu", async () => {
    const u = userEvent.setup();
    render(<HopChepTieuChi token="t" nguon={null} dichSan={2} onDong={() => {}} onXong={() => {}} />);
    await waitFor(() => expect(screen.getByText("Chọn công đoạn nguồn")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Chép vào 1 công đoạn" })).toHaveProperty("disabled", true);
    // Ô chọn nguồn chỉ có công đoạn có tiêu chí, tìm tương đối.
    await u.type(screen.getByLabelText("Tìm công đoạn nguồn"), "in");
    await u.click(screen.getByRole("button", { name: /In offset/ }));
    expect(screen.getByText("Chép tiêu chí của In offset")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chép vào 1 công đoạn" })).toHaveProperty("disabled", false);
  });
});
