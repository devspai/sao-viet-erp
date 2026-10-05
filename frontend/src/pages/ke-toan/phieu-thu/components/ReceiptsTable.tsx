// Bảng danh sách phiếu thu (tách từ pages/PaymentReceiptsPage.tsx).
import type { Dispatch, SetStateAction } from "react";
import type { PaymentReceiptRow } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { CodeLink } from "../../../../components/CodeLink";
import { Icon } from "../../../../components/Icons";
import { fmtDateTime, money, originalMoney } from "../../../../utils/format";
import { PILL_TONE, STATUS_META } from "../shared/constants";
import { methodText, sourceCode, sourceLabel } from "../shared/helpers";

export function ReceiptsTable({
  loading,
  rows,
  selected,
  setSelectedId,
  openSource,
  total,
  page,
  setPage,
  totalPages,
}: {
  loading: boolean;
  rows: PaymentReceiptRow[];
  selected: PaymentReceiptRow | null;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  openSource: (row: PaymentReceiptRow) => void;
  total: number;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  totalPages: number;
}) {
  return (
    <section className="md-page__tablewrap acct-list acct-dmh__frame">
      <table className="md-page__table">
        <thead>
          <tr>
            {/* KHÔNG còn cột "Thao tác": bấm vào DÒNG mở drawer chi tiết, mọi thao tác nằm ở
                chân drawer (24/08/2026 — gộp thao tác vào bản ghi). */}
            <th>Mã phiếu thu</th>
            <th>Người nộp</th>
            <th>Người lập</th>
            <th>Lập lúc</th>
            <th className="acct-amount-cell">Số tiền</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="purchase__skeleton-row">
                <td><div className="purchase__skeleton-bar" style={{ width: "130px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "140px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "120px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "110px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "90px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "80px" }} /></td>
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={6}>
                <div
                  className="acct-empty-state"
                  title="Phiếu thu ghi nhận tiền vào công ty: thu cọc đơn bán, thu hóa đơn, thu hoàn từ phiếu chi và các khoản thu khác."
                >
                  <div className="acct-empty-state__icon">
                    <Icon name="fileText" size={20} />
                  </div>
                  <div className="acct-empty-state__text">
                    Chưa có phiếu thu phù hợp. Có thể tạo phiếu thu trực tiếp, hoặc
                    lập từ đơn bán/phiếu chi nguồn khi phát sinh nghiệp vụ.
                  </div>
                </div>
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr
                key={row.id}
                className={
                  row.id === selected?.id ? "purchase__row--selected" : ""
                }
                onClick={() => setSelectedId(row.id)}
              >
                <td className="acct-code-cell">
                  <span className="acct-dmh__code-badge">{row.code}</span>
                  <div className="purchase__source-codes">
                    {sourceCode(row) ? (
                      <>
                        <CodeLink
                          code={sourceCode(row)!}
                          onOpen={() => openSource(row)}
                          title={`Mở ${sourceLabel(row)}`}
                        />
                        <small>
                          {sourceLabel(row)}
                          {row.source_type === "sales_invoice" && row.order_code ? ` · Đơn ${row.order_code}` : ""}
                        </small>
                      </>
                    ) : (
                      <span>{sourceLabel(row)}</span>
                    )}
                  </div>
                </td>
                <td
                  className="acct-supplier-cell"
                  title={`${row.payer_name} · ${methodText(row)}`}
                >
                  {row.payer_name}
                </td>
                <td className="acct-user-cell">
                  <div title={row.created_by_name ?? undefined}>
                    {row.created_by_name || "—"}
                  </div>
                </td>
                <td className="acct-time-cell acct-dmh__date">
                  {fmtDateTime(row.created_at)}
                </td>
                <td className="acct-amount-cell">
                  <strong className="acct-dmh__total">{money(row.amount_vnd)}</strong>
                  {row.currency !== "VND" && (
                    <small>
                      {originalMoney(row.amount, row.currency)}
                    </small>
                  )}
                </td>
                <td>
                  <span
                    className={`acct-dmh__state acct-dmh__state--${PILL_TONE[row.status]}`}
                  >
                    <i className="acct-dmh__dot" aria-hidden="true" />
                    {STATUS_META[row.status].label}
                  </span>
                  {row.status === "received" &&
                    row.attachment_count === 0 && (
                      <span className="acct-pt__flag">
                        <i className="acct-pt__dot" aria-hidden="true" />
                        Thiếu chứng từ
                      </span>
                    )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && (
        <div className="md-page__pager">
          <span>{total} phiếu thu</span>
          <div>
            <Button
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Trước
            </Button>
            <span>
              {page}/{totalPages}
            </span>
            <Button
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
