// DẠNG BIỂU ĐỒ của Báo cáo thu chi (12/10/2026) — phương án C của
// `docs/mockups/bao-cao-thu-chi-pinterest-3-phuong-an.html` (theo ảnh Finance Dashboard).
//
// Lưới 2 × 2: đường thu chi theo tháng | Kết quả kỳ; Cơ cấu mục chi / mục thu (vòng, hai tab) | cột
// thu so với chi. Vẽ từ CHÍNH số liệu của bảng (`/api/bao-cao-thu-chi`, không cắt trang) — không
// phép tính nào mới ở máy chủ. Bấm một mục (lát vòng, dòng chú giải, dòng Kết quả kỳ) mở ngăn phiếu
// của mục đó; bấm một tháng (điểm, cột) chuyển sang dạng bảng và tô cột tháng đó.
import { useState, type ReactNode } from "react";

import type { BaoCaoThuChi, DongThuChi } from "../../api/client";
import { trieu, truc, useRong } from "../../components/BieuDo";
import { soVN } from "../../components/LuoiDs";
import { ngayDeDoc } from "../../utils/ky";

const MAU_THU = "#3b82f6";
const MAU_CHI = "#f97316";
/** Mỗi mục một màu riêng (không dùng sắc đậm nhạt của cùng một màu); "Chưa phân loại" luôn vàng. */
const MAU_MUC = ["#2563eb", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#ef4444", "#6366f1", "#0ea5e9", "#84cc16", "#d946ef"];
const MAU_CHUA = "#f59e0b";
const MAU_KHAC = "#94a3b8";
/** Xem theo người: vòng chỉ vẽ 10 người lớn nhất, còn lại gộp một lát. */
const TOI_DA_LAT = 10;

type Tip = { x: number; y: number; dong1: string; dong2: string } | null;
type Diem = { khoa: string | null; nhan: string; thu: number; chi: number };
type Lat = { ten: string; cong: number; mau: string; dong: DongThuChi | null };

const amSo = (n: number) => (n < 0 ? `−${soVN(-n)}` : soVN(n));

/** Nhãn cột kỳ dưới trục khi cột hẹp: "Tháng 10 (1 – 12/10)" → "T10", "Quý 4/2026 (…)" → "Q4/2026".
 *  Ô số khi rê chuột vẫn ghi nhãn đủ. */
function nhanTruc(nhan: string, cw: number): string {
  if (cw >= 150) return nhan;
  const bo = nhan.replace(/\s*\(.*\)$/, "");
  if (cw >= 90) return bo;
  return bo.replace(/^Tháng (\d+)/, "T$1").replace(/^Quý /, "Q");
}

/** Khung chung: lưới ngang, nhãn trục y (triệu), nhãn tháng dưới chân. Rộng theo khối, cao `h`. */
function KhungThang({ h, diem, gia, children }: {
  h: number; diem: Diem[]; gia: number[];
  children: (p: { y: (v: number) => number; xGiua: (i: number) => number; cw: number }) => ReactNode;
}) {
  const [ref, rong] = useRong();
  return (
    <div ref={ref} className="bctc-bd__ve">
      {rong > 0 && <Truc w={Math.max(rong, 280)} h={h} diem={diem} gia={gia}>{children}</Truc>}
    </div>
  );
}

function Truc({ w, h, diem, gia, children }: {
  w: number; h: number; diem: Diem[]; gia: number[];
  children: (p: { y: (v: number) => number; xGiua: (i: number) => number; cw: number }) => ReactNode;
}) {
  const L = 48, R = 8, T = 24, B = 26;
  const H = h - T - B, cw = (w - L - R) / Math.max(1, diem.length);
  const { mx, mn, vach } = truc(gia);
  const y = (v: number) => T + (H * (mx - v)) / (mx - mn);
  const xGiua = (i: number) => L + cw * i + cw / 2;
  return (
    <svg className="bctc-bd__svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img">
      {vach.map((v) => (
        <g key={v}>
          <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className={v === 0 ? "bctc-bd__truc0" : "bctc-bd__luoi"} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className="bctc-bd__so">{trieu(v)}</text>
        </g>
      ))}
      <text x={L - 6} y={10} textAnchor="end" className="bctc-bd__dv">triệu</text>
      {diem.map((d, i) => (
        <text key={d.khoa ?? "ca"} x={xGiua(i)} y={h - 8} textAnchor="middle" className="bctc-bd__thang">{nhanTruc(d.nhan, cw)}</text>
      ))}
      {children({ y, xGiua, cw })}
    </svg>
  );
}

function ChuGiai({ thu, chi }: { thu: boolean; chi: boolean }) {
  return (
    <div className="bctc-bd__cg">
      {thu && <span><i style={{ background: MAU_THU }} />Thu</span>}
      {chi && <span><i style={{ background: MAU_CHI }} />Chi</span>}
    </div>
  );
}

/** Vòng cơ cấu: mỗi lát một mục; giữa vòng là tổng. */
function Vong({ lat, nhan, onMo, onTip }: {
  lat: Lat[]; nhan: string; onMo: (d: DongThuChi) => void; onTip: (t: Tip) => void;
}) {
  const size = 190, r = size / 2 - 6, r0 = r - 26, c = size / 2;
  const tong = lat.reduce((a, l) => a + l.cong, 0) || 1;
  const P = (rr: number, g: number) => [c + rr * Math.cos(g), c + rr * Math.sin(g)];
  let goc = -Math.PI / 2;
  return (
    <svg className="bctc-bd__vong" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      {lat.map((l) => {
        const g = (2 * Math.PI * l.cong) / tong;
        if (g <= 0) return null;
        const a = goc, a2 = goc + Math.min(g, 2 * Math.PI - 1e-4), lon = g > Math.PI ? 1 : 0;
        goc = a2;
        const [x1, y1] = P(r, a), [x2, y2] = P(r, a2), [x3, y3] = P(r0, a2), [x4, y4] = P(r0, a);
        const d = l.dong;
        return (
          <path key={l.ten} d={`M${x1},${y1} A${r},${r} 0 ${lon} 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 ${lon} 0 ${x4},${y4} Z`}
            fill={l.mau} className={`bctc-bd__lat${d ? " bam" : ""}`}
            onClick={d ? () => onMo(d) : undefined}
            onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, dong1: l.ten, dong2: `${soVN(l.cong)} đ` })}
            onMouseLeave={() => onTip(null)} />
        );
      })}
      <text x={c} y={c - 2} textAnchor="middle" className="bctc-bd__vong-so">{`${trieu(tong)} tr`}</text>
      <text x={c} y={c + 16} textAnchor="middle" className="bctc-bd__vong-nhan">{nhan}</text>
    </svg>
  );
}

export function BieuDoThuChi({ data, theo, onMo, onThang }: {
  data: BaoCaoThuChi;
  theo: "muc" | "nguoi";
  /** Mở ngăn phiếu của một dòng. */
  onMo: (d: DongThuChi) => void;
  /** Sang dạng bảng, tô cột kỳ `khoa` (null = kỳ gọn trong một tháng, không có cột kỳ). */
  onThang: (khoa: string | null) => void;
}) {
  const [cc, setCc] = useState<"chi" | "thu">("chi");
  const [tip, setTip] = useState<Tip>(null);

  const coThu = data.nhom.thu.so_dong > 0;
  const coChi = data.nhom.chi.so_dong > 0;
  // Kỳ gọn trong một tháng thì máy chủ không trả cột kỳ — vẽ một điểm "Cả kỳ".
  const diem: Diem[] = data.cot.length
    ? data.cot.map((c) => ({ khoa: c.khoa, nhan: c.nhan, thu: data.nhom.thu.o[c.khoa] ?? 0, chi: data.nhom.chi.o[c.khoa] ?? 0 }))
    : [{ khoa: null, nhan: "Cả kỳ", thu: data.nhom.thu.cong, chi: data.nhom.chi.cong }];
  const gia = diem.flatMap((d) => [coThu ? d.thu : 0, coChi ? d.chi : 0]);

  const thu = data.dong.filter((d) => d.ben === "thu");
  const chi = data.dong.filter((d) => d.ben === "chi");
  const ds = cc === "chi" ? chi : thu;
  const tongCc = ds.reduce((a, d) => a + d.cong, 0) || 1;
  // Máy chủ đã xếp: tiền giảm dần, "Chưa phân loại" cuối nhóm.
  let mauThu = 0;
  const lat: Lat[] = ds.slice(0, TOI_DA_LAT).map((d) => ({
    ten: d.ten, cong: d.cong, dong: d, mau: d.chua && theo === "muc" ? MAU_CHUA : MAU_MUC[mauThu++ % MAU_MUC.length],
  }));
  if (ds.length > TOI_DA_LAT) {
    lat.push({ ten: theo === "muc" ? "Mục khác" : "Người khác", dong: null, mau: MAU_KHAC,
      cong: ds.slice(TOI_DA_LAT).reduce((a, d) => a + d.cong, 0) });
  }

  const hienTip = (e: { clientX: number; clientY: number }, dong1: string, dong2: string) =>
    setTip({ x: e.clientX, y: e.clientY, dong1, dong2 });
  const kq = (r: DongThuChi[]) => r.map((d) => (
    <button key={`${d.ben}:${d.khoa}`} type="button" className="bctc-bd__kq-r bctc-bd__kq-r--con" onClick={() => onMo(d)}
      aria-label={`Xem phiếu của ${d.ten}`}>
      <span className="bctc-bd__ten" title={d.ten}>{d.ten}</span>
      <span className="n">{soVN(d.cong)}</span>
    </button>
  ));
  const chenh = data.chenh_lech.cong;

  return (
    <div className="bctc-bd" onMouseLeave={() => setTip(null)}>
      <div className="bctc-bd__hang bctc-bd__hang--1">
        <section className="bctc-bd__khoi" aria-label="Thu và chi theo tháng">
          <div className="bctc-bd__dau">
            <span className="bctc-bd__tieu">Thu và chi theo tháng</span>
            <span className="bctc-bd__ph">rê chuột lên điểm để xem số</span>
            <span className="bctc-bd__sp" />
            <ChuGiai thu={coThu} chi={coChi} />
          </div>
          <KhungThang h={250} diem={diem} gia={gia}>
            {({ y, xGiua }) => (
              <>
                {([[coThu, "thu", MAU_THU, "Thu"], [coChi, "chi", MAU_CHI, "Chi"]] as const).map(([co, k, mau, ten]) => {
                  if (!co) return null;
                  const pts = diem.map((d, i) => [xGiua(i), y(d[k])] as const);
                  const duong = pts.map((p) => p.join(",")).join(" L");
                  return (
                    <g key={k}>
                      {pts.length > 1 && (
                        <>
                          <path d={`M${pts[0][0]},${y(0)} L${duong} L${pts[pts.length - 1][0]},${y(0)} Z`} fill={mau} opacity={0.12} />
                          <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={mau} strokeWidth={2.2} />
                        </>
                      )}
                      {pts.map((p, i) => (
                        <circle key={i} cx={p[0]} cy={p[1]} r={4.5} fill="var(--canvas, #fff)" stroke={mau} strokeWidth={2}
                          className="bam" onClick={() => onThang(diem[i].khoa)}
                          onMouseMove={(e) => hienTip(e, `${ten}, ${diem[i].nhan}`, `${soVN(diem[i][k])} đ`)}
                          onMouseLeave={() => setTip(null)} />
                      ))}
                    </g>
                  );
                })}
              </>
            )}
          </KhungThang>
        </section>

        <section className="bctc-bd__khoi bctc-bd__kq" aria-label="Kết quả kỳ">
          <div className="bctc-bd__dau">
            <span className="bctc-bd__tieu">Kết quả kỳ</span>
            <span className="bctc-bd__ph">{`${ngayDeDoc(data.tu_ngay).slice(0, 5)} – ${ngayDeDoc(data.den_ngay)}`}</span>
          </div>
          <div className="bctc-bd__kq-ds">
            {coThu && (
              <>
                <div className="bctc-bd__kq-r"><span>Thu</span><span className="n">{soVN(data.nhom.thu.cong)}</span></div>
                {kq(thu)}
              </>
            )}
            {coThu && coChi && <div className="bctc-bd__gach" />}
            {coChi && (
              <>
                <div className="bctc-bd__kq-r"><span>Chi</span><span className="n">{soVN(data.nhom.chi.cong)}</span></div>
                {kq(chi)}
              </>
            )}
            <div className="bctc-bd__kq-r bctc-bd__kq-r--tong">
              <span>Chênh lệch thu − chi</span>
              <span className={`n${chenh < 0 ? " lds-do" : ""}`}>{amSo(chenh)}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="bctc-bd__hang">
        <section className="bctc-bd__khoi" aria-label="Cơ cấu">
          <div className="bctc-bd__tab" role="tablist">
            {(["chi", "thu"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={cc === k} className={cc === k ? "on" : undefined}
                onClick={() => setCc(k)}>
                {theo === "muc" ? `Cơ cấu mục ${k}` : k === "chi" ? "Cơ cấu người nhận" : "Cơ cấu người nộp"}
              </button>
            ))}
          </div>
          {ds.length === 0 ? (
            <p className="lds-mu bctc-bd__trong">{`Không có phiếu ${cc} nào khớp điều kiện đang lọc.`}</p>
          ) : (
            <div className="bctc-bd__dn">
              <Vong lat={lat} nhan={cc === "chi" ? "tổng chi" : "tổng thu"} onMo={onMo} onTip={setTip} />
              <div className="bctc-bd__lg">
                {lat.map((l) => {
                  const noi = (
                    <>
                      <i style={{ background: l.mau }} />
                      <span className="bctc-bd__ten" title={l.ten}>{l.ten}</span>
                      <span className="p">{`${(Math.round((1000 * l.cong) / tongCc) / 10).toLocaleString("vi-VN")}%`}</span>
                      <span className="n">{soVN(l.cong)}</span>
                    </>
                  );
                  const d = l.dong;
                  return d ? (
                    <button key={l.ten} type="button" className="bctc-bd__lg-r" onClick={() => onMo(d)}
                      aria-label={`Xem phiếu của ${l.ten}`}>{noi}</button>
                  ) : (
                    <div key={l.ten} className="bctc-bd__lg-r">{noi}</div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="bctc-bd__khoi" aria-label="Thu so với chi">
          <div className="bctc-bd__dau">
            <span className="bctc-bd__tieu">Thu so với chi</span>
            <span className="bctc-bd__ph">bấm cột để xem tháng đó ở dạng bảng</span>
            <span className="bctc-bd__sp" />
            <ChuGiai thu={coThu} chi={coChi} />
          </div>
          <KhungThang h={220} diem={diem} gia={gia}>
            {({ y, xGiua, cw }) => {
              const loai = ([[coThu, "thu", MAU_THU, "Thu"], [coChi, "chi", MAU_CHI, "Chi"]] as const).filter((x) => x[0]);
              const bw = Math.min(46, (cw * 0.62) / Math.max(1, loai.length));
              return diem.flatMap((d, i) => loai.map(([, k, mau, ten], j) => {
                const v = d[k];
                const x = xGiua(i) - (bw * loai.length) / 2 + bw * j + 1;
                return (
                  <rect key={`${i}${k}`} x={x} y={y(Math.max(0, v))} width={bw - 2}
                    height={Math.max(Math.abs(y(v) - y(0)), v ? 1 : 0)} rx={2} fill={mau} className="bam"
                    onClick={() => onThang(d.khoa)}
                    onMouseMove={(e) => hienTip(e, `${ten}, ${d.nhan}`, `${soVN(v)} đ`)}
                    onMouseLeave={() => setTip(null)} />
                );
              }));
            }}
          </KhungThang>
        </section>
      </div>

      {tip && (
        <div className="bctc-bd__tip" style={{ left: tip.x + 14, top: tip.y + 12 }} role="tooltip">
          {tip.dong1}<br />{tip.dong2}
        </div>
      )}
    </div>
  );
}
