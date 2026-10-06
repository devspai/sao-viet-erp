// Đầu màn Nhà cung cấp: thanh tiêu đề + tìm + thanh lọc chung (kỳ + điều kiện) + nút thêm.
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Button } from "../../../../components/Button";
import { Icon } from "../../../../components/Icons";

export function SuppliersToolbar({
  q,
  setQ,
  boLoc,
  setPage,
  load,
  canCreate,
  openCreate,
  stats,
}: {
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  /** Thanh lọc chung (`ThanhLoc`) — đặt ngay sau ô tìm. Trạng thái, nhóm, sao, nhận gia công nay là
   *  điều kiện trong đó (06/10/2026), thay hai ô chọn rời trước đây. */
  boLoc: ReactNode;
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
        <div className="purchase__topbar-controls tl-thanh">
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
          {boLoc}
        </div>
        {canCreate && (
          <div className="purchase__topbar-actions">
            <Button variant="accent" onClick={openCreate}>
              + Thêm NCC
            </Button>
          </div>
        )}
      </div>

    </>
  );
}
