// Màn "Theo dõi sản xuất" — THEO ĐƠN (phương án A bản 3, 12/10/2026). Kinh doanh và chủ xưởng theo dõi
// đơn đã xuống xưởng tới đâu: một dòng một đơn, bốn chấm chặng Lệnh / SX / Kho / Giao theo mặt hàng
// chậm nhất, đang làm gì, hạn giao còn bao lâu, đang vướng gì. Bấm dòng mở ngăn bảng mặt hàng
// (`TdsxNganDon`). Ai thấy đơn nào: theo luật của Đơn hàng bán (người phụ trách của khách, nhóm dùng
// chung) với cấp phạm vi của module này — máy chủ gắn từ token.
// Kế hoạch: `docs/superpowers/plans/2026-10-12-theo-doi-don-ho-so-lenh.md`.
//
// ⚠️ MÀN NÀY KHÔNG GHI GÌ CẢ, KHÔNG MỘT SỐ TIỀN NÀO. Lọc, đếm chip, cắt trang đều ở MÁY CHỦ.
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "../api/client";
import type { TdsxChip, TdsxDonDong } from "../api/client";
import { useCan } from "../auth/permissions";
import { useAuth } from "../auth/useAuth";
import type { NavigateFn } from "../components/AppShell";
import { EmptyRow } from "../components/EmptyState";
import {
  ChipTT, ChonCot, CuonLuoi, LocNhanhTrangThai, OTim, ngayVN, rongLuoi, soVN, tenKhachGon, useCauHinhLuoi,
  type CotLuoi, type MauTT,
} from "../components/LuoiDs";
import { trangHopLe } from "../components/Pager";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import { useTre } from "../lib/useTre";
import { BangLoi } from "./keHoachSxShared";
import {
  LOC_THEO_DOI_DON_TRONG,
  MOC_THEO_DOI_DON,
  locTheoDoiDonLenUrl,
  locTheoDoiDonTuUrl,
  thamSoLocTheoDoiDon,
  useDieuKienTheoDoiDon,
  type LocTheoDoiDon,
} from "./loc-san-xuat/dieu-kien-theo-doi-don";
import { ngayThang } from "./lsxRoutingDoc";
import { TdsxNganDon } from "./TdsxNganDon";
import { CHANG4, cauVuong, chipHan, dangLamDon } from "./tdsxDon";
import { ThanhLoc } from "./thanh-loc/ThanhLoc";
import { kyLenUrl, kyTuUrl, thamSoKy, type KyDS } from "./thanh-loc/ky-danh-sach";
import { daAp } from "./thanh-loc/thanh-loc";
import { useLocMan } from "./thanh-loc/useLocMan";
// `ke-hoach-sx.css` cho `EmptyState` (lớp `.khsx-*`), CSS chung `lsc-` (routing dọc), rồi CSS riêng.
import "./ke-hoach-sx.css";
import "./lenh-sx-chung.css";
import "./theo-doi-san-xuat.css";

/** Gộp sự kiện SSE rồi mới tải lại — mỗi lượt danh sách tính lại mọi đơn của trang. */
const SSE_GOP_MS = 2000;

const CHIP: { key: TdsxChip; label: string; mau?: MauTT }[] = [
  { key: "tat_ca", label: "Tất cả" },
  { key: "can_de_y", label: "Cần để ý", mau: "do" },
  { key: "dang_lam", label: "Đang làm", mau: "xanh" },
  { key: "cho_giao", label: "Chờ giao", mau: "ngoc" },
  { key: "da_giao", label: "Đã giao đủ", mau: "la" },
];

interface CotDon extends CotLuoi { w?: number; n?: boolean }
const COT_DON: CotDon[] = [
  { key: "don", label: "Đơn", coDinh: true, w: 84 },
  { key: "khach", label: "Khách hàng", w: 120 },
  { key: "mh", label: "Mặt hàng", w: 170 },
  { key: "sl", label: "Số lượng", w: 96, n: true },
  { key: "chang", label: "Chặng", w: 150 },
  { key: "lam", label: "Đang làm", w: 170 },
  { key: "han", label: "Hạn giao", w: 172 },
  { key: "vuong", label: "Đang vướng" },
];

type LocMan = { ky: KyDS; loc: LocTheoDoiDon };
const LOC_MAN_TRONG: LocMan = { ky: { loai: "tat_ca", moc: "chot" }, loc: LOC_THEO_DOI_DON_TRONG };
const docLocMan = (p: URLSearchParams): LocMan => ({
  ky: kyTuUrl(p, MOC_THEO_DOI_DON.map(([m]) => m), "chot"),
  loc: locTheoDoiDonTuUrl(p),
});
const ghiLocMan = (t: LocMan) => ({ ...kyLenUrl(t.ky, "chot"), ...locTheoDoiDonLenUrl(t.loc) });

export function TheoDoiSanXuatPage({
  eventTick,
  navigate,
}: {
  /** Nhích theo MỌI sự kiện SSE của AppShell; màn gộp lại rồi mới tải (xem `SSE_GOP_MS`). */
  eventTick?: number;
  navigate?: NavigateFn;
}) {
  const { token } = useAuth();
  const can = useCan();
  const coHoSo = can("lenh_san_xuat", "read");

  const timRef = useRef<HTMLInputElement | null>(null);
  const trangRef = useRef<HTMLElement | null>(null);
  const [q, setQ] = useState("");
  const qTre = useTre(q);
  const luoi = useCauHinhLuoi("tdsx-don");
  const cotHien = luoi.rongHien(luoi.xep(COT_DON).filter((c) => !luoi.an.has(c.key)));
  const [locMan, setLocMan] = useLocMan("theo-doi-san-xuat", LOC_MAN_TRONG, docLocMan, ghiLocMan);
  const dieuKien = useDieuKienTheoDoiDon();
  const khoaLoc = JSON.stringify({ ...thamSoKy(locMan.ky), ...thamSoLocTheoDoiDon(locMan.loc) });
  const [chip, setChip] = useState<TdsxChip>("tat_ca");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    function phim(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        timRef.current?.focus();
      }
    }
    window.addEventListener("keydown", phim);
    return () => window.removeEventListener("keydown", phim);
  }, []);

  const [rows, setRows] = useState<TdsxDonDong[]>([]);
  const [total, setTotal] = useState(0);
  const [dem, setDem] = useState<Partial<Record<TdsxChip, number>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [daTai, setDaTai] = useState(false);
  const [loi, setLoi] = useState<{ text: string; cam: boolean } | null>(null);
  const luot = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [qTre, khoaLoc, chip]);

  const load = useCallback(() => {
    if (!token) return;
    const so = ++luot.current;
    setLoading(true);
    api.theoDoiSanXuat
      .theoDon(token, { chip, q: qTre.trim() || undefined, ...JSON.parse(khoaLoc), page, page_size: pageSize })
      .then((r) => {
        if (so !== luot.current) return;
        setRows(r.items);
        setTotal(r.total);
        setDem(r.dem);
        setLoi(null);
        setDaTai(true);
        const ve = trangHopLe(page, r.total, pageSize);
        if (ve !== null) setPage(ve);
      })
      .catch((e) => {
        if (so !== luot.current) return;
        const cam = e instanceof ApiError && e.isForbidden;
        setLoi({
          text: cam
            ? "Bạn không có quyền xem Theo dõi sản xuất."
            : e instanceof ApiError
              ? e.message
              : "Máy chủ không phản hồi.",
          cam,
        });
      })
      .finally(() => {
        if (so === luot.current) setLoading(false);
      });
  }, [token, chip, qTre, khoaLoc, page, pageSize]);
  useEffect(() => {
    load();
  }, [load]);

  const tickTre = useTre(eventTick ?? 0, SSE_GOP_MS);
  const tickDau = useRef(tickTre);
  useEffect(() => {
    if (tickTre === tickDau.current) return;
    tickDau.current = tickTre;
    load();
  }, [tickTre, load]);

  // --- ngăn một đơn ------------------------------------------------------------------------------
  const [moId, setMoId] = useState<number | null>(null);
  const viTri = moId == null ? -1 : rows.findIndex((r) => r.order_id === moId);
  const dongNgan = useCallback(() => {
    const id = moId;
    setMoId(null);
    requestAnimationFrame(() => {
      const dong = trangRef.current?.querySelector<HTMLElement>(`tr[data-don="${id}"]`);
      if (dong) dong.focus();
      else timRef.current?.focus();
    });
  }, [moId]);

  const dangLoc = qTre.trim() !== "" || locMan.ky.loai !== "tat_ca" || dieuKien.some((d) => daAp(d, locMan.loc));
  const xoaLoc = useCallback(() => {
    setQ("");
    setLocMan({ ky: { loai: "tat_ca", moc: locMan.ky.moc }, loc: LOC_THEO_DOI_DON_TRONG });
    setChip("tat_ca");
  }, [setLocMan, locMan.ky.moc]);

  const muc = CHIP.map((c) => ({ key: c.key, label: c.label, count: dem ? dem[c.key] ?? 0 : undefined, mau: c.mau }));
  const nhanChip = CHIP.find((c) => c.key === chip)?.label ?? "Tất cả";

  return (
    <main className="tdsx lds" ref={trangRef}>
      <header className="lds-dau">
        <h1 className="lds-dau__ten">Theo dõi sản xuất</h1>
      </header>

      {loi && rows.length > 0 && <BangLoi text="Không làm mới được danh sách." onRetry={load} />}

      <section className="lds-loc" aria-label="Lọc đơn">
        <LocNhanhTrangThai muc={muc} dang={chip} onChon={(k) => setChip(k as TdsxChip)} ariaLabel="Lọc đơn theo tình trạng" />
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim
            inputRef={timRef}
            value={q}
            onChange={setQ}
            maxLength={120}
            placeholder="Tìm số đơn, khách, mặt hàng, mã lệnh"
            ariaLabel="Tìm số đơn, khách, mặt hàng, mã lệnh"
          />
          <ThanhLoc
            ky={locMan.ky}
            moc={MOC_THEO_DOI_DON}
            onKy={(ky) => setLocMan({ ...locMan, ky })}
            dieuKien={dieuKien}
            loc={locMan.loc}
            onLoc={(loc) => setLocMan({ ...locMan, loc })}
            onXoaHet={xoaLoc}
          />
          {(dangLoc || chip !== "tat_ca") && !dieuKien.some((d) => daAp(d, locMan.loc) && !d.anKhoi) && (
            <button type="button" className="lds-lk" onClick={xoaLoc}>
              Xoá bộ lọc
            </button>
          )}
          <ChonCot cot={COT_DON} {...luoi.chonCot} />
        </div>
      </section>

      <div className="lds-sheet">
        <CuonLuoi ghim={luoi.soGhim(cotHien)}>
          <table className="lds-g" style={{ minWidth: rongLuoi(cotHien, 160) }}>
            <caption className="sr-only">Danh sách đơn đã xuống xưởng</caption>
            <colgroup>
              {cotHien.map((c) => (
                <col key={c.key} style={c.w ? { width: c.w } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {cotHien.map((c) => (
                  <th key={c.key} scope="col" className={c.n ? "n" : undefined}>
                    {c.key === "chang" ? (
                      <span className="tdsx-c4__nhan">
                        {CHANG4.map((x) => <span key={x.key}>{x.ten}</span>)}
                      </span>
                    ) : (
                      c.label
                    )}
                    {luoi.keo(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={loading && rows.length > 0 ? "is-mo" : undefined}>
              {loading && rows.length === 0 && !loi ? (
                <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={cotHien.length} className="lds-trong">
                    {loi ? (
                      <>
                        <span className="lds-do">{loi.cam ? loi.text : `Không tải được danh sách đơn. ${loi.text}`}</span>
                        {!loi.cam && (
                          <>
                            {" "}
                            <button type="button" className="lds-lk" onClick={load}>
                              Thử lại
                            </button>
                          </>
                        )}
                      </>
                    ) : daTai && chip !== "tat_ca" && (dem?.tat_ca ?? 0) > 0 ? (
                      <>
                        {`Nhóm «${nhanChip}» hiện không có đơn nào.`}{" "}
                        <button type="button" className="lds-lk" onClick={() => setChip("tat_ca")}>
                          Về Tất cả
                        </button>
                      </>
                    ) : daTai && dangLoc ? (
                      <>
                        Không có đơn nào khớp điều kiện đang lọc.{" "}
                        <button type="button" className="lds-lk" onClick={xoaLoc}>
                          Xoá bộ lọc
                        </button>
                      </>
                    ) : (
                      "Chưa có đơn nào xuống xưởng trong phạm vi của bạn."
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.order_id}
                    className={`lds-dong${r.order_id === moId ? " is-chon" : ""}`}
                    data-don={r.order_id}
                    tabIndex={0}
                    onClick={() => setMoId(r.order_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setMoId(r.order_id);
                      }
                    }}
                  >
                    {cotHien.map((c) => (
                      <ODon key={c.key} cot={c.key} r={r} />
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CuonLuoi>

        {total > 0 && (
          <PhanTrangDayDu
            trang={page}
            size={pageSize}
            tong={total}
            soDong={rows.length}
            onTrang={setPage}
            onSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            loading={loading}
            donVi="đơn"
            ariaLabel="Phân trang đơn"
          />
        )}
      </div>

      {moId !== null && (
        <TdsxNganDon
          orderId={moId}
          onDong={dongNgan}
          eventTick={tickTre}
          len={viTri > 0 ? () => setMoId(rows[viTri - 1].order_id) : undefined}
          xuong={viTri >= 0 && viTri < rows.length - 1 ? () => setMoId(rows[viTri + 1].order_id) : undefined}
          onMoLenh={coHoSo && navigate ? (id) => navigate("lenh-san-xuat", { openHoSoLsxId: id }) : undefined}
        />
      )}
    </main>
  );
}

/** Bốn chấm chặng: qua rồi xám đặc, chặng đang nằm có vòng (đỏ khi đơn đang vướng hoặc trễ). */
function Chang4({ r }: { r: TdsxDonDong }) {
  const vt = r.chang === "xong" ? CHANG4.length : CHANG4.findIndex((c) => c.key === r.chang);
  const ten = r.chang === "xong" ? "đã giao xong" : `đang ở chặng ${CHANG4[vt]?.ten ?? ""}`;
  return (
    <span className="tdsx-c4" role="img" aria-label={`Đơn ${ten}${r.chang_ket ? ", đang vướng" : ""}`}>
      {CHANG4.map((c, i) => (
        <i
          key={c.key}
          className={i < vt ? "is-xong" : i === vt ? (r.chang_ket ? "is-o is-ket" : "is-o") : undefined}
        />
      ))}
    </span>
  );
}

function ODon({ cot, r }: { cot: string; r: TdsxDonDong }) {
  switch (cot) {
    case "don":
      return <td>{r.order_no}</td>;
    case "khach":
      return r.khach_hang ? <td title={r.khach_hang}>{tenKhachGon(r.khach_hang)}</td> : <td className="lds-mu3">—</td>;
    case "mh":
      return (
        <td title={r.mon_dau ?? undefined}>
          {r.mon_dau ?? <span className="lds-mu3">Chưa đặt tên</span>}
          {r.so_mon > 1 && <span className="tdsx-mu tdsx-cach">và {r.so_mon - 1} mặt hàng khác</span>}
        </td>
      );
    case "sl":
      return r.so_mon > 1 ? (
        <td className="n">
          {r.so_mon}
          <span className="lds-u">mặt hàng</span>
        </td>
      ) : (
        <td className="n">
          {soVN(r.so_luong)}
          {r.don_vi && <span className="lds-u">{r.don_vi}</span>}
        </td>
      );
    case "chang":
      return (
        <td>
          <Chang4 r={r} />
        </td>
      );
    case "lam": {
      const [a, b] = dangLamDon(r);
      return (
        <td>
          <span>{a}</span>
          {b && <span className="tdsx-mu tdsx-cach">{b}</span>}
        </td>
      );
    }
    case "han": {
      const c = chipHan(r);
      return (
        <td>
          {r.han_giao ? <span title={ngayVN(r.han_giao)}>{ngayThang(r.han_giao)}</span> : <span className="lds-mu3">Chưa hẹn</span>}
          {c && (
            <span className="tdsx-cach">
              <ChipTT mau={c[1]}>{c[0]}</ChipTT>
            </span>
          )}
        </td>
      );
    }
    case "vuong": {
      const v = cauVuong(r);
      return v ? <td className="tdsx-do" title={v}>{v}</td> : <td className="lds-mu3">—</td>;
    }
    default:
      return <td />;
  }
}
