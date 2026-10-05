// Ô/nhãn nhỏ dùng lại khắp màn Mua hàng (tách từ pages/PurchaseRequestsPage.tsx).
import type { ReactNode } from "react";
import type {
  DepartmentPurchaseWorkflowStatus,
  PurchaseRequestRow,
  PurchaseRequestStatus,
} from "../../../../api/client";
import { money } from "../../../../utils/format";
import { SOURCE_STATUS_META, STATUS_META } from "../shared/constants";

function getInitial(name?: string | null): string {
  if (!name) return "?";
  const clean = name
    .replace(/^(công ty|tnhh|cp|doanh nghiệp|dntn|nha cung cap|nhà cung cấp)\s+/i, "")
    .trim();
  return (clean[0] || name[0] || "?").toUpperCase();
}

export function DepositCell({ row }: { row: PurchaseRequestRow }) {
  if ((row.deposit_expected ?? 0) <= 0) {
    return <span className="pmh__deposit-badge pmh__deposit-badge--none">-</span>;
  }
  const paid = row.coc_da_chi ?? 0;
  const expected = row.deposit_expected ?? 0;
  const isOk = paid >= expected;
  const isWarn = paid > 0 && paid < expected;
  const toneClass = isOk ? "ok" : isWarn ? "warn" : "empty";

  return (
    <div className={`purchase__deposit purchase__deposit--${toneClass}`}>
      <strong>{money(paid)}</strong>
      <span>/ {money(expected)}</span>
    </div>
  );
}

export function VendorCell({ name }: { name?: string | null }) {
  if (!name) {
    return <span className="md-page__muted">Chưa chọn</span>;
  }
  const initial = getInitial(name);
  return (
    <div className="pmh__vendor-badge" title={name}>
      <span className="pmh__vendor-avatar">{initial}</span>
      <span className="acct-dmh__supplier-name">{name}</span>
    </div>
  );
}

export function ApproverCell({
  creator,
  approver,
}: {
  creator?: string | null;
  approver?: string | null;
}) {
  if (creator && approver && creator === approver) {
    return (
      <div className="pmh__person-flow">
        <span className="pmh__person-creator">{creator}</span>
      </div>
    );
  }
  return (
    <div className="pmh__person-flow">
      <span className="pmh__person-creator">{creator || <span className="md-page__muted">—</span>}</span>
      {approver && (
        <span className="pmh__person-approver">
          <span className="pmh__person-approver-label">Duyệt:</span> {approver}
        </span>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: PurchaseRequestStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`acct-dmh__state acct-dmh__state--${meta.tone}`}>
      <i className="acct-dmh__dot" />
      {meta.label}
    </span>
  );
}

export function SourceStatusBadge({
  status,
}: {
  status: DepartmentPurchaseWorkflowStatus;
}) {
  const meta = SOURCE_STATUS_META[status];
  return (
    <span className={`acct-dmh__state acct-dmh__state--${meta.tone}`}>
      <i className="acct-dmh__dot" />
      {meta.label}
    </span>
  );
}

export function LocalField({
  label,
  wide = false,
  required = false,
  children,
}: {
  label: string;
  wide?: boolean;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`purchase__field${wide ? " md-page__form-wide" : ""}`}>
      <span>
        {label}
        {required && <span className="purchase__required-star"> *</span>}
      </span>
      {children}
    </label>
  );
}

