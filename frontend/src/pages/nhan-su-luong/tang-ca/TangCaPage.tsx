// Màn Tăng ca (module `tang_ca`) — 2 tab:
//   • Phiếu của tôi — NV tự gửi phiếu, theo dõi trạng thái, tự hủy khi chưa được duyệt.
//   • Duyệt phiếu   — tổ trưởng/HCNS duyệt (chọn nhiều → duyệt cả mẻ). Scope `department` nên tổ
//                     trưởng CHỈ thấy người trong tổ mình.
// Nguyên tắc (chốt với chủ 23/07/2026): phiếu = GIẤY PHÉP + MỨC TRẦN. Lượt bấm RA mới quyết tiền,
// nên màn này KHÔNG nhập giờ làm thực — chỉ khai khoảng được phép tăng ca.
// (tách từ pages/TangCaPage.tsx).
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type OvertimeRequest, type XinHuyChoDuyet } from "../../../api/client";
import { useCan, useSelfService } from "../../../auth/permissions";
import { useAuth } from "../../../auth/useAuth";
import { Button } from "../../../components/Button";
import { trangHopLe } from "../../../components/Pager";
import { PhanTrangDayDu } from "../../../components/PhanTrangDayDu";
import { ChonCot, LocNhanhTrangThai, useCauHinhLuoi } from "../../../components/LuoiDs";
import { ThanhLoc } from "../../thanh-loc/ThanhLoc";
import { thamSoKy } from "../../thanh-loc/ky-danh-sach";
import { soDaAp } from "../../thanh-loc/thanh-loc";
import { dkTabDon, mucLocNhanh, nguoiLenUrl, nguoiTuUrl, tabTrangThai, thamSoNguoi, useLocTab } from "../dieu-kien-don";
import { LOC_TC_TRONG, MAN_TANG_CA, MOC_TC, useDieuKienDuyetTangCa, type LocTangCa } from "./dieu-kien-tang-ca";
import { RowActionButton } from "../../../components/RowActionButton";
import { cotPhieuTc, RequestTable } from "./components/RequestTable";
import { OvertimeFormModal } from "./modals/OvertimeFormModal";
import { RejectModal } from "./modals/RejectModal";
import { PAGE_SIZE } from "./shared/constants";
import { errText, minToHhmm } from "./shared/helpers";
import { dangXinHuy, homNayYmd, LyDoDialog, XinHuyHangDoi } from "../xin-huy/XinHuy";
import { fmtDateISO } from "../../../utils/format";

/** Tóm tắt một phiếu cho hàng đợi xin hủy / hộp thoại: "06/10/2026 · 18:00 → 20:00". */
const tomTat = (r: OvertimeRequest) =>
  `${fmtDateISO(r.work_date)} · ${minToHhmm(r.from_minute)} → ${minToHhmm(r.to_minute)}`;
import type { Tab } from "./shared/types";
import "../../nhan-su.css";
import "../../tang-ca.css";

// --- Màn chính ---------------------------------------------------------------

export function TangCaPage({
  onChanged,
  eventTick,
}: {
  onChanged?: () => void;
  /** Tăng theo mỗi sự kiện real-time (SSE) → tải lại bảng NGAY khi bên kia duyệt/từ chối/gửi phiếu. */
  eventTick?: number;
}) {
  const { token: authToken } = useAuth();
  const token = authToken ?? ""; // AppShell chỉ render màn này sau khi đăng nhập
  const can = useCan();
  const canApprove = can("tang_ca", "approve");
  // Ô TỰ PHỤC VỤ (đợt 3) — quản trị TẮT ĐƯỢC. Không hỏi thì tắt xong nút vẫn bày ra, bấm
  // mới ăn 403: trông như hệ thống hỏng chứ không như "anh không có quyền".
  const tuPhucVu = useSelfService();
  // Ô THAO TÁC của Tự phục vụ — TÁCH khỏi ô Xem ngày 11/08/2026. Tab/danh sách đi theo ô
  // Xem; còn nút GỬI · SỬA · HUỶ thì đi theo ô này.
  // GHI LÀ GHI — gửi / sửa / huỷ đơn của CHÍNH MÌNH vẫn đòi ô Thao tác của màn Tăng ca
  // (chủ chốt 15/08/2026: *"tôi chưa bật thao tác vẫn bấm gửi đơn được nè"*). Chỉ phần ĐỌC dữ
  // liệu của mình mới là quyền đương nhiên.
  const tuPhucVuGhi = can("tang_ca", "create");
  const [tab, setTab] = useState<Tab>(canApprove && !tuPhucVu ? "approve" : "mine");
  const [mine, setMine] = useState<OvertimeRequest[]>([]);
  const [mineTotal, setMineTotal] = useState(0);
  const luoiMine = useCauHinhLuoi("tang-ca-cua-toi");
  const luoiQueue = useCauHinhLuoi("tang-ca-duyet");
  const [minePage, setMinePage] = useState(1);
  const [mineSize, setMineSize] = useState(PAGE_SIZE);
  const [hasEmployee, setHasEmployee] = useState(true);
  const [queue, setQueue] = useState<OvertimeRequest[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queuePage, setQueuePage] = useState(1);
  const [queueSize, setQueueSize] = useState(PAGE_SIZE);
  // Bộ lọc (06/10/2026, thay ô "Tháng tạo"): kỳ (Ngày tạo / Ngày công) + trạng thái (thanh tab có
  // số) cho cả hai tab, thêm Nhân viên, Phòng ban cho tab Duyệt — lọc, đếm, phân trang ở MÁY CHỦ.
  // Trạng thái tab Duyệt mặc định "Chờ duyệt" — việc chính của người duyệt.
  const [locMine, setLocMineGoc] = useLocTab<LocTangCa>({
    man: MAN_TANG_CA, tienToUrl: "pt", moc: MOC_TC, mocMacDinh: "tao", ttMacDinh: "",
    locTrong: LOC_TC_TRONG, locTuUrl: () => LOC_TC_TRONG, locLenUrl: () => ({}),
  });
  const [locQueue, setLocQueueGoc] = useLocTab<LocTangCa>({
    man: MAN_TANG_CA, tienToUrl: "dy", moc: MOC_TC, mocMacDinh: "tao", ttMacDinh: "pending",
    locTrong: LOC_TC_TRONG, locTuUrl: nguoiTuUrl, locLenUrl: nguoiLenUrl,
  });
  const dieuKienDuyet = useDieuKienDuyetTangCa(canApprove);
  const [demMine, setDemMine] = useState<Record<string, number> | null>(null);
  const [demQueue, setDemQueue] = useState<Record<string, number> | null>(null);
  const queueStatus = locQueue.tt;
  const khoaMine = JSON.stringify({ ...thamSoKy(locMine.ky), status_filter: locMine.tt || undefined });
  const khoaQueue = JSON.stringify({
    ...thamSoKy(locQueue.ky),
    ...thamSoNguoi(locQueue.loc),
    status_filter: queueStatus || undefined,
  });
  const queueCoLoc = locQueue.ky.loai !== "tat_ca" || soDaAp(dieuKienDuyet, locQueue.loc) > 0;
  const mineCoLoc = locMine.ky.loai !== "tat_ca" || locMine.tt !== "";
  const luotMine = useRef(0);
  const luotQueue = useRef(0);
  // Người duyệt hủy thẳng phiếu ĐÃ DUYỆT — bắt buộc lý do (23/09/2026).
  const [huyPhieu, setHuyPhieu] = useState<OvertimeRequest | null>(null);
  const [huyBusy, setHuyBusy] = useState(false);
  const [huyErr, setHuyErr] = useState<string | null>(null);
  /** Số phiếu CHỜ DUYỆT trong phạm vi — đếm ở DB qua `/api/overtime/summary`, KHÔNG đếm mảng
   *  `queue` đã tải. Sau phân trang mảng đó chỉ còn 20 dòng của trang, đếm nó ra số của trang
   *  và cái nhãn "Duyệt phiếu (N)" thành nói dối (badge sidebar báo 47, tab báo 20). */
  const [pendingCount, setPendingCount] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState<null | "mine" | "for">(null);
  const [editing, setEditing] = useState<OvertimeRequest | null>(null);
  const [rejecting, setRejecting] = useState<null | number[]>(null);
  /** Lỗi THAO TÁC (duyệt / hủy / từ chối) → băng đỏ trên đầu màn, bảng vẫn còn dữ liệu. */
  const [err, setErr] = useState<string | null>(null);
  // Hai bảng = hai lần gọi máy chủ ĐỘC LẬP ⇒ mỗi bảng một cặp "đang tải / lỗi tải" riêng.
  // Dùng chung một ô nhớ thì hàng đợi duyệt hỏng cũng làm bảng phiếu của tôi biến mất.
  const [loadingMine, setLoadingMine] = useState(true);
  const [errMine, setErrMine] = useState<string | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [errQueue, setErrQueue] = useState<string | null>(null);
  // XIN HỦY phiếu ĐÃ DUYỆT (23/09/2026): thợ chỉ xin, người duyệt quyết; phiếu vẫn hiệu lực tới lúc đó.
  const [xinHuyPhieu, setXinHuyPhieu] = useState<OvertimeRequest | null>(null);
  const [xinHuyBusy, setXinHuyBusy] = useState(false);
  const [xinHuyErr, setXinHuyErr] = useState<string | null>(null);
  const [xinHuyQueue, setXinHuyQueue] = useState<XinHuyChoDuyet<OvertimeRequest>[]>([]);

  const load = useCallback(() => {
    const lm = ++luotMine.current;
    setLoadingMine(true);
    setErrMine(null);
    api.overtime
      .mine(token, { ...JSON.parse(khoaMine), page: minePage, size: mineSize })
      .then((r) => {
        if (lm !== luotMine.current) return;
        setHasEmployee(r.has_employee);
        setMine(r.items ?? []);
        setMineTotal(r.total);
        setDemMine(r.dem_theo_tab ?? null);
        // Hủy nốt phiếu cuối của trang 3 ⇒ chỉ còn 2 trang: nhảy về trang cuối còn thật.
        const trangCanVe = trangHopLe(minePage, r.total, mineSize);
        if (trangCanVe !== null) setMinePage(trangCanVe);
      })
      .catch((e) => { if (lm === luotMine.current) setErrMine(errText(e)); })
      .finally(() => { if (lm === luotMine.current) setLoadingMine(false); });
    if (canApprove) {
      const lq = ++luotQueue.current;
      setLoadingQueue(true);
      setErrQueue(null);
      // Mặc định lọc `pending` (bộ lọc trạng thái từ 23/09/2026). Chuyện cũ: không lọc là hàng đợi VÔ DỤNG.
      //
      // Backend sắp xếp theo `status` tăng dần, mà giá trị là CHUỖI THƯỜNG nên thứ tự chữ cái là
      // approved < cancelled < pending < rejected: phiếu ĐÃ DUYỆT đứng trước, phiếu CHỜ DUYỆT bị
      // đẩy xuống cuối. Trước khi có phân trang thì cả 200 dòng nằm chung một bảng nên cuộn xuống
      // vẫn thấy; cắt còn 20 dòng/trang là trang 1 sạch bóng phiếu chờ duyệt, trong khi tab vẫn
      // ghi "Duyệt phiếu (3)" và tiêu đề bảng vẫn ghi "Phiếu chờ duyệt".
      // Tổ trưởng mở ra thấy toàn phiếu đã duyệt, tưởng hết việc rồi bỏ đi.
      api.overtime
        .list(token, { ...JSON.parse(khoaQueue), page: queuePage, size: queueSize })
        .then((r) => {
          if (lq !== luotQueue.current) return;
          setQueue(r.items);
          setQueueTotal(r.total);
          setDemQueue(r.dem_theo_tab ?? null);
          const trangCanVe = trangHopLe(queuePage, r.total, queueSize);
          if (trangCanVe !== null) setQueuePage(trangCanVe);
        })
        .catch((e) => { if (lq === luotQueue.current) setErrQueue(errText(e)); })
        .finally(() => { if (lq === luotQueue.current) setLoadingQueue(false); });
      api.overtime
        .xinHuyChoDuyet(token)
        .then((r) => setXinHuyQueue(r.items))
        .catch(() => setXinHuyQueue([]));
      // Số trên nút tab lấy từ CÙNG nguồn với badge sidebar ⇒ hai chỗ không bao giờ vênh nhau.
      api.overtime
        .summary(token)
        .then((s) => setPendingCount(s.pending_in_scope ?? 0))
        .catch(() => undefined);
    }
    api.overtime.markSeen(token).catch(() => undefined);
    onChanged?.(); // badge sidebar + chuông cập nhật ngay sau mỗi thao tác
  }, [token, canApprove, onChanged, minePage, mineSize, queuePage, queueSize, khoaMine, khoaQueue]);

  // `eventTick` đổi = có sự kiện real-time → tải lại bảng, khỏi bắt người dùng F5.
  useEffect(() => {
    load();
  }, [load, eventTick]);

  const setLocMine = (t: typeof locMine) => {
    setLocMineGoc(t);
    setMinePage(1);
  };
  const setLocQueue = (t: typeof locQueue) => {
    setLocQueueGoc(t);
    setQueuePage(1);
    setSelected(new Set());
  };

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function guiXinHuy(lyDo: string) {
    if (!xinHuyPhieu) return;
    setXinHuyBusy(true);
    setXinHuyErr(null);
    try {
      await api.overtime.xinHuy(token, xinHuyPhieu.id, lyDo);
      setXinHuyPhieu(null);
      load();
    } catch (e) {
      setXinHuyErr(errText(e));
    } finally {
      setXinHuyBusy(false);
    }
  }

  async function huyThang(lyDo: string) {
    if (!huyPhieu) return;
    setHuyBusy(true);
    setHuyErr(null);
    try {
      await api.overtime.cancel(token, huyPhieu.id, lyDo);
      setHuyPhieu(null);
      load();
    } catch (e) {
      setHuyErr(errText(e));
    } finally {
      setHuyBusy(false);
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      setSelected(new Set());
      load();
    } catch (e) {
      setErr(errText(e));
    }
  }

  return (
    // Đầu trang theo khuôn lưới chung (phương án A, 08/10/2026): hàng `lds-dau` tên màn + nút chuyển
    // "Phiếu của tôi | Duyệt phiếu" (đổi cả phần dưới, như Lịch | Bảng của Phiếu bảo trì) + nút chính
    // dạt phải; dưới là thẻ `lds-loc`: hàng lọc nhanh trạng thái rồi thanh kỳ + Lọc. Bỏ eyebrow, bỏ
    // tiêu đề phụ "Phiếu tăng ca của tôi" (nút chuyển đã nói), bỏ số đếm trên nút Duyệt phiếu (luật
    // không badge số trên tab — còn phiếu chờ thì chấm cam, số nằm ở "Chờ duyệt" của hàng lọc).
    <div className="ns lds tc-a">
      <header className="lds-dau">
        <h1 className="lds-dau__ten">Tăng ca</h1>
        {tuPhucVu && canApprove && (
          <div className="lds-xem" role="group" aria-label="Phiếu đang xem">
            <button type="button" className={`lds-xem__nut${tab === "mine" ? " is-active" : ""}`}
              aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>
              Phiếu của tôi
            </button>
            <button type="button" className={`lds-xem__nut${tab === "approve" ? " is-active" : ""}`}
              aria-pressed={tab === "approve"} onClick={() => setTab("approve")}
              title={pendingCount ? `${pendingCount} phiếu chờ duyệt` : undefined}>
              Duyệt phiếu
              {pendingCount > 0 && <i className="lds-xem__cham" aria-label={`${pendingCount} phiếu chờ duyệt`} />}
            </button>
          </div>
        )}
        {/* Hai chế độ không hiện cùng lúc nên màn chỉ có ĐÚNG một nút cam. */}
        <div className="lds-dau__nut">
          {tab === "mine" && tuPhucVu && hasEmployee && tuPhucVuGhi && (
            <Button variant="accent" onClick={() => setCreating("mine")}>
              + Gửi phiếu
            </Button>
          )}
          {tab === "approve" && canApprove && (
            <Button variant="accent" onClick={() => setCreating("for")}>
              + Tạo hộ thợ
            </Button>
          )}
        </div>
      </header>

      {err && <div className="banner banner--error">{err}</div>}

      {tab === "mine" && tuPhucVu && (
        <>
          {hasEmployee && (
            <section className="lds-loc">
              <LocNhanhTrangThai
                dang={locMine.tt}
                onChon={(tt) => setLocMine({ ...locMine, tt })}
                muc={mucLocNhanh(demMine)}
              />
              <div className="lds-loc__thanh tl-thanh">
                <ThanhLoc
                  ky={locMine.ky}
                  moc={MOC_TC}
                  onKy={(ky) => setLocMine({ ...locMine, ky })}
                  dieuKien={dkTabDon<LocTangCa>([], tabTrangThai(demMine))}
                  loc={locMine}
                  onLoc={setLocMine}
                />
                <ChonCot cot={cotPhieuTc({ selectable: false, showEmployee: false })} {...luoiMine.chonCot} />
              </div>
            </section>
          )}
          {!hasEmployee ? (
            <div className="tc-note">
              <span>
                Tài khoản của bạn chưa gắn hồ sơ nhân viên nên chưa gửi phiếu
                được.
              </span>
            </div>
          ) : (
            <RequestTable
              rows={mine}
              showEmployee={false}
              luoi={luoiMine}
              selectable={false}
              selected={selected}
              onToggle={toggle}
              loading={loadingMine}
              listError={errMine}
              onRetry={load}
              emptyTitle={mineCoLoc ? "Không có phiếu nào khớp bộ lọc" : "Chưa có phiếu tăng ca nào"}
              emptySub={
                mineCoLoc
                  ? "Đổi kỳ hoặc chọn tab Tất cả để xem mọi phiếu."
                  : "Bấm “+ Gửi phiếu” để xin khoảng được phép tăng ca."
              }
              actions={(r) =>
                r.status === "pending" ? (
                  <>
                    <RowActionButton
                      dense
                      label="Sửa phiếu"
                      icon="pencil"
                      onClick={() => setEditing(r)}
                    />
                    <RowActionButton
                      dense
                      danger
                      label="Hủy phiếu"
                      icon="x"
                      onClick={() => run(() => api.overtime.cancel(token, r.id))}
                    />
                  </>
                ) : r.status === "approved" && dangXinHuy(r.yeu_cau_huy) ? (
                  <RowActionButton
                    dense
                    label="Rút lại yêu cầu hủy"
                    icon="rotateCcw"
                    onClick={() => run(() => api.overtime.rutLaiXinHuy(token, r.yeu_cau_huy!.id))}
                  />
                ) : r.status === "approved" && r.work_date >= homNayYmd() ? (
                  // Phiếu ĐÃ DUYỆT chỉ được XIN hủy (23/09/2026) — người duyệt quyết. Đã chấm vào tăng
                  // ca thì máy chủ chặn, câu lỗi hiện trong hộp thoại.
                  <RowActionButton
                    dense
                    danger
                    label="Xin hủy phiếu"
                    icon="x"
                    onClick={() => {
                      setXinHuyErr(null);
                      setXinHuyPhieu(r);
                    }}
                  />
                ) : null
              }
              // Chân bảng CHỈ hiện khi có dòng (chuẩn §2.7); lúc tải trang kế vẫn giữ chân để dãy số không nhảy chỗ.
              chan={!errMine && mineTotal > 0 && (
                <PhanTrangDayDu
                  trang={minePage} size={mineSize} tong={mineTotal} soDong={mine.length}
                  loading={loadingMine}
                  donVi="phiếu"
                  onTrang={setMinePage}
                  onSize={(n) => { setMineSize(n); setMinePage(1); }}
                  ariaLabel="Phân trang phiếu tăng ca của tôi"
                />
              )}
            />
          )}
        </>
      )}

      {tab === "approve" && canApprove && (
        <>
          {/* Phạm vi duyệt (scope phòng ban) do máy chủ cắt — tổ trưởng chỉ thấy người trong tổ. Đổi lọc
              ⇒ về trang 1 + bỏ các ô đã tick (thuộc danh sách cũ). */}
          <section className="lds-loc">
            <LocNhanhTrangThai
              dang={queueStatus}
              onChon={(tt) => setLocQueue({ ...locQueue, tt })}
              muc={mucLocNhanh(demQueue)}
            />
            <div className="lds-loc__thanh tl-thanh">
              <ThanhLoc
                ky={locQueue.ky}
                moc={MOC_TC}
                onKy={(ky) => setLocQueue({ ...locQueue, ky })}
                dieuKien={dkTabDon(dieuKienDuyet, tabTrangThai(demQueue))}
                loc={locQueue}
                onLoc={setLocQueue}
              />
              <ChonCot cot={cotPhieuTc({ selectable: true, showEmployee: true })} {...luoiQueue.chonCot} />
            </div>
          </section>
          {selected.size > 0 && (
            <div className="tc-bulkbar">
              <span>Đã chọn {selected.size} phiếu</span>
              <button
                className="btn btn--primary"
                onClick={() =>
                  run(() => api.overtime.bulkApprove(token, [...selected]))
                }
              >
                Duyệt tất cả
              </button>
              <button
                className="btn btn--ghost ns-danger"
                onClick={() => setRejecting([...selected])}
              >
                Từ chối tất cả
              </button>
            </div>
          )}
          <XinHuyHangDoi
            donVi="phiếu"
            dong={xinHuyQueue.map((x) => ({
              yc: x.yeu_cau,
              ten: x.don.employee_name ?? `NV#${x.don.employee_id}`,
              don: tomTat(x.don),
            }))}
            onQuyet={async (yc, dongY, ghiChu) => {
              await api.overtime.quyetXinHuy(token, yc.id, dongY, ghiChu || undefined);
              load();
            }}
          />
          <RequestTable
            rows={queue}
            showEmployee
            luoi={luoiQueue}
            selectable
            selected={selected}
            onToggle={toggle}
            loading={loadingQueue}
            listError={errQueue}
            onRetry={load}
            emptyTitle={
              queueStatus === "pending" && !queueCoLoc
                ? "Chưa có phiếu nào trong phạm vi của bạn"
                : "Không có phiếu nào khớp bộ lọc"
            }
            emptySub={
              queueStatus === "pending" && !queueCoLoc
                ? "Thợ gửi phiếu tăng ca thì việc sẽ hiện ở đây."
                : "Chọn tab trạng thái khác, đổi kỳ hoặc bỏ bớt điều kiện lọc."
            }
            actions={(r) =>
              r.status === "approved" ? (
                // Người duyệt hủy thẳng phiếu ĐÃ DUYỆT — phải ghi lý do, thợ được báo ngay (23/09/2026).
                <RowActionButton
                  dense
                  danger
                  label="Hủy phiếu đã duyệt"
                  icon="x"
                  onClick={() => {
                    setHuyErr(null);
                    setHuyPhieu(r);
                  }}
                />
              ) : r.status === "pending" ? (
                <>
                  <RowActionButton
                    dense
                    label="Duyệt"
                    icon="check"
                    onClick={() => run(() => api.overtime.approve(token, r.id))}
                  />
                  <RowActionButton
                    dense
                    danger
                    label="Từ chối"
                    icon="ban"
                    onClick={() => setRejecting([r.id])}
                  />
                </>
              ) : null
            }
            chan={!errQueue && queueTotal > 0 && (
              <PhanTrangDayDu
                trang={queuePage} size={queueSize} tong={queueTotal} soDong={queue.length}
                loading={loadingQueue}
                donVi="phiếu"
                onTrang={setQueuePage}
                onSize={(n) => { setQueueSize(n); setQueuePage(1); }}
                // "Duyệt tất cả / Từ chối tất cả" chạy trên `selected`, mà ô tick chỉ có ở dòng
                // của trang đang xem ⇒ nói thẳng giới hạn đó, đừng để tổ trưởng tưởng đã dọn
                // sạch cả hàng đợi.
                ghiChu={queueTotal > queueSize ? "duyệt hàng loạt chỉ áp cho trang đang xem" : undefined}
                ariaLabel="Phân trang phiếu tăng ca cần duyệt"
              />
            )}
          />
        </>
      )}

      <LyDoDialog
        open={huyPhieu !== null}
        title="Hủy phiếu tăng ca đã duyệt"
        message={
          huyPhieu
            ? `${huyPhieu.employee_name ?? `NV#${huyPhieu.employee_id}`} · ${tomTat(huyPhieu)}. Người lao động được báo ngay kèm lý do.`
            : undefined
        }
        label="Lý do hủy"
        placeholder="vd: đơn gấp đã xong, tối đó không cần tăng ca"
        confirmLabel="Hủy phiếu"
        danger
        busy={huyBusy}
        error={huyErr}
        onConfirm={huyThang}
        onCancel={() => setHuyPhieu(null)}
      />
      <LyDoDialog
        open={xinHuyPhieu !== null}
        title="Xin hủy phiếu tăng ca đã duyệt"
        message={
          xinHuyPhieu
            ? `${tomTat(xinHuyPhieu)}. Phiếu vẫn hiệu lực cho tới khi người duyệt đồng ý hủy.`
            : undefined
        }
        label="Lý do xin hủy"
        placeholder="vd: con ốm, tối nay không ở lại được"
        confirmLabel="Gửi yêu cầu hủy"
        danger
        busy={xinHuyBusy}
        error={xinHuyErr}
        onConfirm={guiXinHuy}
        onCancel={() => setXinHuyPhieu(null)}
      />
      {creating && (
        <OvertimeFormModal
          token={token}
          forEmployee={creating === "for"}
          onClose={() => setCreating(null)}
          onSaved={() => {
            setCreating(null);
            load();
          }}
        />
      )}
      {editing && (
        <OvertimeFormModal
          token={token}
          forEmployee={false}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {rejecting && (
        <RejectModal
          count={rejecting.length}
          onClose={() => setRejecting(null)}
          onConfirm={(note) => {
            const ids = rejecting;
            setRejecting(null);
            run(() =>
              ids.length > 1
                ? api.overtime.bulkReject(token, ids, note)
                : api.overtime.reject(token, ids[0], note),
            );
          }}
        />
      )}
    </div>
  );
}
