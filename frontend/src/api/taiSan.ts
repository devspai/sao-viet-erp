// API — Tài sản cố định & Công cụ dụng cụ (kế toán). Dùng chung `authed` của client.ts.
//
// KHÔNG có ô tài khoản kế toán ở bất kỳ đâu trong module này, và cũng không có ô định khoản
// riêng. Định khoản là việc của phần mềm kế toán bên ngoài; cần nhớ thì gõ vào ô `ghi_chu` của
// tài sản như mọi thứ khác. Đừng thêm ô tài khoản "cho tiện", cũng đừng đẻ lại ô định khoản
// riêng — hai ô ghi chú mà hệ không đọc ô nào thì người nhập chỉ còn cách đoán gõ vào đâu.
//
// KHÔNG có kỳ chốt (chốt 08/09/2026: "nó chỉ theo dõi khấu hao thôi"). Hao mòn lũy kế là số máy
// chủ TÍNH từ lịch của từng tài sản tới hết tháng trước; bảng của một tháng cũng tính tại chỗ —
// không có nút Tính, không Chốt, không Mở lại.
//
// Làm lại 05/10/2026 cho đơn giản, dễ hiểu (spec `2026-10-05-tai-san-lam-lai-design.md`). Chữ trên
// màn theo bảng "Cách dùng từ" của spec: một khái niệm một từ ("khấu hao", không "hao mòn"),
// không viết tắt TSCĐ/CCDC, nút là động từ đời thường. Tên trường API giữ nguyên.
import { authed, ApiError, layTokenMoiNhat, type LuaChonLoc } from "./client";
import type { ImportExcelOut } from "./rebuildCatalog";

const P = "/api/tai-san";

// BASE_URL của client.ts KHÔNG được export nên đường tải file phải tự dựng lại y hệt. Sửa ở
// client.ts thì sửa cả đây (một dòng, và chỉ đường tải file dùng tới).
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

// --- Nhãn: khai MỘT chỗ, bảng · dialog · tab đọc chung -----------------------------------------
export const NHAN_LOAI: Record<string, string> = {
  tscd: "Tài sản cố định",
  ccdc: "Công cụ dụng cụ",
};
// `da_giam` = Đã thôi dùng (bán / thanh lý / hỏng / mất — nút Thôi dùng từ 05/10/2026; dòng ghi
// giảm cũ trước 08/09/2026 cũng mang giá trị này).
export const NHAN_TRANG_THAI: Record<string, string> = {
  dang_dung: "Đang dùng",
  da_giam: "Đã thôi dùng",
};
// `nang_cap` là tên mã; màn hình gọi là "Sửa chữa lớn" (chủ 08/09/2026: "nâng cấp thực chất là
// sửa chữa" — chỉ sửa chữa làm máy tốt hơn / dùng lâu hơn mới cộng vào giá).
export const NHAN_BIEN_DONG: Record<string, string> = {
  dieu_chuyen: "Chuyển bộ phận",
  nang_cap: "Sửa chữa lớn",
  thoi_dung: "Thôi dùng",
  ghi_giam: "Thôi dùng",
};
/** Lý do thôi dùng — khớp `KIEU_THOI_DUNG` ở `models/tai_san.py`. */
export const KIEU_THOI_DUNG: { ma: string; nhan: string }[] = [
  { ma: "ban", nhan: "Bán" },
  { ma: "thanh_ly", nhan: "Thanh lý" },
  { ma: "hong", nhan: "Hỏng" },
  { ma: "mat", nhan: "Mất" },
];
/** Từ 30 triệu MỘT CÁI trở lên luật tính là tài sản cố định (TT 45/2013). Màn tự chọn loại theo
 *  ngưỡng này và chỉ NHẮC khi người dùng chọn ngược — không chặn: ngưỡng do Bộ Tài chính đổi. */
export const NGUONG_TSCD = 30_000_000;
/** Công cụ dụng cụ khấu hao tối đa 36 tháng (trần thuế) — máy chủ chặn, màn nhắc trước. */
export const CCDC_TOI_DA_THANG = 36;

// --- Kiểu dữ liệu ------------------------------------------------------------------------------

export interface ChiPhi {
  id: number;
  dien_giai: string;
  so_tien: number;
}

export interface TaiSanRow {
  id: number;
  ma: string;
  ten: string;
  loai: string;
  so_luong: number;
  don_gia: number | null;
  nguyen_gia: number;
  so_thang: number;
  so_thang_con: number;
  ngay_su_dung: string;
  moc_tu_ngay: string;
  co_so_trich: number;
  nguon_vao: string;
  /** Chỉ `dau_ky`: số mang sang lúc lên phần mềm — gốc của mọi con số, không đổi sau khi lưu. */
  hao_mon_dau_ky: number;
  thang_da_trich_dau_ky: number;
  bo_phan_id: number | null;
  bo_phan_ten: string | null;
  /** Người giữ = một nhân viên của bộ phận dùng (08/09/2026). `null` = chưa gán. */
  nguoi_quan_ly_id: number | null;
  /** Tên chụp từ hồ sơ nhân viên; dòng cũ có thể là chữ tự gõ. */
  nguoi_quan_ly: string | null;
  /** Cột còn trong DB, form không hỏi nữa (bỏ 08/09/2026). */
  vi_tri: string | null;
  so_hoa_don: string | null;
  /** Như `vi_tri`. */
  nha_cung_cap: string | null;
  ghi_chu: string | null;
  trang_thai: string;
  /** Ngày thôi dùng. */
  ngay_giam: string | null;
  created_at: string | null;
  /** Đã khấu hao — máy chủ TÍNH từ lịch, tới hết tháng `luy_ke_den`. Không ai chốt, không ai cộng. */
  hao_mon_luy_ke: number;
  /** "YYYY-MM" — tháng cuối đã gộp vào `hao_mon_luy_ke` (= tháng trước tháng hiện tại). */
  luy_ke_den: string;
  /** Giá trị còn lại = giá − đã khấu hao. */
  con_lai: number;
  /** Phần của `nguyen_gia` đến từ sửa chữa lớn — màn hiện dòng phụ "gồm sửa chữa lớn …". */
  tien_sua_chua_lon: number;
}

export interface BienDong {
  id: number;
  loai: string;
  ngay: string;
  so_tien: number | null;
  bo_phan_moi_id: number | null;
  so_thang_con_lai: number | null;
  so_luong_giam: number | null;
  /** Chỉ thôi dùng: `ban` | `thanh_ly` | `hong` | `mat`. */
  kieu_thoi_dung: string | null;
  ly_do: string | null;
  created_at: string | null;
}

/** Một tháng trong lịch khấu hao của một tài sản. */
export interface KhauHaoDong {
  nam: number;
  thang: number;
  muc_trich: number;
  luy_ke: number;
  con_lai: number;
}

export interface TaiSanChiTiet extends TaiSanRow {
  chi_phi: ChiPhi[];
  bien_dong: BienDong[];
  /** Phần lịch đã vào lũy kế (tới hết tháng trước). Phần sắp tới xem `duKien`. */
  khau_hao: KhauHaoDong[];
}

/** Một chuyện của tháng: nhãn ngắn (chip trên bảng) + câu đầy đủ (tooltip / ngăn chi tiết). */
export interface SuKien {
  /** `dau` | `dau_ky` | `nang_cap` | `chuyen` | `thoi_dung` | `cuoi` — tô màu chip theo đây. */
  loai: string;
  nhan: string;
  chi_tiet: string;
}

export interface DongDuKien {
  nam: number;
  thang: number;
  muc_trich: number;
  luy_ke: number;
  /** Tháng thôi dùng = 0 (món đã ra khỏi xưởng). */
  con_lai: number;
  su_kien: SuKien[];
  /** Các câu `chi_tiet` nối bằng "; " — chỗ nào chỉ cần một chuỗi. */
  dien_giai: string | null;
}

/** Một nhân viên đang làm của bộ phận — để chọn làm người giữ. */
export interface NhanVienChon {
  id: number;
  code: string;
  full_name: string;
}

export interface HangBangThang {
  tai_san_id: number;
  ma: string;
  ten: string;
  loai: string;
  /** Lô công cụ dụng cụ mấy cái (tài sản cố định = 1). */
  so_luong: number;
  bo_phan_ten: string | null;
  nguyen_gia: number;
  muc_trich: number;
  luy_ke: number;
  /** Tháng thôi dùng = 0 (món đã ra khỏi xưởng). */
  con_lai: number;
  su_kien: SuKien[];
  /** Các câu `chi_tiet` nối bằng "; " (cột Diễn giải trên Excel); null nếu tháng bình thường. */
  dien_giai: string | null;
}

/** Bảng khấu hao một tháng — tính tại chỗ từ sổ, không có trạng thái chốt/mở. */
export interface BangThang {
  nam: number;
  thang: number;
  tong_muc_trich: number;
  items: HangBangThang[];
}

export interface DanhSach<T> {
  items: T[];
  total: number;
}

/** Danh sách tài sản + dải số đầu màn — máy chủ cộng trên CẢ bộ lọc, không chỉ trang đang xem. */
export interface DanhSachTaiSan extends DanhSach<TaiSanRow> {
  /** Số tài sản mỗi loại theo các bộ lọc KHÁC loại (nhóm nút Loại hiện số đếm). */
  dem_loai: Record<string, number>;
  /** Số tài sản mỗi trạng thái theo các bộ lọc khác trạng thái (thẻ lọc Trạng thái). */
  dem_trang_thai: Record<string, number>;
  tong_gia: number;
  /** Tài sản đã thôi dùng tính 0. */
  tong_con_lai: number;
}

function qs(params: Record<string, unknown>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

async function taiFile(token: string, duong: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}${duong}`, {
    credentials: "include",
    cache: "no-store",
    headers: { Authorization: `Bearer ${layTokenMoiNhat() ?? token}` },
  });
  if (resp.status === 401) {
    // `refreshAccessToken` nằm private trong client.ts. Token hết hạn đúng lúc bấm tải là hiếm —
    // nói thẳng để họ tải lại trang, hơn là im lặng trả về file 0 byte.
    throw new ApiError("Phiên đăng nhập đã hết hạn. Tải lại trang rồi thử lại.", 401);
  }
  if (!resp.ok) throw new ApiError(`Tải file thất bại (${resp.status}).`, resp.status);
  return URL.createObjectURL(await resp.blob());
}

export const taiSanApi = {
  // ---- Sổ tài sản ----
  /** Lọc + phân trang Ở MÁY CHỦ. Đừng kéo hết về rồi `filter` trên mảng: sổ tài sản của xưởng in
   *  vài trăm dòng, lọc trong JS là qua trang thứ hai số liệu bắt đầu sai mà không ai báo. */
  danhSach(token: string, params: Record<string, unknown> = {}): Promise<DanhSachTaiSan> {
    return authed<DanhSachTaiSan>(`${P}${qs(params)}`, token);
  },
  /** Thẻ lọc Bộ phận: bộ phận đang có tài sản, kèm số tài sản. */
  locBoPhan(token: string): Promise<LuaChonLoc[]> {
    return authed<LuaChonLoc[]>(`${P}/loc-bo-phan`, token);
  },
  chiTiet(token: string, id: number): Promise<TaiSanChiTiet> {
    return authed<TaiSanChiTiet>(`${P}/${id}`, token);
  },
  /** Thêm tài sản mua mới HOẶC tài sản đang dùng — phân biệt bằng `nguon_vao` trong body. */
  them(token: string, body: Record<string, unknown>): Promise<TaiSanRow> {
    return authed<TaiSanRow>(P, token, { method: "POST", body: JSON.stringify(body) });
  },
  sua(token: string, id: number, body: Record<string, unknown>): Promise<TaiSanRow> {
    return authed<TaiSanRow>(`${P}/${id}`, token, { method: "PUT", body: JSON.stringify(body) });
  },
  /** Chỉ cho tài sản nhập nhầm, chưa có lịch sử — máy chủ trả 409 nếu đã có. */
  xoa(token: string, id: number): Promise<void> {
    return authed<void>(`${P}/${id}`, token, { method: "DELETE" });
  },
  /** Lịch khấu hao trọn đời của một tài sản — đã qua lẫn sắp tới, mỗi tháng một dòng. */
  duKien(token: string, id: number): Promise<DongDuKien[]> {
    return authed<DongDuKien[]>(`${P}/${id}/du-kien`, token);
  },
  /** Một cửa cho chuyển bộ phận (`dieu_chuyen`) và sửa chữa lớn (`nang_cap`). */
  bienDong(token: string, id: number, body: Record<string, unknown>): Promise<BienDong> {
    return authed<BienDong>(`${P}/${id}/bien-dong`, token, {
      method: "POST", body: JSON.stringify(body),
    });
  },
  /** Bán / thanh lý / hỏng / mất — ngừng khấu hao từ `ngay`, tài sản vẫn còn để xem lại. */
  thoiDung(
    token: string, id: number, body: { ngay: string; kieu: string; ly_do: string | null },
  ): Promise<BienDong> {
    return authed<BienDong>(`${P}/${id}/thoi-dung`, token, {
      method: "POST", body: JSON.stringify(body),
    });
  },
  /** Bấm nhầm Thôi dùng ⇒ về Đang dùng, lịch khấu hao như cũ. */
  boThoiDung(token: string, id: number): Promise<TaiSanRow> {
    return authed<TaiSanRow>(`${P}/${id}/thoi-dung`, token, { method: "DELETE" });
  },

  /** Nhân viên đang làm của một bộ phận — đi qua quyền `tai_san.read`, không cần `nhan_su`. */
  nhanVienBoPhan(token: string, boPhanId: number): Promise<NhanVienChon[]> {
    return authed<NhanVienChon[]>(`${P}/nhan-vien?bo_phan_id=${boPhanId}`, token);
  },

  // ---- Nhập tài sản đang dùng từ Excel ----
  /** `preview` không ghi gì, `commit` mới ghi — cả file một giao dịch. */
  importExcel(token: string, file: File, mode: "preview" | "commit"): Promise<ImportExcelOut> {
    const form = new FormData();
    form.append("file", file);
    return authed<ImportExcelOut>(`${P}/import-excel?mode=${mode}`, token, {
      method: "POST", body: form,
    });
  },
  /** File mẫu rỗng (dòng tiêu đề + sheet Hướng dẫn). Trả blob URL. */
  mauExcel(token: string): Promise<string> {
    return taiFile(token, `${P}/mau-excel`);
  },

  // ---- Bảng khấu hao tháng ----
  /** Bảng của một tháng, máy chủ tính tại chỗ từ sổ. Hỏi lại lúc nào cũng ra đúng một số. */
  bangThang(token: string, nam: number, thang: number): Promise<BangThang> {
    return authed<BangThang>(`${P}/thang/${nam}/${thang}`, token);
  },
  /** Tải .xlsx bảng khấu hao tháng. Trả blob URL — nơi gọi tự `revokeObjectURL` sau khi bấm tải. */
  excelThang(token: string, nam: number, thang: number): Promise<string> {
    return taiFile(token, `${P}/thang/${nam}/${thang}/excel`);
  },
};
