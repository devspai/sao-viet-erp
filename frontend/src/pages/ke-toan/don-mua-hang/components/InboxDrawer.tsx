// Drawer CHI TIẾT đơn mua hàng (Kế toán) — tách từ pages/AccountingPurchaseInboxPage.tsx.
import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type {
  PaymentVoucherRow,
  PurchaseRequestRow,
  SupplierCredit,
} from "../../../../api/client";
import { CodeLink } from "../../../../components/CodeLink";
import { Icon } from "../../../../components/Icons";
import { PurchaseActivityTimeline } from "../../../../components/PurchaseActivityTimeline";
import { fmtDate, hanTraTuMoc, money } from "../../../../utils/format";
// Đơn vị lưu bằng MÃ (`cai`, `to`, `m2`); tên hiển thị ("cái", "tờ", "m²") nằm ở danh mục Đơn vị.
import { tenDonVi } from "../../../tenDonVi";
import {
  PAYMENT_STAGE_LABEL,
  STATUS_META,
  VOUCHER_STATUS_LABEL,
  VOUCHER_TYPE_LABEL,
} from "../shared/constants";

type DrawerTab = "overview" | "terms" | "deliveries" | "history";

export function InboxDrawer({
  selected,
  setSelectedId,
  vouchers,
  vouchersLoading,
  credit,
  openYcmh,
  actions,
}: {
  selected: PurchaseRequestRow;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  vouchers: PaymentVoucherRow[];
  vouchersLoading: boolean;
  credit: SupplierCredit | null;
  /** Thiếu = không có ô Xem màn Yêu cầu mua hàng ⇒ mã chỉ hiện dạng chữ. */
  openYcmh?: (code: string) => void;
  actions: (row: PurchaseRequestRow, compact?: boolean) => ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");

  // Tính trước để chân drawer bỏ hẳn khung `.purchase__drawer-footer` khi không có thao tác
  // nào khả dụng (thay vì render khung rỗng chiếm ~57px vô ích).
  const footer = actions(selected);

  return (
    <div className="rc-drawer__scrim" onClick={() => setSelectedId(null)}>
      <aside
        className="rc-drawer purchase__drawer-780 acct-dmh-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={selected.code}
      >
        {/* Banner Tiêu đề Hero */}
        <div className="purchase__hero-banner">
          <div className="purchase__hero-top">
            <div>
              <span className="purchase__hero-kicker">Chi tiết đơn</span>
              <div className="purchase__hero-title-row">
                <h2 className="purchase__hero-code">{selected.code}</h2>
                <span
                  className={`acct-dmh__state acct-dmh__state--${STATUS_META[selected.status].tone}`}
                >
                  <i className="acct-dmh__dot" />
                  {STATUS_META[selected.status].label}
                </span>
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
        </div>

        {/* Dải 4 Tab Con Chuyên Biệt trong Drawer */}
        <div className="acct-drawer__tabs" role="tablist" aria-label="Chi tiết đơn mua hàng">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            className={`acct-drawer__tab-btn${activeTab === "overview" ? " is-active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            <Icon name="package" size={15} />
            <span>Vật tư & Tổng quan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "terms"}
            className={`acct-drawer__tab-btn${activeTab === "terms" ? " is-active" : ""}`}
            onClick={() => setActiveTab("terms")}
          >
            <Icon name="credit-card" size={15} />
            <span>Điều khoản & Nợ</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "deliveries"}
            className={`acct-drawer__tab-btn${activeTab === "deliveries" ? " is-active" : ""}`}
            onClick={() => setActiveTab("deliveries")}
          >
            <Icon name="truck" size={15} />
            <span>Đợt giao & Chi</span>
            {(selected.deliveries.length > 0 || vouchers.length > 0) && (
              <span className="acct-drawer__tab-badge">
                {selected.deliveries.length + vouchers.length}
              </span>
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

        {/* Thân Drawer hiển thị nội dung theo Tab */}
        <div className="rc-drawer__body acct-dmh__body">
          {/* Cảnh báo vượt hạn mức (luôn hiện nếu có) */}
          {credit?.vuot_han_muc && (
            <div className="banner banner--warn" role="status">
              Đang nợ nhà cung cấp {money(credit.no_hien_tai)} — vượt hạn mức {money(credit.credit_limit)} là{" "}
              <strong>{money(credit.vuot_bao_nhieu)}</strong>. Đây là cảnh báo, không chặn duyệt.
            </div>
          )}

          {/* Lý do từ chối (luôn hiện nếu có) */}
          {selected.reject_reason && (
            <div className="purchase__note purchase__note--reject">
              <strong>Lý do từ chối / huỷ:</strong> {selected.reject_reason}
            </div>
          )}

          {/* TAB 1: VẬT TƯ & TỔNG QUAN */}
          {activeTab === "overview" && (
            <>
              <div className="acct-payment-grid">
                <div>
                  <span>Tổng đơn</span>
                  <strong>{money(selected.total_estimate)}</strong>
                </div>
                <div>
                  <span>Hàng đã giao</span>
                  <strong>{money(selected.gia_tri_da_giao)}</strong>
                </div>
                <div>
                  <span>Đã chi ròng</span>
                  <strong>{money(selected.net_paid)}</strong>
                </div>
                <div className="acct-dmh__lead">
                  <span>Còn nợ</span>
                  <strong>{money(selected.outstanding_amount)}</strong>
                </div>
              </div>

              <dl className="purchase__facts">
                <div>
                  <dt>Nhà cung cấp</dt>
                  <dd>{selected.supplier_name}</dd>
                </div>
                <div>
                  <dt>Ngày cần hàng</dt>
                  <dd>{fmtDate(selected.needed_date)}</dd>
                </div>
                <div>
                  <dt>Người lập</dt>
                  <dd>{selected.created_by_name || "—"}</dd>
                </div>
                <div>
                  <dt>Gửi duyệt</dt>
                  <dd>{fmtDate(selected.submitted_at)}</dd>
                </div>
                <div>
                  <dt>Yêu cầu nguồn</dt>
                  <dd>
                    {selected.sources.map((source, index) => (
                      <span key={source.id}>
                        {index > 0 && ", "}
                        <CodeLink code={source.code} onOpen={openYcmh} />
                      </span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt>Phòng ban nguồn</dt>
                  <dd>
                    {[
                      ...new Set(
                        selected.sources
                          .map((source) => source.requesting_department_name)
                          .filter(Boolean),
                      ),
                    ].join(", ") || "—"}
                  </dd>
                </div>
              </dl>

              <div className="acct-purpose">
                <span>Nội dung / mục đích</span>
                <strong>
                  {selected.content?.trim() ||
                    [selected.purpose, selected.note]
                      .map((x) => (x ?? "").trim())
                      .filter(Boolean)
                      .join(" — ") ||
                    "—"}
                </strong>
              </div>

              <table className="md-page__table purchase__lines-table">
                <thead>
                  <tr>
                    <th>Vật tư</th>
                    <th className="num">Số lượng</th>
                    <th className="num">VAT</th>
                    <th className="num">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <strong>{line.item_name}</strong>
                      </td>
                      <td className="num">
                        {line.quantity.toLocaleString("vi-VN")} {tenDonVi(line.unit) ?? line.unit}
                      </td>
                      <td className="num">{line.vat_percent}%</td>
                      <td className="num">
                        <strong>{money(line.line_total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* TAB 2: ĐIỀU KHOẢN & CÔNG NỢ */}
          {activeTab === "terms" && (
            <>
              {credit ? (
                <section className="acct-terms">
                  <header className="acct-terms__head">
                    <span>Điều kiện thanh toán</span>
                    <strong>{selected.supplier_name || "—"}</strong>
                  </header>
                  <div className="acct-terms__row">
                    <span>Điều khoản</span>
                    <strong className={credit.payment_terms ? "" : "acct-terms__trong"}>
                      {credit.payment_terms?.trim() || "Chưa khai"}
                    </strong>
                  </div>
                  <div className="acct-terms__row">
                    <span>Chốt công nợ</span>
                    <strong className={selected.debt_cutoff_date ? "" : "acct-terms__trong"}>
                      {selected.debt_cutoff_date ? (
                        <>
                          {fmtDate(selected.debt_cutoff_date)}
                          {selected.supplier_credit_days != null && (
                            <>
                              {" → hạn trả "}
                              {hanTraTuMoc(selected.debt_cutoff_date, selected.supplier_credit_days)}
                            </>
                          )}
                        </>
                      ) : (
                        "Chưa báo — hạn trả tính từ ngày hoá đơn từng đợt"
                      )}
                    </strong>
                  </div>
                  <div className="acct-terms__grid">
                    <div>
                      <span>Cho nợ</span>
                      <strong className={credit.credit_days == null ? "acct-terms__trong" : ""}>
                        {credit.credit_days == null
                          ? "Chưa đặt hạn"
                          : credit.credit_days === 0
                            ? "Trả ngay"
                            : `${credit.credit_days} ngày`}
                      </strong>
                    </div>
                    <div>
                      <span>Hạn mức</span>
                      <strong className={credit.credit_limit > 0 ? "" : "acct-terms__trong"}>
                        {credit.credit_limit > 0 ? money(credit.credit_limit) : "Không đặt"}
                      </strong>
                    </div>
                    <div>
                      <span>Đang nợ</span>
                      <strong className={credit.vuot_han_muc ? "acct-terms__vuot" : ""}>
                        {money(credit.no_hien_tai)}
                      </strong>
                    </div>
                  </div>
                </section>
              ) : (
                <div className="md-page__muted">Chưa có thông tin công nợ nhà cung cấp.</div>
              )}

              {(selected.contract_number || selected.deposit_expected > 0) && (
                <dl className="purchase__facts acct-contract-facts">
                  {selected.contract_number && (
                    <div>
                      <dt>Số hợp đồng</dt>
                      <dd>{selected.contract_number}</dd>
                    </div>
                  )}
                  {selected.deposit_expected > 0 && (
                    <div>
                      <dt>Cọc dự kiến</dt>
                      <dd>
                        <strong>{money(selected.deposit_expected)}</strong>
                        <small> — điền sẵn khi lập phiếu Đặt cọc</small>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </>
          )}

          {/* TAB 3: ĐỢT GIAO & PHIẾU CHI */}
          {activeTab === "deliveries" && (
            <>
              <section className="acct-deliveries" style={{ marginTop: 0 }}>
                <p className="eyebrow">Đợt giao hàng ({selected.deliveries.length})</p>
                {selected.deliveries.length === 0 ? (
                  <div className="md-page__muted">Chưa có đợt giao nào.</div>
                ) : (
                  <div className="acct-dmh__scroll">
                    <table className="md-page__table acct-deliveries__table">
                      <thead>
                        <tr>
                          <th>Đợt</th>
                          <th>Hàng đã nhận</th>
                          <th>Hạn trả</th>
                          <th className="acct-amount-cell">Giá trị</th>
                          <th className="acct-amount-cell">Đã chi</th>
                          <th className="acct-amount-cell">Trừ cọc</th>
                          <th className="acct-amount-cell">Còn nợ</th>
                          <th>Người ghi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.deliveries.map((dot) => (
                          <tr key={dot.id}>
                            <td className="acct-code-cell">
                              <strong>Đợt {dot.seq_no}</strong>
                              <small>{fmtDate(dot.delivery_date)}</small>
                            </td>
                            <td>
                              <div className="acct-deliveries__lines">
                                {dot.lines.map((line) => (
                                  <span key={line.id}>
                                    <strong>{line.item_name}</strong>
                                    {": "}
                                    {line.quantity.toLocaleString("vi-VN")}{" "}
                                    {tenDonVi(line.unit) ?? line.unit}
                                    {line.quantity_du > 0 && (
                                      <em
                                        className="pdot__du"
                                        title={`${line.quantity_tinh_tien.toLocaleString("vi-VN")} tính tiền · ${line.quantity_du.toLocaleString("vi-VN")} vượt số đặt, giá 0đ`}
                                      >
                                        {" · "}
                                        {line.quantity_du.toLocaleString("vi-VN")} dư
                                      </em>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>{dot.chua_dat_han ? "Chưa đặt hạn" : fmtDate(dot.due_date)}</td>
                            <td className="acct-amount-cell">{money(dot.amount)}</td>
                            <td className="acct-amount-cell">
                              {dot.paid_amount > 0 ? money(dot.paid_amount) : <span className="pay-cell--zero">—</span>}
                            </td>
                            <td className="acct-amount-cell">
                              {dot.coc_bu > 0 ? money(dot.coc_bu) : <span className="pay-cell--zero">—</span>}
                            </td>
                            <td className="acct-amount-cell">
                              {dot.con_no > 0 ? (
                                <strong>{money(dot.con_no)}</strong>
                              ) : (
                                <span className="pay-cell--zero">xong</span>
                              )}
                            </td>
                            <td className="acct-user-cell">
                              <div title={dot.created_by_name ?? undefined}>
                                {dot.created_by_name || "—"}
                              </div>
                              {dot.created_at && <small>{fmtDate(dot.created_at)}</small>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="acct-vouchers">
                <p className="eyebrow">Chứng từ chi / UNC ({vouchers.length})</p>
                {vouchersLoading ? (
                  <div className="md-page__muted">Đang tải chứng từ...</div>
                ) : vouchers.length === 0 ? (
                  <div className="md-page__muted">Chưa lập chứng từ chi nào.</div>
                ) : (
                  <div className="acct-dmh__scroll">
                    <table className="md-page__table acct-vouchers__table">
                      <thead>
                        <tr>
                          <th>Mã chứng từ</th>
                          <th>Loại</th>
                          <th>Đợt thanh toán</th>
                          <th>Ngày chứng từ</th>
                          <th className="acct-amount-cell">Số tiền</th>
                          <th>Trạng thái</th>
                          <th>Người lập / chi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vouchers.map((voucher) => (
                          <tr key={voucher.id}>
                            <td className="acct-code-cell">
                              <strong>{voucher.code}</strong>
                              {voucher.delivery_seq_no && (
                                <small>Đợt giao {voucher.delivery_seq_no}</small>
                              )}
                            </td>
                            <td>{VOUCHER_TYPE_LABEL[voucher.voucher_type]}</td>
                            <td>{PAYMENT_STAGE_LABEL[voucher.payment_stage]}</td>
                            <td>{fmtDate(voucher.voucher_date)}</td>
                            <td className="acct-amount-cell">{money(voucher.amount_vnd)}</td>
                            <td>
                              <span className={`acct-dmh__state acct-dmh__state--${voucher.status}`}>
                                <i className="acct-dmh__dot" />
                                {VOUCHER_STATUS_LABEL[voucher.status]}
                              </span>
                            </td>
                            <td>
                              {voucher.created_by_name || "—"}
                              <small>
                                {fmtDate(voucher.created_at)}
                                {voucher.paid_by_name ? ` · Chi bởi ${voucher.paid_by_name}` : ""}
                              </small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {/* TAB 4: LỊCH SỬ HOẠT ĐỘNG */}
          {activeTab === "history" && (
            <section className="acct-history" style={{ marginTop: 0 }}>
              <p className="eyebrow">Lịch sử đơn mua hàng</p>
              <PurchaseActivityTimeline items={selected.activity_history} />
            </section>
          )}
        </div>

        {/* Chân ngăn kéo cố định chứa các nút thao tác */}
        {footer && <div className="purchase__drawer-footer">{footer}</div>}
      </aside>
    </div>
  );
}
