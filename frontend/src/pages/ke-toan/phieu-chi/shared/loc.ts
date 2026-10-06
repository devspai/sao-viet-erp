/** Bộ lọc màn Phiếu chi (đặc tả PC-1, A.17, A.18): thẻ lọc + kỳ + bộ lọc nâng cao → tham số máy chủ.
 *
 *  Hàm thuần, không React — để test được mà không dựng màn. Mọi lọc chạy ở MÁY CHỦ.
 */
import type { KyXem, LocPhieu } from "../../../../api/client";
import {
  LOC_TRONG,
  boDieuKien,
  locNangCaoLenUrl,
  locNangCaoTuUrl,
  soDieuKien,
  thamSoNangCao,
  type LocNangCao,
} from "../../shared/locPhieu";

export { LOC_TRONG, boDieuKien, soDieuKien };

/** Thẻ lọc đầu bảng. "gc" không lọc phiếu — nó đổi bảng sang hàng chờ gia công. */
export type TheLocPC = "tat_ca" | "xong" | "thieu" | "gc" | "da_huy";

/** Bộ lọc nâng cao ĐÃ ÁP — khuôn chung của hai sổ phiếu (`shared/locPhieu.ts`). `nguon` là khoá
 *  GIAO DIỆN — "khac" gom nhiều `source_type`, xem `nguonGui`. `ten_nhan` = ô "Người nhận". */
export type LocPC = LocNangCao;

/** Bốn lựa chọn Nguồn chi. "Khác" gồm mọi nguồn bảng hiện chữ "Khác" (chi nội bộ, hoàn tiền
 *  khách, khác) — chọn "Khác" mà sót một loại thì bảng có dòng "Khác" không lọc ra được. */
export const NGUON_LUA_CHON: [string, string][] = [
  ["purchase_request", "Đơn mua"],
  ["gia_cong_ngoai", "Gia công"],
  ["salary_advance", "Tạm ứng lương"],
  ["khac", "Khác"],
];

const NGUON_KHAC = ["internal_expense", "customer_refund", "other"];

export function nguonGui(nguon: string[]): string[] {
  return nguon.flatMap((n) => (n === "khac" ? NGUON_KHAC : [n]));
}

/** Tham số lọc dùng chung cho bảng, số cùng kỳ và đếm "Khớp n phiếu" — một nguồn, không ba chỗ. */
export function thamSoLoc(
  the: TheLocPC,
  loc: LocPC,
  tim: string,
  ky: KyXem,
): Omit<LocPhieu, "status"> & { status?: string } {
  // "Thiếu chứng từ" chỉ tính phiếu ĐÃ CHI (máy chủ đếm số trên thẻ như vậy) — gửi kèm status để
  // tổng ở chân bảng khớp đúng con số trên thẻ.
  const status = the === "xong" || the === "thieu" ? "paid" : the === "da_huy" ? "cancelled" : undefined;
  return {
    q: tim.trim() || undefined,
    status,
    chung_tu: the === "thieu" ? "thieu" : loc.chung_tu,
    tu_ngay: ky.tu,
    den_ngay: ky.den,
    ...thamSoNangCao(loc, nguonGui),
  };
}

/** Tham số tải MỘT TRANG bảng. Mới nhất theo NGÀY CHI lên đầu (cột ngày là ngày chứng từ). */
export function thamSoTai(
  the: TheLocPC,
  loc: LocPC,
  tim: string,
  ky: KyXem,
  page: number,
  size: number,
) {
  return { ...thamSoLoc(the, loc, tim, ky), page, size, sort: "-voucher_date" };
}

/** Có đang lọc gì ngoài kỳ không — để bảng rỗng nói "không khớp bộ lọc" thay vì "chưa có". */
export function dangLoc(the: TheLocPC, loc: LocPC, tim: string): boolean {
  return the !== "tat_ca" || !!tim.trim() || soDieuKien(loc) > 0;
}

/* ---------- URL (đặc tả A.18) ---------- */

/** Trạng thái lọc của màn — thứ ghi lên URL cùng với kỳ (kỳ do `useKyMan` tự ghi). */
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
