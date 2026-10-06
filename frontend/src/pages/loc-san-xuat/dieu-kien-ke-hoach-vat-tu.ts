/** Thanh lọc màn Kế hoạch vật tư (06/10/2026). Không có kỳ — bảng cân đối là ảnh chụp "bây giờ".
 *
 *  Hai cách nhìn, mỗi cách một bộ điều kiện; tab trạng thái (Cần mua ngay, Chưa rõ ĐVT… / Giữ đủ,
 *  Đang giữ dở…) vẫn là tab nhưng lọc + đếm Ở MÁY CHỦ. Điều kiện ghi lên URL của màn
 *  `ke-hoach-vat-tu` với khoá riêng từng cách nhìn (`loai` / `can_lo`). */
import { Layers, ListChecks } from "lucide-react";

import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export const MAN_KHVT = "ke-hoach-vat-tu";

/* --------------------------------------------------------------- theo mặt hàng */

export type LoaiHangKhvt = "giay" | "vat_tu";
export type LocKhvtHang = { loai?: LoaiHangKhvt };
export const LOC_KHVT_HANG_TRONG: LocKhvtHang = {};

const LOAI: { value: LoaiHangKhvt; nhan: string }[] = [
  { value: "giay", nhan: "Giấy" },
  { value: "vat_tu", nhan: "Vật tư khác" },
];

const loaiHang = (v: string | null | undefined): LoaiHangKhvt | undefined =>
  v === "giay" || v === "vat_tu" ? v : undefined;

export const locKhvtHangTuUrl = (p: URLSearchParams): LocKhvtHang => ({ loai: loaiHang(p.get("loai")) });
export const locKhvtHangLenUrl = (l: LocKhvtHang): GiaTriUrl => ({ loai: l.loai });

/** `theoLoai` = số mặt hàng theo từng loại máy chủ đếm (`dem.theo_loai`). */
export function dieuKienKhvtHang(theoLoai?: Record<string, number>): DieuKien<LocKhvtHang>[] {
  const gt: GiaTriDK[] = LOAI.map((l) => ({ ...l, so: theoLoai?.[l.value] ?? (theoLoai ? 0 : undefined) }));
  return [
    {
      khoa: "loai", nhan: "Loại hàng", icon: Layers, kieu: "mot", giaTri: gt,
      doc: (l) => l.loai,
      ghi: (l, v) => ({ ...l, loai: loaiHang(v) }),
    },
  ];
}

/* --------------------------------------------------------------- theo lệnh */

export type LocKhvtLenh = { can_lo?: boolean };
export const LOC_KHVT_LENH_TRONG: LocKhvtLenh = {};

const CAN_LO: GiaTriDK[] = [{ value: "co", nhan: "Còn việc phải lo" }];

export const locKhvtLenhTuUrl = (p: URLSearchParams): LocKhvtLenh => ({
  can_lo: p.get("can_lo") === "co" ? true : undefined,
});
export const locKhvtLenhLenUrl = (l: LocKhvtLenh): GiaTriUrl => ({ can_lo: l.can_lo ? "co" : undefined });

export function dieuKienKhvtLenh(): DieuKien<LocKhvtLenh>[] {
  return [
    {
      // Thiếu hàng, chưa rõ đơn vị, giữ lâu chưa chạy, hoặc đã rơi khỏi bảng mà còn giữ chỗ.
      khoa: "can_lo", nhan: "Việc phải lo", icon: ListChecks, kieu: "mot", giaTri: CAN_LO,
      doc: (l) => (l.can_lo ? "co" : undefined),
      ghi: (l, v) => ({ ...l, can_lo: v === "co" ? true : undefined }),
    },
  ];
}
