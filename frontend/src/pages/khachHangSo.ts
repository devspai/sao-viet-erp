/** Phép tính NGÀY và SỐ của hồ sơ khách — tách khỏi component để test được.
 *
 *  Mọi số liệu tiền/đơn/báo giá do máy chủ cộng (`/api/customers/{id}/thong-ke`, lịch sử phân
 *  trang). Ở đây chỉ còn: tính khoảng ngày của kỳ đang chọn, lùi một năm để so cùng kỳ, chọn bước
 *  biểu đồ, và cách viết số. Ngày là chuỗi "YYYY-MM-DD" theo giờ Việt Nam.
 */
import type { BuocBieuDo, KyXem } from "../api/client";

const MS_NGAY = 86_400_000;
const GIO_VN = 7 * 3_600_000;

export type LoaiKy = "thang" | "quy" | "nam" | "12t" | "namtruoc" | "tuy";
export const LOAI_KY: [LoaiKy, string][] = [
  ["thang", "Tháng này"],
  ["quy", "Quý này"],
  ["nam", "Năm nay"],
  ["12t", "12 tháng qua"],
  ["namtruoc", "Năm trước"],
  ["tuy", "Tuỳ chọn"],
];

/** Khoảng tối đa máy chủ nhận (~10 năm, khớp `TRAN_KHOANG_NGAY` bên backend có dư). */
export const TRAN_KHOANG_NGAY = 3650;

const dd = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${dd(m)}-${dd(d)}`;
const tach = (s: string): [number, number, number] => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return [y, m, d];
};
const utc = (s: string) => {
  const [y, m, d] = tach(s);
  return Date.UTC(y, m - 1, d);
};

/** Hôm nay theo giờ Việt Nam, không phụ thuộc múi giờ của máy đang mở trang. */
export function homNayVN(now: number = Date.now()): string {
  return new Date(now + GIO_VN).toISOString().slice(0, 10);
}

/** Ngày (giờ VN) của một mốc thời gian máy chủ trả về. */
export function ngayCuaMoc(moc: string): string {
  const t = new Date(moc).getTime();
  return Number.isNaN(t) ? moc.slice(0, 10) : homNayVN(t);
}

export function congNgay(s: string, n: number): string {
  return new Date(utc(s) + n * MS_NGAY).toISOString().slice(0, 10);
}

export function soNgay(tu: string, den: string): number {
  return Math.round((utc(den) - utc(tu)) / MS_NGAY);
}

/** Lùi n năm. 29/02 sang năm không nhuận thành 28/02 — khớp `lui_nam` bên backend. */
export function luiNam(s: string, n = 1): string {
  const [y, m, d] = tach(s);
  const nam = y - n;
  const cuoiThang = new Date(Date.UTC(nam, m, 0)).getUTCDate();
  return iso(nam, m, Math.min(d, cuoiThang));
}

export function tinhKy(loai: LoaiKy, homNay: string, tuy?: KyXem | null): KyXem {
  const [y, m] = tach(homNay);
  switch (loai) {
    case "thang":
      return { tu: iso(y, m, 1), den: homNay };
    case "quy":
      return { tu: iso(y, Math.floor((m - 1) / 3) * 3 + 1, 1), den: homNay };
    case "12t":
      return { tu: congNgay(homNay, -364), den: homNay };
    case "namtruoc":
      return { tu: iso(y - 1, 1, 1), den: iso(y - 1, 12, 31) };
    case "tuy":
      if (tuy) return tuy;
      return { tu: iso(y, 1, 1), den: homNay };
    case "nam":
    default:
      return { tu: iso(y, 1, 1), den: homNay };
  }
}

/** Lỗi của khoảng tự gõ, hoặc null nếu dùng được. */
export function loiKhoang(tu: string, den: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tu) || !/^\d{4}-\d{2}-\d{2}$/.test(den)) return "Chọn đủ hai ngày.";
  if (tu > den) return "Ngày bắt đầu phải trước ngày kết thúc.";
  if (soNgay(tu, den) > TRAN_KHOANG_NGAY) return "Khoảng xem tối đa 10 năm.";
  return null;
}

/** Kỳ ≤ ~3 tháng vẽ theo tuần, dài hơn theo tháng. Máy chủ tự gộp thô hơn nếu quá 60 cột. */
export function buocTuDong(ky: KyXem): BuocBieuDo {
  return soNgay(ky.tu, ky.den) <= 93 ? "tuan" : "thang";
}

export const TEN_BUOC: Record<BuocBieuDo, string> = { tuan: "tuần", thang: "tháng", quy: "quý" };

/** "dd/mm/yyyy" từ "YYYY-MM-DD" hoặc mốc thời gian đầy đủ. */
export function ngayDeDoc(s: string | null | undefined): string {
  if (!s) return "—";
  const [y, m, d] = tach(s.length > 10 ? ngayCuaMoc(s) : s);
  return `${dd(d)}/${dd(m)}/${y}`;
}

export function ngayNgan(s: string): string {
  const [, m, d] = tach(s);
  return `${dd(d)}/${dd(m)}`;
}

/** Nhãn ngắn dưới trục và nhãn đầy đủ (tooltip, dải "Đang xem riêng") của một cột biểu đồ. */
export function nhanCot(tu: string, den: string, buoc: BuocBieuDo, dauTien: boolean): { ngan: string; du: string } {
  const [y, m] = tach(tu);
  const q = Math.floor((m - 1) / 3) + 1;
  if (buoc === "tuan") return { ngan: ngayNgan(tu), du: `Tuần ${ngayDeDoc(tu)} – ${ngayDeDoc(den)}` };
  if (buoc === "quy") return { ngan: `Q${q}/${String(y).slice(2)}`, du: `Quý ${q}/${y}` };
  return { ngan: `T${m}${m === 1 || dauTien ? "/" + String(y).slice(2) : ""}`, du: `Tháng ${m}/${y}` };
}

/** Tiền gọn: "1,25 tỷ đ", "350,5 Mđ", "820 Kđ" — cùng quy ước với cột Mua hàng ở danh sách. */
export function tienGon(n: number | null | undefined): string {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return (n / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tỷ đ";
  if (a >= 1_000_000) return (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " Mđ";
  if (a >= 1_000) return (n / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " Kđ";
  return n.toLocaleString("vi-VN") + " đ";
}

export type HuongDoi = "len" | "xuong" | "bang";
export interface MucDoi {
  huong: HuongDoi;
  chu: string;
}

/** Mức đổi so với cùng kỳ. `kieu = "pt"` ra phần trăm, `"so"` ra chênh lệch số đếm. */
export function soCungKy(nay: number, cu: number, kieu: "pt" | "so" = "pt"): MucDoi {
  if (!nay && !cu) return { huong: "bang", chu: "Cùng kỳ: 0" };
  if (kieu === "so") {
    const x = nay - cu;
    if (x === 0) return { huong: "bang", chu: "Bằng cùng kỳ" };
    return { huong: x > 0 ? "len" : "xuong", chu: `${x > 0 ? "▲" : "▼"} ${Math.abs(x)} so cùng kỳ` };
  }
  if (!cu) return { huong: "len", chu: "Mới so cùng kỳ" };
  const p = Math.round(((nay - cu) / cu) * 100);
  if (p === 0) return { huong: "bang", chu: "Bằng cùng kỳ" };
  return { huong: p > 0 ? "len" : "xuong", chu: `${p > 0 ? "▲" : "▼"} ${Math.abs(p)}% so cùng kỳ` };
}

/** Bước chia trục Y (đơn vị đồng) để có ≤ 4 vạch. */
export function buocTruc(max: number): number {
  const ung = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].map((x) => x * 1_000_000);
  return ung.find((s) => max / s <= 4) ?? 20_000_000_000;
}
