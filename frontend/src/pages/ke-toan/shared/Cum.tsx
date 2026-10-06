/** Mẩu thông tin đứng cạnh nhau KHÔNG nối bằng "·" hay dấu phẩy (đặc tả A.9): mỗi mẩu đứng riêng,
 *  cách bằng khoảng trống, xuống hàng được. Mẩu loại/nhóm/trạng thái bọc trong `TheNho`. */
import type { ReactNode } from "react";

export function Cum({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `kt-cum ${className}` : "kt-cum"}>{children}</span>;
}

/** Thẻ nhỏ: cao 20px, nền --rule-hair, chữ 12px. */
export function TheNho({ children }: { children: ReactNode }) {
  return <span className="kt-the">{children}</span>;
}
