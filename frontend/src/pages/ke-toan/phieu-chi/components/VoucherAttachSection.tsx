/** Ô "Chứng từ đính kèm" của form lập phiếu chi (đặc tả PC-3) — khuôn chung `OChungTu` /
 *  `locTep` ở `shared/tepChungTu.tsx` (Phiếu thu dùng cùng). Ở đây chỉ còn lời gọi tải lên của
 *  phiếu CHI.
 */
import { api, type PaymentVoucherRow } from "../../../../api/client";
import { taiTepSauKhiLap } from "../../shared/tepChungTu";

export { OChungTu as VoucherAttachSection } from "../../shared/tepChungTu";

/** Tải các tệp đã chọn lên phiếu vừa lập. Trả câu lỗi nếu có tệp hỏng (phiếu VẪN đã lập). */
export function taiChungTuSauKhiLap(token: string, phieu: PaymentVoucherRow, tep: File[]): Promise<string | null> {
  return taiTepSauKhiLap(phieu.code, tep, (f) => api.accounting.uploadVoucherAttachment(token, phieu.id, f));
}
