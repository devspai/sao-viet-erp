// Drawer CHI TIẾT công nợ một nhà cung cấp (tách từ pages/AccountingPayablesPage.tsx).
// Hai khối con — "Đợt giao còn nợ" và "Đã trả" — là hai <section> anh em, giữ nguyên thứ tự.
import { useEffect, useMemo, useState } from "react";
import { ApiError, api, type PayablesDetail } from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import type { NavigateFn } from "../../../../components/AppShell";
import { Icon } from "../../../../components/Icons";
import { money } from "../../../../utils/format";
import { BUCKET_LABEL, PAID_PAGE } from "../shared/constants";
import type { Bucket } from "../shared/types";
import { DaTraBlock } from "./DaTraBlock";
import { DotConNoBlock } from "./DotConNoBlock";

export function PayablesDrawer({
  supplierId,
  supplierName,
  bucket,
  canCreateVoucher,
  navigate,
  onClose,
  onChanged,
}: {
  supplierId: number;
  supplierName: string;
  bucket: Bucket;
  canCreateVoucher: boolean;
  navigate: NavigateFn;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [detail, setDetail] = useState<PayablesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "paid" chỉ còn ý nghĩa CHỌN TAB (bấm thẳng số "Đã trả" ngoài bảng thì mở sẵn tab lịch sử,
  // số "Quá hạn" thì mở sẵn tab đợt còn nợ); trong tab "Đợt còn nợ" chỉ còn hai rổ all/overdue.
  // Mở từ dòng NCC (rổ "all") ⇒ vào tab Tổng quan & Hạn mức — chuẩn chung của drawer Kế toán.
  const [view, setView] = useState<"overview" | "open" | "history">(
    bucket === "paid" ? "history" : bucket === "overdue" ? "open" : "overview",
  );
  const [tab, setTab] = useState<Bucket>(bucket === "paid" ? "all" : bucket);
  const [paidShown, setPaidShown] = useState(PAID_PAGE);
  // Nới rổ "đã chi" ra toàn bộ lịch sử. NCC trả hết từ 5 tháng trước thì rổ này rỗng theo kỳ —
  // tra ra "không nợ" mà không thấy đã trả những gì. Nới chỉ cho MỘT NCC nên vẫn nhẹ.
  const [xemHetLichSu, setXemHetLichSu] = useState(false);

  // Tách riêng thành hàm gọi lại được: `onChanged` (báo lên trang danh sách) KHÔNG tự kéo lại
  // `detail` của CHÍNH drawer đang mở — trước giờ không lộ vì mọi hành động tạo phiếu trong drawer
  // đều điều hướng-rời-trang ngay sau đó (`navigate("ke-toan-don-mua-hang", ...)`). Thanh toán
  // gộp (04/09/2026) là luồng ĐẦU TIÊN lập phiếu mà VẪN Ở LẠI drawer — không gọi lại thì đợt vừa
  // trả xong tiếp tục hiện "còn nợ" y như cũ cho tới khi đóng/mở lại.
  function reload() {
    if (!token) return;
    setLoading(true);
    api.accounting
      .payablesDetail(token, supplierId, xemHetLichSu)
      .then(setDetail)
      .catch((err) => {
        setDetail(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Không tải được chi tiết công nợ.",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, [token, supplierId, xemHetLichSu]);

  // Drawer chỉ-xem: Esc để đóng (trước đây do DetailModal lo, nay drawer tự nghe).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const khoanNo = useMemo(() => {
    const items = detail?.items ?? [];
    return tab === "overdue" ? items.filter((x) => x.overdue_days > 0) : items;
  }, [detail, tab]);
  // Server đã sắp: đợt chưa có hạn lên ĐẦU, còn lại theo hạn trả tăng dần. Không sắp lại ở đây —
  // sắp hai nơi là hai nơi lệch nhau.
  const chuaDatHan = useMemo(
    () => (detail?.items ?? []).filter((x) => x.chua_dat_han).length,
    [detail],
  );
  const conDuocNo = detail
    ? Math.max(0, detail.credit_limit - detail.total_due)
    : 0;
  // Backend cũ hơn giao diện có thể thiếu `items`/`paid` — xem banner lỗi ở thân drawer.
  const chiTietHopLe =
    detail != null && Array.isArray(detail.items) && Array.isArray(detail.paid);

  return (
    <div className="rc-drawer__scrim" onClick={onClose}>
      <aside
        className="rc-drawer purchase__drawer-780 acct-cnt-drawer acct-dmh-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={supplierName}
      >
        <div className="purchase__hero-banner">
          <div className="purchase__hero-top">
            <div>
              <span className="purchase__hero-kicker">Công nợ phải trả</span>
              <div className="purchase__hero-title-row">
                <h2 className="purchase__hero-code">{supplierName}</h2>
                {detail?.vuot_han_muc ? (
                  <span className="pay-badge pay-badge--danger">
                    <i className="pay-badge__dot" />
                    Vượt hạn mức {money(detail.vuot_bao_nhieu)}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="purchase__hero-x"
              onClick={onClose}
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
          {detail && (
            <dl className="acct-hero-facts cnt-chuan__hero-facts">
              <div>
                <dt>
                  <Icon name="calculator" size={13} />
                  Đang nợ
                </dt>
                <dd>{money(detail.total_due)}</dd>
              </div>
              <div>
                <dt>
                  <Icon name="alert" size={13} />
                  Quá hạn
                </dt>
                <dd className={detail.overdue_amount > 0 ? "cnt-chuan__fact--do" : undefined}>
                  {detail.overdue_amount > 0 ? money(detail.overdue_amount) : "—"}
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="shield" size={13} />
                  Hạn mức
                </dt>
                <dd>{detail.credit_limit > 0 ? money(detail.credit_limit) : "Chưa đặt"}</dd>
              </div>
            </dl>
          )}
        </div>

        {/* Dải tab con chia theo nội dung thật của drawer: khung hạn mức, việc phải làm (đợt còn
            nợ), lịch sử tra cứu (đã trả). Tách ba việc khác nhau, cuộn quá tay không lẫn vào nhau. */}
        {detail && chiTietHopLe && (
          <div className="acct-drawer__tabs" role="tablist" aria-label="Chi tiết công nợ nhà cung cấp">
            <button
              type="button"
              role="tab"
              aria-selected={view === "overview"}
              className={`acct-drawer__tab-btn${view === "overview" ? " is-active" : ""}`}
              onClick={() => setView("overview")}
            >
              <Icon name="shield" size={15} />
              <span>Tổng quan & Hạn mức</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "open"}
              className={`acct-drawer__tab-btn${view === "open" ? " is-active" : ""}`}
              onClick={() => setView("open")}
            >
              <Icon name="calculator" size={15} />
              <span>Đợt còn nợ</span>
              {detail.items.length > 0 && (
                <span className="acct-drawer__tab-badge">{detail.items.length}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "history"}
              className={`acct-drawer__tab-btn${view === "history" ? " is-active" : ""}`}
              onClick={() => setView("history")}
            >
              <Icon name="fileCheck" size={15} />
              <span>Đã trả</span>
              {detail.paid.length > 0 && (
                <span className="acct-drawer__tab-badge">{detail.paid.length}</span>
              )}
            </button>
          </div>
        )}

        <div className="rc-drawer__body acct-dmh__body">
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="cnt-chuan__skel" aria-label="Đang tải">
          <div className="purchase__skeleton-bar" style={{ width: "100%", height: 64 }} />
          <div className="purchase__skeleton-bar" style={{ width: "70%" }} />
          <div className="purchase__skeleton-bar" style={{ width: "90%" }} />
        </div>
      )}

      {/* Chặn TRẮNG TRANG khi backend cũ hơn giao diện: thiếu `items`/`paid` là `.length` ném lỗi
          và React gỡ nguyên cây, mất cả màn. Báo rõ ra thay vì sập — và cũng không im lặng coi như
          danh sách rỗng, vì rỗng có nghĩa khác hẳn. */}
      {detail && !(Array.isArray(detail.items) && Array.isArray(detail.paid)) && (
        <div className="banner banner--error" role="alert">
          Dữ liệu trả về thiếu phần công nợ theo đợt giao — máy chủ đang chạy
          bản cũ hơn giao diện. Khởi động lại backend rồi tải lại trang.
        </div>
      )}

      {detail && chiTietHopLe && (
        <>
          {view === "overview" && (
            <>
              {/* CẢNH BÁO MỀM (Đ6): chỉ nhắc, không chặn gì. */}
              {detail.vuot_han_muc && (
                <div className="banner banner--warn cnt-chuan__canh-bao" role="status">
                  Đang nợ {money(detail.total_due)} — vượt hạn mức {money(detail.credit_limit)} là{" "}
                  <strong>{money(detail.vuot_bao_nhieu)}</strong>. Đây là cảnh báo, không chặn mua hàng.
                </div>
              )}
              {/* HẠN MỨC là khung để đọc mọi con số khác. Chưa đặt hạn mức thì nói thẳng "chưa
                  đặt", đừng hiện 0đ — 0 trông như "hạn mức bằng không". */}
              <div className="acct-kpi-grid">
                <div className="acct-kpi-card acct-kpi-card--total">
                  <div className="acct-kpi-card__head">
                    <span className="acct-kpi-card__label">Hạn mức công nợ</span>
                  </div>
                  <div className="acct-kpi-card__val">
                    {detail.credit_limit > 0 ? (
                      money(detail.credit_limit)
                    ) : (
                      <span className="pay-cell--zero">Chưa đặt</span>
                    )}
                  </div>
                </div>
                <div
                  className={`acct-kpi-card acct-kpi-card--due${
                    detail.vuot_han_muc || detail.overdue_amount > 0 ? " is-overdue" : ""
                  }`}
                >
                  <div className="acct-kpi-card__head">
                    <span className="acct-kpi-card__label">Đang nợ</span>
                    {detail.overdue_amount > 0 && (
                      <span className="acct-kpi-card__tag">Có quá hạn</span>
                    )}
                  </div>
                  <div className={`acct-kpi-card__val${detail.vuot_han_muc ? " pay-cell--danger" : ""}`}>
                    {money(detail.total_due)}
                  </div>
                </div>
                <div className="acct-kpi-card acct-kpi-card--delivered">
                  <div className="acct-kpi-card__head">
                    <span className="acct-kpi-card__label">Còn được nợ</span>
                  </div>
                  <div className="acct-kpi-card__val">
                    {detail.credit_limit > 0 ? (
                      money(conDuocNo)
                    ) : (
                      <span className="pay-cell--zero">Không giới hạn</span>
                    )}
                  </div>
                </div>
                <div className="acct-kpi-card acct-kpi-card--paid">
                  <div className="acct-kpi-card__head">
                    <span className="acct-kpi-card__label">Số ngày cho nợ</span>
                  </div>
                  <div className="acct-kpi-card__val">
                    {/* 0 và "chưa đặt" là HAI ca khác hẳn — gộp là hiểu sai cả cột Quá hạn. */}
                    {detail.credit_days == null ? (
                      <span className="pay-cell--zero">Chưa đặt</span>
                    ) : detail.credit_days === 0 ? (
                      "Trả ngay"
                    ) : (
                      `${detail.credit_days} ngày`
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {view === "open" && (
            <>
              <div className="acct-toolbar__tabs cnt-chuan__rosub" role="tablist" aria-label="Lọc đợt còn nợ">
                {(["all", "overdue"] as Bucket[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={`acct-toolbar__tab${tab === id ? " is-active" : ""}`}
                    onClick={() => setTab(id)}
                  >
                    {BUCKET_LABEL[id]}
                  </button>
                ))}
              </div>

              <DotConNoBlock
                detail={detail}
                tab={tab}
                khoanNo={khoanNo}
                chuaDatHan={chuaDatHan}
                canCreateVoucher={canCreateVoucher}
                navigate={navigate}
                onClose={onClose}
                onChanged={() => {
                  onChanged();
                  reload();
                }}
              />
            </>
          )}

          {view === "history" && (
            <DaTraBlock
              detail={detail}
              paidShown={paidShown}
              setPaidShown={setPaidShown}
              setXemHetLichSu={setXemHetLichSu}
            />
          )}
        </>
      )}
        </div>
      </aside>
    </div>
  );
}
