// KHUÔN HỘP THOẠI CHUNG của bàn tổ (09/10/2026, mockup `ban-to-hop-thoai-B.html`).
//
// Máy tính: hộp giữa màn (540px, `hep` 460px). Điện thoại: hộp ngắn trồi từ đáy (`dienThoai="day"`)
// hoặc gần toàn màn (`"toan"`), nút chân to chia đều. Mọi hộp cùng một đầu (tiêu đề + phụ đề + ✕),
// một chân (gợi ý phím tắt bên trái, nút phụ, nút chính) — người dùng học một lần là quen mọi hộp.
//
// Gắn vào `document.body` qua portal: ngăn chi tiết có `overflow` và `container-type`, hộp nằm
// trong đó sẽ bị cắt và bị khoá theo khổ ngăn.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "../../components/Button";
import "./thsx-hop.css";

export function ThsxHop({
  tieuDe, phuDe, co = "thuong", dienThoai, phimTat, onPhimTat, nutPhu = "Huỷ", nutChinh, nutChinhKhoa,
  dangGui, loi, onDong, onChinh, children,
}: {
  tieuDe: string;
  phuDe?: ReactNode;
  co?: "thuong" | "hep";
  /** Điện thoại: trồi từ đáy hay gần toàn màn. Mặc định theo cỡ: hẹp ⇒ đáy, thường ⇒ toàn màn. */
  dienThoai?: "day" | "toan";
  /** Gợi ý ở góc trái chân, vd "Ctrl + Enter để ghi". */
  phimTat?: string | null;
  /** Ctrl/Cmd + Enter gọi hàm này khi nút chính không khoá. */
  onPhimTat?: () => void;
  nutPhu?: string;
  nutChinh: string;
  nutChinhKhoa?: boolean;
  dangGui?: boolean;
  /** Câu lỗi hiện ô đỏ ngay trên chân. */
  loi?: string | null;
  onDong: () => void;
  onChinh: () => void;
  children: ReactNode;
}) {
  const idTieuDe = useId();
  const hopRef = useRef<HTMLDivElement>(null);
  const nhanTrenNen = useRef(false);
  const kieuDt = dienThoai ?? (co === "hep" ? "day" : "toan");
  const khoaChinh = !!nutChinhKhoa || !!dangGui;

  // Đưa tiêu điểm vào hộp để Esc / Ctrl+Enter tới được ngay cả khi chưa bấm ô nào; khoá cuộn nền.
  useEffect(() => {
    // Ô có autoFocus đã giành tiêu điểm thì để yên — chỉ kéo về hộp khi tiêu điểm còn ở ngoài.
    const hop = hopRef.current;
    if (hop && !hop.contains(document.activeElement)) hop.focus({ preventScroll: true });
    const cu = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = cu; };
  }, []);

  return createPortal(
    <div className={`thsx-hop-nen thsx-hop-nen--${kieuDt}`}
      onMouseDown={(e) => { nhanTrenNen.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (nhanTrenNen.current && e.target === e.currentTarget && !dangGui) onDong(); }}>
      <div ref={hopRef} role="dialog" aria-modal="true" aria-labelledby={idTieuDe} tabIndex={-1}
        className={`thsx-hop thsx-hop--${co} thsx-hop--dt-${kieuDt}`}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !e.defaultPrevented) {
            e.preventDefault();
            if (!dangGui) onDong();
            return;
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && onPhimTat) {
            e.preventDefault();
            // Hộp lồng trong hộp (popup "Thêm người tổ khác" trong Ghi sản lượng): sự kiện React đi
            // xuyên portal lên hộp ngoài — chặn lại để Ctrl + Enter không bấm luôn nút của hộp ngoài.
            e.stopPropagation();
            if (!khoaChinh) onPhimTat();
          }
        }}>
        <span className="thsx-hop__grip" aria-hidden="true" />
        <header className="thsx-hop__dau">
          <div className="thsx-hop__chu">
            <h2 id={idTieuDe} className="thsx-hop__tieu-de">{tieuDe}</h2>
            {phuDe && <div className="thsx-hop__phu-de">{phuDe}</div>}
          </div>
          <button type="button" className="thsx-hop__x" aria-label="Đóng" disabled={dangGui} onClick={onDong}>×</button>
        </header>
        <div className="thsx-hop__than">{children}</div>
        {loi && <div className="thsx-hop__loi thsx-bao thsx-bao--do" role="alert">{loi}</div>}
        <footer className="thsx-hop__chan">
          {phimTat && <span className="thsx-hop__phim">{phimTat}</span>}
          <Button variant="ghost" onClick={onDong} disabled={dangGui}>{nutPhu}</Button>
          <Button variant="accent" onClick={onChinh} disabled={khoaChinh}>{nutChinh}</Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
