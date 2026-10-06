/** Ô bảng dùng chung của hai màn công nợ (phải trả NPT-1, phải thu NPTh-1): hạn gần nhất so với hôm
 *  nay, ô Hạn mức (chữ + thanh mảnh), và các ô của BẢNG ĐỦ CỘT (06/10/2026): vạch tuổi nợ của một
 *  dòng, hạn mức theo phần trăm, số điện thoại, chấm tên người phụ trách. */
import type { AgingBucket } from "../../../api/client";
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

type DongHanMuc = { credit_limit: number; total_due: number; vuot_han_muc: boolean; vuot_bao_nhieu: number };

/** Ô Hạn mức: chữ + thanh mảnh; vượt thì "Vượt … đ" đỏ (cảnh báo MỀM, không chặn gì). */
export function OHanMuc({ row }: { row: DongHanMuc }) {
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

/** Ô Hạn mức của BẢNG: "Đã dùng 49%" + vạch + "hạn mức 50 triệu"; vượt thì phần trăm và vạch đỏ. */
export function OHanMucDong({ row }: { row: DongHanMuc }) {
  if (row.credit_limit <= 0) return <span className="kt-mo">Chưa đặt hạn mức</span>;
  const pt = Math.round((row.total_due / row.credit_limit) * 100);
  return (
    <span className="kt-hm">
      <span className={row.vuot_han_muc ? "kt-do" : undefined}>{`Đã dùng ${vietSo(pt)}%`}</span>
      <span className={`kt-hm__vach${row.vuot_han_muc ? " kt-hm__vach--vuot" : ""}`} aria-hidden="true">
        <i style={{ width: `${Math.min(100, pt)}%` }} />
      </span>
      <span className="kt-phu">{`hạn mức ${trieu(row.credit_limit)} triệu`}</span>
    </span>
  );
}

/** Vạch tuổi nợ của MỘT dòng — cùng 6 màu, cùng thứ tự mốc với băng tuổi nợ đầu trang (`moc` = mốc
 *  máy chủ trả). Mỗi khúc dài theo phần tiền của mốc đó; rê chuột đọc được tên mốc và số tiền. */
export function VachTuoi({
  aging,
  moc,
  tong,
}: {
  aging: Record<string, { amount?: number }> | undefined;
  moc: AgingBucket[];
  tong: number;
}) {
  if (!aging || tong <= 0) return null;
  const khuc = moc
    .map((b, i) => ({ b, i, so: aging[b.key]?.amount ?? 0 }))
    .filter((k) => k.so > 0);
  if (khuc.length === 0) return null;
  return (
    <span className="kt-vach-tuoi" role="img"
      aria-label={khuc.map((k) => `${k.b.label} ${vietSo(k.so)}`).join("; ")}>
      {khuc.map((k) => (
        <i key={k.b.key} className={`kt-m${Math.min(k.i, 5)}`} style={{ width: `${(k.so / tong) * 100}%` }}
          title={`${k.b.label}: ${tien(k.so)}`} />
      ))}
    </span>
  );
}

/** "0797235637" → "0797 235 637"; số khác độ dài giữ nguyên. */
export function vietSdt(sdt: string): string {
  const s = sdt.replace(/\s+/g, "");
  return /^\d{10}$/.test(s) ? `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}` : sdt;
}

/** Chấm chữ cái đầu của hai tiếng cuối + tên người phụ trách ("Nguyễn Thị Huyền" → chấm "TH"). */
export function ChamTen({ ten }: { ten: string }) {
  const chu = ten.trim().split(/\s+/);
  const tat = (chu.length > 1 ? chu[chu.length - 2][0] + chu[chu.length - 1][0] : chu[0].slice(0, 2)).toUpperCase();
  return (
    <span className="kt-cham-ten">
      <i aria-hidden="true">{tat}</i>
      {ten}
    </span>
  );
}
