// Thanh LỌC của màn Phiếu chi — dùng khuôn chung `ToolbarChuan` (cùng màn Đơn mua hàng):
// tab trạng thái + ô tìm có icon + ô chọn hình thức + "Xóa bộ lọc" + nút "+ Tạo phiếu chi".
// Máy chủ chưa có bộ lọc ngày cho phiếu chi nên KHÔNG dựng nút "Khoảng ngày".
import type { Dispatch, SetStateAction } from "react";
import { Button } from "../../../../components/Button";
import { ToolbarChuan, type ToolbarTab } from "../../components/ToolbarChuan";
import { STATUS_META } from "../shared/list-constants";

const STATUS_TABS: ToolbarTab[] = [
  { value: "all", label: "Tất cả" },
  ...Object.entries(STATUS_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

export function VouchersToolbar({
  q,
  setQ,
  setPage,
  load,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  canApprove,
  setStandaloneOpen,
}: {
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  load: () => void;
  typeFilter: string;
  setTypeFilter: Dispatch<SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  canApprove: boolean;
  setStandaloneOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const hasFilter =
    q.trim() !== "" || statusFilter !== "all" || typeFilter !== "all";

  return (
    <ToolbarChuan
      tabs={STATUS_TABS}
      tab={statusFilter}
      onTab={(value) => {
        setStatusFilter(value);
        setPage(1);
      }}
      ariaTabs="Lọc trạng thái phiếu chi"
      q={q}
      onQ={setQ}
      placeholder="Tìm PC, UNC, PMH, YCMH..."
      onSearchSubmit={() => {
        setPage(1);
        load();
      }}
      selects={
        <select
          className="input acct-toolbar__select"
          aria-label="Lọc hình thức chi"
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">Tất cả hình thức</option>
          <option value="cash">Tiền mặt</option>
          <option value="bank_transfer">Chuyển khoản</option>
        </select>
      }
      hasFilter={hasFilter}
      onReset={() => {
        setQ("");
        setStatusFilter("all");
        setTypeFilter("all");
        setPage(1);
      }}
      actions={
        canApprove ? (
          <Button variant="accent" onClick={() => setStandaloneOpen(true)}>
            + Tạo phiếu chi
          </Button>
        ) : undefined
      }
    />
  );
}
