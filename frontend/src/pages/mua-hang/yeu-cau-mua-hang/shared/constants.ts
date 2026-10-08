// Hằng số dùng chung của màn Yêu cầu mua hàng (tách từ pages/DepartmentPurchaseRequestsPage.tsx).
import type {
  DepartmentPurchaseSourceType,
  DepartmentPurchaseWorkflowStatus,
  PurchaseRequestStatus,
} from "../../../../api/client";

/** Số dòng mỗi trang. TRƯỚC 08/08/2026 màn này tải cứng 100 dòng và KHÔNG có phân trang: quá 100
 *  yêu cầu là bảng cắt im lặng trong khi ô "Tổng" vẫn hiện đúng — người dùng không có cách nào
 *  biết mình đang thiếu gì. Đây là cỡ MẶC ĐỊNH — người dùng đổi ở ô Dòng/trang dưới chân bảng. */
// Chữ trạng thái lấy từ MỘT nguồn `trang-thai-mua.tsx` (phương án 3, 07/10/2026); `tone` giữ cho CSS cũ.
import { TT_DON, TT_YEU_CAU } from "../../trang-thai-mua";

export const PAGE_SIZE = 25;

export const SOURCE_TYPE_LABELS: Record<DepartmentPurchaseSourceType, string> = {
  kinh_doanh: "Kinh doanh",
  kho: "Kho",
  san_xuat: "Sản xuất",
  cong_nghe: "Công nghệ",
  gia_cong_ngoai: "Gia công ngoài",
  khac: "Khác",
};

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
  // Tông HỔ PHÁCH, không phải tông "đã hủy" (đỏ/xám): yêu cầu VẪN CÒN SỐNG, chỉ rụng vài món.
  // Dùng chung tông với "Đã hủy" là người đọc lướt tưởng cả phiếu chết, thôi không xử lý nữa.
  partially_cancelled: { label: TT_YEU_CAU.partially_cancelled.label, tone: "partial" },
  cancelled: { label: TT_YEU_CAU.cancelled.label, tone: "cancelled" },
};

/** Nhãn trạng thái của một PHIẾU MUA. Dùng chung cho ô tình trạng dòng và danh sách phiếu. */
export const PHIEU_STATUS_META: Record<PurchaseRequestStatus, { label: string; tone: string }> = {
  draft: { label: TT_DON.draft.label, tone: "draft" },
  pending_approval: { label: TT_DON.pending_approval.label, tone: "pending" },
  approved: { label: TT_DON.approved.label, tone: "approved" },
  rejected: { label: TT_DON.rejected.label, tone: "rejected" },
  purchased: { label: TT_DON.purchased.label, tone: "purchased" },
  partially_received: { label: TT_DON.partially_received.label, tone: "partial" },
  received: { label: TT_DON.received.label, tone: "received" },
  cancelled: { label: TT_DON.cancelled.label, tone: "cancelled" },
};
