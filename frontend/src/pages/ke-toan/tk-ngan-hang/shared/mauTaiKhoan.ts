/** Tài khoản ngân hàng mẫu cho test của màn Tài khoản ngân hàng (chỉ test import). */
import type { CompanyBankAccountRow } from "../../../../api/client";

export function taiKhoan(p: Partial<CompanyBankAccountRow> = {}): CompanyBankAccountRow {
  return {
    id: 1, account_holder: "Công ty Cổ phần In Sao Việt Nhật", account_number: "933134668",
    bank_name: "Ngân hàng TMCP Quân đội (MB)", bank_branch: "Bình Dương", currency: "VND",
    is_default: false, is_active: true, use_for_receipts: true, use_for_payments: true, note: null,
    created_at: "2026-06-14T01:05:00", updated_at: "2026-06-14T01:05:00",
    ...p,
  };
}
