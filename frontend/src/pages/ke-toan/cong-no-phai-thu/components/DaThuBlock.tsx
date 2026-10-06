// Tab "Đã thu" của ngăn Công nợ phải thu (đặc tả NPTh-2): tiền đã vào quỹ từ khách, từng lần một.
// "Trong kỳ" = kỳ đang chọn ở trang, "Tất cả" = mọi lần thu. Cột Áp vào là thẻ (Thu hoá đơn / Trừ
// cọc); "Hoá đơn và đơn" = số hoá đơn + thẻ mã đơn bán. Khung (nhóm nút, rỗng, Xem thêm) dùng chung
// với tab "Đã trả" của Công nợ phải trả: `KhungLanTra`; máy chủ cắt trang, ngăn nối trang.
import type { ReceivablesDetail } from "../../../../api/client";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, vietSo } from "../../shared/dinhDang";
import { KhungLanTra, type PhamViDaTra } from "../../shared/KhungLanTra";
import { methodText } from "../shared/helpers";

export function DaThuBlock({
  detail,
  phamVi,
  onPhamVi,
  onMoPhieu,
  onXemThem,
  dangTaiThem = false,
}: {
  detail: ReceivablesDetail;
  phamVi: PhamViDaTra;
  onPhamVi: (v: PhamViDaTra) => void;
  /** Không có = không có quyền xem Phiếu thu ⇒ mã phiếu là chữ thường. */
  onMoPhieu?: (code: string) => void;
  onXemThem: () => void;
  dangTaiThem?: boolean;
}) {
  const paid = detail.paid;
  return (
    <KhungLanTra phamVi={phamVi} onPhamVi={onPhamVi} tong={detail.paid_total ?? paid.length} soDaTai={paid.length}
      donVi="lần thu" tongTien={detail.received_in_period} chuRongKy="Chưa thu lần nào trong kỳ này."
      nutXemMoi="Xem mọi lần thu" chuRongTatCa="Chưa thu lần nào của khách hàng này."
      onXemThem={onXemThem} dangTaiThem={dangTaiThem}>
      <div className="kt-nhom">
        <table>
          <thead>
            <tr>
              <th>Ngày thu</th>
              <th>Mã phiếu</th>
              <th>Áp vào</th>
              <th>Hoá đơn và đơn</th>
              <th>Hình thức</th>
              <th className="kt-so">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            {paid.map((row) => (
              <tr key={row.receipt_id}>
                <td>{ngay(row.receipt_date)}</td>
                <td>
                  {onMoPhieu ? (
                    <button type="button" className="kt-lk" onClick={() => onMoPhieu(row.code)}>{row.code}</button>
                  ) : (
                    row.code
                  )}
                </td>
                <td>
                  <TheNho>{row.applied_to === "deposit_offset" ? "Trừ cọc" : "Thu hoá đơn"}</TheNho>
                </td>
                <td>
                  {row.sales_invoice_number || row.order_code ? (
                    <Cum>
                      {row.sales_invoice_number && <span>{row.sales_invoice_number}</span>}
                      {row.order_code && <TheNho>{row.order_code}</TheNho>}
                    </Cum>
                  ) : (
                    <span className="kt-mo">—</span>
                  )}
                </td>
                <td>{methodText(row.receipt_method)}</td>
                <td className="kt-so">{vietSo(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungLanTra>
  );
}
