// Màn "Theo dõi sản xuất" — bàn quét TOÀN XƯỞNG cho điều độ, QC, trưởng phòng (làm gọn 05/10/2026).
// Trả lời "bây giờ xưởng thế nào, máy nào đứng, lệnh nào có vấn đề". Tra lệnh cũ là việc của màn Hồ
// sơ lệnh sản xuất. Đặc tả: `docs/superpowers/specs/2026-10-05-lam-gon-ho-so-lenh-theo-doi-sx-design.md`
// mục 3.
//
// Từ trên xuống (lưới chung 08/10/2026): đầu trang, thẻ lọc bất thường + hàng công cụ (ô tìm, Lọc,
// nút đổi góc Theo máy / Theo lệnh nhớ trong `localStorage`, Cột), tấm lưới. MỖI lượt tải chỉ gọi
// ĐÚNG góc đang xem.
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
import { ChonCot, LocNhanhTrangThai, OTim, useCauHinhLuoi, type MauTT } from "../components/LuoiDs";
import { useTre } from "../lib/useTre";
import { LenhSxHoSoView } from "./LenhSxHoSoView";
import { COT_LENH, TdsxTheoLenh } from "./TdsxTheoLenh";
import { COT_MAY, TdsxTheoMay } from "./TdsxTheoMay";
import { BangLoi } from "./keHoachSxShared";
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
// `ke-hoach-sx.css` (lớp `.khsx-*` mà hồ sơ lệnh mở đè lên có thể dùng), rồi CSS chung `lsc-` (thẻ, chip,
// dải chặng của hồ sơ lệnh và của ô Đang ở), rồi CSS riêng màn này (nạp CUỐI để `.tdsx-*` thắng).
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
  const khungRef = useRef<HTMLElement | null>(null);
  const timRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const qTre = useTre(q);
  // Khách / Máy / Bất thường — thanh lọc chung, ghi lên URL, nhớ theo màn.
  const [loc, setLoc] = useLocMan("theo-doi-san-xuat", LOC_TDSX_TRONG, locTdsxTuUrl, locTdsxLenUrl);
  const batThuong = loc.bat_thuong ?? null;

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
  const dongHoSo = useCallback(() => {
    const id = hoSoId;
    setHoSoId(null);
    requestAnimationFrame(() => {
      const nut = khungRef.current?.querySelector<HTMLButtonElement>(`[data-lsx="${id}"]`);
      if (nut) nut.focus();
      else khungRef.current?.focus();
    });
  }, [hoSoId]);

  // Cột hiện / thứ tự cột nhớ theo từng góc (mỗi góc một lưới riêng).
  const luoiLenh = useCauHinhLuoi("tdsx-lenh");
  const luoiMay = useCauHinhLuoi("tdsx-may");

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

  // Ô báo khi bảng rỗng — gom MỘT chỗ cho cả hai góc (chữ trong ô `lds-trong` của lưới).
  const rong = loi ? (
    <>
      <span className="lds-do">{loi.cam ? loi.text : "Không tải được bảng theo dõi."}</span>
      {!loi.cam && <span className="lds-mu"> {loi.text} </span>}
      {!loi.cam && (
        <button type="button" className="lds-lk" onClick={load}>
          Thử lại
        </button>
      )}
    </>
  ) : dangLoc ? (
    <>
      {goc === "theo_may" ? "Không có việc nào khớp điều kiện đang lọc." : "Không có lệnh nào khớp điều kiện đang lọc."}{" "}
      <button type="button" className="lds-lk" onClick={xoaLoc}>
        Xoá bộ lọc
      </button>
    </>
  ) : goc === "theo_may" ? (
    "Chưa có việc nào trên máy. Lệnh phát hành xuống xưởng sẽ hiện ở đây."
  ) : (
    "Chưa có lệnh nào đang sản xuất trong phạm vi của bạn."
  );

  // Lỗi lúc CHƯA có dữ liệu ⇒ thay hàng xương bằng ô báo lỗi (không để xương mãi).
  const dataHien = data ?? (loi ? (goc === "theo_may" ? MAY_RONG : LENH_RONG) : null);

  // Thẻ lọc nhanh bất thường: "Tất cả" + sáu mục, số do MÁY CHỦ đếm (`data.bat_thuong`) trên cả tập
  // đã lọc. Một mục một lúc; bấm lại mục đang chọn thì bỏ.
  const muc = [
    { key: "", label: "Tất cả" },
    ...BAT_THUONG.map((b) => ({
      key: b.key as string,
      label: b.ten,
      count: dem ? dem[b.key] : undefined,
      mau: MAU_BAT_THUONG[b.key],
    })),
  ];
  const chonBatThuong = (key: string) =>
    setLoc({
      ...loc,
      bat_thuong: key === "" || key === batThuong ? undefined : BAT_THUONG.find((b) => b.key === key)?.key,
    });

  const cot = goc === "theo_may" ? COT_MAY : COT_LENH;
  const luoi = goc === "theo_may" ? luoiMay : luoiLenh;

  return (
    <main className="tdsx lds" ref={khungRef} tabIndex={-1}>
      <header className="lds-dau">
        <h1 className="lds-dau__ten">Theo dõi sản xuất</h1>
      </header>

      {/* Lỗi khi ĐÃ có bảng: giữ bảng cũ, báo một dòng phía trên. */}
      {loi && data && <BangLoi text="Không làm mới được bảng theo dõi." onRetry={load} />}

      <section className="lds-loc" aria-label="Lọc bảng theo dõi">
        <LocNhanhTrangThai
          muc={muc}
          dang={batThuong ?? ""}
          onChon={chonBatThuong}
          ariaLabel="Bất thường, bấm để lọc bảng"
        />
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim
            value={q}
            onChange={setQ}
            inputRef={timRef}
            maxLength={120}
            placeholder="Tìm mã lệnh, sản phẩm, số đơn, khách"
            ariaLabel="Tìm mã lệnh, sản phẩm, số đơn, khách"
          />
          <ThanhLoc dieuKien={dieuKien} loc={loc} onLoc={setLoc} />
          <div className="lds-loc__phai">
            <div className="tdsx-goc" role="group" aria-label="Góc nhìn">
              <button
                type="button"
                className={`lds-btn${goc === "theo_may" ? " is-on" : ""}`}
                aria-pressed={goc === "theo_may"}
                onClick={() => setGoc("theo_may")}
              >
                Theo máy
              </button>
              <button
                type="button"
                className={`lds-btn${goc === "theo_lenh" ? " is-on" : ""}`}
                aria-pressed={goc === "theo_lenh"}
                onClick={() => setGoc("theo_lenh")}
              >
                Theo lệnh
              </button>
            </div>
            <ChonCot cot={cot} {...luoi.chonCot} />
          </div>
        </div>
      </section>

      {goc === "theo_may" ? (
        <TdsxTheoMay
          data={dataHien as TdsxTheoMayOut | null}
          dangTai={loading}
          rong={rong}
          onMo={setHoSoId}
          luoi={luoiMay}
          cotAn={luoiMay.an}
          thuTu={luoiMay.thuTu}
        />
      ) : (
        <TdsxTheoLenh
          data={dataHien as TdsxTheoLenhOut | null}
          dangTai={loading}
          rong={rong}
          onMo={setHoSoId}
          dangMo={hoSoId}
          luoi={luoiLenh}
          cotAn={luoiLenh.an}
          thuTu={luoiLenh.thuTu}
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

/** Chấm màu thẻ lọc — mỗi mục một sắc nhận diện của thẻ, không nhất thiết trùng chip của dòng (chip cờ ở
 *  Theo lệnh trùng ở Trễ hạn, Sự cố, Tạm dừng, KCS không đạt; chip tình trạng máy ở Theo máy có bảng màu riêng). */
const MAU_BAT_THUONG: Record<string, MauTT> = {
  tre_han: "do",
  su_co: "cam",
  tam_dung: "vang",
  kcs_khong_dat: "cham",
  may_hong: "xam",
  chua_may: "cyan",
};

const DEM_RONG: TdsxDemBatThuong = {
  tre_han: 0, su_co: 0, tam_dung: 0, kcs_khong_dat: 0, may_hong: 0, chua_may: 0,
};
const MAY_RONG: TdsxTheoMayOut = { nhom: [], may_trong: [], bat_thuong: DEM_RONG };
const LENH_RONG: TdsxTheoLenhOut = { items: [], total: 0, bat_thuong: DEM_RONG };
