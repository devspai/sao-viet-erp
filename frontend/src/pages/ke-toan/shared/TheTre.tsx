/** Thẻ "Trễ N ngày" của một khoản nợ (đợt giao bên phải trả, hoá đơn bên phải thu). Mốc 31 ngày trở
 *  lên là nợ NẶNG — thẻ đỏ; trễ ít hơn — thẻ amber (cùng biên `d31_60`/`d60_plus` của `AGING_BUCKETS`
 *  ở máy chủ). Số ngày trễ giữ đúng, chỉ đổi màu. Chưa trễ thì không vẽ gì. */
import { soNgay } from "../../../utils/ky";
import { vietSo } from "./dinhDang";

const NANG: ReadonlySet<string> = new Set(["d31_60", "d60_plus"]);

export function TheTre({ soNgay, moc }: { soNgay: number; moc: string | null }) {
  if (soNgay <= 0) return null;
  return <span className={`kt-pill kt-pill--${moc && NANG.has(moc) ? "do" : "amber"}`}>{`Trễ ${soNgay} ngày`}</span>;
}

/** Thẻ hạn của một khoản còn nợ (cả hai màn): trễ ⇒ `TheTre`; tới hạn trong 7 ngày ⇒ amber; xa hơn
 *  ⇒ xám. Máy chủ kẹp `overdue_days` về 0 khi chưa trễ, nên số ngày còn lại tính từ hạn so với
 *  `homNay` (ngày máy chủ tính nợ). */
export function TheHan({ han, homNay, soNgayTre, moc }: { han: string; homNay: string; soNgayTre: number; moc: string | null }) {
  if (soNgayTre > 0) return <TheTre soNgay={soNgayTre} moc={moc} />;
  const con = soNgay(homNay, han);
  if (con <= 0) return <span className="kt-pill kt-pill--amber">Tới hạn hôm nay</span>;
  return <span className={`kt-pill${con <= 7 ? " kt-pill--amber" : ""}`}>{`Còn ${vietSo(con)} ngày`}</span>;
}
