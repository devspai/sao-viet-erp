// Đầu màn Yêu cầu mua hàng: tiêu đề + nút tạo, rồi thẻ lọc CHUNG với Mua hàng › Yêu cầu chờ xử lý
// (phương án 3, 07/10/2026): ô tìm + `ThanhLoc` + nút "Xem theo", hàng chip trạng thái có số. Chip là
// trạng thái yêu cầu hay tình trạng món tuỳ chế độ xem — cha truyền vào.
import type { ReactNode } from "react";
import { Button } from "../../../../components/Button";
import type { KyDS } from "../../../thanh-loc/ky-danh-sach";
import type { DieuKien } from "../../../thanh-loc/thanh-loc";
import { ThanhCongCuMuaHang, type TabDem } from "../../loc-mua-hang/ThanhCongCuMuaHang";
import { MOC_YEU_CAU, type LocYeuCau } from "../../loc-mua-hang/dieu-kien-yeu-cau";

export function RequestsToolbar({
  tabs,
  tab,
  onTab,
  ariaTabs,
  q,
  onQ,
  canCreate,
  openCreate,
  ky,
  onKy,
  dieuKien,
  loc,
  onLoc,
  ben,
  chonCot,
  banner,
}: {
  tabs: TabDem[];
  tab: string;
  onTab: (v: string) => void;
  ariaTabs: string;
  q: string;
  onQ: (v: string) => void;
  canCreate: boolean;
  openCreate: () => void;
  ky: KyDS;
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<LocYeuCau>[];
  loc: LocYeuCau;
  onLoc: (l: LocYeuCau) => void;
  ben?: ReactNode;
  /** Nút "Cột" của lưới (`ChonCotBang`). */
  chonCot?: ReactNode;
  /** Lời báo lỗi: nằm giữa đầu màn và thẻ lọc — chen giữa thẻ lọc và lưới là gãy tấm. */
  banner?: ReactNode;
}) {
  return (
    <>
      <header className="lds-dau">
        <h1 className="lds-dau__ten">Yêu cầu mua hàng</h1>
        {canCreate && (
          <div className="lds-dau__nut">
            <Button variant="accent" onClick={openCreate}>
              + Tạo yêu cầu mua
            </Button>
          </div>
        )}
      </header>
      {banner}
      <ThanhCongCuMuaHang
        tabs={tabs}
        tab={tab}
        onTab={onTab}
        ariaTabs={ariaTabs}
        q={q}
        onQ={onQ}
        placeholder="Tìm mã yêu cầu, nội dung, vật tư…"
        ky={ky}
        moc={MOC_YEU_CAU}
        onKy={onKy}
        dieuKien={dieuKien}
        loc={loc}
        onLoc={onLoc}
        ben={ben}
        chonCot={chonCot}
      />
    </>
  );
}
