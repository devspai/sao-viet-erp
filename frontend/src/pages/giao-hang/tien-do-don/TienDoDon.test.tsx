// Bước "Giao hàng" trong drawer đơn — luật chốt 19/09/2026: KHÔNG lập yêu cầu giao cho phần chưa
// nhập kho. Ô số lượng điền sẵn và TRẦN theo `giao_duoc` máy chủ tính; sản phẩm chưa có hàng trong
// kho thì không có ô.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BuocGiaoHang, tomTatTienDo, viecTiepTheo } from "./TienDoDon";
import { BangSanXuatMon, SanXuatO } from "./SanXuatMon";
import { AuthContext, type AuthState } from "../../../auth/AuthContext";
import { PermissionsProvider, buildCapabilities } from "../../../auth/permissions";
import type { DonTienDo, DonTienDoCum, LenhMon, ModuleCapability, MonSanXuat, OrderDetail } from "../../../api/client";

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

function cum(o: Partial<DonTienDoCum>): DonTienDoCum {
  return {
    khoa: "k", ten: "Hộp", don_vi: "hộp", order_line_ids: [11], dat: 100, co_lenh: true, lenh: [],
    sx_pct: 50, sx_xong: false, kho_de_nghi: 60, kho_da_nhan: 40, cho_kho: 20, ton_that: 40,
    da_giao: 0, giao_thang: 0, o: null, lenh_o: [], dang_giu: 0, con_phai_giao: 100, giao_duoc: 40, ...o,
  };
}

const TD: DonTienDo = {
  order_id: 3, han_cam_ket: null, du_kien_xong: null, chua_du_du_lieu: false, tre_ngay: null, dang_cho: [],
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

describe("Nhà gia công giao thẳng cho khách (gia công ngoài, không qua KCS/kho trên phần mềm)", () => {
  const xong = { id: 2, ma: "LSX26-0002", da_xuong_xuong: true, pct: 100, uoc_tinh: false, xong: true,
    buoc_hien_tai: null, du_kien_xong: null, trang_thai: null, canh_bao: [] };
  const gt = cum({ ten: "Hộp kem", dat: 5000, sx_pct: 100, sx_xong: true, lenh: [xong], kho_de_nghi: 0,
    kho_da_nhan: 0, cho_kho: 0, ton_that: 0, da_giao: 5000, giao_thang: 5000, con_phai_giao: 0, giao_duoc: 0 });

  it("phần giao thẳng tính là đã có hàng ⇒ Sản xuất xong, việc tiếp theo không còn chờ KCS gửi kho", () => {
    const t = tomTatTienDo({ ...TD, cum: [gt] });
    expect(t.khoXong).toBe(true);
    expect(t.giaoXong).toBe(true);
    const v = viecTiepTheo({
      trangThai: "ordered", canCoc: false, duCoc: true, thieuCoc: 0, chuyenSxLuc: "2026-10-05T06:54:32Z",
      gap: false, hanGiao: null, td: { ...TD, cum: [gt] }, hoaDon: "none",
    })!;
    expect(v.cau).toBe("Kế toán ghi hóa đơn");
  });

  it("bảng Sản xuất: đủ hàng nhờ giao thẳng, hàng về thẳng khách", () => {
    render(<BangSanXuatMon td={{ ...TD, cum: [{ ...gt, o: "du_hang", lenh_o: [{ ...LM, kieu: "tron_goi" }] }] }} />);
    expect(screen.getByText("Đủ hàng")).toBeTruthy();
    expect(screen.getByText("nhà gia công giao thẳng 5.000")).toBeTruthy();
    expect(screen.getByText("5.000 / 5.000 hộp")).toBeTruthy();
    expect(screen.getByText("Giao thẳng cho khách")).toBeTruthy();
    expect(screen.getByText("Gia công trọn gói")).toBeTruthy();
  });
});

const LM: LenhMon = {
  id: 5, ma: "LSX26-0005", o: "xuong", kieu: "xuong", buoc: "Bế", pct: 60, gia_cong: null,
};

const LENH = {
  id: 5, ma: "LSX26-0005", da_xuong_xuong: true, pct: 60, uoc_tinh: false, xong: false,
  buoc_hien_tai: "Bế", du_kien_xong: null, trang_thai: null, canh_bao: [],
};

describe("Sản xuất từng mặt hàng: bảng trong ngăn đơn + ô danh sách (07/10/2026)", () => {
  const ngoai: LenhMon = {
    ...LM, id: 8, ma: "LSX26-0008", o: "ngoai", kieu: "mot_phan", buoc: null, pct: null,
    gia_cong: { kieu: "mot_phan", nha_cung_cap_id: 3, nha_cung_cap_ten: "Cán màng Hưng Thịnh",
      ten_viec: "Cán màng", tu_luc: null, ve_xuong: true },
  };

  it("mỗi mặt hàng một hàng: lệnh, kiểu làm, đang ở, đã có hàng, hàng về; bấm hàng mở lệnh", async () => {
    const mo = vi.fn();
    render(<BangSanXuatMon onMoLenh={mo} td={{ ...TD, cum: [
      cum({ khoa: "a", ten: "Hộp thuốc", o: "xuong", lenh: [{ ...LENH, canh_bao: ["tre_han"] }], lenh_o: [LM] }),
      cum({ khoa: "b", ten: "Tờ HDSD", o: "ngoai", lenh_o: [ngoai], kho_da_nhan: 0 }),
      cum({ khoa: "c", ten: "Túi", o: "du_hang", co_lenh: false, kho_da_nhan: 0, ton_that: 100, giao_duoc: 100 }),
    ] }} />);
    expect(screen.getByText("Bế 60%")).toBeTruthy();
    expect(screen.getByText("trễ hạn công đoạn")).toBeTruthy();
    expect(screen.getByText("Trong xưởng")).toBeTruthy();
    expect(screen.getByText("40 / 100 hộp")).toBeTruthy();
    expect(screen.getByText("Cán màng Hưng Thịnh")).toBeTruthy();
    expect(screen.getByText("Gia công một phần")).toBeTruthy();
    expect(screen.getByText("Về xưởng làm tiếp")).toBeTruthy();
    expect(screen.getByText("Không có lệnh")).toBeTruthy();
    expect(screen.getAllByText("Lấy từ tồn kho")).toHaveLength(2);
    await userEvent.click(screen.getByText("Tờ HDSD"));
    expect(mo).toHaveBeenCalledWith(8);
    await userEvent.click(screen.getByRole("button", { name: /LSX26-0005/ }));
    expect(mo).toHaveBeenLastCalledWith(5);
  });

  const mon = (o: Partial<MonSanXuat>): MonSanXuat => ({
    khoa: "k", ten: "Hộp", don_vi: "hộp", dat: 100, co_hang: 0, du_hang: false, o: "xuong",
    co_lenh: true, tu_ton: false, giao_thang: 0, da_giao: 0, con_phai_giao: 100, lenh: [LM], ...o,
  });

  it("ô danh sách: thẻ nói món CHẬM NHẤT đang ở đâu, +n món mở bảng nổi, bấm món mở lệnh", async () => {
    const moLenh = vi.fn();
    const moDon = vi.fn();
    render(<SanXuatO maDon="DH003" onMoLenh={moLenh} onMoDon={moDon} mons={[
      mon({ khoa: "a", ten: "Hộp thuốc" }),
      mon({ khoa: "b", ten: "Tờ HDSD", o: "ngoai", lenh: [ngoai] }),
      mon({ khoa: "c", ten: "Túi", o: "chua_lenh", co_lenh: false, lenh: [] }),
    ]} />);
    expect(screen.getByRole("button", { name: "Sản xuất từng mặt hàng của DH003: Chưa có lệnh" })).toBeTruthy();
    expect(screen.getByText("Túi")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "+2 món" }));
    expect(screen.getByText("3 mặt hàng của DH003")).toBeTruthy();
    await userEvent.click(screen.getByText("Tờ HDSD"));
    expect(moLenh).toHaveBeenCalledWith(8);
    expect(screen.queryByText("3 mặt hàng của DH003")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Chưa có lệnh/ }));
    await userEvent.click(screen.getAllByText("Túi")[1]);
    expect(moDon).toHaveBeenCalled();
  });

  it("ô danh sách đơn 1 món: thẻ + câu chi tiết, không có +n món; đủ hàng thì nói chuyện giao", () => {
    const { unmount } = render(<SanXuatO maDon="DH002" onMoDon={() => {}} mons={[
      mon({ ten: "Sách A5", o: "chua_xuong" })]} />);
    expect(screen.getByText("Chưa xuống xưởng")).toBeTruthy();
    expect(screen.getByText("chờ Kế hoạch phát hành lệnh")).toBeTruthy();
    expect(screen.queryByText(/món$/)).toBeNull();
    unmount();
    const { unmount: u2 } = render(<SanXuatO maDon="DH003" onMoDon={() => {}} mons={[
      mon({ o: "du_hang", du_hang: true, co_hang: 100, da_giao: 60, con_phai_giao: 40 })]} />);
    expect(screen.getByText("Giao dở")).toBeTruthy();
    expect(screen.getByText("đã giao 60/100 hộp")).toBeTruthy();
    u2();
    render(<SanXuatO maDon="DH001" onMoDon={() => {}} mons={[
      mon({ o: "du_hang", du_hang: true, co_hang: 100, da_giao: 100, con_phai_giao: 0, giao_thang: 100 })]} />);
    expect(screen.getByText("Đã giao đủ")).toBeTruthy();
    expect(screen.getByText("nhà gia công giao thẳng 100")).toBeTruthy();
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
