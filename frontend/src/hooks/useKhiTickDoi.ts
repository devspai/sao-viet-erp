import { useEffect, useRef } from "react";

/** Gọi `lamMoi` KHI VÀ CHỈ KHI `eventTick` (bộ đếm sự kiện SSE của AppShell) nhảy sau lúc mount.
 *
 *  Khuôn cũ `useEffect(() => { if (eventTick <= 0) return; load(); }, [eventTick, load])` nạp
 *  TRÙNG hai kiểu (đo 27/09/2026 ở màn Mua hàng): (1) mở màn khi phiên đã có sự kiện nào (tick > 0)
 *  là chạy ngay lúc mount, chồng lên effect nạp thường; (2) `load` đổi danh tính mỗi lần đổi bộ
 *  lọc/ô tìm ⇒ mỗi thao tác lọc bắn HAI request. Ở đây `lamMoi` nằm trong ref nên không vào deps.
 */
export function useKhiTickDoi(eventTick: number, lamMoi: () => void): void {
  const fnRef = useRef(lamMoi);
  fnRef.current = lamMoi;
  const tickDaXu = useRef(eventTick);
  useEffect(() => {
    if (eventTick === tickDaXu.current) return;
    tickDaXu.current = eventTick;
    fnRef.current();
  }, [eventTick]);
}
