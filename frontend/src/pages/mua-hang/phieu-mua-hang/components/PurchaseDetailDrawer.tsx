// Drawer CHI TIẾT ĐƠN MUA + cụm nút thao tác (tách từ pages/PurchaseRequestsPage.tsx).
import { useState, type Dispatch, type SetStateAction } from "react";
import { Icon } from "../../../../components/Icons";
import {
  api,
  type PurchaseDeliveryRow,
  type PurchaseRequestRow,
} from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { useCan } from "../../../../auth/permissions";
import { CodeLink } from "../../../../components/CodeLink";
import { PurchaseActivityTimeline } from "../../../../components/PurchaseActivityTimeline";
import { daGiaoKhac, nhanKhoMua } from "../shared/helpers";
import { RowActionButton } from "../../../../components/RowActionButton";
import { fmtDate, money } from "../../../../utils/format";
// Đơn vị lưu bằng MÃ (`cai`), tên hiển thị ("cái") nằm ở danh mục Đơn vị — xem pages/tenDonVi.ts.
import { tenDonVi } from "../../../tenDonVi";
import { printPurchaseRequest } from "../print";
import { GHI_DOT_DUOC } from "../shared/constants";
import { noiDung } from "../shared/helpers";
import type {
  CloseModalState,
  DeletingDeliveryState,
  DeliveryModalState,
  ReasonModalState,
  ReceiveModalState,
} from "../shared/types";
import { ContractBlock } from "./ContractBlock";
import { DeliveriesBlock } from "./DeliveriesBlock";
import { StatusBadge } from "./purchaseCells";

export function PurchaseDetailDrawer({
  selected,
  setSelectedId,
  openYcmh,
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
  type DrawerTab = "overview" | "terms" | "deliveries" | "history";
  const [tab, setTab] = useState<DrawerTab>("overview");
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
            label="Đang mua"
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
    <div className="rc-drawer__scrim" onClick={() => setSelectedId(null)}>
      <aside
        className="rc-drawer purchase__drawer-780 acct-mh-drawer acct-dmh-drawer pmh-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={selected.code}
      >
        <div className="purchase__hero-banner">
          <div className="purchase__hero-top">
            <div>
              <span className="purchase__hero-kicker">Chi tiết đơn</span>
              <div className="purchase__hero-title-row">
                <h2 className="purchase__hero-code">{selected.code}</h2>
                <StatusBadge status={selected.status} />
              </div>
              {/* Nội dung / Mục đích mua hàng dạng Subtitle mượt */}
              {noiDung(selected) && (
                <div className="acct-hero-purpose">
                  <Icon name="book" size={13} />
                  <span>{noiDung(selected)}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="purchase__hero-x"
              onClick={() => setSelectedId(null)}
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>

          {/* Khối Thông Tin Đơn Hàng Tích Hợp Trong Header */}
          <dl className="acct-hero-facts">
            <div>
              <dt>
                <Icon name="truck" size={13} />
                Nhà cung cấp
              </dt>
              <dd title={selected.supplier_name ?? undefined}>{selected.supplier_name || "Chưa chọn"}</dd>
            </div>
            <div>
              <dt>
                <Icon name="fileText" size={13} />
                Yêu cầu mua hàng
              </dt>
              <dd>
                {selected.sources.length
                  ? selected.sources.map((source, index) => (
                      <span key={source.id}>
                        {index > 0 && ", "}
                        <CodeLink code={source.code} onOpen={openYcmh} />
                      </span>
                    ))
                  : "Chưa gắn"}
              </dd>
            </div>
            <div>
              <dt>
                <Icon name="calendar" size={13} />
                Ngày cần hàng
              </dt>
              <dd>{fmtDate(selected.needed_date)}</dd>
            </div>
            <div>
              <dt>
                <Icon name="clock" size={13} />
                Dự kiến nhận hàng
              </dt>
              <dd>{fmtDate(selected.expected_receipt_date)}</dd>
            </div>
            <div>
              <dt>
                <Icon name="users" size={13} />
                Người lập
              </dt>
              <dd>{selected.created_by_name || "—"}</dd>
            </div>
            <div>
              <dt>
                <Icon name="send" size={13} />
                Gửi duyệt
              </dt>
              <dd>{fmtDate(selected.submitted_at)}</dd>
            </div>
            <div>
              <dt>
                <Icon name="shield" size={13} />
                Duyệt bởi
              </dt>
              <dd>{selected.approved_by_name || "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="acct-drawer__tabs" role="tablist" aria-label="Chi tiết đơn mua hàng">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "overview"}
            className={`acct-drawer__tab-btn${tab === "overview" ? " is-active" : ""}`}
            onClick={() => setTab("overview")}
          >
            <Icon name="box" size={15} />
            <span>Vật tư & Tổng quan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "terms"}
            className={`acct-drawer__tab-btn${tab === "terms" ? " is-active" : ""}`}
            onClick={() => setTab("terms")}
          >
            <Icon name="calculator" size={15} />
            <span>Điều khoản & Nợ</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "deliveries"}
            className={`acct-drawer__tab-btn${tab === "deliveries" ? " is-active" : ""}`}
            onClick={() => setTab("deliveries")}
          >
            <Icon name="truck" size={15} />
            <span>Đợt giao & Chi</span>
            {selected.deliveries.length > 0 && (
              <span className="acct-drawer__tab-badge">{selected.deliveries.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            className={`acct-drawer__tab-btn${tab === "history" ? " is-active" : ""}`}
            onClick={() => setTab("history")}
          >
            <Icon name="history" size={15} />
            <span>Lịch sử</span>
          </button>
        </div>

        <div className="rc-drawer__body acct-mh__body">
          {selected.reject_reason && (
            <div className="purchase__note purchase__note--reject">
              <strong>Lý do từ chối / huỷ:</strong> {selected.reject_reason}
            </div>
          )}

          {/* TAB 1: VẬT TƯ & TỔNG QUAN */}
          {tab === "overview" && (
            <>
              {/* Dải 4 Thẻ KPI Stat Grid */}
              <div className="acct-kpi-grid">
                <div className="acct-kpi-card acct-kpi-card--total">
                  <div className="acct-kpi-card__head">
                    <span className="acct-kpi-card__label">Tổng đơn mua</span>
                    <span className="acct-kpi-card__tag">Dự kiến</span>
                  </div>
                  <div className="acct-kpi-card__val">{money(selected.total_estimate)}</div>
                </div>
                <div className="acct-kpi-card acct-kpi-card--delivered">
                  <div className="acct-kpi-card__head">
                    <span className="acct-kpi-card__label">Hàng đã giao</span>
                    <span className="acct-kpi-card__tag">
                      {selected.total_estimate > 0
                        ? `${Math.round((selected.gia_tri_da_giao / selected.total_estimate) * 100)}%`
                        : "0%"}
                    </span>
                  </div>
                  <div className="acct-kpi-card__val">{money(selected.gia_tri_da_giao)}</div>
                </div>
                <div className="acct-kpi-card acct-kpi-card--paid">
                  <div className="acct-kpi-card__head">
                    <span className="acct-kpi-card__label">Đã chi ròng</span>
                    <span className="acct-kpi-card__tag">Thực tế</span>
                  </div>
                  <div className="acct-kpi-card__val">{money(selected.net_paid)}</div>
                </div>
                <div
                  className={`acct-kpi-card acct-kpi-card--due${
                    selected.outstanding_amount > 0 ? " is-overdue" : ""
                  }`}
                >
                  <div className="acct-kpi-card__head">
                    <span className="acct-kpi-card__label">Còn nợ</span>
                    <span className="acct-kpi-card__tag">
                      {selected.outstanding_amount > 0 ? "Chờ chi" : "Đã xong"}
                    </span>
                  </div>
                  <div className="acct-kpi-card__val">{money(selected.outstanding_amount)}</div>
                </div>
              </div>

              {/* Bảng Danh Sách Vật Tư Phân Cột Chuẩn Enterprise */}
              <div className="acct-items-frame">
                <div className="acct-items-table-wrap">
                  <table className="acct-items-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }} className="text-center">#</th>
                        <th>Tên vật tư</th>
                        <th style={{ textAlign: "right" }}>Số lượng</th>
                        <th style={{ textAlign: "right" }}>Đơn giá</th>
                        <th style={{ textAlign: "center" }}>CK</th>
                        <th style={{ textAlign: "center" }}>VAT</th>
                        <th style={{ textAlign: "right" }}>Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((line, idx) => {
                        const daNhan = daGiaoKhac(selected, line.id, null);
                        const du = Math.max(0, daNhan - Number(line.quantity || 0));
                        const dvt = tenDonVi(line.unit) ?? line.unit;
                        return (
                          <tr key={line.id}>
                            <td style={{ textAlign: "center", color: "#94a3b8" }}>{idx + 1}</td>
                            <td>
                              <div className="acct-table-item-name">{line.item_name}</div>
                              {nhanKhoMua(line) && <div className="acct-table-item-note">{nhanKhoMua(line)}</div>}
                              {line.note && <div className="acct-table-item-note">{line.note}</div>}
                              {du > 0 && (
                                <span
                                  className="acct-tag-pill acct-tag-pill--note"
                                  style={{ marginTop: 4, display: "inline-flex" }}
                                  title={`Các đợt giao đã nhận ${daNhan.toLocaleString("vi-VN")} ${dvt}; ${du.toLocaleString("vi-VN")} vượt số đặt nên tính 0đ.`}
                                >
                                  Đã nhận {daNhan.toLocaleString("vi-VN")} · {du.toLocaleString("vi-VN")} dư
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>
                              {line.quantity.toLocaleString("vi-VN")}{" "}
                              <small style={{ color: "#64748b", fontWeight: 400 }}>{dvt}</small>
                            </td>
                            <td style={{ textAlign: "right" }}>{money(line.expected_unit_price)}</td>
                            <td style={{ textAlign: "center" }}>
                              {line.discount_percent > 0 ? (
                                <span className="acct-discount-badge">-{line.discount_percent}%</span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className="acct-vat-badge">{line.vat_percent}%</span>
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "#1d4ed8" }}>
                              {money(line.line_total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={6} style={{ textAlign: "right", fontWeight: 700 }}>
                          TỔNG DỰ KIẾN ({selected.lines.length} MẶT HÀNG)
                        </td>
                        <td style={{ textAlign: "right" }} className="acct-total-val">
                          {money(selected.total_estimate)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: ĐIỀU KHOẢN & NỢ */}
          {tab === "terms" && (
            <ContractBlock
              row={selected}
              canUpdate={canUpdate}
              onChanged={updateRow}
              onError={setError}
            />
          )}

          {/* TAB 3: ĐỢT GIAO & CHI */}
          {tab === "deliveries" && (
            <DeliveriesBlock
              row={selected}
              canUpdate={canUpdate}
              canApprove={canApprovePurchase}
              onGhiDot={(delivery) => setDeliveryModal({ row: selected, delivery })}
              onGanHoaDon={() => setInvoiceModal(selected)}
              onXoaDot={(delivery) => setDeletingDelivery({ row: selected, delivery })}
              onDongDon={() => setCloseModal({ row: selected, reason: "", error: null })}
              onNhapKho={(dot) => nhapKhoTuDot(selected, dot)}
              onXemYeuCau={(dot) => xemYeuCauNhap(dot)}
            />
          )}

          {/* TAB 4: LỊCH SỬ HOẠT ĐỘNG */}
          {tab === "history" && (
            <div>
              <p className="eyebrow" style={{ marginTop: 8, marginBottom: 12 }}>
                Lịch sử hoạt động đơn mua hàng
              </p>
              <PurchaseActivityTimeline items={selected.activity_history} />
            </div>
          )}
        </div>
        <div className="purchase__drawer-footer">
          {actionButtons(selected)}
        </div>
      </aside>
    </div>
  );
}
