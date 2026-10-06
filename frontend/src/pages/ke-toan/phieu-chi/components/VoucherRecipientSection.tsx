/** Luật kiểm khối CHUYỂN KHOẢN của form phiếu chi (đặc tả PC-3) — một luật cho mọi form chi. Phần hiển
 *  thị nay ở `KhoiPhieuChi.tsx` (`HangTraBang` + `KhoiNguoiNhan`, kiểu mới 06/10/2026).
 *
 *  Ô "Bên chịu phí" ĐÃ GỠ từ 27/08/2026 (không in, không tính); cột `bank_fee_bearer` vẫn gửi mặc
 *  định "payer" ở từng form.
 */
import type { PaymentVoucherBaseInput } from "../../../../api/client";
import { optional } from "../shared/helpers";
import type { LoiForm } from "./KhungFormPhieu";

/** Lỗi của khối chuyển khoản — cùng một luật cho ba form. */
export function loiChuyenKhoan(form: PaymentVoucherBaseInput): LoiForm {
  if (form.voucher_type !== "bank_transfer") return {};
  const loi: LoiForm = {};
  if (!form.company_bank_account_id) loi.company_bank_account_id = "Chọn tài khoản công ty dùng để chi.";
  if (!optional(form.beneficiary_account_holder)) loi.beneficiary_account_holder = "Ghi chủ tài khoản người nhận.";
  if (!optional(form.beneficiary_account_number)) loi.beneficiary_account_number = "Ghi số tài khoản người nhận.";
  if (!optional(form.beneficiary_bank_name)) loi.beneficiary_bank_name = "Ghi ngân hàng của người nhận.";
  return loi;
}
