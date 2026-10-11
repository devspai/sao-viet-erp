/** Điều kiện lọc của hai danh sách Nghỉ phép — Đơn của tôi và Duyệt đơn (06/10/2026). Lọc, đếm
 *  tab, phân trang ở máy chủ; thay ô "Tháng tạo" rời (chỉ chọn được một tháng theo ngày tạo). */
import { Tags, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { api, type ThamSoLoc } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import type { GiaTriUrl } from "../../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../thanh-loc/thanh-loc";
import {
  dkNhanVien,
  dkPhong,
  nguoiLenUrl,
  nguoiTuUrl,
  thamSoNguoi,
  type LocNguoi,
} from "../dieu-kien-don";

export const MAN_NGHI_PHEP = "nghi-phep";

/** Mốc kỳ: Ngày tạo đơn / Ngày nghỉ (đơn có ngày nghỉ GIAO với kỳ — đơn 28/09–03/10 thuộc cả hai tháng). */
export const MOC_NP: [string, string][] = [["tao", "Ngày tạo"], ["nghi", "Ngày nghỉ"]];

/** `nd` = user id người duyệt/từ chối (điều kiện NV duyệt, 10/10/2026). */
export type LocNghiPhep = LocNguoi & { loai?: number; nd?: number };
export const LOC_NP_TRONG: LocNghiPhep = {};

export const thamSoLocNghiPhep = (l: LocNghiPhep): ThamSoLoc => ({ ...thamSoNguoi(l), loai: l.loai, nguoi_duyet: l.nd });
export const locNghiPhepTuUrl = (p: URLSearchParams): LocNghiPhep => ({
  ...nguoiTuUrl(p),
  loai: soTuUrl(p.get("loai")),
  nd: soTuUrl(p.get("nd")),
});
export const locNghiPhepLenUrl = (l: LocNghiPhep): GiaTriUrl => ({
  ...nguoiLenUrl(l),
  loai: soLenUrl(l.loai),
  nd: soLenUrl(l.nd),
});

/** Loại nghỉ (cả loại đã ngừng dùng — đơn cũ vẫn mang loại đó). */
function useLoaiNghi(): GiaTriDK[] {
  const { token } = useAuth();
  const [ds, setDs] = useState<GiaTriDK[]>([]);
  useEffect(() => {
    if (!token) return;
    api.leaves
      .types(token)
      .then((r) => setDs(r.items.map((t) => ({ value: String(t.id), nhan: t.name }))))
      .catch(() => setDs([]));
  }, [token]);
  return ds;
}

function dkLoai(giaTri: GiaTriDK[]): DieuKien<LocNghiPhep> {
  return {
    khoa: "loai", nhan: "Loại nghỉ", icon: Tags, kieu: "mot", tim: true, giaTri,
    doc: (l) => idThanhChu(l.loai),
    ghi: (l, v) => ({ ...l, loai: chuThanhId(v) }),
  };
}

/** Đơn của tôi: chỉ Loại nghỉ. */
export function useDieuKienDonCuaToi(): DieuKien<LocNghiPhep>[] {
  return [dkLoai(useLoaiNghi())];
}

/** Duyệt đơn: Loại nghỉ, Nhân viên, Phòng ban, NV duyệt. */
export function useDieuKienDuyetNghi(): DieuKien<LocNghiPhep>[] {
  const loai = useLoaiNghi();
  const nv = useLuaChonLoc((t) => api.leaves.loc(t, "nhan_vien"));
  const phong = useLuaChonLoc((t) => api.leaves.loc(t, "phong"));
  const duyet = useLuaChonLoc((t) => api.leaves.loc(t, "nguoi_duyet"));
  return [
    dkLoai(loai),
    dkNhanVien<LocNghiPhep>(nv),
    dkPhong<LocNghiPhep>(phong),
    {
      khoa: "nd", nhan: "NV duyệt", icon: UserCheck, kieu: "mot", tim: true, giaTri: duyet,
      doc: (l) => idThanhChu(l.nd),
      ghi: (l, v) => ({ ...l, nd: chuThanhId(v) }),
    },
  ];
}
