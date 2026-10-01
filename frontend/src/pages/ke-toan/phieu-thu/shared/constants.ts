// Hằng dùng chung của màn Phiếu thu (tách từ pages/PaymentReceiptsPage.tsx).
import type { PaymentReceiptStatus } from "../../../../api/client";

export const PAGE_SIZE = 20;

export const STATUS_META: Record<
  PaymentReceiptStatus,
  { label: string; tone: string }
> = {
  waiting_receipt: { label: "Chờ thu", tone: "waiting" },
  received: { label: "Đã thu", tone: "paid" },
  cancelled: { label: "Đã hủy", tone: "cancelled" },
};

/** Tông pill chuẩn `acct-dmh__state--*` (màn Đơn mua hàng) gần nghĩa nhất với từng trạng thái phiếu thu. */
export const PILL_TONE: Record<PaymentReceiptStatus, string> = {
  waiting_receipt: "pending",
  received: "received",
  cancelled: "cancelled",
};
