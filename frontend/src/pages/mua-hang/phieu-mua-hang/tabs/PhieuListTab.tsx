// Tab "Đơn mua hàng" — bảng phiếu mua + bộ lọc (tách từ pages/PurchaseRequestsPage.tsx).
// Giao diện theo CHUẨN Đơn mua hàng (Kế toán): thẻ lọc (tab có số + ô tìm + thanh lọc chung `ThanhLoc`)
// + bảng `acct-dmh__frame`. 06/10/2026: bỏ `ToolbarChuan`, ô "Trạng thái khác" / NCC / Tiền cọc rời và
// hai cặp ô ngày rời — kỳ theo Ngày tạo / Ngày cần / Ngày dự kiến nhận; điều kiện Nhà cung cấp, Tiền
// cọc, Tổng dự kiến; lọc + đếm tab ở máy chủ.
import type { Dispatch, SetStateAction } from "react";
import type { PurchaseRequestRow } from "../../../../api/client";
import { CodeLink } from "../../../../components/CodeLink";
import { EmptyRow } from "../../../../components/EmptyState";
import { Icon } from "../../../../components/Icons";
import { PhanTrangDayDu } from "../../../../components/PhanTrangDayDu";
import { fmtDate, fmtDateTime, money } from "../../../../utils/format";
import type { KyDS } from "../../../thanh-loc/ky-danh-sach";
import type { DieuKien } from "../../../thanh-loc/thanh-loc";
import { ThanhCongCuMuaHang, tabCoSo } from "../../loc-mua-hang/ThanhCongCuMuaHang";
import { MOC_DON_MUA_HANG, type LocDonMuaHang } from "../../loc-mua-hang/dieu-kien-don-mua";
import { STATUS_META } from "../shared/constants";
import { noiDung } from "../shared/helpers";
import type { PurchaseTab, StatusFilter } from "../shared/types";
import { DepositCell, StatusBadge, VendorCell, ApproverCell } from "../components/purchaseCells";

/** Tab trạng thái luôn hiện; Từ chối / Giao một phần / Đã hủy chỉ hiện khi có đơn (hoặc đang chọn). */
const TAB_CHINH = ["draft", "pending_approval", "approved", "purchased", "received"];

export function PhieuListTab({
  coYcQuaHan,
  choMua,
  setTab,
  q,
  setQ,
  page,
  setPage,
  status,
  setStatus,
  demTheoTab,
  ky,
  onKy,
  dieuKien,
  loc,
  onLoc,
  xoaLocThem,
  coLocThem,
  loading,
  listError,
  load,
  rows,
  selected,
  setSelectedId,
  openYcmh,
  total,
  size,
  onSize,
}: {
  coYcQuaHan: boolean;
  choMua: { soLuong: number; somNhat: string | null };
  setTab: Dispatch<SetStateAction<PurchaseTab>>;
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  status: StatusFilter;
  setStatus: Dispatch<SetStateAction<StatusFilter>>;
  /** Số đơn theo trạng thái — máy chủ đếm sau lọc, trước tab (`tat_ca` = tab Tất cả). */
  demTheoTab: Record<string, number> | null;
  ky: KyDS;
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<LocDonMuaHang>[];
  loc: LocDonMuaHang;
  onLoc: (l: LocDonMuaHang) => void;
  /** Bỏ kỳ + điều kiện của thanh lọc (ô tìm và tab do tab này tự bỏ). */
  xoaLocThem: () => void;
  coLocThem: boolean;
  loading: boolean;
  listError: string | null;
  load: () => void;
  rows: PurchaseRequestRow[];
  selected: PurchaseRequestRow | null;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  /** Thiếu = không có ô Xem màn Yêu cầu mua hàng ⇒ mã chỉ hiện dạng chữ. */
  openYcmh?: (code: string) => void;
  total: number;
  size: number;
  onSize: (size: number) => void;
}) {
  const coLoc = q.trim() !== "" || status !== "all" || coLocThem;
  const xoaLoc = () => {
    setQ("");
    setStatus("all");
    xoaLocThem();
    setPage(1);
  };
  return (
    <>
    {/* Dải nhắc CHỈ hiện khi có yêu cầu đã quá ngày cần hàng — nó là lời cảnh báo, không phải
        thanh trạng thái. Ngày bình thường không render gì cả (xem `coYcQuaHan`). */}
    {coYcQuaHan && (
      <div className="purchase__nhac" role="status">
        <Icon name="alert" size={14} />
        <span>
          <b>{choMua.soLuong}</b> yêu cầu đang chờ, sớm nhất cần{" "}
          {fmtDate(choMua.somNhat)}
        </span>
        <button
          type="button"
          className="purchase__nhac-xem"
          onClick={() => setTab("yeu-cau")}
        >
          Xem
        </button>
      </div>
    )}

    <ThanhCongCuMuaHang
      tabs={tabCoSo(TAB_CHINH, STATUS_META, demTheoTab, status)}
      tab={status}
      ariaTabs="Lọc trạng thái đơn mua"
      onTab={(v) => {
        setStatus(v as StatusFilter);
        setPage(1);
      }}
      q={q}
      onQ={(v) => {
        setQ(v);
        setPage(1);
      }}
      placeholder="Tìm mã phiếu, mục đích, ghi chú..."
      ky={ky}
      moc={MOC_DON_MUA_HANG}
      onKy={onKy}
      dieuKien={dieuKien}
      loc={loc}
      onLoc={onLoc}
    />

    <section className="md-page__tablewrap acct-list acct-dmh__frame">
      <table className="md-page__table">
        <thead>
          <tr>
            {/* KHÔNG còn cột "Thao tác": bấm vào DÒNG mở drawer chi tiết, mọi thao tác (In · Sửa ·
                Gửi duyệt · Ghi đợt giao · Huỷ…) nằm ở chân drawer. Gộp thao tác vào bản ghi cho
                khớp Yêu cầu mua hàng của phòng ban (24/08/2026). */}
            <th>Mã đơn</th>
            <th>Nhà cung cấp</th>
            <th>Ngày tạo</th>
            <th>Ngày cần / nhận</th>
            <th className="acct-amount-cell">Tổng dự kiến</th>
            <th className="acct-amount-cell">Tiền cọc</th>
            <th>Người tạo / duyệt</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="purchase__skeleton-row">
                <td><div className="purchase__skeleton-bar" style={{ width: "120px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "150px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "90px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "90px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "80px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "90px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "110px" }} /></td>
                <td><div className="purchase__skeleton-bar" style={{ width: "110px" }} /></td>
              </tr>
            ))
          ) : listError ? (
            <EmptyRow colSpan={8} trangThai="loi" loi={listError} onThuLai={load} />
          ) : rows.length === 0 ? (
            <EmptyRow
              colSpan={8}
              icon="cart"
              title="Chưa có đơn mua hàng nào khớp"
              sub={
                coLoc
                  ? "Thử bỏ bớt bộ lọc hoặc xoá từ khoá tìm kiếm."
                  : "Sang tab Yêu cầu chờ xử lý để chọn một yêu cầu rồi lập đơn mua."
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
            rows.map((row) => (
              <tr
                key={row.id}
                className={selected?.id === row.id ? "purchase__row--selected" : ""}
                title={noiDung(row) ? `Mục đích / Ghi chú: ${noiDung(row)}` : undefined}
                onClick={() => setSelectedId(row.id)}
              >
                <td className="acct-code-cell">
                  <span className="acct-dmh__code-badge">{row.code}</span>
                  {row.sources.length > 0 && (
                    <div className="purchase__source-codes">
                      {row.sources.map((source, index) => (
                        <span key={source.id} className="acct-dmh__source-tag">
                          {index > 0 && ", "}
                          <CodeLink code={source.code} onOpen={openYcmh} />
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td
                  className="acct-supplier-cell"
                  title={row.supplier_name ?? undefined}
                >
                  <VendorCell name={row.supplier_name} />
                </td>
                <td className="acct-dmh__date" title={fmtDateTime(row.created_at)}>
                  {fmtDate(row.created_at)}
                </td>
                <td className="acct-dmh__date">
                  <div>{fmtDate(row.needed_date)}</div>
                  {row.expected_receipt_date && row.expected_receipt_date !== row.needed_date && (
                    <div className="pmh__sub" style={{ color: "#2563eb", fontWeight: 500 }}>
                      Dự kiến: {fmtDate(row.expected_receipt_date)}
                    </div>
                  )}
                </td>
                <td className="acct-amount-cell">
                  <strong className="acct-dmh__total" style={{ color: "#0f172a", fontSize: 13.5 }}>
                    {money(row.total_estimate)}
                  </strong>
                </td>
                <td className="acct-amount-cell">
                  <DepositCell row={row} />
                </td>
                <td>
                  <ApproverCell
                    creator={row.created_by_name}
                    approver={row.approved_by_name}
                  />
                </td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {total > 0 && (
        <PhanTrangDayDu
          trang={page}
          size={size}
          tong={total}
          soDong={rows.length}
          onTrang={setPage}
          onSize={onSize}
          loading={loading}
          donVi="đơn"
          ariaLabel="Phân trang đơn mua hàng"
        />
      )}
    </section>
    </>
  );
}
