// Thanh LỌC của màn Phiếu thu — dùng khuôn chuẩn ToolbarChuan (cùng Đơn mua hàng).
import type { Dispatch, SetStateAction } from "react";
import { Button } from "../../../../components/Button";
import { ToolbarChuan } from "../../components/ToolbarChuan";
import { STATUS_META } from "../shared/constants";

const TABS = [
  { value: "all", label: "Tất cả" },
  ...Object.entries(STATUS_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

export function ReceiptsToolbar({
  q,
  setQ,
  setPage,
  load,
  statusFilter,
  setStatusFilter,
  canApprove,
  setCreatingOther,
}: {
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  load: () => void;
  statusFilter: string;
  setStatusFilter: Dispatch<SetStateAction<string>>;
  canApprove: boolean;
  setCreatingOther: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <ToolbarChuan
      tabs={TABS}
      tab={statusFilter}
      onTab={(value) => {
        setStatusFilter(value);
        setPage(1);
      }}
      ariaTabs="Lọc theo trạng thái phiếu thu"
      q={q}
      onQ={setQ}
      placeholder="Tìm PT, hóa đơn, đơn bán, PC, người nộp..."
      onSearchSubmit={() => {
        setPage(1);
        load();
      }}
      hasFilter={q.trim() !== "" || statusFilter !== "all"}
      onReset={() => {
        setQ("");
        setStatusFilter("all");
        setPage(1);
      }}
      actions={
        canApprove ? (
          <Button variant="accent" onClick={() => setCreatingOther(true)}>
            + Tạo phiếu thu
          </Button>
        ) : undefined
      }
    />
  );
}
