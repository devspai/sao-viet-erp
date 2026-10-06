/** Phiếu thu mẫu cho test của màn Phiếu thu (chỉ test import). */
import type { PaymentReceiptRow } from "../../../../api/client";

export function phieuThu(over: Partial<PaymentReceiptRow>): PaymentReceiptRow {
  return {
    id: 1, code: "PT-261005-AAAA", doc_no: null, source_type: "other", payment_voucher_id: null,
    payment_voucher_code: null, purchase_request_id: null, purchase_request_code: null, supplier_name: null,
    order_id: null, order_code: null, customer_name: null, sales_invoice_id: null, sales_invoice_number: null,
    payer_name: "Phế liệu Tư Hải", payer_address: null, debit_account: null, credit_account: null,
    receipt_method: "cash", status: "received", receipt_date: "2026-10-05", amount: 2_350_000,
    amount_vnd: 2_350_000, currency: "VND", exchange_rate: 1, content: "Bán giấy vụn và lề xén tháng 9",
    company_bank_account_id: null, company_account_holder: null, company_account_number: null,
    company_bank_name: null, company_bank_branch: null, bank_reference: null, created_by_user_id: 1,
    created_by_name: "Phạm Thu Trang", received_by_user_id: 1, received_by_name: "Phạm Thu Trang",
    received_at: "2026-10-05T07:30:00Z", cancelled_by_user_id: null, cancelled_by_name: null, cancelled_at: null,
    cancel_reason: null, note: null, attachment_count: 1, created_at: "2026-10-05T07:30:00Z",
    updated_at: "2026-10-05T07:30:00Z", ...over,
  };
}
