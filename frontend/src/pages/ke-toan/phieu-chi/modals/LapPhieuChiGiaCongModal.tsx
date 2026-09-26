// Lập PHIẾU CHI từ một lần gia công ngoài đã chốt (spec 2026-09-26 §5) — khuôn của
// `LapPhieuChiModal` (tạm ứng lương). Khác: số tiền SỬA ĐƯỢC (con số trên lần chỉ là gợi ý, phiếu
// chi là số thật đã trả), người nhận sửa được (nhà gia công, hoặc người kế hoạch cầm tiền mặt đi
// trả). Không có ô nhà cung cấp công nợ — phiếu này không vào 331.
import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  type CompanyBankAccountRow,
  type GiaCongChoChi,
  type PaymentVoucherRow,
  type PaymentVoucherType,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { nhanDonVi } from "../../../lsxBuoc";
import "../../../nhan-su.css";
import "../../../luong.css";

const homNay = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD theo giờ máy

export function LapPhieuChiGiaCongModal({
  row,
  onClose,
  onDone,
}: {
  row: GiaCongChoChi;
  onClose: () => void;
  onDone: (pc: PaymentVoucherRow) => void;
}) {
  const { token } = useAuth();
  const ngayMax = homNay();
  const [vtype, setVtype] = useState<PaymentVoucherType>("cash");
  const [ngay, setNgay] = useState(ngayMax);
  const [soTien, setSoTien] = useState(row.thanh_tien != null ? String(row.thanh_tien) : "");
  const [nguoiNhan, setNguoiNhan] = useState(row.nha_cung_cap_ten);
  const [noiDung, setNoiDung] = useState(
    `Gia công ${row.ten_viec} — ${row.lsx_ma} — ${row.nha_cung_cap_ten}`,
  );
  const [ghiChu, setGhiChu] = useState("");
  const [diaChi, setDiaChi] = useState("");
  const [giayTo, setGiayTo] = useState("");
  const [tkCty, setTkCty] = useState<number | "">("");
  const [tkList, setTkList] = useState<CompanyBankAccountRow[]>([]);
  const [tkLoi, setTkLoi] = useState(false);
  const [thHolder, setThHolder] = useState(row.nha_cung_cap_ten);
  const [thSo, setThSo] = useState("");
  const [thNganHang, setThNganHang] = useState("");
  const [thChiNhanh, setThChiNhanh] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const chuyenKhoan = vtype === "bank_transfer";

  // Chỉ nạp tài khoản công ty khi chọn chuyển khoản — API này đòi quyền Tài khoản ngân hàng.
  useEffect(() => {
    if (!chuyenKhoan || !token) return;
    let alive = true;
    api.accounting
      .companyAccounts(token, true, "pay")
      .then((rows) => {
        if (!alive) return;
        setTkList(rows);
        setTkLoi(false);
        if (rows.length === 1) setTkCty(rows[0].id);
      })
      .catch(() => {
        if (!alive) return;
        setTkList([]);
        setTkLoi(true);
      });
    return () => { alive = false; };
  }, [chuyenKhoan, token]);

  async function save() {
    if (!token) return;
    const tien = Math.round(Number(soTien));
    if (!(tien > 0)) return setErr("Số tiền chi phải lớn hơn 0.");
    if (!nguoiNhan.trim()) return setErr("Nhập người nhận tiền.");
    if (!noiDung.trim()) return setErr("Nhập nội dung chi.");
    if (ngay > ngayMax) return setErr("Ngày chứng từ không được ở tương lai.");
    if (chuyenKhoan && (tkCty === "" || !thHolder.trim() || !thSo.trim() || !thNganHang.trim())) {
      return setErr("Chuyển khoản phải có tài khoản trích nợ và đủ tên · số tài khoản · ngân hàng thụ hưởng.");
    }
    setBusy(true);
    setErr(null);
    try {
      const pc = await api.accounting.createVoucher(token, {
        source_type: "gia_cong_ngoai",
        gia_cong_ngoai_id: row.gia_cong_ngoai_id,
        voucher_type: vtype,
        payment_stage: "other",
        voucher_date: ngay,
        amount: tien,
        currency: "VND",
        exchange_rate: 1,
        content: noiDung.trim(),
        note: ghiChu.trim() || null,
        cash_recipient_name: nguoiNhan.trim(),
        cash_recipient_address: chuyenKhoan ? null : diaChi.trim() || null,
        cash_recipient_identity: chuyenKhoan ? null : giayTo.trim() || null,
        company_bank_account_id: chuyenKhoan ? Number(tkCty) : null,
        beneficiary_account_holder: chuyenKhoan ? thHolder.trim() : null,
        beneficiary_account_number: chuyenKhoan ? thSo.trim() : null,
        beneficiary_bank_name: chuyenKhoan ? thNganHang.trim() : null,
        beneficiary_bank_branch: chuyenKhoan ? thChiNhanh.trim() || null : null,
        bank_fee_bearer: chuyenKhoan ? "payer" : null,
      });
      onDone(pc);
    } catch (e) {
      // 409 (đã có phiếu chi) · 422 (chưa chốt / huỷ / thiếu ô) — câu tiếng Việt của máy chủ.
      setErr(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="ns-modal" role="dialog" aria-modal="true">
      <div className="ns-modal__box">
        <header className="ns-modal__head">
          <h2>Lập phiếu chi — gia công {row.lsx_ma}</h2>
          <button className="ns-modal__x" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        <div className="ns-modal__body lg-pc-body">
          {err && <div className="banner banner--error">{err}</div>}
          <div className="lg-pc-ro">
            <div className="lg-pc-ro__cell">
              <span className="lg-pc-ro__lbl">Nhà gia công</span>
              <b className="lg-pc-ro__val">{row.nha_cung_cap_ten}</b>
            </div>
            <div className="lg-pc-ro__cell">
              <span className="lg-pc-ro__lbl">Việc</span>
              <b className="lg-pc-ro__val">{row.ten_viec}</b>
            </div>
            <div className="lg-pc-ro__cell">
              <span className="lg-pc-ro__lbl">Số chốt</span>
              <b className="lg-pc-ro__val">
                {row.sl_cuoi.toLocaleString("vi-VN")} {row.don_vi ? nhanDonVi(row.don_vi) : ""}
              </b>
            </div>
          </div>
          <p className="lg-pc-hint">
            {row.thanh_tien != null
              ? `Số tiền điền sẵn = số chốt × đơn giá (${(row.don_gia ?? 0).toLocaleString("vi-VN")}đ). Sửa theo số thật đã trả.`
              : "Gõ số tiền thật đã trả cho nhà gia công."}
          </p>

          <div className="ns-grid">
            <label className="ns-field">
              <span className="ns-field__label">Số tiền (đ) *</span>
              <input inputMode="numeric" value={soTien} onChange={(e) => setSoTien(e.target.value)} />
            </label>
            <label className="ns-field">
              <span className="ns-field__label">Người nhận tiền *</span>
              <input value={nguoiNhan} onChange={(e) => setNguoiNhan(e.target.value)} />
            </label>
            <label className="ns-field">
              <span className="ns-field__label">Hình thức chi *</span>
              <select value={vtype} onChange={(e) => setVtype(e.target.value as PaymentVoucherType)}>
                <option value="cash">Tiền mặt</option>
                <option value="bank_transfer">Chuyển khoản</option>
              </select>
            </label>
            <label className="ns-field">
              <span className="ns-field__label">Ngày chứng từ *</span>
              <input type="date" max={ngayMax} value={ngay} onChange={(e) => setNgay(e.target.value)} />
            </label>
          </div>

          {chuyenKhoan && (
            <>
              {tkLoi && (
                <div className="banner banner--warn">
                  Không đọc được danh sách tài khoản công ty (thiếu quyền Tài khoản ngân hàng). Chọn
                  “Tiền mặt”, hoặc nhờ kế toán có quyền lập giúp.
                </div>
              )}
              <label className="ns-field">
                <span className="ns-field__label">Tài khoản trích nợ *</span>
                <select value={tkCty} onChange={(e) => setTkCty(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">— chọn tài khoản công ty —</option>
                  {tkList.map((t) => (
                    <option key={t.id} value={t.id}>{t.bank_name} · {t.account_number} · {t.currency}</option>
                  ))}
                </select>
              </label>
              <div className="ns-grid">
                <label className="ns-field">
                  <span className="ns-field__label">Chủ tài khoản nhận *</span>
                  <input value={thHolder} onChange={(e) => setThHolder(e.target.value)} />
                </label>
                <label className="ns-field">
                  <span className="ns-field__label">Số tài khoản nhận *</span>
                  <input inputMode="numeric" value={thSo} onChange={(e) => setThSo(e.target.value)} />
                </label>
                <label className="ns-field">
                  <span className="ns-field__label">Ngân hàng nhận *</span>
                  <input value={thNganHang} onChange={(e) => setThNganHang(e.target.value)} />
                </label>
                <label className="ns-field">
                  <span className="ns-field__label">Chi nhánh</span>
                  <input value={thChiNhanh} onChange={(e) => setThChiNhanh(e.target.value)} />
                </label>
              </div>
            </>
          )}
          {!chuyenKhoan && (
            <div className="ns-grid">
              <label className="ns-field">
                <span className="ns-field__label">Địa chỉ người nhận</span>
                <input value={diaChi} onChange={(e) => setDiaChi(e.target.value)} />
              </label>
              <label className="ns-field">
                <span className="ns-field__label">CCCD/Giấy tờ</span>
                <input value={giayTo} onChange={(e) => setGiayTo(e.target.value)} />
              </label>
            </div>
          )}
          <label className="ns-field">
            <span className="ns-field__label">Nội dung chi *</span>
            <input value={noiDung} onChange={(e) => setNoiDung(e.target.value)} />
          </label>
          <label className="ns-field">
            <span className="ns-field__label">Ghi chú</span>
            <input value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
          </label>
        </div>
        <footer className="ns-modal__foot">
          <span className="lg-pc-warn">
            Lập phiếu chi là tiền đã ra khỏi két. Lập xong không sửa được, chỉ huỷ được.
          </span>
          <div className="ns-modal__footright">
            <button className="btn btn--ghost" onClick={onClose} disabled={busy}>Hủy</button>
            <button className="btn btn--primary" onClick={save} disabled={busy}>
              {busy ? "Đang lập…" : "Lập phiếu chi"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
