// Bong bóng CÔNG THỨC — rê chuột (hoặc focus/chạm) vào chữ neo thì hiện, rời ra thì tắt.
//
// Vì sao không bày công thức ra luôn: công thức là thứ để KIỂM khi nghi, không phải thứ đọc mỗi lần
// mở. Bày ra thì một câu `if (…)` dài ba dòng chiếm nửa thẻ, đẩy con số chính ra khỏi tầm mắt. Cùng
// lối với ô lượng ở chuỗi công đoạn màn Tính giá (`BuocVatTu` › `OLuong`): bong bóng tối, dòng trên
// là công thức bằng chữ, dòng dưới "= thế số = kết quả".
//
// Vẽ qua portal với toạ độ `fixed` (như `HoverTip`): bảng vật tư của ngăn bước khai
// `overflow: hidden`, bong bóng tuyệt đối nằm trong đó sẽ bị cắt mất.
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ngatDongIf } from "../lib/ngatDongCongThuc";
import "./cong-thuc-tip.css";

const KHOANG = 8;
const LE = 12;

/** "công thức = thế số = kết quả" → từng vế. Tách ở dấu `=` ĐỨNG RIÊNG (có khoảng trắng hai bên)
 *  nên `<=` / `>=` trong điều kiện `if` không bị cắt. */
function tachVe(s: string): string[] {
  return s
    .split(/\s=\s/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Vế CUỐI của câu diễn giải — con số đã ra ("… = 1.180.000 tờ in" → "1.180.000 tờ in"). Dùng cho
 *  dòng tóm tắt hiện sẵn khi công thức đầy đủ đã giấu vào bong bóng. */
export function ketQuaDienGiai(s: string): string {
  const ve = tachVe(s);
  return ve[ve.length - 1] ?? s;
}

function Ve({ text, dau, className }: { text: string; dau: string; className: string }) {
  const dong = ngatDongIf(text);
  return (
    <span className={className}>
      {dong.map((l, i) => (
        <span key={i} className="cong-thuc-tip__dong" style={{ "--sau": l.sau } as CSSProperties}>
          {i === 0 ? dau : ""}
          {l.text}
        </span>
      ))}
    </span>
  );
}

export function CongThucTip({
  congThuc,
  them,
  ghiChu,
  children,
}: {
  /** Chuỗi "công thức = thế số = kết quả" (diễn giải server trả). */
  congThuc?: string | null;
  /** Dòng nối tiếp sau kết quả, vd "÷ 9.000/giờ = 131 giờ 7 phút". */
  them?: string | null;
  /** Dòng chú thích nhỏ cuối bong bóng, vd nguồn tính. */
  ghiChu?: string | null;
  children: ReactNode;
}) {
  const id = useId();
  const neo = useRef<HTMLSpanElement | null>(null);
  const bong = useRef<HTMLDivElement | null>(null);
  const [mo, setMo] = useState(false);
  const [vt, setVt] = useState<{ top: number; left: number; tren: boolean; mui: number } | null>(null);

  const ve = tachVe(congThuc ?? "");
  const coNoiDung = ve.length > 0 || Boolean(them) || Boolean(ghiChu);

  useLayoutEffect(() => {
    if (!mo || !neo.current || !bong.current) return;
    const r = neo.current.getBoundingClientRect();
    const b = bong.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Neo mép TRÁI của chữ — tên vật tư / tiêu đề nằm bên trái, bong bóng mọc từ đó sang phải.
    const left = Math.min(Math.max(r.left, LE), vw - b.width - LE);
    const tren = r.bottom + KHOANG + b.height > vh - LE && r.top - KHOANG - b.height > LE;
    const top = tren ? r.top - KHOANG - b.height : r.bottom + KHOANG;
    const giua = r.left + Math.min(r.width / 2, 24);
    setVt({ top, left, tren, mui: Math.min(Math.max(giua - left, 14), b.width - 14) });
  }, [mo, congThuc, them, ghiChu]);

  useLayoutEffect(() => {
    if (!mo) return;
    const dong = () => setMo(false);
    window.addEventListener("scroll", dong, true);
    window.addEventListener("resize", dong);
    return () => {
      window.removeEventListener("scroll", dong, true);
      window.removeEventListener("resize", dong);
    };
  }, [mo]);

  if (!coNoiDung) return <>{children}</>;

  const bat = () => {
    setVt(null);
    setMo(true);
  };
  const tat = () => setMo(false);

  return (
    <>
      <span
        ref={neo}
        className="cong-thuc-tip__neo"
        tabIndex={0}
        aria-describedby={mo ? id : undefined}
        onMouseEnter={bat}
        onMouseLeave={tat}
        onFocus={bat}
        onBlur={tat}
        onKeyDown={(e) => {
          if (e.key === "Escape") tat();
        }}
      >
        {children}
      </span>
      {mo &&
        createPortal(
          <div
            ref={bong}
            id={id}
            role="tooltip"
            className={`cong-thuc-tip${vt ? " cong-thuc-tip--hien" : ""}${vt?.tren ? " cong-thuc-tip--tren" : ""}`}
            style={{ top: vt?.top ?? 0, left: vt?.left ?? 0, ["--mui" as string]: `${vt?.mui ?? 14}px` }}
          >
            {ve.map((v, i) => (
              <Ve
                key={i}
                text={v}
                dau={i === 0 ? "" : "= "}
                className={
                  i === 0 && ve.length > 1
                    ? "cong-thuc-tip__goc"
                    : i === ve.length - 1
                      ? "cong-thuc-tip__kq"
                      : "cong-thuc-tip__so"
                }
              />
            ))}
            {them && <span className="cong-thuc-tip__kq">{them}</span>}
            {ghiChu && <span className="cong-thuc-tip__ghi-chu">{ghiChu}</span>}
          </div>,
          document.body,
        )}
    </>
  );
}
