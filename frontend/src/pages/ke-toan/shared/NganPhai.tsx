/** Ngăn mở từ bên phải — vỏ chung của MỌI ngăn ở 5 màn kế toán (đặc tả A.3, A.5, A.6).
 *
 *  - Đầu ngăn cố định: đường dẫn nhỏ + ↑ ↓ | mở rộng | đóng — tiêu đề 20px + thẻ trạng thái + nút
 *    phụ — số lớn — dải tóm tắt 4 ô — hàng tab (tab đang mở nền charcoal).
 *  - Độ rộng chung `--kt-ngan-w` (xem `doRongNgan.ts`): kéo thanh ở mép trái, bấm đúp hoặc nút
 *    "Mở rộng" để bật/tắt rộng hết.
 *  - Esc đóng đúng lớp TRÊN CÙNG; lớp đang có nội dung gõ dở (`chanDong` trả true) thì hỏi trước.
 *  - ↑ ↓ (khi không gõ trong ô nhập) đổi sang bản ghi trước/sau.
 */
import { ChevronDown, ChevronUp, Maximize2, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { batTatRongHet, docDoRong, ghiDoRong } from "./doRongNgan";

export type TabNgan = { id: string; nhan: string; dem?: number };

/** Các ngăn đang mở, theo thứ tự mở — phím chỉ thuộc về ngăn cuối mảng. */
const chong: symbol[] = [];

/** Tiêu điểm đang ở chỗ gõ chữ / chọn — phím mũi tên là của nó, không phải đổi bản ghi. */
function dangGo(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.closest('[role="listbox"], [role="combobox"], [aria-expanded="true"]')) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function NganPhai({
  duongDan,
  tieuDe,
  the,
  hanhDong,
  soLon,
  tomTat,
  canhBao,
  tabs,
  tab,
  onTab,
  chan,
  chanToi,
  len,
  xuong,
  onDong,
  chanDong,
  tang = 0,
  children,
}: {
  /** Đường dẫn nhỏ trên cùng, vd "Phiếu chi > UNC-…" — ở ngăn chồng nó cho biết đang ở lớp trên. */
  duongDan?: ReactNode;
  tieuDe: ReactNode;
  /** Thẻ trạng thái cạnh tiêu đề. */
  the?: ReactNode;
  /** Nút phụ bên phải tiêu đề ("In phiếu", "⋯"). */
  hanhDong?: ReactNode;
  /** Số tiền lớn + bằng chữ (dùng `.kt-ngan__tien` / `.kt-ngan__chu`). */
  soLon?: ReactNode;
  /** Dải tóm tắt 4 ô nền --paper. */
  tomTat?: { nhan: string; giaTri: ReactNode }[];
  /** Dải cảnh báo dưới dải tóm tắt, trên hàng tab (vd "Đang vượt hạn mức …" — `.kt-canh`). */
  canhBao?: ReactNode;
  tabs?: TabNgan[];
  tab?: string;
  onTab?: (id: string) => void;
  chan?: ReactNode;
  /** Chân tối — thanh "đã chọn n" khi chọn nhiều. */
  chanToi?: boolean;
  len?: () => void;
  xuong?: () => void;
  onDong: () => void;
  /** Trả true = đang có nội dung gõ dở: hỏi "Bỏ nội dung đang nhập?" trước khi đóng. */
  chanDong?: () => boolean;
  /** 0 = ngăn thường, 1 = ngăn chồng. */
  tang?: number;
  children: ReactNode;
}) {
  const [keo, setKeo] = useState(false);
  const dangKeo = useRef(false);
  const bamTuNen = useRef(false);
  const khungRef = useRef<HTMLElement>(null);
  const idTieuDe = useId();

  // Hàm mới nhất qua ref: listener gắn một lần lúc mở, không gắn lại mỗi lần cha render.
  const moiNhat = useRef({ onDong, chanDong, len, xuong });
  moiNhat.current = { onDong, chanDong, len, xuong };

  const dongNeuDuoc = () => {
    const { onDong: dong, chanDong: chan } = moiNhat.current;
    if (chan?.() && !window.confirm("Bỏ nội dung đang nhập?")) return;
    dong();
  };
  const dongRef = useRef(dongNeuDuoc);
  dongRef.current = dongNeuDuoc;

  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--kt-ngan-w", `${docDoRong()}px`);
  }, []);

  useEffect(() => {
    const toi = Symbol("ngan");
    chong.push(toi);
    const truoc = document.activeElement;
    const khung = khungRef.current;
    if (khung && !khung.contains(document.activeElement)) khung.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || chong[chong.length - 1] !== toi) return;
      // Hộp xác nhận / hộp thoại khác đang mở thì phím là của chúng.
      if (document.querySelector(".cdlg-overlay, .dmodal-overlay")) return;
      if (e.key === "Escape") {
        const o = document.activeElement;
        if (o instanceof HTMLElement && o.closest('[aria-expanded="true"], [role="listbox"]')) return;
        e.preventDefault();
        dongRef.current();
        return;
      }
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (dangGo(document.activeElement)) return;
        const { len: l, xuong: x } = moiNhat.current;
        const f = e.key === "ArrowUp" ? l : x;
        if (!f) return;
        e.preventDefault();
        f();
      }
    }
    // Màn đổi cỡ thì kẹp độ rộng đang nhớ cho vừa, không ghi đè số đã nhớ.
    function onResize() {
      document.documentElement.style.setProperty("--kt-ngan-w", `${docDoRong()}px`);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      const i = chong.indexOf(toi);
      if (i >= 0) chong.splice(i, 1);
      // Trả tiêu điểm về chỗ cũ (dòng bảng vừa mở) để ↑ ↓ / Enter đi tiếp được bằng bàn phím.
      if (truoc instanceof HTMLElement && truoc.isConnected) truoc.focus({ preventScroll: true });
    };
  }, []);

  const batDauKeo = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    dangKeo.current = true;
    setKeo(true);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* jsdom / con trỏ đã nhả — kéo vẫn chạy nhờ sự kiện trên thanh kéo */
    }
  };
  const dangDiChuyen = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dangKeo.current) return;
    ghiDoRong(window.innerWidth - e.clientX);
  };
  const thoiKeo = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dangKeo.current) return;
    dangKeo.current = false;
    setKeo(false);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* bỏ qua */
    }
  };

  return (
    <div className={`kt-man${tang > 0 ? " kt-man--tren" : ""}`} style={{ zIndex: 60 + tang * 20 }}
      role="presentation"
      // Chỉ đóng khi cú bấm BẮT ĐẦU và kết thúc trên lớp phủ: bôi chữ trong ngăn rồi thả chuột
      // ra ngoài cũng sinh click trên lớp phủ, không được tính là "bấm ra ngoài".
      onMouseDown={(e) => {
        bamTuNen.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const tuNen = bamTuNen.current;
        bamTuNen.current = false;
        if (tuNen && e.target === e.currentTarget) dongRef.current();
      }}>
      <aside ref={khungRef} className={`kt-ngan${keo ? " kt-ngan--keo" : ""}`} role="dialog" aria-modal="true"
        aria-labelledby={idTieuDe} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="kt-ngan__keo" role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng"
          title="Kéo để nới rộng. Bấm đúp để mở rộng hết."
          onPointerDown={batDauKeo} onPointerMove={dangDiChuyen} onPointerUp={thoiKeo} onPointerCancel={thoiKeo}
          onDoubleClick={batTatRongHet} />
        <header className="kt-ngan__dau">
          <div className="kt-ngan__dong1">
            {duongDan != null && <span className="kt-ngan__duong">{duongDan}</span>}
            <span className="kt-ngan__nut">
              {len && (
                <button type="button" className="kt-ic" aria-label="Bản ghi trước" title="Bản ghi trước (↑)" onClick={len}>
                  <ChevronUp size={16} aria-hidden="true" />
                </button>
              )}
              {xuong && (
                <button type="button" className="kt-ic" aria-label="Bản ghi sau" title="Bản ghi sau (↓)" onClick={xuong}>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
              )}
              {(len || xuong) && <span className="kt-ngan__vach" aria-hidden="true" />}
              <button type="button" className="kt-ic" aria-label="Mở rộng" title="Mở rộng hết hoặc trả về" onClick={batTatRongHet}>
                <Maximize2 size={16} aria-hidden="true" />
              </button>
              <button type="button" className="kt-ic" aria-label="Đóng" title="Đóng (Esc)" onClick={() => dongRef.current()}>
                <X size={16} aria-hidden="true" />
              </button>
            </span>
          </div>
          <div className="kt-ngan__tieu">
            <h2 id={idTieuDe}>{tieuDe}</h2>
            {the}
            {hanhDong != null && <span className="kt-ngan__hd">{hanhDong}</span>}
          </div>
          {soLon != null && <div className="kt-ngan__so">{soLon}</div>}
          {tomTat && tomTat.length > 0 && (
            <div className="kt-ngan__su">
              {tomTat.map((o) => (
                <div key={o.nhan}>
                  <span>{o.nhan}</span>
                  <b>{o.giaTri}</b>
                </div>
              ))}
            </div>
          )}
          {canhBao}
          {tabs && tabs.length > 0 && (
            <div className="kt-ngan__tab" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={t.id === tab}
                  className={t.id === tab ? "on" : undefined} onClick={() => onTab?.(t.id)}>
                  {t.nhan}
                  {t.dem != null && <span className="kt-dem">{t.dem}</span>}
                </button>
              ))}
            </div>
          )}
        </header>
        <div className="kt-ngan__than">{children}</div>
        {chan != null && <footer className={`kt-ngan__chan${chanToi ? " kt-ngan__chan--toi" : ""}`}>{chan}</footer>}
      </aside>
    </div>
  );
}
