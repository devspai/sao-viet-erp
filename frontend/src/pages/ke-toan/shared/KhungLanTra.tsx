/** Khung tab "Đã trả" (ngăn Công nợ phải trả) / "Đã thu" (ngăn Công nợ phải thu) — đặc tả NPT-2,
 *  NPTh-2: nhóm nút "Trong kỳ | Tất cả" + thẻ "n lần trả" cạnh "Tổng …"; bảng do màn vẽ; rỗng thì một
 *  câu (trong kỳ kèm nút xem mọi lần); còn lần chưa tải thì "Hiện a trên b … — Xem thêm".
 *
 *  Máy chủ cắt trang: `soDaTai` là số dòng ĐÃ TẢI, `tong` là tổng số lần trong phạm vi (`paid_total`).
 */
import type { ReactNode } from "react";

import { NhomNut } from "./BoLocNangCao";
import { Cum, TheNho } from "./Cum";
import { tien, vietSo } from "./dinhDang";

export type PhamViDaTra = "ky" | "tat_ca";

export function KhungLanTra({
  phamVi,
  onPhamVi,
  tong,
  soDaTai,
  donVi,
  tongTien,
  chuRongKy,
  nutXemMoi,
  chuRongTatCa,
  onXemThem,
  dangTaiThem = false,
  children,
}: {
  phamVi: PhamViDaTra;
  onPhamVi: (v: PhamViDaTra) => void;
  tong: number;
  soDaTai: number;
  /** "lần trả" / "lần thu". */
  donVi: string;
  /** Tổng tiền của CẢ phạm vi (không theo trang đã tải). */
  tongTien: number;
  /** "Chưa trả lần nào trong kỳ này." */
  chuRongKy: string;
  /** "Xem mọi lần trả". */
  nutXemMoi: string;
  /** "Chưa trả lần nào cho nhà cung cấp này." */
  chuRongTatCa: string;
  onXemThem: () => void;
  dangTaiThem?: boolean;
  /** Bảng các lần đã tải — chỉ vẽ khi có dòng. */
  children: ReactNode;
}) {
  return (
    <>
      <div className="kt-hang-loc">
        <NhomNut<PhamViDaTra> giaTri={phamVi} luaChon={[["ky", "Trong kỳ"], ["tat_ca", "Tất cả"]]} onDoi={onPhamVi} />
        <Cum className="kt-mo">
          <TheNho>{`${vietSo(tong)} ${donVi}`}</TheNho>
          <span>{`Tổng ${tien(tongTien)}`}</span>
        </Cum>
      </div>
      {soDaTai === 0 ? (
        <p className="kt-mo">
          {phamVi === "ky" ? (
            <>
              {`${chuRongKy} `}
              <button type="button" className="kt-lk" onClick={() => onPhamVi("tat_ca")}>{nutXemMoi}</button>
            </>
          ) : (
            chuRongTatCa
          )}
        </p>
      ) : (
        children
      )}
      {soDaTai > 0 && soDaTai < tong && (
        <div className="kt-hang-loc">
          <span className="kt-mo">{`Hiện ${vietSo(soDaTai)} trên ${vietSo(tong)} ${donVi}`}</span>
          <button type="button" className="kt-btn kt-btn--nho" disabled={dangTaiThem} onClick={onXemThem}>
            {dangTaiThem ? "Đang tải…" : "Xem thêm"}
          </button>
        </div>
      )}
    </>
  );
}
