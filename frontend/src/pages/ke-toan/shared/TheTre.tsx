/** Thẻ "Trễ N ngày" của một khoản nợ (đợt giao bên phải trả, hoá đơn bên phải thu). Mốc 31 ngày trở
 *  lên là nợ NẶNG — thẻ đỏ; trễ ít hơn — thẻ amber (cùng biên `d31_60`/`d60_plus` của `AGING_BUCKETS`
 *  ở máy chủ). Số ngày trễ giữ đúng, chỉ đổi màu. Chưa trễ thì không vẽ gì. */
const NANG: ReadonlySet<string> = new Set(["d31_60", "d60_plus"]);

export function TheTre({ soNgay, moc }: { soNgay: number; moc: string | null }) {
  if (soNgay <= 0) return null;
  return <span className={`kt-pill kt-pill--${moc && NANG.has(moc) ? "do" : "amber"}`}>{`Trễ ${soNgay} ngày`}</span>;
}
