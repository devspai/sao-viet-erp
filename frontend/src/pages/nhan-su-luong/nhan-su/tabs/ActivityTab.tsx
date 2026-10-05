// Tab Nhật ký của hồ sơ nhân sự (tách từ pages/NhanSuPage.tsx).
import { api } from "../../../../api/client";
import { EmptyState } from "../../../../components/EmptyState";
import { Timeline, type TimelineEntry } from "../../../../components/Timeline";
import { fmtDateTime } from "../../../../utils/format";
import { useNapGiuQuaTab, type BoNhoTab } from "../shared/useNapGiuQuaTab";

export function ActivityTab({
  token,
  employeeId,
  lanNap,
  boNho,
}: {
  token: string;
  employeeId: number;
  /** Bộ nhớ của khay — quay lại tab thì hiện ngay, không tải lại (xem `useNapGiuQuaTab`). */
  boNho: BoNhoTab;
  /** Đổi mỗi lần khay hồ sơ nạp lại sau thao tác — tải lại nhật ký để dòng mới hiện ngay. */
  lanNap: number;
}) {
  const { data: items, loi, napLai: load } = useNapGiuQuaTab<
    { action: string; detail: string; actor_name: string | null; created_at: string }[]
  >(boNho, "activity", () => api.employees.activity(token, employeeId).then((r) => r.items), lanNap);
  if (loi) return <EmptyState trangThai="loi" loi={loi} onThuLai={load} />;
  if (!items) return <EmptyState trangThai="dang-tai" />;
  const tl: TimelineEntry[] = items.map((a) => ({
    title: a.detail || a.action,
    meta: `${fmtDateTime(a.created_at)}${a.actor_name ? ` · ${a.actor_name}` : ""}`,
  }));
  return <Timeline items={tl} emptyText="Chưa có hoạt động." />;
}
