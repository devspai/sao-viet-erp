// Dòng "Hạn trả" của đơn mua — gộp số ngày NCC cho nợ với ngày chốt công nợ thành MỘT câu kết quả
// (phương án A, 15/10/2026). Trước đó ngăn bày hai thông số "Cho nợ" và "Ngày chốt nợ" rời nhau để
// người đọc tự cộng. Luật phải khớp `purchase_service.han_tra_dot` bậc 1 và 2: có ngày chốt thì cả
// đơn một hạn = ngày chốt + số ngày; không có thì mỗi đợt tính từ ngày hoá đơn của đợt đó.
import { fmtDate, hanTraTuMoc } from "../../../utils/format";

export type HanTra = {
  /** Câu chính: một ngày cụ thể hoặc luật tính theo hoá đơn. */
  chinh: string;
  /** Dòng nhỏ giải thích vì sao ra câu chính. */
  phu?: string;
  /** NCC chưa khai số ngày cho nợ ⇒ không suy ra được hạn. */
  chuaRo?: boolean;
};

export function moTaHanTra(soNgay: number | null | undefined, ngayChot: string | null | undefined): HanTra {
  if (soNgay == null) {
    return { chinh: "Chưa rõ", phu: "Nhà cung cấp chưa khai số ngày cho nợ", chuaRo: true };
  }
  if (ngayChot) {
    return {
      chinh: hanTraTuMoc(ngayChot, soNgay),
      phu: soNgay === 0
        ? "đúng ngày chốt công nợ"
        : `ngày chốt ${fmtDate(ngayChot)} cộng ${soNgay} ngày cho nợ`,
    };
  }
  if (soNgay === 0) return { chinh: "Trả ngay khi có hoá đơn" };
  return { chinh: `${soNgay} ngày sau ngày hoá đơn`, phu: "mỗi đợt giao một hạn" };
}
