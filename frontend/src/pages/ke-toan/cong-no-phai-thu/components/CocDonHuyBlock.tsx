/** Cọc của đơn ĐÃ HUỶ khách còn để lại (13/10/2026): mỗi đơn một dòng, nút "Trả lại cọc" lập phiếu chi
 *  gắn đúng đơn — trả xong đơn rụng khỏi đây và khỏi ô lọc "Chờ trả lại cọc" của màn Đơn hàng. */
import type { CocDonHuy } from "../../../../api/client";
import { soVN } from "../../../../components/LuoiDs";

export function CocDonHuyBlock({
  ds,
  onMoDon,
  onTraLai,
}: {
  ds: CocDonHuy[];
  onMoDon?: (orderId: number) => void;
  /** Vắng = không có quyền lập phiếu chi. */
  onTraLai?: (d: CocDonHuy) => void;
}) {
  return (
    <div className="lds-bang kt-coc-huy">
      <table className="lds-g" aria-label="Cọc đơn huỷ còn giữ">
        <colgroup>
          <col />
          <col style={{ width: 130 }} />
          <col style={{ width: 130 }} />
          {onTraLai && <col style={{ width: 120 }} />}
        </colgroup>
        <thead>
          <tr>
            <th>Đơn đã huỷ</th>
            <th className="n">Cọc đã nhận</th>
            <th className="n">Còn giữ</th>
            {onTraLai && <th aria-label="Trả lại cọc" />}
          </tr>
        </thead>
        <tbody>
          {ds.map((d) => (
            <tr key={d.order_id}>
              <td>
                {onMoDon ? (
                  <button type="button" className="kt-lk" onClick={() => onMoDon(d.order_id)}>{d.order_code}</button>
                ) : d.order_code}
              </td>
              <td className="n">{soVN(d.da_nhan)}</td>
              <td className="n lds-cam">{soVN(d.con_lai)}</td>
              {onTraLai && (
                <td className="lds-nut">
                  <button type="button" className="kt-btn kt-btn--nho" aria-label={`Trả lại cọc đơn ${d.order_code}`}
                    onClick={() => onTraLai(d)}>
                    Trả lại cọc
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
