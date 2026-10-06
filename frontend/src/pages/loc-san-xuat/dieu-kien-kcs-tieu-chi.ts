/** Thanh lọc màn "Tiêu chí KCS" (khai theo cây Giai đoạn → Công đoạn → hạng mục, 06/10/2026).
 *  Thay hàng tab giai đoạn + lọc chữ trong trình duyệt: mọi lọc chạy ở máy chủ (`/khai-bao`), cây
 *  chỉ còn nhánh có hạng mục khớp. Kỳ tính theo ngày tạo HẠNG MỤC. */
import { Layers, PowerOff, ShieldCheck } from "lucide-react";

import type { ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { NHOM_CONG_DOAN } from "../keHoachSxShared";
import { kyLenUrl, kyTuUrl, type KyDS } from "../thanh-loc/ky-danh-sach";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export const MOC_KCS_TIEU_CHI: [string, string][] = [["tao", "Ngày tạo hạng mục"]];

export type LocKcsTieuChi = {
  nhom?: string;
  batBuoc?: "co" | "khong";
  dung?: "dang" | "ngung";
};

export type LocManKcsTieuChi = { ky: KyDS; loc: LocKcsTieuChi };

export const LOC_MAN_KCS_TIEU_CHI_TRONG: LocManKcsTieuChi = {
  ky: { loai: "tat_ca", moc: "tao" },
  loc: {},
};

const BAT_BUOC: GiaTriDK[] = [
  { value: "co", nhan: "Bắt buộc" },
  { value: "khong", nhan: "Không bắt buộc" },
];
const DUNG: GiaTriDK[] = [
  { value: "dang", nhan: "Đang dùng" },
  { value: "ngung", nhan: "Ngừng dùng" },
];

const nhomHopLe = (v: string | null | undefined) => (v && v in NHOM_CONG_DOAN ? v : undefined);
const batBuoc = (v: string | null | undefined): LocKcsTieuChi["batBuoc"] =>
  v === "co" || v === "khong" ? v : undefined;
const dung = (v: string | null | undefined): LocKcsTieuChi["dung"] =>
  v === "dang" || v === "ngung" ? v : undefined;

export function thamSoLocKcsTieuChi(loc: LocKcsTieuChi): ThamSoLoc {
  return {
    nhom: loc.nhom,
    bat_buoc: loc.batBuoc ? loc.batBuoc === "co" : undefined,
    active: loc.dung ? loc.dung === "dang" : undefined,
  };
}

export function locKcsTieuChiTuUrl(p: URLSearchParams): LocManKcsTieuChi {
  return {
    ky: kyTuUrl(p, ["tao"], "tao"),
    loc: { nhom: nhomHopLe(p.get("nhom")), batBuoc: batBuoc(p.get("bb")), dung: dung(p.get("dung")) },
  };
}

export function locKcsTieuChiLenUrl(t: LocManKcsTieuChi): GiaTriUrl {
  return { ...kyLenUrl(t.ky, "tao"), nhom: t.loc.nhom, bb: t.loc.batBuoc, dung: t.loc.dung };
}

/** `dem` = số công đoạn mỗi giai đoạn máy chủ đếm sau mọi lọc trừ giai đoạn. */
export function dieuKienKcsTieuChi(dem: Record<string, number>): DieuKien<LocKcsTieuChi>[] {
  const giaiDoan: GiaTriDK[] = Object.entries(NHOM_CONG_DOAN).map(([ma, nhan]) => ({
    value: ma, nhan, so: dem[ma] ?? 0,
  }));
  return [
    {
      khoa: "dung", nhan: "Trạng thái", icon: PowerOff, kieu: "mot", giaTri: DUNG,
      doc: (l) => l.dung,
      ghi: (l, v) => ({ ...l, dung: dung(v) }),
    },
    {
      khoa: "nhom", nhan: "Giai đoạn", icon: Layers, kieu: "mot", giaTri: giaiDoan,
      doc: (l) => l.nhom,
      ghi: (l, v) => ({ ...l, nhom: nhomHopLe(v) }),
    },
    {
      khoa: "bb", nhan: "Bắt buộc", icon: ShieldCheck, kieu: "mot", giaTri: BAT_BUOC,
      doc: (l) => l.batBuoc,
      ghi: (l, v) => ({ ...l, batBuoc: batBuoc(v) }),
    },
  ];
}
