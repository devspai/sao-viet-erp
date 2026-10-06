/** Điều kiện lọc của Bảng lương tháng (06/10/2026). Lọc ở máy chủ (`/api/luong/table`); tháng vẫn
 *  chọn bằng ô Kỳ lương riêng nên thanh lọc KHÔNG có nút kỳ. */
import { BadgeCheck, Building2 } from "lucide-react";

import type { LuaChonLoc, ThamSoLoc } from "../../../../api/client";
import type { GiaTriUrl } from "../../../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu } from "../../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../../thanh-loc/thanh-loc";

export type LocBangLuong = {
  phong?: number;
  /** `ct` chính thức / `tv` thử việc. */
  hd?: "ct" | "tv";
};

export const LOC_BL_TRONG: LocBangLuong = {};

const HOP_DONG: GiaTriDK[] = [
  { value: "ct", nhan: "Chính thức" },
  { value: "tv", nhan: "Thử việc" },
];

export function thamSoLocBangLuong(loc: LocBangLuong): ThamSoLoc {
  return { phong: loc.phong, hd: loc.hd };
}

// Khoá URL riêng của tab này (`bl_…`) — cùng dấu `man=luong` với tab Tạm ứng, không ăn nhầm nhau.
export function locBangLuongTuUrl(p: URLSearchParams): LocBangLuong {
  const hd = p.get("bl_hd");
  return {
    phong: soTuUrl(p.get("bl_phong")),
    hd: hd === "ct" || hd === "tv" ? hd : undefined,
  };
}

export function locBangLuongLenUrl(loc: LocBangLuong): GiaTriUrl {
  return { bl_phong: soLenUrl(loc.phong), bl_hd: loc.hd };
}

export function dieuKienBangLuong(phong: LuaChonLoc[]): DieuKien<LocBangLuong>[] {
  return [
    {
      khoa: "phong", nhan: "Phòng / tổ", icon: Building2, kieu: "mot",
      tim: true, giaTri: phong.map((p) => ({ value: String(p.id), nhan: p.ten, so: p.so })),
      doc: (l) => idThanhChu(l.phong),
      ghi: (l, v) => ({ ...l, phong: chuThanhId(v) }),
    },
    {
      khoa: "hd", nhan: "Hợp đồng", icon: BadgeCheck, kieu: "mot", giaTri: HOP_DONG,
      doc: (l) => l.hd,
      ghi: (l, v) => ({ ...l, hd: v as LocBangLuong["hd"] }),
    },
  ];
}
