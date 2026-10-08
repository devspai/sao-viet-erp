// Góc Theo máy (làm gọn 05/10/2026, đặc tả 3.3): bảng mỗi máy một dòng, nhóm theo thứ máy chủ trả,
// máy rảnh gập ở cuối, việc ghép bắt chọn lệnh, sản lượng không cộng lẫn đơn vị.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TdsxMayDong, TdsxTheoMayOut, TdsxViec } from "../api/client";
import { TdsxTheoMay, gioXuong } from "./TdsxTheoMay";

const DEM = { tre_han: 0, su_co: 0, tam_dung: 0, kcs_khong_dat: 0, may_hong: 0, chua_may: 1 };

/** Giờ xưởng KHÔNG nhãn múi, đúng dạng máy chủ gửi — dựng theo NGÀY HÔM NAY của máy chạy test. */
function homNay(gio: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${gio}:00`;
}

function viec(id: number, ma: string, extra: Partial<TdsxViec> = {}): TdsxViec {
  return {
    cong_viec_id: id, ten_buoc: "In", trang_thai: "running", bai_ma: null,
    lsx: [{ lsx_id: id, ma, ten: `Hộp ${id}`, is_rush: false }],
    ...extra,
  };
}

function dong(khoa: string, extra: Partial<TdsxMayDong> = {}): TdsxMayDong {
  return {
    khoa, may_id: null, ten: null, ngung_dung: false, tinh_trang: "trong", nhan_tinh_trang: "Đang trống",
    dang_chay: null, dang_chay_them: 0, san_luong: null, ke_hoach_xong: null, ke_hoach_bat_dau: null,
    ke_tiep: [], ke_tiep_them: 0,
    ...extra,
  };
}

const DATA: TdsxTheoMayOut = {
  nhom: [
    {
      loai: "chua_may", ten: "Chưa có máy",
      dong: [dong("cv:90", {
        tinh_trang: "cho_xep_may", nhan_tinh_trang: "Chờ xếp máy",
        dang_chay: viec(90, "LSX26-0090", { trang_thai: "released", ten_buoc: "Bế" }),
        ke_hoach_bat_dau: homNay("14:30"),
      })],
    },
    {
      loai: "may", ten: "Máy in",
      dong: [
        dong("may:1", {
          may_id: 1, ten: "Máy in A", tinh_trang: "dang_chay", nhan_tinh_trang: "Đang chạy",
          dang_chay: viec(31, "LSX26-0031", { lsx: [{ lsx_id: 31, ma: "LSX26-0031", ten: "Hộp thuốc", is_rush: true }] }),
          san_luong: { tot: 480, ke_hoach: 1000, don_vi: "to", theo_don_vi: [], ca_bai: false },
          ke_hoach_xong: homNay("16:05"),
          ke_tiep: [viec(12, "LSX26-0012", { trang_thai: "released" }), viec(13, "LSX26-0013", { trang_thai: "released" })],
          ke_tiep_them: 2,
        }),
        dong("may:2", {
          may_id: 2, ten: "Máy in B", ngung_dung: true, tinh_trang: "may_dung", nhan_tinh_trang: "Hỏng — chờ sửa",
          dang_chay: viec(0, "", {
            trang_thai: "paused", bai_ma: "GB26-0002",
            lsx: [
              { lsx_id: 41, ma: "LSX26-0041", ten: "Tem A", is_rush: false },
              { lsx_id: 42, ma: "LSX26-0042", ten: "Tem B", is_rush: false },
              { lsx_id: 43, ma: "LSX26-0043", ten: "Tem C", is_rush: false },
            ],
          }),
          san_luong: {
            tot: null, ke_hoach: 500, don_vi: "to",
            theo_don_vi: [{ don_vi: "to", tot: 200 }, { don_vi: "kem", tot: 4 }], ca_bai: true,
          },
        }),
      ],
    },
    { loai: "may", ten: "", dong: [dong("may:5", { may_id: 5, ten: "Máy lẻ", tinh_trang: "bao_tri", nhan_tinh_trang: "Đang bảo trì" })] },
  ],
  may_trong: [dong("may:7", { may_id: 7, ten: "Máy cắt 1" }), dong("may:8", { may_id: 8, ten: "Máy cắt 2" })],
  bat_thuong: DEM,
};

function ve(data: TdsxTheoMayOut | null = DATA, onMo = vi.fn()) {
  render(<TdsxTheoMay data={data} dangTai={false} rong={<p>RỖNG</p>} onMo={onMo} />);
  return onMo;
}

describe("TdsxTheoMay · bảng theo máy", () => {
  it("⭐ sáu cột đúng thứ tự, cột Máy ghim", () => {
    ve();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Máy", "Tình trạng", "Đang chạy", "Sản lượng tốt", "Kế hoạch xong", "Kế tiếp",
    ]);
    expect(document.querySelector(".lds-cuon")).toHaveAttribute("data-ghim", "1");
  });

  it("cột ẩn theo cotAn, thứ tự kéo thả theo thuTu", () => {
    render(
      <TdsxTheoMay data={DATA} dangTai={false} rong={<p>RỖNG</p>} onMo={() => {}}
        cotAn={new Set(["san_luong"])} thuTu={["ke_tiep", "dang_chay"]} />,
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Máy", "Kế tiếp", "Đang chạy", "Tình trạng", "Kế hoạch xong",
    ]);
  });

  it("⭐ nhóm theo đúng thứ máy chủ trả (hàng lds-so), nhóm tên rỗng ghi 'Chưa phân nhóm', có số đếm", () => {
    ve();
    const nhom = [...document.querySelectorAll("tr.lds-so:not(.tdsx-trong) td")].map((t) => t.textContent);
    expect(nhom).toEqual(["Chưa có máy1 bước", "Máy in2 máy", "Chưa phân nhóm1 máy"]);
    // Hàng nhóm trải đủ số cột đang hiện.
    expect(document.querySelector("tr.lds-so td")).toHaveAttribute("colspan", "6");
  });

  it("⭐ dòng Chưa có máy: cột Máy '–', Chờ xếp máy, giờ bắt đầu kế hoạch", () => {
    ve();
    const tr = screen.getByText("Chờ xếp máy").closest("tr")!;
    expect(tr.querySelector("td")!.textContent).toBe("–");
    expect(within(tr).getByText("bắt đầu 14:30 hôm nay")).toBeInTheDocument();
    expect(within(tr).getByText("Bế")).toBeInTheDocument();
  });

  it("⭐ việc thường: mã lệnh + GẤP + bước + sản phẩm; sản lượng 'x trên y' có thanh; giờ hôm nay", async () => {
    const onMo = ve();
    const tr = screen.getByText("Máy in A").closest("tr")!;
    expect(within(tr).getByText("GẤP")).toBeInTheDocument();
    expect(within(tr).getByText("Hộp thuốc")).toBeInTheDocument();
    expect(within(tr).getByText(/^480 trên 1\.000/)).toBeInTheDocument();
    expect(within(tr).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "48");
    expect(within(tr).getByText("16:05 hôm nay")).toBeInTheDocument();
    await userEvent.click(within(tr).getByRole("button", { name: /Mở hồ sơ lệnh LSX26-0031/ }));
    expect(onMo).toHaveBeenCalledWith(31);
  });

  it("⭐ kế tiếp: thẻ 4 số cuối, '+N', bấm mở đúng lệnh", async () => {
    const onMo = ve();
    const tr = screen.getByText("Máy in A").closest("tr")!;
    expect(within(tr).getByText("+2")).toBeInTheDocument();
    await userEvent.click(within(tr).getByRole("button", { name: /LSX26-0013/ }));
    expect(onMo).toHaveBeenCalledWith(13);
    expect(within(tr).getByText("0012")).toHaveAttribute("title", "In, Hộp 12");
  });

  it("⭐ việc ghép: 'Bài <mã>' + 'N lệnh', bấm thì bắt CHỌN lệnh, không đoán", async () => {
    const onMo = ve();
    const tr = screen.getByText("Máy in B").closest("tr")!;
    expect(within(tr).getByText("Ngừng dùng")).toBeInTheDocument();
    expect(within(tr).getByText("3 lệnh")).toBeInTheDocument();
    await userEvent.click(within(tr).getByRole("button", { name: /Bài ghép GB26-0002/ }));
    expect(onMo).not.toHaveBeenCalled();
    const hop = screen.getByRole("dialog", { name: "Chọn lệnh để mở hồ sơ" });
    expect(hop.textContent).toContain("Bài ghép này phục vụ 3 lệnh");
    await userEvent.click(within(hop).getByText("LSX26-0042"));
    expect(onMo).toHaveBeenCalledWith(42);
  });

  it("⭐ mẻ lẫn đơn vị: mỗi đơn vị một mẩu ngang, KHÔNG thanh, KHÔNG cộng; ghép ghi '(cả bài)'", () => {
    ve();
    const tr = screen.getByText("Máy in B").closest("tr")!;
    expect(within(tr).getByText(/^200 /)).toBeInTheDocument();
    expect(within(tr).getByText(/^4 /)).toBeInTheDocument();
    expect(within(tr).queryByRole("progressbar")).toBeNull();
    expect(tr.textContent).not.toContain("204");
    expect(within(tr).getByText("(cả bài)")).toBeInTheDocument();
    expect(within(tr).getByText("Hỏng — chờ sửa").className).toContain("lds-chip--do");
  });

  it("ô Đang chạy và Sản lượng tốt có title đủ chữ (ô cắt '…')", () => {
    ve();
    const tr = screen.getByText("Máy in A").closest("tr")!;
    const tds = tr.querySelectorAll("td");
    expect(tds[2]).toHaveAttribute("title", "LSX26-0031 - In - Hộp thuốc");
    expect(tds[3].getAttribute("title")).toMatch(/^480 trên 1\.000/);
    const trGhep = screen.getByText("Máy in B").closest("tr")!;
    expect(trGhep.querySelectorAll("td")[2]).toHaveAttribute("title", "Bài GB26-0002 - In");
    expect(trGhep.querySelectorAll("td")[3].getAttribute("title")).toContain("(cả bài)");
  });

  it("⭐ máy rảnh gập ở cuối: '2 máy đang trống', bấm mới hiện", async () => {
    ve();
    const nut = screen.getByRole("button", { name: "2 máy đang trống" });
    expect(nut).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Máy cắt 1")).toBeNull();
    await userEvent.click(nut);
    expect(nut).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Máy cắt 1")).toBeInTheDocument();
  });

  it("chưa có lượt nào ⇒ hàng xương; rỗng ⇒ ô báo của trang", () => {
    const { unmount } = render(<TdsxTheoMay data={null} dangTai rong={<p>RỖNG</p>} onMo={() => {}} />);
    expect(document.querySelector(".empty-state__skel-row")).not.toBeNull();
    unmount();
    ve({ nhom: [], may_trong: [], bat_thuong: DEM });
    expect(screen.getByText("RỖNG")).toBeInTheDocument();
  });

  it("gioXuong: trong ngày 'HH:MM hôm nay', khác ngày kèm dd/mm, rỗng '–'", () => {
    const bayGio = new Date(2026, 9, 5, 9, 0);
    expect(gioXuong("2026-10-05T14:30:00", bayGio)).toBe("14:30 hôm nay");
    expect(gioXuong("2026-10-06T07:05:00", bayGio)).toBe("07:05 06/10");
    expect(gioXuong(null, bayGio)).toBe("–");
  });
});
