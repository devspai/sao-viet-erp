// Màn "Yêu cầu nhập xuất" — người YÊU CẦU (tổ trưởng SX, NV sản xuất, QL sản xuất, NV mua hàng).
//
// Ranh giới của màn này là ranh giới QUYỀN: người yêu cầu KHÔNG thấy số tồn, KHÔNG thấy giá,
// KHÔNG thấy lô, KHÔNG chọn kho. Yêu cầu chỉ nói "xin cái gì, bao nhiêu"; kho nào là quyết định
// ở BƯỚC LẬP PHIẾU (thủ kho). SIẾT 2026-08-08: mặt hàng phải có sẵn trong danh mục Giấy / Vật
// tư khác — không còn gõ tên tự do rồi kho gắn mã sau.
import { ChonNgay } from "../components/ChonNgay";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiError,
  api,
  type HangLoai,
  type MatHangOption,
  type StockRequest,
  type StockRequestKind,
  type StockRequestLine,
  type StockRequestLineInput,
  type StockRequestStatus,
  type TonKhoaRow,
} from "../api/client";
import { KhungKho } from "../components/kho-giay/KhungKho";
import { NganPhai } from "./ke-toan/shared/NganPhai";
import "./ke-toan/ke-toan.css";
import "./kho-ngan-a.css";
import "./mua-hang/yeu-cau-mua-hang/components/yc-form-a.css";
import "./mua-hang/yeu-cau-mua-hang/components/yc-ds-a.css";
import "./mua-hang/phieu-mua-hang/components/don-form-a.css";
import { InboxRequestDrawer, VoucherDrawer } from "./KhoYeuCauPage";
import { NguonA, TienDoA, canLucCua } from "./khoNganA";
import { useAuth } from "../auth/useAuth";
import { useCan } from "../auth/permissions";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { DonViChonTheoHang, MaterialCombobox } from "../components/MaterialCombobox";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import { chuanKho, type DangGiay } from "../lib/khoGiay";
import { fmtDate, fmtDateISO, fmtDateTime } from "../utils/format";
import {
  LOC_MAN_YCK_TRONG,
  MAN_YEU_CAU_KHO,
  MOC_YEU_CAU_KHO,
  docLocManYCK,
  ghiLocManYCK,
  thamSoLocYCK,
  useDieuKienYeuCauKho,
  type LocManYCK,
  type LocYeuCauKho,
} from "./loc-kho/dieu-kien-yeu-cau-kho";
import { ThanhLoc } from "./thanh-loc/ThanhLoc";
import { thamSoKy } from "./thanh-loc/ky-danh-sach";
import { dkTheoTab, soDaAp, type DieuKien } from "./thanh-loc/thanh-loc";
import { useLocMan } from "./thanh-loc/useLocMan";
import { REQUEST_STATUS, DEFAULT_PAGE_SIZE, fmtQty, isOverdue, todayISO } from "./khoShared";
import {
  CuonLuoi, ChipTT, ChonCot, LocNhanhTrangThai, OTim,
  rongLuoi, useCauHinhLuoi, type CotLuoi, type MauTT,
} from "../components/LuoiDs";
import { EmptyRow } from "../components/EmptyState";
import { tenDonVi, useNapTenDonVi } from "./tenDonVi";
import "./rebuild-catalog.css";
import "./kho-request.css";

type TabId = "all" | "dang-cap" | "done" | "khong-thanh";

// BỎ BƯỚC DUYỆT: tạo yêu cầu là 'approved' NGAY → không còn 'draft'/'pending' để lọc, bỏ luôn tab
// "Chờ duyệt". Yêu cầu mới rơi thẳng vào "Đang cấp".
const TAB_STATUSES: Record<Exclude<TabId, "all">, StockRequestStatus[]> = {
  "dang-cap": ["approved", "received", "preparing", "partial"],
  done: ["done"],
  "khong-thanh": ["rejected", "cancelled"],
};

export function KhoDeNghiPage({
  eventTick = 0,
  dieuChuyen = false,
  initialSeed = null,
  onSeedConsumed,
  unseenDone = 0,
  unseenFail = 0,
  onSeen,
  openRequestId = null,
  onOpenRequestConsumed,
  slotNut = null,
}: {
  eventTick?: number;
  /** Chỗ trong đầu trang chung của `KhoPage` (`lds-dau__nut`) để đặt nút "Tạo yêu cầu": nút cần
   *  state ngăn của màn này nên được vẽ vào đó bằng portal, không nâng state lên vỏ. */
  slotNut?: HTMLElement | null;
  /** Tab ĐIỀU CHUYỂN: chỉ hiện yêu cầu điều chuyển (dieu_chuyen=true) + ẩn nút "Tạo yêu cầu"
   *  (điều chuyển tạo từ màn Tồn kho, không tạo tay ở đây). */
  dieuChuyen?: boolean;
  /** Điều hướng kèm dữ liệu → mở sẵn form TẠO đã điền (vd "Nhập kho" từ đợt giao đơn mua). */
  initialSeed?: KhoNhapSeed | null;
  /** Báo cha đã tiêu thụ seed (xoá đi để không mở lại khi remount). */
  onSeedConsumed?: () => void;
  /** Phản hồi kho CHƯA XEM của người tạo → số đỏ cạnh bộ lọc Hoàn tất / Không thành. */
  unseenDone?: number;
  unseenFail?: number;
  /** Sau khi mở xem 1 yêu cầu (đã đánh dấu đã xem) → refetch badge/số đỏ ở AppShell. */
  onSeen?: () => void;
  /** Bấm thông báo → mở sẵn drawer đúng yêu cầu này (id). */
  openRequestId?: number | null;
  onOpenRequestConsumed?: () => void;
}) {
  const { token, user } = useAuth();
  const can = useCan();
  // Cột Tiến độ in tên đơn vị ("tờ") chứ không in mã (`to_tp`) — nạp bảng tên đơn vị cho danh sách.
  useNapTenDonVi();
  const luoi = useCauHinhLuoi("kho-yeu-cau");
  const canRequest = can("kho", "request");

  const [rows, setRows] = useState<StockRequest[]>([]);
  const [totalCount, setTotalCount] = useState(0);         // tổng bản ghi khớp lọc (từ BE)
  const [counts, setCounts] = useState<Record<string, number>>({}); // số theo trạng thái → badge tab
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabId>("all");
  const [page, setPage] = useState(1);
  // Kỳ (Ngày yêu cầu / Ngày cần / Ngày duyệt) + Phòng ban, Người yêu cầu, Kho — lọc ở máy chủ.
  const [locMan, setLocManGoc] = useLocMan(MAN_YEU_CAU_KHO, LOC_MAN_YCK_TRONG, docLocManYCK, ghiLocManYCK);
  const setLocMan = (t: LocManYCK) => {
    setLocManGoc(t);
    setPage(1);
  };
  const dieuKien = useDieuKienYeuCauKho(dieuChuyen);
  // Nhập và Xuất chung một bảng; đang lọc đúng một chiều thì "Tạo yêu cầu" mở sẵn chiều đó.
  const loai = locMan.loc.loai;
  const khoaLoc = JSON.stringify({ ...thamSoKy(locMan.ky), ...thamSoLocYCK(locMan.loc) });
  const coLoc = locMan.ky.loai !== "tat_ca" || soDaAp(dieuKien, locMan.loc) > 0;
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // null = đóng; "new" = soạn mới; {id} = mở yêu cầu đã có; {seed} = tạo lại từ yêu cầu cũ.
  const [drawer, setDrawer] = useState<
    | null
    | { mode: "new"; seed?: SeedLine[]; loai?: StockRequestKind; ghiChu?: string; ngayCan?: string; locked?: boolean; deliveryId?: number; donMuaMa?: string; dotSo?: number; nccTen?: string; hoaDon?: string }
    | { mode: "open"; id: number }
  >(null);
  // Phiếu kho mở từ ngăn yêu cầu (chồng lên trên).
  const [openVoucher, setOpenVoucher] = useState<number | null>(null);

  // Mở sẵn form TẠO khi được điều hướng kèm seed (bấm "Nhập kho" ở đợt giao đơn mua). Tiêu thụ
  // một lần: báo cha xoá seed để lần remount sau (đổi chiều Nhập/Xuất) không tự bật lại form.
  useEffect(() => {
    if (initialSeed?.seed?.length) {
      setDrawer({
        mode: "new",
        seed: initialSeed.seed,
        loai: "NHAP",
        ghiChu: initialSeed.ghi_chu,
        ngayCan: initialSeed.ngay_can,
        locked: initialSeed.locked,
        deliveryId: initialSeed.deliveryId,
        donMuaMa: initialSeed.don_mua_ma,
        dotSo: initialSeed.dot_so,
        nccTen: initialSeed.ncc_ten,
        hoaDon: initialSeed.hoa_don,
      });
      onSeedConsumed?.();
    }
  }, [initialSeed, onSeedConsumed]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    // BE-paging: tải ĐÚNG trang theo tab + kỳ + điều kiện; đếm số theo trạng thái riêng (cùng lọc).
    // Sắp theo 'id' (mới TẠO lên đầu) — yêu cầu vừa tạo hiện trên cùng.
    const filters = {
      q: q || null,
      dieu_chuyen: dieuChuyen,
      loc: JSON.parse(khoaLoc),
    };
    const tabStatuses = tab === "all" ? undefined : TAB_STATUSES[tab];
    Promise.all([
      api.kho.deNghi.list(token, { ...filters, trang_thai: tabStatuses, order: "id", page, size: pageSize }),
      api.kho.deNghi.tabCounts(token, filters),
    ])
      .then(([r, c]) => {
        setRows(r.items);
        setTotalCount(r.total);
        setCounts(c);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Không tải được danh sách yêu cầu."))
      .finally(() => setLoading(false));
  }, [token, q, dieuChuyen, khoaLoc, tab, page, pageSize]);

  // Gõ tìm → chờ 300ms rồi mới gọi (mỗi lần gọi backend phải tính đèn tồn cho từng dòng).
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // SSE đẩy tín hiệu đổi trạng thái → danh sách tự tươi, không bắt người dùng F5.
  useEffect(() => {
    if (eventTick > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventTick]);

  // Bấm thông báo → mở sẵn drawer đúng yêu cầu + đánh dấu đã xem (là yêu cầu của người tạo) + hạ badge.
  useEffect(() => {
    if (openRequestId == null) return;
    setDrawer({ mode: "open", id: openRequestId });
    if (token) {
      api.kho.deNghi
        .markSeen(token, openRequestId)
        .then(() => onSeen?.())
        .catch(() => {});
    }
    onOpenRequestConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequestId]);

  // Đang đứng ở màn này mà có phản hồi kho chưa xem (lúc mở màn, hoặc SSE vừa đẩy tới) ⇒ coi như đã
  // xem hết: bản ghi đã hiện trên danh sách, không bắt bấm mở từng cái mới tắt chấm.
  useEffect(() => {
    if (!token || unseenDone + unseenFail === 0) return;
    api.kho.deNghi.seenAll(token).then(() => onSeen?.()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, unseenDone, unseenFail]);

  const meId = user?.id ?? -1;

  // Mở xem 1 yêu cầu. Nếu là phản hồi cuối (Hoàn tất / Không thành) thì đánh dấu ĐÃ XEM (per-request)
  // rồi refetch badge/số đỏ — "bấm xem cái nào mất cái đó".
  function openRequest(r: StockRequest) {
    setDrawer({ mode: "open", id: r.id });
    const terminal =
      r.trang_thai === "done" || r.trang_thai === "rejected" || r.trang_thai === "cancelled";
    if (token && terminal) {
      api.kho.deNghi
        .markSeen(token, r.id)
        .then(() => onSeen?.())
        .catch(() => {});
    }
  }

  // Số trên tab = CỘNG số theo trạng thái (BE trả `counts`); tab "Tất cả" = tổng mọi trạng thái.
  function countOf(id: TabId): number {
    if (id === "all") return Object.values(counts).reduce((s, n) => s + n, 0);
    return TAB_STATUSES[id].reduce((s, st) => s + (counts[st] ?? 0), 0);
  }

  // BE đã lọc (tab + 2 khoảng ngày + q) + phân trang + sắp 'updated' desc (khớp sortRequests)
  // → dùng thẳng danh sách trả về làm trang hiện tại.
  const total = totalCount;
  const shown = rows;

  useEffect(() => {
    setPage(1);
  }, [tab, q, khoaLoc, pageSize]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "all", label: "Tất cả" },
    { id: "dang-cap", label: "Đang cấp" },
    { id: "done", label: "Hoàn tất" },
    { id: "khong-thanh", label: "Đã hủy" },
  ];
  // Trạng thái trong nút Lọc = chính dải chip (đọc/ghi `tab`), không đẻ state thứ hai.
  const dkDu: DieuKien<LocYeuCauKho>[] = [
    dkTheoTab<LocYeuCauKho>({
      tabs: tabs.map((t) => ({ id: t.id, nhan: t.label, so: countOf(t.id) })),
      tatCa: "all", dang: tab, dat: (id) => setTab(id as TabId),
    }),
    ...dieuKien,
  ];

  // Yêu cầu KHÔNG gắn kho nên không có tồn để soi → không có cột đèn. Cột "Người yêu cầu" cho thấy
  // AI xin ngay trên bảng; Bộ phận của người đó là cột riêng ở cuối (ẩn được qua nút Cột).
  const cotHien = luoi.rongHien(
    luoi
      .xep(COT_YC)
      .filter((c) => !luoi.an.has(c.key))
      .map((c) => (c.key === "can" ? { ...c, label: loai === "NHAP" ? "Cần nhập lúc" : "Cần lúc" } : c)),
  );
  const muc = tabs.map((t) => ({ key: t.id, label: t.label, count: countOf(t.id), mau: MAU_TAB_YC[t.id] }));
  const khongLoc = !coLoc && !q && tab === "all";
  const nutTao = canRequest && !dieuChuyen ? (
    <Button variant="accent" onClick={() => setDrawer({ mode: "new", loai })}>
      <PlusIcon /> Tạo yêu cầu
    </Button>
  ) : null;

  return (
    <>
      {/* Tên màn + nút chính nằm ở đầu trang chung của KhoPage; nút vẽ vào chỗ đó bằng portal. */}
      {slotNut && nutTao ? createPortal(nutTao, slotNut) : null}

      <section className="lds-loc">
        <LocNhanhTrangThai muc={muc} dang={tab} onChon={(k) => setTab(k as TabId)} />
        <div className="lds-loc__thanh tl-thanh" role="search">
          <OTim value={q} onChange={setQ} placeholder="Tìm mã yêu cầu, vật tư" ariaLabel="Tìm yêu cầu nhập xuất" />
          <ThanhLoc
            ky={locMan.ky}
            moc={MOC_YEU_CAU_KHO}
            onKy={(ky) => setLocMan({ ...locMan, ky })}
            dieuKien={dkDu}
            loc={locMan.loc}
            onLoc={(loc) => setLocMan({ ...locMan, loc })}
          />
          <ChonCot cot={COT_YC} {...luoi.chonCot} />
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
                {cotHien.map((c) => (
                  <th key={c.key}>
                    {c.label}
                    {luoi.keo(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && shown.length === 0 ? (
                <EmptyRow colSpan={cotHien.length} trangThai="dang-tai" />
              ) : error ? (
                <tr>
                  <td colSpan={cotHien.length} className="lds-trong">
                    <span className="lds-do">{error}</span>{" "}
                    <button type="button" className="lds-lk" onClick={load}>Thử lại</button>
                  </td>
                </tr>
              ) : shown.length === 0 ? (
                <tr>
                  <td colSpan={cotHien.length} className="lds-trong">
                    {khongLoc
                      ? dieuChuyen
                        ? "Chưa có điều chuyển nào. Tạo điều chuyển ở màn Tồn kho (nút “Chuyển kho”)."
                        : "Chưa có yêu cầu nào. Tạo yêu cầu để xin nhập hoặc lĩnh vật tư."
                      : "Không có yêu cầu nào khớp điều kiện đang lọc."}{" "}
                    {khongLoc ? (
                      nutTao && (
                        <button type="button" className="lds-lk" onClick={() => setDrawer({ mode: "new", loai })}>
                          Tạo yêu cầu
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className="lds-lk"
                        onClick={() => {
                          setQ("");
                          setTab("all");
                          setLocMan(LOC_MAN_YCK_TRONG);
                        }}
                      >
                        Xoá bộ lọc
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                shown.map((r) => (
                  <tr
                    key={r.id}
                    className={`lds-dong${drawer?.mode === "open" && drawer.id === r.id ? " is-chon" : ""}`}
                    tabIndex={0}
                    onClick={() => openRequest(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRequest(r);
                      }
                    }}
                  >
                    {cotHien.map((c) => <OYeuCau key={c.key} cot={c.key} r={r} />)}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CuonLuoi>
        {/* Về trang 1 ngay trong cùng lượt đổi cỡ — khỏi một lượt nạp thừa (trang cũ × cỡ mới) trước
            khi effect reset kịp chạy. */}
        {!error && total > 0 && (
          <PhanTrangDayDu trang={page} size={pageSize} tong={total} soDong={shown.length}
            onTrang={setPage} onSize={(n) => { setPageSize(n); setPage(1); }} loading={loading} donVi="yêu cầu"
            ariaLabel="Phân trang yêu cầu nhập xuất" />
        )}
      </div>

      {drawer?.mode === "open" && token && (
        // Xem yêu cầu ĐÃ GỬI: cùng ngăn khuôn A với bên kho, chỉ khác nút ở đầu ngăn theo vai. Tồn chỉ
        // hiện khi người xem có quyền xem tồn đúng kho đó (máy chủ cũng gate), giá theo `view_cost`.
        <InboxRequestDrawer
          key={`req-${drawer.id}`}
          token={token}
          khoId={null}
          requestId={drawer.id}
          canCreate={false}
          canViewStock={false}
          canViewCost={can("kho", "view_cost")}
          onClose={() => setDrawer(null)}
          onCreateVoucher={() => {}}
          onOpenVoucher={setOpenVoucher}
          thaoTac={(r) =>
            // Bị từ chối / đã hủy: chủ yêu cầu tạo lại nhanh từ chính các dòng cũ. Điều chuyển KHÔNG tạo
            // lại ở đây — điều chuyển chỉ sinh từ màn Tồn kho (nút "Chuyển kho").
            (r.trang_thai === "rejected" || r.trang_thai === "cancelled") && r.nguoi_tao_id === meId
              && canRequest && !r.dieu_chuyen ? (
              <button type="button" className="kna-nut kna-nut--chinh"
                onClick={() => setDrawer({ mode: "new", seed: r.lines.map(seedTuDong), loai: r.loai })}>
                Tạo lại từ yêu cầu này
              </button>
            ) : null
          }
        />
      )}

      {/* Người TẠO xem phiếu đã cấp — cùng ngăn phiếu như bên kho, chỉ đọc. Giá theo `view_cost`. */}
      {openVoucher != null && token && (
        <VoucherDrawer
          key={`v-${openVoucher}`}
          token={token}
          voucherId={openVoucher}
          canCreate={false}
          canPost={false}
          canViewCost={can("kho", "view_cost")}
          onClose={() => setOpenVoucher(null)}
          onChanged={() => {}}
          tang={1}
        />
      )}

      {drawer?.mode === "new" && token && (
        <TaoYeuCauP2
          key="req-new"
          token={token}
          seed={drawer.seed}
          seedLoai={drawer.loai}
          seedGhiChu={drawer.ghiChu}
          seedNgayCan={drawer.ngayCan}
          seedLocked={drawer.locked}
          seedDeliveryId={drawer.deliveryId}
          seedDonMuaMa={drawer.donMuaMa}
          seedDotSo={drawer.dotSo}
          seedNccTen={drawer.nccTen}
          seedHoaDon={drawer.hoaDon}
          canRequest={canRequest}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            // Về trang 1 để yêu cầu VỪA TẠO (mới nhất, trên cùng vì order=id desc) chắc chắn hiện;
            // refetch ngay tại chỗ, KHÔNG reload cả trang.
            setPage(1);
            load();
          }}
        />
      )}
    </>
  );
}

// ── Lưới danh sách (khuôn chung 08/10/2026) ──────────────────────────────────
// Thứ tự: Mã, Ngày tạo, Loại, Vật tư, Nguồn, Tiến độ, Cần lúc, Trạng thái, Người yêu cầu, Bộ phận.
interface CotYC extends CotLuoi { w?: number }
const COT_YC: CotYC[] = [
  { key: "ma", label: "Mã yêu cầu", coDinh: true, w: 120 },
  { key: "ngay", label: "Ngày tạo", w: 104 },
  { key: "loai", label: "Loại", w: 104 },
  { key: "vattu", label: "Vật tư", w: 250 },
  { key: "nguon", label: "Nguồn", w: 180 },
  { key: "tiendo", label: "Tiến độ", w: 170 },
  { key: "can", label: "Cần lúc", w: 140 },
  { key: "tt", label: "Trạng thái", w: 150 },
  { key: "nguoi", label: "Người yêu cầu", w: 150 },
  { key: "bophan", label: "Bộ phận" },
];

/** Chấm màu của hàng lọc nhanh (theo nhóm trạng thái). */
const MAU_TAB_YC: Record<TabId, MauTT | undefined> = {
  all: undefined,
  "dang-cap": "cam",
  done: "la",
  "khong-thanh": "xam",
};

/** Mỗi trạng thái một sắc, không trùng nhau. */
const MAU_TT_YC: Record<string, MauTT> = {
  draft: "slate",
  pending: "vang",
  approved: "xanh",
  received: "cyan",
  preparing: "tim",
  partial: "cam",
  done: "la",
  rejected: "do",
  cancelled: "xam",
};

/** Chip loại yêu cầu (chip khâu, góc vuông). */
function chipLoai(r: StockRequest): { mau: MauTT; nhan: string } {
  if (r.dieu_chuyen) return { mau: "slate", nhan: "Điều chuyển" };
  return r.loai === "NHAP" ? { mau: "ngoc", nhan: "Nhập" } : { mau: "cham", nhan: "Xuất" };
}

function OYeuCau({ cot, r }: { cot: string; r: StockRequest }) {
  switch (cot) {
    case "ma":
      return <td title={r.ma}>{r.ma}</td>;
    case "ngay":
      return <td title={fmtDateTime(r.created_at)}>{fmtDate(r.created_at)}</td>;
    case "loai": {
      const l = chipLoai(r);
      return <td><ChipTT mau={l.mau} vuong>{l.nhan}</ChipTT></td>;
    }
    case "vattu": {
      const ten = r.lines[0]?.hang_ten ?? "—";
      const them = r.lines.length - 1;
      return (
        <td title={ten}>
          <span className="kho-vt">
            <span className="kho-vt__ten">{ten}</span>
            {them > 0 && <span className="lds-tag">+{them} mặt hàng</span>}
          </span>
        </td>
      );
    }
    case "nguon":
      return <td><NguonA r={r} /></td>;
    case "tiendo":
      return <td><TienDoA r={r} /></td>;
    case "can": {
      const canLuc = canLucCua(r);
      const quaHan = isOverdue(r.ngay_can, r.trang_thai, r.can_luc);
      if (!canLuc) return <td className="lds-mu">Chưa hẹn</td>;
      return <td className={quaHan ? "lds-do" : undefined} title={quaHan ? "Quá hạn" : undefined}>{canLuc}</td>;
    }
    case "tt": {
      const nhan = r.trang_thai === "partial" && r.loai === "NHAP"
        ? "Đã nhập một phần"
        : (REQUEST_STATUS[r.trang_thai]?.label ?? r.trang_thai);
      return <td><ChipTT mau={MAU_TT_YC[r.trang_thai] ?? "slate"}>{nhan}</ChipTT></td>;
    }
    case "nguoi":
      return <td title={r.nguoi_tao_ten ?? undefined}>{r.nguoi_tao_ten ?? "—"}</td>;
    case "bophan":
      return r.bo_phan_ten ? <td title={r.bo_phan_ten}>{r.bo_phan_ten}</td> : <td className="lds-mu">—</td>;
    default:
      return <td />;
  }
}

// ── Ô "Cho lệnh nào" (mg 0175) ───────────────────────────────────────────────
// MỘT ô cho cả lệnh lẫn bài ghép: người yêu cầu không nghĩ theo hai khái niệm, họ nghĩ "đợt hàng
// này". Giá trị mã hoá `lsx:<id>` / `bg:<id>` rồi tách ra lúc gửi, nên payload vẫn là hai cột rõ ràng.

interface LenhOption {
  kind: "lsx" | "bai_ghep";
  id: number;
  ma: string;
  ten: string;
}

/** Nhãn chỉ-đọc của ô "Cho lệnh". Đọc thẳng `lsx_ma`/`bai_ghep_ma` server GỬI KÈM từng dòng
 *  (`schemas/stock.py`), không tra trong một danh sách đã tải — danh sách ấy vốn không thể chứa
 *  hết 100.000 lệnh, và tra hụt thì nhãn tụt xuống "Lệnh #123" dù lệnh vẫn sống. */
function lenhNhan(l: { lsx_id?: number | null; bai_ghep_id?: number | null;
                       lsx_ma?: string | null; bai_ghep_ma?: string | null }): string {
  if (l.lsx_ma) return l.lsx_ma;
  if (l.bai_ghep_ma) return l.bai_ghep_ma;
  // Có id mà server chưa kịp gửi mã (dòng vừa chọn tại chỗ) — vẫn phải hiện, đừng nuốt mất.
  if (l.lsx_id) return `Lệnh #${l.lsx_id}`;
  if (l.bai_ghep_id) return `Bài #${l.bai_ghep_id}`;
  return "—";
}

/** Ô CHỌN LỆNH — tìm-gõ hỏi máy chủ, dựng theo đúng khuôn `components/MaterialCombobox`.
 *
 *  Trước đây đây là một `<select>` nhồi TOÀN BỘ bảng `lsx`. Ở quy mô thật (100.000 lệnh) thì mở
 *  drawer là kéo cả bảng về chỉ để đổ vào một thẻ chọn không ai cuộn hết — nên ô này gõ tới đâu
 *  hỏi tới đó, `size: 20`.
 *
 *  Bài ghép vẫn lấy trọn (bảng nhỏ) rồi lọc tại chỗ, nhưng hiện CHUNG một danh sách: người dùng
 *  chỉ nghĩ "xin cho lệnh nào", không quan tâm nó là lệnh lẻ hay bài ghép. */
function LenhChon({
  token,
  lsxId,
  baiGhepId,
  nhan,
  onChange,
  autoFocus,
}: {
  token: string;
  lsxId: number | null;
  baiGhepId: number | null;
  /** Nhãn đang chọn (mã lệnh/bài) — hiện sẵn trong ô khi mở dòng đã lưu. */
  nhan: string;
  onChange: (lsxId: number | null, baiGhepId: number | null, ma: string | null) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(nhan);
  const [opts, setOpts] = useState<LenhOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setText(nhan), [nhan]);

  useEffect(() => {
    if (!open) return;
    let huy = false;
    const t = setTimeout(() => {
      const tim = text.trim();
      void Promise.all([
        api.lsx.list(token, { q: tim || undefined, size: 20 }),
        api.baiGhep2.list(token),
      ])
        .then(([ls, bg]) => {
          if (huy) return;
          const loc = tim.toLowerCase();
          setOpts([
            ...ls.items.map((l) => ({ kind: "lsx" as const, id: l.id, ma: l.ma, ten: l.ten })),
            ...bg.items
              .filter((b) => !loc || b.ma.toLowerCase().includes(loc))
              .slice(0, 20)
              .map((b) => ({ kind: "bai_ghep" as const, id: b.id, ma: b.ma, ten: "" })),
          ]);
          setActive(0);
        })
        // Không tra được lệnh KHÔNG được chặn việc lập yêu cầu — ô này vốn bỏ trống được.
        .catch(() => {
          if (!huy) setOpts([]);
        });
    }, 200);
    return () => {
      huy = true;
      clearTimeout(t);
    };
  }, [text, open, token]);

  function doViTri() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 320) });
  }

  useLayoutEffect(() => {
    if (open) doViTri();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", doViTri);
    window.addEventListener("scroll", doViTri, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", doViTri);
      window.removeEventListener("scroll", doViTri, true);
    };
  }, [open]);

  /** `null` = dòng "Không theo lệnh" (xin lặt vặt — băng dính, giẻ lau). */
  function chon(o: LenhOption | null) {
    setText(o?.ma ?? "");
    setOpen(false);
    if (!o) onChange(null, null, null);
    else if (o.kind === "lsx") onChange(o.id, null, o.ma);
    else onChange(null, o.id, o.ma);
  }

  const list = (
    <ul
      className="kho-combo__list"
      role="listbox"
      style={rect ? { top: rect.top, left: rect.left, width: rect.width } : undefined}
    >
      <li
        role="option"
        aria-selected={active === 0}
        className={`kho-combo__opt${active === 0 ? " is-active" : ""}`}
        onMouseEnter={() => setActive(0)}
        onMouseDown={(e) => {
          e.preventDefault();
          chon(null);
        }}
      >
        <span className="kho-combo__name">— Không theo lệnh —</span>
      </li>
      {opts.map((o, i) => (
        <li
          key={`${o.kind}:${o.id}`}
          role="option"
          aria-selected={i + 1 === active}
          className={`kho-combo__opt${i + 1 === active ? " is-active" : ""}`}
          onMouseEnter={() => setActive(i + 1)}
          onMouseDown={(e) => {
            e.preventDefault();
            chon(o);
          }}
        >
          <span className="kho-combo__name">
            {o.ten || "—"}
            <span className="kho-combo__nhom">{o.kind === "lsx" ? "Lệnh" : "Bài ghép"}</span>
          </span>
          <span className="kho-combo__code">{o.ma}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="kho-combo" ref={rootRef} style={{ minWidth: 156 }}>
      <input
        ref={inputRef}
        className="rc-input kho-combo__input"
        value={text}
        placeholder="Không theo lệnh"
        aria-label="Xin cho lệnh sản xuất nào (bỏ trống nếu xin lặt vặt)"
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Xoá trắng ô = bỏ gắn lệnh. Gõ dở rồi bỏ đi thì trả về nhãn cũ, không tự đoán.
          if (!text.trim() && (lsxId || baiGhepId)) chon(null);
          else if (text.trim() !== nhan) setText(nhan);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, opts.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (!open) return;
            e.preventDefault();
            chon(active === 0 ? null : opts[active - 1]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && createPortal(list, document.body)}
    </div>
  );
}

/** Lệnh của MỘT DÒNG trong form P2 (mockup: thẻ nhỏ dưới tên vật tư). Chưa gắn lệnh thì chỉ là chữ
 *  mờ "Không theo lệnh"; bấm vào mới mở ô tìm lệnh, chọn xong hoặc rời ô là thu về thẻ. Vẽ sẵn ô có
 *  viền ở mọi dòng thì trông như ô bắt buộc phải điền (user phản ánh 07/10/2026). */
function LenhDong({
  token,
  lsxId,
  baiGhepId,
  nhan,
  onChange,
}: {
  token: string;
  lsxId: number | null;
  baiGhepId: number | null;
  nhan: string;
  onChange: (lsxId: number | null, baiGhepId: number | null, ma: string | null) => void;
}) {
  const [sua, setSua] = useState(false);
  if (sua) {
    return (
      <span className="tyc-lenh" onBlur={() => setSua(false)}>
        <LenhChon
          token={token}
          lsxId={lsxId}
          baiGhepId={baiGhepId}
          nhan={nhan}
          autoFocus
          onChange={(a, b, ma) => {
            onChange(a, b, ma);
            setSua(false);
          }}
        />
      </span>
    );
  }
  return (
    <button
      type="button"
      className={nhan ? "kna-tag tyc-lenh-the" : "tyc-lenh-the tyc-lenh-the--rong"}
      title={nhan ? "Đổi lệnh của dòng này" : "Gắn dòng này cho một lệnh sản xuất"}
      onClick={() => setSua(true)}
    >
      {nhan || "Không theo lệnh"}
    </button>
  );
}

// ── DRAWER ────────────────────────────────────────────────────────────────────

export interface SeedLine {
  /** MẶT HÀNG GỐC — null = dòng trống chưa chọn. Không còn khái niệm "hàng chưa có mã". */
  hang_loai: HangLoai | null;
  hang_id: number | null;
  hang_ma: string | null;
  hang_ten: string | null;
  /** Đơn vị người yêu cầu chọn (trong tập đổi được của mặt hàng) + hệ số về đơn vị gốc để
   *  hiện trước con số sẽ vào tồn. */
  dvt: string;
  he_so_ve_goc: number | null;
  sl_de_nghi: number;
  /** Đơn giá NHẬP người yêu cầu khai (chỉ yêu cầu NHẬP), theo `dvt`. Phiếu kế thừa; kho không sửa. */
  don_gia: number | null;
  /** XIN CHO LỆNH NÀO (mg 0175). Bỏ trống được — xin lặt vặt (băng dính, giẻ lau) không thuộc lệnh
   *  nào. Khai rồi thì bảng cân đối vật tư của Kế hoạch trừ phần đã cấp vào ĐÚNG dòng nhu cầu. */
  lsx_id?: number | null;
  bai_ghep_id?: number | null;
  /** MÃ lệnh/bài server gửi kèm dòng — nhãn hiện tại chỗ, khỏi tra ngược một danh sách đã tải. */
  lsx_ma?: string | null;
  bai_ghep_ma?: string | null;
  /** GIẤY: dạng (tờ / cuộn) + khổ mm (rộng × dài; cuộn chỉ khổ rộng). Hàng khác để trống. Dạng quyết
   *  đơn vị gốc của dòng: tờ ⇒ "tờ" (mã `to`), cuộn ⇒ kg. */
  dang_giay?: DangGiay | null;
  kho_rong?: number;
  kho_dai?: number;
  ghi_chu: string | null;
}

/** Gói dữ liệu điều hướng-kèm để mở sẵn form TẠO yêu cầu NHẬP đã điền — dùng khi bấm "Nhập kho"
 *  ở một đợt giao đơn mua (đợt giao ↔ phiếu nhập kho là CÙNG sự kiện hàng về). */
export interface KhoNhapSeed {
  seed: SeedLine[];
  /** Ghi chú cấp phiếu, thường trỏ về mã đơn mua + số đợt để truy vết. */
  ghi_chu?: string;
  /** Ngày nhập điền sẵn (yyyy-mm-dd) — lấy từ ngày giao của đợt. */
  ngay_can?: string;
  /** true = số liệu lấy từ đơn mua → KHOÁ, không cho sửa dòng (phải khớp hàng đã nhận). */
  locked?: boolean;
  /** Nguồn đợt giao (purchase_deliveries.id) → gắn vào yêu cầu để chặn nhập trùng đợt. */
  deliveryId?: number;
  /** Mã đơn mua (purchase_requests.code) + số đợt giao — hiện rõ nguồn ngay ở form nhập. */
  don_mua_ma?: string;
  dot_so?: number;
  /** Nhà cung cấp + số hoá đơn của đợt — thẻ Nguồn của form nhập (mockup P2). */
  ncc_ten?: string;
  hoa_don?: string;
}

interface DraftLine extends SeedLine {
  key: string;
  /** id dòng đã lưu — cần để gửi `approved_qty`. */
  lineId: number | null;
  sl_duyet: number;
  sl_da_ung: number;
  /** Kho phản hồi: lý do cấp/nhập thiếu (chỉ đọc). */
  ly_do_thieu: string | null;
  /** Dòng thành phẩm KCS: giá gốc đọc từ lô + giá bán theo đơn (chỉ đọc, chỉ có khi `view_cost`). */
  tu_kcs: boolean;
  gia_goc: number | null;
  /** Σ giá × SL các đợt đã nhập — tổng giá trị dòng KCS, không nhân ngược `gia_goc` đã làm tròn. */
  tien_goc: number | null;
  don_gia_ban: number | null;
  don_ban_ma: string | null;
}

let lineSeq = 0;
function newLine(seed?: Partial<SeedLine>): DraftLine {
  lineSeq += 1;
  return {
    key: `l${lineSeq}`,
    lineId: null,
    hang_loai: seed?.hang_loai ?? null,
    hang_id: seed?.hang_id ?? null,
    hang_ma: seed?.hang_ma ?? null,
    hang_ten: seed?.hang_ten ?? null,
    dvt: seed?.dvt ?? "",
    he_so_ve_goc: seed?.he_so_ve_goc ?? null,
    sl_de_nghi: seed?.sl_de_nghi ?? 0,
    don_gia: seed?.don_gia ?? null,
    lsx_id: seed?.lsx_id ?? null,
    bai_ghep_id: seed?.bai_ghep_id ?? null,
    lsx_ma: seed?.lsx_ma ?? null,
    bai_ghep_ma: seed?.bai_ghep_ma ?? null,
    dang_giay: seed?.dang_giay ?? null,
    kho_rong: seed?.kho_rong ?? 0,
    kho_dai: seed?.kho_dai ?? 0,
    ghi_chu: seed?.ghi_chu ?? null,
    sl_duyet: 0,
    sl_da_ung: 0,
    ly_do_thieu: null,
    tu_kcs: false,
    gia_goc: null,
    tien_goc: null,
    don_gia_ban: null,
    don_ban_ma: null,
  };
}

/** Dòng của yêu cầu đã gửi → dòng mồi cho "Tạo lại từ yêu cầu này". */
function seedTuDong(l: StockRequestLine): SeedLine {
  return {
    hang_loai: l.hang_loai,
    hang_id: l.hang_id,
    hang_ma: l.hang_ma,
    hang_ten: l.hang_ten,
    dang_giay: l.dang_giay,
    kho_rong: l.kho_rong,
    kho_dai: l.kho_dai,
    dvt: l.dvt,
    // Suy ngược từ số server đã quy đổi — khỏi gọi thêm API chỉ để lấy hệ số.
    he_so_ve_goc: l.sl_quy_doi && l.sl_de_nghi ? l.sl_quy_doi / l.sl_de_nghi : null,
    sl_de_nghi: l.sl_de_nghi,
    don_gia: l.don_gia,
    ghi_chu: l.ghi_chu,
  };
}

interface RequestDrawerProps {
  token: string;
  meId: number;
  requestId: number | null;
  seed?: SeedLine[];
  seedLoai?: StockRequestKind;
  seedGhiChu?: string;
  seedNgayCan?: string;
  seedLocked?: boolean;
  seedDeliveryId?: number;
  seedDonMuaMa?: string;
  seedDotSo?: number;
  seedNccTen?: string;
  seedHoaDon?: string;
  canRequest: boolean;
  onClone: (lines: SeedLine[], loai: StockRequestKind) => void;
  onClose: () => void;
  onSaved: () => void;
}

// ── FORM TẠO YÊU CẦU — phương án P2 (docs/mockups/yeu-cau-nhap-xuat-3-phuong-an.html, chốt 07/10/2026)
//
// Khuôn "Create transfer" của Shopify, cùng khuôn form mua hàng phương án A: bảng vật tư bên trái
// (Vật tư, Tồn, Số lượng xin), cột thuộc tính bên phải (Loại, Ngày cần + chọn nhanh, Lệnh sản xuất
// cho dòng mới, Ghi chú). Đơn vị là chữ trong ô số lượng; chân form đếm MẶT HÀNG, không cộng số
// khác đơn vị. Mở từ đợt giao (Nhập kho): chiều Nhập cố định, dòng + số lượng khoá, có thẻ Nguồn.
// Ngăn XEM yêu cầu đã gửi là `InboxRequestDrawer` (KhoYeuCauPage).

/** Tồn toàn xưởng của dòng theo ĐÚNG khoá mã + dạng + khổ, theo đơn vị gốc. `null` = chưa biết
 *  (chưa chọn hàng / giấy tờ chưa đủ khổ / chưa nạp xong). */
function tonCuaDong(l: DraftLine, rows: TonKhoaRow[] | undefined): number | null {
  if (!rows || !l.hang_id) return null;
  if (l.hang_loai !== "giay") return rows.reduce((s, r) => s + r.ton, 0);
  if (l.dang_giay === "to") {
    const [r, d] = chuanKho(l.kho_rong, l.kho_dai);
    if (!(r && d)) return null;
    return rows.find((x) => x.dang_giay === "to" && x.kho_rong === r && x.kho_dai === d)?.ton ?? 0;
  }
  if (l.dang_giay === "cuon") {
    return rows
      .filter((x) => x.dang_giay === "cuon" && (!l.kho_rong || x.kho_rong === l.kho_rong))
      .reduce((s, x) => s + x.ton, 0);
  }
  return null;
}

const CHON_NGAY: { nhan: string; ngay: number }[] = [
  { nhan: "Hôm nay", ngay: 0 },
  { nhan: "Mai", ngay: 1 },
  { nhan: "+3 ngày", ngay: 3 },
];

function cachHomNay(n: number): string {
  const d = new Date(`${todayISO()}T00:00:00`);
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function TaoYeuCauP2({
  token,
  seed,
  seedLoai,
  seedGhiChu,
  seedNgayCan,
  seedLocked,
  seedDeliveryId,
  seedDonMuaMa,
  seedDotSo,
  seedNccTen,
  seedHoaDon,
  canRequest,
  onClose,
  onSaved,
}: Omit<RequestDrawerProps, "meId" | "requestId" | "onClone">) {
  useNapTenDonVi();
  const can = useCan();
  const canViewCost = can("kho", "view_cost");
  const khoa = !!seedLocked;
  const [loai, setLoai] = useState<StockRequestKind>(seedLoai ?? "XUAT");
  const [ngayCan, setNgayCan] = useState(seedNgayCan ?? "");
  const [ghiChu, setGhiChu] = useState(seedGhiChu ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => (seed?.length ? seed.map((s) => newLine(s)) : []));
  // Lệnh mặc định cho DÒNG MỚI thêm vào — đỡ chọn lại lệnh cho từng dòng khi xin cả bộ cho một lệnh.
  const [lenhMoi, setLenhMoi] = useState<{ lsx_id: number | null; bai_ghep_id: number | null; ma: string | null }>(
    { lsx_id: null, bai_ghep_id: null, ma: null },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Tồn toàn xưởng theo khoá dạng + khổ, nạp một lần mỗi mã. `null` = không có quyền xem tồn ⇒ ẩn cột.
  const [ton, setTon] = useState<Record<string, TonKhoaRow[] | null>>({});
  const khoaHang = [...new Set(lines.filter((l) => l.hang_loai && l.hang_id).map((l) => `${l.hang_loai}:${l.hang_id}`))];
  useEffect(() => {
    for (const k of khoaHang) {
      if (k in ton) continue;
      const [hl, id] = k.split(":");
      setTon((c) => ({ ...c, [k]: [] }));
      api.kho.phieu
        .tonKhoa(token, hl as HangLoai, Number(id))
        .then((rows) => setTon((c) => ({ ...c, [k]: rows })))
        .catch(() => setTon((c) => ({ ...c, [k]: null })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, khoaHang.join("|")]);
  const coTon = !Object.values(ton).some((v) => v === null);

  const mon = lines.filter((l) => l.hang_id);
  const tonDong = (l: DraftLine) => tonCuaDong(l, ton[`${l.hang_loai}:${l.hang_id}`] ?? undefined);
  const slGoc = (l: DraftLine) => (Number(l.sl_de_nghi) || 0) * (l.he_so_ve_goc ?? 1);
  // Xin quá tồn: CHỈ cảnh báo, không chặn gửi — kho trả lời cấp được bao nhiêu.
  const quaTon = loai === "XUAT" ? mon.filter((l) => { const t = tonDong(l); return t != null && slGoc(l) > t; }) : [];
  const coDonGia = loai === "NHAP" && canViewCost && !khoa;
  // Đếm đúng số cột: bảng layout FIXED mà colSpan vượt số cột là trình duyệt đẻ thêm cột ảo, bảng co lại.
  const soCot = 2 + (coTon ? 1 : 0) + (coDonGia ? 1 : 0) + (khoa ? 0 : 1);
  const giaTri = mon.reduce((s, l) => s + (Number(l.sl_de_nghi) || 0) * (Number(l.don_gia) || 0), 0);

  function patch(key: string, p: Partial<DraftLine>) {
    setDirty(true);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));
  }

  function themMon(m: MatHangOption) {
    setError(null);
    setDirty(true);
    setLines((prev) => [
      ...prev,
      newLine({
        hang_loai: m.hang_loai,
        hang_id: m.hang_id,
        hang_ma: m.ma,
        hang_ten: m.ten,
        // Giấy: mặc định Tờ — kho đếm tờ theo khổ; người xin đổi sang Cuộn ngay trên khung khổ.
        dang_giay: m.hang_loai === "giay" ? "to" : null,
        lsx_id: lenhMoi.lsx_id,
        bai_ghep_id: lenhMoi.bai_ghep_id,
        lsx_ma: lenhMoi.lsx_id ? lenhMoi.ma : null,
        bai_ghep_ma: lenhMoi.bai_ghep_id ? lenhMoi.ma : null,
      }),
    ]);
  }

  async function guiKho() {
    const body = payloadDong(lines, loai);
    if (!body.length) {
      setError("Thêm ít nhất một dòng vật tư có số lượng lớn hơn 0.");
      return;
    }
    // Trùng mặt hàng (cùng mã, cùng lệnh, cùng dạng + khổ): chặn với đúng câu máy chủ trả.
    const khoaDong = body.map((b) => `${b.hang_loai}:${b.hang_id}:${b.lsx_id ?? ""}:${b.bai_ghep_id ?? ""}:${b.dang_giay ?? ""}:${b.kho_rong ?? 0}:${b.kho_dai ?? 0}`);
    if (new Set(khoaDong).size !== khoaDong.length) {
      setError("Một mặt hàng cho cùng một lệnh chỉ được xuất hiện 1 dòng — gộp số lượng lại.");
      return;
    }
    const loi = lines.map(loiGiayDong).find((x) => x);
    if (loi) {
      setError(loi);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.kho.deNghi.create(token, {
        loai,
        ngay_can: ngayCan || null,
        ghi_chu: ghiChu || null,
        // Gắn nguồn đợt giao (mở từ nút "Nhập kho") — máy chủ chặn nhập lần hai cho cùng đợt (409).
        purchase_delivery_id: seedDeliveryId ?? null,
        lines: body,
      });
      setDirty(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không lưu được yêu cầu.");
    } finally {
      setBusy(false);
    }
  }

  const chan = (
    <>
      <span className="ycf-xt">
        <b>{mon.length} mặt hàng</b>
        {quaTon.length > 0 && (
          <span className="ycd-vang">
            {quaTon.length === 1 ? `${quaTon[0].hang_ten} xin quá tồn` : `${quaTon.length} mặt hàng xin quá tồn`}
          </span>
        )}
      </span>
      <span className="rc__spacer" />
      <Button variant="ghost" onClick={onClose} disabled={busy}>Huỷ</Button>
      {canRequest && (
        <Button variant="accent" onClick={() => void guiKho()} loading={busy}>
          <Icon name="send" size={14} /> Gửi kho
        </Button>
      )}
    </>
  );

  return (
    <NganPhai
      duongDan={khoa ? "Kho > Yêu cầu nhập xuất > Nhập từ đợt giao" : "Kho > Yêu cầu nhập xuất > Tạo mới"}
      tieuDe={loai === "NHAP" ? "Yêu cầu nhập kho" : "Yêu cầu xuất kho"}
      // Nguồn (đơn mua, đợt) chỉ nói ở thẻ Nguồn cột phải — không lặp thành thẻ đầu ngăn hay chữ ở chân.
      chan={chan}
      onDong={onClose}
      chanDong={() => dirty && !busy}
    >
      <div className="kna">
        {error && <div className="kna-canh kna-canh--do" role="alert">{error}</div>}
        <div className="kna-luoi dfa-luoi">
          <div className="kna-cot">
            <section className="kna-the kna-the--cat">
              <div className="kna-the__dau">
                <h3>Vật tư</h3>
                <span className="kna-tag">{mon.length} mặt hàng</span>
                {khoa && <span className="kna-mo dga-nut">Khoá theo đợt giao</span>}
              </div>
              <div className="lds-bang lds-bang--nhap">
                <table className="lds-g kna-tren">
                  <colgroup>
                    <col />
                    {coTon && <col style={{ width: khoa ? 200 : 96 }} />}
                    <col style={{ width: 140 }} />
                    {loai === "NHAP" && canViewCost && !khoa && <col style={{ width: 124 }} />}
                    {!khoa && <col style={{ width: 48 }} />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Vật tư</th>
                      {coTon && <th className="n">{khoa ? "Tồn khổ này sau nhập" : "Tồn"}</th>}
                      <th className="n">{loai === "NHAP" ? "Số lượng nhập" : "Số lượng xin"}</th>
                      {loai === "NHAP" && canViewCost && !khoa && <th className="n">Đơn giá</th>}
                      {!khoa && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 && (
                      <tr>
                        <td colSpan={soCot} className="lds-trong">Chưa có vật tư. Gõ tên hoặc mã ở ô bên dưới để thêm.</td>
                      </tr>
                    )}
                    {lines.map((l) => {
                      const t = tonDong(l);
                      const dv = tenDonVi(l.dvt) || l.dvt;
                      const thieu = loai === "XUAT" && t != null ? slGoc(l) - t : 0;
                      const rowsTon = ton[`${l.hang_loai}:${l.hang_id}`] ?? [];
                      return (
                        <tr key={l.key}>
                          <td>
                            {l.hang_id ? (
                              // Tên + lệnh của dòng chung một hàng, khổ ở hàng dưới: Nhập có thêm cột Đơn giá
                              // nên cột này hẹp hơn Xuất — để khổ và lệnh chung hàng là bên Nhập bị đẩy xuống
                              // dòng, hai chiều trông khác nhau (user phản ánh 07/10/2026).
                              <div className="ycf-ten">
                                <span className="kna-hang__ten" title={l.hang_ma ?? undefined}>{l.hang_ten}</span>
                                {khoa ? (
                                  (l.lsx_ma || l.bai_ghep_ma) && <span className="kna-tag">{lenhNhan(l)}</span>
                                ) : (
                                  <LenhDong
                                    token={token}
                                    lsxId={l.lsx_id ?? null}
                                    baiGhepId={l.bai_ghep_id ?? null}
                                    nhan={l.lsx_ma ?? l.bai_ghep_ma ?? ""}
                                    onChange={(lsxId, bgId, ma) => patch(l.key, {
                                      lsx_id: lsxId, bai_ghep_id: bgId,
                                      lsx_ma: lsxId ? ma : null, bai_ghep_ma: bgId ? ma : null,
                                    })}
                                  />
                                )}
                              </div>
                            ) : (
                              <MaterialCombobox token={token} hangTen={l.hang_ten} onPick={(m) => patch(l.key, {
                                hang_loai: m.hang_loai, hang_id: m.hang_id, hang_ma: m.ma, hang_ten: m.ten,
                                dvt: "", he_so_ve_goc: null,
                                dang_giay: m.hang_loai === "giay" ? "to" : null, kho_rong: 0, kho_dai: 0,
                              })} />
                            )}
                            {l.hang_loai === "giay" && l.hang_id && (
                              <div className="ycf-phu">
                                <KhungKho
                                  dang={l.dang_giay ?? "to"}
                                  rong={l.kho_rong ?? 0}
                                  dai={l.kho_dai ?? 0}
                                  chiDoc={khoa}
                                  goiY={rowsTon.map((r) => ({ rong: r.kho_rong, dai: r.kho_dai, ghiChu: `Tồn ${fmtQty(r.ton)} ${r.don_vi_goc_ten ?? ""}`.trim() }))}
                                  onChange={(v) => patch(l.key, {
                                    dang_giay: v.dang, kho_rong: v.rong, kho_dai: v.dai,
                                    // Đổi dạng ⇒ đơn vị gốc khác (tờ ↔ kg): ô đơn vị tự điền lại.
                                    ...(v.dang !== l.dang_giay ? { dvt: "", he_so_ve_goc: null } : {}),
                                  })}
                                />
                              </div>
                            )}
                          </td>
                          {coTon && (
                            <td className="n">
                              {t == null ? (
                                <span className="kna-mo">{l.hang_loai === "giay" && l.dang_giay === "to" ? "Theo khổ" : ""}</span>
                              ) : khoa ? (
                                t <= 0 ? (
                                  <><span className="kna-tag">Khổ mới trong kho</span> <b className="kna-so">{fmtQty(slGoc(l))}</b></>
                                ) : (
                                  <><span className="kna-so kna-mo">{fmtQty(t)}</span> <span className="kna-mo">đến</span> <b className="kna-so">{fmtQty(t + slGoc(l))}</b></>
                                )
                              ) : (
                                <span className="kna-so">{fmtQty(t)}</span>
                              )}
                            </td>
                          )}
                          <td className="n">
                            {khoa ? (
                              <><b className="kna-so">{fmtQty(l.sl_de_nghi)}</b> <span className="kna-dv">{dv}</span></>
                            ) : (
                              <label className={`ycf-gi dfa-gi${l.hang_id && !(Number(l.sl_de_nghi) > 0) ? " loi" : ""}`}>
                                <input
                                  inputMode="decimal"
                                  aria-label={`Số lượng ${l.hang_ten ?? ""}`}
                                  value={Number(l.sl_de_nghi) > 0 ? String(l.sl_de_nghi) : ""}
                                  onChange={(e) => patch(l.key, { sl_de_nghi: Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")) || 0 })}
                                />
                                {l.hang_loai && l.hang_id && (l.hang_loai !== "giay" || l.dang_giay) ? (
                                  <DonViChonTheoHang
                                    token={token}
                                    hangLoai={l.hang_loai}
                                    hangId={l.hang_id}
                                    dang={l.hang_loai === "giay" ? l.dang_giay ?? null : null}
                                    gon
                                    value={l.dvt}
                                    onChange={(ma, hs) => patch(l.key, { dvt: ma, he_so_ve_goc: hs })}
                                  />
                                ) : null}
                              </label>
                            )}
                            {thieu > 0 && (
                              <div className="dfa-duoi ycd-vang">Thiếu {fmtQty(thieu)} {t != null ? (ton[`${l.hang_loai}:${l.hang_id}`]?.[0]?.don_vi_goc_ten ?? dv) : dv}</div>
                            )}
                          </td>
                          {loai === "NHAP" && canViewCost && !khoa && (
                            <td className="n">
                              <label className="ycf-gi dfa-gi">
                                <input
                                  inputMode="numeric"
                                  aria-label="Đơn giá"
                                  value={l.don_gia != null ? l.don_gia.toLocaleString("vi-VN") : ""}
                                  onChange={(e) => {
                                    const so = e.target.value.replace(/\D/g, "");
                                    patch(l.key, { don_gia: so ? Number(so) : null });
                                  }}
                                />
                                <span>đ</span>
                              </label>
                            </td>
                          )}
                          {!khoa && (
                            <td className="n">
                              <button
                                type="button"
                                className="ycf-xoa"
                                aria-label={`Xoá ${l.hang_ten ?? "dòng"}`}
                                onClick={() => {
                                  setDirty(true);
                                  setLines((prev) => prev.filter((x) => x.key !== l.key));
                                }}
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!khoa && (
                <div className="ycf-dong-them">
                  <MaterialCombobox
                    key={lines.length}
                    token={token}
                    hangTen={null}
                    placeholder="Thêm vật tư: gõ tên hoặc mã…"
                    onPick={(m) => themMon(m)}
                  />
                </div>
              )}
            </section>
          </div>

          <div className="kna-cot">
            <section className="kna-the">
              <div className="kna-the__than kna-form">
                {!khoa && (
                  <div className="kho-shell__dirs kho-chieu" role="radiogroup" aria-label="Loại yêu cầu">
                    {(["NHAP", "XUAT"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={loai === k}
                        className={`seg${loai === k ? " is-active" : ""}`}
                        onClick={() => { setDirty(true); setLoai(k); }}
                      >
                        {k === "NHAP" ? "Nhập" : "Xuất"}
                      </button>
                    ))}
                  </div>
                )}
                <label className="kna-o-truong">
                  <span>{loai === "NHAP" ? "Ngày cần nhập" : "Ngày cần xuất"} <em>*</em></span>
                  <ChonNgay
                    className="kna-o"
                    aria-label={loai === "NHAP" ? "Ngày cần nhập" : "Ngày cần xuất"}
                    value={ngayCan}
                    min={khoa ? undefined : todayISO()}
                    disabled={khoa}
                    onChange={(v) => { setDirty(true); setNgayCan(v); }}
                  />
                </label>
                {!khoa && (
                  <div className="ycf-pick" role="group" aria-label="Chọn nhanh ngày cần">
                    {CHON_NGAY.map((c) => {
                      const ngay = cachHomNay(c.ngay);
                      return (
                        <button key={c.nhan} type="button" className={ngayCan === ngay ? "on" : ""}
                          onClick={() => { setDirty(true); setNgayCan(ngay); }}>
                          {c.nhan}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {khoa ? (
              <section className="kna-the">
                <div className="kna-the__dau"><h3>Nguồn</h3></div>
                <div className="kna-the__than">
                  <dl className="kna-kv">
                    {seedDonMuaMa && (<><dt>Đơn mua</dt><dd>{seedDonMuaMa}</dd></>)}
                    {seedDotSo != null && (<><dt>Đợt giao</dt><dd>Đợt {seedDotSo}</dd></>)}
                    {seedNccTen && (<><dt>Nhà cung cấp</dt><dd>{seedNccTen}</dd></>)}
                    {ngayCan && (<><dt>Ngày nhận</dt><dd>{fmtDateISO(ngayCan)}</dd></>)}
                    {seedHoaDon && (<><dt>Hoá đơn</dt><dd>{seedHoaDon}</dd></>)}
                  </dl>
                </div>
              </section>
            ) : (
              <section className="kna-the">
                <div className="kna-the__dau">
                  <h3>Lệnh sản xuất</h3>
                  <span className="kna-mo dga-nut">dòng mới lấy lệnh này</span>
                </div>
                <div className="kna-the__than tyc-lenh tyc-lenh--rong">
                  <LenhChon
                    token={token}
                    lsxId={lenhMoi.lsx_id}
                    baiGhepId={lenhMoi.bai_ghep_id}
                    nhan={lenhMoi.ma ?? ""}
                    onChange={(lsxId, bgId, ma) => setLenhMoi({ lsx_id: lsxId, bai_ghep_id: bgId, ma })}
                  />
                </div>
              </section>
            )}

            {khoa && canViewCost && giaTri > 0 && (
              <section className="kna-the">
                <div className="kna-the__dau"><h3>Giá trị nhập</h3></div>
                <div className="kna-the__than dfa-cs">
                  {mon.map((l) => (
                    <div key={l.key} className="dfa-cs__con" style={{ paddingLeft: 0 }}>
                      <span>{l.hang_ten}</span>
                      <span className="kna-so">{((Number(l.sl_de_nghi) || 0) * (Number(l.don_gia) || 0)).toLocaleString("vi-VN")}</span>
                    </div>
                  ))}
                  <div className="dfa-cs__tong"><span>Chưa VAT</span><b className="kna-so">{giaTri.toLocaleString("vi-VN")} đ</b></div>
                </div>
              </section>
            )}

            <section className="kna-the">
              <div className="kna-the__than kna-form">
                <label className="kna-o-truong">
                  <span>Ghi chú</span>
                  <textarea
                    className="kna-o ycf-ta"
                    rows={3}
                    value={ghiChu}
                    placeholder="Lý do xin, ai ra nhận…"
                    onChange={(e) => { setDirty(true); setGhiChu(e.target.value); }}
                  />
                </label>
              </div>
            </section>
          </div>
        </div>
      </div>
    </NganPhai>
  );
}

/** Dòng gửi máy chủ — chỉ dòng đủ mặt hàng + đơn vị + số > 0. Giấy mang dạng + khổ chuẩn hoá. */
function payloadDong(lines: DraftLine[], loai: StockRequestKind): StockRequestLineInput[] {
  const isNhap = loai === "NHAP";
  return lines
    .filter((l) => l.hang_loai && l.hang_id && l.dvt && Number(l.sl_de_nghi) > 0)
    .map((l) => ({
      hang_loai: l.hang_loai as HangLoai,
      hang_id: l.hang_id as number,
      ...(l.hang_loai === "giay"
        ? {
            dang_giay: l.dang_giay ?? null,
            kho_rong: chuanKho(l.kho_rong, l.kho_dai)[0],
            kho_dai: l.dang_giay === "to" ? chuanKho(l.kho_rong, l.kho_dai)[1] : 0,
          }
        : {}),
      dvt: l.dvt,
      sl_de_nghi: Number(l.sl_de_nghi),
      // Đơn giá chỉ gửi cho yêu cầu NHẬP (người yêu cầu biết giá NCC). XUẤT lấy giá vốn từ lô.
      don_gia: isNhap && l.don_gia != null ? Number(l.don_gia) : null,
      lsx_id: l.lsx_id ?? null,
      bai_ghep_id: l.bai_ghep_id ?? null,
      ghi_chu: l.ghi_chu || null,
    }));
}

/** Giấy thiếu dạng, hoặc tờ thiếu một cạnh khổ ⇒ câu báo; không thì null. */
function loiGiayDong(l: DraftLine): string | null {
  if (l.hang_loai !== "giay" || !l.hang_id || !(Number(l.sl_de_nghi) > 0)) return null;
  const ten = l.hang_ten ?? "Giấy";
  if (!l.dang_giay) return `“${ten}”: chọn dạng giấy (tờ hoặc cuộn).`;
  const [r, d] = chuanKho(l.kho_rong, l.kho_dai);
  if (l.dang_giay === "to" && !(r && d)) return `“${ten}”: giấy dạng tờ phải khai đủ khổ (hai cạnh, mm).`;
  return null;
}

// ── INLINE SVG ICONS ─────────────────────────────────────────────────────────
const PlusIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);
