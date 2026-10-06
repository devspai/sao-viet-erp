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
import { EmptyState } from "../../components/EmptyState";
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
    <section className="kcs-the kcs-lenh" aria-label="Lệnh sản xuất">
      <div className="kcs-lenh__dau tl-thanh">
        <h2 className="kcs-lenh__tieu">Lệnh sản xuất <span className="rc__count">{lenh?.tong ?? 0}</span></h2>
        <div className="kcs-lenh__tim">
          <Icon name="search" size={15} className="kcs-lenh__tim-ic" />
          <input type="search" placeholder="Tìm mã lệnh, sản phẩm, khách hàng…" value={tim}
            aria-label="Tìm lệnh" onChange={(e) => setTim(e.target.value)} />
        </div>
        <ThanhLoc
          ky={locMan.ky}
          moc={MOC_KCS}
          onKy={(ky) => setLocMan({ ...locMan, ky })}
          dieuKien={dieuKien}
          loc={locMan.loc}
          onLoc={(loc) => setLocMan({ ...locMan, loc })}
        />
      </div>

      {lenhLoi ? (
        <div className="kcs-lenh__trong">
          <p className="rc__empty-text">Không tải được danh sách lệnh.</p>
          <p className="rc__empty-sub">{lenhLoi}</p>
          <button type="button" className="btn btn--ghost" onClick={() => setLenhTick((k) => k + 1)}>Tải lại</button>
        </div>
      ) : lenh == null ? (
        <EmptyState trangThai="dang-tai" inline />
      ) : lenh.items.length === 0 ? (
        <div className="kcs-lenh__trong">
          <p className="rc__empty-text">
            {timCham || coLoc ? "Không có lệnh nào khớp." : "Chưa có lệnh nào đang sản xuất."}
          </p>
          {coLoc ? (
            <button type="button" className="btn btn--ghost"
              onClick={() => setLocMan({ ky: { loai: "tat_ca", moc: locMan.ky.moc }, loc: LOC_KCS_TRONG })}>
              Xoá bộ lọc
            </button>
          ) : !timCham && (
            <button type="button" className="btn btn--ghost"
              onClick={() => setLocMan({ ...locMan, loc: { ...locMan.loc, nhom: "tat_ca" } })}>
              Xem cả nhóm đã đóng
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="rc__tablewrap">
            <table className="rc__table kcs-table--lenh">
              <colgroup>
                <col className="kcs-col--lenh" />
                <col className="kcs-col--khach" />
                <col className="kcs-col--nhom" />
                <col className="kcs-col--ngay" />
                <col className="kcs-col--ngay" />
                <col className="kcs-col--kiem" />
                <col className="kcs-col--loi" />
              </colgroup>
              <thead>
                <tr>
                  <th>Lệnh</th>
                  <th>Khách hàng</th>
                  <th>Nhóm</th>
                  <th>Ngày tạo</th>
                  <th>Lần KCS gần nhất</th>
                  {/* Chỉ công đoạn cuối mới kiểm đạt (19/09/2026) — đếm "x/y công đoạn đã kiểm" báo thiếu oan. */}
                  <th className="num">Đạt ở công đoạn cuối</th>
                  <th className="num">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {lenh.items.map((l) => {
                  const nt = l.nhom_trang_thai ? KCS_NHOM_TRANG_THAI[l.nhom_trang_thai] : null;
                  const kiemDu = l.cuoi != null && l.cuoi.tot > 0 && l.cuoi.dat >= l.cuoi.tot;
                  return (
                    <tr key={l.lsx_id} className="kcs-row--clickable" tabIndex={0}
                      onClick={() => setLsxId(l.lsx_id)}
                      onKeyDown={(e) => { if (e.key === "Enter") setLsxId(l.lsx_id); }}>
                      <td>
                        <strong className="kcs-code">{l.ma}</strong>
                        <div className="rc__sub">{l.ten}</div>
                      </td>
                      <td>{l.khach ?? "—"}</td>
                      <td>
                        {l.nhom_ma ?? "—"}
                        {nt && <div className="rc__sub"><span className={`badge-sem ${nt.cls}`}>{nt.nhan}</span></div>}
                      </td>
                      <td title={ngayGioDayDu(l.created_at)}>{ngayDayDu(l.created_at)}</td>
                      <td title={ngayGioDayDu(l.kcs_gan_nhat)}>{ngayDayDu(l.kcs_gan_nhat)}</td>
                      <td className="num">
                        {l.cuoi && l.cuoi.tot > 0 ? (
                          <span className={`kcs-dot-pill ${kiemDu ? "kcs-dot-pill--moss" : "kcs-dot-pill--amber"}`}
                            title="KCS đạt / tổ ghi tốt ở công đoạn cuối">
                            <span className="kcs-dot-pill__dot" />
                            {num(l.cuoi.dat)}/{num(l.cuoi.tot)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="num">
                        {l.so_loi > 0 ? (
                          <span className="kcs-dot-pill kcs-dot-pill--signal">
                            <span className="kcs-dot-pill__dot" />
                            {num(l.so_loi)}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Cỡ trang lấy từ máy chủ trả về (`co_trang`) — đúng con số đã cắt, kể cả khi máy chủ kẹp lại. */}
          <PhanTrangDayDu trang={lenh.trang} size={lenh.co_trang} tong={lenh.tong} soDong={lenh.items.length}
            onTrang={setTrang} onSize={(n) => { setCoTrang(n); setTrang(1); }}
            loading={lenhLoading} donVi="lệnh" ariaLabel="Phân trang lệnh KCS" />
        </>
      )}
    </section>
  );

  return (
    <main className="rc kcs-page">
      <header className="rc__head kcs-page__head">
        <div className="rc__headrow">
          <h1 className="rc__title">KCS</h1>
          <div className="rc__spacer" />
          {lsxId == null && (
            <KcsBaoCaoLoc filters={filters} onFiltersChange={setFilters} congDoanOpts={congDoanOpts} />
          )}
          {kcs && lsxId == null && (
            <button type="button" className="btn btn--accent" onClick={xuatExcel} disabled={exporting}>
              <Icon name="download" size={15} />
              {exporting ? "Đang xuất…" : "Xuất Excel"}
            </button>
          )}
        </div>
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
