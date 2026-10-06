/** Nhóm "Nhận bằng" của form phiếu thu (đặc tả PT-3, PT-4): hai thẻ Tiền mặt / Chuyển khoản; chuyển
 *  khoản thì thêm "Vào tài khoản" * và "Mã giao dịch ngân hàng" *. Dùng chung form thu khác và form
 *  sửa phiếu thu lại tiền đã chi.
 */
import type { CompanyBankAccountRow, PaymentReceiptInput, PaymentVoucherType } from "../../../../api/client";
import { ChonCach, OF, idO, type LoiForm } from "../../shared/KhungFormPhieu";

export type DatOThu = <K extends keyof PaymentReceiptInput>(key: K, value: PaymentReceiptInput[K]) => void;

/** Thứ tự ô trên form — con trỏ nhảy tới ô sai đầu tiên theo đúng thứ tự này. */
export const THU_TU_O_THU = [
  "payer_name", "amount", "exchange_rate", "content", "company_bank_account_id", "bank_reference", "receipt_date",
];

export function PhanNhanBang({
  form,
  set,
  loi,
  onDoiCach,
  taiKhoan,
  dangTai,
  loiTai,
  tienTe,
  onMoTaiKhoan,
  nutThemTaiKhoan = false,
}: {
  form: PaymentReceiptInput;
  set: DatOThu;
  loi: LoiForm;
  onDoiCach: (v: PaymentVoucherType) => void;
  taiKhoan: CompanyBankAccountRow[];
  dangTai: boolean;
  loiTai: string | null;
  /** Loại tiền của phiếu — tài khoản nhận phải cùng loại tiền. */
  tienTe: string;
  onMoTaiKhoan?: () => void;
  /** Không có tài khoản thì câu giải thích kèm nút "Thêm tài khoản" (khung Thu tiền của Công nợ phải
   *  thu, đặc tả NPTh-3) thay cho "thêm ở Tài khoản ngân hàng". */
  nutThemTaiKhoan?: boolean;
}) {
  const isBank = form.receipt_method === "bank_transfer";
  const khongCo = !dangTai && !loiTai && taiKhoan.length === 0;
  return (
    <>
      <ChonCach giaTri={form.receipt_method} onDoi={onDoiCach} khoa="receipt_method" nhan="Nhận bằng"
        giaiTienMat="Thủ quỹ nhận rồi in phiếu thu" giaiChuyenKhoan="Cần mã giao dịch ngân hàng" />
      {isBank && (
        <>
          <div className="kt-f__hang">
            <OF khoa="company_bank_account_id" nhan="Vào tài khoản" batBuoc rong loi={loi.company_bank_account_id}
              goi={loiTai ?? (dangTai ? "Đang tải tài khoản công ty…" : undefined)}>
              <select id={idO("company_bank_account_id")} value={form.company_bank_account_id ?? ""}
                disabled={dangTai || taiKhoan.length === 0}
                aria-invalid={loi.company_bank_account_id ? true : undefined}
                onChange={(e) => set("company_bank_account_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Chọn tài khoản công ty</option>
                {taiKhoan.map((t) => (
                  <option key={t.id} value={t.id}>
                    {`${t.bank_name} ${t.account_number}${t.currency !== "VND" ? ` (${t.currency})` : ""}`}
                  </option>
                ))}
              </select>
            </OF>
          </div>
          {khongCo && nutThemTaiKhoan && (
            <p className="kt-canh" role="status">
              {`Chưa có tài khoản công ty nhận tiền ${tienTe} nên chưa chọn được tài khoản nhận. `}
              {onMoTaiKhoan && (
                <button type="button" className="kt-lk" onClick={onMoTaiKhoan}>Thêm tài khoản</button>
              )}
            </p>
          )}
          {khongCo && !nutThemTaiKhoan && (
            <p className="kt-canh" role="status">
              {`Chưa có tài khoản công ty nhận tiền ${tienTe} — thêm ở `}
              {onMoTaiKhoan ? (
                <button type="button" className="kt-lk" onClick={onMoTaiKhoan}>Tài khoản ngân hàng</button>
              ) : (
                "Tài khoản ngân hàng"
              )}
            </p>
          )}
          <div className="kt-f__hang">
            <OF khoa="bank_reference" nhan="Mã giao dịch ngân hàng" batBuoc loi={loi.bank_reference}
              goi="Số tham chiếu trên sao kê hoặc số báo có.">
              <input id={idO("bank_reference")} maxLength={64} value={form.bank_reference ?? ""}
                aria-invalid={loi.bank_reference ? true : undefined}
                onChange={(e) => set("bank_reference", e.target.value)} />
            </OF>
          </div>
        </>
      )}
    </>
  );
}
