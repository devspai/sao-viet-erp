/** Thanh lọc HÀNG CHỜ của màn Xếp lịch (06/10/2026). Lọc + cắt trang ở máy chủ (`/api/xep-lich/hang-cho`).
 *
 *  Kỳ chỉ áp cho hàng chờ (mốc mặc định Ngày tạo lệnh, hoặc Hạn SX); lưới Gantt giữ ô Từ/Đến riêng
 *  của nó — đó là cửa sổ đang vẽ chứ không phải bộ lọc. */
import { Users } from "lucide-react";

import { api, type ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien } from "../thanh-loc/thanh-loc";

export const MAN_XEP_LICH = "xep-lich";

export const MOC_HANG_CHO: [string, string][] = [
  ["tao", "Ngày tạo"],
  ["han_sx", "Hạn SX"],
];
const MOC_MAC_DINH = "tao";

export type LocHangCho = { khach?: number };
export type LocManHangCho = { ky: KyDS; loc: LocHangCho };

export const LOC_HANG_CHO_TRONG: LocManHangCho = { ky: { loai: "tat_ca", moc: MOC_MAC_DINH }, loc: {} };

export function thamSoLocHangCho(loc: LocHangCho): ThamSoLoc {
  return { khach_id: loc.khach };
}

export function locHangChoTuUrl(p: URLSearchParams): LocManHangCho {
  return {
    ky: kyTuUrl(p, MOC_HANG_CHO.map(([m]) => m), MOC_MAC_DINH),
    loc: { khach: soTuUrl(p.get("khach")) },
  };
}

export function locHangChoLenUrl(t: LocManHangCho): GiaTriUrl {
  return { ...kyLenUrl(t.ky, MOC_MAC_DINH), khach: soLenUrl(t.loc.khach) };
}

export function useDieuKienHangCho(): DieuKien<LocHangCho>[] {
  const khach = useLuaChonLoc(api.xepLich.hangChoKhachLoc);
  return [
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
  ];
}
