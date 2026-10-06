// Màn "Theo dõi sản xuất" — bàn quét TOÀN XƯỞNG cho điều độ, QC, trưởng phòng (làm gọn 05/10/2026).
// Trả lời "bây giờ xưởng thế nào, máy nào đứng, lệnh nào có vấn đề". Tra lệnh cũ là việc của màn Hồ
// sơ lệnh sản xuất. Đặc tả: `docs/superpowers/specs/2026-10-05-lam-gon-ho-so-lenh-theo-doi-sx-design.md`
// mục 3.
//
// Từ trên xuống: tiêu đề + nút đổi góc Theo máy / Theo lệnh (nhớ trong `localStorage`), dải bất
// thường, hàng lọc, bảng. MỖI lượt tải chỉ gọi ĐÚNG góc đang xem.
//
// ⚠️ MÀN NÀY KHÔNG GHI GÌ CẢ, KHÔNG MỘT SỐ TIỀN NÀO. Lọc ở MÁY CHỦ — không `rows.filter` ở đây.
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "../api/client";
import type {
  TdsxBoLocOut,
  TdsxDemBatThuong,
  TdsxLocParams,
  TdsxTheoLenhOut,
  TdsxTheoMayOut,
} from "../api/client";
import { useAuth } from "../auth/useAuth";
import type { NavigateFn } from "../components/AppShell";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { useTre } from "../lib/useTre";
import { LenhSxHoSoView } from "./LenhSxHoSoView";
import { TdsxTheoLenh } from "./TdsxTheoLenh";
import { TdsxTheoMay } from "./TdsxTheoMay";
import { BangLoi, EmptyState } from "./keHoachSxShared";
import {
  BAT_THUONG,
  LOC_TDSX_TRONG,
  dieuKienTdsx,
  locTdsxLenUrl,
  locTdsxTuUrl,
  thamSoLocTdsx,
} from "./loc-san-xuat/dieu-kien-theo-doi-sx";
import { useNapTenDonVi } from "./tenDonVi";
import { ThanhLoc } from "./thanh-loc/ThanhLoc";
import { useLocMan } from "./thanh-loc/useLocMan";
// `ke-hoach-sx.css` cho `EmptyState`/`Skeleton` (lớp `.khsx-*`), rồi CSS chung của hai màn, rồi CSS
// riêng màn này (nạp CUỐI để `.tdsx-*` thắng khi trùng độ ưu tiên).
import "./ke-hoach-sx.css";
import "./lenh-sx-chung.css";
import "./theo-doi-san-xuat.css";

/** Gộp sự kiện SSE sát nhau rồi mới tải lại — `useTre` là debounce, không nhân số lần gọi. */
const SSE_GOP_MS = 400;

type Goc = "theo_may" | "theo_lenh";
const KHOA_GOC = "tdsx.goc";

function docGoc(): Goc {
  try {
    if (typeof localStorage === "undefined") return "theo_may";
    return localStorage.getItem(KHOA_GOC) === "theo_lenh" ? "theo_lenh" : "theo_may";
  } catch {
    return "theo_may";
  }
}

export function TheoDoiSanXuatPage({
  eventTick,
  navigate,
}: {
  /** Nhích theo MỌI sự kiện SSE của AppShell; màn gộp lại rồi mới tải (xem `SSE_GOP_MS`). */
  eventTick?: number;
  navigate?: NavigateFn;
}) {
  const { token } = useAuth();
  // Nhãn đơn vị của cột Sản lượng tốt ("tờ in", "thành phẩm") — không nạp thì hiện mã trần.
  useNapTenDonVi();

  // --- góc nhìn -------------------------------------------------------------------------------
  const [goc, setGoc] = useState<Goc>(docGoc);
  useEffect(() => {
    try {
      localStorage.setItem(KHOA_GOC, goc);
    } catch {
      /* chế độ riêng tư chặn lưu ⇒ lần sau về mặc định, không sao */
    }
  }, [goc]);

  // --- bộ lọc (chạy ở máy chủ) ------------------------------------------------------------------
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const qTre = useTre(q);
  // Khách / Máy / Bất thường — thanh lọc chung, ghi lên URL, nhớ theo màn.
  const [loc, setLoc] = useLocMan("theo-doi-san-xuat", LOC_TDSX_TRONG, locTdsxTuUrl, locTdsxLenUrl);
  const batThuong = loc.bat_thuong ?? null;

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

  const [boLoc, setBoLoc] = useState<TdsxBoLocOut | null>(null);
  useEffect(() => {
    if (!token) return;
    let song = true;
    api.theoDoiSanXuat
      .boLoc(token)
      .then((r) => {
        if (song) setBoLoc(r);
      })
      .catch(() => {
        // Hỏng ⇒ điều kiện Khách/Máy không có giá trị để chọn, ô tìm và dải bất thường vẫn chạy.
        if (song) setBoLoc(null);
      });
    return () => {
      song = false;
    };
  }, [token]);

  // --- dữ liệu: MỘT yêu cầu cho góc đang xem ------------------------------------------------------
  const [mayData, setMayData] = useState<TdsxTheoMayOut | null>(null);
  const [lenhData, setLenhData] = useState<TdsxTheoLenhOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [loi, setLoi] = useState<{ text: string; cam: boolean } | null>(null);
  // Lượt về muộn của bộ lọc cũ không được đè lượt mới.
  const luot = useRef(0);

  const load = useCallback(() => {
    if (!token) return;
    const so = ++luot.current;
    const params: TdsxLocParams = {
      q: qTre.trim() || undefined,
      ...thamSoLocTdsx(loc, goc === "theo_lenh"),
    };
    setLoading(true);
    const p: Promise<unknown> =
      goc === "theo_may"
        ? api.theoDoiSanXuat.theoMay(token, params).then((r) => {
            if (so === luot.current) setMayData(r);
          })
        : api.theoDoiSanXuat.theoLenh(token, params).then((r) => {
            if (so === luot.current) setLenhData(r);
          });
    p.then(() => {
      if (so === luot.current) setLoi(null);
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
    // `loc` đổi danh tính mỗi lần chọn — đúng nhịp cần tải lại.
  }, [token, goc, qTre, loc]);
  useEffect(() => {
    load();
  }, [load]);

  // Realtime: gộp rồi tải lại ĐÚNG góc đang xem; hồ sơ đang mở nhận CÙNG nhịp đã gộp.
  const tickTre = useTre(eventTick ?? 0, SSE_GOP_MS);
  const tickDau = useRef(tickTre);
  useEffect(() => {
    if (tickTre === tickDau.current) return;
    tickDau.current = tickTre;
    load();
  }, [tickTre, load]);

  // --- hồ sơ một lệnh: vẽ ĐÈ lên bảng ----------------------------------------------------------
  const [hoSoId, setHoSoId] = useState<number | null>(null);
  const khungRef = useRef<HTMLElement | null>(null);
  const dongHoSo = useCallback(() => {
    const id = hoSoId;
    setHoSoId(null);
    requestAnimationFrame(() => {
      const nut = khungRef.current?.querySelector<HTMLButtonElement>(`[data-lsx="${id}"]`);
      if (nut) nut.focus();
      else khungRef.current?.querySelector<HTMLElement>(".lsc-khung")?.focus();
    });
  }, [hoSoId]);

  const dangLoc =
    qTre.trim() !== "" || loc.khach != null || batThuong !== null
    || (goc === "theo_lenh" && (loc.may != null || loc.khau != null));
  const xoaLoc = useCallback(() => {
    setQ("");
    setLoc(LOC_TDSX_TRONG);
  }, [setLoc]);

  const data = goc === "theo_may" ? mayData : lenhData;
  const dem: TdsxDemBatThuong | null = data?.bat_thuong ?? null;
  const dieuKien = dieuKienTdsx(boLoc, dem, goc === "theo_lenh");

  // Ô báo khi bảng rỗng — gom MỘT chỗ cho cả hai góc.
  const rong = loi ? (
    <EmptyState
      icon="alert"
      title={loi.cam ? loi.text : "Không tải được bảng theo dõi."}
      sub={loi.cam ? undefined : loi.text}
      action={
        loi.cam ? undefined : (
          <Button variant="ghost" onClick={load}>
            Thử lại
          </Button>
        )
      }
    />
  ) : dangLoc ? (
    <EmptyState
      icon="search"
      title="Bộ lọc không ra kết quả nào."
      action={
        <Button variant="ghost" onClick={xoaLoc}>
          Bỏ lọc
        </Button>
      }
    />
  ) : goc === "theo_may" ? (
    <EmptyState icon="clipboard" title="Chưa có việc nào trên máy." sub="Lệnh phát hành xuống xưởng sẽ hiện ở đây." />
  ) : (
    <EmptyState icon="clipboard" title="Chưa có lệnh nào đang sản xuất trong phạm vi của bạn." />
  );

  // Lỗi lúc CHƯA có dữ liệu ⇒ thay khung xám bằng ô báo lỗi (không để xám mãi).
  const dataHien = data ?? (loi ? (goc === "theo_may" ? MAY_RONG : LENH_RONG) : null);

  return (
    <main className="lsc tdsx" ref={khungRef}>
      <header className="lsc-head">
        <h1 className="lsc-title">Theo dõi sản xuất</h1>
        <span className="lsc-spacer" />
        <div className="lsc-seg" role="group" aria-label="Góc nhìn">
          <button type="button" aria-pressed={goc === "theo_may"} onClick={() => setGoc("theo_may")}>
            Theo máy
          </button>
          <button type="button" aria-pressed={goc === "theo_lenh"} onClick={() => setGoc("theo_lenh")}>
            Theo lệnh
          </button>
        </div>
      </header>

      <div
        className={`lsc-bt${dem ? "" : " lsc-bt--dang-tai"}`}
        role="group"
        aria-label="Bất thường, bấm để lọc bảng"
        aria-busy={dem ? undefined : true}
      >
        {BAT_THUONG.map((b) => {
          const n = dem?.[b.key] ?? 0;
          const dangChon = batThuong === b.key;
          return (
            <button
              key={b.key}
              type="button"
              className="lsc-bt__muc"
              aria-pressed={dangChon}
              // Đang chọn thì vẫn bấm được để BỎ, kể cả khi số đã về 0.
              disabled={!dem || (n === 0 && !dangChon)}
              onClick={() => setLoc({ ...loc, bat_thuong: dangChon ? undefined : b.key })}
            >
              <b>{dem ? n : "0"}</b> {b.nhan}
            </button>
          );
        })}
      </div>

      <section className="lsc-loc tl-thanh" aria-label="Lọc bảng theo dõi">
        <div className="lsc-search">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={120}
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

        <ThanhLoc dieuKien={dieuKien} loc={loc} onLoc={setLoc} />
      </section>

      {/* Lỗi khi ĐÃ có bảng: giữ bảng cũ, báo một dòng phía trên. */}
      {loi && data && <BangLoi text="Không làm mới được bảng theo dõi." onRetry={load} />}

      {goc === "theo_may" ? (
        <TdsxTheoMay
          data={dataHien as TdsxTheoMayOut | null}
          dangTai={loading}
          rong={rong}
          onMo={setHoSoId}
        />
      ) : (
        <TdsxTheoLenh
          data={dataHien as TdsxTheoLenhOut | null}
          dangTai={loading}
          rong={rong}
          onMo={setHoSoId}
        />
      )}

      {hoSoId !== null && (
        <LenhSxHoSoView
          lsxId={hoSoId}
          onClose={dongHoSo}
          eventTick={tickTre}
          onMoDon={navigate ? (orderId) => navigate("don-hang-ban", { openOrderId: orderId }) : undefined}
        />
      )}
    </main>
  );
}

const DEM_RONG: TdsxDemBatThuong = {
  tre_han: 0, su_co: 0, tam_dung: 0, kcs_khong_dat: 0, may_hong: 0, chua_may: 0,
};
const MAY_RONG: TdsxTheoMayOut = { nhom: [], may_trong: [], bat_thuong: DEM_RONG };
const LENH_RONG: TdsxTheoLenhOut = { items: [], total: 0, bat_thuong: DEM_RONG };
