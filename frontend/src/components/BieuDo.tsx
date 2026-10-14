// Mảnh biểu đồ SVG dùng chung cho dạng "Biểu đồ" của các báo cáo (12/10/2026): Báo cáo kinh doanh,
// Báo cáo công nợ (phương án A của docs/mockups/bao-cao-kinh-doanh-bieu-do-3-phuong-an.html và
// bao-cao-cong-no-bieu-do-3-phuong-an.html), cùng nét với biểu đồ Báo cáo thu chi.
//
// Tự vẽ SVG (không Recharts) để đúng khuôn mockup: khối nền trắng, thẻ số có thanh phần trăm, vòng có
// chú giải bấm được, thanh ngang chồng nhiều đoạn, ô số khi rê chuột. SVG vẽ đúng bề rộng điểm ảnh
// của khối (`useRong`) để chữ trục không co theo khối.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { soVN } from "./LuoiDs";
import "./bieu-do.css";

/** Mỗi đối tượng một màu riêng (không dùng sắc đậm nhạt của cùng một màu). */
export const MAU_DT = ["#2563eb", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#ef4444", "#6366f1", "#0ea5e9", "#84cc16", "#d946ef"];
/** Lát / thanh gộp "… khác". */
export const MAU_KHAC = "#94a3b8";
/** Vòng và xếp hạng chỉ vẽ ngần này đối tượng lớn nhất, còn lại gộp một lát. */
export const TOI_DA_LAT = 10;

/** Nhãn trục: triệu đồng, một chữ số lẻ khi dưới 100. */
export function trieu(v: number): string {
  const t = Math.abs(v) / 1e6;
  const s = (t >= 100 ? Math.round(t) : Math.round(t * 10) / 10).toLocaleString("vi-VN");
  return v < 0 ? `−${s}` : s;
}

export function buocDep(khoang: number): number {
  if (khoang <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(khoang));
  const f = khoang / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Trục y: 0 luôn nằm trong trục, ~4 vạch. */
export function truc(gia: number[]) {
  let mx = Math.max(0, ...gia);
  let mn = Math.min(0, ...gia);
  const b = buocDep((mx - mn) / 4 || 1);
  mx = Math.ceil(mx / b) * b;
  mn = Math.floor(mn / b) * b;
  if (mx === mn) mx = mn + b;
  const vach: number[] = [];
  for (let v = mn; v <= mx + b / 2; v += b) vach.push(v);
  return { mx, mn, vach };
}

/** Phần trăm một chữ số lẻ, dấu phẩy Việt. */
export const phanTram = (v: number, tren: number) =>
  tren > 0 ? (Math.round((v * 1000) / tren) / 10).toLocaleString("vi-VN") : "0";

/** Tên công ty trên biểu đồ bỏ tiền tố loại hình cho đủ chỗ; rê chuột / bảng vẫn ra tên đủ. */
export function tenNgan(ten: string): string {
  return ten.replace(/^\s*(công ty|cty)\s+(cổ phần|cp|tnhh mtv|tnhh)\s+/i, "") || ten;
}

/** Bề rộng thật của khối. */
export function useRong(): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Đo ngay một lần: ResizeObserver chỉ báo ở khung vẽ kế tiếp (tab nền có thể không vẽ).
    setW(Math.round(el.clientWidth));
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ---------- ô số khi rê chuột ----------

export type Tip = { x: number; y: number; dong: string[] } | null;
export type DatTip = (t: Tip) => void;

/** Thuộc tính gắn vào một hình để rê chuột ra ô số. */
export function rePhai(datTip: DatTip, ...dong: string[]) {
  return {
    onMouseMove: (e: { clientX: number; clientY: number }) => datTip({ x: e.clientX, y: e.clientY, dong }),
    onMouseLeave: () => datTip(null),
  };
}

export function OTip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className="bd-tip" style={{ left: tip.x + 14, top: tip.y + 12 }} role="tooltip">
      {tip.dong.map((d, i) => <div key={i}>{d}</div>)}
    </div>
  );
}

// ---------- khối, thẻ số ----------

export function Khoi({ tieu, ph, phai, nhan, className, children }: {
  tieu: ReactNode; ph?: ReactNode; phai?: ReactNode; nhan?: string; className?: string; children: ReactNode;
}) {
  return (
    <section className={`bd-khoi${className ? ` ${className}` : ""}`} aria-label={nhan ?? (typeof tieu === "string" ? tieu : undefined)}>
      <div className="bd-dau">
        <span className="bd-tieu">{tieu}</span>
        {ph && <span className="bd-ph">{ph}</span>}
        <span className="bd-sp" />
        {phai}
      </div>
      {children}
    </section>
  );
}

export type The = { nhan: string; mau: string; so: string; phu: string; ray?: number; onClick?: () => void };

/** Hàng thẻ số; `ray` (0–100) vẽ thanh phần trăm dưới số. */
export function HangThe({ the }: { the: The[] }) {
  return (
    <div className="bd-the-hang" style={{ gridTemplateColumns: `repeat(${the.length}, minmax(0, 1fr))` }}>
      {the.map((t) => {
        const noi = (
          <>
            <span className="bd-the__nhan"><i style={{ background: t.mau }} />{t.nhan}</span>
            <span className="bd-the__so">{t.so}</span>
            {t.ray != null && (
              <span className="bd-the__ray"><b style={{ width: `${Math.max(0, Math.min(100, t.ray))}%`, background: t.mau }} /></span>
            )}
            <span className="bd-the__phu">{t.phu}</span>
          </>
        );
        return t.onClick ? (
          <button key={t.nhan} type="button" className="bd-the bd-the--bam" onClick={t.onClick}>{noi}</button>
        ) : (
          <div key={t.nhan} className="bd-the">{noi}</div>
        );
      })}
    </div>
  );
}

export function ChuGiai({ muc }: { muc: { ten: string; mau: string; duong?: boolean }[] }) {
  return (
    <div className="bd-cg">
      {muc.map((m) => <span key={m.ten}><i className={m.duong ? "duong" : undefined} style={{ background: m.mau }} />{m.ten}</span>)}
    </div>
  );
}

export function TabKhoi<K extends string>({ tab, dang, onDoi }: { tab: [K, string][]; dang: K; onDoi: (k: K) => void }) {
  return (
    <div className="bd-tab" role="tablist">
      {tab.map(([k, nhan]) => (
        <button key={k} type="button" role="tab" aria-selected={dang === k} className={dang === k ? "on" : undefined}
          onClick={() => onDoi(k)}>{nhan}</button>
      ))}
    </div>
  );
}

// ---------- vòng cơ cấu + chú giải ----------

export type Lat = { khoa: string; ten: string; tenDu?: string; v: number; mau: string; onClick?: () => void };

export function VongCoCau({ lat, giua, nhan, datTip, size = 180 }: {
  lat: Lat[]; giua: string; nhan: string; datTip: DatTip; size?: number;
}) {
  const r = size / 2 - 4, r0 = r - 24, c = size / 2;
  const tong = lat.reduce((a, l) => a + l.v, 0) || 1;
  const P = (rr: number, g: number) => [c + rr * Math.cos(g), c + rr * Math.sin(g)];
  let goc = -Math.PI / 2;
  return (
    <svg className="bd-vong" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      {lat.map((l) => {
        const g = (2 * Math.PI * l.v) / tong;
        if (g <= 0) return null;
        const a = goc, a2 = goc + Math.min(g, 2 * Math.PI - 1e-4), lon = g > Math.PI ? 1 : 0;
        goc = a2;
        const [x1, y1] = P(r, a), [x2, y2] = P(r, a2), [x3, y3] = P(r0, a2), [x4, y4] = P(r0, a);
        return (
          <path key={l.khoa} d={`M${x1},${y1} A${r},${r} 0 ${lon} 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 ${lon} 0 ${x4},${y4} Z`}
            fill={l.mau} className={`bd-lat${l.onClick ? " bam" : ""}`} onClick={l.onClick}
            {...rePhai(datTip, l.tenDu ?? l.ten, `${soVN(l.v)} đ (${phanTram(l.v, tong)}%)`)} />
        );
      })}
      <text x={c} y={c - 1} textAnchor="middle" className="bd-vong__so">{giua}</text>
      <text x={c} y={c + 17} textAnchor="middle" className="bd-vong__nhan">{nhan}</text>
    </svg>
  );
}

export function ChuGiaiVong({ lat }: { lat: Lat[] }) {
  const tong = lat.reduce((a, l) => a + l.v, 0) || 1;
  return (
    <div className="bd-lg">
      {lat.map((l) => {
        const noi = (
          <>
            <i style={{ background: l.mau }} />
            <span className="bd-ten" title={l.tenDu ?? l.ten}>{l.ten}</span>
            <span className="p">{`${Math.round((100 * l.v) / tong)}%`}</span>
            <span className="n">{soVN(l.v)}</span>
          </>
        );
        return l.onClick ? (
          <button key={l.khoa} type="button" className="bd-lg__r" onClick={l.onClick}>{noi}</button>
        ) : (
          <div key={l.khoa} className="bd-lg__r">{noi}</div>
        );
      })}
    </div>
  );
}

// ---------- thanh ngang (có thể nhiều đoạn) ----------

export type DongThanh = {
  khoa: string; ten: string; tenDu?: string; so: string;
  doan: { v: number; mau: string; tip: string[] }[];
  onClick?: () => void;
};

/** Mỗi dòng một thanh; mọi thanh chung một thước `thuoc` (giá trị ứng với hết bề rộng). */
export function ThanhNgang({ dong, thuoc, datTip, cotTen = 200 }: {
  dong: DongThanh[]; thuoc: number; datTip: DatTip; cotTen?: number;
}) {
  const t = thuoc > 0 ? thuoc : 1;
  return (
    <div className="bd-hb" style={{ gridTemplateColumns: `${cotTen}px minmax(0, 1fr) auto` }}>
      {dong.map((d) => {
        const noi = (
          <>
            <span className="bd-ten" title={d.tenDu ?? d.ten}>{d.ten}</span>
            <span className="bd-hb__ray">
              {d.doan.map((x, i) => x.v > 0 && (
                <b key={i} style={{ width: `${(100 * x.v) / t}%`, background: x.mau }} {...rePhai(datTip, ...x.tip)} />
              ))}
            </span>
            <span className="n">{d.so}</span>
          </>
        );
        return d.onClick ? (
          <button key={d.khoa} type="button" className="bd-hb__r" onClick={d.onClick}>{noi}</button>
        ) : (
          <div key={d.khoa} className="bd-hb__r">{noi}</div>
        );
      })}
    </div>
  );
}

// ---------- khung cột theo danh mục ----------

export type TrucCot = { y: (v: number) => number; xGiua: (i: number) => number; cw: number; w: number; h: number };

/** Lưới ngang + nhãn trục y (triệu) + nhãn danh mục dưới chân (một hoặc hai dòng). Rộng theo khối. */
export function KhungCot({ h, nhan, gia, chanHaiDong, phai, children }: {
  h: number; nhan: (string | [string, string])[]; gia: number[]; chanHaiDong?: boolean;
  /** Trục phải (vd luỹ kế): giá trị lớn nhất và màu chữ. */
  phai?: { gia: number[]; mau: string };
  children: (p: TrucCot & { y2?: (v: number) => number }) => ReactNode;
}) {
  const [ref, rong] = useRong();
  const w = Math.max(rong, 260);
  const L = 46, R = phai ? 42 : 8, T = 22, B = chanHaiDong ? 38 : 24;
  const H = h - T - B, cw = (w - L - R) / Math.max(1, nhan.length);
  const { mx, mn, vach } = truc(gia);
  const y = (v: number) => T + (H * (mx - v)) / (mx - mn);
  // Trục phải chia đúng số vạch của trục trái (vạch tròn số, từ 0) để hai bộ nhãn nằm chung một lưới.
  const soKhoang = vach.length - 1;
  const mx2 = phai ? buocDep(Math.max(1, ...phai.gia) / soKhoang) * soKhoang : 0;
  const y2 = phai ? (v: number) => T + H * (1 - v / mx2) : undefined;
  const xGiua = (i: number) => L + cw * i + cw / 2;
  // Nhãn chân thưa ra khi cột hẹp, kẻo chồng lên nhau. Nhãn hai dòng mỗi dòng ngắn nên chịu cột hẹp hơn.
  const buoc = Math.max(1, Math.ceil((chanHaiDong ? 36 : 46) / Math.max(cw, 1)));
  return (
    <div ref={ref} className="bd-ve">
      {rong > 0 && (
        <svg className="bd-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img">
          {vach.map((v, i) => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className={v === 0 ? "bd-truc0" : "bd-luoi"} />
              <text x={L - 6} y={y(v) + 4} textAnchor="end" className="bd-so">{trieu(v)}</text>
              {phai && mn === 0 && (
                <text x={w - R + 6} y={y(v) + 4} className="bd-so" style={{ fill: phai.mau }}>{trieu((mx2 * i) / soKhoang)}</text>
              )}
            </g>
          ))}
          <text x={L - 6} y={10} textAnchor="end" className="bd-dv">triệu</text>
          {nhan.map((n, i) => (i % buoc === 0 || i === nhan.length - 1) && (
            Array.isArray(n) ? (
              <g key={i}>
                <text x={xGiua(i)} y={h - 22} textAnchor="middle" className="bd-chan">{n[0]}</text>
                <text x={xGiua(i)} y={h - 8} textAnchor="middle" className="bd-chan bd-chan--phu">{n[1]}</text>
              </g>
            ) : (
              <text key={i} x={xGiua(i)} y={h - (chanHaiDong ? 16 : 8)} textAnchor="middle" className="bd-chan">{n}</text>
            )
          ))}
          {children({ y, xGiua, cw, w, h, y2 })}
        </svg>
      )}
    </div>
  );
}
