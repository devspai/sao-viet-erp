import type { CongNoDong } from "../../../../api/client";

/** Một dòng sổ (hoặc dòng Cộng) quy về chiều "còn nợ": 331 dư bên Có, 131 dư bên Nợ. `truoc` /
 *  `dauTruoc` là số trả trước (dư bên kia) cuối kỳ / đầu kỳ.
 *
 *  Tiền hoàn (`hoan`) nằm trong PS cùng phía với hoá đơn / hàng về; ở đây nó được trừ khỏi `tang`
 *  (Bán ra / Nhận hàng chỉ còn hàng) và trừ khỏi `giam` (thu âm / trả âm) — đầu + tăng − giảm vẫn
 *  ra đúng cuối kỳ. `giam` có thể âm khi kỳ chỉ có hoàn mà không có thu / trả. */
export function chieuDong(ben: "receivables" | "payables", d: Omit<CongNoDong, "doi_tuong_id" | "ma" | "ten" | "tk" | "aging">) {
  return ben === "payables"
    ? { dau: d.dau_co, dauTruoc: d.dau_no, tang: d.ps_co - d.hoan, giam: d.ps_no - d.hoan, cuoi: d.cuoi_co, truoc: d.cuoi_no }
    : { dau: d.dau_no, dauTruoc: d.dau_co, tang: d.ps_no - d.hoan, giam: d.ps_co - d.hoan, cuoi: d.cuoi_no, truoc: d.cuoi_co };
}
