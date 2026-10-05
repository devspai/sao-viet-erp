// Tải dữ liệu một tab của khay hồ sơ MỘT lần rồi giữ qua các lần chuyển tab.
import { useCallback, useEffect, useState } from "react";
import { errMsg } from "./helpers";

/** Bộ nhớ của khay: `key` tab → dữ liệu + `phienBan` lúc tải. Khay tạo lại mỗi khi đổi hồ sơ. */
export type BoNhoTab = Map<string, { phienBan: number; data: unknown }>;

/** Tab trong khay bị GỠ khi chuyển sang tab khác, nên tự tải lúc mount nghĩa là mỗi lần bấm quay
 *  lại tab là một request mới + một nhịp "Đang tải…" rồi nội dung mới hiện ra. Hook này đọc bộ nhớ
 *  của khay trước: còn bản cùng `phienBan` thì hiện ngay, KHÔNG gọi máy chủ.
 *
 *  `phienBan` đổi (vd `lanNap` — khay vừa nạp lại sau một thao tác) ⇒ tải lại, trong lúc chờ vẫn
 *  hiện bản cũ thay vì xoá trắng. `napLai()` cho thao tác ngay trong tab (thêm/xoá tệp). */
export function useNapGiuQuaTab<T>(
  boNho: BoNhoTab,
  key: string,
  tai: () => Promise<T>,
  phienBan = 0,
): { data: T | null; loi: string | null; napLai: () => void } {
  const cu = boNho.get(key);
  const [data, setData] = useState<T | null>(cu ? (cu.data as T) : null);
  const [loi, setLoi] = useState<string | null>(null);

  const napLai = useCallback(() => {
    setLoi(null);
    tai()
      .then((d) => {
        boNho.set(key, { phienBan, data: d });
        setData(d);
      })
      .catch((e) => setLoi(errMsg(e)));
    // `tai` là hàm viết tại chỗ, đổi mỗi lần render — khoá theo key/phienBan là đủ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boNho, key, phienBan]);

  useEffect(() => {
    const e = boNho.get(key);
    if (e && e.phienBan === phienBan) {
      setData(e.data as T);
      return;
    }
    napLai();
  }, [boNho, key, phienBan, napLai]);

  return { data, loi, napLai };
}
