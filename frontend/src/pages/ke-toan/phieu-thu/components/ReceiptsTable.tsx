/** Bảng danh sách phiếu thu (đặc tả PT-1, A.9, A.10, A.12, A.13) — đối xứng bảng Phiếu chi.
 *
 *  Cột theo thứ tự đọc: thu của ai — bao nhiêu — xong chưa — vì đâu — khi nào — mã phiếu. Mẩu thông
 *  tin đứng cạnh nhau KHÔNG nối bằng "·" hay dấu phẩy: mẩu loại là thẻ nhỏ, còn lại chữ thường.
 *  Mã nguồn là link khi người xem mở được nơi đó (`moNguon`); bấm link không mở ngăn phiếu.
 */
import { ChevronRight } from "lucide-react";

import type { PaymentReceiptRow } from "../../../../api/client";
import { PhanTrangDayDu } from "../../../../components/PhanTrangDayDu";
import { BangRong, TheDienThoai, ThieuChungTu, diChuyen, lopDong } from "../../shared/BangPhieu";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, ngayGio, tien, vietSo } from "../../shared/dinhDang";
import { STATUS_META } from "../shared/constants";
import { methodText, sourceCode, sourceLabel } from "../shared/helpers";

/** Pill trạng thái + dòng "Thiếu chứng từ" (chỉ phiếu đã thu mới cần chứng từ). */
export function TrangThaiPhieuThu({ row, gon }: { row: PaymentReceiptRow; gon?: boolean }) {
  const tt = STATUS_META[row.status];
  return (
    <>
      <span className={`kt-tt kt-tt--${tt.mau}`}>{tt.label}</span>
      {!gon && row.status === "received" && row.attachment_count === 0 && <ThieuChungTu />}
    </>
  );
}

export function ReceiptsTable({
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
  moNguon,
}: {
  rows: PaymentReceiptRow[];
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
  /** Cách mở nơi nguồn của một phiếu; undefined = không mở được (thiếu quyền / thu khác). */
  moNguon?: (row: PaymentReceiptRow) => (() => void) | undefined;
}) {
  if (rows.length === 0) {
    return (
      <BangRong loading={loading} loi={loi} coLoc={coLoc} onTaiLai={onTaiLai} onBoLoc={onBoLoc} onLap={onLap}
        chuTai="Đang tải danh sách phiếu thu…" chuLoi="Không tải được danh sách phiếu thu."
        chuChuaCo={
          <>
            <b>Chưa có phiếu thu nào trong kỳ này</b>
            <span>Thu cọc lập ở Đơn hàng bán, thu hoá đơn lập ở Công nợ phải thu; khoản thu khác lập ở đây.</span>
          </>
        }
        nutLap="Lập phiếu thu" />
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
            <th>Thu của</th>
            <th className="kt-so">Số tiền</th>
            <th>Trạng thái</th>
            <th>Nguồn</th>
            <th>Ngày thu</th>
            <th>Ngày tạo</th>
            <th>Mã phiếu</th>
            <th aria-label="Mở" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ma = sourceCode(row);
            const mo = ma ? moNguon?.(row) : undefined;
            const lop = lopDong(row.id, dangXem, row.status === "cancelled");
            return (
              <tr key={row.id} className={lop} tabIndex={0} onClick={() => onMo(row.id)}
                onKeyDown={(e) => diChuyen(e, () => onMo(row.id))}>
                <td>
                  <span className="kt-ten">{row.payer_name || "—"}</span>
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
                    <span className="kt-phu">{methodText(row)}</span>
                  )}
                </td>
                <td>
                  <TrangThaiPhieuThu row={row} />
                </td>
                <td>
                  <span>{sourceLabel(row)}</span>
                  {ma && (mo ? (
                    <span className="kt-phu">
                      <button type="button" className="kt-lk"
                        onClick={(e) => {
                          e.stopPropagation();
                          mo();
                        }}
                        onKeyDown={(e) => e.stopPropagation()}>
                        {ma}
                      </button>
                    </span>
                  ) : (
                    <span className="kt-phu">{ma}</span>
                  ))}
                </td>
                <td>{ngay(row.receipt_date)}</td>
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
        ten: row.payer_name,
        ma: row.code,
        soVnd: row.amount_vnd,
        ngay: row.receipt_date,
        loai: sourceLabel(row),
        thieuChungTu: row.status === "received" && row.attachment_count === 0,
        trangThai: <TrangThaiPhieuThu row={row} gon />,
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
        ariaLabel="Phân trang phiếu thu"
      />
    </div>
  );
}
