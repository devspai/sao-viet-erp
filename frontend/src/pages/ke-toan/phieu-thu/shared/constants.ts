// Hằng dùng chung của màn Phiếu thu.
import type { PaymentReceiptSource, PaymentReceiptStatus, PaymentVoucherType } from "../../../../api/client";

/** Cỡ trang MẶC ĐỊNH — người dùng đổi ở ô Dòng/trang dưới chân bảng. */
export const PAGE_SIZE = 25;

/** Nhãn + màu pill (`kt-tt--*`) của từng trạng thái. "Chờ thu" chỉ còn ở phiếu CŨ — phiếu lập từ
 *  27/08/2026 là đã thu ngay. */
export const STATUS_META: Record<PaymentReceiptStatus, { label: string; mau: "xanh" | "amber" | "xam" }> = {
  waiting_receipt: { label: "Chờ thu", mau: "amber" },
  received: { label: "Đã thu", mau: "xanh" },
  cancelled: { label: "Đã hủy", mau: "xam" },
};

/** Nhãn "Thu theo" — khớp bộ lọc Nguồn thu (đặc tả A.4, PT-1). Tiêu đề màn đã nói là thu nên giá trị
 *  không lặp chữ "Thu" (phương án A, 07/10/2026). */
export const SOURCE_LABELS: Record<PaymentReceiptSource, string> = {
  sales_invoice: "Hoá đơn",
  order_deposit: "Cọc đơn bán",
  purchase_refund: "Thu lại tiền chi",
  other: "Khác",
};

/** Nhãn hình thức dùng chung hai sổ phiếu: "Tiền mặt | Chuyển khoản" (đặc tả PT-4). */
export const METHOD_LABELS: Record<PaymentVoucherType, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
};
