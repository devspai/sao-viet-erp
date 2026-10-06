/** Các ô gấp trong "Thêm chi tiết" của form lập phiếu chi (đặc tả PC-3, PC-4): Số hoá đơn, Ngày
 *  hoá đơn, Số hợp đồng (chỉ form theo đơn mua), Ghi chú. Chứng từ đính kèm do form tự đặt sau
 *  khối này (`VoucherAttachSection`).
 *
 *  Khối "Định khoản" Nợ / Có ĐÃ BỎ (12/08 và 15/08/2026): hệ không hạch toán gì từ hai ô đó. Cột
 *  `debit_account` / `credit_account` GIỮ trong DB để phiếu cũ in lại vẫn đúng.
 */
import type { PaymentVoucherBaseInput } from "../../../../api/client";
import { homNayVN } from "../../../../utils/ky";
import { optional } from "../shared/helpers";
import { idO, OF, type DatO } from "./KhungFormPhieu";

/** Tên các ô đang gấp — hiện thành thẻ nhỏ trên nút "Thêm chi tiết". */
export function cacOChiTiet(coHopDong: boolean): string[] {
  return ["Số hoá đơn", "Ngày hoá đơn", ...(coHopDong ? ["Số hợp đồng"] : []), "Ghi chú", "Chứng từ đính kèm"];
}

/** Đã gõ gì vào nhóm gấp chưa — có thì mở sẵn, đừng giấu chữ người ta đã gõ. */
export function coChiTiet(form: PaymentVoucherBaseInput): boolean {
  return !!(optional(form.invoice_number) || form.invoice_date || optional(form.contract_number) || optional(form.note));
}

export function VoucherRefSection({
  form,
  set,
  coHopDong,
}: {
  form: PaymentVoucherBaseInput;
  set: DatO;
  coHopDong: boolean;
}) {
  return (
    <>
      <div className="kt-f__hang">
        <OF khoa="invoice_number" nhan="Số hoá đơn">
          <input id={idO("invoice_number")} value={form.invoice_number ?? ""}
            onChange={(e) => set("invoice_number", e.target.value)} />
        </OF>
        <OF khoa="invoice_date" nhan="Ngày hoá đơn" ngay>
          <input id={idO("invoice_date")} type="date" max={homNayVN()} value={form.invoice_date ?? ""}
            onChange={(e) => set("invoice_date", e.target.value || null)} />
        </OF>
        {coHopDong && (
          <OF khoa="contract_number" nhan="Số hợp đồng">
            <input id={idO("contract_number")} value={form.contract_number ?? ""}
              onChange={(e) => set("contract_number", e.target.value)} />
          </OF>
        )}
      </div>
      <OF khoa="note" nhan="Ghi chú" rong>
        <textarea id={idO("note")} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
      </OF>
    </>
  );
}
