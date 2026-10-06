// Màn ĐƠN MUA HÀNG (Kế toán) — shell (tách từ pages/AccountingPurchaseInboxPage.tsx).
// Giữ ở đây: state + `load()` + effects + `approve()`/`reject()` +
// `closeDetailThen()` + `actions()` (closure trên quyền & busy, drawer nhận làm prop).
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  api,
  type PaymentVoucherRow,
  type PurchaseRequestRow,
  type SupplierCredit,
} from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { useCan } from "../../../auth/permissions";
import type { NavigateFn } from "../../../components/AppShell";
import { PaymentVoucherDialog } from "../phieu-chi/PaymentVoucherDialog";
import { InboxDrawer } from "./components/InboxDrawer";
import { InboxRowActions } from "./components/InboxRowActions";
import { InboxTable } from "./components/InboxTable";
import { InboxToolbar } from "./components/InboxToolbar";
import { RejectModal } from "./modals/RejectModal";
import { useNapTenDonVi } from "../../tenDonVi";
import { PAGE_SIZE } from "./shared/constants";
import {
  LOC_MAN_DON_MUA_TRONG,
  MAN_DON_MUA,
  locManDonMuaLenUrl,
  locManDonMuaTuUrl,
  thamSoLocDonMua,
  useDieuKienDonMua,
  type LocManDonMua,
} from "./shared/dieuKienDonMua";
import { thamSoKy } from "../../thanh-loc/ky-danh-sach";
import { useLocMan } from "../../thanh-loc/useLocMan";
import "../../master-data.css";
import "../../accounting.css";
import "../../purchase.css";

export function AccountingPurchaseInboxPage({
  navigate,
  eventTick = 0,
  focusRequestCode,
  onDataRefreshed,
}: {
  navigate: NavigateFn;
  eventTick?: number;
  /** Mã PMH cần mở sẵn — màn Công nợ phải trả nhảy sang đây để lập phiếu chi cho đúng đơn đó.
      Không có nó thì bấm "Lập phiếu chi" chỉ đổ ra danh sách trắng, người dùng phải tự đi tìm. */
  focusRequestCode?: string | null;
  onDataRefreshed?: () => void;
}) {
  const { token } = useAuth();
  const can = useCan();
  // Nạp danh mục Đơn vị MỘT lần cho cả phiên: bảng dòng hàng và bảng đợt giao hiện TÊN đơn vị
  // ("cái", "tờ") chứ không phải mã (`cai`, `to`). Thiếu dòng này thì `tenDonVi()` luôn rỗng và
  // hai bảng đó lặng lẽ rơi về mã trần — không lỗi, chỉ xấu.
  useNapTenDonVi();
  // DUYỆT đơn mua = quyết định CHI TIỀN ⇒ gác bằng `thu_mua:approve`, KHÔNG phải `ke_toan:approve`.
  // Sáng 04/08/2026 đã gỡ ô này khỏi bộ phận Mua hàng nên giờ chỉ giám đốc và người được trao
  // quyền còn. Để `ke_toan:approve` thì kế toán tự duyệt khoản chi rồi tự viết phiếu chi — đúng
  // lỗi tách vai vừa vá bên thu mua.
  // Ô này DỜI sang khoá `ke_toan` ngày 11/08/2026 (nút Duyệt / Từ chối chỉ có ở màn này nên ô
  // quyền cũng về đây). Lần dời trước sửa máy chủ mà QUÊN dòng này ⇒ quản trị tick ô mới, giao
  // diện vẫn hỏi ô cũ, nút không hiện — "cấp quyền rồi mà không thấy nút".
  const canApprove = can("ke_toan", "approve");
  // LẬP PHIẾU CHI là việc của kế toán — quyền khác hẳn quyền duyệt. Kế toán không có quyền duyệt
  // vẫn thấy đủ danh sách và trạng thái, chỉ không thấy nút Duyệt.
  // Nút "Lập phiếu chi" ⇒ quyền LẬP trên màn Phiếu chi. Trước đây hỏi `ke_toan:approve` —
  // cùng một ô với "gán chứng từ" và "lập phiếu thu", bật một cái là mở cả ba.
  const canCreateVoucher = can("phieu_chi", "create");
  // Mã YCMH chỉ bấm được khi có ô Xem của màn đó — không thì bấm vào là ăn màn chặn.
  const openYcmh = can("yeu_cau_mua_hang", "read")
    ? (code: string) => navigate("yeu-cau-mua-hang", { focusRequestCode: code })
    : undefined;
  const [rows, setRows] = useState<PurchaseRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);
  const [q, setQ] = useState(focusRequestCode ?? "");
  // Mới vào hiện TẤT CẢ (chủ 04/08/2026). Trước đây mặc định lọc "chờ duyệt" nên mở màn ra là
  // giấu mất đơn đã duyệt, đã mua, đã nhận — kế toán tưởng chưa có gì để lập phiếu chi.
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // Kỳ + điều kiện (Nhà cung cấp, Tiền cọc) — ghi lên URL, nhớ theo màn; đổi là về trang 1.
  const [locMan, setLocManGoc] = useLocMan(MAN_DON_MUA, LOC_MAN_DON_MUA_TRONG, locManDonMuaTuUrl, locManDonMuaLenUrl);
  const setLocMan = (t: LocManDonMua) => {
    setLocManGoc(t);
    setPage(1);
  };
  const dieuKien = useDieuKienDonMua();
  const khoaLoc = JSON.stringify({ ...thamSoKy(locMan.ky), ...thamSoLocDonMua(locMan.loc) });
  const [demTheoTab, setDemTheoTab] = useState<Record<string, number> | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voucherMode, setVoucherMode] = useState<null | {
    purchase: PurchaseRequestRow;
  }>(null);
  const [rejecting, setRejecting] = useState<PurchaseRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api.accounting
      .inbox(token, {
        q: q.trim() || undefined,
        status: statusFilter === "all" ? null : statusFilter,
        ...(JSON.parse(khoaLoc) as { tu_ngay?: string; den_ngay?: string; moc?: string; supplier_id?: number; deposit_status?: string }),
        sort: "-created_at",
        page,
        size,
      })
      .then((response) => {
        setRows(response.items);
        setTotal(response.total);
        setDemTheoTab(response.dem_theo_tab ?? null);
        setSelectedId((current) =>
          current != null && response.items.some((row) => row.id === current)
            ? current
            : null,
        );
        onDataRefreshed?.();
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Không tải được yêu cầu Kế toán.",
        ),
      )
      .finally(() => setLoading(false));
  }, [
    token,
    q,
    statusFilter,
    khoaLoc,
    page,
    size,
    onDataRefreshed,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (eventTick <= 0) return;
    load();
  }, [eventTick, load]);

  // Sang màn này từ nơi khác kèm mã PMH ⇒ nhét luôn vào ô tìm, bỏ kỳ + điều kiện đang nhớ (đơn có thể
  // đã tạo từ lâu) và về trang 1.
  useEffect(() => {
    if (!focusRequestCode) return;
    setQ(focusRequestCode);
    setStatusFilter("all");
    setLocManGoc(LOC_MAN_DON_MUA_TRONG);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequestCode]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  // Drawer chi tiết đơn: Esc để đóng (trước đây do DetailModal lo, nay drawer tự nghe).
  useEffect(() => {
    if (selectedId == null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const [vouchers, setVouchers] = useState<PaymentVoucherRow[]>([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);

  useEffect(() => {
    if (!token || selected == null) {
      setVouchers([]);
      setVouchersLoading(false);
      return;
    }
    let ignore = false;
    setVouchersLoading(true);
    api.accounting
      .vouchers(token, {
        purchase_request_id: selected.id,
        sort: "-created_at",
        page: 1,
        size: 50,
      })
      .then((data) => {
        if (!ignore) setVouchers(data.items);
      })
      .catch(() => {
        if (!ignore) setVouchers([]);
      })
      .finally(() => {
        if (!ignore) setVouchersLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [token, selected, eventTick]);

  // HẠN MỨC CÔNG NỢ của NCC trên đơn đang mở — CẢNH BÁO MỀM (Đ6): chỉ nhắc, KHÔNG chặn duyệt.
  // Chặn cứng ở đây là đúng lúc gấp nhất (hết giấy, phải mua ngay) thì hệ khoá đường mua.
  // Gọi riêng chứ không nhét vào danh sách: một lần một đơn, chỉ khi người ta thật sự mở ra xem.
  const [credit, setCredit] = useState<SupplierCredit | null>(null);
  useEffect(() => {
    if (!token || selected == null) {
      setCredit(null);
      return;
    }
    let bo = false;
    api.purchaseRequests
      .supplierCredit(token, selected.id)
      .then((data) => {
        if (!bo) setCredit(data);
      })
      // Nuốt lỗi có chủ đích: đây là cảnh báo phụ, hỏng nó không được chặn màn chi tiết.
      .catch(() => {
        if (!bo) setCredit(null);
      });
    return () => {
      bo = true;
    };
  }, [token, selected]);

  // Đổi cỡ trang thì trang đang đứng có thể không còn tồn tại — về trang 1.
  const doiCoTrang = (n: number) => {
    setSize(n);
    setPage(1);
  };
  /** Đóng popup rồi mới mở form — không chồng hai lớp cửa sổ. */
  function closeDetailThen(action: () => void) {
    setSelectedId(null);
    action();
  }

  /** DUYỆT đơn mua — một bước riêng, không kèm lập phiếu chi.
   *
   * Gọi thẳng API của Thu mua (`/purchase-requests/{id}/approve`) chứ không đẻ endpoint kế toán
   * riêng: thứ đang duyệt là PHIẾU MUA, chỉ khác chỗ đứng bấm — một đường duy nhất thì luật
   * trạng thái và nhật ký cũng chỉ có một chỗ để sai. Người lập TỰ DUYỆT được phiếu của mình
   * (chủ chốt 20/09/2026); ai bấm được nút này là do phân quyền quyết. */
  async function approve(row: PurchaseRequestRow) {
    if (!token) return;
    setBusy(`approve-${row.id}`);
    setError(null);
    try {
      await api.purchaseRequests.approve(token, row.id);
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Không duyệt được đơn mua hàng.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!token || !rejecting) return;
    if (!rejectReason.trim()) {
      setError("Vui lòng nhập lý do từ chối.");
      return;
    }
    setBusy(`reject:${rejecting.id}`);
    try {
      await api.purchaseRequests.reject(
        token,
        rejecting.id,
        rejectReason.trim(),
      );
      setRejecting(null);
      setRejectReason("");
      load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Không từ chối được đơn mua hàng.",
      );
    } finally {
      setBusy(null);
    }
  }

  function actions(row: PurchaseRequestRow, compact = false) {
    // Gọi THẲNG hàm component (không qua JSX `<InboxRowActions .../>`) để `null` mà
    // InboxRowActions trả về (không còn thao tác nào khả dụng) truyền được ra ngoài —
    // JSX luôn tạo ra một element object có giá trị "truthy", nên bọc qua JSX sẽ làm
    // `actions(selected)` không bao giờ falsy dù bên trong render null. InboxRowActions
    // không dùng Hook nào nên gọi trực tiếp là an toàn.
    return InboxRowActions({
      row,
      compact,
      canApprove,
      canCreateVoucher,
      busy,
      closeDetailThen,
      approve,
      setRejecting,
      setRejectReason,
      setVoucherMode,
    });
  }

  return (
    <main className="md-page acct-dmh">
      <header className="md-page__head" style={{ marginBottom: "var(--sp-3)" }}>
        {/* Tên cũ "Yêu cầu mua hàng" SAI: màn này hiển thị PHIẾU MUA HÀNG (PMH), không phải YCMH. */}
        <h1 className="md-page__title">Đơn mua hàng</h1>
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}

      <InboxToolbar
        q={q}
        setQ={setQ}
        setPage={setPage}
        load={load}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        demTheoTab={demTheoTab}
        ky={locMan.ky}
        onKy={(ky) => setLocMan({ ...locMan, ky })}
        dieuKien={dieuKien}
        loc={locMan.loc}
        onLoc={(loc) => setLocMan({ ...locMan, loc })}
      />

      <InboxTable
        loading={loading}
        rows={rows}
        selected={selected}
        setSelectedId={setSelectedId}
        openYcmh={openYcmh}
        total={total}
        page={page}
        setPage={setPage}
        size={size}
        onSize={doiCoTrang}
      />

      {selected && (
        <InboxDrawer
          selected={selected}
          setSelectedId={setSelectedId}
          vouchers={vouchers}
          vouchersLoading={vouchersLoading}
          credit={credit}
          openYcmh={openYcmh}
          actions={actions}
        />
      )}

      {voucherMode && (
        <PaymentVoucherDialog
          purchase={voucherMode.purchase}
          onClose={() => setVoucherMode(null)}
          onSaved={() => {
            setVoucherMode(null);
            load();
          }}
        />
      )}

      {rejecting && (
        <RejectModal
          rejecting={rejecting}
          setRejecting={setRejecting}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          busy={busy}
          reject={reject}
        />
      )}
    </main>
  );
}
