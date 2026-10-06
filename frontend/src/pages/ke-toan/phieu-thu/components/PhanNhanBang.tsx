/** Nhóm "Nhận bằng" của form phiếu thu (đặc tả PT-3, PT-4): hai thẻ Tiền mặt / Chuyển khoản; chuyển
 *  khoản thì thêm "Vào tài khoản" * và "Mã giao dịch ngân hàng" *. Dùng chung form thu khác và form
 *  sửa phiếu thu lại tiền đã chi.
 *
 *  Kiểu mới (`gon`, 06/10/2026): ô ngày (`oNgay`) và "Nhận bằng" (hai nút trong một khung) đứng cùng
 *  hàng; chuyển khoản thêm "Tài khoản nhận" rộng hết hàng (gợi ý chủ tài khoản) và "Mã giao dịch".
 */
import type { ReactNode } from "react";

import type { CompanyBankAccountRow, PaymentReceiptInput, PaymentVoucherType } from "../../../../api/client";
import { ChonCach, OF, idO, type LoiForm } from "../../shared/KhungFormPhieu";

export type DatOThu = <K extends keyof PaymentReceiptInput>(key: K, value: PaymentReceiptInput[K]) => void;

/** Thứ tự ô của form kiểu mới (khối Tiền thu → Người nộp) — con trỏ nhảy tới ô sai đầu tiên. */
export const THU_TU_O_THU_MOI = [
  "amount", "exchange_rate", "receipt_date", "company_bank_account_id", "bank_reference", "payer_name", "content",
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
  gon,
  oNgay,
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
  /** Hai nút chọn gọn thay hai thẻ to (form chia đôi có bản xem trước). */
  gon?: boolean;
  /** Kiểu mới: ô ngày đứng cùng hàng với "Nhận bằng". */
  oNgay?: ReactNode;
}) {
  const isBank = form.receipt_method === "bank_transfer";
  const khongCo = !dangTai && !loiTai && taiKhoan.length === 0;
  const tkChon = taiKhoan.find((t) => t.id === form.company_bank_account_id);
  const chonCach = (
    <ChonCach giaTri={form.receipt_method} onDoi={onDoiCach} khoa="receipt_method" nhan="Nhận bằng"
      giaiTienMat="Thủ quỹ nhận rồi in phiếu thu" giaiChuyenKhoan="Cần mã giao dịch ngân hàng" gon={gon} />
  );
  return (
    <>
      {gon ? (
        <div className="kt-f__hang">
          {oNgay}
          <div className="kt-o">
            <span className="kt-o__nhan">Nhận bằng</span>
            {chonCach}
          </div>
        </div>
      ) : (
        chonCach
      )}
      {isBank && (
        <>
          <div className="kt-f__hang">
            <OF khoa="company_bank_account_id" nhan={gon ? "Tài khoản nhận" : "Vào tài khoản"} batBuoc rong
              loi={loi.company_bank_account_id}
              goi={loiTai ?? (dangTai ? "Đang tải tài khoản công ty…" : gon && tkChon ? `Chủ tài khoản ${tkChon.account_holder}` : undefined)}>
              <select id={idO("company_bank_account_id")} value={form.company_bank_account_id ?? ""}
                disabled={dangTai || taiKhoan.length === 0}
                aria-invalid={loi.company_bank_account_id ? true : undefined}
                onChange={(e) => set("company_bank_account_id", e.target.value ? Number(e.target.value) : null)}>
                <option value="">Chọn tài khoản công ty</option>
                {taiKhoan.map((t) => (
                  <option key={t.id} value={t.id}>
                    {gon
                      ? `${t.account_number} tại ${t.bank_name}${t.bank_branch ? ` ${t.bank_branch}` : ""}`
                      : `${t.bank_name} ${t.account_number}${t.currency !== "VND" ? ` (${t.currency})` : ""}`}
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
            <OF khoa="bank_reference" nhan={gon ? "Mã giao dịch" : "Mã giao dịch ngân hàng"} batBuoc rong={gon}
              loi={loi.bank_reference}
              goi={gon ? "In lên phiếu, dùng để đối chiếu sao kê" : "Số tham chiếu trên sao kê hoặc số báo có."}>
              <input id={idO("bank_reference")} maxLength={64} value={form.bank_reference ?? ""}
                placeholder={gon ? "Mã trên sao kê hoặc tin nhắn báo có" : undefined}
                aria-invalid={loi.bank_reference ? true : undefined}
                onChange={(e) => set("bank_reference", e.target.value)} />
            </OF>
          </div>
        </>
      )}
    </>
  );
}
