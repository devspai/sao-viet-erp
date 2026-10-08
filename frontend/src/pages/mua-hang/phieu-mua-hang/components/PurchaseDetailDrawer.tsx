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
import { RowActionButton } from "../../../../components/RowActionButton";
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

  function actionButtons(row: PurchaseRequestRow, dense = false) {
    const busy = (key: string) => actionBusy === `${key}:${row.id}`;
    const canEdit =
      canUpdate && (row.status === "draft" || row.status === "rejected");
    return (
      <div
        className={
          dense
            ? "purchase__actions purchase__actions--dense"
            : "purchase__actions"
        }
      >
        {/* "Xem chi tiết" đã bỏ: bấm vào DÒNG là mở drawer, mà nút này lại nằm TRONG drawer nên
            thừa. "In phiếu" giữ nhưng bỏ gate `dense` — nay thao tác nằm GỌN trong bản ghi
            (drawer), không còn cột "Thao tác" ngoài dòng (24/08/2026). */}
        <RowActionButton
          dense={dense}
          label="In phiếu"
          icon="printer"
          onClick={() => openPrint(row)}
        />
        {canEdit && (
          <RowActionButton
            dense={dense}
            label="Sửa"
            icon="pencil"
            onClick={() => openEdit(row)}
          />
        )}
        {canUpdate && (row.status === "draft" || row.status === "rejected") && (
          <RowActionButton
            dense={dense}
            label="Gửi duyệt"
            icon="send"
            loading={busy("submit")}
            onClick={() =>
              runAction(row, "submit", () =>
                api.purchaseRequests.submit(token!, row.id),
              )
            }
          />
        )}
        {/* KHÔNG có nút Duyệt / Từ chối ở màn Mua hàng (chủ 04/08/2026: "phải duyệt ở phần kế
            toán chứ"). Duyệt đơn mua là quyết định CHI TIỀN — nó thuộc về giám đốc / người được
            trao quyền, và nay nằm ở màn Kế toán thu mua → Đơn mua hàng.
            Thu mua ở đây chỉ: Xem · In · Sửa · Gửi duyệt · Huỷ · Xoá. */}
        {canUpdate && row.status === "approved" && (
          <RowActionButton
            dense={dense}
            label="Đã đặt hàng"
            icon="bag"
            loading={busy("purchased")}
            onClick={() =>
              runAction(row, "purchased", () =>
                api.purchaseRequests.markPurchased(token!, row.id),
              )
            }
          />
        )}
        {/* GHI ĐỢT GIAO — đường CHÍNH để hàng về vào hệ từ 06/08/2026. Hàng về tới đâu nợ tới đó;
            giao đủ thì phiếu tự lên "Đã nhận", không ai phải bấm. */}
        {canUpdate && GHI_DOT_DUOC.includes(row.status) && (
          <RowActionButton
            dense={dense}
            label="Ghi đợt giao"
            icon="truck"
            onClick={() => setDeliveryModal({ row, delivery: null })}
          />
        )}
        {/* "Đóng đơn" chỉ có nghĩa khi còn hàng chưa về: nhà cung cấp báo không giao nốt. Server đòi
            `thu_mua:approve` + lý do. */}
        {canUpdate && canApprovePurchase && row.status === "partially_received" && (
          <RowActionButton
            dense={dense}
            label="Đóng đơn"
            icon="packageCheck"
            onClick={() => setCloseModal({ row, reason: "", error: null })}
          />
        )}
        {/* ĐƯỜNG CŨ, chỉ còn cho đơn KHÔNG theo dõi theo đợt (giao một lần, không ai muốn khai
            đợt). Đơn đã có đợt giao thì trạng thái là số SUY RA — server chặn gán tay, nên đừng
            bày nút ra rồi để người dùng bấm vào tường. */}
        {/* {canUpdate &&
          row.status === "purchased" &&
          row.deliveries.length === 0 && (
            <RowActionButton
              dense={dense}
              label="Đã nhận (giao một lần)"
              icon="packageCheck"
              onClick={() => setReceiveModal({ row, mode: "receive" })}
            />
          )} */}
        {/* Sửa số thực nhận: cũng chỉ cho đơn KHÔNG theo đợt — đơn theo đợt thì sửa ở đúng đợt
            giao đó, sửa ở đây sẽ bị nhánh dẫn xuất ghi đè trong im lặng (server chặn). */}
        {canUpdate &&
          canApprovePurchase &&
          row.status === "received" &&
          row.deliveries.length === 0 && (
            <RowActionButton
              dense={dense}
              label="Sửa số nhận"
              icon="pencil"
              onClick={() => setReceiveModal({ row, mode: "edit" })}
            />
          )}
        {/* Nút "Mở lại đơn" / "Lùi đã nhận" ĐÃ GỠ 12/08/2026 (chủ chốt: "cái nút mở lại đơn bỏ
            đi nha"). Endpoint `undo-received` và bộ test của nó GIỮ NGUYÊN — nó là van an toàn
            khi lỡ bấm "Đã nhận", chỉ là không còn bày ra ở màn này. */}
        {/* NÚT "HUỶ PHIẾU" — bày lại 24/08/2026 sau 9 ngày ẩn. Đây là van gỡ kẹt khi phiếu lập
            nhầm: `POST /api/purchase-requests/{id}/cancel` chưa từng bị gỡ, chỉ là không có nút.
            Luật hiện nút nằm ở `huyPhieuDuoc` phía trên, chép đúng `PurchaseService.cancel`. */}
        {huyPhieuDuoc(row) && (
          <RowActionButton
            dense={dense}
            label="Huỷ phiếu"
            icon="ban"
            danger
            loading={busy("cancel")}
            onClick={() =>
              setReasonModal({ kind: "cancel", row, reason: "", error: null })
            }
          />
        )}
      </div>
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
