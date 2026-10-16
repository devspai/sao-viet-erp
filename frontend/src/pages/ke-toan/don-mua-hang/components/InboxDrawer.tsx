// Ngăn CHI TIẾT đơn mua hàng ở màn Kế toán — phương án 3 (07/10/2026): dùng CHUNG `NganDonMua` với
// màn Mua hàng, chỉ khác là mở thẳng tab Thanh toán (việc chính của kế toán là chi tiền), nút đầu
// ngăn là Duyệt / Từ chối / Lập phiếu chi, và mỗi đợt còn nợ có nút Lập phiếu chi riêng.
// Đơn chờ duyệt: Duyệt / Từ chối + chip nợ NCC nằm ở dải `DaiDuyet` (`tiepTheo`), cùng khuôn dải gửi
// duyệt bên Mua hàng. Đơn khác: vượt hạn mức nợ vẫn là dải vàng `NganDonMua` tự vẽ từ `credit`.
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { MuaChoLenh, PurchaseRequestRow, SupplierCredit } from "../../../../api/client";
import { NganDonMua } from "../../../mua-hang/don-mua-chung/NganDonMua";

export function InboxDrawer({
  selected,
  setSelectedId,
  credit,
  openYcmh,
  onMoLenh,
  actions,
  tiepTheo,
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
  tiepTheo?: ReactNode;
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
      openYcmh={openYcmh}
      onMoLenh={onMoLenh}
      credit={credit}
      tiepTheo={tiepTheo}
      onLapPhieuChi={onLapPhieuChi}
      suaDuoc={false}
      onDoi={onDoi}
      onLoi={onLoi}
      onDong={() => setSelectedId(null)}
    />
  );
}
