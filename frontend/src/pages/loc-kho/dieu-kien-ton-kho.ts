/** Điều kiện lọc của bảng Tồn kho (tab "Tồn kho" ở màn từng kho) — 08/10/2026.
 *
 *  Lọc, đếm và cắt trang chạy ở MÁY CHỦ (`GET /api/kho/phieu/lo/ton-nhom`); thanh lọc chung lo giao
 *  diện. Trước đây ba ô lọc nằm ở tiêu đề cột (khoảng Đang có, Nhập gần nhất, Giá trị) và chạy trong
 *  trình duyệt — nay là điều kiện trong nút Lọc, riêng "Nhập gần nhất" là mốc của nút Kỳ.
 *
 *  Giá trị tồn là TIỀN: điều kiện chỉ bày ra khi người xem có ô "Xem giá thành" của kho này, và máy
 *  chủ cũng tự bỏ qua khoảng giá nếu thiếu ô đó. Khoảng số nhập SỐ NGUYÊN (khuôn chung của nút Lọc). */
import { Banknote, Boxes } from "lucide-react";

import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { soLenUrl, soTuUrl } from "../thanh-loc/ky-danh-sach";
import type { DieuKien } from "../thanh-loc/thanh-loc";

export type LocTonKho = {
  /** Tồn khả dụng của mặt hàng (cộng mọi lô khả dụng). */
  ton_tu?: number;
  ton_den?: number;
  /** Giá trị tồn (Σ số lượng × giá nhập). */
  gt_tu?: number;
  gt_den?: number;
};

export const LOC_TON_TRONG: LocTonKho = {};

/** Mốc kỳ duy nhất của bảng tồn: có ít nhất một lô còn hàng nhập trong khoảng. */
export const MOC_TON_KHO: [string, string][] = [["nhap", "Nhập gần nhất"]];

/** Tham số gửi máy chủ (chuỗi, bỏ ô trống). Giá trị tồn chỉ gửi khi thấy giá. */
export function thamSoLocTon(loc: LocTonKho, xemGia: boolean): Record<string, string | undefined> {
  const s = (n?: number) => (n == null ? undefined : String(n));
  return {
    ton_tu: s(loc.ton_tu),
    ton_den: s(loc.ton_den),
    gt_tu: xemGia ? s(loc.gt_tu) : undefined,
    gt_den: xemGia ? s(loc.gt_den) : undefined,
  };
}

export function locTonTuUrl(p: URLSearchParams): LocTonKho {
  return {
    ton_tu: soTuUrl(p.get("ton_tu")),
    ton_den: soTuUrl(p.get("ton_den")),
    gt_tu: soTuUrl(p.get("gt_tu")),
    gt_den: soTuUrl(p.get("gt_den")),
  };
}

export function locTonLenUrl(loc: LocTonKho): GiaTriUrl {
  return {
    ton_tu: soLenUrl(loc.ton_tu),
    ton_den: soLenUrl(loc.ton_den),
    gt_tu: soLenUrl(loc.gt_tu),
    gt_den: soLenUrl(loc.gt_den),
  };
}

/** Điều kiện khoảng của bảng tồn. "Nhóm" (Cần mua, Vượt tối đa…) do hàng lọc nhanh + `dkTheoTab` lo. */
export function dieuKienTonKho(xemGia: boolean): DieuKien<LocTonKho>[] {
  const ds: DieuKien<LocTonKho>[] = [
    {
      khoa: "ton", nhan: "Đang có", icon: Boxes, kieu: "khoang", donVi: "",
      doc: (l) => [l.ton_tu, l.ton_den],
      ghi: (l, tu, den) => ({ ...l, ton_tu: tu, ton_den: den }),
    },
  ];
  if (xemGia) {
    ds.push({
      khoa: "gia_tri", nhan: "Giá trị tồn", icon: Banknote, kieu: "khoang", donVi: "đ",
      doc: (l) => [l.gt_tu, l.gt_den],
      ghi: (l, tu, den) => ({ ...l, gt_tu: tu, gt_den: den }),
    });
  }
  return ds;
}
