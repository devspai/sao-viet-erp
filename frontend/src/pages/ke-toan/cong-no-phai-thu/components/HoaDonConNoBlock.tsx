// Tab "Còn nợ" của ngăn Công nợ phải thu (phương án 2, 06/10/2026): mỗi dòng một hoá đơn bán CÒN nợ.
//
// Hoá đơn = "Số X" đậm, dòng phụ: thẻ ký hiệu, mã đơn bán (link sang Đơn hàng bán), ngày hoá đơn đủ
// năm | Hạn thu (ngày + thẻ "Còn N ngày" / "Trễ N ngày") | Giá trị | Đã thu và trừ cọc (MỘT cột: dòng
// phụ "gồm trừ cọc X" khi có cọc — hai cột rời toàn "—" chỉ để báo không có gì) | Còn nợ (đỏ khi trễ)
// | nút "Thu". Bấm "Thu" mở ngăn chồng Thu tiền hoá đơn (`ThuTienHoaDon`).
import type { ReceivableItemRow } from "../../../../api/client";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, vietSo } from "../../shared/dinhDang";
import { TheHan } from "../../shared/TheTre";

export function HoaDonConNoBlock({
  items,
  homNay,
  coThu,
  onThu,
  onMoDon,
}: {
  /** Hoá đơn đang hiện (đã lọc), giữ thứ tự máy chủ. */
  items: ReceivableItemRow[];
  /** Ngày máy chủ tính nợ — mốc của "Còn N ngày". */
  homNay: string;
  /** Có quyền lập phiếu thu ⇒ có nút "Thu". */
  coThu: boolean;
  /** Bấm "Thu" ⇒ ngăn chồng thu tiền hoá đơn này. */
  onThu: (item: ReceivableItemRow) => void;
  /** Không có = không có quyền xem Đơn hàng bán ⇒ mã đơn là chữ thường. */
  onMoDon?: (orderId: number) => void;
}) {
  if (items.length === 0) return <p className="kt-mo">Không có hoá đơn nào còn nợ ở mục này.</p>;
  return (
    <div className="kt-nhom kt-no-hd">
      <table>
        <thead>
          <tr>
            <th>Hoá đơn</th>
            <th>Hạn thu</th>
            <th className="kt-so">Giá trị</th>
            <th className="kt-so">Đã thu và trừ cọc</th>
            <th className="kt-so">Còn nợ</th>
            {coThu && <th aria-label="Thao tác" />}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.invoice_id}>
              <td>
                <b>{`Số ${row.invoice_number}`}</b>
                <Cum className="kt-phu">
                  {row.invoice_symbol && <TheNho>{`Ký hiệu ${row.invoice_symbol}`}</TheNho>}
                  {onMoDon ? (
                    <button type="button" className="kt-lk" onClick={() => onMoDon(row.order_id)}>{`Đơn ${row.order_code}`}</button>
                  ) : (
                    <span>{`Đơn ${row.order_code}`}</span>
                  )}
                  <span>{ngay(row.invoice_date)}</span>
                </Cum>
              </td>
              <td>
                {row.chua_dat_han || !row.due_date ? (
                  <TheNho>Chưa đặt hạn</TheNho>
                ) : (
                  <>
                    <span>{ngay(row.due_date)}</span>
                    <Cum className="kt-phu">
                      <TheHan han={row.due_date} homNay={homNay} soNgayTre={row.overdue_days} moc={row.aging_bucket} />
                    </Cum>
                  </>
                )}
              </td>
              <td className="kt-so">{vietSo(row.amount)}</td>
              <td className="kt-so">
                {row.received_amount > 0 ? vietSo(row.received_amount) : <span className="kt-mo">0</span>}
                {row.deposit_offset_amount > 0 && (
                  <span className="kt-phu">{`gồm trừ cọc ${vietSo(row.deposit_offset_amount)}`}</span>
                )}
              </td>
              <td className="kt-so">
                <b className={row.overdue_days > 0 ? "kt-do" : undefined}>{vietSo(row.remaining_amount)}</b>
              </td>
              {coThu && (
                <td className="kt-so">
                  <button type="button" className="kt-btn kt-btn--nho" aria-label={`Thu tiền hoá đơn số ${row.invoice_number}`}
                    onClick={() => onThu(row)}>
                    Thu
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
