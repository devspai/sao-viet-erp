/** Khối TỔNG QUAN của hai màn công nợ — khuôn thẻ "Invoices owed to you" của Xero: MỘT thẻ, ba cột.
 *
 *  - Cột trái: Còn nợ tới cuối kỳ (số chính) và số khoản; dưới là hai dòng Chưa tới hạn / Quá hạn.
 *    Bấm "Chưa tới hạn" = lọc mốc đó.
 *  - Cột giữa: 5 cột quá hạn theo số ngày trễ, cao theo số tiền (thang đo chỉ tính các mốc TRỄ — phần
 *    chưa tới hạn đứng ở cột trái nên không đè dẹt các cột trễ). Cột 0 đồng chỉ còn vạch mảnh. Bấm cột
 *    = lọc mốc đó (cột viền charcoal); bấm lại = bỏ. Không có khoản trễ nào thì chỉ một câu báo.
 *  - Cột phải: thêm và đã trả / đã thu trong kỳ.
 *  - So cùng kỳ: "+21% so cùng kỳ" — CHỈ hiện khi cùng kỳ có số (cùng kỳ 0 thì không chia được, và
 *    dòng "Cùng kỳ 0" không mang tin gì). Số tiền cùng kỳ nằm ở tooltip. Đỏ chỉ khi nợ quá hạn TĂNG.
 */
import type { AgingBucket } from "../../../api/client";
import { doiSo, ngay, tien, vietSo } from "./dinhDang";
import { nhanMoc } from "./locCongNo";

export type SoTongQuan = {
  /** Còn nợ tới cuối kỳ. */
  conNo: number;
  quaHan: number;
  /** Mua thêm / bán thêm trong kỳ. */
  them: number;
  /** Đã trả / đã thu trong kỳ. */
  da: number;
};

/** Nhãn ngắn dưới cột tuổi nợ — tên đầy đủ nằm ở tooltip và tên đọc của nút. */
const NGAN: Record<string, string> = {
  d1_7: "1–7", d8_15: "8–15", d16_30: "16–30", d31_60: "31–60", d60_plus: "Trên 60",
};
/** Mốc từ 31 ngày trở lên là nợ NẶNG — số trên cột tô đỏ (cùng ngưỡng với dòng đợt). */
const NANG = new Set(["d31_60", "d60_plus"]);

/** "42,3 tr" / "1,2 tỷ" — số trên đầu cột, chỗ hẹp. */
function gon(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  return vietSo(n);
}

/** Dòng so cùng kỳ; không có cùng kỳ hoặc cùng kỳ bằng 0 thì không vẽ gì. */
function CungKy({ nay, truoc, xau }: { nay: number; truoc: number | null | undefined; xau?: boolean }) {
  if (truoc == null) return null;
  const d = doiSo(nay, truoc);
  if (d.phanTram == null) return null;
  const chu = d.huong === "bang" ? "Bằng cùng kỳ" : `${d.huong === "len" ? "+" : "−"}${d.phanTram}% so cùng kỳ`;
  return (
    <small className={`kt-tq__ck${xau && d.huong === "len" ? " kt-do" : ""}`} title={`Cùng kỳ năm trước ${tien(truoc)}`}>
      {chu}
    </small>
  );
}

export function TongQuanCongNo({
  so,
  cung,
  nhan,
  aging,
  dangChon,
  onChon,
  tuNgay,
  denNgay,
}: {
  so: SoTongQuan;
  /** Số cùng kỳ năm trước; null = không so. */
  cung: SoTongQuan | null;
  /** "Mua thêm" / "Bán thêm", "Đã trả" / "Đã thu", "khoản" / "hoá đơn". */
  nhan: { them: string; da: string; khoan: string };
  aging: AgingBucket[];
  /** Khoá mốc tuổi đang lọc; null = không lọc. */
  dangChon: string | null;
  onChon: (k: string | null) => void;
  /** Đầu kỳ (ISO) — số "trong kỳ" tính từ ngày này. */
  tuNgay: string;
  /** Ngày cuối kỳ (ISO) — còn nợ và tuổi nợ tính TỚI ngày này. */
  denNgay: string;
}) {
  const bam = (k: string) => onChon(dangChon === k ? null : k);
  const [chua, ...tre] = aging;
  const soKhoan = aging.reduce((s, b) => s + b.count, 0);
  const tran = Math.max(1, ...tre.map((b) => b.amount));
  const coTre = tre.some((b) => b.amount > 0);

  return (
    <section className="kt-tq" aria-label="Tổng quan công nợ">
      <div className="kt-tq__chinh">
        <span className="kt-tq__nh">{`Còn nợ tới ${ngay(denNgay)}`}</span>
        <b className="kt-tq__lon">{tien(so.conNo)}</b>
        <div className="kt-tq__phu">
          <span>{`${vietSo(soKhoan)} ${nhan.khoan}`}</span>
          <CungKy nay={so.conNo} truoc={cung?.conNo} />
        </div>
        <div className="kt-tq__hai">
          {chua && (
            <button type="button" className={`kt-tq__dong${dangChon === chua.key ? " on" : ""}`}
              aria-pressed={dangChon === chua.key} onClick={() => bam(chua.key)}>
              <span>{nhanMoc(chua.label)}</span>
              <b>{tien(chua.amount)}</b>
            </button>
          )}
          <div className="kt-tq__dong">
            <span>Quá hạn</span>
            <b className={so.quaHan > 0 ? "kt-do" : undefined}>{tien(so.quaHan)}</b>
          </div>
          <CungKy nay={so.quaHan} truoc={cung?.quaHan} xau />
        </div>
      </div>

      <div className="kt-tq__tuoi">
        <span className="kt-tq__nh">Quá hạn theo số ngày trễ</span>
        {coTre ? (
          <div className="kt-tq__cot" role="group" aria-label={`Quá hạn theo số ngày trễ tới ${ngay(denNgay)}`}>
            {tre.map((b, i) => {
              const on = dangChon === b.key;
              const ten = nhanMoc(b.label);
              return (
                <button key={b.key} type="button" className={on ? "on" : undefined} aria-pressed={on}
                  aria-label={`${ten} ${tien(b.amount)} ${vietSo(b.count)} khoản`}
                  title={`${ten} ${tien(b.amount)} ${vietSo(b.count)} khoản`} onClick={() => bam(b.key)}>
                  <span className={`kt-tq__gt${NANG.has(b.key) && b.amount > 0 ? " kt-do" : ""}`}>{gon(b.amount)}</span>
                  <span className="kt-tq__ong">
                    <i className={`kt-m${Math.min(i + 1, 5)}`}
                      style={{ height: b.amount > 0 ? `${Math.max(6, (b.amount / tran) * 100)}%` : undefined }} />
                  </span>
                  <span className="kt-tq__ten">{NGAN[b.key] ?? ten}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="kt-tq__rong">Không có khoản nào quá hạn</p>
        )}
      </div>

      <div className="kt-tq__ky">
        <span className="kt-tq__nh">
          {`Trong kỳ ${tuNgay.slice(0, 4) === denNgay.slice(0, 4) ? ngay(tuNgay).slice(0, 5) : ngay(tuNgay)} đến ${ngay(denNgay)}`}
        </span>
        <div className="kt-tq__dong">
          <span>{nhan.them}</span>
          <b>{tien(so.them)}</b>
        </div>
        <CungKy nay={so.them} truoc={cung?.them} />
        <div className="kt-tq__dong">
          <span>{nhan.da}</span>
          <b>{tien(so.da)}</b>
        </div>
        <CungKy nay={so.da} truoc={cung?.da} />
      </div>
    </section>
  );
}
