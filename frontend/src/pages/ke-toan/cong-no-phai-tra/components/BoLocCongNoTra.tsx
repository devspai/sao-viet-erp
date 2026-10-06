/** Bộ lọc nâng cao màn Công nợ phải trả (đặc tả NPT-1): Còn nợ (khoảng) — Hạn trả — Hạn mức —
 *  Khác: "Hiện cả nhà cung cấp đã trả hết" và "Có đợt giao chưa ghi hoá đơn" (`thieu_hoa_don`).
 *  Khuôn chung ở `shared/BoLocCongNo.tsx` (Công nợ phải thu dùng cùng); ở đây chỉ khai chữ của phía
 *  phải trả.
 */
import type { ComponentProps } from "react";

import { BoLocCongNo, type CauHinhBoLocCongNo } from "../../shared/BoLocCongNo";

const CAU_HINH: CauHinhBoLocCongNo = {
  donVi: "nhà cung cấp",
  nhanHan: "Hạn trả",
  chuHet: "Hiện cả nhà cung cấp đã trả hết",
  nhanHet: "nhà cung cấp đã trả hết",
  chuThieuHd: "Có đợt giao chưa ghi hoá đơn",
};

export function BoLocCongNoTra(props: Omit<ComponentProps<typeof BoLocCongNo>, "cauHinh">) {
  return <BoLocCongNo cauHinh={CAU_HINH} {...props} />;
}
