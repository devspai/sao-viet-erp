// Nguồn của ngăn LÊN ĐƠN GIAO HÀNG — xe, lượt đang mở của từng xe, người, trạng thái hôm nay, mức km.
//
// Nạp TRƯỚC khi ngăn mở (màn Giao hàng gọi `napNguonLenDon` ngay khi người có ô lên đơn vào trang)
// để hai danh sách bên trái hiện cùng lúc với cột phải. Lượt mở phải hỏi TỪNG xe một nên nạp lúc
// bấm nút là thấy rõ độ trễ. Ngăn mở ra dùng ngay bản đã có, rồi nạp lại ngầm cho tươi.
import type { DeliveryDriver, DeliveryDriverPick, LuotXeMo, MucKm } from "../../../../api/client";
import { api } from "../../../../api/client";
import { crud, type Row } from "../../../../api/rebuildCatalog";

export type NguonLenDon = {
  xe: Row[];
  luotTheoXe: Record<string, LuotXeMo[]>;
  taiXe: DeliveryDriverPick[];
  /** Trạng thái hôm nay theo `employee_id`; không có quyền xem tab Nhân viên ⇒ rỗng. */
  trangThai: Map<number, DeliveryDriver>;
  /** Tên mức khoán km chỉ để đọc; không có quyền xem cấu hình lương ⇒ rỗng. */
  muc: MucKm[];
};

let daNap: { token: string; nguon: NguonLenDon } | null = null;
let dangNap: { token: string; hua: Promise<NguonLenDon> } | null = null;

async function nap(token: string): Promise<NguonLenDon> {
  const [xe, taiXe, nv, muc] = await Promise.all([
    crud("/api/xe").list(token, { active: true }).then((r) => r.items ?? []).catch(() => [] as Row[]),
    api.giaoHang.taiXeChon(token).then((r) => r.items ?? []).catch(() => [] as DeliveryDriverPick[]),
    api.giaoHang.nhanVien(token).then((r) => r.items ?? []).catch(() => [] as DeliveryDriver[]),
    api.giaoHang.mucKhoanKm(token).then((r) => r.items ?? []).catch(() => [] as MucKm[]),
  ]);
  const luot = await Promise.all(xe.map((x) => api.giaoHang.luotXeMo(token, Number(x.id))
    .then((l) => [String(x.id), l.items ?? []] as const)
    .catch(() => [String(x.id), [] as LuotXeMo[]] as const)));
  return {
    xe,
    luotTheoXe: Object.fromEntries(luot),
    taiXe,
    trangThai: new Map(nv.map((d) => [d.employee_id, d])),
    muc,
  };
}

/** Nạp (hoặc nhập vào lượt nạp đang chạy). Lỗi từng nguồn đã nuốt thành rỗng — hứa không bao giờ hỏng. */
export function napNguonLenDon(token: string): Promise<NguonLenDon> {
  if (dangNap?.token === token) return dangNap.hua;
  const hua = nap(token).then((nguon) => {
    daNap = { token, nguon };
    return nguon;
  }).finally(() => {
    if (dangNap?.hua === hua) dangNap = null;
  });
  dangNap = { token, hua };
  return hua;
}

/** Quên bản đã nạp — test gọi giữa các ca để mock ca trước không rò sang ca sau. */
export function boNguonLenDon(): void {
  daNap = null;
  dangNap = null;
}

/** Bản đã nạp xong gần nhất của đúng token này — dùng làm giá trị ĐẦU của ngăn, khỏi chờ. */
export function nguonLenDonSan(token: string): NguonLenDon | null {
  return daNap?.token === token ? daNap.nguon : null;
}
