/** Thanh lọc của màn Theo dõi sản xuất theo đơn (12/10/2026): kỳ theo ngày chốt / hạn giao + Khách,
 *  Phụ trách. Lọc + đếm chip ở máy chủ, giá trị chọn lấy trong phạm vi người gọi. */
import { UserRound, Users } from "lucide-react";

import { api, type TdsxTheoDonParams } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien } from "../thanh-loc/thanh-loc";

export const MOC_THEO_DOI_DON: [string, string][] = [
  ["chot", "Ngày chốt đơn"],
  ["han_giao", "Hạn giao khách"],
];

export type LocTheoDoiDon = { khach?: number; phu_trach?: number };

export const LOC_THEO_DOI_DON_TRONG: LocTheoDoiDon = {};

export function thamSoLocTheoDoiDon(loc: LocTheoDoiDon): Pick<TdsxTheoDonParams, "khach_hang_id" | "phu_trach_id"> {
  return { khach_hang_id: loc.khach, phu_trach_id: loc.phu_trach };
}

export function locTheoDoiDonTuUrl(p: URLSearchParams): LocTheoDoiDon {
  return { khach: soTuUrl(p.get("khach")), phu_trach: soTuUrl(p.get("pt")) };
}

export function locTheoDoiDonLenUrl(loc: LocTheoDoiDon): GiaTriUrl {
  return { khach: soLenUrl(loc.khach), pt: soLenUrl(loc.phu_trach) };
}

export function useDieuKienTheoDoiDon(): DieuKien<LocTheoDoiDon>[] {
  const khach = useLuaChonLoc(api.theoDoiSanXuat.khachLoc);
  const phuTrach = useLuaChonLoc(api.theoDoiSanXuat.phuTrachLoc);
  return [
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
    {
      khoa: "phu_trach", nhan: "Phụ trách", icon: UserRound, kieu: "mot", tim: true, giaTri: phuTrach,
      doc: (l) => idThanhChu(l.phu_trach),
      ghi: (l, v) => ({ ...l, phu_trach: chuThanhId(v) }),
    },
  ];
}
