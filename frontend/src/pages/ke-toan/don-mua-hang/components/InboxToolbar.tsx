// Thanh LỌC của màn Đơn mua hàng (Kế toán) — nâng cấp giao diện hiện đại (P1: Segmented Tabs + Compact Bar).
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SupplierRow } from "../../../../api/client";
import { Select, type SelectOption } from "../../../../components/Select";
import { Icon } from "../../../../components/Icons";
import { STATUS_META } from "../shared/constants";
import type { DepositFilter } from "../shared/types";

export function InboxToolbar({
  q,
  setQ,
  setPage,
  load,
  statusFilter,
  setStatusFilter,
  supplierFilter,
  setSupplierFilter,
  suppliers,
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
}: {
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  load: () => void;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  supplierFilter: number | "all";
  setSupplierFilter: Dispatch<SetStateAction<number | "all">>;
  suppliers: SupplierRow[];
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
}) {
  const [showDates, setShowDates] = useState(false);

  const hasFilter =
    q.trim() !== "" ||
    statusFilter !== "all" ||
    supplierFilter !== "all" ||
    depositFilter !== "all" ||
    createdFrom !== "" ||
    createdTo !== "" ||
    neededFrom !== "" ||
    neededTo !== "";

  const hasDateFilter = createdFrom !== "" || createdTo !== "" || neededFrom !== "" || neededTo !== "";

  const handleResetFilters = () => {
    setQ("");
    setStatusFilter("all");
    setSupplierFilter("all");
    setDepositFilter("all");
    setCreatedFrom("");
    setCreatedTo("");
    setNeededFrom("");
    setNeededTo("");
    setPage(1);
  };

  // Các tab trạng thái phổ biến nhất
  const statusTabs = [
    { value: "all", label: "Tất cả" },
    { value: "pending_approval", label: "Chờ duyệt" },
    { value: "approved", label: "Đã duyệt" },
    { value: "purchased", label: "Đang mua" },
    { value: "received", label: "Đã nhận" },
  ];

  const supplierOptions: SelectOption<number | "all">[] = [
    { value: "all", label: "Tất cả nhà cung cấp" },
    ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
  ];

  return (
    <section className="acct-dmh__toolbar-card">
      {/* Hàng 1: Dải Tab trạng thái nhanh + Nút Xóa bộ lọc */}
      <div className="acct-toolbar__top-row">
        <div className="acct-toolbar__tabs" role="tablist" aria-label="Lọc trạng thái đơn">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`acct-toolbar__tab${isActive ? " is-active" : ""}`}
                onClick={() => {
                  setStatusFilter(tab.value);
                  setPage(1);
                }}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
          {/* Dropdown các trạng thái khác (Từ chối, Giao 1 phần, Hủy) nếu đang chọn chúng */}
          {!statusTabs.some((t) => t.value === statusFilter) && statusFilter !== "all" && (
            <span className="acct-toolbar__tab is-active">
              {STATUS_META[statusFilter as keyof typeof STATUS_META]?.label || statusFilter}
            </span>
          )}
        </div>

        {hasFilter && (
          <button
            type="button"
            className="acct-toolbar__reset-btn"
            onClick={handleResetFilters}
            title="Xóa tất cả bộ lọc"
          >
            <Icon name="x" size={14} />
            <span>Xóa bộ lọc</span>
          </button>
        )}
      </div>

      {/* Hàng 2: Ô tìm kiếm + Bộ chọn NCC + Tiền cọc + Nút lọc Ngày */}
      <div className="acct-toolbar__main-row">
        <form
          className="acct-toolbar__search-wrap"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            load();
          }}
        >
          <Icon name="search" size={16} className="acct-toolbar__search-icon" />
          <input
            className="acct-toolbar__search-input"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Tìm mã đơn, YCMH, nhà cung cấp..."
          />
          {q && (
            <button
              type="button"
              className="acct-toolbar__clear-search"
              onClick={() => {
                setQ("");
                setPage(1);
              }}
              title="Xóa từ khóa"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </form>

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
          onChange={(event) => {
            setDepositFilter(event.target.value as DepositFilter);
            setPage(1);
          }}
        >
          <option value="all">Tất cả tiền cọc</option>
          <option value="none">Không cọc</option>
          <option value="unpaid">Chưa cọc</option>
          <option value="partial">Cọc thiếu</option>
          <option value="enough">Cọc đủ</option>
        </select>

        <button
          type="button"
          className={`acct-toolbar__date-toggle${hasDateFilter || showDates ? " is-active" : ""}`}
          onClick={() => setShowDates((v) => !v)}
          title="Mở bộ lọc ngày tạo & ngày cần hàng"
        >
          <Icon name="calendar" size={15} />
          <span>{hasDateFilter ? "Lọc ngày (Đang bật)" : "Khoảng ngày"}</span>
          <Icon name="chevron" size={14} className={`acct-toolbar__caret${showDates ? " is-open" : ""}`} />
        </button>
      </div>

      {/* Khối mở rộng: Bộ chọn Ngày Tạo & Ngày Cần Hàng (Chỉ hiện khi toggle hoặc đang có lọc ngày) */}
      {(showDates || hasDateFilter) && (
        <div className="acct-toolbar__date-panel">
          <div className="acct-toolbar__date-group">
            <span className="acct-toolbar__date-label">Ngày tạo:</span>
            <input
              className="input acct-toolbar__date"
              type="date"
              title="Ngày tạo từ"
              value={createdFrom}
              onChange={(event) => {
                setCreatedFrom(event.target.value);
                setPage(1);
              }}
            />
            <span className="acct-toolbar__date-sep">→</span>
            <input
              className="input acct-toolbar__date"
              type="date"
              title="Ngày tạo đến"
              value={createdTo}
              onChange={(event) => {
                setCreatedTo(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="acct-toolbar__date-group">
            <span className="acct-toolbar__date-label">Ngày cần hàng:</span>
            <input
              className="input acct-toolbar__date"
              type="date"
              title="Ngày cần từ"
              value={neededFrom}
              onChange={(event) => {
                setNeededFrom(event.target.value);
                setPage(1);
              }}
            />
            <span className="acct-toolbar__date-sep">→</span>
            <input
              className="input acct-toolbar__date"
              type="date"
              title="Ngày cần đến"
              value={neededTo}
              onChange={(event) => {
                setNeededTo(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
