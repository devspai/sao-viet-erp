// Thanh "so với ngưỡng": vạch trái = Tối thiểu, vạch phải = Tối đa, vùng lá nhạt giữa = khoảng an toàn,
// phần tô = tồn. Đỏ khi dưới tối thiểu, cam khi vượt tối đa, lá khi trong khoảng (bộ màu --tt-*).
import type { ReactNode } from "react";

import { thangNguong } from "./duBao";

const pct = (n: number, thang: number) => `${Math.max(0, Math.min(100, (n / thang) * 100))}%`;

export function ThanhNguong({
  ton,
  min,
  max,
  rong = false,
  moc,
}: {
  ton: number;
  min: number;
  max: number | null;
  /** Thanh rộng hết khung (ngăn, hộp ngưỡng) thay vì 160px của ô bảng. */
  rong?: boolean;
  /** Mốc chữ phía trên thanh (hộp ngưỡng: "Tồn 3.200", "Dự kiến 800"). */
  moc?: { so: number; nhan: ReactNode; lop?: string }[];
}) {
  const thang = thangNguong(ton, min, max, (moc ?? []).map((m) => m.so));
  const lop = ton <= min ? " tkh-bul__day--thieu" : max != null && ton > max ? " tkh-bul__day--du" : "";
  return (
    <div className={`tkh-bul${rong ? " tkh-bul--rong" : ""}`} role="img"
      aria-label={`Tồn ${ton}, tối thiểu ${min}${max != null ? `, tối đa ${max}` : ""}`}>
      {max != null && (
        <span className="tkh-bul__vung" style={{ left: pct(min, thang), width: pct(max - min, thang) }} />
      )}
      <span className={`tkh-bul__day${lop}`} style={{ width: pct(ton, thang) }} />
      <span className="tkh-bul__vach" style={{ left: pct(min, thang) }} />
      {max != null && <span className="tkh-bul__vach" style={{ left: pct(max, thang) }} />}
      {moc?.map((m, i) => (
        <span key={i} className={`tkh-bul__moc ${m.lop ?? ""}`} style={{ left: pct(m.so, thang) }}>{m.nhan}</span>
      ))}
    </div>
  );
}

/** Thước mảnh trong ô bảng Tồn kho: số Tối thiểu và Tối đa ở hai đầu, vùng lá nhạt là khoảng trong
 *  mức, chấm là tồn đang có (đỏ chạm tối thiểu, cam quá tối đa, lá trong mức), vạch chấm là chỗ
 *  Dự kiến còn sẽ tới khi khác tồn hiện có. */
export function ThuocMuc({ ton, duKien, min, max, fmt }: {
  ton: number;
  duKien: number | null;
  min: number;
  max: number | null;
  fmt: (n: number) => string;
}) {
  const thang = thangNguong(ton, min, max, duKien != null ? [duKien] : []);
  const mau = ton <= min ? "var(--tt-do-dot)" : max != null && ton > max ? "var(--tt-cam-dot)" : "var(--tt-la-dot)";
  return (
    <div className="tkh-tm" role="img"
      aria-label={`Tồn ${fmt(ton)}, tối thiểu ${fmt(min)}${max != null ? `, tối đa ${fmt(max)}` : ""}`}>
      <span>{fmt(min)}</span>
      <div className="tkh-tm__ray">
        <i className="tkh-tm__vung" style={{ left: pct(min, thang), width: max != null ? pct(max - min, thang) : undefined,
          right: max == null ? 0 : undefined }} />
        {duKien != null && Math.abs(duKien - ton) > 1e-9 && <i className="tkh-tm__dk" style={{ left: pct(Math.max(0, duKien), thang) }} />}
        <i className="tkh-tm__dau" style={{ left: pct(ton, thang), background: mau }} />
      </div>
      <span>{max != null ? fmt(max) : "không giới hạn"}</span>
    </div>
  );
}

/** Nhãn số dưới thanh rộng (Tối thiểu / Tối đa đặt đúng chỗ vạch). */
export function ThangNguong({ ton, min, max, fmt, them = [] }: {
  ton: number; min: number; max: number | null; fmt: (n: number) => string; them?: number[];
}) {
  const thang = thangNguong(ton, min, max, them);
  return (
    <div className="tkh-thang">
      <span style={{ left: pct(min, thang) }}>{fmt(min)}</span>
      {max != null && <span style={{ left: pct(max, thang) }}>{fmt(max)}</span>}
    </div>
  );
}
