// Khung THU TIỀN một hoá đơn (đặc tả NPTh-3) — mở NGAY DƯỚI dòng hoá đơn trong ngăn khách hàng, không
// thêm lớp phủ nào. Tiêu đề "Thu hoá đơn …" + thẻ "Còn phải thu …"; Số tiền (ô to, điền sẵn số còn
// nợ, nút "Thu đủ") — Ngày thu (từ ngày hoá đơn tới hôm nay giờ Việt Nam) — Nhận bằng (hai thẻ chọn;
// chuyển khoản thêm Vào tài khoản + Mã giao dịch ngân hàng) — "Thêm chi tiết": Người nộp, Nội dung
// thu, Ghi chú. Lỗi tại ô, con trỏ nhảy tới ô sai đầu tiên.
//
// ⚠️ TIỀN THẬT: payload GIỮ Y bản cũ (cùng 10 trường, cùng giá trị) — chỉ thêm giá trị cho `note` từ ô
// Ghi chú (máy chủ nhận từ trước, bản cũ luôn gửi null). Luật kiểm giữ nguyên, nay báo tại từng ô;
// ngày mặc định / trần là hôm nay theo giờ Việt Nam (đặc tả A.14).
import { CircleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  ApiError,
  api,
  type PaymentReceiptInput,
  type PaymentReceiptRow,
  type PaymentVoucherType,
  type ReceivableItemRow,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { money } from "../../../../utils/format";
import { homNayVN } from "../../../../utils/ky";
import { PhanNhanBang, type DatOThu } from "../../phieu-thu/components/PhanNhanBang";
import { optional } from "../../phieu-thu/shared/helpers";
import { useTaiKhoanNhan } from "../../phieu-thu/shared/taiKhoanNhan";
import { TheNho } from "../../shared/Cum";
import { ngay, tien } from "../../shared/dinhDang";
import {
  OF,
  ONgayPhieu,
  OTienPhieu,
  ThemChiTiet,
  idO,
  loiNgayPhieu,
  nhayToiLoi,
  type LoiForm,
} from "../../shared/KhungFormPhieu";

/** Thứ tự ô trên khung — con trỏ nhảy tới ô sai đầu tiên theo đúng thứ tự này. */
const THU_TU = ["amount", "receipt_date", "company_bank_account_id", "bank_reference", "payer_name", "content"];

export function InvoiceReceiptForm({
  item,
  customerName,
  onDong,
  onDaLap,
  onMoTaiKhoan,
  onBan,
}: {
  item: ReceivableItemRow;
  customerName: string;
  onDong: () => void;
  /** Lập xong — ngăn cập nhật dòng hoá đơn ngay và hiện thông báo đáy. */
  onDaLap: (receipt: PaymentReceiptRow) => void;
  /** Không có tài khoản VND ⇒ link "Thêm tài khoản" sang màn Tài khoản ngân hàng. */
  onMoTaiKhoan?: () => void;
  /** Báo ngăn khung đang gõ dở (đóng ngăn thì hỏi trước). */
  onBan?: (ban: boolean) => void;
}) {
  const { token } = useAuth();
  const conNo = item.remaining_amount;
  const [form, setForm] = useState<PaymentReceiptInput>(() => ({
    payer_name: customerName,
    payer_address: null,
    receipt_method: "cash",
    receipt_date: homNayVN(),
    amount: conNo,
    exchange_rate: 1,
    content: `Thu hóa đơn ${item.invoice_number} của đơn ${item.order_code}`,
    company_bank_account_id: null,
    bank_reference: null,
    note: null,
  }));
  const goc = useRef(JSON.stringify(form));
  const ban = JSON.stringify(form) !== goc.current;
  const { taiKhoan, dangTai: dangTaiTk, loiTai: loiTaiTk } = useTaiKhoanNhan("VND");
  const [dangLap, setDangLap] = useState(false);
  const [loiChung, setLoiChung] = useState<string | null>(null);
  const [loi, setLoi] = useState<LoiForm>({});
  const [moChiTiet, setMoChiTiet] = useState(false);
  const isBank = form.receipt_method === "bank_transfer";

  useEffect(() => {
    onBan?.(ban);
  }, [ban, onBan]);
  // Khung bị gỡ (đổi tab, đổi lọc, lập xong) thì ngăn không còn "gõ dở" nữa.
  const onBanRef = useRef(onBan);
  onBanRef.current = onBan;
  useEffect(() => () => onBanRef.current?.(false), []);

  const set: DatOThu = (key, value) => {
    setForm((cu) => ({ ...cu, [key]: value }));
    setLoi((l) => (l[key] ? { ...l, [key]: undefined } : l));
  };

  function chonCach(type: PaymentVoucherType) {
    // Về tiền mặt thì bỏ tài khoản và mã giao dịch đã chọn (payload cũng gửi null cho tiền mặt).
    setForm((cu) => ({
      ...cu,
      receipt_method: type,
      ...(type === "cash" ? { company_bank_account_id: null, bank_reference: null } : {}),
    }));
    setLoi({});
  }

  function kiemTra(): LoiForm {
    const l: LoiForm = {};
    if (!Number.isFinite(form.amount) || form.amount <= 0 || form.amount > conNo) {
      l.amount = `Số tiền thu phải từ 1 đến ${money(conNo)}.`;
    }
    const loiNgay = loiNgayPhieu(form.receipt_date, "Ngày thu");
    if (loiNgay) l.receipt_date = loiNgay;
    else if (form.receipt_date < item.invoice_date) {
      l.receipt_date = `Ngày thu không được trước ngày hoá đơn ${ngay(item.invoice_date)}.`;
    }
    if (isBank && !form.company_bank_account_id) l.company_bank_account_id = "Chọn tài khoản công ty nhận tiền.";
    if (isBank && !optional(form.bank_reference)) {
      l.bank_reference = "Nhập mã giao dịch ngân hàng in trên sao kê hoặc tin nhắn báo có.";
    }
    if (!form.payer_name.trim()) l.payer_name = "Ghi người nộp tiền.";
    if (!form.content.trim()) l.content = "Ghi nội dung thu.";
    return l;
  }

  async function lap() {
    if (!token || dangLap) return;
    const l = kiemTra();
    setLoi(l);
    if (Object.values(l).some(Boolean)) {
      // Ô sai nằm trong "Thêm chi tiết" đang gấp thì mở ra trước, rồi mới đưa con trỏ tới.
      if (l.payer_name || l.content) setMoChiTiet(true);
      window.setTimeout(() => nhayToiLoi(l, THU_TU), 0);
      return;
    }
    const payload: PaymentReceiptInput = {
      payer_name: form.payer_name.trim(),
      payer_address: null,
      receipt_method: form.receipt_method,
      receipt_date: form.receipt_date,
      amount: Math.round(form.amount),
      exchange_rate: 1,
      content: form.content.trim(),
      company_bank_account_id: isBank ? form.company_bank_account_id ?? null : null,
      bank_reference: isBank ? optional(form.bank_reference) : null,
      note: optional(form.note),
    };
    setDangLap(true);
    setLoiChung(null);
    try {
      const saved = await api.accounting.createSalesInvoiceReceipt(token, item.invoice_id, payload);
      onDaLap(saved);
    } catch (err) {
      setLoiChung(err instanceof ApiError ? err.message : "Không lập được phiếu thu hoá đơn.");
      setDangLap(false);
    }
  }

  const dong = () => {
    if (dangLap) return;
    if (ban && !window.confirm("Bỏ nội dung đang nhập?")) return;
    onDong();
  };

  const moThem = moChiTiet || !!loi.payer_name || !!loi.content || !!optional(form.note);

  return (
    <section className="kt-khung" aria-label={`Thu hoá đơn ${item.invoice_number}`}>
      <h3>
        {`Thu hoá đơn ${item.invoice_number}`}
        <TheNho>{`Còn phải thu ${tien(conNo)}`}</TheNho>
        <button type="button" className="kt-ic" aria-label="Đóng khung thu tiền" onClick={dong}>
          <X size={16} aria-hidden="true" />
        </button>
      </h3>
      <form className="kt-f" noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void lap();
        }}>
        {loiChung && (
          <p className="kt-o__loi" role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            {loiChung}
          </p>
        )}
        <div className="kt-f__hang">
          <OF khoa="amount" nhan="Số tiền" batBuoc loi={loi.amount}
            goi={<button type="button" className="kt-lk" onClick={() => set("amount", conNo)}>Thu đủ</button>}>
            <OTienPhieu khoa="amount" value={form.amount} onChange={(v) => set("amount", v)} loi={!!loi.amount} />
          </OF>
          <ONgayPhieu khoa="receipt_date" nhan="Ngày thu" goi={`Từ ${ngay(item.invoice_date)} tới hôm nay`}
            min={item.invoice_date} value={form.receipt_date} onChange={(v) => set("receipt_date", v)}
            loi={loi.receipt_date} />
        </div>
        <PhanNhanBang form={form} set={set} loi={loi} onDoiCach={chonCach} taiKhoan={taiKhoan} dangTai={dangTaiTk}
          loiTai={loiTaiTk} tienTe="VND" onMoTaiKhoan={onMoTaiKhoan} nutThemTaiKhoan />
        <ThemChiTiet cacO={["Người nộp", "Nội dung thu", "Ghi chú"]} mo={moThem} onMo={() => setMoChiTiet(true)}>
          <div className="kt-f__hang">
            <OF khoa="payer_name" nhan="Người nộp" batBuoc loi={loi.payer_name}>
              <input id={idO("payer_name")} value={form.payer_name} aria-invalid={loi.payer_name ? true : undefined}
                onChange={(e) => set("payer_name", e.target.value)} />
            </OF>
            <OF khoa="content" nhan="Nội dung thu" batBuoc loi={loi.content}>
              <input id={idO("content")} value={form.content} aria-invalid={loi.content ? true : undefined}
                onChange={(e) => set("content", e.target.value)} />
            </OF>
          </div>
          <OF khoa="note" nhan="Ghi chú" rong>
            <textarea id={idO("note")} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
          </OF>
        </ThemChiTiet>
        <div className="kt-khung__nut">
          <button type="button" className="kt-btn kt-btn--tron" disabled={dangLap} onClick={dong}>Đóng</button>
          <button type="submit" className="kt-btn kt-btn--chinh" disabled={dangLap}>
            {dangLap ? "Đang lập…" : "Lập phiếu thu"}
          </button>
        </div>
      </form>
    </section>
  );
}
