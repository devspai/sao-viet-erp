// XẾP LỊCH — LƯỚI phương án A cải tiến (mockup `docs/mockups/xep-lich-A-cai-tien.html` mục 1–7).
//
// Không còn cột nhãn trái: tên lệnh nằm NGAY TRÊN thanh, ngày xong ghi cạnh tên, hạn là hình thoi
// trên dòng. Trục ngày đọc Lịch làm việc (lễ, làm bù). Lệnh dính nhau (cụm 5b) đứng chung dưới một
// hàng tiêu đề cụm, bước chờ lệnh khác tô sọc vàng, đường chấm nối hai bước. Kéo thanh thì hai đầu
// hiện giờ bắt đầu / giờ xong do MÁY CHỦ tính (đường `thu`), thả xong mới ghi.
import {
  AlertCircle, Building2, CalendarDays, Clock, Layers, Link2, Package, PlayCircle, Printer,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type { XlCum, XlDong, XlNgayDacBiet, XlNoi, XlThe, XlVatTu } from "../api/client";
import {
  congPhut, gioChu, khungBao, khungDaVaoViec, khoiThucTe, kieuNgay, mocHan, moc, mocNgay, pxSangGio,
  quangDongHo, soNgayDu, soNgayTre, THU, themNgay, thuNgayGio, veDen, veTu, x, ymd,
  type KieuNgay,
} from "./xlShared";

const NGAY_MS = 86_400_000;
/** Bề rộng tối thiểu một ngày — hẹp hơn thì lưới cuộn ngang thay vì bóp chữ. */
const NGAY_MIN = 40;
const CUM_H = 34;
const DEM = 6; // đệm trên của vùng dòng

export interface HienThi {
  thoang: boolean;
  khach: boolean;
  may: boolean;
  sl: boolean;
  gioChay: boolean;
  soTo: boolean;
  hienXong: boolean;
  vatTu: boolean;
}

export type ThuKetQua = { bat_dau: string; ket_thuc: string; da_doi: boolean; cho_phut: number };

/** Biểu tượng trạng thái đầu tên lệnh — đúng ba hình của chân màn. */
export function IconTT({ tt }: { tt: string }) {
  if (tt === "da_phat_hanh") {
    return (
      <svg className="xa-tt" viewBox="0 0 16 16" aria-label="Đã phát hành">
        <circle cx="8" cy="8" r="7" fill="#16a34a" />
        <path d="m5 8.2 2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tt === "da_dong") {
    return (
      <svg className="xa-tt" viewBox="0 0 16 16" aria-label="Đã đóng">
        <circle cx="8" cy="8" r="7" fill="#94a3b8" />
        <path d="m5 8.2 2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="xa-tt" viewBox="0 0 16 16" aria-label="Chưa phát hành">
      <circle cx="8" cy="8" r="6" fill="none" stroke="#2563eb" strokeWidth="1.5" />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="#2563eb" />
    </svg>
  );
}

const lopTT = (tt: string) => (tt === "da_phat_hanh" ? "phat" : tt === "da_dong" ? "dong" : "chua");

function ngayNgan(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** "Xong T4 14/10" — mốc xong ngắn cho nhãn trên thanh. */
function thuNgay(iso: string): { thu: string; ngay: string; gio: string; nam: string } {
  const [y, mo, dd] = iso.slice(0, 10).split("-").map(Number);
  return { thu: THU[new Date(y, mo - 1, dd).getDay()], ngay: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, gio: iso.slice(11, 16), nam: iso.slice(0, 4) };
}

type Muc =
  | { loai: "cum"; cum: XlCum; y: number; ds: XlDong[] }
  | { loai: "lane"; d: XlDong; y: number };

type Doi = { lsxId: number; gio: string; luu: boolean };

export function XlLuoi({
  tu, soNgay, dong, ngayNghi, ngayDacBiet, cum, vatTu, hien, chonId, suaDuoc, keoTuKhay,
  onChon, onDatMoc, onThu, caPhut, trong,
}: {
  tu: string;
  soNgay: number;
  dong: XlDong[];
  ngayNghi: string[];
  ngayDacBiet: XlNgayDacBiet[];
  cum: XlCum[];
  vatTu: Map<number, XlVatTu>;
  hien: HienThi;
  chonId: number | null;
  suaDuoc: boolean;
  keoTuKhay: XlThe | null;
  onChon(lsxId: number): void;
  onDatMoc(lsxId: number, gio: string, expected: string | null): Promise<void> | void;
  onThu(lsxId: number, gio: string, signal: AbortSignal): Promise<ThuKetQua>;
  /** Một ca (phút) — Shift + mũi tên dời đúng một ca. */
  caPhut: number;
  /** Câu khi lưới trống — màn đang lọc thì nói "không khớp bộ lọc" thay câu mặc định. */
  trong?: ReactNode;
}) {
  const ngoaiRef = useRef<HTMLDivElement>(null);
  const trongRef = useRef<HTMLDivElement>(null);
  const [beNgang, setBeNgang] = useState(1000);
  useLayoutEffect(() => {
    const el = ngoaiRef.current;
    if (!el) return;
    const do_ = () => setBeNgang(el.clientWidth);
    do_();
    const ro = new ResizeObserver(do_);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const canhLe = beNgang <= 640 ? 32 : 48;
  const W = Math.max(beNgang - canhLe, soNgay * NGAY_MIN);
  const ngayW = W / soNgay;
  const laneH = hien.thoang ? 104 : 80;

  const ngays = useMemo(() => Array.from({ length: soNgay }, (_, i) => themNgay(tu, i)), [tu, soNgay]);
  const nghi = useMemo(() => new Set(ngayNghi), [ngayNghi]);
  const dac = useMemo(() => new Map(ngayDacBiet.map((n) => [n.ngay, n])), [ngayDacBiet]);
  const kieu = useMemo(() => ngays.map((d) => kieuNgay(d, nghi, dac)), [ngays, nghi, dac]);
  const coDac = kieu.some((k) => k === "le" || k === "khac" || k === "bu");
  const rongDac = ngayW >= 96;
  const t0 = mocNgay(tu);
  const pxMs = useCallback((ms: number) => ((ms - t0) / NGAY_MS) * ngayW, [t0, ngayW]);
  const px = useCallback((iso: string | null | undefined) => x(iso, tu, ngayW), [tu, ngayW]);

  // Thẻ nổi đặt theo toạ độ MÀN HÌNH (position: fixed): đặt tuyệt đối trong khung lưới thì bị khung
  // cuộn ngang cắt mất và đẻ thêm thanh cuộn dọc. Đọc vị trí khung lúc vẽ — thẻ chỉ hiện khi rê chuột.
  const noi = (trai: number, tren: number, rong: number): CSSProperties => {
    const g = trongRef.current?.getBoundingClientRect();
    const l = (g?.left ?? 0) + trai;
    return { position: "fixed", left: Math.max(8, Math.min(l, window.innerWidth - rong - 8)), top: (g?.top ?? 0) + tren };
  };

  // ------------------------------------------------------------ bố cục dòng
  const { muc, yCua, cao } = useMemo(() => {
    const ds = dong
      .filter((d) => hien.hienXong || d.trang_thai !== "da_dong")
      .sort((a, b) => (moc(veTu(a)) ?? 0) - (moc(veTu(b)) ?? 0));
    const cumMap = new Map(cum.map((c) => [c.id, c]));
    const ra: Muc[] = [];
    const daCum = new Set<number>();
    const yMap = new Map<number, number>();
    let y = DEM;
    for (const d of ds) {
      const c = d.cum_id != null ? cumMap.get(d.cum_id) : undefined;
      if (c) {
        if (daCum.has(c.id)) continue;
        daCum.add(c.id);
        const thanh = ds.filter((z) => z.cum_id === c.id);
        ra.push({ loai: "cum", cum: c, y, ds: thanh });
        y += CUM_H;
        for (const z of thanh) {
          ra.push({ loai: "lane", d: z, y });
          yMap.set(z.lsx_id, y);
          y += laneH;
        }
      } else {
        ra.push({ loai: "lane", d, y });
        yMap.set(d.lsx_id, y);
        y += laneH;
      }
    }
    return { muc: ra, yCua: yMap, cao: y + 10 };
  }, [dong, cum, hien.hienXong, laneH]);

  // ------------------------------------------------------------ bề rộng nhãn trên thanh
  // Nhãn (mã, tên, vật tư, "Xong …", cảnh báo) dài hơn chỗ trống bên phải thanh thì bị khay che mất
  // đúng phần quan trọng nhất (giờ xong, trễ). Đo thật rồi mới chọn neo trái / neo phải / dồn mép.
  const tenEl = useRef(new Map<string, HTMLDivElement>());
  const [rongTen, setRongTen] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const moi: Record<string, number> = {};
    let khac = false;
    tenEl.current.forEach((el, id) => {
      moi[id] = el.scrollWidth;
      if (rongTen[id] !== moi[id]) khac = true;
    });
    if (khac || Object.keys(moi).length !== Object.keys(rongTen).length) setRongTen(moi);
  });

  // ------------------------------------------------------------ kéo / dời bằng phím
  const [doi, setDoi] = useState<Doi | null>(null);
  const doiRef = useRef(doi);
  doiRef.current = doi;
  const keoRef = useRef<{ lsxId: number; lech: number; batX: number; diChuyen: boolean } | null>(null);
  const vuaKeo = useRef(false);
  const [thu, setThu] = useState<{ lsxId: number; gio: string; kq: ThuKetQua } | null>(null);
  const [tha, setTha] = useState<{ gio: string; xPx: number; yPx: number } | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [peekId, setPeekId] = useState<number | null>(null);
  const ganRef = useRef<number | null>(null);
  const hengio = useRef<number | null>(null);
  const hengPeek = useRef<number | null>(null);
  const onThuRef = useRef(onThu);
  onThuRef.current = onThu;
  const dongRef = useRef(dong);
  dongRef.current = dong;

  const xTrong = (clientX: number) => clientX - (trongRef.current?.getBoundingClientRect().left ?? 0);

  const ghi = useCallback((lsxId: number, gio: string) => {
    const d = dongRef.current.find((r) => r.lsx_id === lsxId);
    if (!d || gio.slice(0, 16) === (d.bat_dau_at ?? "").slice(0, 16)) {
      setDoi(null);
      return;
    }
    setDoi({ lsxId, gio, luu: true });
    Promise.resolve(onDatMoc(lsxId, gio, d.updated_at)).finally(() => setDoi(null));
  }, [onDatMoc]);

  const keoDuoc = (d: XlDong) => suaDuoc && d.trang_thai !== "da_dong" && !!d.bat_dau_at;

  const batDauKeo = (e: ReactPointerEvent<HTMLDivElement>, d: XlDong, trai: number) => {
    if (e.button !== 0) return;
    ganRef.current = d.lsx_id;
    if (!keoDuoc(d)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const xi = xTrong(e.clientX);
    keoRef.current = { lsxId: d.lsx_id, lech: xi - trai, batX: xi, diChuyen: false };
  };
  const dangKeo = (e: ReactPointerEvent<HTMLDivElement>) => {
    const k = keoRef.current;
    if (!k) return;
    const xi = xTrong(e.clientX);
    if (!k.diChuyen && Math.abs(xi - k.batX) < 4) return;
    k.diChuyen = true;
    setPeekId(null);
    const trai = Math.max(-ngayW, Math.min(W - 4, xi - k.lech));
    setDoi({ lsxId: k.lsxId, gio: pxSangGio(trai, tu, 15, ngayW), luu: false });
  };
  const thaKeo = (d: XlDong) => {
    const k = keoRef.current;
    keoRef.current = null;
    if (!k || !k.diChuyen) return;
    vuaKeo.current = true;
    window.setTimeout(() => { vuaKeo.current = false; }, 0);
    const cu = doiRef.current;
    if (cu && cu.lsxId === d.lsx_id && !cu.luu) ghi(d.lsx_id, cu.gio);
  };

  // Mũi tên trái/phải: dời thanh đang rê (hoặc vừa bấm) 15 phút, Shift = một ca. Gom phím, ngừng
  // 0,7 giây mới ghi — bấm năm nhát là MỘT lần ghi, một bước hoàn tác.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const o = document.activeElement;
      if (o instanceof HTMLElement && (o.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(o.tagName))) return;
      if (document.querySelector(".kt-man, .cdlg-overlay, .xa-lp, .xa-hien")) return;
      const id = hoverId ?? ganRef.current;
      const d = id != null ? dongRef.current.find((r) => r.lsx_id === id) : undefined;
      if (!d || !keoDuoc(d)) return;
      e.preventDefault();
      const buoc = (e.shiftKey ? caPhut : 15) * (e.key === "ArrowLeft" ? -1 : 1);
      setPeekId(null);
      const cu = doiRef.current;
      const goc = cu && cu.lsxId === d.lsx_id && !cu.luu ? cu.gio : (d.bat_dau_at as string);
      const gio = congPhut(goc, buoc);
      if (hengio.current) window.clearTimeout(hengio.current);
      hengio.current = window.setTimeout(() => ghi(d.lsx_id, gio), 700);
      doiRef.current = { lsxId: d.lsx_id, gio, luu: false };
      setDoi(doiRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverId, caPhut, ghi, suaDuoc]);

  // Xem trước: hỏi máy chủ giờ bắt đầu / xong của mốc đang kéo (có trễ, bỏ lượt cũ).
  const keoKhayId = keoTuKhay?.lsx_id ?? null;
  const hoi = doi && !doi.luu ? { lsxId: doi.lsxId, gio: doi.gio } : tha && keoKhayId ? { lsxId: keoKhayId, gio: tha.gio } : null;
  const hoiKhoa = hoi ? `${hoi.lsxId}|${hoi.gio}` : "";
  useEffect(() => {
    if (!hoi) return;
    const ac = new AbortController();
    const h = window.setTimeout(() => {
      onThuRef.current(hoi.lsxId, hoi.gio, ac.signal)
        .then((kq) => setThu({ lsxId: hoi.lsxId, gio: hoi.gio, kq }))
        .catch(() => { /* lượt bị huỷ / mạng chập: nhãn giữ "đang tính" */ });
    }, 140);
    return () => { window.clearTimeout(h); ac.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoiKhoa]);
  const kqThu = thu && hoi && thu.lsxId === hoi.lsxId && thu.gio === hoi.gio ? thu.kq : null;

  // Thả từ khay.
  const thaOver = (e: DragEvent<HTMLDivElement>) => {
    if (!suaDuoc || !keoTuKhay) return;
    e.preventDefault();
    const xi = xTrong(e.clientX);
    const box = trongRef.current?.getBoundingClientRect();
    const gio = pxSangGio(Math.max(0, xi), tu, 15, ngayW);
    setTha((cu) => (cu && cu.gio === gio ? cu : { gio, xPx: xi, yPx: e.clientY - (box?.top ?? 0) }));
  };
  const thaVao = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const t = tha;
    setTha(null);
    if (!suaDuoc || !keoTuKhay || !t) return;
    onDatMoc(keoTuKhay.lsx_id, t.gio, null);
  };
  useEffect(() => { if (!keoTuKhay) setTha(null); }, [keoTuKhay]);

  // Rê chuột: thẻ xem nhanh sau một nhịp.
  const vaoThanh = (id: number) => {
    setHoverId(id);
    if (hengPeek.current) window.clearTimeout(hengPeek.current);
    hengPeek.current = window.setTimeout(() => setPeekId(id), 450);
  };
  const raThanh = () => {
    setHoverId(null);
    if (hengPeek.current) window.clearTimeout(hengPeek.current);
    setPeekId(null);
  };

  // ------------------------------------------------------------ trục ngày
  const nowMs = Date.now();
  const nowX = pxMs(nowMs);
  const homNay = ymd(new Date());
  const dichNgay = doi && !doi.luu ? doi.gio.slice(0, 10) : tha ? tha.gio.slice(0, 10) : null;
  const iDich = dichNgay ? ngays.indexOf(dichNgay) : -1;
  const [nghHover, setNghHover] = useState<{ i: number; j: number } | null>(null);

  const doanDac = useMemo(() => {
    const ra: { i: number; j: number; k: KieuNgay }[] = [];
    for (let i = 0; i < soNgay;) {
      const k = kieu[i];
      if (k !== "le" && k !== "khac" && k !== "bu") { i++; continue; }
      let j = i;
      if (!rongDac) while (j + 1 < soNgay && kieu[j + 1] === k) j++;
      ra.push({ i, j, k });
      i = j + 1;
    }
    return ra;
  }, [kieu, soNgay, rongDac]);

  const cot = (i: number, n = 1): CSSProperties => ({ left: i * ngayW, width: n * ngayW });
  const caoTruc = coDac ? (rongDac ? 96 : 80) : 50;

  const truc = (
    <div className={`xa-truc${coDac ? " xa-truc--dac" : ""}`} style={{ height: caoTruc, width: W }}>
      {ngays.map((d, i) => (kieu[i] === "tuan" || kieu[i] === "le" || kieu[i] === "khac") && (
        <div key={`t${d}`} className={`xa-truc__to ${kieu[i] === "tuan" ? "xa-to-tuan" : "xa-to-le"}`} style={cot(i)} />
      ))}
      {ngays.map((d, i) => (i === 0 || d.endsWith("-01")) && (
        <span key={`m${d}`} className="xa-truc__thang" style={{ left: i * ngayW }}>
          Tháng {Number(d.slice(5, 7))}{d.slice(0, 4) !== homNay.slice(0, 4) ? `, ${d.slice(0, 4)}` : ""}
        </span>
      ))}
      {ngays.map((d, i) => {
        const k = kieu[i];
        const lop = [
          "xa-truc__ngay",
          ngayW < 46 ? "xa-truc__ngay--hep" : "",
          k === "tuan" || k === "le" || k === "khac" ? "xa-truc__ngay--nghi" : "",
          k === "le" || k === "khac" ? "xa-truc__ngay--le" : "",
          k === "bu" ? "xa-truc__ngay--bu" : "",
          d === homNay ? "xa-truc__ngay--nay" : "",
          i === iDich ? "xa-truc__ngay--dich" : "",
        ].filter(Boolean).join(" ");
        const t = THU[new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).getDay()];
        return (
          <div key={d} className={lop} style={cot(i)} title={dac.get(d)?.ten ?? undefined}>
            {t} <b>{Number(d.slice(8, 10))}</b>
          </div>
        );
      })}
      {doanDac.map(({ i, j, k }) => {
        const n = j - i + 1;
        const ten = k === "bu" ? "Làm bù" : k === "le" ? "Nghỉ lễ" : "Ngày nghỉ";
        return (
          <div key={`d${i}`} className="xa-truc__dac" style={{ ...cot(i, n), flexDirection: "column", alignItems: "center", gap: 3, padding: "0 4px", textAlign: "center", fontSize: 11.5, lineHeight: 1.3, color: "var(--xa-chu-2)" }}
            onMouseEnter={() => setNghHover({ i, j })} onMouseLeave={() => setNghHover(null)}>
            <span className={`xa-cl xa-cl--${k}`}>{ten}{n > 1 ? ` ${n} ngày` : ""}</span>
            {rongDac && dac.get(ngays[i])?.ten && <span>{dac.get(ngays[i])?.ten}</span>}
          </div>
        );
      })}
    </div>
  );

  // Thẻ nổi của ngày đặc biệt: tên, kiểu, lệnh nào chạy qua.
  let theNgh: ReactNode = null;
  if (nghHover) {
    const { i, j } = nghHover;
    const k = kieu[i];
    const a = mocNgay(ngays[i]);
    const b = mocNgay(ngays[j]) + NGAY_MS;
    const qua = dong.filter((d) => (moc(veTu(d)) ?? Infinity) < b && (moc(veDen(d)) ?? -Infinity) > a);
    const ngayChu = (s: string) => `${THU[new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getDay()]} ${ngayNgan(s)}/${s.slice(0, 4)}`;
    theNgh = (
      <div className="xa-ngh" style={noi(i * ngayW + 4, caoTruc - 4, 300)}>
        <div className="xa-ngh__dau">
          <span className={`xa-cl xa-cl--${k}`}>{k === "bu" ? "Làm bù" : k === "le" ? "Nghỉ lễ" : "Ngày nghỉ"}</span>
          <span className="xa-mo">{i === j ? ngayChu(ngays[i]) : `${ngayChu(ngays[i])} đến ${ngayChu(ngays[j])}`}</span>
        </div>
        {ngays.slice(i, j + 1).map((d) => dac.get(d)?.ten).filter(Boolean).map((t, z) => (
          <p key={z} className="xa-ngh__ten">{t}</p>
        ))}
        <div className="xa-ngh__dong">
          <Printer size={15} />
          <span>{k === "bu" ? "Ngày nghỉ nhưng xưởng đi làm, lịch chạy như ngày thường." : "Xưởng không chạy cả ngày, lệnh dừng lại rồi chạy tiếp ca kế tiếp."}</span>
        </div>
        {qua.length > 0 && (
          <div className="xa-ngh__dong">
            <PlayCircle size={15} />
            <span>{qua.length} lệnh chạy qua
              <span className="xa-ngh__ds">{qua.slice(0, 8).map((d) => <span key={d.lsx_id} className="xa-nho">{d.ma}</span>)}</span>
            </span>
          </div>
        )}
        <div className="xa-ngh__chan">Ngày lễ và làm bù lấy từ màn Lịch làm việc</div>
      </div>
    );
  }

  // ------------------------------------------------------------ một dòng lệnh
  const veLane = (d: XlDong, y: number) => {
    const dangDoi = doi?.lsxId === d.lsx_id ? doi : null;
    const kq = dangDoi && !dangDoi.luu ? kqThu : null;
    const tt = lopTT(d.trang_thai);
    const vt = hien.vatTu ? vatTu.get(d.lsx_id) : undefined;
    const ketThuc = veDen(d);
    const ktMs = moc(ketThuc);
    const tre = soNgayTre(d);
    const hanMs = mocHan(d);
    const hanX = hanMs !== null ? pxMs(hanMs) : null;
    const khung = khungBao(d, tu, W, ngayW);
    const daViec = khungDaVaoViec(d, tu, W, ngayW);
    const a0 = px(veTu(d));
    const b0 = px(ketThuc);
    const nhin = khung ?? (daViec ? { trai: daViec.trai, rong: daViec.rong, tranTrai: false, tranPhai: false } : null);

    // Thanh lúc đang dời: mép trái theo mốc thử (đã trượt nếu máy chủ trả), mép phải theo giờ xong
    // máy chủ tính; chưa có thì giữ nguyên bề dài cũ.
    let doiKhung: { trai: number; phai: number } | null = null;
    if (dangDoi) {
      const t = px(kq?.bat_dau ?? dangDoi.gio) ?? 0;
      const rongCu = khung ? khung.rong : 40;
      const p = kq ? (px(kq.ket_thuc) ?? t + rongCu) : t + rongCu;
      doiKhung = { trai: t, phai: Math.max(t + 6, p) };
    }

    const lop = `xa-lane${hien.thoang ? " xa-lane--thoang" : ""}`;
    const coXong = !!ketThuc && !dangDoi;
    const cat = b0 !== null && b0 > W;
    const catTrai = a0 !== null && a0 < 0;
    const xongChu = coXong && ktMs !== null ? (() => {
      const k = thuNgay(ketThuc as string);
      return (
        <span className="xa-ten__xong">Xong {k.thu} {k.ngay}{k.nam !== homNay.slice(0, 4) ? `/${k.nam}` : ""}
          {cat ? " ›" : <> <span className="xa-gio">{k.gio}</span></>}
        </span>
      );
    })() : null;

    // Chữ cảnh báo: trễ (đỏ) > chờ lệnh khác (vàng) > có thể muộn (vàng).
    const canh: ReactNode[] = [];
    if (!dangDoi && tre > 0) {
      canh.push(<span key="tre" className="xa-canh xa-chu-do"><AlertCircle size={13} />trễ {tre} ngày{d.han_hoan_thanh_sx ? "" : " so với hạn giao"}</span>);
    }
    if (!dangDoi && d.cho_phut > 0) {
      const dai = [...d.cho].sort((p, q) => (moc(q.den)! - moc(q.tu)!) - (moc(p.den)! - moc(p.tu)!))[0];
      const l = dai ? d.lien.find((z) => z.cong_doan_id === dai.cong_doan_id && z.loai !== "doi") : undefined;
      const ai = l ? (l.loai === "chung" ? "in chung" : l.ma_khac) : "lệnh khác";
      canh.push(<span key="cho" className="xa-canh xa-chu-vang"><Clock size={13} />chờ {ai} {quangDongHo(d.cho_phut)}</span>);
    }
    if (!dangDoi && tre === 0 && d.so_buoc_chua_gio > 0) {
      canh.push(
        <span key="muon" className="xa-canh xa-chu-vang" title={d.ghi_chu.filter((g) => g.startsWith("Bước")).join("\n")}>
          <AlertCircle size={13} />có thể muộn hơn
        </span>,
      );
    }

    const baseL = nhin ? (daViec ? Math.min(daViec.trai, nhin.trai) : nhin.trai) : 0;
    const baseR = nhin ? nhin.trai + nhin.rong : 0;
    // Nhãn lọt bên phải mép đầu thanh thì neo trái; không lọt thì neo vào mép cuối thanh (chữ chạy
    // ngược sang trái); vẫn không lọt thì dồn sát mép phải lưới.
    const rongNhan = rongTen[`n${d.lsx_id}`] ?? 0;
    const tenPhai = !dangDoi && !!nhin && baseL + rongNhan > W && baseL > 0;
    const tenStyle: CSSProperties = dangDoi && doiKhung
      ? { left: Math.max(0, Math.min(doiKhung.trai, W - rongNhan)) }
      : !tenPhai
        ? { left: Math.max(0, baseL) }
        : baseR - rongNhan >= 0
          ? { right: Math.max(0, W - baseR) }
          : { left: Math.max(0, W - rongNhan) };

    // Phần chạy: cắt ở hạn khi trễ (đuôi đỏ đứng riêng).
    const coTre = !dangDoi && tre > 0 && khung && hanX !== null && hanX > khung.trai && hanX < khung.trai + khung.rong;
    const duoi = khung ? (coTre ? (hanX as number) : khung.trai + khung.rong) : 0;
    const rel = (iso: string) => (px(iso) ?? 0) - (khung?.trai ?? 0);

    return (
      <div key={d.lsx_id} className={lop} style={{ position: "absolute", left: 0, top: y, width: W }}>
        <div className={`xa-ten${tenPhai ? " xa-ten--phai" : ""}`} style={{ ...tenStyle, maxWidth: W }}
          ref={(el) => { if (el) tenEl.current.set(`n${d.lsx_id}`, el); else tenEl.current.delete(`n${d.lsx_id}`); }}
          onClick={() => onChon(d.lsx_id)} onPointerEnter={() => vaoThanh(d.lsx_id)} onPointerLeave={raThanh}>
          {catTrai && !tenPhai && <span className="xa-truoc">‹</span>}
          <IconTT tt={d.trang_thai} />
          <span className="xa-ma">{d.ma}</span><span className="xa-ten__ten">{d.ten}</span>
          {d.is_rush && <span className="xa-gap">Gấp</span>}
          {vt && vt.muc !== "ok" && <span className={`xa-vt xa-vt--co xa-vt--${vt.muc === "do" ? "do" : "vang"}`} title={vt.chu}><Package size={12} />{vt.chu || (vt.muc === "do" ? "Thiếu vật tư" : "Chưa giữ vật tư")}</span>}
          {xongChu}
          {canh}
        </div>

        {daViec && !dangDoi && (
          <div className="xa-daviec" style={{ left: daViec.trai, width: daViec.rong }} title="Đã vào việc, phần này không kéo được">
            {khoiThucTe(d.doan_thuc_te, tu, W, ngayW).map((k, i) => (
              <span key={i} className="xa-daviec__chay" style={{ left: k.trai - daViec.trai, width: k.rong }} />
            ))}
          </div>
        )}

        {(khung || (dangDoi && doiKhung)) && (
          <div
            className={dangDoi && doiKhung ? "xa-thanh xa-thanh--keo" : [
              "xa-thanh", `xa-thanh--${tt}`,
              keoDuoc(d) ? "" : "xa-thanh--khoa",
              chonId === d.lsx_id ? "xa-thanh--chon" : "",
              khung?.tranPhai && !coTre ? "xa-thanh--cat" : "",
              khung?.tranTrai && !daViec ? "xa-thanh--cat-trai" : "",
            ].filter(Boolean).join(" ")}
            style={dangDoi && doiKhung
              ? { left: doiKhung.trai, width: doiKhung.phai - doiKhung.trai }
              : {
                left: khung!.trai, width: Math.max(6, duoi - khung!.trai),
                ...(coTre ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}),
                ...(daViec ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 } : {}),
              }}
            role="button"
            tabIndex={0}
            aria-label={`${d.ma} ${d.ten}`}
            onPointerDown={(e) => khung && batDauKeo(e, d, khung.trai)}
            onPointerMove={dangKeo}
            onPointerUp={() => thaKeo(d)}
            onPointerEnter={() => vaoThanh(d.lsx_id)}
            onPointerLeave={raThanh}
            onClick={() => { if (!vuaKeo.current) onChon(d.lsx_id); }}
            onKeyDown={(e) => { if (e.key === "Enter") onChon(d.lsx_id); }}
          >
            {!dangDoi && khung && d.doan.map((k, i) => {
              const l = Math.max(0, rel(k.tu));
              const r = Math.min(duoi - khung.trai, rel(k.den));
              return r - l >= 1 ? <span key={`c${i}`} className="xa-chay" style={{ left: l, width: r - l }} /> : null;
            })}
            {!dangDoi && khung && d.cho.map((k, i) => {
              const l = Math.max(0, rel(k.tu));
              const r = Math.min(duoi - khung.trai, rel(k.den));
              return r - l >= 1 ? <span key={`w${i}`} className="xa-cho" style={{ left: l, width: r - l }} title={`Chờ lệnh khác ${quangDongHo((moc(k.den)! - moc(k.tu)!) / 60_000)}`} /> : null;
            })}
          </div>
        )}
        {coTre && khung && <div className="xa-tre" style={{ left: hanX as number, width: Math.min(W, khung.trai + khung.rong) - (hanX as number) }} />}

        {!dangDoi && [...new Map(d.lien.filter((l) => l.loai === "chung" && l.bat_dau_nay && l.ket_thuc_nay).map((l) => [l.cong_doan_id, l])).values()].map((l) => {
          const a = px(l.bat_dau_nay);
          const b = px(l.ket_thuc_nay);
          if (a === null || b === null || b < 0 || a > W) return null;
          return <div key={`g${l.cong_doan_id}`} className="xa-chung" style={{ left: a - 3, width: b - a + 6 }} />;
        })}

        {([[d.han_hoan_thanh_sx, "Hạn SX", ""], [d.han_giao_khach, "Giao", "giao"]] as const).map(([h, ten, k], idx) => {
          if (!h) return null;
          const hMs = mocNgay(h) + NGAY_MS;
          const hx = pxMs(hMs);
          if (hx <= 0 || hx >= W) return null;
          const ketCuoi = dangDoi && kq ? moc(kq.ket_thuc) : ktMs;
          const vuot = ketCuoi !== null && ketCuoi > hMs && (idx === 0 || !d.han_hoan_thanh_sx);
          const phaiThanh = dangDoi && doiKhung ? doiKhung.phai : b0;
          return (
            <span key={ten}>
              {!vuot && phaiThanh !== null && hx > phaiThanh && <div className="xa-du" style={{ left: phaiThanh, width: hx - phaiThanh }} />}
              <div className={`xa-moc${vuot ? " xa-moc--vuot" : k ? " xa-moc--giao" : ""}`} style={{ left: hx }} />
              <div className={`xa-moc-chu${vuot ? " xa-moc-chu--vuot" : ""}`} style={{ left: hx }}>{ten} {ngayNgan(h)}</div>
            </span>
          );
        })}

        {hien.thoang && !dangDoi && (
          <div className="xa-thong-tin" style={{ left: Math.max(0, Math.min(tenPhai ? baseR - (rongTen[`t${d.lsx_id}`] ?? 0) : baseL, W - (rongTen[`t${d.lsx_id}`] ?? 0))), maxWidth: W }}
            ref={(el) => { if (el) tenEl.current.set(`t${d.lsx_id}`, el); else tenEl.current.delete(`t${d.lsx_id}`); }}>
            {hien.khach && d.customer_name && <span className="xa-nho"><Building2 size={12} />{d.customer_name}</span>}
            {hien.may && d.may_ten && <span className="xa-nho"><Printer size={12} />{d.may_ten}</span>}
            {hien.sl && <span className="xa-nho">{d.so_luong_dat.toLocaleString("vi-VN")} {d.don_vi_tinh ?? ""}</span>}
            {hien.gioChay && <span className="xa-nho">Máy chạy {gioChu(d.chay_phut)}</span>}
            {hien.soTo && d.so_to_ke_hoach > 0 && <span className="xa-nho">{d.so_to_ke_hoach.toLocaleString("vi-VN")} tờ in</span>}
          </div>
        )}

        {dangDoi && doiKhung && (() => {
          const batChu = thuNgayGio(kq?.bat_dau ?? dangDoi.gio);
          const ngayTha = dangDoi.gio.slice(0, 10);
          const kTha = kieu[ngays.indexOf(ngayTha)];
          const nghiTha = kq?.da_doi && (kTha === "tuan" || kTha === "le" || kTha === "khac");
          const thuTha = THU[new Date(+ngayTha.slice(0, 4), +ngayTha.slice(5, 7) - 1, +ngayTha.slice(8, 10)).getDay()];
          const han = d.han_hoan_thanh_sx ?? d.han_giao_khach;
          const du = kq ? soNgayDu(kq.ket_thuc, han) : null;
          const hx = han ? pxMs(mocNgay(han) + NGAY_MS) : null;
          return (
            <>
              <div className="xa-nk xa-nk--trai" style={{ right: W - doiKhung.trai + 8, top: 36 }}>
                {kq?.da_doi && <span className="xa-vt xa-vt--nghi"><AlertCircle size={12} />{nghiTha ? `${thuTha} nghỉ` : "ngoài ca"}, tự sang ca kế tiếp</span>}
                {batChu}
              </div>
              <div className="xa-nk" style={{ left: doiKhung.phai + 8, top: 36 }}>
                {kq ? `xong ${thuNgayGio(kq.ket_thuc)}` : "đang tính…"}
                {kq && kq.cho_phut > 0 && <span className="xa-vt xa-vt--nghi"><Clock size={12} />chờ lệnh khác {quangDongHo(kq.cho_phut)}</span>}
              </div>
              {du !== null && (
                <span className={`xa-vt ${du >= 0 ? "xa-vt--du" : "xa-vt--tre"} xa-du-chip`}
                  style={{ left: hx !== null && hx > doiKhung.phai && hx < W ? (doiKhung.phai + hx) / 2 : doiKhung.phai + 40, top: 62 }}>
                  {du >= 0 ? `dư ${du} ngày` : `trễ ${-du} ngày`}
                </span>
              )}
            </>
          );
        })()}
      </div>
    );
  };

  // ------------------------------------------------------------ hàng cụm
  const veCum = (c: XlCum, y: number, ds: XlDong[]) => {
    const chuaXep = c.lsx.filter((z) => !z.co_lich).length;
    const chung = ds.flatMap((d) => d.lien.filter((l) => l.loai === "chung" && l.luc_nay && l.luc_khac));
    const lech = chung.reduce((m, l) => Math.max(m, Math.abs((moc(l.luc_nay) ?? 0) - (moc(l.luc_khac) ?? 0))), 0);
    return (
      <div key={`cum${c.id}`} className="xa-cum-dau" style={{ position: "absolute", left: 0, top: y, width: W }}>
        {c.bai_ghep_ma.length ? <Layers size={15} /> : <Link2 size={15} />}
        <span className="xa-ten-cum">{c.ten}</span>
        <span className="xa-nho">{c.lsx.length} lệnh{c.phu ? ` ${c.phu}` : ""}</span>
        <span className="xa-nho xa-nho--tim">phát hành cùng nhau</span>
        {chuaXep > 0 && <span className="xa-nho xa-nho--vang">{chuaXep} lệnh chưa xếp lịch</span>}
        {[...new Map(ds.flatMap((d) => d.lien.filter((l) => l.loai === "cho").map((l) => [`${d.lsx_id}-${l.thu_tu}-${l.lsx_id_khac}-${l.thu_tu_khac}`, { d, l }]))).values()].map(({ d, l }) => (
          <span key={`${d.lsx_id}-${l.cong_doan_id}-${l.cong_doan_id_khac}`} className="xa-nho xa-nho--xanh" title={`${d.ma} bước ${l.thu_tu} ${l.ten_buoc} chỉ bắt đầu khi ${l.ma_khac} xong bước ${l.thu_tu_khac} ${l.ten_buoc_khac}`}>
            <Link2 size={12} />{d.ma} bước {l.thu_tu} chờ {l.ma_khac} bước {l.thu_tu_khac}
          </span>
        ))}
        {chung.length > 0 && (lech > 60_000
          ? <span className="xa-canh xa-chu-vang"><AlertCircle size={13} />các lệnh đang in lệch nhau {quangDongHo(lech / 60_000)}</span>
          : <span className="xa-canh" style={{ color: "#6d28d9" }}><Layers size={13} />in chung một lượt {thuNgayGio(chung[0].luc_nay)}</span>)}
      </div>
    );
  };

  // ------------------------------------------------------------ đường nối
  const duongNoi: ReactNode[] = [];
  const theMep: ReactNode[] = [];
  const kep = (v: number) => Math.max(0, Math.min(W, v));
  for (const m of muc) {
    if (m.loai !== "lane" || doi?.lsxId === m.d.lsx_id) continue;
    const yN = m.y + 47;
    m.d.lien.forEach((l: XlNoi, i) => {
      const yK0 = yCua.get(l.lsx_id_khac);
      if (yK0 === undefined || doi?.lsxId === l.lsx_id_khac || !l.luc_nay || !l.luc_khac) return;
      const yK = yK0 + 47;
      const xN0 = px(l.luc_nay) ?? 0;
      const xK0 = px(l.luc_khac) ?? 0;
      if (l.loai === "cho") {
        const sai = (moc(l.luc_khac) ?? 0) > (moc(l.luc_nay) ?? 0) + 60_000;
        const mau = sai ? "#dc2626" : "#3b82f6";
        if ((xN0 < 0 && xK0 < 0) || (xN0 > W && xK0 > W)) return;
        // Một đầu rơi ngoài khoảng đang xem: đường vẫn vẽ tới mép lưới, mép đó ghi bước + giờ của đầu bị khuất.
        const xN = kep(xN0);
        const xK = kep(xK0);
        const ngoai = (x0: number, y: number, chu: string, k: string) => {
          if (x0 >= 0 && x0 <= W) return;
          theMep.push(
            <span key={k} className={`xa-noi-mep${sai ? " xa-noi-mep--do" : ""}`}
              style={x0 > W ? { right: 0, top: y + 14 } : { left: 0, top: y + 14 }}>{x0 < 0 && "‹ "}{chu}{x0 > W && " ›"}</span>,
          );
        };
        ngoai(xN0, yN, `bước ${l.thu_tu} vào lúc ${thuNgayGio(l.luc_nay)}`, `mn${m.d.lsx_id}-${i}`);
        ngoai(xK0, yK, `bước ${l.thu_tu_khac} xong lúc ${thuNgayGio(l.luc_khac)}`, `mk${m.d.lsx_id}-${i}`);
        duongNoi.push(
          <g key={`${m.d.lsx_id}-${i}`}>
            <path d={`M${xK} ${yK} C${xK + 30} ${yK}, ${xN - 30} ${yN}, ${xN} ${yN}`} fill="none" stroke={mau} strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
            {xK0 >= 0 && xK0 <= W && <circle cx={xK} cy={yK} r="3" fill="#fff" stroke={mau} strokeWidth="1.5" />}
            {xN0 >= 0 && xN0 <= W && <circle cx={xN} cy={yN} r="3.5" fill={mau} />}
          </g>,
        );
      } else if (l.loai === "chung" && m.d.lsx_id < l.lsx_id_khac) {
        const [x1, y1, x2, y2] = yN < yK ? [kep(xN0), yN + 14, kep(xK0), yK - 14] : [kep(xK0), yK + 14, kep(xN0), yN - 14];
        duongNoi.push(
          <path key={`${m.d.lsx_id}-${i}`} d={`M${x1} ${y1} L${x2} ${y2}`} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />,
        );
      }
    });
  }

  // ------------------------------------------------------------ thẻ xem nhanh
  let peek: ReactNode = null;
  const pd = peekId != null && !doi ? dong.find((d) => d.lsx_id === peekId) : undefined;
  const pY = pd ? yCua.get(pd.lsx_id) : undefined;
  if (pd && pY !== undefined) {
    const k = khungBao(pd, tu, W, ngayW);
    const vt = vatTu.get(pd.lsx_id);
    peek = (
      <div className="xa-peek" style={noi((k?.trai ?? 0) + 40, pY + 66, 330)}>
        <div className="xa-peek__dau"><span className="xa-ma">{pd.ma}</span>{pd.ten}</div>
        <div className="xa-peek__dong"><Building2 size={14} /><span>{pd.customer_name ?? "Chưa gắn khách"}</span></div>
        <div className="xa-peek__dong"><Printer size={14} /><span>{pd.may_ten ?? "Chưa gán máy"}</span></div>
        <div className="xa-peek__dong"><Package size={14} />
          <span>{pd.so_luong_dat.toLocaleString("vi-VN")} {pd.don_vi_tinh ?? ""}
            {vt && vt.muc !== "ok" && <span className={`xa-vt xa-vt--${vt.muc === "do" ? "do" : "vang"}`}>{vt.chu}</span>}
          </span>
        </div>
        <div className="xa-peek__dong"><PlayCircle size={14} /><span>Máy chạy {gioChu(pd.chay_phut)}</span></div>
        {pd.ket_thuc && <div className="xa-peek__dong"><CalendarDays size={14} /><span>{thuNgayGio(pd.bat_dau_at)} đến {thuNgayGio(veDen(pd))}</span></div>}
        <div className="xa-peek__chan">Bấm để mở chi tiết<span className="xa-gian" />{keoDuoc(pd) && <><kbd>◀</kbd><kbd>▶</kbd> 15 phút</>}</div>
      </div>
    );
  }

  // Bóng thả từ khay: giờ bắt đầu + giờ xong máy chủ tính + hạn.
  let bongTha: ReactNode = null;
  if (tha && keoTuKhay) {
    const han = keoTuKhay.han_hoan_thanh_sx ?? keoTuKhay.han_giao_khach;
    const du = kqThu ? soNgayDu(kqThu.ket_thuc, han) : null;
    bongTha = (
      <div className="xa-bong-tha" style={{ left: Math.min(tha.xPx + 14, W - 260), top: tha.yPx + 14 }}>
        <div>{keoTuKhay.ma}</div>
        {kqThu?.da_doi && <div className="xa-nghi-chu">Ngoài giờ chạy, tự sang ca kế tiếp</div>}
        <div><span className="xa-mo">Bắt đầu</span> {thuNgayGio(kqThu?.bat_dau ?? tha.gio)}</div>
        <div><span className="xa-mo">Dự kiến xong</span> {kqThu ? thuNgayGio(kqThu.ket_thuc) : "đang tính…"}</div>
        {han && du !== null && <div><span className="xa-mo">Hạn {ngayNgan(han)}</span> {du >= 0 ? `dư ${du} ngày` : `trễ ${-du} ngày`}</div>}
      </div>
    );
  }

  return (
    <div className="xa-luoi" ref={ngoaiRef}>
      <div className="xa-luoi__trong" ref={trongRef} style={{ width: W }}>
        {truc}
        {theNgh}
        <div className="xa-vung" style={{ height: Math.max(cao, 220) }}
          onDragOver={thaOver} onDrop={thaVao} onDragLeave={(e) => { if (e.currentTarget === e.target) setTha(null); }}>
          <div className="xa-nen">
            {ngays.map((d, i) => (kieu[i] === "tuan" || kieu[i] === "le" || kieu[i] === "khac") && (
              <div key={`n${d}`} className={kieu[i] === "tuan" ? "xa-to-tuan" : "xa-to-le"} style={cot(i)} />
            ))}
            {ngays.map((d, i) => i > 0 && (
              <div key={`k${d}`} className={`xa-ke${new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).getDay() === 1 ? " xa-ke--tuan" : ""}`} style={{ left: i * ngayW }} />
            ))}
            {iDich >= 0 && <div className="xa-dich" style={cot(iDich)} />}
            {nowX >= 0 && nowX <= W && <div className="xa-nay" style={{ left: nowX }} />}
          </div>
          {muc.length === 0 && (
            <div className="xa-trong">
              {keoTuKhay ? "Thả lệnh vào ngày muốn bắt đầu." : (trong ?? "Không có lệnh nào chạy trong khoảng này.")}
            </div>
          )}
          <svg className="xa-noi-svg xa-noi-svg--tren" width={W} height={Math.max(cao, 220)}>{duongNoi}</svg>
          {theMep}
          {muc.map((m) => (m.loai === "cum" ? veCum(m.cum, m.y, m.ds) : veLane(m.d, m.y)))}
          {peek}
          {bongTha}
        </div>
      </div>
    </div>
  );
}
