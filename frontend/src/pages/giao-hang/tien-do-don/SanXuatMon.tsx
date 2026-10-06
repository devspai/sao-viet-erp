/** Sản xuất TỪNG MẶT HÀNG của đơn (07/10/2026).
 *
 *  · `SanXuatO` — ô Sản xuất ngoài danh sách, phương án A của
 *    `docs/mockups/don-hang-cot-san-xuat-3-phuong-an.html`: MỘT thẻ nói món chậm nhất đang ở đâu +
 *    một dòng chi tiết; đơn nhiều món thêm "+n món". Bấm thẻ hoặc "+n món" ra bảng nổi từng mặt hàng,
 *    bấm mặt hàng mở hồ sơ lệnh. (Bản dải màu trước đó bị bỏ: ô không xuống dòng làm tràn bảng, đơn
 *    1 món chỉ là một thanh liền, và không nói đơn đang kẹt ở đâu.)
 *  · `BangSanXuatMon` — khối Sản xuất trong ngăn đơn (phương án B của
 *    `docs/mockups/don-hang-san-xuat-3-phuong-an.html`): mỗi mặt hàng một hàng, bấm hàng mở lệnh. */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal, flushSync } from "react-dom";

import type { DonTienDo, MonO, MonSanXuat } from "../../../api/client";
import { EmptyState } from "../../../components/EmptyState";
import {
  chiTietO, hangVe, kieuLam, lenhDaiDien, nhanO, type MonCoBan, type TongMau,
} from "./monSanXuat";
import { coHangCum, NHAN_LY_DO_TRE } from "./TienDoDon";

const so = (n: number) => n.toLocaleString("vi-VN");

function TheO({ m }: { m: MonCoBan }) {
  const { nhan, mau } = nhanO(m);
  return <span className={`sxm-the sxm-the--${mau}`}>{nhan}</span>;
}

/** Chỗ "chậm" trước — món đại diện cho ô là món đứng sớm nhất ở đây. */
const THU_TU_O: MonO[] = ["chua_lenh", "chua_xuong", "ngoai", "xuong", "cho_kho", "du_hang"];

/** Thẻ + dòng chi tiết của ô danh sách. Mọi món đủ hàng thì nói tới chuyện giao. */
function tomTatO(mons: MonSanXuat[]): { mon: MonSanXuat; nhan: string; mau: TongMau | "giao"; chiTiet: string } {
  const mon = [...mons].sort((x, y) => THU_TU_O.indexOf(x.o) - THU_TU_O.indexOf(y.o))[0];
  if (!mons.every((m) => m.du_hang)) return { mon, ...nhanO(mon), chiTiet: chiTietO(mon) };
  if (mons.every((m) => m.con_phai_giao <= 0)) return { mon, nhan: "Đã giao đủ", mau: "ok", chiTiet: chiTietO(mon) };
  if (mons.some((m) => m.da_giao > 0)) {
    const ct = mons.length === 1
      ? `đã giao ${so(mon.da_giao)}/${so(mon.dat)}${mon.don_vi ? ` ${mon.don_vi}` : ""}`
      : `đã giao ${mons.filter((m) => m.con_phai_giao <= 0).length}/${mons.length} món`;
    return { mon, nhan: "Giao dở", mau: "giao", chiTiet: ct };
  }
  return { mon, nhan: "Đủ hàng", mau: "ok", chiTiet: chiTietO(mon) };
}

/** Ô Sản xuất ngoài danh sách. `onMoLenh` vắng (không có quyền màn Kế hoạch SX) thì bấm mặt hàng
 *  mở ngăn đơn qua `onMoDon`. */
export function SanXuatO({
  maDon, mons, onMoLenh, onMoDon,
}: {
  maDon: string;
  mons: MonSanXuat[];
  onMoLenh?: (lsxId: number) => void;
  onMoDon: () => void;
}) {
  const [neo, setNeo] = useState<HTMLElement | null>(null);
  const vung = useRef<HTMLSpanElement>(null);
  const noi = useRef<HTMLDivElement>(null);
  const [vt, setVt] = useState<{ top: number; left: number } | null>(null);
  const mo = neo !== null;

  useLayoutEffect(() => {
    if (!neo) return;
    const r = neo.getBoundingClientRect();
    const rong = Math.min(440, window.innerWidth - 32);
    setVt({ top: r.bottom + 6, left: Math.max(16, Math.min(r.left, window.innerWidth - rong - 16)) });
  }, [neo]);

  useEffect(() => {
    if (!mo) return;
    const dong = (e: Event) => {
      const t = e.target as Node | null;
      if (t && (noi.current?.contains(t) || vung.current?.contains(t))) return;
      setNeo(null);
    };
    const phim = (e: KeyboardEvent) => { if (e.key === "Escape") setNeo(null); };
    const cuon = (e: Event) => {
      if (noi.current && e.target instanceof Node && noi.current.contains(e.target)) return;
      setNeo(null);
    };
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", phim);
    window.addEventListener("scroll", cuon, true);
    window.addEventListener("resize", cuon);
    return () => {
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", phim);
      window.removeEventListener("scroll", cuon, true);
      window.removeEventListener("resize", cuon);
    };
  }, [mo]);

  if (mons.length === 0) return <span className="dhb__sx">—</span>;
  const t = tomTatO(mons);
  const bat = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    setNeo((cu) => (cu === el ? null : el));
  };
  return (
    <span ref={vung} className="sxm-o">
      <button
        type="button"
        className={`sxm-the sxm-the--${t.mau} sxm-o__the`}
        aria-expanded={mo}
        aria-label={`Sản xuất từng mặt hàng của ${maDon}: ${t.nhan}`}
        title="Xem từng mặt hàng"
        onClick={bat}
      >
        {t.nhan}
      </button>
      {mons.length === 1 ? (
        t.chiTiet && <span className="sxm-o__ct">{t.chiTiet}</span>
      ) : (
        <span className="sxm-o__ct">
          {t.mon.ten}{" "}
          <button type="button" className="sxm-o__them" aria-expanded={mo} onClick={bat}>
            +{mons.length - 1} món
          </button>
        </span>
      )}
      {mo && vt && createPortal(
        <div
          ref={noi}
          className="sxm-noi"
          role="dialog"
          aria-label={`Mặt hàng của ${maDon}`}
          style={{ top: vt.top, left: vt.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sxm-noi__dau">{mons.length} mặt hàng của {maDon}</div>
          {mons.map((m) => {
            const l = lenhDaiDien(m);
            const moLenh = l && onMoLenh ? () => onMoLenh(l.id) : null;
            return (
              <button
                key={m.khoa}
                type="button"
                className="sxm-noi__dong"
                title={moLenh ? `Mở hồ sơ lệnh ${l!.ma}` : "Mở đơn hàng"}
                onClick={() => {
                  // Đóng NGAY rồi mới chuyển màn: màn đích nạp lười qua Suspense, React giữ cây cũ ẩn
                  // và hoãn cả lượt cập nhật — bảng nổi ở `document.body` sẽ treo trên màn mới.
                  flushSync(() => setNeo(null));
                  if (moLenh) moLenh(); else onMoDon();
                }}
              >
                <span className="sxm-noi__ten">{m.ten}</span>
                <TheO m={m} />
                <span className="sxm-noi__ct">{chiTietO(m)}</span>
                <span className="sxm-noi__mo" aria-hidden="true">↗</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </span>
  );
}

/** Khối Sản xuất trong ngăn đơn — bảng gọn mỗi mặt hàng một hàng (phương án B). */
export function BangSanXuatMon({
  td, onMoLenh,
}: {
  td: DonTienDo | null;
  onMoLenh?: (lsxId: number) => void;
}) {
  if (!td) return <EmptyState trangThai="dang-tai" gon nhanTai="Đang tải tiến độ…" />;
  if (td.cum.length === 0) return <p className="dhb__td-note">Đơn chưa có sản phẩm.</p>;
  return (
    <div className="sxm-bang-khung">
      <table className="sxm-bang">
        <thead>
          <tr>
            <th>Sản phẩm</th>
            <th>Lệnh</th>
            <th>Kiểu làm</th>
            <th>Đang ở</th>
            <th>Đã có hàng</th>
            <th>Hàng về</th>
          </tr>
        </thead>
        <tbody>
          {td.cum.map((c) => {
            const m: MonCoBan = {
              ten: c.ten, don_vi: c.don_vi, dat: c.dat,
              co_hang: Math.min(c.dat, coHangCum(c)),
              o: c.o ?? "chua_lenh", co_lenh: c.co_lenh, tu_ton: !c.co_lenh && c.o === "du_hang",
              giao_thang: c.giao_thang, lenh: c.lenh_o ?? [],
            };
            const l = lenhDaiDien(m);
            const mo = l && onMoLenh ? () => onMoLenh(l.id) : undefined;
            const pct = m.dat > 0 ? Math.min(100, (m.co_hang / m.dat) * 100) : 0;
            const ct = chiTietO(m);
            const tre = m.o === "du_hang" ? [] : c.lenh.flatMap((l) => l.xong ? [] : l.canh_bao)
              .filter((w, i, a) => a.indexOf(w) === i);
            return (
              <tr
                key={c.khoa}
                className={mo ? "sxm-bang__mo" : undefined}
                onClick={mo}
                title={mo ? `Mở hồ sơ lệnh ${l!.ma}` : undefined}
              >
                <td className="sxm-bang__ten">{c.ten}</td>
                <td>
                  {m.lenh.length === 0 ? <span className="sxm-mo-nhat">Không có lệnh</span> : (
                    <span className="sxm-lenhs">
                      {m.lenh.map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          className="sxm-lenh"
                          disabled={!onMoLenh}
                          onClick={(e) => { e.stopPropagation(); onMoLenh?.(x.id); }}
                        >
                          {x.ma} <span aria-hidden="true">↗</span>
                        </button>
                      ))}
                    </span>
                  )}
                </td>
                <td>{kieuLam(m)}</td>
                <td>
                  <span className="sxm-o-cot">
                    <TheO m={m} />
                    {ct && <span className="sxm-mo-nhat">{ct}</span>}
                    {tre.map((w) => <span key={w} className="sxm-the sxm-the--tre">{NHAN_LY_DO_TRE[w] ?? w}</span>)}
                  </span>
                </td>
                <td>
                  <span className="sxm-co-cot">
                    <span className="sxm-thanh"><i style={{ width: `${pct}%` }} /></span>
                    <span className="sxm-so">{so(m.co_hang)} / {so(m.dat)}{m.don_vi ? ` ${m.don_vi}` : ""}</span>
                  </span>
                </td>
                <td>{hangVe(m)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
