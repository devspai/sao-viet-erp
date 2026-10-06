/** Mảnh dùng chung của BẢNG sổ phiếu (Phiếu chi, Phiếu thu — đặc tả A.10, A.12, A.16): đi dòng
 *  bằng bàn phím, lớp dòng, thẻ điện thoại, ba trạng thái rỗng, dấu "Thiếu chứng từ", dòng gợi ý
 *  phím dưới bảng.
 */
import { Paperclip } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { Cum, TheNho } from "./Cum";
import { ngay, tien } from "./dinhDang";

/** Lớp của một dòng bảng: dòng đang mở ngăn viền đủ cạnh, dòng đã hủy mờ. */
export function lopDong(id: number, dangXem: number | null, daHuy: boolean): string {
  return ["kt-dong", id === dangXem ? "kt-dang-xem" : "", daHuy ? "kt-da-huy" : ""].filter(Boolean).join(" ");
}

/** Một thẻ điện thoại: hàng trên tên + số tiền; hàng dưới ngày + thẻ nguồn + "Thiếu chứng từ" + trạng thái. */
export type TheDt = {
  id: number;
  ten: string;
  ma: string;
  soVnd: number;
  ngay: string;
  loai: string;
  thieuChungTu: boolean;
  trangThai: ReactNode;
};

/** Dưới 640px mỗi dòng bảng thành một thẻ hai hàng (đặc tả A.13). */
export function TheDienThoai({ the, onMo }: { the: TheDt[]; onMo: (id: number) => void }) {
  return (
    <div className="kt-the-dt">
      {the.map((t) => (
        <div key={t.id} role="button" tabIndex={0} aria-label={`${t.ten} ${t.ma}`}
          onClick={() => onMo(t.id)} onKeyDown={(e) => diChuyen(e, () => onMo(t.id))}>
          <div className="kt-the-dt__h">
            <span className="kt-ten">{t.ten || "—"}</span>
            <span className="kt-tien">{tien(t.soVnd)}</span>
          </div>
          <div className="kt-the-dt__h">
            <Cum className="kt-mo">
              <span>{ngay(t.ngay).slice(0, 5)}</span>
              <TheNho>{t.loai}</TheNho>
              {t.thieuChungTu && <ThieuChungTu />}
            </Cum>
            {t.trangThai}
          </div>
        </div>
      ))}
    </div>
  );
}

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

/** Dấu amber "Thiếu chứng từ" có kẹp giấy (chỉ phiếu đã xong mới cần chứng từ). */
export function ThieuChungTu() {
  return (
    <span className="kt-thieu">
      <Paperclip size={14} aria-hidden="true" />
      Thiếu chứng từ
    </span>
  );
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
