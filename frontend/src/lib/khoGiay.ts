/** Dạng + khổ của giấy trong kho (spec 2026-10-01-giay-dem-to-theo-kho §3.1). Phản chiếu
 *  `backend/app/services/kho_giay.py` — máy chủ chuẩn hoá lại, đây chỉ để hiện và gõ cho đúng. */

export type DangGiay = "to" | "cuon";

export const DANG_GIAY_NHAN: Record<DangGiay, string> = { to: "Tờ", cuon: "Cuộn" };

/** Hai cạnh mm → (cạnh ngắn, cạnh dài). Thiếu cạnh = 0; một cạnh ⇒ (cạnh, 0). */
export function chuanKho(a: unknown, b: unknown): [number, number] {
  const mm = (x: unknown) => {
    const v = Math.round(Number(x));
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const x = mm(a);
  const y = mm(b);
  if (x && y) return [Math.min(x, y), Math.max(x, y)];
  return [x || y, 0];
}

/** "780 × 905 mm" · cuộn "khổ 1000 mm" · không có ⇒ "chưa có khổ". */
export function nhanKho(khoRong: number | null | undefined, khoDai: number | null | undefined): string {
  const r = khoRong ?? 0;
  const d = khoDai ?? 0;
  if (r && d) return `${r} × ${d} mm`;
  if (r) return `khổ ${r} mm`;
  return "chưa có khổ";
}

/** Dòng giấy: "Tờ · 780 × 905 mm" / "Cuộn · khổ 1000 mm". Hàng khác (không có dạng) ⇒ chuỗi rỗng. */
export function nhanDangKho(
  dang: string | null | undefined,
  khoRong: number | null | undefined,
  khoDai: number | null | undefined,
): string {
  if (dang !== "to" && dang !== "cuon") return "";
  return `${DANG_GIAY_NHAN[dang]} · ${nhanKho(khoRong, khoDai)}`;
}
