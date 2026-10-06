// Thanh LỌC của màn Đơn mua hàng (Kế toán): hàng tab trạng thái có số (máy chủ đếm theo đúng ô tìm,
// kỳ và điều kiện đang áp) + hàng ô tìm và thanh lọc chung `ThanhLoc` (kỳ theo Ngày tạo / Ngày cần,
// điều kiện Nhà cung cấp, Tiền cọc). Thay ô ngày rời + hai ô chọn rời cũ (06/10/2026).
import type { Dispatch, SetStateAction } from "react";
import { Icon } from "../../../../components/Icons";
import { ThanhLoc } from "../../../thanh-loc/ThanhLoc";
import type { KyDS } from "../../../thanh-loc/ky-danh-sach";
import { dkTheoTab, type DieuKien } from "../../../thanh-loc/thanh-loc";
import { MOC_DON_MUA, type LocDonMua } from "../shared/dieuKienDonMua";
import { STATUS_META } from "../shared/constants";

// Các tab trạng thái phổ biến nhất.
const STATUS_TABS = [
  { value: "all", label: "Tất cả" },
  { value: "pending_approval", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "purchased", label: "Đang mua" },
  { value: "received", label: "Đã nhận" },
];

export function InboxToolbar({
  q,
  setQ,
  setPage,
  load,
  statusFilter,
  setStatusFilter,
  demTheoTab,
  ky,
  onKy,
  dieuKien,
  loc,
  onLoc,
}: {
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  load: () => void;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  /** Số đơn theo trạng thái (máy chủ đếm sau lọc, trước tab) — `tat_ca` cho tab Tất cả. */
  demTheoTab: Record<string, number> | null;
  ky: KyDS;
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<LocDonMua>[];
  loc: LocDonMua;
  onLoc: (l: LocDonMua) => void;
}) {
  const dem = (v: string) => demTheoTab?.[v === "all" ? "tat_ca" : v];
  const datTab = (v: string) => {
    setStatusFilter(v);
    setPage(1);
  };
  // "Trạng thái" trong nút Lọc = dải tab trên (đọc/ghi thẳng tab đang chọn, không state thứ hai).
  const dkDu: DieuKien<LocDonMua>[] = [
    dkTheoTab<LocDonMua>({
      tabs: STATUS_TABS.map((t) => ({ id: t.value, nhan: t.label, so: dem(t.value) })),
      tatCa: "all",
      dang: statusFilter,
      dat: datTab,
    }),
    ...dieuKien,
  ];

  return (
    <section className="acct-dmh__toolbar-card">
      {/* Hàng 1: Dải tab trạng thái có số */}
      <div className="acct-toolbar__top-row">
        <div className="acct-toolbar__tabs" role="tablist" aria-label="Lọc trạng thái đơn">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.value;
            const so = dem(tab.value);
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`acct-toolbar__tab${isActive ? " is-active" : ""}`}
                onClick={() => datTab(tab.value)}
              >
                <span>{tab.label}</span>
                {so != null && <span className="acct-toolbar__tab-count">{so.toLocaleString("vi-VN")}</span>}
              </button>
            );
          })}
          {/* Trạng thái khác (Từ chối, Giao một phần, Đã hủy) khi đang chọn chúng */}
          {!STATUS_TABS.some((t) => t.value === statusFilter) && statusFilter !== "all" && (
            <span className="acct-toolbar__tab is-active">
              {STATUS_META[statusFilter as keyof typeof STATUS_META]?.label || statusFilter}
            </span>
          )}
        </div>
      </div>

      {/* Hàng 2: Ô tìm + thanh lọc chung (kỳ + điều kiện) */}
      <div className="acct-toolbar__main-row tl-thanh">
        <form
          className="acct-toolbar__search-wrap"
          role="search"
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
            aria-label="Tìm đơn mua hàng"
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

        <ThanhLoc ky={ky} moc={MOC_DON_MUA} onKy={onKy} dieuKien={dkDu} loc={loc} onLoc={onLoc} />
      </div>
    </section>
  );
}
