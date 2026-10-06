// Form LẬP PHIẾU THU KHÁC — khoản thu phát sinh độc lập, không gắn phiếu chi/đơn bán (đặc tả PT-3).
// Thứ tự theo cách người ta nghĩ: thu của ai → bao nhiêu → vì sao → nhận bằng gì → khi nào.
// Vỏ `NganPhai` (cùng độ rộng mọi ngăn); lỗi tại ô, con trỏ nhảy tới ô sai đầu tiên; gõ dở thì
// Esc / Đóng hỏi trước. Luật kiểm và `payload` gửi lên giữ NGUYÊN bản cũ (chỉ thêm: ngày thu không
// sau hôm nay — đặc tả A.14); chứng từ đính kèm tải lên ngay sau khi lập.
import { useRef, useState } from "react";
import {
  ApiError,
  api,
  type PaymentReceiptInput,
  type PaymentReceiptRow,
  type PaymentVoucherType,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { amountInWords } from "../../../../utils/format";
import { tien } from "../../shared/dinhDang";
import {
  KhungFormPhieu,
  OF,
  ONgayPhieu,
  OTienPhieu,
  ThemChiTiet,
  idO,
  loiNgayPhieu,
  nhayToiLoi,
  type LoiForm,
} from "../../shared/KhungFormPhieu";
import { OChungTu, taiTepSauKhiLap } from "../../shared/tepChungTu";
import { PhanNhanBang, THU_TU_O_THU, type DatOThu } from "../components/PhanNhanBang";
import { isoToday, optional } from "../shared/helpers";
import { useTaiKhoanNhan } from "../shared/taiKhoanNhan";
import "../../ke-toan.css";

export function OtherReceiptDialog({
  onClose,
  onSaved,
  onMoTaiKhoan,
}: {
  onClose: () => void;
  onSaved: (receipt: PaymentReceiptRow) => void;
  onMoTaiKhoan?: () => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<PaymentReceiptInput>(() => ({
    payer_name: "",
    payer_address: null,
    receipt_method: "cash",
    receipt_date: isoToday(),
    amount: 0,
    exchange_rate: 1,
    content: "",
    debit_account: null,
    credit_account: null,
    company_bank_account_id: null,
    bank_reference: null,
    note: null,
  }));
  const goc = useRef(JSON.stringify(form));
  const { taiKhoan: companyAccounts, dangTai: loadingAccounts, loiTai: loiTaiKhoan } = useTaiKhoanNhan("VND");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loi, setLoi] = useState<LoiForm>({});
  const [moChiTiet, setMoChiTiet] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loiTep, setLoiTep] = useState<string | null>(null);
  const [daLap, setDaLap] = useState<PaymentReceiptRow | null>(null);
  const isBank = form.receipt_method === "bank_transfer";

  const set: DatOThu = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLoi((l) => (l[key] ? { ...l, [key]: undefined } : l));
  };

  function chonCach(type: PaymentVoucherType) {
    // Như bản cũ: về tiền mặt thì bỏ luôn tài khoản và mã giao dịch đã chọn.
    setForm((current) => ({
      ...current,
      receipt_method: type,
      ...(type === "cash" ? { company_bank_account_id: null, bank_reference: null } : {}),
    }));
    setLoi({});
  }

  function kiemTra(): LoiForm {
    const l: LoiForm = {};
    if (!form.payer_name.trim()) l.payer_name = "Ghi người hoặc đơn vị nộp tiền.";
    if (!Number.isFinite(form.amount) || form.amount <= 0) l.amount = "Số tiền thu phải lớn hơn 0.";
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
    if (daLap) {
      onSaved(daLap);
      return;
    }
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
      receipt_method: form.receipt_method,
      receipt_date: form.receipt_date,
      amount: Math.round(Number(form.amount)),
      exchange_rate: 1,
      content: form.content.trim(),
      debit_account: optional(form.debit_account),
      credit_account: optional(form.credit_account),
      company_bank_account_id: isBank ? form.company_bank_account_id ?? null : null,
      bank_reference: isBank ? optional(form.bank_reference) : null,
      note: optional(form.note),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = await api.accounting.createOtherReceipt(token, payload);
      if (files.length) {
        const hong = await taiTepSauKhiLap(saved.code, files, (f) =>
          api.accounting.uploadReceiptAttachment(token, saved.id, f),
        );
        if (hong) {
          setDaLap(saved);
          setError(hong);
          return;
        }
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lập được phiếu thu.");
    } finally {
      setSaving(false);
    }
  }

  const ten = form.payer_name.trim();
  const moThem = moChiTiet || files.length > 0 || !!optional(form.payer_address) || !!optional(form.note);
  return (
    <KhungFormPhieu
      duongDan="Phiếu thu > Lập mới"
      tieuDe="Lập phiếu thu"
      xemTruoc={
        daLap ? (
          <>Phiếu <b>{daLap.code}</b> đã lập.</>
        ) : form.amount > 0 ? (
          <>
            Thu <b>{tien(form.amount)}</b> {isBank ? "chuyển khoản" : "tiền mặt"}
            {ten ? <> của <b>{ten}</b></> : null}.
          </>
        ) : null
      }
      dangLuu={saving}
      loiChung={error}
      onDong={onClose}
      chanDong={() => !daLap && (JSON.stringify(form) !== goc.current || files.length > 0)}
      onSubmit={() => void submit()}
      nhanNut={daLap ? "Mở phiếu đã lập" : "Lập phiếu thu"}
    >
      <div className="kt-f__muc">
        <div className="kt-f__tieu">Thu của ai và bao nhiêu</div>
        <OF khoa="payer_name" nhan="Thu của" batBuoc rong loi={loi.payer_name} goi="Người hoặc đơn vị nộp tiền.">
          <input id={idO("payer_name")} value={form.payer_name} aria-invalid={loi.payer_name ? true : undefined}
            onChange={(e) => set("payer_name", e.target.value)} />
        </OF>
        <OF khoa="amount" nhan="Số tiền" batBuoc loi={loi.amount}
          goi={form.amount > 0 ? `${amountInWords(form.amount)}.` : undefined}>
          <OTienPhieu khoa="amount" value={form.amount} onChange={(v) => set("amount", v)} loi={!!loi.amount} />
        </OF>
        <OF khoa="content" nhan="Nội dung thu" batBuoc rong loi={loi.content}>
          <input id={idO("content")} value={form.content} placeholder="VD: Bán giấy vụn và lề xén tháng 9"
            aria-invalid={loi.content ? true : undefined}
            onChange={(e) => set("content", e.target.value)} />
        </OF>
      </div>

      <div className="kt-f__muc">
        <div className="kt-f__tieu">Nhận bằng</div>
        <PhanNhanBang form={form} set={set} loi={loi} onDoiCach={chonCach} taiKhoan={companyAccounts}
          dangTai={loadingAccounts} loiTai={loiTaiKhoan} tienTe="VND" onMoTaiKhoan={onMoTaiKhoan} />
      </div>

      <div className="kt-f__muc">
        <div className="kt-f__tieu">Khi nào</div>
        <ONgayPhieu khoa="receipt_date" nhan="Ngày thu" goi="Ngày tiền thật sự vào quỹ hoặc tài khoản. Không chọn ngày sau hôm nay."
          value={form.receipt_date} onChange={(v) => set("receipt_date", v)} loi={loi.receipt_date} />
      </div>

      <ThemChiTiet cacO={["Địa chỉ người nộp", "Ghi chú", "Chứng từ"]} mo={moThem} onMo={() => setMoChiTiet(true)}>
        <OF khoa="payer_address" nhan="Địa chỉ người nộp" rong>
          <input id={idO("payer_address")} maxLength={500} value={form.payer_address ?? ""}
            onChange={(e) => set("payer_address", e.target.value)} />
        </OF>
        <OF khoa="note" nhan="Ghi chú" rong>
          <textarea id={idO("note")} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </OF>
        <OChungTu files={files} setFiles={setFiles} loi={loiTep ?? undefined} onLoi={setLoiTep} />
      </ThemChiTiet>
    </KhungFormPhieu>
  );
}
