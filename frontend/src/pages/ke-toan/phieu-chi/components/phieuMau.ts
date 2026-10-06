/** Phiếu chi mẫu cho test của màn Phiếu chi (chỉ test import). */
import type { PaymentVoucherRow } from "../../../../api/client";

export function phieu(over: Partial<PaymentVoucherRow>): PaymentVoucherRow {
  return {
    id: 1, code: "PC-261005-AAAA", doc_no: null, debit_account: null, credit_account: null,
    source_type: "other", purchase_request_id: null, salary_advance_id: null, purchase_request_code: "Khác",
    purchase_request_total: null, purchase_paid_amount: null, purchase_created_by_name: null,
    receipt_received_amount: 0, receipt_pending_amount: 0, attachment_count: 1, delivery_id: null,
    delivery_seq_no: null, source_request_codes: [], supplier_id: null, supplier_name: "Điện lực Thuận An",
    supplier_tax_code: null, supplier_address: null, voucher_type: "cash", payment_stage: "other", status: "paid",
    voucher_date: "2026-10-05", planned_payment_date: null, amount: 850000, amount_vnd: 850000, currency: "VND",
    exchange_rate: 1, content: "Tiền điện tháng 9 xưởng in", invoice_number: null, invoice_date: null,
    contract_number: null, company_bank_account_id: null, supplier_bank_account_id: null,
    cash_recipient_name: "Điện lực Thuận An", cash_recipient_address: null, cash_recipient_identity: null,
    bank_fee_bearer: null, bank_reference: null, company_account_holder: null, company_account_number: null,
    company_bank_name: null, company_bank_branch: null, beneficiary_account_holder: null,
    beneficiary_account_number: null, beneficiary_bank_name: null, beneficiary_bank_branch: null,
    created_by_user_id: 1, created_by_name: "Nguyễn Thị Luyến", paid_by_user_id: null, paid_by_name: null,
    paid_at: null, cancelled_by_user_id: null, cancelled_by_name: null, cancelled_at: null, cancel_reason: null,
    note: null, created_at: "2026-10-05T02:12:00Z", updated_at: "2026-10-05T02:12:00Z", ...over,
  };
}
