/** Thanh lọc tab "Đơn mua hàng" của màn Mua hàng (06/10/2026) — thay `ToolbarChuan` + ô chọn NCC /
 *  Tiền cọc rời + hai cặp ô ngày rời. Kỳ theo Ngày tạo (mặc định), Ngày cần hoặc Ngày dự kiến nhận;
 *  điều kiện Nhà cung cấp, Tiền cọc, Tổng dự kiến. Lọc và đếm tab ở máy chủ.
 *  Khoá URL KHÔNG tiền tố (`ky`, `ncc`, `coc`, `tong_tu`…) dưới dấu `?man=mua-hang`; danh sách yêu cầu
 *  cùng màn mang tiền tố `yc_` (xem `dieu-kien-yeu-cau.ts`).
 */
import { Banknote, Building2, PiggyBank } from "lucide-react";

import { api, type ThamSoLoc } from "../../../api/client";
import type { GiaTriUrl } from "../../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../thanh-loc/thanh-loc";

export const MOC_DON_MUA_HANG: [string, string][] = [
  ["tao", "Ngày tạo"],
  ["can", "Ngày cần"],
  ["nhan", "Ngày dự kiến nhận"],
];

type Coc = "none" | "unpaid" | "partial" | "enough";

export type LocDonMuaHang = { ncc?: number; coc?: Coc; tong_tu?: number; tong_den?: number };

export type LocManDonMuaHang = { ky: KyDS; loc: LocDonMuaHang };

export const LOC_MAN_DMH_TRONG: LocManDonMuaHang = { ky: { loai: "tat_ca", moc: "tao" }, loc: {} };

// Cùng bốn giá trị với hộp Đơn mua hàng của Kế toán — một đơn mua, một cách gọi tình trạng cọc.
const COC: GiaTriDK[] = [
  { value: "none", nhan: "Không cọc" },
  { value: "unpaid", nhan: "Chưa cọc" },
  { value: "partial", nhan: "Cọc thiếu" },
  { value: "enough", nhan: "Cọc đủ" },
];

export function thamSoLocDonMuaHang(loc: LocDonMuaHang): ThamSoLoc {
  return { supplier_id: loc.ncc, deposit_status: loc.coc, tong_tu: loc.tong_tu, tong_den: loc.tong_den };
}

export function locManDonMuaHangTuUrl(p: URLSearchParams): LocManDonMuaHang {
  const coc = p.get("coc");
  return {
    ky: kyTuUrl(p, MOC_DON_MUA_HANG.map(([m]) => m), "tao"),
    loc: {
      ncc: soTuUrl(p.get("ncc")),
      coc: COC.some((g) => g.value === coc) ? (coc as Coc) : undefined,
      tong_tu: soTuUrl(p.get("tong_tu")),
      tong_den: soTuUrl(p.get("tong_den")),
    },
  };
}

export function locManDonMuaHangLenUrl(t: LocManDonMuaHang): GiaTriUrl {
  return {
    ...kyLenUrl(t.ky, "tao"),
    ncc: soLenUrl(t.loc.ncc),
    coc: t.loc.coc,
    tong_tu: soLenUrl(t.loc.tong_tu),
    tong_den: soLenUrl(t.loc.tong_den),
  };
}

export function useDieuKienDonMuaHang(): DieuKien<LocDonMuaHang>[] {
  const ncc = useLuaChonLoc(api.purchaseRequests.locNcc);
  return [
    {
      khoa: "ncc", nhan: "Nhà cung cấp", icon: Building2, kieu: "mot", tim: true, giaTri: ncc,
      doc: (l) => idThanhChu(l.ncc),
      ghi: (l, v) => ({ ...l, ncc: chuThanhId(v) }),
    },
    {
      khoa: "coc", nhan: "Tiền cọc", icon: PiggyBank, kieu: "mot", giaTri: COC,
      doc: (l) => l.coc,
      ghi: (l, v) => ({ ...l, coc: v as Coc | undefined }),
    },
    {
      khoa: "tong", nhan: "Tổng dự kiến", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.tong_tu, l.tong_den],
      ghi: (l, tu, den) => ({ ...l, tong_tu: tu, tong_den: den }),
    },
  ];
}
