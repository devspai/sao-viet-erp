/** Khung chung của mọi form lập phiếu chi / phiếu thu (đặc tả PC-3, PT-3, PT-4, A.2, A.3, A.6).
 *
 *  - Vỏ `NganPhai` (cùng 920px với mọi ngăn); form đang gõ dở thì Esc / đóng hỏi trước (`chanDong`).
 *  - Lỗi nằm TẠI Ô (chữ đỏ + biểu tượng, viền ô đỏ), con trỏ nhảy tới ô sai đầu tiên; nút lập
 *    luôn bấm được. Lỗi máy chủ hiện ngay đầu form, trong ngăn — không rơi ra sau lớp phủ.
 *  - Chân: câu xem trước bên trái — "Đóng" — nút rust ("Lập phiếu chi" / "Lập phiếu thu").
 *
 *  Kèm các ô dùng chung: `OF` (một ô có nhãn + gợi ý/lỗi), `OTienPhieu` (ô tiền to có dấu chấm
 *  nghìn), `ONgayPhieu` (ngày chứng từ, không sau hôm nay), `ThemChiTiet` (nhóm ô gấp), `ChonCach`
 *  (hai thẻ chọn Tiền mặt / Chuyển khoản).
 */
import { Banknote, CircleAlert, Landmark, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { homNayVN } from "../../../utils/ky";
import { NganPhai } from "./NganPhai";
import { TheNho } from "./Cum";

/** Lỗi theo ô: khoá ô → câu lỗi. */
export type LoiForm = Partial<Record<string, string>>;

/** id của ô nhập theo khoá — để nhãn trỏ đúng ô và con trỏ nhảy tới ô sai. */
export const idO = (khoa: string) => `pcf-${khoa}`;

/** Đưa con trỏ tới ô sai đầu tiên theo thứ tự trên form. */
export function nhayToiLoi(loi: LoiForm, thuTu: string[]) {
  const dau = thuTu.find((k) => loi[k]);
  if (dau) document.getElementById(idO(dau))?.focus();
}

/** Lỗi của ô ngày chứng từ (`nhan` = "Ngày chi" / "Ngày thu"): bắt buộc, không sau hôm nay (giờ
 *  Việt Nam, tính lúc bấm). */
export function loiNgayPhieu(v: string | null | undefined, nhan: string): string | undefined {
  if (!v) return `Chọn ${nhan.toLowerCase()}.`;
  if (v > homNayVN()) return `${nhan} không được sau hôm nay.`;
  return undefined;
}

/** Một ô của form: nhãn (dấu * đỏ nếu bắt buộc) — điều khiển — gợi ý hoặc lỗi. */
export function OF({
  khoa,
  nhan,
  batBuoc,
  loi,
  goi,
  rong,
  ngay,
  children,
}: {
  khoa: string;
  nhan: string;
  batBuoc?: boolean;
  loi?: string;
  goi?: ReactNode;
  rong?: boolean;
  ngay?: boolean;
  children: ReactNode;
}) {
  const lop = ["kt-o", rong ? "kt-o--rong" : "", ngay ? "kt-o--ngay" : "", loi ? "kt-o--loi" : ""].filter(Boolean).join(" ");
  return (
    <div className={lop}>
      <label htmlFor={idO(khoa)}>
        {nhan}
        {batBuoc && <em className="kt-bb">*</em>}
      </label>
      {children}
      {loi ? (
        <span className="kt-o__loi" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {loi}
        </span>
      ) : goi != null ? (
        <span className="kt-o__goi">{goi}</span>
      ) : null}
    </div>
  );
}

/** Viết số (có thể có phần lẻ) theo kiểu Việt Nam: "1.234,5"; 0 ⇒ ô trống. */
function vietSoLe(n: number): string {
  return n ? n.toLocaleString("vi-VN", { maximumFractionDigits: 6 }) : "";
}

/** Đọc chữ đang gõ kiểu Việt Nam: dấu chấm là phân cách nghìn, dấu PHẨY là dấu thập phân. */
export function docSoLe(chu: string, toiDaLe = 6): { chu: string; so: number } {
  const sach = chu.replace(/[^\d.,]/g, "");
  const phay = sach.indexOf(",");
  const nguyen = (phay < 0 ? sach : sach.slice(0, phay)).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const le = phay < 0 ? null : sach.slice(phay + 1).replace(/\D/g, "").slice(0, toiDaLe);
  const nguyenSo = nguyen ? Number(nguyen) : 0;
  const hien = nguyen ? nguyenSo.toLocaleString("vi-VN") : le != null ? "0" : "";
  return {
    chu: le != null ? `${hien},${le}` : hien,
    so: Number(`${nguyenSo}.${le || 0}`),
  };
}

/** Ô số nhận phần lẻ (ngoại tệ, tỷ giá): giữ nguyên chữ đang gõ ("1.234," chưa xong vẫn hiện). */
function OSoLe({ khoa, value, onChange, hauTo, loi }: {
  khoa: string; value: number; onChange: (v: number) => void; hauTo: string; loi?: boolean;
}) {
  const [chu, setChu] = useState(() => vietSoLe(value));
  const daGui = useRef(value);
  // Giá trị đổi từ ngoài (điền sẵn, chọn lại) thì viết lại; giá trị do chính ô này gửi thì giữ chữ đang gõ.
  useEffect(() => {
    if (value !== daGui.current) {
      daGui.current = value;
      setChu(vietSoLe(value));
    }
  }, [value]);
  return (
    <div className="kt-o-tien">
      <input id={idO(khoa)} type="text" inputMode="decimal" placeholder="0" aria-invalid={loi || undefined}
        value={chu}
        onChange={(e) => {
          const d = docSoLe(e.target.value);
          daGui.current = d.so;
          setChu(d.chu);
          onChange(d.so);
        }} />
      <span>{hauTo}</span>
    </div>
  );
}

/** Ô tiền 52px chữ đậm, gõ số trần hiện dấu chấm nghìn, hậu tố "đ" (hoặc mã ngoại tệ).
 *  Không dùng `type="number"`: mười chữ số không dấu chấm thì không ai đếm nổi số 0.
 *  `soLe` = nhận phần lẻ sau dấu phẩy (số ngoại tệ, tỷ giá). */
export function OTienPhieu({
  khoa,
  value,
  onChange,
  hauTo = "đ",
  loi,
  soLe,
}: {
  khoa: string;
  value: number;
  onChange: (v: number) => void;
  hauTo?: string;
  loi?: boolean;
  soLe?: boolean;
}) {
  if (soLe) return <OSoLe khoa={khoa} value={value} onChange={onChange} hauTo={hauTo} loi={loi} />;
  return (
    <div className="kt-o-tien">
      <input id={idO(khoa)} type="text" inputMode="numeric" placeholder="0" aria-invalid={loi || undefined}
        value={value ? value.toLocaleString("vi-VN") : ""}
        onChange={(e) => {
          const so = e.target.value.replace(/\D/g, "");
          onChange(so ? Number(so) : 0);
        }} />
      <span>{hauTo}</span>
    </div>
  );
}

/** Ô ngày chứng từ — mặc định hôm nay, trần là hôm nay theo giờ Việt Nam TÍNH LÚC VẼ (đặc tả A.14). */
export function ONgayPhieu({
  khoa,
  nhan,
  goi,
  value,
  onChange,
  loi,
  min,
}: {
  khoa: string;
  nhan: string;
  goi: string;
  value: string;
  onChange: (v: string) => void;
  loi?: string;
  /** Ngày sớm nhất được chọn (vd ngày hoá đơn của khung Thu tiền). */
  min?: string;
}) {
  return (
    <OF khoa={khoa} nhan={nhan} batBuoc ngay loi={loi} goi={goi}>
      <input id={idO(khoa)} type="date" min={min} max={homNayVN()} value={value}
        aria-invalid={loi ? true : undefined} onChange={(e) => onChange(e.target.value)} />
    </OF>
  );
}

/** Nút gấp liệt kê các ô đang ẩn bằng thẻ nhỏ; mở rồi thì hiện nhóm ô (không gấp lại được —
 *  ô đã gõ mà biến mất là mất dấu). */
export function ThemChiTiet({
  nhan = "Thêm chi tiết",
  tieu = "Chi tiết thêm",
  cacO,
  mo,
  onMo,
  children,
}: {
  nhan?: string;
  tieu?: string;
  cacO: string[];
  mo: boolean;
  onMo: () => void;
  children: ReactNode;
}) {
  if (mo) {
    return (
      <div className="kt-f__muc">
        <div className="kt-f__tieu">{tieu}</div>
        {children}
      </div>
    );
  }
  return (
    <button type="button" className="kt-them" onClick={onMo}>
      <Plus size={16} aria-hidden="true" />
      {nhan}
      <small className="kt-cum">
        {cacO.map((o) => (
          <TheNho key={o}>{o}</TheNho>
        ))}
      </small>
    </button>
  );
}

/** Một thẻ chọn: vòng icon + tên + một dòng giải thích; thẻ đang chọn viền charcoal đủ cạnh. */
export function TheChon({ on, icon, ten, giai, disabled, id, onClick }: {
  on: boolean; icon: ReactNode; ten: string; giai: string; disabled?: boolean; id?: string; onClick: () => void;
}) {
  return (
    <button type="button" id={id} className={on ? "on" : undefined} aria-pressed={on} disabled={disabled} onClick={onClick}>
      <i>{icon}</i>
      <span>
        <b>{ten}</b>
        <small>{giai}</small>
      </span>
    </button>
  );
}

/** Hai thẻ chọn Tiền mặt / Chuyển khoản ("Trả bằng" của phiếu chi, "Nhận bằng" của phiếu thu). */
export function ChonCach({
  giaTri,
  onDoi,
  khoa,
  nhan,
  giaiTienMat,
  giaiChuyenKhoan,
}: {
  giaTri: "cash" | "bank_transfer";
  onDoi: (v: "cash" | "bank_transfer") => void;
  khoa: string;
  nhan: string;
  giaiTienMat: string;
  giaiChuyenKhoan: string;
}) {
  return (
    <div className="kt-cach" role="group" aria-label={nhan}>
      <TheChon id={idO(khoa)} on={giaTri === "cash"} icon={<Banknote size={18} aria-hidden="true" />} ten="Tiền mặt"
        giai={giaiTienMat} onClick={() => onDoi("cash")} />
      <TheChon on={giaTri === "bank_transfer"} icon={<Landmark size={18} aria-hidden="true" />} ten="Chuyển khoản"
        giai={giaiChuyenKhoan} onClick={() => onDoi("bank_transfer")} />
    </div>
  );
}

export function KhungFormPhieu({
  duongDan,
  tieuDe,
  tomTat,
  xemTruoc,
  dangLuu,
  loiChung,
  onDong,
  chanDong,
  onSubmit,
  nhanNut,
  nhanDangLuu = "Đang lập…",
  tang,
  khoaNut = false,
  hep = false,
  children,
}: {
  duongDan: ReactNode;
  tieuDe: ReactNode;
  /** Dải chỉ đọc 4 ô nền --paper (số đơn mua, số chốt gia công, phiếu chi gốc). */
  tomTat?: { nhan: string; giaTri: ReactNode }[];
  /** Câu xem trước ở chân: "Chi 5.200.000 đ tiền mặt cho …". */
  xemTruoc: ReactNode;
  dangLuu: boolean;
  /** Lỗi từ máy chủ — hiện đầu form, trong ngăn. */
  loiChung: string | null;
  onDong: () => void;
  /** true = form đã gõ dở. */
  chanDong: () => boolean;
  onSubmit: () => void;
  /** Chữ nút chính ("Lập phiếu chi", "Lập phiếu thu", "Lưu thay đổi"…); sau khi phiếu đã lập mà
   *  chứng từ tải lên hỏng thì thành "Mở phiếu đã lập". */
  nhanNut: string;
  nhanDangLuu?: string;
  /** 1 = form chồng lên một ngăn khác (Trả nhiều đợt trên ngăn nhà cung cấp): Esc chỉ đóng lớp này. */
  tang?: number;
  /** true = khoá nút chính (vd lượt trả không còn đợt nào). */
  khoaNut?: boolean;
  /** Form ít ô (form tài khoản): cột ô tối đa 560px canh trái, ngăn vẫn giữ độ rộng chung (A.5). */
  hep?: boolean;
  children: ReactNode;
}) {
  const idForm = useId();
  return (
    <NganPhai
      duongDan={duongDan}
      tieuDe={tieuDe}
      tomTat={tomTat}
      tang={tang}
      // Đang lưu thì KHÔNG đóng được (Esc, nút X): lời gọi lập còn chạy, đóng giữa chừng là mất câu
      // báo tệp tải hỏng và trang không được báo phiếu mới. Không hỏi — chặn hẳn.
      onDong={() => {
        if (!dangLuu) onDong();
      }}
      chanDong={() => !dangLuu && chanDong()}
      chan={
        <>
          <span className="kt-ngan__xt">{xemTruoc}</span>
          <button type="button" className="kt-btn kt-btn--tron" disabled={dangLuu}
            onClick={() => {
              if (chanDong() && !window.confirm("Bỏ nội dung đang nhập?")) return;
              onDong();
            }}>
            Đóng
          </button>
          <button type="submit" form={idForm} className="kt-btn kt-btn--chinh" disabled={dangLuu || khoaNut}>
            {dangLuu ? nhanDangLuu : nhanNut}
          </button>
        </>
      }
    >
      <form id={idForm} className={hep ? "kt-f kt-f--hep" : "kt-f"} noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}>
        {loiChung && (
          <p className="kt-o__loi" role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            {loiChung}
          </p>
        )}
        {children}
      </form>
    </NganPhai>
  );
}
