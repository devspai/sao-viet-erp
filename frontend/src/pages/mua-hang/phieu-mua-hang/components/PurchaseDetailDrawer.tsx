// Ngăn CHI TIẾT ĐƠN MUA ở màn Mua hàng — phương án 3 (07/10/2026): thân ngăn là `NganDonMua` dùng
// CHUNG với Kế toán; ở đây chỉ còn cụm nút đầu ngăn và các việc trên đợt giao của Thu mua.
import type { Dispatch, SetStateAction } from "react";
import {
  api,
  type MuaChoLenh,
  type PurchaseDeliveryRow,
  type PurchaseRequestRow,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { useCan } from "../../../../auth/permissions";
import { Button } from "../../../../components/Button";
import { Icon } from "../../../../components/Icons";
import { NganDonMua } from "../../don-mua-chung/NganDonMua";
import { printPurchaseRequest } from "../print";
import { GHI_DOT_DUOC } from "../shared/constants";
import type {
  CloseModalState,
  DeletingDeliveryState,
  DeliveryModalState,
  ReasonModalState,
  ReceiveModalState,
} from "../shared/types";

export function PurchaseDetailDrawer({
  selected,
  setSelectedId,
  openYcmh,
  onMoLenh,
  canUpdate,
  canApprovePurchase,
  updateRow,
  setError,
  actionBusy,
  runAction,
  openEdit,
  nhapKhoTuDot,
  xemYeuCauNhap,
  setReceiveModal,
  setReasonModal,
  setDeliveryModal,
  setInvoiceModal,
  setDeletingDelivery,
  setCloseModal,
}: {
  selected: PurchaseRequestRow;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  /** Thiếu = không có ô Xem màn Yêu cầu mua hàng ⇒ mã chỉ hiện dạng chữ. */
  openYcmh?: (code: string) => void;
  onMoLenh?: (l: MuaChoLenh) => void;
  canUpdate: boolean;
  canApprovePurchase: boolean;
  updateRow: (next: PurchaseRequestRow) => void;
  setError: (message: string | null) => void;
  actionBusy: string | null;
  runAction: (
    row: PurchaseRequestRow,
    key: string,
    fn: () => Promise<PurchaseRequestRow>,
  ) => Promise<void>;
  openEdit: (row: PurchaseRequestRow) => void;
  nhapKhoTuDot: (row: PurchaseRequestRow, dot: PurchaseDeliveryRow) => void;
  xemYeuCauNhap: (dot: PurchaseDeliveryRow) => void;
  setReceiveModal: Dispatch<SetStateAction<ReceiveModalState | null>>;
  setReasonModal: Dispatch<SetStateAction<ReasonModalState | null>>;
  setDeliveryModal: Dispatch<SetStateAction<DeliveryModalState | null>>;
  setInvoiceModal: Dispatch<SetStateAction<PurchaseRequestRow | null>>;
  setDeletingDelivery: Dispatch<SetStateAction<DeletingDeliveryState | null>>;
  setCloseModal: Dispatch<SetStateAction<CloseModalState | null>>;
}) {
  // `user` chỉ cần cho luật "Huỷ phiếu" — luật đó đang ẩn (15/08/2026), bật lại thì lấy kèm.
  const { token, user } = useAuth();
  const can = useCan();
  /* Luật hiện nút "Huỷ phiếu" — BẬT LẠI 24/08/2026 (chủ chốt: "bật nút hủy lên"). Ẩn từ
     15/08 tới 24/08; chữ dưới đây chép đúng luật của `PurchaseService.cancel`, đổi luật ở
     máy chủ thì phải sửa cả đây, nếu không nút bày ra rồi bấm vào ăn 409. */
  // Huỷ phiếu ĐÃ GỬI DUYỆT là quyết định của NGƯỜI DUYỆT — ô duyệt nay nằm bên Kế toán.
  const canDuyetChi = can("ke_toan", "approve");
  const HUY_DUOC_TRANG_THAI = [
    "draft", "pending_approval", "approved", "purchased", "rejected",
  ];
  const huyPhieuDuoc = (row: PurchaseRequestRow) =>
    HUY_DUOC_TRANG_THAI.includes(row.status) &&
    (canDuyetChi ||
      (canUpdate && row.status === "draft" && row.created_by_user_id === user?.id));

  function openPrint(row: PurchaseRequestRow) {
    if (!printPurchaseRequest(row)) {
      setError(
        "Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up rồi thử lại.",
      );
    }
  }

  // "Nhập kho" nhảy sang màn Kho, tab Đề nghị nhập với form điền sẵn ⇒ hỏi đúng ô mở tab đó
  // (`kho:request`), KHÔNG phải `kho:create` — bộ phận mua hàng có `request` mà không có `create`.
  const coQuyenNhapKho = can("kho", "request");

  // Cụm nút đầu ngăn — cùng kiểu với ngăn Yêu cầu mua: nút thường có icon, VIỆC TIẾP THEO của đơn
  // (Gửi duyệt / Đã đặt hàng / Ghi đợt giao) tô màu và đứng cuối bên phải; In, Sửa, Huỷ để trơn.
  // Trước 11/10/2026 dùng `RowActionButton` (nút cỡ ô bảng, padding 2px) nên đầu ngăn trông lép.
  function actionButtons(row: PurchaseRequestRow) {
    const busy = (key: string) => actionBusy === `${key}:${row.id}`;
    const canEdit =
      canUpdate && (row.status === "draft" || row.status === "rejected");
    return (
      <>
        {/* "Xem chi tiết" đã bỏ: bấm vào DÒNG là mở drawer, mà nút này lại nằm TRONG drawer nên
            thừa. Thao tác nằm GỌN trong bản ghi (drawer), không còn cột "Thao tác" ngoài dòng
            (24/08/2026). */}
        <Button variant="ghost" onClick={() => openPrint(row)}>
          <Icon name="printer" size={14} /> In phiếu
        </Button>
        {canEdit && (
          <Button variant="ghost" onClick={() => openEdit(row)}>
            <Icon name="pencil" size={14} /> Sửa
          </Button>
        )}
        {/* NÚT "HUỶ PHIẾU" — bày lại 24/08/2026 sau 9 ngày ẩn. Đây là van gỡ kẹt khi phiếu lập
            nhầm: `POST /api/purchase-requests/{id}/cancel` chưa từng bị gỡ, chỉ là không có nút.
            Luật hiện nút nằm ở `huyPhieuDuoc` phía trên, chép đúng `PurchaseService.cancel`. */}
        {huyPhieuDuoc(row) && (
          <Button
            variant="ghost"
            loading={busy("cancel")}
            onClick={() =>
              setReasonModal({ kind: "cancel", row, reason: "", error: null })
            }
          >
            <Icon name="ban" size={14} /> Huỷ phiếu
          </Button>
        )}
        {/* "Đóng đơn" chỉ có nghĩa khi còn hàng chưa về: nhà cung cấp báo không giao nốt. Server đòi
            `thu_mua:approve` + lý do. */}
        {canUpdate && canApprovePurchase && row.status === "partially_received" && (
          <Button
            variant="ghost"
            onClick={() => setCloseModal({ row, reason: "", error: null })}
          >
            <Icon name="packageCheck" size={14} /> Đóng đơn
          </Button>
        )}
        {/* Sửa số thực nhận: chỉ cho đơn KHÔNG theo đợt — đơn theo đợt thì sửa ở đúng đợt giao
            đó, sửa ở đây sẽ bị nhánh dẫn xuất ghi đè trong im lặng (server chặn).
            Nút "Đã nhận (giao một lần)" và "Mở lại đơn" ĐÃ GỠ (12/08/2026); endpoint vẫn giữ. */}
        {canUpdate &&
          canApprovePurchase &&
          row.status === "received" &&
          row.deliveries.length === 0 && (
            <Button
              variant="ghost"
              onClick={() => setReceiveModal({ row, mode: "edit" })}
            >
              <Icon name="pencil" size={14} /> Sửa số nhận
            </Button>
          )}
        {/* KHÔNG có nút Duyệt / Từ chối ở màn Mua hàng (chủ 04/08/2026: "phải duyệt ở phần kế
            toán chứ"). Duyệt đơn mua là quyết định CHI TIỀN — nằm ở Kế toán thu mua → Đơn mua. */}
        {canUpdate && (row.status === "draft" || row.status === "rejected") && (
          <Button
            variant="accent"
            loading={busy("submit")}
            onClick={() =>
              runAction(row, "submit", () =>
                api.purchaseRequests.submit(token!, row.id),
              )
            }
          >
            <Icon name="send" size={14} /> Gửi duyệt
          </Button>
        )}
        {canUpdate && row.status === "approved" && (
          <Button
            variant="accent"
            loading={busy("purchased")}
            onClick={() =>
              runAction(row, "purchased", () =>
                api.purchaseRequests.markPurchased(token!, row.id),
              )
            }
          >
            <Icon name="bag" size={14} /> Đã đặt hàng
          </Button>
        )}
        {/* GHI ĐỢT GIAO — đường CHÍNH để hàng về vào hệ từ 06/08/2026. Hàng về tới đâu nợ tới đó;
            giao đủ thì phiếu tự lên "Đã nhận", không ai phải bấm. */}
        {canUpdate && GHI_DOT_DUOC.includes(row.status) && (
          <Button
            variant="accent"
            onClick={() => setDeliveryModal({ row, delivery: null })}
          >
            <Icon name="truck" size={14} /> Ghi đợt giao
          </Button>
        )}
      </>
    );
  }

  return (
    <NganDonMua
      key={selected.id}
      row={selected}
      duongDan="Mua hàng"
      tabDau="mh"
      hanhDong={actionButtons(selected)}
      openYcmh={openYcmh}
      onMoLenh={onMoLenh}
      viecDot={{
        ghiDuoc: canUpdate && GHI_DOT_DUOC.includes(selected.status),
        nhapKhoDuoc: canUpdate && coQuyenNhapKho,
        onSua: (delivery) => setDeliveryModal({ row: selected, delivery }),
        onXoa: (delivery) => setDeletingDelivery({ row: selected, delivery }),
        onNhapKho: (dot) => nhapKhoTuDot(selected, dot),
        onXemNhap: (dot) => xemYeuCauNhap(dot),
        onGanHoaDon: () => setInvoiceModal(selected),
      }}
      suaDuoc={canUpdate}
      onDoi={updateRow}
      onLoi={setError}
      onDong={() => setSelectedId(null)}
    />
  );
}
