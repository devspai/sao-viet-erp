/** Bộ lọc nâng cao DÙNG CHUNG của hai sổ phiếu — Phiếu chi và Phiếu thu (đặc tả PC-1, PT-1, A.18).
 *
 *  Hai màn có cùng sáu điều kiện: Số tiền (khoảng), Hình thức, Nguồn (nhiều), Tài khoản công ty, tên
 *  người (Người nhận / Người nộp) và Chứng từ. Chỉ khác danh sách nguồn và chữ — phần đó do từng màn
 *  khai. Hàm thuần, không React.
 */
import type { LocPhieu } from "../../../api/client";

/** Bộ lọc nâng cao ĐÃ ÁP (bản nháp trong bảng lọc cùng kiểu). `nguon` là khoá GIAO DIỆN — một khoá có
 *  thể gom nhiều `source_type` (xem `nguonGui` của từng màn). `ten_nhan` là tên người đi vào tham số
 *  `nhan` riêng của máy chủ: Phiếu chi là người nhận, Phiếu thu là người nộp. */
export type LocNangCao = {
  tien_tu?: number;
  tien_den?: number;
  hinh_thuc?: "cash" | "bank_transfer";
  nguon: string[];
  tai_khoan_id?: number;
  ten_nhan?: string;
  chung_tu?: "co" | "thieu";
};

export const LOC_TRONG: LocNangCao = { nguon: [] };

/** Phần tham số máy chủ do bộ lọc nâng cao quyết định (không gồm thẻ, kỳ, ô tìm). */
export function thamSoNangCao(
  loc: LocNangCao,
  nguonGui: (nguon: string[]) => string[] = (n) => n,
): Pick<LocPhieu, "nhan" | "tien_tu" | "tien_den" | "hinh_thuc" | "nguon" | "tai_khoan_id"> {
  return {
    // Ô tên người có tham số riêng ở máy chủ — sống cùng ô tìm (AND), không đè nhau.
    nhan: loc.ten_nhan?.trim() || undefined,
    tien_tu: loc.tien_tu,
    tien_den: loc.tien_den,
    hinh_thuc: loc.hinh_thuc,
    nguon: nguonGui(loc.nguon),
    tai_khoan_id: loc.tai_khoan_id,
  };
}

export function soDieuKien(loc: LocNangCao): number {
  let n = 0;
  if (loc.tien_tu != null || loc.tien_den != null) n++;
  if (loc.hinh_thuc) n++;
  if (loc.nguon.length) n++;
  if (loc.tai_khoan_id != null) n++;
  if (loc.ten_nhan?.trim()) n++;
  if (loc.chung_tu) n++;
  return n;
}

/** Bỏ MỘT điều kiện theo khoá chip. */
export function boDieuKien(loc: LocNangCao, khoa: string): LocNangCao {
  switch (khoa) {
    case "tien":
      return { ...loc, tien_tu: undefined, tien_den: undefined };
    case "nguon":
      return { ...loc, nguon: [] };
    default:
      return { ...loc, [khoa]: undefined };
  }
}

/* ---------- URL (đặc tả A.18) ---------- */

/** Số nguyên dương an toàn từ URL; rác thì undefined. */
export function soDuong(v: string | null): number | undefined {
  if (v == null || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** Bộ lọc nâng cao → khoá URL. `nguonUrl` = cặp [khoá giao diện, mã ngắn trên URL] của màn.
 *  Giá trị mặc định ⇒ undefined (khoá bị bỏ khỏi URL). */
export function locNangCaoLenUrl(loc: LocNangCao, nguonUrl: [string, string][]): Record<string, string | undefined> {
  const nguon = loc.nguon
    .map((n) => nguonUrl.find(([k]) => k === n)?.[1])
    .filter((n): n is string => !!n);
  return {
    tien_tu: loc.tien_tu != null ? String(loc.tien_tu) : undefined,
    tien_den: loc.tien_den != null ? String(loc.tien_den) : undefined,
    hinh_thuc: loc.hinh_thuc,
    nguon: nguon.length ? nguon.join(",") : undefined,
    tk: loc.tai_khoan_id != null ? String(loc.tai_khoan_id) : undefined,
    nhan: loc.ten_nhan?.trim() || undefined,
    chung_tu: loc.chung_tu,
  };
}

/** Khoá URL → bộ lọc nâng cao. Giá trị rác thì bỏ qua từng khoá (không làm hỏng cả bộ lọc). */
export function locNangCaoTuUrl(p: URLSearchParams, nguonUrl: [string, string][]): LocNangCao {
  const loc: LocNangCao = { nguon: [] };
  const tienTu = soDuong(p.get("tien_tu"));
  const tienDen = soDuong(p.get("tien_den"));
  if (tienTu != null) loc.tien_tu = tienTu;
  if (tienDen != null) loc.tien_den = tienDen;
  const ht = p.get("hinh_thuc");
  if (ht === "cash" || ht === "bank_transfer") loc.hinh_thuc = ht;
  loc.nguon = (p.get("nguon") ?? "")
    .split(",")
    .map((m) => nguonUrl.find(([, ngan]) => ngan === m)?.[0])
    .filter((n): n is string => !!n);
  const tk = soDuong(p.get("tk"));
  if (tk != null && tk > 0) loc.tai_khoan_id = tk;
  const nhan = p.get("nhan")?.trim();
  if (nhan) loc.ten_nhan = nhan;
  const ct = p.get("chung_tu");
  if (ct === "co" || ct === "thieu") loc.chung_tu = ct;
  return loc;
}
