// Ô chọn NCC theo DÒNG hàng — cụm "chào giá" (tách từ pages/PurchaseRequestsPage.tsx).
// ⚠️ Hợp đồng "rẻ trước + mang giá/VAT của NCC" nằm ở `chaoGiaChoMatHang` (shared/helpers.ts)
// và ở chỗ gọi `onPick` bên PurchaseFormDrawer — ba mảnh đó phải đọc cùng nhau.
import type { DonViDungDuoc, SupplierRow } from "../../../../api/client";
import { chuanKho } from "../../../../lib/khoGiay";
import { money } from "../../../../utils/format";
import { tenDonVi } from "../../../tenDonVi";
import { chaoGiaChoMatHang, normalizeItemName, tenGon } from "../shared/helpers";
import type { ChaoGia, FormLine } from "../shared/types";

const khoaChao = (c: ChaoGia) => `${c.supplier_id}:${c.supplier_item_id}`;

/** Ô chọn nhà cung cấp cho MỘT dòng hàng — hiện tối đa 5 nơi bán, rẻ nhất lên trước.
 *
 * Nhãn chỉ là TÊN GỌN của NCC (10/10/2026): ô hẹp, nhét giá vào nhãn là bị cắt mất cả tên lẫn giá.
 * Giá của NCC đã chọn hiện ở ô Đơn giá của dòng.
 *
 * Chưa gõ tên vật tư thì chưa biết hỏi ai ⇒ ô khoá lại và nói rõ. Gõ tên mà không ai bán thì cũng
 * nói thẳng, không để ô rỗng im lặng rồi người dùng bấm Lưu mới biết. */
export function LineSupplierPicker({
  line,
  suppliers,
  dsDonVi,
  onPick,
}: {
  line: FormLine;
  suppliers: SupplierRow[];
  /** Danh sách đơn vị của mặt hàng — để biết NCC bán cùng họ đơn vị với dòng hay không. */
  dsDonVi?: DonViDungDuoc[];
  onPick: (chao: ChaoGia | null) => void;
}) {
  const tatCa = chaoGiaChoMatHang(line, suppliers, dsDonVi);
  const cungHo = tatCa.filter((c) => c.cung_ho);
  const khacHo = tatCa.filter((c) => !c.cung_ho);
  const chuaGoTen = !normalizeItemName(line.item_name) && !line.hang_id;
  const laGiay = line.hang_loai === "giay";
  const [r, d] = chuanKho(line.kho_rong, line.kho_dai);
  const dv = tenDonVi(line.unit) ?? line.unit;
  // Giấy: nhóm chính = cùng khổ + cùng họ đơn vị với dòng.
  const nhanNhom = laGiay
    ? `${r ? (d ? `Khổ ${r} × ${d} mm` : `Khổ ${r} mm`) : "Chưa ghi khổ"}${dv ? ` theo ${dv}` : ""}`
    : "Nhà cung cấp";
  const dangChon =
    tatCa.find((c) => c.supplier_id === line.supplier_id && c.cung_ho) ??
    tatCa.find((c) => c.supplier_id === line.supplier_id);

  if (chuaGoTen || tatCa.length === 0) {
    return (
      <select className="input" disabled aria-label="Nhà cung cấp của dòng">
        <option>
          {chuaGoTen ? "Nhập vật tư trước" : laGiay ? "Chưa có NCC bán khổ này" : "Chưa có NCC nào bán"}
        </option>
      </select>
    );
  }
  return (
    <select
      className="input"
      required
      aria-label="Nhà cung cấp của dòng"
      title={dangChon?.supplier_name}
      value={dangChon ? khoaChao(dangChon) : ""}
      onChange={(e) => onPick(tatCa.find((c) => khoaChao(c) === e.target.value) ?? null)}
    >
      <option value="">Chọn nhà cung cấp</option>
      {cungHo.length > 0 && (
        <optgroup label={nhanNhom}>
          {cungHo.map((c) => (
            <option key={khoaChao(c)} value={khoaChao(c)}>
              {tenGon(c.supplier_name)}
            </option>
          ))}
        </optgroup>
      )}
      {/* Giấy: NCC bán cùng mã cùng khổ nhưng theo đơn vị KHÁC họ (tờ và kg không quy đổi) — không
          xếp hạng chung được, nên đứng riêng kèm giá và đơn vị của họ. Chọn thì dòng đổi sang đơn
          vị đó và phải gõ lại số lượng. */}
      {khacHo.length > 0 && (
        <optgroup label="Bán theo đơn vị khác, chọn là đổi đơn vị dòng">
          {khacHo.map((c) => (
            <option key={khoaChao(c)} value={khoaChao(c)}>
              {tenGon(c.supplier_name)} ({money(c.unit_price)}/{tenDonVi(c.unit) ?? c.unit})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
