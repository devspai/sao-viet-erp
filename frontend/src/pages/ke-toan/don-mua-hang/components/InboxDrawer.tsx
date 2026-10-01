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
              {/* Nội dung / Mục đích mua hàng ở Subtitle Header */}
              {(selected.content?.trim() || selected.purpose?.trim() || selected.note?.trim()) && (
                <div className="acct-hero-purpose">
                  <Icon name="book" size={13} />
                  <span>
                    {selected.content?.trim() ||
                      [selected.purpose, selected.note]
                        .map((x) => (x ?? "").trim())
                        .filter(Boolean)
                        .join(" — ")}
                  </span>
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

          {/* Khối Thông Tin Đơn Hàng Tích Hợp Trực Tiếp Trong Header */}
          <dl className="acct-hero-facts">
            <div>
              <dt>
                <Icon name="truck" size={13} />
                Nhà cung cấp
              </dt>
              <dd title={selected.supplier_name ?? undefined}>{selected.supplier_name || "—"}</dd>
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
                <Icon name="fileText" size={13} />
                Yêu cầu nguồn
              </dt>
              <dd>
                {selected.sources.length > 0
                  ? selected.sources.map((source, index) => (
                      <span key={source.id}>
                        {index > 0 && ", "}
                        <CodeLink code={source.code} onOpen={openYcmh} />
                      </span>
                    ))
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>
                <Icon name="building" size={13} />
                Phòng ban nguồn
              </dt>
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
            <Icon name="box" size={15} />
            <span>Vật tư & Tổng quan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "terms"}
            className={`acct-drawer__tab-btn${activeTab === "terms" ? " is-active" : ""}`}
            onClick={() => setActiveTab("terms")}
          >
            <Icon name="calculator" size={15} />
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
              {/* Thẻ Chỉ số KPI 4 Ô Độc Lập */}
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
                  className={`acct-kpi-card acct-kpi-card--due ${
                    selected.outstanding_amount > 0 ? "is-overdue" : ""
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
                        const dvt = tenDonVi(line.unit) ?? line.unit;
                        return (
                          <tr key={line.id}>
                            <td style={{ textAlign: "center", color: "#94a3b8" }}>{idx + 1}</td>
                            <td>
                              <div className="acct-table-item-name">{line.item_name}</div>
                              {line.note && <div className="acct-table-item-note">{line.note}</div>}
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

          {/* TAB 2: ĐIỀU KHOẢN & CÔNG NỢ */}
          {activeTab === "terms" && (
            <div className="acct-credit-dashboard">
              {credit ? (
                <section className="acct-credit-card">
                  {/* Banner tiêu đề tín dụng */}
                  <div className="acct-credit-card__head">
                    <div className="acct-credit-card__title">
                      <Icon name="shield" size={15} />
                      Hạn mức & Tín dụng nhà cung cấp
                    </div>
                    <span className="acct-credit-card__supplier">
                      {selected.supplier_name || "—"}
                    </span>
                  </div>

                  {/* Thông tin điều khoản & chốt nợ */}
                  <div className="acct-terms-details">
                    <div className="acct-terms-detail-item">
                      <span className="acct-terms-detail-item__label">Điều khoản thanh toán</span>
                      <span className="acct-terms-detail-item__val">
                        {credit.payment_terms?.trim() || "Chưa khai báo điều khoản"}
                      </span>
                    </div>
                    <div className="acct-terms-detail-item">
                      <span className="acct-terms-detail-item__label">Mốc chốt công nợ & Hạn trả</span>
                      <span className="acct-terms-detail-item__val">
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
                          "Chưa báo — hạn trả tính từ ngày hoá đơn từng đợt giao hàng"
                        )}
                      </span>
                    </div>
                  </div>

                  {/* 3 Thẻ chỉ số tín dụng */}
                  <div className="acct-credit-stats">
                    <div className="acct-credit-stat-item">
                      <span className="acct-credit-stat-item__label">
                        <Icon name="clock" size={12} />
                        Cho nợ
                      </span>
                      <span className="acct-credit-stat-item__val">
                        {credit.credit_days == null
                          ? "Chưa đặt"
                          : credit.credit_days === 0
                          ? "Trả ngay"
                          : `${credit.credit_days} ngày`}
                      </span>
                    </div>

                    <div className="acct-credit-stat-item">
                      <span className="acct-credit-stat-item__label">
                        <Icon name="shield" size={12} />
                        Hạn mức
                      </span>
                      <span className="acct-credit-stat-item__val">
                        {credit.credit_limit > 0 ? money(credit.credit_limit) : "Không đặt"}
                      </span>
                    </div>

                    <div
                      className={`acct-credit-stat-item acct-credit-stat-item--due ${
                        credit.vuot_han_muc ? "is-overdue" : ""
                      }`}
                    >
                      <span className="acct-credit-stat-item__label">
                        <Icon name="calculator" size={12} />
                        Đang nợ
                      </span>
                      <span className="acct-credit-stat-item__val">
                        {money(credit.no_hien_tai)}
                      </span>
                    </div>
                  </div>

                  {/* Thanh tỷ lệ sử dụng hạn mức (Credit Utilization Bar) */}
                  {credit.credit_limit > 0 && (
                    <div className="acct-utilization">
                      <div className="acct-utilization__meta">
                        <span>Tỷ lệ sử dụng hạn mức nợ</span>
                        <span>
                          {money(credit.no_hien_tai)} / {money(credit.credit_limit)}{" "}
                          ({Math.min(100, Math.round((credit.no_hien_tai / credit.credit_limit) * 100))}%)
                        </span>
                      </div>
                      <div className="acct-utilization__track">
                        <div
                          className={`acct-utilization__fill ${
                            credit.vuot_han_muc
                              ? "acct-utilization__fill--danger"
                              : credit.no_hien_tai / credit.credit_limit > 0.7
                              ? "acct-utilization__fill--warn"
                              : ""
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round((credit.no_hien_tai / credit.credit_limit) * 100),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <div className="md-page__muted">Chưa có thông tin công nợ nhà cung cấp.</div>
              )}

              {/* Thẻ Hợp đồng & Cọc dự kiến */}
              {(selected.contract_number || selected.deposit_expected > 0) && (
                <div className="acct-contract-card">
                  {selected.contract_number && (
                    <div className="acct-contract-card__item">
                      <div className="acct-contract-card__icon">
                        <Icon name="fileCheck" size={18} />
                      </div>
                      <div>
                        <div className="acct-contract-card__label">Số hợp đồng</div>
                        <div className="acct-contract-card__val">{selected.contract_number}</div>
                      </div>
                    </div>
                  )}

                  {selected.deposit_expected > 0 && (
                    <div className="acct-contract-card__item">
                      <div className="acct-contract-card__icon">
                        <Icon name="calculator" size={18} />
                      </div>
                      <div>
                        <div className="acct-contract-card__label">Cọc dự kiến</div>
                        <div className="acct-contract-card__val">
                          {money(selected.deposit_expected)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ĐỢT GIAO & PHIẾU CHI */}
          {activeTab === "deliveries" && (
            <>
              {/* Phần Đợt Giao Hàng */}
              <section className="acct-deliveries-section">
                <div className="acct-section-title">
                  <Icon name="truck" size={14} />
                  Đợt giao hàng ({selected.deliveries.length})
                </div>

                {selected.deliveries.length === 0 ? (
                  <div className="acct-empty-state">
                    <div className="acct-empty-state__icon">
                      <Icon name="truck" size={20} />
                    </div>
                    <div className="acct-empty-state__text">Chưa có đợt giao hàng nào.</div>
                  </div>
                ) : (
                  <div className="acct-delivery-cards">
                    {selected.deliveries.map((dot) => (
                      <div className="acct-delivery-card" key={dot.id}>
                        {/* Header Thẻ Đợt Giao */}
                        <div className="acct-delivery-card__head">
                          <div className="acct-delivery-card__seq">
                            <span className="acct-delivery-badge">Đợt {dot.seq_no}</span>
                            <span className="acct-delivery-date">
                              Ngày nhận: {fmtDate(dot.delivery_date)}
                            </span>
                          </div>
                          <div className="acct-delivery-due">
                            Hạn trả: {dot.chua_dat_han ? "Chưa đặt hạn" : fmtDate(dot.due_date)}
                          </div>
                        </div>

                        {/* Body: Danh sách hàng nhận dạng Bảng phân cột */}
                        <div className="acct-delivery-card__body">
                          <table className="acct-delivery-mini-table">
                            <thead>
                              <tr>
                                <th style={{ width: 32 }} className="text-center">#</th>
                                <th>Mặt hàng đã nhận</th>
                                <th style={{ textAlign: "right" }}>Số lượng nhận</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dot.lines.map((line, idx) => (
                                <tr key={line.id}>
                                  <td style={{ textAlign: "center", color: "#94a3b8" }}>{idx + 1}</td>
                                  <td style={{ fontWeight: 600 }}>{line.item_name}</td>
                                  <td style={{ textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                                    {line.quantity.toLocaleString("vi-VN")}{" "}
                                    <small style={{ color: "#64748b", fontWeight: 400 }}>
                                      {tenDonVi(line.unit) ?? line.unit}
                                    </small>
                                    {line.quantity_du > 0 && (
                                      <span
                                        className="acct-tag-pill acct-tag-pill--note"
                                        style={{ marginLeft: 6, display: "inline-flex" }}
                                        title={`${line.quantity_tinh_tien.toLocaleString("vi-VN")} tính tiền · ${line.quantity_du.toLocaleString("vi-VN")} vượt số đặt, giá 0đ`}
                                      >
                                        Đã nhận {line.quantity.toLocaleString("vi-VN")} · {line.quantity_du.toLocaleString("vi-VN")} dư
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Footer: Giá trị & nợ đợt */}
                        <div className="acct-delivery-card__foot">
                          <div className="acct-delivery-foot-item">
                            <span className="acct-delivery-foot-item__label">Giá trị đợt</span>
                            <span className="acct-delivery-foot-item__val">{money(dot.amount)}</span>
                          </div>

                          <div className="acct-delivery-foot-item">
                            <span className="acct-delivery-foot-item__label">Đã chi</span>
                            <span className="acct-delivery-foot-item__val">
                              {dot.paid_amount > 0 ? money(dot.paid_amount) : "0 đ"}
                            </span>
                          </div>

                          <div className="acct-delivery-foot-item">
                            <span className="acct-delivery-foot-item__label">Trừ cọc</span>
                            <span className="acct-delivery-foot-item__val">
                              {dot.coc_bu > 0 ? money(dot.coc_bu) : "0 đ"}
                            </span>
                          </div>

                          <div className="acct-delivery-foot-item acct-delivery-foot-item--due">
                            <span className="acct-delivery-foot-item__label">Còn nợ</span>
                            <span className="acct-delivery-foot-item__val">
                              {dot.con_no > 0 ? money(dot.con_no) : "Đã xong"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Phần Chứng Từ Chi / UNC */}
              <section className="acct-deliveries-section">
                <div className="acct-section-title">
                  <Icon name="fileText" size={14} />
                  Chứng từ chi / UNC ({vouchers.length})
                </div>

                {vouchersLoading ? (
                  <div className="acct-empty-state">
                    <div className="acct-empty-state__text">Đang tải chứng từ...</div>
                  </div>
                ) : vouchers.length === 0 ? (
                  <div className="acct-empty-state">
                    <div className="acct-empty-state__icon">
                      <Icon name="fileText" size={20} />
                    </div>
                    <div className="acct-empty-state__text">Chưa lập chứng từ chi nào cho đơn hàng này.</div>
                  </div>
                ) : (
                  <div className="acct-voucher-cards">
                    {vouchers.map((voucher) => (
                      <div className="acct-voucher-card" key={voucher.id}>
                        <div className="acct-voucher-card__left">
                          <div className="acct-voucher-card__code">
                            {voucher.code}
                            {voucher.delivery_seq_no && (
                              <small style={{ color: "#64748b", marginLeft: 6 }}>
                                (Đợt {voucher.delivery_seq_no})
                              </small>
                            )}
                          </div>
                          <div className="acct-voucher-card__meta">
                            <span>{VOUCHER_TYPE_LABEL[voucher.voucher_type]}</span>
                            <span>•</span>
                            <span>{PAYMENT_STAGE_LABEL[voucher.payment_stage]}</span>
                            <span>•</span>
                            <span>{fmtDate(voucher.voucher_date)}</span>
                          </div>
                        </div>

                        <div className="acct-voucher-card__right">
                          <span className="acct-voucher-card__amount">
                            {money(voucher.amount_vnd)}
                          </span>
                          <span className={`acct-dmh__state acct-dmh__state--${voucher.status}`}>
                            <i className="acct-dmh__dot" />
                            {VOUCHER_STATUS_LABEL[voucher.status]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Dải tổng công nợ ở chân tab 3 (chỉ hiện khi có > 1 đợt giao) */}
              {selected.deliveries.length > 1 && (
                <div className="acct-totals-bar">
                  <span className="acct-totals-bar__item">
                    Đã giao <strong>{money(selected.gia_tri_da_giao)}</strong>
                  </span>
                  <span className="acct-totals-bar__item">
                    Đã chi <strong>{money(selected.net_paid)}</strong>
                    {selected.receipt_received_amount > 0 && (
                      <small style={{ color: "#64748b" }}> (đã trừ {money(selected.receipt_received_amount)} thu về)</small>
                    )}
                  </span>
                  <span className="acct-totals-bar__item acct-totals-bar__item--due">
                    Còn nợ <strong>{money(selected.outstanding_amount)}</strong>
                  </span>
                </div>
              )}
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
