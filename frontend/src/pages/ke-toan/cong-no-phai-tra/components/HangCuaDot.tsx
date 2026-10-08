// Khối HÀNG CỦA MỘT ĐỢT GIAO — gấp NGAY DƯỚI dòng đợt trong ngăn Công nợ phải trả (đặc tả NPT-2;
// thay hộp nổi `HangCuaDotModal` cũ). Chủ chốt 28/08/2026: bấm vào đợt giao thì phải thấy tên sản
// phẩm, số lượng, đơn vị tính. Gấp tại chỗ để cụm cột tiền (Giá trị, Đã trả, Trừ cọc, Còn nợ) vẫn
// liền nhau và không mở thêm một lớp phủ chồng lên ngăn.
import type { PayableItemRow } from "../../../../api/client";
// Đơn vị lưu bằng MÃ (`cai`), tên hiển thị ("cái") nằm ở danh mục Đơn vị — trang đã nạp sẵn.
import { tenDonVi } from "../../../tenDonVi";
import { Cum, TheNho } from "../../shared/Cum";
import { vietSo } from "../../shared/dinhDang";

export function HangCuaDot({ item, soCot }: { item: PayableItemRow; soCot: number }) {
  const dv = (u: string) => tenDonVi(u) ?? u;
  return (
    <tr className="kt-hang-dot">
      <td colSpan={soCot}>
        <div className="lds-bang lds-bang--long">
          <table className="lds-g" aria-label="Hàng của đợt">
            <colgroup>
              <col />
              <col style={{ width: 130 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 122 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Mặt hàng</th>
                <th className="n">Số lượng</th>
                <th className="n">Đơn giá</th>
                <th className="n">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {item.lines.map((line, i) => (
                <tr key={`${line.item_name}-${i}`}>
                  <td>
                    <Cum>
                      <span>{line.item_name}</span>
                      {/* DƯ = phần giao VƯỢT số đặt, tính 0 đ (chủ chốt 28/08/2026). Phơi ngay tại dòng —
                          không thì số lượng lớn mà thành tiền thấp, tưởng máy tính sai. */}
                      {line.du > 0 && (
                        <span title="Phần giao vượt số đặt trên phiếu mua, không tính tiền. Kiểm lại với nhà cung cấp nếu họ có tính.">
                          <TheNho>{`Dư ${vietSo(line.du)} ${dv(line.unit)}`}</TheNho>
                        </span>
                      )}
                    </Cum>
                  </td>
                  <td className="n">{`${vietSo(line.quantity)} ${dv(line.unit)}`}</td>
                  <td className="n">{vietSo(line.unit_price)}</td>
                  <td className="n">{vietSo(line.thanh_tien)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}
