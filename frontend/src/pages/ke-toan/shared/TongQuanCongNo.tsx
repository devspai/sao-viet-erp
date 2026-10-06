/** Khối TỔNG QUAN của hai màn công nợ (đặc tả NPT-1, NPTh-1 — khuôn "money bar" QuickBooks): một khối
 *  nền trắng thay cả dải số lẫn dải tuổi nợ cũ.
 *
 *  - Hàng số: nhãn trên, số dưới, dòng cùng kỳ dưới mỗi số. Số ĐẦU là số lớn (26px) và nhãn của nó
 *    mang ngày cuối kỳ: "Còn nợ tới 05/10/2026". Số đánh dấu `xau` (nợ quá hạn) tô đỏ khi > 0, và
 *    dòng cùng kỳ của nó đỏ khi TĂNG so với cùng kỳ — mọi dòng cùng kỳ khác màu xám.
 *  - Thanh 12px chia đoạn theo các mốc tuổi nợ (khe 3px, dài theo số tiền, đoạn 0 đồng không vẽ),
 *    dưới là các ô chú thích thẳng hàng (ô màu + tên mốc, số tiền, số khoản). Bấm đoạn hoặc ô = lọc
 *    theo mốc đó (ô viền charcoal, đoạn khác mờ đi); bấm lại = bỏ.
 */
import { ArrowDown, ArrowUp } from "lucide-react";

import type { AgingBucket } from "../../../api/client";
import { doiSo, ngay, tien, vietSo } from "./dinhDang";
import { nhanMoc } from "./locCongNo";

/** Mốc từ 31 ngày trở lên là nợ NẶNG — số tiền của ô chú thích tô đỏ (cùng ngưỡng với dòng đợt). */
const NANG = new Set(["d31_60", "d60_plus"]);

export type SoTongQuan = {
  nhan: string;
  so: number;
  /** Cùng số đó của cùng kỳ năm trước; null/undefined = không hiện dòng cùng kỳ. */
  cungKy?: number | null;
  /** Chỉ số xấu (nợ quá hạn): số đỏ khi > 0, dòng cùng kỳ đỏ khi tăng. */
  xau?: boolean;
};

export function TongQuanCongNo({
  con,
  aging,
  dangChon,
  onChon,
  denNgay,
}: {
  con: SoTongQuan[];
  aging: AgingBucket[];
  /** Khoá mốc tuổi đang lọc; null = không lọc. */
  dangChon: string | null;
  onChon: (k: string | null) => void;
  /** Ngày cuối kỳ (ISO) — còn nợ và tuổi nợ tính TỚI ngày này. */
  denNgay: string;
}) {
  const coNo = aging.some((b) => b.amount > 0);
  const bam = (k: string) => onChon(dangChon === k ? null : k);

  return (
    <section className="kt-tq" aria-label="Tổng quan công nợ">
      <div className="kt-tq__so">
        {con.map((c, i) => {
          const d = c.cungKy != null ? doiSo(c.so, c.cungKy) : null;
          return (
            <div key={c.nhan} className={i === 0 ? "kt-tq__lon" : undefined}>
              <span>{i === 0 ? `${c.nhan} ${ngay(denNgay)}` : c.nhan}</span>
              <b className={c.xau && c.so > 0 ? "kt-do" : undefined}>{tien(c.so)}</b>
              {d && c.cungKy != null && (
                <small className={`kt-cung-ky${c.xau && d.huong === "len" ? " kt-cung-ky--do" : ""}`}>
                  {d.huong === "len" && <ArrowUp size={14} aria-hidden="true" />}
                  {d.huong === "xuong" && <ArrowDown size={14} aria-hidden="true" />}
                  {`Cùng kỳ ${vietSo(c.cungKy)}`}
                </small>
              )}
            </div>
          );
        })}
      </div>
      {coNo && (
        <>
          {/* Thanh chỉ để nhìn và bấm bằng chuột; bàn phím / trình đọc màn hình dùng các ô chú thích. */}
          <div className={`kt-tq__vach${dangChon ? " kt-co-chon" : ""}`} aria-hidden="true">
            {aging.map((b, i) =>
              b.amount > 0 ? (
                <i key={b.key} className={`kt-m${Math.min(i, 5)}${dangChon === b.key ? " on" : ""}`}
                  style={{ flex: b.amount }} title={`${nhanMoc(b.label)} ${tien(b.amount)}`} onClick={() => bam(b.key)} />
              ) : null,
            )}
          </div>
          <div className="kt-tq__moc" role="group" aria-label={`Tuổi nợ tới ${ngay(denNgay)}`}>
            {aging.map((b, i) => {
              const on = dangChon === b.key;
              return (
                <button key={b.key} type="button" className={on ? "on" : undefined} aria-pressed={on}
                  onClick={() => bam(b.key)}>
                  <small>
                    <i className={`kt-m${Math.min(i, 5)}`} aria-hidden="true" />
                    {nhanMoc(b.label)}
                  </small>
                  <b className={NANG.has(b.key) && b.amount > 0 ? "kt-do" : undefined}>{vietSo(b.amount)}</b>
                  <em>{`${vietSo(b.count)} khoản`}</em>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
