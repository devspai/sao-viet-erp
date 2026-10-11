/** Thanh lọc của danh sách lệnh màn KCS (06/10/2026). Lọc + cắt trang ở máy chủ.
 *
 *  11/10/2026: thêm Trạng thái (đầu menu, đọc/ghi thẳng hàng nút lọc nhanh — luật 07/10), Tổ gây lỗi,
 *  Công đoạn gây lỗi, Có lỗi, Loại lệnh, Người kiểm. Giá trị lấy từ dữ liệu màn KCS kèm số lệnh. */
import { AlertTriangle, CircleDot, Factory, Layers, UserCheck, Users, Workflow } from "lucide-react";
import { useEffect, useState } from "react";

import { api, type SxKcsBaoCao, type SxKcsBaoCaoParams, type SxKcsGiaTriLoc, type SxKcsLocNhanh, type ThamSoLoc } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { khoangKy, kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export const MOC_KCS: [string, string][] = [
  ["tao", "Ngày tạo lệnh"],
  ["kcs", "Lần KCS gần nhất"],
];

export type LocKcs = {
  khach?: number;
  to?: number;
  cong_doan?: string;
  co_loi?: "co" | "khong";
  loai?: "chinh" | "phu";
  nguoi?: number;
};
/** Thứ thanh lọc đọc/ghi: lọc + nút lọc nhanh (điều kiện "Trạng thái" ghi thẳng vào nút). */
export type LocKcsThanh = LocKcs & { nhanh?: SxKcsLocNhanh };

export const LOC_KCS_TRONG: LocKcs = {};

export function thamSoLocKcs(loc: LocKcs): ThamSoLoc {
  return {
    khach_id: loc.khach, to_id: loc.to, cong_doan: loc.cong_doan, co_loi: loc.co_loi, loai: loc.loai,
    nguoi_kiem_id: loc.nguoi,
  };
}

const CO_LOI = new Set(["co", "khong"]);
const LOAI = new Set(["chinh", "phu"]);

export function locKcsTuUrl(p: URLSearchParams): LocKcs {
  const co = p.get("co_loi");
  const loai = p.get("loai");
  return {
    khach: soTuUrl(p.get("khach")),
    to: soTuUrl(p.get("to")),
    cong_doan: p.get("cd") || undefined,
    co_loi: co && CO_LOI.has(co) ? (co as LocKcs["co_loi"]) : undefined,
    loai: loai && LOAI.has(loai) ? (loai as LocKcs["loai"]) : undefined,
    nguoi: soTuUrl(p.get("nguoi")),
  };
}

export function locKcsLenUrl(loc: LocKcs): GiaTriUrl {
  return {
    khach: soLenUrl(loc.khach), to: soLenUrl(loc.to), cd: loc.cong_doan, co_loi: loc.co_loi,
    loai: loc.loai, nguoi: soLenUrl(loc.nguoi),
  };
}

/** Giá trị Tổ / Công đoạn / Người kiểm — nạp một lần khi có phiên; lỗi thì rỗng. */
function useGiaTriLocKcs(): SxKcsGiaTriLoc | null {
  const { token } = useAuth();
  const [gt, setGt] = useState<SxKcsGiaTriLoc | null>(null);
  useEffect(() => {
    if (!token) return;
    api.sanXuat.kcsGiaTriLoc(token).then(setGt).catch(() => setGt(null));
  }, [token]);
  return gt;
}

/** `trangThai` = các nút lọc nhanh trừ "Tất cả", kèm số trên nút. */
export function useDieuKienKcs(trangThai: GiaTriDK[]): DieuKien<LocKcsThanh>[] {
  const khach = useLuaChonLoc(api.sanXuat.kcsKhachLoc);
  const gt = useGiaTriLocKcs();
  const theoId = (ds?: { id: number; ten: string; so: number }[]) =>
    (ds ?? []).map((o) => ({ value: String(o.id), nhan: o.ten, so: o.so }));
  return [
    {
      khoa: "trang_thai", nhan: "Trạng thái", icon: CircleDot, kieu: "mot", giaTri: trangThai,
      doc: (l) => (l.nhanh && l.nhanh !== "tat_ca" ? l.nhanh : undefined),
      ghi: (l, v) => ({ ...l, nhanh: (v as SxKcsLocNhanh | undefined) ?? "tat_ca" }),
    },
    {
      khoa: "to", nhan: "Tổ gây lỗi", icon: Factory, kieu: "mot", tim: true, giaTri: theoId(gt?.to),
      doc: (l) => idThanhChu(l.to),
      ghi: (l, v) => ({ ...l, to: chuThanhId(v) }),
    },
    {
      khoa: "cong_doan", nhan: "Công đoạn gây lỗi", icon: Workflow, kieu: "mot", tim: true,
      giaTri: (gt?.cong_doan ?? []).map((c) => ({ value: c.ten, nhan: c.ten, so: c.so })),
      doc: (l) => l.cong_doan,
      ghi: (l, v) => ({ ...l, cong_doan: v }),
    },
    {
      khoa: "co_loi", nhan: "Có lỗi", icon: AlertTriangle, kieu: "mot",
      giaTri: [{ value: "co", nhan: "Có lỗi" }, { value: "khong", nhan: "Không lỗi" }],
      doc: (l) => l.co_loi,
      ghi: (l, v) => ({ ...l, co_loi: v as LocKcs["co_loi"] }),
    },
    {
      khoa: "loai", nhan: "Loại lệnh", icon: Layers, kieu: "mot",
      giaTri: [{ value: "chinh", nhan: "Lệnh chính" }, { value: "phu", nhan: "Lệnh đi kèm" }],
      doc: (l) => l.loai,
      ghi: (l, v) => ({ ...l, loai: v as LocKcs["loai"] }),
    },
    {
      khoa: "nguoi", nhan: "Người kiểm", icon: UserCheck, kieu: "mot", tim: true, giaTri: theoId(gt?.nguoi_kiem),
      doc: (l) => idThanhChu(l.nguoi),
      ghi: (l, v) => ({ ...l, nguoi: chuThanhId(v) }),
    },
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
  ];
}

// ---- Tab Báo cáo lỗi (09/10/2026) ---------------------------------------------------------------
// Cùng khuôn thanh lọc với tab Lệnh nhưng trạng thái riêng: kỳ tính theo NGÀY KIỂM (mốc duy nhất),
// mặc định Tháng này; khoá URL đội tiền tố `bc_` để không đè kỳ/lọc của tab Lệnh.

export const MOC_BC_KCS: [string, string][] = [["kiem", "Ngày kiểm"]];

export type LocBcKcs = { khach?: number; cong_doan?: string };

export const KY_BC_MAC_DINH: KyDS = { loai: "thang", moc: "kiem" };

export function bcTuUrl(p: URLSearchParams): { ky: KyDS; loc: LocBcKcs } {
  const con = new URLSearchParams();
  for (const k of ["ky", "tu", "den"]) {
    const v = p.get(`bc_${k}`);
    if (v != null) con.set(k, v);
  }
  return {
    ky: con.has("ky") ? kyTuUrl(con, ["kiem"], "kiem") : KY_BC_MAC_DINH,
    loc: { khach: soTuUrl(p.get("bc_khach")), cong_doan: p.get("bc_cd") || undefined },
  };
}

export function bcLenUrl(ky: KyDS, loc: LocBcKcs): GiaTriUrl {
  const k = kyLenUrl(ky, "kiem");
  return {
    // Mặc định là Tháng này nên "Mọi thời gian" phải ghi rõ ra URL.
    bc_ky: ky.loai === KY_BC_MAC_DINH.loai ? undefined : ky.loai,
    bc_tu: k.tu,
    bc_den: k.den,
    bc_khach: soLenUrl(loc.khach),
    bc_cd: loc.cong_doan,
  };
}

/** Tham số máy chủ của tab — dùng chung cho báo cáo và Xuất Excel (cùng lọc phải ra cùng tổng). */
export function thamSoBcKcs(ky: KyDS, loc: LocBcKcs, tim: string): SxKcsBaoCaoParams {
  const k = khoangKy(ky);
  return {
    ...(k ? { tu_ngay: k.tu, den_ngay: k.den, moc: ky.moc } : {}),
    tu_khoa: tim || undefined,
    khach_id: loc.khach,
    cong_doan: loc.cong_doan,
  };
}

/** Giá trị lấy từ chính kết quả báo cáo (kèm số lượt kiểm trong kỳ + ô tìm) — người chỉ xem tổ
 *  mình cũng có danh sách đúng phạm vi, không phải gọi thêm danh mục cần quyền khác. */
export function dieuKienBcKcs(data: SxKcsBaoCao | null): DieuKien<LocBcKcs>[] {
  return [
    {
      khoa: "cong_doan", nhan: "Công đoạn", icon: Workflow, kieu: "mot", tim: true,
      giaTri: (data?.loc_cong_doan ?? []).map((c) => ({ value: c.ten, nhan: c.ten, so: c.so })),
      doc: (l) => l.cong_doan,
      ghi: (l, v) => ({ ...l, cong_doan: v }),
    },
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true,
      giaTri: (data?.loc_khach ?? []).map((o) => ({ value: String(o.id), nhan: o.ten, so: o.so })),
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
  ];
}
