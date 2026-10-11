import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SAP_XEP_BAN_TO, type ThsxSapXep } from "../loc-san-xuat/dieu-kien-ban-to";

/** Nút "Sắp xếp Mới nhận trước ▾" bên phải thanh lọc bàn tổ (mockup ban-to-ngan-A-tinh-chinh): mở menu
 *  chọn một trong các cách xếp. Dùng lại nút + dòng radio của thanh lọc chung cho cùng một dáng. */
export function ThsxSapXepNut({ value, onChange }: { value: ThsxSapXep; onChange: (v: ThsxSapXep) => void }) {
  const [mo, setMo] = useState(false);
  const vung = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const bam = (e: MouseEvent) => {
      if (vung.current && e.target instanceof Node && !vung.current.contains(e.target)) setMo(false);
    };
    const phim = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // đừng để Esc lọt xuống đóng ngăn chi tiết đang mở
      setMo(false);
    };
    document.addEventListener("mousedown", bam);
    document.addEventListener("keydown", phim, true);
    return () => {
      document.removeEventListener("mousedown", bam);
      document.removeEventListener("keydown", phim, true);
    };
  }, [mo]);

  const nhan = SAP_XEP_BAN_TO.find(([v]) => v === value)?.[1] ?? SAP_XEP_BAN_TO[0][1];
  return (
    <div className="tl-neo thsx-sx" ref={vung}>
      <button type="button" className={`tl-nut${mo ? " is-mo" : ""}`} aria-haspopup="menu" aria-expanded={mo}
        aria-label={`Sắp xếp: ${nhan}`} onClick={() => setMo(!mo)}>
        <span className="tl-nut__phu">Sắp xếp</span>
        {nhan}
        <ChevronDown size={15} aria-hidden="true" className="tl-nut__mui" />
      </button>
      {mo && (
        <div className="tl-pop thsx-sx__pop">
          <div className="tl-menu" role="menu" aria-label="Sắp xếp">
            {SAP_XEP_BAN_TO.map(([v, chu]) => (
              <button key={v} type="button" role="menuitemradio" aria-checked={v === value}
                className={`tl-dong tl-dong--radio${v === value ? " on" : ""}`}
                onClick={() => {
                  onChange(v);
                  setMo(false);
                }}>
                <span className="tl-dong__dau" aria-hidden="true" />
                {chu}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
