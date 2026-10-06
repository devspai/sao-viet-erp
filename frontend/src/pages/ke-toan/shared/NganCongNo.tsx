/** Vỏ NGĂN chi tiết dùng chung hai màn công nợ (phải trả NPT-2, phải thu NPTh-2 — đặc tả E "đối xứng
 *  tuyệt đối"), dựng trên `NganPhai`.
 *
 *  Đầu ngăn: "{màn} > {đối tác}" — tên + pill "Vượt hạn mức" — nút hồ sơ đối tác — tóm tắt Còn nợ |
 *  Quá hạn | Hạn mức (chữ + vạch; tuỳ màn kèm "Còn được nợ …") | Cho nợ — dải amber khi vượt hạn mức
 *  (cảnh báo MỀM, không chặn gì). Thân: khối lỗi kèm "Tải lại", câu đang tải, câu báo máy chủ cũ hơn
 *  giao diện, rồi tới nội dung tab của màn.
 */
import { ChevronRight, ExternalLink } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { tien, vietSo } from "./dinhDang";
import { NganPhai } from "./NganPhai";

/** Phần tổng của chi tiết một đối tác mà vỏ ngăn cần. */
export type TongNganCongNo = {
  total_due: number;
  overdue_amount: number;
  credit_limit: number;
  vuot_han_muc: boolean;
  vuot_bao_nhieu: number;
};

export function NganCongNo({
  nhanMan,
  nhanDoiTac,
  tieuDe,
  tong,
  choNo,
  sauNgay,
  conDuocNo = false,
  nutHoSo,
  chuCanh,
  loi,
  loading,
  thieu,
  chuThieu,
  onTaiLai,
  children,
  ...vo
}: {
  /** "Công nợ phải trả" / "Công nợ phải thu". */
  nhanMan: string;
  /** "Nhà cung cấp" / "Khách hàng". */
  nhanDoiTac: string;
  tieuDe: string;
  /** Có số (tải xong, đúng dạng) thì hiện tóm tắt; null = chưa có. */
  tong: TongNganCongNo | null;
  /** Số ngày cho nợ; null = chưa đặt, 0 = trả ngay. */
  choNo: number | null;
  /** "sau mỗi đợt giao" / "sau hoá đơn". */
  sauNgay: string;
  /** Hạn mức kèm dòng "Còn được nợ …". */
  conDuocNo?: boolean;
  /** Nút "Hồ sơ …"; không có = không có quyền xem hồ sơ. */
  nutHoSo?: { nhan: string; onMo: () => void };
  /** Câu sau "Đang vượt hạn mức X." — vd "Chỉ là cảnh báo, vẫn đặt mua được." */
  chuCanh: string;
  loi: string | null;
  loading: boolean;
  /** Có câu trả lời nhưng thiếu phần ngăn cần (máy chủ cũ hơn giao diện). */
  thieu: boolean;
  chuThieu: string;
  onTaiLai: () => void;
  children: ReactNode;
} & Pick<ComponentProps<typeof NganPhai>, "tabs" | "tab" | "onTab" | "len" | "xuong" | "onDong" | "chan" | "chanToi" | "chanDong">) {
  const tomTat = tong
    ? [
        { nhan: "Còn nợ", giaTri: <span className="kt-lon">{tien(tong.total_due)}</span> },
        {
          nhan: "Quá hạn",
          giaTri: tong.overdue_amount > 0 ? <span className="kt-lon kt-do">{tien(tong.overdue_amount)}</span> : "—",
        },
        {
          nhan: "Hạn mức",
          // Chưa đặt hạn mức thì nói thẳng — "0 đ" trông như hạn mức bằng không.
          giaTri:
            tong.credit_limit > 0 ? (
              <>
                {tien(tong.credit_limit)}
                {conDuocNo && (
                  <span className="kt-phu">{`Còn được nợ ${vietSo(Math.max(0, tong.credit_limit - tong.total_due))}`}</span>
                )}
                <span className={`kt-hm__vach${tong.vuot_han_muc ? " kt-hm__vach--vuot" : ""}`} aria-hidden="true">
                  <i style={{ width: `${Math.min(100, (tong.total_due / tong.credit_limit) * 100)}%` }} />
                </span>
              </>
            ) : (
              "Chưa đặt hạn mức"
            ),
        },
        {
          nhan: "Cho nợ",
          // 0 và "chưa đặt" là HAI ca khác hẳn — gộp là hiểu sai cả cột Quá hạn.
          giaTri: choNo == null ? "Chưa đặt" : choNo === 0 ? "Trả ngay" : `${vietSo(choNo)} ngày ${sauNgay}`,
        },
      ]
    : undefined;

  return (
    <NganPhai
      {...vo}
      duongDan={
        <>
          {nhanMan}
          <ChevronRight size={14} aria-hidden="true" />
          {nhanDoiTac}
        </>
      }
      tieuDe={tieuDe}
      the={tong?.vuot_han_muc ? <span className="kt-tt kt-tt--do">Vượt hạn mức</span> : undefined}
      hanhDong={
        nutHoSo ? (
          <button type="button" className="kt-btn kt-btn--nho" onClick={nutHoSo.onMo}>
            <ExternalLink size={14} aria-hidden="true" />
            {nutHoSo.nhan}
          </button>
        ) : undefined
      }
      tomTat={tomTat}
      canhBao={
        tong?.vuot_han_muc ? (
          <p className="kt-canh" role="status">{`Đang vượt hạn mức ${tien(tong.vuot_bao_nhieu)}. ${chuCanh}`}</p>
        ) : undefined
      }
    >
      {loi && (
        <div className="kt-khung kt-khung--do" role="alert">
          <p className="kt-ghi">{loi}</p>
          <div className="kt-khung__nut">
            <button type="button" className="kt-btn kt-btn--nho" onClick={onTaiLai}>Tải lại</button>
          </div>
        </div>
      )}
      {loading && !tong && !thieu && !loi && <p className="kt-mo">Đang tải chi tiết công nợ…</p>}
      {thieu && (
        <p className="kt-canh" role="alert">
          {chuThieu}
        </p>
      )}
      {children}
    </NganPhai>
  );
}
