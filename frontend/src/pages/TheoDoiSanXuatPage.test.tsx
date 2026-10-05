// Khung màn Theo dõi sản xuất (làm gọn 05/10/2026, đặc tả 3): đổi góc nhớ trong localStorage, mỗi
// lượt chỉ gọi ĐÚNG góc đang xem, dải bất thường lọc bảng (một mục một lúc, 0 thì không bấm được),
// 403 nói đúng tên màn, lọc rỗng có nút Bỏ lọc.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ModuleCapability, TdsxBoLocOut, TdsxTheoLenhOut, TdsxTheoMayOut } from "../api/client";
import { AuthContext, type AuthState } from "../auth/AuthContext";
import { PermissionsProvider, buildCapabilities } from "../auth/permissions";
import { TheoDoiSanXuatPage } from "./TheoDoiSanXuatPage";

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

const DEM = { tre_han: 2, su_co: 0, tam_dung: 0, kcs_khong_dat: 0, may_hong: 1, chua_may: 0 };

const BO_LOC: TdsxBoLocOut = {
  may: [{ id: "3", ten: "Máy in A", ngung_dung: false, co_viec: true }],
  khach_hang: [{ id: "9", ten: "Công ty Sao" }],
};

const THEO_MAY: TdsxTheoMayOut = {
  nhom: [{
    loai: "may", ten: "Máy in",
    dong: [{
      khoa: "may:3", may_id: 3, ten: "Máy in A", ngung_dung: false,
      tinh_trang: "dang_chay", nhan_tinh_trang: "Đang chạy",
      dang_chay: {
        cong_viec_id: 500, ten_buoc: "In", trang_thai: "running", bai_ma: null,
        lsx: [{ lsx_id: 31, ma: "LSX26-0031", ten: "Hộp thuốc", is_rush: false }],
      },
      dang_chay_them: 0, san_luong: null, ke_hoach_xong: null, ke_hoach_bat_dau: null,
      ke_tiep: [], ke_tiep_them: 0,
    }],
  }],
  may_trong: [],
  bat_thuong: DEM,
};

const THEO_LENH: TdsxTheoLenhOut = {
  items: [{
    lsx_id: 31, ma: "LSX26-0031", ten: "Hộp thuốc", is_rush: false, so_luong_dat: 100,
    don_vi_tinh: "cái", khach_hang: "Công ty Sao", chang: [], buoc_hien_tai: "In",
    khau: "dang_sx", khau_chi_tiet: null, han_hoan_thanh_sx: null, du_kien_xong: null,
    canh_bao: [], tre_ngay: null,
  }],
  total: 1,
  bat_thuong: DEM,
};

type Tuy = { theoMay?: TdsxTheoMayOut; theoLenh?: TdsxTheoLenhOut; status?: number };

/** Fetch giả phân biệt đường; trả mảng URL đã gọi để soi tham số. */
function stubApi(t: Tuy = {}): string[] {
  const goi: string[] = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    goi.push(url);
    let data: unknown = {};
    let status = 200;
    if (url.includes("/api/don-vi")) data = { items: [] };
    else if (url.includes("/api/theo-doi-san-xuat/bo-loc")) data = BO_LOC;
    else if (url.includes("/api/theo-doi-san-xuat/theo-may")) {
      status = t.status ?? 200;
      data = status === 200 ? (t.theoMay ?? THEO_MAY) : { detail: "Không có quyền" };
    } else if (url.includes("/api/theo-doi-san-xuat/theo-lenh")) {
      status = t.status ?? 200;
      data = status === 200 ? (t.theoLenh ?? THEO_LENH) : { detail: "Không có quyền" };
    } else if (url.includes("/api/lenh-san-xuat/")) {
      status = 404;
      data = { detail: "không có trong stub" };
    }
    return Promise.resolve({
      ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }),
      json: async () => data, text: async () => JSON.stringify(data),
    } as Response);
  }));
  return goi;
}

const CAPS = buildCapabilities([
  { module_key: "theo_doi_san_xuat", scope: "all", can_read: true } as ModuleCapability,
  { module_key: "lenh_san_xuat", scope: "all", can_read: true } as ModuleCapability,
]);

function ve() {
  return render(
    <AuthContext.Provider value={AUTH}>
      <PermissionsProvider caps={CAPS}>
        <TheoDoiSanXuatPage />
      </PermissionsProvider>
    </AuthContext.Provider>,
  );
}

const goiToi = (goi: string[], duong: string) => goi.filter((u) => u.includes(duong));

describe("TheoDoiSanXuatPage · khung màn", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("⭐ mặc định Theo máy: chỉ gọi /theo-may, không gọi /theo-lenh", async () => {
    const goi = stubApi();
    ve();
    await screen.findByText("Máy in A");
    expect(screen.getByRole("button", { name: "Theo máy" })).toHaveAttribute("aria-pressed", "true");
    expect(goiToi(goi, "/theo-may")).toHaveLength(1);
    expect(goiToi(goi, "/theo-lenh")).toHaveLength(0);
    // Ô Máy chỉ có ở góc Theo lệnh.
    expect(screen.queryByRole("combobox", { name: /Máy/ })).toBeNull();
  });

  it("⭐ dải bất thường: số + chữ, mục 0 không bấm được, bấm lọc rồi bấm lại để bỏ", async () => {
    const goi = stubApi();
    ve();
    const tre = await screen.findByRole("button", { name: "2 lệnh trễ hạn" });
    await waitFor(() => expect(tre).toBeEnabled());
    expect(screen.getByRole("button", { name: "0 sự cố đang mở" })).toBeDisabled();

    await userEvent.click(tre);
    expect(tre).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(goiToi(goi, "bat_thuong=tre_han")).toHaveLength(1));

    // Một mục một lúc: chọn "máy hỏng" thì "trễ hạn" nhả.
    await userEvent.click(screen.getByRole("button", { name: "1 máy hỏng" }));
    expect(tre).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(goiToi(goi, "bat_thuong=may_hong")).toHaveLength(1));

    await userEvent.click(screen.getByRole("button", { name: "1 máy hỏng" }));
    expect(screen.getByRole("button", { name: "1 máy hỏng" })).toHaveAttribute("aria-pressed", "false");
  });

  it("⭐ đổi sang Theo lệnh: gọi /theo-lenh, nhớ vào localStorage, có ô Máy gửi may_id", async () => {
    const goi = stubApi();
    ve();
    await screen.findByText("Máy in A");
    await userEvent.click(screen.getByRole("button", { name: "Theo lệnh" }));
    await screen.findByText("Hộp thuốc");
    expect(localStorage.getItem("tdsx.goc")).toBe("theo_lenh");
    expect(goiToi(goi, "/theo-lenh")).toHaveLength(1);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Máy/ }), "3");
    await waitFor(() => expect(goiToi(goi, "may_id=3")).toHaveLength(1));
  });

  it("⭐ đã chọn Theo lệnh lần trước ⇒ mở màn là Theo lệnh, không gọi /theo-may", async () => {
    localStorage.setItem("tdsx.goc", "theo_lenh");
    const goi = stubApi();
    ve();
    await screen.findByText("Hộp thuốc");
    expect(goiToi(goi, "/theo-may")).toHaveLength(0);
  });

  it("⭐ ô Khách gửi khach_hang_id; lọc rỗng ⇒ 'Bộ lọc không ra kết quả nào.' + Bỏ lọc", async () => {
    const goi = stubApi({ theoMay: { nhom: [], may_trong: [], bat_thuong: DEM } });
    ve();
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: /Khách/ }), "9");
    await waitFor(() => expect(goiToi(goi, "khach_hang_id=9")).toHaveLength(1));
    expect(await screen.findByText("Bộ lọc không ra kết quả nào.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Bỏ lọc" })[0]);
    expect(screen.getByRole("combobox", { name: /Khách/ })).toHaveValue("");
  });

  it("⭐ 403 ⇒ nói đúng thiếu quyền Theo dõi sản xuất, không nút Thử lại", async () => {
    stubApi({ status: 403 });
    ve();
    expect(await screen.findByText("Bạn không có quyền xem Theo dõi sản xuất.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
  });

  it("⭐ bấm mã lệnh ⇒ mở hồ sơ đúng lệnh (gọi /api/lenh-san-xuat/31)", async () => {
    const goi = stubApi();
    ve();
    await userEvent.click(await screen.findByRole("button", { name: /Mở hồ sơ lệnh LSX26-0031/ }));
    await waitFor(() => expect(goiToi(goi, "/api/lenh-san-xuat/31")).toHaveLength(1));
  });
});
