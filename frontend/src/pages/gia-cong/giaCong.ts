/** Hàm THUẦN của Gia công ngoài (spec docs/superpowers/specs/2026-09-26-gia-cong-ngoai-design.md).
 *  Không gọi API, không React — vitest soi thẳng. */
import type { LsxLoaiBuoc } from "../../api/client";

/** Tối thiểu một bước cần có để suy dải — `EditRow` của bảng routing khớp kiểu này. */
export interface BuocDai {
  ten: string;
  loai_buoc: LsxLoaiBuoc;
  nha_cung_cap_id: number | null;
}

export interface ViTriDai {
  /** Tên bước liền trước CÙNG lần (null = bước này mở đầu lần). */
  truoc: string | null;
  /** Tên bước liền sau CÙNG lần (null = bước này là cuối lần). */
  sau: string | null;
  /** Bước cuối của lần — nơi khai đơn giá CẢ lần. */
  laCuoi: boolean;
}

function cungLan(a: BuocDai | undefined, c: BuocDai | undefined): boolean {
  return !!a && !!c && a.loai_buoc === "thue_ngoai" && c.loai_buoc === "thue_ngoai"
    && a.nha_cung_cap_id != null && a.nha_cung_cap_id === c.nha_cung_cap_id;
}

/** Vị trí của bước `i` trong DẢI gia công. Cùng luật với máy chủ lúc phát hành
 *  (`services/gia_cong_ngoai/lan.py::gom_lan_khi_phat_hanh`): các bước Thuê ngoài LIỀN NHAU
 *  theo thứ tự bảng, CÙNG nhà gia công ⇒ MỘT lần. `null` khi bước không phải thuê ngoài. */
export function viTriTrongDai(rows: BuocDai[], i: number): ViTriDai | null {
  const r = rows[i];
  if (!r || r.loai_buoc !== "thue_ngoai") return null;
  const truoc = cungLan(rows[i - 1], r) ? rows[i - 1].ten : null;
  const sau = cungLan(r, rows[i + 1]) ? rows[i + 1].ten : null;
  return { truoc, sau, laCuoi: sau == null };
}
