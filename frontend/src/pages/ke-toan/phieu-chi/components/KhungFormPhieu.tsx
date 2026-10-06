/** Khung form của ba form lập phiếu chi (đặc tả PC-3, PC-4, PC-5) — khuôn chung nằm ở
 *  `shared/KhungFormPhieu.tsx` (Phiếu thu dùng cùng khuôn). Ở đây chỉ còn phần RIÊNG phiếu chi:
 *  kiểu ghi ô (`DatO`), thứ tự ô, ô Ngày chi và chữ nút mặc định "Lập phiếu chi".
 */
import type { ComponentProps } from "react";

import type { PaymentVoucherBaseInput } from "../../../../api/client";
import { KhungFormPhieu as KhungChung, ONgayPhieu, loiNgayPhieu } from "../../shared/KhungFormPhieu";

export { OF, OTienPhieu, ThemChiTiet, idO, nhayToiLoi, type LoiForm } from "../../shared/KhungFormPhieu";

/** Ghi một ô của phiếu — ba form cùng một hình dạng dữ liệu (`PaymentVoucherBaseInput`). */
export type DatO = <K extends keyof PaymentVoucherBaseInput>(khoa: K, giaTri: PaymentVoucherBaseInput[K]) => void;

/** Thứ tự ô trên form — con trỏ nhảy tới ô sai ĐẦU TIÊN theo đúng thứ tự mắt đọc. */
export const THU_TU_O = [
  "delivery_id",
  "cash_recipient_name",
  "amount",
  "currency",
  "exchange_rate",
  "content",
  "voucher_type",
  "company_bank_account_id",
  "beneficiary_account_holder",
  "beneficiary_account_number",
  "beneficiary_bank_name",
  "voucher_date",
  "chung_tu",
];

/** Lỗi của ô Ngày chi: bắt buộc, không sau hôm nay (giờ Việt Nam, tính lúc bấm). */
export function loiNgayChi(v: string | null | undefined): string | undefined {
  return loiNgayPhieu(v, "Ngày chi");
}

/** Ô Ngày chi — mặc định hôm nay, trần là hôm nay theo giờ Việt Nam TÍNH LÚC VẼ (đặc tả A.14). */
export function ONgayChi({ value, onChange, loi }: { value: string; onChange: (v: string) => void; loi?: string }) {
  return (
    <ONgayPhieu khoa="voucher_date" nhan="Ngày chi" goi="Ngày tiền thật sự rời quỹ. Không chọn ngày sau hôm nay."
      value={value} onChange={onChange} loi={loi} />
  );
}

/** Vỏ form phiếu chi: nút chính mặc định "Lập phiếu chi". */
export function KhungFormPhieu(
  props: Omit<ComponentProps<typeof KhungChung>, "nhanNut"> & { nhanNut?: string },
) {
  return <KhungChung {...props} nhanNut={props.nhanNut ?? "Lập phiếu chi"} />;
}
