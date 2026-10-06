/** Bảng danh sách phiếu chi (đặc tả PC-1, A.9, A.10, A.12, A.13).
 *
 *  Cột theo thứ tự đọc: chi cho ai — bao nhiêu — xong chưa — vì đâu — khi nào — mã phiếu. Mẩu thông
 *  tin đứng cạnh nhau KHÔNG nối bằng "·" hay dấu phẩy: mẩu loại là thẻ nhỏ, còn lại chữ thường.
 *  Dòng đi được bằng bàn phím (↑ ↓ chuyển, Enter mở). Dưới 640px mỗi dòng thành một thẻ hai hàng.
 */
import { ChevronRight } from "lucide-react";

import type { PaymentVoucherRow } from "../../../../api/client";
import { PhanTrangDayDu } from "../../../../components/PhanTrangDayDu";
import { BangRong, TheDienThoai, ThieuChungTu, diChuyen, lopDong } from "../../shared/BangPhieu";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, ngayGio, tien, vietSo } from "../../shared/dinhDang";
import { STATUS_META, VOUCHER_METHOD_LABELS, nguonPhieu } from "../shared/list-constants";


/** Pill trạng thái + dòng "Thiếu chứng từ" (chỉ phiếu đã chi mới cần chứng từ). */
export function TrangThaiPhieu({ row, gon }: { row: PaymentVoucherRow; gon?: boolean }) {
  return (
    <>
      <span className={`kt-tt kt-tt--${row.status === "paid" ? "xanh" : "xam"}`}>{STATUS_META[row.status].label}</span>
      {!gon && row.status === "paid" && row.attachment_count === 0 && <ThieuChungTu />}
    </>
  );
}

export function VouchersTable({
  rows,
  loading,
  loi,
  onTaiLai,
  dangXem,
  onMo,
  coLoc,
  onBoLoc,
  onLap,
  trang,
  size,
  tong,
  onTrang,
  onSize,
}: {
  rows: PaymentVoucherRow[];
  loading: boolean;
  /** Lỗi tải danh sách — bảng rỗng thì nói "không tải được", không nói "chưa có". */
  loi: string | null;
  onTaiLai: () => void;
  dangXem: number | null;
  onMo: (id: number) => void;
  /** Đang lọc gì ngoài kỳ ⇒ bảng rỗng mời "Bỏ lọc". */
  coLoc: boolean;
  onBoLoc: () => void;
  /** Không có = không có quyền lập phiếu ⇒ bảng rỗng không mời lập. */
  onLap?: () => void;
  trang: number;
  size: number;
  tong: number;
  onTrang: (n: number) => void;
  onSize: (n: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <BangRong loading={loading} loi={loi} coLoc={coLoc} onTaiLai={onTaiLai} onBoLoc={onBoLoc} onLap={onLap}
        chuTai="Đang tải danh sách phiếu chi…" chuLoi="Không tải được danh sách phiếu chi."
        chuChuaCo={<b>Chưa có phiếu chi nào trong kỳ này</b>} nutLap="Lập phiếu chi" />
    );
  }

  return (
    <div className="kt-bang" aria-busy={loading || undefined}>
      <table className="kt-chinh">
        <colgroup>
          <col />
          <col style={{ width: "15%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: 36 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Chi cho</th>
            <th className="kt-so">Số tiền</th>
            <th>Trạng thái</th>
            <th>Nguồn</th>
            <th>Ngày chi</th>
            <th>Ngày tạo</th>
            <th>Mã phiếu</th>
            <th aria-label="Mở" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const nguon = nguonPhieu(row);
            const lop = lopDong(row.id, dangXem, row.status === "cancelled");
            return (
              <tr key={row.id} className={lop} tabIndex={0} onClick={() => onMo(row.id)}
                onKeyDown={(e) => diChuyen(e, () => onMo(row.id))}>
                <td>
                  <span className="kt-ten">{row.supplier_name || "—"}</span>
                  {row.content && <span className="kt-phu" title={row.content}>{row.content}</span>}
                </td>
                <td className="kt-so">
                  <span className="kt-tien">{tien(row.amount_vnd)}</span>
                  {row.currency !== "VND" ? (
                    <Cum className="kt-phu">
                      <TheNho>{`${row.currency} ${vietSo(row.amount)}`}</TheNho>
                      <span>{`tỷ giá ${vietSo(row.exchange_rate)}`}</span>
                    </Cum>
                  ) : (
                    <span className="kt-phu">{VOUCHER_METHOD_LABELS[row.voucher_type]}</span>
                  )}
                </td>
                <td>
                  <TrangThaiPhieu row={row} />
                </td>
                <td>
                  <Cum>
                    <span>{nguon.loai}</span>
                    {nguon.phu && <TheNho>{nguon.phu}</TheNho>}
                  </Cum>
                  {nguon.ma && <span className="kt-phu">{nguon.ma}</span>}
                </td>
                <td>{ngay(row.voucher_date)}</td>
                <td title={ngayGio(row.created_at)}>{ngay(row.created_at)}</td>
                <td className="kt-ma">{row.code}</td>
                <td className="kt-mui">
                  <ChevronRight size={16} aria-hidden="true" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Điện thoại: mỗi dòng một thẻ hai hàng (tên + số tiền; ngày + nguồn + trạng thái). */}
      <TheDienThoai onMo={onMo} the={rows.map((row) => ({
        id: row.id,
        ten: row.supplier_name,
        ma: row.code,
        soVnd: row.amount_vnd,
        ngay: row.voucher_date,
        loai: nguonPhieu(row).loai,
        thieuChungTu: row.status === "paid" && row.attachment_count === 0,
        trangThai: <TrangThaiPhieu row={row} gon />,
      }))} />
      <PhanTrangDayDu
        trang={trang}
        size={size}
        tong={tong}
        soDong={rows.length}
        onTrang={onTrang}
        onSize={onSize}
        loading={loading}
        donVi="phiếu"
        ariaLabel="Phân trang phiếu chi"
      />
    </div>
  );
}
