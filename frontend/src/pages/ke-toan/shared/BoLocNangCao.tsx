/** Bộ lọc nâng cao của các màn danh sách kế toán (đặc tả A.18).
 *
 *  Nút phụ "Bộ lọc" (viên số = số điều kiện đang áp) mở một bảng thả xuống ngay dưới thanh lọc:
 *  đầu "Bộ lọc nâng cao" + "Xoá hết", thân lưới hai cột, chân "Khớp n … trong kỳ" + "Đóng" + nút
 *  chính "Xem n …". Esc hoặc bấm ngoài = đóng, KHÔNG áp — chỉ nút chính mới áp.
 *  Đã áp thì mỗi điều kiện thành một chip đặc trên thanh lọc (`ChipDaAp`).
 *  Số "khớp" do máy chủ đếm; màn tự chờ 350ms sau lần đổi cuối rồi mới hỏi.
 */
import { Check, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ChipLoc = { khoa: string; nhan: string; giaTri: ReactNode };

/** Logic chung của MỌI bảng lọc nâng cao (sổ phiếu, công nợ): BẢN NHÁP riêng chỉ chép vào bộ lọc
 *  của trang khi bấm nút chính; đếm "Khớp n …" ở máy chủ chờ 350ms sau lần đổi cuối (câu trả lời cũ
 *  về muộn thì bỏ); mở từ chip thì đưa con trỏ tới đúng ô của điều kiện đó (`data-o` của ô).
 *
 *  `moBang(o)` mở bảng với bản nháp = bộ lọc đang áp; `o` = khoá ô cần đưa con trỏ tới (null = không). */
export function useBangLocNhap<L>(loc: L, demKhop: (nhap: L) => Promise<number>) {
  const [mo, setMo] = useState(false);
  const [nhap, setNhap] = useState<L>(loc);
  const [khop, setKhop] = useState<number | null>(null);
  const [oMo, setOMo] = useState<string | null>(null);
  const demRef = useRef(demKhop);
  demRef.current = demKhop;

  const moBang = (o: string | null) => {
    setNhap(loc);
    setKhop(null);
    setOMo(o);
    setMo(true);
  };

  useEffect(() => {
    if (!mo) return;
    let conHieuLuc = true;
    const hen = window.setTimeout(() => {
      demRef.current(nhap)
        .then((n) => conHieuLuc && setKhop(n))
        .catch(() => conHieuLuc && setKhop(null));
    }, 350);
    return () => {
      conHieuLuc = false;
      window.clearTimeout(hen);
    };
  }, [mo, nhap]);

  useEffect(() => {
    if (!mo || !oMo) return;
    document
      .querySelector<HTMLElement>(
        `.kt-boloc [data-o="${oMo}"] input, .kt-boloc [data-o="${oMo}"] select, .kt-boloc [data-o="${oMo}"] button`,
      )
      ?.focus();
  }, [mo, oMo]);

  return {
    mo,
    /** Cho `BoLocNangCao.onMo`: mở = `moBang(null)`, đóng = bỏ bản nháp. */
    onMo: (b: boolean) => (b ? moBang(null) : setMo(false)),
    moBang,
    nhap,
    setNhap,
    /** Ghi một phần bản nháp. */
    doi: (moi: Partial<L>) => setNhap((cu) => ({ ...cu, ...moi })),
    khop,
  };
}

export function BoLocNangCao({
  soDieuKien,
  mo,
  onMo,
  khop,
  donVi,
  duoiKhop = " trong kỳ",
  onXoaHet,
  onAp,
  children,
}: {
  soDieuKien: number;
  mo: boolean;
  onMo: (b: boolean) => void;
  /** Số bản ghi khớp bộ lọc đang soạn; null = chưa đếm xong. */
  khop: number | null;
  /** "phiếu", "nhà cung cấp", "khách hàng". */
  donVi: string;
  /** Đuôi sau "Khớp n {donVi}". Mặc định " trong kỳ"; màn công nợ (khớp theo khách/nhà cung cấp,
   *  không theo kỳ) truyền "" để ra "Khớp 26 khách hàng". */
  duoiKhop?: string;
  onXoaHet: () => void;
  onAp: () => void;
  children: ReactNode;
}) {
  const vungRef = useRef<HTMLDivElement>(null);
  const nutRef = useRef<HTMLButtonElement>(null);
  const idDau = useId();
  const onMoRef = useRef(onMo);
  onMoRef.current = onMo;

  useEffect(() => {
    if (!mo) return;
    /** Phần tử đang thả một danh sách (ô chọn mở, listbox) — Esc / cú bấm là của nó, không phải
     *  của bảng lọc. Trừ chính nút "Bộ lọc" (cũng mang aria-expanded=true khi bảng đang mở). */
    function trongDanhSachMo(el: EventTarget | Element | null): boolean {
      if (!(el instanceof Element)) return false;
      const mo = el.closest('[aria-expanded="true"], [role="listbox"], .sel__list--portal');
      return mo != null && mo !== nutRef.current;
    }
    // Bắt ở pha CAPTURE để Esc đóng bảng lọc trước, không lọt xuống ngăn phải đang mở bên dưới.
    // Vì chạy TRƯỚC `onKeyDown` của ô chọn, phải tự nhường khi một ô chọn trong bảng đang mở.
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (trongDanhSachMo(e.target) || trongDanhSachMo(document.activeElement)) return;
      e.preventDefault();
      onMoRef.current(false);
    }
    // Danh sách `Select portal` treo ở document.body, ngoài vùng bảng lọc: bấm vào đó vẫn là bấm TRONG.
    function onBamNgoai(e: MouseEvent) {
      const vung = vungRef.current;
      if (!vung || !(e.target instanceof Node) || vung.contains(e.target)) return;
      if (e.target instanceof Element && e.target.closest('[role="listbox"], .sel__list--portal')) return;
      onMoRef.current(false);
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onBamNgoai);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onBamNgoai);
    };
  }, [mo]);

  return (
    <div className="kt-loc-wrap" ref={vungRef}>
      <button ref={nutRef} type="button" className="kt-btn kt-btn--nho" aria-expanded={mo} aria-haspopup="dialog"
        onClick={() => onMo(!mo)}>
        <SlidersHorizontal size={14} aria-hidden="true" />
        Bộ lọc
        {soDieuKien > 0 && <span className="kt-dem">{soDieuKien}</span>}
      </button>
      {mo && (
        <div className="kt-boloc" role="dialog" aria-labelledby={idDau}>
          <div className="kt-boloc__dau">
            <b id={idDau}>Bộ lọc nâng cao</b>
            <button type="button" className="kt-lk" onClick={onXoaHet}>Xoá hết</button>
          </div>
          <div className="kt-boloc__than">{children}</div>
          <div className="kt-boloc__chan">
            <span className="kt-boloc__khop">{khop != null ? `Khớp ${khop} ${donVi}${duoiKhop}` : ""}</span>
            <button type="button" className="kt-btn kt-btn--tron" onClick={() => onMo(false)}>Đóng</button>
            <button type="button" className="kt-btn kt-btn--chinh"
              onClick={() => {
                onAp();
                onMo(false);
              }}>
              {khop != null ? `Xem ${khop} ${donVi}` : `Xem ${donVi}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Chip đặc cho từng điều kiện đã áp: bấm chip mở lại bảng ở ô đó, bấm × bỏ riêng điều kiện đó. */
export function ChipDaAp({
  chips,
  onBo,
  onSua,
  onXoaHet,
}: {
  chips: ChipLoc[];
  onBo: (khoa: string) => void;
  onSua: (khoa: string) => void;
  onXoaHet: () => void;
}) {
  if (chips.length === 0) return <></>;
  return (
    <>
      {chips.map((c) => (
        <span key={c.khoa} className="kt-chip kt-chip--dat">
          <button type="button" className="kt-chip__nd" onClick={() => onSua(c.khoa)}>
            {c.nhan}: <b>{c.giaTri}</b>
          </button>
          <button type="button" className="kt-chip__bo" aria-label={`Bỏ lọc ${c.nhan}`} title="Bỏ điều kiện này"
            onClick={() => onBo(c.khoa)}>
            <X size={14} aria-hidden="true" />
          </button>
        </span>
      ))}
      <button type="button" className="kt-lk kt-chip__xoa" onClick={onXoaHet}>Xoá hết</button>
    </>
  );
}

/** Một ô trong bảng lọc: nhãn trên, điều khiển dưới. `rong` = trải hết hai cột.
 *
 *  Nhãn chỉ đặt tên cho NHÓM (`role=group` + `aria-labelledby`), KHÔNG gắn vào ô nhập bên trong
 *  (ô có thể là hai ô của KhoangTien, nhóm nút, ô chọn…). Nơi dùng PHẢI tự đặt `aria-label` (hoặc
 *  `ariaLabel` của Select) cho từng ô nhập, không thì trình đọc màn hình và test không tìm ra ô. */
export function O({ nhan, rong, children }: { nhan: string; rong?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div className={`kt-o${rong ? " kt-o--rong" : ""}`} role="group" aria-labelledby={id}>
      <span id={id} className="kt-o__nhan">{nhan}</span>
      {children}
    </div>
  );
}

const vietSo = (n?: number) => (n == null ? "" : n.toLocaleString("vi-VN"));
const docSo = (s: string): number | undefined => {
  const so = s.replace(/\D/g, "");
  return so ? Number(so) : undefined;
};

/** Chữ của một khoảng số tiền trên chip: "từ 5.000.000", "đến 9.000.000", "5.000.000 đến 9.000.000";
 *  không có đầu nào thì null (không có điều kiện). */
export function chuKhoang(tu?: number, den?: number): string | null {
  if (tu != null && den != null) return `${vietSo(tu)} đến ${vietSo(den)}`;
  if (tu != null) return `từ ${vietSo(tu)}`;
  if (den != null) return `đến ${vietSo(den)}`;
  return null;
}

/** Khoảng số tiền "Từ … đến Không giới hạn", ô tiền có dấu chấm. */
export function KhoangTien({
  tu,
  den,
  onDoi,
}: {
  tu?: number;
  den?: number;
  onDoi: (tu?: number, den?: number) => void;
}) {
  return (
    <div className="kt-khoang">
      <input type="text" inputMode="numeric" aria-label="Từ" placeholder="Từ" value={vietSo(tu)}
        onChange={(e) => onDoi(docSo(e.target.value), den)} />
      <span>đến</span>
      <input type="text" inputMode="numeric" aria-label="Đến" placeholder="Không giới hạn" value={vietSo(den)}
        onChange={(e) => onDoi(tu, docSo(e.target.value))} />
    </div>
  );
}

/** Một-trong-nhiều: nhóm nút liền, nút đang chọn nền charcoal. */
export function NhomNut<T extends string>({
  giaTri,
  luaChon,
  onDoi,
}: {
  giaTri: T;
  luaChon: [T, string][];
  onDoi: (v: T) => void;
}) {
  return (
    <div className="kt-seg" role="group">
      {luaChon.map(([v, nhan]) => (
        <button key={v} type="button" className={v === giaTri ? "on" : undefined} aria-pressed={v === giaTri}
          onClick={() => onDoi(v)}>
          {nhan}
        </button>
      ))}
    </div>
  );
}

/** Nhiều-trong-nhiều: viên chọn, đã chọn nền charcoal + dấu ✓. */
export function ChonNhieu({
  giaTri,
  luaChon,
  onDoi,
}: {
  giaTri: string[];
  luaChon: [string, string][];
  onDoi: (v: string[]) => void;
}) {
  return (
    <div className="kt-chon-nhieu" role="group">
      {luaChon.map(([v, nhan]) => {
        const on = giaTri.includes(v);
        return (
          <button key={v} type="button" className={on ? "on" : undefined} aria-pressed={on}
            onClick={() => onDoi(on ? giaTri.filter((x) => x !== v) : [...giaTri, v])}>
            <Check size={14} aria-hidden="true" />
            {nhan}
          </button>
        );
      })}
    </div>
  );
}
