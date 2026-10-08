// Danh sách Tài sản & CCDC kiểu bảng tính gọn (phương án A, 07/10/2026): dải tab trạng thái có số,
// dòng tiêu đề nhóm lấy tổng của CẢ nhóm từ máy chủ, dòng Cộng cuối, đổi "Nhóm theo" là hỏi lại máy
// chủ với `nhom_theo`. Dải bốn số đầu màn đã bỏ.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DanhSachTaiSan, TaiSanRow } from "../../api/taiSan";
import type { ModuleCapability } from "../../api/client";
import { AuthContext, type AuthState } from "../../auth/AuthContext";
import { PermissionsProvider, buildCapabilities } from "../../auth/permissions";
import { THANG_NAY, thangNhan } from "./chung";
import { DanhSachView } from "./DanhSachView";

const { danhSach } = vi.hoisted(() => ({ danhSach: vi.fn() }));

vi.mock("../../api/taiSan", async (goc) => {
  const that = await goc<typeof import("../../api/taiSan")>();
  return {
    ...that,
    taiSanApi: {
      ...that.taiSanApi,
      danhSach,
      locBoPhan: vi.fn(async () => []),
    },
  };
});

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

function dong(o: Partial<TaiSanRow>): TaiSanRow {
  return {
    id: 1, ma: "TS-0001", ten: "Máy in Heidelberg", loai: "tscd", so_luong: 1, don_gia: null,
    nguyen_gia: 1_200_000_000, so_thang: 96, so_thang_con: 60, ngay_su_dung: "2023-03-01",
    moc_tu_ngay: "2023-03-01", co_so_trich: 1_200_000_000, nguon_vao: "moi", hao_mon_dau_ky: 0,
    thang_da_trich_dau_ky: 0, bo_phan_id: 3, bo_phan_ten: "Tổ in", nguoi_quan_ly_id: null,
    nguoi_quan_ly: null, vi_tri: null, so_hoa_don: null, nha_cung_cap: null, ghi_chu: null,
    trang_thai: "dang_dung", ngay_giam: null, created_at: "2026-10-01T03:00:00",
    hao_mon_luy_ke: 450_000_000, luy_ke_den: "2026-09", con_lai: 750_000_000,
    tien_sua_chua_lon: 0, muc_thang_nay: 12_500_000, ...o,
  };
}

const KQ: DanhSachTaiSan = {
  items: [
    dong({}),
    dong({ id: 2, ma: "TS-0002", ten: "Máy cắt Polar", nguyen_gia: 300_000_000, hao_mon_luy_ke: 300_000_000,
      con_lai: 0, muc_thang_nay: 0, so_thang: 60 }),
  ],
  total: 2,
  dem_loai: { tscd: 2, ccdc: 5 },
  dem_trang_thai: { dang_dung: 7, da_giam: 3 },
  tong_gia: 1_550_000_000,
  tong_con_lai: 760_000_000,
  tong_hao_mon: 790_000_000,
  tong_muc_thang: 13_000_000,
  nhom: [
    { khoa: "tscd", ten: "Tài sản cố định", so: 2, nguyen_gia: 1_500_000_000, hao_mon: 750_000_000,
      con_lai: 750_000_000, muc_thang: 12_500_000 },
    { khoa: "ccdc", ten: "Công cụ dụng cụ", so: 5, nguyen_gia: 50_000_000, hao_mon: 40_000_000,
      con_lai: 10_000_000, muc_thang: 500_000 },
  ],
};

function ve() {
  const caps = buildCapabilities([
    { module_key: "tai_san", scope: "all", can_read: true, can_create: true } as ModuleCapability,
  ]);
  return render(
    <AuthContext.Provider value={AUTH}>
      <PermissionsProvider caps={caps}>
        <DanhSachView />
      </PermissionsProvider>
    </AuthContext.Provider>,
  );
}

/** Bảng máy tính đã có dòng (thẻ điện thoại cũng in tên nên tìm trong bảng). */
async function choBang() {
  const bang = screen.getByRole("table");
  await within(bang).findByText("Máy in Heidelberg");
  return bang;
}

/** Tham số của lần gọi `danhSach` gần nhất. */
const thamSoCuoi = () => danhSach.mock.calls.at(-1)?.[1] as Record<string, unknown>;

beforeEach(() => {
  // `useLocMan` nhớ bộ lọc theo màn ở cấp module; URL có khoá của màn thì URL thắng bộ nhớ ⇒ đặt
  // URL tường minh (Đang dùng mặc định, nhóm theo loại) để mỗi bài không thừa hưởng bài trước.
  window.history.replaceState(null, "", "/?man=tai-san&nhom=loai");
  danhSach.mockReset();
  danhSach.mockResolvedValue(KQ);
  // Danh mục bộ phận cho dialog — không cần trong bài này.
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
    json: async () => [], text: async () => "[]",
  } as unknown as Response)));
});

describe("Danh sách tài sản — phương án A", () => {
  it("cột mới, dòng nhóm lấy tổng cả nhóm, dòng Cộng, không còn dải số", async () => {
    ve();
    const bang = await choBang();

    expect(screen.getByRole("columnheader", { name: `Tháng ${thangNhan(THANG_NAY)}` })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Khấu hao trong" })).toBeTruthy();

    // Nhóm Tài sản cố định có trong trang ⇒ một dòng tiêu đề, số của CẢ nhóm từ máy chủ.
    const nhom = within(bang).getByText("Tài sản cố định").closest("tr")!;
    expect(within(nhom).getByText("2 mục")).toBeTruthy();
    expect(within(nhom).getByText("1.500.000.000")).toBeTruthy();
    // Nhóm Công cụ dụng cụ không có dòng nào trong trang ⇒ không chèn tiêu đề.
    expect(within(bang).queryByText("Công cụ dụng cụ")).toBeNull();

    const cong = within(bang).getByText("Cộng 2 đang dùng").closest("tr")!;
    expect(within(cong).getByText("1.550.000.000")).toBeTruthy();
    expect(within(cong).getByText("13.000.000")).toBeTruthy();

    // Ô tháng = 0 thì "–"; khấu hao trong = số + chữ "tháng" nhỏ.
    const polar = within(bang).getByText("Máy cắt Polar").closest("tr")!;
    expect(within(polar).getByText("–")).toBeTruthy();
    expect(within(polar).getByText("tháng")).toBeTruthy();
    // "Đã khấu hao hết" bỏ — ô tháng "–" và còn lại 0 đã nói.
    expect(screen.queryByText("Đã khấu hao hết")).toBeNull();

    expect(screen.queryByText("Tổng giá mua")).toBeNull();
    expect(thamSoCuoi().nhom_theo).toBe("loai");
  });

  it("đổi Nhóm theo gửi nhom_theo lên máy chủ và ghi lên URL", async () => {
    ve();
    const bang = await choBang();
    const nhomTheo = screen.getByRole("group", { name: "Nhóm theo" });

    await userEvent.click(within(nhomTheo).getByRole("button", { name: "Bộ phận" }));
    await waitFor(() => expect(thamSoCuoi().nhom_theo).toBe("bo_phan"));
    expect(new URLSearchParams(window.location.search).get("nhom")).toBe("bo_phan");

    danhSach.mockResolvedValue({ ...KQ, nhom: [] });
    await userEvent.click(within(nhomTheo).getByRole("button", { name: "Không nhóm" }));
    await waitFor(() => expect(thamSoCuoi().nhom_theo).toBe("khong"));
    await waitFor(() => expect(within(bang).queryByText("Tài sản cố định")).toBeNull());
    expect(within(bang).getByText(/^Cộng 2 /)).toBeTruthy();
  });

  it("nhóm theo Bộ phận: dòng tiêu đề theo id bộ phận và nhóm chưa gán", async () => {
    window.history.replaceState(null, "", "/?man=tai-san&nhom=bo_phan");
    danhSach.mockResolvedValue({
      ...KQ,
      items: [
        dong({}),
        dong({ id: 2, ma: "TS-0002", ten: "Máy cắt Polar" }),
        dong({ id: 3, ma: "CC-0001", ten: "Bàn dao", loai: "ccdc", bo_phan_id: null, bo_phan_ten: null }),
      ],
      total: 3,
      nhom: [
        { khoa: "3", ten: "Tổ in", so: 4, nguyen_gia: 2_000_000_000, hao_mon: 0, con_lai: 0, muc_thang: 0 },
        { khoa: "chua_gan", ten: "Chưa gán bộ phận", so: 1, nguyen_gia: 9_000_000, hao_mon: 0,
          con_lai: 0, muc_thang: 0 },
      ],
    } satisfies DanhSachTaiSan);
    ve();
    const bang = await choBang();
    expect(thamSoCuoi().nhom_theo).toBe("bo_phan");

    const nhomRows = bang.querySelectorAll("tr.kt-g__nhom");
    expect(nhomRows).toHaveLength(2);
    expect(within(nhomRows[0] as HTMLElement).getByText("Tổ in")).toBeTruthy();
    expect(within(nhomRows[0] as HTMLElement).getByText("4 mục")).toBeTruthy();
    expect(within(nhomRows[0] as HTMLElement).getByText("2.000.000.000")).toBeTruthy();
    expect(within(nhomRows[1] as HTMLElement).getByText("Chưa gán bộ phận")).toBeTruthy();
    expect(within(nhomRows[1] as HTMLElement).getByText("1 mục")).toBeTruthy();
    // Tiêu đề nhóm đứng ngay trước dòng đầu tiên của nhóm.
    expect((nhomRows[0].nextElementSibling as HTMLElement).dataset.id).toBe("1");
    expect((nhomRows[1].nextElementSibling as HTMLElement).dataset.id).toBe("3");
  });

  it("dải tab trạng thái có số và đổi điều kiện trạng thái", async () => {
    ve();
    await choBang();
    const dai = screen.getByRole("group", { name: "Lọc theo trạng thái" });
    const dangDung = within(dai).getByRole("button", { name: /Đang dùng/ });
    expect(dangDung.getAttribute("aria-pressed")).toBe("true");
    expect(dangDung.textContent).toContain("7");
    expect(within(dai).getByRole("button", { name: /Đã thôi dùng/ }).textContent).toContain("3");
    expect(within(dai).getByRole("button", { name: /Tất cả/ }).textContent).toContain("10");
    expect(thamSoCuoi().trang_thai).toBe("dang_dung");

    await userEvent.click(within(dai).getByRole("button", { name: /Đã thôi dùng/ }));
    await waitFor(() => expect(thamSoCuoi().trang_thai).toBe("da_giam"));

    await userEvent.click(within(dai).getByRole("button", { name: /Tất cả/ }));
    await waitFor(() => expect(thamSoCuoi().trang_thai).toBeUndefined());
  });
});
