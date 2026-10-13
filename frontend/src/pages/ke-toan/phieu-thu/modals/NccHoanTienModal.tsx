// Lập PHIẾU THU NHÀ CUNG CẤP HOÀN TIỀN (12/10/2026) — nút "Nhà cung cấp hoàn tiền" ở ngăn Công nợ
// phải trả. Gắn thẳng nhà cung cấp, không cần phiếu chi gốc; phiếu thuộc mục cố định "Nhà cung cấp
// hoàn tiền" nên không có ô Mục, và tiền vào Công nợ phải trả của đúng NCC đó.
// Số tiền điền sẵn bằng số NCC đang nợ lại mình (sao kê tới hôm nay: đã trả nhiều hơn hàng đã nhận).
// Vượt số đó thì chỉ nhắc, không chặn. Cùng khuôn với form Lập phiếu thu (`OtherReceiptDialog`).
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  type PaymentReceiptInput,
  type PaymentReceiptRow,
  type PaymentVoucherType,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { BanXemPhieu } from "../../shared/BanXemPhieu";
import { tien } from "../../shared/dinhDang";
import { mucCoDinh, useMucThuChi } from "../../shared/OChonMuc";
import {
  HangDoiChieu,
  KhoiForm,
  KhungFormPhieu,
  OF,
  ONgayPhieu,
  OTienLon,
  idO,
  loiNgayPhieu,
  nhayToiLoi,
  type LoiForm,
} from "../../shared/KhungFormPhieu";
import { OChungTu, taiTepSauKhiLap } from "../../shared/tepChungTu";
import { PhanNhanBang, THU_TU_O_THU_MOI, type DatOThu } from "../components/PhanNhanBang";
import { isoToday, methodText, optional } from "../shared/helpers";
import { useTaiKhoanNhan } from "../shared/taiKhoanNhan";
import "../../ke-toan.css";

export function NccHoanTienModal({
  nccId,
  nccTen,
  onClose,
  onSaved,
  onMoTaiKhoan,
}: {
  nccId: number;
  nccTen: string;
  onClose: () => void;
  onSaved: (receipt: PaymentReceiptRow) => void;
  onMoTaiKhoan?: () => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<PaymentReceiptInput>(() => ({
    payer_name: nccTen,
    payer_address: null,
    receipt_method: "cash",
    receipt_date: isoToday(),
    amount: 0,
    exchange_rate: 1,
    content: `${nccTen} hoàn tiền`,
    debit_account: null,
    credit_account: null,
    company_bank_account_id: null,
    bank_reference: null,
    note: null,
    muc_thu_chi_id: null,
  }));
  const muc = useMucThuChi("thu");
  const tenMuc = mucCoDinh(muc.ds, "purchase_refund")?.ten ?? "Nhà cung cấp hoàn tiền";
  const goc = useRef(JSON.stringify(form));
  // Số NCC đang nợ lại mình (dư Nợ phải trả tới hôm nay). null = đang đọc / đọc hỏng.
  const [du, setDu] = useState<number | null>(null);
  const { taiKhoan: companyAccounts, dangTai: loadingAccounts, loiTai: loiTaiKhoan } = useTaiKhoanNhan("VND");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loi, setLoi] = useState<LoiForm>({});
  const [files, setFiles] = useState<File[]>([]);
  const [loiTep, setLoiTep] = useState<string | null>(null);
  const [daLap, setDaLap] = useState<PaymentReceiptRow | null>(null);
  const isBank = form.receipt_method === "bank_transfer";

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const homNay = isoToday();
    api.accounting
      .saoKeDoiTac(token, "payables", nccId, { tuNgay: homNay, denNgay: homNay })
      .then((sk) => {
        if (!alive) return;
        const soDu = Math.max(0, sk.cuoi_no - sk.cuoi_co);
        setDu(soDu);
        setForm((f) => {
          if (f.amount) return f;
          const moi = { ...f, amount: soDu };
          goc.current = JSON.stringify(moi);
          return moi;
        });
      })
      .catch(() => {
        if (alive) setDu(null);
      });
    return () => { alive = false; };
  }, [token, nccId]);

  const set: DatOThu = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLoi((l) => (l[key] ? { ...l, [key]: undefined } : l));
  };

  function chonCach(type: PaymentVoucherType) {
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
    if (daLap) {
      onSaved(daLap);
      return;
    }
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
      amount: Math.round(Number(form.amount)),
      exchange_rate: 1,
      content: form.content.trim(),
      debit_account: optional(form.debit_account),
      credit_account: optional(form.credit_account),
      company_bank_account_id: isBank ? form.company_bank_account_id ?? null : null,
      bank_reference: isBank ? optional(form.bank_reference) : null,
      note: optional(form.note),
      muc_thu_chi_id: null,
    };
    setSaving(true);
    setError(null);
    try {
      const saved = await api.accounting.createSupplierRefundReceipt(token, nccId, payload);
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

  const soTien = Math.round(Number(form.amount)) || 0;
  const nhac =
    du == null
      ? "Gõ số tiền nhà cung cấp trả lại."
      : du === 0
        ? "Nhà cung cấp không nợ lại mình đồng nào. Vẫn lập được, ví dụ hoàn tiền hàng lỗi."
        : soTien > du
          ? `Vượt số nhà cung cấp đang nợ lại ${tien(du)}. Vẫn lập được.`
          : "Điền sẵn bằng số nhà cung cấp đang nợ lại mình.";
  const tk = companyAccounts.find((t) => t.id === form.company_bank_account_id);
  const oNgay = (
    <ONgayPhieu khoa="receipt_date" nhan="Ngày thu" value={form.receipt_date}
      onChange={(v) => set("receipt_date", v)} loi={loi.receipt_date} />
  );
  return (
    <KhungFormPhieu
      duongDan={<>Công nợ phải trả &gt; {nccTen} &gt; Nhà cung cấp hoàn tiền</>}
      tieuDe="Nhà cung cấp hoàn tiền"
      xemTruoc={daLap ? <>Phiếu <b>{daLap.code}</b> đã lập.</> : "Lập xong không sửa được, chỉ hủy được."}
      dangLuu={saving}
      loiChung={error}
      onDong={onClose}
      chanDong={() => !daLap && (JSON.stringify(form) !== goc.current || files.length > 0)}
      onSubmit={() => void submit()}
      nhanNut={daLap ? "Mở phiếu đã lập" : "Lập phiếu thu"}
      banXem={
        <BanXemPhieu
          kind="thu"
          ngay={form.receipt_date}
          nguoi={form.payer_name}
          diaChi={optional(form.payer_address)}
          lyDo={form.content}
          dongPhu={[
            { label: "Hình thức", value: methodText(form) },
            ...(isBank
              ? [{ label: "Tài khoản nhận", value: tk ? `${tk.account_number} tại ${tk.bank_name}` : "" }]
              : []),
            { label: "Mục thu", value: tenMuc },
            ...(isBank && optional(form.bank_reference) ? [{ label: "Mã giao dịch", value: form.bank_reference ?? "" }] : []),
          ]}
          soTien={form.amount}
          soChungTu={files.length}
        />
      }
    >
      <KhoiForm tieu="Nhà cung cấp">
        <HangDoiChieu
          o={[
            { nhan: "Nhà cung cấp", giaTri: nccTen },
            { nhan: "Đang nợ lại mình", giaTri: du == null ? "Đang đọc" : tien(du), chot: true },
          ]}
        />
      </KhoiForm>

      <KhoiForm tieu="Tiền thu">
        <OTienLon khoa="amount" nhan="Số tiền thu" value={form.amount} onChange={(v) => set("amount", v)} loi={loi.amount}
          nutDu={du ? { nhan: "Thu hết số nợ lại", so: du } : undefined}
          goiTrong="Nhập số tiền nhà cung cấp trả lại" con={<p className="kt-khac">{nhac}</p>} />
        <PhanNhanBang form={form} set={set} loi={loi} onDoiCach={chonCach} taiKhoan={companyAccounts}
          dangTai={loadingAccounts} loiTai={loiTaiKhoan} tienTe="VND" onMoTaiKhoan={onMoTaiKhoan} gon oNgay={oNgay} />
      </KhoiForm>

      <KhoiForm tieu="Người nộp">
        <OF khoa="payer_name" nhan="Người nộp tiền" batBuoc rong loi={loi.payer_name}>
          <input id={idO("payer_name")} value={form.payer_name} placeholder="Người hoặc đơn vị nộp tiền"
            aria-invalid={loi.payer_name ? true : undefined}
            onChange={(e) => set("payer_name", e.target.value)} />
        </OF>
        <OF khoa="content" nhan="Lý do nộp" batBuoc rong loi={loi.content}>
          <input id={idO("content")} value={form.content} placeholder="VD: Hoàn tiền giấy lỗi đợt 2"
            aria-invalid={loi.content ? true : undefined}
            onChange={(e) => set("content", e.target.value)} />
        </OF>
        <OF khoa="payer_address" nhan="Địa chỉ người nộp" rong>
          <input id={idO("payer_address")} maxLength={500} value={form.payer_address ?? ""}
            placeholder="Không bắt buộc. Có thì in lên phiếu"
            onChange={(e) => set("payer_address", e.target.value)} />
        </OF>
      </KhoiForm>

      <KhoiForm tieu="Chứng từ">
        <OChungTu files={files} setFiles={setFiles} loi={loiTep ?? undefined} onLoi={setLoiTep}
          goi={'Biên nhận, ảnh chụp sao kê. Số ảnh in thành "Kèm theo" trên phiếu.'} />
        <OF khoa="note" nhan="Ghi chú nội bộ" rong goi="Không in lên phiếu">
          <textarea id={idO("note")} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        </OF>
      </KhoiForm>
    </KhungFormPhieu>
  );
}
