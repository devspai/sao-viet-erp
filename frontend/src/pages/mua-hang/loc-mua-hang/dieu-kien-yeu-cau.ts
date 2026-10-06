/** Thanh lọc danh sách Yêu cầu mua hàng (06/10/2026) — dùng ở HAI chỗ: màn Yêu cầu mua hàng của phòng
 *  ban và tab "Yêu cầu chờ xử lý" của màn Mua hàng. Kỳ theo Ngày tạo (mặc định) hoặc Ngày cần hàng;
 *  điều kiện Phòng ban, Người yêu cầu, Mặt hàng. Lọc và đếm tab ở máy chủ.
 *
 *  `tienTo` của hai hàm URL: màn Mua hàng chứa HAI danh sách dưới cùng một dấu `?man=mua-hang`, nên
 *  khoá của danh sách yêu cầu mang tiền tố (`yc_ky`, `yc_pb`…) để không đè khoá của danh sách đơn.
 */
import { useEffect, useState } from "react";
import { Building2, Package, UserRound } from "lucide-react";

import { api, type ThamSoLoc } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import type { GiaTriUrl } from "../../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "../../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../../thanh-loc/thanh-loc";

export const MOC_YEU_CAU: [string, string][] = [["tao", "Ngày tạo"], ["can", "Ngày cần hàng"]];

export type LocYeuCau = {
  phong_ban?: number;
  nguoi?: number;
  /** Mặt hàng danh mục, khoá `hang_loai:hang_id` (vd `giay:12`). */
  mat_hang?: string;
};

export type LocManYeuCau = { ky: KyDS; loc: LocYeuCau };

export const LOC_MAN_YC_TRONG: LocManYeuCau = { ky: { loai: "tat_ca", moc: "tao" }, loc: {} };

const MA_MAT_HANG = /^[a-z_]+:\d+$/;

export function thamSoLocYeuCau(loc: LocYeuCau): ThamSoLoc {
  return { phong_ban: loc.phong_ban, nguoi_yeu_cau: loc.nguoi, mat_hang: loc.mat_hang };
}

/** Phần query của một danh sách: bỏ tiền tố khỏi khoá (khoá không mang tiền tố thì bỏ qua). */
export function conTheoTienTo(p: URLSearchParams, tienTo: string): URLSearchParams {
  if (!tienTo) return p;
  const con = new URLSearchParams();
  p.forEach((v, k) => {
    if (k.startsWith(tienTo)) con.set(k.slice(tienTo.length), v);
  });
  return con;
}

export function themTienTo(g: GiaTriUrl, tienTo: string): GiaTriUrl {
  if (!tienTo) return g;
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [`${tienTo}${k}`, v]));
}

export function locManYeuCauTuUrl(goc: URLSearchParams, tienTo = ""): LocManYeuCau {
  const p = conTheoTienTo(goc, tienTo);
  const mh = p.get("mh");
  return {
    ky: kyTuUrl(p, MOC_YEU_CAU.map(([m]) => m), "tao"),
    loc: {
      phong_ban: soTuUrl(p.get("pb")),
      nguoi: soTuUrl(p.get("nyc")),
      mat_hang: mh && MA_MAT_HANG.test(mh) ? mh : undefined,
    },
  };
}

export function locManYeuCauLenUrl(t: LocManYeuCau, tienTo = ""): GiaTriUrl {
  return themTienTo(
    {
      ...kyLenUrl(t.ky, "tao"),
      pb: soLenUrl(t.loc.phong_ban),
      nyc: soLenUrl(t.loc.nguoi),
      mh: t.loc.mat_hang,
    },
    tienTo,
  );
}

/** Trạng thái luôn có tab; các trạng thái còn lại chỉ hiện tab khi có yêu cầu (hoặc đang chọn) —
 *  không mất đường lọc mà cũng không bày tám tab trống. */
export const TAB_CHINH_YEU_CAU = ["open", "pending_approval", "in_purchase", "done"];

/** Ô "Mặt hàng" khoá bằng chuỗi nên không đi qua `useLuaChonLoc` (hàm đó đọc `id` số). */
function useMatHangLoc(): GiaTriDK[] {
  const { token } = useAuth();
  const [ds, setDs] = useState<GiaTriDK[]>([]);
  useEffect(() => {
    if (!token) return;
    api.departmentPurchaseRequests
      .locMatHang(token)
      .then((r) => setDs(r.map((o) => ({ value: o.ma, nhan: o.ten, so: o.so }))))
      .catch(() => setDs([]));
  }, [token]);
  return ds;
}

export function useDieuKienYeuCau(): DieuKien<LocYeuCau>[] {
  const phongBan = useLuaChonLoc(api.departmentPurchaseRequests.locPhongBan);
  const nguoi = useLuaChonLoc(api.departmentPurchaseRequests.locNguoiYeuCau);
  const matHang = useMatHangLoc();
  return [
    {
      khoa: "phong_ban", nhan: "Phòng ban", icon: Building2, kieu: "mot", tim: true, giaTri: phongBan,
      doc: (l) => idThanhChu(l.phong_ban),
      ghi: (l, v) => ({ ...l, phong_ban: chuThanhId(v) }),
    },
    {
      khoa: "nguoi", nhan: "Người yêu cầu", icon: UserRound, kieu: "mot", tim: true, giaTri: nguoi,
      doc: (l) => idThanhChu(l.nguoi),
      ghi: (l, v) => ({ ...l, nguoi: chuThanhId(v) }),
    },
    {
      khoa: "mat_hang", nhan: "Mặt hàng", icon: Package, kieu: "mot", tim: true, giaTri: matHang,
      doc: (l) => l.mat_hang,
      ghi: (l, v) => ({ ...l, mat_hang: v }),
    },
  ];
}
