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

/** Dòng giấy: "Tờ 780 × 905 mm" / "Cuộn khổ 1000 mm" — đọc liền như một cụm, không chen dấu `·`.
 *  Hàng khác (không có dạng) ⇒ chuỗi rỗng. */
export function nhanDangKho(
  dang: string | null | undefined,
  khoRong: number | null | undefined,
  khoDai: number | null | undefined,
): string {
  if (dang !== "to" && dang !== "cuon") return "";
  return `${DANG_GIAY_NHAN[dang]} ${nhanKho(khoRong, khoDai)}`;
}

/** Khoá DÒNG TỒN dạng chuỗi — phản chiếu `khoa_ton_cua` (backend): giấy tờ `giay:id:rộng:dài`, giấy
 *  cuộn `giay:id:0:0` (gom theo mã), hàng khác hoặc giấy cũ chưa có dạng `loai:id`. */
export function khoaTon(x: {
  hang_loai: string;
  hang_id: number;
  dang_giay?: string | null;
  kho_rong?: number | null;
  kho_dai?: number | null;
}): string {
  if (x.hang_loai !== "giay" || (x.dang_giay !== "to" && x.dang_giay !== "cuon")) {
    return `${x.hang_loai}:${x.hang_id}`;
  }
  if (x.dang_giay === "cuon") return `giay:${x.hang_id}:0:0`;
  const [r, d] = chuanKho(x.kho_rong, x.kho_dai);
  return `giay:${x.hang_id}:${r}:${d}`;
}

/** Khoá dòng tồn của một NGƯỠNG: giấy luôn kèm khổ (cuộn = 0:0), hàng khác `loai:id`. */
export function khoaNguong(t: { hang_loai: string; hang_id: number; kho_rong?: number; kho_dai?: number }): string {
  if (t.hang_loai !== "giay") return `${t.hang_loai}:${t.hang_id}`;
  return `giay:${t.hang_id}:${t.kho_rong ?? 0}:${t.kho_dai ?? 0}`;
}

/** Nhãn dòng tồn giấy cạnh tên: tờ "780 × 905 mm"; cuộn "cuộn" (kèm khổ các lô nếu có:
 *  "cuộn · khổ 790 mm" / "cuộn · khổ 790, 1090 mm"). `laGiay` + chưa có dạng ⇒ "chưa rõ dạng/khổ"
 *  (lô nhập trước khi có dạng, đang đếm theo đơn vị của mã). Hàng khác ⇒ "". */
export function nhanDongTon(
  dang: string | null | undefined,
  khoRong: number,
  khoDai: number,
  opts?: { laGiay?: boolean; khoCuon?: number[] },
): string {
  if (dang === "to") return nhanKho(khoRong, khoDai);
  if (dang === "cuon") {
    const kho = [...new Set((opts?.khoCuon ?? []).filter((k) => k > 0))].sort((a, b) => a - b);
    return kho.length ? `cuộn · khổ ${kho.join(", ")} mm` : "cuộn";
  }
  return opts?.laGiay ? "chưa rõ dạng/khổ" : "";
}
