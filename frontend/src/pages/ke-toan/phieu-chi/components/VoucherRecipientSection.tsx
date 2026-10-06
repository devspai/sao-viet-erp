/** Phần "TRẢ BẰNG" sau hai thẻ Tiền mặt / Chuyển khoản (đặc tả PC-3, dùng chung ba form):
 *  - Tiền mặt: (form theo đơn mua) ô Người nhận tiền, rồi "Địa chỉ người nhận" + "Giấy tờ (CCCD)"
 *    gấp trong "Thêm thông tin người nhận".
 *  - Chuyển khoản: "Trả từ tài khoản" * (chỉ tài khoản công ty đang dùng để chi) + khối tài khoản
 *    người nhận (Chủ tài khoản *, Số tài khoản *, Ngân hàng *, Chi nhánh).
 *
 *  Ô "Bên chịu phí" ĐÃ GỠ từ 27/08/2026 (không in, không tính); cột `bank_fee_bearer` vẫn gửi mặc
 *  định "payer" ở từng form. Cần lại thì mở một ô chọn payer / beneficiary / shared.
 */
import { useState } from "react";

import type { CompanyBankAccountRow, PaymentVoucherBaseInput } from "../../../../api/client";
import { optional } from "../shared/helpers";
import { idO, OF, ThemChiTiet, type DatO, type LoiForm } from "./KhungFormPhieu";

/** Lỗi của khối chuyển khoản — cùng một luật cho ba form. */
export function loiChuyenKhoan(form: PaymentVoucherBaseInput): LoiForm {
  if (form.voucher_type !== "bank_transfer") return {};
  const loi: LoiForm = {};
  if (!form.company_bank_account_id) loi.company_bank_account_id = "Chọn tài khoản công ty dùng để chi.";
  if (!optional(form.beneficiary_account_holder)) loi.beneficiary_account_holder = "Ghi chủ tài khoản người nhận.";
  if (!optional(form.beneficiary_account_number)) loi.beneficiary_account_number = "Ghi số tài khoản người nhận.";
  if (!optional(form.beneficiary_bank_name)) loi.beneficiary_bank_name = "Ghi ngân hàng của người nhận.";
  return loi;
}

export function VoucherRecipientSection({
  form,
  set,
  loi,
  taiKhoan,
  dangTai,
  loiTai,
  chonTaiKhoan,
  coNguoiNhanMat = false,
  onMoTaiKhoan,
}: {
  form: PaymentVoucherBaseInput;
  set: DatO;
  loi: LoiForm;
  taiKhoan: CompanyBankAccountRow[];
  dangTai: boolean;
  /** Không đọc được danh sách tài khoản (thiếu quyền, mất mạng). */
  loiTai?: string | null;
  chonTaiKhoan: (value: string) => void;
  /** Form theo đơn mua: tên người nhận tiền mặt nằm ở đây (tiêu đề ngăn đã là nhà cung cấp). */
  coNguoiNhanMat?: boolean;
  /** Mở màn Tài khoản ngân hàng (khi chưa có tài khoản để chi). Không truyền thì chỉ có chữ. */
  onMoTaiKhoan?: () => void;
}) {
  const [moThem, setMoThem] = useState(
    () => !!(optional(form.cash_recipient_address) || optional(form.cash_recipient_identity)),
  );

  if (form.voucher_type === "cash") {
    return (
      <>
        {coNguoiNhanMat && (
          <div className="kt-f__hang">
            <OF khoa="cash_recipient_name" nhan="Người nhận tiền" batBuoc loi={loi.cash_recipient_name}
              goi="Người ký nhận trên phiếu chi.">
              <input id={idO("cash_recipient_name")} value={form.cash_recipient_name ?? ""}
                aria-invalid={loi.cash_recipient_name ? true : undefined}
                onChange={(e) => set("cash_recipient_name", e.target.value)} />
            </OF>
          </div>
        )}
        <ThemChiTiet nhan="Thêm thông tin người nhận" tieu="Thông tin người nhận" cacO={["Địa chỉ", "Giấy tờ"]}
          mo={moThem} onMo={() => setMoThem(true)}>
          <div className="kt-f__hang">
            <OF khoa="cash_recipient_address" nhan="Địa chỉ người nhận">
              <input id={idO("cash_recipient_address")} value={form.cash_recipient_address ?? ""}
                onChange={(e) => set("cash_recipient_address", e.target.value)} />
            </OF>
            <OF khoa="cash_recipient_identity" nhan="Giấy tờ (CCCD)">
              <input id={idO("cash_recipient_identity")} value={form.cash_recipient_identity ?? ""}
                onChange={(e) => set("cash_recipient_identity", e.target.value)} />
            </OF>
          </div>
        </ThemChiTiet>
      </>
    );
  }

  const khongCo = !dangTai && !loiTai && taiKhoan.length === 0;
  return (
    <>
      <div className="kt-f__hang">
        <OF khoa="company_bank_account_id" nhan="Trả từ tài khoản" batBuoc rong loi={loi.company_bank_account_id}
          goi={loiTai ?? (dangTai ? "Đang tải tài khoản công ty…" : undefined)}>
          <select id={idO("company_bank_account_id")} value={form.company_bank_account_id ?? ""}
            disabled={dangTai || taiKhoan.length === 0}
            aria-invalid={loi.company_bank_account_id ? true : undefined}
            onChange={(e) => chonTaiKhoan(e.target.value)}>
            <option value="">Chọn tài khoản công ty</option>
            {taiKhoan.map((t) => (
              <option key={t.id} value={t.id}>
                {`${t.bank_name} ${t.account_number}${t.currency !== "VND" ? ` (${t.currency})` : ""}`}
              </option>
            ))}
          </select>
        </OF>
      </div>
      {khongCo && (
        <p className="kt-canh" role="status">
          Chưa có tài khoản công ty dùng để chi — thêm ở{" "}
          {onMoTaiKhoan ? (
            <button type="button" className="kt-lk" onClick={onMoTaiKhoan}>Tài khoản ngân hàng</button>
          ) : (
            "Tài khoản ngân hàng"
          )}
        </p>
      )}
      <div className="kt-f__tieu">Tài khoản người nhận</div>
      <div className="kt-f__hang">
        <OF khoa="beneficiary_account_holder" nhan="Chủ tài khoản" batBuoc loi={loi.beneficiary_account_holder}>
          <input id={idO("beneficiary_account_holder")} value={form.beneficiary_account_holder ?? ""}
            aria-invalid={loi.beneficiary_account_holder ? true : undefined}
            onChange={(e) => set("beneficiary_account_holder", e.target.value)} />
        </OF>
        <OF khoa="beneficiary_account_number" nhan="Số tài khoản" batBuoc loi={loi.beneficiary_account_number}>
          <input id={idO("beneficiary_account_number")} inputMode="numeric" value={form.beneficiary_account_number ?? ""}
            aria-invalid={loi.beneficiary_account_number ? true : undefined}
            onChange={(e) => set("beneficiary_account_number", e.target.value)} />
        </OF>
        <OF khoa="beneficiary_bank_name" nhan="Ngân hàng" batBuoc loi={loi.beneficiary_bank_name}>
          <input id={idO("beneficiary_bank_name")} value={form.beneficiary_bank_name ?? ""}
            aria-invalid={loi.beneficiary_bank_name ? true : undefined}
            onChange={(e) => set("beneficiary_bank_name", e.target.value)} />
        </OF>
        <OF khoa="beneficiary_bank_branch" nhan="Chi nhánh" goi="Không bắt buộc.">
          <input id={idO("beneficiary_bank_branch")} value={form.beneficiary_bank_branch ?? ""}
            onChange={(e) => set("beneficiary_bank_branch", e.target.value)} />
        </OF>
      </div>
    </>
  );
}
