import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LoaiMua, MuaChoLenh } from "../../../api/client";
import "./mua-cho.css";

/**
 * Ô "Mua cho" (08/10/2026) — món / yêu cầu / dòng đơn / đơn mua này mua cho lệnh nào, hay cho tồn
 * kho, hay theo yêu cầu của bộ phận. Dùng chung ở Yêu cầu mua hàng, Mua hàng, Kế toán, Nhà cung
 * cấp, Kho — một chỗ vẽ để mọi màn nói cùng một kiểu.
 *
 * Có lệnh: chip tím mã lệnh đầu (bấm mở lệnh) + "+N" rê chuột ra thẻ nổi liệt kê từng lệnh kèm số.
 * Thẻ nổi vẽ qua portal vì ô lưới cắt chữ (khuôn `ChipMatHang` ở Nhà cung cấp).
 */
export function OMuaCho({
  loai,
  lenh,
  donVi,
  onMoLenh,
}: {
  loai: LoaiMua[] | null | undefined;
  lenh: MuaChoLenh[] | null | undefined;
  /** Đơn vị của `so_luong` trong thẻ nổi (đơn vị gốc của mặt hàng). */
  donVi?: string | null;
  onMoLenh?: (l: MuaChoLenh) => void;
}) {
  const ds = lenh ?? [];
  const cac = loai ?? [];
  const khac = cac.filter((x) => x !== "cho_lsx");
  if (!ds.length && !cac.length) return <span className="mc-trong">Chưa rõ</span>;
  return (
    <span className="mc-o">
      {ds.length > 0 && <ChipLenh l={ds[0]} onMoLenh={onMoLenh} />}
      {ds.length > 1 && <ThemLenh ds={ds} donVi={donVi} onMoLenh={onMoLenh} />}
      {!ds.length && cac.includes("cho_lsx") && <span className="mc-chip mc-chip--lenh">Cho lệnh SX</span>}
      {khac.map((x) => (
        <span key={x} className={`mc-chip ${x === "mua_ton" ? "mc-chip--ton" : "mc-chip--yc"}`}>
          {x === "mua_ton" ? "Tồn kho" : "Theo yêu cầu"}
        </span>
      ))}
    </span>
  );
}

function ChipLenh({ l, onMoLenh }: { l: MuaChoLenh; onMoLenh?: (l: MuaChoLenh) => void }) {
  if (!onMoLenh) return <span className="mc-chip mc-chip--lenh">{l.ma}</span>;
  return (
    <button
      type="button"
      className="mc-chip mc-chip--lenh is-bam"
      title={`Mở ${l.loai === "bai" ? "bài ghép" : "lệnh"} ${l.ma}`}
      onClick={(e) => {
        e.stopPropagation();
        onMoLenh(l);
      }}
    >
      {l.ma}
    </button>
  );
}

const soVN = (v: number) => v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

function ThemLenh({ ds, donVi, onMoLenh }: { ds: MuaChoLenh[]; donVi?: string | null; onMoLenh?: (l: MuaChoLenh) => void }) {
  const nut = useRef<HTMLButtonElement | null>(null);
  const hen = useRef<number | undefined>(undefined);
  const [vt, setVt] = useState<{ x: number; y: number; len: boolean } | null>(null);
  const mo = () => {
    window.clearTimeout(hen.current);
    const r = nut.current?.getBoundingClientRect();
    if (!r) return;
    const len = window.innerHeight - r.bottom < 40 + ds.length * 28;
    setVt({ x: Math.max(8, Math.min(r.left, window.innerWidth - 248)), y: len ? r.top - 6 : r.bottom + 6, len });
  };
  const dong = () => {
    window.clearTimeout(hen.current);
    hen.current = window.setTimeout(() => setVt(null), 150);
  };
  useEffect(() => () => window.clearTimeout(hen.current), []);
  useEffect(() => {
    if (!vt) return;
    const tat = () => setVt(null);
    window.addEventListener("scroll", tat, true);
    return () => window.removeEventListener("scroll", tat, true);
  }, [vt]);
  return (
    <>
      <button
        ref={nut}
        type="button"
        className="mc-them"
        aria-label={`Xem cả ${ds.length} lệnh`}
        onMouseEnter={mo}
        onMouseLeave={dong}
        onFocus={mo}
        onBlur={dong}
        onClick={(e) => {
          e.stopPropagation();
          if (vt) setVt(null);
          else mo();
        }}
      >
        +{ds.length - 1}
      </button>
      {vt &&
        createPortal(
          <div
            className={`mc-the${vt.len ? " is-len" : ""}`}
            role="tooltip"
            style={{ left: vt.x, top: vt.y }}
            onMouseEnter={() => window.clearTimeout(hen.current)}
            onMouseLeave={dong}
          >
            <div className="mc-the__dau">Mua cho {ds.length} lệnh</div>
            {ds.map((l) => (
              <div key={`${l.loai}-${l.id}`} className="mc-the__dong">
                <ChipLenh
                  l={l}
                  onMoLenh={
                    onMoLenh
                      ? (x) => {
                          setVt(null);
                          onMoLenh(x);
                        }
                      : undefined
                  }
                />
                <span>
                  {l.so_luong != null ? soVN(l.so_luong) : "Chưa ghi số"}
                  {l.so_luong != null && donVi ? <small> {donVi}</small> : null}
                </span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Mở lệnh / bài ghép từ chip. Không có `navigate` (màn không điều hướng được) thì chip chỉ để đọc. */
export function useMoLenh(
  navigate?: (page: string, params?: { openLsxId?: number; openBaiGhepId?: number }) => void,
): ((l: MuaChoLenh) => void) | undefined {
  const mo = useCallback(
    (l: MuaChoLenh) => {
      if (!navigate) return;
      if (l.loai === "bai") navigate("bai-ghep-2", { openBaiGhepId: l.id });
      else navigate("ke-hoach-sx", { openLsxId: l.id });
    },
    [navigate],
  );
  return navigate ? mo : undefined;
}

/** Khoá so "Mua cho" của hai dòng: cùng khoá ⇒ cùng nói một điều, đầu ngăn nói một lần là đủ. */
export function khoaMuaCho(loai: readonly LoaiMua[] | null | undefined, lenh: readonly MuaChoLenh[] | null | undefined): string {
  return `${[...(loai ?? [])].sort().join(",")}|${(lenh ?? []).map((l) => `${l.loai}${l.id}`).sort().join(",")}`;
}

/** Nhãn chữ của loại mua — cho ô chọn / lọc / tóm tắt ngăn. */
export const LOAI_MUA_NHAN: Record<LoaiMua, string> = {
  theo_yeu_cau: "Theo yêu cầu",
  cho_lsx: "Cho lệnh SX",
  mua_ton: "Tồn kho",
};
