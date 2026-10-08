// Hai thứ của đợt "một khung cho 10 màn" mà HỎNG TRONG IM LẶNG — không có test thì phải mở đúng
// màn, đúng vai, đúng lúc backend chết mới thấy:
//
//   1. Bảng NÓI DỐI. Trước 15/08/2026 backend chết là ô trống vẫn in "Chưa có giấy nào trong hệ
//      thống." — câu đó vừa sai vừa mời người ta đi tạo lại dữ liệu đang có sẵn.
//   2. Vai chỉ-đọc vẫn thấy đủ nút Thêm / Xóa, bấm xong mới ăn 403.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CatalogListPage } from "./CatalogListPage";
import type { CatalogConfig } from "./types";
import { useDieuHuongDanhMuc } from "./dieuHuong";
import type { NavigateFn } from "../../components/AppShell";
import { AuthContext, type AuthState } from "../../auth/AuthContext";
import { PermissionsProvider, buildCapabilities } from "../../auth/permissions";
import type { ModuleCapability } from "../../api/client";

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

const CFG: CatalogConfig = {
  title: "Giấy",
  prefix: "/api/giay",
  columns: [{ key: "ghi_chu", label: "Ghi chú" }],
  fields: [{ key: "ghi_chu", label: "Ghi chú", type: "text" }],
};

/** Bảng quyền: chỉ khai đúng những `can_*` mà màn danh mục hỏi tới. */
function quyen(mod: string, cho: Partial<ModuleCapability>): ModuleCapability {
  return {
    module_key: mod, scope: "all",
    can_read: true, can_create: false, can_update: false, can_delete: false,
    ...cho,
  } as ModuleCapability;
}

function moMan(config: CatalogConfig, caps: ModuleCapability[] = [], navigate?: NavigateFn) {
  return render(
    <AuthContext.Provider value={AUTH}>
      <PermissionsProvider caps={buildCapabilities(caps)}>
        <CatalogListPage config={config} navigate={navigate} />
      </PermissionsProvider>
    </AuthContext.Provider>,
  );
}

/** Danh sách trả về `items`; `hong` thì trả 500 để ép nhánh lỗi. */
function stub({ items = [] as unknown[], hong = false } = {}) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(
    hong
      ? new Response(JSON.stringify({ detail: "Mất kết nối cơ sở dữ liệu." }), { status: 500 })
      : new Response(JSON.stringify({ items, total: items.length, page: 1, size: 20 }),
        { status: 200, headers: { "Content-Type": "application/json" } }),
  )));
}

describe("bảng rỗng phải nói ĐÚNG lý do", () => {
  it("tải hỏng thì nói không tải được + mời Tải lại, KHÔNG nói 'chưa có gì'", async () => {
    stub({ hong: true });
    moMan(CFG);

    await screen.findByText("Không tải được danh sách.");
    expect(screen.queryByText(/Chưa có giấy nào/)).toBeNull();
    expect(screen.getByText("Mất kết nối cơ sở dữ liệu.")).toBeTruthy();   // lý do máy chủ trả về
    expect(screen.getByRole("button", { name: "Tải lại" })).toBeTruthy();
    // Một lỗi = MỘT nút Tải lại. Banner trên đầu bảng phải im khi bảng đã rỗng.
    expect(screen.getAllByRole("button", { name: "Tải lại" })).toHaveLength(1);
  });

  it("không hỏng, không lọc, không có dòng nào ⇒ vẫn là câu 'chưa có gì'", async () => {
    stub({ items: [] });
    moMan(CFG);
    await screen.findByText(/Chưa có giấy nào trong hệ thống/);
  });
});

describe("nút GHI gác theo quyền module", () => {
  const CFG_GAC: CatalogConfig = { ...CFG, moduleQuyen: "dm_giay", softDelete: true };
  const DONG = [{ id: 1, ma: "G-001", ten: "Couché 150" }];

  it("vai chỉ-đọc KHÔNG thấy Thêm lẫn Xóa", async () => {
    stub({ items: DONG });
    moMan(CFG_GAC, [quyen("dm_giay", {})]);

    await screen.findByText("G-001");
    expect(screen.queryByRole("button", { name: /Thêm giấy/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Xóa/ })).toBeNull();
  });

  it("đủ quyền thì hai nút hiện lại như cũ", async () => {
    stub({ items: DONG });
    moMan(CFG_GAC, [quyen("dm_giay", { can_create: true, can_delete: true })]);

    await screen.findByText("G-001");
    expect(screen.getByRole("button", { name: /Thêm giấy/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Xóa/ })).toBeTruthy();
  });

  it("config KHÔNG khai `moduleQuyen` ⇒ không gác gì, giữ nguyên hành vi cũ", async () => {
    stub({ items: DONG });
    moMan(CFG);   // không có provider quyền nào cấp `dm_giay`

    await screen.findByText("G-001");
    expect(screen.getByRole("button", { name: /Thêm giấy/ })).toBeTruthy();
  });
});

describe("danh mục do HỆ SINH — `khongTaoTay` / `khongXoa`", () => {
  // Màn Thành phẩm (mg 0203 · docs/prd-thanh-pham.md L5): dòng ở đó do `OrderService.confirm()`
  // khai từ dòng đơn, mã theo công thức. Cho gõ tay là mở lại đúng cái cửa mà luật 08/08/2026
  // của kho đã đóng.
  const CFG_SINH: CatalogConfig = {
    ...CFG, moduleQuyen: "dm_giay", softDelete: true, khongTaoTay: true, khongXoa: true,
  };
  const DONG = [{ id: 1, ma: "TP-DH-2026-041-11", ten: "Hộp thuốc 10 vỉ" }];

  it("⭐ ĐỦ QUYỀN vẫn KHÔNG thấy Thêm lẫn Xóa", async () => {
    // Đây là chỗ khác hẳn khối trên: khối kia gác theo QUYỀN, khối này là luật CỦA MÀN — có
    // quyền tạo cũng không tạo tay được.
    stub({ items: DONG });
    moMan(CFG_SINH, [quyen("dm_giay", { can_create: true, can_delete: true, can_update: true })]);

    await screen.findByText("TP-DH-2026-041-11");
    expect(screen.queryByRole("button", { name: /Thêm giấy/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Xóa/ })).toBeNull();
  });

  it("vẫn SỬA được — chỉ chặn tạo và xoá", async () => {
    // Chặn quá tay thì không ai sửa nổi ĐVT, mà ĐVT chính là ô kho phải sửa được (PRD L5).
    // Sửa ở màn này là BẤM VÀO DÒNG, không có nút riêng.
    stub({ items: DONG });
    moMan(CFG_SINH, [quyen("dm_giay", { can_create: true, can_delete: true, can_update: true })]);

    await userEvent.click(await screen.findByText("TP-DH-2026-041-11"));
    expect(await screen.findByText(/Chỉnh sửa/)).toBeInTheDocument();
  });

  it("⭐ NHẬP EXCEL cần đủ quyền thêm + sửa, kể cả khi màn không cho tạo tay", async () => {
    // Thành phẩm 18/09/2026: bỏ nút Thêm nhưng giữ Nhập Excel để sửa hàng loạt. Cổng
    // `POST /import-excel` của máy chủ vẫn đòi đủ `create` + `update` (`catalog_base.req_import`),
    // nên chỉ có `update` mà hiện nút là mời bấm để ăn 403 (rà soát 05/10/2026).
    stub({ items: DONG });
    moMan({ ...CFG_SINH, enableImport: true }, [quyen("dm_giay", { can_update: true })]);

    await screen.findByText("TP-DH-2026-041-11");
    expect(screen.queryByRole("button", { name: /Thêm giấy/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Nhập Excel/ })).toBeNull();
  });

  it("đủ quyền thêm + sửa thì màn không cho tạo tay vẫn có Nhập Excel, vẫn không có nút Thêm", async () => {
    stub({ items: DONG });
    moMan({ ...CFG_SINH, enableImport: true },
          [quyen("dm_giay", { can_create: true, can_update: true })]);

    await screen.findByText("TP-DH-2026-041-11");
    expect(screen.queryByRole("button", { name: /Thêm giấy/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Nhập Excel/ })).toBeTruthy();
  });

  it("không khai hai cờ ⇒ giữ nguyên hành vi cũ", async () => {
    stub({ items: DONG });
    moMan({ ...CFG, moduleQuyen: "dm_giay", softDelete: true },
          [quyen("dm_giay", { can_create: true, can_delete: true })]);

    await screen.findByText("TP-DH-2026-041-11");
    expect(screen.getByRole("button", { name: /Thêm giấy/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Xóa/ })).toBeTruthy();
  });
});

describe("mở một dòng bằng BÀN PHÍM", () => {
  // Lưới danh mục (08/10/2026): dòng là `<tr tabIndex=0>` — Tab tới dòng rồi Enter / Space mở ngăn.
  // Không gán `role="button"` cho `<tr>` (mất vai "row" của hàng).
  it("Tab tới dòng rồi Enter / Space là mở dòng đó", async () => {
    const user = userEvent.setup();
    stub({ items: [{ id: 1, ma: "G-001", ten: "Couché 150" }] });
    moMan(CFG);

    const dong = (await screen.findByText("G-001")).closest("tr")!;
    expect(dong.getAttribute("tabindex")).toBe("0");
    dong.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/Chỉnh sửa/)).toBeInTheDocument();
  });
});

describe("bấm link sang MÀN KHÁC từ drawer (vd mã đơn ở Thành phẩm)", () => {
  function NutMoDon() {
    const navigate = useDieuHuongDanhMuc();
    return <button type="button" onClick={() => navigate?.("don-hang-ban", { openOrderId: 5 })}>Mở đơn</button>;
  }
  const CFG_LINK: CatalogConfig = { ...CFG, renderChiDoc: () => <NutMoDon /> };
  const DONG = [{ id: 1, ma: "G-001", ten: "Couché 150", ghi_chu: "" }];

  it("chưa sửa gì ⇒ sang màn kia ngay", async () => {
    const user = userEvent.setup();
    const nav = vi.fn();
    stub({ items: DONG });
    moMan(CFG_LINK, [], nav);

    await user.click(await screen.findByText("G-001"));
    await user.click(await screen.findByRole("button", { name: "Mở đơn" }));
    expect(nav).toHaveBeenCalledWith("don-hang-ban", { openOrderId: 5 });
  });

  it("⭐ đang sửa dở ⇒ hỏi bỏ thay đổi trước, chọn Tiếp tục sửa thì ở lại", async () => {
    // Rời màn là drawer biến mất cùng bản sửa — không qua `roiDi` là mất việc không một lời hỏi.
    const user = userEvent.setup();
    const nav = vi.fn();
    stub({ items: DONG });
    moMan(CFG_LINK, [], nav);

    await user.click(await screen.findByText("G-001"));
    await user.type(await screen.findByDisplayValue("Couché 150"), " mới");
    await user.click(screen.getByRole("button", { name: "Mở đơn" }));
    expect(await screen.findByText("Bỏ thay đổi?")).toBeTruthy();
    expect(nav).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Tiếp tục sửa" }));
    expect(nav).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Couché 150 mới")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Mở đơn" }));
    await user.click(await screen.findByRole("button", { name: "Thoát không lưu" }));
    expect(nav).toHaveBeenCalledWith("don-hang-ban", { openOrderId: 5 });
  });
});

describe("Thanh lọc chung (06/10/2026) — kỳ Ngày tạo + điều kiện + Đang dùng/Đã ngừng, lọc ở MÁY CHỦ", () => {
  const CFG_LOC: CatalogConfig = {
    ...CFG,
    title: "Khuôn",
    prefix: "/api/khuon-be",
    softDelete: true,
    man: "khuon-be",
    dieuKien: [
      { key: "tinh_trang", nhan: "Tình trạng", giaTri: [{ value: "hong", label: "Hỏng" }] },
      { key: "khach_hang_id", nhan: "Khách hàng" },
    ],
  };
  /** Danh sách kèm `dem` của máy chủ (giá trị + số đếm từng điều kiện). */
  function stubDem() {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      items: [{ id: 1, ma: "KB-0001", ten: "Hộp A", ghi_chu: "", active: true, created_at: "2026-10-02T03:00:00Z" }],
      total: 1, page: 1, size: 25,
      dem: {
        tinh_trang: [{ value: "hong", so: 3 }],
        khach_hang_id: [{ value: "7", nhan: "Minh Long", so: 2 }],
        active: [{ value: "true", so: 1 }, { value: "false", so: 4 }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }))));
  }
  const urls = () => vi.mocked(fetch).mock.calls.map((c) => String(c[0]));

  it("mặc định chỉ xem dòng đang dùng (`active=true`) và NÓI ra thành một điều kiện; có cột Ngày tạo", async () => {
    stubDem();
    window.history.replaceState(null, "", "/");
    moMan(CFG_LOC);
    await screen.findByText("Hộp A");
    expect(urls().some((x) => x.includes("/api/khuon-be?") && x.includes("active=true")
      && x.includes("kem_dem=true"))).toBe(true);
    // Hàng lọc nhanh trạng thái (08/10/2026): "Đang dùng" đang bật, số đếm lấy từ `dem` của máy chủ.
    const dang = screen.getByRole("button", { name: /^Đang dùng/ });
    expect(dang.getAttribute("aria-pressed")).toBe("true");
    expect(dang.textContent).toContain("1");
    expect(screen.getByRole("button", { name: /^Đã ngừng/ }).textContent).toContain("4");
    expect(screen.getByRole("button", { name: /^Tất cả/ }).textContent).toContain("5");
    expect(screen.getByRole("columnheader", { name: "Ngày tạo" })).toBeTruthy();
    expect(screen.getByText("02/10/2026")).toBeTruthy();
  });

  it("⭐ chọn điều kiện ⇒ query có tham số đó, giá trị lấy tên + số từ máy chủ; bấm Tất cả ⇒ xem cả đã ngừng", async () => {
    stubDem();
    window.history.replaceState(null, "", "/");
    const u = userEvent.setup();
    moMan(CFG_LOC);
    await screen.findByText("Hộp A");

    await u.click(screen.getByRole("button", { name: "Lọc" }));
    await u.click(screen.getByRole("menuitem", { name: /Khách hàng/ }));
    await u.click(screen.getByRole("radio", { name: /Minh Long/ }));
    await waitFor(() => expect(urls().some(
      (x) => x.includes("khach_hang_id=7") && x.includes("active=true"))).toBe(true));
    // Lọc ghi lên URL của màn.
    expect(window.location.search).toContain("man=khuon-be");
    expect(window.location.search).toContain("khach_hang_id=7");

    vi.mocked(fetch).mockClear();
    await u.click(screen.getByRole("button", { name: /^Tất cả/ }));
    await waitFor(() => expect(urls().some((x) => x.includes("khach_hang_id=7"))).toBe(true));
    expect(urls().some((x) => x.includes("active="))).toBe(false);
    expect(window.location.search).toContain("active=tat_ca");
  });
});
