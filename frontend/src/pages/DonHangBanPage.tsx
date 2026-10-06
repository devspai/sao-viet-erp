// Đơn hàng bán — redesign-don-hang-ban.md (P1: list + chi tiết + sửa thông tin đặt-hàng).
// Cọc/chốt/hủy = P2–P5. Icon dùng bộ Icon nhà (không emoji).
// Màn này KHÔNG tạo đơn: đơn sinh từ màn Báo giá khi khách chốt. Luồng duyệt đơn đặc thù đã gỡ.
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../components/Button";
import { Icon, type IconName } from "../components/Icons";
import { DetailModal } from "../components/DetailModal";
import { EmptyRow, EmptyState } from "../components/EmptyState";
import { LocNguoiPhuTrach } from "../components/LocNguoiPhuTrach";
import { PhanTrangDayDu } from "../components/PhanTrangDayDu";
import { useAuth } from "../auth/useAuth";
import { useCan } from "../auth/permissions";
import { BuocGiaoHang, CanhBaoTre, SanXuatTheoMon, tomTatTienDo, useTienDoDon, viecTiepTheo } from "./giao-hang/tien-do-don";
import {
  api,
  ApiError,
  type CompanyBankAccountRow,
  type DonTienDoYeuCau,
  type LsxListItem,
  type OrderDetail,
  type OrderRow,
  type OrderStatsOut,
  type SalesInvoiceListOut,
  type SalesInvoiceRow,
} from "../api/client";
import { DeliveryNotePrint } from "./giao-hang/phieu-giao-hang";
import { gopTheoNhom } from "../utils/gop-nhom";
import "./don-hang-ban.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

function vnd(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("vi-VN") + "₫";
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("vi-VN");
}

// V5: hình thức thu của Phiếu thu Kế toán (PAYMENT_VOUCHER_TYPES).
const RECEIPT_METHOD_LABELS: Record<string, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Nháp", bg: "#eef1f6", fg: "#48566a" },
  ordered: { label: "Đã chốt", bg: "#e4f5ec", fg: "#1f8a52" },
  cancelled: { label: "Hủy", bg: "#fdecea", fg: "#b4432b" },
  // dormant (thiết kế đã bỏ) — map để dữ liệu cũ không phun enum thô ra UI
  on_hold: { label: "Tạm giữ", bg: "#fdf2e0", fg: "#a9631a" },
  change_order: { label: "Đổi đơn", bg: "#fdf2e0", fg: "#a9631a" },
};

type TabDef = {
  id: string;
  label: string;
  status?: string;
  clientFilter?: (o: OrderRow) => boolean;
  countKey?: keyof OrderStatsOut;
};
// Tab "Chờ duyệt" đã bỏ cùng luồng duyệt đơn đặc thù — nó chỉ đếm đơn nhập tay, mà đường tạo
// đơn tay đã gỡ nên tab đó vĩnh viễn rỗng.
const TABS: TabDef[] = [
  { id: "all", label: "Tất cả", countKey: "all" },
  { id: "draft", label: "Nháp", status: "draft", countKey: "draft" },
  { id: "awaiting_deposit", label: "Chờ cọc", status: "draft", clientFilter: (o) => !o.deposit_ok },
  { id: "ready", label: "Sẵn sàng chốt", status: "draft", clientFilter: (o) => o.deposit_ok },
  { id: "ordered", label: "Đã chốt", status: "ordered", countKey: "ordered" },
  { id: "cancelled", label: "Hủy", status: "cancelled", countKey: "cancelled" },
];

const PAGE_SIZE = 25;
// "Chờ cọc"/"Sẵn sàng chốt" lọc theo deposit_ok — số TÍNH (gộp cọc thu + VAT + dòng đơn ở
// order_service._money(), không phải cột DB) nên không lọc/phân trang được ở SQL mà không chép
// lại công thức tiền (rủi ro lệch số). Tải một cửa sổ "draft" đủ rộng rồi lọc + phân trang ở đây.
const CLIENT_FILTER_WINDOW = 200;

function Chip({ icon, label, tone }: { icon: IconName; label: string; tone: "warn" | "muted" | "info" | "rush" }) {
  return (
    <span className={`dhb__chip tone--${tone}`}>
      <Icon name={icon} size={12} /> {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status };
  return (
    <span className={`dhb__status-badge status--${status}`}>
      {m.label}
    </span>
  );
}

function RowFlags({ o }: { o: OrderRow }) {
  return (
    <span className="dhb__flags">
      {o.is_rush && <Chip icon="bell" label="GẤP" tone="rush" />}
      {/* "Chờ duyệt" + "Gia công" đã bỏ cùng luồng duyệt và trường Bản chất đơn; chip "Không giá
          vốn" (đơn nhập tay cũ, cost_basis='none') ẩn 04/10/2026 — gần như dòng nào cũng có, nhiễu. */}
    </span>
  );
}

// Ngày giao còn bao xa — chỉ cho đơn ĐÃ CHỐT. Chỉ nói "còn N ngày"/"hôm nay"; KHÔNG kết luận
// "trễ" vì danh sách chưa biết đơn đã giao hay chưa.
function HanGiao({ o }: { o: OrderRow }) {
  if (o.status !== "ordered" || !o.delivery_committed_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(o.delivery_committed_date);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return null;
  return (
    <div className={`dhb__row-sub${days <= 3 ? " dhb__row-sub--warn" : ""}`}>
      {days === 0 ? "hôm nay" : `còn ${days} ngày`}
    </div>
  );
}

// Đơn đã chốt: Sale đã bấm "Chuyển xuống SX" chưa — chưa chuyển là đơn còn nằm ở Kinh doanh.
function SanXuatCell({ o }: { o: OrderRow }) {
  if (o.status !== "ordered") return <span className="dhb__sx">—</span>;
  if (o.san_xuat_released_at)
    return (
      <span className="dhb__sx dhb__sx--on">
        Đã chuyển <span className="dhb__mono">{fmtDate(o.san_xuat_released_at)}</span>
      </span>
    );
  return <span className="dhb__sx">Chờ đủ cọc</span>;
}

interface Props {
  navigate?: (id: string, params?: Record<string, unknown>) => void;
  openOrderId?: number | null;   // deep-link từ Báo giá ("Xem đơn") → mở drawer đơn vừa tạo
  /** Tick nhóm bán hàng + sản xuất + kho + giao hàng (kênh SSE chung của AppShell) — drawer đơn nạp
   *  lại tiến độ. Trước 28/09/2026 drawer tự mở kênh SSE riêng. */
  eventTick?: number;
  /** Tick nhóm mua hàng · kế toán — drawer nạp lại hoá đơn bán của đơn. */
  keToanTick?: number;
}

export function DonHangBanPage({ navigate, openOrderId, eventTick, keToanTick }: Props) {
  const { token } = useAuth();
  const can = useCan();
  // `create` KHÔNG còn được dùng ở màn này (đơn sinh từ Báo giá) — quyền vẫn tồn tại, gác ở đó.
  const canUpdate = can("don_hang_ban", "update");
  const canRecordDeposit = can("don_hang_ban", "record_deposit");
  // Hủy đơn đã chốt MẶC ĐỊNH BẬT cho vai có Sửa đơn (gỡ công tắc `approve_exception` 24/08/2026;
  // luồng "duyệt đơn đặc thù" vốn đã bỏ nên cờ này giờ chỉ còn gác việc hủy đơn đã chốt).
  const canApproveException = true;

  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  // Hộp lọc NV phụ trách — null = tất cả người trong tầm nhìn.
  const [nguoi, setNguoi] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // `/enums` không còn được nạp ở đây: nó chỉ phục vụ hộp thoại tạo đơn (đã xoá). Nhãn trạng thái
  // dùng bảng STATUS_META tĩnh phía trên.

  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [stats, setStats] = useState<OrderStatsOut | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    const t = TABS.find((x) => x.id === tab) ?? TABS[0];
    setLoading(true);
    setErr(null);
    if (t.clientFilter) {
      api.orders
        .list(token, {
          q: q || undefined, status: t.status, nguoi,
          sort: "-created_at", page: 1, size: CLIENT_FILTER_WINDOW,
        })
        .then((r) => {
          const filtered = r.items.filter(t.clientFilter!);
          setTotal(filtered.length);
          setRows(filtered.slice((page - 1) * size, page * size));
        })
        .catch((e) => setErr(String(e?.message ?? e)))
        .finally(() => setLoading(false));
    } else {
      api.orders
        .list(token, {
          q: q || undefined, status: t.status, nguoi,
          sort: "-created_at", page, size,
        })
        .then((r) => {
          setRows(r.items);
          setTotal(r.total);
        })
        .catch((e) => setErr(String(e?.message ?? e)))
        .finally(() => setLoading(false));
    }
    api.orders.stats(token, undefined, nguoi).then(setStats).catch(() => {});
  }, [token, q, tab, page, size, nguoi]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, q, nguoi]);

  function openDetail(id: number) {
    if (!token) return;
    api.orders.get(token, id).then(setSelected).catch((e) => setErr(String(e?.message ?? e)));
  }

  // Deep-link từ Báo giá (nút "Xem đơn" sau khi tạo đơn) → mở drawer đơn ngay khi vào màn.
  useEffect(() => {
    if (token && openOrderId) openDetail(openOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, openOrderId]);

  return (
    <main className="dhb-container">
      <header className="dhb__header">
        <div className="dhb__title-group">
          <p className="eyebrow">Kinh doanh</p>
          <h1 className="dhb__title">Đơn hàng bán</h1>
        </div>
        {/* Nút "+ Tạo đơn" đã gỡ: đơn CHỈ sinh từ màn Báo giá khi khách chốt (BaoGiaPage →
            api.orders.create). Giữ nút ở đây là cửa thứ hai làm cùng một việc. */}
      </header>


      {/* Tabs + tìm */}
      <div className="dhb__toolbar">
        <div className="dhb__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`dhb__tab ${tab === t.id ? "is-active" : ""}`}
            >
              {t.label}
              {t.countKey && stats && stats[t.countKey] !== undefined && (
                <span className="dhb__tab-count">{stats[t.countKey]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="dhb__spacer" />
        <LocNguoiPhuTrach nap={api.orders.nguoiPhuTrach} value={nguoi} onChange={setNguoi} donVi="đơn" />
        <div className="dhb__search-wrapper">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã / khách / PO / hàng…"
            className="dhb__search-input"
          />
          <span className="dhb__search-icon">
            <Icon name="search" size={15} />
          </span>
        </div>
      </div>

      {err && <div className="banner banner--error" role="alert">{err}</div>}

      {/* Bảng */}
      <div className="dhb__tablewrap">
        <table className="dhb__table">
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách hàng · hàng</th>
              <th>PO khách</th>
              <th className="dhb__text-right">Giá trị</th>
              <th>Cọc</th>
              <th>Ngày chốt</th>
              <th>Ngày giao</th>
              <th>Sản xuất</th>
              <th>NV</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {loading && <EmptyRow colSpan={10} trangThai="dang-tai" />}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center" style={{ padding: 24, color: "var(--ash)" }}>
                  Chưa có đơn hàng.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => openDetail(o.id)}
                  className="dhb__row"
                >
                  <td>
                    <span className="dhb__order-code">{o.order_no}</span>
                    <div style={{ marginTop: 4 }}>
                      <RowFlags o={o} />
                    </div>
                  </td>
                  <td>
                    <div>{o.customer_name ?? "—"}</div>
                    {o.first_line_desc && (
                      <div className="dhb__row-sub" title={o.first_line_desc}>
                        {o.first_line_desc}
                        {o.line_count > 1 && <span className="dhb__row-more"> +{o.line_count - 1} món</span>}
                      </div>
                    )}
                  </td>
                  <td className="dhb__mono">{o.customer_po_no ?? "—"}</td>
                  <td className="dhb__val">{vnd(o.total_with_vat)}</td>
                  <td>
                    <DepositBar o={o} />
                  </td>
                  <td className="dhb__mono">{fmtDate(o.ordered_at)}</td>
                  <td>
                    <div className="dhb__mono">{fmtDate(o.delivery_committed_date)}</div>
                    <HanGiao o={o} />
                  </td>
                  <td>
                    <SanXuatCell o={o} />
                  </td>
                  <td>{o.sale_name ?? "—"}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!err && total > 0 && (
        <PhanTrangDayDu
          trang={page}
          size={size}
          tong={total}
          soDong={rows.length}
          onTrang={setPage}
          onSize={(n) => {
            setSize(n);
            setPage(1);
          }}
          loading={loading}
          donVi="đơn"
          ariaLabel="Phân trang đơn hàng bán"
        />
      )}

      {selected && (
        <OrderDrawer
          order={selected}
          canUpdate={canUpdate}
          canRecordDeposit={canRecordDeposit}
          canApproveException={canApproveException}
          onClose={() => setSelected(null)}
          onSaved={(d) => {
            setSelected(d);
            load();
          }}
          navigate={navigate}
          eventTick={eventTick}
          keToanTick={keToanTick}
        />
      )}
    </main>
  );
}

function DepositBar({ o }: { o: OrderRow }) {
  if (!o.deposit_required)
    return <span className="dhb__mono" style={{ color: "var(--ash)" }}>—</span>;
  const pct = Math.min(100, Math.round((o.deposit_received / o.deposit_required) * 100));
  return (
    <div className="dhb__deposit-container">
      <div className="dhb__deposit-header">
        <span>{vnd(o.deposit_received)}</span>
        {o.deposit_ok ? (
          <span className="dhb__deposit-ok">
            <Icon name="check" size={11} /> đủ
          </span>
        ) : (
          <span>/ {vnd(o.deposit_required)}</span>
        )}
      </div>
      <div className="dhb__deposit-progress-bg">
        <div
          className="dhb__deposit-progress-bar"
          style={{
            width: `${pct}%`,
            background: o.deposit_ok ? "var(--moss)" : "var(--amber)",
          }}
        />
      </div>
    </div>
  );
}

// --- Drawer chi tiết ----------------------------------------------------------
function OrderDrawer({
  order, canUpdate, canRecordDeposit, canApproveException, onClose, onSaved, navigate,
  eventTick, keToanTick,
}: {
  order: OrderDetail;
  canUpdate: boolean;
  canRecordDeposit: boolean;
  canApproveException: boolean;
  onClose: () => void;
  onSaved: (d: OrderDetail) => void;
  navigate?: (id: string, params?: Record<string, unknown>) => void;
  eventTick?: number;
  keToanTick?: number;
}) {
  const { token } = useAuth();
  const can = useCan();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  // In phiếu giao theo MỘT yêu cầu (19/09/2026) — bản in cả đơn vẫn ở nút "Xem bản in".
  const [inYc, setInYc] = useState<DonTienDoYeuCau | null>(null);
  const [invoiceBook, setInvoiceBook] = useState<SalesInvoiceListOut | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const canCreateInvoice = can("phieu_thu", "create");
  const canCancelInvoice = can("phieu_thu", "cancel");
  const canCancel = (order.status === "draft" && canUpdate) || (order.status === "ordered" && canApproveException);

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setInvoiceLoading(true);
    setInvoiceError(null);
    try {
      setInvoiceBook(await api.accounting.salesInvoices(token, order.id));
    } catch (error) {
      setInvoiceError(error instanceof ApiError ? error.message : "Không tải được hóa đơn của đơn bán.");
    } finally {
      setInvoiceLoading(false);
    }
  }, [token, order.id]);

  useEffect(() => {
    setInvoiceBook(null);
    void loadInvoices();
  }, [loadInvoices]);

  // Kế toán ghi/huỷ hoá đơn, thu tiền ⇒ nạp lại sổ hoá đơn. Đi theo tick nhóm kế toán của kênh SSE
  // CHUNG (AppShell) — trước đây drawer mở thêm một kênh riêng mỗi lần mở.
  const keToanTickDaNap = useRef(keToanTick);
  useEffect(() => {
    if (keToanTickDaNap.current === keToanTick) return;
    keToanTickDaNap.current = keToanTick;
    void loadInvoices();
  }, [keToanTick, loadInvoices]);

  async function upConsent(f: File) { if (token) onSaved(await api.orders.uploadConsent(token, order.id, f)); }
  async function delConsent(aid: number) { if (token) onSaved(await api.orders.deleteConsent(token, order.id, aid)); }
  const [acts, setActs] = useState<{ at: string; actor_name: string | null; action: string; detail: string }[]>([]);
  const isDraft = order.status === "draft";
  const [drawerTab, setDrawerTab] = useState<"overview" | "commercial" | "history">("overview");

  const isChotDone = order.status === "ordered" || order.ordered_at != null;
  // Vòng đời: CHỐT (thông tin) → CỌC (kế toán thu, SAU chốt) → SẢN XUẤT. Cọc 'xong' = đã chốt VÀ
  // (không cần cọc HOẶC thu đủ). Trước chốt → cọc chưa tới lượt.
  const noDeposit = order.deposit_required <= 0;
  const isCocDone = isChotDone && order.deposit_ok;
  const remaining = Math.max(0, order.deposit_required - order.deposit_received);

  // Bước Sản xuất — đọc LỆNH THẬT của bàn Kế hoạch SX (`/api/lsx`). Chưa chuyển → chờ kế hoạch lên
  // lệnh → đang chạy. "Xong" thuộc pha THỰC THI (nhập kho thành phẩm) — chưa dựng nên luôn false,
  // đừng suy ra từ trạng thái lệnh ở lát này.
  const [lenhs, setLenhs] = useState<LsxListItem[]>([]);
  useEffect(() => {
    if (!token || order.status !== "ordered" || !order.san_xuat_released_at) {
      setLenhs([]);
      return;
    }
    api.lsx.list(token, { order_id: order.id }).then((r) => setLenhs(r.items)).catch(() => setLenhs([]));
  }, [token, order.id, order.status, order.san_xuat_released_at]);
  const sxReleased = !!order.san_xuat_released_at;
  // Tiến độ SX (gồm cả nhập kho) → Giao do máy chủ gộp theo sản phẩm (`/orders/{id}/tien-do`), tự tươi qua SSE.
  const { td, taiLai: taiTienDo } = useTienDoDon(order.id, order.status !== "draft", eventTick);
  const tt = tomTatTienDo(td);
  // Lệnh xong hết = MỌI lệnh của đơn xong VÀ không còn món nào thiếu nguồn (không lệnh mà tồn kho
  // không đủ) — thiếu một món là chưa thể xong, dù các lệnh đã chạy hết.
  const thieuNguon = tt.thieuNguon.length;
  const lenhXongHet = td != null && td.cum.length > 0 && thieuNguon === 0 && (tt.coLenh ? tt.sxXong : sxReleased);
  // Bước "Nhập kho" riêng ĐÃ GỘP vào Sản xuất (05/10/2026): Sản xuất chỉ XONG khi mọi sản phẩm đã
  // đủ hàng trong kho (kho nhận đủ thành phẩm KCS gửi sang, hoặc tồn kho gánh đủ).
  const khoDone = td != null && tt.khoXong;
  const sxDone = lenhXongHet && khoDone;
  const giaoDone = td != null && tt.giaoXong;
  const sxState: "chua" | "cho_kh" | "chay" =
    !sxReleased ? "chua" : lenhs.length === 0 ? "cho_kh" : "chay";
  // Chỉ BÁO thiếu nguồn khi Kế hoạch đã bắt đầu lên lệnh: trước đó mọi món đều chưa có lệnh, báo
  // "4 món chưa có nguồn" lúc vừa chuyển xuống chỉ là báo động giả.
  const baoThieuNguon = sxState === "chay" && thieuNguon > 0;
  // Chữ phụ dưới tên chặng Sản xuất: thiếu nguồn được ưu tiên báo; còn lại nói kho đã đủ mấy món —
  // nhập kho là khâu cuối của sản xuất nên "kho đủ" chính là thước đo sản xuất xong.
  const sxText = order.status === "cancelled" ? "đơn đã hủy"
    : !isChotDone ? "—"
    : !sxReleased ? "chưa chuyển"
    : sxDone ? "xong"
    : baoThieuNguon ? `${thieuNguon} món chưa có nguồn`
    : sxState === "cho_kh" ? "chờ lệnh"
    : td ? `kho đủ ${tt.soMonDuHang}/${tt.soMon} món` : "…";
  const giaoText = giaoDone ? "đã giao đủ" : td && tt.giaoPct > 0 ? `giao ${Math.round(tt.giaoPct)}%`
    : tt.soYeuCauMo > 0 ? `${tt.soYeuCauMo} yêu cầu mở` : "—";
  const soMonGiaoDu = (td?.cum ?? []).filter((c) => c.con_phai_giao <= 0).length;
  const ngayNgan = (v: string | null | undefined) => fmtDate(v ?? null).replace(/\/\d{4}$/, "");
  const giaoSub = !isChotDone ? "—"
    : giaoDone ? "đã giao đủ"
    : td && tt.giaoPct > 0 ? `đủ ${soMonGiaoDu}/${tt.soMon} món`
    : tt.soYeuCauMo > 0 ? `${tt.soYeuCauMo} yêu cầu mở`
    : order.delivery_committed_date ? `hạn ${ngayNgan(order.delivery_committed_date)}` : "—";

  const chotSub = order.status === "cancelled" ? "đã hủy"
    : isChotDone ? ngayNgan(order.ordered_at ?? order.created_at) : "chưa chốt";
  const cocText = !isChotDone ? "chưa tới" : noDeposit ? "không cần" : order.deposit_ok ? "đủ" : "chờ cọc";
  const invoiceStage = !invoiceBook || invoiceBook.invoiced_amount <= 0
    ? "none"
    : invoiceBook.uninvoiced_amount > 0
      ? "partial"
      : "full";
  const invoiceStageLabel = invoiceStage === "full"
    ? "Đã ghi đủ"
    : invoiceStage === "partial"
      ? "Đã ghi một phần"
      : "Chưa ghi";

  const [activeStep, setActiveStep] = useState<"coc" | "chot" | "sanxuat" | "giao" | "hoadon">("coc");
  const buocDang: typeof activeStep | null = order.status === "cancelled" ? null
    : !isChotDone ? "chot" : !isCocDone ? "coc" : !sxDone ? "sanxuat"
    : !giaoDone ? "giao" : invoiceStage !== "full" ? "hoadon" : null;
  const viec = viecTiepTheo({
    trangThai: order.status,
    canCoc: !noDeposit,
    duCoc: order.deposit_ok,
    thieuCoc: remaining,
    chuyenSxLuc: order.san_xuat_released_at,
    gap: order.is_rush,
    hanGiao: order.delivery_committed_date,
    td,
    hoaDon: invoiceStage,
  });
  const khungO = (k: typeof activeStep) => `dhb__chang-o${activeStep === k ? " is-mo" : ""}`;
  const CHANG: { k: typeof activeStep; nhan: string; sub: string; xong: boolean; canhBao?: boolean }[] = [
    { k: "chot", nhan: "Chốt", sub: chotSub, xong: isChotDone },
    { k: "coc", nhan: "Cọc", sub: cocText, xong: isCocDone },
    { k: "sanxuat", nhan: "Sản xuất", sub: sxText, xong: sxDone, canhBao: baoThieuNguon && order.status !== "cancelled" },
    { k: "giao", nhan: "Giao", sub: giaoSub, xong: giaoDone },
    { k: "hoadon", nhan: "Hóa đơn", sub: invoiceStageLabel.toLowerCase(), xong: invoiceStage === "full" },
  ];

  useEffect(() => {
    if (token) api.orders.activity(token, order.id).then((r) => setActs(r.items)).catch(() => {});
  }, [token, order.id]);

  useEffect(() => {
    // Đơn hủy → dừng chuỗi tại "Chốt" (đã có khối lý-do-hủy riêng), đừng để mặc định trôi
    // xuống bước sau như thể lệnh còn đang chờ xử lý.
    const defaultStep = order.status === "cancelled"
      ? "chot"
      : !isChotDone ? "chot" : !isCocDone ? "coc" : !sxDone ? "sanxuat"
      : !giaoDone ? "giao" : "hoadon";
    setActiveStep(defaultStep);
    // Chỉ chọn bước mặc định khi MỞ đơn / đổi trạng thái / tiến độ vừa tải xong — SSE tự tươi
    // không được giật bước người dùng đang xem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.status, isChotDone, isCocDone, td != null]);

  return (
    <div
      onClick={onClose}
      className="dhb__drawer-overlay"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="dhb__drawer-content"
      >
        <header className="dhb__drawer-header">
          <div className="dhb__drawer-headmain">
            <div className="dhb__drawer-headtop">
              <h2 className="dhb__drawer-title">{order.order_no}</h2>
              <StatusBadge status={order.status} />
              {order.source_type === "bao_gia" && order.quotation_code && (
                <Chip icon="fileText" label={order.quotation_code} tone="muted" />
              )}
              <RowFlags o={order} />
            </div>
            <div className="dhb__drawer-cust"><Icon name="users" size={13} /> {order.customer_name ?? "—"}</div>
          </div>
          <button className="btn btn--secondary" style={{ height: 32 }} onClick={() => setShowPrint(true)}><Icon name="printer" size={14} /> Xem bản in</button>
          {isDraft && canUpdate && (
            <button className="btn btn--secondary" style={{ height: 32 }} onClick={() => setEditing(true)}><Icon name="pencil" size={14} /> Sửa</button>
          )}
          {canCancel && (
            <button className="btn btn--secondary" style={{ height: 32 }} onClick={() => setCancelling(true)}><Icon name="ban" size={14} /> Hủy</button>
          )}
          <button className="btn btn--ghost" style={{ height: 32 }} onClick={onClose} aria-label="Đóng"><Icon name="x" size={16} /></button>
        </header>

        <div className="dhb__drawer-tabs">
          <button
            onClick={() => setDrawerTab("overview")}
            className={`dhb__drawer-tab ${drawerTab === "overview" ? "is-active" : ""}`}
          >
            <Icon name="grid" size={13} /> Tổng quan & Vòng đời
          </button>
          <button
            onClick={() => setDrawerTab("commercial")}
            className={`dhb__drawer-tab ${drawerTab === "commercial" ? "is-active" : ""}`}
          >
            <Icon name="cart" size={13} /> Thương mại
          </button>
          <button
            onClick={() => setDrawerTab("history")}
            className={`dhb__drawer-tab ${drawerTab === "history" ? "is-active" : ""}`}
          >
            <Icon name="fileText" size={13} /> Đính kèm & Nhật ký
          </button>
        </div>

        <div className="dhb__drawer-body">
          {drawerTab === "overview" && (
            <>
              {/* ① Thông tin đơn hàng */}
              <Section title="Thông tin đơn hàng">
                {/* Nhóm 1: Thông tin đặt hàng & Hợp đồng */}
                <div className="dhb__info-subgroup">
                  <div className="dhb__info-subgroup-title">Thông tin đặt hàng</div>
                  <div className="dhb__kv-inline-grid">
                    <div className="dhb__kv-inline">
                      <span className="dhb__kv-inline-key">Nguồn</span>
                      <span className="dhb__kv-inline-val">{order.source_type === "bao_gia" ? "Từ báo giá" : "Nhập giá tay"}</span>
                    </div>
                    <div className="dhb__kv-inline">
                      <span className="dhb__kv-inline-key">Loại đơn</span>
                      <span className="dhb__kv-inline-val">{order.order_kind === "bo_sung" ? "Đơn bổ sung" : "Đơn mới"}</span>
                    </div>
                    <div className="dhb__kv-inline">
                      <span className="dhb__kv-inline-key">NV phụ trách</span>
                      <span className="dhb__kv-inline-val">{order.sale_name ?? "—"}</span>
                    </div>
                    <div className="dhb__kv-inline">
                      <span className="dhb__kv-inline-key">Số PO khách</span>
                      <span className="dhb__kv-inline-val">{order.customer_po_no ? <span className="dhb__mono">{order.customer_po_no}</span> : "—"}</span>
                    </div>
                    <div className="dhb__kv-inline">
                      <span className="dhb__kv-inline-key">Ngày tạo</span>
                      <span className="dhb__kv-inline-val dhb__mono">{fmtDate(order.created_at)}</span>
                    </div>
                    {order.ordered_at ? (
                      <div className="dhb__kv-inline">
                        <span className="dhb__kv-inline-key">Ngày chốt</span>
                        <span className="dhb__kv-inline-val dhb__mono">{fmtDate(order.ordered_at)}</span>
                      </div>
                    ) : (
                      <div className="dhb__kv-inline">
                        <span className="dhb__kv-inline-key">% cọc quy định</span>
                        <span className="dhb__kv-inline-val dhb__mono">{order.deposit_pct != null ? `${order.deposit_pct}%` : "—"}</span>
                      </div>
                    )}
                    {order.ordered_at && (
                      <div className="dhb__kv-inline">
                        <span className="dhb__kv-inline-key">% cọc quy định</span>
                        <span className="dhb__kv-inline-val dhb__mono">{order.deposit_pct != null ? `${order.deposit_pct}%` : "—"}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Nhóm 2: Thông tin giao nhận & Người nhận (Full-width card) */}
                <div className="dhb__info-subgroup">
                  <div className="dhb__info-subgroup-title">Giao hàng & Người nhận</div>
                  <div className="dhb__delivery-card">
                    <div className="dhb__delivery-row">
                      <Icon name="calendar" size={15} className="dhb__delivery-icon" />
                      <div className="dhb__delivery-body">
                        <div className="dhb__delivery-label">Hạn giao cam kết</div>
                        <div className="dhb__delivery-val dhb__mono" style={{ color: "var(--rust-deep)", fontSize: 13.5 }}>
                          {fmtDate(order.delivery_committed_date)}
                        </div>
                      </div>
                    </div>

                    <div className="dhb__delivery-row">
                      <Icon name="users" size={15} className="dhb__delivery-icon" />
                      <div className="dhb__delivery-body">
                        <div className="dhb__delivery-label">Người nhận hàng</div>
                        <div className="dhb__delivery-val">
                          {[order.delivery_contact_name, order.delivery_contact_phone].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    </div>

                    <div className="dhb__delivery-row">
                      <Icon name="mapPin" size={15} className="dhb__delivery-icon" />
                      <div className="dhb__delivery-body">
                        <div className="dhb__delivery-label">Địa chỉ giao hàng</div>
                        <div className="dhb__delivery-val" style={{ fontWeight: 500 }}>
                          {order.delivery_address || "—"}
                        </div>
                      </div>
                    </div>

                    {order.delivery_note && (
                      <div className="dhb__delivery-note">
                        <div className="dhb__delivery-note-tag">
                          <Icon name="fileText" size={12} /> Lưu ý cho khâu giao hàng:
                        </div>
                        {order.delivery_note}
                      </div>
                    )}
                  </div>
                </div>

              </Section>

              {/* Lưu ý sản xuất — sửa được cả khi đã chốt (đường hẹp D3 → realtime bàn Kế hoạch) */}
              {order.status === "ordered" && canUpdate && (
                <ProductionHintEditor order={order} onSaved={onSaved} />
              )}

              {/* Vòng đời đơn */}
              <Section title="Vòng đời đơn">
                <CanhBaoTre td={order.status === "ordered" && !giaoDone ? td : null} />

                {/* Thanh chặng (phương án A, 05/10/2026): Chốt → Cọc → Sản xuất (gồm nhập kho) → Giao →
                    Hóa đơn. Bấm một chặng để xem khung chi tiết bên dưới. */}
                <div className="dhb__path" role="tablist" aria-label="Các chặng của đơn">
                  {CHANG.map((c) => {
                    const dang = c.k === buocDang;
                    // Giao đã có phần trong lúc Sản xuất chưa xong ⇒ "dở dang song song".
                    const doDang = !c.xong && !dang && c.k === "giao" && td != null && tt.giaoPct > 0;
                    return (
                      <button key={c.k} type="button" role="tab" aria-selected={activeStep === c.k}
                        aria-label={`${c.nhan}: ${c.sub}`}
                        className={`dhb__path-buoc${c.xong ? " is-done" : dang ? " is-dang" : doDang ? " is-do" : ""}${activeStep === c.k ? " is-selected" : ""}`}
                        onClick={() => setActiveStep(c.k)}>
                        <span className="dhb__path-o">
                          <b>{c.nhan}</b>
                          <small className={c.canhBao ? "is-warn" : undefined}>{c.sub}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Việc tiếp theo: đơn đang chờ AI làm gì, từ bao giờ — luôn ở đầu, chặng nào cũng thấy. */}
                {viec && (
                  <div className="dhb__viec">
                    <div className="dhb__viec-chu">
                      <span className="dhb__viec-cau">{viec.cau}</span>
                      {viec.the.length > 0 && (
                        <span className="dhb__viec-the">
                          {viec.the.map((t) => (
                            <span key={t.nhan} className={`dhb__sx-tag${t.tone ? ` dhb__sx-tag--${t.tone}` : ""}`}>{t.nhan}</span>
                          ))}
                        </span>
                      )}
                    </div>
                    {viec.nut && (viec.nut.toi !== activeStep) && (
                      <Button variant="secondary" className="dhb__viec-nut"
                        onClick={() => {
                          const toi = viec.nut!.toi;
                          if (toi === "ke-hoach-sx") navigate?.("ke-hoach-sx", { openSxOrderId: order.id });
                          else setActiveStep(toi);
                        }}>
                        {viec.nut.nhan}
                      </Button>
                    )}
                  </div>
                )}

                {/* Khung chi tiết từng chặng: cả 5 khung chồng lên CÙNG một ô lưới, khung không chọn chỉ
                    ẩn (visibility) ⇒ khung luôn cao bằng chặng dài nhất, bấm qua lại không giật dài/ngắn. */}
                <div className="dhb__chang-khung">
                <div className={khungO("chot")}>
                  <div className="dhb__lifecycle-box">
                    <div className="dhb__lifecycle-box-header">
                      <h4 className="dhb__lifecycle-box-title">Chốt đơn hàng</h4>
                      <span className={`dhb__lifecycle-badge ${isChotDone ? "dhb__lifecycle-badge--done" : "dhb__lifecycle-badge--active"}`}>
                        {order.status === "draft" ? "BẢN NHÁP" : (order.status === "ordered" ? "ĐÃ CHỐT" : "ĐÃ HỦY")}
                      </span>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {/* Chốt đơn đi theo quyền SỬA đơn (05/10/2026) — không có ô quyền riêng, khớp máy chủ. */}
                      {isDraft ? (
                        <ConfirmPanel order={order} canManage={canUpdate} canExtend={canUpdate} onSaved={onSaved} />
                      ) : order.status === "ordered" ? (
                        <>
                          <KV k="Đã chốt lúc" v={<span className="dhb__mono">{fmtDate(order.ordered_at)}</span>} />
                          <p style={{ color: "var(--ash)", fontSize: 12, margin: "6px 0 0" }}>Đủ cọc là đơn tự xuống hàng chờ Kế hoạch sản xuất.</p>
                        </>
                      ) : order.status === "cancelled" ? (
                        <div style={{ display: "grid", gap: 4 }}>
                          <KV k="Lý do hủy" v={order.cancel_reason ?? "—"} />
                          {order.cancel_fault && <KV k="Lỗi tại" v={order.cancel_fault === "khach" ? "Khách hàng" : "Xưởng in"} />}
                          {order.deposit_received > 0 && (
                            <KV k="Cọc" v={`Còn ${vnd(order.deposit_received)} chưa quyết toán — xử lý ngoài hệ thống`} />
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
 
                <div className={khungO("coc")}>
                  <div className="dhb__lifecycle-box">
                    <div className="dhb__lifecycle-box-header">
                      <h4 className="dhb__lifecycle-box-title">Cọc &amp; thu tiền</h4>
                      <span className={`dhb__lifecycle-badge ${isCocDone ? "dhb__lifecycle-badge--done" : !isChotDone ? "dhb__lifecycle-badge--upcoming" : "dhb__lifecycle-badge--active"}`}>
                        {!isChotDone ? "CHƯA TỚI" : isCocDone ? "ĐỦ CỌC" : "CHỜ CỌC"}
                      </span>
                    </div>
                    <div className="dhb__stat-trio">
                      <div className="dhb__stat"><div className="dhb__stat-l">Cần thu{order.deposit_pct != null ? ` (${order.deposit_pct}%)` : ""}</div><div className="dhb__stat-n">{vnd(order.deposit_required)}</div></div>
                      <div className="dhb__stat"><div className="dhb__stat-l">Đã thu</div><div className="dhb__stat-n" style={{ color: isCocDone ? "var(--moss-deep)" : undefined }}>{vnd(order.deposit_received)}</div></div>
                      <div className="dhb__stat"><div className="dhb__stat-l">Còn thiếu</div><div className="dhb__stat-n" style={{ color: remaining > 0 ? "var(--amber-deep)" : undefined }}>{vnd(remaining)}</div></div>
                    </div>
                    <div style={{ margin: "4px 0" }}><DepositBar o={order} /></div>
                    {order.deposits.length > 0 && (
                      <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
                        {order.deposits.map((d) => (
                          <div key={d.id} className="dhb__receipt-row">
                            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                              <strong className="dhb__mono" style={{ fontSize: 14, color: "var(--ink)" }}>{vnd(d.amount)}</strong>
                              <span style={{ color: "var(--ash-2)" }}>{RECEIPT_METHOD_LABELS[d.receipt_method] ?? d.receipt_method}</span>
                              {d.status === "received" && (
                                <span style={{ color: "var(--moss)", display: "inline-flex", gap: 2, alignItems: "center" }}><Icon name="check" size={12} /> đã thu</span>
                              )}
                              {d.receipt_date && <span style={{ color: "var(--ash-2)" }} className="dhb__mono">{fmtDate(d.receipt_date)}</span>}
                              <div style={{ flex: 1 }} />
                              <button type="button" className="link dhb__mono"
                                style={{ color: "var(--rust)", background: "none", border: 0, padding: 0, cursor: "pointer", fontWeight: 600 }}
                                title="Mở phiếu thu này bên Kế toán"
                                onClick={() => navigate?.("ke-toan-phieu-thu", { focusReceiptQuery: d.code })}>
                                {d.doc_no ?? d.code} ↗
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {order.deposits.length === 0 && (
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ash-2)" }}>Chưa có phiếu thu cọc nào.</p>
                    )}
                    {!isChotDone ? (
                      <p style={{ color: "var(--ash)", fontSize: 12, margin: "4px 0 0" }}>
                        Đơn phải CHỐT (đủ thông tin) trước — sau chốt kế toán thu cọc ở bước này.
                      </p>
                    ) : isCocDone ? (
                      <p style={{ color: "var(--moss-deep)", fontSize: 12, margin: "4px 0 0" }}>
                        Đã đủ cọc — đơn đã tự xuống hàng chờ Kế hoạch sản xuất.
                      </p>
                    ) : canRecordDeposit ? (
                      <DepositForm order={order} onSaved={onSaved} />
                    ) : (
                      <p style={{ color: "var(--ash)", fontSize: 12, margin: "4px 0 0" }}>Chờ kế toán thu cọc.</p>
                    )}
                  </div>
                </div>
 
 
                <div className={khungO("sanxuat")}>
                  <div className="dhb__lifecycle-box">
                    <div className="dhb__lifecycle-box-header">
                      <h4 className="dhb__lifecycle-box-title">Sản xuất</h4>
                      <span className="dhb__sx-goi-y">xong khi kho đã nhận đủ mọi món</span>
                    </div>
                    {order.status === "cancelled" ? (
                      <p className="dhb__td-note">
                        {sxReleased
                          ? "Đơn đã hủy — trước đó đã chuyển xuống sản xuất nhưng chưa lên lệnh nào."
                          : "Đơn đã hủy, chưa từng chuyển xuống sản xuất."}
                      </p>
                    ) : order.status !== "ordered" ? (
                      <p className="dhb__td-note">Đơn phải chốt trước mới chuyển xuống sản xuất được.</p>
                    ) : !sxReleased ? (
                      <p className="dhb__td-note">
                        Chờ kế toán thu đủ cọc (chặng “Cọc”) — đủ cọc là đơn tự xuống hàng chờ Kế hoạch sản xuất.
                      </p>
                    ) : (
                      <>
                        <SanXuatTheoMon td={td} baoThieu={baoThieuNguon}
                          onMoLenh={navigate ? (id) => navigate("ke-hoach-sx", { openLsxId: id }) : undefined} />
                        <button
                          type="button"
                          className="link dhb__mono"
                          style={{ color: "var(--rust)", background: "none", border: 0, padding: 0, cursor: "pointer", fontWeight: 600, justifySelf: "start", alignSelf: "flex-start" }}
                          onClick={() => navigate?.("ke-hoach-sx", { openSxOrderId: order.id })}
                        >
                          Mở bàn Kế hoạch sản xuất ↗
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className={khungO("giao")}>
                  <div className="dhb__lifecycle-box">
                    <div className="dhb__lifecycle-box-header">
                      <h4 className="dhb__lifecycle-box-title">Giao hàng</h4>
                      <span className={`dhb__lifecycle-badge ${giaoDone ? "dhb__lifecycle-badge--done" : tt.giaoPct > 0 || tt.soYeuCauMo > 0 ? "dhb__lifecycle-badge--active" : "dhb__lifecycle-badge--upcoming"}`}>
                        {giaoText === "—" ? "CHƯA GIAO" : giaoText.toUpperCase()}
                      </span>
                    </div>
                    <KV k="Hạn giao cam kết" v={<span className="dhb__mono">{fmtDate(order.delivery_committed_date)}</span>} />
                    <BuocGiaoHang order={order} td={td} taiLai={taiTienDo} onIn={setInYc} navigate={navigate} />
                  </div>
                </div>

                <div className={khungO("hoadon")}>
                  <InvoicePanel
                    order={order}
                    book={invoiceBook}
                    loading={invoiceLoading}
                    error={invoiceError}
                    canCreate={canCreateInvoice}
                    canCancel={canCancelInvoice}
                    onChanged={loadInvoices}
                  />
                </div>
                </div>
              </Section>
              {/* Khối ⑤ "Duyệt đơn đặc thù" đã gỡ cùng luồng duyệt. */}
            </>
          )}

          {drawerTab === "commercial" && (
            <>
              {/* ② Thương mại */}
              <Section title="Thương mại (khóa)">
                <KV k="Khách hàng" v={order.customer_name ?? "—"} />
                {order.source_type === "bao_gia" && order.quotation_code && (
                  <KV
                    k="Báo giá"
                    v={
                      <button
                        className="link dhb__mono"
                        style={{ color: "var(--rust)", background: "none", border: 0, cursor: "pointer", padding: 0 }}
                        onClick={() => navigate?.("bao-gia", { openQuoteId: order.quotation_id })}
                      >
                        {order.quotation_code} · v{order.quotation_version} ↗
                      </button>
                    }
                  />
                )}
                <table className="dhb__comm-table">
                  <thead>
                    <tr>
                      <th>Mô tả</th>
                      <th className="dhb__text-right">SL</th>
                      <th className="dhb__text-right">Đơn giá</th>
                      <th className="dhb__text-right">VAT</th>
                      <th className="dhb__text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Khối THƯƠNG MẠI = mặt đối ngoại của đơn → gộp theo nhãn nhóm y như báo giá
                        khách đã nhận (ruột + bìa = 1 quyển). Dòng thật vẫn nguyên ở dưới DB để
                        sản xuất sinh lệnh riêng cho từng phần. */}
                    {gopTheoNhom(order.lines, (l) => ({
                      nhom: l.nhom,
                      ten: l.description,
                      soLuong: l.qty,
                      donViTinh: l.don_vi_tinh || "",
                      dvtNhom: l.dvt_nhom,
                      thanhTien: l.line_total ?? 0,
                      tienVat: 0,
                      vatPct: l.vat_pct_estimate,
                    })).flatMap((g) => {
                      const dongLe = g.goc.length === 1;
                      return [
                        <tr key={g.key} className={dongLe ? undefined : "dhb__comm-nhom"}>
                          <td>
                            {g.ten}
                            {!dongLe && (
                              <span className="dhb__comm-nhomSub">{g.goc.length} phần</span>
                            )}
                          </td>
                          <td className="dhb__mono dhb__text-right">{g.soLuong.toLocaleString("vi-VN")}{g.donViTinh ? ` ${g.donViTinh}` : ""}</td>
                          <td className="dhb__mono dhb__text-right">{vnd(g.donGia)}</td>
                          <td className="dhb__mono dhb__text-right">{g.vatPct === null ? "—" : `${g.vatPct}%`}</td>
                          <td className="dhb__mono dhb__text-right">{vnd(g.thanhTien)}</td>
                        </tr>,
                        // Nhóm thì SỔ ra từng phần (ruột, bìa) — người trong nhà cần thấy đủ,
                        // khách chỉ thấy dòng gộp trên bản in.
                        ...(dongLe
                          ? []
                          : g.goc.map((l, k) => (
                              <tr
                                key={`${g.key}-${l.id}`}
                                className={`dhb__comm-con${k === g.goc.length - 1 ? " dhb__comm-conCuoi" : ""}`}
                              >
                                <td>{l.description}</td>
                                <td className="dhb__mono dhb__text-right">{l.qty.toLocaleString("vi-VN")}{l.don_vi_tinh ? ` ${l.don_vi_tinh}` : ""}</td>
                                <td className="dhb__mono dhb__text-right">{vnd(l.unit_price_snapshot)}</td>
                                <td className="dhb__mono dhb__text-right">{l.vat_pct_estimate}%</td>
                                <td className="dhb__mono dhb__text-right">{vnd(l.line_total)}</td>
                              </tr>
                            ))),
                      ];
                    })}
                  </tbody>
                </table>
                <div className="dhb__summary-box">
                  <KV k="Cộng trước VAT" v={<span className="dhb__mono">{vnd(order.total)}</span>} right />
                  <KV k="Tổng gồm VAT" v={<strong className="dhb__mono" style={{ color: "var(--ink)", fontSize: 14 }}>{vnd(order.total_with_vat)}</strong>} right />
                  {order.margin_pct != null ? (
                    <KV k="Biên lợi nhuận" v={<span className="dhb__mono">{order.margin_pct}% (giá vốn {vnd(order.order_cost)})</span>} right />
                  ) : (
                    <KV k="Biên lợi nhuận" v={<em style={{ color: "var(--ash)" }}>không xác định (nhập tay)</em>} right />
                  )}
                </div>
              </Section>
            </>
          )}

          {drawerTab === "history" && (
            <>
              {/* Chứng cứ khách đồng ý */}
              <Section title="Chứng cứ khách đồng ý">
                {order.consent_attachments.length === 0 && !(isDraft && canUpdate) && (
                  <p style={{ color: "var(--ash)", fontSize: 13, margin: 0 }}>Chưa có.</p>
                )}
                <AttachmentList
                  items={order.consent_attachments}
                  canEdit={isDraft && canUpdate}
                  onUpload={upConsent}
                  onDelete={delConsent}
                  addLabel="Đính kèm chứng cứ (ảnh PO/Zalo…)"
                />
              </Section>

              {/* ⑥ Nhật ký */}
              <Section title="Nhật ký hoạt động">
                {acts.length === 0 && <p style={{ color: "var(--ash)", fontSize: 13, margin: 0 }}>Chưa có.</p>}
                {acts.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, padding: "6px 0", borderTop: i ? "1px solid var(--rule-hair)" : undefined }}>
                    <span className="dhb__mono" style={{ color: "var(--ash-2)", minWidth: 92 }}>{new Date(a.at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span><strong>{a.actor_name ?? "—"}</strong> · {a.detail || a.action}</span>
                  </div>
                ))}
              </Section>
            </>
          )}
        </div>
        {editing && (
          <EditDialog
            order={order}
            onCancel={() => setEditing(false)}
            onSaved={(d) => { setEditing(false); onSaved(d); }}
          />
        )}
        {cancelling && (
          <CancelDialog
            order={order}
            onClose={() => setCancelling(false)}
            onSaved={(d) => { setCancelling(false); onSaved(d); }}
          />
        )}
        {showPrint && <DeliveryNotePrint d={order} onClose={() => setShowPrint(false)} />}
        {inYc && <DeliveryNotePrint d={order} yc={inYc} onClose={() => setInYc(null)} />}
      </aside>
    </div>
  );
}

function InvoicePanel({
  order,
  book,
  loading,
  error,
  canCreate,
  canCancel,
  onChanged,
}: {
  order: OrderDetail;
  book: SalesInvoiceListOut | null;
  loading: boolean;
  error: string | null;
  canCreate: boolean;
  canCancel: boolean;
  onChanged: () => Promise<void>;
}) {
  const { token } = useAuth();
  const today = (() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  })();
  const [showCreate, setShowCreate] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [number, setNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SalesInvoiceRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const issued = book?.items.filter((item) => item.status === "issued") ?? [];
  const outstanding = issued.reduce((sum, item) => sum + item.remaining_amount, 0);
  const stage = !book || book.invoiced_amount <= 0
    ? "none"
    : book.uninvoiced_amount > 0
      ? "partial"
      : "full";
  const stageLabel = stage === "full" ? "ĐÃ GHI ĐỦ" : stage === "partial" ? "ĐÃ GHI MỘT PHẦN" : "CHƯA GHI";
  const depositAlreadyOffset = issued.reduce((sum, item) => sum + item.deposit_offset_amount, 0);
  const depositAvailable = Math.max(0, (book?.deposit_received ?? 0) - depositAlreadyOffset);
  const enteredAmount = Math.max(0, Number(amount || 0));
  const expectedOffset = Math.min(depositAvailable, enteredAmount);
  const expectedDebt = Math.max(0, enteredAmount - expectedOffset);

  useEffect(() => {
    if (!showCreate || !book) return;
    setAmount(String(book.uninvoiced_amount));
    setInvoiceDate(today);
    setFormError(null);
  }, [showCreate, book, today]);

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !book || saving) return;
    if (!symbol.trim() || !number.trim() || !invoiceDate) {
      setFormError("Vui lòng nhập ký hiệu, số hóa đơn và ngày hóa đơn.");
      return;
    }
    if (invoiceDate > today) {
      setFormError("Ngày hóa đơn không được nằm trong tương lai.");
      return;
    }
    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0 || enteredAmount > book.uninvoiced_amount) {
      setFormError(`Giá trị hóa đơn phải từ 1 đến ${vnd(book.uninvoiced_amount)}.`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.accounting.createSalesInvoice(token, {
        order_id: order.id,
        invoice_symbol: symbol.trim(),
        invoice_number: number.trim(),
        invoice_date: invoiceDate,
        amount_vnd: Math.round(enteredAmount),
      });
      setShowCreate(false);
      setSymbol("");
      setNumber("");
      await onChanged();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "Không ghi nhận được hóa đơn.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !cancelTarget || saving) return;
    if (!cancelReason.trim()) {
      setFormError("Vui lòng nhập lý do hủy hóa đơn.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.accounting.cancelSalesInvoice(token, cancelTarget.id, cancelReason.trim());
      setCancelTarget(null);
      setCancelReason("");
      await onChanged();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "Không hủy được hóa đơn.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dhb__lifecycle-box dhb__invoice-panel">
      <div className="dhb__lifecycle-box-header">
        <h4 className="dhb__lifecycle-box-title">Hóa đơn &amp; công nợ</h4>
        <span className={`dhb__lifecycle-badge ${stage === "full" ? "dhb__lifecycle-badge--done" : stage === "partial" ? "dhb__lifecycle-badge--active" : "dhb__lifecycle-badge--upcoming"}`}>
          {stageLabel}
        </span>
      </div>

      {error && <div className="banner banner--error" role="alert">{error}</div>}
      {formError && <div className="banner banner--error" role="alert">{formError}</div>}
      {loading && !book && <EmptyState trangThai="dang-tai" gon nhanTai="Đang tải sổ hóa đơn…" />}

      {book && (
        <>
          <div className="dhb__invoice-metrics">
            <div><span>Tổng đơn</span><strong>{vnd(book.order_total)}</strong></div>
            <div><span>Đã ghi HĐ</span><strong>{vnd(book.invoiced_amount)}</strong></div>
            <div><span>Chưa ghi HĐ</span><strong>{vnd(book.uninvoiced_amount)}</strong></div>
            <div><span>Còn phải thu</span><strong>{vnd(outstanding)}</strong></div>
          </div>

          <div className="dhb__invoice-toolbar">
            <p>Chỉ hóa đơn đã ghi nhận mới phát sinh công nợ phải thu.</p>
            {order.status === "ordered" && canCreate && book.uninvoiced_amount > 0 && !showCreate && (
              <button type="button" className="btn btn--primary" onClick={() => setShowCreate(true)}>
                <Icon name="fileText" size={14} /> Ghi nhận hóa đơn
              </button>
            )}
          </div>

          {showCreate && (
            <form className="dhb__invoice-form" onSubmit={createInvoice}>
              <div className="dhb__invoice-form-grid">
                <label>
                  <span>Ký hiệu <b>*</b></span>
                  <input className="dhb__input" value={symbol} maxLength={64} onChange={(event) => setSymbol(event.target.value)} placeholder="VD: 1C26TSV" autoFocus />
                </label>
                <label>
                  <span>Số hóa đơn <b>*</b></span>
                  <input className="dhb__input" value={number} maxLength={64} onChange={(event) => setNumber(event.target.value)} placeholder="VD: 00001234" />
                </label>
                <label>
                  <span>Ngày hóa đơn <b>*</b></span>
                  <input className="dhb__input" type="date" min={order.ordered_at?.slice(0, 10)} max={today} value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
                </label>
                <label>
                  <span>Giá trị hóa đơn <b>*</b></span>
                  <input className="dhb__input dhb__invoice-money" type="number" min="1" max={book.uninvoiced_amount} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </label>
              </div>
              <div className="dhb__invoice-preview">
                <span>Dự kiến cấn cọc <b>{vnd(expectedOffset)}</b></span>
                <span>Công nợ mới <b>{vnd(expectedDebt)}</b></span>
                <small>Hạn thu được hệ thống tính theo điều khoản công nợ của khách tại ngày ghi hóa đơn.</small>
              </div>
              <div className="dhb__invoice-form-actions">
                <button type="button" className="btn btn--secondary" onClick={() => setShowCreate(false)} disabled={saving}>Hủy</button>
                <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? "Đang lưu..." : "Ghi nhận"}</button>
              </div>
            </form>
          )}

          <div className="dhb__invoice-tablewrap">
            <table className="dhb__invoice-table">
              <thead>
                <tr>
                  <th>Số HĐ</th>
                  <th>Ngày / hạn thu</th>
                  <th>Giá trị</th>
                  <th>Cọc cấn</th>
                  <th>Đã thu</th>
                  <th>Còn nợ</th>
                  <th>Trạng thái</th>
                  {/* Nút Hủy ĐỨNG CỘT RIÊNG: nhét dưới chip trạng thái làm ô đó cao gấp đôi và
                      chữ "Hủy" đỏ trông như một trạng thái thứ hai của hóa đơn. */}
                  <th className="dhb__text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {book.items.length === 0 && <tr><td colSpan={8}>Chưa ghi nhận hóa đơn.</td></tr>}
                {book.items.map((item) => (
                  <tr key={item.id} className={item.status === "cancelled" ? "is-cancelled" : ""}>
                    <td><strong>{item.invoice_symbol ? `${item.invoice_symbol} · ` : ""}{item.invoice_number}</strong><small>{item.created_by_name ?? "—"}</small></td>
                    <td>{fmtDate(item.invoice_date)}<small>Hạn {fmtDate(item.due_date)}</small></td>
                    <td>{vnd(item.amount_vnd)}</td>
                    <td>{vnd(item.deposit_offset_amount)}</td>
                    <td>{vnd(item.direct_received_amount)}</td>
                    <td><strong>{vnd(item.remaining_amount)}</strong></td>
                    <td>
                      <span className={`dhb__invoice-status ${item.status === "issued" ? "is-issued" : "is-cancelled"}`}>
                        {item.status === "issued" ? "Đã ghi" : "Đã hủy"}
                      </span>
                    </td>
                    <td className="dhb__text-right">
                      {/* ĐÃ CÓ PHIẾU THU thì KHÔNG bày nút hủy (chủ 22/08/2026: "đã lập phiếu thu
                          rồi sao lại cho phép hủy hóa đơn"). Máy chủ vốn đã chặn — "Hóa đơn đã có
                          phiếu thu gắn vào; hãy hủy phiếu thu trước" — nên bày nút ở đây chỉ là
                          mời người ta bấm vào một cái báo lỗi.
                          Dùng `direct_received_amount` chứ không phải `received_amount`: cọc cấn
                          trừ gắn với ĐƠN, không phải hóa đơn, nên nó không chặn hủy. */}
                      {item.status === "issued" && canCancel && item.direct_received_amount <= 0 && (
                        <button type="button" className="dhb__invoice-cancel" title="Hủy hóa đơn" onClick={() => { setCancelTarget(item); setCancelReason(""); setFormError(null); }}>
                          Hủy
                        </button>
                      )}
                      {item.status === "issued" && canCancel && item.direct_received_amount > 0 && (
                        <small className="dhb__muted" title="Hủy phiếu thu trước rồi mới hủy được hóa đơn">
                          đã thu — không hủy
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cancelTarget && (
            <form className="dhb__invoice-cancel-form" onSubmit={cancelInvoice}>
              <div>
                <strong>Hủy hóa đơn {cancelTarget.invoice_number}</strong>
                <small>Hóa đơn đã có phiếu thu sẽ không thể hủy. Hãy hủy phiếu thu liên quan trước.</small>
              </div>
              <textarea className="dhb__input" rows={2} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Lý do hủy *" />
              <div className="dhb__invoice-form-actions">
                <button type="button" className="btn btn--secondary" onClick={() => setCancelTarget(null)} disabled={saving}>Đóng</button>
                <button type="submit" className="btn btn--danger" disabled={saving}>{saving ? "Đang hủy..." : "Xác nhận hủy"}</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function CancelDialog({ order, onClose, onSaved }: { order: OrderDetail; onClose: () => void; onSaved: (d: OrderDetail) => void }) {
  const { token } = useAuth();
  const isOrdered = order.status === "ordered";
  const [reason, setReason] = useState("");
  const [fault, setFault] = useState("khach");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      onSaved(await api.orders.cancel(token, order.id, reason, isOrdered ? fault : null));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} className="dhb__modal-overlay" style={{ zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="dhb__modal-content" style={{ width: 440 }}>
        <h3 className="dhb__modal-title" style={{ fontSize: 18 }}>Hủy đơn {order.order_no}</h3>
        <p style={{ color: "var(--ash)", fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          {isOrdered
            ? "Đơn đã chốt — báo giá KHÔNG mở lại; cọc giữ nguyên, hoàn/quyết toán xử lý ngoài hệ thống."
            : "Đơn nháp — hủy xong báo giá vẫn dùng lại được."}
        </p>
        {isOrdered && (
          <Field label="Lỗi tại ai">
            <select value={fault} onChange={(e) => setFault(e.target.value)} className="dhb__select" style={{ width: "100%" }}>
              <option value="khach">Khách hàng</option>
              <option value="xuong">Xưởng in</option>
            </select>
          </Field>
        )}
        <Field label="Lý do hủy">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nêu lý do; nếu đã chốt, kể luôn tình trạng lúc hủy (vd: đã ra kẽm, khách đổi ý)." className="dhb__input" style={{ minHeight: 60, resize: "vertical" }} />
        </Field>
        {err && <div className="banner banner--error">{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>Đóng</button>
          <button className="btn btn--primary" onClick={submit} disabled={busy || !reason.trim()}>{busy ? "Đang hủy…" : "Xác nhận hủy"}</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="dhb__section">
      <h3 className="dhb__section-title">{title}</h3>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </section>
  );
}

// D3: Sale đổi GẤP / lưu ý SX SAU khi đơn đã CHỐT (đơn khóa sửa) → đường hẹp production-hint →
// backend broadcast → bàn Kế hoạch "ting" (badge nhảy). Chỉ 2 field, không đụng phần còn lại của đơn.
function ProductionHintEditor({ order, onSaved }: { order: OrderDetail; onSaved: (d: OrderDetail) => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [isRush, setIsRush] = useState(order.is_rush);
  const [note, setNote] = useState(order.production_note ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = isRush !== order.is_rush || note.trim() !== (order.production_note ?? "");

  async function save() {
    if (!token) return;
    setSaving(true);
    setErr(null);
    try {
      const d = await api.orders.updateProductionHint(token, order.id, {
        is_rush: isRush,
        production_note: note.trim(),
      });
      onSaved(d);
      setSaved(true);
      setOpen(false);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Lưu ý sản xuất (gửi xưởng)">
      {!open ? (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0, flex: 1 }}>
            <Icon name="clipboard" size={15} style={{ color: "var(--ash)", marginTop: 2, flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              {order.is_rush ? <Chip icon="bell" label="GẤP — ƯU TIÊN XƯỞNG" tone="rush" /> : null}
              <span style={{ fontSize: 13, color: order.production_note ? "var(--ink)" : "var(--ash)", lineHeight: 1.45 }}>
                {order.production_note || "Chưa có lưu ý gửi xưởng"}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ height: 28, padding: "2px 10px", fontSize: 12, flex: "none" }}
            onClick={() => { setIsRush(order.is_rush); setNote(order.production_note ?? ""); setSaved(false); setOpen(true); }}
          >
            <Icon name="pencil" size={12} /> Sửa
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={isRush} onChange={(e) => setIsRush(e.target.checked)} />
            <span>Đánh dấu <strong>GẤP</strong> — ưu tiên ở xưởng</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Lưu ý cho xưởng in (vd: in test màu trước, giấy khách ứng…)"
            className="dhb__input"
            style={{ minHeight: 60, resize: "vertical" }}
          />
          {err && <div className="banner banner--error">{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn--ghost" onClick={() => setOpen(false)} disabled={saving}>Đóng</button>
            <button className="btn btn--primary" onClick={save} disabled={saving || !dirty}>
              {saving ? "Đang lưu…" : "Lưu & báo xưởng"}
            </button>
          </div>
        </div>
      )}
      {saved && !open ? (
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--moss, #2f5d3a)" }}>
          Đã cập nhật — bàn kế hoạch nhận ngay.
        </p>
      ) : null}
    </Section>
  );
}

function KV({ k, v, right }: { k: string; v: React.ReactNode; right?: boolean }) {
  return (
    <div className="dhb__kv" style={{ justifyContent: right ? "space-between" : undefined }}>
      <span className="dhb__kv-key" style={{ minWidth: right ? undefined : 150 }}>{k}</span>
      <span className="dhb__kv-val">{v}</span>
    </div>
  );
}

// --- Form sửa đặt-hàng --------------------------------------------------------
// Popup sửa đơn nháp — bấm "Sửa" ở đầu drawer là mở ngay, không phải cuộn tìm form dưới thân.
function EditDialog({ order, onCancel, onSaved }: { order: OrderDetail; onCancel: () => void; onSaved: (d: OrderDetail) => void }) {
  const { token } = useAuth();
  const [po, setPo] = useState(order.customer_po_no ?? "");
  const [date, setDate] = useState(order.delivery_committed_date ?? "");
  const [deliveryNote, setDeliveryNote] = useState(order.delivery_note ?? "");
  const [productionNote, setProductionNote] = useState(order.production_note ?? "");
  const [isRush, setIsRush] = useState(order.is_rush);
  const [depositPct, setDepositPct] = useState(order.deposit_pct != null ? String(order.deposit_pct) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    setSaving(true);
    setErr(null);
    try {
      const d = await api.orders.update(token, order.id, {
        customer_po_no: po || null,
        delivery_committed_date: date || null,
        delivery_note: deliveryNote.trim() || null,
        production_note: productionNote.trim() || null,
        is_rush: isRush,
        deposit_pct: depositPct.trim() === "" ? null : Number(depositPct),
      });
      onSaved(d);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onCancel} className="dhb__modal-overlay" style={{ zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="dhb__modal-content" style={{ width: 480, display: "grid", gap: 8 }}>
      <h3 className="dhb__modal-title" style={{ fontSize: 18, margin: 0 }}>Sửa đơn {order.order_no}</h3>
      <Field label="Số PO khách"><input value={po} onChange={(e) => setPo(e.target.value)} className="dhb__input" /></Field>
      <Field label="% cọc">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={depositPct}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, "");
            setDepositPct(digits === "" ? "" : String(Math.min(100, Number(digits))));
          }}
          placeholder="vd 30"
          className="dhb__input"
        />
      </Field>
      <Field label="Ngày giao cam kết"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="dhb__input" /></Field>
      {/* Địa chỉ giao + người nhận: KẾ THỪA từ báo giá gốc (Sale chọn ở màn Báo giá) — chỉ đọc ở
          đây, không sửa lại được trên đơn. */}
      <Field label="Địa chỉ giao">
        <div className="dhb__pick-echo">{order.delivery_address || "—"}</div>
      </Field>
      <Field label="Người nhận">
        <div className="dhb__pick-echo">
          {[order.delivery_contact_name, order.delivery_contact_phone].filter(Boolean).join(" · ") || "—"}
        </div>
      </Field>
      <Field label="Lưu ý giao hàng"><textarea value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="Dặn tài xế / khâu giao (giờ giao, tầng, gọi trước…)" className="dhb__input" style={{ minHeight: 56, resize: "vertical" }} /></Field>
      <Field label="Lưu ý sản xuất"><textarea value={productionNote} onChange={(e) => setProductionNote(e.target.value)} placeholder="Dặn tổ in / xưởng (canh màu, cấn bế, gia công…)" className="dhb__input" style={{ minHeight: 56, resize: "vertical" }} /></Field>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", userSelect: "none" }}>
        <input type="checkbox" checked={isRush} onChange={(e) => setIsRush(e.target.checked)} /> Hàng gấp (ưu tiên sản xuất)
      </label>
      {/* 3 ô "Bản chất đơn" · "Pháp nhân xuất HĐ" · "MST xuất HĐ" đã gỡ (2026-08-04). */}
      {err && <div className="banner banner--error">{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button className="btn btn--ghost" onClick={onCancel} disabled={saving}>Hủy</button>
        <button className="btn btn--primary" onClick={save} disabled={saving}>{saving ? "Đang lưu…" : "Lưu"}</button>
      </div>
      </div>
    </div>
  );
}

// Modal "Tạo đơn hàng" đã XOÁ: đơn chỉ sinh từ màn Báo giá khi khách chốt.

function ConfirmPanel({ order, canManage, canExtend, onSaved }: { order: OrderDetail; canManage: boolean; canExtend: boolean; onSaved: (d: OrderDetail) => void }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function doConfirm() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      onSaved(await api.orders.confirm(token, order.id));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }
  async function doExtend() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      onSaved(await api.orders.extendQuote(token, order.id));
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {order.can_confirm ? (
        <div style={{ color: "#1f8a52", display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <Icon name="check" size={15} /> Đủ điều kiện chốt
        </div>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {order.confirm_blockers.map((b, i) => (
            <div key={i} style={{ color: "#b4432b", display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <Icon name="x" size={13} /> {b}
            </div>
          ))}
        </div>
      )}
      {order.quote_expired && canExtend && (
        <button className="btn btn--ghost" style={{ justifySelf: "start" }} disabled={busy} onClick={doExtend} title="Đặt lại hạn hiệu lực báo giá nguồn = hôm nay + 30 ngày">
          <Icon name="clock" size={14} /> Gia hạn báo giá (+30 ngày)
        </button>
      )}
      {err && <div className="banner banner--error">{err}</div>}
      {canManage && (
        <button className="btn btn--primary" style={{ justifySelf: "start" }} disabled={busy || !order.can_confirm} onClick={doConfirm}>
          <Icon name="check" size={15} /> Chốt đơn
        </button>
      )}
    </div>
  );
}

// `ApprovalPanel` + `APPROVAL_STATE_META` đã XOÁ cùng luồng duyệt đơn đặc thù.

function DepositForm({ order, onSaved }: { order: OrderDetail; onSaved: (d: OrderDetail) => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, order.deposit_required - order.deposit_received);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // TK công ty NHẬN tiền — xem chú thích cùng ô này ở `OrderDepositQueue`. Hai màn lập CÙNG một
  // phiếu thu cọc, nên thiếu ô ở một bên là phiếu lập từ bên đó không có vết tài khoản.
  const isBank = method === "bank_transfer";
  const [bankAccountId, setBankAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<CompanyBankAccountRow[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  useEffect(() => {
    if (!token || !open) return;
    setLoadingAccounts(true);
    api.accounting
      .companyAccounts(token, true, "receive")
      .then((rows) => setAccounts(rows.filter((r) => r.currency === "VND")))
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [token, open]);

  async function submit() {
    if (!token) return;
    if (isBank && accounts.length > 0 && bankAccountId == null) {
      setErr("Chuyển khoản thì phải chọn tài khoản công ty nhận tiền.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const d = await api.orders.addDepositReceipt(token, order.id, {
        receipt_method: method,
        amount: Number(amount) || 0,
        receipt_date: date || null,
        note: note || null,
        company_bank_account_id: isBank ? bankAccountId : null,
      });
      onSaved(d);
      setOpen(false);
      setAmount("");
      setNote("");
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  const nut = (
    <button className="btn" style={{ marginTop: 8 }} onClick={() => { setAmount(String(remaining)); setErr(null); setOpen(true); }}>
      <Icon name="plus" size={14} /> Lập phiếu thu cọc
    </button>
  );
  if (!open) return nut;
  const soTien = Number(amount) || 0;
  const lyDoKhoa = soTien <= 0 ? "Nhập số tiền thực thu"
    : isBank && accounts.length > 0 && bankAccountId == null ? "Chọn tài khoản công ty nhận tiền"
    : null;
  const conLai = remaining - soTien;
  return (
    <>
    {nut}
    <DetailModal
      kicker="Kế toán"
      title="Lập phiếu thu cọc"
      subtitle={[order.order_no, order.customer_name].filter(Boolean).join(" · ")}
      width={560}
      onClose={() => { if (!saving) setOpen(false); }}
      footer={
        <>
          <span className={`dmodal__foot-note ${lyDoKhoa ? "is-warn" : ""}`}>
            {lyDoKhoa ?? "Bấm lập = đã thu tiền, phiếu thu ghi thẳng sang Kế toán"}
          </span>
          <button className="btn btn--ghost" onClick={() => setOpen(false)} disabled={saving}>Hủy</button>
          <button className="btn btn--primary" onClick={submit} disabled={saving || lyDoKhoa !== null}>
            {saving ? "Đang lập…" : "Lập phiếu thu"}
          </button>
        </>
      }
    >
    <div className="pform">
      <div className="pform__stats">
        <div><span>Cọc quy định</span><strong>{vnd(order.deposit_required)}</strong></div>
        <div><span>Đã thu</span><strong>{vnd(order.deposit_received)}</strong></div>
        <div className="is-due"><span>Còn thiếu</span><strong>{vnd(remaining)}</strong></div>
      </div>

      <div className="pform__grid">
        <label className="pform__field pform__field--full">
          Số tiền thực thu
          <span className="pform__suffix">
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="dhb__input" />
            <span>₫</span>
          </span>
          <span className="pform__hint">
            {soTien > 0 ? `= ${vnd(soTien)}` : "Chưa nhập"}
            {soTien > 0 && (conLai > 0 ? ` · sau phiếu này còn thiếu ${vnd(conLai)}` : conLai < 0 ? ` · thu dư ${vnd(-conLai)} so với phần còn thiếu` : " · thu đủ cọc")}
          </span>
          {remaining > 0 && soTien !== remaining && (
            <button type="button" className="pform__link" onClick={() => setAmount(String(remaining))}>
              Thu đủ phần còn thiếu ({vnd(remaining)})
            </button>
          )}
        </label>
        <label className="pform__field">
          Hình thức thu
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="dhb__select">
            {Object.entries(RECEIPT_METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="pform__field">
          Ngày thu
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="dhb__input" />
          {!date && <span className="pform__hint">Để trống = hôm nay</span>}
        </label>
        {isBank && (
          <label className="pform__field pform__field--full">
            Tài khoản công ty nhận tiền
            <select
              value={bankAccountId ?? ""}
              onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : null)}
              className="dhb__select"
              disabled={loadingAccounts}
            >
              <option value="">Chọn tài khoản công ty</option>
              {accounts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.bank_name} · {row.account_number} · {row.currency}
                </option>
              ))}
            </select>
            {!loadingAccounts && accounts.length === 0 && (
              <span className="pform__hint">Chưa có tài khoản công ty VND nào bật "dùng để thu".</span>
            )}
          </label>
        )}
        <label className="pform__field pform__field--full">
          Ghi chú
          <input value={note} onChange={(e) => setNote(e.target.value)} className="dhb__input" placeholder="Vd: khách chuyển qua Vietcombank, nội dung DH002" />
        </label>
      </div>
      {err && <div className="banner banner--error" style={{ margin: 0 }}>{err}</div>}
    </div>
    </DetailModal>
    </>
  );
}

function AttachmentList({
  items, canEdit, onUpload, onDelete, addLabel,
}: {
  items: { id: number; url: string; file_name: string | null }[];
  canEdit: boolean;
  onUpload: (f: File) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  addLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try { await onUpload(f); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  return (
    <div className="dhb__attachment-list">
      {items.map((a) => (
        <div key={a.id} className="dhb__attachment-item">
          <Icon name="fileText" size={13} style={{ color: "var(--ash)" }} />
          <a href={`${API_BASE}${a.url}`} target="_blank" rel="noreferrer" className="dhb__attachment-link">{a.file_name ?? "tệp"}</a>
          {canEdit && <button className="btn btn--ghost" style={{ height: 24, padding: "2px 6px" }} title="Xóa" onClick={() => onDelete(a.id)}><Icon name="trash" size={11} /></button>}
        </div>
      ))}
      {canEdit && (
        <>
          <input ref={ref} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={pick} />
          <button className="btn btn--ghost" style={{ justifySelf: "start", height: 28, padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={() => ref.current?.click()}>
            <Icon name="plus" size={12} /> {busy ? "Đang tải…" : addLabel}
          </button>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span style={{ display: "block", fontSize: 12, color: "var(--ash)", marginBottom: 3 }}>{label}</span>
      {children}
    </label>
  );
}
