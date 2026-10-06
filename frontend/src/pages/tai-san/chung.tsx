// Mảnh dùng chung của màn Tài sản & Công cụ dụng cụ: ô nhập tiền, cách in số, badge, khoảng ngày
// hợp lệ, khung ngăn kéo, dòng xem trước khấu hao. Để riêng vì mọi khung (danh sách · thêm · chi
// tiết · ba thao tác) đều đụng tới — chép mỗi nơi một bản thì con số 3.300.000.000 hiện ba kiểu
// khác nhau trên cùng một màn.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Department } from "../../api/client";
import type { SelectOption } from "../../components/Select";
import { Icon } from "../../components/Icons";

/** "3.300.000.000" — KHÔNG kèm "đ": bảng có cả cột tiền thì mỗi ô một chữ "đ" là nhiễu, đơn vị
 *  nói một lần ở tiêu đề cột. Chỗ nào đứng lẻ thì tự thêm. */
export function tien(v: number | null | undefined): string {
  return Math.round(Number(v ?? 0)).toLocaleString("vi-VN");
}

/** "3.300.000.000 đ" — dùng khi con số đứng một mình, không nằm trong cột. */
export function tienDon(v: number | null | undefined): string {
  return `${tien(v)} đ`;
}

/** "10/03/2026" — đọc thẳng chuỗi ISO, KHÔNG qua `new Date()` (chuỗi "2026-03-10" bị hiểu là UTC
 *  midnight nên ở múi giờ âm lùi mất một ngày; đây là ngày chứng từ, lệch một ngày là sai kỳ). */
export function ngay(v?: string | null): string {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : v;
}

/** "2026-03" | "2026-03-10" → "03/2026". */
export function thangNhan(v?: string | null): string {
  if (!v) return "";
  return `${v.slice(5, 7)}/${v.slice(0, 4)}`;
}

/** Khoảng ngày chấp nhận được của mọi ô `type="date"` trong module.
 *
 *  Vì sao phải chặn hai đầu: ô ngày của trình duyệt cho gõ tay, và người dùng đã từng gõ ra năm
 *  SÁU chữ số — request bay lên rồi ăn 422 câm, không ô nào đỏ, họ ngồi bấm Lưu lại mãi. Chặn
 *  bằng `min`/`max` thì trình duyệt tự chặn ngay tại ô. Trên 1990 vì tài sản mua trước đó thì
 *  cũng đã khấu hao hết từ lâu; dưới +10 năm để còn ghi ngày dự kiến đưa vào dùng. */
export const NGAY_MIN = "1990-01-01";
export const NGAY_MAX = `${new Date().getFullYear() + 10}-12-31`;
export const HOM_NAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
export const THANG_NAY = HOM_NAY.slice(0, 7);

/** Số tháng từ tháng của `tu` tới tháng của `den` (chuỗi ISO, chỉ đọc năm-tháng). */
export function soThangGiua(tu: string, den: string): number {
  return (Number(den.slice(0, 4)) * 12 + Number(den.slice(5, 7)))
    - (Number(tu.slice(0, 4)) * 12 + Number(tu.slice(5, 7)));
}

/** Dòng xem trước dưới form: chạy đúng luật của engine (`khau_hao.py`) — mức tròn tháng =
 *  phần còn phải trích ÷ số tháng còn, làm tròn xuống; tháng đầu chia theo ngày nếu không bắt
 *  đầu ngày 1; tháng cuối (theo số tháng) gánh nốt phần lẻ.
 *
 *  Trả `null` khi chưa đủ số để tính; `het` = không còn gì để khấu hao. */
export function uocKhauHao(o: {
  gia: number;
  soThang: number;
  /** "YYYY-MM-DD" — ngày bắt đầu tính (mua mới: ngày bắt đầu dùng; đang dùng: ngày 1 tháng tính tiếp). */
  tuNgay: string;
  daKhauHao?: number;
  daKhauHaoThang?: number;
}): { het: true } | { het: false; mucThang: number; thangCuoi: string; ngayDau: number | null } | null {
  const { gia, soThang, tuNgay } = o;
  if (!(gia > 0) || !(soThang > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(tuNgay)) return null;
  const da = Math.max(0, o.daKhauHao ?? 0);
  const coSo = gia - da;
  const conThang = soThang - Math.max(0, o.daKhauHaoThang ?? 0);
  if (coSo <= 0 || conThang <= 0) return { het: true };
  const muc = Math.floor(coSo / conThang);
  const ngayBd = Number(tuNgay.slice(8, 10));
  // Tháng cuối = tháng thứ `conThang` (bắt đầu ngày 1) hoặc `conThang + 1` (bắt đầu giữa tháng:
  // tháng đầu chỉ tính lẻ ngày, phần thiếu dồn sang) — khớp `_muc_ky` của engine.
  const cuoi = Number(tuNgay.slice(0, 4)) * 12 + Number(tuNgay.slice(5, 7)) - 1
    + (ngayBd === 1 ? conThang - 1 : conThang);
  const nam = Math.floor(cuoi / 12);
  const thang = (cuoi % 12) + 1;
  return {
    het: false,
    mucThang: muc,
    thangCuoi: `${String(thang).padStart(2, "0")}/${nam}`,
    ngayDau: ngayBd !== 1 ? ngayBd : null,
  };
}

/** Bấm tải một blob URL rồi thu hồi. */
export function taiXuong(url: string, ten: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = ten;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Ô nhập TIỀN: gõ số trần, hiện có dấu chấm nghìn.
 *
 *  Không dùng `type="number"` cho tiền: giá một máy in là mười chữ số, nhìn "3300000000" thì không
 *  ai đếm nổi có mấy số 0 — mà đếm sai một chữ số ở đây là sai giá gấp mười. Con số gửi lên vẫn là
 *  số nguyên, mọi ký tự không phải chữ số đều bị loại tại chỗ gõ. */
export function OTien({
  value,
  onChange,
  disabled,
  placeholder,
  className,
  ariaLabel,
  autoFocus,
  id,
  invalid,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  id?: string;
  invalid?: boolean;
}) {
  return (
    <input
      id={id}
      aria-invalid={invalid || undefined}
      className={`rc-input ts-num ${className ?? ""}`}
      type="text"
      inputMode="numeric"
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      value={value ? tien(value) : ""}
      onChange={(e) => {
        const so = e.target.value.replace(/\D/g, "");
        onChange(so ? Number(so) : 0);
      }}
    />
  );
}

/** Badge tròn dùng cho loại · trạng thái tài sản.
 *  `he` là tiền tố lớp CSS (`ts-badge--<he>`), khai màu ở `tai-san.css`. */
export function Badge({ he, children }: { he: string; children: ReactNode }) {
  return <span className={`ts-badge ts-badge--${he}`}>{children}</span>;
}

/** Các ngăn đang mở, theo thứ tự mở — Esc chỉ đóng ngăn TRÊN CÙNG (ngăn Sửa nằm trên ngăn chi
 *  tiết; một phím Esc mà đóng cả hai là mất chỗ đang xem). */
const nganDangMo: number[] = [];
let soNgan = 0;

/** Khung ngăn kéo bên phải — mọi ngăn của module dùng chung một vỏ.
 *
 *  Lớp phủ phía sau NHẸ và KHÔNG làm mờ (thiết kế 05/10/2026, màn 2): ngăn chi tiết là "xem bên
 *  cạnh" — danh sách phía sau vẫn phải đọc được, dòng đang mở vẫn thấy được tô nền.
 *  `tren` = ngăn chồng lên một ngăn khác (Sửa / Thêm cái giống mở từ ngăn chi tiết). */
export function KhungNgan({
  nhanTren,
  tieuDe,
  onClose,
  chan,
  tren,
  nutDau,
  rong,
  phuDe,
  children,
}: {
  nhanTren?: ReactNode;
  tieuDe: ReactNode;
  onClose: () => void;
  chan?: ReactNode;
  tren?: boolean;
  /** Nút thêm ở đầu ngăn, đứng trước nút đóng (↑ ↓ đổi tài sản). */
  nutDau?: ReactNode;
  /** Ngăn rộng (chi tiết tài sản: hai cột). Form thêm/sửa giữ bề ngang đọc thoải mái. */
  rong?: boolean;
  /** Hàng dưới tiêu đề (nút thao tác của ngăn chi tiết). */
  phuDe?: ReactNode;
  children: ReactNode;
}) {
  const dongRef = useRef(onClose);
  dongRef.current = onClose;

  useEffect(() => {
    const id = ++soNgan;
    nganDangMo.push(id);
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (nganDangMo[nganDangMo.length - 1] !== id) return;
      // Hộp xác nhận / hộp Excel / danh sách thả đang mở thì Esc là của chúng.
      if (document.querySelector(".cdlg-overlay, .dmodal-overlay")) return;
      const dangGo = document.activeElement;
      if (dangGo instanceof HTMLElement && dangGo.closest('[aria-expanded="true"], [role="listbox"]')) return;
      dongRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = nganDangMo.indexOf(id);
      if (i >= 0) nganDangMo.splice(i, 1);
    };
  }, []);

  return (
    <div className={`rc-drawer__scrim ts-ngan${tren ? " ts-ngan--tren" : ""}`} role="dialog"
      aria-modal="true" onClick={onClose}>
      <aside className={`rc-drawer ts-ngan__khung${rong ? " ts-ngan__khung--rong" : ""}`} onClick={(e) => e.stopPropagation()}>
        <header className="rc-drawer__head">
          <div className="ts-ngan__dau">
            {nhanTren && <div className="ts-ngan__nhan">{nhanTren}</div>}
            <h2 className="rc-drawer__title">{tieuDe}</h2>
            {phuDe && <div className="ts-ngan__phu">{phuDe}</div>}
          </div>
          <div className="ts-ngan__nut">
            {nutDau}
            <button type="button" className="ts-nut-icon" onClick={onClose}
              aria-label="Đóng" title="Đóng (Esc)">
              <Icon name="x" size={17} />
            </button>
          </div>
        </header>
        <div className="rc-drawer__body">{children}</div>
        {chan && <footer className="rc-drawer__foot ts-ngan__chan">{chan}</footer>}
      </aside>
    </div>
  );
}

/** Lựa chọn bộ phận cho `Select` có ô tìm: xếp theo cây, gộp nhóm theo bộ phận GỐC — bốn chục
 *  bộ phận thả phẳng (Tổ in, Nhóm thợ in máy 2/4/5/6/7 màu, Bế TD - …) thì không ai tìm nổi. */
export function luaChonBoPhan(ds: Department[]): SelectOption<string>[] {
  const con = new Map<number | null, Department[]>();
  const coId = new Set(ds.map((b) => b.id));
  for (const b of ds) {
    const cha = b.parent_id && coId.has(b.parent_id) ? b.parent_id : null;
    con.set(cha, [...(con.get(cha) ?? []), b]);
  }
  const ra: SelectOption<string>[] = [];
  const di = (b: Department, nhom: string) => {
    ra.push({ value: String(b.id), label: b.name, group: nhom });
    for (const c of con.get(b.id) ?? []) di(c, nhom);
  };
  for (const goc of con.get(null) ?? []) di(goc, goc.name);
  return ra;
}

/** Thông báo nhỏ ở đáy màn, có nút Hoàn tác — thay hộp "Bạn chắc chưa?" cho việc quay lại được. */
export function ThongBao({ chu, onHoanTac, onTat }: {
  chu: string;
  onHoanTac?: () => void;
  onTat: () => void;
}) {
  const tatRef = useRef(onTat);
  tatRef.current = onTat;
  // Rê chuột / đặt focus vào thì DỪNG đếm (WCAG 2.2.1: người chậm tay vẫn kịp bấm Hoàn tác).
  const [giu, setGiu] = useState(false);
  useEffect(() => {
    if (giu) return;
    const t = window.setTimeout(() => tatRef.current(), 10000);
    return () => window.clearTimeout(t);
  }, [chu, giu]);
  return (
    <div className="ts-thongbao" role="status"
      onMouseEnter={() => setGiu(true)} onMouseLeave={() => setGiu(false)}
      onFocus={() => setGiu(true)} onBlur={() => setGiu(false)}>
      <span>{chu}</span>
      {onHoanTac && (
        <button type="button" className="ts-thongbao__nut" onClick={onHoanTac}>Hoàn tác</button>
      )}
      <button type="button" className="ts-thongbao__x" aria-label="Tắt thông báo" onClick={onTat}>
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}

/** Dòng lỗi dưới một ô: chữ + biểu tượng, không chỉ đổi màu viền (NN/g — mù màu vẫn đọc được). */
export function LoiO({ loi, id }: { loi: string | null | undefined; id?: string }) {
  if (!loi) return null;
  return (
    <span className="ts-loi" id={id} role="alert">
      <Icon name="alert" size={14} /> {loi}
    </span>
  );
}

/** Thẻ "Sau khi lưu" trong hộp thao tác: số MỚI to, số cũ gạch ngang bên dưới — người dùng thấy
 *  bấm lưu thì đổi gì trước khi bấm. `moi` rỗng = chưa đủ ô để tính, hiện số đang có. */
export function SoSanh({ nhan, cu, moi, ghi }: {
  nhan: string;
  cu: ReactNode;
  moi?: ReactNode | null;
  ghi?: ReactNode;
}) {
  const doi = moi !== undefined && moi !== null;
  return (
    <div className={`ts-ss${doi ? " is-doi" : ""}`}>
      <span className="ts-ss__nhan">{nhan}</span>
      <strong className="ts-ss__so">{doi ? moi : cu}</strong>
      <span className="ts-ss__cu">
        {ghi ?? (doi ? <>trước đây <s>{cu}</s></> : "đang là")}
      </span>
    </div>
  );
}

/** "84" → "7 năm", "90" → "7 năm 6 tháng". */
export function quyDoiNam(thang: number): string {
  const nam = Math.floor(thang / 12);
  const du = thang % 12;
  return du ? `${nam} năm ${du} tháng` : `${nam} năm`;
}

/** Băng lỗi trong ngăn — câu của máy chủ hiện NGUYÊN VĂN (đó là chỉ dẫn, không phải sự cố). */
export function BangLoi({ loi }: { loi: string | null }) {
  if (!loi) return null;
  return (
    <div className="banner banner--error" role="alert" style={{ marginBottom: "var(--sp-3)" }}>
      {loi}
    </div>
  );
}
