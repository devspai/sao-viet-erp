/** Điều kiện lọc của danh sách Hồ sơ nhân sự (06/10/2026). Lọc và đếm ở máy chủ; thanh lọc chung
 *  lo giao diện. Dải KPI đầu màn vẫn là lối tắt — bấm ô KPI là ghi vào CHÍNH các điều kiện này. */
import { Building2, CircleDot, Hourglass, KeyRound } from "lucide-react";

import type { EmployeeKpis, ThamSoLoc } from "../../../api/client";
import type { GiaTriUrl } from "../../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu } from "../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../thanh-loc/thanh-loc";
import { STATUS_LABEL } from "./shared/constants";

export type LocNhanSu = {
  phong?: number;
  trang_thai?: string;
  tai_khoan?: "co" | "chua";
  /** Đang thử việc và hết thử việc trong 30 ngày tới (cùng luật ô KPI). */
  sap_het?: boolean;
};

export const LOC_NS_TRONG: LocNhanSu = {};

/** Mốc kỳ: Ngày tạo hồ sơ / Ngày vào làm. */
export const MOC_NS: [string, string][] = [["tao", "Ngày tạo"], ["vao_lam", "Ngày vào làm"]];

// Nhãn trong thanh lọc: không nối bằng "·" như nhãn huy hiệu.
const NHAN_TRANG_THAI: Record<string, string> = {
  ...STATUS_LABEL,
  probation_ended: "Hết thử việc chờ xác nhận",
};
const KPI_THEO_TRANG_THAI: Partial<Record<string, keyof EmployeeKpis>> = {
  probation: "probation",
  probation_ended: "probation_ended",
  active: "active",
  on_leave: "on_leave",
  resigned: "resigned",
};

const TAI_KHOAN: GiaTriDK[] = [
  { value: "co", nhan: "Có tài khoản" },
  { value: "chua", nhan: "Chưa có tài khoản" },
];

export function thamSoLocNhanSu(loc: LocNhanSu): ThamSoLoc {
  return {
    department_id: loc.phong,
    status: loc.trang_thai,
    has_account: loc.tai_khoan == null ? undefined : loc.tai_khoan === "co",
    ending_soon: loc.sap_het ? true : undefined,
  };
}

export function locNhanSuTuUrl(p: URLSearchParams): LocNhanSu {
  const tt = p.get("tt");
  const tk = p.get("tk");
  return {
    phong: soTuUrl(p.get("phong")),
    trang_thai: tt && tt in STATUS_LABEL ? tt : undefined,
    tai_khoan: tk === "co" || tk === "chua" ? tk : undefined,
    sap_het: p.get("sap_het") === "1" || undefined,
  };
}

export function locNhanSuLenUrl(loc: LocNhanSu): GiaTriUrl {
  return {
    phong: soLenUrl(loc.phong),
    tt: loc.trang_thai,
    tk: loc.tai_khoan,
    sap_het: loc.sap_het ? "1" : undefined,
  };
}

export function dieuKienNhanSu(
  phongBan: { id: number; name: string }[],
  kpis: EmployeeKpis | null,
): DieuKien<LocNhanSu>[] {
  const trangThai: GiaTriDK[] = Object.keys(STATUS_LABEL).map((k) => {
    const kpi = KPI_THEO_TRANG_THAI[k];
    return { value: k, nhan: NHAN_TRANG_THAI[k], so: kpi && kpis ? kpis[kpi] : undefined };
  });
  return [
    {
      khoa: "phong", nhan: "Phòng ban", icon: Building2, kieu: "mot",
      tim: true, giaTri: phongBan.map((d) => ({ value: String(d.id), nhan: d.name })),
      doc: (l) => idThanhChu(l.phong),
      ghi: (l, v) => ({ ...l, phong: chuThanhId(v) }),
    },
    {
      khoa: "trang_thai", nhan: "Trạng thái", icon: CircleDot, kieu: "mot", giaTri: trangThai,
      doc: (l) => l.trang_thai,
      // Đổi trạng thái thì thôi "Sắp hết thử việc" (điều kiện đó chỉ có nghĩa với Thử việc).
      ghi: (l, v) => ({ ...l, trang_thai: v, sap_het: v === "probation" ? l.sap_het : undefined }),
    },
    {
      khoa: "tai_khoan", nhan: "Tài khoản đăng nhập", icon: KeyRound, kieu: "mot", giaTri: TAI_KHOAN,
      doc: (l) => l.tai_khoan,
      ghi: (l, v) => ({ ...l, tai_khoan: v as LocNhanSu["tai_khoan"] }),
    },
    {
      khoa: "sap_het", nhan: "Sắp hết thử việc", icon: Hourglass, kieu: "mot",
      giaTri: [{ value: "1", nhan: "Hết trong 30 ngày tới", so: kpis?.probation_ending_soon }],
      doc: (l) => (l.sap_het ? "1" : undefined),
      ghi: (l, v) => ({ ...l, sap_het: v === "1" || undefined }),
    },
  ];
}
