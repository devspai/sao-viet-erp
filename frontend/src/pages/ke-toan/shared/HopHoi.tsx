/** Hộp hỏi giữa màn — hỏi MỘT lần trước thao tác đổi trạng thái (đặc tả TK-4, Primer "Destructive").
 *
 *  - Lớp phủ + hộp `.kt-hoi`: vòng icon + câu hỏi (tên hộp), các câu hệ quả, chân "Đóng" + nút chính.
 *  - Esc / bấm lớp phủ / "Đóng" = đóng hộp, không làm gì. Esc và ↑ ↓ bị hộp giữ lại (bắt ở pha
 *    capture rồi `preventDefault`) để ngăn bên dưới không đóng hay đổi bản ghi theo.
 *  - Mở ra con trỏ ở "Đóng" (không ở nút chính); Tab / Shift+Tab vòng trong hộp, không lọt ra sau.
 *  - Đang gọi máy chủ thì không đóng được; lỗi nằm TRONG hộp (không rơi ra banner sau lớp phủ).
 */
import { CircleAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

export function HopHoi({
  icon,
  tieuDe,
  children,
  nhanChinh,
  nhanDangLam,
  dangLam = false,
  loi,
  onDong,
  onXacNhan,
}: {
  icon: ReactNode;
  /** Câu hỏi — cũng là tên của hộp. */
  tieuDe: string;
  /** Các câu hệ quả (mỗi câu một `<p>`). */
  children: ReactNode;
  nhanChinh: string;
  nhanDangLam?: string;
  dangLam?: boolean;
  loi?: string | null;
  onDong: () => void;
  onXacNhan: () => void;
}) {
  const idTieuDe = useId();
  const hop = useRef<HTMLDivElement>(null);
  const nutDong = useRef<HTMLButtonElement>(null);
  const moiNhat = useRef({ onDong, dangLam });
  moiNhat.current = { onDong, dangLam };

  useEffect(() => {
    const truoc = document.activeElement;
    // Con trỏ vào "Đóng", không vào nút chính: Enter vội không thực thi thao tác đổi trạng thái.
    nutDong.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!moiNhat.current.dangLam) moiNhat.current.onDong();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
      } else if (e.key === "Tab") {
        // Giữ Tab trong hộp: vòng từ nút cuối về nút đầu (Shift+Tab ngược lại); con trỏ lạc ra ngoài thì kéo về.
        const o = Array.from(
          hop.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        if (o.length === 0) {
          e.preventDefault();
          return;
        }
        const dau = o[0];
        const cuoi = o[o.length - 1];
        const dang = document.activeElement;
        const trong = dang instanceof Node && hop.current?.contains(dang);
        if (e.shiftKey ? !trong || dang === dau : !trong || dang === cuoi) {
          e.preventDefault();
          (e.shiftKey ? cuoi : dau).focus();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (truoc instanceof HTMLElement && truoc.isConnected) truoc.focus({ preventScroll: true });
    };
  }, []);

  const dong = () => {
    if (!dangLam) onDong();
  };

  return (
    <>
      <div className="kt-man kt-man--tren" style={{ zIndex: 88 }} role="presentation" onClick={dong} />
      <div ref={hop} className="kt-hoi" role="alertdialog" aria-modal="true" aria-labelledby={idTieuDe}>
        <div className="kt-hoi__dau">
          <i>{icon}</i>
          <h2 id={idTieuDe}>{tieuDe}</h2>
        </div>
        <div className="kt-hoi__than">
          {children}
          {loi && (
            <p className="kt-o__loi" role="alert">
              <CircleAlert size={14} aria-hidden="true" />
              {loi}
            </p>
          )}
        </div>
        <div className="kt-hoi__chan">
          <button ref={nutDong} type="button" className="kt-btn kt-btn--tron" disabled={dangLam} onClick={dong}>Đóng</button>
          <button type="button" className="kt-btn kt-btn--chinh" disabled={dangLam} onClick={onXacNhan}>
            {dangLam ? (nhanDangLam ?? `${nhanChinh}…`) : nhanChinh}
          </button>
        </div>
      </div>
    </>
  );
}
