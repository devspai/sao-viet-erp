/** Mảnh dùng chung của sổ phiếu và công nợ (Phiếu chi, Phiếu thu, hai màn công nợ — đặc tả A.10, A.12,
 *  A.16): đi dòng bằng bàn phím, ba trạng thái rỗng (Tài khoản ngân hàng còn dùng), dòng gợi ý phím
 *  dưới bảng. Lưới danh sách tự vẽ bằng khuôn `lds-*` (components/LuoiDs).
 */
import type { KeyboardEvent, ReactNode } from "react";

/** ↑ ↓ chuyển dòng (hoặc thẻ điện thoại) kế bên, Enter mở. */
export function diChuyen(e: KeyboardEvent<HTMLElement>, onMo: () => void) {
  if (e.key === "Enter") {
    e.preventDefault();
    onMo();
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const ke = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling);
  if (ke instanceof HTMLElement) {
    e.preventDefault();
    ke.focus();
  }
}

/** Bảng không có dòng nào: đang tải / tải lỗi (không nói "chưa có") / lọc không ra (kèm "Bỏ lọc") /
 *  chưa có gì (kèm nút lập — nút PHỤ, rust chỉ một chỗ đầu trang). */
export function BangRong({
  loading,
  loi,
  coLoc,
  onTaiLai,
  onBoLoc,
  onLap,
  chuTai,
  chuLoi,
  chuChuaCo,
  nutLap,
  chuKhongKhop = "Không có phiếu nào khớp bộ lọc",
}: {
  loading: boolean;
  loi: string | null;
  coLoc: boolean;
  onTaiLai: () => void;
  onBoLoc: () => void;
  /** Không có = không có quyền lập ⇒ không mời lập. */
  onLap?: () => void;
  chuTai: string;
  chuLoi: string;
  chuChuaCo: ReactNode;
  nutLap?: string;
  /** Câu khi lọc không ra — màn công nợ ghi "Không có nhà cung cấp nào khớp bộ lọc". */
  chuKhongKhop?: string;
}) {
  return (
    <div className="kt-bang">
      <div className="kt-rong-trong" role={loi ? "alert" : undefined}>
        {loading ? (
          <span>{chuTai}</span>
        ) : loi ? (
          <>
            <b>{chuLoi}</b>
            <span>{loi}</span>
            <button type="button" className="kt-btn kt-btn--nho" onClick={onTaiLai}>Tải lại</button>
          </>
        ) : coLoc ? (
          <>
            <b>{chuKhongKhop}</b>
            <button type="button" className="kt-btn kt-btn--nho" onClick={onBoLoc}>Bỏ lọc</button>
          </>
        ) : (
          <>
            {chuChuaCo}
            {onLap && (
              <button type="button" className="kt-btn kt-btn--nho" onClick={onLap}>{nutLap}</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Dòng gợi ý phím dưới bảng (ẩn trên điện thoại). */
export function GoiYPhim() {
  return (
    <p className="kt-phim kt-an-dt">
      <span><kbd>↑</kbd> <kbd>↓</kbd> chọn dòng</span>
      <span><kbd>Enter</kbd> mở phiếu</span>
      <span>Ngăn đang mở thì <kbd>↑</kbd> <kbd>↓</kbd> đổi phiếu</span>
      <span><kbd>Esc</kbd> đóng ngăn</span>
    </p>
  );
}
