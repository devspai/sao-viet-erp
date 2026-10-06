// Tab "Đã trả" của ngăn Công nợ phải trả (đặc tả NPT-2): tiền đã rời quỹ cho nhà cung cấp, từng lần
// một — cộng lại đúng bằng cột "Đã trả trong kỳ" ngoài bảng. "Trong kỳ" = kỳ đang chọn ở trang,
// "Tất cả" = mọi lần trả (nhà cung cấp trả hết từ lâu vẫn tra được đã trả những gì).
//
// Máy chủ cắt trang (`paid_page`/`paid_size`): `detail.paid` là các lần ĐÃ TẢI, `paid_total` là tổng số
// lần trong phạm vi. "Xem thêm" do ngăn tải trang kế rồi nối vào. Khung (nhóm nút, rỗng, Xem thêm)
// dùng chung với tab "Đã thu" của Công nợ phải thu: `KhungLanTra`.
import type { PayablesDetail } from "../../../../api/client";
import { ThieuChungTu } from "../../shared/BangPhieu";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, vietSo } from "../../shared/dinhDang";
import { KhungLanTra, type PhamViDaTra } from "../../shared/KhungLanTra";
import { HoaDon } from "./payablesCells";

export type { PhamViDaTra };

export function DaTraBlock({
  detail,
  phamVi,
  onPhamVi,
  onMoPhieu,
  onMoDon,
  onXemThem,
  dangTaiThem = false,
}: {
  detail: PayablesDetail;
  phamVi: PhamViDaTra;
  onPhamVi: (v: PhamViDaTra) => void;
  /** Không có = không có quyền xem Phiếu chi ⇒ mã phiếu là chữ thường. */
  onMoPhieu?: (code: string) => void;
  onMoDon?: (code: string) => void;
  onXemThem: () => void;
  dangTaiThem?: boolean;
}) {
  const paid = detail.paid;

  return (
    <KhungLanTra phamVi={phamVi} onPhamVi={onPhamVi} tong={detail.paid_total ?? paid.length} soDaTai={paid.length}
      donVi="lần trả" tongTien={detail.paid_in_period} chuRongKy="Chưa trả lần nào trong kỳ này."
      nutXemMoi="Xem mọi lần trả" chuRongTatCa="Chưa trả lần nào cho nhà cung cấp này."
      onXemThem={onXemThem} dangTaiThem={dangTaiThem}>
      <div className="kt-nhom">
        <table>
          <thead>
            <tr>
              <th>Ngày trả</th>
              <th>Mã phiếu</th>
              {/* Phải nói ĐỢT MẤY: người cầm sao kê nhà cung cấp dò từng dòng ứng với đợt nào. */}
              <th>Đơn mua và đợt</th>
              <th>Hoá đơn</th>
              <th>Người lập</th>
              <th className="kt-so">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            {paid.map((row) => (
              <tr key={row.voucher_id}>
                <td>{ngay(row.paid_date)}</td>
                <td>
                  <Cum>
                    {onMoPhieu ? (
                      <button type="button" className="kt-lk" onClick={() => onMoPhieu(row.code)}>{row.code}</button>
                    ) : (
                      <span>{row.code}</span>
                    )}
                    {/* Cảnh báo, không chặn — tiền đã ra rồi. */}
                    {!row.has_attachment && <ThieuChungTu />}
                  </Cum>
                </td>
                <td>
                  <Cum>
                    {onMoDon ? (
                      <button type="button" className="kt-lk" onClick={() => onMoDon(row.purchase_code)}>{row.purchase_code}</button>
                    ) : (
                      <span>{row.purchase_code}</span>
                    )}
                    <TheNho>
                      {row.payment_stage === "advance"
                        ? "Đặt cọc"
                        : row.delivery_seq_no != null
                          ? `Đợt ${row.delivery_seq_no}`
                          : "Không theo đợt"}
                    </TheNho>
                  </Cum>
                </td>
                <td>
                  <HoaDon so={row.invoice_number} ngayHd={row.invoice_date} />
                </td>
                <td>{row.created_by_name || <span className="kt-mo">—</span>}</td>
                <td className="kt-so">{vietSo(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </KhungLanTra>
  );
}
