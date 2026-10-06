/** Điều kiện lọc của sổ tài sản (06/10/2026). Lọc và đếm ở máy chủ; thanh lọc chung lo giao diện.
 *
 *  Trạng thái mặc định "Đang dùng" như màn trước — tài sản đã thôi dùng chỉ hiện khi bỏ thẻ ấy hoặc
 *  chọn "Đã thôi dùng". Vì vậy trên URL: không có khoá `tt` = mặc định, `tt=tat_ca` = bỏ thẻ. */
import { Activity, Banknote, Boxes, Building2 } from "lucide-react";

import type { ThamSoLoc } from "../../api/client";
import { NHAN_LOAI, NHAN_TRANG_THAI, taiSanApi } from "../../api/taiSan";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien } from "../thanh-loc/thanh-loc";

export type LocTaiSan = {
  loai?: "tscd" | "ccdc";
  bo_phan?: number;
  trang_thai?: "dang_dung" | "da_giam";
  gia_tu?: number;
  gia_den?: number;
};

export const LOC_TS_TRONG: LocTaiSan = { trang_thai: "dang_dung" };

/** Mốc của dải kỳ — `su_dung`, `giam` là cột ngày (Date) ở máy chủ. */
export const MOC_TS: [string, string][] = [
  ["tao", "Ngày tạo"],
  ["su_dung", "Ngày bắt đầu dùng"],
  ["giam", "Ngày thôi dùng"],
];

const laLoai = (v: string | null | undefined): v is "tscd" | "ccdc" => v === "tscd" || v === "ccdc";
const laTrangThai = (v: string | null | undefined): v is "dang_dung" | "da_giam" =>
  v === "dang_dung" || v === "da_giam";

export function thamSoLocTS(loc: LocTaiSan): ThamSoLoc {
  return {
    loai: loc.loai,
    bo_phan_id: loc.bo_phan,
    trang_thai: loc.trang_thai,
    gia_tu: loc.gia_tu,
    gia_den: loc.gia_den,
  };
}

export function locTSTuUrl(p: URLSearchParams): LocTaiSan {
  const tt = p.get("tt");
  const loai = p.get("loai");
  return {
    loai: laLoai(loai) ? loai : undefined,
    bo_phan: soTuUrl(p.get("bp")),
    trang_thai: tt === "tat_ca" ? undefined : laTrangThai(tt) ? tt : "dang_dung",
    gia_tu: soTuUrl(p.get("gia_tu")),
    gia_den: soTuUrl(p.get("gia_den")),
  };
}

export function locTSLenUrl(loc: LocTaiSan): GiaTriUrl {
  return {
    loai: loc.loai,
    bp: soLenUrl(loc.bo_phan),
    tt: loc.trang_thai == null ? "tat_ca" : loc.trang_thai === "dang_dung" ? undefined : loc.trang_thai,
    gia_tu: soLenUrl(loc.gia_tu),
    gia_den: soLenUrl(loc.gia_den),
  };
}

/** `demLoai`, `demTrangThai`: số máy chủ đếm theo các bộ lọc KHÁC của chính điều kiện đó. */
export function useDieuKienTaiSan(
  demLoai: Record<string, number>,
  demTrangThai: Record<string, number>,
): DieuKien<LocTaiSan>[] {
  const boPhan = useLuaChonLoc(taiSanApi.locBoPhan);
  return [
    {
      khoa: "loai", nhan: "Loại", icon: Boxes, kieu: "mot",
      giaTri: (["tscd", "ccdc"] as const).map((v) => ({ value: v, nhan: NHAN_LOAI[v], so: demLoai[v] ?? 0 })),
      doc: (l) => l.loai,
      ghi: (l, v) => ({ ...l, loai: laLoai(v) ? v : undefined }),
    },
    {
      khoa: "bo_phan", nhan: "Bộ phận", icon: Building2, kieu: "mot", tim: true, giaTri: boPhan,
      doc: (l) => idThanhChu(l.bo_phan),
      ghi: (l, v) => ({ ...l, bo_phan: chuThanhId(v) }),
    },
    {
      khoa: "trang_thai", nhan: "Trạng thái", icon: Activity, kieu: "mot",
      giaTri: (["dang_dung", "da_giam"] as const).map((v) => ({
        value: v, nhan: NHAN_TRANG_THAI[v], so: demTrangThai[v] ?? 0,
      })),
      doc: (l) => l.trang_thai,
      ghi: (l, v) => ({ ...l, trang_thai: laTrangThai(v) ? v : undefined }),
    },
    {
      khoa: "gia", nhan: "Giá mua", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.gia_tu, l.gia_den],
      ghi: (l, tu, den) => ({ ...l, gia_tu: tu, gia_den: den }),
    },
  ];
}
