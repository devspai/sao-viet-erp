// Thanh LỌC CHUẨN của khối Kế toán / Thu mua — cùng khuôn với InboxToolbar (màn Đơn mua hàng):
// hàng 1 = dải tab trạng thái (segmented) + nút "Xóa bộ lọc" + nút hành động bên phải;
// hàng 2 = ô tìm có icon + các ô chọn tuỳ màn + nút "Khoảng ngày" mở bảng lọc ngày.
// Dùng lại đúng class `acct-toolbar__*` / `acct-dmh__toolbar-card` trong accounting.css — đừng đẻ class mới.
import { ChonNgay } from "../../../components/ChonNgay";
import { useState, type ReactNode } from "react";
import { Icon } from "../../../components/Icons";

export type ToolbarTab = { value: string; label: string; count?: number };

export type ToolbarDateGroup = {
  label: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
};

export function ToolbarChuan({
  tabs,
  tab,
  onTab,
  ariaTabs,
  q,
  onQ,
  placeholder,
  onSearchSubmit,
  selects,
  dateGroups,
  hasFilter,
  onReset,
  actions,
}: {
  tabs?: ToolbarTab[];
  tab?: string;
  onTab?: (v: string) => void;
  ariaTabs?: string;
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  onSearchSubmit?: () => void;
  /** Các ô chọn (Select / <select className="input acct-toolbar__select">) — nằm cạnh ô tìm. */
  selects?: ReactNode;
  /** Có thì hiện nút "Khoảng ngày" + bảng lọc ngày; mỗi nhóm một dòng nhãn + từ → đến. */
  dateGroups?: ToolbarDateGroup[];
  hasFilter: boolean;
  onReset: () => void;
  /** Nút hành động chính của màn (vd "+ Tạo phiếu chi") — đặt cuối hàng 1. */
  actions?: ReactNode;
}) {
  const [showDates, setShowDates] = useState(false);
  const hasDateFilter = (dateGroups ?? []).some((g) => g.from !== "" || g.to !== "");

  return (
    <section className="acct-dmh__toolbar-card">
      {(tabs || hasFilter || actions) && (
        <div className="acct-toolbar__top-row">
          {tabs ? (
            <div className="acct-toolbar__tabs" role="tablist" aria-label={ariaTabs ?? "Lọc trạng thái"}>
              {tabs.map((t) => {
                const active = tab === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`acct-toolbar__tab${active ? " is-active" : ""}`}
                    onClick={() => onTab?.(t.value)}
                  >
                    <span>{t.label}</span>
                    {typeof t.count === "number" && (
                      <span className="acct-toolbar__tab-count">{t.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
            {hasFilter && (
              <button type="button" className="acct-toolbar__reset-btn" onClick={onReset} title="Xóa tất cả bộ lọc">
                <Icon name="x" size={14} />
                <span>Xóa bộ lọc</span>
              </button>
            )}
            {actions}
          </div>
        </div>
      )}

      <div className="acct-toolbar__main-row">
        <form
          className="acct-toolbar__search-wrap"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchSubmit?.();
          }}
        >
          <Icon name="search" size={16} className="acct-toolbar__search-icon" />
          <input
            className="acct-toolbar__search-input"
            value={q}
            onChange={(event) => onQ(event.target.value)}
            placeholder={placeholder}
          />
          {q && (
            <button type="button" className="acct-toolbar__clear-search" onClick={() => onQ("")} title="Xóa từ khóa">
              <Icon name="x" size={14} />
            </button>
          )}
        </form>
        {selects}
        {dateGroups && dateGroups.length > 0 && (
          <button
            type="button"
            className={`acct-toolbar__date-toggle${hasDateFilter || showDates ? " is-active" : ""}`}
            onClick={() => setShowDates((v) => !v)}
            title="Mở bộ lọc ngày"
          >
            <Icon name="calendar" size={15} />
            <span>{hasDateFilter ? "Lọc ngày (Đang bật)" : "Khoảng ngày"}</span>
            <Icon name="chevron" size={14} className={`acct-toolbar__caret${showDates ? " is-open" : ""}`} />
          </button>
        )}
      </div>

      {dateGroups && (showDates || hasDateFilter) && (
        <div className="acct-toolbar__date-panel">
          {dateGroups.map((g) => (
            <div key={g.label} className="acct-toolbar__date-group">
              <span className="acct-toolbar__date-label">{g.label}:</span>
              <ChonNgay
                className="input acct-toolbar__date"
                title={`${g.label} từ`}
                aria-label={`${g.label} từ`}
                value={g.from}
                onChange={(v) => g.onFrom(v)}
              />
              <span className="acct-toolbar__date-sep">→</span>
              <ChonNgay
                className="input acct-toolbar__date"
                title={`${g.label} đến`}
                aria-label={`${g.label} đến`}
                value={g.to}
                onChange={(v) => g.onTo(v)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
