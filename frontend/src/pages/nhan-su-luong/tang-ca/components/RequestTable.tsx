// Bảng phiếu tăng ca dùng chung cho cả 2 tab (tách từ pages/TangCaPage.tsx).
//
// 08/10/2026: lưới kiểu bảng tính `lds-g` như bảng đơn Nghỉ phép. Thứ tự cột: AI → tăng ca NGÀY nào,
// GIỜ nào, mấy tiếng → tới ĐÂU rồi → vì sao (lý do + ghi chú duyệt mờ phía sau, cột co giãn) → ai
// duyệt → ngày gửi. Danh sách vẫn xếp mới tạo nhất lên đầu (23/09/2026). Cột có khoá để tab gắn nút
// "Cột" (ẩn, đổi chỗ, ghim, kéo rộng).
import type { ReactNode } from "react";
import { type OvertimeRequest } from "../../../../api/client";
import { EmptyRow } from "../../../../components/EmptyState";
import { ChipTT, CuonLuoi, ngayVN, rongLuoi, type CauHinhLuoi, type CotLuoi, type MauTT } from "../../../../components/LuoiDs";
// `fmtDateISO` = bản dùng chung của `fmtYmd` cũ (ISO yyyy-mm-dd → dd/mm/yyyy, giữ số 0 đệm,
// KHÔNG qua `new Date()` nên không lệch múi giờ). Đừng chép lại bản cục bộ.
import { fmtDateISO, fmtDateTime } from "../../../../utils/format";
import { minToHhmm } from "../shared/helpers";
import { XinHuyNhan } from "../../xin-huy/XinHuy";

/** Chip trạng thái — cùng sắc với chấm của hàng lọc nhanh (`mucLocNhanh`). */
const TT: Record<string, [string, MauTT]> = {
  pending: ["Chờ duyệt", "vang"],
  approved: ["Đã duyệt", "la"],
  rejected: ["Từ chối", "do"],
  cancelled: ["Đã hủy", "xam"],
};

// --- Bảng phiếu dùng chung ---------------------------------------------------

export type CotPhieuTc = CotLuoi & { w?: number; n?: boolean };

/** Cột của bảng phiếu tăng ca — tab gọi để dựng nút "Cột" (cùng bộ cột với bảng). Ô chọn, Nhân viên
 *  và cột nút là cột cố định (không ẩn được); Nhân viên đứng đầu nên được ghim khi cuộn ngang. */
export function cotPhieuTc({ selectable, showEmployee }: { selectable: boolean; showEmployee: boolean }): CotPhieuTc[] {
  return [
    ...(selectable ? [{ key: "chon", label: "Chọn", coDinh: true, w: 40 }] : []),
    ...(showEmployee ? [{ key: "nv", label: "Nhân viên", coDinh: true, w: 160 }] : []),
    { key: "ngay", label: "Ngày công", w: 108 },
    { key: "gio", label: "Giờ tăng ca", w: 124 },
    { key: "so_gio", label: "Số giờ", n: true, w: 80 },
    { key: "tt", label: "Trạng thái", w: 136 },
    { key: "ly_do", label: "Lý do" }, // co giãn
    { key: "duyet", label: "Người duyệt", w: 136 },
    { key: "tao", label: "Ngày tạo", w: 104 },
    // Cột nút: người gửi có tới 2 nút (Sửa + Hủy), người duyệt cũng tối đa 2 (Duyệt + Từ chối).
    { key: "nut", label: "Thao tác", coDinh: true, w: 76 },
  ];
}

export function RequestTable({
  rows,
  showEmployee,
  selectable,
  selected,
  onToggle,
  actions,
  loading,
  listError,
  onRetry,
  emptyTitle,
  emptySub,
  chan,
  luoi,
}: {
  rows: OvertimeRequest[];
  showEmployee: boolean;
  selectable: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  actions: (r: OvertimeRequest) => ReactNode;
  /** Ba ca rỗng do NƠI GỌI cấp — bảng này không tự gọi máy chủ. `listError` CHỈ nhận lỗi
   *  TẢI DANH SÁCH, đừng truyền lỗi duyệt/hủy vào. */
  loading?: boolean;
  listError?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptySub?: string;
  /** Chân bảng (phân trang) — nằm TRONG khung lưới như mọi danh sách. */
  chan?: ReactNode;
  /** Cấu hình lưới của tab (nút "Cột") — có thì ẩn / đổi chỗ / ghim / kéo độ rộng được. */
  luoi?: CauHinhLuoi;
}) {
  const goc = cotPhieuTc({ selectable, showEmployee });
  const cot = luoi ? luoi.rongHien(luoi.xep(goc).filter((c) => !luoi.an.has(c.key))) : goc;
  const cols = cot.length;

  /** Ô của một phiếu theo khoá cột. */
  const o = (key: string, r: OvertimeRequest, tick: boolean) => {
    switch (key) {
      case "chon":
        return (
          <td key={key} className="c">
            {r.status === "pending" && (
              <input
                type="checkbox"
                checked={tick}
                onChange={() => onToggle(r.id)}
                aria-label={`Chọn phiếu của ${r.employee_name ?? "nhân viên"}`}
              />
            )}
          </td>
        );
      case "nv":
        return <td key={key} title={r.employee_name ?? undefined}>{r.employee_name ?? "—"}</td>;
      case "ngay":
        return <td key={key}>{fmtDateISO(r.work_date)}</td>;
      case "gio":
        return <td key={key}>{`${minToHhmm(r.from_minute)} – ${minToHhmm(r.to_minute)}`}</td>;
      case "so_gio":
        return (
          <td key={key} className="n">
            {Math.floor(r.minutes / 60)}h
            {r.minutes % 60 ? ` ${r.minutes % 60}'` : ""}
          </td>
        );
      case "tt": {
        const [nhanTT, mauTT] = TT[r.status] ?? [r.status, "xam" as MauTT];
        return (
          <td key={key} className="tc-g__tt">
            <ChipTT mau={mauTT}>{nhanTT}</ChipTT>
            <XinHuyNhan yc={r.yeu_cau_huy} />
          </td>
        );
      }
      case "ly_do":
        // Lý do + ghi chú của người duyệt cùng một ô (ghi chú chữ mờ đứng sau), rê chuột xem đủ.
        return (
          <td key={key} title={[r.reason, r.decision_note && `Ghi chú duyệt: ${r.decision_note}`].filter(Boolean).join("\n") || undefined}>
            {r.reason || <span className="lds-mu3">—</span>}
            {r.decision_note && <span className="tc-g__ghi-chu">{r.decision_note}</span>}
          </td>
        );
      case "duyet":
        return (
          <td key={key} title={r.decided_at ? `Duyệt lúc ${fmtDateTime(r.decided_at)}` : undefined}>
            {r.decided_by_name ?? <span className="lds-mu3">—</span>}
          </td>
        );
      case "tao":
        return <td key={key} className="lds-mu" title={fmtDateTime(r.created_at)}>{ngayVN(r.created_at)}</td>;
      case "nut":
        return (
          <td key={key} className="lds-nut">
            <div className="tc-g__nut">{actions(r)}</div>
          </td>
        );
      default:
        return <td key={key} />;
    }
  };

  return (
    <div className="lds-sheet">
      <CuonLuoi ghim={luoi?.soGhim(cot)}>
        <table className="lds-g tc-g" style={{ minWidth: rongLuoi(cot, 120) }}>
          <colgroup>
            {cot.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
          </colgroup>
          <thead>
            <tr>
              {cot.map((c) =>
                c.key === "chon" ? (
                  <th key={c.key} className="c" aria-label="Chọn phiếu" />
                ) : (
                  // `<th>` rỗng (cột nút) phải có aria-label, không thì trình đọc màn hình đọc ra một ô câm.
                  <th key={c.key} className={c.n ? "n" : undefined} aria-label={c.key === "nut" ? "Thao tác" : undefined}>
                    {c.key === "nut" ? null : c.label}
                    {luoi?.keo(c.key)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {loading && <EmptyRow colSpan={cols} trangThai="dang-tai" />}
            {!loading && listError && (
              <EmptyRow colSpan={cols} trangThai="loi" loi={listError} onThuLai={onRetry} />
            )}
            {!loading && !listError && rows.map((r) => {
              const tick = selected.has(r.id);
              return (
                <tr key={r.id} className={tick ? "is-tick" : undefined}>
                  {cot.map((c) => o(c.key, r, tick))}
                </tr>
              );
            })}
            {!loading && !listError && rows.length === 0 && (
              <EmptyRow
                colSpan={cols}
                icon="clock"
                title={emptyTitle ?? "Chưa có phiếu tăng ca nào"}
                sub={emptySub}
              />
            )}
          </tbody>
        </table>
      </CuonLuoi>
      {chan}
    </div>
  );
}
