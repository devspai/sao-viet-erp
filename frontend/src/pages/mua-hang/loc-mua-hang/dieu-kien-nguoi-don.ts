/** Ba điều kiện người của danh sách Đơn mua hàng (10/10/2026) — dùng chung cho màn Mua hàng và hộp
 *  Kế toán: NV yêu cầu (người tạo một trong các yêu cầu đơn gom vào), NV mua hàng (người lập đơn),
 *  NV duyệt. Giá trị nạp từ máy chủ kèm số đơn; khoá URL `nvyc`, `nvmua`, `nvduyet`.
 */
import { ShoppingBag, UserCheck, UserRound } from "lucide-react";

import type { LuaChonLoc, VaiNguoiDon } from "../../../api/client";
import type { GiaTriUrl } from "../../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../../thanh-loc/lua-chon";
import type { DieuKien } from "../../thanh-loc/thanh-loc";

export type LocNguoiDon = { nv_yc?: number; nv_mua?: number; nv_duyet?: number };

export function thamSoNguoiDon(l: LocNguoiDon): { nv_yc_id?: number; nv_mua_id?: number; nv_duyet_id?: number } {
  return { nv_yc_id: l.nv_yc, nv_mua_id: l.nv_mua, nv_duyet_id: l.nv_duyet };
}

export function nguoiDonTuUrl(p: URLSearchParams): LocNguoiDon {
  return {
    nv_yc: soTuUrl(p.get("nvyc")),
    nv_mua: soTuUrl(p.get("nvmua")),
    nv_duyet: soTuUrl(p.get("nvduyet")),
  };
}

export function nguoiDonLenUrl(l: LocNguoiDon): GiaTriUrl {
  return { nvyc: soLenUrl(l.nv_yc), nvmua: soLenUrl(l.nv_mua), nvduyet: soLenUrl(l.nv_duyet) };
}

export function useDieuKienNguoiDon<L extends LocNguoiDon>(
  nap: (token: string, vai: VaiNguoiDon) => Promise<LuaChonLoc[]>,
): DieuKien<L>[] {
  const yc = useLuaChonLoc((t) => nap(t, "yc"));
  const mua = useLuaChonLoc((t) => nap(t, "mua"));
  const duyet = useLuaChonLoc((t) => nap(t, "duyet"));
  return [
    {
      khoa: "nvyc", nhan: "NV yêu cầu", icon: UserRound, kieu: "mot", tim: true, giaTri: yc,
      doc: (l) => idThanhChu(l.nv_yc),
      ghi: (l, v) => ({ ...l, nv_yc: chuThanhId(v) }),
    },
    {
      khoa: "nvmua", nhan: "NV mua hàng", icon: ShoppingBag, kieu: "mot", tim: true, giaTri: mua,
      doc: (l) => idThanhChu(l.nv_mua),
      ghi: (l, v) => ({ ...l, nv_mua: chuThanhId(v) }),
    },
    {
      khoa: "nvduyet", nhan: "NV duyệt", icon: UserCheck, kieu: "mot", tim: true, giaTri: duyet,
      doc: (l) => idThanhChu(l.nv_duyet),
      ghi: (l, v) => ({ ...l, nv_duyet: chuThanhId(v) }),
    },
  ];
}
