// Nạp SẴN phần còn lại của ngăn đơn bán (13/10/2026): sổ hoá đơn, nhật ký, lệnh sản xuất. Trước đó ba
// lời gọi này chỉ bắn khi chi tiết đơn đã về (ngăn mới mount) ⇒ mở ngăn tốn thêm nguyên một vòng chi
// tiết đơn. Giờ bắn ngay lúc bấm mở đơn, song song với chi tiết đơn + tiến độ; ngăn lấy lại đúng lời
// gọi đó ở lần nạp đầu. Cùng luật với `napTruocTienDo`: lấy KHÔNG xoá (dev chạy StrictMode, hiệu ứng
// mount hai lần), quá 15 giây thì bỏ để không vẽ số cũ, mỗi lần bấm mở đơn ghi đè.
import { api, type OrderActivity, type SalesInvoiceListOut } from "../api/client";

const HAN_MS = 15_000;
const kho = new Map<string, { luc: number; hua: Promise<unknown> }>();

function dat(khoa: string, hua: Promise<unknown>) {
  hua.catch(() => undefined);
  kho.set(khoa, { luc: Date.now(), hua });
}

function lay<T>(khoa: string): Promise<T> | null {
  const x = kho.get(khoa);
  return x && Date.now() - x.luc < HAN_MS ? (x.hua as Promise<T>) : null;
}

/** Bắn sẵn lúc bấm mở đơn. Lệnh sản xuất chỉ khi ngăn sẽ hỏi (đơn đã chốt và đã chuyển xuống SX —
 *  cùng điều kiện với hiệu ứng trong ngăn); không rõ dòng (mở qua liên kết) thì để ngăn tự hỏi. */
export function napTruocNganDon(
  token: string,
  orderId: number,
  dong?: { status: string; san_xuat_released_at: string | null },
) {
  dat(`hd:${orderId}`, api.accounting.salesInvoices(token, orderId));
  dat(`nk:${orderId}`, api.orders.activity(token, orderId));
  if (dong?.status === "ordered" && dong.san_xuat_released_at) {
    dat(`lsx:${orderId}`, api.lsx.list(token, { order_id: orderId }));
  } else {
    kho.delete(`lsx:${orderId}`);
  }
}

export const layHoaDonNapTruoc = (orderId: number) => lay<SalesInvoiceListOut>(`hd:${orderId}`);
export const layNhatKyNapTruoc = (orderId: number) => lay<{ items: OrderActivity[] }>(`nk:${orderId}`);
export const layLenhNapTruoc = (orderId: number) => lay<Awaited<ReturnType<typeof api.lsx.list>>>(`lsx:${orderId}`);
