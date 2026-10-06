// Bảng danh sách nhà cung cấp + chân phân trang (tách từ pages/SuppliersPage.tsx).
import { useRef, useState, type Dispatch, type SetStateAction, type MouseEvent } from "react";
import type { SupplierRow } from "../../../../api/client";
import { EmptyRow } from "../../../../components/EmptyState";
import { Icon } from "../../../../components/Icons";
import { PhanTrangDayDu } from "../../../../components/PhanTrangDayDu";
import { SaoNcc } from "./SaoNcc";
import { soNgayVi } from "../shared/helpers";
import { tenDonVi, useNapTenDonVi } from "../../../tenDonVi";
import type { SortNcc } from "../shared/types";

/**
 * Chip "N mặt hàng" + thẻ xem nhanh báo giá.
 *
 * Ba điểm đã sửa so với bản chỉ-hover (chủ chốt 27/09/2026):
 *  · chip là <button>, mở thẻ bằng cả hover LẪN bàn phím (Tab → focus) — bản cũ là <div> hover-only
 *    nên máy cảm ứng và người dùng bàn phím không có đường nào xem được;
 *  · thẻ tự LẬT LÊN khi dòng nằm gần đáy màn — bản cũ ghim `top:100%` nên mấy dòng cuối bị
 *    thành thẻ card cắt mất;
 *  · dòng "+N mặt hàng khác" từ chữ xám chết thành nút mở thẳng tab Bảng giá vật tư.
 */
function ChipMatHang({
  row,
  moBangGia,
}: {
  row: SupplierRow;
  moBangGia: () => void;
}) {
  const [len, setLen] = useState(false);
  const boc = useRef<HTMLDivElement | null>(null);

  // Đo NGAY lúc mở: dưới chip còn chỗ cho thẻ (~200px) thì đổ xuống, không thì lật lên.
  const doHuong = () => {
    const r = boc.current?.getBoundingClientRect();
    if (r) setLen(window.innerHeight - r.bottom < 220);
  };

  return (
    <div
      className={`supplier__items-container ${len ? "is-len" : ""}`}
      ref={boc}
      onMouseEnter={doHuong}
      onFocus={doHuong}
    >
      <button
        type="button"
        className="supplier__items-pill"
        aria-label={`Xem bảng giá ${row.items.length} mặt hàng của ${row.name}`}
        onClick={(e) => {
          e.stopPropagation();
          moBangGia();
        }}
      >
        <Icon name="box" size={12} />
        <span>{row.items.length} mặt hàng</span>
      </button>
      <div className="supplier__items-popover" role="tooltip">
        <div className="supplier__items-popover-head">Báo giá chính</div>
        {row.items.slice(0, 4).map((it, idx) => (
          <div key={idx} className="supplier__items-popover-row">
            <span className="supplier__items-popover-name" title={it.item_name}>
              {it.item_name}
            </span>
            <span className="supplier__items-popover-price">
              {it.unit_price.toLocaleString("vi-VN")}đ/{tenDonVi(it.unit) ?? it.unit}
            </span>
          </div>
        ))}
        {row.items.length > 4 && (
          <button
            type="button"
            className="supplier__items-popover-more"
            onClick={(e) => {
              e.stopPropagation();
              moBangGia();
            }}
          >
            Xem tất cả {row.items.length} mặt hàng
            <Icon name="chevron" size={12} style={{ transform: "rotate(-90deg)" }} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Mốc giờ máy chủ → Date; chuỗi không múi (SQLite) coi là UTC. */
function docMoc(iso: string): Date {
  return new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) || !iso.includes("T") ? iso : `${iso}Z`);
}
/** Cột Ngày tạo: "06/10/2026" theo giờ VN; title của ô mang đủ giờ. */
function ngayTao(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = docMoc(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
}
function gioTao(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = docMoc(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Số cột của bảng — dùng cho `colSpan` của các dòng rỗng/lỗi. */
const SO_COT = 7;

function QuickCopy({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      className={`supplier__quick-copy ${copied ? "is-copied" : ""}`}
      onClick={handleCopy}
      title={copied ? "Đã sao chép!" : `Sao chép ${label || text}`}
    >
      <Icon name={copied ? "check" : "copy"} size={11} />
    </button>
  );
}

export function SuppliersTable({
  loading,
  listError,
  load,
  rows,
  canUpdate,
  openEdit,
  sort,
  setSort,
  total,
  page,
  setPage,
  size,
  onSize,
}: {
  loading: boolean;
  listError: string | null;
  load: () => void;
  rows: SupplierRow[];
  canUpdate: boolean;
  openEdit: (row: SupplierRow, tab?: "info" | "items" | "history") => void;
  sort: SortNcc;
  setSort: Dispatch<SetStateAction<SortNcc>>;
  total: number;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  size: number;
  onSize: (size: number) => void;
}) {
  // Tên đơn vị cho thẻ xem nhanh báo giá ("đ/tờ" chứ không "đ/to").
  useNapTenDonVi();
  const sortSao = sort === "rating" || sort === "-rating";
  function doiSortSao() {
    setSort(sort === "-rating" ? "rating" : sort === "rating" ? "name" : "-rating");
    setPage(1);
  }

  return (
    <>
      {/* Modern Table List */}
      <div className="card md-page__tablewrap supplier__tablewrap">
        <table className="md-page__table supplier__table">
          <colgroup>
            <col className="supplier__col-name" />
            <col className="supplier__col-sao" />
            <col className="supplier__col-contact" />
            <col className="supplier__col-items" />
            <col className="supplier__col-status" />
            <col className="supplier__col-ngay" />
            <col className="supplier__col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Nhà cung cấp</th>
              <th
                className="supplier__th-sort"
                aria-sort={
                  sort === "-rating"
                    ? "descending"
                    : sort === "rating"
                      ? "ascending"
                      : "none"
                }
              >
                <button
                  type="button"
                  className={`supplier__sort-btn${sortSao ? " is-on" : ""}`}
                  onClick={doiSortSao}
                  title="Xếp theo sao đánh giá"
                >
                  Đánh giá
                  <span
                    className={`supplier__sort-caret${sort === "rating" ? " is-up" : ""}${
                      sortSao ? " is-on" : ""
                    }`}
                    aria-hidden="true"
                  >
                    <Icon name="chevron" size={13} />
                  </span>
                </button>
              </th>
              <th>Người liên hệ</th>
              <th>Mặt hàng</th>
              <th>Trạng thái</th>
              <th>Ngày tạo</th>
              <th style={{ textAlign: "right", paddingRight: "16px" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="purchase__skeleton-row">
                  <td><div className="purchase__skeleton-bar" style={{ width: "160px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "110px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "140px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "120px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "90px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "72px" }} /></td>
                  <td><div className="purchase__skeleton-bar" style={{ width: "60px" }} /></td>
                </tr>
              ))
            ) : listError ? (
              <EmptyRow
                colSpan={SO_COT}
                trangThai="loi"
                loi={listError}
                onThuLai={load}
              />
            ) : rows.length === 0 ? (
              <EmptyRow
                colSpan={SO_COT}
                icon="truck"
                title="Chưa có nhà cung cấp nào khớp"
                sub="Khai nhà cung cấp trước, rồi mới khai bảng giá vật tư của họ."
              />
            ) : (
              rows.map((row) => {
                const onTimePercent = row.rating_count > 0 
                  ? Math.round((row.on_time_count / row.rating_count) * 100) 
                  : 100;
                
                // Parse contact position e.g. "Anh Tuấn (Kỹ thuật)" -> Name: "Anh Tuấn", Tag: "Kỹ thuật"
                let contactName = row.contact_name || "";
                let contactTag = "";
                const matchPos = contactName.match(/^(.*?)\s*\((.*?)\)$/);
                if (matchPos) {
                  contactName = matchPos[1];
                  contactTag = matchPos[2];
                }

                return (
                  <tr
                    key={row.id}
                    className="md-page__row"
                    onClick={canUpdate ? () => openEdit(row, "info") : undefined}
                  >
                    {/* Column 1: Supplier Name + MST Copy */}
                    <td className="supplier__name-cell">
                      <div className="supplier__name-box">
                        <div className="supplier__name-meta">
                          <strong className="supplier__primary" title={row.name}>{row.name}</strong>
                          <div className="supplier__mst-row">
                            {row.supplier_group && (
                              <span className="supplier-group-badge" title={row.supplier_group}>
                                {row.supplier_group}
                              </span>
                            )}
                            {/* Cờ "Nhận gia công" trước đây chỉ thấy khi mở từng NCC — danh sách không
                                có cách nào biết ai đang nhận, trong khi hộp Gia công trọn gói của
                                lệnh chỉ cho chọn đúng những NCC này. */}
                            {row.nhan_gia_cong && (
                              <span className="supplier-gia-cong-badge" title="Hiện trong danh sách chọn nhà gia công của lệnh sản xuất">
                                Nhận gia công
                              </span>
                            )}
                            {row.tax_code ? (
                              <>
                                <span className="supplier__mst-code">MST: {row.tax_code}</span>
                                <QuickCopy text={row.tax_code} label="mã số thuế" />
                              </>
                            ) : (
                              <span className="md-page__muted supplier__mst-chua">Chưa có MST</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Column 2: Score Badge + Stars + Delivery Progress */}
                    <td className="supplier__sao-cell">
                      <div className="supplier__rating-box">
                        <div className="supplier__rating-top">
                          {row.rating !== null ? (
                            <span
                              className={`supplier__score-badge ${
                                row.rating >= 4.5
                                  ? "supplier__score-badge--high"
                                  : row.rating >= 3.5
                                  ? "supplier__score-badge--mid"
                                  : "supplier__score-badge--low"
                              }`}
                            >
                              {row.rating.toFixed(1)}
                            </span>
                          ) : (
                            <span className="supplier__score-badge supplier__score-badge--new">
                              Mới
                            </span>
                          )}
                          <SaoNcc rating={row.rating} cao={12} gonKhiTrong />
                        </div>
                        {row.rating !== null ? (
                          <div className="supplier__ontime-progress">
                            <div className="supplier__ontime-bar">
                              <div
                                className={`supplier__ontime-fill ${
                                  onTimePercent >= 80
                                    ? "supplier__ontime-fill--green"
                                    : onTimePercent >= 60
                                    ? "supplier__ontime-fill--amber"
                                    : "supplier__ontime-fill--red"
                                }`}
                                style={{ width: `${onTimePercent}%` }}
                              />
                            </div>
                            <span className="supplier__ontime-text">
                              {row.late_count === 0
                                ? `Đúng hẹn ${row.on_time_count}/${row.rating_count}`
                                : `Đúng hẹn ${row.on_time_count}/${row.rating_count} (trễ TB ${soNgayVi(row.avg_late_days)} ngày)`}
                            </span>
                          </div>
                        ) : (
                          <span className="supplier__ontime-text" style={{ fontStyle: "italic" }}>
                            Chưa phát sinh đơn
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Column 3: Contact Person + 1-Click Call/Mail */}
                    <td className="supplier__contact-cell">
                      <div className="supplier__contact-box">
                        {contactName ? (
                          <div className="supplier__contact-name">
                            <span>{contactName}</span>
                            {contactTag && (
                              <span className="supplier__contact-badge">{contactTag}</span>
                            )}
                          </div>
                        ) : (
                          <span className="md-page__muted">—</span>
                        )}
                        <div className="supplier__contact-lines">
                          {row.phone && (
                            <div className="supplier__contact-line">
                              <a
                                href={`tel:${row.phone}`}
                                className="supplier__contact-link"
                                title={`Gọi ${row.phone}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Icon name="phone" size={11} />
                                <span className="supplier__contact-val">{row.phone}</span>
                              </a>
                              <QuickCopy text={row.phone} label="số điện thoại" />
                            </div>
                          )}
                          {row.email && (
                            <div className="supplier__contact-line">
                              <a
                                href={`mailto:${row.email}`}
                                className="supplier__contact-link"
                                title={row.email}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Icon name="mail" size={11} />
                                <span className="supplier__contact-val">{row.email}</span>
                              </a>
                              <QuickCopy text={row.email} label="email" />
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Column 4: Items Chips & Popover Preview */}
                    <td className="supplier__items-cell">
                      {row.items.length > 0 ? (
                        <ChipMatHang
                          row={row}
                          moBangGia={() => openEdit(row, "items")}
                        />
                      ) : (
                        <span className="md-page__muted supplier__items-empty">
                          Chưa có báo giá
                        </span>
                      )}
                    </td>

                    {/* Column 5: Status Pill + Pulsing Dot */}
                    <td>
                      <span
                        className={`supplier__status-pill ${
                          row.status === "active"
                            ? "supplier__status-pill--active"
                            : "supplier__status-pill--inactive"
                        }`}
                      >
                        <span
                          className={`supplier__status-dot ${
                            row.status === "active"
                              ? "supplier__status-dot--active"
                              : "supplier__status-dot--inactive"
                          }`}
                        />
                        {row.status === "active" ? "Hoạt động" : "Tạm ngừng"}
                      </span>
                    </td>

                    <td className="supplier__ngay-tao" title={gioTao(row.created_at)}>
                      {ngayTao(row.created_at)}
                    </td>

                    {/* Column 6: Quick Action Buttons */}
                    {/* Hai ô LUÔN bày đủ, cái nào không dùng được thì mờ và không bấm — trước đây nút
                        mọc/rụng theo từng dòng nên biểu tượng không thẳng cột, mắt phải dò lại mỗi
                        dòng. `aria-label` chứ không chỉ `title`: tooltip không hiện khi chạm.
                        Nút GỌI đã bỏ (06/10/2026): số điện thoại ở cột Người liên hệ đã là liên kết
                        gọi, nút thứ ba chỉ lặp lại mà làm cột chật tới mức nút bị cắt mép. */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="supplier__action-btns supplier__action-btns--end">
                        <button
                          type="button"
                          className="supplier__action-btn supplier__action-btn--primary"
                          title="Xem / Chỉnh sửa nhà cung cấp"
                          aria-label={`Xem / chỉnh sửa ${row.name}`}
                          onClick={() => openEdit(row, "info")}
                        >
                          <Icon name="pencil" size={13} />
                        </button>
                        <button
                          type="button"
                          className="supplier__action-btn"
                          title={row.items.length > 0 ? "Xem bảng giá vật tư" : "Chưa có báo giá vật tư"}
                          aria-label={`Bảng giá vật tư của ${row.name}`}
                          aria-disabled={row.items.length === 0 || undefined}
                          disabled={row.items.length === 0}
                          onClick={() => openEdit(row, "items")}
                        >
                          <Icon name="fileText" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Chân đặt NGAY SAU thẻ: thẻ vừa có padding vừa là khung cuộn ngang (bảng ≥1080px), đặt
          trong thì chân trôi theo bảng khi cuộn. purchase.css nối hai mảnh thành một khối. */}
      {total > 0 && (
        <PhanTrangDayDu
          trang={page}
          size={size}
          tong={total}
          soDong={rows.length}
          onTrang={setPage}
          onSize={onSize}
          loading={loading}
          donVi="nhà cung cấp"
          ariaLabel="Phân trang nhà cung cấp"
        />
      )}
    </>
  );
}
