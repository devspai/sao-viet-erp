/** Điều kiện lọc của Sổ kho trong Báo cáo kho (06/10/2026). Lọc, cộng tiền và cắt trang ở máy chủ;
 *  thanh lọc chung lo giao diện. Kỳ tính theo ngày nhập/xuất kho (ngày chứng từ — cùng mốc khóa kỳ)
 *  hoặc ngày ghi sổ; mặc định "Tất cả" như sổ vẫn mở trước nay.
 *
 *  Luật tiền: hai khoảng Đơn giá / Thành tiền CHỈ có khi người xem có ô "Xem giá thành" của màn
 *  (`bao_cao_kho:view_cost`); máy chủ cũng bỏ qua hai khoảng đó với người không có ô này. */
import {
  ArrowDownUp, ArrowLeftRight, Banknote, Boxes, ClipboardList, Hash, Layers, Package, Tag, Truck, Users, Warehouse,
} from "lucide-react";

import type { BaoCaoKhoParams, LocThuocTinhKho, LuaChonBaoCaoKho, LuaChonDem } from "../api/client";
import type { GiaTriUrl } from "./ke-toan/shared/urlMan";
import { khoangKy, kyLenUrl, kyTuUrl, soLenUrl, soTuUrl, type KyDS } from "./thanh-loc/ky-danh-sach";
import { chuThanhId, idThanhChu } from "./thanh-loc/lua-chon";
import type { DieuKien, GiaTriDK } from "./thanh-loc/thanh-loc";

export const MAN_BAO_CAO_KHO = "kho-baocao";

export const MOC_SO_KHO: [string, string][] = [
  ["ct", "Ngày nhập/xuất kho"],
  ["ghi_so", "Ngày ghi sổ"],
];
const MOC_MAC_DINH = "ct";

export type LocSoKho = {
  kho?: number;
  sl_tu?: number;
  sl_den?: number;
  dg_tu?: number;
  dg_den?: number;
  tt_tu?: number;
  tt_den?: number;
};

export type LocManSoKho = { ky: KyDS; loc: LocSoKho };

export const LOC_MAN_SO_KHO_TRONG: LocManSoKho = { ky: { loai: "tat_ca", moc: MOC_MAC_DINH }, loc: {} };

/** Tham số kỳ của báo cáo kho — cùng quy ước `tu_ngay`/`den_ngay`/`moc` với `thamSoKy`. */
export function thamSoKySoKho(ky: KyDS): Pick<BaoCaoKhoParams, "tu_ngay" | "den_ngay" | "moc"> {
  const k = khoangKy(ky);
  return k ? { tu_ngay: k.tu, den_ngay: k.den, moc: ky.moc } : {};
}

const KHOA_SO = ["sl_tu", "sl_den", "dg_tu", "dg_den", "tt_tu", "tt_den"] as const;

export function locManSoKhoTuUrl(p: URLSearchParams): LocManSoKho {
  const loc: LocSoKho = { kho: soTuUrl(p.get("kho")) };
  for (const k of KHOA_SO) loc[k] = soTuUrl(p.get(k));
  return { ky: kyTuUrl(p, MOC_SO_KHO.map(([m]) => m), MOC_MAC_DINH), loc };
}

export function locManSoKhoLenUrl(t: LocManSoKho): GiaTriUrl {
  const g: GiaTriUrl = { ...kyLenUrl(t.ky, MOC_MAC_DINH), kho: soLenUrl(t.loc.kho) };
  for (const k of KHOA_SO) g[k] = soLenUrl(t.loc[k]);
  return g;
}

/** Điều kiện của Sổ kho. `chuyen` = sổ Chuyển kho (tiền là giá VỐN); `xemGia` = có ô xem giá. */
export function dieuKienSoKho<L extends LocSoKho>(kho: GiaTriDK[], { chuyen, xemGia }: { chuyen: boolean; xemGia: boolean }): DieuKien<L>[] {
  const ds: DieuKien<L>[] = [
    {
      khoa: "kho", nhan: "Kho", icon: Warehouse, kieu: "mot", tim: true, giaTri: kho,
      doc: (l) => idThanhChu(l.kho),
      ghi: (l, v) => ({ ...l, kho: chuThanhId(v) }),
    },
    {
      khoa: "sl", nhan: "Số lượng", icon: Hash, kieu: "khoang", donVi: "",
      doc: (l) => [l.sl_tu, l.sl_den],
      ghi: (l, tu, den) => ({ ...l, sl_tu: tu, sl_den: den }),
    },
  ];
  if (!xemGia) return ds;
  return [
    ...ds,
    {
      khoa: "dg", nhan: chuyen ? "Đơn giá vốn" : "Đơn giá", icon: Tag, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.dg_tu, l.dg_den],
      ghi: (l, tu, den) => ({ ...l, dg_tu: tu, dg_den: den }),
    },
    {
      khoa: "tt", nhan: chuyen ? "Tiền vốn" : "Thành tiền", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.tt_tu, l.tt_den],
      ghi: (l, tu, den) => ({ ...l, tt_tu: tu, tt_den: den }),
    },
  ];
}

/* ---------------------------------------------------------------- điều kiện thuộc tính (11/10/2026) */

/** Bảng của tab Nhập-Xuất-Tồn: `nxt` = Tổng hợp / Biểu đồ, `chitiet` = Chi tiết phiếu. Máy chủ lọc +
 *  đếm; giá trị chọn được chỉ gồm những gì CÓ trong kỳ + kho + ô tìm đang xem (`lua_chon`). */
export type BangBaoCaoKho = "nxt" | "chitiet";

const gt = (ds: LuaChonDem[] | undefined): GiaTriDK[] => (ds ?? []).map((x) => ({ value: x.value, nhan: x.nhan, so: x.so }));

type KhoaNhieu = keyof LocThuocTinhKho;

function dkNhieu<L extends LocThuocTinhKho>(
  khoa: KhoaNhieu, nhan: string, icon: DieuKien<L>["icon"], giaTri: GiaTriDK[], tim = false,
): DieuKien<L> {
  return {
    khoa, nhan, icon, kieu: "nhieu", tim, giaTri,
    doc: (l) => l[khoa] ?? [],
    ghi: (l, v) => ({ ...l, [khoa]: v.length ? v : undefined }),
  };
}

/** Điều kiện của nút Lọc — CHỈ những gì người ta thật sự cắt báo cáo theo (11/10/2026, bị chê nhét quá
 *  nhiều). Trạng thái của bảng đứng đầu (Tổng hợp: Phát sinh + Tồn cuối kỳ; Chi tiết phiếu: Loại phiếu +
 *  Lý do), rồi Loại hàng (Giấy / Vật tư / Thành phẩm) + Mặt hàng, cuối là đối tác của phiếu. Lệnh, bộ
 *  phận, người lập… là CỘT để đọc, cần tìm thì gõ ô Tìm; kỳ khóa sổ đã có nút Kỳ. */
export function dieuKienThuocTinh<L extends LocThuocTinhKho>(lc: LuaChonBaoCaoKho | null | undefined, bang: BangBaoCaoKho): DieuKien<L>[] {
  const hang = [
    dkNhieu<L>("hang_loai", "Loại hàng", Layers, gt(lc?.hang_loai)),
    dkNhieu<L>("mat_hang", "Mặt hàng", Package, gt(lc?.mat_hang), true),
  ];
  if (bang === "nxt") {
    return [
      dkNhieu<L>("phat_sinh", "Phát sinh trong kỳ", ArrowLeftRight, gt(lc?.phat_sinh)),
      dkNhieu<L>("ton", "Tồn cuối kỳ", Boxes, gt(lc?.ton)),
      ...hang,
    ];
  }
  return [
    dkNhieu<L>("loai_phieu", "Loại phiếu", ArrowDownUp, gt(lc?.loai_phieu)),
    dkNhieu<L>("ly_do", "Lý do nhập / xuất", ClipboardList, gt(lc?.ly_do)),
    ...hang,
    dkNhieu<L>("khach_hang", "Khách hàng", Users, gt(lc?.khach_hang), true),
    dkNhieu<L>("nha_cung_cap", "Nhà cung cấp", Truck, gt(lc?.nha_cung_cap), true),
  ];
}

/** Phần điều kiện thuộc tính máy chủ của bảng đó nhận — điều kiện của bảng kia (vd Tồn cuối kỳ khi
 *  đang xem Chi tiết phiếu) không gửi, khối của nó cũng không hiện. */
export function locTheoBang(l: LocThuocTinhKho, bang: BangBaoCaoKho): LocThuocTinhKho {
  const chung = { hang_loai: l.hang_loai, mat_hang: l.mat_hang };
  return bang === "nxt"
    ? { ...chung, phat_sinh: l.phat_sinh, ton: l.ton }
    : { ...chung, loai_phieu: l.loai_phieu, ly_do: l.ly_do, khach_hang: l.khach_hang, nha_cung_cap: l.nha_cung_cap };
}
