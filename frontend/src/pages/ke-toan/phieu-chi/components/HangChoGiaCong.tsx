/** Hàng "Gia công chờ chi" (đặc tả PC-1): bấm thẻ lọc "Gia công chờ chi" thì bảng phiếu đổi sang
 *  hàng này — lần gia công ngoài đã chốt số lượng, chưa có phiếu chi còn hiệu lực. Thay cho băng
 *  vàng chiếm đầu trang trước đây. Nút "Lập phiếu chi" là nút PHỤ (rust chỉ cho hành động chính
 *  của trang). */
import type { GiaCongChoChi } from "../../../../api/client";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, tien } from "../../shared/dinhDang";
import { cacViec, soChot } from "../shared/giaCong";

export function HangChoGiaCong({
  rows,
  loi,
  onLap,
}: {
  rows: GiaCongChoChi[] | null;
  loi: string | null;
  /** Không có = không có quyền lập phiếu chi ⇒ không hiện nút. */
  onLap?: (row: GiaCongChoChi) => void;
}) {
  return (
    <>
      <div className="kt-tb">
        <span className="kt-mo">
          Việc thuê ngoài đã chốt số lượng, chưa trả tiền. Lập phiếu chi xong thì việc rời khỏi danh sách này.
        </span>
      </div>
      <div className="kt-bang">
        {loi ? (
          <div className="kt-rong-trong" role="alert">
            <b>Không tải được hàng gia công chờ chi.</b>
            <span>{loi}</span>
          </div>
        ) : rows == null ? (
          <div className="kt-rong-trong">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="kt-rong-trong">
            <b>Không còn việc gia công nào chờ chi</b>
          </div>
        ) : (
          <>
            <table className="kt-chinh">
              <colgroup>
                <col />
                <col style={{ width: "20%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Nhà gia công</th>
                  <th>Việc</th>
                  <th className="kt-so">Số chốt</th>
                  <th>Chốt bởi</th>
                  <th className="kt-so">Thành tiền</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.gia_cong_ngoai_id}>
                    <td>
                      <span className="kt-ten">{r.nha_cung_cap_ten}</span>
                      <span className="kt-phu">{r.nhan_nguon || r.lsx_ma}</span>
                    </td>
                    <td>
                      <Cum>
                        {cacViec(r.ten_viec).map((v) => (
                          <TheNho key={v}>{v}</TheNho>
                        ))}
                      </Cum>
                    </td>
                    <td className="kt-so">{soChot(r)}</td>
                    <td>
                      {r.chot_boi_ten ?? "—"}
                      {r.chot_luc && <span className="kt-phu">{ngay(r.chot_luc)}</span>}
                    </td>
                    {/* Không có quyền xem tiền thì máy chủ trả null — ô để trống, không bịa số. */}
                    <td className="kt-so kt-tien">{r.thanh_tien != null ? tien(r.thanh_tien) : ""}</td>
                    <td className="kt-so">
                      {onLap && (
                        <button type="button" className="kt-btn kt-btn--nho" onClick={() => onLap(r)}>Lập phiếu chi</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="kt-the-dt">
              {rows.map((r) => (
                <div key={r.gia_cong_ngoai_id}>
                  <div className="kt-the-dt__h">
                    <span className="kt-ten">{r.nha_cung_cap_ten}</span>
                    <span className="kt-tien">{r.thanh_tien != null ? tien(r.thanh_tien) : ""}</span>
                  </div>
                  <div className="kt-the-dt__h">
                    <Cum className="kt-mo">
                      {cacViec(r.ten_viec).map((v) => (
                        <TheNho key={v}>{v}</TheNho>
                      ))}
                      <span>{soChot(r)}</span>
                    </Cum>
                    {onLap && (
                      <button type="button" className="kt-btn kt-btn--nho" onClick={() => onLap(r)}>Lập phiếu chi</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
