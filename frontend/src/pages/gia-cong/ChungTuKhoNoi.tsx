// Đề nghị xuất giấy / phiếu xuất kho mở từ khối Gia công ngoài — CÙNG ngăn của màn Kho, chỉ đọc
// (thao tác trên chứng từ làm ở màn Kho). Khối nằm trong ngăn lệnh / bài ghép nên phải lo hai việc
// như `PhieuKhoNoi` của màn Thực hiện SX:
//  - Ngăn cha có `transform` thì `position: fixed` bên trong bị nhốt theo khung ⇒ đẩy ra `body`.
//  - Esc ở trang đóng cả ngăn cha ⇒ dời focus vào lớp này, tự bắt Esc rồi `preventDefault`.
// Từ đề nghị bấm sang phiếu đã lập thì đổi ngay trong lớp; đóng phiếu là đóng hẳn.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InboxRequestDrawer, VoucherDrawer } from "../KhoYeuCauPage";

export type ChungTuKho = { loai: "de_nghi" | "phieu"; id: number };

export function ChungTuKhoNoi({ mo, token, onClose }: { mo: ChungTuKho; token: string; onClose: () => void }) {
  const lopRef = useRef<HTMLDivElement>(null);
  const [dang, setDang] = useState(mo);
  useEffect(() => setDang(mo), [mo]);
  useEffect(() => {
    const truoc = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lopRef.current?.focus({ preventScroll: true });
    return () => { if (truoc?.isConnected) truoc.focus({ preventScroll: true }); };
  }, []);
  // `canViewCost` để true như màn Đề nghị của Kho: máy chủ tự ẩn giá với người không được xem.
  return createPortal(
    <div ref={lopRef} className="gcn-chung-tu-lop" tabIndex={-1}
      onKeyDown={(e) => { if (e.key !== "Escape" || e.defaultPrevented) return; e.preventDefault(); onClose(); }}>
      {dang.loai === "phieu" ? (
        <VoucherDrawer token={token} voucherId={dang.id} canCreate={false} canPost={false}
          canViewCost onClose={onClose} onChanged={() => {}} />
      ) : (
        <InboxRequestDrawer token={token} khoId={null} requestId={dang.id} canCreate={false}
          canViewStock={false} canViewCost onClose={onClose} onCreateVoucher={() => {}}
          onOpenVoucher={(id) => setDang({ loai: "phieu", id })} />
      )}
    </div>,
    document.body,
  );
}
