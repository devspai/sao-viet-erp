/** Điều kiện lọc + tab trạng thái của màn Tạm ứng (06/10/2026). Lọc, đếm tab, chia trang ở máy chủ
 *  (`GET /api/luong/advances`); thanh lọc chung lo giao diện. Kỳ LƯƠNG chọn bằng ô Kỳ lương riêng;
 *  nút kỳ của thanh lọc chỉ thu hẹp trong kỳ lương đó theo Ngày tạo hoặc Ngày ứng.
 *
 *  Thay `tamUngLoc.ts` + `TamUngBoLoc.tsx` (25/09/2026 — tải cả kỳ rồi lọc trong trình duyệt). */
import { Banknote, Building2, Tags } from "lucide-react";

import type { LuaChonLoc, SalaryAdvance, ThamSoLoc } from "../../../../api/client";
import type { GiaTriUrl } from "../../../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "../../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu } from "../../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../../thanh-loc/thanh-loc";
import { money } from "../shared/helpers";

export type TabTrangThai = "tat_ca" | "cho_duyet" | "cho_chi" | "da_chi" | "tu_choi";

export const TAB_TRANG_THAI: { key: TabTrangThai; nhan: string }[] = [
  { key: "tat_ca", nhan: "Tất cả" },
  { key: "cho_duyet", nhan: "Chờ duyệt" },
  { key: "cho_chi", nhan: "Chờ chi" },
  { key: "da_chi", nhan: "Đã chi" },
  { key: "tu_choi", nhan: "Từ chối / Huỷ" },
];

export const CO_TRANG = 50;

/** Mốc kỳ: Ngày tạo phiếu / Ngày ứng. */
export const MOC_TU: [string, string][] = [["tao", "Ngày tạo"], ["ung", "Ngày ứng"]];

export type LocTamUng = {
  loai?: "tam_ung" | "luong_dot_1";
  to?: number;
  tien_tu?: number;
  tien_den?: number;
};

export type LocManTamUng = { ky: KyDS; tab: TabTrangThai; loc: LocTamUng };

export const LOC_TU_TRONG: LocManTamUng = { ky: { loai: "tat_ca", moc: "tao" }, tab: "tat_ca", loc: {} };

const LOAI: GiaTriDK[] = [
  { value: "tam_ung", nhan: "Tạm ứng" },
  { value: "luong_dot_1", nhan: "Lương đợt 1" },
];

export function thamSoLocTamUng(loc: LocTamUng): ThamSoLoc {
  return { loai: loc.loai, to: loc.to, tien_tu: loc.tien_tu, tien_den: loc.tien_den };
}

// Khoá URL của tab này: `tab=tamung` để tải lại trang mở thẳng tab Tạm ứng; các khoá lọc có tiền tố
// `tu_` để không đụng khoá `bl_` của Bảng lương tháng (cùng dấu `man=luong`).
export function locTamUngTuUrl(p: URLSearchParams): LocManTamUng {
  const loai = p.get("tu_loai");
  const tab = p.get("tu_tab");
  return {
    ky: kyTuUrl(p, MOC_TU.map(([m]) => m), "tao"),
    tab: TAB_TRANG_THAI.some((t) => t.key === tab) ? (tab as TabTrangThai) : "tat_ca",
    loc: {
      loai: loai === "tam_ung" || loai === "luong_dot_1" ? loai : undefined,
      to: soTuUrl(p.get("tu_to")),
      tien_tu: soTuUrl(p.get("tu_tien_tu")),
      tien_den: soTuUrl(p.get("tu_tien_den")),
    },
  };
}

export function locTamUngLenUrl(t: LocManTamUng): GiaTriUrl {
  return {
    tab: "tamung",
    ...kyLenUrl(t.ky, "tao"),
    tu_tab: t.tab === "tat_ca" ? undefined : t.tab,
    tu_loai: t.loc.loai,
    tu_to: soLenUrl(t.loc.to),
    tu_tien_tu: soLenUrl(t.loc.tien_tu),
    tu_tien_den: soLenUrl(t.loc.tien_den),
  };
}

/** Số tiền: cột Số tiền hiện với mọi người mở được màn này (cổng là ô Duyệt tạm ứng + phạm vi) nên
 *  điều kiện tiền đi cùng cổng đó, không thêm cổng riêng. */
export function dieuKienTamUng(to: LuaChonLoc[]): DieuKien<LocTamUng>[] {
  return [
    {
      khoa: "loai", nhan: "Loại phiếu", icon: Tags, kieu: "mot", giaTri: LOAI,
      doc: (l) => l.loai,
      ghi: (l, v) => ({ ...l, loai: v as LocTamUng["loai"] }),
    },
    {
      khoa: "to", nhan: "Phòng / tổ", icon: Building2, kieu: "mot",
      tim: true, giaTri: to.map((t) => ({ value: String(t.id), nhan: t.ten, so: t.so })),
      doc: (l) => idThanhChu(l.to),
      ghi: (l, v) => ({ ...l, to: chuThanhId(v) }),
    },
    {
      khoa: "tien", nhan: "Số tiền", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.tien_tu, l.tien_den],
      ghi: (l, tu, den) => ({ ...l, tien_tu: tu, tien_den: den }),
    },
  ];
}

/** "200 tạm ứng và 150 lương đợt 1 — tổng 875.000.000đ" cho hộp xác nhận thao tác nhiều phiếu. */
export function tachLoai(advs: SalaryAdvance[]): string {
  const tu = advs.filter((a) => (a.kind || "tam_ung") !== "luong_dot_1").length;
  const d1 = advs.length - tu;
  const phan = [tu ? `${tu} tạm ứng` : "", d1 ? `${d1} lương đợt 1` : ""].filter(Boolean);
  return `${phan.join(" và ")} — tổng ${money(advs.reduce((s, a) => s + a.amount, 0))}đ`;
}
