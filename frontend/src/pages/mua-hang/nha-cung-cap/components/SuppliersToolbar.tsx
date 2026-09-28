// Đầu màn Nhà cung cấp: thanh tiêu đề + tìm + lọc trạng thái + nút thêm, và dải KPI một hàng
import type { Dispatch, SetStateAction } from "react";
import { Button } from "../../../../components/Button";
import { Icon } from "../../../../components/Icons";
import type { LocSaoNcc } from "../shared/types";

export function SuppliersToolbar({
  q,
  setQ,
  status,
  setStatus,
  locSao,
  setLocSao,
  setPage,
  load,
  canCreate,
  openCreate,
  stats,
}: {
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  status: "all" | "active" | "inactive";
  setStatus: Dispatch<SetStateAction<"all" | "active" | "inactive">>;
  locSao: LocSaoNcc;
  setLocSao: Dispatch<SetStateAction<LocSaoNcc>>;
  setPage: Dispatch<SetStateAction<number>>;
  load: () => void;
  canCreate: boolean;
  openCreate: () => void;
  stats: { totalCount: number; activeCount: number; inactiveCount: number };
}) {
  return (
    <>
      {/* Đầu màn gọn 1 HÀNG tiêu đề + badge đếm trái, ô tìm + lọc giữa, nút "+ Thêm NCC" phải */}
      <div className="purchase__topbar-unified">
        <div className="purchase__topbar-left">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 className="purchase__topbar-title">Nhà cung cấp</h1>
            <span className="supplier__title-count">{stats.totalCount} NCC</span>
          </div>
        </div>
        <div className="purchase__topbar-controls">
          <form
            className="purchase__search-wrap"
            style={{ position: "relative" }}
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              load();
            }}
          >
            <span className="purchase__search-icon">
              <Icon name="search" size={16} />
            </span>
            <input
              className="input purchase__search-input"
              placeholder="Tìm Tên NCC, MST, SĐT, liên hệ, mặt hàng..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              style={{ paddingRight: q ? "30px" : undefined }}
            />
            {q && (
              <button
                type="button"
                className="purchase__search-clear"
                onClick={() => {
                  setQ("");
                  setPage(1);
                }}
                title="Xóa tìm kiếm"
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </form>
          {/* Icon đứng NGOÀI <select>: thẻ <option> không nhạn được SVG, nên trước đây phải mượn
              emoji 🌐/🟢/⚪ — máy thiếu font emoji thì ra ô vuông tofu. */}
          <span className="purchase__select-ico-wrap">
            <span className="purchase__select-ico" aria-hidden="true">
              <Icon name="globe" size={14} />
            </span>
            <select
              className="input purchase__select-modern purchase__select-modern--ico"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as "all" | "active" | "inactive");
                setPage(1);
              }}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hợp tác</option>
              <option value="inactive">Tạm ngừng hợp tác</option>
            </select>
          </span>
          <span className="purchase__select-ico-wrap">
            <span className="purchase__select-ico purchase__select-ico--sao" aria-hidden="true">
              <Icon name="star" size={14} />
            </span>
            <select
              className="input purchase__select-modern purchase__select-modern--ico"
              value={locSao === null ? "all" : String(locSao)}
              onChange={(e) => {
                setLocSao(e.target.value === "all" ? null : Number(e.target.value));
                setPage(1);
              }}
              title="Lọc theo sao đánh giá"
            >
              <option value="all">Tất cả sao</option>
              <option value="4">Từ 4 sao trở lên</option>
              <option value="3">Từ 3 sao trở lên</option>
            </select>
          </span>
        </div>
        {canCreate && (
          <div className="purchase__topbar-actions">
            <Button variant="accent" onClick={openCreate}>
              + Thêm NCC
            </Button>
          </div>
        )}
      </div>

      {/* DẢI CHỈ SỐ KPI TƯƠNG TÁC 1-CLICK — Bấm vào thẻ KPI để lọc nhanh danh sách */}
      <div className="supplier__kpi" aria-label="Tóm tắt nhà cung cấp">
        <div
          className={`supplier__kpi-item ${status === "all" ? "is-active" : ""}`}
          onClick={() => {
            setStatus("all");
            setPage(1);
          }}
          title="Xem tất cả nhà cung cấp"
        >
          <span className="supplier__kpi-icon supplier__kpi-icon--steel">
            <Icon name="truck" size={15} />
          </span>
          <span className="supplier__kpi-body">
            <b className="supplier__kpi-val">{stats.totalCount}</b>
            <span className="supplier__kpi-lbl">Nhà cung cấp</span>
          </span>
        </div>

        <span className="supplier__kpi-sep" aria-hidden="true" />

        <div
          className={`supplier__kpi-item ${status === "active" ? "is-active" : ""}`}
          onClick={() => {
            setStatus("active");
            setPage(1);
          }}
          title="Click để lọc nhanh NCC đang hợp tác"
        >
          <span className="supplier__kpi-icon supplier__kpi-icon--ok">
            <Icon name="check" size={15} />
          </span>
          <span className="supplier__kpi-body">
            <b className="supplier__kpi-val">{stats.activeCount}</b>
            <span className="supplier__kpi-lbl">Đang hợp tác</span>
          </span>
        </div>

        <span className="supplier__kpi-sep" aria-hidden="true" />

        <div
          className={`supplier__kpi-item ${status === "inactive" ? "is-active" : ""}`}
          onClick={() => {
            setStatus("inactive");
            setPage(1);
          }}
          title="Click để lọc nhanh NCC tạm ngừng"
        >
          <span className="supplier__kpi-icon supplier__kpi-icon--warn">
            <Icon name="ban" size={15} />
          </span>
          <span className="supplier__kpi-body">
            <b className="supplier__kpi-val">{stats.inactiveCount}</b>
            <span className="supplier__kpi-lbl">Tạm ngừng</span>
          </span>
        </div>
      </div>
    </>
  );
}
