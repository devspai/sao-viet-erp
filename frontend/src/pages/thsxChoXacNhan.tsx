// VIỆC CHỜ TỔ BẤM trên bàn tổ (spec §11.5) — bàn giao đến chờ nhận · lỗi KCS tổ chưa xem (mở tab KCS là xem). Không còn hộp riêng đầu trang: mỗi việc gắn vào CÔNG ĐOẠN của nó — chấm đỏ
// trên dòng công đoạn, trên đầu lệnh và trên tab ngăn chi tiết nơi bấm. Chấm nghĩa là "còn việc chờ
// bấm", không phải "chưa đọc": xác nhận / đã xem xong là tự tắt, không cần lưu trạng thái đã đọc.
//
// Nguồn duy nhất là `GET /teams/{id}/cho-xac-nhan` (máy chủ lọc theo quyền Xác nhận sản lượng trọn
// tổ) — dòng bảng, đầu lệnh, tab ngăn và ô "chờ xác nhận" cùng đọc một chỗ nên không lệch nhau.
import type { SxChoXacNhan, SxChoXacNhanBanGiao } from "../api/client";
import type { ThsxDrawerTab } from "./ThsxDrawer";

/** Số việc chờ của MỘT công đoạn, theo nơi bấm. */
export interface SxChoCuaViec {
  /** Bàn giao đến chờ nhận — tab "Nhận". */
  nhan: number;
  /** Lỗi KCS chưa xem — tab "KCS". */
  kcs: number;
  /** Các lần giao đến chờ nhận — ô Trạng thái của dòng nói bao nhiêu, từ bước nào. */
  hang?: SxChoXacNhanBanGiao[];
}

export function choTheoViec(d: SxChoXacNhan | null): Map<number, SxChoCuaViec> {
  const m = new Map<number, SxChoCuaViec>();
  const lay = (id: number) => {
    let c = m.get(id);
    if (!c) { c = { nhan: 0, kcs: 0 }; m.set(id, c); }
    return c;
  };
  for (const b of d?.ban_giao ?? []) {
    const c = lay(b.dich_cong_viec_id);
    c.nhan += 1;
    (c.hang ??= []).push(b);
  }
  for (const l of d?.kcs_loi ?? []) if (l.cong_viec_id != null) lay(l.cong_viec_id).kcs += 1;
  return m;
}

export function tongCho(d: SxChoXacNhan | null): number {
  return (d?.ban_giao.length ?? 0) + (d?.kcs_loi.length ?? 0);
}

/** Việc chờ mà bàn KHÔNG vẽ công đoạn của nó — không có dòng nào để gắn chấm, nên liệt kê riêng khi
 *  bật ô "chờ xác nhận". */
export function choNgoaiBan(d: SxChoXacNhan | null): SxChoXacNhan | null {
  if (!d) return null;
  return {
    team_id: d.team_id,
    ban_giao: d.ban_giao.filter((b) => !b.tren_ban),
    kcs_loi: d.kcs_loi.filter((l) => !l.tren_ban),
  };
}

/** Tab mở sẵn khi bấm một công đoạn: đang có việc chờ thì vào thẳng chỗ bấm (bàn giao đến ở tab
 *  "Giao và nhận"). Không chờ gì ⇒ `undefined`: ngăn tự chọn tab đầu theo
 *  khổ (máy tính Quy cách, điện thoại Tổng quan). */
export function tabCho(c: SxChoCuaViec | undefined): ThsxDrawerTab | undefined {
  if (!c) return undefined;
  if (c.nhan > 0) return "gn";
  if (c.kcs > 0) return "kcs";
  return undefined;
}

export function coCho(c: SxChoCuaViec | undefined): boolean {
  return !!c && c.nhan + c.kcs > 0;
}

/** Câu nói rõ đang chờ gì — tooltip/aria của chấm. */
export function nhanCho(c: SxChoCuaViec | undefined): string {
  if (!c) return "";
  return [
    c.nhan > 0 && `${c.nhan} bàn giao chờ nhận`,
    c.kcs > 0 && `${c.kcs} lỗi KCS chờ xem`,
  ].filter(Boolean).join(" · ");
}

/** Chấm đỏ "còn việc chờ tổ bấm". Không có việc chờ thì không vẽ gì. */
export function ChamCho({ c, nhan }: { c: SxChoCuaViec | undefined; nhan?: string }) {
  if (!coCho(c)) return null;
  const chu = nhan ?? nhanCho(c);
  return <span className="thsx-cho-dot" role="img" aria-label={chu} title={chu} />;
}
