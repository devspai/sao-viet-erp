/** Điều kiện lọc của Báo cáo kinh doanh (06/10/2026). Lọc ở máy chủ; thanh lọc chung lo giao diện.
 *  Kỳ tính theo MỘT mốc: ngày chốt đơn. Mặc định "Tháng này" như báo cáo vẫn mở trước nay. */
import { UserCheck, Users } from "lucide-react";

import { api, type ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { kyBaoCaoLenUrl, kyBaoCaoTuUrl } from "../thanh-loc/ky-bao-cao";
import { soLenUrl, soTuUrl, type KyDS } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien } from "../thanh-loc/thanh-loc";

export const MOC_BCKD: [string, string][] = [["chot", "Ngày chốt đơn"]];
const MOC_MAC_DINH = "chot";

export type LocBCKD = { khach?: number; sale?: number };

export type LocManBCKD = { ky: KyDS; loc: LocBCKD };

export const LOC_MAN_BCKD_TRONG: LocManBCKD = { ky: { loai: "thang", moc: MOC_MAC_DINH }, loc: {} };

export function thamSoLocBCKD(loc: LocBCKD): ThamSoLoc {
  return { customer_id: loc.khach, sale_id: loc.sale };
}

export function locManBCKDTuUrl(p: URLSearchParams): LocManBCKD {
  return {
    ky: kyBaoCaoTuUrl(p, [MOC_MAC_DINH], MOC_MAC_DINH, "thang"),
    loc: { khach: soTuUrl(p.get("khach")), sale: soTuUrl(p.get("sale")) },
  };
}

export function locManBCKDLenUrl(t: LocManBCKD): GiaTriUrl {
  return {
    ...kyBaoCaoLenUrl(t.ky, MOC_MAC_DINH, "thang"),
    khach: soLenUrl(t.loc.khach),
    sale: soLenUrl(t.loc.sale),
  };
}

export function useDieuKienBCKD(): DieuKien<LocBCKD>[] {
  const khach = useLuaChonLoc(api.baoCaoKinhDoanh.khachLoc);
  const sale = useLuaChonLoc(api.baoCaoKinhDoanh.saleLoc);
  return [
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
    {
      khoa: "sale", nhan: "Sale", icon: UserCheck, kieu: "mot", tim: true, giaTri: sale,
      doc: (l) => idThanhChu(l.sale),
      ghi: (l, v) => ({ ...l, sale: chuThanhId(v) }),
    },
  ];
}
