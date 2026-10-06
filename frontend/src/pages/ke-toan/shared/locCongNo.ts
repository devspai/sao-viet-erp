/** Bộ lọc màn CÔNG NỢ (phải trả, phải thu — đặc tả NPT-1, NPTh-1, A.17, A.18): nhóm nút, mốc tuổi
 *  nợ, ô tìm và bộ lọc nâng cao → tham số máy chủ và khoá URL.
 *
 *  Hàm thuần, không React. Mọi lọc chạy ở MÁY CHỦ (`LocCongNo` của `api.accounting.payables` /
 *  `receivables`); số tổng đầu màn không đổi theo lọc — máy chủ tính trên toàn bộ.
 */
import type { KyXem, LocCongNo } from "../../../api/client";
import { chuKhoang, type ChipLoc } from "./BoLocNangCao";
import { soDuong } from "./locPhieu";
import type { GiaTriUrl } from "./urlMan";

export type HanTra = NonNullable<LocCongNo["han_tra"]>;
export type HanMuc = NonNullable<LocCongNo["han_muc"]>;

/** Bộ lọc nâng cao ĐÃ ÁP (bản nháp trong bảng lọc cùng kiểu). */
export type LocNangCaoCongNo = {
  no_tu?: number;
  no_den?: number;
  han_tra?: HanTra;
  han_muc?: HanMuc;
  /** Kỳ đang chọn mà nhà cung cấp / khách đã về 0 thì máy chủ ẩn — bật ô này để hiện cả họ. */
  ca_da_tra_het?: boolean;
  /** Chỉ màn phải trả: có đợt giao còn nợ chưa ghi số hoá đơn. */
  thieu_hoa_don?: boolean;
  /** Chỉ màn phải thu: sale phụ trách khách. */
  phu_trach_id?: number;
  /** Chỉ màn phải thu: nhãn khách. */
  nhan?: string;
};

export const LOC_CONG_NO_TRONG: LocNangCaoCongNo = {};

/** Nhóm nút đầu thanh lọc ("Tất cả | Quá hạn | Vượt hạn mức") — giá trị là `filter` của máy chủ. */
export type TheCongNo = "all" | "overdue" | "vuot_han_muc";
export const THE_CONG_NO: [TheCongNo, string][] = [
  ["all", "Tất cả"],
  ["overdue", "Quá hạn"],
  ["vuot_han_muc", "Vượt hạn mức"],
];

export const HAN_TRA_LUA_CHON: [HanTra | "", string][] = [
  ["", "Tất cả"],
  ["qua_han", "Đã quá hạn"],
  ["7_ngay", "Tới hạn trong 7 ngày"],
  ["30_ngay", "Trong 30 ngày"],
];
const CHU_HAN_TRA: Record<HanTra, string> = {
  qua_han: "đã quá hạn",
  "7_ngay": "tới hạn trong 7 ngày",
  "30_ngay": "tới hạn trong 30 ngày",
};

export const HAN_MUC_LUA_CHON: [HanMuc | "", string][] = [
  ["", "Tất cả"],
  ["tren_80", "Dùng trên 80%"],
  ["vuot", "Đã vượt"],
  ["chua_dat", "Chưa đặt"],
];
const CHU_HAN_MUC: Record<HanMuc, string> = { tren_80: "dùng trên 80%", vuot: "đã vượt", chua_dat: "chưa đặt" };

/** Nhãn mốc tuổi nợ của máy chủ ("Trễ > 60 ngày") viết thành chữ ("Trễ trên 60 ngày"). Số ngày vẫn
 *  lấy từ máy chủ — giao diện không gõ lại mốc. */
export function nhanMoc(nhan: string): string {
  return nhan.replace(/>\s*/, "trên ");
}

export function soDieuKienCongNo(loc: LocNangCaoCongNo): number {
  let n = 0;
  if (loc.no_tu != null || loc.no_den != null) n++;
  if (loc.han_tra) n++;
  if (loc.han_muc) n++;
  if (loc.ca_da_tra_het) n++;
  if (loc.thieu_hoa_don) n++;
  if (loc.phu_trach_id != null) n++;
  if (loc.nhan?.trim()) n++;
  return n;
}

/** Bỏ MỘT điều kiện theo khoá chip ("no", "han_tra", "han_muc", "het", "thieu_hd", "phu_trach", "nhan"). */
export function boDieuKienCongNo(loc: LocNangCaoCongNo, khoa: string): LocNangCaoCongNo {
  switch (khoa) {
    case "no":
      return { ...loc, no_tu: undefined, no_den: undefined };
    case "het":
      return { ...loc, ca_da_tra_het: undefined };
    case "thieu_hd":
      return { ...loc, thieu_hoa_don: undefined };
    case "phu_trach":
      return { ...loc, phu_trach_id: undefined };
    case "nhan":
      return { ...loc, nhan: undefined };
    default:
      return { ...loc, [khoa]: undefined };
  }
}

/** Chip của từng điều kiện đã áp — thứ tự theo bảng lọc. `nhanHan` = "Hạn trả" / "Hạn thu";
 *  `nhanHet` = "nhà cung cấp đã trả hết" / "khách đã thu hết"; `tenPhuTrach` dịch mã người phụ
 *  trách ra tên (thiếu thì chip ghi "đã chọn"). */
export function chipsLocCongNo(
  loc: LocNangCaoCongNo,
  ch: { nhanHan: string; nhanHet: string; tenPhuTrach?: (id: number) => string | undefined },
): ChipLoc[] {
  const chips: ChipLoc[] = [];
  const khoang = chuKhoang(loc.no_tu, loc.no_den);
  if (khoang) chips.push({ khoa: "no", nhan: "Còn nợ", giaTri: khoang });
  if (loc.han_tra) chips.push({ khoa: "han_tra", nhan: ch.nhanHan, giaTri: CHU_HAN_TRA[loc.han_tra] });
  if (loc.han_muc) chips.push({ khoa: "han_muc", nhan: "Hạn mức", giaTri: CHU_HAN_MUC[loc.han_muc] });
  if (loc.ca_da_tra_het) chips.push({ khoa: "het", nhan: "Hiện cả", giaTri: ch.nhanHet });
  if (loc.thieu_hoa_don) chips.push({ khoa: "thieu_hd", nhan: "Hoá đơn", giaTri: "có đợt giao chưa ghi" });
  if (loc.phu_trach_id != null)
    chips.push({ khoa: "phu_trach", nhan: "Phụ trách", giaTri: ch.tenPhuTrach?.(loc.phu_trach_id) ?? "đã chọn" });
  if (loc.nhan?.trim()) chips.push({ khoa: "nhan", nhan: "Nhãn", giaTri: loc.nhan.trim() });
  return chips;
}

/* ---------- Trạng thái lọc của cả màn ---------- */

/** Thứ ghi lên URL cùng với kỳ (kỳ do `useKyMan` tự ghi). `tuoi` = khoá mốc tuổi nợ đang lọc. */
export type TrangThaiCongNo = { the: TheCongNo; tuoi: string | null; tim: string; loc: LocNangCaoCongNo };

/** Tham số máy chủ của bảng, số cùng kỳ và các lời đếm — một nguồn, không ba chỗ. */
export function thamSoCongNo({ the, tuoi, tim, loc }: TrangThaiCongNo, ky: KyXem): LocCongNo {
  return {
    q: tim.trim() || undefined,
    filter: the,
    aging: tuoi,
    tu_ngay: ky.tu,
    den_ngay: ky.den,
    no_tu: loc.no_tu,
    no_den: loc.no_den,
    han_tra: loc.han_tra,
    han_muc: loc.han_muc,
    ca_da_tra_het: loc.ca_da_tra_het || undefined,
    thieu_hoa_don: loc.thieu_hoa_don || undefined,
    phu_trach_id: loc.phu_trach_id,
    nhan: loc.nhan?.trim() || undefined,
  };
}

/** Có đang lọc gì ngoài kỳ không — bảng rỗng nói "không khớp bộ lọc" thay vì "không còn nợ ai". */
export function dangLocCongNo(tt: TrangThaiCongNo): boolean {
  return tt.the !== "all" || tt.tuoi != null || !!tt.tim.trim() || soDieuKienCongNo(tt.loc) > 0;
}

/* ---------- URL (đặc tả A.18) ---------- */

const MA_MOC = /^[a-z0-9_]{1,32}$/;

/** Trạng thái lọc → khoá URL. Giá trị mặc định ⇒ undefined (khoá bị bỏ khỏi URL). */
export function congNoLenUrl({ the, tuoi, tim, loc }: TrangThaiCongNo): GiaTriUrl {
  return {
    the: the === "all" ? undefined : the,
    tuoi: tuoi ?? undefined,
    q: tim.trim() || undefined,
    no_tu: loc.no_tu != null ? String(loc.no_tu) : undefined,
    no_den: loc.no_den != null ? String(loc.no_den) : undefined,
    han_tra: loc.han_tra,
    han_muc: loc.han_muc,
    het: loc.ca_da_tra_het ? "1" : undefined,
    thd: loc.thieu_hoa_don ? "1" : undefined,
    pt: loc.phu_trach_id != null ? String(loc.phu_trach_id) : undefined,
    nhan: loc.nhan?.trim() || undefined,
  };
}

/** Khoá URL → trạng thái lọc. Giá trị rác thì bỏ qua từng khoá (không làm hỏng cả bộ lọc). */
export function congNoTuUrl(p: URLSearchParams | null): TrangThaiCongNo {
  if (!p) return { the: "all", tuoi: null, tim: "", loc: LOC_CONG_NO_TRONG };
  const the = THE_CONG_NO.find(([t]) => t === p.get("the"))?.[0] ?? "all";
  const moc = p.get("tuoi");
  const loc: LocNangCaoCongNo = {};
  const noTu = soDuong(p.get("no_tu"));
  const noDen = soDuong(p.get("no_den"));
  if (noTu != null) loc.no_tu = noTu;
  if (noDen != null) loc.no_den = noDen;
  const han = HAN_TRA_LUA_CHON.find(([v]) => v && v === p.get("han_tra"))?.[0];
  if (han) loc.han_tra = han;
  const muc = HAN_MUC_LUA_CHON.find(([v]) => v && v === p.get("han_muc"))?.[0];
  if (muc) loc.han_muc = muc;
  if (p.get("het") === "1") loc.ca_da_tra_het = true;
  if (p.get("thd") === "1") loc.thieu_hoa_don = true;
  const pt = soDuong(p.get("pt"));
  if (pt != null) loc.phu_trach_id = pt;
  const nhan = p.get("nhan")?.trim();
  if (nhan) loc.nhan = nhan.slice(0, 64);
  return { the, tuoi: moc && MA_MOC.test(moc) ? moc : null, tim: p.get("q") ?? "", loc };
}
