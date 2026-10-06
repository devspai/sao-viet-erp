/** Dòng thời gian của MỘT phiếu chi cho tab Lịch sử (đặc tả A.5, PC-2): lập (`created_*`), thêm
 *  chứng từ (`uploaded_*`), hủy (`cancelled_*` + lý do). Khuôn tab + cách gom việc dùng chung với
 *  Phiếu thu: `shared/TabLichSu.tsx`.
 */
import type { PaymentVoucherAttachment, PaymentVoucherRow } from "../../../../api/client";
import { tenTheoId, viecHuy, viecLap, viecThemTep, xepMoiNhat, type ViecLs } from "../../shared/TabLichSu";
import { VOUCHER_METHOD_LABELS } from "../shared/list-constants";

export { TabLichSu } from "../../shared/TabLichSu";

export function viecLichSu(phieu: PaymentVoucherRow, tep: PaymentVoucherAttachment[]): ViecLs[] {
  const nguoi: [number | null, string | null][] = [
    [phieu.created_by_user_id, phieu.created_by_name],
    [phieu.cancelled_by_user_id, phieu.cancelled_by_name],
  ];
  return xepMoiNhat([
    viecLap(phieu.created_at, "Lập phiếu chi", phieu.amount_vnd, VOUCHER_METHOD_LABELS[phieu.voucher_type], phieu.created_by_name),
    ...viecThemTep(tep, (id) => tenTheoId(id, nguoi), phieu.created_at),
    ...(phieu.cancelled_at ? [viecHuy(phieu.cancelled_at, phieu.cancelled_by_name, phieu.cancel_reason)] : []),
  ]);
}
