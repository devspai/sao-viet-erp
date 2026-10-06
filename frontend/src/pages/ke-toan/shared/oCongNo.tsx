/** Ô bảng dùng chung của hai màn công nợ (phải trả NPT-1, phải thu NPTh-1): hạn gần nhất so với hôm
 *  nay, và ô Hạn mức (chữ + thanh mảnh). */
import { soNgay } from "../../../utils/ky";
import { tien, vietSo } from "./dinhDang";

/** Ô tiền trong bảng: 0 ⇒ "—" (không có gì), không phải "0". */
export function so(n: number) {
  return n > 0 ? vietSo(n) : <span className="kt-mo">—</span>;
}

/** "96,5" (triệu) — số gọn cho dòng hạn mức trong ô bảng. */
function trieu(n: number): string {
  return (n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}

/** Hạn gần nhất so với HÔM NAY: "còn 3 ngày" / "trễ 12 ngày" (đỏ) / "tới hạn". Mốc luôn là hôm
 *  nay (`as_of` của máy chủ), KHÔNG phải cuối kỳ đang xem: `han_gan_nhat` là hạn của các khoản còn
 *  nợ tại hôm nay, so với cuối một kỳ đã qua thì ra số ngày vô nghĩa. */
export function ConHan({ han, homNay }: { han: string; homNay: string }) {
  const d = soNgay(homNay, han);
  if (d > 0) return <span className="kt-phu">{`còn ${vietSo(d)} ngày`}</span>;
  if (d < 0) return <span className="kt-phu kt-do">{`trễ ${vietSo(-d)} ngày`}</span>;
  return <span className="kt-phu">tới hạn</span>;
}

/** Ô Hạn mức: chữ + thanh mảnh; vượt thì "Vượt … đ" đỏ (cảnh báo MỀM, không chặn gì). */
export function OHanMuc({
  row,
}: {
  row: { credit_limit: number; total_due: number; vuot_han_muc: boolean; vuot_bao_nhieu: number };
}) {
  if (row.credit_limit <= 0) return <span className="kt-mo">Chưa đặt</span>;
  const phan = Math.min(100, (row.total_due / row.credit_limit) * 100);
  return (
    <span className="kt-hm">
      {row.vuot_han_muc ? (
        <span className="kt-do">{`Vượt ${tien(row.vuot_bao_nhieu)}`}</span>
      ) : (
        <span>{`${trieu(row.total_due)} trên ${trieu(row.credit_limit)} triệu`}</span>
      )}
      <span className={`kt-hm__vach${row.vuot_han_muc ? " kt-hm__vach--vuot" : ""}`} aria-hidden="true">
        <i style={{ width: `${phan}%` }} />
      </span>
    </span>
  );
}
