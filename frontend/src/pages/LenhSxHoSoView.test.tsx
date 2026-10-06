// Hai LỜI HỨA in đậm ở đầu `LenhSxHoSoView.tsx` — "KHÔNG MỘT NÚT GHI NÀO" và "KHÔNG MỘT SỐ TIỀN
// NÀO" — nay có lưới.
//
// Luật "không tiền" đã có gác cổng ở máy chủ (`backend/tests/test_lenh_sx_ho_so.py`
// `test_khong_lo_tien` quét cả body text), nên bài dưới đây là lớp thứ hai: nó bắt được ca FE tự
// bịa ra tiền từ dữ liệu không phải tiền. Luật "không nút ghi" thì trước đó KHÔNG có gì canh —
// 1.400 dòng màn mới, ai thêm một nút «Bắt đầu» vào đây cũng không ai kêu.
//
// Dựng DTO ĐẦY ĐỦ 13 khối rồi MỞ HẾT các dòng công đoạn và "Xem đủ thông số" trước khi soi.
// Làm gọn 05/10/2026: khung còn 5 mục (Công đoạn · Quy cách · Vật tư · Sau sản xuất · Nhật ký).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LenhSxHoSoView } from "./LenhSxHoSoView";
import { AuthContext, type AuthState } from "../auth/AuthContext";
import { PermissionsProvider, buildCapabilities } from "../auth/permissions";
import type { LenhSxHoSoOut, ModuleCapability } from "../api/client";

const AUTH: AuthState = {
  status: "authenticated", user: null, token: "t",
  login: async () => {}, logout: async () => {},
  updateUser: () => {}, notice: null, setNotice: () => {},
};

/** Hồ sơ ĐẦY ĐỦ: mọi khối có ít nhất một dòng, để không khối nào trốn vào nhánh rỗng. */
const HOSO: LenhSxHoSoOut = {
  thong_tin: {
    id: 31, ma: "LSX26-0031", ten: "Hộp thuốc 10 vỉ", loai: "san_xuat_moi",
    order_id: 7, order_no: "DH26-0007", order_line_id: 11,
    khach_hang: "Công ty Dược Tân Bình", khach_hang_id: 4, sale: "Chị Hạnh",
    so_luong_dat: 12000, don_vi_tinh: "cái", is_rush: true,
    han_hoan_thanh_sx: "2026-09-10", han_giao_khach: "2026-09-15",
    ban_giao_at: "2026-09-01T02:00:00Z", ghi_chu: "Cán bóng một mặt",
    tao_luc: "2026-08-28T01:00:00Z",
    da_dong: false, nhom_ten: "Nhóm hộp thuốc",
  },
  tien_do: {
    phan_tram: 62.5, uoc_tinh: false, gio_may: 7.25,
    du_kien_xong: "2026-09-08T09:00:00Z", trang_thai: "dang_sx", canh_bao: ["su_co"],
    buoc_hien_tai: "In", buoc_hien_tai_cong_viec_id: 501, nhom_cong_doan: "in",
    may: "Máy in A", nguoi: ["Thợ Nam", "Thợ Bình"], da_giao: 200,
    khau: "dang_sx", khau_chi_tiet: null,
  },
  thong_so: {
    giay_ten: "Couche 250", dinh_luong: 250,
    kho_nguyen_dai: 860, kho_nguyen_rong: 650, kho_in_dai: 780, kho_in_rong: 540,
    dai_thanh_pham: 120, rong_thanh_pham: 80, quy_cach_in: "hai_mat",
    so_mau_a: 4, so_mau_b: 1, muc_a: ["C", "M", "Y", "K"], muc_b: ["K"],
    so_trang: null, trang_moi_tay: null, so_kem: 5, so_manh_xa: 0,
    ghi_chu_ky_thuat: "Bế theo khuôn cũ",
    so_con: 8, so_to_ke_hoach: 1580, so_to_nguyen: 1600, don_vi_tinh: "cái",
  },
  routing: {
    nodes: [
      {
        id: 901, thu_tu: 1, lop: 0, phu_thuoc: [], ten: "CTP", nhom: "che_ban",
        loai_buoc: "may", bat_buoc: true, nha_cung_cap: null, cong_viec_id: 500,
        la_buoc_ghep: false, la_buoc_hien_tai: false, trang_thai: "completed",
        may: "Máy ghi kẽm", to: "Tổ chế bản", nguoi: ["Thợ chế bản"],
        du_kien_bat_dau: "2026-09-01T01:00:00Z", du_kien_ket_thuc: "2026-09-01T03:00:00Z",
        hoan_thanh_luc: "2026-09-01T03:10:00Z",
        so_luong_vao: 5, so_luong_ra: 5, don_vi_vao: "kem", don_vi_ra: "kem",
        can_khuon: false, khuon_da_nhan: false, khuon_be_ma: null, khuon_be_ten: null,
        khuon_be_so_ke: null, khuon_be_tinh_trang: null,
      },
      {
        id: 902, thu_tu: 2, lop: 1, phu_thuoc: [901], ten: "In", nhom: "in",
        loai_buoc: "may", bat_buoc: true, nha_cung_cap: null, cong_viec_id: 501,
        la_buoc_ghep: true, la_buoc_hien_tai: true, trang_thai: "running",
        may: "Máy in A", to: "Tổ in", nguoi: ["Thợ Nam", "Thợ Bình"],
        du_kien_bat_dau: "2026-09-02T01:00:00Z", du_kien_ket_thuc: "2026-09-02T09:00:00Z",
        hoan_thanh_luc: null,
        so_luong_vao: 1600, so_luong_ra: 1580, don_vi_vao: "to", don_vi_ra: "to",
        can_khuon: false, khuon_da_nhan: false, khuon_be_ma: null, khuon_be_ten: null,
        khuon_be_so_ke: null, khuon_be_tinh_trang: null,
      },
      {
        id: 903, thu_tu: 3, lop: 2, phu_thuoc: [902], ten: "Đóng gói", nhom: "thanh_pham",
        loai_buoc: "to", bat_buoc: true, nha_cung_cap: null, cong_viec_id: null,
        la_buoc_ghep: false, la_buoc_hien_tai: false, trang_thai: null,
        may: null, to: "Tổ đóng gói", nguoi: [],
        du_kien_bat_dau: null, du_kien_ket_thuc: null, hoan_thanh_luc: null,
        so_luong_vao: 0, so_luong_ra: 0, don_vi_vao: "cai", don_vi_ra: "cai",
        can_khuon: true, khuon_da_nhan: false, khuon_be_ma: "KB-0007", khuon_be_ten: "Khuôn bế hộp",
        khuon_be_so_ke: "K-A3", khuon_be_tinh_trang: "san_sang",
      },
    ],
    canh: [[901, 902], [902, 903]],
  },
  vat_tu: {
    hien_tai: {
      du: false,
      dong: [{
        pham_vi: "lsx", ma: "LSX26-0031", ten_viec: "In", buoc_id: 902,
        hang_loai: "giay", hang_id: 3, hang_ma: "GIAY-C250", hang_ten: "Couche 250",
        don_vi_goc: "kg", ton: 40, nhu_cau: 120, nhu_cau_hien_thi: "120 kg (1.600 tờ)",
        da_cap: 0, dang_linh: 0, con_phai_co: 80, thieu: 80, trang_thai: "do",
        ngay_can: "2026-09-02",
      }],
    },
    canh_bao_sau: [{
      pham_vi: "lsx", ma: "LSX26-0031", ten_viec: "Đóng gói", buoc_id: 903,
      hang_loai: "vat_tu", hang_id: 9, hang_ma: "VT-KEO", hang_ten: "Keo dán hộp",
      don_vi_goc: "kg", ton: 0, nhu_cau: 50, nhu_cau_hien_thi: null,
      da_cap: 0, dang_linh: 0, con_phai_co: 50, thieu: 50, trang_thai: "do",
      ngay_can: "2026-09-05",
    }],
    da_cap: [{
      pham_vi: "bai_ghep", ma: "GB26-0004", ten_viec: "In", buoc_id: 902,
      hang_loai: "vat_tu", hang_id: 12, hang_ma: "VT-MUC-K", hang_ten: "Mực đen",
      don_vi_goc: "kg", ton: 18, nhu_cau: 6, nhu_cau_hien_thi: null,
      da_cap: 6, dang_linh: 2, con_phai_co: 0, thieu: 0, trang_thai: "xam",
      ngay_can: "2026-09-02",
    }],
  },
  nhan_luc: {
    hien_tai: [{
      cong_viec_id: 501, buoc_id: 902, ten_viec: "In",
      to: "Tổ in", may: "Máy in A", nguoi: ["Thợ Nam", "Thợ Bình"],
    }],
    lich_su: [
      {
        loai: "giao_nguoi", luc: "2026-09-02T01:05:00Z", cong_viec_id: 501, ten_viec: "In",
        nguoi: "Thợ Nam", may_cu: null, may_moi: null, ly_do: null,
      },
      {
        loai: "doi_may", luc: "2026-09-02T04:00:00Z", cong_viec_id: 501, ten_viec: "In",
        nguoi: null, may_cu: "Máy in B", may_moi: "Máy in A", ly_do: "Máy cũ kẹt giấy",
      },
    ],
  },
  san_luong: {
    batch: [{
      id: 71, cong_viec_id: 501, ten_viec: "In", la_buoc_ghep: true,
      bat_dau: "2026-09-02T01:00:00Z", ket_thuc: "2026-09-02T05:00:00Z",
      tong: 500, tot: 480, hong: 20, don_vi: "to", mo_ta_loi: "Nhăn giấy",
    }],
  },
  su_co: [{
    id: 44, ma: "YC26-0044", cong_viec_id: 501, ten_viec: "In", may: "Máy in A",
    bo_phan_hong: "Cụm cấp giấy", mo_ta: "Kẹt giấy liên tục", muc_do: "trung_binh",
    may_dung: true, nguoi_bao: "Thợ Nam", thoi_diem: "2026-09-02T03:30:00Z",
    trang_thai: "da_tao_phieu", ly_do_tu_choi: null,
    phieu: {
      id: 8, ma: "SC26-0008", trang_thai: "dang_sua",
      nguyen_nhan_phuong_an: "Thay bánh cao su", hoan_thanh_at: null,
    },
  }],
  kcs: {
    tong_nhan: 1100, tong_dat: 1000, tong_khong_dat: 100, ty_le_dat: 90.90909,
    batch: [{
      id: 61, cong_viec_id: 501, ten_viec: "In", la_buoc_ghep: true, la_kcs_cuoi: false,
      ket_thuc: "2026-09-02T06:00:00Z", so_luong_nhan: 1100, so_luong_dat: 1000,
      so_luong_khong_dat: 100, don_vi: "to", ket_luan: "dat_mot_phan", ghi_chu: "Lệch màu nhẹ",
    }],
  },
  kho: {
    so_lenh_trong_nhom: 2,
    yeu_cau: [{
      id: 21, request_id: 9, ma: "DNN0009", hang_id: 55, so_luong_yeu_cau: 500, so_luong_xac_nhan: 500,
      con_lai: 0, don_vi: "cai", trang_thai: "done",
      tao_luc: "2026-09-02T07:00:00Z", xac_nhan_luc: "2026-09-02T08:00:00Z",
    }],
  },
  giao_hang: {
    nhom_id: 5, order_id: 7, order_line_ids: [11], so_lenh_trong_nhom: 2,
    hang: [
      {
        hang_id: 55, ma: "TP-HOP-THUOC", ten: "Hộp thuốc 10 vỉ", quy_cach: "Thùng 100",
        don_vi: "cai", kho_id: 1, kho_ten: "Kho thành phẩm A",
        so_luong: 300, so_toi_da: 0, khong_tinh_duoc: false,
      },
      {
        hang_id: 55, ma: "TP-HOP-THUOC", ten: "Hộp thuốc 10 vỉ", quy_cach: "Thùng 100",
        don_vi: "cai", kho_id: 2, kho_ten: "Kho thành phẩm B",
        so_luong: 400, so_toi_da: 200, khong_tinh_duoc: false,
      },
    ],
    da_nhap_kho: 700, da_giao: 500, co_the_giao: true, don_vi_lech: false,
  },
  timeline: [
    {
      loai: "phat_hanh", luc: "2026-09-01T00:30:00Z", nguoi: "Điều độ Lan",
      noi_dung: "Phát hành phiên bản 1", cong_viec_id: null, ten_viec: null,
    },
    {
      loai: "kcs", luc: "2026-09-02T06:00:00Z", nguoi: null,
      noi_dung: "KCS In: 1000 đạt · 100 không đạt (Đạt một phần)",
      cong_viec_id: 501, ten_viec: "In",
    },
  ],
  phien_ban: 1,
};

/** Danh mục Đơn vị mà màn nạp một lần cho cả phiên (`useNapTenDonVi`). Mọi cột `don_vi` của tầng
 *  sản xuất là MÃ (`to`, `kem`) — tên hiển thị chỉ có ở đây. */
const DON_VI = [
  { ma: "to", ten: "tờ" },
  { ma: "kem", ten: "bản kẽm" },
  { ma: "cai", ten: "cái" },
  { ma: "kg", ten: "kilôgam" },
];

/** Fetch giả PHÂN BIỆT ĐƯỜNG DẪN. Trước đây stub trả hồ sơ cho MỌI đường, kể cả `/api/don-vi` —
 *  bảng tên nhận một body không có `items` nên rỗng, và cả bộ lưới chạy trên nhánh "mã lạ ⇒ hiện
 *  mã trần". Nhánh đổi mã → tên khi đó không có bài nào chạm tới. */
function stubApi(body: LenhSxHoSoOut = HOSO) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const data: unknown = url.includes("/api/don-vi") ? { items: DON_VI } : body;
    return Promise.resolve({
      ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
      json: async () => data, text: async () => JSON.stringify(data),
    } as Response);
  }));
}

/** Dựng màn với quyền ĐẦY ĐỦ bên giao hàng — ca rộng nhất, tức ca bày ra nhiều nút nhất.
 *  `pv`: phiên bản in trên tờ giấy đã quét (Task 14, deep link QR) — không truyền = mở tay,
 *  giống hệt trước đây, không phá bài canh cũ nào ở trên. */
function ve(pv?: number | null, onMoDon: (id: number) => void = () => {}) {
  const caps = buildCapabilities([
    {
      module_key: "giao_hang", scope: "all",
      can_read: true, can_create: true, can_update: true,
    } as ModuleCapability,
  ]);
  return render(
    <AuthContext.Provider value={AUTH}>
      <PermissionsProvider caps={caps}>
        <LenhSxHoSoView lsxId={31} pv={pv} onClose={() => {}} onMoDon={onMoDon} />
      </PermissionsProvider>
    </AuthContext.Provider>,
  );
}

/** Mở HẾT dòng công đoạn có chi tiết và ô "Xem đủ thông số" (mọi nút `aria-expanded=false`). */
async function moHetKhoi() {
  for (const nut of screen.queryAllByRole("button", { expanded: false })) {
    await userEvent.click(nut);
  }
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("Hồ sơ lệnh sản xuất · hai bất biến của màn", () => {
  it("⭐ KHÔNG một nút GHI nào", async () => {
    // Nhãn của những nút GHI mà màn thực thi tại tổ (`ThucHienSanXuat`) có và màn này TUYỆT ĐỐI
    // không được có. "Giao"/"Rút" viết kèm chữ "ng(ười)": giao/rút NGƯỜI mới là thao tác ghi, còn
    // liên kết «Tạo yêu cầu giao hàng» là điều hướng và đầu file cho phép đích danh.
    //
    // Nút gập khối (`aria-expanded`) không phải nút thao tác — nó chỉ mở/đóng, và tiêu đề khối
    // «Giao hàng» sẽ dính oan nếu so nguyên văn.
    const NHAN_GHI =
      /bắt đầu|tạm dừng|kết thúc|\blưu\b|xo[áa]|giao ng|rút ng|đổi máy|ghi sản lượng|lập phiếu/i;

    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    const thaoTac = screen
      .getAllByRole("button")
      .filter((b) => !b.hasAttribute("aria-expanded"))
      .map((b) => b.textContent ?? "");
    expect(thaoTac.length).toBeGreaterThan(0);   // không có nút nào ⇒ bài này vô nghĩa
    for (const nhan of thaoTac) {
      expect(nhan, `nút ghi lọt vào màn chỉ đọc: ${nhan}`).not.toMatch(NHAN_GHI);
    }
  });

  it("⭐ KHÔNG một số TIỀN nào", async () => {
    // Hai đường rò: (1) một khoá tiền của máy chủ lọt ra `title`/thuộc tính; (2) FE tự dựng một
    // chuỗi tiền. Cả hai đều soi trên `innerHTML`, KHÔNG trên `textContent`: `textContent` dán
    // liền hai text node cạnh nhau, nên "…250.000 đ" + "Công đoạn…" thành "đC" và mệnh đề
    // "`đ` không được đứng trước chữ cái" (thứ phân biệt "12.000 đ" với "500 đã ghi") hụt mất.
    const KHOA_TIEN = [
      "don_gia", "gia_von", "thanh_tien", "luong_khoan", "chi_phi", "la_luong_khoan",
    ];
    const DINH_DANG_TIEN = /₫|VND|đồng|\d[\d.,]*\s*đ(?![\p{L}\p{N}])/iu;

    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    const html = document.body.innerHTML;
    for (const cam of KHOA_TIEN) {
      expect(html, `màn lộ khoá tiền \`${cam}\``).not.toContain(cam);
    }
    expect(html).not.toMatch(DINH_DANG_TIEN);
  });
});

// Ba tổng `san_luong.tong/tot/hong` đã gỡ ở máy chủ (cộng tờ in với thành phẩm). Màn chỉ cộng mẻ của
// CÙNG một bước theo TỪNG đơn vị; KCS chỉ bày lô KCS cuối, không tỉ lệ gộp.
describe("Hồ sơ lệnh sản xuất · không còn tổng cộng lẫn bước", () => {
  it("⭐ hai bước ghi hai thang ⇒ mỗi bước một số, không có tổng cộng bừa", async () => {
    const b = HOSO.san_luong.batch[0];
    stubApi({
      ...HOSO,
      san_luong: {
        batch: [
          { ...b, tong: 500, tot: 480, hong: 20, don_vi: "to" },
          { ...b, id: 72, cong_viec_id: 500, ten_viec: "CTP", la_buoc_ghep: false, tong: 8, tot: 8, hong: 0, don_vi: "kem" },
        ],
      },
    });
    ve();
    await screen.findByText("LSX26-0031");

    const cd = within(document.getElementById("lhs-muc-cong-doan")!);
    expect(cd.getByText("480 tờ")).toBeInTheDocument();
    expect(cd.getByText("8 bản kẽm")).toBeInTheDocument();
    expect(document.body.textContent, "có tổng cộng qua hai thang").not.toContain("488");
  });

  it("⭐ KCS: chỉ lô KCS cuối ở Sau sản xuất, không tổng, không tỉ lệ gộp", async () => {
    const k = HOSO.kcs.batch[0];
    stubApi({
      ...HOSO,
      kcs: {
        tong_nhan: 1500, tong_dat: 1400, tong_khong_dat: 100, ty_le_dat: 93.33333,
        batch: [
          { ...k, so_luong_nhan: 1000, so_luong_dat: 1000, so_luong_khong_dat: 0, don_vi: "to", ket_luan: "dat" },
          {
            ...k, id: 62, cong_viec_id: 503, ten_viec: "Đóng gói", la_kcs_cuoi: true,
            so_luong_nhan: 500, so_luong_dat: 400, so_luong_khong_dat: 100, don_vi: "cai",
            ket_luan: "dat_mot_phan",
          },
        ],
      },
    });
    ve();
    await screen.findByText("LSX26-0031");

    const sau = within(document.getElementById("lhs-muc-sau-sx")!);
    expect(sau.getByText(/Nhận 500 cái, đạt 400, không đạt 100/)).toBeInTheDocument();
    expect(sau.queryByText(/Nhận 1\.000/)).toBeNull();
    expect(document.body.textContent).not.toContain("93,3");
    expect(document.body.textContent).not.toContain("1.400");
  });
});

// Cột `don_vi` khắp tầng sản xuất giữ MÃ danh mục (`don_vi_do.ma`: `to`, `kem`, `cai`), không giữ
// tên. Bày thẳng cột đó ra màn là bắt người ở xưởng tra mã — và tra bằng cái gì thì không ai nói.
// Tên nằm ở `don_vi_do.ten`, nạp qua `useNapTenDonVi` rồi tra bằng `nhanDonVi`.
describe("Hồ sơ lệnh sản xuất · chip khuôn đi theo bước", () => {
  it("⭐ bước cần dụng cụ bày mã dao + số kệ ngay trên bảng routing", async () => {
    // Trước 04/09/2026 máy chủ đã trả `khuon_be_*` nhưng `RoutingNodeOut` không khai, Pydantic nuốt
    // im lặng nên hồ sơ câm — "bế chưa có dao" chỉ lộ khi mở bàn tổ. Bài này giữ cho đường dữ liệu
    // dict → schema → type TS → chip không đứt lại.
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    expect(screen.getByText("KB-0007 · K-A3")).toBeInTheDocument();
    // Bước không cần dụng cụ thì KHÔNG được mọc chip rỗng: chỉ một bước trong ba có dao.
    expect(document.querySelectorAll(".chip-khuon")).toHaveLength(1);
  });
});

// E2E 27/09/2026: bước bị bài ghép phủ in theo cấu hình của LỆNH (Máy, "Tổ cán phủ") trong khi
// lượt chung là Thuê ngoài — máy chủ nay trả cấu hình bước chung + mã bài, màn phải nói ra mã bài.
describe("Hồ sơ lệnh sản xuất · bước bị bài ghép phủ", () => {
  it("bày loại Thuê ngoài, nhà gia công và chip đi chung bài ghép", async () => {
    const [n1, n2, n3] = HOSO.routing!.nodes;
    stubApi({
      ...HOSO,
      routing: {
        ...HOSO.routing!,
        nodes: [n1, {
          ...n2, loai_buoc: "thue_ngoai", nha_cung_cap: "Tân Phát", may: null, to: null,
          bai_ghep_ma: "GB26-0002",
        }, n3],
      },
    });
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    expect(screen.getByText("Bài ghép GB26-0002")).toBeInTheDocument();
    expect(screen.getByText("Tân Phát")).toBeInTheDocument();
  });
});

describe("Hồ sơ lệnh sản xuất · bày TÊN đơn vị chứ không bày mã", () => {
  it("⭐ mọi chỗ có đơn vị đều đọc ra tên trong danh mục", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await moHetKhoi();

    // Routing bước CTP ghi `kem` cả vào lẫn ra ⇒ phải đọc được thành chữ.
    await screen.findByText(/5 bản kẽm → 5 bản kẽm/);
    // Cột Tốt, hỏng của bước In: `to` ⇒ "tờ".
    expect(within(document.getElementById("lhs-muc-cong-doan")!).getByText("480 tờ")).toBeInTheDocument();

    // Và không còn mã trần nào lọt tới mắt người đọc. `\bkem\b` không đụng "kẽm" (chữ có dấu), nên
    // nó bắt đúng cái mã; `\d\s+to\b` bắt ca "500 to" mà không bắt "500 tờ".
    const chu = document.body.textContent ?? "";
    expect(chu, "mã `kem` vẫn hiện thay cho tên đơn vị").not.toMatch(/\bkem\b/);
    expect(chu, "mã `to` vẫn hiện thay cho tên đơn vị").not.toMatch(/\d\s+to\b/);
    expect(chu, "mã `cai` vẫn hiện thay cho tên đơn vị").not.toMatch(/\bcai\b/);
  });
});

// Task 14 — deep link QR: ba tình huống Bước 4 của brief mà ruling C106 giao lại cho bài canh tự
// động thay vì dev-browser (điều phối viên tự đi lại luồng bằng chuột sau khi nhận báo cáo). Hai
// bài dưới đây là phần "băng cảnh báo phiên bản cũ"; phần "hash sống sót qua đăng nhập" nằm ở
// `LoginPage.test.tsx`, phần "mở đúng lệnh" nằm ở `LenhSanXuatPage.test.tsx`.
describe("Hồ sơ lệnh sản xuất · băng cảnh báo phiếu giấy cũ (Task 14)", () => {
  it("⭐ pv nhỏ hơn phien_ban hiện tại ⇒ băng cảnh báo hiện, ĐÚNG chữ brief", async () => {
    stubApi({ ...HOSO, phien_ban: 2 });
    ve(1);
    await screen.findByText("LSX26-0031");

    // Chữ NGUYÊN VĂN brief đòi — không diễn giải, không rút gọn. Tìm theo CHỮ, không theo
    // `getByRole("status")` (sửa vòng 1, P8): màn hôm nay chỉ có một `role="status"` nên bài xanh,
    // nhưng thêm một live region khác sau này (banner thành công, toast…) là bài vỡ vì "multiple
    // elements" — vỡ vì lý do KHÁC hẳn điều bài này canh.
    expect(screen.getByText("Phiếu giấy v1, lệnh hiện tại đã là v2")).toBeInTheDocument();
  });

  it("⭐ pv bằng phien_ban hiện tại ⇒ KHÔNG băng nào", async () => {
    // HOSO gốc đã có phien_ban: 1 — quét đúng tờ giấy mới nhất.
    stubApi();
    ve(1);
    await screen.findByText("LSX26-0031");

    expect(screen.queryByText(/Phiếu giấy v/)).not.toBeInTheDocument();
  });

  it("⭐ mở tay từ bảng (không có pv) ⇒ KHÔNG băng nào, kể cả lệnh đã qua nhiều phiên bản", async () => {
    stubApi({ ...HOSO, phien_ban: 5 });
    ve(); // không truyền pv — đúng thứ `LenhSanXuatPage.moHoSoTay` làm khi bấm dòng trong bảng.
    await screen.findByText("LSX26-0031");

    expect(screen.queryByText(/Phiếu giấy v/)).not.toBeInTheDocument();
  });
});

describe("Hồ sơ lệnh sản xuất · phần đầu gọn (05/10/2026)", () => {
  it("⭐ pill khâu, thẻ Nhóm có số lệnh, Đơn bấm sang đơn hàng", async () => {
    const moDon = vi.fn();
    stubApi();
    ve(undefined, moDon);
    await screen.findByText("LSX26-0031");

    expect(screen.getByText("Đang sản xuất")).toBeInTheDocument();
    expect(screen.queryByText("Đã đóng lệnh")).toBeNull();
    expect(screen.getByText("Nhóm hộp thuốc")).toBeInTheDocument();
    expect(screen.getByText("2 lệnh")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "DH26-0007" }));
    expect(moDon).toHaveBeenCalledWith(7);
  });

  it("⭐ sự cố đã có phiếu đang sửa ⇒ dòng VÀNG 'Đang sửa, phiếu …', không dòng đỏ", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    const dong = screen.getByText("Đang sửa, phiếu SC26-0008").closest("li");
    expect(dong?.className).toContain("lhs-canhbao__vang");
    expect(document.querySelector(".lhs-canhbao__do")).toBeNull();
  });

  it("⭐ sự cố chờ tiếp nhận ⇒ dòng ĐỎ có mã, máy, bộ phận hỏng, thẻ Máy dừng", async () => {
    stubApi({ ...HOSO, su_co: [{ ...HOSO.su_co[0], trang_thai: "cho_tiep_nhan", phieu: null }] });
    ve();
    await screen.findByText("LSX26-0031");
    const dong = screen.getByText("Sự cố YC26-0044").closest("li");
    expect(dong?.className).toContain("lhs-canhbao__do");
    expect(dong?.textContent).toContain("Máy in A, Cụm cấp giấy");
    expect(dong?.textContent).toContain("Máy dừng");
  });

  it("⭐ ba ô tổng quan: bước i trên n, dự kiến kịp, đã giao trên đặt", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    expect(screen.getByText("bước 2 trên 3")).toBeInTheDocument();
    expect(screen.getByText("Dự kiến xong 08/09, kịp")).toBeInTheDocument();
    expect(screen.getByText("200 trên 12.000 cái")).toBeInTheDocument();
  });

  it("⭐ dự kiến vượt hạn ⇒ 'trễ N ngày'", async () => {
    stubApi({ ...HOSO, tien_do: { ...HOSO.tien_do, du_kien_xong: "2026-09-12T09:00:00Z" } });
    ve();
    await screen.findByText("LSX26-0031");
    expect(screen.getByText("Dự kiến xong 12/09, trễ 2 ngày")).toBeInTheDocument();
  });
});

describe("Hồ sơ lệnh sản xuất · năm mục", () => {
  it("⭐ mở dòng bước In ⇒ các mẻ, đổi máy và câu ca ghép", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    await userEvent.click(screen.getByRole("button", { name: "2. In" }));
    expect(screen.getByText("Số trên dòng này là của cả ca in ghép, không riêng lệnh này.")).toBeInTheDocument();
    expect(screen.getByText("Đổi máy Máy in B → Máy in A, lý do: Máy cũ kẹt giấy")).toBeInTheDocument();
    expect(screen.getByText("Ghi 480 tờ tốt, 20 hỏng, lỗi: Nhăn giấy")).toBeInTheDocument();
  });

  it("⭐ vật tư: một bảng, ba nút lọc, mặc định nút đầu có dòng", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    const vt = within(document.getElementById("lhs-muc-vat-tu")!);
    expect(vt.getByRole("button", { name: "Bước đang làm 1" })).toHaveAttribute("aria-pressed", "true");
    expect(vt.getByText("Couche 250")).toBeInTheDocument();
    await userEvent.click(vt.getByRole("button", { name: "Kho đã cấp 1" }));
    expect(vt.getByText("Mực đen")).toBeInTheDocument();
    expect(vt.queryByText("Couche 250")).toBeNull();
  });

  it("⭐ nhật ký: mới nhất trên, 'Sản lượng, KCS' mặc định tắt", async () => {
    stubApi();
    ve();
    await screen.findByText("LSX26-0031");
    const nk = within(document.getElementById("lhs-muc-nhat-ky")!);
    expect(nk.getByText("Phát hành phiên bản 1")).toBeInTheDocument();
    expect(nk.queryByText(/^KCS In/)).toBeNull();
    await userEvent.click(nk.getByRole("button", { name: "Sản lượng, KCS" }));
    const dong = nk.getAllByRole("listitem");
    expect(dong[0].textContent).toContain("KCS In");
    expect(dong[1].textContent).toContain("Phát hành phiên bản 1");
  });
});
