/** Vỏ NGĂN chi tiết dùng chung hai màn công nợ (phải trả NPT-2, phải thu NPTh-2 — đặc tả E "đối xứng
 *  tuyệt đối"), dựng trên `NganPhai`. Bố cục phương án 2 (sổ chi tiết kiểu Xero, 06/10/2026).
 *
 *  Đầu ngăn: "{màn} > {đối tác}" — tên + thẻ mã — nút "In sao kê" và hồ sơ đối tác — khối số
 *  `TomTatDoiTac` (còn nợ, tuổi nợ bấm lọc được, hạn mức). Thân: khối lỗi kèm "Tải lại", câu đang tải,
 *  câu báo máy chủ cũ hơn giao diện, rồi tới nội dung tab của màn.
 */
import { ChevronRight, ExternalLink, Printer } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { TheNho } from "./Cum";
import { NganPhai } from "./NganPhai";
import { TomTatDoiTac, type TongNganCongNo } from "./TomTatDoiTac";

export type { TongNganCongNo };

export function NganCongNo({
  nhanMan,
  nhanDoiTac,
  tieuDe,
  ma,
  tong,
  choNo,
  sauNgay,
  nutHoSo,
  onInSaoKe,
  chuCanh,
  dangLoc,
  onLoc,
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
  /** Mã khách / mã NCC — thẻ dưới tên; không có thì thôi. */
  ma?: string | null;
  /** Có số (tải xong, đúng dạng) thì hiện khối số; null = chưa có. */
  tong: TongNganCongNo | null;
  /** Số ngày cho nợ; null = chưa đặt, 0 = trả ngay. */
  choNo: number | null;
  /** "sau mỗi đợt giao" / "sau hoá đơn". */
  sauNgay: string;
  /** Nút "Hồ sơ …"; không có = không có quyền xem hồ sơ. */
  nutHoSo?: { nhan: string; onMo: () => void };
  onInSaoKe: () => void;
  /** Câu giải thích khi vượt hạn mức — vd "Chỉ là cảnh báo, vẫn đặt mua được." */
  chuCanh: string;
  /** Mốc tuổi đang lọc tab Còn nợ. */
  dangLoc: string | null;
  onLoc: (khoa: string | null) => void;
  loi: string | null;
  loading: boolean;
  /** Có câu trả lời nhưng thiếu phần ngăn cần (máy chủ cũ hơn giao diện). */
  thieu: boolean;
  chuThieu: string;
  onTaiLai: () => void;
  children: ReactNode;
} & Pick<ComponentProps<typeof NganPhai>, "tabs" | "tab" | "onTab" | "len" | "xuong" | "onDong" | "chan" | "chanToi" | "chanDong">) {
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
      phuDe={ma ? <TheNho>{ma}</TheNho> : undefined}
      hanhDong={
        <>
          <button type="button" className="kt-btn kt-btn--nho" onClick={onInSaoKe} disabled={!tong}>
            <Printer size={14} aria-hidden="true" />
            In sao kê
          </button>
          {nutHoSo && (
            <button type="button" className="kt-btn kt-btn--nho" onClick={nutHoSo.onMo}>
              <ExternalLink size={14} aria-hidden="true" />
              {nutHoSo.nhan}
            </button>
          )}
        </>
      }
      bienLai={
        tong ? (
          <TomTatDoiTac tong={tong} choNo={choNo} sauNgay={sauNgay} chuCanh={chuCanh} dangLoc={dangLoc} onLoc={onLoc} />
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
