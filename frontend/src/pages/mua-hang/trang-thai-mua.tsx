// MỘT nguồn chữ + màu trạng thái cho cả Thu mua lẫn Kế toán (phương án 3, 07/10/2026).
//
// Trước đây bốn bảng viết riêng (Yêu cầu mua hàng, Mua hàng › Yêu cầu, Mua hàng › Đơn mua, Kế toán ›
// Đơn mua) mỗi nơi một bộ nhãn: cùng một bản ghi chỗ ghi "Đang mua", chỗ ghi "Đã mua", chỗ ghi "Hoàn
// tất". Mọi nơi hiện trạng thái mua hàng PHẢI lấy chữ và màu ở đây.
//
// Màu lấy bộ `--tt-*` (tokens.css); trong MỘT bộ trạng thái không có hai trạng thái trùng màu.
import type {
  DepartmentPurchaseWorkflowStatus,
  NhomTien,
  PurchaseRequestStatus,
  TinhTrangMon,
} from "../../api/client";
import "./trang-thai-mua.css";

export type MauTT =
  | "slate" | "vang" | "xanh" | "do" | "cyan" | "cam" | "la" | "xam" | "tim" | "cham" | "ngoc";

type Nhan = { label: string; mau: MauTT };

/** Trạng thái HÀNG của đơn mua. "Đang mua/Đã mua" gộp thành Chờ hàng về; "Đã nhận" thành Đã về đủ. */
export const TT_DON: Record<PurchaseRequestStatus, Nhan> = {
  draft: { label: "Nháp", mau: "slate" },
  pending_approval: { label: "Chờ duyệt", mau: "vang" },
  approved: { label: "Đã duyệt", mau: "xanh" },
  rejected: { label: "Bị trả lại", mau: "do" },
  purchased: { label: "Chờ hàng về", mau: "cyan" },
  partially_received: { label: "Về một phần", mau: "cam" },
  received: { label: "Đã về đủ", mau: "la" },
  cancelled: { label: "Đã huỷ", mau: "xam" },
};

/** Nhóm TIỀN của đơn — máy chủ xếp (`nhom_tien`), tách khỏi trạng thái hàng. */
export const TT_TIEN: Record<NhomTien, Nhan> = {
  chua_tra: { label: "Chưa trả", mau: "vang" },
  mot_phan: { label: "Trả một phần", mau: "cam" },
  qua_han: { label: "Quá hạn", mau: "do" },
  da_tra: { label: "Đã trả đủ", mau: "la" },
};

/** Trạng thái hiển thị của YÊU CẦU mua hàng — nói việc tiếp theo, không nói phòng nào làm. */
export const TT_YEU_CAU: Record<DepartmentPurchaseWorkflowStatus, Nhan> = {
  open: { label: "Chờ lập đơn", mau: "xanh" },
  drafting: { label: "Đang lập đơn", mau: "tim" },
  pending_approval: { label: "Đơn chờ duyệt", mau: "vang" },
  needs_correction: { label: "Đơn bị trả lại", mau: "do" },
  in_purchase: { label: "Chờ hàng về", mau: "cyan" },
  done: { label: "Đã về đủ", mau: "la" },
  partially_cancelled: { label: "Huỷ một phần", mau: "cham" },
  cancelled: { label: "Đã huỷ", mau: "xam" },
};

/** Tình trạng một MÓN (chế độ xem Từng món). */
export const TT_MON: Record<TinhTrangMon, Nhan> = {
  cho_lap: { label: "Chờ lập đơn", mau: "xanh" },
  nhap: { label: "Đơn nháp", mau: "slate" },
  cho_duyet: { label: "Đơn chờ duyệt", mau: "vang" },
  tra_lai: { label: "Đơn bị trả lại", mau: "do" },
  cho_hang: { label: "Chờ hàng về", mau: "cyan" },
  mot_phan: { label: "Về một phần", mau: "cam" },
  du: { label: "Chờ gửi kho", mau: "ngoc" },
  nhap_kho: { label: "Đã gửi kho", mau: "la" },
  huy: { label: "Đã huỷ", mau: "xam" },
};

export function ChipTT({ nhan, title }: { nhan: Nhan | undefined; title?: string }) {
  if (!nhan) return null;
  return (
    <span className={`mh-chip mh-chip--${nhan.mau}`} title={title}>
      {nhan.label}
    </span>
  );
}

/** Chấm màu + chữ, dùng cho cột Tiền (nhẹ hơn chip để hai cột trạng thái không đánh nhau). */
export function ChamTT({ nhan }: { nhan: Nhan | undefined }) {
  if (!nhan) return null;
  return (
    <span className={`mh-cham mh-cham--${nhan.mau}`}>
      <i />
      {nhan.label}
    </span>
  );
}

/** Năm nấc tiến độ của một món: có đơn, duyệt, đặt NCC, hàng về, nhập kho. 3.5 = về một phần. */
export function NacTienDo({ n }: { n: number }) {
  const ten = ["Có đơn", "Duyệt", "Đặt nhà cung cấp", "Hàng về", "Nhập kho"];
  return (
    <span className="mh-nac" title={ten.map((t, i) => `${i < Math.floor(n) ? "✓" : i < n ? "½" : "○"} ${t}`).join("\n")}>
      {ten.map((t, i) => (
        <i key={t} className={i < Math.floor(n) ? "on" : i < n ? "nua" : undefined} />
      ))}
    </span>
  );
}
