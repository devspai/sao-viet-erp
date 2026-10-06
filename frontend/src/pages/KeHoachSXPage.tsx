// BÀN KẾ HOẠCH SẢN XUẤT — controller master↔detail (không react-router, điều hướng bằng state).
//
// Luồng: Sale bấm "Chuyển xuống sản xuất" ở Đơn hàng → đơn rơi vào tab HÀNG CHỜ (real-time qua SSE,
// `eventTick` đổi → refetch) → mở đơn xem DANH SÁCH LỆNH DỰ KIẾN → tick → tạo lệnh → sang tab LỆNH
// SẢN XUẤT sửa routing/số lượng → đánh dấu "Sẵn sàng lập kế hoạch".
//
// Lát này DỪNG ở trạng thái "sẵn sàng": chưa ghép bài, chưa xếp lịch, chưa phát xuống xưởng.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  type HangChoItem,
  type LsxListItem,
  type LsxTongQuanOut,
} from "../api/client";
import { useAuth } from "../auth/useAuth";
import { useCan, useScopeOf } from "../auth/permissions";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { trangHopLe } from "../components/Pager";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import { StatusTabs } from "../components/StatusTabs";
import {
  LOC_KHSX_TRONG,
  MOC_HANG_CHO,
  MOC_LENH_KHSX,
  locKhsxLenUrl,
  locKhsxTuUrl,
  thamSoLocHangCho,
  thamSoLocLenhKhsx,
  useDieuKienHangCho,
  useDieuKienLenhKhsx,
  type LocHangCho,
  type LocKhsx,
  type LocLenhKhsx,
} from "./loc-san-xuat/dieu-kien-ke-hoach-sx";
import { ngayDayDu, ngayGioDayDu } from "./loc-san-xuat/ngay";
import { ThanhLoc } from "./thanh-loc/ThanhLoc";
import { thamSoKy, type KyDS } from "./thanh-loc/ky-danh-sach";
import { daAp, dkTheoTab, type DieuKien } from "./thanh-loc/thanh-loc";
import { useLocMan } from "./thanh-loc/useLocMan";
import { LsxDetailView } from "./LsxDetailView";
import { LsxPreviewDrawer } from "./LsxPreviewDrawer";
import { nhanDonVi } from "./lsxBuoc";
import { ChipMotPhan, OTronGoi, PillTronGoi, laTronGoi } from "./gia-cong/GiaCongDong";
import { useNapTenDonVi } from "./tenDonVi";
import {
  BangLoi,
  ChipGap,
  EmptyState,
  Skeleton,
  TRANG_THAI_TABS,
  TrangThaiPill,
  classHan,
  classHanLich,
  ngay,
  ngayGio,
  num,
} from "./keHoachSxShared";

import "./ke-hoach-sx.css";

type View = { mode: "list" } | { mode: "detail"; id: number };

export function KeHoachSXPage({
  navigate,
  openOrderId,
  openLsxId,
  eventTick,
  dinhKemDem,
  onBadgeStale,
}: {
  navigate?: (id: string, params?: Record<string, unknown>) => void;
  /** Deep-link từ Đơn hàng: mở thẳng hàng chờ + drawer lệnh dự kiến của đơn này. */
  openOrderId?: number | null;
  /** Deep-link từ sơ đồ Bài ghép: mở thẳng chi tiết MỘT lệnh. */
  openLsxId?: number | null;
  /** Tăng mỗi lần có event SSE → refetch (real-time, không bắt người dùng F5). */
  eventTick?: number;
  /** Số lần tệp đính kèm đổi, đếm theo id lệnh — chỉ màn chi tiết đúng lệnh nạp lại danh sách tệp. */
  dinhKemDem?: Record<number, number>;
  onBadgeStale?: () => void;
}) {
  const { token } = useAuth();
  const can = useCan();
  const scopeOf = useScopeOf();
  const canCreate = can("san_xuat", "create");
  // Nhãn đơn vị đọc từ DANH MỤC — nạp một lần cho cả phiên (bảng lệnh + drawer lệnh dự kiến).
  useNapTenDonVi();

  const [view, setView] = useState<View>({ mode: "list" });
  // Tab "Vật tư" ĐÃ TÁCH 17/08/2026 thành màn riêng `Kế hoạch vật tư` (chủ chốt) — xem
  // `KeHoachVatTuPage`. Màn này giữ đúng phạm vi MỘT lệnh; bảng cân đối cả kho là việc của màn kia.
  const [tab, setTab] = useState<"hang-cho" | "lenh">("hang-cho");
  const [previewOrderId, setPreviewOrderId] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [queue, setQueue] = useState<HangChoItem[] | null>(null);
  const [lenhs, setLenhs] = useState<LsxListItem[] | null>(null);
  const [ttFilter, setTtFilter] = useState("all");
  const [q, setQ] = useState("");
  // Thanh lọc (kỳ + điều kiện) của HAI bảng — ghi lên URL, nhớ theo màn (06/10/2026).
  const [locMan, setLocMan] = useLocMan<LocKhsx>("ke-hoach-sx", LOC_KHSX_TRONG, locKhsxTuUrl, locKhsxLenUrl);
  // Nạp lại danh sách khách/đơn của ô lọc khi có sự kiện hay vừa tạo lệnh (đơn mới mới có để chọn).
  const [nguonTick, setNguonTick] = useState(0);
  const dkLenh = useDieuKienLenhKhsx((eventTick ?? 0) + nguonTick);
  const dkCho = useDieuKienHangCho((eventTick ?? 0) + nguonTick);
  const khoaLenh = JSON.stringify({ ...thamSoKy(locMan.lenh.ky), ...thamSoLocLenhKhsx(locMan.lenh.loc) });
  const khoaCho = JSON.stringify({ ...thamSoKy(locMan.cho.ky), ...thamSoLocHangCho(locMan.cho.loc) });
  const [err, setErr] = useState<string | null>(null);
  // Phân trang + số trên tab đều do MÁY CHỦ trả. Đếm bằng `lenhs.length` như trước chỉ đúng khi
  // cả bảng nằm gọn trong một lượt tải — có phân trang là số đó thành số của TRANG, sai ngay.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Record<string, number>>({});
  const [queuePage, setQueuePage] = useState(1);
  const [queueTotal, setQueueTotal] = useState(0);
  // Dòng/trang dùng CHUNG cho cả hai bảng của màn: cùng một chỗ giữ cho chân trang và tham số
  // gửi lên không lệch nhau. Đổi cỡ ⇒ cả hai bảng về trang 1.
  const [sizeTrang, setSizeTrang] = useState(25);
  const doiSizeTrang = (n: number) => {
    setSizeTrang(n);
    setPage(1);
    setQueuePage(1);
  };
  // Hàng đèn tiến độ (Đợt 1 redesign 18/08/2026) — GỌI RỜI sau bảng lệnh, không nhét vào
  // `/api/lsx`: endpoint tổng quan chạy engine cân đối vật tư + bộ dò vấn đề, còn bảng lệnh phải
  // hiện ngay. `denTick` để các hành động khác (tạo lệnh, đổi routing, giữ chỗ) bắt đèn tính lại —
  // bộ lọc/ô tìm KHÔNG bắt, vì khoá dưới đây chỉ đổi khi TẬP lệnh đổi.
  const [tq, setTq] = useState<Record<number, LsxTongQuanOut["items"][number]>>({});
  const [denTick, setDenTick] = useState(0);

  const loadQueue = useCallback(() => {
    if (!token) return;
    api.lsx
      .hangCho(token, { page: queuePage, size: sizeTrang, loc: JSON.parse(khoaCho) })
      .then((r) => {
        setQueue(r.items);
        setQueueTotal(r.total);
        const ve = trangHopLe(queuePage, r.total, sizeTrang);
        if (ve) setQueuePage(ve);
      })
      .catch((e: unknown) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [token, queuePage, sizeTrang, khoaCho]);

  // Số thứ tự lượt tải bảng lệnh. Không có nó thì một lượt gọi CŨ về muộn sẽ ghi đè kết quả
  // mới: bấm "Tạo lệnh" xong màn đặt lọc theo đơn vừa tạo, nhưng lượt tải không-lọc bắn trước đó
  // về sau và trả lại cả bảng — chip "Đơn DHxxx" vẫn sáng mà dưới là lệnh của mọi đơn.
  const luotLenh = useRef(0);
  const loadLenhs = useCallback(() => {
    if (!token) return;
    const luot = ++luotLenh.current;
    api.lsx
      .list(token, {
        trang_thai: ttFilter === "all" ? undefined : ttFilter,
        q: q.trim() || undefined,
        page,
        size: sizeTrang,
        // Kỳ + Khách / Đơn / Gia công ngoài của thanh lọc.
        loc: JSON.parse(khoaLenh),
      })
      .then((r) => {
        if (luot !== luotLenh.current) return;   // đã có lượt mới hơn — bỏ kết quả này
        setLenhs(r.items);
        setTotal(r.total);
        setFacets(r.facets);
        // Xoá nốt dòng cuối của trang 3 ⇒ còn 2 trang: không kéo về thì màn trắng trơn.
        const ve = trangHopLe(page, r.total, sizeTrang);
        if (ve) setPage(ve);
      })
      .catch((e: unknown) => {
        if (luot !== luotLenh.current) return;
        setErr(e instanceof ApiError ? e.message : String(e));
      });
  }, [token, ttFilter, q, page, sizeTrang, khoaLenh]);

  // Đổi bộ lọc thì về trang 1 — giữ nguyên trang cũ là rơi vào vùng trống của kết quả mới.
  useEffect(() => setPage(1), [ttFilter, q, khoaLenh]);
  useEffect(() => setQueuePage(1), [khoaCho]);

  useEffect(() => loadQueue(), [loadQueue, eventTick]);
  useEffect(() => {
    const t = setTimeout(loadLenhs, q ? 250 : 0);   // debounce ô tìm
    return () => clearTimeout(t);
  }, [loadLenhs, eventTick, q]);

  // Hỏi tổng quan cho MỌI lệnh đang hiện — bảng chỉ còn dùng `slack_ngay` tô ô Hạn SX (cột
  // "Vướng" đã gỡ 06/10/2026). Một lượt `tong_quan` là chi phí gần như không đổi theo số lệnh.
  const khoaDen = (lenhs ?? []).map((l) => l.id).join(",");
  useEffect(() => {
    if (!token || !khoaDen) {
      setTq({});
      return;
    }
    let huy = false;
    api.lsx
      .tongQuan(token, khoaDen.split(",").map(Number))
      .then((r) => {
        if (!huy) setTq(Object.fromEntries(r.items.map((i) => [i.lsx_id, i])));
      })
      // Đèn hỏng thì bảng lệnh vẫn phải dùng được — ô đèn để trống, KHÔNG chặn cả màn bằng `err`.
      .catch(() => {
        if (!huy) setTq({});
      });
    return () => {
      huy = true;
    };
  }, [token, khoaDen, eventTick, denTick]);

  // Deep-link từ màn Đơn hàng ("Mở bàn Kế hoạch sản xuất ↗").
  useEffect(() => {
    if (openOrderId) {
      setView({ mode: "list" });
      setTab("hang-cho");
      setPreviewOrderId(openOrderId);
    }
  }, [openOrderId]);

  useEffect(() => {
    if (openLsxId) setView({ mode: "detail", id: openLsxId });
  }, [openLsxId]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  function sauKhiTao(orderId: number, maList: string[]) {
    setPreviewOrderId(null);
    // Sang bảng lệnh, lọc đúng đơn vừa tạo; kỳ về "Tất cả" (giữ mốc) để kỳ cũ không giấu lệnh mới.
    setLocMan({
      ...locMan,
      lenh: { ky: { loai: "tat_ca", moc: locMan.lenh.ky.moc }, loc: { don: orderId } },
    });
    setNguonTick((n) => n + 1);
    setTab("lenh");
    if (maList.length) setFlash(`Đã tạo ${maList.length} lệnh: ${maList.join(", ")}`);
    loadQueue();
    // KHÔNG gọi `loadLenhs()` ở đây: hàm đang cầm là bản của lần render TRƯỚC, tức chưa biết
    // lọc đơn vừa đặt ⇒ nó hỏi cả bảng. Đặt lọc xong effect tự chạy lượt ĐÚNG; số thứ tự
    // lượt trong `loadLenhs` lo nốt trường hợp lượt cũ về muộn.
    onBadgeStale?.();
  }

  const doiDuLieu = useCallback(() => {
    loadQueue();
    loadLenhs();
    // Tập lệnh có thể KHÔNG đổi sau một lần sửa routing/giữ chỗ ⇒ `khoaDen` đứng yên ⇒ effect trên
    // không chạy lại. Tick thẳng để đèn không nói chuyện cũ.
    setDenTick((n) => n + 1);
    onBadgeStale?.();
  }, [loadQueue, loadLenhs, onBadgeStale]);

  if (view.mode === "detail") {
    return (
      <main className="khsx">
        <LsxDetailView
          lsxId={view.id}
          navigate={navigate}
          onBack={() => setView({ mode: "list" })}
          onChanged={doiDuLieu}
          eventTick={eventTick}
          dinhKemTick={dinhKemDem?.[view.id] ?? 0}
        />
      </main>
    );
  }

  // Số trên tab lấy từ `facets` của máy chủ, KHÔNG đếm mảng đang hiện. Tab gộp nhiều trạng thái
  // (Nháp = "nhap,cho_bo_sung") thì cộng các phần.
  const demTheoTt = (key: string) =>
    key === "all"
      ? (facets.all ?? 0)
      : key.split(",").reduce((s, k) => s + (facets[k] ?? 0), 0);

  return (
    <main className="khsx">
      <header className="khsx-page-header">
        <div className="khsx-page-header__left">
          <div className="khsx-page-header__eyebrow-row">
            <span className="khsx-eyebrow-badge">
              <Icon name="clipboard" size={12} /> Sản xuất &amp; Điều phối
            </span>
            <span className="khsx-sync-badge">
              <span className="khsx-sync-badge__dot" /> Live Sync
            </span>
          </div>
          <h1 className="khsx-page-header__title">Kế hoạch sản xuất</h1>
          <p className="khsx-page-header__sub">
            Quản lý và điều phối toàn bộ tiến độ sản xuất từ tiếp nhận đơn hàng đến hoàn thành ra xưởng
          </p>
        </div>
      </header>

      <div className="khsx-underline-tabs" role="tablist" aria-label="Khu vực làm việc">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "hang-cho"}
          className={`khsx-underline-tab ${tab === "hang-cho" ? "is-active" : ""}`}
          onClick={() => setTab("hang-cho")}
        >
          <Icon name="packageCheck" size={15} />
          <span>Hàng chờ tiếp nhận</span>
          {queueTotal > 0 && <span className="khsx-tab-count khsx-tab-count--alert">{queueTotal}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "lenh"}
          className={`khsx-underline-tab ${tab === "lenh" ? "is-active" : ""}`}
          onClick={() => setTab("lenh")}
        >
          <Icon name="layers" size={15} />
          <span>Lệnh sản xuất</span>
          <span className="khsx-tab-count">{total}</span>
        </button>
      </div>

      {flash && (
        <div className="banner banner--success" role="status" aria-live="polite">
          {flash}
        </div>
      )}
      {err && <BangLoi text={err} onRetry={doiDuLieu} />}

      {tab === "hang-cho" ? (
        <QueueTable
          rows={queue}
          scopeAll={scopeOf("san_xuat") === "all"}
          onOpen={(id) => setPreviewOrderId(id)}
          total={queueTotal}
          page={queuePage}
          size={sizeTrang}
          onPage={setQueuePage}
          onSize={doiSizeTrang}
          ky={locMan.cho.ky}
          onKy={(ky) => setLocMan({ ...locMan, cho: { ...locMan.cho, ky } })}
          dieuKien={dkCho}
          loc={locMan.cho.loc}
          onLoc={(loc) => setLocMan({ ...locMan, cho: { ...locMan.cho, loc } })}
          onXoaLoc={() => setLocMan({ ...locMan, cho: { ky: { loai: "tat_ca", moc: locMan.cho.ky.moc }, loc: {} } })}
        />
      ) : (
        <LenhTable
          rows={lenhs}
          ttFilter={ttFilter}
          onTtFilter={setTtFilter}
          q={q}
          onQ={setQ}
          ky={locMan.lenh.ky}
          onKy={(ky) => setLocMan({ ...locMan, lenh: { ...locMan.lenh, ky } })}
          dieuKien={dkLenh}
          loc={locMan.lenh.loc}
          onLoc={(loc) => setLocMan({ ...locMan, lenh: { ...locMan.lenh, loc } })}
          onXoaLoc={() => setLocMan({ ...locMan, lenh: { ky: { loai: "tat_ca", moc: locMan.lenh.ky.moc }, loc: {} } })}
          onOpen={(id) => setView({ mode: "detail", id })}
          onGoQueue={() => setTab("hang-cho")}
          tq={tq}
          dem={demTheoTt}
          total={total}
          page={page}
          size={sizeTrang}
          onPage={setPage}
          onSize={doiSizeTrang}
        />
      )}

      {previewOrderId != null && (
        <LsxPreviewDrawer
          orderId={previewOrderId}
          canCreate={canCreate}
          onClose={() => setPreviewOrderId(null)}
          onCreated={sauKhiTao}
          onOpenLsx={(id) => {
            setPreviewOrderId(null);
            setView({ mode: "detail", id });
          }}
        />
      )}
    </main>
  );
}

// --- Tab 1: hàng chờ tiếp nhận ----------------------------------------------
function QueueTable({
  rows,
  scopeAll,
  onOpen,
  total,
  page,
  size,
  onPage,
  onSize,
  ky,
  onKy,
  dieuKien,
  loc,
  onLoc,
  onXoaLoc,
}: {
  rows: HangChoItem[] | null;
  scopeAll: boolean;
  onOpen: (orderId: number) => void;
  /** TỔNG đơn chờ trên máy chủ (≠ `rows.length`, vốn chỉ là trang đang xem). */
  total: number;
  page: number;
  size: number;
  onPage: (p: number) => void;
  onSize: (n: number) => void;
  ky: KyDS;
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<LocHangCho>[];
  loc: LocHangCho;
  onLoc: (l: LocHangCho) => void;
  /** Kỳ về "Tất cả" + bỏ mọi điều kiện — MỘT lần ghi (hai lần ghi rời thì lần sau đè lần trước). */
  onXoaLoc: () => void;
}) {
  const coLoc = ky.loai !== "tat_ca" || dieuKien.some((d) => daAp(d, loc));
  const thanhLoc = scopeAll ? (
    <div className="khsx__toolbar tl-thanh">
      <ThanhLoc ky={ky} moc={MOC_HANG_CHO} onKy={onKy} dieuKien={dieuKien} loc={loc} onLoc={onLoc} />
    </div>
  ) : null;
  if (rows !== null && rows.length === 0) {
    return (
      <>
        {thanhLoc}
        {coLoc ? (
          <EmptyState
            icon="search"
            title="Không có đơn chờ nào khớp bộ lọc."
            action={
              <Button
                variant="secondary"
                onClick={onXoaLoc}
              >
                Xoá bộ lọc
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon="packageCheck"
            title={scopeAll ? "Không có đơn nào chờ lên lệnh." : "Bạn chỉ xem được lệnh của mình."}
            sub={
              scopeAll
                ? "Đơn đã chốt và đủ cọc tự hiện ở đây ngay — không cần tải lại trang."
                : "Hàng chờ tiếp nhận dành cho người có phạm vi toàn bộ (bộ phận Kế hoạch sản xuất)."
            }
          />
        )}
      </>
    );
  }
  return (
    <>
    {thanhLoc}
    <div className="khsx__tablewrap">
      <table className="khsx__table khsx__table--queue">
        <caption className="sr-only">Đơn hàng đã chuyển xuống sản xuất, chờ lên lệnh</caption>
        <thead>
          <tr>
            <th scope="col" style={{ width: 110 }}>Mã đơn</th>
            <th scope="col" style={{ width: 200 }}>Khách hàng &amp; Sale</th>
            <th scope="col" style={{ minWidth: 240 }}>Sản phẩm / Hạng mục</th>
            <th scope="col" className="khsx-th--center" style={{ width: 110 }}>Ngày giao</th>
            <th scope="col" className="khsx-th--center" style={{ width: 110 }}>Tiến độ lệnh</th>
            <th scope="col" className="khsx__col--opt" style={{ minWidth: 140 }}>Lưu ý sản xuất</th>
            <th scope="col" className="khsx-th--center khsx__col--opt" style={{ width: 150 }}>Chuyển lúc</th>
            <th scope="col" className="khsx-th--center" style={{ width: 110 }}>Ngày tạo</th>
            <th scope="col" className="khsx-th--right" style={{ width: 150 }}><span className="sr-only">Hành động</span></th>
          </tr>
        </thead>
        {rows === null ? (
          <Skeleton rows={4} cols={9} />
        ) : (
          <tbody>
            {rows.map((o) => {
              const isAllDone = o.so_dong > 0 && o.so_dong_co_lsx === o.so_dong;
              return (
                <tr
                  key={o.order_id}
                  className={`khsx__row ${o.is_rush ? "khsx__row--rush" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Xem lệnh dự kiến của đơn ${o.order_no}`}
                  onClick={() => onOpen(o.order_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(o.order_id);
                    }
                  }}
                >
                  <td>
                    <div className="khsx-code-cell">
                      <span className="khsx__code">{o.order_no}</span>
                      {o.is_rush && <ChipGap />}
                    </div>
                  </td>
                  <td>
                    <div className="khsx-cust-cell">
                      <span className="khsx-cust-name">{o.customer_name ?? "—"}</span>
                      {o.sale_name && (
                        <span className="khsx-sale-badge">
                          <Icon name="users" size={10} /> Sale {o.sale_name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="khsx-prod-tags-wrap" title={o.san_pham_tom_tat ?? undefined}>
                      {o.san_pham_tom_tat ? (
                        o.san_pham_tom_tat.split(", ").map((item, idx) => (
                          <span key={idx} className="khsx-prod-tag">
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="khsx-muted">{o.so_dong} hạng mục</span>
                      )}
                    </div>
                  </td>
                  <td className={`khsx-td--center ${classHan(o.delivery_committed_date)}`}>
                    <span className="khsx-date-val">{ngay(o.delivery_committed_date)}</span>
                  </td>
                  <td className="khsx-td--center">
                    <span className={`khsx-prog-pill ${isAllDone ? "is-done" : "is-pending"}`}>
                      {o.so_dong_co_lsx}/{o.so_dong} dòng
                    </span>
                  </td>
                  <td className="khsx__note khsx__col--opt" title={o.production_note ?? undefined}>
                    {o.production_note || "—"}
                  </td>
                  <td className="khsx-td--center khsx__col--opt">
                    <span className="khsx-time-val">{ngayGio(o.san_xuat_released_at)}</span>
                  </td>
                  <td className="khsx-td--center" title={ngayGioDayDu(o.created_at)}>
                    <span className="khsx-date-val">{ngayDayDu(o.created_at)}</span>
                  </td>
                  <td className="khsx-td--right">
                    <span className="khsx-cta-btn">
                      Xem lệnh dự kiến <Icon name="chevron" size={12} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        )}
      </table>
    </div>
    {/* Chân đặt NGOÀI khung cuộn ngang (bảng rộng 880px) để không trôi theo bảng; CSS nối nó
        thành đáy thẻ. */}
    {total > 0 && (
      <PhanTrangDayDu trang={page} size={size} tong={total} soDong={rows?.length ?? 0}
        onTrang={onPage} onSize={onSize} loading={rows === null}
        donVi="đơn chờ" ariaLabel="Phân trang đơn chờ lên lệnh" />
    )}
    </>
  );
}

// --- Tab 2: danh sách lệnh ---------------------------------------------------
function LenhTable({
  rows,
  ttFilter,
  onTtFilter,
  q,
  onQ,
  ky,
  onKy,
  dieuKien,
  loc,
  onLoc,
  onXoaLoc,
  onOpen,
  onGoQueue,
  tq,
  dem,
  total,
  page,
  size,
  onPage,
  onSize,
}: {
  rows: LsxListItem[] | null;
  ttFilter: string;
  onTtFilter: (k: string) => void;
  q: string;
  onQ: (v: string) => void;
  ky: KyDS;
  onKy: (k: KyDS) => void;
  dieuKien: DieuKien<LocLenhKhsx>[];
  loc: LocLenhKhsx;
  onLoc: (l: LocLenhKhsx) => void;
  onXoaLoc: () => void;
  /** TỔNG lệnh khớp bộ lọc trên máy chủ. */
  total: number;
  page: number;
  size: number;
  onPage: (p: number) => void;
  onSize: (n: number) => void;
  onOpen: (id: number) => void;
  onGoQueue: () => void;
  /** Tổng quan theo lsx_id (bảng chỉ dùng `slack_ngay` tô ô hạn) — tải RỜI sau bảng. */
  tq: Record<number, LsxTongQuanOut["items"][number]>;
  dem: (key: string) => number;
}) {
  const coLoc = ttFilter !== "all" || q.trim() !== "" || ky.loai !== "tat_ca"
    || dieuKien.some((d) => daAp(d, loc));
  // Trạng thái trong nút Lọc = chính hàng tab (đọc/ghi `ttFilter`), không đẻ state thứ hai.
  const dkDu: DieuKien<LocLenhKhsx>[] = [
    dkTheoTab<LocLenhKhsx>({
      tabs: TRANG_THAI_TABS.map((t) => ({ id: t.key, nhan: t.label, so: dem(t.key) })),
      tatCa: "all", dang: ttFilter, dat: onTtFilter,
    }),
    ...dieuKien,
  ];
  return (
    <>
      <div className="khsx__toolbar tl-thanh">
        <StatusTabs
          active={ttFilter}
          onChange={onTtFilter}
          tabs={TRANG_THAI_TABS.map((t) => ({ ...t, count: dem(t.key) }))}
        />
        <div className="khsx__spacer" />
        <ThanhLoc ky={ky} moc={MOC_LENH_KHSX} onKy={onKy} dieuKien={dkDu} loc={loc} onLoc={onLoc} />
        <label className="khsx__search">
          <Icon name="search" size={14} />
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Tìm mã lệnh / mã đơn / tên sản phẩm"
            aria-label="Tìm lệnh sản xuất"
          />
        </label>
      </div>

      {rows !== null && rows.length === 0 ? (
        coLoc ? (
          <EmptyState
            icon="search"
            title="Không tìm thấy lệnh khớp bộ lọc."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  onTtFilter("all");
                  onQ("");
                  // `coLoc` tính cả kỳ lẫn mọi điều kiện — sót một cái là bấm xong vẫn rỗng.
                  onXoaLoc();
                }}
              >
                Xoá bộ lọc
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon="clipboard"
            title="Chưa có lệnh sản xuất nào."
            sub="Lệnh sinh ra từ đơn Sale đã chuyển xuống sản xuất."
            action={
              <Button variant="secondary" onClick={onGoQueue}>
                Sang Hàng chờ →
              </Button>
            }
          />
        )
      ) : (
        <div className="khsx__tablewrap">
          <table className="khsx__table khsx__table--lenh">
            <caption className="sr-only">Danh sách lệnh sản xuất</caption>
            <thead>
              <tr>
                <th scope="col" style={{ width: 140 }}>Mã lệnh</th>
                <th scope="col" style={{ minWidth: 200 }}>Sản phẩm / Bộ phận</th>
                <th scope="col" style={{ minWidth: 150 }}>Đơn · Khách</th>
                <th scope="col" className="khsx-th--num" style={{ width: 100 }}>SL</th>
                <th scope="col" style={{ width: 130 }}>Tiến độ CĐ</th>
                <th scope="col" style={{ width: 140 }}>Hạn SX &amp; Giao</th>
                <th scope="col" style={{ width: 110 }}>Ngày tạo</th>
                <th scope="col" style={{ width: 130 }}>Trạng thái</th>
              </tr>
            </thead>
            {rows === null ? (
              <Skeleton rows={5} cols={8} />
            ) : (
              <tbody>
                {rows.map((l) => (
                  <tr
                    key={l.id}
                    className={`khsx__row ${l.is_rush ? "khsx__row--rush" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Mở lệnh ${l.ma}`}
                    onClick={() => onOpen(l.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(l.id);
                      }
                    }}
                  >
                    <td>
                      <div className="khsx-code-badge">
                        <span className="khsx__code">{l.ma}</span>
                        {l.is_rush && <ChipGap />}
                      </div>
                    </td>
                    <td>
                      <div className="khsx-cell-prod">
                        <div className="khsx-prod__title" title={l.nhom ? `${l.nhom} — ${l.ten}` : l.ten}>
                          {l.ten}
                        </div>
                        {l.nhom && (
                          <div className="khsx-prod__group" title="Thuộc bộ phận / nhóm sản phẩm">
                            <Icon name="layers" size={11} /> {l.nhom}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="khsx-cell-order">
                        {l.order_no ? (
                          <span className="khsx-order-chip">{l.order_no}</span>
                        ) : (
                          <span className="khsx-muted">—</span>
                        )}
                        {l.customer_name && (
                          <div className="khsx-order__cust" title={l.customer_name}>
                            {l.customer_name}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="khsx-num">
                      <div className="khsx-qty-cell">
                        <b>{num(l.so_luong_dat)}</b> <small>{nhanDonVi(l.don_vi_tinh)}</small>
                      </div>
                    </td>
                    <td>
                      {laTronGoi(l.gia_cong) ? (
                        // Trọn gói: lệnh không xuống tổ — "6 bước / Cắt 2" ở đây là nói sai chỗ.
                        <OTronGoi g={l.gia_cong} />
                      ) : (
                        <div className="khsx-step-cell">
                          <span className={`khsx-step-pill ${l.so_cong_doan === 0 ? "is-bad" : ""}`}>
                            {l.so_cong_doan > 0 ? `${l.so_cong_doan} bước` : "Chưa có CĐ"}
                          </span>
                          <span className="khsx-step-org" title="Tổ sản xuất xuất phát">
                            {l.to_dau_ten || "—"}
                          </span>
                          {l.gia_cong && <ChipMotPhan g={l.gia_cong} />}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="khsx-cell-date">
                        <div
                          className={`khsx-date-line ${classHanLich(tq[l.id]?.slack_ngay, l.han_hoan_thanh_sx)}`}
                          title={
                            tq[l.id]?.slack_ngay != null
                              ? tq[l.id]!.slack_ngay! < 0
                                ? `Lịch đang vượt hạn ${-tq[l.id]!.slack_ngay!} ngày làm việc`
                                : `Lịch còn dư ${tq[l.id]!.slack_ngay!} ngày làm việc`
                              : undefined
                          }
                        >
                          <span className="khsx-date-lbl">SX:</span>
                          <b>{ngay(l.han_hoan_thanh_sx)}</b>
                        </div>
                        <div className="khsx-date-line is-sub">
                          <span className="khsx-date-lbl">Giao:</span>
                          <b>{ngay(l.han_giao_khach)}</b>
                        </div>
                      </div>
                    </td>
                    <td title={ngayGioDayDu(l.created_at)}>
                      <span className="khsx-date-val">{ngayDayDu(l.created_at)}</span>
                    </td>
                    <td>
                      {laTronGoi(l.gia_cong) && l.trang_thai === "da_phat_hanh" ? (
                        <PillTronGoi g={l.gia_cong} />
                      ) : (
                        <TrangThaiPill tt={l.trang_thai} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      )}

      {rows !== null && rows.length > 0 && total > 0 && (
        <PhanTrangDayDu trang={page} size={size} tong={total} soDong={rows.length}
          onTrang={onPage} onSize={onSize} donVi="lệnh" ariaLabel="Phân trang lệnh sản xuất" />
      )}
    </>
  );
}
