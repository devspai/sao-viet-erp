/** Bộ lọc nâng cao màn Công nợ phải thu (đặc tả NPTh-1, thứ tự ô theo bản xem): Còn nợ (khoảng) —
 *  Người phụ trách — Hạn thu — Hạn mức — Nhãn khách hàng — Khác: "Hiện cả khách đã thu hết".
 *
 *  Khuôn chung ở `shared/BoLocCongNo.tsx` (Công nợ phải trả dùng cùng). Hai ô riêng phía thu cắm qua
 *  `oSauNo` (Người phụ trách) và `oThem` (Nhãn); khoá `phu_trach_id` / `nhan` đã có sẵn trong
 *  `LocNangCaoCongNo` nên chip, đếm "Khớp n", tham số máy chủ và URL tự chạy.
 *
 *  Danh sách người và nhãn lấy đúng nguồn màn Khách hàng dùng cho hộp lọc của nó
 *  (`api.customers.sales`, `api.customers.tagLabels`) — hai lời đó cần quyền xem Khách hàng. Không có
 *  quyền thì hai ô ẩn và bảng lọc nói một dòng vì sao; có quyền mà danh sách chưa về / tải hỏng (null)
 *  thì ô ẩn lặng, bộ lọc còn lại vẫn chạy.
 */
import { useMemo, type ComponentProps } from "react";

import type { SaleOption } from "../../../../api/client";
import { BoLocCongNo, type CauHinhBoLocCongNo } from "../../shared/BoLocCongNo";
import { O } from "../../shared/BoLocNangCao";

const CAU_HINH: CauHinhBoLocCongNo = {
  donVi: "khách hàng",
  nhanHan: "Hạn thu",
  chuHet: "Hiện cả khách đã thu hết",
  nhanHet: "khách đã thu hết",
};

export function BoLocCongNoThu({
  nguoi,
  nhanKhach,
  coQuyenKhach = true,
  ...props
}: Omit<ComponentProps<typeof BoLocCongNo>, "cauHinh" | "oSauNo" | "oThem"> & {
  /** Người phụ trách cho ô lọc; null = chưa tải / tải hỏng ⇒ ẩn ô. */
  nguoi: SaleOption[] | null;
  /** Nhãn khách đang dùng; null ⇒ ẩn ô. */
  nhanKhach: string[] | null;
  /** Có quyền xem Khách hàng (hai danh sách cần quyền đó). Không có ⇒ nói một dòng trong bảng lọc. */
  coQuyenKhach?: boolean;
}) {
  const ten = useMemo(() => new Map((nguoi ?? []).map((n) => [n.id, n.name])), [nguoi]);
  const cauHinh = useMemo<CauHinhBoLocCongNo>(() => ({ ...CAU_HINH, tenPhuTrach: (id) => ten.get(id) }), [ten]);

  return (
    <BoLocCongNo
      cauHinh={cauHinh}
      {...props}
      oSauNo={({ nhap, doi }) =>
        nguoi && (
          <O nhan="Người phụ trách">
            <div data-o="phu_trach">
              <select aria-label="Người phụ trách" value={nhap.phu_trach_id ?? ""}
                onChange={(e) => doi({ phu_trach_id: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">Mọi người</option>
                {nhap.phu_trach_id != null && !ten.has(nhap.phu_trach_id) && (
                  <option value={nhap.phu_trach_id}>Người đã chọn</option>
                )}
                {nguoi.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
          </O>
        )
      }
      oThem={({ nhap, doi }) => {
        if (!coQuyenKhach) {
          return <p className="kt-mo">Cần quyền xem Khách hàng để lọc theo người phụ trách và nhãn.</p>;
        }
        // Giá trị đang áp mà không còn trong danh sách (link cũ, nhãn đã xoá) vẫn phải hiện trong ô.
        const dsNhan = nhanKhach && nhap.nhan && !nhanKhach.includes(nhap.nhan) ? [nhap.nhan, ...nhanKhach] : nhanKhach;
        return (
          dsNhan && (
            <O nhan="Nhãn khách hàng">
              <div data-o="nhan">
                <select aria-label="Nhãn khách hàng" value={nhap.nhan ?? ""}
                  onChange={(e) => doi({ nhan: e.target.value || undefined })}>
                  <option value="">Mọi nhãn</option>
                  {dsNhan.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </O>
          )
        );
      }}
    />
  );
}
