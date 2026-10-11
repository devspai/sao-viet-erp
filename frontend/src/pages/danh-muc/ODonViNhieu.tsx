// Ô "ĐƠN VỊ THÊM" của danh mục Giấy / Vật tư khác (spec 2026-10-10-mat-hang-nhieu-don-vi-tinh §2, §6).
//
// Một mã khai một DANH SÁCH đơn vị: ĐVT chính (ô "ĐVT" ngay trên, giữ nguyên như cũ — đơn giá danh
// mục thuộc nó) + các đơn vị thêm ở đây. Mỗi đơn vị kéo theo cả NHÓM quy đổi của nó (khai kg là có
// g, tấn), nên nút "Thêm đơn vị" ẩn mọi đơn vị đã nằm trong nhóm của ĐVT chính hoặc của đơn vị đã
// thêm. Hai đơn vị khai riêng là hai nhóm không quy đổi lẫn nhau (tờ và kg).
//
// Nhóm dựng ở máy khách từ bảng CẶP quy đổi (`/api/don-vi/quy-doi`) — loang hai chiều, đúng lối
// `quy_doi_service.don_vi_dung_duoc` bên máy chủ (`cap_map` cũng hai chiều). Máy chủ vẫn là cửa chặn
// thật: đơn vị thêm cùng nhóm, hay bỏ đơn vị còn tồn/còn đơn dùng ⇒ 422 với câu tiếng Việt, drawer
// hiện nguyên câu đó.
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../auth/useAuth";
import { crud, type Row } from "../../api/rebuildCatalog";
import { tenDonVi } from "../tenDonVi";

const apiCap = crud("/api/don-vi/quy-doi");

const chuan = (ma: unknown) => String(ma ?? "").trim().toLowerCase();

/** Đồ thị cặp quy đổi `{mã: tập mã kề}`, cả hai chiều — khai "1 tấn = 1.000 kg" là đủ đi ngược. */
function doThi(caps: Row[]): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const c of caps) {
    const tu = chuan(c.tu_ma);
    const den = chuan(c.den_ma);
    if (!tu || !den || tu === den) continue;
    if (!g.has(tu)) g.set(tu, new Set());
    if (!g.has(den)) g.set(den, new Set());
    g.get(tu)!.add(den);
    g.get(den)!.add(tu);
  }
  return g;
}

/** Mọi mã đổi được từ `ma` (gồm cả chính nó), theo thứ tự gần trước xa sau. */
function nhomCua(ma: string, g: Map<string, Set<string>>): string[] {
  const goc = chuan(ma);
  if (!goc) return [];
  const da = new Set([goc]);
  const hang = [goc];
  for (let i = 0; i < hang.length; i++) {
    for (const ke of g.get(hang[i]) ?? []) {
      if (da.has(ke)) continue;
      da.add(ke);
      hang.push(ke);
    }
  }
  return hang;
}

export function ODonViNhieu({ value, chinh, donVi, onChange }: {
  /** Mã các đơn vị thêm, theo thứ tự khai. */
  value: string[];
  /** Mã ĐVT chính (ô "ĐVT" của form) — nhóm của nó cũng bị ẩn khỏi danh sách thêm. */
  chinh: string;
  /** Danh mục Đơn vị (đã bỏ mục ngừng dùng, trừ mục đang chọn) — cùng nguồn ô ĐVT chính. */
  donVi: Row[];
  onChange: (v: string[]) => void;
}) {
  const { token } = useAuth();
  const [caps, setCaps] = useState<Row[] | null>(() => (token ? apiCap.daNho(token) ?? null : null));
  useEffect(() => {
    if (!token) return;
    let song = true;
    const { nho, moi } = apiCap.thamChieu(token);
    if (nho) setCaps(nho);
    // Không nạp được bảng cặp: vẫn thêm được (mỗi đơn vị coi như một nhóm riêng), máy chủ chặn
    // đơn vị cùng nhóm lúc lưu.
    moi.then((r) => { if (song) setCaps(r); }).catch(() => { if (song) setCaps((c) => c ?? []); });
    return () => { song = false; };
  }, [token]);

  const g = useMemo(() => doThi(caps ?? []), [caps]);
  const tenCua = useMemo(() => {
    const m = new Map(donVi.map((d) => [chuan(d.ma), String(d.ten || d.ma)]));
    return (ma: string) => m.get(chuan(ma)) ?? tenDonVi(ma) ?? ma;
  }, [donVi]);

  const ds = useMemo(() => (Array.isArray(value) ? value.map(chuan).filter(Boolean) : []), [value]);
  const maChinh = chuan(chinh);

  /** Từng đơn vị thêm: nhóm nó kéo theo + đơn vị khai TRƯỚC nó mà nhóm đã chứa nó (khai thừa — máy
   *  chủ sẽ chặn lúc lưu, báo luôn ở đây cho khỏi bấm Lưu mới biết). */
  const the = useMemo(() => {
    const truoc: string[] = maChinh ? [maChinh] : [];
    return ds.map((ma) => {
      const nhom = nhomCua(ma, g);
      const trung = truoc.find((u) => u === ma || nhomCua(u, g).includes(ma)) ?? null;
      truoc.push(ma);
      return { ma, gom: nhom.filter((x) => x !== ma), trung };
    });
  }, [ds, maChinh, g]);

  const gomChinh = useMemo(() => (maChinh ? nhomCua(maChinh, g).filter((x) => x !== maChinh) : []), [maChinh, g]);

  // Danh sách thêm: bỏ mọi đơn vị đã nằm trong nhóm của ĐVT chính hoặc của đơn vị đã thêm.
  const conThem = useMemo(() => {
    const an = new Set<string>();
    for (const u of [maChinh, ...ds]) if (u) for (const x of nhomCua(u, g)) an.add(x);
    return donVi.filter((d) => !an.has(chuan(d.ma)));
  }, [donVi, maChinh, ds, g]);

  const [mo, setMo] = useState(false);
  const khungRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => {
      if (!khungRef.current?.contains(e.target as Node)) setMo(false);
    };
    const phim = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Esc chỉ đóng danh sách, không đóng cả drawer — drawer nhường phím đã `preventDefault`.
        e.preventDefault();
        setMo(false);
      }
    };
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", phim, true);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", phim, true);
    };
  }, [mo]);

  // Mỗi đơn vị một mẩu riêng, cách nhau bằng khoảng trống — không nối bằng dấu phẩy.
  const gom = (ds2: string[]) => (
    <>
      gồm{ds2.map((m) => <span key={m} className="rc-dvn__gom-dv">{tenCua(m)}</span>)}
    </>
  );

  return (
    <div className="rc-dvn">
      {maChinh && gomChinh.length > 0 && (
        <span className="rc-field__hint">ĐVT chính {gom(gomChinh)}</span>
      )}
      {the.length > 0 && (
        <div className="rc-dvn__ds">
          {the.map((t) => (
            <div key={t.ma} className={`rc-dvn__the${t.trung ? " rc-dvn__the--loi" : ""}`}>
              <div className="rc-dvn__dong">
                <span className="rc-dvn__ten">{tenCua(t.ma)}</span>
                <button type="button" className="rc-timeline__btn rc-timeline__btn--danger"
                  title={`Bỏ đơn vị ${tenCua(t.ma)}`} aria-label={`Bỏ đơn vị ${tenCua(t.ma)}`}
                  onClick={() => onChange(ds.filter((x) => x !== t.ma))}>✕</button>
              </div>
              {t.trung ? (
                <span className="rc-dvn__gom rc-dvn__gom--loi">
                  Đã nằm trong nhóm của {tenCua(t.trung)}. Bỏ đơn vị này đi.
                </span>
              ) : t.gom.length > 0 ? (
                <span className="rc-dvn__gom">{gom(t.gom)}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className="rc-dvn__them" ref={khungRef}>
        <button type="button" className="rc-dvn__nut" disabled={!maChinh}
          aria-haspopup="listbox" aria-expanded={mo}
          title={maChinh ? undefined : "Chọn ĐVT chính trước"}
          onClick={() => setMo((v) => !v)}>
          ＋ Thêm đơn vị
        </button>
        {!maChinh && <span className="rc-field__hint">Chọn ĐVT chính trước.</span>}
        {mo && (
          <div className="rc-ref-search-panel rc-dvn__menu" role="listbox">
            {conThem.length === 0 ? (
              <div className="rc-dvn__trong">Không còn đơn vị nào ngoài các nhóm đã khai.</div>
            ) : conThem.map((d) => {
              const ma = chuan(d.ma);
              const ten = String(d.ten || d.ma);
              return (
                <button type="button" key={d.id} role="option" aria-selected={false}
                  className="rc-ref-search-item"
                  onClick={() => { onChange([...ds, ma]); setMo(false); }}>
                  <span className="rc-ref-search-item__name">{ten}</span>
                  {ma !== ten.toLowerCase() && <span className="rc-ref-search-item__code">{d.ma}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
