// Drawer CHI TIẾT một phiếu thu — khuôn chuẩn Đơn mua hàng: hero + dải tab con + thẻ KPI.
import {
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  anhNho, assetUrl,
  type PaymentReceiptAttachment,
  type PaymentReceiptRow,
} from "../../../../api/client";
import { CodeLink } from "../../../../components/CodeLink";
import { Icon } from "../../../../components/Icons";
import {
  fmtDate,
  fmtDateTime,
  money,
  originalMoney,
} from "../../../../utils/format";
import { PILL_TONE, STATUS_META } from "../shared/constants";
import {
  methodText,
  sourceCode,
  sourceLabel,
  sourceName,
} from "../shared/helpers";

type DrawerTab = "overview" | "payment" | "docs";

export function ReceiptsDrawer({
  selected,
  setSelectedId,
  canApprove,
  openSource,
  attachments,
  attachmentBusy,
  uploadAttachments,
  removeAttachment,
  actions,
}: {
  selected: PaymentReceiptRow;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  canApprove: boolean;
  openSource: (row: PaymentReceiptRow) => void;
  attachments: PaymentReceiptAttachment[];
  attachmentBusy: boolean;
  uploadAttachments: (list: FileList | null) => Promise<void>;
  removeAttachment: (attachment: PaymentReceiptAttachment) => Promise<void>;
  actions: (row: PaymentReceiptRow) => ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");
  useEffect(() => {
    setActiveTab("overview");
  }, [selected.id]);

  const footer = actions(selected);
  const tabClass = (tab: DrawerTab) =>
    `acct-drawer__tab-btn${activeTab === tab ? " is-active" : ""}`;
  const code = sourceCode(selected);

  return (
    <div className="rc-drawer__scrim" onClick={() => setSelectedId(null)}>
      <aside
        className="rc-drawer purchase__drawer-780 acct-pt-drawer acct-ptx-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={selected.code}
      >
        <div className="purchase__hero-banner">
          <div className="purchase__hero-top">
            <div>
              <span className="purchase__hero-kicker">Phiếu thu</span>
              <div className="purchase__hero-title-row">
                <h2 className="purchase__hero-code">{selected.code}</h2>
                <div className="acct-status-stack">
                  <span
                    className={`acct-dmh__state acct-dmh__state--${PILL_TONE[selected.status]}`}
                  >
                    <i className="acct-dmh__dot" aria-hidden="true" />
                    {STATUS_META[selected.status].label}
                  </span>
                  {selected.status === "received" &&
                    selected.attachment_count === 0 && (
                      <span className="acct-pt__flag">
                        <i className="acct-pt__dot" aria-hidden="true" />
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
                <Icon name="users" size={13} />
                Người nộp
              </dt>
              <dd title={selected.payer_name}>{selected.payer_name || "—"}</dd>
            </div>
            <div>
              <dt>
                <Icon name="calendar" size={13} />
                Ngày thu
              </dt>
              <dd>{fmtDate(selected.receipt_date)}</dd>
            </div>
            <div>
              <dt>
                <Icon name="fileText" size={13} />
                Nguồn thu
              </dt>
              <dd title={sourceLabel(selected)}>
                {sourceLabel(selected)}
                {code && (
                  <>
                    {" · "}
                    <CodeLink code={code} onOpen={() => openSource(selected)} />
                  </>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div
          className="acct-drawer__tabs"
          role="tablist"
          aria-label="Chi tiết phiếu thu"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            className={tabClass("overview")}
            onClick={() => setActiveTab("overview")}
          >
            <Icon name="clipboard" size={15} />
            <span>Tổng quan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "payment"}
            className={tabClass("payment")}
            onClick={() => setActiveTab("payment")}
          >
            <Icon name="calculator" size={15} />
            <span>Thanh toán</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "docs"}
            className={tabClass("docs")}
            onClick={() => setActiveTab("docs")}
          >
            <Icon name="paperclip" size={15} />
            <span>Chứng từ</span>
            {attachments.length > 0 && (
              <span className="acct-drawer__tab-badge">
                {attachments.length}
              </span>
            )}
          </button>
        </div>

        <div className="rc-drawer__body acct-pt__body">
          {selected.cancel_reason && (
            <div className="banner banner--error">
              Lý do hủy: {selected.cancel_reason}
            </div>
          )}

          {activeTab === "overview" && (
            <div className="acct-ptx__panel">
              <div className="acct-kpi-grid acct-ptx__kpi">
                <div className="acct-kpi-card acct-kpi-card--total">
                  <div className="acct-kpi-card__head">
                    <span className="acct-kpi-card__label">
                      Số tiền quy đổi
                    </span>
                    <span className="acct-kpi-card__tag">VND</span>
                  </div>
                  <div className="acct-kpi-card__val">
                    {money(selected.amount_vnd)}
                  </div>
                </div>
                {selected.currency !== "VND" && (
                  <div className="acct-kpi-card acct-kpi-card--delivered">
                    <div className="acct-kpi-card__head">
                      <span className="acct-kpi-card__label">Số tiền gốc</span>
                      <span className="acct-kpi-card__tag">
                        {selected.currency}
                      </span>
                    </div>
                    <div className="acct-kpi-card__val">
                      {originalMoney(selected.amount, selected.currency)}
                    </div>
                    <small>Tỷ giá {selected.exchange_rate}</small>
                  </div>
                )}
              </div>
              <dl className="purchase__facts">
                {selected.doc_no && (
                  <div>
                    <dt>Số chứng từ</dt>
                    <dd>{selected.doc_no}</dd>
                  </div>
                )}
                <div>
                  <dt>Nguồn thu</dt>
                  <dd>{sourceLabel(selected)}</dd>
                </div>
                {code && (
                  <div>
                    <dt>Mã nguồn</dt>
                    <dd>
                      <CodeLink
                        code={code}
                        onOpen={() => openSource(selected)}
                      />
                    </dd>
                  </div>
                )}
                {selected.purchase_request_code && (
                  <div>
                    <dt>Đơn mua hàng</dt>
                    <dd>{selected.purchase_request_code}</dd>
                  </div>
                )}
                {selected.source_type === "sales_invoice" &&
                  selected.order_code && (
                    <div>
                      <dt>Đơn bán nguồn</dt>
                      <dd>
                        <CodeLink
                          code={selected.order_code}
                          onOpen={() => openSource(selected)}
                        />
                      </dd>
                    </div>
                  )}
                <div>
                  <dt>Đối tượng</dt>
                  <dd>{sourceName(selected)}</dd>
                </div>
                <div>
                  <dt>Người lập</dt>
                  <dd>{selected.created_by_name || "—"}</dd>
                </div>
                <div>
                  <dt>Lập lúc</dt>
                  <dd>{fmtDateTime(selected.created_at)}</dd>
                </div>
              </dl>
              {selected.note && (
                <div className="purchase__note">{selected.note}</div>
              )}
            </div>
          )}

          {activeTab === "payment" && (
            <div className="acct-ptx__panel">
              <dl className="purchase__facts">
                <div>
                  <dt>Hình thức</dt>
                  <dd>{methodText(selected)}</dd>
                </div>
                <div>
                  <dt>Ngày thu</dt>
                  <dd>{fmtDate(selected.receipt_date)}</dd>
                </div>
                {selected.received_at && (
                  <div>
                    <dt>Đã thu lúc</dt>
                    <dd>
                      {fmtDateTime(selected.received_at)}
                      {selected.received_by_name
                        ? ` · ${selected.received_by_name}`
                        : ""}
                    </dd>
                  </div>
                )}
              </dl>
              {selected.receipt_method === "bank_transfer" && (
                <div className="acct-account-pair">
                  <div>
                    <span>Tài khoản nhận</span>
                    <strong>{selected.company_account_holder}</strong>
                    <small>
                      {selected.company_account_number} ·{" "}
                      {selected.company_bank_name}
                    </small>
                  </div>
                </div>
              )}
              {selected.bank_reference && (
                <div className="purchase__note">
                  Mã giao dịch: <strong>{selected.bank_reference}</strong>
                </div>
              )}
            </div>
          )}

          {activeTab === "docs" && (
            <div className="acct-attachments">
              <span className="acct-attachments__label">
                Chứng từ minh chứng đã thu
              </span>
              {attachments.length === 0 && (
                <div className="acct-empty-state">
                  <div className="acct-empty-state__icon">
                    <Icon name="paperclip" size={20} />
                  </div>
                  <div className="acct-empty-state__text">
                    Chưa có file đính kèm.
                    {selected.status === "received" &&
                      " Phiếu đã thu — cần bổ sung biên nhận/ảnh minh chứng."}
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
                  <span>Thêm ảnh biên nhận / PDF (tối đa 10 MB)</span>
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
        </div>
        {footer && <div className="purchase__drawer-footer">{footer}</div>}
      </aside>
    </div>
  );
}
