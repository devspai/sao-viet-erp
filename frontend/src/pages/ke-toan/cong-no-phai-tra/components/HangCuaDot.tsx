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
        <div className="kt-hang-dot__ben">
          <table aria-label="Hàng của đợt">
            <thead>
              <tr>
                <th>Mặt hàng</th>
                <th className="kt-so">Số lượng</th>
                <th className="kt-so">Đơn giá</th>
                <th className="kt-so">Thành tiền</th>
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
                  <td className="kt-so">{`${vietSo(line.quantity)} ${dv(line.unit)}`}</td>
                  <td className="kt-so">{vietSo(line.unit_price)}</td>
                  <td className="kt-so">{vietSo(line.thanh_tien)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}
