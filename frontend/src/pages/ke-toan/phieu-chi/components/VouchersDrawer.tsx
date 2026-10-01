// Drawer CHI TIẾT một phiếu chi (tách từ pages/PaymentVouchersPage.tsx).
import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  anhNho, assetUrl,
  type PaymentVoucherAttachment,
  type PaymentVoucherRow,
} from "../../../../api/client";
import { CodeLink } from "../../../../components/CodeLink";
import { Icon } from "../../../../components/Icons";
import {
  amountInWords,
  fmtDate,
  fmtDateTime,
  money,
  originalMoney,
} from "../../../../utils/format";
import {
  SOURCE_LABELS,
  STAGE_LABELS,
  STATUS_META,
} from "../shared/list-constants";

type DrawerTab = "overview" | "attachments" | "history";

export function VouchersDrawer({
  selected,
  setSelectedId,
  canApprove,
  openYcmh,
  openReceipts,
  attachments,
  attachmentBusy,
  uploadAttachments,
  removeAttachment,
  actions,
}: {
  selected: PaymentVoucherRow;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  canApprove: boolean;
  /** Thiếu = không có ô Xem màn Yêu cầu mua hàng ⇒ mã chỉ hiện dạng chữ. */
  openYcmh?: (code: string) => void;
  openReceipts: (query: string) => void;
  attachments: PaymentVoucherAttachment[];
  attachmentBusy: boolean;
  uploadAttachments: (list: FileList | null) => Promise<void>;
  removeAttachment: (attachment: PaymentVoucherAttachment) => Promise<void>;
  actions: (row: PaymentVoucherRow) => ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");
  const actionNode = actions(selected);
  const coTienThu =
    selected.receipt_received_amount > 0 || selected.receipt_pending_amount > 0;
  return (
    <div className="rc-drawer__scrim" onClick={() => setSelectedId(null)}>
      <aside
        className="rc-drawer purchase__drawer-780 acct-pc-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={selected.code}
      >
        <div className="purchase__hero-banner">
          <div className="purchase__hero-top">
            <div>
              <span className="purchase__hero-kicker">
                {selected.voucher_type === "cash" ? "Phiếu chi" : "Ủy nhiệm chi"}
              </span>
              <div className="purchase__hero-title-row">
                <h2 className="purchase__hero-code">{selected.code}</h2>
                <div className="acct-status-stack">
                  <span
                    className={`acct-dmh__state acct-dmh__state--${STATUS_META[selected.status].tone}`}
                  >
                    <i className="acct-dmh__dot" />
                    {STATUS_META[selected.status].label}
                  </span>
                  {selected.status === "paid" &&
                    selected.attachment_count === 0 && (
                      <span className="acct-pc__flag">
                        <i className="acct-pc__dot" />
                        Thiếu chứng từ
                      </span>
                    )}
                </div>
              </div>
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
          {selected.content?.trim() && (
            <div className="acct-hero-purpose">
              <Icon name="book" size={14} />
              <span>{selected.content}</span>
            </div>
          )}
          <dl className="acct-hero-facts">
            <div>
              <dt>
                <Icon name="building" size={13} />
                {selected.source_type === "purchase_request" ? "Nhà cung cấp" : "Đối tượng nhận"}
              </dt>
              <dd title={selected.supplier_name}>{selected.supplier_name || "—"}</dd>
            </div>
            <div>
              <dt>
                <Icon name="calendar" size={13} />
                Ngày chứng từ
              </dt>
              <dd>{fmtDate(selected.voucher_date)}</dd>
            </div>
            <div>
              <dt>
                <Icon name="users" size={13} />
                Người lập
              </dt>
              <dd>{selected.created_by_name || "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="acct-drawer__tabs" role="tablist" aria-label="Chi tiết phiếu chi">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            className={`acct-drawer__tab-btn${activeTab === "overview" ? " is-active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            <Icon name="fileText" size={15} />
            <span>Tổng quan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "attachments"}
            className={`acct-drawer__tab-btn${activeTab === "attachments" ? " is-active" : ""}`}
            onClick={() => setActiveTab("attachments")}
          >
            <Icon name="paperclip" size={15} />
            <span>Chứng từ đính kèm</span>
            {attachments.length > 0 && (
              <span className="acct-drawer__tab-badge">{attachments.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "history"}
            className={`acct-drawer__tab-btn${activeTab === "history" ? " is-active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <Icon name="history" size={15} />
            <span>Lịch sử</span>
          </button>
        </div>

        <div className="rc-drawer__body acct-pc__body">
      {selected.cancel_reason && (
        <div className="banner banner--error">
          Lý do hủy: {selected.cancel_reason}
        </div>
      )}
      {activeTab === "overview" && (
        <>
      <div className="acct-kpi-grid acct-pcx__kpis">
        <div className="acct-kpi-card acct-kpi-card--total">
          <div className="acct-kpi-card__head">
            <span className="acct-kpi-card__label">Số tiền quy đổi</span>
            <span className="acct-kpi-card__tag">{selected.currency || "VND"}</span>
          </div>
          <div className="acct-kpi-card__val">{money(selected.amount_vnd)}</div>
          <small className="acct-pcx__kpi-sub">
            {selected.currency !== "VND"
              ? `${originalMoney(selected.amount, selected.currency)} · tỷ giá ${selected.exchange_rate}`
              : amountInWords(selected.amount_vnd)}
          </small>
        </div>
        {coTienThu && (
          <>
            <div className="acct-kpi-card acct-kpi-card--paid">
              <div className="acct-kpi-card__head">
                <span className="acct-kpi-card__label">Đã thu lại</span>
                <span className="acct-kpi-card__tag">Phiếu thu</span>
              </div>
              <div className="acct-kpi-card__val">
                <button
                  type="button"
                  className="code-link"
                  onClick={() => openReceipts(selected.code)}
                >
                  {money(selected.receipt_received_amount)}
                </button>
              </div>
            </div>
            <div className="acct-kpi-card acct-kpi-card--due">
              <div className="acct-kpi-card__head">
                <span className="acct-kpi-card__label">Chờ thu</span>
                <span className="acct-kpi-card__tag">Phiếu thu</span>
              </div>
              <div className="acct-kpi-card__val">
                <button
                  type="button"
                  className="code-link"
                  onClick={() => openReceipts(selected.code)}
                >
                  {money(selected.receipt_pending_amount)}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <dl className="purchase__facts">
        {selected.doc_no && (
          <div>
            <dt>Số chứng từ</dt>
            <dd>{selected.doc_no}</dd>
          </div>
        )}
        {selected.source_type === "purchase_request" ? (
          <>
            <div>
              <dt>PMH nguồn</dt>
              <dd>{selected.purchase_request_code}</dd>
            </div>
            <div>
              <dt>YCMH nguồn</dt>
              <dd>
                {selected.source_request_codes.length
                  ? selected.source_request_codes.map((code, index) => (
                      <span key={code}>
                        {index > 0 && ", "}
                        <CodeLink code={code} onOpen={openYcmh} />
                      </span>
                    ))
                  : "—"}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Nguồn chi</dt>
              <dd>{SOURCE_LABELS[selected.source_type] ?? selected.source_type}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Đợt thanh toán</dt>
          <dd>
            {selected.source_type === "purchase_request"
              ? STAGE_LABELS[selected.payment_stage]
              : SOURCE_LABELS[selected.source_type]}
          </dd>
        </div>
        {selected.source_type === "purchase_request" && (
          <div>
            <dt>Trả cho đợt giao</dt>
            <dd>
              {selected.delivery_seq_no != null
                ? `Đợt ${selected.delivery_seq_no}`
                : selected.payment_stage === "advance"
                  ? "Không gắn đợt (đặt cọc)"
                  : "Đơn không theo dõi theo đợt"}
            </dd>
          </div>
        )}
      </dl>
      {selected.voucher_type === "bank_transfer" ? (
        <div className="acct-account-pair">
          <div>
            <span>Trích nợ</span>
            <strong>{selected.company_account_holder}</strong>
            <small>
              {selected.company_account_number} ·{" "}
              {selected.company_bank_name}
            </small>
          </div>
          <div>
            <span>Thụ hưởng</span>
            <strong>{selected.beneficiary_account_holder}</strong>
            <small>
              {selected.beneficiary_account_number} ·{" "}
              {selected.beneficiary_bank_name}
            </small>
          </div>
        </div>
      ) : (
        <div className="acct-account-pair">
          <div>
            <span>Người nhận</span>
            <strong>{selected.cash_recipient_name}</strong>
            <small>{selected.cash_recipient_address || "—"}</small>
          </div>
        </div>
      )}
      {selected.bank_reference && (
        <div className="purchase__note">
          Mã giao dịch: <strong>{selected.bank_reference}</strong>
        </div>
      )}
        </>
      )}
      {activeTab === "attachments" && (
      <div className="acct-attachments">
        <span className="acct-attachments__label">
          Chứng từ đính kèm
        </span>
        {attachments.length === 0 && (
          <div className="acct-empty-state">
            <div className="acct-empty-state__icon">
              <Icon name="paperclip" size={20} />
            </div>
            <div className="acct-empty-state__text">
              Chưa có file đính kèm.
              {selected.status === "paid" &&
                " Phiếu đã chi — cần bổ sung hóa đơn/biên nhận."}
            </div>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="acct-att-grid">
            {attachments.map((attachment) => {
              const isImage = [
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif",
              ].includes(attachment.file_type ?? "");
              const href = assetUrl(attachment.file_url) ?? "#";
              return (
                <div className="acct-att-item" key={attachment.id}>
                  {isImage ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      title={attachment.file_name}
                    >
                      <img
                        className="acct-att-thumb"
                        src={anhNho(attachment.file_url) ?? href}
                        alt={attachment.file_name}
                      />
                    </a>
                  ) : (
                    <a
                      className="acct-att-file"
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      title={attachment.file_name}
                    >
                      📎 {attachment.file_name}
                    </a>
                  )}
                  {canApprove && (
                    <button
                      type="button"
                      className="acct-att-x"
                      aria-label={`Xóa ${attachment.file_name}`}
                      disabled={attachmentBusy}
                      onClick={() => removeAttachment(attachment)}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {canApprove && selected.status !== "cancelled" && (
          <label className="acct-field">
            <span>Thêm ảnh hóa đơn / PDF (tối đa 10 MB)</span>
            <input
              className="input"
              type="file"
              multiple
              accept="image/*,application/pdf"
              disabled={attachmentBusy}
              onChange={(event) => {
                uploadAttachments(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      )}
      {activeTab === "history" && (
        <ol className="acct-pcx__timeline">
          <li>
            <strong>Lập phiếu</strong>
            <span>
              {selected.created_by_name || "—"} · {fmtDateTime(selected.created_at)}
            </span>
          </li>
          {selected.paid_at && (
            <li>
              <strong>Ghi nhận đã chi</strong>
              <span>
                {selected.paid_by_name || "—"} · {fmtDateTime(selected.paid_at)}
              </span>
            </li>
          )}
          {selected.cancelled_at && (
            <li className="is-cancelled">
              <strong>Hủy phiếu</strong>
              <span>
                {selected.cancelled_by_name || "—"} · {fmtDateTime(selected.cancelled_at)}
              </span>
              {selected.cancel_reason && <em>Lý do: {selected.cancel_reason}</em>}
            </li>
          )}
        </ol>
      )}
        </div>
        {actionNode && (
          <div className="purchase__drawer-footer">{actionNode}</div>
        )}
      </aside>
    </div>
  );
}
