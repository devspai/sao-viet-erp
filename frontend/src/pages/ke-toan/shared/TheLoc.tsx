/** Hàng thẻ lọc của danh sách phiếu (đặc tả A.16): mỗi thẻ là MỘT bộ lọc kèm số của nó — nhãn
 *  12px có chấm màu, con số + dòng phụ chung một hàng, và dòng cùng kỳ khi bật so sánh. Thẻ đang chọn
 *  viền charcoal đủ 4 cạnh. */
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

import { Icon } from "../../../components/Icons";
import type { IconName } from "../../../components/Icons";

export type TheLocMuc = {
  id: string;
  nhan: string;
  cham?: "xanh" | "amber" | "xam" | "do";
  icon?: IconName;
  so: ReactNode;
  phu?: ReactNode;
  /** Dòng so cùng kỳ; null/undefined = không hiện (tắt so sánh hoặc chưa có số). */
  cungKy?: { huong: "len" | "xuong" | "bang"; chu: string; xau?: boolean } | null;
};

export function TheLoc({
  muc,
  dangChon,
  onChon,
}: {
  muc: TheLocMuc[];
  dangChon: string;
  onChon: (id: string) => void;
}) {
  return (
    <div className="kt-the-loc">
      {muc.map((m) => (
        <button key={m.id} type="button" className={`kt-the-loc__o${m.id === dangChon ? " on" : ""}`}
          aria-pressed={m.id === dangChon} onClick={() => onChon(m.id)}>
          <span className="kt-the-loc__nhan">
            {m.icon ? (
              <Icon name={m.icon} size={14} />
            ) : m.cham ? (
              <i className={`kt-the-loc__cham kt-the-loc__cham--${m.cham}`} aria-hidden="true" />
            ) : null}
            {m.nhan}
          </span>
          {/* Số và dòng phụ chung MỘT hàng ("750.000 đ  1 phiếu") — xếp ba tầng làm thẻ cao gấp đôi. */}
          <span className="kt-the-loc__hang">
            <span className="kt-the-loc__so">{m.so}</span>
            {m.phu != null && <span className="kt-the-loc__phu">{m.phu}</span>}
          </span>
          {m.cungKy && (
            <span className={`kt-cung-ky${m.cungKy.xau ? " kt-cung-ky--do" : ""}`}>
              {m.cungKy.huong === "len" && <ArrowUp size={14} aria-hidden="true" />}
              {m.cungKy.huong === "xuong" && <ArrowDown size={14} aria-hidden="true" />}
              {m.cungKy.chu}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
