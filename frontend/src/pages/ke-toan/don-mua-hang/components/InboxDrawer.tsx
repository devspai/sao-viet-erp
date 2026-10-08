// Ngăn CHI TIẾT đơn mua hàng ở màn Kế toán — phương án 3 (07/10/2026): dùng CHUNG `NganDonMua` với
// màn Mua hàng, chỉ khác là mở thẳng tab Thanh toán (việc chính của kế toán là chi tiền), nút đầu
// ngăn là Duyệt / Từ chối / Lập phiếu chi, và mỗi đợt còn nợ có nút Lập phiếu chi riêng.
// Vượt hạn mức nợ nhà cung cấp là dải vàng dưới đầu ngăn — chỉ nhắc, không chặn.
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { MuaChoLenh, PurchaseRequestRow, SupplierCredit } from "../../../../api/client";
import { NganDonMua } from "../../../mua-hang/don-mua-chung/NganDonMua";

const so = (n: number) => Math.round(n).toLocaleString("vi-VN");

export function InboxDrawer({
  selected,
  setSelectedId,
  credit,
  openYcmh,
  onMoLenh,
  actions,
  onLapPhieuChi,
  onDoi,
  onLoi,
}: {
  selected: PurchaseRequestRow;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  credit: SupplierCredit | null;
  /** Thiếu = không có ô Xem màn Yêu cầu mua hàng ⇒ mã chỉ hiện dạng chữ. */
  openYcmh?: (code: string) => void;
  onMoLenh?: (l: MuaChoLenh) => void;
  actions: (row: PurchaseRequestRow, compact?: boolean) => ReactNode;
  /** Thiếu = không có ô Lập trên màn Phiếu chi ⇒ không hiện nút theo đợt. */
  onLapPhieuChi?: (dotId: number | null) => void;
  onDoi: (next: PurchaseRequestRow) => void;
  onLoi: (msg: string | null) => void;
}) {
  return (
    <NganDonMua
      key={selected.id}
      row={selected}
      duongDan="Kế toán > Đơn mua hàng"
      tabDau="tt"
      // Đơn đã huỷ: không còn nút nào (InboxRowActions tự trả null).
      hanhDong={actions(selected, true)}
      canhBao={
        credit?.vuot_han_muc ? (
          <div className="mh-canh mh-canh--vang" role="status">
            <span>
              Đang nợ {selected.supplier_name || "nhà cung cấp"} {so(credit.no_hien_tai)} đ, vượt hạn mức{" "}
              {so(credit.credit_limit)} đ là {so(credit.vuot_bao_nhieu)} đ. Chỉ nhắc, không chặn lập phiếu.
            </span>
          </div>
        ) : undefined
      }
      openYcmh={openYcmh}
      onMoLenh={onMoLenh}
      credit={credit}
      onLapPhieuChi={onLapPhieuChi}
      suaDuoc={false}
      onDoi={onDoi}
      onLoi={onLoi}
      onDong={() => setSelectedId(null)}
    />
  );
}
