/** Phần lọc DÙNG CHUNG của các danh sách phiếu / đơn của người lao động (06/10/2026): Nhật ký
 *  chấm công, Đi muộn/về sớm, Yêu cầu chỉnh công (Chấm công), Nghỉ phép, Tăng ca.
 *
 *  Mỗi màn có nhiều tab danh sách (Của tôi / Duyệt…) dưới CÙNG một mã màn trên URL (`?man=`), nên
 *  khoá URL của mỗi tab mang tiền tố riêng (`dy_ky`, `ct_tt`…) — tải lại trang mà màn mở tab khác
 *  thì tab đó không ăn nhầm kỳ của tab kia. Lọc, đếm tab, cắt trang đều ở máy chủ. */
import { Building2, CircleDot, UserRound } from "lucide-react";

import type { ThamSoLoc } from "../../api/client";
import type { StatusTabItem } from "../../components/StatusTabs";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu } from "../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";
import { useLocMan } from "../thanh-loc/useLocMan";

/** Người lao động + phòng ban — điều kiện chung của các tab Duyệt. */
export type LocNguoi = { nv?: number; phong?: number };

export function thamSoNguoi(l: LocNguoi): ThamSoLoc {
  return { employee_id: l.nv, phong: l.phong };
}

export function nguoiTuUrl(p: URLSearchParams): LocNguoi {
  return { nv: soTuUrl(p.get("nv")), phong: soTuUrl(p.get("phong")) };
}

export function nguoiLenUrl(l: LocNguoi): GiaTriUrl {
  return { nv: soLenUrl(l.nv), phong: soLenUrl(l.phong) };
}

export function dkNhanVien<L extends LocNguoi>(giaTri: GiaTriDK[]): DieuKien<L> {
  return {
    khoa: "nv", nhan: "Nhân viên", icon: UserRound, kieu: "mot", tim: true, giaTri,
    doc: (l) => idThanhChu(l.nv),
    ghi: (l, v) => ({ ...l, nv: chuThanhId(v) }),
  };
}

export function dkPhong<L extends LocNguoi>(giaTri: GiaTriDK[]): DieuKien<L> {
  return {
    khoa: "phong", nhan: "Phòng ban", icon: Building2, kieu: "mot", tim: true, giaTri,
    doc: (l) => idThanhChu(l.phong),
    ghi: (l, v) => ({ ...l, phong: chuThanhId(v) }),
  };
}

/** Thanh tab trạng thái; `""` = Tất cả. */
export const TAB_TRANG_THAI: [string, string][] = [
  ["pending", "Chờ duyệt"],
  ["approved", "Đã duyệt"],
  ["rejected", "Từ chối"],
  ["cancelled", "Đã hủy"],
  ["", "Tất cả"],
];
const MA_TAB = new Set(TAB_TRANG_THAI.map(([k]) => k));

/** Tab có số — `dem` là `dem_theo_tab` máy chủ trả (đếm sau kỳ + bộ lọc); chưa có thì không hiện số. */
export function tabTrangThai(
  dem: Record<string, number> | null | undefined,
  tabs: [string, string][] = TAB_TRANG_THAI,
): StatusTabItem[] {
  return tabs.map(([key, label]) => ({
    key,
    label,
    count: dem ? (key === "" ? dem.tat_ca ?? 0 : dem[key] ?? 0) : undefined,
    tone: key === "pending" ? "alert" : "default",
  }));
}

/** Bộ lọc của một tab danh sách: kỳ + trạng thái (thanh tab) + các điều kiện riêng `loc`. */
export type LocTab<L> = { ky: KyDS; tt: string; loc: L };

/** Đưa điều kiện của phần `loc` lên cả object lọc của màn (kỳ + tab + `loc`) — để thanh lọc ghi
 *  được cả tab trạng thái lẫn `loc` trong MỘT lần đặt. `dkTheoTab` (ghi tab qua setter riêng rồi
 *  `onLoc` ghi `loc`) không dùng được ở đây: tab và `loc` chung một object, lần đặt sau mang tab
 *  cũ đè mất lần trước. */
export function nangDieuKien<T extends { loc: L }, L>(dk: DieuKien<L>): DieuKien<T> {
  switch (dk.kieu) {
    case "mot":
      return {
        ...dk,
        doc: (t: T) => dk.doc(t.loc),
        ghi: (t: T, v: string | undefined) => ({ ...t, loc: dk.ghi(t.loc, v) }),
      };
    case "nhieu":
      return {
        ...dk,
        doc: (t: T) => dk.doc(t.loc),
        ghi: (t: T, v: string[]) => ({ ...t, loc: dk.ghi(t.loc, v) }),
      };
    case "khoang":
      return {
        ...dk,
        doc: (t: T) => dk.doc(t.loc),
        ghi: (t: T, a: number | undefined, b: number | undefined) => ({ ...t, loc: dk.ghi(t.loc, a, b) }),
      };
  }
}

/** Điều kiện "Trạng thái" đọc / ghi thẳng tab trạng thái nằm trong object lọc của màn (07/10/2026)
 *  — cùng hành vi `dkTheoTab`: chọn ở Lọc thì tab nhảy, bấm tab thì khối "Trạng thái | …" đổi,
 *  chọn lại hoặc × là về tab Tất cả. */
export function dkTrangThaiTab<T>(o: {
  tabs: { id: string; nhan: string; so?: number }[];
  tatCa: string;
  doc: (t: T) => string;
  ghi: (t: T, id: string) => T;
}): DieuKien<T> {
  return {
    khoa: "trang_thai_tab", nhan: "Trạng thái", icon: CircleDot, kieu: "mot",
    giaTri: o.tabs.filter((t) => t.id !== o.tatCa).map((t) => ({ value: t.id, nhan: t.nhan, so: t.so })),
    doc: (t) => (o.doc(t) === o.tatCa ? undefined : o.doc(t)),
    ghi: (t, v) => o.ghi(t, v ?? o.tatCa),
  };
}

/** Điều kiện nút Lọc của một tab danh sách đơn: "Trạng thái" (thanh tab, số đếm lấy từ chính thanh
 *  tab) đứng ĐẦU, sau đó các điều kiện riêng. Dùng kèm `loc={locTab}` `onLoc={setLocTab}`. */
export function dkTabDon<L>(dieuKien: DieuKien<L>[], tabs: StatusTabItem[]): DieuKien<LocTab<L>>[] {
  return [
    dkTrangThaiTab<LocTab<L>>({
      tabs: tabs.map((t) => ({ id: t.key, nhan: t.label, so: t.count })),
      tatCa: "",
      doc: (t) => t.tt,
      ghi: (t, tt) => ({ ...t, tt }),
    }),
    ...dieuKien.map((dk) => nangDieuKien<LocTab<L>, L>(dk)),
  ];
}

/** Thêm / bỏ tiền tố khoá URL của một tab. */
function tienTo(tt: string, g: GiaTriUrl): GiaTriUrl {
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [`${tt}_${k}`, v]));
}
function boTienTo(tt: string, p: URLSearchParams): URLSearchParams {
  const ra = new URLSearchParams();
  p.forEach((v, k) => {
    if (k.startsWith(`${tt}_`)) ra.set(k.slice(tt.length + 1), v);
  });
  return ra;
}

/** `useLocMan` cho một tab: mã màn chung (`man`, khớp mục thanh bên), khoá URL mang tiền tố
 *  `tienToUrl`, bộ nhớ riêng theo tab. */
export function useLocTab<L>(o: {
  man: string;
  tienToUrl: string;
  moc: [string, string][];
  mocMacDinh: string;
  ttMacDinh: string;
  locTrong: L;
  locTuUrl: (p: URLSearchParams) => L;
  locLenUrl: (l: L) => GiaTriUrl;
}): [LocTab<L>, (t: LocTab<L>) => void] {
  const { man, tienToUrl: tt, moc, mocMacDinh, ttMacDinh, locTrong, locTuUrl, locLenUrl } = o;
  return useLocMan<LocTab<L>>(
    man,
    { ky: { loai: "tat_ca", moc: mocMacDinh }, tt: ttMacDinh, loc: locTrong },
    (goc) => {
      const p = boTienTo(tt, goc);
      const trang = p.get("tt");
      return {
        ky: kyTuUrl(p, moc.map(([m]) => m), mocMacDinh),
        // "Tất cả" ghi lên URL là `tt=tat_ca` (giá trị rỗng thì khoá bị bỏ ⇒ đọc lại thành mặc định).
        tt: trang === "tat_ca" ? "" : trang != null && MA_TAB.has(trang) ? trang : ttMacDinh,
        loc: locTuUrl(p),
      };
    },
    (t) =>
      tienTo(tt, {
        ...kyLenUrl(t.ky, mocMacDinh),
        tt: t.tt === ttMacDinh ? undefined : t.tt || "tat_ca",
        ...locLenUrl(t.loc),
      }),
    `${man}:${tt}`,
  );
}
