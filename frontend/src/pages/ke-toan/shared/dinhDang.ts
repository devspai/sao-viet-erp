/** Cách viết số và ngày của 5 màn kế toán — dùng lại helper chung, không chép thêm bản thứ ba. */
import { ngayDeDoc } from "../../../utils/ky";
import { money } from "../../../utils/format";

/** "1.204.000 đ"; không có số thì "—". */
export function tien(n: number | null | undefined): string {
  return n == null ? "—" : money(n);
}

/** Số đếm có dấu chấm nghìn: "1.204" (phiếu, việc…). */
export function vietSo(n: number): string {
  return n.toLocaleString("vi-VN");
}

/** "05/10/2026" từ "2026-10-05" (mốc thời gian đầy đủ thì lấy ngày theo giờ Việt Nam). */
export function ngay(iso: string | null | undefined): string {
  return ngayDeDoc(iso);
}

/** "05/10/2026 10:02" — mốc máy chủ (UTC, có hoặc không hậu tố Z) đọc theo giờ Việt Nam. */
export function ngayGio(moc: string | null | undefined): string {
  if (!moc) return "—";
  const coMui = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(moc);
  const d = new Date(!coMui && moc.includes("T") ? `${moc}Z` : moc);
  if (Number.isNaN(d.getTime())) return ngay(moc);
  const gio = d.toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return `${ngay(d.toISOString())} ${gio}`;
}

/** Đổi so với cùng kỳ. `phanTram` là độ lớn đã làm tròn (≥ 0, chiều nằm ở `huong`); cùng kỳ
 *  bằng 0 thì không chia được ⇒ null. Làm tròn ra 0% thì coi là "bằng" — khớp `soCungKy` của
 *  Thống kê khách hàng, để mũi tên không chỉ lên cạnh chữ "0%". */
export function doiSo(nay: number, truoc: number): { huong: "len" | "xuong" | "bang"; phanTram: number | null } {
  const huong = nay > truoc ? "len" : nay < truoc ? "xuong" : "bang";
  if (!truoc) return { huong, phanTram: null };
  const phanTram = Math.round((Math.abs(nay - truoc) / Math.abs(truoc)) * 100);
  return { huong: phanTram === 0 ? "bang" : huong, phanTram };
}
