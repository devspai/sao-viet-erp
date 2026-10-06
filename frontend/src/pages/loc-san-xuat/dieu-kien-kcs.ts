/** Thanh lọc của danh sách lệnh màn KCS (06/10/2026). Lọc + cắt trang ở máy chủ.
 *
 *  Không áp gì = chỉ lệnh của nhóm thành phẩm CÒN MỞ (như nút "Chưa đóng" cũ); điều kiện "Trạng
 *  thái" (trạng thái nhóm, 07/10/2026 — trước gọi "Nhóm thành phẩm") mở rộng sang nhóm đã đóng. */
import { PackageCheck, Users } from "lucide-react";

import { api, type ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export const MOC_KCS: [string, string][] = [
  ["tao", "Ngày tạo lệnh"],
  ["kcs", "Lần KCS gần nhất"],
];

export type LocKcs = { khach?: number; nhom?: "tat_ca" | "da_dong" };

export const LOC_KCS_TRONG: LocKcs = {};

/** Trạng thái của NHÓM thành phẩm — đúng hai chữ ở cột Nhóm ("Đang sản xuất" / "Đã đóng"). Không áp
 *  gì = chỉ nhóm đang sản xuất (mặc định của màn), nên menu chỉ cần hai lựa chọn mở rộng. */
const NHOM: GiaTriDK[] = [
  { value: "da_dong", nhan: "Đã đóng" },
  { value: "tat_ca", nhan: "Đang sản xuất và đã đóng" },
];

const nhom = (v: string | null | undefined): LocKcs["nhom"] =>
  v === "tat_ca" || v === "da_dong" ? v : undefined;

export function thamSoLocKcs(loc: LocKcs): ThamSoLoc {
  return { khach_id: loc.khach, nhom: loc.nhom };
}

export function locKcsTuUrl(p: URLSearchParams): LocKcs {
  return { khach: soTuUrl(p.get("khach")), nhom: nhom(p.get("nhom")) };
}

export function locKcsLenUrl(loc: LocKcs): GiaTriUrl {
  return { khach: soLenUrl(loc.khach), nhom: loc.nhom };
}

export function useDieuKienKcs(): DieuKien<LocKcs>[] {
  const khach = useLuaChonLoc(api.sanXuat.kcsKhachLoc);
  return [
    {
      khoa: "nhom", nhan: "Trạng thái", icon: PackageCheck, kieu: "mot", giaTri: NHOM,
      doc: (l) => l.nhom,
      ghi: (l, v) => ({ ...l, nhom: nhom(v) }),
    },
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
  ];
}
