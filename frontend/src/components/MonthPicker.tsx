import { ChonThang } from "./ChonNgay";

/** Ô chọn kỳ (tháng/năm) có nhãn TIẾNG VIỆT — giữ tên và props cũ cho các màn đang dùng, ruột là
 *  `ChonThang` (bảng 12 tháng tự vẽ). Trước đây bọc ô `type="month"` của trình duyệt: lịch của nó theo
 *  ngôn ngữ MÁY nên máy tiếng Anh hiện "August 2026" giữa màn tiếng Việt. */
export function MonthPicker({
  value,
  onChange,
  disabled,
  className,
  ariaLabel = "Chọn kỳ",
  min,
  max,
  nhanTrong = "Chọn kỳ",
}: {
  /** Dạng `YYYY-MM`. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Chặn khoảng chọn được, dạng `YYYY-MM`. Tháng ngoài khoảng bị khoá trong bảng. */
  min?: string;
  max?: string;
  /** Chữ hiện khi `value` rỗng — ô LỌC (rỗng = không lọc) truyền "Tất cả các tháng"; khi đó bảng có
   *  thêm nút trả về rỗng. */
  nhanTrong?: string;
}) {
  return (
    <ChonThang value={value} onChange={onChange} disabled={disabled} className={className} aria-label={ariaLabel}
      min={min} max={max} nhanTrong={nhanTrong} xoaDuoc={nhanTrong !== "Chọn kỳ"} />
  );
}
