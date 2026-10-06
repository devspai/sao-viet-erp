/** Mặt hàng của đơn đang ở đâu — câu chữ DÙNG CHUNG cho ô Sản xuất ngoài danh sách (bảng nổi) và
 *  bảng Sản xuất trong ngăn đơn (07/10/2026, mockup `docs/mockups/don-hang-san-xuat-3-phuong-an.html`).
 *  Máy chủ chốt trạng thái (`services/don_hang_san_xuat.py`); ở đây chỉ dịch ra chữ. */
import type { LenhMon, MonO } from "../../../api/client";

/** Phần chung giữa `MonSanXuat` (danh sách) và `DonTienDoCum` (ngăn đơn). */
export interface MonCoBan {
  ten: string;
  don_vi: string | null;
  dat: number;
  co_hang: number;
  o: MonO;
  co_lenh: boolean;
  tu_ton: boolean;
  giao_thang: number;
  lenh: LenhMon[];
}

export type TongMau = "ok" | "ngoai" | "xuong" | "cho" | "tre";

const so = (n: number) => n.toLocaleString("vi-VN");

/** "09:15 06/10" — năm chỉ hiện khi khác năm nay. */
export function gioNgay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const cungNam = d.getFullYear() === new Date().getFullYear();
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const nt = d.toLocaleDateString("vi-VN", cungNam
    ? { day: "2-digit", month: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${hm} ${nt}`;
}

/** Lệnh đại diện cho câu "đang ở đâu": lệnh đứng đúng chỗ của mặt hàng. */
export function lenhDaiDien(m: MonCoBan): LenhMon | null {
  return m.lenh.find((l) => l.o === m.o) ?? m.lenh[0] ?? null;
}

/** Chữ + màu của thẻ "Đang ở". Đang ở nhà gia công thì gọi thẳng tên nhà gia công. */
export function nhanO(m: MonCoBan): { nhan: string; mau: TongMau } {
  switch (m.o) {
    case "du_hang":
      return { nhan: "Đủ hàng", mau: "ok" };
    case "ngoai":
      return { nhan: lenhDaiDien(m)?.gia_cong?.nha_cung_cap_ten || "Nhà gia công", mau: "ngoai" };
    case "xuong":
      return { nhan: "Xưởng", mau: "xuong" };
    case "cho_kho":
      return { nhan: "Chờ KCS và kho", mau: "xuong" };
    case "chua_xuong":
      return { nhan: "Chưa xuống xưởng", mau: "cho" };
    default:
      return { nhan: "Chưa có lệnh", mau: "cho" };
  }
}

/** Câu phụ dưới thẻ "Đang ở": bước đang làm, từ lúc nào, hay đã đủ bằng đường nào. */
export function chiTietO(m: MonCoBan): string {
  const l = lenhDaiDien(m);
  switch (m.o) {
    case "du_hang":
      if (m.giao_thang > 0) return `nhà gia công giao thẳng ${so(m.giao_thang)}`;
      return m.tu_ton ? "lấy từ tồn kho" : "kho đã nhận đủ";
    case "ngoai": {
      const g = l?.gia_cong;
      if (!g) return "";
      const viec = g.kieu === "tron_goi" ? "trọn gói" : (g.ten_viec || "gia công").toLowerCase();
      return g.tu_luc ? `${viec} từ ${gioNgay(g.tu_luc)}` : viec;
    }
    case "xuong":
      if (!l?.buoc) return "đang chạy";
      return l.pct != null ? `${l.buoc} ${so(Math.round(l.pct))}%` : l.buoc;
    case "cho_kho":
      return "xưởng làm xong, kho chưa nhận đủ";
    case "chua_xuong":
      return "chờ Kế hoạch phát hành lệnh";
    default:
      return "chờ Kế hoạch lên lệnh";
  }
}

/** Kiểu làm của mặt hàng — theo lệnh đại diện. */
export function kieuLam(m: MonCoBan): string {
  if (!m.co_lenh) return m.tu_ton ? "Lấy từ tồn kho" : "Chưa có lệnh";
  const k = lenhDaiDien(m)?.kieu;
  if (k === "tron_goi") return "Gia công trọn gói";
  if (k === "mot_phan") return "Gia công một phần";
  return "Trong xưởng";
}

/** Hàng làm xong thì về đâu. */
export function hangVe(m: MonCoBan): string {
  if (m.tu_ton) return "Lấy từ tồn kho";
  if (m.giao_thang > 0) return "Giao thẳng cho khách";
  const g = lenhDaiDien(m)?.gia_cong;
  if (m.o === "ngoai" && g?.ve_xuong) return "Về xưởng làm tiếp";
  return "Kho";
}
