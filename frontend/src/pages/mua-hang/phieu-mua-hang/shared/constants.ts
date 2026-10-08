// Hằng số dùng chung của màn Mua hàng (tách từ pages/PurchaseRequestsPage.tsx).
import type {
  DepartmentPurchaseWorkflowStatus,
  PurchaseRequestStatus,
} from "../../../../api/client";

/** Cỡ trang MẶC ĐỊNH của hai bảng — người dùng đổi được ở ô Dòng/trang dưới chân bảng. */
// Chữ trạng thái lấy từ MỘT nguồn `trang-thai-mua.tsx` (phương án 3, 07/10/2026); `tone` giữ cho CSS cũ.
import { TT_DON, TT_YEU_CAU } from "../../trang-thai-mua";

export const PAGE_SIZE = 25;
export const SOURCE_PAGE_SIZE = 25;

export const STATUS_META: Record<
  PurchaseRequestStatus,
  { label: string; tone: string }
> = {
  draft: { label: TT_DON.draft.label, tone: "draft" },
  pending_approval: { label: TT_DON.pending_approval.label, tone: "pending" },
  approved: { label: TT_DON.approved.label, tone: "approved" },
  rejected: { label: TT_DON.rejected.label, tone: "rejected" },
  purchased: { label: TT_DON.purchased.label, tone: "purchased" },
  // Bậc SUY RA từ đợt giao: có ≥1 đợt nhưng tổng thực nhận chưa đủ số đặt. Không ai gõ tay được
  // trạng thái này — nó đổi theo đợt giao, và phần hàng đã về đã đẻ ra công nợ.
  partially_received: { label: TT_DON.partially_received.label, tone: "partial" },
  received: { label: TT_DON.received.label, tone: "received" },
  cancelled: { label: TT_DON.cancelled.label, tone: "cancelled" },
};

/** Hai trạng thái GHI ĐƯỢC đợt giao — khớp `_TRANG_THAI_GHI_DOT` bên service. */
export const GHI_DOT_DUOC: PurchaseRequestStatus[] = ["purchased", "partially_received"];

export const SOURCE_STATUS_META: Record<
  DepartmentPurchaseWorkflowStatus,
  { label: string; tone: string }
> = {
  open: { label: TT_YEU_CAU.open.label, tone: "open" },
  drafting: { label: TT_YEU_CAU.drafting.label, tone: "drafting" },
  pending_approval: { label: TT_YEU_CAU.pending_approval.label, tone: "pending" },
  needs_correction: { label: TT_YEU_CAU.needs_correction.label, tone: "rejected" },
  in_purchase: { label: TT_YEU_CAU.in_purchase.label, tone: "purchased" },
  done: { label: TT_YEU_CAU.done.label, tone: "received" },
  partially_cancelled: { label: TT_YEU_CAU.partially_cancelled.label, tone: "partial" },
  cancelled: { label: TT_YEU_CAU.cancelled.label, tone: "cancelled" },
};

/** Số NCC hiện trong ô chọn của mỗi dòng. Đủ để so giá mà không biến ô chọn thành danh bạ. */
export const SO_NCC_GOI_Y = 5;

export const ATTACHMENT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
