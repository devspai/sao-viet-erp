// Ô nhập SỐ có đơn vị NẰM TRONG ô ("%", "đ") — kiểu số Việt (dấu chấm nghìn, dấu phẩy thập phân),
// không có mũi tên tăng giảm của trình duyệt. Đang gõ thì giữ nguyên chữ người dùng gõ (gõ "22,"
// không bị nuốt dấu phẩy); rời ô mới chốt số. Phím lên/xuống nhích theo `buoc` nếu có.
import { useRef, useState, type KeyboardEvent } from "react";

const dinhDang = (v: number, soLe: number) =>
  Number.isFinite(v) ? v.toLocaleString("vi-VN", { maximumFractionDigits: soLe }) : "";

/** "1.250.000" → 1250000 ; "22,5" → 22.5 ; rỗng → null. */
export function docSoVN(chu: string): number | null {
  const t = chu.replace(/\s|đ|%/g, "").replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ONhapSo({
  giaTri,
  donVi,
  soLe = 0,
  buoc,
  className = "",
  disabled,
  title,
  ariaLabel,
  onNhap,
  onChot,
  onHuy,
}: {
  giaTri: number;
  donVi: string;
  soLe?: number;
  buoc?: number;
  className?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
  /** Mỗi lần gõ — để bảng tính lại ngay (nháp, chưa lưu). */
  onNhap?: (v: number) => void;
  /** Rời ô / Enter — lưu. */
  onChot: (v: number) => void;
  /** Esc — bỏ số đang gõ; trang xoá bản nháp đã đẩy qua onNhap. */
  onHuy?: () => void;
}) {
  const [chu, setChu] = useState<string | null>(null);   // null = không đang gõ
  // Số lúc VÀO ô — so với số này khi rời ô (giaTri có thể đã bị onNhap đẩy theo bản nháp).
  const goc = useRef(giaTri);
  const huy = useRef(false);
  const hien = chu ?? dinhDang(giaTri, soLe);

  const chot = () => {
    if (chu == null) return;
    setChu(null);
    if (huy.current) {
      huy.current = false;
      onHuy?.();
      return;
    }
    const v = docSoVN(chu);
    if (v != null && v !== goc.current) onChot(v);
    else onHuy?.();   // gõ rồi trả về số cũ / xoá trắng: không lưu, bỏ bản nháp
  };
  const phim = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    if (e.key === "Escape") {
      huy.current = true;
      (e.target as HTMLInputElement).blur();
    }
    if (buoc && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const hienTai = docSoVN(chu ?? "") ?? giaTri;
      const v = Math.max(0, Math.round((hienTai + (e.key === "ArrowUp" ? buoc : -buoc)) * 100) / 100);
      setChu(dinhDang(v, soLe));
      onNhap?.(v);
    }
  };
  return (
    <label className={`nf ${className}`.trim()} title={title}>
      <input
        value={hien}
        inputMode={soLe > 0 ? "decimal" : "numeric"}
        disabled={disabled}
        aria-label={ariaLabel}
        onFocus={(e) => {
          goc.current = giaTri;
          setChu(dinhDang(giaTri, soLe));
          e.target.select();
        }}
        onChange={(e) => {
          setChu(e.target.value);
          const v = docSoVN(e.target.value);
          if (v != null) onNhap?.(v);
        }}
        onBlur={chot}
        onKeyDown={phim}
      />
      <span className="u">{donVi}</span>
    </label>
  );
}
