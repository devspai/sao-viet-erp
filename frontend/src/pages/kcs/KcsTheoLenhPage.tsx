// Màn KCS — KCS theo LỆNH (mg 0306, docs/design-kcs-theo-lenh.md). Mục menu "KCS" mở theo ô Xem
// của dòng `kcs` trong ma trận vai (09/10/2026, thay cờ phòng ban "Tổ KCS"); kiểm được mọi tổ.
//
// Phương án B nâng cấp (09/10/2026, `docs/mockups/kcs-phuong-an-B-nang-cap.html`):
//   · tab Lệnh — lưới lệnh kiểu bảng tính: lọc nhanh theo tình trạng (số đếm ở máy chủ), ô chuỗi công
//     đoạn nhỏ, đạt / cần, chờ kiểm, lỗi do lệnh này gây. Tìm, lọc, cắt trang đều ở MÁY CHỦ.
//   · tab Báo cáo lỗi — `KcsBaoCaoLoi`, một lượt gọi `bao-cao` theo thanh lọc riêng của tab (ô tìm,
//     kỳ theo ngày kiểm, khách / công đoạn); Xuất Excel đi cùng bộ lọc đó.
//   · bấm một lệnh → sơ đồ cả nhóm thành phẩm (`KcsSoDoNhom`).
import { useEffect, useState } from "react";
import { ApiError, api, type SxKcsBaoCao, type SxKcsChieu, type SxKcsLenhItem, type SxKcsLenhList, type SxKcsLocNhanh } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { useCan } from "../../auth/permissions";
import type { NavigateFn } from "../../components/AppShell";
import { EmptyRow } from "../../components/EmptyState";
import {
  ChipTT, ChonCot, CuonLuoi, LocNhanhTrangThai, OTim, rongLuoi, useCauHinhLuoi, type CotLuoi, type MauTT,
} from "../../components/LuoiDs";
import { PhanTrangDayDu } from "../../components/PhanTrangDayDu";
import { Icon } from "../../components/Icons";
import { useDebounced } from "../../utils/useDebounced";
import { num } from "../keHoachSxShared";
import { laNguoiKho } from "../khoShared";
import { nhanChangLenh } from "../lsxBuoc";
import { useNapTenDonVi } from "../tenDonVi";
import {
  KY_BC_MAC_DINH, LOC_KCS_TRONG, MOC_KCS, bcLenUrl, bcTuUrl, locKcsLenUrl, locKcsTuUrl, thamSoBcKcs, thamSoLocKcs,
  useDieuKienKcs, type LocBcKcs, type LocKcs,
} from "../loc-san-xuat/dieu-kien-kcs";
import { ngayDayDu, ngayGioDayDu } from "../loc-san-xuat/ngay";
import { ThanhLoc } from "../thanh-loc/ThanhLoc";
import { khoangKy, kyLenUrl, kyTuUrl, thamSoKy, type KyDS } from "../thanh-loc/ky-danh-sach";
import { daAp } from "../thanh-loc/thanh-loc";
import { useLocMan } from "../thanh-loc/useLocMan";
import { KcsBaoCaoLoi, type ChonBcKcs } from "./KcsBaoCaoLoi";
import { KcsSoDoNhom } from "./KcsSoDoNhom";
import { ChuGiaiChuoi, ChuoiNho, TINH_TRANG_LENH } from "./kcsSoDo";
import "../rebuild-catalog.css";
import "./kcs.css";
import "./kcs-b.css";

type TabMan = "lenh" | "bao_cao";
const NHANH: SxKcsLocNhanh[] = ["tat_ca", "cho_kiem", "chua_gui_kho", "cho_dong", "da_dong"];
const NHAN_NHANH: Record<SxKcsLocNhanh, { nhan: string; mau?: MauTT }> = {
  tat_ca: { nhan: "Tất cả" },
  cho_kiem: { nhan: "Chờ kiểm", mau: TINH_TRANG_LENH.cho_kiem.mau },
  chua_gui_kho: { nhan: "Chưa gửi kho", mau: TINH_TRANG_LENH.chua_gui_kho.mau },
  cho_dong: { nhan: "Chờ đóng lệnh", mau: TINH_TRANG_LENH.cho_dong.mau },
  da_dong: { nhan: "Đã đóng", mau: TINH_TRANG_LENH.da_dong.mau },
};

/** Tab + lọc nhanh + kỳ + Khách của tab Lệnh, kỳ + lọc riêng của tab Báo cáo lỗi (`bc*`, khoá URL
 *  `bc_…`) — ghi lên URL `?man=kcs`, tải lại không mất. */
type LocMan = { tab: TabMan; nhanh: SxKcsLocNhanh; ky: KyDS; loc: LocKcs; bcKy: KyDS; bcLoc: LocBcKcs };
const LOC_MAN_TRONG: LocMan = {
  tab: "lenh", nhanh: "tat_ca", ky: { loai: "tat_ca", moc: "tao" }, loc: LOC_KCS_TRONG, bcKy: KY_BC_MAC_DINH, bcLoc: {},
};
const docLocMan = (p: URLSearchParams): LocMan => {
  const nhanh = p.get("nhanh") as SxKcsLocNhanh | null;
  const bc = bcTuUrl(p);
  return {
    tab: p.get("tab") === "bao_cao" ? "bao_cao" : "lenh",
    nhanh: nhanh && NHANH.includes(nhanh) ? nhanh : "tat_ca",
    ky: kyTuUrl(p, MOC_KCS.map(([m]) => m), "tao"),
    loc: locKcsTuUrl(p),
    bcKy: bc.ky,
    bcLoc: bc.loc,
  };
};
const ghiLocMan = (t: LocMan) => ({
  tab: t.tab === "lenh" ? undefined : t.tab,
  nhanh: t.nhanh === "tat_ca" ? undefined : t.nhanh,
  ...kyLenUrl(t.ky, "tao"),
  ...locKcsLenUrl(t.loc),
  ...bcLenUrl(t.bcKy, t.bcLoc),
});

/** Cột lưới lệnh, thứ tự theo mockup Màn 1; hai cột ngày giữ lại cuối lưới (ẩn được ở nút Cột). */
interface CotKcs extends CotLuoi { w?: number; n?: boolean }
const COT_KCS: CotKcs[] = [
  { key: "ma", label: "Lệnh", coDinh: true, w: 116 },
  { key: "ten", label: "Tên lệnh", w: 200 },
  { key: "khach", label: "Khách hàng", w: 170 },
  { key: "nhom", label: "Nhóm", w: 110 },
  { key: "chuoi", label: "Chuỗi", w: 130 },
  { key: "dat", label: "Đã kiểm đạt / cần", w: 176, n: true },
  { key: "cho", label: "Chờ kiểm", w: 88, n: true },
  { key: "loi", label: "Lỗi do lệnh này gây", w: 280 },
  { key: "tt", label: "Tình trạng", w: 150 },
  { key: "ngay", label: "Ngày tạo", w: 104 },
  { key: "gan", label: "Lần KCS gần nhất" },
];

function OKcs({ cot, l }: { cot: string; l: SxKcsLenhItem }) {
  switch (cot) {
    case "ma":
      return <td>{l.ma}</td>;
    case "ten":
      return (
        <td title={l.ten || undefined}>
          {l.ten || <span className="lds-mu3">—</span>}
          {l.la_lenh_phu && <span className="lds-tag">Đi kèm</span>}
        </td>
      );
    case "khach":
      return l.khach ? <td className="lds-mu" title={l.khach}>{l.khach}</td> : <td className="lds-mu3">—</td>;
    case "nhom":
      return l.nhom_ma ? <td className="lds-mu">{l.nhom_ma}</td> : <td className="lds-mu3">—</td>;
    case "chuoi":
      return <td className="kcsb-o-chuoi"><ChuoiNho ma={l.ma} chuoi={l.chuoi} noiVao={l.noi_vao} /></td>;
    case "dat": {
      // Lệnh phụ không có bước kiểm hàng riêng — thành phẩm của nó kiểm ở bước cuối lệnh chính.
      if (l.la_lenh_phu) return <td className="c lds-mu3">Kiểm ở lệnh chính</td>;
      const c = l.cuoi;
      if (!c) return <td className="n lds-mu3">—</td>;
      return (
        <td className="n">
          <span className={c.dat > 0 ? "lds-la" : "lds-mu3"}>{num(c.dat)}</span>
          {c.muc_tieu != null && <span className="lds-mu"> / {num(c.muc_tieu)} {nhanChangLenh(c.don_vi, l.don_vi_tinh)}</span>}
        </td>
      );
    }
    case "cho": {
      if (l.la_lenh_phu || !l.cuoi || l.cuoi.cho_kiem <= 0) return <td className="n lds-mu3">—</td>;
      return <td className="n lds-cam">{num(l.cuoi.cho_kiem)}</td>;
    }
    case "loi": {
      if (l.loi_gay.length === 0) return <td className="lds-mu3">—</td>;
      const chu = l.loi_gay.map((g) => `${g.ten} ${num(g.so_luong)} ${nhanChangLenh(g.don_vi, l.don_vi_tinh)}`).join("\n");
      return (
        <td title={chu}>
          <span className="kcsb-hang kcsb-hang--rong">
            {l.loi_gay.map((g, i) => (
              <span key={i}><span className="lds-tag kcsb-tag">{g.ten}</span> <span className="lds-do">{num(g.so_luong)} {nhanChangLenh(g.don_vi, l.don_vi_tinh)}</span></span>
            ))}
          </span>
        </td>
      );
    }
    case "tt": {
      const tt = TINH_TRANG_LENH[l.tinh_trang];
      const so = l.tinh_trang === "cho_kiem" && l.cuoi ? ` ${num(l.cuoi.cho_kiem)}` : "";
      return <td><ChipTT mau={tt.mau}>{tt.nhan}{so}</ChipTT></td>;
    }
    case "ngay":
      return <td className="lds-mu" title={ngayGioDayDu(l.created_at)}>{ngayDayDu(l.created_at)}</td>;
    case "gan":
      return <td className="lds-mu" title={ngayGioDayDu(l.kcs_gan_nhat)}>{ngayDayDu(l.kcs_gan_nhat)}</td>;
    default:
      return <td />;
  }
}

export function KcsTheoLenhPage({
  eventTick, dinhKemDem, onBadgeStale, navigate,
}: {
  eventTick?: number;
  /** Bộ đếm sự kiện tệp lệnh đổi theo lệnh (AppShell) — sơ đồ nhóm nạp lại "Tệp của lệnh". */
  dinhKemDem?: Record<number, number>;
  onBadgeStale?: () => void;
  navigate?: NavigateFn;
}) {
  const { token } = useAuth();
  const can = useCan();
  useNapTenDonVi();
  // Yêu cầu nhập kho KCS tạo nằm ở màn Kho: người có "Tạo yêu cầu" mở ở tab Yêu cầu, thủ kho mở ở
  // "Phiếu từ yêu cầu". Không có quyền nào ở Kho thì mã chỉ hiện chữ.
  const coTabDeNghi = can("kho", "request");
  const coTabYeuCau = laNguoiKho(can);
  const moYeuCauKho = navigate && (coTabDeNghi || coTabYeuCau)
    ? (id: number) => navigate("kho-main", { khoOpenRequest: { id, view: coTabDeNghi ? "denghi" : "yeucau" } })
    : undefined;
  const [lsxId, setLsxId] = useState<number | null>(null);
  // Cột của lưới lệnh: ẩn / đổi chỗ / độ rộng nhớ theo máy người xem.
  const luoi = useCauHinhLuoi("kcs-lenh-b");
  const cotHien = luoi.rongHien(luoi.xep(COT_KCS).filter((c) => !luoi.an.has(c.key)));

  // ---- Danh sách lệnh --------------------------------------------------------------------
  const [tim, setTim] = useState("");
  const timCham = useDebounced(tim.trim());
  const [locMan, setLocMan] = useLocMan("kcs", LOC_MAN_TRONG, docLocMan, ghiLocMan);
  const [trang, setTrang] = useState(1);
  const [coTrang, setCoTrang] = useState(25);
  const [lenh, setLenh] = useState<SxKcsLenhList | null>(null);
  // "Trạng thái" trong Lọc = hàng nút lọc nhanh (cùng số trên nút).
  const dieuKien = useDieuKienKcs(NHANH.filter((k) => k !== "tat_ca")
    .map((k) => ({ value: k, nhan: NHAN_NHANH[k].nhan, so: lenh?.dem?.[k] })));
  const khoaLoc = JSON.stringify({ ...thamSoKy(locMan.ky), ...thamSoLocKcs(locMan.loc) });
  const coLoc = locMan.ky.loai !== "tat_ca" || dieuKien.some((d) => daAp(d, locMan.loc));
  const [lenhLoading, setLenhLoading] = useState(true);
  const [lenhLoi, setLenhLoi] = useState<string | null>(null);
  const [lenhTick, setLenhTick] = useState(0);

  useEffect(() => { setTrang(1); }, [timCham, khoaLoc, locMan.nhanh]);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLenhLoading(true);
    api.sanXuat.kcsLenh(token, {
      tim: timCham || undefined, trang, coTrang, nhanh: locMan.nhanh, loc: JSON.parse(khoaLoc),
    })
      .then((r) => { if (alive) { setLenh(r); setLenhLoi(null); } })
      .catch((e) => { if (alive) setLenhLoi(e instanceof ApiError ? e.message : "Không tải được danh sách lệnh."); })
      .finally(() => { if (alive) setLenhLoading(false); });
    return () => { alive = false; };
  }, [token, timCham, trang, khoaLoc, coTrang, locMan.nhanh, lenhTick, eventTick]);

  // ---- Báo cáo lỗi: thanh lọc riêng của tab, mặc định Tháng này theo ngày kiểm ------------
  const [timBc, setTimBc] = useState("");
  const timBcCham = useDebounced(timBc.trim());
  const thamSoBc = thamSoBcKcs(locMan.bcKy, locMan.bcLoc, timBcCham);
  const khoaBc = JSON.stringify(thamSoBc);
  const khoangBc = khoangKy(locMan.bcKy);
  const bcDangLoc = Boolean(timBcCham) || locMan.bcKy.loai !== "tat_ca"
    || locMan.bcLoc.khach != null || locMan.bcLoc.cong_doan != null;
  // Bấm-lọc trên tab (thanh, cột ngày, dòng bảng) + trang "Các lần ghi lỗi" — không lên URL.
  const [bcChon, setBcChon] = useState<ChonBcKcs>({});
  const [bcTrang, setBcTrang] = useState(1);
  const [bcCoTrang, setBcCoTrang] = useState(25);
  const [bcXem, setBcXem] = useState<SxKcsChieu>("cong_doan");
  const thamSoChon = {
    chon_cong_doan: bcChon.cong_doan, chon_to: bcChon.to, chon_tieu_chi: bcChon.tieu_chi, chon_ngay: bcChon.ngay,
  };
  const khoaBcDay = JSON.stringify({ ...thamSoBc, ...thamSoChon, trang: bcTrang, co_trang: bcCoTrang });
  // Đổi thanh lọc hay bấm-lọc thì về trang 1; đổi kỳ thì bỏ mốc ngày đã bấm (có thể nằm ngoài kỳ mới).
  const khoaBcChon = JSON.stringify(bcChon);
  useEffect(() => { setBcTrang(1); }, [khoaBc, khoaBcChon]);
  const khoaBcKy = JSON.stringify(locMan.bcKy);
  useEffect(() => { setBcChon((c) => (c.ngay ? { ...c, ngay: undefined } : c)); }, [khoaBcKy]);
  const [baoCao, setBaoCao] = useState<SxKcsBaoCao | null>(null);
  const [baoCaoLoading, setBaoCaoLoading] = useState(true);
  const [baoCaoError, setBaoCaoError] = useState<string | null>(null);
  const [baoCaoTick, setBaoCaoTick] = useState(0);
  const moBaoCao = locMan.tab === "bao_cao" && lsxId == null;
  useEffect(() => {
    if (!token || !moBaoCao) return;
    let alive = true;
    setBaoCaoLoading(true);
    setBaoCaoError(null);
    api.sanXuat.baoCaoKcs(token, JSON.parse(khoaBcDay))
      .then((r) => { if (alive) setBaoCao(r); })
      .catch((e) => { if (alive) setBaoCaoError(e instanceof ApiError ? e.message : "Không tải được báo cáo KCS."); })
      .finally(() => { if (alive) setBaoCaoLoading(false); });
    return () => { alive = false; };
  }, [token, moBaoCao, khoaBcDay, baoCaoTick, eventTick]);

  function daDoi() {
    setLenhTick((k) => k + 1);
    setBaoCaoTick((k) => k + 1);
    onBadgeStale?.();
  }

  // ---- Xuất Excel (cùng bộ lọc với tab Báo cáo lỗi — máy chủ gác cùng luật) ------------------
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  async function xuatExcel() {
    if (!token || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      // Cùng thanh lọc + bấm-lọc + cách xem đang thấy trên tab Báo cáo lỗi.
      const url = await api.sanXuat.exportBaoCaoKcsBlobUrl(token, { ...thamSoBc, ...thamSoChon, xem: bcXem });
      const a = document.createElement("a");
      a.href = url;
      a.download = khoangBc ? `Bao-cao-KCS-${khoangBc.tu}_${khoangBc.den}.xlsx` : "Bao-cao-KCS-moi-thoi-gian.xlsx";
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

  if (lsxId != null) {
    return (
      <main className="rc kcs-page lds">
        <KcsSoDoNhom lsxId={lsxId} eventTick={eventTick} dinhKemDem={dinhKemDem} navigate={navigate}
          onBack={() => setLsxId(null)} onChanged={daDoi} onMoYeuCauKho={moYeuCauKho} />
      </main>
    );
  }

  const dem = lenh?.dem;
  const xoaLoc = () => setLocMan({ ...locMan, nhanh: "tat_ca", ky: { loai: "tat_ca", moc: locMan.ky.moc }, loc: LOC_KCS_TRONG });

  return (
    <main className="rc kcs-page lds">
      <header className="lds-dau">
        <h1 className="lds-dau__ten">KCS</h1>
        <div className="lds-dau__nut">
          <button type="button" className="btn btn--ghost" onClick={xuatExcel} disabled={exporting}
            title={khoangBc
              ? `Báo cáo lỗi từ ${ngayDayDu(khoangBc.tu)} đến ${ngayDayDu(khoangBc.den)}, theo bộ lọc của tab Báo cáo lỗi`
              : "Báo cáo lỗi mọi thời gian, theo bộ lọc của tab Báo cáo lỗi"}>
            <Icon name="download" size={15} />
            {exporting ? "Đang xuất…" : "Xuất Excel"}
          </button>
        </div>
      </header>
      {exportError && <div className="banner banner--error" role="alert"><span>{exportError}</span></div>}

      <div className="kcsb-tabs" role="tablist" aria-label="Màn KCS">
        {([["lenh", "Lệnh"], ["bao_cao", "Báo cáo lỗi"]] as const).map(([k, nhan]) => (
          <button key={k} type="button" role="tab" aria-selected={locMan.tab === k} className={locMan.tab === k ? "on" : undefined}
            onClick={() => setLocMan({ ...locMan, tab: k })}>{nhan}</button>
        ))}
      </div>

      {locMan.tab === "bao_cao" ? (
        <KcsBaoCaoLoi data={baoCao} loading={baoCaoLoading} error={baoCaoError} onThuLai={() => setBaoCaoTick((k) => k + 1)}
          tim={timBc} onTim={setTimBc}
          ky={locMan.bcKy} onKy={(k) => setLocMan({ ...locMan, bcKy: k })}
          loc={locMan.bcLoc} onLoc={(l) => setLocMan({ ...locMan, bcLoc: l })}
          dangLoc={bcDangLoc}
          onXoaLoc={() => { setTimBc(""); setBcChon({}); setLocMan({ ...locMan, bcKy: { loai: "tat_ca", moc: "kiem" }, bcLoc: {} }); }}
          chon={bcChon} onChon={setBcChon} xem={bcXem} onXem={setBcXem}
          trang={bcTrang} coTrang={bcCoTrang} onTrang={setBcTrang}
          onCoTrang={(n) => { setBcCoTrang(n); setBcTrang(1); }} />
      ) : (
        <section className="kcs-lenh" aria-label="Lệnh sản xuất">
          <section className="lds-loc">
            <LocNhanhTrangThai
              muc={NHANH.map((k) => ({ key: k, label: NHAN_NHANH[k].nhan, mau: NHAN_NHANH[k].mau, count: dem?.[k] }))}
              dang={locMan.nhanh}
              onChon={(k) => setLocMan({ ...locMan, nhanh: k as SxKcsLocNhanh })}
              ariaLabel="Lọc lệnh theo tình trạng"
            />
            <div className="lds-loc__thanh tl-thanh" role="search">
              <OTim value={tim} onChange={setTim} placeholder="Tìm mã lệnh, sản phẩm, khách hàng…" ariaLabel="Tìm lệnh" />
              <ThanhLoc
                ky={locMan.ky}
                moc={MOC_KCS}
                onKy={(k) => setLocMan({ ...locMan, ky: k })}
                dieuKien={dieuKien}
                loc={{ ...locMan.loc, nhanh: locMan.nhanh }}
                onLoc={({ nhanh, ...loc }) => setLocMan({ ...locMan, loc, nhanh: nhanh ?? "tat_ca" })}
              />
              <span className="kcsb-gian" />
              <ChuGiaiChuoi />
              <ChonCot cot={COT_KCS} {...luoi.chonCot} />
            </div>
          </section>

          <div className="lds-sheet">
            <CuonLuoi ghim={luoi.soGhim(cotHien)}>
              <table className="lds-g" style={{ minWidth: rongLuoi(cotHien) }}>
                <colgroup>
                  {cotHien.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
                </colgroup>
                <thead>
                  <tr>
                    {cotHien.map((c) => <th key={c.key} className={c.n ? "n" : undefined}>{c.label}{luoi.keo(c.key)}</th>)}
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
                        {timCham || coLoc || locMan.nhanh !== "tat_ca"
                          ? "Không có lệnh nào khớp điều kiện đang lọc."
                          : "Chưa có lệnh nào vào nhóm thành phẩm."}{" "}
                        {(coLoc || locMan.nhanh !== "tat_ca") && (
                          <button type="button" className="lds-lk" onClick={xoaLoc}>Xoá bộ lọc</button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    lenh.items.map((l) => (
                      <tr key={l.lsx_id} className="lds-dong" tabIndex={0}
                        onClick={() => setLsxId(l.lsx_id)}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLsxId(l.lsx_id); }
                        }}>
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
      )}
    </main>
  );
}
