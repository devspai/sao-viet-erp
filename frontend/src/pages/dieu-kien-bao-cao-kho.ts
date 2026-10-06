/** Điều kiện lọc của Sổ kho trong Báo cáo kho (06/10/2026). Lọc, cộng tiền và cắt trang ở máy chủ;
 *  thanh lọc chung lo giao diện. Kỳ tính theo ngày nhập/xuất kho (ngày chứng từ — cùng mốc khóa kỳ)
 *  hoặc ngày ghi sổ; mặc định "Tất cả" như sổ vẫn mở trước nay.
 *
 *  Luật tiền: hai khoảng Đơn giá / Thành tiền CHỈ có khi người xem có ô "Xem giá thành" của màn
 *  (`bao_cao_kho:view_cost`); máy chủ cũng bỏ qua hai khoảng đó với người không có ô này. */
import { Banknote, Hash, Tag, Warehouse } from "lucide-react";

import type { BaoCaoKhoParams } from "../api/client";
import type { GiaTriUrl } from "./ke-toan/shared/urlMan";
import { khoangKy, kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "./thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu } from "./thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "./thanh-loc/thanh-loc";

export const MAN_BAO_CAO_KHO = "kho-baocao";

export const MOC_SO_KHO: [string, string][] = [
  ["ct", "Ngày nhập/xuất kho"],
  ["ghi_so", "Ngày ghi sổ"],
];
const MOC_MAC_DINH = "ct";

export type LocSoKho = {
  kho?: number;
  sl_tu?: number;
  sl_den?: number;
  dg_tu?: number;
  dg_den?: number;
  tt_tu?: number;
  tt_den?: number;
};

export type LocManSoKho = { ky: KyDS; loc: LocSoKho };

export const LOC_MAN_SO_KHO_TRONG: LocManSoKho = { ky: { loai: "tat_ca", moc: MOC_MAC_DINH }, loc: {} };

/** Tham số kỳ của báo cáo kho — cùng quy ước `tu_ngay`/`den_ngay`/`moc` với `thamSoKy`. */
export function thamSoKySoKho(ky: KyDS): Pick<BaoCaoKhoParams, "tu_ngay" | "den_ngay" | "moc"> {
  const k = khoangKy(ky);
  return k ? { tu_ngay: k.tu, den_ngay: k.den, moc: ky.moc } : {};
}

/** Tham số máy chủ của các điều kiện (không gồm kỳ, tìm, trang). */
export function thamSoLocSoKho(loc: LocSoKho): Pick<
  BaoCaoKhoParams, "kho_id" | "sl_from" | "sl_to" | "dg_from" | "dg_to" | "tt_from" | "tt_to"
> {
  return {
    kho_id: loc.kho ?? null,
    sl_from: loc.sl_tu ?? null,
    sl_to: loc.sl_den ?? null,
    dg_from: loc.dg_tu ?? null,
    dg_to: loc.dg_den ?? null,
    tt_from: loc.tt_tu ?? null,
    tt_to: loc.tt_den ?? null,
  };
}

const KHOA_SO = ["sl_tu", "sl_den", "dg_tu", "dg_den", "tt_tu", "tt_den"] as const;

export function locManSoKhoTuUrl(p: URLSearchParams): LocManSoKho {
  const loc: LocSoKho = { kho: soTuUrl(p.get("kho")) };
  for (const k of KHOA_SO) loc[k] = soTuUrl(p.get(k));
  return { ky: kyTuUrl(p, MOC_SO_KHO.map(([m]) => m), MOC_MAC_DINH), loc };
}

export function locManSoKhoLenUrl(t: LocManSoKho): GiaTriUrl {
  const g: GiaTriUrl = { ...kyLenUrl(t.ky, MOC_MAC_DINH), kho: soLenUrl(t.loc.kho) };
  for (const k of KHOA_SO) g[k] = soLenUrl(t.loc[k]);
  return g;
}

/** Điều kiện của Sổ kho. `chuyen` = sổ Chuyển kho (tiền là giá VỐN); `xemGia` = có ô xem giá. */
export function dieuKienSoKho(kho: GiaTriDK[], { chuyen, xemGia }: { chuyen: boolean; xemGia: boolean }): DieuKien<LocSoKho>[] {
  const ds: DieuKien<LocSoKho>[] = [
    {
      khoa: "kho", nhan: "Kho", icon: Warehouse, kieu: "mot", tim: true, giaTri: kho,
      doc: (l) => idThanhChu(l.kho),
      ghi: (l, v) => ({ ...l, kho: chuThanhId(v) }),
    },
    {
      khoa: "sl", nhan: "Số lượng", icon: Hash, kieu: "khoang", donVi: "",
      doc: (l) => [l.sl_tu, l.sl_den],
      ghi: (l, tu, den) => ({ ...l, sl_tu: tu, sl_den: den }),
    },
  ];
  if (!xemGia) return ds;
  return [
    ...ds,
    {
      khoa: "dg", nhan: chuyen ? "Đơn giá vốn" : "Đơn giá", icon: Tag, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.dg_tu, l.dg_den],
      ghi: (l, tu, den) => ({ ...l, dg_tu: tu, dg_den: den }),
    },
    {
      khoa: "tt", nhan: chuyen ? "Tiền vốn" : "Thành tiền", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.tt_tu, l.tt_den],
      ghi: (l, tu, den) => ({ ...l, tt_tu: tu, tt_den: den }),
    },
  ];
}

/** Người không xem được giá: bỏ hai khoảng tiền (vd mở link của người khác có lọc theo tiền). */
export function boLocTien(loc: LocSoKho): LocSoKho {
  return { ...loc, dg_tu: undefined, dg_den: undefined, tt_tu: undefined, tt_den: undefined };
}
