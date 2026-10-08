import { chuanKho } from "../../lib/khoGiay";

export { chuanKho };

/** Đọc chữ người gõ: "790x1090", "790 × 1090", "1090" (cuộn). Không đọc được ⇒ null. */
export function tachKho(chu: string): { rong: number; dai: number } | null {
  const phan = (chu || "").trim().split(/[x×X*\s]+/).filter(Boolean);
  if (phan.length === 0 || phan.length > 2 || !phan.every((p) => /^\d+$/.test(p))) return null;
  const [rong, dai] = chuanKho(Number(phan[0]), Number(phan[1] ?? 0));
  return rong ? { rong, dai } : null;
}

/** "790 × 1090" (tờ) · "Khổ 1090" (cuộn) · "" (chưa có). */
export function nhanKho(dang: "to" | "cuon" | null | undefined, rong: number, dai: number): string {
  if (dang === "cuon") return rong ? `Khổ ${rong}` : "Mọi khổ";
  return rong && dai ? `${rong} × ${dai}` : "";
}
