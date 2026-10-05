// Khối CÁC ĐỢT GIAO trong drawer chi tiết đơn (tách từ pages/PurchaseRequestsPage.tsx).
// ⚠️ KHỐI CẤM XÉ: bảng đợt + dòng tổng "Đã giao − Đã chi = Còn nợ" + khung xem ảnh hoá đơn là
// một khối công nợ, đọc rời từng mảnh là mất mạch.
import { useState } from "react";
import {
  assetUrl,
  type PurchaseAttachmentRow,
  type PurchaseDeliveryRow,
  type PurchaseRequestRow,
} from "../../../../api/client";
import { useCan } from "../../../../auth/permissions";
import { Button } from "../../../../components/Button";
import { Icon } from "../../../../components/Icons";
import { fmtDate, money } from "../../../../utils/format";
// Đơn vị lưu bằng MÃ (`cai`), tên hiển thị ("cái") nằm ở danh mục Đơn vị — xem pages/tenDonVi.ts.
import { tenDonVi } from "../../../tenDonVi";
import { ATTACHMENT_IMAGE_TYPES, GHI_DOT_DUOC } from "../shared/constants";

/**
 * CÁC ĐỢT GIAO — nơi công nợ thật sự sinh ra.
 *
 * Hàng về tới đâu nợ tới đó: mỗi đợt là một khoản nợ có ngày giao, hạn trả và hoá đơn riêng. Dòng
 * tổng dưới bảng nói đủ ba số để không ai phải tự trừ trong đầu: **Đã giao − Đã chi = Còn nợ**.
 */
export function DeliveriesBlock({
  row,
  canUpdate,
  canApprove,
  onGhiDot,
  onGanHoaDon,
  onXoaDot,
  onDongDon,
  onNhapKho,
  onXemYeuCau,
}: {
  row: PurchaseRequestRow;
  canUpdate: boolean;
  canApprove: boolean;
  onGhiDot: (delivery: PurchaseDeliveryRow | null) => void;
  onGanHoaDon: () => void;
  onXoaDot: (delivery: PurchaseDeliveryRow) => void;
  onDongDon: () => void;
  onNhapKho: (delivery: PurchaseDeliveryRow) => void;
  onXemYeuCau: (delivery: PurchaseDeliveryRow) => void;
}) {
  const ghiDuoc = canUpdate && GHI_DOT_DUOC.includes(row.status);
  // "Nhập kho" nhảy sang màn Kho, tab ĐỀ NGHỊ · Nhập với form điền sẵn ⇒ hỏi đúng ô mở tab đó
  // (`kho:request`), KHÔNG phải `kho:create` — bộ phận mua hàng có `request` mà không có `create`,
  // gác nhầm là giấu nút của chính người cần dùng nó nhiều nhất.
  const coQuyenNhapKho = useCan()("kho", "request");
  const dots = row.deliveries;
  // Khung XEM ẢNH hoá đơn của một đợt. `i` = đang xem tấm thứ mấy (đợt có thể nhiều tấm).
  const [xemAnh, setXemAnh] = useState<null | {
    ds: PurchaseAttachmentRow[];
    i: number;
    dot: number;
  }>(null);

  return (
    <section className="pdot pdot-container">
      <header className="pdot__head">
        <div className="acct-card-section__title">
          <Icon name="truck" size={15} />
          <span>Các đợt giao hàng ({dots.length})</span>
        </div>
        <div className="pdot__headbtns">
          {canUpdate && dots.length > 1 && (
            <Button type="button" variant="ghost" onClick={onGanHoaDon}>
              Gán hóa đơn
            </Button>
          )}
          {/* "Đóng đơn" chỉ có nghĩa khi còn hàng chưa về. Server đòi `thu_mua:approve` + lý do;
              nút vẫn hiện cho người thiếu quyền để họ nhận đúng câu báo thay vì không thấy lối. */}
          {canUpdate && canApprove && row.status === "partially_received" && (
            <Button type="button" variant="ghost" onClick={onDongDon}>
              Đóng đơn
            </Button>
          )}
          {ghiDuoc && (
            // Nút CAM DUY NHẤT của hộp thoại Chi tiết phiếu (xem chú thích ở ContractBlock):
            // ghi đợt giao là việc chính của màn và là đường duy nhất sinh công nợ.
            <Button
              type="button"
              variant="accent"
              onClick={() => onGhiDot(null)}
            >
              <Icon name="plus" size={14} style={{ marginRight: 4 }} />
              Ghi đợt giao
            </Button>
          )}
        </div>
      </header>


      {dots.length === 0 ? (
        <div className="acct-empty-box">
          <div className="acct-empty-box__icon">
            <Icon name="truck" size={26} />
          </div>
          <div className="acct-empty-box__title">Chưa ghi đợt giao hàng nào</div>
          <div className="acct-empty-box__desc">
            {ghiDuoc
              ? "Hàng về đợt nào thì ghi đợt đó — công nợ chỉ phát sinh theo số đã ghi ở đây."
              : row.status === "received"
                ? "Đơn này đã chốt nhận hàng theo đường cũ (không theo dõi theo đợt)."
                : "Đơn phải ở trạng thái Đang mua thì mới ghi được đợt giao."}
          </div>
          {ghiDuoc && (
            <Button
              type="button"
              variant="accent"
              style={{ marginTop: 14 }}
              onClick={() => onGhiDot(null)}
            >
              <Icon name="plus" size={14} />
              Ghi đợt giao đầu tiên
            </Button>
          )}
        </div>
      ) : (
        <div className="acct-delivery-cards">
          {dots.map((dot) => {
            const khoa = dot.paid_amount > 0;
            const hoaDonAttachments = row.attachments.filter(
              (a) => a.delivery_id === dot.id && a.kind === "hoa_don",
            );
            return (
              <div className="acct-delivery-card" key={dot.id}>
                {/* Header Thẻ Đợt Giao */}
                <div className="acct-delivery-card__head">
                  <div className="acct-delivery-card__seq">
                    <span
                      className="acct-delivery-badge"
                      title={
                        dot.created_by_name
                          ? `${dot.created_by_name} ghi ngày ${fmtDate(dot.created_at)}`
                          : undefined
                      }
                    >
                      Đợt {dot.seq_no}
                    </span>
                    <span className="acct-delivery-date">
                      Ngày nhận: {fmtDate(dot.delivery_date)}
                    </span>
                  </div>

                  <div className="acct-delivery-due-meta" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {hoaDonAttachments.length > 0 ? (
                      <button
                        type="button"
                        className="pdot__clip pdot__clip--btn"
                        onClick={() =>
                          setXemAnh({
                            ds: hoaDonAttachments,
                            i: 0,
                            dot: dot.seq_no,
                          })
                        }
                        title={`Xem ${hoaDonAttachments.length} ảnh hoá đơn của đợt ${dot.seq_no}`}
                      >
                        <Icon name="fileText" size={13} />
                        {hoaDonAttachments.length}
                      </button>
                    ) : dot.invoice_number ? (
                      <small style={{ color: "#475569", fontWeight: 600 }}>
                        HD: {dot.invoice_number}
                      </small>
                    ) : (
                      <small style={{ color: "#94a3b8" }}>HĐ: chưa gán</small>
                    )}

                    <div className="acct-delivery-due">
                      Hạn trả: {dot.chua_dat_han ? (
                        <span className="pay-badge pay-badge--warn">Chưa đặt hạn</span>
                      ) : (
                        fmtDate(dot.due_date)
                      )}
                    </div>
                  </div>
                </div>

                {/* Body: Danh sách hàng nhận dạng Bảng mini */}
                <div className="acct-delivery-card__body">
                  <table className="acct-delivery-mini-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }} className="text-center">#</th>
                        <th>Mặt hàng đã nhận</th>
                        <th style={{ textAlign: "right" }}>Số lượng nhận</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dot.lines.map((line, idx) => (
                        <tr key={line.id}>
                          <td style={{ textAlign: "center", color: "#94a3b8" }}>{idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>{line.item_name}</td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                            {line.quantity.toLocaleString("vi-VN")}{" "}
                            <small style={{ color: "#64748b", fontWeight: 400 }}>
                              {tenDonVi(line.unit) ?? line.unit}
                            </small>
                            {line.quantity_du > 0 && (
                              <span
                                className="acct-tag-pill acct-tag-pill--note"
                                style={{ marginLeft: 6, display: "inline-flex" }}
                                title={`${line.quantity_tinh_tien.toLocaleString("vi-VN")} tính tiền · ${line.quantity_du.toLocaleString("vi-VN")} vượt số đặt, giá 0đ`}
                              >
                                Đã nhận {line.quantity.toLocaleString("vi-VN")} · {line.quantity_du.toLocaleString("vi-VN")} dư
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer: Giá trị đợt, đã chi, trừ cọc, còn nợ & Cụm nút thao tác */}
                <div className="acct-delivery-card__foot">
                  <div className="acct-delivery-foot-item">
                    <span className="acct-delivery-foot-item__label">Giá trị đợt</span>
                    <span className="acct-delivery-foot-item__val">{money(dot.amount)}</span>
                  </div>

                  <div className="acct-delivery-foot-item">
                    <span className="acct-delivery-foot-item__label">Đã chi</span>
                    <span className="acct-delivery-foot-item__val">
                      {dot.paid_amount > 0 ? money(dot.paid_amount) : "0 đ"}
                    </span>
                  </div>

                  <div className="acct-delivery-foot-item">
                    <span className="acct-delivery-foot-item__label">Trừ cọc</span>
                    <span className="acct-delivery-foot-item__val">
                      {dot.coc_bu > 0 ? money(dot.coc_bu) : "0 đ"}
                    </span>
                  </div>

                  <div className="acct-delivery-foot-item acct-delivery-foot-item--due">
                    <span className="acct-delivery-foot-item__label">Còn nợ</span>
                    <span className="acct-delivery-foot-item__val">
                      {dot.con_no > 0 ? money(dot.con_no) : "Đã xong"}
                    </span>
                  </div>

                  {canUpdate && (
                    <div className="pdot__rowbtns" style={{ gridColumn: "1 / -1", marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e2e8f0", justifyContent: "flex-end" }}>
                      {coQuyenNhapKho &&
                        (dot.da_nhap_kho ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onXemYeuCau(dot)}
                          >
                            <Icon name="check" size={14} style={{ marginRight: 4 }} />
                            {dot.stock_request_ma ? `Đã nhập · ${dot.stock_request_ma}` : "Đã nhập kho"}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onNhapKho(dot)}
                          >
                            <Icon name="warehouse" size={14} style={{ marginRight: 4 }} />
                            Nhập kho
                          </Button>
                        ))}
                      {!ghiDuoc ? null : khoa ? (
                        <span
                          className="pdot__locked"
                          title="Đợt này đã có phiếu chi — huỷ phiếu chi trước rồi mới sửa/xoá được."
                        >
                          Đã chi — khoá
                        </span>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onGhiDot(dot)}
                          >
                            <Icon name="pencil" size={13} style={{ marginRight: 4 }} />
                            Sửa đợt
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            style={{ color: "#dc2626" }}
                            onClick={() => onXoaDot(dot)}
                          >
                            <Icon name="trash" size={13} style={{ marginRight: 4 }} />
                            Xóa đợt
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dải tổng toàn đơn — CHỈ HIỆN KHI ĐƠN CÓ > 1 ĐỢT GIAO (tránh lặp 2 dải số trùng nhau khi chỉ có 1 đợt) */}
      {dots.length > 1 && (
        <div className="acct-totals-bar">
          <span className="acct-totals-bar__item">
            Đã giao <strong>{money(row.gia_tri_da_giao)}</strong>
          </span>
          <span className="acct-totals-bar__item">
            Đã chi <strong>{money(row.net_paid)}</strong>
            {row.receipt_received_amount > 0 && (
              <small style={{ color: "#64748b" }}> (đã trừ {money(row.receipt_received_amount)} thu về)</small>
            )}
          </span>
          <span className="acct-totals-bar__item acct-totals-bar__item--due">
            Còn nợ <strong>{money(row.outstanding_amount)}</strong>
          </span>
        </div>
      )}

      {/* KHUNG XEM ẢNH hoá đơn — chỉ để NHÌN: không ô nhập, không nút lưu, đóng là xong.
          Có nút mở tab mới cho ai cần phóng to / tải về, và mũi tên khi đợt có nhiều tấm. */}
      {xemAnh && xemAnh.ds.length > 0 && (
        <div
          className="pdot__lb"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setXemAnh(null);
          }}
        >
          <div
            className="pdot__lb-box"
            role="dialog"
            aria-modal="true"
            aria-label={`Ảnh hoá đơn đợt ${xemAnh.dot}`}
          >
            <header className="pdot__lb-head">
              <span className="pdot__lb-name">
                Hoá đơn · đợt {xemAnh.dot}
                {xemAnh.ds.length > 1 && (
                  <small>
                    {" "}
                    ({xemAnh.i + 1}/{xemAnh.ds.length})
                  </small>
                )}
              </span>
              <div className="pdot__lb-acts">
                <a
                  href={assetUrl(xemAnh.ds[xemAnh.i].file_url) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  title="Mở tab mới / tải về"
                >
                  Mở tab mới
                </a>
                <button
                  type="button"
                  onClick={() => setXemAnh(null)}
                  aria-label="Đóng"
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            </header>
            <div className="pdot__lb-body">
              {ATTACHMENT_IMAGE_TYPES.includes(
                xemAnh.ds[xemAnh.i].file_type ?? "",
              ) ? (
                <img
                  src={assetUrl(xemAnh.ds[xemAnh.i].file_url) ?? ""}
                  alt={xemAnh.ds[xemAnh.i].file_name}
                />
              ) : (
                // PDF cũng đính kèm được ở đây — nhúng thẳng, khỏi bắt tải về mới xem được.
                <iframe
                  src={assetUrl(xemAnh.ds[xemAnh.i].file_url) ?? ""}
                  title={xemAnh.ds[xemAnh.i].file_name}
                />
              )}
            </div>
            {xemAnh.ds.length > 1 && (
              <footer className="pdot__lb-nav">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setXemAnh((c) =>
                      c
                        ? { ...c, i: (c.i - 1 + c.ds.length) % c.ds.length }
                        : c,
                    )
                  }
                >
                  <Icon name="chevron" size={14} style={{ transform: "rotate(90deg)" }} />
                  Trước
                </Button>
                <span className="pdot__lb-filename">
                  {xemAnh.ds[xemAnh.i].file_name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setXemAnh((c) =>
                      c ? { ...c, i: (c.i + 1) % c.ds.length } : c,
                    )
                  }
                >
                  Sau
                  <Icon name="chevron" size={14} style={{ transform: "rotate(-90deg)" }} />
                </Button>
              </footer>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
