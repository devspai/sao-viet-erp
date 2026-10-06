/** Điều kiện lọc của ba danh sách HCNS trong màn Chấm công (06/10/2026): Nhật ký chấm công,
 *  Đi muộn / về sớm (hàng duyệt), Yêu cầu chỉnh công. Lọc, đếm tab, phân trang ở máy chủ. */
import { Clock, MapPin } from "lucide-react";

import { api, type ThamSoLoc } from "../../../api/client";
import type { GiaTriUrl } from "../../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../thanh-loc/thanh-loc";
import {
  dkNhanVien,
  dkPhong,
  nguoiLenUrl,
  nguoiTuUrl,
  thamSoNguoi,
  type LocNguoi,
} from "../dieu-kien-don";

/** Mã màn trên URL = mục thanh bên. */
export const MAN_CHAM_CONG = "cham-cong";

// --- Nhật ký chấm công --------------------------------------------------------

export type LocNhatKy = LocNguoi & { diem?: number };
export const LOC_NK_TRONG: LocNhatKy = {};
export const MOC_NK: [string, string][] = [["cham", "Giờ chấm"], ["tao", "Ngày tạo"]];

export const thamSoLocNhatKy = (l: LocNhatKy): ThamSoLoc => ({ ...thamSoNguoi(l), diem: l.diem });
export const locNhatKyTuUrl = (p: URLSearchParams): LocNhatKy => ({
  ...nguoiTuUrl(p),
  diem: soTuUrl(p.get("diem")),
});
export const locNhatKyLenUrl = (l: LocNhatKy): GiaTriUrl => ({ ...nguoiLenUrl(l), diem: soLenUrl(l.diem) });

export function useDieuKienNhatKy(): DieuKien<LocNhatKy>[] {
  const nv = useLuaChonLoc((t) => api.attendance.locLogs(t, "nhan_vien"));
  const phong = useLuaChonLoc((t) => api.attendance.locLogs(t, "phong"));
  const diem = useLuaChonLoc((t) => api.attendance.locLogs(t, "diem"));
  return [
    dkNhanVien<LocNhatKy>(nv),
    dkPhong<LocNhatKy>(phong),
    {
      khoa: "diem", nhan: "Điểm chấm công", icon: MapPin, kieu: "mot", tim: true, giaTri: diem,
      doc: (l) => idThanhChu(l.diem),
      ghi: (l, v) => ({ ...l, diem: chuThanhId(v) }),
    },
  ];
}

// --- Đi muộn / về sớm ----------------------------------------------------------

export type KieuVang = "late" | "early" | "half" | "mid";
export type LocDiMuon = LocNguoi & { kieu: KieuVang[] };
export const LOC_DM_TRONG: LocDiMuon = { kieu: [] };
export const MOC_DM: [string, string][] = [["tao", "Ngày tạo"], ["ngay_cong", "Ngày công"]];

const KIEU: GiaTriDK[] = [
  { value: "late", nhan: "Đi muộn" },
  { value: "early", nhan: "Về sớm" },
  { value: "half", nhan: "Nghỉ nửa buổi" },
  { value: "mid", nhan: "Vắng giữa ca" },
];
const laKieu = (v: string): v is KieuVang => KIEU.some((k) => k.value === v);

export const thamSoLocDiMuon = (l: LocDiMuon): ThamSoLoc => ({ ...thamSoNguoi(l), kieu: l.kieu });
export const locDiMuonTuUrl = (p: URLSearchParams): LocDiMuon => ({
  ...nguoiTuUrl(p),
  kieu: (p.get("kieu") ?? "").split(",").filter(laKieu),
});
export const locDiMuonLenUrl = (l: LocDiMuon): GiaTriUrl => ({
  ...nguoiLenUrl(l),
  kieu: l.kieu.length ? l.kieu.join(",") : undefined,
});

/** `coQuyen` = có ô Duyệt đi muộn — không có thì khỏi hỏi máy chủ (sẽ 403). */
export function useDieuKienDiMuon(coQuyen: boolean): DieuKien<LocDiMuon>[] {
  const nv = useLuaChonLoc((t) => (coQuyen ? api.lateEarly.loc(t, "nhan_vien") : Promise.resolve([])));
  const phong = useLuaChonLoc((t) => (coQuyen ? api.lateEarly.loc(t, "phong") : Promise.resolve([])));
  return [
    {
      // Kiểu vắng suy theo ca mặc định của từng người — máy chủ suy và lọc (06/10/2026).
      khoa: "kieu", nhan: "Kiểu vắng", icon: Clock, kieu: "nhieu", giaTri: KIEU,
      doc: (l) => l.kieu,
      ghi: (l, v) => ({ ...l, kieu: v.filter(laKieu) }),
    },
    dkNhanVien<LocDiMuon>(nv),
    dkPhong<LocDiMuon>(phong),
  ];
}

// --- Yêu cầu chỉnh công ---------------------------------------------------------

export type LocChinhCong = LocNguoi;
export const LOC_CC_TRONG: LocChinhCong = {};
export const MOC_CC: [string, string][] = [["tao", "Ngày tạo"], ["ngay_cong", "Ngày công"]];

export function useDieuKienChinhCong(): DieuKien<LocChinhCong>[] {
  const nv = useLuaChonLoc((t) => api.attendance.locAdjustRequests(t, "nhan_vien"));
  const phong = useLuaChonLoc((t) => api.attendance.locAdjustRequests(t, "phong"));
  return [dkNhanVien<LocChinhCong>(nv), dkPhong<LocChinhCong>(phong)];
}
