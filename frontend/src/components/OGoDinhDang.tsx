// Ô chữ mà mỗi phím gõ bị viết lại ngay (chấm nghìn "10.000.000", lọc chữ số…) — chịu được bộ gõ
// tiếng Việt. Bộ gõ VIE của Windows (và mọi bộ gõ dùng "từ đang gõ" gạch chân) nhớ vùng đang gõ
// theo VỊ TRÍ ký tự; viết lại giá trị giữa chừng làm vùng đó lệch, phím sau bộ gõ thay nhầm khúc
// và chữ số bị nhân đôi ("1000000000" thành "11.111.010.000.000"). Trong lúc bộ gõ còn giữ từ
// đang gõ, ô hiện nguyên văn chữ trong ô (trang vẫn nhận onChange từng phím để tính lại ngay);
// bộ gõ chốt xong mới hiện lại giá trị đã định dạng.
import { forwardRef, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & { value: string };

export const OGoDinhDang = forwardRef<HTMLInputElement, Props>(function OGoDinhDang(
  { value, onChange, onCompositionStart, onCompositionEnd, ...con },
  ref,
) {
  const [dangGo, setDangGo] = useState<string | null>(null);
  const goDo = useRef(false);
  return (
    <input
      ref={ref}
      {...con}
      value={dangGo ?? value}
      onCompositionStart={(e) => {
        goDo.current = true;
        setDangGo(e.currentTarget.value);
        onCompositionStart?.(e);
      }}
      onChange={(e) => {
        if (goDo.current) setDangGo(e.target.value);
        onChange?.(e);
      }}
      onCompositionEnd={(e) => {
        goDo.current = false;
        setDangGo(null);
        onCompositionEnd?.(e);
        // Chrome không bắn thêm `input` sau compositionend ⇒ tự đẩy chữ đã chốt cho trang định dạng.
        onChange?.(e as unknown as ChangeEvent<HTMLInputElement>);
      }}
    />
  );
});
