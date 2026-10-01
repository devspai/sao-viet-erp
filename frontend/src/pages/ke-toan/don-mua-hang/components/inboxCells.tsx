// Ô/nhãn nhỏ của màn Đơn mua hàng (Kế toán) — tách từ pages/AccountingPurchaseInboxPage.tsx.
import type { PurchaseRequestRow } from "../../../../api/client";
import { money } from "../../../../utils/format";

export function DepositCell({ row }: { row: PurchaseRequestRow }) {
  if ((row.deposit_expected ?? 0) <= 0) {
    return <span className="md-page__muted">—</span>;
  }
  const paid = row.coc_da_chi ?? 0;
  const expected = row.deposit_expected ?? 0;
  const percent = Math.min(100, Math.round((paid / expected) * 100));
  const tone = paid >= expected ? "ok" : paid > 0 ? "warn" : "empty";
  return (
    <div
      className={`acct-deposit-pill acct-deposit-pill--${tone}`}
      title={`Đã chi cọc ${money(paid)} trên tổng cọc dự kiến ${money(expected)} (${percent}%)`}
    >
      <span className="acct-deposit-pill__val">{money(paid)}</span>
      <span className="acct-deposit-pill__sep">/</span>
      <span className="acct-deposit-pill__max">{money(expected)}</span>
    </div>
  );
}
