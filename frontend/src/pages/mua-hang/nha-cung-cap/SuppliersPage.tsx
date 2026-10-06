// Màn NHÀ CUNG CẤP — shell (tách từ pages/SuppliersPage.tsx).
// Giữ ở đây: state + `load()`/`loadAll()` + handlers (`taiFile` · `nhapExcel` · `openCreate` ·
// `openEdit` · `closeDrawer` · `setSupplierItem` · `ghiQuyDoiDong` · `save` · `toggle`) + KHUNG
// drawer `supplier-drawer` (đầu · 3 nút tab · <form> · chân) và chỗ mount ba tab.
// ⚠️ Dải lọc `supplier-pills-bar` dưới đây ĐANG BỊ COMMENT — giữ nguyên, kèm cặp `void` phía trên
// (chúng chỉ để TypeScript thôi báo "khai mà không dùng"). Bỏ comment khối JSX là bật lại được.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ApiError,
  api,
  type PurchaseRequestRow,
  type SupplierInput,
  type SupplierItemImportError,
  type SupplierItemInput,
  type SupplierRow,
  type SupplierTongQuan,
} from "../../../api/client";
import { useDebounced } from "../../../utils/useDebounced";
import { useAuth } from "../../../auth/useAuth";
import { useKhiTickDoi } from "../../../hooks/useKhiTickDoi";
import { useCan } from "../../../auth/permissions";
import { Button } from "../../../components/Button";
import { Icon } from "../../../components/Icons";
import { SuppliersTable } from "./components/SuppliersTable";
import { SuppliersToolbar } from "./components/SuppliersToolbar";
import { SupplierHistoryTab } from "./tabs/SupplierHistoryTab";
import { SupplierInfoTab } from "./tabs/SupplierInfoTab";
import { SupplierItemsTab } from "./tabs/SupplierItemsTab";
import { PAGE_SIZE, REQUIRED_SUPPLIER_FIELDS } from "./shared/constants";
import type { LocSaoNcc, SortNcc } from "./shared/types";
import {
  cleanSupplier,
  emptySupplier,
  emptySupplierItem,
  fromSupplier,
  gopVatTu,
} from "./shared/helpers";
import "../../master-data.css";
import "../../purchase.css";

export function SuppliersPage({
  eventTick = 0,
}: {
  eventTick?: number;
}) {
  const { token } = useAuth();
  const can = useCan();
  // Khoá RIÊNG của màn Nhà cung cấp (tách 10/08/2026) — không mượn quyền màn Mua hàng nữa.
  const canCreate = can("nha_cung_cap", "create");
  const canUpdate = can("nha_cung_cap", "update");

  const [tongQuan, setTongQuan] = useState<SupplierTongQuan | null>(null);
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  // SAO ĐÁNH GIÁ (máy tự tính). Cả hai đi thẳng vào tham số API — sắp xếp và lọc chạy ở SERVER,
  // không phải sort tại chỗ: bảng có phân trang, xếp mỗi trang một kiểu thì trang 2 vô nghĩa.
  const [sort, setSort] = useState<SortNcc>("name");
  const [locSao, setLocSao] = useState<LocSaoNcc>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Lỗi TẢI DANH SÁCH — tách hẳn khỏi `error` (lỗi THAO TÁC).
   *
   *  Vì sao phải hai ô nhớ riêng: `error` bị hàng chục handler thao tác ghi vào (huỷ phiếu, ghi
   *  đợt giao, gán hoá đơn, thậm chí trình duyệt chặn cửa sổ in). Nếu ô rỗng của bảng đọc chung
   *  `error` thì chỉ cần bấm "In phiếu" mà bị chặn pop-up là CẢ BẢNG biến mất, thay bằng "Không
   *  đọc được dữ liệu" — dữ liệu còn nguyên trên máy chủ, chỉ là bảng tự xoá mình vì một lỗi in.
   *  Ô này CHỈ được ghi trong `catch` của hàm tải danh sách. */
  const [listError, setListError] = useState<string | null>(null);
  // Ô nhập vẫn bám state gốc (gõ tới đâu hiện tới đó); chỉ lời gọi máy chủ đọc bản đã
  // chậm 300ms — xem `utils/useDebounced`.
  const qDebounced = useDebounced(q);
  const [forbidden, setForbidden] = useState(false);

  // Side Drawer State
  const [mode, setMode] = useState<null | "create" | "edit">(null);
  const [selected, setSelected] = useState<SupplierRow | null>(null);
  const [form, setForm] = useState<SupplierInput>(emptySupplier());
  const [formError, setFormError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "items" | "history">(
    "info",
  );

  // Tab 2 internal item search filter
  const [itemSearchQ, setItemSearchQ] = useState("");

  // Gợi ý tên vật tư gộp-mọi-NCC (`api.suppliers.itemCatalog`) ĐÃ BỎ: ô Tên vật tư giờ chọn từ
  // DANH MỤC GỐC qua `MaterialCombobox`, nên tên không còn cơ hội trượt ("Couche 150" vs
  // "Couché 150") — thứ mà gợi ý kia sinh ra để chữa.
  // Nhập / xuất Excel bảng giá vật tư.
  //
  // File ĐỌC XONG chỉ nạp vào form, CHƯA vào DB — bảng giá được lưu bằng chính cú "Lưu nhà cung
  // cấp". Nhập thẳng DB thì cú lưu form đó (đang giữ danh sách cũ) sẽ xoá mất phần vừa nhập.
  const fileVatTuRef = useRef<HTMLInputElement | null>(null);
  const [nhapDang, setNhapDang] = useState(false);
  const [nhapKetQua, setNhapKetQua] = useState<
    { them: number; capNhat: number; errors: SupplierItemImportError[] } | null
  >(null);

  async function taiFile(lay: () => Promise<string>, ten: string) {
    if (!token) return;
    try {
      const url = await lay();
      const a = document.createElement("a");
      a.href = url;
      a.download = ten;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Không tải được file Excel.",
      );
    }
  }

  async function nhapExcel(file: File) {
    if (!token) return;
    setNhapDang(true);
    setFormError(null);
    try {
      const res = await api.suppliers.itemsImport(token, file);
      const gop = gopVatTu(
        form.items ?? [],
        res.items.map((r) => ({
          item_name: r.item_name,
          unit: r.unit,
          unit_price: r.unit_price,
          vat_percent: r.vat_percent,
          note: r.note,
        })),
      );
      setForm((current) => ({ ...current, items: gop.items }));
      setNhapKetQua({
        them: gop.them,
        capNhat: gop.capNhat,
        errors: res.errors,
      });
    } catch (err) {
      setNhapKetQua(null);
      setFormError(
        err instanceof ApiError ? err.message : "Không đọc được file Excel.",
      );
    } finally {
      setNhapDang(false);
    }
  }

  // Tab 3 Purchase Orders History State
  const [poList, setPoList] = useState<PurchaseRequestRow[]>([]);
  const [poLoading, setPoLoading] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);
  // Tổng số PMH máy chủ đếm — bảng chỉ lấy 50 phiếu mới nhất, số trên tab phải là số THẬT.
  const [poTotal, setPoTotal] = useState(0);

  // Thanh đếm + dải nhóm: đếm ở MÁY CHỦ cho toàn danh mục (`/api/suppliers/tong-quan`). Trước
  // 27/09/2026 là hai lượt danh sách size=500 kéo cả bảng giá về chỉ để đếm — vượt trần size ≤ 200
  // nên bị 422 và lặng lẽ rơi về đếm trên trang hiện tại.
  const loadAll = useCallback(() => {
    if (!token) return;
    api.suppliers
      .tongQuan(token)
      .then(setTongQuan)
      .catch(() => {
        // non-blocking; thanh đếm fallback về trang hiện tại
      });
  }, [token]);

  // Load paginated list with search and filters
  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setListError(null);
    api.suppliers
      .list(token, {
        q: qDebounced.trim() || undefined,
        status: status === "all" ? null : status,
        supplier_group: selectedGroup === "all" ? null : selectedGroup,
        rating_min: locSao,
        sort,
        page,
        size,
      })
      .then((res) => {
        setRows(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.isForbidden) setForbidden(true);
        else setListError("Không tải được danh sách nhà cung cấp.");
      })
      .finally(() => setLoading(false));
  }, [token, qDebounced, status, selectedGroup, locSao, sort, page, size]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    load();
  }, [load]);

  useKhiTickDoi(eventTick, () => {
    loadAll();
    load();
  });

  // Dynamic Supplier Group Pills — chỉ lấy từ data thực, KHÔNG hardcode
  const groupPills = useMemo(() => {
    if (tongQuan) {
      return tongQuan.nhom
        .map((n) => ({ group: n.supplier_group, count: n.so_ncc }))
        .sort((a, b) => a.group.localeCompare(b.group, "vi"));
    }
    const fromData = Array.from(
      new Set(rows.map((s) => s.supplier_group).filter(Boolean)),
    ) as string[];
    fromData.sort((a, b) => a.localeCompare(b, "vi"));
    return fromData.map((grp) => ({
      group: grp,
      count: rows.filter((s) => s.supplier_group === grp).length,
    }));
  }, [tongQuan, rows]);

  // Dải pill lọc theo nhóm ngành hàng NCC (lấy từ dữ liệu thực).

  // Metric stats — fallback về trang hiện tại khi tổng quan chưa tải xong
  const stats = useMemo(() => {
    if (tongQuan) {
      return {
        totalCount: tongQuan.tong,
        activeCount: tongQuan.dang_hop_tac,
        inactiveCount: tongQuan.tam_ngung,
      };
    }
    return {
      totalCount: total,
      activeCount: rows.filter((s) => s.status === "active").length,
      inactiveCount: rows.filter((s) => s.status === "inactive").length,
    };
  }, [tongQuan, rows, total]);

  // Lịch sử PMH của NCC đang mở — nạp NGAY khi mở drawer, MỘT lần cho mỗi NCC (theo `id`).
  // Trước 27/09/2026 chỉ nạp khi bấm vào tab và nạp lại MỖI lần quay lại tab ⇒ lần nào cũng thấy
  // vòng "đang tải" rồi bảng mới hiện; số trên tab lại là `poList.length` không được xoá ⇒ mở NCC
  // khác vẫn hiện số của NCC trước cho tới khi bấm vào tab.
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    setPoList([]);
    setPoTotal(0);
    setPoError(null);
    if (selectedId == null || !token) {
      setPoLoading(false);
      return;
    }
    let alive = true;
    setPoLoading(true);
    api.purchaseRequests
      .list(token, { supplier_id: selectedId, size: 50 })
      .then((res) => {
        if (!alive) return;
        setPoList(res.items);
        setPoTotal(res.total);
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError) setPoError(err.message);
        else setPoError("Không tải được lịch sử mua hàng của nhà cung cấp này.");
      })
      .finally(() => {
        if (alive) setPoLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId, token]);

  function openCreate() {
    setSelected(null);
    setForm(emptySupplier());
    setFormError(null);
    // Hệ số theo CHỈ SỐ dòng của NCC trước — không xoá là dòng i của NCC mới mượn số của NCC cũ.
    setQuyDoiDong({});
    setActiveTab("info");
    setItemSearchQ("");
    setNhapKetQua(null);
    setPoList([]);
    setMode("create");
  }

  function openEdit(row: SupplierRow, initialTab: "info" | "items" | "history" = "info") {
    setSelected(row);
    setForm(fromSupplier(row));
    setFormError(null);
    // Hệ số theo CHỈ SỐ dòng của NCC trước — không xoá là dòng i của NCC mới mượn số của NCC cũ.
    setQuyDoiDong({});
    setActiveTab(initialTab);
    setItemSearchQ("");
    setNhapKetQua(null);
    setPoList([]);
    setMode("edit");
  }

  function closeDrawer() {
    setMode(null);
    setSelected(null);
    setNhapKetQua(null);
  }

  function setSupplierItem(index: number, patch: Partial<SupplierItemInput>) {
    setForm((current) => ({
      ...current,
      items: (current.items ?? [emptySupplierItem()]).map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  // Hệ số quy đổi về đơn vị gốc của TỪNG DÒNG bảng giá (server trả theo mặt hàng + đơn vị đã
  // chọn). Chỉ để HIỂN THỊ cột "Quy về gốc" — không lưu, không gửi lên: hệ số là dữ liệu sống,
  // đóng băng nó vào bảng giá NCC là mời sai số vào giữa việc so giá.
  //
  // Gỡ 28/08 khi ĐVT còn bị khoá (cột đó luôn bằng đơn giá), trả lại 29/08 khi mở khoá ĐVT.
  const [quyDoiDong, setQuyDoiDong] = useState<
    Record<number, { donViGocTen: string; heSoVeGoc: number } | null>
  >({});

  function ghiQuyDoiDong(
    index: number,
    info: { donViGocTen: string; heSoVeGoc: number } | null,
  ) {
    setQuyDoiDong((cur) =>
      cur[index]?.donViGocTen === info?.donViGocTen &&
      cur[index]?.heSoVeGoc === info?.heSoVeGoc
        ? cur
        : { ...cur, [index]: info },
    );
  }


  async function save(e: FormEvent) {
    e.preventDefault();
    if (!token || saving) return;
    const payload = cleanSupplier(form);
    const missing = REQUIRED_SUPPLIER_FIELDS.filter(
      ([key]) => !String(payload[key] ?? "").trim(),
    ).map(([, label]) => label);
    if (missing.length > 0) {
      setFormError(`Vui lòng nhập đầy đủ: ${missing.join(", ")}.`);
      setActiveTab("info");
      return;
    }
    // Điện thoại 10 số · email có @ (chủ chốt 15/08/2026). Chặn Ở ĐÂY chỉ để báo SỚM và trỏ đúng
    // ô sai — luật thật nằm ở `_clean_supplier_values` bên máy chủ, gọi thẳng API vẫn bị chặn.
    const soDT = String(payload.phone ?? "").replace(/[\s.\-()]/g, "");
    if (!/^\d{10}$/.test(soDT)) {
      setFormError(
        `Số điện thoại phải đủ 10 chữ số (ví dụ 0901234567) — đang nhập ${soDT.length} số.`,
      );
      setActiveTab("info");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(payload.email ?? "").trim())) {
      setFormError(
        "Email phải có dạng ten@tencongty.vn — thiếu @ hoặc thiếu phần đuôi thì thư gửi đi không tới nơi.",
      );
      setActiveTab("info");
      return;
    }
    if (
      (payload.items ?? []).some(
        (item) => !item.item_name || !item.unit || item.unit_price <= 0,
      )
    ) {
      setFormError(
        "Mỗi mặt hàng nhà cung cấp cần nhập đủ tên, ĐVT và đơn giá lớn hơn 0.",
      );
      setActiveTab("items");
      return;
    }
    if (
      (payload.items ?? []).some(
        (item) => (item.vat_percent ?? 0) < 0 || (item.vat_percent ?? 0) > 100,
      )
    ) {
      setFormError("VAT mặt hàng nhà cung cấp phải từ 0 đến 100.");
      setActiveTab("items");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (mode === "edit" && selected) {
        await api.suppliers.update(token, selected.id, payload);
      } else {
        await api.suppliers.create(token, payload);
      }
      closeDrawer();
      loadAll();
      load();
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
      else setFormError("Không lưu được nhà cung cấp.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(row: SupplierRow) {
    if (!token || !canUpdate) return;
    try {
      await api.suppliers.toggleActive(token, row.id);
      // Drawer đang mở CÙNG NCC này thì lật trạng thái tại chỗ luôn — badge ở đầu drawer +
      // nhãn nút phải đổi NGAY, không chờ `load()` (nút này nay nằm TRONG bản ghi).
      setSelected((cur) =>
        cur && cur.id === row.id
          ? { ...cur, status: cur.status === "active" ? "inactive" : "active" }
          : cur,
      );
      loadAll();
      load();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Không đổi được trạng thái nhà cung cấp.");
    }
  }

  if (forbidden) {
    return (
      <main className="md-page">
        <div className="banner banner--error" role="alert">
          Bạn không có quyền truy cập Nhà cung cấp (403).
        </div>
      </main>
    );
  }

  // Đổi cỡ trang thì trang đang đứng có thể không còn tồn tại — về trang 1.
  const doiCoTrang = (n: number) => {
    setSize(n);
    setPage(1);
  };

  // Items displayed in Tab 2 with internal search filter
  const itemsInForm = form.items ?? [emptySupplierItem()];
  const filteredFormItems = itemsInForm
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => {
      if (!itemSearchQ.trim()) return true;
      const qLower = itemSearchQ.trim().toLowerCase();
      return (
        item.item_name.toLowerCase().includes(qLower) ||
        item.unit.toLowerCase().includes(qLower) ||
        (item.note ?? "").toLowerCase().includes(qLower)
      );
    });

  return (
    <main className="md-page">
      <SuppliersToolbar
        q={q}
        setQ={setQ}
        status={status}
        setStatus={setStatus}
        locSao={locSao}
        setLocSao={setLocSao}
        setPage={setPage}
        load={load}
        canCreate={canCreate}
        openCreate={openCreate}
        stats={stats}
      />

      {/* Lọc nhanh theo nhóm NCC. Nhóm lấy từ dữ liệu thật (`groupPills`), chưa nhóm nào được đặt
          thì cả dải tự ẩn — không bày ô lọc rỗng. Lọc chạy ở SERVER qua `supplier_group`. */}
      {groupPills.length > 0 && (
        <div className="supplier-pills-bar">
          <button
            type="button"
            className={`supplier-pill${selectedGroup === "all" ? " supplier-pill--active" : ""}`}
            onClick={() => {
              setSelectedGroup("all");
              setPage(1);
            }}
          >
            Tất cả
            <span className="supplier-pill__count">
              {tongQuan?.tong ?? rows.length}
            </span>
          </button>
          {groupPills.map((p) => (
            <button
              key={p.group}
              type="button"
              className={`supplier-pill${selectedGroup === p.group ? " supplier-pill--active" : ""}`}
              onClick={() => {
                setSelectedGroup(p.group);
                setPage(1);
              }}
            >
              {p.group}
              <span className="supplier-pill__count">{p.count}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}

      <SuppliersTable
        loading={loading}
        listError={listError}
        load={load}
        rows={rows}
        canUpdate={canUpdate}
        openEdit={openEdit}
        sort={sort}
        setSort={setSort}
        total={total}
        page={page}
        setPage={setPage}
        size={size}
        onSize={doiCoTrang}
      />

      {/* Full Height Side Drawer (Replaces centered modal dialog) */}
      {mode && (
        <div
          className="supplier-drawer-overlay"
          role="presentation"
          onClick={closeDrawer}
        >
          <div
            className="supplier-drawer"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="supplier-drawer__head">
              <div className="supplier-drawer__head-info">
                <h2>
                  {mode === "edit"
                    ? `Chi tiết NCC: ${selected?.name}`
                    : "Thêm nhà cung cấp mới"}
                </h2>
                {selected && (
                  <span
                    className={`supplier__status-pill ${
                      selected.status === "active"
                        ? "supplier__status-pill--active"
                        : "supplier__status-pill--inactive"
                    }`}
                  >
                    <span
                      className={`supplier__status-dot ${
                        selected.status === "active"
                          ? "supplier__status-dot--active"
                          : "supplier__status-dot--inactive"
                      }`}
                    />
                    {selected.status === "active" ? "Hoạt động" : "Tạm ngừng"}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="md-page__close"
                onClick={closeDrawer}
                title="Đóng cửa sổ"
              >
                ×
              </button>
            </div>

            {/* Drawer 3-Tab Stepper */}
            <div className="supplier-drawer__tabs">
              <button
                type="button"
                className={`supplier-drawer__tab ${
                  activeTab === "info" ? "supplier-drawer__tab--active" : ""
                }`}
                onClick={() => setActiveTab("info")}
              >
                1. Thông tin chung
              </button>

              <button
                type="button"
                className={`supplier-drawer__tab ${
                  activeTab === "items" ? "supplier-drawer__tab--active" : ""
                }`}
                onClick={() => setActiveTab("items")}
              >
                2. Bảng giá vật tư
                {itemsInForm.length > 0 && (
                  <span className="supplier-tab-count">
                    {itemsInForm.length}
                  </span>
                )}
              </button>

              {mode === "edit" && (
                <button
                  type="button"
                  className={`supplier-drawer__tab ${
                    activeTab === "history"
                      ? "supplier-drawer__tab--active"
                      : ""
                  }`}
                  onClick={() => setActiveTab("history")}
                >
                  3. Lịch sử mua hàng
                  {poTotal > 0 && (
                    <span className="supplier-tab-count" style={{ background: "#2563eb" }}>
                      {poTotal}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Drawer Form Content */}
            <form
              style={{
                display: "flex",
                flexDirection: "column",
                height: "calc(100% - 120px)",
              }}
              onSubmit={save}
            >
              <div className="supplier-drawer__body">
                {formError && (
                  <div className="banner banner--error" role="alert">
                    {formError}
                  </div>
                )}

                {/* TAB 1: Thông tin chung & Pháp lý */}
                {activeTab === "info" && (
                  <SupplierInfoTab
                    form={form}
                    setForm={setForm}
                    selected={mode === "edit" ? selected : null}
                  />
                )}

                {/* TAB 2: Bảng giá mặt hàng vật tư */}
                {activeTab === "items" && (
                  <SupplierItemsTab
                    mode={mode}
                    selected={selected}
                    setForm={setForm}
                    itemsInForm={itemsInForm}
                    filteredFormItems={filteredFormItems}
                    itemSearchQ={itemSearchQ}
                    setItemSearchQ={setItemSearchQ}
                    setSupplierItem={setSupplierItem}
                    quyDoiDong={quyDoiDong}
                    ghiQuyDoiDong={ghiQuyDoiDong}
                    fileVatTuRef={fileVatTuRef}
                    nhapDang={nhapDang}
                    nhapKetQua={nhapKetQua}
                    setNhapKetQua={setNhapKetQua}
                    nhapExcel={nhapExcel}
                    taiFile={taiFile}
                  />
                )}

                {/* TAB 3: Lịch sử Mua hàng (PMH) */}
                {activeTab === "history" && (
                  <SupplierHistoryTab
                    mode={mode}
                    selected={selected}
                    poList={poList}
                    poTotal={poTotal}
                    poLoading={poLoading}
                    poError={poError}
                  />
                )}
              </div>

              {/* Drawer Footer Actions — thao tác ĐỔI TRẠNG THÁI (trước ở cột "Thao tác" ngoài
                  bảng) nay nằm TRONG bản ghi: chỉ hiện khi đang sửa một NCC có sẵn, đẩy sang
                  TRÁI (`marginRight:auto`) tách khỏi cặp Hủy/Lưu. `type="button"` vì nằm trong
                  <form> — không được submit. Nhãn/icon + màu `danger` đổi theo trạng thái: Ngừng
                  hợp tác cắt NCC khỏi mọi ô chọn phiếu mua nên phải đỏ; Mở lại thì không. */}
              <div className="supplier-drawer__foot">
                {mode === "edit" && selected && (
                  <Button
                    type="button"
                    variant={selected.status === "active" ? "danger" : "ghost"}
                    onClick={() => toggle(selected)}
                    disabled={saving}
                    style={{ marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Icon name={selected.status === "active" ? "ban" : "check"} size={16} />
                    {selected.status === "active" ? "Ngừng hợp tác" : "Mở lại hợp tác"}
                  </Button>
                )}
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={closeDrawer}
                  disabled={saving}
                >
                  Hủy
                </button>
                <Button type="submit" variant="accent" loading={saving}>
                  Lưu nhà cung cấp
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
