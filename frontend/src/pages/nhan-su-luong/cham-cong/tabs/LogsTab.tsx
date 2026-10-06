// Tab Nhật ký chấm công + bảng log (tách từ pages/ChamCongPage.tsx).
import { useEffect, useRef, useState } from "react";
import { api, type AttendanceLog, type TodayKpi } from "../../../../api/client";
import {
  UserCheck,
  MapPin,
  ClipboardList,
  FileEdit,
  XCircle,
  AlertTriangle,
  LogIn,
  LogOut,
  Search,
} from "lucide-react";
import { EmptyState } from "../../../../components/EmptyState";
import { MixDonut } from "../../../../components/charts";
import { PhanTrangDayDu } from "../../../../components/PhanTrangDayDu";
import { ThanhLoc } from "../../../thanh-loc/ThanhLoc";
import { thamSoKy } from "../../../thanh-loc/ky-danh-sach";
import { useLocTab } from "../../dieu-kien-don";
import {
  LOC_NK_TRONG,
  MAN_CHAM_CONG,
  MOC_NK,
  locNhatKyLenUrl,
  locNhatKyTuUrl,
  thamSoLocNhatKy,
  useDieuKienNhatKy,
  type LocNhatKy,
} from "../dieu-kien-cham-cong";
import { getInitials } from "../shared/helpers";

// --- Tab: Nhật ký chấm công (HR) ---------------------------------------------

export function LogsTab({
  token,
  focusEmployeeId,
}: {
  token: string;
  focusEmployeeId?: number;
}) {
  const [items, setItems] = useState<AttendanceLog[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [dangTai, setDangTai] = useState(true);
  const [kpi, setKpi] = useState<TodayKpi | null>(null);

  // Kỳ (Giờ chấm / Ngày tạo) + Nhân viên, Phòng ban, Điểm chấm công — lọc + phân trang ở MÁY CHỦ
  // (06/10/2026). Trước đó màn chỉ tải 100 lượt gần nhất (1000 khi lọc ngày) ⇒ lọc xong vẫn mất
  // dữ liệu trong im lặng.
  const [locTab, setLocTabGoc] = useLocTab<LocNhatKy>({
    man: MAN_CHAM_CONG, tienToUrl: "nk", moc: MOC_NK, mocMacDinh: "cham", ttMacDinh: "",
    locTrong: LOC_NK_TRONG, locTuUrl: locNhatKyTuUrl, locLenUrl: locNhatKyLenUrl,
  });
  const setLocTab = (t: typeof locTab) => {
    setLocTabGoc(t);
    setPage(1);
  };
  const dieuKien = useDieuKienNhatKy();
  // Liên thông từ Hồ sơ NV: mở thẳng nhật ký của một người = áp điều kiện Nhân viên (bỏ được
  // bằng nút × của chính điều kiện đó, không cần băng "Bỏ lọc" riêng).
  useEffect(() => {
    if (focusEmployeeId != null) setLocTab({ ...locTab, loc: { ...locTab.loc, nv: focusEmployeeId } });
    // Chỉ chạy khi đổi người được liên thông sang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEmployeeId]);
  const nv = locTab.loc.nv;

  // Ô tìm: gõ tới đâu gọi API tới đó thì mỗi phím một request. Chờ 300ms im tay rồi mới gọi.
  const [q, setQ] = useState("");
  const [qGui, setQGui] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setQGui(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const khoaLoc = JSON.stringify({ ...thamSoKy(locTab.ky), ...thamSoLocNhatKy(locTab.loc) });
  /** Chỉ nhận phản hồi của lượt tải mới nhất — đổi lọc liền tay thì lượt cũ về sau không đè. */
  const luotTai = useRef(0);
  useEffect(() => {
    const luot = ++luotTai.current;
    setDangTai(true);
    api.attendance
      .logs(token, { q: qGui || undefined, page, size, ...JSON.parse(khoaLoc) })
      .then((r) => {
        if (luot !== luotTai.current) return;
        setItems(r.items);
        setTotal(r.total);
      })
      .catch(() => {
        if (luot !== luotTai.current) return;
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (luot === luotTai.current) setDangTai(false);
      });
  }, [token, qGui, page, size, khoaLoc]);

  useEffect(() => {
    if (nv == null) {
      api.attendance
        .kpi(token)
        .then(setKpi)
        .catch(() => setKpi(null));
    }
  }, [token, nv]);

  // Render chart slices for Recharts MixDonut
  const chartSlices = kpi
    ? [
        { label: "Đang có mặt", value: kpi.present_now },
        { label: "Quên chấm RA", value: kpi.missing_out },
        { label: "Đi muộn hôm nay", value: kpi.late_today },
        { label: "YC chờ duyệt", value: kpi.pending_requests },
      ].filter((s) => s.value > 0)
    : [];

  return (
    <div>
      {nv == null && kpi && (
        <div className="cc-analytics-section">
          <div className="cc-analytics-grid">
            {/* KPI Cards Grid */}
            <div className="cc-kpi-grid">
              <div className="cc-kpi-card cc-kpi-card--in">
                <div className="cc-kpi-icon-wrapper">
                  <UserCheck size={18} />
                </div>
                <div className="cc-kpi-info">
                  <span className="cc-kpi-num">{kpi.present_now}</span>
                  <span className="cc-kpi-title">Đang có mặt</span>
                </div>
              </div>
              <div className="cc-kpi-card cc-kpi-card--out">
                <div className="cc-kpi-icon-wrapper">
                  <XCircle size={18} />
                </div>
                <div className="cc-kpi-info">
                  <span className="cc-kpi-num">{kpi.missing_out}</span>
                  <span className="cc-kpi-title">Quên chấm RA</span>
                </div>
              </div>
              <div className="cc-kpi-card cc-kpi-card--late">
                <div className="cc-kpi-icon-wrapper">
                  <AlertTriangle size={18} />
                </div>
                <div className="cc-kpi-info">
                  <span className="cc-kpi-num">{kpi.late_today}</span>
                  <span className="cc-kpi-title">Đi muộn hôm nay</span>
                </div>
              </div>
              <div className="cc-kpi-card cc-kpi-card--pending">
                <div className="cc-kpi-icon-wrapper">
                  <FileEdit size={18} />
                </div>
                <div className="cc-kpi-info">
                  <span className="cc-kpi-num">{kpi.pending_requests}</span>
                  <span className="cc-kpi-title">YC chờ duyệt</span>
                </div>
              </div>
            </div>

            {/* Donut chart analysis */}
            <div
              style={{
                background: "var(--paper)",
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid var(--rule-soft)",
              }}
            >
              <div className="cc-chart-title">
                <ClipboardList size={14} /> Tỷ lệ chuyên cần hôm nay
              </div>
              {chartSlices.length > 0 ? (
                <div className="cc-chart-container">
                  <MixDonut
                    slices={chartSlices}
                    centerTop={String(kpi.present_now)}
                    centerBottom="Đang có mặt"
                    formatValue={(v) => `${v} người`}
                    height={160}
                  />
                </div>
              ) : (
                <div
                  className="ns__empty"
                  style={{
                    height: "160px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  Hôm nay chưa có dữ liệu chấm công.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dùng lại `cc-sp-search` của chính màn này (lưới Phân ca). KHÔNG mượn `lg-search-*` bên
          màn Lương: class đó nằm trong `luong.css` mà file này không import. */}
      <div className="cc-toolbar tl-thanh" style={{ marginBottom: 10, gap: 8 }}>
        <label className="cc-sp-search">
          <Search size={14} />
          <input
            placeholder="Tìm theo tên / mã nhân viên…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <ThanhLoc
          ky={locTab.ky}
          moc={MOC_NK}
          onKy={(ky) => setLocTab({ ...locTab, ky })}
          dieuKien={dieuKien}
          loc={locTab.loc}
          onLoc={(loc) => setLocTab({ ...locTab, loc })}
        />
      </div>

      {!items ? (
        <EmptyState trangThai="dang-tai" inline />
      ) : (
        <>
          <AttendanceTable logs={items} showEmployee={nv == null} coLoc={khoaLoc !== "{}"} />
          {total > 0 && (
            <PhanTrangDayDu
              trang={page}
              size={size}
              tong={total}
              soDong={items.length}
              loading={dangTai}
              donVi="lượt bấm"
              onTrang={setPage}
              onSize={(n) => {
                setSize(n);
                setPage(1);
              }}
              ariaLabel="Phân trang nhật ký chấm công"
            />
          )}
        </>
      )}
    </div>
  );
}

// --- Shared table -----------------------------------------------------------

function parseDateTimeVN(iso: string | null | undefined) {
  if (!iso) return { time: "—", date: "" };
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const d = new Date(hasTz ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return { time: iso, date: "" };
  const timeStr = d.toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
  });
  const dateStr = d.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return { time: timeStr, date: dateStr };
}

function AttendanceTable({
  logs,
  showEmployee,
  coLoc,
}: {
  logs: AttendanceLog[];
  showEmployee: boolean;
  coLoc: boolean;
}) {
  return (
    <div className="ns__tablewrap">
      <table className="ns__table cc-log-table">
        <thead>
          <tr>
            {showEmployee && <th>Nhân viên</th>}
            <th style={{ width: "120px" }}>Loại</th>
            <th style={{ width: "150px" }}>Thời gian</th>
            <th>Điểm chấm công</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => {
            const { time, date } = parseDateTimeVN(l.checked_at);
            const isInside = l.distance_m == null || l.distance_m <= 150; // Bán kính chuẩn 150m
            return (
              <tr
                key={l.id}
                className={`cc-log-row cc-log-row--${l.check_type}`}
              >
                {showEmployee && (
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span className="cc-avatar-mini">
                        {getInitials(l.employee_name)}
                      </span>
                      <span
                        style={{
                          fontWeight: "var(--fw-medium)",
                          color: "var(--ink)",
                        }}
                      >
                        {l.employee_name ?? `NV#${l.employee_id}`}
                      </span>
                    </div>
                  </td>
                )}
                <td>
                  <span
                    className={`cc-log-badge cc-log-badge--${l.check_type}`}
                  >
                    {l.check_type === "in" ? (
                      <>
                        <LogIn size={12} style={{ marginRight: "4px" }} />
                        <span>VÀO</span>
                      </>
                    ) : (
                      <>
                        <LogOut size={12} style={{ marginRight: "4px" }} />
                        <span>RA</span>
                      </>
                    )}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span className="cc-log-time">{time}</span>
                    <span className="cc-log-date">{date}</span>
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span
                      style={{
                        fontWeight: "var(--fw-medium)",
                        color: "var(--ink)",
                      }}
                    >
                      {l.location_name ?? "📍 Vị trí ngoài danh mục"}
                    </span>
                    <span
                      className={`cc-log-distance ${isInside ? "is-inside" : "is-outside"}`}
                    >
                      <MapPin
                        size={11}
                        style={{
                          marginRight: "3px",
                          display: "inline-block",
                          verticalAlign: "middle",
                        }}
                      />
                      {l.distance_m != null
                        ? isInside
                          ? `Trong phạm vi (${Math.round(l.distance_m)}m)`
                          : `Ngoài phạm vi (${Math.round(l.distance_m)}m)`
                        : "Không có GPS"}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
          {logs.length === 0 && (
            <tr>
              <td colSpan={showEmployee ? 4 : 3} className="ns__empty">
                {!coLoc ? "Chưa có bản ghi chấm công." : "Không có bản ghi chấm công nào khớp bộ lọc."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
