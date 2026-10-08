import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, Repeat, X } from "lucide-react";
import { api, ApiError, type CareOccurrence, type LichHenDong } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { useCan } from "../auth/permissions";
import { ChonGio, ChonNgay } from "../components/ChonNgay";
import { congNgay, homNayVN, ngayCuaMoc, soNgay } from "./khachHangSo";
import "./care-calendar.css";

/* Lịch hẹn chăm sóc kiểu Google Calendar (05/10/2026). Một thứ duy nhất là HẸN: nội dung, ngày giờ,
 * người phụ trách, có lặp hay không. Tick tròn = xong (bấm lại = mở lại). Ba dạng nhìn: sắp tới,
 * trễ (giờ đỏ), xong (gạch ngang). Kết quả ghi vào ô ghi chú của hẹn — không có nhật ký riêng.
 * Mọi ngày giờ hiển thị theo giờ Việt Nam, không theo múi giờ của máy đang mở. */

const WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const THU_NGAN = ["CN", "Th 2", "Th 3", "Th 4", "Th 5", "Th 6", "Th 7"];
const THU_DAI = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const GIO_VN = 7 * 3_600_000;

/** Giờ "HH:MM" theo giờ VN của một mốc máy chủ trả về. */
function gioCuaMoc(moc: string): string {
  return new Date(new Date(moc).getTime() + GIO_VN).toISOString().slice(11, 16);
}
/** Tới giờ của hẹn ĐANG MỞ gần nhất trong danh sách thì gọi `nap` — để hẹn chuyển sang "trễ" đúng
 *  giờ với MỌI người đang xem. Máy chủ chỉ đẩy `care_due` cho người phụ trách, người xem "Cả nhóm"
 *  hay hồ sơ khách của người khác không nhận tin đó. */
function useNapKhiToiGio(items: readonly CareOccurrence[] | null | undefined, nap: () => void) {
  useEffect(() => {
    if (!items) return;
    const now = Date.now();
    let gan = Infinity;
    for (const o of items) {
      if (o.status !== "open") continue;
      const t = new Date(o.due_date).getTime();
      if (t > now && t < gan) gan = t;
    }
    // Quá 1 ngày thì thôi hẹn giờ — sang ngày mới đằng nào màn cũng nạp lại theo sự kiện khác.
    if (!Number.isFinite(gan) || gan - now > 86_400_000) return;
    const h = window.setTimeout(nap, gan - now + 1_000);
    return () => window.clearTimeout(h);
  }, [items, nap]);
}
/** Ngày + giờ VN → mốc ISO gửi máy chủ. */
function mocVN(ngay: string, gio: string): string {
  return new Date(`${ngay}T${gio || "09:00"}:00+07:00`).toISOString();
}
function thuCua(ngay: string): number {
  return new Date(`${ngay}T00:00:00Z`).getUTCDay();
}
function ngayDai(ngay: string): string {
  const [y, m, d] = ngay.split("-").map(Number);
  return `${THU_DAI[thuCua(ngay)]}, ${d} tháng ${m}${y !== Number(homNayVN().slice(0, 4)) ? ` năm ${y}` : ""}`;
}
const laLap = (o: CareOccurrence) => o.repeat_freq !== "none" || o.series_id != null;
const tenLap = (f: string) => (f === "day" ? "ngày" : f === "week" ? "tuần" : "tháng");

/** Mã đầu chuỗi để thao tác một lần hẹn: lần của chuỗi lặp đi qua đầu chuỗi, hẹn lẻ là chính nó. */
function maThaoTac(o: CareOccurrence): number | null {
  return o.series_id ?? o.task_id;
}

// =============================================================================
// Lịch biểu — chỉ những ngày CÓ hẹn, vạch đỏ chỗ "bây giờ" (Schedule của Google Calendar)
// =============================================================================

interface PropsLichBieu<T extends CareOccurrence> {
  items: T[];
  homNay: string;
  coTheSua: boolean;
  onTick: (o: T) => void;
  onMo?: (o: T, el: HTMLElement) => void;
  /** Phần thêm cuối dòng (tên khách ở bảng Lịch hẹn của danh bạ). */
  phu?: (o: T) => ReactNode;
  trongHomNay?: ReactNode;
}

export function LichBieu<T extends CareOccurrence>({ items, homNay, coTheSua, onTick, onMo, phu, trongHomNay }: PropsLichBieu<T>) {
  const nhom = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const o of items) {
      const k = ngayCuaMoc(o.due_date);
      const ds = m.get(k);
      if (ds) ds.push(o);
      else m.set(k, [o]);
    }
    if (!m.has(homNay)) m.set(homNay, []);
    return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [items, homNay]);
  const bayGio = gioCuaMoc(new Date().toISOString());

  let thangTruoc = "";
  return (
    <div className="lb">
      {nhom.map(([ngay, ds]) => {
        const thang = ngay.slice(0, 7);
        const dauThang = thang !== thangTruoc;
        thangTruoc = thang;
        const laHomNay = ngay === homNay;
        // Vạch "bây giờ" đứng trước hẹn đầu tiên chưa tới giờ trong ngày hôm nay.
        const viTriVach = laHomNay ? ds.findIndex((o) => gioCuaMoc(o.due_date) >= bayGio) : -1;
        const vach = <div className="lb__vach" aria-label="Bây giờ"><i /><span /></div>;
        return (
          <div key={ngay}>
            {dauThang && (
              <div className="lb__thang">Tháng {Number(ngay.slice(5, 7))} năm {ngay.slice(0, 4)}</div>
            )}
            <div className={`lb__ngay${laHomNay ? " lb__ngay--nay" : ""}`} data-ngay={ngay}>
              <div className="lb__so">
                <b>{Number(ngay.slice(8, 10))}</b>
                <span>{THU_NGAN[thuCua(ngay)]}</span>
              </div>
              <div className="lb__ds">
                {ds.length === 0 && laHomNay && (
                  <>
                    {vach}
                    <div className="lb__trong">{trongHomNay ?? "Không có hẹn nào hôm nay"}</div>
                  </>
                )}
                {ds.map((o, i) => (
                  <div key={`${o.task_id ?? "ao"}-${o.series_id ?? ""}-${o.due_date}`}>
                    {i === viTriVach && vach}
                    <div
                      className={`lb__muc${o.status === "done" ? " lb__muc--xong" : ""}${o.tre ? " lb__muc--tre" : ""}${onMo ? " lb__muc--bam" : ""}`}
                      onClick={onMo ? (e) => onMo(o, e.currentTarget) : undefined}
                    >
                      {coTheSua ? (
                        <button
                          type="button"
                          className="lb__tick"
                          aria-label={o.status === "done" ? "Mở lại hẹn" : "Đánh dấu đã xong"}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTick(o);
                          }}
                        />
                      ) : (
                        <span className="lb__tick lb__tick--tinh" aria-hidden="true" />
                      )}
                      <span className="lb__gio">{gioCuaMoc(o.due_date)}</span>
                      <span className="lb__noi">
                        <span className="lb__ten">
                          {o.note}
                          {laLap(o) && <Repeat size={11} className="lb__lap" aria-label="Hẹn lặp" />}
                        </span>
                        {o.ket_qua && <span className="lb__kq">{o.ket_qua}</span>}
                      </span>
                      <span className="lb__phu">
                        {phu?.(o)}
                        {o.assignee_name && <span className="lb__nguoi">{o.assignee_name}</span>}
                      </span>
                    </div>
                  </div>
                ))}
                {laHomNay && ds.length > 0 && viTriVach === -1 && vach}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Lịch hẹn của MỘT khách — tab Chăm sóc trong hồ sơ
// =============================================================================

type CheDo = "lb" | "thang";
const LUI_LICH_BIEU = 90;
const TOI_LICH_BIEU = 60;

export function CareCalendar({ customerId, onChange, moHenTick = 0, eventTick = 0 }: {
  customerId: number;
  onChange?: () => void;
  /** Nút "Hẹn chăm sóc" ở đầu hồ sơ khách: mỗi lần tăng ⇒ mở sẵn ô tạo hẹn ở ngày HÔM NAY. */
  moHenTick?: number;
  /** Nhịp sự kiện nhóm "bán hàng" (người khác giao/sửa hẹn, tới giờ hẹn) — nạp lại, KHÔNG đóng hộp đang mở. */
  eventTick?: number;
}) {
  const { token } = useAuth();
  const canUpdate = useCan()("khach_hang", "update");
  const homNay = homNayVN();

  // Mặc định mở dạng Tháng (05/10/2026) — Lịch biểu vẫn bấm chuyển được.
  const [cheDo, setCheDo] = useState<CheDo>("thang");
  const [ym, setYm] = useState(() => ({ y: Number(homNay.slice(0, 4)), m: Number(homNay.slice(5, 7)) - 1 }));
  const [lui, setLui] = useState(LUI_LICH_BIEU);
  const [toi, setToi] = useState(TOI_LICH_BIEU);
  const [occ, setOcc] = useState<CareOccurrence[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Hộp nổi neo tại phần tử được bấm. taoNgay = đang tạo hẹn ngày đó; sel = đang xem một hẹn.
  const [taoNgay, setTaoNgay] = useState<string | null>(null);
  const [sel, setSel] = useState<CareOccurrence | null>(null);
  const [pop, setPop] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const khungRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const taoRef = useRef<HTMLButtonElement>(null);

  // Form tạo hẹn
  const [fNote, setFNote] = useState("");
  const [fNgay, setFNgay] = useState(homNay);
  const [fGio, setFGio] = useState("09:00");
  const [fLap, setFLap] = useState("none");
  const [fMoi, setFMoi] = useState(1);
  const [fDen, setFDen] = useState("");
  // Hộp xem hẹn
  const [kq, setKq] = useState("");
  const [doiNgay, setDoiNgay] = useState("");
  const [doiGio, setDoiGio] = useState("09:00");

  const { from, to } = useMemo(() => {
    if (cheDo === "lb") return { from: congNgay(homNay, -lui), to: congNgay(homNay, toi) };
    const dau = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-01`;
    const cuoi = new Date(Date.UTC(ym.y, ym.m + 1, 0)).toISOString().slice(0, 10);
    return { from: dau, to: cuoi };
  }, [cheDo, ym, lui, toi, homNay]);

  const load = useCallback(() => {
    if (!token) return;
    api.customers
      .careCalendar(token, customerId, from, to)
      .then((r) => { setOcc(r.items); setErr(null); })
      .catch(() => setErr("Không tải được lịch hẹn."));
  }, [token, customerId, from, to]);

  const dong = useCallback(() => { setTaoNgay(null); setSel(null); setPop(null); }, []);
  useEffect(() => { dong(); load(); }, [load, dong]);
  // load đổi theo khoảng ngày (đã nạp ở effect trên) — chỉ nghe nhịp sự kiện ở đây.
  useEffect(() => {
    if (eventTick) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTick]);
  // Tới giờ một hẹn: nạp lại lịch + báo ra ngoài (dòng Đánh giá, nút "Lịch hẹn" đổi số "đang trễ").
  const napToiGio = useCallback(() => { load(); onChange?.(); }, [load, onChange]);
  useNapKhiToiGio(occ, napToiGio);

  // Neo hộp nổi vào phần tử: mở xuống dưới, hoặc lên trên nếu phần tử ở nửa dưới khung; kẹp mép.
  function neo(el: HTMLElement) {
    const k = khungRef.current;
    if (!k) return;
    const RONG = Math.min(320, k.clientWidth - 8);
    const kr = k.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(r.left - kr.left, k.clientWidth - RONG - 4));
    const y = r.top - kr.top;
    const above = y > k.clientHeight * 0.55 && y > 300;
    setPop({ left, top: above ? y - 6 : y + r.height + 6, above });
  }

  function moTao(ngay: string, el: HTMLElement) {
    setSel(null);
    setTaoNgay(ngay);
    setFNote(""); setFNgay(ngay); setFGio("09:00"); setFLap("none"); setFMoi(1); setFDen("");
    neo(el);
  }
  function moHen(o: CareOccurrence, el: HTMLElement) {
    setTaoNgay(null);
    setSel(o);
    setKq(o.ket_qua ?? "");
    setDoiNgay(ngayCuaMoc(o.due_date));
    setDoiGio(gioCuaMoc(o.due_date));
    neo(el);
  }

  // Nút "Hẹn chăm sóc" ở đầu hồ sơ: mở ô tạo hẹn hôm nay, neo vào nút "Tạo hẹn". Chờ lịch nạp xong
  // (lượt nạp đầu tự đóng mọi hộp nổi).
  const daMoTick = useRef(0);
  useEffect(() => {
    if (!moHenTick || moHenTick === daMoTick.current || occ == null || !canUpdate || !taoRef.current) return;
    daMoTick.current = moHenTick;
    taoRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    moTao(homNay, taoRef.current);
    // moTao chỉ đặt state — không cần vào deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moHenTick, occ, canUpdate, homNay]);

  // Bấm ra ngoài / Esc / đổi kích thước → đóng hộp nổi (đúng cảm giác Google Calendar).
  useEffect(() => {
    if (!taoNgay && !sel) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Element;
      // Lịch nổi của ô ngày/giờ portal ra body — bấm trong đó không tính là bấm ra ngoài.
      if (t.closest?.(".cn-hop")) return;
      if (popRef.current && !popRef.current.contains(t)) dong();
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") dong(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", dong);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", dong);
    };
  }, [taoNgay, sel, dong]);

  async function tao() {
    if (!token || busy || !fNote.trim() || !fNgay) return;
    setBusy(true);
    try {
      await api.customers.addCareTask(token, customerId, {
        note: fNote.trim(),
        due_date: mocVN(fNgay, fGio),
        repeat_freq: fLap,
        repeat_interval: Math.max(1, fMoi),
        repeat_until: fLap !== "none" && fDen ? mocVN(fDen, "23:59") : null,
      });
      dong();
      load();
      onChange?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Tạo hẹn không thành công.");
    } finally { setBusy(false); }
  }

  async function lam(
    o: CareOccurrence,
    action: "complete" | "cancel" | "reschedule" | "ghi",
    them?: { new_due?: string; ket_qua?: string },
  ) {
    const ma = maThaoTac(o);
    if (!token || busy || ma == null) return;
    setBusy(true);
    try {
      const r = await api.customers.actOnOccurrence(token, customerId, ma, from, to, {
        action,
        occurrence_date: o.occurrence_date,
        new_due: them?.new_due ?? null,
        ket_qua: them?.ket_qua,
      });
      setOcc(r.items);
      dong();
      onChange?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Thao tác không thành công.");
    } finally { setBusy(false); }
  }

  async function moLai(o: CareOccurrence) {
    if (!token || busy || o.task_id == null) return;
    setBusy(true);
    try {
      await api.customers.setCareTaskStatus(token, customerId, o.task_id, { status: "open" });
      dong();
      load();
      onChange?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Mở lại không thành công.");
    } finally { setBusy(false); }
  }

  function tick(o: CareOccurrence) {
    if (o.status === "open") lam(o, "complete");
    else if (o.status === "done") moLai(o);
  }

  // ---- Tháng: kéo hẹn sang ô khác để dời (giữ nguyên giờ) ----
  const [thaNgay, setThaNgay] = useState<string | null>(null);
  const keoRef = useRef<CareOccurrence | null>(null);
  function thaVao(ngay: string) {
    const o = keoRef.current;
    keoRef.current = null;
    setThaNgay(null);
    if (!o || ngayCuaMoc(o.due_date) === ngay) return;
    lam(o, "reschedule", { new_due: mocVN(ngay, gioCuaMoc(o.due_date)) });
  }

  const theoNgay = useMemo(() => {
    const m: Record<string, CareOccurrence[]> = {};
    for (const o of occ ?? []) (m[ngayCuaMoc(o.due_date)] ??= []).push(o);
    return m;
  }, [occ]);

  const o7 = useMemo(() => {
    const dau = new Date(Date.UTC(ym.y, ym.m, 1));
    const soNgayThang = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < (dau.getUTCDay() + 6) % 7; i++) out.push(null);
    for (let d = 1; d <= soNgayThang; d++) out.push(`${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    while (out.length % 7) out.push(null);
    return out;
  }, [ym]);

  function doiThang(n: number) {
    dong();
    setYm((s) => {
      const d = new Date(Date.UTC(s.y, s.m + n, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  }
  function veHomNay() {
    dong();
    if (cheDo === "thang") {
      setYm({ y: Number(homNay.slice(0, 4)), m: Number(homNay.slice(5, 7)) - 1 });
    } else {
      khungRef.current?.querySelector(`[data-ngay="${homNay}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  const treNgay = sel && sel.tre ? Math.max(0, soNgay(ngayCuaMoc(sel.due_date), homNay)) : 0;

  return (
    <div className="cc" ref={khungRef}>
      <div className="cc__bar">
        {canUpdate && (
          <button ref={taoRef} type="button" className="cc__tao" onClick={(e) => moTao(homNay, e.currentTarget)}>
            <Plus size={15} /> Tạo hẹn
          </button>
        )}
        <button type="button" className="cc__nut" onClick={veHomNay}>Hôm nay</button>
        {cheDo === "thang" && (
          <span className="cc__nav">
            <button type="button" className="cc__icon-btn" onClick={() => doiThang(-1)} aria-label="Tháng trước"><ChevronLeft size={16} /></button>
            <button type="button" className="cc__icon-btn" onClick={() => doiThang(1)} aria-label="Tháng sau"><ChevronRight size={16} /></button>
            <span className="cc__month">Tháng {ym.m + 1} năm {ym.y}</span>
          </span>
        )}
        <span className="cc__che" role="group" aria-label="Kiểu xem">
          <button type="button" className={cheDo === "lb" ? "is-on" : ""} onClick={() => setCheDo("lb")}>Lịch biểu</button>
          <button type="button" className={cheDo === "thang" ? "is-on" : ""} onClick={() => setCheDo("thang")}>Tháng</button>
        </span>
      </div>

      {err && <div className="banner banner--error">{err}</div>}

      {occ == null ? (
        <div className="cc__dang">Đang tải lịch hẹn…</div>
      ) : cheDo === "lb" ? (
        <>
          <button type="button" className="cc__them" onClick={() => setLui((n) => n + 180)}>Xem hẹn cũ hơn</button>
          <LichBieu
            items={occ}
            homNay={homNay}
            coTheSua={canUpdate}
            onTick={tick}
            onMo={moHen}
            trongHomNay={occ.length === 0 ? "Chưa có hẹn nào với khách này." : undefined}
          />
          <button type="button" className="cc__them" onClick={() => setToi((n) => n + 90)}>Xem tiếp 3 tháng</button>
        </>
      ) : (
        <div className="cc__grid">
          {WD.map((w) => <div key={w} className="cc__wd">{w}</div>)}
          {o7.map((ngay, i) => {
            if (!ngay) return <div key={i} className="cc__cell cc__cell--blank" />;
            const ds = theoNgay[ngay] ?? [];
            return (
              <div
                key={ngay}
                className={`cc__cell${ngay === homNay ? " cc__cell--today" : ""}${thaNgay === ngay ? " cc__cell--drop" : ""}`}
                onClick={(e) => canUpdate && moTao(ngay, e.currentTarget)}
                onDragOver={(e) => { if (keoRef.current) { e.preventDefault(); setThaNgay(ngay); } }}
                onDragLeave={() => setThaNgay((p) => (p === ngay ? null : p))}
                onDrop={(e) => { e.preventDefault(); thaVao(ngay); }}
              >
                <div className="cc__dn">{Number(ngay.slice(8, 10))}</div>
                {ds.map((o) => {
                  const keo = canUpdate && o.status === "open";
                  return (
                    <span
                      key={`${o.task_id ?? "ao"}-${o.series_id ?? ""}-${o.due_date}`}
                      className={`cc__pill${o.status === "done" ? " cc__pill--done" : o.tre ? " cc__pill--late" : ""}`}
                      title={o.note}
                      draggable={keo}
                      onDragStart={(e) => { if (keo) { keoRef.current = o; e.dataTransfer.effectAllowed = "move"; } }}
                      onDragEnd={() => { keoRef.current = null; setThaNgay(null); }}
                      onClick={(e) => { e.stopPropagation(); moHen(o, e.currentTarget); }}
                    >
                      <span className="cc__pill-gio">{gioCuaMoc(o.due_date)}</span>
                      <span className="cc__pill-note">{o.note}</span>
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {(taoNgay || sel) && pop && (
        <div
          ref={popRef}
          className="cc__pop"
          role="dialog"
          style={{ left: pop.left, top: pop.top, transform: pop.above ? "translateY(-100%)" : undefined }}
        >
          <button type="button" className="cc__dong" onClick={dong} aria-label="Đóng"><X size={16} /></button>
          {taoNgay && canUpdate ? (
            <>
              <input
                className="cc__tieu-de"
                autoFocus
                placeholder="Thêm nội dung hẹn"
                value={fNote}
                onChange={(e) => setFNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") tao(); }}
              />
              <div className="cc__row">
                <ChonNgay className="cc__input" value={fNgay ?? ""} onChange={(v) => setFNgay(v)} aria-label="Ngày hẹn" />
                <ChonGio className="cc__input" value={fGio ?? ""} onChange={(v) => setFGio(v)} aria-label="Giờ hẹn" xoaDuoc={false} />
              </div>
              <div className="cc__row">
                <select className="cc__select" value={fLap} onChange={(e) => setFLap(e.target.value)} aria-label="Lặp lại">
                  <option value="none">Không lặp lại</option>
                  <option value="day">Lặp mỗi ngày</option>
                  <option value="week">Lặp mỗi tuần</option>
                  <option value="month">Lặp mỗi tháng</option>
                </select>
                {fLap !== "none" && (
                  <>
                    <label className="cc__nho">
                      mỗi
                      <input type="number" min={1} className="cc__input cc__input--so" value={fMoi} onChange={(e) => setFMoi(Number(e.target.value))} />
                      {tenLap(fLap)}
                    </label>
                    <label className="cc__nho">
                      đến
                      <ChonNgay className="cc__input" value={fDen ?? ""} onChange={(v) => setFDen(v)} aria-label="Lặp đến ngày" />
                    </label>
                  </>
                )}
              </div>
              <div className="cc__actions">
                <button className="btn btn--primary" disabled={busy || !fNote.trim() || !fNgay} onClick={tao}>
                  {busy ? "Đang lưu…" : "Lưu"}
                </button>
              </div>
            </>
          ) : sel ? (
            <>
              <div className={`cc__xem-ten${sel.status === "done" ? " is-xong" : ""}`}>{sel.note}</div>
              <div className="cc__xem-dong">
                {ngayDai(ngayCuaMoc(sel.due_date))}, {gioCuaMoc(sel.due_date)}
                {sel.status === "done" && <span className="cc__xong">Đã xong</span>}
                {sel.tre && <span className="cc__tre">{treNgay > 0 ? `Trễ ${treNgay} ngày` : "Trễ giờ"}</span>}
              </div>
              {laLap(sel) && sel.repeat_freq !== "none" && (
                <div className="cc__xem-dong cc__mo"><Repeat size={13} /> Lặp mỗi {tenLap(sel.repeat_freq)}</div>
              )}
              {sel.assignee_name && <div className="cc__xem-dong cc__mo">{sel.assignee_name} phụ trách</div>}
              <textarea
                className="cc__kq"
                placeholder={canUpdate ? "Ghi chú, kết quả" : "Chưa có ghi chú"}
                value={kq}
                readOnly={!canUpdate}
                onChange={(e) => setKq(e.target.value)}
              />
              {canUpdate && (
                <>
                  {sel.status === "open" && (
                    <div className="cc__row">
                      <ChonNgay className="cc__input" value={doiNgay ?? ""} onChange={(v) => setDoiNgay(v)} aria-label="Dời sang ngày" />
                      <ChonGio className="cc__input" value={doiGio ?? ""} onChange={(v) => setDoiGio(v)} aria-label="Dời sang giờ" xoaDuoc={false} />
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={busy || !doiNgay || (doiNgay === ngayCuaMoc(sel.due_date) && doiGio === gioCuaMoc(sel.due_date))}
                        onClick={() => lam(sel, "reschedule", { new_due: mocVN(doiNgay, doiGio) })}
                      >
                        Dời
                      </button>
                    </div>
                  )}
                  <div className="cc__actions">
                    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => lam(sel, "cancel")}>
                      {laLap(sel) ? "Xoá lần này" : "Xoá"}
                    </button>
                    {kq !== (sel.ket_qua ?? "") && (
                      <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => lam(sel, "ghi", { ket_qua: kq })}>
                        Lưu ghi chú
                      </button>
                    )}
                    {sel.status === "open" ? (
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={busy}
                        onClick={() => lam(sel, "complete", kq !== (sel.ket_qua ?? "") ? { ket_qua: kq } : undefined)}
                      >
                        Đánh dấu xong
                      </button>
                    ) : sel.task_id != null ? (
                      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => moLai(sel)}>
                        Mở lại
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Nút "Lịch hẹn" trên danh bạ — hẹn của nhiều khách
// =============================================================================

const TOI_DANH_BA = 30;

/** Dữ liệu nút "Lịch hẹn": luôn nạp "Của tôi" để có số đỏ; "Cả nhóm" chỉ nạp khi đang mở bảng. */
export function useLichHen(eventTick: number, mo: boolean) {
  const { token } = useAuth();
  const [phamVi, setPhamVi] = useState<"toi" | "nhom">("toi");
  const [den, setDen] = useState(() => congNgay(homNayVN(), TOI_DANH_BA));
  const [cuaToi, setCuaToi] = useState<{ items: LichHenDong[]; so: number; co_nhom: boolean } | null>(null);
  const [caNhom, setCaNhom] = useState<LichHenDong[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const nap = useCallback(() => {
    if (!token) return;
    api.customers
      .lichHen(token, "toi", den)
      .then((r) => { setCuaToi(r); setLoi(null); })
      .catch(() => setLoi("Không tải được lịch hẹn."));
    if (mo && phamVi === "nhom") {
      api.customers
        .lichHen(token, "nhom", den)
        .then((r) => setCaNhom(r.items))
        .catch(() => setLoi("Không tải được lịch hẹn."));
    }
  }, [token, den, mo, phamVi]);

  useEffect(() => { nap(); }, [nap, eventTick]);
  useNapKhiToiGio(phamVi === "nhom" ? caNhom : cuaToi?.items, nap);

  return {
    so: cuaToi?.so ?? 0,
    coNhom: cuaToi?.co_nhom ?? false,
    items: phamVi === "nhom" ? caNhom : (cuaToi?.items ?? null),
    phamVi,
    setPhamVi,
    xemTiep: () => setDen((d) => congNgay(d, TOI_DANH_BA)),
    loi,
    nap,
  };
}

export function BangLichHen({ lh, onMoKhach }: {
  lh: ReturnType<typeof useLichHen>;
  onMoKhach: (customerId: number) => void;
}) {
  const { token } = useAuth();
  const canUpdate = useCan()("khach_hang", "update");
  const homNay = homNayVN();
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  async function tick(o: LichHenDong) {
    const ma = maThaoTac(o);
    if (!token || busy || ma == null) return;
    setBusy(true);
    try {
      if (o.status === "done" && o.task_id != null) {
        await api.customers.setCareTaskStatus(token, o.customer_id, o.task_id, { status: "open" });
      } else {
        await api.customers.actOnOccurrence(token, o.customer_id, ma, homNay, homNay, {
          action: "complete",
          occurrence_date: o.occurrence_date,
        });
      }
      setLoi(null);
      lh.nap();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Thao tác không thành công.");
    } finally { setBusy(false); }
  }

  return (
    <div className="lhd">
      {lh.coNhom && (
        <div className="lhd__dau">
          <span className="cc__che" role="group" aria-label="Phạm vi">
            <button type="button" className={lh.phamVi === "toi" ? "is-on" : ""} onClick={() => lh.setPhamVi("toi")}>Của tôi</button>
            <button type="button" className={lh.phamVi === "nhom" ? "is-on" : ""} onClick={() => lh.setPhamVi("nhom")}>Cả nhóm</button>
          </span>
          <span className="lhd__ghi">
            {lh.phamVi === "toi" ? "Hẹn giao cho tôi" : "Mọi hẹn trên những khách tôi được xem"}
          </span>
        </div>
      )}
      {(loi || lh.loi) && <div className="banner banner--error">{loi || lh.loi}</div>}
      {lh.items == null ? (
        <div className="cc__dang">Đang tải lịch hẹn…</div>
      ) : (
        <>
          <LichBieu
            items={lh.items}
            homNay={homNay}
            coTheSua={canUpdate}
            onTick={tick}
            onMo={(o) => onMoKhach(o.customer_id)}
            phu={(o) => <span className="lb__khach" title={o.customer_code}>{o.customer_name}</span>}
          />
          <button type="button" className="cc__them" onClick={lh.xemTiep}>Xem tiếp 30 ngày</button>
        </>
      )}
    </div>
  );
}
