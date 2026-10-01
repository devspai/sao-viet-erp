// CHIP RIÊNG của một vật tư (vd Support: "Dài support", "Rộng support").
//
// Người khai chỉ gõ TÊN; mã biến do máy sinh (bỏ dấu, snake_case) và KHÔNG đổi khi đổi tên chip,
// vì công thức đang trỏ vào mã. Chip mới chưa lưu vẫn hiện thành chip bấm được ở hai ô công thức
// nhờ `chipsThanhBien`.
import { RefSearchField } from "./RefFields";
import { RowEditor } from "./RowEditor";
import type { BienCongThuc } from "../bienCongThuc";
import type { Row } from "../types";
import { tenDonVi } from "../../tenDonVi";

export interface VatTuChipRow { ma?: string; ten: string; don_vi?: string | null }

/** Khớp backend `bien_cong_thuc.ma_tu_ten_chip`: bỏ dấu, thường, ký tự lạ → `_`. */
export function maTuTenChip(ten: string): string {
  const s = (ten || "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) return "chip";
  return /^[0-9]/.test(s) ? `c_${s}` : s;
}

/** Chip của vật tư → từ điển biến cho ô công thức. */
export function chipsThanhBien(chips: VatTuChipRow[]): BienCongThuc[] {
  return chips
    .filter((c) => c.ten.trim() !== "")
    .map((c) => ({
      ma: c.ma || maTuTenChip(c.ten),
      nhan: c.ten.trim(),
      mo_ta: `Chip riêng của vật tư này${c.don_vi ? ` (${tenDonVi(c.don_vi) ?? c.don_vi})` : ""}`,
      don_vi: c.don_vi ?? "",
      nguon: "số nhập ở phiếu tính giá, theo từng bước",
      loai: ["vat_tu", "quy_doi"],
    }));
}

export function VatTuChipsField({
  value,
  donViOptions,
  onChange,
}: {
  value: VatTuChipRow[];
  /** Danh mục Đơn vị & quy đổi (đã bỏ mục ngừng dùng, trừ mục đang chọn). */
  donViOptions: Row[];
  onChange: (v: VatTuChipRow[]) => void;
}) {
  const rows = value ?? [];
  const setRow = (i: number, patch: Partial<VatTuChipRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <RowEditor
      rows={rows}
      khoa="rc-bands--chip"
      cot={["Tên chip", "Đơn vị"]}
      trong="Vật tư này chưa có chip riêng — bấm “＋ Thêm chip”."
      themNhan="＋ Thêm chip"
      onThem={() => onChange([...rows, { ten: "", don_vi: "" }])}
      onXoa={(i) => onChange(rows.filter((_, j) => j !== i))}
      xoaTitle="Xóa chip"
      veHang={(r, i) => (
        <>
          <td>
            <input
              className="rc-input"
              aria-label={`Tên chip ${i + 1}`}
              value={r.ten ?? ""}
              maxLength={80}
              placeholder="vd: Dài support"
              onChange={(e) => setRow(i, { ten: e.target.value })}
            />
            <small className="rc-chip-bien">Tên biến trong công thức: <code>{r.ma || maTuTenChip(r.ten ?? "")}</code></small>
          </td>
          <td>
            <RefSearchField
              value={r.don_vi ? r.don_vi : null}
              options={donViOptions}
              placeholder="Chọn đơn vị…"
              byMa
              onChange={(v) => setRow(i, { don_vi: v == null ? "" : String(v) })}
            />
          </td>
        </>
      )}
    />
  );
}
