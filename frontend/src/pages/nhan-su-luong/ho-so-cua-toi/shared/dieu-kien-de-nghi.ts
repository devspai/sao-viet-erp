/** Thanh lọc của khối "Đề nghị cập nhật hồ sơ" (06/10/2026): kỳ theo Ngày tạo + điều kiện Trạng
 *  thái (chọn nhiều, số đếm máy chủ theo kỳ). Thay dải pill Tất cả / Chờ duyệt / … cũ. */
import { Activity } from "lucide-react";

import type { GiaTriUrl } from "../../../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, type KyDS } from "../../../thanh-loc/ky-danh-sach";
import type { DieuKien } from "../../../thanh-loc/thanh-loc";
import { REQ_LOC } from "./constants";

export type LocDeNghi = { trang_thai: string[] };

export type LocManDeNghi = { ky: KyDS; loc: LocDeNghi };

export const LOC_DE_NGHI_TRONG: LocManDeNghi = { ky: { loai: "tat_ca", moc: "tao" }, loc: { trang_thai: [] } };

export const MOC_DE_NGHI: [string, string][] = [["tao", "Ngày tạo"]];

const laTrangThai = (v: string) => REQ_LOC.some((f) => f.key === v);

export function locDeNghiTuUrl(p: URLSearchParams): LocManDeNghi {
  return {
    ky: kyTuUrl(p, ["tao"], "tao"),
    loc: { trang_thai: (p.get("dn_tt") ?? "").split(",").filter(laTrangThai) },
  };
}

export function locDeNghiLenUrl(t: LocManDeNghi): GiaTriUrl {
  return {
    ...kyLenUrl(t.ky, "tao"),
    dn_tt: t.loc.trang_thai.length ? t.loc.trang_thai.join(",") : undefined,
  };
}

/** `dem` = số đề nghị mỗi trạng thái trong kỳ đang xem (máy chủ đếm, bỏ điều kiện trạng thái). */
export function dieuKienDeNghi(dem: Record<string, number>): DieuKien<LocDeNghi>[] {
  return [
    {
      khoa: "trang_thai", nhan: "Trạng thái", icon: Activity, kieu: "nhieu",
      giaTri: REQ_LOC.map((f) => ({ value: f.key, nhan: f.label, so: dem[f.key] ?? 0 })),
      doc: (l) => l.trang_thai,
      ghi: (l, v) => ({ ...l, trang_thai: v }),
    },
  ];
}
