// Tab "Hoá đơn còn nợ" của ngăn Công nợ phải thu (đặc tả NPTh-2): mỗi dòng một hoá đơn bán.
//
// Hoá đơn = ký hiệu + số, dòng phụ ngày hoá đơn + thẻ mã đơn bán (link sang Đơn hàng bán) | Hạn thu
// (ngày + thẻ "Trễ N ngày", chưa có hạn thì thẻ "Chưa đặt hạn") | Giá trị | Trừ cọc | Đã thu | Còn nợ
// | nút "Thu tiền". Bấm "Thu tiền" mở khung thu NGAY DƯỚI dòng đó (NPTh-3), không lớp phủ nào.
import { Fragment } from "react";

import type { PaymentReceiptRow, ReceivableItemRow } from "../../../../api/client";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, vietSo } from "../../shared/dinhDang";
import { so } from "../../shared/oCongNo";
import { TheTre } from "../../shared/TheTre";
import { InvoiceReceiptForm } from "./InvoiceReceiptForm";

export function HoaDonConNoBlock({
  items,
  customerName,
  coThu,
  moThu,
  onMoThu,
  onDaLap,
  onBan,
  onMoDon,
  onMoTaiKhoan,
}: {
  /** Hoá đơn đang hiện (đã lọc theo nút), giữ thứ tự máy chủ. */
  items: ReceivableItemRow[];
  customerName: string;
  /** Có quyền lập phiếu thu ⇒ có nút "Thu tiền". */
  coThu: boolean;
  /** Hoá đơn đang mở khung thu. */
  moThu: number | null;
  onMoThu: (invoiceId: number | null) => void;
  onDaLap: (item: ReceivableItemRow, receipt: PaymentReceiptRow) => void;
  onBan: (ban: boolean) => void;
  /** Không có = không có quyền xem Đơn hàng bán ⇒ mã đơn là thẻ chữ thường. */
  onMoDon?: (orderId: number) => void;
  onMoTaiKhoan?: () => void;
}) {
  if (items.length === 0) return <p className="kt-mo">Không có hoá đơn nào khớp.</p>;
  return (
    <div className="kt-nhom">
      <table>
        <thead>
          <tr>
            <th>Hoá đơn</th>
            <th>Hạn thu</th>
            <th className="kt-so">Giá trị</th>
            <th className="kt-so">Trừ cọc</th>
            <th className="kt-so">Đã thu</th>
            <th className="kt-so">Còn nợ</th>
            <th aria-label="Thao tác" />
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <Fragment key={row.invoice_id}>
              <tr>
                <td>
                  <span>{row.invoice_symbol ? `${row.invoice_symbol} ${row.invoice_number}` : row.invoice_number}</span>
                  <Cum className="kt-phu">
                    <span>{ngay(row.invoice_date).slice(0, 5)}</span>
                    <TheNho>
                      {onMoDon ? (
                        <button type="button" className="kt-lk" onClick={() => onMoDon(row.order_id)}>{row.order_code}</button>
                      ) : (
                        row.order_code
                      )}
                    </TheNho>
                  </Cum>
                </td>
                <td>
                  {row.chua_dat_han || !row.due_date ? (
                    <TheNho>Chưa đặt hạn</TheNho>
                  ) : (
                    <Cum>
                      <span>{ngay(row.due_date)}</span>
                      <TheTre soNgay={row.overdue_days} moc={row.aging_bucket} />
                    </Cum>
                  )}
                </td>
                <td className="kt-so">{vietSo(row.amount)}</td>
                <td className="kt-so">{so(row.deposit_offset_amount)}</td>
                <td className="kt-so">{so(row.direct_received_amount)}</td>
                <td className="kt-so">
                  <b>{so(row.remaining_amount)}</b>
                </td>
                <td className="kt-so">
                  {coThu && row.remaining_amount > 0 && moThu !== row.invoice_id && (
                    <button type="button" className="kt-btn kt-btn--nho" onClick={() => onMoThu(row.invoice_id)}>
                      Thu tiền
                    </button>
                  )}
                </td>
              </tr>
              {moThu === row.invoice_id && (
                <tr className="kt-khung-dong">
                  <td colSpan={7}>
                    <InvoiceReceiptForm item={row} customerName={customerName} onDong={() => onMoThu(null)}
                      onDaLap={(r) => onDaLap(row, r)} onMoTaiKhoan={onMoTaiKhoan} onBan={onBan} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
