/** Thanh lọc của Kỹ thuật máy (06/10/2026): Sửa chữa máy (khung Phiếu sửa chữa + khung Yêu cầu báo
 *  hỏng) và Phiếu bảo trì chế độ Bảng. Lọc, đếm tab, cắt trang ở máy chủ.
 *
 *  Hai khung của màn Sửa chữa máy dùng CHUNG một bộ lọc (cùng mốc kỳ, cùng điều kiện Máy / Mức độ):
 *  cùng câu chuyện "máy này hỏng", đổi khung là xem cùng máy cùng kỳ ở phía bên kia. Điều kiện
 *  "Người gửi" chỉ có ở khung Yêu cầu (phiếu không có người gửi theo tài khoản). */
import { Cog, Gauge, Tag, UserRound } from "lucide-react";

import { kyThuatMay, NHAN_MUC_DO } from "../../api/kyThuatMay";
import type { ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

// ---------------- Sửa chữa máy ----------------

export const MOC_SUA_CHUA: [string, string][] = [
  ["tao", "Ngày tạo"],
  ["thoi_diem", "Thời điểm hỏng"],
  ["xong", "Hoàn thành"],
];
export const MOC_YEU_CAU: [string, string][] = [
  ["tao", "Ngày tạo"],
  ["thoi_diem", "Thời điểm hỏng"],
  ["xong", "Xử lý lúc"],
];

export type LocSuaChua = { may?: number; muc_do: string[]; cua_toi?: boolean };

export const LOC_SUA_CHUA_TRONG: LocSuaChua = { muc_do: [] };

const MUC_DO: GiaTriDK[] = ["nghiem_trong", "trung_binh", "nhe"].map((m) => ({
  value: m, nhan: NHAN_MUC_DO[m] ?? m,
}));
const NGUOI_GUI: GiaTriDK[] = [{ value: "toi", nhan: "Tôi" }];

/** Tham số của khung Phiếu sửa chữa — "Người gửi" không gửi lên ở khung này. */
export function thamSoLocPhieu(loc: LocSuaChua): ThamSoLoc {
  return { may_id: loc.may, muc_do: loc.muc_do.length ? loc.muc_do.join(",") : undefined };
}

export function thamSoLocYeuCau(loc: LocSuaChua): ThamSoLoc {
  return { ...thamSoLocPhieu(loc), cua_toi: loc.cua_toi ? 1 : undefined };
}

export function locSuaChuaTuUrl(p: URLSearchParams): LocSuaChua {
  return {
    may: soTuUrl(p.get("may")),
    muc_do: (p.get("muc") ?? "").split(",").filter((m) => MUC_DO.some((g) => g.value === m)),
    cua_toi: p.get("cua_toi") === "1" ? true : undefined,
  };
}

export function locSuaChuaLenUrl(loc: LocSuaChua): GiaTriUrl {
  return {
    may: soLenUrl(loc.may),
    muc: loc.muc_do.length ? loc.muc_do.join(",") : undefined,
    cua_toi: loc.cua_toi ? "1" : undefined,
  };
}

function dkMay<L extends { may?: number }>(giaTri: GiaTriDK[]): DieuKien<L> {
  return {
    khoa: "may", nhan: "Máy", icon: Cog, kieu: "mot", tim: true, giaTri,
    doc: (l) => idThanhChu(l.may),
    ghi: (l, v) => ({ ...l, may: chuThanhId(v) }),
  };
}

export function useDieuKienSuaChua(khung: "phieu" | "yeu-cau"): DieuKien<LocSuaChua>[] {
  const mayPhieu = useLuaChonLoc(kyThuatMay.locMaySuaChua);
  const mayYeuCau = useLuaChonLoc(kyThuatMay.locMayYeuCau);
  const ds: DieuKien<LocSuaChua>[] = [
    dkMay<LocSuaChua>(khung === "phieu" ? mayPhieu : mayYeuCau),
    {
      khoa: "muc_do", nhan: "Mức độ", icon: Gauge, kieu: "nhieu", giaTri: MUC_DO,
      doc: (l) => l.muc_do,
      ghi: (l, v) => ({ ...l, muc_do: v }),
    },
  ];
  if (khung === "yeu-cau") {
    ds.push({
      khoa: "cua_toi", nhan: "Người gửi", icon: UserRound, kieu: "mot", giaTri: NGUOI_GUI,
      doc: (l) => (l.cua_toi ? "toi" : undefined),
      ghi: (l, v) => ({ ...l, cua_toi: v === "toi" ? true : undefined }),
    });
  }
  return ds;
}

// ---------------- Phiếu bảo trì ----------------

/** Mốc mặc định là Ngày kế hoạch: lịch bảo trì đọc theo kế hoạch. */
export const MOC_BAO_TRI: [string, string][] = [
  ["ke_hoach", "Ngày kế hoạch"],
  ["tao", "Ngày tạo"],
  ["hoan_thanh", "Ngày hoàn thành"],
];

export type LocBaoTri = { may?: number; loai?: "dinh_ky" | "dot_xuat" };

export const LOC_BAO_TRI_TRONG: LocBaoTri = {};

const LOAI: GiaTriDK[] = [
  { value: "dinh_ky", nhan: "Định kỳ" },
  { value: "dot_xuat", nhan: "Đột xuất" },
];

const loai = (v: string | null | undefined): LocBaoTri["loai"] =>
  v === "dinh_ky" || v === "dot_xuat" ? v : undefined;

export function thamSoLocBaoTri(loc: LocBaoTri): ThamSoLoc {
  return { may_id: loc.may, loai: loc.loai };
}

export function locBaoTriTuUrl(p: URLSearchParams): LocBaoTri {
  return { may: soTuUrl(p.get("may")), loai: loai(p.get("loai")) };
}

export function locBaoTriLenUrl(loc: LocBaoTri): GiaTriUrl {
  return { may: soLenUrl(loc.may), loai: loc.loai };
}

export function useDieuKienBaoTri(): DieuKien<LocBaoTri>[] {
  const may = useLuaChonLoc(kyThuatMay.locMayBaoTri);
  return [
    dkMay<LocBaoTri>(may),
    {
      khoa: "loai", nhan: "Loại bảo trì", icon: Tag, kieu: "mot", giaTri: LOAI,
      doc: (l) => l.loai,
      ghi: (l, v) => ({ ...l, loai: loai(v) }),
    },
  ];
}
