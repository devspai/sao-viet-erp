// Hàm thuần của màn Tài khoản ngân hàng (TK-1 … TK-3): cách viết số, chữ viết tắt ngân hàng, thứ tự
// thẻ, số liệu kỳ, gộp hai sổ phiếu, kiểm form và payload gửi máy chủ.
import type {
  CompanyBankAccountInput,
  PaymentReceiptRow,
  PaymentVoucherRow,
  TaiKhoanThongKe,
} from "../../../../api/client";
import type { LoiForm } from "../../shared/KhungFormPhieu";
import { noiKhongTrung } from "../../shared/chiTietCongNo";
import { vietSo } from "../../shared/dinhDang";
import type { DongPhieuTk, FormTaiKhoan, SoLieuTk, TaiKhoan } from "./types";

/** Mã màn — khoá nhớ kỳ và dấu `man` trên URL (trùng id AppShell). */
export const MAN = "ke-toan-tai-khoan-ngan-hang";

/** "933134668" → "9331 3466 8" (bỏ khoảng trắng gõ sẵn rồi nhóm 4 ký tự). */
export function nhomBon(so: string): string {
  return soChep(so).match(/.{1,4}/g)?.join(" ") ?? "";
}

/** Số để chép dán vào app ngân hàng — không có khoảng trắng. */
export function soChep(so: string): string {
  return so.replace(/\s+/g, "");
}

/** "+120.000.000" (thu) / "−86.500.000" (chi, dấu trừ thật U+2212); 0 thì "0", không dấu. */
export function soTienCoDau(n: number, loai: "thu" | "chi"): string {
  if (!n) return "0";
  return `${loai === "thu" ? "+" : "−"}${vietSo(n)}`;
}

/** Chữ trong vòng 40px của thẻ (đặc tả TK-1: chữ, không logo). Không giữ bảng tên ngân hàng cứng —
 *  danh mục là động: mã trong ngoặc "(MB)" nếu có; tên ngắn ≤ 4 ký tự giữ nguyên; tên nhiều chữ lấy
 *  chữ đầu (bỏ "Ngân hàng", "TMCP"); một chữ dài lấy các chữ HOA nếu có từ 2, không thì 3 chữ đầu. */
export function vietTat(ten: string): string {
  const t = ten.trim();
  const ma = maNganHang(t);
  if (ma) return ma;
  // Phần sau " - " / "CN" / "Chi nhánh" là tên chi nhánh, không thuộc tên ngân hàng; dấu câu không là chữ.
  const tu = t
    .split(/\s[-–]\s|\bCN\b|chi nhánh/i)[0]
    .replace(/ngân hàng|thương mại cổ phần|tmcp/gi, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (tu.length === 0) return "?";
  if (tu.length > 1) return tu.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  const w = tu[0];
  if (w.length <= 4) return w.toUpperCase();
  const hoa = w.replace(/[^A-ZĐ]/g, "");
  return hoa.length >= 2 ? hoa.slice(0, 4) : w.slice(0, 3).toUpperCase();
}

/** Mã ngân hàng người dùng ghi trong ngoặc: "Ngân hàng TMCP Quân đội (MB)" → "MB"; không có thì null. */
export function maNganHang(ten: string): string | null {
  const ngoac = ten.match(/\(([^()]{2,6})\)/);
  return ngoac ? ngoac[1].trim().toUpperCase() : null;
}

/** Tiêu đề ngăn, `aria-label` thẻ, câu hỏi TK-4: mã trong ngoặc nếu có, không thì NGUYÊN tên ngân hàng
 *  (khớp cách Phiếu chi / Phiếu thu ghi tài khoản) — "MB 9331 3466 8", "Vietcombank 0281 0004 5678 9".
 *  Chữ viết tắt suy ra (`vietTat`) chỉ dùng cho vòng 40px. Khác `tenTaiKhoan` của `shared/BoLocPhieu`. */
export function tieuDeTaiKhoan(r: TaiKhoan): string {
  return `${maNganHang(r.bank_name) ?? r.bank_name.trim()} ${nhomBon(r.account_number)}`;
}

/** Tài khoản ngừng dùng gom cuối; trong mỗi nhóm giữ thứ tự máy chủ. */
export function xepTaiKhoan(ds: TaiKhoan[]): TaiKhoan[] {
  return [...ds.filter((r) => r.is_active), ...ds.filter((r) => !r.is_active)];
}

export function soLieuTheoId(ds: TaiKhoanThongKe[]): Map<number, SoLieuTk> {
  return new Map(ds.map((x) => [x.tai_khoan_id, { thu: x.thu, chi: x.chi, so_phieu: x.so_phieu }]));
}

/** Số trong kỳ của một tài khoản. Máy chủ BỎ tài khoản không có phiếu ⇒ điền 0; chưa tải (null) thì
 *  trả null — không giả làm 0. */
export function soLieuCua(m: Map<number, SoLieuTk> | null, id: number): SoLieuTk | null {
  if (!m) return null;
  return m.get(id) ?? { thu: 0, chi: 0, so_phieu: 0 };
}

export function dongChi(v: PaymentVoucherRow): DongPhieuTk {
  return { loai: "chi", id: v.id, ma: v.code, ngay: v.voucher_date, noiDung: v.content, soTien: v.amount_vnd };
}

export function dongThu(r: PaymentReceiptRow): DongPhieuTk {
  return { loai: "thu", id: r.id, ma: r.code, ngay: r.receipt_date, noiDung: r.content, soTien: r.amount_vnd };
}

/** Phần đã tải của một sổ (máy chủ cắt trang, `total` là tổng của sổ trong kỳ). null = không có quyền xem. */
export type NguonPhieu = { rows: DongPhieuTk[]; total: number } | null;

/** Gộp hai sổ: bỏ trùng loại+id, ngày giảm dần (cùng ngày giữ thứ tự máy chủ, phiếu chi trước).
 *  Sổ còn trang chưa tải thì phiếu của sổ kia CŨ HƠN phiếu cuối đã tải của nó chưa chắc đứng đúng chỗ
 *  — để dành tới lần "Xem thêm" sau, không hiện sai thứ tự rồi chen vào giữa. */
export function gopPhieu(chi: NguonPhieu, thu: NguonPhieu): DongPhieuTk[] {
  const nguon = [chi, thu].filter((n): n is NonNullable<NguonPhieu> => n != null);
  const tat = noiKhongTrung<DongPhieuTk>([], nguon.flatMap((n) => n.rows), (d) => `${d.loai}-${d.id}`);
  const moc = nguon
    .filter((n) => n.rows.length > 0 && n.rows.length < n.total)
    .map((n) => n.rows.reduce((min, d) => (d.ngay < min ? d.ngay : min), n.rows[0].ngay))
    .reduce((max, x) => (x > max ? x : max), "");
  return tat.filter((d) => d.ngay >= moc).sort((a, b) => (a.ngay < b.ngay ? 1 : a.ngay > b.ngay ? -1 : 0));
}

export function formTrong(): FormTaiKhoan {
  return {
    bank_name: "",
    account_number: "",
    account_holder: "",
    bank_branch: "",
    loaiTien: "VND",
    tienKhac: "",
    use_for_receipts: true,
    use_for_payments: true,
    note: "",
  };
}

export function formTuTaiKhoan(r: TaiKhoan): FormTaiKhoan {
  const coSan = r.currency === "VND" || r.currency === "USD";
  return {
    bank_name: r.bank_name,
    account_number: r.account_number,
    account_holder: r.account_holder,
    bank_branch: r.bank_branch,
    loaiTien: coSan ? (r.currency as "VND" | "USD") : "khac",
    tienKhac: coSan ? "" : r.currency,
    use_for_receipts: r.use_for_receipts,
    use_for_payments: r.use_for_payments,
    note: r.note ?? "",
  };
}

/** Thứ tự ô trên form — để con trỏ nhảy tới ô sai ĐẦU TIÊN. */
export const THU_TU_O = ["bank_name", "account_number", "account_holder", "bank_branch", "tien_khac", "dung"];

const maTien = (f: FormTaiKhoan) => (f.loaiTien === "khac" ? f.tienKhac.trim().toUpperCase() : f.loaiTien);

/** Lỗi từng ô (A.2). Máy chủ kiểm lại y luật này (`_clean_bank_account`). */
export function loiFormTaiKhoan(f: FormTaiKhoan): LoiForm {
  const loi: LoiForm = {};
  if (!f.bank_name.trim()) loi.bank_name = "Nhập tên ngân hàng.";
  if (!f.account_number.trim()) loi.account_number = "Nhập số tài khoản.";
  if (!f.account_holder.trim()) loi.account_holder = "Nhập tên chủ tài khoản.";
  if (!f.bank_branch.trim()) loi.bank_branch = "Nhập chi nhánh.";
  if (f.loaiTien === "khac" && !/^[A-Z]{3}$/.test(maTien(f))) loi.tien_khac = "Mã loại tiền gồm 3 chữ cái, ví dụ EUR.";
  if (!f.use_for_receipts && !f.use_for_payments) loi.dung = "Chọn ít nhất một: Nhận tiền hoặc Trả tiền.";
  return loi;
}

/** Payload thêm / sửa — đủ đúng các trường bản cũ gửi. `is_active` không còn ô trên form: thêm mới
 *  là đang dùng, sửa thì giữ nguyên trạng thái đang có (máy chủ ghi đè cột này từ payload). */
export function payloadTaiKhoan(f: FormTaiKhoan, dangSua: TaiKhoan | null): CompanyBankAccountInput {
  return {
    account_holder: f.account_holder.trim(),
    account_number: f.account_number.trim(),
    bank_name: f.bank_name.trim(),
    bank_branch: f.bank_branch.trim(),
    currency: maTien(f),
    is_default: false,
    is_active: dangSua ? dangSua.is_active : true,
    use_for_receipts: f.use_for_receipts,
    use_for_payments: f.use_for_payments,
    note: f.note.trim() || null,
  };
}
