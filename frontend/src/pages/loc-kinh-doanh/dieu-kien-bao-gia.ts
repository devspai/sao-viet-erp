/** Điều kiện lọc của danh sách Báo giá (06/10/2026). Lọc và đếm ở máy chủ; thanh lọc chung lo giao diện. */
import { BadgeCheck, Banknote, CalendarClock, UserCheck, Users } from "lucide-react";

import { api, type ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export type LocBaoGia = {
  khach?: number;
  /** Tập con của `cho` / `duyet` / `tu_choi` / `khong`. */
  duyet: string[];
  nguoi_duyet?: number;
  gia_tu?: number;
  gia_den?: number;
  hieu_luc?: "con" | "sap_het" | "het";
};

export const LOC_BG_TRONG: LocBaoGia = { duyet: [] };

const DUYET: GiaTriDK[] = [
  { value: "cho", nhan: "Đang chờ duyệt" },
  { value: "duyet", nhan: "Đã duyệt" },
  { value: "tu_choi", nhan: "Bị từ chối" },
  { value: "khong", nhan: "Không qua duyệt" },
];
const HIEU_LUC: GiaTriDK[] = [
  { value: "con", nhan: "Còn hạn" },
  { value: "sap_het", nhan: "Hết trong 7 ngày" },
  { value: "het", nhan: "Đã hết" },
];

export function thamSoLocBG(loc: LocBaoGia): ThamSoLoc {
  return {
    khach: loc.khach,
    duyet: loc.duyet,
    nguoi_duyet: loc.nguoi_duyet,
    gia_tu: loc.gia_tu,
    gia_den: loc.gia_den,
    hieu_luc: loc.hieu_luc,
  };
}

export function locBGTuUrl(p: URLSearchParams): LocBaoGia {
  const hl = p.get("hl");
  return {
    khach: soTuUrl(p.get("khach")),
    duyet: (p.get("duyet") ?? "").split(",").filter((d) => DUYET.some((g) => g.value === d)),
    nguoi_duyet: soTuUrl(p.get("nd")),
    gia_tu: soTuUrl(p.get("gia_tu")),
    gia_den: soTuUrl(p.get("gia_den")),
    hieu_luc: hl === "con" || hl === "sap_het" || hl === "het" ? hl : undefined,
  };
}

export function locBGLenUrl(loc: LocBaoGia): GiaTriUrl {
  return {
    khach: soLenUrl(loc.khach),
    duyet: loc.duyet.length ? loc.duyet.join(",") : undefined,
    nd: soLenUrl(loc.nguoi_duyet),
    gia_tu: soLenUrl(loc.gia_tu),
    gia_den: soLenUrl(loc.gia_den),
    hl: loc.hieu_luc,
  };
}

export function useDieuKienBaoGia(): DieuKien<LocBaoGia>[] {
  const khach = useLuaChonLoc(api.quotations.khachLoc);
  const nguoiDuyet = useLuaChonLoc(api.quotations.nguoiDuyet);
  return [
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
    {
      khoa: "nguoi_duyet", nhan: "Người duyệt", icon: UserCheck, kieu: "mot", tim: true, giaTri: nguoiDuyet,
      doc: (l) => idThanhChu(l.nguoi_duyet),
      ghi: (l, v) => ({ ...l, nguoi_duyet: chuThanhId(v) }),
    },
    {
      khoa: "duyet", nhan: "Kết quả duyệt", icon: BadgeCheck, kieu: "nhieu", giaTri: DUYET,
      doc: (l) => l.duyet,
      ghi: (l, v) => ({ ...l, duyet: v }),
    },
    {
      khoa: "gia", nhan: "Giá bán gồm VAT", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.gia_tu, l.gia_den],
      ghi: (l, tu, den) => ({ ...l, gia_tu: tu, gia_den: den }),
    },
    {
      khoa: "hieu_luc", nhan: "Hạn hiệu lực", icon: CalendarClock, kieu: "mot", giaTri: HIEU_LUC,
      doc: (l) => l.hieu_luc,
      ghi: (l, v) => ({ ...l, hieu_luc: v as LocBaoGia["hieu_luc"] }),
    },
  ];
}
