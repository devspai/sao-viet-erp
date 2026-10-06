/** Phép tính NGÀY và SỐ của hồ sơ khách — tách khỏi component để test được.
 *
 *  Mọi số liệu tiền/đơn/báo giá do máy chủ cộng (`/api/customers/{id}/thong-ke`, lịch sử phân
 *  trang). Ở đây chỉ còn: tính khoảng ngày của kỳ đang chọn, lùi một năm để so cùng kỳ, chọn bước
 *  biểu đồ, và cách viết số. Ngày là chuỗi "YYYY-MM-DD" theo giờ Việt Nam.
 */
import type { BuocBieuDo, KyXem } from "../api/client";
import { ngayDeDoc, soNgay } from "../utils/ky";

// Phép tính kỳ và cách viết ngày đã chuyển sang `utils/ky.ts` (dùng chung với 5 màn kế toán).
// Giữ lối xuất cũ để mọi chỗ đang import từ đây vẫn chạy.
export {
  LOAI_KY, TRAN_KHOANG_NGAY, homNayVN, congNgay, soNgay, luiNam, tinhKy, loiKhoang, ngayCuaMoc, ngayDeDoc,
} from "../utils/ky";
export type { LoaiKy } from "../utils/ky";

const dd = (n: number) => String(n).padStart(2, "0");
const tach = (s: string): [number, number, number] => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return [y, m, d];
};

/** Kỳ ≤ ~3 tháng vẽ theo tuần, dài hơn theo tháng. Máy chủ tự gộp thô hơn nếu quá 60 cột. */
export function buocTuDong(ky: KyXem): BuocBieuDo {
  return soNgay(ky.tu, ky.den) <= 93 ? "tuan" : "thang";
}

export const TEN_BUOC: Record<BuocBieuDo, string> = { tuan: "tuần", thang: "tháng", quy: "quý" };

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
