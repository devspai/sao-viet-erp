/** Thanh lọc màn Đơn mua hàng (Kế toán) — 06/10/2026, thay ô ngày rời + hai ô chọn rời bằng thanh lọc
 *  chung `ThanhLoc`. Kỳ theo Ngày tạo (mặc định) hoặc Ngày cần; điều kiện Nhà cung cấp và Tiền cọc.
 *  Lọc và đếm tab ở máy chủ; trạng thái lọc ghi lên URL (`?man=ke-toan-don-mua-hang`).
 */
import { Building2, PiggyBank } from "lucide-react";

import { api } from "../../../../api/client";
import { kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "../../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../../thanh-loc/thanh-loc";
import type { GiaTriUrl } from "../../shared/urlMan";
import type { DepositFilter } from "./types";

export const MAN_DON_MUA = "ke-toan-don-mua-hang";

export const MOC_DON_MUA: [string, string][] = [["tao", "Ngày tạo"], ["can", "Ngày cần"]];

export type LocDonMua = { ncc?: number; coc?: Exclude<DepositFilter, "all"> };

export type LocManDonMua = { ky: KyDS; loc: LocDonMua };

export const LOC_MAN_DON_MUA_TRONG: LocManDonMua = { ky: { loai: "tat_ca", moc: "tao" }, loc: {} };

const COC: GiaTriDK[] = [
  { value: "none", nhan: "Không cọc" },
  { value: "unpaid", nhan: "Chưa cọc" },
  { value: "partial", nhan: "Cọc thiếu" },
  { value: "enough", nhan: "Cọc đủ" },
];

export function thamSoLocDonMua(loc: LocDonMua): { supplier_id?: number; deposit_status?: string } {
  return { supplier_id: loc.ncc, deposit_status: loc.coc };
}

export function locManDonMuaTuUrl(p: URLSearchParams): LocManDonMua {
  const coc = p.get("coc");
  return {
    ky: kyTuUrl(p, MOC_DON_MUA.map(([m]) => m), "tao"),
    loc: {
      ncc: soTuUrl(p.get("ncc")),
      coc: COC.some((g) => g.value === coc) ? (coc as LocDonMua["coc"]) : undefined,
    },
  };
}

export function locManDonMuaLenUrl(t: LocManDonMua): GiaTriUrl {
  return { ...kyLenUrl(t.ky, "tao"), ncc: soLenUrl(t.loc.ncc), coc: t.loc.coc };
}

export function useDieuKienDonMua(): DieuKien<LocDonMua>[] {
  const ncc = useLuaChonLoc(api.accounting.inboxLocNcc);
  return [
    {
      khoa: "ncc", nhan: "Nhà cung cấp", icon: Building2, kieu: "mot", tim: true, giaTri: ncc,
      doc: (l) => idThanhChu(l.ncc),
      ghi: (l, v) => ({ ...l, ncc: chuThanhId(v) }),
    },
    {
      khoa: "coc", nhan: "Tiền cọc", icon: PiggyBank, kieu: "mot", giaTri: COC,
      doc: (l) => l.coc,
      ghi: (l, v) => ({ ...l, coc: v as LocDonMua["coc"] }),
    },
  ];
}
