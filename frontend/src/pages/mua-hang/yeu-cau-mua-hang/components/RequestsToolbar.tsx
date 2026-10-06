// Thanh trên cùng của màn Yêu cầu mua hàng: tiêu đề + ô tìm + thanh lọc chung (kỳ + điều kiện) + nút
// tạo, rồi hàng tab trạng thái có số (tách từ pages/DepartmentPurchaseRequestsPage.tsx).
// 06/10/2026: ô chọn trạng thái rời → tab có số do máy chủ đếm; thêm `ThanhLoc` (kỳ theo Ngày tạo /
// Ngày cần hàng; điều kiện Phòng ban, Người yêu cầu, Mặt hàng).
import type { Dispatch, SetStateAction } from "react";
import { Button } from "../../../../components/Button";
import { Icon } from "../../../../components/Icons";
import { StatusTabs } from "../../../../components/StatusTabs";
import { ThanhLoc } from "../../../thanh-loc/ThanhLoc";
import type { KyDS } from "../../../thanh-loc/ky-danh-sach";
import { dkTheoTab, type DieuKien } from "../../../thanh-loc/thanh-loc";
import { tabCoSo } from "../../loc-mua-hang/ThanhCongCuMuaHang";
import { MOC_YEU_CAU, TAB_CHINH_YEU_CAU, type LocYeuCau } from "../../loc-mua-hang/dieu-kien-yeu-cau";
import { SOURCE_STATUS_META } from "../shared/constants";
import type { StatusFilter } from "../shared/types";

export function RequestsToolbar({
  loading,
  total,
  q,
  setQ,
  status,
  setStatus,
  demTheoTab,
  setPage,
  load,
  canCreate,
  openCreate,
  ky,
  onKy,
  dieuKien,
  loc,
  onLoc,
}: {
  loading: boolean;
  total: number;
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  status: StatusFilter;
  setStatus: Dispatch<SetStateAction<StatusFilter>>;
  demTheoTab: Record<string, number> | null;
  setPage: Dispatch<SetStateAction<number>>;
  load: () => void;
  canCreate: boolean;
  openCreate: () => void;
  ky: KyDS;
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<LocYeuCau>[];
  loc: LocYeuCau;
  onLoc: (l: LocYeuCau) => void;
}) {
  const tabs = tabCoSo(TAB_CHINH_YEU_CAU, SOURCE_STATUS_META, demTheoTab, status);
  const datTab = (v: string) => {
    setStatus(v as StatusFilter);
    setPage(1);
  };
  // "Trạng thái" trong nút Lọc = hàng tab trạng thái bên dưới (đọc/ghi thẳng tab đang chọn).
  const dkDu: DieuKien<LocYeuCau>[] = [
    dkTheoTab<LocYeuCau>({
      tabs: tabs.map((t) => ({ id: t.value, nhan: t.label, so: t.count })),
      tatCa: "all",
      dang: status,
      dat: datTab,
    }),
    ...dieuKien,
  ];
  return (
    <>
      <div className="purchase__topbar-unified">
        <div className="purchase__topbar-left">
          <h1 className="purchase__topbar-title">Yêu cầu mua hàng</h1>
          <span className="purchase__count-badge">{loading ? "..." : total}</span>
        </div>
        <div className="purchase__topbar-controls tl-thanh">
          <form
            className="purchase__search-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <span className="purchase__search-icon">
              <Icon name="search" size={16} />
            </span>
            <input
              className="input purchase__search-input"
              placeholder="Tìm mã yêu cầu, mục đích, vật tư..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </form>
          <ThanhLoc ky={ky} moc={MOC_YEU_CAU} onKy={onKy} dieuKien={dkDu} loc={loc} onLoc={onLoc} />
        </div>
        <div className="purchase__topbar-actions">
          {canCreate && (
            <Button variant="accent" onClick={openCreate}>
              + Tạo yêu cầu mua
            </Button>
          )}
        </div>
      </div>
      <div className="purchase__tab-trang-thai">
        <StatusTabs
          active={status}
          onChange={datTab}
          tabs={tabs.map((t) => ({
            key: t.value,
            label: t.label,
            count: t.count,
          }))}
        />
      </div>
    </>
  );
}
