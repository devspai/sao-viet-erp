// Dấu hỏi + bong bóng giải thích, hiện NGAY khi rê chuột / focus bàn phím.
// Thay cho `title=` của trình duyệt: cái đó chờ gần một giây mới hiện, chữ xám nhỏ, không xuống
// dòng theo ý. Bong bóng vẽ qua portal với toạ độ `fixed` nên không bị khung cuộn của hộp thoại cắt
// mất, và tự lật lên trên khi sát đáy màn hình.
//
// Chữ giải thích được tách thành ba phần để người đọc phân biệt được ĐÂU LÀ LỰA CHỌN, ĐÂU LÀ TÁC
// DỤNG của nó:
//   · câu mở đầu không có nhãn  → đoạn dẫn;
//   · "Xem: …", "Thao tác: …", "Của tôi: …" … → mỗi ý một dòng, nhãn thành thẻ ở cột trái;
//   · "Lưu ý: …"                → dòng chú thích nhỏ ở cuối.
// Đoạn nào có dạng "Cho phép: việc A; việc B; việc C." (ngăn bằng dấu `;`) thì bày thành danh
// sách gạch đầu dòng — nhiều việc dồn một câu dài thì không ai đọc nổi.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import "./hover-tip.css";

const RONG = 340;
const KHOANG = 8;
const LE = 12;

const NHAN = ["Xem", "Thao tác", "Của tôi", "Cả phòng", "Tất cả", "Lưu ý"];
const TACH = new RegExp(`(?<=\\.)\\s+(?=(?:${NHAN.join("|")}):)`);
const DAU = new RegExp(`^(${NHAN.join("|")}):\\s*`);

function hoaDau(s: string): string {
  return s ? s[0].toLocaleUpperCase("vi") + s.slice(1) : s;
}

function phanTich(text: string) {
  const dan: string[] = [];
  const dong: { nhan: string; noi: string }[] = [];
  const luuY: string[] = [];
  for (const c of text.split(TACH)) {
    const m = c.match(DAU);
    if (!m) dan.push(c);
    else if (m[1] === "Lưu ý") luuY.push(hoaDau(c.slice(m[0].length)));
    else dong.push({ nhan: m[1], noi: hoaDau(c.slice(m[0].length)) });
  }
  return { dan: dan.join(" "), dong, luuY };
}

//: "Câu dẫn: a; b; c." → câu dẫn + danh sách. Không có `;` thì trả nguyên chữ.
function DoanVan({ text, className }: { text: string; className?: string }) {
  if (!text.includes(";")) return <p className={className}>{text}</p>;
  const hai = text.indexOf(":");
  const coDan = hai > -1 && hai < text.indexOf(";");
  const dan = coDan ? text.slice(0, hai + 1) : "";
  const muc = (coDan ? text.slice(hai + 1) : text)
    .split(";")
    .map((m) => m.trim().replace(/\.$/, ""))
    .filter(Boolean);
  return (
    <>
      {dan && <p className={className}>{dan}</p>}
      <ul className="hover-tip__ds">
        {muc.map((m, i) => (
          <li key={i}>{hoaDau(m)}</li>
        ))}
      </ul>
    </>
  );
}

//: `children` thay phần thân dựng từ `text` — cho nội dung không phải câu chữ (vd. công thức nhiều
//: dòng thụt lề ở khối Giá vốn). `rong` nới bề ngang tối đa cho nội dung dài. `neo` thay dấu hỏi
//: bằng chính phần tử được rê chuột (vd. ô lượng vật tư), `lopNeo` là lớp CSS của phần tử đó.
export function HoverTip({ text = "", tieuDe, children, rong = RONG, neo: noiDungNeo, lopNeo }: {
  text?: string;
  tieuDe?: string;
  children?: ReactNode;
  rong?: number;
  neo?: ReactNode;
  lopNeo?: string;
}) {
  const id = useId();
  const neo = useRef<HTMLSpanElement | null>(null);
  const bong = useRef<HTMLDivElement | null>(null);
  const [mo, setMo] = useState(false);
  const [vt, setVt] = useState<{ top: number; left: number; tren: boolean; mui: number; lech: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!mo || !neo.current || !bong.current) return;
    const r = neo.current.getBoundingClientRect();
    const b = bong.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const giua = r.left + r.width / 2;
    const left = Math.min(Math.max(giua - b.width / 2, LE), vw - b.width - LE);
    // Dưới đủ chỗ thì mở xuống, không thì lật lên; cả hai phía đều thiếu (công thức `if` nhiều tầng)
    // thì đặt bên rộng hơn rồi ép trọn trong màn hình — thà che neo còn hơn mất nửa dưới công thức.
    const choDuoi = vh - LE - r.bottom - KHOANG;
    const choTren = r.top - KHOANG - LE;
    const tren = b.height > choDuoi && (b.height <= choTren || choTren > choDuoi);
    const muon = tren ? r.top - KHOANG - b.height : r.bottom + KHOANG;
    const top = Math.min(Math.max(muon, LE), Math.max(vh - b.height - LE, LE));
    setVt({ top, left, tren, mui: Math.min(Math.max(giua - left, 14), b.width - 14), lech: top !== muon });
  }, [mo, text]);

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

  const bat = () => {
    setVt(null);
    setMo(true);
  };
  const tat = () => setMo(false);
  const nd = mo ? (children ? { dan: "", dong: [], luuY: [] } : phanTich(text)) : null;

  return (
    <>
      <span
        ref={neo}
        className={noiDungNeo ? lopNeo : "hover-tip__icon"}
        tabIndex={0}
        role={noiDungNeo ? undefined : "button"}
        aria-label={noiDungNeo ? undefined : tieuDe ? `Giải thích: ${tieuDe}` : "Giải thích"}
        aria-describedby={mo ? id : undefined}
        onMouseEnter={bat}
        onMouseLeave={tat}
        onFocus={bat}
        onBlur={tat}
        onKeyDown={(e) => {
          if (e.key === "Escape") tat();
        }}
      >
        {noiDungNeo ?? <Icon name="help" size={13} />}
      </span>
      {nd &&
        createPortal(
          <div
            ref={bong}
            id={id}
            role="tooltip"
            className={`hover-tip${vt ? " hover-tip--hien" : ""}${vt?.tren ? " hover-tip--tren" : ""}${vt?.lech ? " hover-tip--lech" : ""}`}
            style={{
              maxWidth: `min(${rong}px, calc(100vw - ${LE * 2}px))`,
              top: vt?.top ?? 0,
              left: vt?.left ?? 0,
              ["--mui" as string]: `${vt?.mui ?? 14}px`,
            }}
          >
            {tieuDe && <div className="hover-tip__tieu-de">{tieuDe}</div>}
            {children}
            {nd.dan && <DoanVan className="hover-tip__dan" text={nd.dan} />}
            {nd.dong.length > 0 && (
              <dl className="hover-tip__dong">
                {nd.dong.map((d) => (
                  <div key={d.nhan} className="hover-tip__hang">
                    <dt>{d.nhan}</dt>
                    <dd>{d.noi.includes(";") ? <DoanVan text={d.noi} /> : d.noi}</dd>
                  </div>
                ))}
              </dl>
            )}
            {nd.luuY.map((l, i) => (
              <p key={i} className="hover-tip__luu-y">{l}</p>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
