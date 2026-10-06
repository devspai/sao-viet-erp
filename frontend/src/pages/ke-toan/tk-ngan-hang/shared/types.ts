// Kiểu dùng chung của màn Tài khoản ngân hàng (TK-1 … TK-4). Tab tài khoản nhà cung cấp đã gỡ
// (lỗi 14) — màn chỉ còn tài khoản CÔNG TY.
import type { CompanyBankAccountRow } from "../../../../api/client";

export type TaiKhoan = CompanyBankAccountRow;

/** Thu/chi ĐÃ XONG của một tài khoản trong kỳ (tài khoản vắng ở máy chủ ⇒ 0). */
export type SoLieuTk = { thu: number; chi: number; so_phieu: number };

/** Nút "Loại tiền": VND | USD | Khác (Khác ⇒ gõ mã 3 chữ cái). */
export type LoaiTien = "VND" | "USD" | "khac";

/** Bản nháp form thêm / sửa (TK-3). Không còn ô "Đang hoạt động" — đổi trạng thái là thao tác riêng (TK-4). */
export type FormTaiKhoan = {
  bank_name: string;
  account_number: string;
  account_holder: string;
  bank_branch: string;
  loaiTien: LoaiTien;
  tienKhac: string;
  use_for_receipts: boolean;
  use_for_payments: boolean;
  note: string;
};

/** Một dòng của tab "Phiếu qua tài khoản": phiếu chi đã chi hoặc phiếu thu đã thu. */
export type DongPhieuTk = {
  loai: "chi" | "thu";
  id: number;
  ma: string;
  /** Ngày chứng từ (ISO). */
  ngay: string;
  noiDung: string;
  /** Số tiền quy VND (cùng cột thống kê thu/chi trong kỳ dùng). */
  soTien: number;
};
