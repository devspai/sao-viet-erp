// Tab Tạm ứng (tách từ pages/LuongPage.tsx). Từ 25/09/2026 chạy cho nhà máy ~1000 người: tab trạng
// thái + bộ lọc + mặc định 50 dòng một trang, chọn nhiều qua mọi trang. Từ 06/10/2026 lọc, đếm tab
// và chia trang ở MÁY CHỦ; điều kiện khai ở `dieu-kien-tam-ung.ts`, thanh lọc dùng chung `ThanhLoc`.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Search, Wallet, X } from "lucide-react";
import {
  api,
  type SalaryAdvance,
  type TamUngDanhSach,
} from "../../../../api/client";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import type { NavigateFn } from "../../../../components/AppShell";
import { MonthPicker } from "../../../../components/MonthPicker";
import { trangHopLe } from "../../../../components/Pager";
import { PhanTrangDayDu } from "../../../../components/PhanTrangDayDu";
import { useCan } from "../../../../auth/permissions";
import { useTre } from "../../../../lib/useTre";
import { ThanhLoc } from "../../../thanh-loc/ThanhLoc";
import { thamSoKy } from "../../../thanh-loc/ky-danh-sach";
import { useLocMan } from "../../../thanh-loc/useLocMan";
import { curYm, errText, money, vuongIds } from "../shared/helpers";
import { LapHangLoatModal } from "../modals/LapHangLoatModal";
import { LapPhieuChiModal } from "../modals/LapPhieuChiModal";
import { PhieuChiMotLuotModal } from "../modals/PhieuChiMotLuotModal";
import { TamUngBang } from "./TamUngBang";
import { TamUngChonNhieu, taiFileChuyenKhoan } from "./TamUngChonNhieu";
import { TuNote } from "./TamUngHanhDong";
import {
  CO_TRANG,
  LOC_TU_TRONG,
  MOC_TU,
  TAB_TRANG_THAI,
  dieuKienTamUng,
  locTamUngLenUrl,
  locTamUngTuUrl,
  tachLoai,
  thamSoLocTamUng,
  type LocManTamUng,
  type LocTamUng,
  type TabTrangThai,
} from "./dieu-kien-tam-ung";
import { dkTrangThaiTab, nangDieuKien } from "../../dieu-kien-don";

/** Trần "chọn tất cả phiếu đang lọc" — máy chủ nhận tối đa ngần này dòng một lượt. */
const TRAN_CHON_TAT_CA = 5000;

export function TamUngTab({
  token,
  navigate,
  eventTick,
  canCreateAdvance,
  canApproveAdvance,
}: {
  token: string;
  navigate?: NavigateFn;
  eventTick?: number;
  canCreateAdvance: boolean;
  canApproveAdvance: boolean;
}) {
  const can = useCan();
  // Lập phiếu chi là việc của KẾ TOÁN, không phải của người duyệt tạm ứng (tách vai từ
  // 04/08/2026) ⇒ đi theo ô của phân hệ Phiếu chi, không theo `luong:approve`.
  const canLapPhieuChi = can("phieu_chi", "create");
  const canXemPhieuChi = can("phieu_chi", "read");
  const canXuat = can("luong", "export");
  const [ym, setYm] = useState(curYm);
  // Kỳ ngày (Ngày tạo / Ngày ứng) + tab trạng thái + Loại / Tổ / Số tiền — ghi lên URL, nhớ theo màn.
  const [locMan, setLocMan] = useLocMan("luong", LOC_TU_TRONG, locTamUngTuUrl, locTamUngLenUrl);
  const { ky, tab, loc } = locMan;
  const [q, setQ] = useState("");
  const qGui = useTre(q.trim(), 300);
  const [ds, setDs] = useState<TamUngDanhSach | null>(null);
  const [trang, setTrang] = useState(1);
  /** Cỡ trang đổi được ở chân bảng; mặc định giữ `CO_TRANG` (50) của màn nhà máy ~1000 người. */
  const [coTrang, setCoTrang] = useState(CO_TRANG);
  const [chon, setChon] = useState<Map<number, SalaryAdvance>>(() => new Map());
  const [chiXemChon, setChiXemChon] = useState(false);
  const [dangChonTatCa, setDangChonTatCa] = useState(false);
  const [hangLoat, setHangLoat] = useState(false);
  const [lapPcCho, setLapPcCho] = useState<SalaryAdvance | null>(null);
  // Phiếu chi vừa lập — lẻ hay MỘT LƯỢT đều là MỘT phiếu chi (25/09/2026); `soPhieu` = số phiếu tạm ứng.
  const [pcVuaLap, setPcVuaLap] = useState<{ id: number; code: string; tong: number; soPhieu: number } | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const [actVuong, setActVuong] = useState<number[]>([]);
  const [busyNhieu, setBusyNhieu] = useState(false);
  const [xacNhan, setXacNhan] = useState<{ duyet: boolean; advs: SalaryAdvance[] } | null>(null);
  const [pcNhieuCho, setPcNhieuCho] = useState<SalaryAdvance[] | null>(null);
  const [daDuyetNhieu, setDaDuyetNhieu] = useState<string | null>(null);
  const [year, month] = ym.split("-").map(Number);

  // Tham số lọc (trừ trang) — đổi thì về trang 1.
  const khoaLoc = JSON.stringify({ ...thamSoKy(ky), ...thamSoLocTamUng(loc), tab, q: qGui || undefined });
  const dangLoc = !!qGui || ky.loai !== "tat_ca" || Object.values(thamSoLocTamUng(loc)).some((v) => v != null);

  const load = useCallback(() => {
    // Máy chủ gắn sẵn mã phiếu chi lên từng dòng (`phieu_chi_code`) và trả số đếm tab sau lọc.
    api.luong
      .danhSachTamUng(token, year, month, { ...JSON.parse(khoaLoc), page: trang, size: coTrang })
      .then(setDs)
      .catch(() => setDs(null));
  }, [token, year, month, khoaLoc, trang, coTrang]);
  useEffect(() => {
    load();
  }, [load, eventTick]);
  useEffect(() => {
    setTrang(1);
  }, [khoaLoc]);

  const idsTab = useMemo(() => new Set(ds?.ids_tab ?? []), [ds]);
  const idsLoc = useMemo(() => new Set(ds?.ids_loc ?? []), [ds]);
  // Danh sách tải lại (người khác vừa duyệt, vừa lập phiếu chi…) ⇒ bỏ khỏi lựa chọn những phiếu đã
  // rời tab, để nút "Duyệt N phiếu" không đếm phiếu không còn thao tác được.
  useEffect(() => {
    if (!ds) return;
    setChon((cu) => {
      const con = new Map([...cu].filter(([id]) => idsTab.has(id)));
      return con.size === cu.size ? cu : con;
    });
  }, [ds, idsTab]);

  // Đổi KỲ LƯƠNG hoặc TAB ⇒ xoá lựa chọn (mỗi tab một loại việc). Đổi điều kiện / tìm / trang ⇒ GIỮ.
  function xoaChon() {
    setChon(new Map());
    setChiXemChon(false);
    setTrang(1);
  }
  const doiKyLuong = (v: string) => (setYm(v), xoaChon());
  const doiTab = (t: TabTrangThai) => (setLocMan({ ...locMan, tab: t }), xoaChon());

  const daChon = useMemo(() => [...chon.values()], [chon]);
  const hien = chiXemChon ? daChon.slice((trang - 1) * coTrang, trang * coTrang) : (ds?.items ?? []);
  const tongHien = chiXemChon ? daChon.length : (ds?.total ?? 0);
  const dem = ds?.dem_theo_tab ?? {};
  const coCotChon =
    (tab === "cho_duyet" && canApproveAdvance) ||
    (tab === "cho_chi" && (canLapPhieuChi || canXuat));
  useEffect(() => {
    const ve = trangHopLe(trang, tongHien, coTrang);
    if (ve !== null) setTrang(ve);
  }, [trang, tongHien, coTrang]);

  const dieuKien = useMemo(() => dieuKienTamUng(ds?.to_loc ?? []), [ds?.to_loc]);
  // Nút Lọc: "Trạng thái" đầu danh sách, ghi thẳng tab trạng thái (07/10/2026).
  const dieuKienMan = useMemo(
    () => [
      dkTrangThaiTab<LocManTamUng>({
        tabs: TAB_TRANG_THAI.map((t) => ({ id: t.key, nhan: t.nhan, so: dem[t.key] ?? 0 })),
        tatCa: "tat_ca",
        doc: (t) => t.tab,
        ghi: (t, id) => ({ ...t, tab: id as TabTrangThai }),
      }),
      ...dieuKien.map((dk) => nangDieuKien<LocManTamUng, LocTamUng>(dk)),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `dem` đổi theo `ds`
    [dieuKien, ds],
  );
  // Đổi tab qua nút Lọc cũng xoá lựa chọn như bấm tab (mỗi tab một loại việc).
  const datLocMan = (t: LocManTamUng) => {
    setLocMan(t);
    if (t.tab !== tab) xoaChon();
  };

  async function chonTatCa() {
    setDangChonTatCa(true);
    setActErr(null);
    try {
      const r = await api.luong.danhSachTamUng(token, year, month, {
        ...JSON.parse(khoaLoc), page: 1, size: TRAN_CHON_TAT_CA,
      });
      setChon((cu) => {
        const moi = new Map(cu);
        for (const a of r.items) moi.set(a.id, a);
        return moi;
      });
    } catch (e) {
      setActErr(errText(e));
    } finally {
      setDangChonTatCa(false);
    }
  }

  // File chuyển khoản theo mẫu lô lương BIZ MBBank — xuất ĐÚNG những phiếu đã duyệt / đã chi đang
  // hiện theo tab + bộ lọc (máy chủ bỏ qua phiếu chưa duyệt), hoặc phiếu đang tick.
  function xuatExcel(ids: number[]) {
    setActErr(null);
    setActVuong([]);
    if (ids.length === 0) {
      setActErr("Không có phiếu đã duyệt / đã chi nào trong bộ lọc đang xem để xuất.");
      return;
    }
    taiFileChuyenKhoan(token, year, month, ids).catch((e) => setActErr(errText(e)));
  }

  async function quyetNhieu(advs: SalaryAdvance[], approve: boolean) {
    setBusyNhieu(true);
    setActErr(null);
    setActVuong([]);
    setDaDuyetNhieu(null);
    try {
      const r = await api.luong.decideAdvancesBulk(token, { ids: advs.map((a) => a.id), approve });
      setDaDuyetNhieu(`Đã ${approve ? "duyệt" : "từ chối"} ${r.items.length} phiếu.`);
      setChon(new Map());
      setChiXemChon(false);
      load();
    } catch (e) {
      // Một phiếu vướng là không phiếu nào đổi — hiện nguyên câu server và cho bỏ chọn đúng phiếu vướng.
      setActErr(errText(e));
      setActVuong(vuongIds(e));
    } finally {
      setBusyNhieu(false);
      setXacNhan(null);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setActErr(null);
    setActVuong([]);
    try {
      await fn();
      load();
    } catch (e) {
      // Huỷ tạm ứng ĐÃ lập phiếu chi bị chặn kèm CÂU GIẢI THÍCH + mã phiếu chi — hiện NGUYÊN CÂU.
      setActErr(errText(e));
    }
  }

  function boChonVuong() {
    setChon((cu) => new Map([...cu].filter(([id]) => !actVuong.includes(id))));
    setActErr(null);
    setActVuong([]);
  }

  const biCheKhiXacNhan = xacNhan ? xacNhan.advs.filter((a) => !idsLoc.has(a.id)).length : 0;
  // Kỳ lương trống thật sự (không phải do bộ lọc) ⇒ màn "Chưa có tạm ứng tháng này".
  const kyTrong = ds != null && !dangLoc && (dem.tat_ca ?? 0) === 0;

  return (
    <div>
      <div className="cc-toolbar cc-ts-toolbar lg-toolbar">
        <div className="lg-toolbar-filters tl-thanh">
          <div className="lg-date-wrapper">
            <span className="lg-date-icon">
              <Calendar size={14} />
            </span>
            <MonthPicker value={ym} onChange={doiKyLuong} ariaLabel="Kỳ lương" />
          </div>
          <div className="lg-search-wrapper">
            <span className="lg-search-icon">
              <Search size={14} />
            </span>
            <input
              className="lg-search-input"
              placeholder="Tìm tên / mã NV / mã phiếu…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Tìm phiếu tạm ứng"
            />
            {q && (
              <button
                type="button"
                className="lg-search-clear"
                onClick={() => setQ("")}
                title="Xóa tìm kiếm"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <ThanhLoc
            ky={ky}
            moc={MOC_TU}
            onKy={(k) => setLocMan({ ...locMan, ky: k })}
            dieuKien={dieuKienMan}
            loc={locMan}
            onLoc={datLocMan}
          />
        </div>
        <div className="lg-toolbar-actions">
          <span className="lg-approved-badge">
            Đã duyệt: <b>{money(ds?.tong_da_duyet ?? 0)}đ</b>
          </span>
          {canXuat && (
            <button
              className="btn btn--ghost"
              onClick={() => xuatExcel(ds?.ids_loc ?? [])}
              title="File chuyển khoản các phiếu đã duyệt / đã chi đang hiện theo tab + bộ lọc — mẫu lô lương BIZ MBBank; tiền mặt ghi TIỀN MẶT"
            >
              Xuất Excel
            </button>
          )}
          {/* MỘT nút cho cả tạm ứng lẫn lương đợt 1, một người hay nhiều người (25/09/2026). */}
          {canCreateAdvance && (
            <button
              className="btn btn--primary"
              onClick={() => setHangLoat(true)}
              title="Lập phiếu tạm ứng / lương đợt 1 — cho một người hoặc chọn tất cả người đủ điều kiện công"
            >
              + Lập phiếu
            </button>
          )}
        </div>
      </div>

      {actErr && (
        <TuNote
          tone="error"
          onClose={() => {
            setActErr(null);
            setActVuong([]);
          }}
          link={
            actVuong.length > 0
              ? { label: `Bỏ chọn ${actVuong.length} phiếu vướng`, onClick: boChonVuong }
              : null
          }
        >
          {actErr}
        </TuNote>
      )}
      {/* Báo THÀNH CÔNG ở lại tới khi tự đóng (không tự tắt sau vài giây) vì nó mang MÃ PHIẾU
          CHI bấm được — mã trôi mất là kế toán phải đi tìm lại trong sổ quỹ. */}
      {pcVuaLap && (
        <TuNote
          tone="success"
          onClose={() => setPcVuaLap(null)}
          link={
            navigate
              ? {
                  label: "Mở phiếu chi",
                  onClick: () => navigate("ke-toan-phieu-chi", { focusVoucherQuery: pcVuaLap.code }),
                }
              : null
          }
        >
          Đã lập phiếu chi <b className="lg-tu-note__code">{pcVuaLap.code}</b>
          {pcVuaLap.soPhieu > 1 ? ` cho ${pcVuaLap.soPhieu} phiếu — tổng ` : " — "}
          {money(pcVuaLap.tong)}đ, tiền đã ra khỏi két.
        </TuNote>
      )}
      {daDuyetNhieu && (
        <TuNote tone="success" onClose={() => setDaDuyetNhieu(null)}>
          {daDuyetNhieu}
        </TuNote>
      )}

      {kyTrong ? (
        <div className="lg-table-empty-state">
          <div className="lg-table-empty-icon">
            <Wallet size={20} />
          </div>
          <span className="lg-table-empty-title">Chưa có tạm ứng tháng này</span>
          <span className="lg-table-empty-desc">
            Nhấp nút "+ Lập phiếu" để lập phiếu tạm ứng / lương đợt 1 cho nhân viên trong kỳ.
          </span>
        </div>
      ) : (
        <>
          <div className="lg-tu-loc">
            <div className="lg-seg lg-tu-loc__tab" role="tablist" aria-label="Trạng thái phiếu">
              {TAB_TRANG_THAI.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  className={tab === t.key ? "is-active" : ""}
                  onClick={() => doiTab(t.key)}
                >
                  {t.nhan} <span className="lg-tu-loc__dem">{dem[t.key] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
          <TamUngChonNhieu
            tab={tab}
            coPhieuTrongTab={idsTab.size > 0}
            idsLoc={idsLoc}
            daChon={daChon}
            dangChonTatCa={dangChonTatCa}
            onChonTatCa={() => void chonTatCa()}
            onBoChon={() => {
              setChon(new Map());
              setChiXemChon(false);
            }}
            chiXemChon={chiXemChon}
            setChiXemChon={(v) => {
              setChiXemChon(v);
              setTrang(1);
            }}
            busy={busyNhieu}
            canDuyet={canApproveAdvance}
            canLapPhieuChi={canLapPhieuChi}
            canXuat={canXuat}
            onDuyet={(advs) => setXacNhan({ duyet: true, advs })}
            onTuChoi={(advs) => setXacNhan({ duyet: false, advs })}
            onLapPhieuChi={(advs) => setPcNhieuCho(advs)}
            onXuatExcel={(advs) => xuatExcel(advs.map((a) => a.id))}
          />
          {hien.length === 0 ? (
            <div className="lg-table-empty-state">
              <span className="lg-table-empty-title">Không có phiếu nào khớp</span>
              <span className="lg-table-empty-desc">
                Đổi tab trạng thái, bỏ bớt điều kiện lọc hoặc từ khoá tìm rồi xem lại.
              </span>
            </div>
          ) : (
            <>
              <TamUngBang
                rows={hien}
                coCotChon={coCotChon}
                chon={chon}
                setChon={setChon}
                navigate={canXemPhieuChi ? navigate : undefined}
                canApproveAdvance={canApproveAdvance}
                canLapPhieuChi={canLapPhieuChi}
                act={act}
                token={token}
                onLapPhieuChi={setLapPcCho}
              />
              <PhanTrangDayDu
                trang={trang} size={coTrang} tong={tongHien} soDong={hien.length}
                donVi="phiếu"
                onTrang={setTrang}
                onSize={(n) => { setCoTrang(n); setTrang(1); }}
                ghiChu={coCotChon ? "ô tick đầu bảng chọn cả trang đang xem" : undefined}
                ariaLabel="Phân trang phiếu tạm ứng"
              />
            </>
          )}
        </>
      )}

      {hangLoat && (
        <LapHangLoatModal
          token={token}
          year={year}
          month={month}
          onClose={() => setHangLoat(false)}
          onSaved={() => {
            setHangLoat(false);
            load();
          }}
        />
      )}

      {pcNhieuCho && (
        <PhieuChiMotLuotModal
          token={token}
          advs={pcNhieuCho}
          onClose={() => setPcNhieuCho(null)}
          onDone={(r) => {
            const [pc] = r.vouchers;
            setPcVuaLap({ id: pc.id, code: pc.code, tong: r.total_amount, soPhieu: pcNhieuCho.length });
            setPcNhieuCho(null);
            setActErr(null);
            setChon(new Map());
            setChiXemChon(false);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={xacNhan != null}
        title={`${xacNhan?.duyet ? "Duyệt" : "Từ chối"} ${xacNhan?.advs.length ?? 0} phiếu?`}
        message={
          xacNhan
            ? tachLoai(xacNhan.advs) +
              (biCheKhiXacNhan > 0
                ? ` — trong đó ${biCheKhiXacNhan} phiếu đang không hiện vì bộ lọc.`
                : ".") +
              (xacNhan.duyet
                ? ""
                : " Phiếu bị từ chối không duyệt lại được — muốn ứng tiếp thì lập phiếu mới.")
            : undefined
        }
        confirmLabel={`${xacNhan?.duyet ? "Duyệt" : "Từ chối"} ${xacNhan?.advs.length ?? 0} phiếu`}
        danger={!xacNhan?.duyet}
        busy={busyNhieu}
        onConfirm={() => xacNhan && void quyetNhieu(xacNhan.advs, xacNhan.duyet)}
        onCancel={() => setXacNhan(null)}
      />

      {lapPcCho && (
        <LapPhieuChiModal
          token={token}
          adv={lapPcCho}
          onClose={() => setLapPcCho(null)}
          onDone={(pc) => {
            setLapPcCho(null);
            setActErr(null);
            setPcVuaLap({ id: pc.id, code: pc.code, tong: pc.amount, soPhieu: 1 });
            load();
          }}
        />
      )}
    </div>
  );
}
