// Hàm dùng chung của màn Phiếu thu.
import type {
  PaymentReceiptInput,
  PaymentReceiptRow,
  PaymentVoucherRow,
} from "../../../../api/client";
import { homNayVN } from "../../../../utils/ky";
import { METHOD_LABELS, SOURCE_LABELS } from "./constants";

/** Hôm nay theo giờ Việt Nam (đặc tả A.14) — bản cũ lấy ngày UTC nên 0h–7h sáng ra hôm qua. */
export function isoToday(): string {
  return homNayVN();
}

export function optional(value?: string | null): string | null {
  const cleaned = (value ?? "").trim();
  return cleaned || null;
}

export function initialForm(
  voucher: PaymentVoucherRow,
  receipt?: PaymentReceiptRow | null,
): PaymentReceiptInput {
  if (receipt) {
    return {
      payer_name: receipt.payer_name,
      payer_address: receipt.payer_address,
      receipt_method: receipt.receipt_method,
      receipt_date: receipt.receipt_date,
      amount: receipt.amount,
      exchange_rate: receipt.exchange_rate,
      content: receipt.content,
      company_bank_account_id: receipt.company_bank_account_id,
      // Lỗi thật số 4: sửa phiếu chuyển khoản phải điền lại sẵn Mã giao dịch (bản cũ bỏ sót).
      bank_reference: receipt.bank_reference,
      debit_account: receipt.debit_account,
      credit_account: receipt.credit_account,
      note: receipt.note,
    };
  }
  return {
    // Người nộp = người phụ trách mua (người lập PMH); thiếu thì rơi về
    // người nhận tiền mặt trên phiếu chi. KHÔNG dùng tên công ty NCC.
    payer_name:
      voucher.purchase_created_by_name || voucher.cash_recipient_name || "",
    // Mẫu 01-TT có ô Địa chỉ — suy sẵn từ phiếu chi, sửa được.
    payer_address: voucher.cash_recipient_address ?? voucher.supplier_address,
    receipt_method: "cash",
    receipt_date: isoToday(),
    debit_account: null,
    credit_account: null,
    // Để trống bắt kế toán tự gõ số thực nộp (ca phổ biến là thu tiền thừa,
    // không phải thu trọn) — "Còn được thu" hiện ở dải tổng quan để đối chiếu.
    amount: 0,
    exchange_rate: voucher.exchange_rate,
    content: `Thu hồi tiền thừa ${voucher.code}`,
    company_bank_account_id: null,
    note: null,
  };
}

/** "Tiền mặt" / "Chuyển khoản" — cùng chữ với Phiếu chi (đặc tả PT-4); bản in cũng dùng. */
export function methodText(row: Pick<PaymentReceiptRow, "receipt_method">): string {
  return METHOD_LABELS[row.receipt_method] ?? row.receipt_method;
}

export function sourceLabel(row: Pick<PaymentReceiptRow, "source_type">): string {
  return SOURCE_LABELS[row.source_type] ?? row.source_type;
}

/** Mã chứng từ nguồn: số hoá đơn, mã đơn bán (cọc) hoặc mã phiếu chi (thu lại). Thu khác: không có. */
export function sourceCode(row: PaymentReceiptRow): string | null {
  if (row.source_type === "order_deposit") return row.order_code;
  if (row.source_type === "sales_invoice") return row.sales_invoice_number;
  if (row.source_type === "purchase_refund") return row.payment_voucher_code;
  return null;
}
