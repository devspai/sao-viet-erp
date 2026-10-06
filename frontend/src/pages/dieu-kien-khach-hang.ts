/** Điều kiện lọc của danh bạ Khách hàng (06/10/2026). Lọc ở máy chủ; thanh lọc chung lo giao diện. */
import { Building2, ShoppingBag, Tag, UserRound } from "lucide-react";

import type { SaleOption, ThamSoLoc } from "../api/client";
import type { GiaTriUrl } from "./ke-toan/shared/urlMan";
import type { DieuKien, GiaTriDK } from "./thanh-loc/thanh-loc";

/** Giá trị NV phụ trách "Chưa gán ai" — khách chưa có người phụ trách (máy chủ: `chua_gan=true`). */
const CHUA_GAN = "chua_gan";

export type LocKhachHang = {
  /** id NV phụ trách (chuỗi số) hoặc `chua_gan`. */
  sale?: string;
  nhan?: string;
  loai?: "ca_nhan" | "cong_ty";
  mua?: "dang_mua" | "ngung" | "chua_don";
};

export const LOC_KH_TRONG: LocKhachHang = {};

const LOAI: GiaTriDK[] = [
  { value: "cong_ty", nhan: "Công ty" },
  { value: "ca_nhan", nhan: "Cá nhân" },
];
const MUA: GiaTriDK[] = [
  { value: "dang_mua", nhan: "Có đơn trong 12 tháng" },
  { value: "ngung", nhan: "Ngừng đặt" },
  { value: "chua_don", nhan: "Chưa có đơn" },
];

export function thamSoLocKH(loc: LocKhachHang): ThamSoLoc {
  return {
    sale: loc.sale && loc.sale !== CHUA_GAN ? Number(loc.sale) : undefined,
    chua_gan: loc.sale === CHUA_GAN ? true : undefined,
    tag: loc.nhan,
    loai: loc.loai,
    mua: loc.mua,
  };
}

export function locKHTuUrl(p: URLSearchParams): LocKhachHang {
  const sale = p.get("sale");
  const loai = p.get("loai");
  const mua = p.get("mua");
  return {
    sale: sale && (sale === CHUA_GAN || /^\d+$/.test(sale)) ? sale : undefined,
    nhan: p.get("nhan") || undefined,
    loai: loai === "ca_nhan" || loai === "cong_ty" ? loai : undefined,
    mua: MUA.some((g) => g.value === mua) ? (mua as LocKhachHang["mua"]) : undefined,
  };
}

export function locKHLenUrl(loc: LocKhachHang): GiaTriUrl {
  return { sale: loc.sale, nhan: loc.nhan, loai: loc.loai, mua: loc.mua };
}

/** `sales` và `nhan` là danh sách màn đã nạp sẵn (hộp gán NV cũng dùng `sales`).
 *  `coChuaGan`: chỉ người phạm vi `all` mới thấy khách vô chủ — người khác chọn "Chưa gán ai" chỉ ra rỗng. */
export function dieuKienKhachHang(
  sales: SaleOption[],
  nhan: string[],
  coChuaGan: boolean,
): DieuKien<LocKhachHang>[] {
  const nguoi: GiaTriDK[] = [
    ...(coChuaGan ? [{ value: CHUA_GAN, nhan: "Chưa gán ai" }] : []),
    ...sales.map((s) => ({ value: String(s.id), nhan: s.name, so: s.so_kh })),
  ];
  return [
    {
      khoa: "sale", nhan: "NV phụ trách", icon: UserRound, kieu: "mot", tim: true, giaTri: nguoi,
      doc: (l) => l.sale,
      ghi: (l, v) => ({ ...l, sale: v }),
    },
    {
      khoa: "nhan", nhan: "Nhãn", icon: Tag, kieu: "mot",
      tim: true, giaTri: nhan.map((t) => ({ value: t, nhan: t })),
      doc: (l) => l.nhan,
      ghi: (l, v) => ({ ...l, nhan: v }),
    },
    {
      khoa: "mua", nhan: "Trạng thái mua hàng", icon: ShoppingBag, kieu: "mot", giaTri: MUA,
      doc: (l) => l.mua,
      ghi: (l, v) => ({ ...l, mua: v as LocKhachHang["mua"] }),
    },
    {
      khoa: "loai", nhan: "Loại khách", icon: Building2, kieu: "mot", giaTri: LOAI,
      doc: (l) => l.loai,
      ghi: (l, v) => ({ ...l, loai: v as LocKhachHang["loai"] }),
    },
  ];
}
