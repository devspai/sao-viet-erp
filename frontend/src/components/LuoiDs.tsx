// Mẩu dùng chung của lưới danh sách kiểu bảng tính (phương án A, 07/10/2026) — xem luoi-ds.css.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import "./hover-tip.css";
import "./luoi-ds.css";

export type MauTT = "vang" | "cam" | "xanh" | "cyan" | "cham" | "tim" | "ngoc" | "la" | "do" | "xam" | "slate";

/** Chip trạng thái (tròn) hoặc chip khâu (`vuong`, góc vuông nhỏ). */
export function ChipTT({ mau, vuong, title, children }: { mau: MauTT; vuong?: boolean; title?: string; children: ReactNode }) {
  return (
    <span className={`lds-chip lds-chip--${mau}${vuong ? " lds-chip--vuong" : ""}`} title={title}>
      {children}
    </span>
  );
}

export interface MucLocNhanh {
  key: string;
  label: string;
  count?: number;
  /** Màu chấm — vắng thì không chấm (vd "Tất cả"). */
  mau?: MauTT;
  /** Chấm đỏ "có việc mới chưa xem" (không số). */
  cham?: boolean;
}

/** Hàng lọc nhanh trạng thái: chữ + chấm màu + số mờ; mục 0 chữ nhạt nhưng vẫn bấm được. */
export function LocNhanhTrangThai({
  muc,
  dang,
  onChon,
  ariaLabel = "Lọc theo trạng thái",
}: {
  muc: MucLocNhanh[];
  dang: string;
  onChon: (key: string) => void;
  ariaLabel?: string;
}) {
  return (
    // Nút bật (aria-pressed) chứ không phải tab: đây là bộ lọc của bảng, còn tab thật của màn (vd
    // Giao hàng) vẫn là tab — trộn hai thứ cùng vai "tab" thì trình đọc màn hình đếm sai.
    <div className="lds-flt" role="group" aria-label={ariaLabel}>
      {muc.map((m) => (
        <button
          key={m.key}
          type="button"
          aria-pressed={dang === m.key}
          className={`${dang === m.key ? "on" : ""}${m.count === 0 ? " z" : ""}`}
          onClick={() => onChon(m.key)}
        >
          {m.mau ? <i className={`lds-dot lds-dot--${m.mau}`} aria-hidden="true" /> : null}
          <span className={m.cham ? "lds-flt__cham" : undefined}>{m.label}</span>
          {m.count !== undefined ? <span className="lds-flt__so">{m.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export interface CotLuoi {
  key: string;
  label: string;
  /** Cột bắt buộc (mã) — không cho ẩn. */
  coDinh?: boolean;
}

/** Đọc / ghi một danh sách khoá cột của màn trong localStorage (per-viewer — mất thì về mặc định). */
function useDsLuu(khoa: string): [string[], (v: string[]) => void] {
  const [ds, setDs] = useState<string[]>(() => {
    try {
      const v = localStorage.getItem(khoa);
      return v ? (JSON.parse(v) as string[]) : [];
    } catch {
      return [];
    }
  });
  const dat = (v: string[]) => {
    setDs(v);
    try {
      localStorage.setItem(khoa, JSON.stringify(v));
    } catch {
      /* trình duyệt chặn lưu thì thôi */
    }
  };
  return [ds, dat];
}

/** Nhớ cột đang ẩn theo màn. */
export function useCotAn(man: string): [Set<string>, (s: Set<string>) => void] {
  const [ds, dat] = useDsLuu(`lds-cot-an:${man}`);
  const an = useMemo(() => new Set(ds), [ds]);
  return [an, (s) => dat([...s])];
}

/** Nhớ thứ tự cột người xem đã kéo thả theo màn (rỗng = thứ tự mặc định). */
export function useThuTuCot(man: string): [string[], (v: string[]) => void] {
  return useDsLuu(`lds-cot-thu-tu:${man}`);
}

/** Xếp cột theo thứ tự người xem đã kéo. Cột cố định (mã, ô chọn, nút thao tác) đứng nguyên chỗ;
 *  cột mới thêm sau này (chưa có trong thứ tự đã lưu) đứng cuối nhóm cột đổi chỗ được. */
export function xepCot<T extends CotLuoi>(cot: T[], thuTu: string[]): T[] {
  if (thuTu.length === 0) return cot;
  const doi = cot.filter((c) => !c.coDinh);
  const hang = (k: string) => {
    const i = thuTu.indexOf(k);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const xep = [...doi].sort((a, b) => hang(a.key) - hang(b.key) || doi.indexOf(a) - doi.indexOf(b));
  let i = 0;
  return cot.map((c) => (c.coDinh ? c : xep[i++]));
}

/** Bề rộng tối thiểu của lưới = tổng bề rộng các cột đang hiện + phần cho cột không đặt bề rộng
 *  (cột cuối co giãn: Ghi chú, Người lập…). Đặt cứng một số thì khi tổng các cột vượt số đó,
 *  `table-layout: fixed` chia cho cột co giãn 0px — cột biến mất mà hộp "Cột" vẫn báo đang hiện. */
export function rongLuoi(cot: { w?: number }[], conLai = 150): number {
  return cot.reduce((t, c) => t + (c.w ?? conLai), 0);
}

/** Nút "Cột" mở hộp ẩn/hiện cột; có `onThuTu` thì kéo thả (hoặc phím mũi tên trên tay nắm) để đổi
 *  vị trí cột — lưới đổi theo ngay khi thả. */
export function ChonCot({
  cot,
  an,
  onAn,
  thuTu,
  onThuTu,
}: {
  cot: CotLuoi[];
  an: Set<string>;
  onAn: (s: Set<string>) => void;
  thuTu?: string[];
  onThuTu?: (v: string[]) => void;
}) {
  const [mo, setMo] = useState(false);
  // Hộp mở về phía còn chỗ: nút nằm sát mép trái (màn hẹp) thì neo trái, kẻo hộp chui dưới thanh bên.
  const [neoTrai, setNeoTrai] = useState(false);
  // Thứ tự nháp trong lúc đang kéo — thả mới ghi (khỏi vẽ lại cả lưới theo từng nhịp rê chuột).
  const [nhap, setNhap] = useState<string[] | null>(null);
  const [keo, setKeo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMo(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMo(false);
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", esc);
    };
  }, [mo]);

  const keoDuoc = !!onThuTu;
  const macDinh = cot.filter((c) => !c.coDinh).map((c) => c.key);
  const hienTai = xepCot(cot, thuTu ?? []).filter((c) => !c.coDinh).map((c) => c.key);
  const dsKhoa = nhap ?? hienTai;
  const theoKhoa = new Map(cot.map((c) => [c.key, c]));
  const doiCho = (ds: string[], k: string, toi: number) => {
    const moi = ds.filter((x) => x !== k);
    moi.splice(toi, 0, k);
    return moi;
  };
  const xongKeo = () => {
    if (nhap) onThuTu?.(nhap);
    setNhap(null);
    setKeo(null);
  };

  return (
    <div className="lds-cot" ref={ref}>
      <button type="button" className="lds-btn" aria-expanded={mo} onClick={() => {
        const r = ref.current?.getBoundingClientRect();
        const khung = ref.current?.closest(".lds")?.getBoundingClientRect();
        setNeoTrai(!!r && r.right - 240 < (khung?.left ?? 0));
        setMo(!mo);
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M15 4v16" />
        </svg>
        Cột{an.size > 0 ? <span className="lds-flt__so">ẩn {an.size}</span> : null}
      </button>
      {mo ? (
        <div className={`lds-cot__hop${neoTrai ? " lds-cot__hop--trai" : ""}`} role="dialog" aria-label="Chọn cột hiển thị">
          {keoDuoc ? <div className="lds-cot__goi">Kéo để đổi vị trí cột</div> : null}
          {dsKhoa.map((k, i) => {
            const c = theoKhoa.get(k);
            if (!c) return null;
            return (
              <div
                key={k}
                className={`lds-cot__dong${keo === k ? " is-keo" : ""}`}
                draggable={keoDuoc}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", k);
                  setKeo(k);
                  setNhap(hienTai);
                }}
                onDragOver={(e) => {
                  if (!keo || !nhap) return;
                  e.preventDefault();
                  if (keo !== k) setNhap(doiCho(nhap, keo, nhap.indexOf(k)));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  xongKeo();
                }}
                onDragEnd={xongKeo}
              >
                {keoDuoc ? (
                  <button
                    type="button"
                    className="lds-cot__nam"
                    aria-label={`Đổi vị trí cột ${c.label}, dùng phím mũi tên lên xuống`}
                    title="Kéo để đổi vị trí"
                    onKeyDown={(e) => {
                      const toi = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
                      if (toi < 0 || toi >= dsKhoa.length) return;
                      e.preventDefault();
                      onThuTu?.(doiCho(dsKhoa, k, toi));
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="9" cy="6" r="1.6" />
                      <circle cx="15" cy="6" r="1.6" />
                      <circle cx="9" cy="12" r="1.6" />
                      <circle cx="15" cy="12" r="1.6" />
                      <circle cx="9" cy="18" r="1.6" />
                      <circle cx="15" cy="18" r="1.6" />
                    </svg>
                  </button>
                ) : null}
                <label>
                  <input
                    type="checkbox"
                    checked={!an.has(k)}
                    onChange={() => {
                      const s = new Set(an);
                      if (s.has(k)) s.delete(k);
                      else s.add(k);
                      onAn(s);
                    }}
                  />
                  {c.label}
                </label>
              </div>
            );
          })}
          {an.size > 0 || hienTai.join() !== macDinh.join() ? (
            <div className="lds-cot__lai">
              <button
                type="button"
                className="lds-btn lds-btn--xs"
                onClick={() => {
                  onAn(new Set());
                  onThuTu?.([]);
                }}
              >
                Về mặc định
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Tiêu đề cột bấm được để sắp xếp. `sort` dạng "cot" (tăng) / "-cot" (giảm). */
export function TieuDeSapXep({ label, cot, sort, onSort }: { label: string; cot: string; sort: string; onSort: (s: string) => void }) {
  const dang = sort === cot || sort === `-${cot}`;
  const giam = sort === `-${cot}`;
  return (
    <button type="button" className={`lds-sx${dang ? " on" : ""}`} onClick={() => onSort(giam ? cot : dang ? `-${cot}` : `-${cot}`)}>
      {label}
      {dang ? <span aria-hidden="true">{giam ? "↓" : "↑"}</span> : null}
    </button>
  );
}

/** Ô tìm của đầu trang. */
export function OTim({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLength = 200,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  maxLength?: number;
  /** Cho màn có phím tắt (vd Ctrl K) đặt tiêu điểm vào ô. */
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <label className="lds-tim">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
      />
      {value ? (
        <button type="button" className="lds-tim__xoa" aria-label="Xoá ô tìm" onClick={() => onChange("")}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      ) : null}
    </label>
  );
}

/** Tên khách hiện trên lưới: bỏ tiền tố loại hình công ty (tên đủ để ở title). */
export function tenKhachGon(ten: string | null | undefined): string {
  if (!ten) return "";
  return ten.replace(/^\s*(CÔNG TY|Công ty|công ty)\s+(CỔ PHẦN|Cổ phần|cổ phần|CP|TNHH|Tnhh|tnhh)\s+/u, "").trim() || ten;
}

export const soVN = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("vi-VN") : "—";

/** Ngày dạng dd/mm/yyyy từ ISO (ngày hoặc ngày-giờ). */
export function ngayVN(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Số cột đầu được ghim khi cuộn ngang = các cột cố định đứng liền nhau từ trái (ô chọn, mã, tên…). */
export function soCotGhim(cot: { coDinh?: boolean }[]): number {
  const i = cot.findIndex((c) => !c.coDinh);
  // Toàn cột cố định (người xem ẩn hết cột khác) thì không có gì để cuộn qua — khỏi ghim.
  return i < 0 ? 0 : Math.min(i, 4);
}

/** Khung cuộn dọc gần nhất (vùng nội dung của ứng dụng) — tiêu đề lưới bám theo nó. */
function khungCuonDoc(el: HTMLElement): HTMLElement | Window {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return window;
}

/** Khung cuộn ngang của lưới, kiểu "cố định khung" của Excel: cuộn trang xuống thì hàng tiêu đề cột
 *  bám mép trên; cuộn ngang thì `ghim` cột đầu đứng yên. Khung KHÔNG trần chiều cao (cả trang cuộn),
 *  nên tiêu đề được đẩy xuống bằng `transform` theo vị trí cuộn chứ không dùng `sticky top` — `sticky`
 *  chỉ bám theo khung cuộn gần nhất, mà khung cuộn ngang này không cuộn dọc. */
export function CuonLuoi({ ghim = 0, children }: { ghim?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const tinhRef = useRef<() => void>(() => {});

  // Vị trí trái của từng cột ghim = mép trái ô tiêu đề tương ứng (đo lại khi bộ cột đổi: ẩn/hiện, đổi chỗ
  // cột, và khi đổi cỡ cửa sổ). Chỉ ghim những cột đầu mà tổng bề rộng còn ≤ nửa khung — khung hẹp
  // (điện thoại) mà ghim cả Mã + Tên thì cột ghim chiếm hết chỗ, cuộn ngang không tới cột nào khác.
  const datGhim = useRef<() => void>(() => {});
  datGhim.current = () => {
    const k = ref.current;
    if (!k) return;
    // Cộng dồn bề rộng — `offsetLeft` của ô sticky đã cộng cả phần đang trượt nên đo sai.
    const ths = k.querySelectorAll<HTMLTableCellElement>("thead tr:first-child > th");
    // Chưa có bố cục (jsdom, khung đang ẩn) thì mọi bề rộng = 0: giữ đủ `ghim` cột, đo lại khi hiện.
    const coBoCuc = k.clientWidth > 0;
    const tran = k.clientWidth / 2;
    let trai = 0;
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const w = i < ghim && ths[i] ? ths[i].getBoundingClientRect().width : 0;
      const vua = coBoCuc ? w > 0 && trai + w <= tran : i < ghim && !!ths[i];
      if (vua && n === i) {
        k.style.setProperty(`--lds-g${i + 1}`, `${trai}px`);
        trai += w;
        n = i + 1;
      } else k.style.removeProperty(`--lds-g${i + 1}`);
    }
    if (n > 0) k.dataset.ghim = String(n);
    else delete k.dataset.ghim;
  };
  // Đo lại chỉ khi bộ cột đầu đổi (ẩn/hiện, đổi chỗ, đổi rộng). `.lds-g` là `table-layout: fixed`
  // nên dữ liệu đổi không làm đổi bề rộng cột; đổi cỡ khung đã có ResizeObserver lo. Gõ ô tìm vẽ lại
  // cả trang mà không ép trình duyệt tính lại bố cục cho mỗi phím.
  const chuKyRef = useRef("");
  useLayoutEffect(() => {
    const k = ref.current;
    const ths = k?.querySelectorAll<HTMLTableCellElement>("thead tr:first-child > th");
    let chuKy = `${ghim}|${ths?.length ?? 0}`;
    ths?.forEach((th, i) => {
      if (i < 5) chuKy += `|${th.colSpan}:${th.style.width}:${th.textContent}`;
    });
    k?.querySelectorAll<HTMLTableColElement>("colgroup col").forEach((c) => {
      chuKy += `|${c.style.width}`;
    });
    if (chuKy !== chuKyRef.current) {
      chuKyRef.current = chuKy;
      datGhim.current();
    }
    tinhRef.current();
  });

  useEffect(() => {
    const k = ref.current;
    if (!k) return;
    const khung = khungCuonDoc(k);
    let raf = 0;
    const tinh = () => {
      raf = 0;
      const bang = k.querySelector("table");
      const dau = k.querySelector("thead");
      if (!bang || !dau) return;
      // Không dùng `instanceof Window`: jsdom (vitest) có `Window` khác `window` nên phép thử sai.
      const tren = khung instanceof HTMLElement ? khung.getBoundingClientRect().top : 0;
      const b = bang.getBoundingClientRect();
      const cao = dau.getBoundingClientRect().height;
      // Không đẩy quá dòng cuối: hết bảng thì tiêu đề trôi đi theo bảng.
      const day = Math.max(0, Math.min(tren - b.top, b.height - cao * 2));
      k.style.setProperty("--lds-tieu-de", `${day}px`);
      k.classList.toggle("is-ghim-tren", day > 0);
    };
    const nghe = () => {
      if (!raf) raf = requestAnimationFrame(tinh);
    };
    const ngang = () => k.classList.toggle("is-cuon-ngang", k.scrollLeft > 0);
    tinhRef.current = nghe;
    khung.addEventListener("scroll", nghe, { passive: true });
    const doiCo = () => {
      datGhim.current();
      nghe();
    };
    window.addEventListener("resize", doiCo);
    // Khung đổi bề rộng mà cửa sổ không đổi (thu thanh bên, mở ngăn chi tiết) cũng phải tính lại ghim.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(doiCo);
    ro?.observe(k);
    k.addEventListener("scroll", ngang, { passive: true });
    tinh();
    ngang();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      khung.removeEventListener("scroll", nghe);
      window.removeEventListener("resize", doiCo);
      ro?.disconnect();
      k.removeEventListener("scroll", ngang);
    };
  }, []);

  return (
    // `data-ghim` do datGhim đặt (số cột ghim THỰC, có thể ít hơn `ghim` khi khung hẹp).
    <div className="lds-cuon" ref={ref}>
      {children}
    </div>
  );
}

const GOI_Y_RONG = 340;
const GOI_Y_KHOANG = 8;
const GOI_Y_LE = 12;
const GOI_Y_CHO = 250;
const GOI_Y_RA = 180;

/** Tiêu đề cột của ô — tính theo vị trí cột thật (cộng dồn colSpan), không theo chỉ số ô. */
function tieuDeCot(td: HTMLTableCellElement): string {
  const bang = td.closest("table");
  const hang = td.parentElement;
  if (!bang || !hang) return "";
  let viTri = 0;
  for (const o of Array.from(hang.children) as HTMLTableCellElement[]) {
    if (o === td) break;
    viTri += o.colSpan || 1;
  }
  let dem = 0;
  for (const th of Array.from(bang.querySelectorAll<HTMLTableCellElement>("thead tr:first-child > th"))) {
    if (dem === viTri) return (th.textContent ?? "").replace(/\s+/g, " ").trim();
    dem += th.colSpan || 1;
    if (dem > viTri) return "";
  }
  return "";
}

/** Ô (hoặc phần tử bên trong) đang bị cắt chữ bằng dấu "…". */
function biCat(td: HTMLElement): boolean {
  if (td.scrollWidth > td.clientWidth + 1) return true;
  for (const el of Array.from(td.querySelectorAll<HTMLElement>("*"))) {
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

type GoiY = { tieuDe: string; noi: string; neo: DOMRect; chuotX: number };

/** Bong bóng khi rê chuột lên ô BẤT KỲ bảng nào (danh sách, bảng trong ngăn chi tiết…) — cùng khuôn
 *  `hover-tip` của ma trận quyền (thẻ trắng, tiêu đề + nội dung); rê chuột xuống thẻ được để bôi đen
 *  sao chép. Hiện khi ô bị cắt "…" (đủ chữ) hoặc phần tử trong ô có `title=` (thay bong bóng xám chậm
 *  của trình duyệt). Tiêu đề là tên cột. Gắn MỘT lần ở AppShell; vùng nào không muốn thì đặt
 *  `data-khong-goi-y` lên khung chứa. */
export function GoiYBang() {
  const [gy, setGy] = useState<GoiY | null>(null);
  const [vt, setVt] = useState<{ top: number; left: number; tren: boolean; mui: number } | null>(null);
  const bong = useRef<HTMLDivElement | null>(null);
  // Cầu nối cho thẻ (vẽ qua portal, nằm ngoài khung): rê vào thẻ thì giữ mở để bôi đen + sao chép chữ.
  const cau = useRef({ vaoThe: () => {}, raThe: (_dangGiu: boolean) => {} });

  useEffect(() => {
    const k = document;
    let hen = 0; // chờ hiện
    let henDong = 0; // chờ đóng / chờ đổi sang ô khác — đủ thời gian đưa chuột từ ô xuống thẻ
    let hien = false;
    let dang: HTMLElement | null = null;
    // `title` gốc cất vào đây lúc rê chuột (trình duyệt thôi hiện bong bóng xám), trả lại khi rời.
    let cat: { el: HTMLElement; title: string } | null = null;
    const traTitle = () => {
      if (cat && !cat.el.hasAttribute("title")) cat.el.setAttribute("title", cat.title);
      cat = null;
    };
    const dong = () => {
      window.clearTimeout(hen);
      window.clearTimeout(henDong);
      hen = 0;
      henDong = 0;
      hien = false;
      dang = null;
      traTitle();
      setGy(null);
    };
    const hoan = (viec: () => void) => {
      window.clearTimeout(henDong);
      henDong = window.setTimeout(viec, GOI_Y_RA);
    };
    const moO = (t: Element, chuotX: number) => {
      const coTitle = t.closest<HTMLElement>("[title]");
      const o = t.closest<HTMLTableCellElement>("tbody td");
      // `title` chỉ tính khi nằm TRONG ô bảng — thẻ ngoài bảng giữ bong bóng của trình duyệt.
      const dich = coTitle && coTitle.closest("td, th") ? coTitle : o;
      if (dich === dang) return;
      dong();
      if (!dich || (o && (o.classList.contains("lds-trong") || o.classList.contains("lds-nut")))) return;
      dang = dich;
      let noi = "";
      if (coTitle && dich === coTitle) {
        noi = coTitle.getAttribute("title") ?? "";
        cat = { el: coTitle, title: noi };
        coTitle.removeAttribute("title");
      } else if (o && biCat(o)) {
        noi = (o.innerText || o.textContent || "").trim();
      }
      if (!noi.trim()) return;
      const tieuDe = o ? tieuDeCot(o) : "";
      hen = window.setTimeout(() => {
        if (dang !== dich) return;
        hien = true;
        setVt(null);
        setGy({ tieuDe: tieuDe === noi ? "" : tieuDe, noi, neo: dich.getBoundingClientRect(), chuotX });
      }, GOI_Y_CHO);
    };
    const vao = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== "function" || !t.closest("table") || t.closest("[data-khong-goi-y]")) return;
      // Thẻ đang mở: đường từ ô xuống thẻ băng qua ô dòng dưới — chờ một nhịp, vào thẻ thì huỷ đổi.
      if (hien) hoan(() => moO(t, e.clientX));
      else moO(t, e.clientX);
    };
    const ra = (e: MouseEvent) => {
      const den = e.relatedTarget as Node | null;
      if (dang && den && dang.contains(den)) return;
      if (den instanceof Element && den.closest("table td, table th")) return; // sang ô khác: `vao` lo
      if (den && bong.current?.contains(den)) return; // xuống thẻ: thẻ tự lo
      if (hien) hoan(dong);
      else dong();
    };
    let choNha: (() => void) | null = null;
    cau.current = {
      vaoThe: () => {
        window.clearTimeout(henDong);
        henDong = 0;
      },
      raThe: (dangGiu) => {
        // Đang kéo bôi đen mà chuột trượt ra ngoài thẻ: đợi nhả chuột rồi mới tính đóng.
        if (!dangGiu) return hoan(dong);
        if (choNha) return;
        choNha = () => {
          window.removeEventListener("mouseup", choNha!);
          choNha = null;
          if (!bong.current?.matches(":hover")) hoan(dong);
        };
        window.addEventListener("mouseup", choNha);
      },
    };
    k.addEventListener("mouseover", vao);
    k.addEventListener("mouseout", ra);
    const bam = (e: MouseEvent) => {
      if (!bong.current?.contains(e.target as Node)) dong();
    };
    k.addEventListener("mousedown", bam);
    window.addEventListener("scroll", dong, true);
    window.addEventListener("resize", dong);
    return () => {
      dong();
      if (choNha) window.removeEventListener("mouseup", choNha);
      k.removeEventListener("mouseover", vao);
      k.removeEventListener("mouseout", ra);
      k.removeEventListener("mousedown", bam);
      window.removeEventListener("scroll", dong, true);
      window.removeEventListener("resize", dong);
    };
  }, []);

  useLayoutEffect(() => {
    if (!gy || !bong.current) return;
    const r = gy.neo;
    const b = bong.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Ô rộng: mũi chỉ đúng chỗ con trỏ, không chỉ giữa ô.
    const giua = Math.min(Math.max(gy.chuotX, r.left + 12), r.right - 12);
    const left = Math.min(Math.max(giua - b.width / 2, GOI_Y_LE), vw - b.width - GOI_Y_LE);
    const tren = r.bottom + GOI_Y_KHOANG + b.height > vh - GOI_Y_LE && r.top - GOI_Y_KHOANG - b.height > GOI_Y_LE;
    const top = tren ? r.top - GOI_Y_KHOANG - b.height : r.bottom + GOI_Y_KHOANG;
    setVt({ top, left, tren, mui: Math.min(Math.max(giua - left, 14), b.width - 14) });
  }, [gy]);

  if (!gy) return null;
  return createPortal(
    <div
      ref={bong}
      role="tooltip"
      className={`hover-tip lds-goi-y${vt ? " hover-tip--hien" : ""}${vt?.tren ? " hover-tip--tren" : ""}`}
      onMouseEnter={() => cau.current.vaoThe()}
      onMouseLeave={(e) => cau.current.raThe(e.buttons !== 0)}
      style={{ maxWidth: GOI_Y_RONG, top: vt?.top ?? 0, left: vt?.left ?? 0, ["--mui" as string]: `${vt?.mui ?? 14}px` }}
    >
      {gy.tieuDe && <div className="hover-tip__tieu-de">{gy.tieuDe}</div>}
      {gy.noi.split(/\n+/).map((d, i) => (
        <p key={i} className="hover-tip__dan lds-goi-y__dong">{d.trim()}</p>
      ))}
    </div>,
    document.body,
  );
}
