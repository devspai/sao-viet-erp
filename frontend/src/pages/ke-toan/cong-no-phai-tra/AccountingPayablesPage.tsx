/** Màn CÔNG NỢ PHẢI TRẢ (đặc tả NPT-1 … NPT-3, A.11, A.17, A.18) — dựng trên bộ khung chung kế toán.
 *
 *  Khuôn trang: đầu trang → chọn kỳ → khối TỔNG QUAN (Còn nợ tới cuối kỳ, quá hạn, mua thêm, đã trả +
 *  thanh tuổi nợ bấm được) → thanh lọc (nhóm nút có số, ô tìm, Bộ lọc nâng cao, chip, "n nhà cung
 *  cấp") → bảng + chân phân trang. Bấm dòng mở ngăn nhà cung cấp; bấm số Quá hạn / Đã trả mở ngăn
 *  đúng tab đó. Mọi lọc chạy ở MÁY CHỦ.
 *
 *  Thân trang (tổng quan, thanh lọc, bảng, thẻ điện thoại, phân trang) là khuôn chung `ThanTrangCongNo`
 *  — màn phải thu dùng cùng; màn này chỉ khai chữ, bốn số tổng quan và cách đọc trường.
 *
 *  KHÔNG có bảng công nợ dưới DB: mọi số SUY RA từ đợt giao + phiếu chi (docs/prd-mua-hang-cong-no.md
 *  §5.3) — nợ = max(0, hàng ĐÃ GIAO − đã chi ròng), đo theo ĐỢT GIAO, hạn trả quy về đợt giao.
 *
 *  ⚠️ LUẬT SỐNG CÒN: im lặng không được đồng nghĩa với hết nợ. Tải hỏng thì để TRỐNG và nói rõ,
 *  KHÔNG hiện 0 đ (05/08/2026 API chết mà màn đổ ra "0đ / chưa nợ ai").
 */
import { useMemo, useState } from "react";

import { api, type PayableSupplierRow, type PayablesSummary } from "../../../api/client";
import { useAuth } from "../../../auth/useAuth";
import { useCan } from "../../../auth/permissions";
import type { NavigateFn } from "../../../components/AppShell";
// Đơn vị lưu bằng MÃ (`cai`), tên hiển thị ("cái") nằm ở danh mục Đơn vị. Nạp ở TRANG (không ở khối
// "Hàng của đợt"): nạp lúc khối mở thì lần vẽ đầu vẫn kịp hiện mã trần.
import { useNapTenDonVi } from "../../tenDonVi";
import { ThanTrangCongNo, type CauHinhThanCongNo } from "../shared/ThanTrangCongNo";
import { useTrangCongNo } from "../shared/trangCongNo";
import { BoLocCongNoTra } from "./components/BoLocCongNoTra";
import { PayablesDrawer } from "./components/PayablesDrawer";
import { PAGE_SIZE } from "./shared/constants";
import type { Bucket } from "./shared/types";
import "../ke-toan.css";

/** Mã màn — khoá nhớ kỳ và dấu `man` trên URL (trùng id AppShell). */
const MAN = "ke-toan-cong-no";

const CAU_HINH: CauHinhThanCongNo<PayableSupplierRow> = {
  tieuDe: "Công nợ phải trả",
  moTa: "Đang nợ nhà cung cấp nào, bao nhiêu, khoản nào trễ. Nợ tính theo từng đợt giao hàng.",
  donVi: "nhà cung cấp",
  nhanDoiTac: "Nhà cung cấp",
  nhanHan: "Hạn trả gần nhất",
  nhanDaTra: "Đã trả trong kỳ",
  chuHet: "Đã trả hết",
  donViKhoan: "khoản",
  nhanTim: "Tìm nhà cung cấp",
  goiYTim: "Tìm nhà cung cấp, kể cả người đã trả hết",
  chuTai: "Đang tải công nợ phải trả…",
  chuLoi: "Không tải được công nợ phải trả.",
  chuChuaCo: "Không còn nợ nhà cung cấp nào",
  ariaPhanTrang: "Phân trang công nợ phải trả",
  id: (r) => r.supplier_id,
  ten: (r) => r.supplier_name,
  daTraTrongKy: (r) => r.paid_in_period,
};

export function AccountingPayablesPage({
  navigate,
  eventTick = 0,
}: {
  navigate: NavigateFn;
  eventTick?: number;
}) {
  const { token } = useAuth();
  const can = useCan();
  useNapTenDonVi();
  // Tích đợt / trả nhiều đợt = lập phiếu chi ⇒ hỏi quyền của MÀN PHIẾU CHI, không phải màn này.
  const quyen = {
    lap: can("phieu_chi", "create"),
    xemDonMua: can("ke_toan", "read"),
    xemNcc: can("nha_cung_cap", "read"),
    xemPhieuChi: can("phieu_chi", "read"),
  };

  const sp = useTrangCongNo<PayablesSummary>(
    { man: MAN, coTrang: PAGE_SIZE, goi: (t, p) => api.accounting.payables(t, p), chuLoi: "Không tải được công nợ phải trả." },
    token,
    eventTick,
  );
  const rows = sp.data?.items ?? [];

  const [open, setOpen] = useState<{ row: PayableSupplierRow; bucket: Bucket } | null>(null);
  const moDuoc = useMemo(() => rows.filter((r) => r.supplier_id != null), [rows]);
  const viTri = open ? moDuoc.findIndex((r) => r.supplier_id === open.row.supplier_id) : -1;

  return (
    <ThanTrangCongNo
      ch={CAU_HINH}
      sp={sp}
      con={(data, cung) => [
        { nhan: "Còn nợ tới", so: data.total_due, cungKy: cung?.total_due },
        { nhan: "Trong đó quá hạn", so: data.overdue_amount, cungKy: cung?.overdue_amount, xau: true },
        { nhan: "Mua thêm trong kỳ", so: data.mua_trong_ky, cungKy: cung?.mua_trong_ky },
        { nhan: "Đã trả trong kỳ", so: data.paid_in_period, cungKy: cung?.paid_in_period },
      ]}
      boLoc={(dau) => <BoLocCongNoTra loc={sp.loc} onDoiLoc={sp.setLoc} demKhop={sp.demKhop} {...dau} />}
      dangXem={open?.row.supplier_id ?? null}
      onMo={(row, bucket = "all") => setOpen({ row, bucket })}
      ngan={
        open &&
        open.row.supplier_id != null && (
          <PayablesDrawer
            key={`${open.row.supplier_id}:${open.bucket}`}
            supplierId={open.row.supplier_id}
            supplierName={open.row.supplier_name}
            bucket={open.bucket}
            ky={sp.kyMan.ky}
            eventTick={eventTick}
            quyen={quyen}
            navigate={navigate}
            len={viTri > 0 ? () => setOpen({ row: moDuoc[viTri - 1], bucket: "all" }) : undefined}
            xuong={viTri >= 0 && viTri < moDuoc.length - 1 ? () => setOpen({ row: moDuoc[viTri + 1], bucket: "all" }) : undefined}
            onClose={() => setOpen(null)}
            onChanged={sp.load}
          />
        )
      }
    />
  );
}
