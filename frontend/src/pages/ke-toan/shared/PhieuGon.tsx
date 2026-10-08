/** Mảnh chung của hai sổ phiếu (Phiếu chi, Phiếu thu) theo phương án A (07/10/2026,
 *  docs/mockups/ke-toan-gon-3-phuong-an.html): dòng Cộng cuối lưới, ô Ghi chú, ô số "–", tab
 *  "Chứng từ gốc" và các ô của cột thuộc tính trong ngăn kiểu 3. */
import type { ReactNode } from "react";

import { Cum, TheNho } from "./Cum";
import { ngayGio, vietSo } from "./dinhDang";
import type { TabNgan } from "./NganPhai";
import type { TheLoc as SoTheLoc } from "../../../api/client";

/** Dòng "Cộng n phiếu đã chi" cuối `tbody` của lưới `.kt-g`. Không có lớp `kt-dong` ⇒ không nhận
 *  phím, không mở ngăn. `truoc` = số cột trước ô tiền, `sau` = số cột sau (≥ 1: ô tiền tràn sang đó). */
export function DongCong({ so, chuXong, tongTien, truoc, sau }: {
  so: number;
  /** "đã chi" / "đã thu". */
  chuXong: string;
  tongTien: number;
  truoc: number;
  sau: number;
}) {
  return (
    <tr className="kt-g__cong">
      <td colSpan={truoc}>
        {`Cộng ${vietSo(so)} phiếu ${chuXong}`}
        <span className="kt-g__mo3" style={{ marginLeft: 8 }}>không tính phiếu đã hủy</span>
      </td>
      {/* Tổng có thể tới chục tỷ, rộng hơn cột tiền: không cắt "…" mà tràn sang ô trống bên phải. */}
      <td className="kt-g__so kt-g__tran">{vietSo(tongTien)}</td>
      {Array.from({ length: sau }, (_, i) => <td key={i} />)}
    </tr>
  );
}

/** Số phiếu đã xong KHỚP với tổng tiền máy chủ trả (`total_paid_amount` / `total_received_amount`
 *  cộng trên bộ lọc CÓ thẻ đang chọn và ô Chứng từ, còn `the_loc` đếm trên nền KHÔNG có hai thứ đó).
 *  null = thẻ đang xem không có phiếu đã xong (Đã hủy, Chờ thu) ⇒ không vẽ dòng Cộng. */
export function soPhieuCong(o: {
  the: string;
  chungTu: "co" | "thieu" | undefined;
  n: SoTheLoc | null;
  /** Tổng số dòng của bảng (mọi trang). */
  tong: number;
}): number | null {
  // Thẻ "Đã chi"/"Đã thu" và "Thiếu chứng từ" chỉ chứa phiếu đã xong ⇒ số dòng chính là số phiếu.
  if (o.the === "xong" || o.the === "thieu") return o.tong;
  if (o.the !== "tat_ca" || !o.n) return null;
  if (o.chungTu === "thieu") return o.n.thieu_chung_tu;
  if (o.chungTu === "co") return o.n.xong - o.n.thieu_chung_tu;
  return o.n.xong;
}

/** Ô Ghi chú của dòng phiếu: chip trạng thái khi cần (Đã hủy, Chờ thu) hoặc chữ amber "Thiếu chứng
 *  từ gốc"; còn lại để trống. */
export function GhiChuPhieu({ chip, thieu }: { chip?: { chu: string; mau: "xam" | "amber" } | null; thieu: boolean }) {
  if (chip) return <span className={`kt-tt kt-tt--${chip.mau}`}>{chip.chu}</span>;
  if (thieu) return <span className="kt-ghi-chu--thieu">Thiếu chứng từ gốc</span>;
  return null;
}

/** Ô số của bảng đối chiếu: chưa biết (null) hoặc 0 thì gạch mờ "–". */
export function OSo({ so }: { so: number | null | undefined }) {
  if (so == null || so === 0) return <span className="lds-mu3">–</span>;
  return <>{vietSo(so)}</>;
}

/** Tab "Chứng từ gốc": có tệp thì đếm; phiếu đã xong mà chưa có tệp thì chữ amber "chưa có". */
export function tabChungTuGoc(soTep: number, phaiCo: boolean): TabNgan {
  if (soTep === 0 && phaiCo) {
    return { id: "ct", nhan: <>Chứng từ gốc{" "}<span className="kt-ghi-chu--thieu">chưa có</span></> };
  }
  return { id: "ct", nhan: "Chứng từ gốc", dem: soTep };
}

/** Ô tài khoản ở cột thuộc tính: "Techcombank 1903…" + thẻ chi nhánh. Không có gì thì null — gọi như
 *  HÀM `TaiKhoanO({...})`, KHÔNG viết `<TaiKhoanO/>` (element luôn khác null ⇒ `RayThuocTinh` vẫn hiện nhãn trơ). */
export function TaiKhoanO({ nganHang, so, chiNhanh }: {
  nganHang: string | null;
  so: string | null;
  chiNhanh: string | null;
}): ReactNode {
  const dau = [nganHang, so].filter(Boolean).join(" ");
  if (!dau && !chiNhanh) return null;
  return (
    <Cum>
      {dau && <span>{dau}</span>}
      {chiNhanh && <TheNho>{chiNhanh}</TheNho>}
    </Cum>
  );
}

/** Ô "Người lập": tên + thẻ giờ lập. */
export function NguoiLapO({ ten, moc }: { ten: string | null; moc: string }) {
  return (
    <Cum>
      <span>{ten || "—"}</span>
      <TheNho>{ngayGio(moc)}</TheNho>
    </Cum>
  );
}
