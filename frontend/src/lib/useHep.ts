import { useEffect, useState } from "react";

/** Màn có khớp truy vấn media không (mặc định: điện thoại ≤640px) — dùng để vẽ MỘT bố cục khác hẳn
 *  (danh sách thay bảng), không vẽ cả hai rồi ẩn bằng CSS. jsdom (bộ test) không có `matchMedia` ⇒
 *  coi là màn rộng. */
export function useHep(truyVan = "(max-width: 640px)"): boolean {
  const coMq = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [hep, setHep] = useState(() => coMq && window.matchMedia(truyVan).matches);
  useEffect(() => {
    if (!coMq) return;
    const mq = window.matchMedia(truyVan);
    const doi = () => setHep(mq.matches);
    doi();
    mq.addEventListener("change", doi);
    return () => mq.removeEventListener("change", doi);
  }, [coMq, truyVan]);
  return hep;
}
