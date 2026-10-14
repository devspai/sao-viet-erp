// MỐC ĐIỆN THOẠI DUY NHẤT của cả hệ thống (thiết kế mobile 14/10/2026 — docs/thiet-ke-mobile.md).
//
// ≤ 639px = điện thoại: giao diện RIÊNG (thẻ thay hàng bảng, thanh dưới, hộp thoại toàn màn…).
// ≥ 640px (iPad mini dọc 744px trở lên, laptop, PC) giữ NGUYÊN — không một luật nào của lớp điện
// thoại được chạm tới. CSS điện thoại chỉ nằm trong `src/styles/mobile/*.css`, mỗi khối bọc đúng
// `@media (max-width: 639px)` (guard `mobile.test.ts` bắt lọt mốc). JS chỉ đổi CẤU TRÚC qua hook
// dưới đây — đổi màu / cỡ chữ / bố cục thuần thì để CSS lo.
import { useSyncExternalStore } from "react";

export const MOC_DIEN_THOAI = 639;
export const MQ_DIEN_THOAI = `(max-width: ${MOC_DIEN_THOAI}px)`;

function mq(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(MQ_DIEN_THOAI);
}

function dangKy(bao: () => void): () => void {
  const m = mq();
  if (!m) return () => {};
  m.addEventListener("change", bao);
  return () => m.removeEventListener("change", bao);
}

/** Đang ở màn điện thoại (≤ 639px)? Tự cập nhật khi xoay máy / đổi cỡ cửa sổ. Không có
 *  `matchMedia` (jsdom trong test, SSR) thì coi là KHÔNG phải điện thoại — giữ giao diện máy tính. */
export function laDienThoai(): boolean {
  return mq()?.matches ?? false;
}

export function useLaDienThoai(): boolean {
  return useSyncExternalStore(dangKy, laDienThoai, () => false);
}
