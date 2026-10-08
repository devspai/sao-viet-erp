/** Thanh lọc chung cho trang danh mục dùng chung (06/10/2026, Task 20) — hàm thuần, không React.
 *
 *  Trạng thái lọc của một màn danh mục = kỳ theo Ngày tạo + `{tham số máy chủ: giá trị}`. Khoá của
 *  object lọc CHÍNH LÀ tên query param gửi máy chủ và khoá trên URL — không có lớp đổi tên ở giữa.
 *  Khoá `active` (Đang dùng / Đã ngừng) do trang tự thêm cho màn xoá mềm; mặc định "Đang dùng" (giữ
 *  hành vi cũ: mở màn chỉ thấy dòng còn dùng) và HIỆN thành một điều kiện đã áp, bỏ đi là xem tất cả.
 */
import type { DemGiaTri } from "../../api/rebuildCatalog";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, type KyDS } from "../thanh-loc/ky-danh-sach";
import type { GiaTriDK } from "../thanh-loc/thanh-loc";
import type { CatalogConfig, DieuKienDanhMuc, Option } from "./types";

export type LocDM = Record<string, string | undefined>;
export type LocManDM = { ky: KyDS; loc: LocDM };

/** Danh mục chỉ có một mốc ngày: Ngày tạo. */
export const MOC_DM: [string, string][] = [["tao", "Ngày tạo"]];
export const KHOA_ACTIVE = "active";
/** Trên URL: bỏ điều kiện "Trạng thái" (xem cả đang dùng lẫn đã ngừng). Vắng khoá = mặc định. */
const ACTIVE_TAT_CA = "tat_ca";

export function locMacDinh(config: Pick<CatalogConfig, "softDelete">): LocManDM {
  return { ky: { loai: "tat_ca", moc: "tao" }, loc: config.softDelete ? { [KHOA_ACTIVE]: "true" } : {} };
}

const khoaDieuKien = (config: Pick<CatalogConfig, "dieuKien">) => (config.dieuKien ?? []).map((d) => d.key);

export function docLocDM(p: URLSearchParams, config: Pick<CatalogConfig, "dieuKien" | "softDelete">): LocManDM {
  const loc: LocDM = {};
  for (const k of khoaDieuKien(config)) {
    const v = p.get(k);
    if (v) loc[k] = v;
  }
  if (config.softDelete) {
    const a = p.get(KHOA_ACTIVE);
    loc[KHOA_ACTIVE] = a === ACTIVE_TAT_CA ? undefined : a === "false" ? "false" : "true";
  }
  return { ky: kyTuUrl(p, MOC_DM.map(([m]) => m), "tao"), loc };
}

export function ghiLocDM(t: LocManDM, config: Pick<CatalogConfig, "dieuKien" | "softDelete">): GiaTriUrl {
  const url: GiaTriUrl = { ...kyLenUrl(t.ky, "tao") };
  for (const k of khoaDieuKien(config)) url[k] = t.loc[k];
  if (config.softDelete) {
    const a = t.loc[KHOA_ACTIVE];
    url[KHOA_ACTIVE] = a === "true" ? undefined : a ?? ACTIVE_TAT_CA;
  }
  return url;
}

/** Giá trị chọn được của một điều kiện: nền khai sẵn (nhãn thuần Việt / danh mục nguồn — vẫn hiện
 *  khi đếm 0) rồi nối mọi giá trị CÓ THẬT mà máy chủ đếm được nhưng nền chưa có (vd nhóm máy đã gỡ
 *  khỏi danh mục, khách, tổ). Số lấy từ `dem`. */
export function gopGiaTri(nen: Option[] | undefined, dem: DemGiaTri[] | undefined,
  nhanGiaTri?: Record<string, string>): GiaTriDK[] {
  const so = new Map((dem ?? []).map((d) => [d.value, d]));
  const ra: GiaTriDK[] = (nen ?? []).map((o) => ({ value: o.value, nhan: o.label, so: so.get(o.value)?.so ?? 0 }));
  const daCo = new Set(ra.map((g) => g.value));
  const them = (dem ?? [])
    .filter((d) => d.value && !daCo.has(d.value))
    .map((d) => ({ value: d.value, nhan: d.nhan || nhanGiaTri?.[d.value] || d.value, so: d.so }))
    .sort((a, b) => a.nhan.localeCompare(b.nhan, "vi"));
  return [...ra, ...them];
}

/** Nền giá trị của một điều kiện: `giaTri` khai cứng, hoặc danh mục nguồn đã nạp. */
export function nenCua(d: DieuKienDanhMuc, nguon: Record<string, Option[]>): Option[] | undefined {
  return d.giaTri ?? (d.nguon ? nguon[d.nguon] : undefined);
}

const NGAY_VN = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
});
const GIO_VN = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh",
});

/** Cột Ngày tạo: `dd/MM/yyyy` theo giờ VN (cùng ranh ngày với kỳ lọc ở máy chủ); rỗng ⇒ "—". */
export function ngayTao(v: unknown): string {
  const d = typeof v === "string" && v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? NGAY_VN.format(d) : "—";
}

/** `title` của ô Ngày tạo: đủ giờ, `dd/MM/yyyy HH:mm`. */
export function ngayGioTao(v: unknown): string | undefined {
  const d = typeof v === "string" && v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? `${NGAY_VN.format(d)} ${GIO_VN.format(d)}` : undefined;
}
