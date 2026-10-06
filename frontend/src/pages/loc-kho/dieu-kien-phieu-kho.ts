/** Điều kiện lọc của danh sách phiếu ở màn tồn từng kho — Phiếu nhập / Phiếu xuất / Điều chuyển
 *  (06/10/2026). Lọc, đếm tab, phân trang ở máy chủ; thanh lọc chung lo giao diện.
 *
 *  Giá vốn là TIỀN: điều kiện chỉ bày ra khi người xem có ô "Xem giá thành" của KHO NÀY, và máy chủ
 *  cũng tự bỏ qua khoảng giá nếu không có ô đó (gác ở máy chủ, không tin trình duyệt). */
import { Banknote, CircleDot, UserPen } from "lucide-react";

import { api, type ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../thanh-loc/ky-danh-sach";
import { useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export type LocPhieuKho = {
  trang_thai?: "draft" | "posted" | "cancelled";
  /** Id người lập (nhiều người). */
  nguoi_lap: string[];
  gia_tu?: number;
  gia_den?: number;
};

export const LOC_PK_TRONG: LocPhieuKho = { nguoi_lap: [] };

/** Mốc kỳ: Ngày tạo (mặc định) / Ngày nhập-xuất / Ngày ghi sổ. */
export const MOC_PHIEU_KHO: [string, string][] = [
  ["tao", "Ngày tạo"],
  ["ngay", "Ngày nhập xuất"],
  ["ghi_so", "Ngày ghi sổ"],
];

const TRANG_THAI: GiaTriDK[] = [
  { value: "draft", nhan: "Chờ ghi sổ" },
  { value: "posted", nhan: "Đã ghi sổ" },
  { value: "cancelled", nhan: "Đã hủy" },
];

const laTrangThai = (v: string | null): v is LocPhieuKho["trang_thai"] & string =>
  TRANG_THAI.some((t) => t.value === v);

export function thamSoLocPK(loc: LocPhieuKho, xemGia: boolean): ThamSoLoc {
  return {
    trang_thai: loc.trang_thai,
    nguoi_lap: loc.nguoi_lap,
    gia_tu: xemGia ? loc.gia_tu : undefined,
    gia_den: xemGia ? loc.gia_den : undefined,
  };
}

export function locPKTuUrl(p: URLSearchParams): LocPhieuKho {
  const tt = p.get("tt");
  return {
    trang_thai: laTrangThai(tt) ? tt : undefined,
    nguoi_lap: (p.get("nl") ?? "").split(",").filter((x) => /^\d+$/.test(x)),
    gia_tu: soTuUrl(p.get("gia_tu")),
    gia_den: soTuUrl(p.get("gia_den")),
  };
}

export function locPKLenUrl(loc: LocPhieuKho): GiaTriUrl {
  return {
    tt: loc.trang_thai,
    nl: loc.nguoi_lap.length ? loc.nguoi_lap.join(",") : undefined,
    gia_tu: soLenUrl(loc.gia_tu),
    gia_den: soLenUrl(loc.gia_den),
  };
}

export function useDieuKienPhieuKho(khoId: number, xemGia: boolean): DieuKien<LocPhieuKho>[] {
  const nguoiLap = useLuaChonLoc((token) => api.kho.phieu.locNguoiLap(token, khoId));
  const ds: DieuKien<LocPhieuKho>[] = [
    {
      khoa: "trang_thai", nhan: "Trạng thái", icon: CircleDot, kieu: "mot", giaTri: TRANG_THAI,
      doc: (l) => l.trang_thai,
      ghi: (l, v) => ({ ...l, trang_thai: laTrangThai(v ?? null) ? (v as LocPhieuKho["trang_thai"]) : undefined }),
    },
    {
      khoa: "nguoi_lap", nhan: "Người lập", icon: UserPen, kieu: "nhieu", tim: true, giaTri: nguoiLap,
      doc: (l) => l.nguoi_lap,
      ghi: (l, v) => ({ ...l, nguoi_lap: v }),
    },
  ];
  if (xemGia) {
    ds.push({
      khoa: "gia", nhan: "Giá vốn", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.gia_tu, l.gia_den],
      ghi: (l, tu, den) => ({ ...l, gia_tu: tu, gia_den: den }),
    });
  }
  return ds;
}
