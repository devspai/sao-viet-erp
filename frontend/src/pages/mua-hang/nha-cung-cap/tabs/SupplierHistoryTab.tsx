// Tab "Đơn mua" của ngăn Nhà cung cấp: các đơn mua với NCC này, lưới bảng tính `lds-g` một dòng mỗi
// đơn (07/10/2026). Nhãn trạng thái dùng CHUNG bộ `TT_DON` của màn Mua hàng / Kế toán — cùng một đơn
// không được chỗ ghi "Đã nhập kho", chỗ ghi "Đã về đủ".
import type { PurchaseRequestRow, SupplierRow } from "../../../../api/client";
import { EmptyState } from "../../../../components/EmptyState";
import { fmtDate, money } from "../../../../utils/format";
import { OMuaCho } from "../../mua-cho/OMuaCho";
import { ChipTT, TT_DON } from "../../trang-thai-mua";

export function SupplierHistoryTab({
  mode,
  selected,
  poList,
  poTotal,
  poLoading,
  poError,
}: {
  mode: null | "create" | "edit";
  selected: SupplierRow | null;
  poList: PurchaseRequestRow[];
  poTotal: number;
  poLoading: boolean;
  poError: string | null;
}) {
  // Ca "chưa lưu NCC" không phải đang tải / rỗng / lỗi: chưa đủ điều kiện hỏi máy chủ ⇒ lời dặn.
  if (mode === "create" || !selected) {
    return <div className="banner banner--info">Lưu nhà cung cấp trước rồi mới có đơn mua để xem.</div>;
  }
  if (poLoading) return <EmptyState trangThai="dang-tai" />;
  if (poError) return <EmptyState trangThai="loi" loi={poError} />;
  if (poList.length === 0) {
    return (
      <EmptyState
        icon="cart"
        title="Chưa có đơn mua nào với nhà cung cấp này"
        sub="Đơn mua lập ở màn Mua hàng sẽ tự hiện ở đây."
      />
    );
  }
  return (
    <div className="ncc-dm">
      <p className="ncc-dm__dem">
        {poTotal > poList.length
          ? `${poList.length} đơn mới nhất trên ${poTotal} đơn. Xem đủ ở màn Mua hàng, lọc theo nhà cung cấp này.`
          : `${poTotal} đơn`}
      </p>
      {/* Ngăn kiểu 3 chừa vùng trái ~822px (cột phải 290px). Cột cố định cộng ~626px (mã DMH-261008-X7A0 cần
          150px; ngày 96, tiền 114 vừa số 9 chữ số, trạng thái 124 vừa chip "Về một phần") để Nội dung còn ~196px mà không mọc thanh cuộn ngang; không đặt minWidth —
          ô bị cắt "…" đã có bong bóng đủ chữ. Người tạo vào chú thích ô Mã đơn — với một NCC, ai lập đơn
          ít khi là điều cần dò. */}
      <div className="lds-bang">
        <table className="lds-g">
          <colgroup>
            <col style={{ width: 152 }} />
            <col style={{ width: 96 }} />
            <col />
            <col style={{ width: 140 }} />
            <col style={{ width: 114 }} />
            <col style={{ width: 124 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Ngày tạo</th>
              <th>Nội dung</th>
              <th>Mua cho</th>
              <th className="n">Tổng tiền</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {poList.map((po) => (
              <tr key={po.id}>
                <td title={`Người tạo: ${po.created_by_name || "Hệ thống"}`}>{po.code}</td>
                <td>{fmtDate(po.created_at)}</td>
                <td title={po.purpose || undefined}>
                  {po.purpose || <span className="lds-mu3">Không ghi</span>}
                </td>
                <td>
                  <OMuaCho loai={po.loai_mua_cac} lenh={po.mua_cho} />
                </td>
                <td className="n">{money(po.total_estimate ?? 0)}</td>
                <td>
                  <ChipTT nhan={TT_DON[po.status as keyof typeof TT_DON]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
