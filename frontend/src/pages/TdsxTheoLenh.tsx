// Góc "Theo lệnh" của màn Theo dõi sản xuất (làm gọn 05/10/2026, đặc tả 3.4): mỗi lệnh còn sống
// một dòng, máy chủ đã sắp (số cờ giảm dần → GẤP → hạn SX → mã) và cắt ở 200 dòng.
//
// KHÔNG phân trang giả ở trình duyệt: quá 200 thì nói ra và mời thu hẹp bằng ô tìm.
import type { ReactNode } from "react";

import type { TdsxTheoLenhDong, TdsxTheoLenhOut } from "../api/client";
import { Skeleton, ngay, num } from "./keHoachSxShared";
import { ngayNgan } from "./lsxHoSoChung";
import { CO_NHAN, DaiChang, TheGap, buocThu, nhanKhau } from "./lsxKhau";

const SO_COT = 6;

export function TdsxTheoLenh({
  data,
  dangTai,
  rong,
  onMo,
}: {
  /** `null` = chưa có lượt nào về ⇒ khung xám. */
  data: TdsxTheoLenhOut | null;
  dangTai: boolean;
  rong: ReactNode;
  onMo: (lsxId: number) => void;
}) {
  return (
    <>
      <div className="lsc-khung" tabIndex={0} role="group" aria-label="Bảng theo lệnh, cuộn ngang được bằng phím mũi tên">
        <table className="lsc-bang tdsx-lenh">
          <caption className="sr-only">Lệnh đang sản xuất và vấn đề của từng lệnh</caption>
          <thead>
            <tr>
              <th scope="col">Lệnh</th>
              <th scope="col">Sản phẩm</th>
              <th scope="col">Khách</th>
              <th scope="col">Đang ở</th>
              <th scope="col">Hạn SX</th>
              <th scope="col">Vấn đề</th>
            </tr>
          </thead>
          {data === null ? (
            <Skeleton rows={8} cols={SO_COT} />
          ) : (
            <tbody className={dangTai ? "is-mo" : undefined}>
              {data.items.length === 0 ? (
                <tr className="lsc-bang__rong">
                  <td colSpan={SO_COT}>{rong}</td>
                </tr>
              ) : (
                data.items.map((r) => <Dong key={r.lsx_id} r={r} onMo={onMo} />)
              )}
            </tbody>
          )}
        </table>
      </div>
      {data && data.total > data.items.length && (
        <p className="tdsx-cat" role="note">
          Hiện {num(data.items.length)} trên {num(data.total)} lệnh, thu hẹp bằng ô tìm.
        </p>
      )}
    </>
  );
}

function Dong({ r, onMo }: { r: TdsxTheoLenhDong; onMo: (id: number) => void }) {
  const tre = r.canh_bao.includes("tre_han");
  const thu = buocThu(r.chang);
  return (
    <tr>
      <td>
        <span className="lsc-cum">
          <button
            type="button"
            className="lsc-ma"
            data-lsx={r.lsx_id}
            onClick={() => onMo(r.lsx_id)}
            aria-label={`Mở hồ sơ lệnh ${r.ma}${r.ten ? ` — ${r.ten}` : ""}`}
          >
            {r.ma}
          </button>
          {r.is_rush && <TheGap />}
        </span>
      </td>
      <td>
        {r.ten ?? "Chưa đặt tên"}
        <span className="lsc-phu">
          {num(r.so_luong_dat)}
          {r.don_vi_tinh ? ` ${r.don_vi_tinh}` : ""}
        </span>
      </td>
      <td>{r.khach_hang ?? "–"}</td>
      <td>
        {r.khau === "dang_sx" ? (
          <>
            <span className="lsc-cum">
              <DaiChang chang={r.chang} />
              <span>{r.buoc_hien_tai ?? "Chưa vào bước nào"}</span>
            </span>
            {thu && <span className="lsc-phu">{thu}</span>}
          </>
        ) : (
          <span>{nhanKhau(r.khau, r.khau_chi_tiet)}</span>
        )}
      </td>
      <td>
        {ngay(r.han_hoan_thanh_sx)}
        {tre && r.du_kien_xong && <span className="lsc-phu lsc-do">dự kiến {ngayNgan(r.du_kien_xong)}</span>}
      </td>
      <td>
        {r.canh_bao.length === 0 ? (
          <span className="lsc-phu">–</span>
        ) : (
          <span className="lsc-cum">
            {r.canh_bao.map((c) => (
              <span key={c} className="lsc-pill lsc-pill--signal">
                {c === "tre_han" && r.tre_ngay != null ? `Trễ ${r.tre_ngay} ngày` : (CO_NHAN[c] ?? c)}
              </span>
            ))}
          </span>
        )}
      </td>
    </tr>
  );
}
