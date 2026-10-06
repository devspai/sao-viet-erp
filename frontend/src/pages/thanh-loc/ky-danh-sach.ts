/** Dải kỳ của ba danh sách Kinh doanh — Tính giá thành, Báo giá, Đơn hàng bán (06/10/2026,
 *  phương án A "khuôn Kế toán").
 *
 *  Khác thanh kỳ của Kế toán ở hai chỗ: có "Tất cả" (mặc định — mở màn vẫn thấy mọi chứng từ như
 *  trước), và kỳ là TRỌN tháng/quý/năm chứ không dừng ở hôm nay, vì lọc theo ngày giao hẹn hay hạn
 *  hiệu lực thì ngày tương lai mới là thứ cần xem. Hàm thuần, không React.
 */
import type { ThamSoLoc } from "../../api/client";
import { congNgay, homNayVN, loiKhoang } from "../../utils/ky";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";

export type LoaiKyDS = "tat_ca" | "thang" | "quy" | "nam" | "12t" | "tuy";

export const LOAI_KY_DS: [LoaiKyDS, string][] = [
  ["tat_ca", "Tất cả"],
  ["thang", "Tháng này"],
  ["quy", "Quý này"],
  ["nam", "Năm nay"],
  ["12t", "12 tháng qua"],
  ["tuy", "Tuỳ chọn"],
];

/** `moc` = kỳ tính theo ngày nào (mã do từng màn khai, vd `tao`, `gui`, `giao`). */
export type KyDS = { loai: LoaiKyDS; tu?: string; den?: string; moc: string };

export type Khoang = { tu: string; den: string };

const dd = (n: number) => String(n).padStart(2, "0");
const cuoiThang = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Khoảng ngày của kỳ; "Tất cả" (hoặc Tuỳ chọn chưa đủ hai ngày) ⇒ null = không chặn ngày. */
export function khoangKy(ky: KyDS, homNay: string = homNayVN()): Khoang | null {
  const [y, m] = homNay.split("-").map(Number);
  switch (ky.loai) {
    case "thang":
      return { tu: `${y}-${dd(m)}-01`, den: `${y}-${dd(m)}-${dd(cuoiThang(y, m))}` };
    case "quy": {
      const dau = Math.floor((m - 1) / 3) * 3 + 1;
      return { tu: `${y}-${dd(dau)}-01`, den: `${y}-${dd(dau + 2)}-${dd(cuoiThang(y, dau + 2))}` };
    }
    case "nam":
      return { tu: `${y}-01-01`, den: `${y}-12-31` };
    case "12t":
      return { tu: congNgay(homNay, -364), den: homNay };
    case "tuy":
      return ky.tu && ky.den && !loiKhoang(ky.tu, ky.den) ? { tu: ky.tu, den: ky.den } : null;
    default:
      return null;
  }
}

/** Tham số máy chủ của kỳ. `moc` chỉ gửi khi có khoảng ngày (không chặn ngày thì mốc vô nghĩa). */
export function thamSoKy(ky: KyDS): ThamSoLoc {
  const k = khoangKy(ky);
  return k ? { tu_ngay: k.tu, den_ngay: k.den, moc: ky.moc } : {};
}

/** Kỳ từ URL của màn; khoá lạ/sai ⇒ phần đó về mặc định. */
export function kyTuUrl(p: URLSearchParams, mocHopLe: string[], mocMacDinh: string): KyDS {
  const loai = p.get("ky");
  const moc = p.get("moc");
  const ky: KyDS = {
    loai: LOAI_KY_DS.some(([l]) => l === loai) ? (loai as LoaiKyDS) : "tat_ca",
    moc: moc && mocHopLe.includes(moc) ? moc : mocMacDinh,
  };
  if (ky.loai === "tuy") {
    const tu = p.get("tu") ?? "";
    const den = p.get("den") ?? "";
    if (loiKhoang(tu, den)) return { ...ky, loai: "tat_ca" };
    return { ...ky, tu, den };
  }
  return ky;
}

/** Khoá URL của kỳ — giá trị mặc định thì bỏ khoá. */
export function kyLenUrl(ky: KyDS, mocMacDinh: string): GiaTriUrl {
  return {
    ky: ky.loai === "tat_ca" ? undefined : ky.loai,
    tu: ky.loai === "tuy" ? ky.tu : undefined,
    den: ky.loai === "tuy" ? ky.den : undefined,
    moc: ky.moc === mocMacDinh ? undefined : ky.moc,
  };
}

/** Số nguyên dương từ URL; rác ⇒ undefined. */
export function soTuUrl(v: string | null): number | undefined {
  if (v == null || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : undefined;
}

export const soLenUrl = (n?: number) => (n == null ? undefined : String(n));
