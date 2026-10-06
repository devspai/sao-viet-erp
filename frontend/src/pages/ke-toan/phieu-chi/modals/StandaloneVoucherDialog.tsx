// Form LẬP PHIẾU CHI RỜI — khoản chi không gắn đơn mua hàng (đặc tả PC-3).
// Thứ tự theo cách người ta nghĩ: chi cho ai → bao nhiêu → vì sao → trả bằng gì → khi nào.
// Vỏ `NganPhai` (cùng độ rộng mọi ngăn); lỗi tại ô, con trỏ nhảy tới ô sai đầu tiên; gõ dở thì
// Esc / Đóng hỏi trước. `payload` gửi lên giữ nguyên bản cũ (source_type "other", không đợt, không
// đơn); thêm chứng từ đính kèm tải lên ngay sau khi lập.
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  type CompanyBankAccountRow,
  type PaymentVoucherInput,
  type PaymentVoucherRow,
  type PaymentVoucherType,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { amountInWords } from "../../../../utils/format";
import { tien } from "../../shared/dinhDang";
import { KhungFormPhieu, OF, OTienPhieu, THU_TU_O, ThemChiTiet, idO, loiNgayChi, nhayToiLoi, ONgayChi, type DatO, type LoiForm } from "../components/KhungFormPhieu";
import { taiChungTuSauKhiLap, VoucherAttachSection } from "../components/VoucherAttachSection";
import { loiChuyenKhoan, VoucherRecipientSection } from "../components/VoucherRecipientSection";
import { cacOChiTiet, VoucherRefSection } from "../components/VoucherRefSection";
import { ChonCachTra } from "../components/VoucherSegments";
import { isoToday, optional } from "../shared/helpers";
import "../../ke-toan.css";

export function StandaloneVoucherDialog({
  onClose,
  onSaved,
  onMoTaiKhoan,
}: {
  onClose: () => void;
  onSaved: (voucher: PaymentVoucherRow) => void;
  onMoTaiKhoan?: () => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<PaymentVoucherInput>(() => ({
    source_type: "other",
    voucher_type: "cash",
    payment_stage: "other",
    voucher_date: isoToday(),
    amount: 0,
    currency: "VND",
    exchange_rate: 1,
    content: "",
    cash_recipient_name: "",
    cash_recipient_address: null,
    cash_recipient_identity: null,
    company_bank_account_id: null,
    beneficiary_account_holder: null,
    beneficiary_account_number: null,
    beneficiary_bank_name: null,
    beneficiary_bank_branch: null,
    bank_fee_bearer: "payer",
    debit_account: null,
    credit_account: null,
    note: null,
  }));
  const goc = useRef(JSON.stringify(form));
  const [companyAccounts, setCompanyAccounts] = useState<CompanyBankAccountRow[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loiTaiKhoan, setLoiTaiKhoan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loi, setLoi] = useState<LoiForm>({});
  const [moChiTiet, setMoChiTiet] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loiTep, setLoiTep] = useState<string | null>(null);
  const [daLap, setDaLap] = useState<PaymentVoucherRow | null>(null);
  const isBank = form.voucher_type === "bank_transfer";

  useEffect(() => {
    if (!token) return;
    setLoadingAccounts(true);
    api.accounting
      .companyAccounts(token, true, "pay")
      .then((accounts) => setCompanyAccounts(accounts))
      .catch(() => setLoiTaiKhoan("Không tải được danh sách tài khoản ngân hàng."))
      .finally(() => setLoadingAccounts(false));
  }, [token]);

  const set: DatO = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLoi((l) => (l[key] ? { ...l, [key]: undefined } : l));
  };

  function chonCach(type: PaymentVoucherType) {
    setForm((current) => ({
      ...current,
      voucher_type: type,
      company_bank_account_id: type === "cash" ? null : current.company_bank_account_id,
      // Chuyển khoản: chủ tài khoản người nhận thường chính là người nhận đã gõ ở trên.
      beneficiary_account_holder:
        type === "bank_transfer" && !optional(current.beneficiary_account_holder)
          ? current.cash_recipient_name ?? null
          : current.beneficiary_account_holder,
    }));
    setLoi({});
  }

  function kiemTra(): LoiForm {
    const l: LoiForm = {};
    if (!form.cash_recipient_name?.trim()) l.cash_recipient_name = "Ghi người hoặc đơn vị nhận tiền.";
    if (!Number.isFinite(form.amount) || form.amount <= 0) l.amount = "Số tiền chi phải lớn hơn 0.";
    if (!form.content.trim()) l.content = "Ghi nội dung chi.";
    const loiNgay = loiNgayChi(form.voucher_date);
    if (loiNgay) l.voucher_date = loiNgay;
    return { ...l, ...loiChuyenKhoan(form) };
  }

  async function submit() {
    if (!token || saving) return;
    if (daLap) {
      onSaved(daLap);
      return;
    }
    const l = kiemTra();
    setLoi(l);
    if (Object.values(l).some(Boolean)) {
      nhayToiLoi(l, THU_TU_O);
      return;
    }

    const payload: PaymentVoucherInput = {
      ...form,
      purchase_request_id: null,
      source_type: "other",
      voucher_type: form.voucher_type,
      payment_stage: "other",
      delivery_id: null,
      planned_payment_date: null,
      amount: Math.round(Number(form.amount)),
      currency: form.currency.trim().toUpperCase(),
      exchange_rate: Number(form.exchange_rate || 1),
      content: form.content.trim(),
      cash_recipient_name: (form.cash_recipient_name ?? "").trim(),
      cash_recipient_address: optional(form.cash_recipient_address),
      cash_recipient_identity: optional(form.cash_recipient_identity),
      company_bank_account_id: isBank ? form.company_bank_account_id ?? null : null,
      supplier_bank_account_id: null,
      beneficiary_account_holder: isBank ? optional(form.beneficiary_account_holder) : null,
      beneficiary_account_number: isBank ? optional(form.beneficiary_account_number) : null,
      beneficiary_bank_name: isBank ? optional(form.beneficiary_bank_name) : null,
      beneficiary_bank_branch: isBank ? optional(form.beneficiary_bank_branch) : null,
      bank_fee_bearer: isBank ? form.bank_fee_bearer ?? "payer" : null,
      debit_account: optional(form.debit_account),
      credit_account: optional(form.credit_account),
      invoice_number: optional(form.invoice_number),
      invoice_date: optional(form.invoice_date),
      contract_number: optional(form.contract_number),
      note: optional(form.note),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = await api.accounting.createVoucher(token, payload);
      if (files.length) {
        const hong = await taiChungTuSauKhiLap(token, saved, files);
        if (hong) {
          setDaLap(saved);
          setError(hong);
          return;
        }
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lập được phiếu chi.");
    } finally {
      setSaving(false);
    }
  }

  const ten = form.cash_recipient_name?.trim();
  return (
    <KhungFormPhieu
      duongDan="Phiếu chi > Lập mới"
      tieuDe="Lập phiếu chi"
      xemTruoc={
        daLap ? (
          <>Phiếu <b>{daLap.code}</b> đã lập.</>
        ) : form.amount > 0 ? (
          <>
            Chi <b>{tien(form.amount)}</b> {isBank ? "chuyển khoản" : "tiền mặt"}
            {ten ? <> cho <b>{ten}</b></> : null}. Lập xong không sửa được, chỉ hủy được.
          </>
        ) : (
          "Lập xong không sửa được, chỉ hủy được."
        )
      }
      dangLuu={saving}
      loiChung={error}
      onDong={onClose}
      chanDong={() => !daLap && (JSON.stringify(form) !== goc.current || files.length > 0)}
      onSubmit={() => void submit()}
      nhanNut={daLap ? "Mở phiếu đã lập" : undefined}
    >
      <div className="kt-f__muc">
        <div className="kt-f__tieu">Chi cho ai và bao nhiêu</div>
        <OF khoa="cash_recipient_name" nhan="Chi cho" batBuoc rong loi={loi.cash_recipient_name}
          goi="Người hoặc đơn vị nhận tiền.">
          <input id={idO("cash_recipient_name")} value={form.cash_recipient_name ?? ""}
            aria-invalid={loi.cash_recipient_name ? true : undefined}
            onChange={(e) => set("cash_recipient_name", e.target.value)} />
        </OF>
        <OF khoa="amount" nhan="Số tiền" batBuoc loi={loi.amount}
          goi={form.amount > 0 ? `${amountInWords(form.amount)}.` : undefined}>
          <OTienPhieu khoa="amount" value={form.amount} onChange={(v) => set("amount", v)} loi={!!loi.amount} />
        </OF>
        <OF khoa="content" nhan="Nội dung chi" batBuoc rong loi={loi.content}>
          <input id={idO("content")} value={form.content} placeholder="VD: Tiền điện tháng 9 xưởng in"
            aria-invalid={loi.content ? true : undefined}
            onChange={(e) => set("content", e.target.value)} />
        </OF>
      </div>

      <div className="kt-f__muc">
        <div className="kt-f__tieu">Trả bằng</div>
        <ChonCachTra giaTri={form.voucher_type} onDoi={chonCach} />
        <VoucherRecipientSection
          form={form}
          set={set}
          loi={loi}
          taiKhoan={companyAccounts}
          dangTai={loadingAccounts}
          loiTai={loiTaiKhoan}
          chonTaiKhoan={(v) => set("company_bank_account_id", v ? Number(v) : null)}
          onMoTaiKhoan={onMoTaiKhoan}
        />
      </div>

      <div className="kt-f__muc">
        <div className="kt-f__tieu">Khi nào</div>
        <ONgayChi value={form.voucher_date} onChange={(v) => set("voucher_date", v)} loi={loi.voucher_date} />
      </div>

      <ThemChiTiet cacO={cacOChiTiet(false)} mo={moChiTiet || files.length > 0} onMo={() => setMoChiTiet(true)}>
        <VoucherRefSection form={form} set={set} coHopDong={false} />
        <VoucherAttachSection files={files} setFiles={setFiles} loi={loiTep ?? undefined} onLoi={setLoiTep} />
      </ThemChiTiet>
    </KhungFormPhieu>
  );
}
