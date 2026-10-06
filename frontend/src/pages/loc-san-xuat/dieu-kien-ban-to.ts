/** Thanh lọc của bàn tổ sản xuất — chế độ "Bảng" (06/10/2026). Thay "Lọc nâng cao" cũ
 *  (`ThsxLocNangCao`) và ô "chờ xác nhận" rời. Lọc + cắt trang ở máy chủ (`/work-items`).
 *
 *  Mốc mặc định của kỳ là `nhan` (ngày tổ nhận lệnh) — giữ hành vi của ô "Ngày tổ nhận" cũ; cách
 *  sắp không phải điều kiện lọc nên nằm riêng bên phải thanh công cụ. */
import { BellRing, CircleDot } from "lucide-react";

import type { ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, type KyDS } from "../thanh-loc/ky-danh-sach";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export const MOC_BAN_TO: [string, string][] = [
  ["nhan", "Ngày tổ nhận lệnh"],
  ["tao", "Ngày tạo lệnh"],
  ["du_kien", "Dự kiến bắt đầu"],
];
export const MOC_BAN_TO_MAC_DINH = "nhan";

export type ThsxTrangThaiLoc = "released" | "running" | "paused" | "completed";
export type ThsxSapXep = "moi_nhan" | "cu_nhan" | "du_kien";

export type LocBanTo = { trangThai: ThsxTrangThaiLoc[]; cho?: boolean };

export const LOC_BAN_TO_TRONG: LocBanTo = { trangThai: [] };

const TRANG_THAI: GiaTriDK[] = [
  { value: "released", nhan: "Chờ làm" },
  { value: "running", nhan: "Đang chạy" },
  { value: "paused", nhan: "Tạm dừng" },
  { value: "completed", nhan: "Hoàn thành" },
];

export const SAP_XEP_BAN_TO: [ThsxSapXep, string][] = [
  ["moi_nhan", "Mới nhận trước"],
  ["cu_nhan", "Nhận lâu nhất trước"],
  ["du_kien", "Theo giờ dự kiến"],
];

const laTrangThai = (v: string): v is ThsxTrangThaiLoc => TRANG_THAI.some((t) => t.value === v);
const laSapXep = (v: string | null): v is ThsxSapXep => SAP_XEP_BAN_TO.some(([s]) => s === v);

/** Tham số máy chủ của điều kiện. "Chờ xác nhận" đi riêng (`choXacNhan`) vì view Lịch cũng dùng. */
export function thamSoLocBanTo(loc: LocBanTo): ThamSoLoc {
  return { trang_thai: loc.trangThai.length ? loc.trangThai : undefined };
}

/** Trạng thái lọc trọn màn (ghi URL `?man=thuc-hien-sx:<tổ>`). */
export type LocManBanTo = { ky: KyDS; loc: LocBanTo; sapXep: ThsxSapXep };

export const LOC_MAN_BAN_TO_TRONG: LocManBanTo = {
  ky: { loai: "tat_ca", moc: MOC_BAN_TO_MAC_DINH },
  loc: LOC_BAN_TO_TRONG,
  sapXep: "moi_nhan",
};

export function locBanToTuUrl(p: URLSearchParams): LocManBanTo {
  const sx = p.get("sap");
  return {
    ky: kyTuUrl(p, MOC_BAN_TO.map(([m]) => m), MOC_BAN_TO_MAC_DINH),
    loc: {
      trangThai: (p.get("tt") ?? "").split(".").filter(laTrangThai),
      cho: p.get("cho") === "1" ? true : undefined,
    },
    sapXep: laSapXep(sx) ? sx : "moi_nhan",
  };
}

export function locBanToLenUrl(t: LocManBanTo): GiaTriUrl {
  return {
    ...kyLenUrl(t.ky, MOC_BAN_TO_MAC_DINH),
    tt: t.loc.trangThai.length ? t.loc.trangThai.join(".") : undefined,
    cho: t.loc.cho ? "1" : undefined,
    sap: t.sapXep === "moi_nhan" ? undefined : t.sapXep,
  };
}

/** `soCho` = số việc đang chờ tổ bấm (đã có sẵn trên bàn) — hiện cạnh giá trị. */
export function dieuKienBanTo(soCho: number): DieuKien<LocBanTo>[] {
  return [
    {
      khoa: "tt", nhan: "Trạng thái", icon: CircleDot, kieu: "nhieu", giaTri: TRANG_THAI,
      doc: (l) => l.trangThai,
      ghi: (l, v) => ({ ...l, trangThai: v.filter(laTrangThai) }),
    },
    {
      khoa: "cho", nhan: "Chờ xác nhận", icon: BellRing, kieu: "mot",
      giaTri: [{ value: "co", nhan: "Có việc chờ tổ bấm", so: soCho }],
      doc: (l) => (l.cho ? "co" : undefined),
      ghi: (l, v) => ({ ...l, cho: v === "co" ? true : undefined }),
    },
  ];
}
