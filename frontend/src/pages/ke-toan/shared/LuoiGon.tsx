/** Mảnh của phương án A (docs/mockups/ke-toan-gon-3-phuong-an.html, 07/10/2026): cột thuộc tính xếp
 *  dọc (nhãn trên, giá trị dưới) của ngăn kiểu 3 và số in trên tờ phiếu. Lưới danh sách của các màn
 *  kế toán dùng chung khuôn lưới `lds-*` (components/LuoiDs) với Kinh doanh — dải tab `DaiTab` cũ đã
 *  nhường chỗ cho `LocNhanhTrangThai`. */
import type { ReactNode } from "react";

export type ORay = { nhan: string; giaTri: ReactNode };

/** Cột thuộc tính bên phải ngăn: mỗi mục nhãn nhỏ trên, giá trị dưới; mục trống không hiện. */
export function RayThuocTinh({ o }: { o: ORay[] }) {
  const con = o.filter((x) => x.giaTri != null && x.giaTri !== "" && x.giaTri !== false);
  return (
    <dl className="kt-ray">
      {con.map((x) => (
        <div key={x.nhan} className="kt-ray__o">
          <dt>{x.nhan}</dt>
          <dd>{x.giaTri}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Số in trên tờ phiếu (PC00018); phiếu cũ chưa có số thì dùng mã hệ thống. */
export function soPhieu(row: { doc_no?: string | null; code: string }): string {
  return row.doc_no || row.code;
}
