/** Điều kiện lọc của danh sách Nội quy (06/10/2026): Người tải lên, Loại tệp. Lọc ở máy chủ. */
import { FileType, UserRound } from "lucide-react";

import { api, type ThamSoLoc } from "../../../api/client";
import type { GiaTriUrl } from "../../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../thanh-loc/thanh-loc";

export type LocNoiQuy = {
  nguoi?: number;
  loai?: "pdf" | "anh";
};

export const LOC_NQ_TRONG: LocNoiQuy = {};

/** Một mốc kỳ duy nhất: ngày tải tài liệu lên (= ngày tạo bản ghi). */
export const MOC_NQ: [string, string][] = [["tao", "Ngày tải lên"]];

const LOAI: GiaTriDK[] = [
  { value: "pdf", nhan: "PDF" },
  { value: "anh", nhan: "Ảnh" },
];

export function thamSoLocNoiQuy(loc: LocNoiQuy): ThamSoLoc {
  return { nguoi: loc.nguoi, loai: loc.loai };
}

export function locNoiQuyTuUrl(p: URLSearchParams): LocNoiQuy {
  const loai = p.get("loai");
  return {
    nguoi: soTuUrl(p.get("nguoi")),
    loai: loai === "pdf" || loai === "anh" ? loai : undefined,
  };
}

export function locNoiQuyLenUrl(loc: LocNoiQuy): GiaTriUrl {
  return { nguoi: soLenUrl(loc.nguoi), loai: loc.loai };
}

export function useDieuKienNoiQuy(): DieuKien<LocNoiQuy>[] {
  const nguoi = useLuaChonLoc(api.noiQuy.nguoiTaiLoc);
  return [
    {
      khoa: "nguoi", nhan: "Người tải lên", icon: UserRound, kieu: "mot", tim: true, giaTri: nguoi,
      doc: (l) => idThanhChu(l.nguoi),
      ghi: (l, v) => ({ ...l, nguoi: chuThanhId(v) }),
    },
    {
      khoa: "loai", nhan: "Loại tệp", icon: FileType, kieu: "mot", giaTri: LOAI,
      doc: (l) => l.loai,
      ghi: (l, v) => ({ ...l, loai: v as LocNoiQuy["loai"] }),
    },
  ];
}
