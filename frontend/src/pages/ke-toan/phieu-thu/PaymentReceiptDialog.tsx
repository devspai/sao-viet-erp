// Form lập/sửa PHIẾU THU LẠI TIỀN ĐÃ CHI của một phiếu chi (đặc tả PT-4). Đường mở từ Phiếu chi đã
// gỡ; form chỉ còn mở qua "Sửa" phiếu cũ chờ thu. Khung giống PT-3 (vỏ `NganPhai`, lỗi tại ô).
//
// ⚠️ TIỀN: `remainingVnd`, `amountVnd`, luật kiểm và `payload` giữ NGUYÊN bản cũ. Khác bản cũ:
//   - Mã giao dịch điền lại sẵn khi sửa (lỗi thật số 4) và gửi theo hình thức (tiền mặt ⇒ null).
//   - Số ngoại tệ + tỷ giá gõ được phần lẻ kiểu Việt Nam "12,5" (lỗi thật số 5). Cột `amount` của
//     phiếu thu vẫn là số NGUYÊN ở máy chủ, nên số ngoại tệ có phần lẻ bị chặn tại ô với câu nói rõ
//     (bản cũ `step=1` cũng chặn, chỉ là trình duyệt chặn không lời) — không làm tròn ngầm.
//   - Kiểm thêm tại ô: chuyển khoản phải có mã giao dịch (máy chủ vốn chặn), ngày thu không sau hôm nay.
//
// Kiểu khối mới (06/10/2026, như ngăn Thu tiền hoá đơn): "Phiếu chi gốc" (Đã chi | Đã thu lại | Chờ thu
// | Còn được thu) → "Tiền thu" (VND: ô tiền lớn + "Thu đủ" + dải sau phiếu; ngoại tệ: ô số lẻ + tỷ giá)
// → "Người nộp" → "Ghi chú"; tờ 01-TT xem trước bên phải. Thu vượt "Còn được thu" (VND) thì khoá nút.
import { useMemo, useRef, useState } from "react";
import {
  ApiError,
  api,
  type PaymentReceiptInput,
  type PaymentVoucherType,
} from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { BanXemPhieu } from "../shared/BanXemPhieu";
import { tien, vietSo } from "../shared/dinhDang";
import {
  GoiYTen,
  HangDoiChieu,
  KhoiForm,
  KhungFormPhieu,
  OF,
  ONgayPhieu,
  OTienLon,
  OTienPhieu,
  SauPhieu,
  idO,
  loiNgayPhieu,
  nhayToiLoi,
  type LoiForm,
} from "../shared/KhungFormPhieu";
import { PhanNhanBang, THU_TU_O_THU_MOI, type DatOThu } from "./components/PhanNhanBang";
import { initialForm, methodText, optional, sourceLabel } from "./shared/helpers";
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
    if (!form.content.trim()) l.content = "Ghi lý do nộp.";
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
      nhayToiLoi(l, THU_TU_O_THU_MOI);
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

  const vuot = !ngoaiTe && amountVnd > remainingVnd ? amountVnd - remainingVnd : 0;
  const tk = companyAccounts.find((t) => t.id === form.company_bank_account_id);
  const goiY = [
    { ten: voucher.supplier_name, phu: "nhà cung cấp" },
    ...(voucher.cash_recipient_name && voucher.cash_recipient_name !== voucher.supplier_name
      ? [{ ten: voucher.cash_recipient_name, phu: "người nhận ở phiếu chi" }]
      : []),
  ].filter((g) => g.ten);
  return (
    <KhungFormPhieu
      duongDan={`Phiếu thu > ${receipt ? receipt.code : `Thu lại ${voucher.code}`}`}
      tieuDe={receipt ? "Sửa phiếu thu" : "Lập phiếu thu"}
      phuDe={
        <span className="kt-tag">
          Phiếu chi gốc <b>{voucher.code}</b>
        </span>
      }
      xemTruoc="Ngày thu là ngày tiền thật sự vào quỹ hoặc tài khoản."
      dangLuu={saving}
      loiChung={error}
      onDong={onClose}
      chanDong={() => JSON.stringify(form) !== goc.current}
      onSubmit={() => void submit()}
      nhanNut={receipt ? "Lưu thay đổi" : "Lập phiếu thu"}
      nhanDangLuu="Đang lưu…"
      khoaNut={vuot > 0}
      banXem={
        <BanXemPhieu
          kind="thu"
          ngay={form.receipt_date}
          nguoi={form.payer_name}
          diaChi={optional(form.payer_address)}
          lyDo={form.content}
          dongPhu={[
            { label: "Nguồn thu", value: `${sourceLabel({ source_type: "purchase_refund" })} ${voucher.code}` },
            { label: "Hình thức", value: methodText(form) },
            ...(isBank
              ? [
                  { label: "Tài khoản nhận", value: tk ? `${tk.account_number} tại ${tk.bank_name}` : "" },
                  { label: "Mã giao dịch", value: form.bank_reference ?? "" },
                ]
              : []),
          ]}
          soTien={vuot > 0 ? 0 : amountVnd}
          soChungTu={0}
        />
      }
    >
      <KhoiForm tieu="Phiếu chi gốc">
        <HangDoiChieu
          o={[
            { nhan: "Đã chi", giaTri: tien(voucher.amount_vnd) },
            { nhan: "Đã thu lại", giaTri: tien(voucher.receipt_received_amount) },
            { nhan: "Chờ thu", giaTri: tien(voucher.receipt_pending_amount) },
            { nhan: "Còn được thu", giaTri: tien(remainingVnd), chot: true },
          ]}
        />
      </KhoiForm>

      <KhoiForm tieu="Tiền thu">
        {ngoaiTe ? (
          <div className="kt-f__hang">
            <OF khoa="amount" nhan={`Số tiền (${voucher.currency})`} batBuoc loi={loi.amount} goi={`Quy đổi ${tien(amountVnd)}`}>
              <OTienPhieu khoa="amount" value={form.amount} onChange={(v) => set("amount", v)} loi={!!loi.amount}
                hauTo={voucher.currency} soLe />
            </OF>
            <OF khoa="exchange_rate" nhan="Tỷ giá" batBuoc goi={`Tỷ giá phiếu chi gốc ${vietSo(voucher.exchange_rate)}.`}>
              <OTienPhieu khoa="exchange_rate" value={Number(form.exchange_rate ?? voucher.exchange_rate)}
                onChange={(v) => set("exchange_rate", v)} soLe />
            </OF>
          </div>
        ) : (
          <OTienLon khoa="amount" nhan="Số tiền thu" value={form.amount} onChange={(v) => set("amount", v)} loi={loi.amount}
            nutDu={{ nhan: "Thu đủ", so: remainingVnd }} goiTrong="Nhập số tiền thu lại"
            vuot={vuot > 0 ? `Thu quá số còn được thu ${vietSo(vuot)} đ.` : null}
            con={<SauPhieu o={[{ nhan: "Còn được thu", tu: remainingVnd, den: remainingVnd - amountVnd }]} />} />
        )}
        <PhanNhanBang form={form} set={set} loi={loi} onDoiCach={chonCach} taiKhoan={companyAccounts}
          dangTai={loadingAccounts} loiTai={loiTaiKhoan} tienTe={voucher.currency} gon
          oNgay={
            <ONgayPhieu khoa="receipt_date" nhan="Ngày thu" value={form.receipt_date}
              onChange={(v) => set("receipt_date", v)} loi={loi.receipt_date} />
          } />
      </KhoiForm>

      <KhoiForm tieu="Người nộp">
        <OF khoa="payer_name" nhan="Người nộp tiền" batBuoc rong loi={loi.payer_name}>
          <input id={idO("payer_name")} value={form.payer_name} aria-invalid={loi.payer_name ? true : undefined}
            onChange={(e) => set("payer_name", e.target.value)} />
        </OF>
        <GoiYTen goiY={goiY} dangChon={form.payer_name} onChon={(t) => set("payer_name", t)} nhan="Gợi ý người nộp tiền" />
        <OF khoa="content" nhan="Lý do nộp" batBuoc rong loi={loi.content}>
          <input id={idO("content")} value={form.content} aria-invalid={loi.content ? true : undefined}
            onChange={(e) => set("content", e.target.value)} />
        </OF>
        <OF khoa="payer_address" nhan="Địa chỉ người nộp" rong>
          <input id={idO("payer_address")} maxLength={500} value={form.payer_address ?? ""}
            placeholder="Không bắt buộc. Có thì in lên phiếu"
            onChange={(e) => set("payer_address", e.target.value)} />
        </OF>
      </KhoiForm>

      <KhoiForm tieu="Ghi chú">
        <OF khoa="note" nhan="Ghi chú nội bộ" rong goi="Không in lên phiếu">
          <textarea id={idO("note")} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </OF>
      </KhoiForm>
    </KhungFormPhieu>
  );
}
