// Màn KCS — KCS theo LỆNH (mg 0306, docs/design-kcs-theo-lenh.md). MỘT mục menu "KCS" cho người
// thuộc phòng ban có cờ "Tổ KCS"; họ kiểm được mọi tổ.
//
// Hai tầng trên cùng một trang:
//   1. Dải KPI + lưới hai cột: trái là danh sách lệnh (tìm + cắt trang ở MÁY CHỦ) và xu hướng lỗi,
//      phải là phân bổ lỗi theo công đoạn / tổ. Bộ lọc báo cáo nằm trên dải tiêu đề trang.
//   2. Bấm một lệnh → chuỗi công đoạn (`KcsChuoiCongDoan`) → bấm "Kiểm" ở công đoạn.
//
// Báo cáo KCS — MỘT lượt gọi `bao-cao` nuôi dashboard (KPI + 3 biểu đồ); lọc chạy ở máy chủ.
// Bảng "Kết quả đã ghi" (khoá `lich_su`) ĐÃ ẨN khỏi màn 18/09/2026 theo yêu cầu.
import { useEffect, useState } from "react";
import {
  ApiError, api,
  type SxKcsBaoCao, type SxKcsCongDoanLoc, type SxKcsLenhList,
} from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { useCan, useKcs } from "../../auth/permissions";
import type { NavigateFn } from "../../components/AppShell";
import { EmptyRow } from "../../components/EmptyState";
import {
  ChipTT, ChonCot, CuonLuoi, OTim, rongLuoi, soCotGhim, useCotAn, useThuTuCot, xepCot,
  type CotLuoi, type MauTT,
} from "../../components/LuoiDs";
import { PhanTrangDayDu } from "../../components/PhanTrangDayDu";
import { Icon } from "../../components/Icons";
import { useDebounced } from "../../utils/useDebounced";
import { num } from "../keHoachSxShared";
import { laNguoiKho } from "../khoShared";
import { KcsChuoiCongDoan } from "./KcsChuoiCongDoan";
import { KcsBaoCaoLoc, KcsDashboard, KCS_DASH_FILTERS_RONG, type KcsDashFilters } from "./KcsDashboard";
import { KCS_NHOM_TRANG_THAI } from "./kcsNhan";
import {
  LOC_KCS_TRONG, MOC_KCS, locKcsLenUrl, locKcsTuUrl, thamSoLocKcs, useDieuKienKcs, type LocKcs,
} from "../loc-san-xuat/dieu-kien-kcs";
import { ngayDayDu, ngayGioDayDu } from "../loc-san-xuat/ngay";
import { ThanhLoc } from "../thanh-loc/ThanhLoc";
import { kyLenUrl, kyTuUrl, thamSoKy, type KyDS } from "../thanh-loc/ky-danh-sach";
import { daAp } from "../thanh-loc/thanh-loc";
import { useLocMan } from "../thanh-loc/useLocMan";

/** Thanh lọc danh sách lệnh (06/10/2026): kỳ theo ngày tạo lệnh / lần KCS gần nhất + Khách, Nhóm
 *  thành phẩm. Ghi lên URL `?man=kcs`. Thay cặp nút "Chưa đóng / Tất cả" cũ. */
type LocMan = { ky: KyDS; loc: LocKcs };
const LOC_MAN_TRONG: LocMan = { ky: { loai: "tat_ca", moc: "tao" }, loc: LOC_KCS_TRONG };
const docLocMan = (p: URLSearchParams): LocMan => ({
  ky: kyTuUrl(p, MOC_KCS.map(([m]) => m), "tao"),
  loc: locKcsTuUrl(p),
});
const ghiLocMan = (t: LocMan) => ({ ...kyLenUrl(t.ky, "tao"), ...locKcsLenUrl(t.loc) });

/** Cột lưới lệnh. Thứ tự: Mã, Ngày, Khách, Nội dung, Số (đạt, lỗi), Trạng thái, Lần KCS gần nhất. */
interface CotKcs extends CotLuoi { w?: number; n?: boolean }
const COT_KCS: CotKcs[] = [
  { key: "ma", label: "Lệnh", coDinh: true, w: 130 },
  { key: "ngay", label: "Ngày tạo", w: 104 },
  { key: "khach", label: "Khách hàng", w: 190 },
  { key: "ten", label: "Tên lệnh", w: 200 },
  { key: "nhom", label: "Nhóm", w: 100 },
  { key: "dat", label: "Đạt ở công đoạn cuối", w: 170, n: true },
  { key: "loi", label: "Lỗi", w: 80, n: true },
  { key: "tt", label: "Trạng thái nhóm", w: 150 },
  { key: "gan", label: "Lần KCS gần nhất" },
];
const MAU_NHOM: Record<string, MauTT> = { in_production: "xanh", closed: "la" };

function OKcs({ cot, l }: { cot: string; l: SxKcsLenhList["items"][number] }) {
  switch (cot) {
    case "ma":
      return <td title={l.ten || undefined}>{l.ma}</td>;
    case "ngay":
      return <td title={ngayGioDayDu(l.created_at)}>{ngayDayDu(l.created_at)}</td>;
    case "khach":
      return l.khach ? <td title={l.khach}>{l.khach}</td> : <td className="lds-mu3">—</td>;
    case "ten":
      return l.ten ? <td title={l.ten}>{l.ten}</td> : <td className="lds-mu3">—</td>;
    case "nhom":
      return l.nhom_ma ? <td title={l.nhom_ma}>{l.nhom_ma}</td> : <td className="lds-mu3">—</td>;
    case "dat": {
      if (!l.cuoi || l.cuoi.tot <= 0) return <td className="n lds-mu3">—</td>;
      // Đạt đủ số tổ ghi tốt thì xanh lá; còn thiếu thì cam (chưa kiểm hết).
      const kiemDu = l.cuoi.dat >= l.cuoi.tot;
      return (
        <td className={`n ${kiemDu ? "lds-la" : "lds-cam"}`} title="KCS đạt / tổ ghi tốt ở công đoạn cuối">
          {num(l.cuoi.dat)}/{num(l.cuoi.tot)}
        </td>
      );
    }
    case "loi":
      return l.so_loi > 0 ? <td className="n lds-do">{num(l.so_loi)}</td> : <td className="n lds-mu3">—</td>;
    case "tt": {
      const nt = l.nhom_trang_thai ? KCS_NHOM_TRANG_THAI[l.nhom_trang_thai] : null;
      return nt
        ? <td><ChipTT mau={MAU_NHOM[l.nhom_trang_thai as string] ?? "slate"}>{nt.nhan}</ChipTT></td>
        : <td className="lds-mu3">—</td>;
    }
    case "gan":
      return <td title={ngayGioDayDu(l.kcs_gan_nhat)}>{ngayDayDu(l.kcs_gan_nhat)}</td>;
    default:
      return <td />;
  }
}
import "../rebuild-catalog.css";
import "./kcs.css";

export function KcsTheoLenhPage({
  eventTick, onBadgeStale, navigate,
}: {
  eventTick?: number;
  onBadgeStale?: () => void;
  navigate?: NavigateFn;
}) {
  const { token } = useAuth();
  const { kcs } = useKcs();
  const can = useCan();
  // Yêu cầu nhập kho KCS tạo nằm ở màn Kho: người có "Tạo yêu cầu" mở ở tab Yêu cầu, thủ kho mở ở
  // "Phiếu từ yêu cầu". Không có quyền nào ở Kho thì mã chỉ hiện chữ.
  const coTabDeNghi = can("kho", "request");
  const coTabYeuCau = laNguoiKho(can);
  const moYeuCauKho = navigate && (coTabDeNghi || coTabYeuCau)
    ? (id: number) => navigate("kho-main", { khoOpenRequest: { id, view: coTabDeNghi ? "denghi" : "yeucau" } })
    : undefined;
  const [lsxId, setLsxId] = useState<number | null>(null);
  // Cột của lưới lệnh: ẩn / đổi chỗ nhớ theo máy người xem.
  const [cotAn, setCotAn] = useCotAn("kcs-lenh");
  const [thuTuCot, setThuTuCot] = useThuTuCot("kcs-lenh");
  const cotHien = xepCot(COT_KCS, thuTuCot).filter((c) => !cotAn.has(c.key));

  // ---- Danh sách lệnh --------------------------------------------------------------------
  const [tim, setTim] = useState("");
  const timCham = useDebounced(tim.trim());
  const [locMan, setLocMan] = useLocMan("kcs", LOC_MAN_TRONG, docLocMan, ghiLocMan);
  const dieuKien = useDieuKienKcs();
  const khoaLoc = JSON.stringify({ ...thamSoKy(locMan.ky), ...thamSoLocKcs(locMan.loc) });
  const coLoc = locMan.ky.loai !== "tat_ca" || dieuKien.some((d) => daAp(d, locMan.loc));
  const [trang, setTrang] = useState(1);
  const [coTrang, setCoTrang] = useState(25);
  const [lenh, setLenh] = useState<SxKcsLenhList | null>(null);
  const [lenhLoading, setLenhLoading] = useState(true);
  const [lenhLoi, setLenhLoi] = useState<string | null>(null);
  const [lenhTick, setLenhTick] = useState(0);

  useEffect(() => { setTrang(1); }, [timCham, khoaLoc]);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLenhLoading(true);
    api.sanXuat.kcsLenh(token, { tim: timCham || undefined, trang, coTrang, loc: JSON.parse(khoaLoc) })
      .then((r) => { if (alive) { setLenh(r); setLenhLoi(null); } })
      .catch((e) => { if (alive) setLenhLoi(e instanceof ApiError ? e.message : "Không tải được danh sách lệnh."); })
      .finally(() => { if (alive) setLenhLoading(false); });
    return () => { alive = false; };
  }, [token, timCham, trang, khoaLoc, coTrang, lenhTick, eventTick]);

  // ---- Báo cáo -----------------------------------------------------------------------------
  const [filters, setFilters] = useState<KcsDashFilters>(KCS_DASH_FILTERS_RONG);
  const [congDoanOpts, setCongDoanOpts] = useState<SxKcsCongDoanLoc[]>([]);
  useEffect(() => {
    if (!token) return;
    api.sanXuat.kcsCongDoanLoc(token).then((r) => setCongDoanOpts(r.items)).catch(() => setCongDoanOpts([]));
  }, [token]);

  const [baoCao, setBaoCao] = useState<SxKcsBaoCao | null>(null);
  const [baoCaoLoading, setBaoCaoLoading] = useState(true);
  const [baoCaoError, setBaoCaoError] = useState<string | null>(null);
  const [baoCaoTick, setBaoCaoTick] = useState(0);
  const tuKhoaCham = useDebounced(filters.tuKhoa.trim());
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setBaoCaoLoading(true);
    setBaoCaoError(null);
    api.sanXuat.baoCaoKcs(token, {
      tu: filters.tu || null,
      den: filters.den || null,
      tu_khoa: tuKhoaCham || null,
      cong_doan_id: filters.congDoanId,
    })
      .then((r) => { if (alive) { setBaoCao(r); setBaoCaoLoading(false); } })
      .catch((e) => {
        if (!alive) return;
        setBaoCaoError(e instanceof ApiError ? e.message : "Không tải được báo cáo KCS.");
        setBaoCaoLoading(false);
      });
    return () => { alive = false; };
  }, [token, filters.tu, filters.den, tuKhoaCham, filters.congDoanId, baoCaoTick, eventTick]);

  function daDoi() {
    setLenhTick((k) => k + 1);
    setBaoCaoTick((k) => k + 1);
    onBadgeStale?.();
  }

  // ---- Xuất Excel (người thuộc tổ KCS — máy chủ gác cùng luật) ----------------------------
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  async function xuatExcel() {
    if (!token || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const url = await api.sanXuat.exportBaoCaoKcsBlobUrl(token, {
        tu: filters.tu || null,
        den: filters.den || null,
        tu_khoa: filters.tuKhoa.trim() || null,
        cong_doan_id: filters.congDoanId,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bao-cao-KCS-${filters.tu || "tat-ca"}_${filters.den || "nay"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "Không xuất được báo cáo.");
    } finally {
      setExporting(false);
    }
  }

  const bangLenh = (
    <section className="kcs-lenh lds" aria-label="Lệnh sản xuất">
      <h2 className="kcs-lenh__tieu">Lệnh sản xuất <span className="rc__count">{lenh?.tong ?? 0}</span></h2>
      <section className="lds-loc">
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim value={tim} onChange={setTim} placeholder="Tìm mã lệnh, sản phẩm, khách hàng…" ariaLabel="Tìm lệnh" />
          <ThanhLoc
            ky={locMan.ky}
            moc={MOC_KCS}
            onKy={(ky) => setLocMan({ ...locMan, ky })}
            dieuKien={dieuKien}
            loc={locMan.loc}
            onLoc={(loc) => setLocMan({ ...locMan, loc })}
          />
          <ChonCot cot={COT_KCS} an={cotAn} onAn={setCotAn} thuTu={thuTuCot} onThuTu={setThuTuCot} />
        </div>
      </section>

      <div className="lds-sheet">
        <CuonLuoi ghim={soCotGhim(cotHien)}>
          <table className="lds-g" style={{ minWidth: rongLuoi(cotHien) }}>
            <colgroup>
              {cotHien.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
            </colgroup>
            <thead>
              <tr>
                {/* Chỉ công đoạn cuối mới kiểm đạt (19/09/2026) — đếm "x/y công đoạn đã kiểm" báo thiếu oan. */}
                {cotHien.map((c) => <th key={c.key} className={c.n ? "n" : undefined}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {lenhLoi ? (
                <tr>
                  <td colSpan={cotHien.length} className="lds-trong">
                    <span className="lds-do">{lenhLoi}</span>{" "}
                    <button type="button" className="lds-lk" onClick={() => setLenhTick((k) => k + 1)}>Thử lại</button>
                  </td>
                </tr>
              ) : lenh == null ? (
                <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
              ) : lenh.items.length === 0 ? (
                <tr>
                  <td colSpan={cotHien.length} className="lds-trong">
                    {timCham || coLoc ? "Không có lệnh nào khớp điều kiện đang lọc." : "Chưa có lệnh nào đang sản xuất."}{" "}
                    {coLoc ? (
                      <button type="button" className="lds-lk"
                        onClick={() => setLocMan({ ky: { loai: "tat_ca", moc: locMan.ky.moc }, loc: LOC_KCS_TRONG })}>
                        Xoá bộ lọc
                      </button>
                    ) : !timCham && (
                      <button type="button" className="lds-lk"
                        onClick={() => setLocMan({ ...locMan, loc: { ...locMan.loc, nhom: "tat_ca" } })}>
                        Xem cả nhóm đã đóng
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                lenh.items.map((l) => (
                  <tr key={l.lsx_id} className="lds-dong" tabIndex={0}
                    onClick={() => setLsxId(l.lsx_id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLsxId(l.lsx_id); } }}>
                    {cotHien.map((c) => <OKcs key={c.key} cot={c.key} l={l} />)}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CuonLuoi>
        {/* Cỡ trang lấy từ máy chủ trả về (`co_trang`) — đúng con số đã cắt, kể cả khi máy chủ kẹp lại. */}
        {!lenhLoi && lenh != null && lenh.items.length > 0 && (
          <PhanTrangDayDu trang={lenh.trang} size={lenh.co_trang} tong={lenh.tong} soDong={lenh.items.length}
            onTrang={setTrang} onSize={(n) => { setCoTrang(n); setTrang(1); }}
            loading={lenhLoading} donVi="lệnh" ariaLabel="Phân trang lệnh KCS" />
        )}
      </div>
    </section>
  );

  return (
    <main className="rc kcs-page lds">
      <header className="lds-dau">
        <h1 className="lds-dau__ten">KCS</h1>
        {lsxId == null && (
          <KcsBaoCaoLoc filters={filters} onFiltersChange={setFilters} congDoanOpts={congDoanOpts} />
        )}
        {kcs && lsxId == null && (
          <div className="lds-dau__nut">
            <button type="button" className="btn btn--accent" onClick={xuatExcel} disabled={exporting}>
              <Icon name="download" size={15} />
              {exporting ? "Đang xuất…" : "Xuất Excel"}
            </button>
          </div>
        )}
      </header>

      {lsxId != null ? (
        <KcsChuoiCongDoan lsxId={lsxId} eventTick={eventTick}
          onBack={() => setLsxId(null)} onChanged={daDoi} onMoYeuCauKho={moYeuCauKho} />
      ) : (
        <>
          {exportError && (
            <div className="banner banner--error" role="alert"><span>{exportError}</span></div>
          )}
          <KcsDashboard data={baoCao} loading={baoCaoLoading} error={baoCaoError} bangLenh={bangLenh} />
        </>
      )}
    </main>
  );
}
