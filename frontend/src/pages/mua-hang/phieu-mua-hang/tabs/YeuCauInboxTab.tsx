// Tab "Yêu cầu chờ xử lý" — hộp yêu cầu của bộ phận (tách từ pages/PurchaseRequestsPage.tsx).
// Giao diện theo CHUẨN Đơn mua hàng (Kế toán): thẻ lọc (tab có số + ô tìm + thanh lọc chung `ThanhLoc`)
// + bảng `acct-dmh__frame`. 06/10/2026: bỏ `ToolbarChuan` + ô "Trạng thái khác" rời; kỳ theo Ngày tạo /
// Ngày cần hàng, điều kiện Phòng ban, Người yêu cầu, Mặt hàng — cùng bộ với màn Yêu cầu mua hàng.
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { DepartmentPurchaseRequestRow } from "../../../../api/client";
import { EmptyRow } from "../../../../components/EmptyState";
import { PhanTrangDayDu } from "../../../../components/PhanTrangDayDu";
import { fmtDate, fmtDateTime } from "../../../../utils/format";
import type { KyDS } from "../../../thanh-loc/ky-danh-sach";
import type { DieuKien } from "../../../thanh-loc/thanh-loc";
import { ThanhCongCuMuaHang, tabCoSo } from "../../loc-mua-hang/ThanhCongCuMuaHang";
import { MOC_YEU_CAU, TAB_CHINH_YEU_CAU, type LocYeuCau } from "../../loc-mua-hang/dieu-kien-yeu-cau";
import { SOURCE_STATUS_META } from "../shared/constants";
import { purchaseChildSummary } from "../shared/helpers";
import type { SourceStatusFilter } from "../shared/types";
import { SourceStatusBadge } from "../components/purchaseCells";

export function YeuCauInboxTab({
  bannerLoi,
  sourceQ,
  setSourceQ,
  sourceStatus,
  setSourceStatus,
  demTheoTab,
  ky,
  onKy,
  dieuKien,
  loc,
  onLoc,
  xoaLocThem,
  coLocThem,
  sourcePage,
  setSourcePage,
  sourceLoading,
  sourceError,
  sourceRows,
  sourceTotal,
  sourceSize,
  onSourceSize,
  loadSources,
  canCreate,
  openCreatePurchaseRequest,
}: {
  bannerLoi: ReactNode;
  sourceQ: string;
  setSourceQ: Dispatch<SetStateAction<string>>;
  sourceStatus: SourceStatusFilter;
  setSourceStatus: Dispatch<SetStateAction<SourceStatusFilter>>;
  /** Số yêu cầu theo trạng thái hiển thị — máy chủ đếm sau lọc, trước tab. */
  demTheoTab: Record<string, number> | null;
  ky: KyDS;
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<LocYeuCau>[];
  loc: LocYeuCau;
  onLoc: (l: LocYeuCau) => void;
  /** Bỏ kỳ + điều kiện của thanh lọc (ô tìm và tab do tab này tự bỏ). */
  xoaLocThem: () => void;
  coLocThem: boolean;
  sourcePage: number;
  setSourcePage: Dispatch<SetStateAction<number>>;
  sourceLoading: boolean;
  sourceError: string | null;
  sourceRows: DepartmentPurchaseRequestRow[];
  sourceTotal: number;
  sourceSize: number;
  onSourceSize: (size: number) => void;
  loadSources: () => void;
  canCreate: boolean;
  openCreatePurchaseRequest: (pickedSource: DepartmentPurchaseRequestRow) => void;
}) {
  const coLoc = sourceQ.trim() !== "" || sourceStatus !== "all" || coLocThem;
  const xoaLoc = () => {
    setSourceQ("");
    setSourceStatus("all");
    xoaLocThem();
    setSourcePage(1);
  };
  return (
    <>
      {bannerLoi}

      <ThanhCongCuMuaHang
        tabs={tabCoSo(TAB_CHINH_YEU_CAU, SOURCE_STATUS_META, demTheoTab, sourceStatus)}
        tab={sourceStatus}
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
        placeholder="Tìm mã yêu cầu, mục đích..."
        ky={ky}
        moc={MOC_YEU_CAU}
        onKy={onKy}
        dieuKien={dieuKien}
        loc={loc}
        onLoc={onLoc}
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
                title={coLoc ? "Không có yêu cầu nào khớp" : "Chưa có yêu cầu mua từ phòng ban"}
                sub={
                  coLoc
                    ? "Thử bỏ bớt bộ lọc hoặc xoá từ khoá tìm kiếm."
                    : "Đơn mua hàng luôn bắt đầu từ một yêu cầu của bộ phận — chờ họ gửi sang."
                }
                action={
                  coLoc ? (
                    <button type="button" className="btn btn--ghost" onClick={xoaLoc}>
                      Xoá bộ lọc
                    </button>
                  ) : undefined
                }
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
                    <td className="acct-dmh__date" title={fmtDateTime(row.created_at)}>
                      {fmtDate(row.created_at)}
                    </td>
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
        {sourceTotal > 0 && (
          <PhanTrangDayDu
            trang={sourcePage}
            size={sourceSize}
            tong={sourceTotal}
            soDong={sourceRows.length}
            onTrang={setSourcePage}
            onSize={onSourceSize}
            loading={sourceLoading}
            donVi="yêu cầu"
            ariaLabel="Phân trang yêu cầu chờ xử lý"
          />
        )}
      </section>
    </>
  );
}
