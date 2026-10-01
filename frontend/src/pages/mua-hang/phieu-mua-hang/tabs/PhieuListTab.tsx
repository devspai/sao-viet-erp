// Tab "Đơn mua hàng" — bảng phiếu mua + bộ lọc (tách từ pages/PurchaseRequestsPage.tsx).
// Giao diện theo CHUẨN Đơn mua hàng (Kế toán): một thẻ lọc `ToolbarChuan` + bảng `acct-dmh__frame`.
import type { Dispatch, SetStateAction } from "react";
import type { PurchaseRequestRow, SupplierRow } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { CodeLink } from "../../../../components/CodeLink";
import { EmptyRow } from "../../../../components/EmptyState";
import { Icon } from "../../../../components/Icons";
import { Select, type SelectOption } from "../../../../components/Select";
import { fmtDate, money } from "../../../../utils/format";
import { ToolbarChuan } from "../../../ke-toan/components/ToolbarChuan";
import { STATUS_META } from "../shared/constants";
import { noiDung } from "../shared/helpers";
import type { DepositFilter, PurchaseTab, StatusFilter } from "../shared/types";
import { DepositCell, StatusBadge, VendorCell, ApproverCell } from "../components/purchaseCells";

/** Tab trạng thái hay dùng (≤6); phần còn lại nằm ở ô chọn "Trạng thái khác" để không mất đường lọc. */
const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "draft", label: "Nháp" },
  { value: "pending_approval", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "purchased", label: "Đang mua" },
  { value: "received", label: "Đã nhận" },
];

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
  supplierFilter,
  setSupplierFilter,
  depositFilter,
  setDepositFilter,
  createdFrom,
  setCreatedFrom,
  createdTo,
  setCreatedTo,
  neededFrom,
  setNeededFrom,
  neededTo,
  setNeededTo,
  suppliers,
  loading,
  listError,
  load,
  rows,
  selected,
  setSelectedId,
  openYcmh,
  total,
  totalPages,
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
  supplierFilter: number | "all";
  setSupplierFilter: Dispatch<SetStateAction<number | "all">>;
  depositFilter: DepositFilter;
  setDepositFilter: Dispatch<SetStateAction<DepositFilter>>;
  createdFrom: string;
  setCreatedFrom: Dispatch<SetStateAction<string>>;
  createdTo: string;
  setCreatedTo: Dispatch<SetStateAction<string>>;
  neededFrom: string;
  setNeededFrom: Dispatch<SetStateAction<string>>;
  neededTo: string;
  setNeededTo: Dispatch<SetStateAction<string>>;
  suppliers: SupplierRow[];
  loading: boolean;
  listError: string | null;
  load: () => void;
  rows: PurchaseRequestRow[];
  selected: PurchaseRequestRow | null;
  setSelectedId: Dispatch<SetStateAction<number | null>>;
  /** Thiếu = không có ô Xem màn Yêu cầu mua hàng ⇒ mã chỉ hiện dạng chữ. */
  openYcmh?: (code: string) => void;
  total: number;
  totalPages: number;
}) {
  // Ô lọc NCC là <Select searchable> chứ không phải <select>: danh sách nhà cung cấp dài, thẻ
  // gốc không gõ tìm được. Giữ NGUYÊN kiểu giá trị `"all" | number` và thứ tự option cũ.
  const supplierOptions: SelectOption<number | "all">[] = [
    { value: "all", label: "Tất cả nhà cung cấp" },
    ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
  ];
  const coLoc =
    q.trim() !== "" ||
    status !== "all" ||
    supplierFilter !== "all" ||
    depositFilter !== "all" ||
    createdFrom !== "" ||
    createdTo !== "" ||
    neededFrom !== "" ||
    neededTo !== "";
  const xoaLoc = () => {
    setQ("");
    setStatus("all");
    setSupplierFilter("all");
    setDepositFilter("all");
    setCreatedFrom("");
    setCreatedTo("");
    setNeededFrom("");
    setNeededTo("");
    setPage(1);
  };
  // Đang lọc một trạng thái ÍT GẶP (không có tab) ⇒ không tab nào sáng, ô "Trạng thái khác" giữ giá trị.
  const tabStatus = STATUS_TABS.some((t) => t.value === status) ? status : "";
  const trangThaiKhac = Object.entries(STATUS_META).filter(
    ([value]) => !STATUS_TABS.some((t) => t.value === value),
  );
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

    <ToolbarChuan
      tabs={STATUS_TABS}
      tab={tabStatus}
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
      onSearchSubmit={() => setPage(1)}
      placeholder="Tìm mã phiếu, mục đích, ghi chú..."
      hasFilter={coLoc}
      onReset={xoaLoc}
      selects={
        <>
          <select
            className="input acct-toolbar__select"
            aria-label="Trạng thái khác"
            value={tabStatus === "" ? status : "all"}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
          >
            <option value="all">Trạng thái khác</option>
            {trangThaiKhac.map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
          <div className="acct-toolbar__filter-select">
            <Select
              options={supplierOptions}
              value={supplierFilter}
              onChange={(v) => {
                setSupplierFilter(v === "all" ? "all" : Number(v));
                setPage(1);
              }}
              ariaLabel="Lọc nhà cung cấp"
              searchable
              searchPlaceholder="Tìm nhà cung cấp…"
              portal
              className="acct-toolbar__select"
            />
          </div>
          <select
            className="input acct-toolbar__select"
            value={depositFilter}
            onChange={(e) => {
              setDepositFilter(e.target.value as DepositFilter);
              setPage(1);
            }}
          >
            <option value="all">Tất cả tiền cọc</option>
            <option value="none">Không yêu cầu cọc</option>
            <option value="unpaid">Chưa cọc</option>
            <option value="partial">Cọc thiếu</option>
            <option value="enough">Cọc đủ</option>
          </select>
        </>
      }
      dateGroups={[
        {
          label: "Ngày tạo",
          from: createdFrom,
          to: createdTo,
          onFrom: (v) => {
            setCreatedFrom(v);
            setPage(1);
          },
          onTo: (v) => {
            setCreatedTo(v);
            setPage(1);
          },
        },
        {
          label: "Ngày cần hàng",
          from: neededFrom,
          to: neededTo,
          onFrom: (v) => {
            setNeededFrom(v);
            setPage(1);
          },
          onTo: (v) => {
            setNeededTo(v);
            setPage(1);
          },
        },
      ]}
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
                <td className="acct-dmh__date">{fmtDate(row.created_at)}</td>
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
      {!loading && (
        <div className="md-page__pager">
          <span>{total} đơn</span>
          <div>
            <Button
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Trước
            </Button>
            <span>
              {page}/{totalPages}
            </span>
            <Button
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
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
