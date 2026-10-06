/** Điều kiện lọc của danh sách Tính giá thành (06/10/2026). Lọc và đếm ở máy chủ; thanh lọc chung lo giao diện. */
import { Banknote, FileCheck2, Users } from "lucide-react";

import { api, type ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export type LocTinhGia = {
  khach?: number;
  gv_tu?: number;
  gv_den?: number;
  /** Phiếu đã có báo giá (một phiếu một báo giá) hay chưa. */
  bao_gia?: "co" | "chua";
};

export const LOC_TG_TRONG: LocTinhGia = {};

const BAO_GIA: GiaTriDK[] = [
  { value: "co", nhan: "Đã lên báo giá" },
  { value: "chua", nhan: "Chưa lên báo giá" },
];

export function thamSoLocTG(loc: LocTinhGia): ThamSoLoc {
  return { khach: loc.khach, gv_tu: loc.gv_tu, gv_den: loc.gv_den, bao_gia: loc.bao_gia };
}

export function locTGTuUrl(p: URLSearchParams): LocTinhGia {
  const bg = p.get("bg");
  return {
    khach: soTuUrl(p.get("khach")),
    gv_tu: soTuUrl(p.get("gv_tu")),
    gv_den: soTuUrl(p.get("gv_den")),
    bao_gia: bg === "co" || bg === "chua" ? bg : undefined,
  };
}

export function locTGLenUrl(loc: LocTinhGia): GiaTriUrl {
  return { khach: soLenUrl(loc.khach), gv_tu: soLenUrl(loc.gv_tu), gv_den: soLenUrl(loc.gv_den), bg: loc.bao_gia };
}

export function useDieuKienTinhGia(): DieuKien<LocTinhGia>[] {
  const khach = useLuaChonLoc(api.phieuTinhGia.khachLoc);
  return [
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
    {
      khoa: "bao_gia", nhan: "Báo giá", icon: FileCheck2, kieu: "mot", giaTri: BAO_GIA,
      doc: (l) => l.bao_gia,
      ghi: (l, v) => ({ ...l, bao_gia: v as LocTinhGia["bao_gia"] }),
    },
    {
      khoa: "gv", nhan: "Tổng giá vốn", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.gv_tu, l.gv_den],
      ghi: (l, tu, den) => ({ ...l, gv_tu: tu, gv_den: den }),
    },
  ];
}
