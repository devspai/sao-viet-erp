/** Màn CÔNG NỢ PHẢI TRẢ (đặc tả NPT-1 … NPT-3, A.11, A.17, A.18) — dựng trên bộ khung chung kế toán.
 *
 *  Khuôn trang (phương án A, 07/10/2026): tiêu đề + dải tab có số — ô tìm, thanh lọc chung → "Còn
 *  nợ tới …" + "Xem cột" (Tuổi nợ | Trong kỳ và liên hệ) → lưới kiểu bảng tính, dòng Cộng đầu bảng
 *  → chân phân trang. Bấm dòng mở ngăn nhà cung cấp; bấm số quá hạn / trả trong kỳ mở ngăn đúng chỗ
 *  đó. Mọi lọc chạy ở MÁY CHỦ.
 *
 *  Thân trang là khuôn chung `ThanTrangCongNo` — màn phải thu dùng cùng; màn này chỉ khai chữ và
 *  cách đọc trường.
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
import { dieuKienCongNo } from "../shared/locCongNo";
import { ThanTrangCongNo, nhanTuoiDangLoc, type CauHinhThanCongNo } from "../shared/ThanTrangCongNo";
import { useTrangCongNo } from "../shared/trangCongNo";
import { PayablesDrawer } from "./components/PayablesDrawer";
import { PAGE_SIZE } from "./shared/constants";
import type { Bucket } from "./shared/types";
import "../ke-toan.css";

/** Mã màn — khoá nhớ kỳ và dấu `man` trên URL (trùng id AppShell). */
const MAN = "ke-toan-cong-no";

const CAU_HINH: CauHinhThanCongNo<PayableSupplierRow> = {
  tieuDe: "Công nợ phải trả",
  donVi: "nhà cung cấp",
  nhanDoiTac: "Nhà cung cấp",
  nhanKhoan: "Đợt",
  rongKhoan: 56,
  nhanThemKy: "Mua trong kỳ",
  nhanDaKy: "Trả trong kỳ",
  nhanGanNhat: "Trả gần nhất",
  chuChuaGanNhat: "chưa trả lần nào",
  chuHet: "Đã trả hết",
  nhanTim: "Tìm nhà cung cấp",
  goiYTim: "Tìm nhà cung cấp, kể cả đã trả hết",
  chuTai: "Đang tải công nợ phải trả…",
  chuLoi: "Không tải được công nợ phải trả.",
  chuChuaCo: "Không còn nợ nhà cung cấp nào",
  ariaPhanTrang: "Phân trang công nợ phải trả",
  id: (r) => r.supplier_id,
  ten: (r) => r.supplier_name,
  choNo: (r) => r.credit_days,
  themTrongKy: (r) => r.mua_trong_ky,
  daTraTrongKy: (r) => r.paid_in_period,
  ganNhat: (r) => (r.tra_gan_nhat_ngay ? { ngay: r.tra_gan_nhat_ngay, tien: r.tra_gan_nhat_tien ?? 0 } : null),
  lienHe: (r) => ({ ten: r.lien_he_ten, sdt: r.lien_he_sdt }),
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
  const aging = sp.data?.aging;
  const dieuKien = useMemo(
    () => dieuKienCongNo({ nhanHan: "Hạn trả", nhanHet: "Nhà cung cấp đã trả hết", coThieuHd: true }, aging ?? []),
    [aging],
  );

  const [open, setOpen] = useState<{ row: PayableSupplierRow; bucket: Bucket } | null>(null);
  const moDuoc = useMemo(() => rows.filter((r) => r.supplier_id != null), [rows]);
  const viTri = open ? moDuoc.findIndex((r) => r.supplier_id === open.row.supplier_id) : -1;

  const nhanTuoi = nhanTuoiDangLoc(sp);

  return (
    <ThanTrangCongNo
      ch={CAU_HINH}
      sp={sp}
      dieuKien={dieuKien}
      dangXem={open?.row.supplier_id ?? null}
      onMo={(row, bucket = "all") => setOpen({ row, bucket })}
      ngan={
        open &&
        open.row.supplier_id != null && (
          <PayablesDrawer
            key={`${open.row.supplier_id}:${open.bucket}`}
            supplierId={open.row.supplier_id}
            supplierName={open.row.supplier_name}
            ma={open.row.supplier_code}
            bucket={open.bucket}
            tuoi={sp.tuoi && nhanTuoi ? { khoa: sp.tuoi, nhan: nhanTuoi } : null}
            ky={sp.ky}
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
