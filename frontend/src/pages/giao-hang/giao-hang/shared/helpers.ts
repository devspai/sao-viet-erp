// Hàm dùng chung của màn Giao hàng (tách từ pages/GiaoHangPage.tsx).
import type { CaLuotKetQua, DeliveryTrip, LuotXeChiTiet } from "../../../../api/client";
import { api } from "../../../../api/client";
import { NHAN_TRANG_THAI_CHUYEN } from "./constants";

/** Nhãn trạng thái của MỘT chuyến — MỘT hàm cho MỌI chỗ render.
 *
 *  Kho lập phiếu xong ⇒ hàng đã soạn, tài xế tới lấy được, nên chữ đổi thành "Kho đã chuẩn bị
 *  xong" (chủ chốt 20/08/2026). Kho KHÔNG bấm gì trên màn này — cờ `kho_da_lap_phieu` đọc ngược
 *  từ sổ kho.
 *
 *  Viết thành hàm vì bảng chuyến render ở HAI chỗ (tab Đơn giao hàng và tab Yêu cầu giao); chép
 *  hai bản là sớm muộn hai chỗ nói hai kiểu. */
export function nhanChuyen(t: { trang_thai: string; kho_da_lap_phieu?: boolean }): string {
  if (t.trang_thai === "dang_chuan_bi" && t.kho_da_lap_phieu) return "Kho đã chuẩn bị xong";
  return NHAN_TRANG_THAI_CHUYEN[t.trang_thai] ?? t.trang_thai;
}

export function toneChuyen(tt: string): "on" | "off" | "warn" {
  if (tt === "thanh_cong") return "on";
  if (tt === "that_bai" || tt === "da_huy") return "off";
  return "warn";
}

/** Chuyến CHƯA có kết quả giao. */
export const CHUA_KET_QUA = ["da_len_ke_hoach", "dang_chuan_bi", "da_lay_hang", "dang_giao"];

export const so = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("vi-VN"));

const GIO_NGAY = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
});
const NGAY = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
});

function ngayGio(v?: string | null): Date | null {
  if (!v) return null;
  // Máy chủ có chỗ trả ISO KHÔNG hậu tố múi giờ (SQLite) — chuỗi naive là UTC, như `fmtDateTime`.
  const coMui = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(v);
  const d = new Date(!coMui && v.includes("T") ? `${v}Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "07:30 06/10" — giờ trước, ngày sau, bỏ giây và năm: đủ để điều độ trong tuần. */
export function gioNgay(v?: string | null): string {
  const d = ngayGio(v);
  if (!d) return "—";
  const p = Object.fromEntries(GIO_NGAY.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute} ${p.day}/${p.month}`;
}

/** "06/10/2026" — ô ngày THUẦN (`date`) giữ nguyên, không đổi múi giờ. */
export function ngay(v?: string | null): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = ngayGio(v);
  return d ? NGAY.format(d) : v;
}

/** "06/10" của một ô ngày thuần — cột Điểm giao chỉ cần ngày tháng hẹn. */
export function ngayNgan(v?: string | null): string {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  return m ? `${m[3]}/${m[2]}` : "—";
}

/** "2026-10-04" — ngày theo giờ VN của một mốc giờ; chuỗi đã là ngày thì giữ nguyên. */
export function ngayIso(v?: string | null): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = ngayGio(v);
  return d ? d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }) : null;
}

/** Ngày khách nhận so với ngày hẹn: "Sớm 26 ngày" / "Trễ 3 ngày" / "Đúng hẹn". */
export function soVoiHen(hen?: string | null, nhan?: string | null): { text: string; tre: boolean } | null {
  const a = ngayIso(hen);
  const b = ngayIso(nhan);
  if (!a || !b) return null;
  const n = Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  if (n === 0) return { text: "Đúng hẹn", tre: false };
  return n < 0 ? { text: `Sớm ${-n} ngày`, tre: false } : { text: `Trễ ${n} ngày`, tre: true };
}

/** Địa chỉ rút gọn cho bảng: bỏ số nhà/đường đầu và tỉnh/thành cuối, giữ khu + phường/xã — đủ để
 *  biết điểm nằm vùng nào. Địa chỉ ngắn (≤ 2 mẩu) giữ nguyên. */
export function diaChiGon(dc?: string | null): string {
  const p = (dc ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (p.length <= 2) return p.join(", ");
  return p.slice(-3, -1).join(", ");
}

export function lienKetBanDo(dc: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dc)}`;
}

/** Số điện thoại đọc theo cụm "0779 958 485". */
export function sdtDoc(s: string): string {
  const d = s.replace(/\s+/g, "");
  return /^\d{10}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : s;
}

/** Trạng thái CẢ lượt — một câu, đọc từ số đếm máy chủ trả (không tự suy từ từng dòng hai kiểu). */
export function trangThaiLuot(l: LuotXeChiTiet): { text: string; tone: "on" | "warn" } {
  if (l.ve_kho_luc) return { text: "Đã về kho", tone: "on" };
  if (l.cho_ve_kho) return { text: "Chờ về kho", tone: "warn" };
  if (l.so_dang_giao > 0) return { text: "Đang giao", tone: "warn" };
  if (l.so_cho_bat_dau > 0) return { text: "Đã lấy hàng", tone: "warn" };
  if (l.so_cho_lay_hang > 0) {
    const xong = l.diem.every((t) => t.trang_thai !== "dang_chuan_bi" || t.kho_da_lap_phieu);
    return { text: xong ? "Kho đã chuẩn bị xong" : "Kho đang chuẩn bị", tone: "warn" };
  }
  return { text: "Chờ gửi kho", tone: "warn" };
}

export const coKetQua = (t: DeliveryTrip) => !CHUA_KET_QUA.includes(t.trang_thai);

export type FormLuot = "gui_kho" | "xuat_phat" | "ve_kho";

/** Một bước CẢ LƯỢT: hoặc mở ô nhập (`form`), hoặc gọi thẳng máy chủ (`lam`). */
export type BuocLuot =
  | { nhan: string; form: FormLuot }
  | { nhan: string; lam: (token: string) => Promise<CaLuotKetQua>; bao: (r: CaLuotKetQua) => string };

/** Các bước còn làm được của lượt — cái ĐẦU là việc chính. Thường chỉ có một; có hai khi lượt lệch
 *  nhịp (một điểm kho còn soạn, điểm kia đã lên xe) — vẫn bắt đầu giao được những điểm đã lấy hàng,
 *  không bắt cả xe đứng chờ. Dòng bảng và đầu ngăn đọc CÙNG một hàm. */
export function buocLuot(l: LuotXeChiTiet, canPlan: boolean, canWrite: boolean): BuocLuot[] {
  const ds: BuocLuot[] = [];
  if (canPlan && l.so_cho_gui_kho > 0)
    ds.push({ nhan: `Gửi yêu cầu xuất kho (${l.so_cho_gui_kho})`, form: "gui_kho" });
  if (canWrite && l.so_cho_lay_hang > 0)
    ds.push({
      nhan: `Đã lấy hàng cả lượt (${l.so_cho_lay_hang})`,
      lam: (tk) => api.giaoHang.daLayHangCaLuot(tk, l.id),
      bao: (r) => `Đã lấy hàng ${r.so_chuyen} điểm.`,
    });
  if (canWrite && l.so_cho_bat_dau > 0) {
    const nhan = `Bắt đầu giao (${l.so_cho_bat_dau} điểm)`;
    // Chưa có số xuất phát ⇒ hỏi số trước; có rồi (xe đi dở, bốc thêm điểm) thì đi luôn.
    ds.push(l.so_dong_ho_xuat_phat == null
      ? { nhan, form: "xuat_phat" }
      : { nhan, lam: (tk) => api.giaoHang.batDauGiaoCaLuot(tk, l.id),
          bao: (r) => `Đã bắt đầu giao ${r.so_chuyen} điểm.` });
  }
  if (canWrite && l.cho_ve_kho) ds.push({ nhan: "Về kho", form: "ve_kho" });
  return ds;
}
