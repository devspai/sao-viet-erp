/** Khối số đầu NGĂN công nợ một đối tác (phương án 2 — khuôn sổ chi tiết của Xero), dùng chung hai
 *  màn phải thu / phải trả. Ba cột:
 *
 *  - Còn nợ tới hôm nay (số lớn) và Quá hạn (đỏ khi > 0). Tuổi nợ của ngăn luôn neo vào hôm nay —
 *    máy chủ tính `items` tại `as_of`, kể cả khi trang đang xem một kỳ đã qua.
 *  - Vạch tuổi nợ của RIÊNG đối tác này; dưới là chú thích CHỈ các mốc có tiền. Bấm một mốc = lọc tab
 *    Còn nợ theo mốc đó, bấm lại = bỏ.
 *  - Hạn mức: số + vạch, "Còn được nợ X" hoặc "Vượt X" (đỏ — cảnh báo MỀM, câu giải thích ở tooltip),
 *    rồi số ngày cho nợ. Vượt hạn mức chỉ nói Ở ĐÂY, không thêm thẻ cạnh tên hay dải cảnh báo.
 */
import type { AgingBucket } from "../../../api/client";
import { ngay, tien, vietSo } from "./dinhDang";
import { nhanMoc } from "./locCongNo";

/** Phần tổng của chi tiết một đối tác mà đầu ngăn cần. */
export type TongNganCongNo = {
  total_due: number;
  overdue_amount: number;
  credit_limit: number;
  vuot_han_muc: boolean;
  vuot_bao_nhieu: number;
  /** Rổ tuổi của riêng đối tác, mốc đầu là "Chưa tới hạn". */
  aging: AgingBucket[];
  /** Ngày máy chủ tính nợ (hôm nay). */
  as_of: string;
};

/** Số ngày cho nợ: 0 và "chưa đặt" là HAI ca khác hẳn — gộp là hiểu sai cả cột Quá hạn. */
function chuChoNo(choNo: number | null, sauNgay: string): string {
  if (choNo == null) return "Chưa đặt số ngày cho nợ";
  if (choNo === 0) return "Trả ngay, không cho nợ";
  return `Cho nợ ${vietSo(choNo)} ngày ${sauNgay}`;
}

export function TomTatDoiTac({
  tong,
  choNo,
  sauNgay,
  chuCanh,
  dangLoc,
  onLoc,
}: {
  tong: TongNganCongNo;
  /** Số ngày cho nợ; null = chưa đặt, 0 = trả ngay. */
  choNo: number | null;
  /** "sau hoá đơn" / "sau mỗi đợt giao". */
  sauNgay: string;
  /** Câu giải thích khi vượt hạn mức — vd "Chỉ là cảnh báo, vẫn bán và thu bình thường." */
  chuCanh: string;
  /** Khoá mốc tuổi đang lọc ở tab Còn nợ; null = không lọc. */
  dangLoc: string | null;
  onLoc: (khoa: string | null) => void;
}) {
  const coTien = tong.aging.map((b, i) => ({ b, i })).filter((x) => x.b.amount > 0);
  const tongTuoi = coTien.reduce((s, x) => s + x.b.amount, 0);
  const hm = tong.credit_limit;

  return (
    <section className="kt-ndt" aria-label="Tóm tắt công nợ">
      <div className="kt-ndt__o">
        <span className="kt-ndt__nh">{`Còn nợ tới ${ngay(tong.as_of)}`}</span>
        <b className="kt-ndt__lon">{tien(tong.total_due)}</b>
        <span className="kt-ndt__nh">
          {"Quá hạn "}
          <b className={tong.overdue_amount > 0 ? "kt-do" : undefined}>{tien(tong.overdue_amount)}</b>
        </span>
      </div>

      <div className="kt-ndt__o">
        <span className="kt-ndt__nh">Tuổi nợ</span>
        {tongTuoi > 0 ? (
          <>
            <span className="kt-ndt__vach" aria-hidden="true">
              {coTien.map(({ b, i }) => (
                <i key={b.key} className={`kt-m${Math.min(i, 5)}`} style={{ flexGrow: b.amount }} />
              ))}
            </span>
            <div className="kt-ndt__chu" role="group" aria-label="Lọc theo tuổi nợ">
              {coTien.map(({ b, i }) => {
                const on = dangLoc === b.key;
                const ten = nhanMoc(b.label);
                return (
                  <button key={b.key} type="button" className={on ? "on" : undefined} aria-pressed={on}
                    title={on ? "Bấm lại để bỏ lọc" : `Lọc ${ten.toLowerCase()}`}
                    onClick={() => onLoc(on ? null : b.key)}>
                    <i className={`kt-m${Math.min(i, 5)}`} aria-hidden="true" />
                    {ten}
                    <b className={i >= 4 ? "kt-do" : undefined}>{vietSo(b.amount)}</b>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <span className="kt-mo">Không còn nợ</span>
        )}
      </div>

      <div className="kt-ndt__o">
        <span className="kt-ndt__nh">Hạn mức</span>
        {hm > 0 ? (
          <>
            <b>{tien(hm)}</b>
            <span className={`kt-hm__vach${tong.vuot_han_muc ? " kt-hm__vach--vuot" : ""}`} aria-hidden="true">
              <i style={{ width: `${Math.min(100, (tong.total_due / hm) * 100)}%` }} />
            </span>
            {tong.vuot_han_muc ? (
              <span className="kt-ndt__nh kt-do" title={chuCanh}>{`Vượt ${vietSo(tong.vuot_bao_nhieu)}`}</span>
            ) : (
              <span className="kt-ndt__nh">{`Còn được nợ ${vietSo(Math.max(0, hm - tong.total_due))}`}</span>
            )}
          </>
        ) : (
          // Chưa đặt hạn mức thì nói thẳng — "0 đ" trông như hạn mức bằng không.
          <b className="kt-ndt__chua">Chưa đặt hạn mức</b>
        )}
        <span className="kt-ndt__nh kt-ndt__cho">{chuChoNo(choNo, sauNgay)}</span>
      </div>
    </section>
  );
}
