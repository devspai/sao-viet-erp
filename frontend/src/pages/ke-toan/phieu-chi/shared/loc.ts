/** Bộ lọc màn Phiếu chi (đặc tả PC-1, A.17, A.18): thẻ lọc + kỳ + điều kiện → tham số máy chủ.
 *
 *  Hàm thuần, không React — để test được mà không dựng màn. Mọi lọc chạy ở MÁY CHỦ. Kỳ gửi theo quy
 *  ước chung `tu_ngay/den_ngay/moc` (mốc `tao` = ngày lập phiếu, `chi` = ngày chi trên chứng từ).
 */
import { thamSoKy, type KyDS } from "../../../thanh-loc/ky-danh-sach";
import {
  LOC_TRONG,
  locNangCaoLenUrl,
  locNangCaoTuUrl,
  soDieuKien,
  thamSoNangCao,
  type CauHinhLocPhieu,
  type LocNangCao,
} from "../../shared/locPhieu";
import type { ThamSoSo } from "../../shared/trangPhieu";

export { LOC_TRONG, soDieuKien };

/** Mốc kỳ của màn — mặc định Ngày tạo. */
export const MOC_PC: [string, string][] = [["tao", "Ngày tạo"], ["chi", "Ngày chi"]];

/** Thẻ lọc đầu bảng. "gc" không lọc phiếu — nó đổi bảng sang hàng chờ gia công. */
export type TheLocPC = "tat_ca" | "xong" | "thieu" | "gc" | "da_huy";

/** Bộ lọc ĐÃ ÁP — khuôn chung của hai sổ phiếu (`shared/locPhieu.ts`). `nguon` là khoá GIAO DIỆN —
 *  "khac" gom nhiều `source_type`, xem `nguonGui`. */
export type LocPC = LocNangCao;

/** Bốn lựa chọn Nguồn chi. "Khác" gồm mọi nguồn bảng hiện chữ "Khác" (chi nội bộ, hoàn tiền
 *  khách, khác) — chọn "Khác" mà sót một loại thì bảng có dòng "Khác" không lọc ra được. */
export const NGUON_LUA_CHON: [string, string][] = [
  ["purchase_request", "Đơn mua"],
  ["gia_cong_ngoai", "Gia công"],
  ["salary_advance", "Tạm ứng lương"],
  ["khac", "Khác"],
];

export const CAU_HINH_LOC_PC: CauHinhLocPhieu = {
  nhanNguon: "Nguồn chi",
  nguonLuaChon: NGUON_LUA_CHON,
  nhanTaiKhoan: "Trả từ tài khoản",
};

const NGUON_KHAC = ["internal_expense", "customer_refund", "other"];

export function nguonGui(nguon: string[]): string[] {
  return nguon.flatMap((n) => (n === "khac" ? NGUON_KHAC : [n]));
}

/** Tham số lọc dùng chung cho bảng và số cùng kỳ — một nguồn, không hai chỗ. */
export function thamSoLoc(the: TheLocPC, loc: LocPC, tim: string, ky: KyDS): ThamSoSo {
  // "Thiếu chứng từ" chỉ tính phiếu ĐÃ CHI (máy chủ đếm số trên thẻ như vậy) — gửi kèm status để
  // tổng ở chân bảng khớp đúng con số trên thẻ.
  const status = the === "xong" || the === "thieu" ? "paid" : the === "da_huy" ? "cancelled" : undefined;
  return {
    q: tim.trim() || undefined,
    status,
    chung_tu: the === "thieu" ? "thieu" : loc.chung_tu,
    ...(thamSoKy(ky) as Pick<ThamSoSo, "tu_ngay" | "den_ngay" | "moc">),
    ...thamSoNangCao(loc, nguonGui),
  };
}

/** Tham số tải MỘT TRANG bảng. Mới nhất theo NGÀY CHI lên đầu (cột ngày là ngày chứng từ). */
export function thamSoTai(the: TheLocPC, loc: LocPC, tim: string, ky: KyDS, page: number, size: number) {
  return { ...thamSoLoc(the, loc, tim, ky), page, size, sort: "-voucher_date" };
}

/** Có đang lọc gì ngoài kỳ không — để bảng rỗng nói "không khớp bộ lọc" thay vì "chưa có". */
export function dangLoc(the: TheLocPC, loc: LocPC, tim: string): boolean {
  return the !== "tat_ca" || !!tim.trim() || soDieuKien(loc) > 0;
}

/* ---------- URL (đặc tả A.18) ---------- */

/** Trạng thái lọc của màn — thứ ghi lên URL cùng với kỳ (kỳ do `useKyKeToan` tự ghi). */
export type TrangThaiLocPC = { the: TheLocPC; tim: string; loc: LocPC };

const THE_HOP_LE: TheLocPC[] = ["tat_ca", "xong", "thieu", "gc", "da_huy"];

/** Mã ngắn của Nguồn chi trên URL — link đọc được: `nguon=po,khac`. */
const NGUON_URL: [string, string][] = [
  ["purchase_request", "po"],
  ["gia_cong_ngoai", "gc"],
  ["salary_advance", "tu"],
  ["khac", "khac"],
];

/** Trạng thái lọc → khoá URL. Giá trị mặc định ⇒ undefined (khoá bị bỏ khỏi URL). */
export function locLenUrl({ the, tim, loc }: TrangThaiLocPC): Record<string, string | undefined> {
  return {
    the: the === "tat_ca" ? undefined : the,
    q: tim.trim() || undefined,
    ...locNangCaoLenUrl(loc, NGUON_URL),
  };
}

/** Khoá URL → trạng thái lọc. Giá trị rác thì bỏ qua từng khoá (không làm hỏng cả bộ lọc). */
export function locTuUrl(p: URLSearchParams | null): TrangThaiLocPC {
  if (!p) return { the: "tat_ca", tim: "", loc: LOC_TRONG };
  const the = THE_HOP_LE.find((t) => t === p.get("the")) ?? "tat_ca";
  return { the, tim: p.get("q") ?? "", loc: locNangCaoTuUrl(p, NGUON_URL) };
}
