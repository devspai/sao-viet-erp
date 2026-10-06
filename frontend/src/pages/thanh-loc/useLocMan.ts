/** Dải kỳ + bộ lọc nâng cao của một danh sách Kinh doanh: ghi lên URL (gửi link là người nhận thấy
 *  đúng danh sách đó, tải lại không mất lọc) và nhớ theo màn trong phiên trang (mở chi tiết rồi quay
 *  lại danh sách, hay sang màn khác rồi về, bộ lọc vẫn nguyên). Cùng cơ chế `?man=` với Kế toán. */
import { useCallback, useState } from "react";

import { docThamSoMan, useDongBoUrl, type GiaTriUrl } from "../ke-toan/shared/urlMan";

const nho = new Map<string, unknown>();

export function useLocMan<T>(
  man: string,
  macDinh: T,
  docUrl: (p: URLSearchParams) => T,
  lenUrl: (t: T) => GiaTriUrl,
  /** Khoá nhớ riêng khi MỘT màn có nhiều tab danh sách, mỗi tab một bộ lọc (vd Chấm công: Nhật
   *  ký / Đi muộn / Chỉnh công) — không có thì tab này nhận nhầm bộ lọc của tab kia. */
  khoaNho: string = man,
): [T, (t: T) => void] {
  // URL thắng bộ nhớ: mở từ link / tải lại trang thì thấy đúng bộ lọc trên link.
  const [tt, setTt] = useState<T>(() => {
    const p = docThamSoMan(man);
    if (p && [...p.keys()].some((k) => k !== "man")) {
      const t = docUrl(p);
      nho.set(khoaNho, t);
      return t;
    }
    return (nho.get(khoaNho) as T | undefined) ?? macDinh;
  });
  useDongBoUrl(man, lenUrl(tt));
  const dat = useCallback(
    (t: T) => {
      nho.set(khoaNho, t);
      setTt(t);
    },
    [khoaNho],
  );
  return [tt, dat];
}
