// Phân trang của MÀN DANH MỤC DÙNG CHUNG (10 màn "Cấu hình danh mục" đều là component này).
//
// Điều quan trọng nhất cần khoá: trang được cắt Ở MÁY CHỦ. Bản đầu ngày 14/08/2026 cắt trong JS
// — vẫn kéo cả danh mục về (còn lặp thêm request khi danh mục vượt trần `size=200`), tức là làm
// nặng DB chứ không nhẹ đi. Nên test soi cả REQUEST gửi lên, không chỉ soi cái hiện ra.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RebuildCatalogPage, type CatalogConfig } from "./RebuildCatalogPage";
import { AuthContext, type AuthState } from "../auth/AuthContext";
import type { Row } from "../api/rebuildCatalog";

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

const CONFIG: CatalogConfig = {
  title: "Công đoạn",
  prefix: "/api/cong-doan",
  columns: [{ key: "ghi_chu", label: "Ghi chú" }],
  fields: [{ key: "ghi_chu", label: "Ghi chú", type: "text" }],
};

/** Bản có điều kiện lọc — số cạnh mỗi giá trị phải lấy từ `dem` của máy chủ. */
const CONFIG_TAB: CatalogConfig = {
  ...CONFIG,
  // Mã màn RIÊNG: bộ lọc được nhớ theo màn trong phiên trang — dùng chung mã với các test khác là
  // test sau mở ra đã đứng sẵn ở "Sau in".
  man: "thu-dieu-kien",
  dieuKien: [{ key: "nhom", nhan: "Giai đoạn", giaTri: [{ value: "in", label: "In" }, { value: "sau_in", label: "Sau in" }] }],
};

/** Bản lấy giá trị từ DANH MỤC THẬT (`nguon`) thay vì liệt kê cứng trong config. */
const CONFIG_TAB_DM: CatalogConfig = {
  ...CONFIG,
  dieuKien: [{ key: "nhom", nhan: "Giai đoạn", nguon: "/api/nhom-cd" }],
};

/** Danh mục nguồn của hàng tab. "moi-khai" CỐ Ý chưa có dòng nào thuộc về — đúng cảnh nhóm vừa
 *  tạo xong trong drawer. */
const NHOM_NGUON = ["in", "sau_in", "moi-khai"];

/** N dòng danh mục: CD-001 "Công đoạn 1" (lẻ = nhóm in, chẵn = sau in). */
function duLieu(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    ma: `CD-${String(i + 1).padStart(3, "0")}`,
    ten: `Công đoạn ${i + 1}`,
    nhom: i % 2 === 0 ? "in" : "sau_in",
    ghi_chu: "",
  }));
}

/** Giả lập endpoint danh mục: lọc `q`/`nhom` rồi cắt `page`/`size` — y như backend. */
function stubApi(tong: number) {
  const tatCa = duLieu(tong);
  const goi: URL[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const u = new URL(String(url), "http://localhost:8000");
    goi.push(u);
    // Danh mục NGUỒN của hàng tab (`facet.source`) — trả danh sách NHÓM, không phải dòng danh mục.
    if (u.pathname === "/api/nhom-cd") {
      const nhom = NHOM_NGUON.map((ten, i) => ({ id: i + 1, ma: "", ten }));
      return Promise.resolve(new Response(
        JSON.stringify({ items: nhom, total: nhom.length, page: 1, size: nhom.length }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ));
    }
    const q = (u.searchParams.get("q") ?? "").toLowerCase();
    const nhom = u.searchParams.get("nhom");
    const khop = tatCa.filter((r) =>
      (!q || `${r.ma} ${r.ten}`.toLowerCase().includes(q)) && (!nhom || r.nhom === nhom));
    const size = Math.min(Number(u.searchParams.get("size") ?? 50), 200);
    const page = Number(u.searchParams.get("page") ?? 1);
    // `facets` KHÔNG lọc theo tab (giống router thật), nhưng CÓ lọc theo `q`.
    const theoQ = tatCa.filter((r) => !q || `${r.ma} ${r.ten}`.toLowerCase().includes(q));
    const facets: Record<string, number> = {};
    for (const r of theoQ) facets[String(r.nhom)] = (facets[String(r.nhom)] ?? 0) + 1;
    return Promise.resolve(new Response(
      JSON.stringify({
        items: khop.slice((page - 1) * size, page * size),
        total: khop.length, page, size,
        dem: { nhom: Object.entries(facets).map(([value, so]) => ({ value, so })) },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
  }));
  return goi;
}

function moMan(config: CatalogConfig = CONFIG) {
  return render(
    <AuthContext.Provider value={AUTH}>
      <RebuildCatalogPage config={config} />
    </AuthContext.Provider>,
  );
}

/** Mã của các dòng đang hiện trên bảng (cột đầu). */
function maDangHien(): string[] {
  return screen.getAllByTitle(/^CD-\d{3}$/).map((el) => el.textContent ?? "");
}

/** Request danh sách (bỏ qua các lời gọi khác, vd dữ liệu phụ theo dòng). */
function reqDanhSach(goi: URL[]): URL[] {
  return goi.filter((u) => u.pathname === "/api/cong-doan");
}

/** Request danh sách GẦN NHẤT. */
function reqCuoi(goi: URL[]): URL {
  const ds = reqDanhSach(goi);
  return ds[ds.length - 1];
}

describe("RebuildCatalogPage — phân trang 25 dòng/trang Ở MÁY CHỦ", () => {
  it("chỉ xin 25 dòng mỗi trang, không kéo cả danh mục về", async () => {
    const goi = stubApi(45);
    moMan();

    await screen.findByText("CD-001");
    const req = reqDanhSach(goi);
    expect(req).toHaveLength(1);                                   // đúng MỘT lượt gọi
    expect(req[0].searchParams.get("size")).toBe("25");
    expect(req[0].searchParams.get("page")).toBe("1");
    expect(maDangHien()).toHaveLength(25);
  });

  it("bấm Trang sau là XIN TRANG 2 từ máy chủ, không cắt lại trong JS", async () => {
    const goi = stubApi(60);
    const user = userEvent.setup();
    moMan();

    await screen.findByText("CD-001");
    const chan = screen.getByText(/tổng/).closest("footer")!;
    expect(chan.textContent).toContain("Trang 1/3");
    expect(chan.textContent).toContain("tổng 60 bản ghi");

    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await waitFor(() => expect(maDangHien()[0]).toBe("CD-026"));
    expect(reqCuoi(goi).searchParams.get("page")).toBe("2");
    expect(maDangHien()[24]).toBe("CD-050");

    // Bấm thẳng số trang cuối — khuôn chân bảng của Nhật ký.
    await user.click(screen.getByRole("button", { name: "3" }));
    await waitFor(() => expect(maDangHien()).toHaveLength(10));    // trang cuối còn 10 dòng
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
  });

  it("đổi Dòng/trang thì xin lại TRANG 1 với size mới", async () => {
    const goi = stubApi(60);
    const user = userEvent.setup();
    moMan();

    await screen.findByText("CD-001");
    await user.click(screen.getByRole("button", { name: "Trang sau" }));
    await waitFor(() => expect(maDangHien()[0]).toBe("CD-026"));

    await user.selectOptions(screen.getByRole("combobox", { name: /Dòng\/trang/ }), "50");
    await waitFor(() => expect(maDangHien()).toHaveLength(50));
    expect(reqCuoi(goi).searchParams.get("size")).toBe("50");
    expect(reqCuoi(goi).searchParams.get("page")).toBe("1");
    expect(maDangHien()[0]).toBe("CD-001");
  });

  it("gõ tìm thì GỬI `q` lên máy chủ và kéo về trang 1", async () => {
    const goi = stubApi(45);
    const user = userEvent.setup();
    moMan();

    await screen.findByText("CD-001");
    await user.click(screen.getByRole("button", { name: "Trang sau" }));   // đang đứng trang 2
    await waitFor(() => expect(maDangHien()[0]).toBe("CD-026"));

    // "Công đoạn 44" nằm ở trang 3 — gõ tìm phải ra, không được "không tìm thấy" vì ngoài trang.
    await user.type(screen.getByPlaceholderText("Tìm mã / tên…"), "đoạn 44");
    await waitFor(() => expect(maDangHien()).toEqual(["CD-044"]));

    const cuoi = reqCuoi(goi);
    expect(cuoi.searchParams.get("q")).toBe("đoạn 44");
    expect(cuoi.searchParams.get("page")).toBe("1");
    expect(screen.getByText(/tổng/).closest("footer")!.textContent).toContain("tổng 1 bản ghi");
  });

  it("gõ liên tục chỉ tốn MỘT request (chờ gõ xong mới hỏi)", async () => {
    const goi = stubApi(45);
    const user = userEvent.setup();
    moMan();

    await screen.findByText("CD-001");
    const truoc = reqDanhSach(goi).length;
    await user.type(screen.getByPlaceholderText("Tìm mã / tên…"), "đoạn 12");
    await waitFor(() => expect(maDangHien()).toEqual(["CD-012"]));
    expect(reqDanhSach(goi).length - truoc).toBe(1);   // 7 phím = 1 request, không phải 7
  });

  it("điều kiện lọc: số cạnh giá trị lấy từ `dem` của máy chủ, chọn giá trị thì gửi bộ lọc lên", async () => {
    const goi = stubApi(45);
    const user = userEvent.setup();
    moMan(CONFIG_TAB);

    await screen.findByText("CD-001");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Giai đoạn/ }));
    expect(screen.getByRole("radio", { name: /^In/ }).textContent).toContain("23");
    const sauIn = screen.getByRole("radio", { name: /^Sau in/ });
    expect(sauIn.textContent).toContain("22");

    await user.click(sauIn);
    await waitFor(() => expect(reqCuoi(goi).searchParams.get("nhom")).toBe("sau_in"));
    await waitFor(() => expect(screen.getByText(/tổng/).closest("footer")!.textContent).toContain("tổng 22 bản ghi"));
    expect(within(screen.getByRole("main")).getByText("22 mục")).toBeTruthy();
  });

  it("giá trị lấy từ DANH MỤC nguồn: nhóm chưa có dòng nào vẫn chọn được, số 0", async () => {
    stubApi(45);
    const user = userEvent.setup();
    moMan(CONFIG_TAB_DM);

    await screen.findByText("CD-001");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await user.click(screen.getByRole("menuitem", { name: /Giai đoạn/ }));
    // Máy chủ chỉ đếm được nhóm ĐANG CÓ dòng, nên "moi-khai" không nằm trong `dem`. Nhóm vừa khai
    // xong vẫn phải chọn được (số 0), không thì người khai tưởng nó không lưu được.
    const moi = await screen.findByRole("radio", { name: /^moi-khai/ });
    expect(moi.textContent).toContain("0");
    expect(screen.getByRole("radio", { name: /^in/ }).textContent).toContain("23");
  });

  it("bảng rỗng thì KHÔNG hiện chân phân trang (khối “chưa có…” nói thay rồi)", async () => {
    stubApi(0);
    moMan();

    await screen.findByText(/Chưa có công đoạn nào/);
    expect(screen.queryByText(/Tổng .* bản ghi/)).toBeNull();
  });
});
