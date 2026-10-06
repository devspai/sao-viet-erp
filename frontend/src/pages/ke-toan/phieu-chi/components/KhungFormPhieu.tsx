/** Khung form của ba form lập phiếu chi (đặc tả PC-3, PC-4, PC-5) — khuôn chung nằm ở
 *  `shared/KhungFormPhieu.tsx` (Phiếu thu dùng cùng khuôn). Ở đây chỉ còn phần RIÊNG phiếu chi:
 *  kiểu ghi ô (`DatO`), lỗi ô Ngày chi và chữ nút mặc định "Lập phiếu chi". Thứ tự ô: `THU_TU_O_MOI`
 *  ở `KhoiPhieuChi.tsx`.
 */
import type { ComponentProps } from "react";

import type { PaymentVoucherBaseInput } from "../../../../api/client";
import { KhungFormPhieu as KhungChung, loiNgayPhieu } from "../../shared/KhungFormPhieu";

export { OF, OTienPhieu, idO, nhayToiLoi, type LoiForm } from "../../shared/KhungFormPhieu";

/** Ghi một ô của phiếu — ba form cùng một hình dạng dữ liệu (`PaymentVoucherBaseInput`). */
export type DatO = <K extends keyof PaymentVoucherBaseInput>(khoa: K, giaTri: PaymentVoucherBaseInput[K]) => void;

/** Lỗi của ô Ngày chi: bắt buộc, không sau hôm nay (giờ Việt Nam, tính lúc bấm). */
export function loiNgayChi(v: string | null | undefined): string | undefined {
  return loiNgayPhieu(v, "Ngày chi");
}

/** Vỏ form phiếu chi: nút chính mặc định "Lập phiếu chi". */
export function KhungFormPhieu(
  props: Omit<ComponentProps<typeof KhungChung>, "nhanNut"> & { nhanNut?: string },
) {
  return <KhungChung {...props} nhanNut={props.nhanNut ?? "Lập phiếu chi"} />;
}
