/** Kỳ của các màn BÁO CÁO trên thanh lọc chung (06/10/2026).
 *
 *  Khác danh sách chứng từ ở MỘT chỗ: kỳ mặc định giữ đúng như báo cáo vẫn mở trước nay (thường là
 *  "Tháng này"), không phải "Tất cả". Nên URL phải ghi được cả `ky=tat_ca` (người dùng chủ động
 *  chọn mọi thời gian) và bỏ khoá khi kỳ đang là mặc định của báo cáo. Hàm thuần, không React.
 */
import type { GiaTriUrl } from "../ke-toan/shared/urlMan";
import { kyLenUrl, kyTuUrl, type KyDS, type LoaiKyDS } from "./ky-danh-sach";

/** Kỳ báo cáo từ URL; không có khoá `ky` ⇒ kỳ mặc định của báo cáo. */
export function kyBaoCaoTuUrl(
  p: URLSearchParams,
  mocHopLe: string[],
  mocMacDinh: string,
  loaiMacDinh: LoaiKyDS,
): KyDS {
  const ky = kyTuUrl(p, mocHopLe, mocMacDinh);
  return p.get("ky") == null ? { loai: loaiMacDinh, moc: ky.moc } : ky;
}

/** Khoá URL của kỳ báo cáo — kỳ mặc định thì bỏ khoá, "Tất cả" thì ghi rõ `ky=tat_ca`. */
export function kyBaoCaoLenUrl(ky: KyDS, mocMacDinh: string, loaiMacDinh: LoaiKyDS): GiaTriUrl {
  return { ...kyLenUrl(ky, mocMacDinh), ky: ky.loai === loaiMacDinh ? undefined : ky.loai };
}
