import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { chuanKho, nhanKho, tachKho } from "./tienIchKho";
import "./khungKho.css";

/** Khổ giấy: hai cạnh mm. `dai = 0` = khổ chỉ rộng (giấy khổ rộng chưa cắt). 10/10/2026 giấy bỏ
 *  dạng cuộn/tờ: không còn nút đổi dạng, đơn vị gốc máy chủ tự suy từ ĐVT của dòng. */
export interface GiaTriKho {
  rong: number;
  dai: number;
}

export interface GoiYKho {
  rong: number;
  dai: number;
  /** Chữ phụ bên phải dòng gợi ý, vd "Tồn 7.240 tờ" hoặc "Đã mua". */
  ghiChu?: string;
}

interface Props extends GiaTriKho {
  onChange: (v: GiaTriKho) => void;
  /** Khổ đang có trong kho / đã mua — mở khi bấm vào khung. */
  goiY?: GoiYKho[];
  chiDoc?: boolean;
  /** Ép trạng thái lỗi từ ngoài (vd khác khổ đặt ⇒ viền vàng thì dùng `canh`). */
  canh?: boolean;
  ariaLabel?: string;
}

/** Ô khổ giấy ghép (mockup A2b): Rộng × Dài mm, ô Dài để trống được (khổ chỉ rộng). Gõ hoặc dán
 *  "790x1090" vào ô đầu là tách đủ hai cạnh; rời ô là tự xếp cạnh ngắn trước. */
export function KhungKho({
  rong, dai, onChange, goiY = [], chiDoc, canh, ariaLabel,
}: Props) {
  const [a, setA0] = useState(rong ? String(rong) : "");
  const [b, setB0] = useState(dai ? String(dai) : "");
  // Chữ MỚI NHẤT của hai ô, ghi đồng bộ. Rời ô chốt theo ref chứ không theo state của lần vẽ: chọn
  // gợi ý xong mà blur tới trước khi React vẽ lại thì state còn rỗng, chốt theo nó là đè khổ vừa
  // chọn thành 0 × 0 (bấm chuột thật lúc ăn lúc không, 07/10/2026).
  const chu = useRef({ a, b });
  const setA = (v: string) => { chu.current.a = v; setA0(v); };
  const setB = (v: string) => { chu.current.b = v; setB0(v); };
  const [mo, setMo] = useState(false);
  const [sang, setSang] = useState(0);
  const [dangGo, setDangGo] = useState(false);
  // Hộp gợi ý neo `fixed` theo toạ độ khung: khung hay nằm trong bảng `overflow-x: auto`, để
  // `absolute` thì bị bảng cắt mất phần thò xuống dưới.
  const [viTri, setViTri] = useState<{ left: number; top: number } | null>(null);
  const goc = useRef<HTMLDivElement>(null);

  useEffect(() => { setA(rong ? String(rong) : ""); }, [rong]);
  useEffect(() => { setB(dai ? String(dai) : ""); }, [dai]);

  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => {
      if (goc.current && !goc.current.contains(e.target as Node)) setMo(false);
    };
    const neo = () => {
      const r = goc.current?.getBoundingClientRect();
      if (r) setViTri({ left: r.left, top: r.bottom + 6 });
    };
    neo();
    document.addEventListener("mousedown", dong);
    window.addEventListener("scroll", neo, true);
    window.addEventListener("resize", neo);
    return () => {
      document.removeEventListener("mousedown", dong);
      window.removeEventListener("scroll", neo, true);
      window.removeEventListener("resize", neo);
    };
  }, [mo]);

  if (chiDoc) {
    const nhan = nhanKho(rong, dai);
    return <span className="kk-doc">{nhan ? `${nhan} mm` : "chưa có khổ"}</span>;
  }

  const goiLoc = goiY.filter((g) => g.rong > 0);

  function chot() {
    const { a: chuA, b: chuB } = chu.current;
    const x = Number(chuA.replace(/\D/g, "")) || 0;
    const y = Number(chuB.replace(/\D/g, "")) || 0;
    // Chỉ gõ ô Dài mà bỏ trống ô Rộng ⇒ `chuanKho` dồn cạnh đó về ô Rộng (khổ chỉ rộng).
    const [r, d] = chuanKho(x, y);
    onChange({ rong: r, dai: d });
  }

  function goA(chuMoi: string) {
    if (/[x×X*\s]/.test(chuMoi.trim())) {
      const t = tachKho(chuMoi);
      if (t) {
        setA(String(t.rong));
        setB(t.dai ? String(t.dai) : "");
        onChange({ rong: t.rong, dai: t.dai });
        return;
      }
    }
    setA(chuMoi.replace(/\D/g, ""));
  }

  function chon(g: GoiYKho) {
    setA(String(g.rong));
    setB(g.dai ? String(g.dai) : "");
    onChange({ rong: g.rong, dai: g.dai });
    setMo(false);
  }

  function phim(e: KeyboardEvent<HTMLInputElement>) {
    if (!mo || goiLoc.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSang((i) => (i + 1) % goiLoc.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSang((i) => (i - 1 + goiLoc.length) % goiLoc.length); }
    else if (e.key === "Enter") { e.preventDefault(); chon(goiLoc[sang]); }
    else if (e.key === "Escape") setMo(false);
  }

  const lop = ["kk", dangGo && "dang-go", canh && "canh"].filter(Boolean).join(" ");
  return (
    <div className="kk-wrap" ref={goc}>
      <div className={lop} aria-label={ariaLabel ?? "Khổ giấy"}>
        <input
          className="kk-o"
          inputMode="numeric"
          placeholder="Rộng"
          aria-label="Cạnh rộng (mm)"
          value={a}
          onChange={(e) => goA(e.target.value)}
          onFocus={() => { setDangGo(true); setMo(true); setSang(0); }}
          onBlur={() => { setDangGo(false); chot(); }}
          onKeyDown={phim}
        />
        <span className="kk-x">×</span>
        <input
          className="kk-o"
          inputMode="numeric"
          placeholder="Dài"
          aria-label="Cạnh dài (mm), để trống nếu chỉ có khổ rộng"
          value={b}
          onChange={(e) => setB(e.target.value.replace(/\D/g, ""))}
          onFocus={() => { setDangGo(true); setMo(true); setSang(0); }}
          onBlur={() => { setDangGo(false); chot(); }}
          onKeyDown={phim}
        />
        <span className="kk-mm">mm</span>
      </div>
      {mo && goiLoc.length > 0 && (
        <div className="kk-goi" role="listbox" style={viTri ? { position: "fixed", ...viTri } : undefined}>
          <div className="kk-gh">Khổ đã có</div>
          {goiLoc.map((g, i) => (
            <div
              // Cùng khổ có thể hai dòng (tồn theo tờ và tồn theo kg) ⇒ khoá kèm thứ tự.
              key={`${g.rong}x${g.dai}-${i}`}
              role="option"
              aria-selected={i === sang}
              className={`kk-gr${i === sang ? " on" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); chon(g); }}
            >
              <b>{nhanKho(g.rong, g.dai)}</b>
              {g.ghiChu && <span className="kk-end">{g.ghiChu}</span>}
            </div>
          ))}
          <div className="kk-gf">Gõ khổ khác, hoặc dán 790x1090 vào ô đầu. Chỉ có khổ rộng thì để trống ô Dài.</div>
        </div>
      )}
    </div>
  );
}
