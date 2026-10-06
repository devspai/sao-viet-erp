/** Cách đọc một lần gia công ngoài chờ chi — dùng chung cho hàng chờ (thẻ "Gia công chờ chi") và
 *  form lập phiếu chi gia công (PC-5), để hai chỗ không tự viết hai kiểu. */
import type { GiaCongChoChi } from "../../../../api/client";
import { nhanDonVi } from "../../../lsxBuoc";

/** Tên việc của một lần là các công đoạn nối bằng " + " — tách ra thành từng thẻ nhỏ. */
export function cacViec(tenViec: string): string[] {
  return tenViec.split(" + ").map((v) => v.trim()).filter(Boolean);
}

/** "1.200 tờ" — số chốt kèm đơn vị đọc được. */
export function soChot(r: Pick<GiaCongChoChi, "sl_cuoi" | "don_vi">): string {
  return `${r.sl_cuoi.toLocaleString("vi-VN")}${r.don_vi ? ` ${nhanDonVi(r.don_vi)}` : ""}`;
}
