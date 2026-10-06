/** Điều kiện lọc của hai danh sách Tăng ca — Phiếu của tôi và Duyệt phiếu (06/10/2026). Lọc, đếm
 *  tab, phân trang ở máy chủ; thay ô "Tháng tạo" rời (chỉ chọn được một tháng theo ngày tạo). */
import { api } from "../../../api/client";
import { useLuaChonLoc } from "../../thanh-loc/lua-chon";
import type { DieuKien } from "../../thanh-loc/thanh-loc";
import { dkNhanVien, dkPhong, type LocNguoi } from "../dieu-kien-don";

export const MAN_TANG_CA = "tang-ca";

/** Mốc kỳ: Ngày tạo phiếu / Ngày công (ngày làm thêm). */
export const MOC_TC: [string, string][] = [["tao", "Ngày tạo"], ["ngay_cong", "Ngày công"]];

export type LocTangCa = LocNguoi;
export const LOC_TC_TRONG: LocTangCa = {};

/** Duyệt phiếu: Nhân viên, Phòng ban (chỉ người có phiếu trong phạm vi, kèm số phiếu). `coQuyen`
 *  = có ô Duyệt — không có thì khỏi hỏi máy chủ (sẽ 403). */
export function useDieuKienDuyetTangCa(coQuyen: boolean): DieuKien<LocTangCa>[] {
  const nv = useLuaChonLoc((t) => (coQuyen ? api.overtime.loc(t, "nhan_vien") : Promise.resolve([])));
  const phong = useLuaChonLoc((t) => (coQuyen ? api.overtime.loc(t, "phong") : Promise.resolve([])));
  return [dkNhanVien<LocTangCa>(nv), dkPhong<LocTangCa>(phong)];
}
