/** Kỳ của các màn Kế toán trên thanh lọc chung `ThanhLoc` (06/10/2026 — thay thanh `ChonKy` cũ).
 *
 *  - Kỳ ghi lên URL cùng khoá cũ (`ky`, `tu`, `den`) + `moc` khi mốc khác mặc định; nhớ theo màn.
 *  - Sổ tổng hợp (công nợ, thu/chi qua tài khoản) cần một khoảng ngày thật: "Tất cả" = từ ngày đầu
 *    sổ tới hôm nay (`khoangSo`).
 *  - So cùng kỳ năm trước tự bật khi kỳ có khoảng ngày; cuối kỳ chặn ở hôm nay để hai bên cùng số
 *    ngày ("Tháng này" là trọn tháng trên thanh lọc, mà tháng này chưa hết).
 */
import { homNayVN, luiNam, type KyXem } from "../../../utils/ky";
import { khoangKy, kyLenUrl, kyTuUrl, type KyDS, type LoaiKyDS } from "../../thanh-loc/ky-danh-sach";
import { useLocMan } from "../../thanh-loc/useLocMan";
import type { GiaTriUrl } from "./urlMan";

/** Ngày đầu sổ — mốc "từ" của kỳ "Tất cả" ở sổ tổng hợp. */
export const NGAY_DAU_SO = "2000-01-01";

/** Khoảng ngày của kỳ cho sổ tổng hợp: "Tất cả" (hoặc Tuỳ chọn chưa đủ) = từ đầu sổ tới hôm nay. */
export function khoangSo(ky: KyDS, homNay: string = homNayVN()): KyXem {
  return khoangKy(ky, homNay) ?? { tu: NGAY_DAU_SO, den: homNay };
}

/** Cùng kỳ năm trước; kỳ "Tất cả" (không có khoảng) thì không so. */
export function cungKyCua(ky: KyDS, homNay: string = homNayVN()): KyXem | null {
  const k = khoangKy(ky, homNay);
  if (!k) return null;
  const den = k.den > homNay ? homNay : k.den;
  if (k.tu > den) return null;
  return { tu: luiNam(k.tu), den: luiNam(den) };
}

/** Kỳ "Tuỳ chọn" đúng một khoảng ngày — để gọi cùng endpoint cho số cùng kỳ. */
export const kyTheoKhoang = (k: KyXem, moc: string): KyDS => ({ loai: "tuy", tu: k.tu, den: k.den, moc });

/** Kỳ từ URL. Không có khoá `ky` ⇒ kỳ mặc định của màn (màn sổ tổng hợp mặc định "Tháng này"). */
export function kyKeToanTuUrl(p: URLSearchParams, moc: [string, string][], mocMacDinh: string, loaiMacDinh: LoaiKyDS): KyDS {
  const ky = kyTuUrl(p, moc.map(([m]) => m), mocMacDinh);
  return p.get("ky") ? ky : { ...ky, loai: loaiMacDinh };
}

/** Kỳ lên URL — kỳ mặc định của màn thì bỏ khoá `ky`. */
export function kyKeToanLenUrl(ky: KyDS, mocMacDinh: string, loaiMacDinh: LoaiKyDS): GiaTriUrl {
  return { ...kyLenUrl(ky, mocMacDinh), ky: ky.loai === loaiMacDinh ? undefined : ky.loai };
}

/** Kỳ của một màn Kế toán: đọc / ghi URL `?man=` và nhớ theo màn trong phiên trang. */
export function useKyKeToan(
  man: string,
  moc: [string, string][],
  mocMacDinh: string,
  loaiMacDinh: LoaiKyDS = "tat_ca",
): [KyDS, (k: KyDS) => void] {
  return useLocMan<KyDS>(
    man,
    { loai: loaiMacDinh, moc: mocMacDinh },
    (p) => kyKeToanTuUrl(p, moc, mocMacDinh, loaiMacDinh),
    (k) => kyKeToanLenUrl(k, mocMacDinh, loaiMacDinh),
  );
}
