// Lập PHIẾU CHI từ một lần gia công ngoài đã chốt (spec 2026-09-26 §5; đặc tả UI PC-5).
// Dùng CHUNG thân form với nút "Lập phiếu chi" trên đầu màn (`ThanPhieuChiRoi`, bố cục chia đôi có
// tờ phiếu xem trước), thêm khối đầu "Việc gia công" (Việc | Số chốt). Số tiền gõ theo hoá đơn của nhà
// gia công; người nhận sửa được (nhà gia công, hoặc người kế hoạch cầm tiền mặt đi trả). Không có ô nhà cung cấp công nợ — phiếu này không vào 331.
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
import { homNayVN } from "../../../../utils/ky";
import { Cum, TheNho } from "../../shared/Cum";
import { HangDoiChieu, KhoiForm } from "../../shared/KhungFormPhieu";
import { THU_TU_O_MOI } from "../components/KhoiPhieuChi";
import { KhungFormPhieu, loiNgayChi, nhayToiLoi, type DatO, type LoiForm } from "../components/KhungFormPhieu";
import { BanXemPhieuChi, ThanPhieuChiRoi } from "../components/ThanPhieuChiRoi";
import { taiChungTuSauKhiLap } from "../components/VoucherAttachSection";
import { loiChuyenKhoan } from "../components/VoucherRecipientSection";
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
    // Gia công không có đơn giá (chủ chốt 07/10/2026): kế toán gõ tiền theo hoá đơn nhà gia công.
    amount: 0,
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
    if (!form.content.trim()) l.content = "Ghi lý do chi.";
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
      nhayToiLoi(l, THU_TU_O_MOI);
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

  // Cùng giao diện với nút "Lập phiếu chi" trên đầu màn (`ThanPhieuChiRoi`), thêm dải tóm tắt việc.
  return (
    <KhungFormPhieu
      duongDan={<>Phiếu chi &gt; Lập mới &gt; Gia công {row.nhan_nguon || row.lsx_ma}</>}
      tieuDe="Lập phiếu chi"
      phuDe={
        <span className="kt-tag">
          Nhà gia công <b>{row.nha_cung_cap_ten}</b>
        </span>
      }
      xemTruoc={daLap ? <>Phiếu <b>{daLap.code}</b> đã lập.</> : "Lập xong không sửa được, chỉ hủy được."}
      dangLuu={busy}
      loiChung={err}
      onDong={onClose}
      chanDong={() => !daLap && (JSON.stringify(form) !== goc.current || files.length > 0)}
      onSubmit={() => void save()}
      nhanNut={daLap ? "Mở phiếu đã lập" : undefined}
      banXem={<BanXemPhieuChi form={form} taiKhoan={tkList} soChungTu={files.length} nguon="gia_cong_ngoai" />}
    >
      <KhoiForm tieu="Việc gia công">
        <HangDoiChieu
          o={[
            { nhan: "Việc", giaTri: <Cum>{viec.map((v) => <TheNho key={v}>{v}</TheNho>)}</Cum> },
            { nhan: "Số chốt", giaTri: soChot(row), chot: true },
          ]}
        />
      </KhoiForm>
      <ThanPhieuChiRoi form={form} set={set} loi={loi} onDoiCach={chonCach} taiKhoan={tkList}
        dangTai={tkDangTai}
        loiTai={
          tkLoi
            ? "Không đọc được danh sách tài khoản công ty (thiếu quyền Tài khoản ngân hàng). Chọn Tiền mặt, hoặc nhờ kế toán có quyền lập giúp."
            : null
        }
        onMoTaiKhoan={onMoTaiKhoan}
        files={files} setFiles={setFiles} loiTep={loiTep} setLoiTep={setLoiTep}
        goiSoTien="Gõ theo hoá đơn của nhà gia công."
        goiY={[{ ten: row.nha_cung_cap_ten, phu: "nhà gia công" }]} />
    </KhungFormPhieu>
  );
}
