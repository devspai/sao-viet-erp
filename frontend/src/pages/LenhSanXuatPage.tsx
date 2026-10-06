// Màn "Hồ sơ lệnh sản xuất" — TRA CỨU lệnh đã phát hành (làm gọn 05/10/2026).
// Trả lời "lệnh này là gì, đã đi qua những gì". Theo dõi trực tiếp, cảnh báo, máy nào đứng là việc
// của màn Theo dõi sản xuất — màn này không đếm cảnh báo, không chạy cân đối vật tư.
// Đặc tả: `docs/superpowers/specs/2026-10-05-lam-gon-ho-so-lenh-theo-doi-sx-design.md` mục 4.1.
//
// ⚠️ MÀN NÀY KHÔNG GHI GÌ CẢ, KHÔNG MỘT SỐ TIỀN NÀO. Lọc, đếm tab, cắt trang đều ở MÁY CHỦ — không
// `rows.filter`, không `rows.slice`, không đếm số trên tab từ `items`.
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "../api/client";
import type { LenhSxItem, LenhSxKhachLoc, LenhSxTab } from "../api/client";
import { useAuth } from "../auth/useAuth";
import type { NavigateFn } from "../components/AppShell";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { trangHopLe } from "../components/Pager";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import { useTre } from "../lib/useTre";
import { LenhSxHoSoView } from "./LenhSxHoSoView";
import { BangLoi, EmptyState, Skeleton, ngay, num } from "./keHoachSxShared";
import { PillKhau, TheDaDong, TheGap } from "./lsxKhau";
// `ke-hoach-sx.css` cho `EmptyState`/`Skeleton` (lớp `.khsx-*`), rồi CSS chung của hai màn.
import "./ke-hoach-sx.css";
import "./lenh-sx-chung.css";

/** Gộp sự kiện SSE rồi mới tải lại — chuyền chạy thì sự kiện tới liên tục. */
const SSE_GOP_MS = 2000;

/** Bốn tab theo KHÂU (`trang_thai.KHAU` + "tất cả"). Khoá đi thẳng ra `?tab=` — hợp đồng. */
const TABS: { key: LenhSxTab; label: string }[] = [
  { key: "tat_ca", label: "Tất cả" },
  { key: "dang_sx", label: "Đang sản xuất" },
  { key: "sau_sx", label: "Sau sản xuất" },
  { key: "da_giao", label: "Đã giao đủ" },
];

/** `<input type="date">` cho gõ năm 6 chữ số ⇒ máy chủ 422 câm. Trống = không gửi; sai = không gửi
 *  + viền đỏ; hợp lệ = gửi. */
function ngayHopLe(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const nam = Number(v.slice(0, 4));
  if (nam < 2000 || nam > 2999) return false;
  return !Number.isNaN(new Date(v).getTime());
}

export function LenhSanXuatPage({
  eventTick,
  navigate,
  openHoSoId,
  openHoSoPv,
  openHoSoSeq,
}: {
  /** Nhích theo MỌI sự kiện SSE của AppShell; màn gộp lại rồi mới tải (xem `SSE_GOP_MS`). */
  eventTick?: number;
  /** Chỉ để hồ sơ có đường sang màn Đơn hàng bán. */
  navigate?: NavigateFn;
  /** Deep link QR phiếu công nghệ (`#lsx=&pv=`): có giá trị ⇒ mở NGAY hồ sơ đó, đè lên bảng. */
  openHoSoId?: number | null;
  /** Phiên bản in trên tờ giấy đã quét — chuyển tiếp cho băng cảnh báo của hồ sơ. */
  openHoSoPv?: number | null;
  /** `navSeq` của AppShell — tăng mỗi lượt điều hướng, để quét LẠI đúng tờ vừa đóng vẫn mở lại. */
  openHoSoSeq?: number | null;
}) {
  const { token } = useAuth();

  // --- bộ lọc (chạy ở máy chủ) ------------------------------------------------
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const qTre = useTre(q);
  const [khachId, setKhachId] = useState("");
  const [tuNgay, setTuNgay] = useState("");
  const [denNgay, setDenNgay] = useState("");
  const [tab, setTab] = useState<LenhSxTab>("tat_ca");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    function phim(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", phim);
    return () => window.removeEventListener("keydown", phim);
  }, []);

  const tuGui = ngayHopLe(tuNgay) ? tuNgay : undefined;
  const denGui = ngayHopLe(denNgay) ? denNgay : undefined;
  const ngaySai = (tuNgay !== "" && !tuGui) || (denNgay !== "" && !denGui);

  // --- hồ sơ một lệnh: vẽ ĐÈ lên bảng để quay lại thấy y nguyên tab/lọc/trang ------------------
  const [hoSoId, setHoSoId] = useState<number | null>(null);
  const [hoSoPv, setHoSoPv] = useState<number | null>(null);
  useEffect(() => {
    if (openHoSoId == null) return;
    setHoSoId(openHoSoId);
    setHoSoPv(openHoSoPv ?? null);
  }, [openHoSoId, openHoSoPv, openHoSoSeq]);

  // Mở tay không có tờ giấy nào để so ⇒ xoá `pv` của lượt QR trước.
  const moHoSoTay = useCallback((id: number) => {
    setHoSoId(id);
    setHoSoPv(null);
  }, []);

  const khungRef = useRef<HTMLDivElement | null>(null);
  const dongHoSo = useCallback(() => {
    const id = hoSoId;
    setHoSoId(null);
    setHoSoPv(null);
    // Trả tiêu điểm về đúng nút vừa bấm; dòng có thể đã biến mất (SSE) thì về khung bảng.
    requestAnimationFrame(() => {
      const nut = document.querySelector<HTMLButtonElement>(`.lsc-ma[data-lsx="${id}"]`);
      if (nut) nut.focus();
      else khungRef.current?.focus();
    });
  }, [hoSoId]);

  // --- dữ liệu -------------------------------------------------------------------
  const [rows, setRows] = useState<LenhSxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [dem, setDem] = useState<Partial<Record<LenhSxTab, number>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [daTai, setDaTai] = useState(false);
  const [loi, setLoi] = useState<{ text: string; cam: boolean } | null>(null);
  const [dsKhach, setDsKhach] = useState<LenhSxKhachLoc[] | null>(null);

  // Đổi bộ lọc hay tab ⇒ về trang 1.
  useEffect(() => {
    setPage(1);
  }, [qTre, khachId, tuGui, denGui, tab]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    api.lenhSanXuat
      .danhSach(token, {
        tab,
        q: qTre.trim() || undefined,
        khach_hang_id: khachId ? Number(khachId) : undefined,
        tu_ngay: tuGui,
        den_ngay: denGui,
        page,
        page_size: pageSize,
      })
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
        setDem(r.dem_theo_tab);
        setLoi(null);
        setDaTai(true);
        const ve = trangHopLe(page, r.total, pageSize);
        if (ve !== null) setPage(ve);
      })
      .catch((e) => {
        const cam = e instanceof ApiError && e.isForbidden;
        setLoi({
          text: cam
            ? "Bạn không có quyền xem hồ sơ lệnh sản xuất."
            : e instanceof ApiError
              ? e.message
              : "Máy chủ không phản hồi.",
          cam,
        });
      })
      .finally(() => setLoading(false));
  }, [token, tab, qTre, khachId, tuGui, denGui, page, pageSize]);
  useEffect(() => {
    load();
  }, [load]);

  // Nguồn ô Khách — khách của chính các lệnh trong phạm vi (gác `lenh_san_xuat:read`). Hỏng ⇒ ô
  // Khách ẩn, các ô khác vẫn chạy.
  useEffect(() => {
    if (!token) return;
    let song = true;
    api.lenhSanXuat
      .boLoc(token)
      .then((r) => {
        if (song) setDsKhach(r.khach_hang);
      })
      .catch(() => {
        if (song) setDsKhach(null);
      });
    return () => {
      song = false;
    };
  }, [token]);

  // Realtime: gộp 2 giây rồi tải lại ĐÚNG một yêu cầu danh sách; giữ trang/tab/lọc. Hồ sơ đang mở
  // nhận CÙNG nhịp đã gộp (không nhận `eventTick` thô — mỗi sự kiện là một lượt hồ sơ nặng).
  const tickTre = useTre(eventTick ?? 0, SSE_GOP_MS);
  const tickDau = useRef(tickTre);
  useEffect(() => {
    if (tickTre === tickDau.current) return;
    tickDau.current = tickTre;
    load();
  }, [tickTre, load]);

  const dangLoc = qTre.trim() !== "" || khachId !== "" || tuNgay !== "" || denNgay !== "";
  const xoaLoc = useCallback(() => {
    setQ("");
    setKhachId("");
    setTuNgay("");
    setDenNgay("");
    setTab("tat_ca");
  }, []);

  // --- tab: roving tabindex, kích hoạt THỦ CÔNG (mỗi lần đổi tab là một yêu cầu) ---------------
  const tabIdx = Math.max(0, TABS.findIndex((t) => t.key === tab));
  const [tabFocus, setTabFocus] = useState(tabIdx);
  useEffect(() => {
    setTabFocus(tabIdx);
  }, [tabIdx]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function phimTab(e: React.KeyboardEvent, i: number) {
    let toi = i;
    if (e.key === "ArrowRight") toi = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") toi = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") toi = 0;
    else if (e.key === "End") toi = TABS.length - 1;
    else return;
    e.preventDefault();
    setTabFocus(toi);
    tabRefs.current[toi]?.focus();
  }

  const tongTheoLoc = dem?.tat_ca ?? null;
  const nhanTab = TABS[tabIdx]?.label ?? "Tất cả";

  return (
    <main className="lsc">
      <header className="lsc-head">
        <h1 className="lsc-title">Hồ sơ lệnh sản xuất</h1>
        {tongTheoLoc !== null && <span className="lsc-count">{num(tongTheoLoc)} lệnh</span>}
      </header>

      <section className="lsc-loc" aria-label="Lọc lệnh">
        <div className="lsc-search">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
            placeholder="Tìm mã lệnh, sản phẩm, số đơn, khách"
            aria-label="Tìm mã lệnh, sản phẩm, số đơn, khách"
          />
          {q === "" ? (
            <kbd className="lsc-kbd">Ctrl K</kbd>
          ) : (
            <button type="button" className="lsc-xoa" onClick={() => setQ("")} aria-label="Xoá ô tìm">
              <Icon name="x" size={14} />
            </button>
          )}
        </div>

        {dsKhach && dsKhach.length > 0 && (
          <label className={`lsc-field${khachId !== "" ? " is-active" : ""}`}>
            <span>Khách</span>
            <select value={khachId} onChange={(e) => setKhachId(e.target.value)}>
              <option value="">Tất cả</option>
              {dsKhach.map((k) => (
                <option key={k.id} value={String(k.id)}>
                  {k.ten ?? `Khách #${k.id}`}
                </option>
              ))}
            </select>
          </label>
        )}

        <div
          className={`lsc-field${ngaySai ? " is-sai" : tuGui || denGui ? " is-active" : ""}`}
          role="group"
          aria-labelledby="lsc-hansx"
          title="Lệnh chưa khai hạn SX không nằm trong khoảng nào."
        >
          <span id="lsc-hansx">Hạn SX</span>
          <input
            type="date"
            value={tuNgay}
            min="2000-01-01"
            max="2999-12-31"
            onChange={(e) => setTuNgay(e.target.value)}
            aria-label="Hạn SX từ ngày"
            aria-invalid={(tuNgay !== "" && !tuGui) || undefined}
          />
          <span className="lsc-field__sep" aria-hidden="true">
            →
          </span>
          <input
            type="date"
            value={denNgay}
            min="2000-01-01"
            max="2999-12-31"
            onChange={(e) => setDenNgay(e.target.value)}
            aria-label="Hạn SX đến ngày"
            aria-invalid={(denNgay !== "" && !denGui) || undefined}
          />
        </div>

        {(dangLoc || tab !== "tat_ca") && (
          <button type="button" className="lsc-link" onClick={xoaLoc}>
            Bỏ lọc
          </button>
        )}
      </section>

      <div className="lsc-tabs" role="tablist" aria-label="Lọc lệnh theo khâu">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`lsc-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="lsc-panel"
            tabIndex={i === tabFocus ? 0 : -1}
            className="lsc-tab"
            onKeyDown={(e) => phimTab(e, i)}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {/* Đang tải ⇒ để trống chỗ số, không hiện 0. */}
            {dem ? <span className="lsc-tab__n">{num(dem[t.key] ?? 0)}</span> : null}
          </button>
        ))}
      </div>

      <div id="lsc-panel" role="tabpanel" aria-labelledby={`lsc-tab-${tab}`}>
        {loi && rows.length > 0 && <BangLoi text="Không làm mới được danh sách." onRetry={load} />}

        <div
          className="lsc-khung"
          ref={khungRef}
          tabIndex={0}
          role="group"
          aria-label="Bảng lệnh sản xuất, cuộn ngang được bằng phím mũi tên"
        >
          <table className="lsc-bang">
            <caption className="sr-only">Danh sách lệnh sản xuất đã phát hành</caption>
            <thead>
              <tr>
                <th scope="col">Lệnh</th>
                <th scope="col">Sản phẩm</th>
                <th scope="col" className="lsc-so">
                  Số lượng
                </th>
                <th scope="col">Khách</th>
                <th scope="col">Đơn</th>
                <th scope="col">Hạn SX</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            {loading && rows.length === 0 && !loi ? (
              <Skeleton rows={8} cols={7} />
            ) : (
              <tbody className={loading ? "is-mo" : undefined}>
                {rows.length === 0 ? (
                  <tr className="lsc-bang__rong">
                    <td colSpan={7}>
                      {loi ? (
                        <EmptyState
                          icon="alert"
                          title={loi.cam ? loi.text : "Không tải được danh sách lệnh."}
                          sub={loi.cam ? undefined : loi.text}
                          action={
                            loi.cam ? undefined : (
                              <Button variant="ghost" onClick={load}>
                                Thử lại
                              </Button>
                            )
                          }
                        />
                      ) : daTai && tab !== "tat_ca" && (dem?.tat_ca ?? 0) > 0 ? (
                        <EmptyState
                          icon="clipboard"
                          title={`Tab «${nhanTab}» hiện không có lệnh nào.`}
                          action={
                            <Button variant="ghost" onClick={() => setTab("tat_ca")}>
                              Về tab Tất cả
                            </Button>
                          }
                        />
                      ) : daTai && dangLoc ? (
                        <EmptyState
                          icon="search"
                          title="Không có lệnh nào khớp bộ lọc."
                          action={
                            <Button variant="ghost" onClick={xoaLoc}>
                              Bỏ lọc
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState
                          icon="clipboard"
                          title="Chưa có lệnh sản xuất nào đã phát hành trong phạm vi của bạn."
                          sub="Lệnh còn đang lập nằm ở màn Kế hoạch sản xuất."
                        />
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => <Dong key={r.id} r={r} onMo={moHoSoTay} />)
                )}
              </tbody>
            )}
          </table>
        </div>

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
            donVi="lệnh"
            ariaLabel="Phân trang lệnh sản xuất"
          />
        )}
      </div>

      {hoSoId !== null && (
        <LenhSxHoSoView
          lsxId={hoSoId}
          pv={hoSoPv}
          onClose={dongHoSo}
          eventTick={tickTre}
          onMoDon={navigate ? (orderId) => navigate("don-hang-ban", { openOrderId: orderId }) : undefined}
        />
      )}
    </main>
  );
}

/** MỘT dòng bảng — bảy cột tĩnh. Bấm mã lệnh để mở hồ sơ. */
function Dong({ r, onMo }: { r: LenhSxItem; onMo: (id: number) => void }) {
  return (
    <tr>
      <td>
        <span className="lsc-cum">
          <button
            type="button"
            className="lsc-ma"
            data-lsx={r.id}
            onClick={() => onMo(r.id)}
            aria-label={`Mở hồ sơ lệnh ${r.ma}${r.ten ? ` — ${r.ten}` : ""}`}
          >
            {r.ma}
          </button>
          {r.is_rush && <TheGap />}
        </span>
      </td>
      <td>{r.ten ?? "Chưa đặt tên"}</td>
      <td className="lsc-so">
        {num(r.so_luong_dat)}
        {r.don_vi_tinh && <span className="lsc-phu">{r.don_vi_tinh}</span>}
      </td>
      <td>{r.khach_hang ?? "—"}</td>
      <td>{r.order_no ?? "—"}</td>
      <td>{ngay(r.han_hoan_thanh_sx)}</td>
      <td>
        <span className="lsc-cum">
          <PillKhau khau={r.khau} ct={r.khau_chi_tiet} />
          {r.da_dong && <TheDaDong />}
        </span>
      </td>
    </tr>
  );
}
