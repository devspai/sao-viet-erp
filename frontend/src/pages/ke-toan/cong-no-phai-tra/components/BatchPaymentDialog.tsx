// Ngăn chồng TRẢ NHIỀU ĐỢT cùng lúc cho CÙNG một nhà cung cấp (đặc tả NPT-3; chủ chốt 04/09/2026:
// "Cùng một nhà cung cấp thì có thể chọn nhiều đợt giao và thanh toán một lượt luôn").
//
// Mỗi đợt được chọn ra MỘT phiếu chi riêng (máy chủ tự tính đúng số còn nợ của từng đợt lúc lập) —
// form chỉ gom các ô CHUNG cho cả lượt: ngày chi, cách trả, người / tài khoản nhận, nội dung, chứng
// từ. Không có ô Số tiền: trả khác số còn nợ thì lập riêng phiếu của đợt đó ở màn Đơn mua hàng.
//
// ⚠️ TIỀN THẬT: payload gửi đi GIỮ Y NGUYÊN bản trước (cùng trường, cùng giá trị, cùng luật kiểm) —
// chỉ đổi vỏ sang `NganPhai tang={1}`: Esc chỉ đóng lớp này, ngăn nhà cung cấp bên dưới vẫn mở.
import { ChevronRight, Info } from "lucide-react";
import { useEffect, useState } from "react";

import {
  ApiError,
  api,
  type CompanyBankAccountRow,
  type PayableItemRow,
  type PaymentVoucherBaseInput,
  type VoucherBatchInput,
  type VoucherBatchResult,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { tien, vietSo } from "../../shared/dinhDang";
import { OChungTu } from "../../shared/tepChungTu";
import {
  KhungFormPhieu,
  ONgayChi,
  ThemChiTiet,
  OF,
  idO,
  loiNgayChi,
  nhayToiLoi,
  type DatO,
  type LoiForm,
} from "../../phieu-chi/components/KhungFormPhieu";
import { VoucherRecipientSection, loiChuyenKhoan } from "../../phieu-chi/components/VoucherRecipientSection";
import { ChonCachTra } from "../../phieu-chi/components/VoucherSegments";
import { isoToday, optional } from "../../phieu-chi/shared/helpers";
import { tenKhoan } from "../shared/helpers";

/** Danh sách mã: "a và b"; từ ba mã trở lên "a, b và c". */
function noiMa(ma: string[]): string {
  return ma.length <= 2 ? ma.join(" và ") : `${ma.slice(0, -1).join(", ")} và ${ma[ma.length - 1]}`;
}

/** Thứ tự ô trên form — con trỏ nhảy tới ô sai đầu tiên. */
const THU_TU = [
  "voucher_type",
  "cash_recipient_name",
  "company_bank_account_id",
  "beneficiary_account_holder",
  "beneficiary_account_number",
  "beneficiary_bank_name",
  "voucher_date",
  "content",
  "chung_tu",
];

export function BatchPaymentDialog({
  supplierName,
  items,
  onClose,
  onSaved,
  onMoTaiKhoan,
}: {
  supplierName: string;
  /** Các đợt đã chọn — MỌI phần tử đều có `delivery_id` (ô chọn chỉ có ở đợt đủ điều kiện). */
  items: PayableItemRow[];
  onClose: () => void;
  /** Đã lập xong (kể cả khi chứng từ tải hỏng — phiếu VẪN đã lập). */
  onSaved: (kq: VoucherBatchResult) => void;
  onMoTaiKhoan?: () => void;
}) {
  const { token } = useAuth();
  // Cùng hình dạng dữ liệu với form phiếu chi để dùng lại khối "Trả bằng". `payment_stage`/`amount`
  // chỉ để đủ kiểu — payload lượt trả dựng riêng bên dưới, không gửi hai trường này.
  const [form, setForm] = useState<PaymentVoucherBaseInput>(() => ({
    voucher_type: "cash",
    payment_stage: "final",
    voucher_date: isoToday(),
    amount: 0,
    currency: "VND",
    exchange_rate: 1,
    content: "",
    company_bank_account_id: null,
    cash_recipient_name: supplierName,
    cash_recipient_address: "",
    cash_recipient_identity: "",
    beneficiary_account_holder: supplierName,
    beneficiary_account_number: "",
    beneficiary_bank_name: "",
    beneficiary_bank_branch: "",
  }));
  const [dau] = useState(form);
  const [taiKhoan, setTaiKhoan] = useState<CompanyBankAccountRow[]>([]);
  const [dangTaiTk, setDangTaiTk] = useState(true);
  const [loiTk, setLoiTk] = useState<string | null>(null);
  const [loi, setLoi] = useState<LoiForm>({});
  const [loiChung, setLoiChung] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [moNoiDung, setMoNoiDung] = useState(false);
  // Chứng từ (UNC, biên nhận…) — MỘT bộ tệp gắn vào TỪNG phiếu vừa lập: cả lượt thường chỉ có một
  // bằng chứng đã chi, nhưng chứng từ thuộc về từng phiếu (không có "phiếu gộp").
  const [files, setFiles] = useState<File[]>([]);
  // Đã lập mà chứng từ tải hỏng: ở lại để người dùng đọc mã phiếu hỏng, nút chính thành "Xong".
  const [daLap, setDaLap] = useState<VoucherBatchResult | null>(null);

  useEffect(() => {
    if (!token) return;
    setDangTaiTk(true);
    api.accounting
      .companyAccounts(token, true, "pay")
      .then((r) => {
        setTaiKhoan(r);
        setLoiTk(null);
      })
      .catch(() => setLoiTk("Không tải được danh sách tài khoản ngân hàng."))
      .finally(() => setDangTaiTk(false));
  }, [token]);

  const set: DatO = (khoa, giaTri) => {
    setForm((f) => ({ ...f, [khoa]: giaTri }));
    setLoi((l) => (l[khoa] ? { ...l, [khoa]: undefined } : l));
  };

  const total = items.reduce((sum, it) => sum + it.con_no, 0);
  const isBank = form.voucher_type === "bank_transfer";
  const n = items.length;

  async function submit() {
    if (daLap) {
      onSaved(daLap);
      return;
    }
    if (!token || dangLuu || items.length === 0) return;
    // Cùng luật với bản trước: ngày bắt buộc (nay thêm: không sau hôm nay — A.14); tiền mặt cần
    // người nhận; chuyển khoản cần tài khoản trích + chủ / số tài khoản / ngân hàng thụ hưởng.
    const moi: LoiForm = {
      voucher_date: loiNgayChi(form.voucher_date),
      cash_recipient_name: !isBank && !(form.cash_recipient_name ?? "").trim() ? "Ghi người nhận tiền." : undefined,
      ...loiChuyenKhoan(form),
    };
    if (Object.values(moi).some(Boolean)) {
      setLoi(moi);
      nhayToiLoi(moi, THU_TU);
      return;
    }

    const payload: VoucherBatchInput = {
      items: items.map((it) => ({
        purchase_request_id: it.purchase_request_id,
        delivery_id: it.delivery_id as number,
      })),
      voucher_type: form.voucher_type,
      voucher_date: form.voucher_date,
      currency: "VND",
      exchange_rate: 1,
      content: optional(form.content),
      company_bank_account_id: isBank ? (form.company_bank_account_id ?? null) : null,
      cash_recipient_name: isBank ? null : optional(form.cash_recipient_name),
      cash_recipient_address: isBank ? null : optional(form.cash_recipient_address),
      cash_recipient_identity: isBank ? null : optional(form.cash_recipient_identity),
      beneficiary_account_holder: isBank ? optional(form.beneficiary_account_holder) : null,
      beneficiary_account_number: isBank ? optional(form.beneficiary_account_number) : null,
      beneficiary_bank_name: isBank ? optional(form.beneficiary_bank_name) : null,
      beneficiary_bank_branch: isBank ? optional(form.beneficiary_bank_branch) : null,
      bank_fee_bearer: "payer",
    };
    setDangLuu(true);
    setLoiChung(null);
    try {
      const result = await api.accounting.createVouchersBatch(token, payload);
      if (files.length) {
        // Đính vào TỪNG phiếu vừa lập — phiếu này hỏng vẫn gắn tiếp phiếu sau, để một phiếu lỗi
        // không làm những phiếu còn lại mất chứng từ.
        const hong: string[] = [];
        for (const voucher of result.vouchers) {
          for (const file of files) {
            try {
              await api.accounting.uploadVoucherAttachment(token, voucher.id, file);
            } catch {
              hong.push(voucher.code);
            }
          }
        }
        if (hong.length) {
          setDaLap(result);
          setLoiChung(
            `Đã lập ${vietSo(result.vouchers.length)} phiếu chi nhưng chứng từ tải lên thất bại ở ${noiMa([...new Set(hong)])}. Mở từng phiếu đó ở màn Phiếu chi để đính kèm lại.`,
          );
          return;
        }
      }
      onSaved(result);
    } catch (err) {
      setLoiChung(err instanceof ApiError ? err.message : "Không lập được phiếu chi.");
    } finally {
      setDangLuu(false);
    }
  }

  const goDo = () =>
    files.length > 0 || (Object.keys(dau) as (keyof PaymentVoucherBaseInput)[]).some((k) => form[k] !== dau[k]);

  return (
    <KhungFormPhieu
      tang={1}
      duongDan={
        <>
          {supplierName}
          <ChevronRight size={14} aria-hidden="true" />
          {`Trả ${n} đợt`}
        </>
      }
      tieuDe={`Trả ${n} đợt cùng lúc`}
      xemTruoc={
        <>
          {"Lập "}
          <b>{`${n} phiếu chi`}</b>
          {" tổng "}
          <b>{tien(total)}</b>
        </>
      }
      dangLuu={dangLuu}
      loiChung={loiChung}
      // Phiếu đã lập (chứng từ hỏng) thì đóng cũng là "xong" — ngăn dưới phải nạp lại.
      onDong={() => (daLap ? onSaved(daLap) : onClose())}
      chanDong={() => !daLap && goDo()}
      onSubmit={() => void submit()}
      nhanNut={daLap ? "Xong" : `Lập ${n} phiếu chi`}
      khoaNut={!daLap && n === 0}
    >
      <div className="kt-nhom">
        <table aria-label="Các đợt sẽ trả">
          <thead>
            <tr>
              <th>Đơn mua</th>
              <th>Đợt</th>
              <th className="kt-so">Còn nợ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.delivery_id}>
                <td>{it.code}</td>
                <td>{tenKhoan(it)}</td>
                <td className="kt-so">{vietSo(it.con_no)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="kt-bang-xam">
        <Info size={16} aria-hidden="true" />
        Mỗi đợt ra một phiếu chi riêng, số tiền đúng bằng còn nợ của đợt.
      </p>

      <div className="kt-f__muc">
        <div className="kt-f__tieu">Trả bằng</div>
        <ChonCachTra giaTri={form.voucher_type} onDoi={(v) => set("voucher_type", v)} khoa="voucher_type" />
        <VoucherRecipientSection form={form} set={set} loi={loi} taiKhoan={taiKhoan} dangTai={dangTaiTk} loiTai={loiTk}
          chonTaiKhoan={(v) => set("company_bank_account_id", v ? Number(v) : null)}
          coNguoiNhanMat onMoTaiKhoan={onMoTaiKhoan} />
        <div className="kt-f__hang">
          <ONgayChi value={form.voucher_date} onChange={(v) => set("voucher_date", v)} loi={loi.voucher_date} />
        </div>
      </div>

      <ThemChiTiet nhan="Thêm nội dung chung" tieu="Nội dung chung" cacO={["Nội dung"]} mo={moNoiDung}
        onMo={() => setMoNoiDung(true)}>
        <OF khoa="content" nhan="Nội dung chung" rong goi="Để trống thì mỗi phiếu tự ghi theo mã đơn và số đợt.">
          <input id={idO("content")} value={form.content} onChange={(e) => set("content", e.target.value)} />
        </OF>
      </ThemChiTiet>

      <OChungTu files={files} setFiles={setFiles} loi={loi.chung_tu}
        onLoi={(l) => setLoi((cu) => ({ ...cu, chung_tu: l ?? undefined }))}
        nhan={`Chứng từ gắn vào cả ${n} phiếu`}
        goi="Ảnh hoặc PDF tối đa 10 MB mỗi tệp, ví dụ một UNC trả gộp. Tải lên từng phiếu ngay khi lập xong." />
    </KhungFormPhieu>
  );
}
