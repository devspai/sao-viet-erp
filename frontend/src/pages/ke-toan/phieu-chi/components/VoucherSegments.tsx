/** Hai cụm THẺ CHỌN của form lập phiếu chi (đặc tả PC-3, PC-4):
 *  - `ChonCachTra` — "Trả bằng": Tiền mặt / Chuyển khoản (dùng ở cả ba form).
 *  - `ChonLoaiPhieu` — "Chi để": trả tiền hàng đã giao / đặt cọc (chỉ form theo đơn mua), kèm câu
 *    nhắc khi đơn đã có phiếu cọc.
 *  Thẻ chọn: vòng icon + tên + một dòng giải thích; thẻ đang chọn viền charcoal đủ cạnh.
 */
import { FileText, Wallet } from "lucide-react";

import type { PaymentVoucherType, PurchaseRequestRow } from "../../../../api/client";
import { ChonCach, TheChon as The } from "../../shared/KhungFormPhieu";
import { tien } from "../../shared/dinhDang";
import type { LoaiPhieu } from "../shared/types";

export function ChonCachTra({
  giaTri,
  onDoi,
  khoa = "cach_tra",
  gon,
}: {
  giaTri: PaymentVoucherType;
  onDoi: (v: PaymentVoucherType) => void;
  khoa?: string;
  gon?: boolean;
}) {
  return (
    <ChonCach giaTri={giaTri} onDoi={onDoi} khoa={khoa} nhan="Trả bằng" gon={gon}
      giaiTienMat="Thủ quỹ chi và người nhận ký phiếu" giaiChuyenKhoan="Ủy nhiệm chi qua ngân hàng" />
  );
}

export function ChonLoaiPhieu({
  loai,
  chonLoai,
  coDotGiao,
  purchase,
  khoaPhieuCu,
}: {
  loai: LoaiPhieu;
  chonLoai: (next: LoaiPhieu) => void;
  coDotGiao: boolean;
  purchase: PurchaseRequestRow;
  /** Đang xem một phiếu đã lập: loại đã chốt, không đổi được. */
  khoaPhieuCu: boolean;
}) {
  const coc = purchase.coc_da_lap;
  return (
    <>
      <div className="kt-cach" role="group" aria-label="Chi để">
        <The on={loai === "thanh_toan"} icon={<FileText size={18} aria-hidden="true" />} ten="Trả tiền hàng đã giao"
          giai="Chọn đợt giao bên dưới" disabled={khoaPhieuCu || !coDotGiao} onClick={() => chonLoai("thanh_toan")} />
        <The on={loai === "dat_coc"} icon={<Wallet size={18} aria-hidden="true" />} ten="Đặt cọc hoặc ứng trước"
          giai="Trước khi nhận hàng" disabled={khoaPhieuCu} onClick={() => chonLoai("dat_coc")} />
      </div>
      {!coDotGiao && <span className="kt-o__goi">Đơn chưa nhận đợt hàng nào — chỉ đặt cọc được.</span>}
      {/* Đơn ĐÃ có phiếu cọc mà lại lập phiếu cọc nữa — NHẮC, không chặn: ứng thêm là ca có thật
          (cọc 30% rồi nhà cung cấp đòi thêm 20%), mỗi lần tiền rời két là một chứng từ riêng. */}
      {!khoaPhieuCu && loai === "dat_coc" && coc.length > 0 && (
        <div className="kt-canh" role="status">
          {`Đơn đã có ${coc.length} phiếu đặt cọc ${tien(purchase.coc_da_chi)} (${coc.map((c) => c.code).join(" và ")}). `}
          Cọc thêm thì lập tiếp; cọc nhầm thì hủy phiếu đó rồi lập lại.
        </div>
      )}
    </>
  );
}
