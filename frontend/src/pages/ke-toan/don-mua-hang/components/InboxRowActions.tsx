// Cụm NÚT THAO TÁC đầu ngăn đơn (Lập Phiếu chi) — tách từ pages/AccountingPurchaseInboxPage.tsx.
// Duyệt / Từ chối đã dời xuống dải `DaiDuyet` (15/10/2026), cùng khuôn dải gửi duyệt bên Mua hàng.
import type { Dispatch, SetStateAction } from "react";
import type { PurchaseRequestRow } from "../../../../api/client";
import { Button } from "../../../../components/Button";

export function InboxRowActions({
  row,
  compact,
  canCreateVoucher,
  closeDetailThen,
  setVoucherMode,
}: {
  row: PurchaseRequestRow;
  compact: boolean;
  canCreateVoucher: boolean;
  closeDetailThen: (action: () => void) => void;
  setVoucherMode: Dispatch<
    SetStateAction<null | { purchase: PurchaseRequestRow }>
  >;
}) {
  // Chỉ đơn ĐÃ DUYỆT mới lập được phiếu chi — và người lập là KẾ TOÁN, không cần quyền
  // duyệt. Backend cũng đã chặn (`accounting_service` chỉ nhận PMH từ approved trở lên),
  // đây là lớp hiển thị cho khớp.
  // Trần lập phiếu nay có HAI mức khác nhau (Đ1/§5.4): `tran_dat_coc` cho phiếu đặt cọc
  // (theo giá trị đơn đặt — cọc là chi khi hàng chưa về) và `outstanding_amount` = CÔNG NỢ
  // cho phiếu thanh toán. Còn chỗ ở một trong hai là còn lập được, nên nút hiện khi tổng
  // hai đường còn > 0; hộp thoại mới là chỗ chốt trần theo loại phiếu đã chọn.
  const showVoucher =
    canCreateVoucher &&
    ["approved", "purchased", "partially_received", "received"].includes(
      row.status,
    ) &&
    Math.max(row.tran_dat_coc, row.outstanding_amount) > 0;

  if (!showVoucher) return null;

  return (
    <div className={`acct-actions${compact ? " acct-actions--compact" : ""}`}>
      {showVoucher && (
        <Button
          type="button"
          variant="accent"
          onClick={() =>
            closeDetailThen(() =>
              setVoucherMode({ purchase: row }),
            )
          }
        >
          Lập Phiếu chi
        </Button>
      )}
    </div>
  );
}
