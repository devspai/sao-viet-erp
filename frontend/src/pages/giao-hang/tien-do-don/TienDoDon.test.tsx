// Bước "Giao hàng" trong drawer đơn — luật chốt 19/09/2026: KHÔNG lập yêu cầu giao cho phần chưa
// nhập kho. Ô số lượng điền sẵn và TRẦN theo `giao_duoc` máy chủ tính; sản phẩm chưa có hàng trong
// kho thì không có ô.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BuocGiaoHang, SanXuatTheoMon, tomTatTienDo, viecTiepTheo } from "./TienDoDon";
import { AuthContext, type AuthState } from "../../../auth/AuthContext";
import { PermissionsProvider, buildCapabilities } from "../../../auth/permissions";
import type { DonTienDo, DonTienDoCum, ModuleCapability, OrderDetail } from "../../../api/client";

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

function cum(o: Partial<DonTienDoCum>): DonTienDoCum {
  return {
    khoa: "k", ten: "Hộp", don_vi: "hộp", order_line_ids: [11], dat: 100, co_lenh: true, lenh: [],
    sx_pct: 50, sx_xong: false, kho_de_nghi: 60, kho_da_nhan: 40, cho_kho: 20, ton_that: 40,
    da_giao: 0, dang_giu: 0, con_phai_giao: 100, giao_duoc: 40, ...o,
  };
}

const TD: DonTienDo = {
  order_id: 3, han_cam_ket: null, du_kien_xong: null, chua_du_du_lieu: false, tre_ngay: null,
  ly_do: [],
  cum: [
    cum({ khoa: "hop", ten: "Hộp thuốc", order_line_ids: [11] }),
    cum({ khoa: "to", ten: "Tờ hướng dẫn", order_line_ids: [12], kho_da_nhan: 0, ton_that: 0, giao_duoc: 0 }),
  ],
  yeu_cau: [],
  noi_nhan: {
    khach_id: 7, dia_chi: "Lô C3", nguoi_nhan: "Chị Hạnh", sdt: "0938", luu_y: "Gọi trước 30 phút",
    so_dia_chi: [{ id: 21, nhan: "Kho Bắc Ninh", dia_chi: "KCN Quế Võ", sdt: null, mac_dinh: true }],
    lien_he: [{ id: 31, ten: "Anh Tùng", chuc_vu: "Thủ kho", sdt: "0912", chinh: false }],
  },
};

const ORDER = {
  id: 3, status: "ordered", delivery_address: "Lô C3", delivery_contact_name: "Chị Hạnh",
  delivery_contact_phone: "0938",
} as unknown as OrderDetail;

function ngayMai(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function stubApi() {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === "POST") posts.push(JSON.parse(String(init.body)));
    return Promise.resolve({
      ok: true, status: 201, headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}), text: async () => "{}",
    } as Response);
  }));
  return posts;
}

function ve(td: DonTienDo = TD) {
  const caps = buildCapabilities([
    { module_key: "giao_hang", scope: "all", can_read: true, can_create: true } as ModuleCapability,
  ]);
  return render(
    <AuthContext.Provider value={AUTH}>
      <PermissionsProvider caps={caps}>
        <BuocGiaoHang order={ORDER} td={td} taiLai={() => {}} onIn={() => {}} />
      </PermissionsProvider>
    </AuthContext.Provider>,
  );
}

beforeEach(() => vi.unstubAllGlobals());

describe("Bước Giao hàng · chỉ giao phần kho đã nhận", () => {
  it("điền sẵn phần giao được, sản phẩm chưa có hàng không có ô, gửi đúng dòng đầu cụm", async () => {
    const posts = stubApi();
    ve();
    await userEvent.click(screen.getByRole("button", { name: "Tạo yêu cầu giao hàng" }));
    const o = screen.getByLabelText("Số lượng giao — Hộp thuốc") as HTMLInputElement;
    expect(o.value).toBe("40");
    expect(o.max).toBe("40");
    expect(screen.queryByLabelText("Số lượng giao — Tờ hướng dẫn")).toBeNull();
    expect(screen.getByText(/Chưa có hàng trong kho: Tờ hướng dẫn/)).toBeInTheDocument();

    const ngay = document.querySelector("input[type=date]") as HTMLInputElement;
    await userEvent.type(ngay, ngayMai());
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].lines).toEqual([{ order_line_id: 11, qty: 40 }]);
    // Không đổi gì ⇒ nơi nhận theo đơn; không có ô gõ tay nào.
    expect(posts[0]).toMatchObject({ dia_chi_id: null, lien_he_id: null });
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("nơi nhận CHỌN trong sổ của khách, lưu ý giao lấy của đơn", async () => {
    const posts = stubApi();
    ve();
    await userEvent.click(screen.getByRole("button", { name: "Tạo yêu cầu giao hàng" }));
    expect(screen.getByText("Gọi trước 30 phút")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Kho Bắc Ninh" }));
    await userEvent.click(screen.getByRole("radio", { name: "Anh Tùng" }));
    const ngay = document.querySelector("input[type=date]") as HTMLInputElement;
    await userEvent.type(ngay, ngayMai());
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ dia_chi_id: 21, lien_he_id: 31 });
  });

  it("đơn lẫn khách đều chưa có địa chỉ ⇒ báo bổ sung ở hồ sơ khách, khoá Gửi", async () => {
    stubApi();
    ve({ ...TD, noi_nhan: { ...TD.noi_nhan, dia_chi: null, so_dia_chi: [] } });
    await userEvent.click(screen.getByRole("button", { name: "Tạo yêu cầu giao hàng" }));
    expect(screen.getByText(/chưa có địa chỉ giao — thêm ở hồ sơ khách hàng/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi yêu cầu" })).toBeDisabled();
  });

  it("gõ vượt phần giao được ⇒ báo ngay và khoá nút Gửi", async () => {
    stubApi();
    ve();
    await userEvent.click(screen.getByRole("button", { name: "Tạo yêu cầu giao hàng" }));
    const o = screen.getByLabelText("Số lượng giao — Hộp thuốc");
    await userEvent.clear(o);
    await userEvent.type(o, "41");
    expect(screen.getByText(/Vượt — giao được tối đa 40/)).toBeInTheDocument();
    expect(screen.getByText("Số lượng vượt phần giao được")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi yêu cầu" })).toBeDisabled();
  });

  it("kho chưa nhận gì ⇒ nút tạo yêu cầu khoá kèm lý do", () => {
    stubApi();
    ve({ ...TD, cum: TD.cum.map((c) => ({ ...c, giao_duoc: 0 })) });
    expect(screen.getByRole("button", { name: "Tạo yêu cầu giao hàng" })).toBeDisabled();
    expect(screen.getByText(/chỉ lập yêu cầu cho phần kho đã nhận/)).toBeInTheDocument();
  });

  it("yêu cầu có chuyến đã huỷ ⇒ Kinh doanh huỷ được, không sửa được", () => {
    stubApi();
    ve({
      ...TD,
      yeu_cau: [{
        id: 5, code: "YCGH-0005", ngay_can_giao: ngayMai(), trang_thai: "chuyen_da_huy", ly_do_huy: null,
        dia_chi: "Lô C3", nguoi_nhan: null, sdt_nguoi_nhan: null, ghi_chu: null, created_at: "",
        dong: [{ order_line_id: 11, ten: "Hộp thuốc", qty: 40, da_giao: 0 }],
        chuyen: {
          id: 9, trang_thai: "da_huy", gio_lay_hang: "", gio_du_kien_giao: "", tai_xe: "Anh Tư",
          xe: null, thoi_gian_ket_thuc: null, nguoi_nhan_thuc_te: null, ly_do_that_bai: null,
          tra_hang_ma: null, tra_hang_xong: false, so_anh: 0,
        },
      }],
    });
    expect(screen.getByText("Chuyến đã huỷ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sửa" })).toBeNull();
  });
});

describe("Tóm tắt vòng đời · Nhập kho tính mọi sản phẩm, báo món thiếu nguồn", () => {
  // Giống DH002: 1 món có lệnh chưa nhận gì, 1 món giao từ tồn đủ hàng, 2 món không lệnh mà tồn 0.
  const td = {
    ...TD,
    cum: [
      cum({ khoa: "hop", dat: 20000, co_lenh: true, kho_da_nhan: 0, giao_duoc: 0, ton_that: 0 }),
      cum({ khoa: "menu", dat: 1500, co_lenh: false, kho_da_nhan: 0, ton_that: 1500, giao_duoc: 1500 }),
      cum({ khoa: "toroi", dat: 30000, co_lenh: false, kho_da_nhan: 0, ton_that: 0, giao_duoc: 0 }),
      cum({ khoa: "poster", dat: 500, co_lenh: false, kho_da_nhan: 0, ton_that: 0, giao_duoc: 0 }),
    ],
  };

  it("món lấy từ tồn đủ hàng được tính vào Nhập kho, món thiếu nguồn được liệt kê", () => {
    const t = tomTatTienDo(td);
    expect(t.soMonDuHang).toBe(1);
    expect(t.soMon).toBe(4);
    expect(t.khoPct).toBe(25);
    expect(t.khoXong).toBe(false);
    expect(t.thieuNguon.map((c) => c.khoa)).toEqual(["toroi", "poster"]);
  });

  it("món từ tồn đã giao một phần + đang giữ vẫn tính là đã có hàng", () => {
    const t = tomTatTienDo({
      ...TD,
      cum: [cum({ khoa: "menu", dat: 1500, co_lenh: false, da_giao: 500, dang_giu: 400, giao_duoc: 600 })],
    });
    expect(t.khoXong).toBe(true);
    expect(t.thieuNguon).toHaveLength(0);
  });
});

const LENH = {
  id: 5, ma: "LSX26-0005", da_xuong_xuong: true, pct: 60, uoc_tinh: false, xong: false,
  buoc_hien_tai: "Bế", du_kien_xong: null, trang_thai: null, canh_bao: [],
};

describe("Chặng Sản xuất theo món: công đoạn → KCS → kho nhận (05/10/2026)", () => {
  it("món có lệnh vẽ đủ ba khâu, nhập kho là khâu cuối, nói số chờ kho nhận", () => {
    render(<SanXuatTheoMon baoThieu={false}
      td={{ ...TD, cum: [cum({ ten: "Hộp thuốc", sx_pct: 60, lenh: [LENH] })] }} />);
    expect(screen.getByText("LSX26-0005")).toBeTruthy();
    expect(screen.getByText("đang Bế")).toBeTruthy();
    expect(screen.getByText("Công đoạn")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("KCS đạt")).toBeTruthy();
    expect(screen.getByText("Kho nhận")).toBeTruthy();
    expect(screen.getByText("40 / 100")).toBeTruthy();
    expect(screen.getByText("20 chờ kho nhận")).toBeTruthy();
  });

  it("món không qua xưởng mà tồn đủ ⇒ không vẽ ba thanh, chỉ báo đủ trong kho", () => {
    render(<SanXuatTheoMon baoThieu={false}
      td={{ ...TD, cum: [cum({ ten: "Túi", co_lenh: false, kho_de_nghi: 0, kho_da_nhan: 0, cho_kho: 0, ton_that: 100, giao_duoc: 100 })] }} />);
    expect(screen.getByText("không qua xưởng, lấy từ tồn kho")).toBeTruthy();
    expect(screen.getByText("đủ trong kho")).toBeTruthy();
    expect(screen.queryByText("Công đoạn")).toBeNull();
  });

  it("chưa có lệnh: chỉ báo thiếu khi Kế hoạch đã bắt đầu lên lệnh", () => {
    const td = { ...TD, cum: [cum({ ten: "Hộp", co_lenh: false, kho_de_nghi: 0, kho_da_nhan: 0, cho_kho: 0, ton_that: 0, giao_duoc: 0 })] };
    const { unmount } = render(<SanXuatTheoMon baoThieu={false} td={td} />);
    expect(screen.getByText("chưa có lệnh")).toBeTruthy();
    expect(screen.queryByText(/thiếu/)).toBeNull();
    unmount();
    render(<SanXuatTheoMon baoThieu td={td} />);
    expect(screen.getByText("thiếu 100 hộp")).toBeTruthy();
  });
});

describe("Việc tiếp theo của đơn", () => {
  const goc = {
    trangThai: "ordered", canCoc: false, duCoc: true, thieuCoc: 0,
    chuyenSxLuc: "2026-10-05T06:54:32Z", gap: true, hanGiao: "2026-10-30",
    hoaDon: "none" as const, homNay: new Date(2026, 9, 5),
  };

  it("vừa chốt, chưa lệnh nào ⇒ chờ Kế hoạch, kèm giờ chuyển, đơn gấp, số ngày tới hạn", () => {
    const td = { ...TD, cum: [cum({ co_lenh: false, kho_de_nghi: 0, kho_da_nhan: 0, cho_kho: 0, ton_that: 0, giao_duoc: 0 })] };
    const v = viecTiepTheo({ ...goc, td })!;
    expect(v.cau).toBe("Chờ Kế hoạch lên lệnh sản xuất");
    expect(v.the.map((t) => t.nhan)).toEqual(["chuyển xuống 13:54 05/10", "đơn gấp", "còn 25 ngày tới hạn giao"]);
    expect(v.nut?.toi).toBe("ke-hoach-sx");
  });

  it("KCS đã gửi mà kho chưa nhận ⇒ việc của Kho, đứng trước lệnh đang chạy", () => {
    const td = { ...TD, cum: [cum({ ten: "Hộp kem", don_vi: "cái", lenh: [LENH] })] };
    expect(viecTiepTheo({ ...goc, td })!.cau).toBe("Kho chưa nhận 20 cái Hộp kem KCS đã gửi");
  });

  it("lệnh đang chạy, kho không vướng ⇒ nói lệnh và công đoạn đang làm", () => {
    const td = { ...TD, cum: [cum({ lenh: [LENH], cho_kho: 0 })] };
    expect(viecTiepTheo({ ...goc, td })!.cau).toBe("Xưởng đang chạy LSX26-0005, đang Bế");
  });

  it("chờ cọc ⇒ việc của kế toán, chưa nói tới sản xuất", () => {
    const v = viecTiepTheo({ ...goc, canCoc: true, duCoc: false, thieuCoc: 2000000, chuyenSxLuc: null, td: null })!;
    expect(v.cau).toBe("Chờ kế toán thu cọc, còn thiếu 2.000.000 đ");
    expect(v.nut?.toi).toBe("coc");
  });

  it("đơn hủy ⇒ không có việc tiếp theo", () => {
    expect(viecTiepTheo({ ...goc, trangThai: "cancelled", td: TD })).toBeNull();
  });
});
