// Lập PHIẾU CHI từ một lần gia công ngoài đã chốt (spec 2026-09-26 §5; đặc tả UI PC-5).
// Dùng đúng khung PC-3 (ngăn `NganPhai`, nhóm "Chi cho ai và bao nhiêu" / "Trả bằng" / "Khi nào"),
// đầu ngăn có dải chỉ đọc Việc — Số chốt — Đơn giá — Thành tiền. Số tiền SỬA ĐƯỢC (thành tiền trên
// lần chỉ là gợi ý, phiếu chi là số thật đã trả), người nhận sửa được (nhà gia công, hoặc người kế
// hoạch cầm tiền mặt đi trả). Không có ô nhà cung cấp công nợ — phiếu này không vào 331.
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  type CompanyBankAccountRow,
  type GiaCongChoChi,
  type PaymentVoucherBaseInput,
  type PaymentVoucherRow,
  type PaymentVoucherType,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { amountInWords } from "../../../../utils/format";
import { homNayVN } from "../../../../utils/ky";
import { Cum, TheNho } from "../../shared/Cum";
import { tien } from "../../shared/dinhDang";
import { KhungFormPhieu, OF, OTienPhieu, THU_TU_O, ThemChiTiet, idO, loiNgayChi, nhayToiLoi, ONgayChi, type DatO, type LoiForm } from "../components/KhungFormPhieu";
import { taiChungTuSauKhiLap, VoucherAttachSection } from "../components/VoucherAttachSection";
import { loiChuyenKhoan, VoucherRecipientSection } from "../components/VoucherRecipientSection";
import { cacOChiTiet, VoucherRefSection } from "../components/VoucherRefSection";
import { ChonCachTra } from "../components/VoucherSegments";
import { cacViec, soChot } from "../shared/giaCong";
import { optional } from "../shared/helpers";
import "../../ke-toan.css";

export function LapPhieuChiGiaCongModal({
  row,
  onClose,
  onDone,
  onMoTaiKhoan,
}: {
  row: GiaCongChoChi;
  onClose: () => void;
  onDone: (pc: PaymentVoucherRow) => void;
  onMoTaiKhoan?: () => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<PaymentVoucherBaseInput>(() => ({
    voucher_type: "cash",
    payment_stage: "other",
    voucher_date: homNayVN(),
    amount: row.thanh_tien != null ? Math.round(row.thanh_tien) : 0,
    currency: "VND",
    exchange_rate: 1,
    content: `Gia công ${row.ten_viec} — ${row.nhan_nguon || row.lsx_ma} — ${row.nha_cung_cap_ten}`,
    note: null,
    cash_recipient_name: row.nha_cung_cap_ten,
    cash_recipient_address: null,
    cash_recipient_identity: null,
    company_bank_account_id: null,
    beneficiary_account_holder: row.nha_cung_cap_ten,
    beneficiary_account_number: null,
    beneficiary_bank_name: null,
    beneficiary_bank_branch: null,
    bank_fee_bearer: "payer",
  }));
  const goc = useRef(JSON.stringify(form));
  const [tkList, setTkList] = useState<CompanyBankAccountRow[]>([]);
  const [tkDangTai, setTkDangTai] = useState(false);
  const [tkLoi, setTkLoi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loi, setLoi] = useState<LoiForm>({});
  const [moChiTiet, setMoChiTiet] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loiTep, setLoiTep] = useState<string | null>(null);
  const [daLap, setDaLap] = useState<PaymentVoucherRow | null>(null);
  const chuyenKhoan = form.voucher_type === "bank_transfer";

  // Chỉ nạp tài khoản công ty khi chọn chuyển khoản — API này đòi quyền Tài khoản ngân hàng.
  useEffect(() => {
    if (!chuyenKhoan || !token) return;
    let alive = true;
    setTkDangTai(true);
    api.accounting
      .companyAccounts(token, true, "pay")
      .then((rows) => {
        if (!alive) return;
        setTkList(rows);
        setTkLoi(false);
        if (rows.length === 1) {
          setForm((f) => (f.company_bank_account_id ? f : { ...f, company_bank_account_id: rows[0].id }));
        }
      })
      .catch(() => {
        if (!alive) return;
        setTkList([]);
        setTkLoi(true);
      })
      .finally(() => {
        if (alive) setTkDangTai(false);
      });
    return () => { alive = false; };
  }, [chuyenKhoan, token]);

  const set: DatO = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setLoi((l) => (l[key] ? { ...l, [key]: undefined } : l));
  };

  function chonCach(v: PaymentVoucherType) {
    set("voucher_type", v);
    setLoi({});
  }

  function kiemTra(): LoiForm {
    const l: LoiForm = {};
    if (!(Math.round(Number(form.amount)) > 0)) l.amount = "Số tiền chi phải lớn hơn 0.";
    if (!form.cash_recipient_name?.trim()) l.cash_recipient_name = "Nhập người nhận tiền.";
    if (!form.content.trim()) l.content = "Nhập nội dung chi.";
    const loiNgay = loiNgayChi(form.voucher_date);
    if (loiNgay) l.voucher_date = loiNgay;
    return { ...l, ...loiChuyenKhoan(form) };
  }

  async function save() {
    if (!token || busy) return;
    if (daLap) {
      onDone(daLap);
      return;
    }
    const l = kiemTra();
    setLoi(l);
    if (Object.values(l).some(Boolean)) {
      nhayToiLoi(l, THU_TU_O);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const pc = await api.accounting.createVoucher(token, {
        source_type: "gia_cong_ngoai",
        gia_cong_ngoai_id: row.gia_cong_ngoai_id,
        voucher_type: form.voucher_type,
        payment_stage: "other",
        voucher_date: form.voucher_date,
        amount: Math.round(Number(form.amount)),
        currency: "VND",
        exchange_rate: 1,
        content: form.content.trim(),
        note: optional(form.note),
        invoice_number: optional(form.invoice_number),
        invoice_date: optional(form.invoice_date),
        cash_recipient_name: (form.cash_recipient_name ?? "").trim(),
        cash_recipient_address: chuyenKhoan ? null : optional(form.cash_recipient_address),
        cash_recipient_identity: chuyenKhoan ? null : optional(form.cash_recipient_identity),
        company_bank_account_id: chuyenKhoan ? Number(form.company_bank_account_id) : null,
        beneficiary_account_holder: chuyenKhoan ? (form.beneficiary_account_holder ?? "").trim() : null,
        beneficiary_account_number: chuyenKhoan ? (form.beneficiary_account_number ?? "").trim() : null,
        beneficiary_bank_name: chuyenKhoan ? (form.beneficiary_bank_name ?? "").trim() : null,
        beneficiary_bank_branch: chuyenKhoan ? optional(form.beneficiary_bank_branch) : null,
        bank_fee_bearer: chuyenKhoan ? "payer" : null,
      });
      if (files.length) {
        const hong = await taiChungTuSauKhiLap(token, pc, files);
        if (hong) {
          setDaLap(pc);
          setErr(hong);
          setBusy(false);
          return;
        }
      }
      onDone(pc);
    } catch (e) {
      // 409 (đã có phiếu chi) và 422 (chưa chốt, huỷ, thiếu ô) — câu tiếng Việt của máy chủ.
      setErr(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  }

  const viec = cacViec(row.ten_viec);
  // Người xem không có quyền xem tiền: máy chủ trả null — ẩn hẳn ô tiền, không hiện "—".
  const tomTat = [
    { nhan: "Việc", giaTri: <Cum>{viec.map((v) => <TheNho key={v}>{v}</TheNho>)}</Cum> },
    { nhan: "Số chốt", giaTri: soChot(row) },
    ...(row.don_gia != null ? [{ nhan: "Đơn giá", giaTri: tien(row.don_gia) }] : []),
    ...(row.thanh_tien != null ? [{ nhan: "Thành tiền", giaTri: <b>{tien(row.thanh_tien)}</b> }] : []),
  ];
  const ten = form.cash_recipient_name?.trim();

  return (
    <KhungFormPhieu
      duongDan={<>Lập phiếu chi &gt; {row.nhan_nguon || row.lsx_ma}</>}
      tieuDe={row.nha_cung_cap_ten}
      tomTat={tomTat}
      xemTruoc={
        daLap ? (
          <>Phiếu <b>{daLap.code}</b> đã lập.</>
        ) : form.amount > 0 ? (
          <>
            Chi <b>{tien(form.amount)}</b> {chuyenKhoan ? "chuyển khoản" : "tiền mặt"}
            {ten ? <> cho <b>{ten}</b></> : null}. Lập xong không sửa được, chỉ hủy được.
          </>
        ) : (
          "Lập xong không sửa được, chỉ hủy được."
        )
      }
      dangLuu={busy}
      loiChung={err}
      onDong={onClose}
      chanDong={() => !daLap && (JSON.stringify(form) !== goc.current || files.length > 0)}
      onSubmit={() => void save()}
      nhanNut={daLap ? "Mở phiếu đã lập" : undefined}
    >
      <div className="kt-f__muc">
        <div className="kt-f__tieu">Chi cho ai và bao nhiêu</div>
        <OF khoa="cash_recipient_name" nhan="Chi cho" batBuoc rong loi={loi.cash_recipient_name}
          goi="Nhà gia công, hoặc người cầm tiền mặt đi trả.">
          <input id={idO("cash_recipient_name")} value={form.cash_recipient_name ?? ""}
            aria-invalid={loi.cash_recipient_name ? true : undefined}
            onChange={(e) => set("cash_recipient_name", e.target.value)} />
        </OF>
        <OF khoa="amount" nhan="Số tiền" batBuoc loi={loi.amount}
          goi={
            <>
              {form.amount > 0 && `${amountInWords(form.amount)}. `}
              {row.thanh_tien != null
                ? "Điền sẵn bằng thành tiền. Sửa theo số thật đã trả."
                : "Gõ số tiền thật đã trả cho nhà gia công."}
            </>
          }>
          <OTienPhieu khoa="amount" value={form.amount} onChange={(v) => set("amount", v)} loi={!!loi.amount} />
        </OF>
        <OF khoa="content" nhan="Nội dung chi" batBuoc rong loi={loi.content}>
          <input id={idO("content")} value={form.content} aria-invalid={loi.content ? true : undefined}
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
          taiKhoan={tkList}
          dangTai={tkDangTai}
          loiTai={
            tkLoi
              ? "Không đọc được danh sách tài khoản công ty (thiếu quyền Tài khoản ngân hàng). Chọn Tiền mặt, hoặc nhờ kế toán có quyền lập giúp."
              : null
          }
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
