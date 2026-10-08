// Khung "Kho" — gộp Yêu cầu + Hộp yêu cầu vào MỘT module, chia tab.
//
// Tab VIỆC: Yêu cầu · Phiếu từ yêu cầu (tab sau chỉ hiện cho vai trong kho). Đầu trang `lds-dau` chung.
// Nhập và Xuất chung MỘT bảng (07/10/2026): bỏ cụm nút chiều Nhập/Xuất, chiều thành điều kiện "Loại"
// trong nút Lọc (`loc-kho/dieu-kien-yeu-cau-kho.ts`). Tab Điều chuyển vẫn ẩn (`AN_DIEU_CHUYEN`).
import { useCallback, useEffect, useState } from "react";
import { laNguoiKho } from "./khoShared";
import { useCan } from "../auth/permissions";
import { KhoDeNghiPage, type KhoNhapSeed } from "./KhoDeNghiPage";
import { KhoYeuCauPage } from "./KhoYeuCauPage";
import "./rebuild-catalog.css";
import "./kho-request.css";

type FnTab = "denghi" | "yeucau";

export function KhoPage({
  eventTick = 0,
  nhapSeed,
  counts,
  onSeen,
  openRequest,
}: {
  eventTick?: number;
  /** Điều hướng từ "Nhập kho" (đợt giao đơn mua) → ép về tab Yêu cầu, mở sẵn form NHẬP đã điền. */
  nhapSeed?: KhoNhapSeed | null;
  /** Số yêu cầu ĐÃ DUYỆT chờ kho xử lý theo chiều (màn này không hiện) + phản hồi kho chưa xem
   *  của người tạo (done_unseen=Hoàn tất, fail_unseen=Không thành). */
  counts?: { nhap: number; xuat: number; dieu_chuyen: number; done_unseen: number; fail_unseen: number };
  /** Người tạo mở xem 1 yêu cầu → refetch badge/số đỏ (AppShell reloadBadges). */
  onSeen?: () => void;
  /** Bấm 1 thông báo kho → mở đúng yêu cầu: `view` chọn tab, `id` = request_id. */
  openRequest?: { id: number; view: FnTab };
}) {
  const can = useCan();
  // Tab "Yêu cầu" (xem + tạo yêu cầu) CHỈ cho vai có `can_request` ("Tạo yêu cầu nhập/xuất") → THỦ
  // KHO (chỉ có view_stock/create) KHÔNG thấy tab này, chỉ thấy "Phiếu từ yêu cầu".
  const canDeNghi = can("kho", "request");
  // Tab "Phiếu từ yêu cầu" = hộp việc của BÊN KHO. Điều kiện nay chỉ đọc hai ô của CHÍNH màn này
  // (xem `laNguoiKho`): trước 24/09/2026 nó OR với `kho:view_stock`, mà ô đó đã sang module
  // `ton_kho` — để nguyên là hộp việc của màn Kho đi mượn quyền của màn Tồn kho.
  const canYeuCau = laNguoiKho(can);
  const [fn, setFn] = useState<FnTab>(canDeNghi ? "denghi" : "yeucau");
  // Seed đang chờ đổ vào form (từ "Nhập kho" ở đơn mua). Effect ép tab Yêu cầu; KhoDeNghiPage
  // tiêu thụ rồi gọi onSeedConsumed để xoá — tránh mở lại form khi bấm sang tab khác.
  const [pendingSeed, setPendingSeed] = useState<KhoNhapSeed | null>(null);
  useEffect(() => {
    if (nhapSeed?.seed?.length) {
      setFn("denghi");
      setPendingSeed(nhapSeed);
    }
  }, [nhapSeed]);
  const consumeSeed = useCallback(() => setPendingSeed(null), []);
  // Yêu cầu cần MỞ SẴN (bấm từ thông báo): ép đúng tab rồi truyền id xuống màn con để bung drawer.
  const [openReqId, setOpenReqId] = useState<number | null>(null);
  useEffect(() => {
    if (openRequest?.id != null) {
      setFn(openRequest.view);
      setOpenReqId(openRequest.id);
    }
  }, [openRequest]);
  const consumeOpenReq = useCallback(() => setOpenReqId(null), []);
  // Chỗ nút chính trong đầu trang (state chứ không ref: tab Yêu cầu phải vẽ lại khi chỗ này có mặt).
  const [slotNut, setSlotNut] = useState<HTMLElement | null>(null);
  // Phản hồi kho chưa xem của NGƯỜI TẠO (Hoàn tất + Không thành) — badge tab "Yêu cầu".
  const phanHoiUnseen = (counts?.done_unseen ?? 0) + (counts?.fail_unseen ?? 0);
  const activeFn: FnTab =
    fn === "denghi" && !canDeNghi
      ? "yeucau"
      : fn === "yeucau" && !canYeuCau
        ? "denghi"
        : fn;

  return (
    <main className="rc lds">
      {/* Đầu trang chung cho cả hai tab. Nút chính ("Tạo yêu cầu") thuộc tab Yêu cầu — màn đó vẽ vào
          `lds-dau__nut` bằng portal (nó giữ state ngăn); sang tab Phiếu từ yêu cầu thì chỗ này trống. */}
      <header className="lds-dau">
        <h1 className="lds-dau__ten">Yêu cầu nhập xuất</h1>
        <div className="lds-dau__nut" ref={setSlotNut} />
      </header>
      {/* `.kho-shell` GIỮ nguyên là anh em của nội dung tab: luật responsive của tab Phiếu từ yêu cầu
          neo vào `.kho-shell ~ …`. Khung/viền của nó được gỡ trong `.lds > .kho-shell` (kho-request.css). */}
      <div className="kho-shell">
        <div className="kho-shell__fns">
          {canDeNghi && (
            <button
              type="button"
              className={`kho-shell__fn${activeFn === "denghi" ? " is-active" : ""}`}
              onClick={() => setFn("denghi")}
            >
              <FileTextIcon />
              <span>Yêu cầu</span>
              {/* Đúng chấm đỏ của thanh bên (`sidebar__badge`: quầng + vòng lan), không số. Mở tab này
                  là đã xem hết nên chấm tắt ngay. */}
              {phanHoiUnseen > 0 && (
                <span className="sidebar__badge kho-shell__cham" aria-label="Có phản hồi kho chưa xem" title="Có phản hồi kho chưa xem" />
              )}
            </button>
          )}
          {canYeuCau && (
            <button
              type="button"
              className={`kho-shell__fn${activeFn === "yeucau" ? " is-active" : ""}`}
              onClick={() => setFn("yeucau")}
            >
              <InboxIcon />
              <span>Phiếu từ yêu cầu</span>
            </button>
          )}
        </div>
      </div>

      {activeFn === "denghi" ? (
        <KhoDeNghiPage
          eventTick={eventTick}
          initialSeed={pendingSeed}
          onSeedConsumed={consumeSeed}
          unseenDone={counts?.done_unseen ?? 0}
          unseenFail={counts?.fail_unseen ?? 0}
          onSeen={onSeen}
          openRequestId={openReqId}
          onOpenRequestConsumed={consumeOpenReq}
          slotNut={slotNut}
        />
      ) : (
        <KhoYeuCauPage
          eventTick={eventTick}
          openRequestId={openReqId}
          onOpenRequestConsumed={consumeOpenReq}
        />
      )}
    </main>
  );
}

function FileTextIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
