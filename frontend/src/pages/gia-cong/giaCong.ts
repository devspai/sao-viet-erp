/** Hàm THUẦN của Gia công ngoài (spec docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md).
 *  Không gọi API, không React — vitest soi thẳng. */
import type { LsxLoaiBuoc } from "../../api/client";

/** Tối thiểu một bước cần có để suy dải — `EditRow` của bảng routing khớp kiểu này. */
export interface BuocDai {
  /** `step_key` — khớp `LsxCongDoanPhuThuoc.buoc_truoc_id`/`buoc_sau_id` ở server. */
  key: string;
  ten: string;
  loai_buoc: LsxLoaiBuoc;
  nha_cung_cap_id: number | null;
  /** Tiền nhiệm TRỰC TIẾP của bước này (cạnh DAG `truoc → bước này`). */
  phu_thuoc_step_keys: string[];
}

export interface ViTriDai {
  /** Tên bước liền trước CÙNG lần (null = bước này mở đầu lần). */
  truoc: string | null;
  /** Tên bước liền sau CÙNG lần (null = bước này là cuối lần). */
  sau: string | null;
  /** Bước cuối của lần — nơi khai đơn giá CẢ lần. */
  laCuoi: boolean;
}

/** Lệnh có khai ÍT NHẤT một cạnh phụ thuộc không — routing tuyến tính cũ (chưa từng khai cạnh
 *  nào) thì "liền nhau" lùi về so THỨ TỰ MẢNG, đúng luật server (`_quet_dai_thue_ngoai`). */
function coCanhNao(rows: BuocDai[]): boolean {
  return rows.some((r) => r.phu_thuoc_step_keys.length > 0);
}

/** Có cạnh DAG `a → c` không (c liệt `a.key` trong tiền nhiệm trực tiếp của nó). */
function coCanh(a: BuocDai, c: BuocDai): boolean {
  return c.phu_thuoc_step_keys.includes(a.key);
}

function cungLan(rows: BuocDai[], a: BuocDai | undefined, c: BuocDai | undefined): boolean {
  if (!a || !c) return false;
  if (a.loai_buoc !== "thue_ngoai" || c.loai_buoc !== "thue_ngoai") return false;
  if (a.nha_cung_cap_id == null || a.nha_cung_cap_id !== c.nha_cung_cap_id) return false;
  // "Liền nhau" đi theo CẠNH DAG — hai nhánh song song của cùng một bước cha KHÔNG liền nhau, dù
  // đứng sát nhau trong mảng `rows`. Routing KHÔNG khai cạnh nào (tuyến tính cũ) thì lùi về so
  // thứ tự mảng, cùng luật `_quet_dai_thue_ngoai` (`services/gia_cong_ngoai/lan.py`).
  return !coCanhNao(rows) || coCanh(a, c);
}

/** Vị trí của bước `i` trong DẢI gia công. Cùng luật với máy chủ lúc phát hành
 *  (`services/gia_cong_ngoai/lan.py::gom_lan_khi_phat_hanh` → `_quet_dai_thue_ngoai` +
 *  `_canh_ke_tiep`): các bước Thuê ngoài LIỀN NHAU theo CẠNH DAG (không phải theo thứ tự bảng),
 *  CÙNG nhà gia công ⇒ MỘT lần. `null` khi bước không phải thuê ngoài. */
export function viTriTrongDai(rows: BuocDai[], i: number): ViTriDai | null {
  const r = rows[i];
  if (!r || r.loai_buoc !== "thue_ngoai") return null;
  const truoc = cungLan(rows, rows[i - 1], r) ? rows[i - 1].ten : null;
  const sau = cungLan(rows, r, rows[i + 1]) ? rows[i + 1].ten : null;
  return { truoc, sau, laCuoi: sau == null };
}
