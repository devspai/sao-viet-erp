// Ô chọn NCC theo DÒNG hàng — cụm "chào giá" (tách từ pages/PurchaseRequestsPage.tsx).
// ⚠️ Hợp đồng "rẻ trước + mang giá/VAT của NCC" nằm ở `chaoGiaChoMatHang` (shared/helpers.ts)
// và ở chỗ gọi `onPick` bên PurchaseFormDrawer — ba mảnh đó phải đọc cùng nhau.
import type { SupplierRow } from "../../../../api/client";
import { money } from "../../../../utils/format";
import { chaoGiaChoMatHang, normalizeItemName } from "../shared/helpers";
import type { ChaoGia, FormLine } from "../shared/types";

/** Ô chọn nhà cung cấp cho MỘT dòng hàng — hiện tối đa 5 nơi bán, rẻ nhất lên trước, kèm giá.
 *
 * Chưa gõ tên vật tư thì chưa biết hỏi ai ⇒ ô khoá lại và nói rõ. Gõ tên mà không ai bán thì cũng
 * nói thẳng, không để ô rỗng im lặng rồi người dùng bấm Lưu mới biết. */
export function LineSupplierPicker({
  line,
  suppliers,
  onPick,
}: {
  line: FormLine;
  suppliers: SupplierRow[];
  onPick: (chao: ChaoGia | null) => void;
}) {
  const tatCa = chaoGiaChoMatHang(line, suppliers);
  const chaoGia = tatCa.filter((c) => !c.khac_kho);
  const khacKho = tatCa.filter((c) => c.khac_kho);
  const chuaGoTen = !normalizeItemName(line.item_name) && !line.hang_id;
  const laGiay = line.hang_loai === "giay";
  const nhanNhom = laGiay
    ? line.kho_rong && line.kho_dai
      ? `Bán tờ ${Math.min(line.kho_rong, line.kho_dai)} × ${Math.max(line.kho_rong, line.kho_dai)}`
      : "Bán cuộn"
    : "Nhà cung cấp";

  if (chuaGoTen || tatCa.length === 0) {
    return (
      <select className="input" disabled aria-label="Nhà cung cấp của dòng">
        <option>{chuaGoTen ? "Nhập vật tư trước" : "Chưa có NCC nào bán"}</option>
      </select>
    );
  }
  return (
    <select
      className="input"
      required
      aria-label="Nhà cung cấp của dòng"
      value={line.supplier_id ?? ""}
      onChange={(e) =>
        onPick(
          tatCa.find((c) => c.supplier_id === Number(e.target.value)) ?? null,
        )
      }
    >
      <option value="">Chọn nhà cung cấp</option>
      {/* Nhãn "· rẻ nhất" đang TẮT (dòng comment bên dưới). Bật lại thì thêm `, i` vào tham số
          map — bỏ đi ở đây chỉ vì để lại là TypeScript báo "khai mà không dùng", chứ không phải
          tôi gỡ ý đó. Danh sách vẫn xếp giá tăng dần nên dòng đầu vẫn là rẻ nhất. */}
      {chaoGia.length > 0 && <optgroup label={nhanNhom}>
      {chaoGia.map((c) => (
        <option key={c.supplier_id} value={c.supplier_id}>
          {/* Hiện GIÁ ĐÃ QUY ĐỔI (đ/đơn-vị-gốc) — đó mới là con số so ngang được và cũng là
              con số sẽ điền vào dòng. Kèm giá gốc NCC báo trong ngoặc để người chọn đối chiếu
              với báo giá cầm trên tay; giấu đi là họ tưởng hệ gõ sai số. */}
          {c.supplier_name} — {money(c.gia_quy_doi ?? c.unit_price)}
          {c.gia_quy_doi != null && c.gia_quy_doi !== c.unit_price
            ? ` (NCC báo ${money(c.unit_price)}/${c.unit})`
            : ""}
          {c.vat_percent ? ` (VAT ${c.vat_percent}%)` : ""}
          {/* {i === 0 && chaoGia.length > 1 ? " · rẻ nhất" : ""} */}
        </option>
      ))}
      </optgroup>}
      {/* Giấy (07/10/2026): NCC bán đúng mã nhưng khác dạng hoặc khác khổ — không so giá được nên
          không hiện giá; chọn thì đơn giá để trống cho người lập gõ theo báo giá. */}
      {khacKho.length > 0 && (
        <optgroup label="Bán dạng hoặc khổ khác, tự gõ giá">
          {khacKho.map((c) => (
            <option key={c.supplier_id} value={c.supplier_id}>
              {c.supplier_name} ({c.nhan_dang})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
