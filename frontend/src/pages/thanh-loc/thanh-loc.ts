/** Thanh lọc dùng chung của mọi danh sách chứng từ (06/10/2026, phương án 2 "nút Lọc + menu" theo
 *  khuôn Linear — `docs/mockups/bo-loc-nang-cao-3-phuong-an.html`).
 *
 *  Mỗi màn chỉ KHAI các điều kiện của mình (`DieuKien`): kiểu chọn một, chọn nhiều hay khoảng số, cách
 *  đọc / ghi vào object lọc của màn. Thanh lọc tự lo phần còn lại: menu "Lọc theo…", menu con giá trị,
 *  khối "trường | giá trị | ×" cho điều kiện đã áp. Chọn giá trị là áp ngay — không có bản nháp.
 *  File này là hàm thuần (không React) để test được.
 */
import { CircleDot, type LucideIcon } from "lucide-react";

import { khopGanDung } from "../../utils/timGanDung";

/** Một giá trị chọn được; `so` = số bản ghi mang giá trị đó (máy chủ đếm), không có thì không hiện. */
export type GiaTriDK = { value: string; nhan: string; so?: number };

type Chung = {
  /** Mã điều kiện — duy nhất trong màn. */
  khoa: string;
  nhan: string;
  icon: LucideIcon;
  /** Giá trị nạp từ dữ liệu (khách, người, máy…) ⇒ menu con LUÔN có ô tìm, dù danh sách ngắn. */
  tim?: boolean;
  /** Giá trị đang chọn đã hiện ở chỗ khác trên màn (vd hàng nút lọc nhanh) ⇒ không vẽ thêm khối
   *  "trường | giá trị | ×" cạnh nút Lọc — nói hai lần. Menu Lọc vẫn có điều kiện này. */
  anKhoi?: boolean;
};

export type DieuKienMot<L> = Chung & {
  kieu: "mot";
  giaTri: GiaTriDK[];
  doc: (l: L) => string | undefined;
  ghi: (l: L, v: string | undefined) => L;
};

export type DieuKienNhieu<L> = Chung & {
  kieu: "nhieu";
  giaTri: GiaTriDK[];
  doc: (l: L) => string[];
  ghi: (l: L, v: string[]) => L;
};

export type DieuKienKhoang<L> = Chung & {
  kieu: "khoang";
  /** Đơn vị sau số, vd "đ". */
  donVi: string;
  doc: (l: L) => [number | undefined, number | undefined];
  ghi: (l: L, tu: number | undefined, den: number | undefined) => L;
};

export type DieuKien<L> = DieuKienMot<L> | DieuKienNhieu<L> | DieuKienKhoang<L>;

/** Danh sách cố định (không cờ `tim`) dài hơn ngần này thì menu con mới có ô gõ tìm. */
export const NGUONG_O_TIM = 7;

export const vietSo = (n?: number) => (n == null ? "" : n.toLocaleString("vi-VN"));

export function docSo(s: string): number | undefined {
  const so = s.replace(/\D/g, "");
  if (!so) return undefined;
  const n = Number(so);
  return Number.isSafeInteger(n) ? n : undefined;
}

export function daAp<L>(dk: DieuKien<L>, l: L): boolean {
  switch (dk.kieu) {
    case "mot":
      return dk.doc(l) != null;
    case "nhieu":
      return dk.doc(l).length > 0;
    case "khoang": {
      const [tu, den] = dk.doc(l);
      return tu != null || den != null;
    }
  }
}

const nhanCua = (ds: GiaTriDK[], v: string) => ds.find((g) => g.value === v)?.nhan ?? v;

/** Chữ ở ngăn giữa của khối điều kiện đã áp. */
export function tomTat<L>(dk: DieuKien<L>, l: L): string {
  switch (dk.kieu) {
    case "mot": {
      const v = dk.doc(l);
      return v == null ? "" : nhanCua(dk.giaTri, v);
    }
    case "nhieu": {
      const ds = dk.doc(l);
      if (ds.length <= 2) return ds.map((v) => nhanCua(dk.giaTri, v)).join(" hoặc ");
      return `${ds.length} lựa chọn`;
    }
    case "khoang": {
      const [tu, den] = dk.doc(l);
      const dv = dk.donVi ? ` ${dk.donVi}` : "";
      if (tu != null && den != null) return `${vietSo(tu)} đến ${vietSo(den)}${dv}`;
      if (tu != null) return `từ ${vietSo(tu)}${dv}`;
      if (den != null) return `đến ${vietSo(den)}${dv}`;
      return "";
    }
  }
}

/** Đủ tên mọi giá trị đã chọn — làm `title` khi ngăn giữa chỉ ghi "3 lựa chọn". */
export function tomTatDu<L>(dk: DieuKien<L>, l: L): string {
  if (dk.kieu !== "nhieu") return tomTat(dk, l);
  return dk.doc(l).map((v) => nhanCua(dk.giaTri, v)).join(" hoặc ");
}

export function boDK<L>(dk: DieuKien<L>, l: L): L {
  switch (dk.kieu) {
    case "mot":
      return dk.ghi(l, undefined);
    case "nhieu":
      return dk.ghi(l, []);
    case "khoang":
      return dk.ghi(l, undefined, undefined);
  }
}

export function soDaAp<L>(ds: DieuKien<L>[], l: L): number {
  return ds.filter((dk) => daAp(dk, l)).length;
}

/** Lọc theo chữ gõ: không dấu, không hoa thường, đủ mọi từ là khớp. */
export const khopChu = (nhan: string, go: string) => khopGanDung(nhan, go);

/** Điều kiện "Trạng thái" trong nút Lọc cho màn ĐÃ có tab / ô trạng thái (07/10/2026). Không đẻ
 *  state lọc thứ hai: đọc và ghi thẳng tab đang chọn, nên chọn ở Lọc thì tab nhảy theo, bấm tab thì
 *  khối "Trạng thái | …" cũng đổi theo. Chọn lại giá trị đang chọn hoặc bấm × là về tab Tất cả.
 *  `ghi` trả nguyên object lọc — phần đổi nằm ở tab. */
export function dkTheoTab<L>(o: {
  tabs: { id: string; nhan: string; so?: number }[];
  /** Mã tab "Tất cả" — không hiện trong menu con, là giá trị khi bỏ điều kiện. */
  tatCa: string;
  dang: string;
  dat: (id: string) => void;
  khoa?: string;
  nhan?: string;
  icon?: LucideIcon;
  anKhoi?: boolean;
}): DieuKienMot<L> {
  return {
    anKhoi: o.anKhoi,
    khoa: o.khoa ?? "trang_thai_tab",
    nhan: o.nhan ?? "Trạng thái",
    icon: o.icon ?? CircleDot,
    kieu: "mot",
    giaTri: o.tabs.filter((t) => t.id !== o.tatCa).map((t) => ({ value: t.id, nhan: t.nhan, so: t.so })),
    doc: () => (o.dang === o.tatCa ? undefined : o.dang),
    ghi: (l, v) => {
      o.dat(v ?? o.tatCa);
      return l;
    },
  };
}
