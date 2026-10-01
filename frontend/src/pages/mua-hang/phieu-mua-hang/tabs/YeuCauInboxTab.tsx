// Tab "Yêu cầu chờ xử lý" — hộp yêu cầu của bộ phận (tách từ pages/PurchaseRequestsPage.tsx).
// Giao diện theo CHUẨN Đơn mua hàng (Kế toán): một thẻ lọc `ToolbarChuan` + bảng `acct-dmh__frame`.
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { DepartmentPurchaseRequestRow } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { EmptyRow } from "../../../../components/EmptyState";
import { fmtDate } from "../../../../utils/format";
import { ToolbarChuan } from "../../../ke-toan/components/ToolbarChuan";
import { SOURCE_STATUS_META } from "../shared/constants";
import { purchaseChildSummary } from "../shared/helpers";
import type { SourceStatusFilter } from "../shared/types";
import { SourceStatusBadge } from "../components/purchaseCells";

/** Tab trạng thái hay dùng (≤6); phần còn lại nằm ở ô chọn "Trạng thái khác" để không mất đường lọc. */
const SOURCE_TABS: { value: string; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "open", label: SOURCE_STATUS_META.open.label },
  { value: "pending_approval", label: SOURCE_STATUS_META.pending_approval.label },
  { value: "in_purchase", label: SOURCE_STATUS_META.in_purchase.label },
  { value: "done", label: SOURCE_STATUS_META.done.label },
];

export function YeuCauInboxTab({
  bannerLoi,
  sourceQ,
  setSourceQ,
  sourceStatus,
  setSourceStatus,
  sourcePage,
  setSourcePage,
  sourceLoading,
  sourceError,
  sourceRows,
  sourceTotal,
  sourceTotalPages,
  loadSources,
  canCreate,
  openCreatePurchaseRequest,
}: {
  bannerLoi: ReactNode;
  sourceQ: string;
  setSourceQ: Dispatch<SetStateAction<string>>;
  sourceStatus: SourceStatusFilter;
  setSourceStatus: Dispatch<SetStateAction<SourceStatusFilter>>;
  sourcePage: number;
  setSourcePage: Dispatch<SetStateAction<number>>;
  sourceLoading: boolean;
  sourceError: string | null;
  sourceRows: DepartmentPurchaseRequestRow[];
  sourceTotal: number;
  sourceTotalPages: number;
  loadSources: () => void;
  canCreate: boolean;
  openCreatePurchaseRequest: (pickedSource: DepartmentPurchaseRequestRow) => void;
}) {
  const coLoc = sourceQ.trim() !== "" || sourceStatus !== "all";
  const tabStatus = SOURCE_TABS.some((t) => t.value === sourceStatus) ? sourceStatus : "";
  const trangThaiKhac = Object.entries(SOURCE_STATUS_META).filter(
    ([value]) => !SOURCE_TABS.some((t) => t.value === value),
  );
  return (
    <>
      {bannerLoi}

      <ToolbarChuan
        tabs={SOURCE_TABS}
        tab={tabStatus}
        ariaTabs="Lọc trạng thái yêu cầu"
        onTab={(v) => {
          setSourceStatus(v as SourceStatusFilter);
          setSourcePage(1);
        }}
        q={sourceQ}
        onQ={(v) => {
          setSourceQ(v);
          setSourcePage(1);
        }}
        onSearchSubmit={() => setSourcePage(1)}
        placeholder="Tìm mã yêu cầu, mục đích..."
        hasFilter={coLoc}
        onReset={() => {
          setSourceQ("");
          setSourceStatus("all");
          setSourcePage(1);
        }}
        selects={
          <select
            className="input acct-toolbar__select"
            aria-label="Trạng thái khác"
            value={tabStatus === "" ? sourceStatus : "all"}
            onChange={(e) => {
              setSourceStatus(e.target.value as SourceStatusFilter);
              setSourcePage(1);
            }}
          >
            <option value="all">Trạng thái khác</option>
            {trangThaiKhac.map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        }
      />

      <section className="md-page__tablewrap acct-list acct-dmh__frame purchase__source-inbox">
        <table className="md-page__table">
          <thead>
            {/* KHÔNG còn cột "Thao tác": bấm vào DÒNG là lập đơn luôn (openCreatePurchaseRequest).
                Thao tác gộp vào bản ghi cho khớp Yêu cầu mua hàng của phòng ban (24/08/2026). */}
            <tr>
              <th>Mã yêu cầu</th>
              <th>Nguồn</th>
              <th>Ngày tạo</th>
              <th>Cần hàng</th>
              <th>Vật tư</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {sourceLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="purchase__skeleton-row">
                  <td><div className="purchase__skeleton-bar" style={{ width: "130px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "150px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "90px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "90px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "110px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "90px" }} /></td>
                </tr>
              ))
            ) : sourceError ? (
              <EmptyRow
                colSpan={6}
                trangThai="loi"
                loi={sourceError}
                onThuLai={loadSources}
              />
            ) : sourceRows.length === 0 ? (
              <EmptyRow
                colSpan={6}
                icon="clipboard"
                title="Chưa có yêu cầu mua từ phòng ban"
                sub="Đơn mua hàng luôn bắt đầu từ một yêu cầu của bộ phận — chờ họ gửi sang."
              />
            ) : (
              sourceRows.map((row) => {
                const disabled = row.status !== "open";
                // Đếm/hiện món CÒN SỐNG (bỏ dòng đã huỷ) — khớp cách bảng Yêu cầu mua hàng đếm,
                // không thì phiếu "Hủy một phần" phồng số món lên vô nghĩa.
                const dong = row.lines.filter((line) => !line.cancelled_at);
                const bamDuoc = !disabled && canCreate;
                return (
                  <tr
                    key={row.id}
                    className={bamDuoc ? "" : "pmh__row--khoa"}
                    onClick={() => (bamDuoc ? openCreatePurchaseRequest(row) : undefined)}
                  >
                    <td className="acct-code-cell">
                      <span className="acct-dmh__code-badge">{row.code}</span>
                      {row.related_document_code && (
                        <div>
                          <span
                            className="acct-dmh__source-tag"
                            title={`Chứng từ liên quan: ${row.related_document_type || "Nguồn"} ${row.related_document_code}`}
                          >
                            {row.related_document_code}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="acct-dmh__supplier-name">
                        {row.requesting_department_name ||
                          row.requested_by_name ||
                          "Nội bộ"}
                      </div>
                      {row.requesting_department_name && row.requested_by_name && (
                        <div className="pmh__sub">{row.requested_by_name}</div>
                      )}
                    </td>
                    <td className="acct-dmh__date">{fmtDate(row.created_at)}</td>
                    <td className="acct-dmh__date">{fmtDate(row.needed_date)}</td>
                    <td title={dong.map((line) => line.item_name).join(", ")}>
                      <span className="purchase__item-chip">{dong.length} món</span>
                    </td>
                    <td>
                      <SourceStatusBadge status={row.workflow_status} />
                      {purchaseChildSummary(row) && (
                        <div className="pmh__sub">{purchaseChildSummary(row)}</div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!sourceLoading && (
          <div className="md-page__pager">
            <span>{sourceTotal} yêu cầu</span>
            <div>
              <Button
                variant="ghost"
                disabled={sourcePage <= 1}
                onClick={() => setSourcePage((value) => value - 1)}
              >
                Trước
              </Button>
              <span>
                {sourcePage}/{sourceTotalPages}
              </span>
              <Button
                variant="ghost"
                disabled={sourcePage >= sourceTotalPages}
                onClick={() => setSourcePage((value) => value + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
