// Form lập/sửa PHIẾU THU LẠI TIỀN ĐÃ CHI của một phiếu chi (đặc tả PT-4). Đường mở từ Phiếu chi đã
// gỡ; form chỉ còn mở qua "Sửa" phiếu cũ chờ thu. Khung giống PT-3 (vỏ `NganPhai`, lỗi tại ô).
//
// ⚠️ TIỀN: `remainingVnd`, `amountVnd`, luật kiểm và `payload` giữ NGUYÊN bản cũ. Khác bản cũ:
//   - Mã giao dịch điền lại sẵn khi sửa (lỗi thật số 4) và gửi theo hình thức (tiền mặt ⇒ null).
//   - Số ngoại tệ + tỷ giá gõ được phần lẻ kiểu Việt Nam "12,5" (lỗi thật số 5). Cột `amount` của
//     phiếu thu vẫn là số NGUYÊN ở máy chủ, nên số ngoại tệ có phần lẻ bị chặn tại ô với câu nói rõ
//     (bản cũ `step=1` cũng chặn, chỉ là trình duyệt chặn không lời) — không làm tròn ngầm.
//   - Kiểm thêm tại ô: chuyển khoản phải có mã giao dịch (máy chủ vốn chặn), ngày thu không sau hôm nay.
import { useMemo, useRef, useState } from "react";
import {
  ApiError,
  api,
  type PaymentReceiptInput,
  type PaymentVoucherType,
} from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { amountInWords } from "../../../utils/format";
import { tien, vietSo } from "../shared/dinhDang";
import { KhungFormPhieu, OF, ONgayPhieu, OTienPhieu, idO, loiNgayPhieu, nhayToiLoi, type LoiForm } from "../shared/KhungFormPhieu";
import { PhanNhanBang, THU_TU_O_THU, type DatOThu } from "./components/PhanNhanBang";
import { initialForm, optional } from "./shared/helpers";
import { useTaiKhoanNhan } from "./shared/taiKhoanNhan";
import type { PaymentReceiptDialogProps } from "./shared/types";
import "../ke-toan.css";

export function PaymentReceiptDialog({
  voucher,
  receipt = null,
  onClose,
  onSaved,
}: PaymentReceiptDialogProps) {
  const { token } = useAuth();
  // Phần còn được thu: cộng lại chính phiếu này khi đang sửa (nó đang chiếm chỗ).
  const remainingVnd = useMemo(
    () =>
      voucher.amount_vnd -
      voucher.receipt_received_amount -
      voucher.receipt_pending_amount +
      (receipt?.status === "waiting_receipt" ? receipt.amount_vnd : 0),
    [voucher, receipt],
  );
  const [form, setForm] = useState<PaymentReceiptInput>(() => initialForm(voucher, receipt));
  const goc = useRef(JSON.stringify(form));
  const { taiKhoan: companyAccounts, dangTai: loadingAccounts, loiTai: loiTaiKhoan } = useTaiKhoanNhan(voucher.currency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loi, setLoi] = useState<LoiForm>({});

  const amountVnd = useMemo(
    () => Math.round(Number(form.amount || 0) * Number(form.exchange_rate || voucher.exchange_rate || 1)),
    [form.amount, form.exchange_rate, voucher.exchange_rate],
  );
  const isBank = form.receipt_method === "bank_transfer";
  const ngoaiTe = voucher.currency !== "VND";

  const set: DatOThu = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLoi((l) => (l[key] ? { ...l, [key]: undefined } : l));
  };

  function chonCach(type: PaymentVoucherType) {
    set("receipt_method", type);
    setLoi({});
  }

  function kiemTra(): LoiForm {
    const l: LoiForm = {};
    if (!form.payer_name.trim()) l.payer_name = "Ghi người hoặc đơn vị nộp tiền.";
    if (!Number.isFinite(form.amount) || form.amount <= 0) l.amount = "Số tiền thu phải lớn hơn 0.";
    else if (!Number.isInteger(form.amount)) {
      l.amount = `Số ${voucher.currency} có phần lẻ — máy chủ chưa lưu được phần lẻ ngoại tệ, ghi số nguyên.`;
    } else if (amountVnd > remainingVnd) {
      l.amount = `Số tiền thu không được vượt quá ${remainingVnd.toLocaleString("vi-VN")} đ.`;
    }
    if (!form.content.trim()) l.content = "Ghi nội dung thu.";
    const loiNgay = loiNgayPhieu(form.receipt_date, "Ngày thu");
    if (loiNgay) l.receipt_date = loiNgay;
    if (isBank && !form.company_bank_account_id) l.company_bank_account_id = "Chọn tài khoản công ty nhận tiền.";
    if (isBank && !optional(form.bank_reference)) {
      l.bank_reference = "Thu qua ngân hàng phải có mã giao dịch hoặc số báo có.";
    }
    return l;
  }

  async function submit() {
    if (!token || saving) return;
    const l = kiemTra();
    setLoi(l);
    if (Object.values(l).some(Boolean)) {
      nhayToiLoi(l, THU_TU_O_THU);
      return;
    }
    const payload: PaymentReceiptInput = {
      ...form,
      payer_name: form.payer_name.trim(),
      payer_address: optional(form.payer_address),
      debit_account: optional(form.debit_account),
      credit_account: optional(form.credit_account),
      amount: Math.round(Number(form.amount)),
      exchange_rate: Number(form.exchange_rate || voucher.exchange_rate || 1),
      content: form.content.trim(),
      company_bank_account_id: isBank ? (form.company_bank_account_id ?? null) : null,
      bank_reference: isBank ? optional(form.bank_reference) : null,
      note: optional(form.note),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = receipt
        ? await api.accounting.updateReceipt(token, receipt.id, payload)
        : await api.accounting.createReceipt(token, voucher.id, payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lưu được phiếu thu.");
    } finally {
      setSaving(false);
    }
  }

  const ten = form.payer_name.trim();
  return (
    <KhungFormPhieu
      duongDan={`Phiếu thu > ${receipt ? receipt.code : `Thu lại ${voucher.code}`}`}
      tieuDe={receipt ? "Sửa phiếu thu" : "Lập phiếu thu"}
      tomTat={[
        { nhan: "Đã chi", giaTri: tien(voucher.amount_vnd) },
        { nhan: "Đã thu", giaTri: tien(voucher.receipt_received_amount) },
        { nhan: "Chờ thu", giaTri: tien(voucher.receipt_pending_amount) },
        { nhan: "Còn được thu", giaTri: tien(remainingVnd) },
      ]}
      xemTruoc={
        amountVnd > 0 ? (
          <>
            Thu <b>{tien(amountVnd)}</b> {isBank ? "chuyển khoản" : "tiền mặt"}
            {ten ? <> của <b>{ten}</b></> : null}.
          </>
        ) : null
      }
      dangLuu={saving}
      loiChung={error}
      onDong={onClose}
      chanDong={() => JSON.stringify(form) !== goc.current}
      onSubmit={() => void submit()}
      nhanNut={receipt ? "Lưu thay đổi" : "Lập phiếu thu"}
      nhanDangLuu="Đang lưu…"
    >
      <div className="kt-f__muc">
        <div className="kt-f__tieu">Thu của ai và bao nhiêu</div>
        <OF khoa="payer_name" nhan="Thu của" batBuoc loi={loi.payer_name} goi={`Phiếu chi gốc ${voucher.code} trả cho ${voucher.supplier_name}.`}>
          <input id={idO("payer_name")} value={form.payer_name} aria-invalid={loi.payer_name ? true : undefined}
            onChange={(e) => set("payer_name", e.target.value)} />
        </OF>
        <div className="kt-f__hang">
          <OF khoa="amount" nhan={ngoaiTe ? `Số tiền (${voucher.currency})` : "Số tiền"} batBuoc loi={loi.amount}
            goi={ngoaiTe ? `Quy đổi ${tien(amountVnd)}` : form.amount > 0 ? `${amountInWords(form.amount)}.` : undefined}>
            <OTienPhieu khoa="amount" value={form.amount} onChange={(v) => set("amount", v)} loi={!!loi.amount}
              hauTo={ngoaiTe ? voucher.currency : "đ"} soLe={ngoaiTe} />
          </OF>
          {ngoaiTe && (
            <OF khoa="exchange_rate" nhan="Tỷ giá" batBuoc goi={`Tỷ giá phiếu chi gốc ${vietSo(voucher.exchange_rate)}.`}>
              <OTienPhieu khoa="exchange_rate" value={Number(form.exchange_rate ?? voucher.exchange_rate)}
                onChange={(v) => set("exchange_rate", v)} soLe />
            </OF>
          )}
        </div>
        <OF khoa="content" nhan="Nội dung thu" batBuoc rong loi={loi.content}>
          <input id={idO("content")} value={form.content} aria-invalid={loi.content ? true : undefined}
            onChange={(e) => set("content", e.target.value)} />
        </OF>
      </div>

      <div className="kt-f__muc">
        <div className="kt-f__tieu">Nhận bằng</div>
        <PhanNhanBang form={form} set={set} loi={loi} onDoiCach={chonCach} taiKhoan={companyAccounts}
          dangTai={loadingAccounts} loiTai={loiTaiKhoan} tienTe={voucher.currency} />
      </div>

      <div className="kt-f__muc">
        <div className="kt-f__tieu">Khi nào</div>
        <ONgayPhieu khoa="receipt_date" nhan="Ngày thu" goi="Ngày tiền thật sự vào quỹ hoặc tài khoản. Không chọn ngày sau hôm nay."
          value={form.receipt_date} onChange={(v) => set("receipt_date", v)} loi={loi.receipt_date} />
      </div>

      <div className="kt-f__muc">
        <div className="kt-f__tieu">Chi tiết thêm</div>
        <OF khoa="payer_address" nhan="Địa chỉ người nộp" rong>
          <input id={idO("payer_address")} maxLength={500} value={form.payer_address ?? ""}
            onChange={(e) => set("payer_address", e.target.value)} />
        </OF>
        <OF khoa="note" nhan="Ghi chú" rong>
          <textarea id={idO("note")} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </OF>
      </div>
    </KhungFormPhieu>
  );
}
