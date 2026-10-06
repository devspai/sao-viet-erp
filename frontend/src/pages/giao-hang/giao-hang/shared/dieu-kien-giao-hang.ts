/** Kỳ + điều kiện lọc của màn Giao hàng (06/10/2026) — hai tab, mỗi tab một bộ riêng:
 *  "Yêu cầu giao" (mốc Ngày tạo / Ngày cần giao; Khách hàng, Đơn hàng) và "Đơn giao hàng" (mốc Ngày
 *  tạo / Giờ lấy hàng / Giờ dự kiến giao; Xe, Tài xế, Trạng thái). Lọc, đếm, trang hoá ở máy chủ.
 *
 *  Cả hai tab chung MỘT dấu `?man=giao-hang` trên URL, nên khoá của tab Yêu cầu giao mang tiền tố
 *  `yc_` (`yc_ky`, `yc_khach`…) để không đè khoá của tab Đơn giao hàng. */
import { CircleDot, FileText, Truck, UserRound, Users } from "lucide-react";

import { api, type ThamSoLoc } from "../../../../api/client";
import type { GiaTriUrl } from "../../../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "../../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../../thanh-loc/thanh-loc";
import { NHAN_TRANG_THAI_CHUYEN } from "./constants";

// ---------------------------------------------------------------- Yêu cầu giao
export const MOC_YC: [string, string][] = [["tao", "Ngày tạo"], ["can", "Ngày cần giao"]];

export type LocYeuCau = { khach?: number; don?: number };

export function thamSoLocYC(loc: LocYeuCau): ThamSoLoc {
  return { khach: loc.khach, order_id: loc.don };
}

export function useDieuKienYeuCau(): DieuKien<LocYeuCau>[] {
  const khach = useLuaChonLoc(api.giaoHang.khachLoc);
  const don = useLuaChonLoc(api.giaoHang.donLoc);
  return [
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
    {
      khoa: "don", nhan: "Đơn hàng", icon: FileText, kieu: "mot", tim: true, giaTri: don,
      doc: (l) => idThanhChu(l.don),
      ghi: (l, v) => ({ ...l, don: chuThanhId(v) }),
    },
  ];
}

// ---------------------------------------------------------------- Đơn giao hàng
export const MOC_DON: [string, string][] = [
  ["tao", "Ngày tạo"],
  ["lay", "Giờ lấy hàng"],
  ["giao", "Giờ dự kiến giao"],
];

export type LocDonGiao = { xe?: number; tai_xe?: number; trang_thai: string[] };

/** `hen_lai` là dòng cũ trước 22/08/2026, không còn khai mới — không đưa vào ô lọc. */
const TRANG_THAI: GiaTriDK[] = Object.entries(NHAN_TRANG_THAI_CHUYEN)
  .filter(([v]) => v !== "hen_lai")
  .map(([value, nhan]) => ({ value, nhan }));

export function thamSoLocDon(loc: LocDonGiao): ThamSoLoc {
  // Mảng rỗng ⇒ undefined: khoá lọc của màn so bằng JSON, `[]` sẽ bị tính là "đang lọc".
  return {
    xe: loc.xe, tai_xe: loc.tai_xe,
    trang_thai: loc.trang_thai.length ? loc.trang_thai : undefined,
  };
}

export function useDieuKienDonGiao(): DieuKien<LocDonGiao>[] {
  const xe = useLuaChonLoc(api.giaoHang.xeLoc);
  const taiXe = useLuaChonLoc(api.giaoHang.taiXeLoc);
  return [
    {
      khoa: "tt", nhan: "Trạng thái", icon: CircleDot, kieu: "nhieu", giaTri: TRANG_THAI,
      doc: (l) => l.trang_thai,
      ghi: (l, v) => ({ ...l, trang_thai: v }),
    },
    {
      khoa: "tai_xe", nhan: "Tài xế", icon: UserRound, kieu: "mot", tim: true, giaTri: taiXe,
      doc: (l) => idThanhChu(l.tai_xe),
      ghi: (l, v) => ({ ...l, tai_xe: chuThanhId(v) }),
    },
    {
      khoa: "xe", nhan: "Xe", icon: Truck, kieu: "mot", tim: true, giaTri: xe,
      doc: (l) => idThanhChu(l.xe),
      ghi: (l, v) => ({ ...l, xe: chuThanhId(v) }),
    },
  ];
}

// ---------------------------------------------------------------- trạng thái lọc cả màn + URL
export type LocGiaoHang = {
  kyDon: KyDS;
  locDon: LocDonGiao;
  kyYc: KyDS;
  locYc: LocYeuCau;
};

export const LOC_GH_TRONG: LocGiaoHang = {
  kyDon: { loai: "tat_ca", moc: "tao" },
  locDon: { trang_thai: [] },
  kyYc: { loai: "tat_ca", moc: "tao" },
  locYc: {},
};

const TIEN_TO_YC = "yc_";

/** Khoá `yc_*` của URL → bộ khoá trần, để đọc lại bằng đúng các hàm của tab Đơn giao hàng. */
function boTienTo(p: URLSearchParams): URLSearchParams {
  const ra = new URLSearchParams();
  p.forEach((v, k) => {
    if (k.startsWith(TIEN_TO_YC)) ra.set(k.slice(TIEN_TO_YC.length), v);
  });
  return ra;
}

const themTienTo = (g: GiaTriUrl): GiaTriUrl =>
  Object.fromEntries(Object.entries(g).map(([k, v]) => [TIEN_TO_YC + k, v]));

export function locGHTuUrl(p: URLSearchParams): LocGiaoHang {
  const yc = boTienTo(p);
  return {
    kyDon: kyTuUrl(p, MOC_DON.map(([m]) => m), "tao"),
    locDon: {
      xe: soTuUrl(p.get("xe")),
      tai_xe: soTuUrl(p.get("tx")),
      trang_thai: (p.get("tt") ?? "").split(",").filter((t) => TRANG_THAI.some((g) => g.value === t)),
    },
    kyYc: kyTuUrl(yc, MOC_YC.map(([m]) => m), "tao"),
    locYc: { khach: soTuUrl(yc.get("khach")), don: soTuUrl(yc.get("don")) },
  };
}

export function locGHLenUrl(t: LocGiaoHang): GiaTriUrl {
  return {
    ...kyLenUrl(t.kyDon, "tao"),
    xe: soLenUrl(t.locDon.xe),
    tx: soLenUrl(t.locDon.tai_xe),
    tt: t.locDon.trang_thai.length ? t.locDon.trang_thai.join(",") : undefined,
    ...themTienTo({
      ...kyLenUrl(t.kyYc, "tao"),
      khach: soLenUrl(t.locYc.khach),
      don: soLenUrl(t.locYc.don),
    }),
  };
}
