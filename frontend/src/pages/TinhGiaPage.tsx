// Tính giá — CONTROLLER master↔detail. Không có react-router: điều hướng bằng state nội bộ.
// mode "list" → danh sách phiếu (PhieuTinhGiaListView); mode "detail" → 1 phiếu (PhieuTinhGiaDetailView,
// chính là form giá vốn bản redesign đã duyệt, nay gắn với phiếu đã lưu).
import { useState } from "react";
import { useCan } from "../auth/permissions";
import { PhieuTinhGiaListView } from "./PhieuTinhGiaListView";
import { PhieuTinhGiaDetailView } from "./PhieuTinhGiaDetailView";
import "./tinh-gia.css";

// id = null ⇒ phiếu NHÁP chưa ghi DB (bấm "Lập phiếu" chỉ mở form, chưa gọi API). Phiếu chỉ
// được tạo thật khi có ≥1 sản phẩm và bấm Tính giá — bỏ ngang thì không để lại phiếu rỗng.
type View = { mode: "list" } | { mode: "detail"; id: number | null };

export function TinhGiaPage({ navigate, openPhieuId, taoMoi, eventTick = 0 }: {
  // BG-3: điều hướng sang Báo giá (nút "Báo giá →" trên phiếu). Không truyền → ẩn nút.
  navigate?: (pageId: string, params?: { openQuoteId?: number }) => void;
  // P3 (redesign-bao-gia §6): mở thẳng 1 phiếu tính giá (link "↳ PTG" từ Báo giá).
  openPhieuId?: number;
  // Nút "Lập phiếu tính giá" ở hồ sơ khách: vào thẳng form phiếu mới, khỏi qua danh sách.
  taoMoi?: boolean;
  // Tick nhóm SSE `danh_muc`: nhích khi danh mục nguồn đổi ⇒ phiếu đang mở nạp lại danh mục.
  eventTick?: number;
} = {}) {
  // Cột "Báo giá" của danh sách chỉ bấm được khi người xem đọc được màn Báo giá.
  const xemBaoGia = useCan()("bao_gia", "read");
  const [view, setView] = useState<View>(
    openPhieuId ? { mode: "detail", id: openPhieuId } : taoMoi ? { mode: "detail", id: null } : { mode: "list" },
  );

  if (view.mode === "detail") {
    return (
      <PhieuTinhGiaDetailView
        // key theo id: nhân bản xong mở phiếu MỚI trong cùng màn — dựng lại từ đầu, không dính state cũ.
        key={view.id ?? "moi"}
        id={view.id}
        onBack={() => setView({ mode: "list" })}
        onMoPhieu={(id) => setView({ mode: "detail", id })}
        navigate={navigate}
        eventTick={eventTick}
      />
    );
  }
  return (
    <PhieuTinhGiaListView
      onOpen={(id) => setView({ mode: "detail", id })}
      onNew={() => setView({ mode: "detail", id: null })}
      onMoBaoGia={navigate && xemBaoGia ? (id) => navigate("bao-gia", { openQuoteId: id }) : undefined}
    />
  );
}
