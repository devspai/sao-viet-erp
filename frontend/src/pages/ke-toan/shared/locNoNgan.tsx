/** Bộ lọc tab "Còn nợ" của ngăn công nợ: null = mọi khoản, "overdue" = đang trễ (bấm số Quá hạn
 *  ngoài bảng), còn lại là khoá mốc tuổi (bấm chú thích tuổi nợ ở đầu ngăn, hoặc mốc đang lọc ở danh
 *  sách). Đang lọc thì hiện một thẻ "mốc + số khoản" kèm nút "Bỏ lọc" — đặt trong `.kt-hang-loc`. */
import { X } from "lucide-react";

import type { AgingBucket } from "../../../api/client";
import { vietSo } from "./dinhDang";
import { nhanMoc } from "./locCongNo";

/** Chữ của bộ lọc đang bật; null = không lọc. */
export function nhanLocNo(loc: string | null, aging: AgingBucket[], duPhong?: string | null): string | null {
  if (loc == null) return null;
  if (loc === "overdue") return "Quá hạn";
  const moc = aging.find((b) => b.key === loc);
  return moc ? nhanMoc(moc.label) : duPhong ?? loc;
}

export function TheLocNo({ nhan, so, onBo }: { nhan: string; so: number; onBo: () => void }) {
  return (
    <>
      <span className="kt-chip kt-chip--dat kt-chip--loc">
        {nhan}
        <b>{vietSo(so)}</b>
      </span>
      <button type="button" className="kt-chip" onClick={onBo}>
        Bỏ lọc
        <X size={14} aria-hidden="true" />
      </button>
    </>
  );
}
