/** Điều kiện lọc của Báo cáo kinh doanh (06/10/2026). Lọc ở máy chủ; thanh lọc chung lo giao diện.
 *  Kỳ tính theo MỘT mốc: ngày chốt đơn. Mặc định "Tháng này" như báo cáo vẫn mở trước nay.
 *
 *  11/10/2026 thêm Cọc (chọn nhiều, số đếm máy chủ trả kèm báo cáo), khoảng tỷ lệ báo giá và khoảng
 *  tổng đơn có VAT — cùng gửi lên cho cả màn lẫn file Excel. Phương án C thêm Tình trạng giao và
 *  Tình trạng thu (lũy kế tới cuối kỳ). */
import { Banknote, HandCoins, Percent, Truck, UserCheck, Users, Wallet } from "lucide-react";

import { api, type ThamSoLoc } from "../../api/client";
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { kyBaoCaoLenUrl, kyBaoCaoTuUrl } from "../thanh-loc/ky-bao-cao";
import { soLenUrl, soTuUrl, type KyDS } from "../thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu, useLuaChonLoc } from "../thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "../thanh-loc/thanh-loc";

export const MOC_BCKD: [string, string][] = [["chot", "Ngày chốt đơn"]];
const MOC_MAC_DINH = "chot";

export type LocBCKD = {
  khach?: number;
  sale?: number;
  coc?: string[];
  giao?: string[];
  thu?: string[];
  tl_tu?: number;
  tl_den?: number;
  gt_tu?: number;
  gt_den?: number;
};

export type LocManBCKD = { ky: KyDS; loc: LocBCKD };

export const LOC_MAN_BCKD_TRONG: LocManBCKD = { ky: { loai: "thang", moc: MOC_MAC_DINH }, loc: {} };

/** Ba tình trạng cọc — số đếm lấy từ báo cáo vừa nạp (`lua_chon.coc`), chưa nạp thì không số. */
const COC: GiaTriDK[] = [
  { value: "khong", nhan: "Không cọc" },
  { value: "thieu", nhan: "Còn thiếu cọc" },
  { value: "du", nhan: "Đã nhận đủ cọc" },
];
const GIAO: GiaTriDK[] = [
  { value: "chua", nhan: "Chưa giao" },
  { value: "mot_phan", nhan: "Giao một phần" },
  { value: "du", nhan: "Đã giao đủ" },
];
const THU: GiaTriDK[] = [
  { value: "chua", nhan: "Chưa thu" },
  { value: "mot_phan", nhan: "Thu một phần" },
  { value: "du", nhan: "Đã thu đủ" },
];

export function thamSoLocBCKD(loc: LocBCKD): ThamSoLoc {
  return {
    customer_id: loc.khach,
    sale_id: loc.sale,
    coc: loc.coc,
    giao: loc.giao,
    thu: loc.thu,
    ty_le_tu: loc.tl_tu,
    ty_le_den: loc.tl_den,
    gt_tu: loc.gt_tu,
    gt_den: loc.gt_den,
  };
}

const tach = (v: string | null) => (v ?? "").split(",").filter(Boolean);
const noi = (ds?: string[]) => (ds?.length ? ds.join(",") : undefined);
const KHOA_SO = ["khach", "sale", "tl_tu", "tl_den", "gt_tu", "gt_den"] as const;

export function locManBCKDTuUrl(p: URLSearchParams): LocManBCKD {
  const loc: LocBCKD = { coc: tach(p.get("coc")), giao: tach(p.get("giao")), thu: tach(p.get("thu")) };
  for (const k of KHOA_SO) loc[k] = soTuUrl(p.get(k));
  return { ky: kyBaoCaoTuUrl(p, [MOC_MAC_DINH], MOC_MAC_DINH, "thang"), loc };
}

export function locManBCKDLenUrl(t: LocManBCKD): GiaTriUrl {
  const g: GiaTriUrl = {
    ...kyBaoCaoLenUrl(t.ky, MOC_MAC_DINH, "thang"),
    coc: noi(t.loc.coc), giao: noi(t.loc.giao), thu: noi(t.loc.thu),
  };
  for (const k of KHOA_SO) g[k] = soLenUrl(t.loc[k]);
  return g;
}

type DemBCKD = Partial<Record<"coc" | "giao" | "thu", GiaTriDK[]>>;

export function useDieuKienBCKD(dem: DemBCKD = {}): DieuKien<LocBCKD>[] {
  const khach = useLuaChonLoc(api.baoCaoKinhDoanh.khachLoc);
  const sale = useLuaChonLoc(api.baoCaoKinhDoanh.saleLoc);
  return [
    {
      khoa: "khach", nhan: "Khách hàng", icon: Users, kieu: "mot", tim: true, giaTri: khach,
      doc: (l) => idThanhChu(l.khach),
      ghi: (l, v) => ({ ...l, khach: chuThanhId(v) }),
    },
    {
      khoa: "sale", nhan: "Sale", icon: UserCheck, kieu: "mot", tim: true, giaTri: sale,
      doc: (l) => idThanhChu(l.sale),
      ghi: (l, v) => ({ ...l, sale: chuThanhId(v) }),
    },
    {
      khoa: "giao", nhan: "Tình trạng giao", icon: Truck, kieu: "nhieu", giaTri: dem.giao ?? GIAO,
      doc: (l) => l.giao ?? [],
      ghi: (l, v) => ({ ...l, giao: v }),
    },
    {
      khoa: "thu", nhan: "Tình trạng thu", icon: HandCoins, kieu: "nhieu", giaTri: dem.thu ?? THU,
      doc: (l) => l.thu ?? [],
      ghi: (l, v) => ({ ...l, thu: v }),
    },
    {
      khoa: "coc", nhan: "Cọc", icon: Wallet, kieu: "nhieu", giaTri: dem.coc ?? COC,
      doc: (l) => l.coc ?? [],
      ghi: (l, v) => ({ ...l, coc: v }),
    },
    {
      khoa: "tl", nhan: "Tỷ lệ báo giá", icon: Percent, kieu: "khoang", donVi: "%",
      doc: (l) => [l.tl_tu, l.tl_den],
      ghi: (l, tu, den) => ({ ...l, tl_tu: tu, tl_den: den }),
    },
    {
      khoa: "gt", nhan: "Tổng đơn có VAT", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.gt_tu, l.gt_den],
      ghi: (l, tu, den) => ({ ...l, gt_tu: tu, gt_den: den }),
    },
  ];
}
