// Tab Yêu cầu chỉnh công (tách từ pages/ChamCongPage.tsx).
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AdjustRequest } from "../../../../api/client";
import { Info } from "lucide-react";
import { statusBadge } from "../components/badges";
import { FAULT_OPTIONS } from "../shared/constants";
import { getInitials } from "../shared/helpers";
import { EmptyState } from "../../../../components/EmptyState";
import { PhanTrangDayDu } from "../../../../components/PhanTrangDayDu";
import { StatusTabs } from "../../../../components/StatusTabs";
import { fmtDate, fmtDateISO, fmtDateTime } from "../../../../utils/format";
import { ThanhLoc } from "../../../thanh-loc/ThanhLoc";
import { thamSoKy } from "../../../thanh-loc/ky-danh-sach";
import { dkTabDon, nguoiLenUrl, nguoiTuUrl, tabTrangThai, thamSoNguoi, useLocTab } from "../../dieu-kien-don";
import {
  LOC_CC_TRONG,
  MAN_CHAM_CONG,
  MOC_CC,
  useDieuKienChinhCong,
  type LocChinhCong,
} from "../dieu-kien-cham-cong";

// --- Tab: Yêu cầu chỉnh công (HCNS duyệt) -----------------------------------

export function AdjustRequestsTab({
  token,
  canAdjust,
  eventTick,
}: {
  token: string;
  canAdjust: boolean;
  /** Nhảy theo sự kiện SSE (`adjust_pending_changed`…) → danh sách tự tải lại, khỏi F5 (E7, 08/09/2026). */
  eventTick?: number;
}) {
  const [items, setItems] = useState<AdjustRequest[] | null>(null);
  const [total, setTotal] = useState(0);
  const [dem, setDem] = useState<Record<string, number> | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [dangTai, setDangTai] = useState(true);
  const [faults, setFaults] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Kỳ (Ngày tạo / Ngày công) + trạng thái (thanh tab có số) + Nhân viên, Phòng ban — lọc, đếm,
  // phân trang ở MÁY CHỦ (06/10/2026). Trước đó tải tối đa 200 yêu cầu, không phân trang.
  const [locTab, setLocTabGoc] = useLocTab<LocChinhCong>({
    man: MAN_CHAM_CONG, tienToUrl: "ct", moc: MOC_CC, mocMacDinh: "tao", ttMacDinh: "pending",
    locTrong: LOC_CC_TRONG, locTuUrl: nguoiTuUrl, locLenUrl: nguoiLenUrl,
  });
  const setLocTab = (t: typeof locTab) => {
    setLocTabGoc(t);
    setPage(1);
  };
  const dieuKien = useDieuKienChinhCong();
  const khoaLoc = JSON.stringify({
    ...thamSoKy(locTab.ky),
    ...thamSoNguoi(locTab.loc),
    // Máy chủ hiểu "không gửi trạng thái" là Chờ duyệt ⇒ Tất cả phải gửi rõ `all`.
    status: locTab.tt || "all",
  });

  const luotTai = useRef(0);
  const load = useCallback(() => {
    const luot = ++luotTai.current;
    setDangTai(true);
    api.attendance
      .listAdjustRequests(token, { page, size, ...JSON.parse(khoaLoc) })
      .then((r) => {
        if (luot !== luotTai.current) return;
        setItems(r.items);
        setTotal(r.total);
        setDem(r.dem_theo_tab ?? null);
      })
      .catch(() => {
        if (luot !== luotTai.current) return;
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (luot === luotTai.current) setDangTai(false);
      });
  }, [token, khoaLoc, page, size]);
  useEffect(() => {
    load();
  }, [load, eventTick]);

  async function approve(r: AdjustRequest) {
    setBusy(true);
    setErr(null);
    try {
      await api.attendance.approveAdjustRequest(token, r.id, {
        fault_party: faults[r.id] ?? r.fault_party ?? "nv_quen",
      });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi khi duyệt.");
    } finally {
      setBusy(false);
    }
  }
  async function reject(r: AdjustRequest) {
    const note = window.prompt("Lý do từ chối yêu cầu:");
    if (!note) return;
    setBusy(true);
    setErr(null);
    try {
      await api.attendance.rejectAdjustRequest(token, r.id, note);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi khi từ chối.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        className="cc-info-card-note"
        style={{ margin: "0 0 10px 0", padding: "8px 12px" }}
      >
        <Info size={14} className="cc-note-icon" />
        <span>
          Duyệt yêu cầu sẽ tự động tạo lượt chấm công bù tương ứng và tính lại
          ngày công của ngày đó.
        </span>
      </div>
      <div className="cc-ts-toolbar tl-thanh">
        <ThanhLoc
          ky={locTab.ky}
          moc={MOC_CC}
          onKy={(ky) => setLocTab({ ...locTab, ky })}
          dieuKien={dkTabDon(dieuKien, tabTrangThai(dem))}
          loc={locTab}
          onLoc={setLocTab}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <StatusTabs
          tabs={tabTrangThai(dem)}
          active={locTab.tt}
          onChange={(tt) => setLocTab({ ...locTab, tt })}
        />
      </div>

      {err && (
        <div
          className="banner banner--error cc-ts-msg-banner"
          style={{ marginBottom: "16px" }}
        >
          {err}
        </div>
      )}

      {!items ? (
        <EmptyState trangThai="dang-tai" inline />
      ) : (
        <div className="cc-timesheet-scroll-container">
          <table className="cc-timesheet-table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Ngày tạo</th>
                <th>Ngày công</th>
                <th style={{ textAlign: "center" }}>Chấm</th>
                <th style={{ textAlign: "center" }}>Giờ</th>
                <th>Lý do</th>
                <th style={{ textAlign: "center" }}>Trạng thái</th>
                {canAdjust && <th style={{ textAlign: "center" }}>Xử lý</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="cc-name-cell-wrapper">
                      <span className="cc-name-avatar">
                        {getInitials(r.employee_name)}
                      </span>
                      <span
                        className="cc-name-text-plain"
                        title={r.employee_name ?? `NV#${r.employee_id}`}
                      >
                        {r.employee_name ?? `NV#${r.employee_id}`}
                      </span>
                    </div>
                  </td>
                  <td title={fmtDateTime(r.created_at ?? null)}>
                    {fmtDate(r.created_at ?? null)}
                  </td>
                  <td>{fmtDateISO(r.work_date)}</td>
                  <td style={{ textAlign: "center" }}>
                    <span
                      className={`cc-cell-badge ${r.check_type === "in" ? "cc-cell-badge--work" : "cc-cell-badge--late"}`}
                    >
                      {r.check_type === "in" ? "VÀO" : "RA"}
                    </span>
                  </td>
                  <td
                    style={{
                      textAlign: "center",
                      fontFamily: "var(--ff-sans)",
                      fontWeight: "bold",
                    }}
                  >
                    {r.suggested_time ?? "—"}
                    {r.suggested_next_day ? (
                      <span title="Sáng hôm sau (ca đêm)"> (+1)</span>
                    ) : null}
                  </td>
                  <td>
                    <div className="cc-reason-wrapper">
                      <span className="cc-reason-text">{r.reason}</span>
                      {r.decision_note && (
                        <div className="cc-decision-note-sub">
                          💬 {r.decision_note}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {statusBadge(r.status)}
                  </td>
                  {canAdjust && (
                    <td style={{ textAlign: "center" }}>
                      {r.status === "pending" ? (
                        <div className="cc-adjust-actions-group">
                          <div className="cc-select-wrapper cc-select-fault-wrapper">
                            <select
                              value={faults[r.id] ?? r.fault_party ?? "nv_quen"}
                              onChange={(e) =>
                                setFaults((f) => ({
                                  ...f,
                                  [r.id]: e.target.value,
                                }))
                              }
                            >
                              {FAULT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            className="btn btn--primary cc-btn-approve"
                            onClick={() => approve(r)}
                            disabled={busy}
                          >
                            Duyệt
                          </button>
                          <button
                            className="btn btn--ghost cc-btn-reject"
                            onClick={() => reject(r)}
                            disabled={busy}
                          >
                            Từ chối
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={canAdjust ? 8 : 7}
                    className="ns__empty"
                    style={{ padding: "24px", textAlign: "center" }}
                  >
                    Không có yêu cầu chỉnh công nào khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {total > 0 && (
            <PhanTrangDayDu
              trang={page}
              size={size}
              tong={total}
              soDong={items.length}
              loading={dangTai}
              donVi="yêu cầu"
              onTrang={setPage}
              onSize={(n) => {
                setSize(n);
                setPage(1);
              }}
              ariaLabel="Phân trang yêu cầu chỉnh công"
            />
          )}
        </div>
      )}
    </div>
  );
}
