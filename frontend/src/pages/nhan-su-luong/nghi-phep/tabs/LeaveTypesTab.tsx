// Tab "Loại nghỉ" (HR) (tách từ pages/NghiPhepPage.tsx).
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, type LeaveType } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { EmptyState } from "../../../../components/EmptyState";
import { PhanTrangDayDu } from "../../../../components/PhanTrangDayDu";
import { RowActionButton } from "../../../../components/RowActionButton";
import { ChipTT, LocNhanhTrangThai } from "../../../../components/LuoiDs";
import { Plus } from "lucide-react";
import { LeaveTypeForm } from "../modals/LeaveTypeForm";
import { PAGE_SIZE } from "../shared/constants";
import { errMsg } from "../shared/helpers";

// --- Tab: Loại nghỉ (HR) ----------------------------------------------------

export function LeaveTypesTab({ token, dau }: {
  token: string;
  /** Hàng đầu màn do trang dựng; phần này chỉ gài nút chính vào bên phải. */
  dau: (phai?: ReactNode) => ReactNode;
}) {
  const [items, setItems] = useState<LeaveType[] | null>(null);
  const [editing, setEditing] = useState<LeaveType | "new" | null>(null);
  /** Lọc nhanh theo chế độ lương — thay ba thẻ số cũ; danh mục ngắn nên lọc ở client. */
  const [locLuong, setLocLuong] = useState<"" | "paid" | "unpaid">("");
  /** Trang của danh mục — cắt ở CLIENT (endpoint `/types` còn nuôi 2 dropdown, xem `PAGE_SIZE`). */
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZE);

  const [loading, setLoading] = useState(true);
  /** Lỗi TẢI danh mục. `toggleActive`/`handleDelete` báo lỗi bằng alert nên không đụng ô này —
   *  đúng ý: một lần xoá hỏng không được phép làm cả danh mục biến mất. */
  const [listError, setListError] = useState<string | null>(null);
  // C16 (08/09/2026): đổi cờ có-lương của loại nghỉ chạm đơn đã duyệt ở kỳ chưa chốt công.
  const [canhBao, setCanhBao] = useState<string | null>(null);
  const load = useCallback(() => {
    setLoading(true);
    setListError(null);
    api.leaves.types(token)
      .then((r) => setItems(r.items))
      .catch((e) => { setItems([]); setListError(errMsg(e)); })
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function toggleActive(t: LeaveType) {
    try {
      await api.leaves.updateType(token, t.id, {
        name: t.name,
        is_paid: t.is_paid,
        annual_quota: t.annual_quota,
        note: t.note,
        is_active: !t.is_active,
      });
      load();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  async function handleDelete(t: LeaveType) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa loại nghỉ "${t.name}" không?`)) return;
    try {
      await api.leaves.deleteType(token, t.id);
      load();
    } catch (e) {
      alert(errMsg(e));
    }
  }

  // Số trên hàng lọc nhanh tính trên TOÀN BỘ danh mục, không phải trang đang xem.
  const paidTypes = items?.filter((t) => t.is_paid).length ?? 0;
  const unpaidTypes = items?.filter((t) => !t.is_paid).length ?? 0;
  const loc = (items ?? []).filter((t) => (locLuong === "paid" ? t.is_paid : locLuong === "unpaid" ? !t.is_paid : true));

  const totalTypes = loc.length;
  const totalPages = Math.max(1, Math.ceil(totalTypes / size));
  const pageSafe = Math.min(page, totalPages);
  const pagedTypes = loc.slice((pageSafe - 1) * size, pageSafe * size);

  return (
    <>
    {/* Hành động chính DUY NHẤT của phần → cam, gài lên hàng đầu màn. */}
    {dau(
      <Button variant="accent" onClick={() => setEditing("new")}>
        <Plus size={16} />
        <span>Thêm loại nghỉ mới</span>
      </Button>,
    )}
    <div className="cc-leave-types-wrapper lds">
      {canhBao && (
        <div className="banner banner--warn">
          {canhBao}{" "}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCanhBao(null)}>
            Đã hiểu
          </button>
        </div>
      )}
      {loading ? (
        <EmptyState trangThai="dang-tai" />
      ) : listError ? (
        <EmptyState trangThai="loi" loi={listError} onThuLai={load} />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="Chưa khai loại nghỉ nào"
          sub="Bấm “Thêm loại nghỉ mới” để khai phép năm, nghỉ ốm, việc riêng…"
        />
      ) : (
        <>
          {/* Lưới kiểu bảng tính (08/10/2026) thay cặp xem thẻ / bảng + ba thẻ số: hàng lọc nhanh dính
              liền đầu lưới; bấm dòng để sửa, công tắc bật/tắt ngay trên dòng. */}
          <section className="lds-loc">
            <LocNhanhTrangThai dang={locLuong} onChon={(k) => { setLocLuong(k as typeof locLuong); setPage(1); }}
              ariaLabel="Lọc theo chế độ lương"
              muc={[
                { key: "", label: "Tất cả", count: items.length },
                { key: "paid", label: "Có lương", count: paidTypes, mau: "la" },
                { key: "unpaid", label: "Không lương", count: unpaidTypes, mau: "xam" },
              ]} />
          </section>
          <div className="lds-sheet">
            <table className="lds-g np-loai">
              <colgroup>
                <col />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col />
                <col style={{ width: 96 }} />
                <col style={{ width: 52 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Tên loại nghỉ</th>
                  <th>Chế độ lương</th>
                  <th className="n">Hạn mức mỗi năm</th>
                  <th>Ghi chú</th>
                  <th className="c">Đang dùng</th>
                  <th aria-label="Xóa" />
                </tr>
              </thead>
              <tbody>
                {pagedTypes.length === 0 ? (
                  <tr><td colSpan={6} className="lds-trong">Không có loại nghỉ nào khớp bộ lọc.</td></tr>
                ) : pagedTypes.map((t) => (
                  <tr key={t.id} className={`lds-dong${t.is_active ? "" : " np-loai--tat"}`} tabIndex={0}
                    onClick={() => setEditing(t)}
                    onKeyDown={(e) => { if (e.key === "Enter") setEditing(t); }}
                    title="Bấm để sửa">
                    <td title={t.name}>{t.name}</td>
                    <td>{t.is_paid ? <ChipTT mau="la">Có lương</ChipTT> : <ChipTT mau="xam">Không lương</ChipTT>}</td>
                    <td className={t.annual_quota > 0 ? "n" : "n lds-mu"}>
                      {t.annual_quota > 0 ? `${t.annual_quota} ngày` : "Theo đơn xin"}
                    </td>
                    <td className="lds-mu" title={t.note ?? undefined}>{t.note}</td>
                    <td className="c" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <label className="cc-switch np-loai__cong-tac" title={t.is_active ? "Đang dùng — bấm để tắt" : "Đã tắt — bấm để bật"}>
                        <input type="checkbox" checked={t.is_active} onChange={() => toggleActive(t)} aria-label={`Bật/tắt loại nghỉ ${t.name}`} />
                        <span className="cc-slider" />
                      </label>
                    </td>
                    {/* Xoá loại nghỉ đụng tới đơn cũ ⇒ GIỮ `danger`, vẫn qua hộp xác nhận. */}
                    <td className="lds-nut" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <RowActionButton dense danger label={`Xóa ${t.name}`} icon="trash" onClick={() => handleDelete(t)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && !listError && totalTypes > 0 && (
        <PhanTrangDayDu
          trang={pageSafe} size={size} tong={totalTypes} soDong={pagedTypes.length}
          donVi="loại nghỉ"
          onTrang={setPage}
          onSize={(n) => { setSize(n); setPage(1); }}
          ariaLabel="Phân trang loại nghỉ"
        />
      )}

      {editing && (
        <LeaveTypeForm
          token={token}
          type={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(cb) => { setEditing(null); setCanhBao(cb ?? null); load(); }}
        />
      )}
    </div>
    </>
  );
}
