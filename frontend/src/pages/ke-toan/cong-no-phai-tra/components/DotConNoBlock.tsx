// Tab "Còn nợ" của ngăn Công nợ phải trả (đặc tả NPT-2): các đợt giao gom theo ĐƠN MUA.
//
// Đầu nhóm: mã đơn (link sang Đơn mua) + thẻ "Cọc …" của CHÍNH đơn đó, kèm chữ mờ "Đã trừ …",
// "Còn …" + "còn nợ …" bên phải. Bảng: ☐ (ô đầu cột chọn mọi đợt của đơn) | Đợt | Ngày giao | Hoá đơn | Hạn trả | Giá trị | Đã trả | Trừ cọc |
// Còn nợ. Bấm dòng mở khối "Hàng của đợt" gấp ngay dưới. Tích đợt để trả nhiều đợt một lượt — việc
// chọn do ngăn giữ (thanh chân tối nằm ở ngăn).
import { Fragment } from "react";

import type { PayableItemRow, PayablesDetail } from "../../../../api/client";
import { Cum, TheNho } from "../../shared/Cum";
import { ngay, vietSo } from "../../shared/dinhDang";
import { so } from "../../shared/oCongNo";
import { gomTheoDon, tenKhoan } from "../shared/helpers";
import { HangCuaDot } from "./HangCuaDot";
import { HanTra, HoaDon } from "./payablesCells";

export function DotConNoBlock({
  detail,
  khoanNo,
  dangLoc,
  coChon,
  chonDuoc,
  chon,
  onChon,
  moHang,
  onMoHang,
  onMoDon,
}: {
  detail: PayablesDetail;
  /** Các đợt đang hiện (đã lọc theo mốc tuổi), giữ thứ tự máy chủ đã sắp. */
  khoanNo: PayableItemRow[];
  /** Đang lọc theo mốc ⇒ câu "rỗng" nói về bộ lọc, không nói "không còn nợ". */
  dangLoc: boolean;
  /** Có quyền lập phiếu chi ⇒ có cột ô chọn. */
  coChon: boolean;
  chonDuoc: (row: PayableItemRow) => boolean;
  chon: ReadonlySet<number>;
  onChon: (next: Set<number>) => void;
  /** Khoá dòng đang mở khối hàng ("đơn:đợt"). */
  moHang: string | null;
  onMoHang: (khoa: string | null) => void;
  /** Không có = không có quyền xem Đơn mua ⇒ mã đơn là chữ thường. */
  onMoDon?: (code: string) => void;
}) {
  const chuaDatHan = detail.items.filter((x) => x.chua_dat_han && !x.da_tat_toan).length;
  const soCot = coChon ? 9 : 8;

  function dao(ids: number[], bat: boolean) {
    const next = new Set(chon);
    for (const id of ids) {
      if (bat) next.add(id);
      else next.delete(id);
    }
    onChon(next);
  }

  if (khoanNo.length === 0) {
    return (
      <p className="kt-mo">
        {dangLoc ? "Không có đợt nào còn nợ ở mục này." : "Không còn đợt nào nợ nhà cung cấp này."}
      </p>
    );
  }

  return (
    <>
      {chuaDatHan > 0 && (
        <p className="kt-bang-xam">
          {`Có ${chuaDatHan} khoản chưa có hạn trả nên không bao giờ vào Quá hạn — chúng được đẩy lên đầu. Khai Số ngày cho nợ ở hồ sơ nhà cung cấp để hết ca này.`}
        </p>
      )}
      {gomTheoDon(khoanNo, detail.coc_chung).map((don) => {
        // Đỏ chỉ khi CHÍNH đơn này có đợt đang trễ — `overdue_days` máy chủ đã tính sẵn.
        const dangTre = don.items.some((it) => it.overdue_days > 0);
        const idChon = don.items.filter(chonDuoc).map((r) => r.delivery_id as number);
        const daChonHet = idChon.length > 0 && idChon.every((id) => chon.has(id));
        return (
          <section key={don.purchase_request_id} className="kt-nhom" role="group" aria-label={`Đơn ${don.code}`}>
            <div className="kt-nhom__dau">
              <Cum>
                {onMoDon ? (
                  <button type="button" className="kt-lk" onClick={() => onMoDon(don.code)}>{don.code}</button>
                ) : (
                  <b>{don.code}</b>
                )}
                {/* Cọc của CHÍNH đơn này: "Cọc" là thẻ, hai số theo sau là chữ mờ — tách bằng khoảng
                    trống của `Cum`, không chắp thành câu "a · đã trừ b". */}
                {don.coc && don.coc.amount > 0 && <TheNho>{`Cọc ${vietSo(don.coc.amount)}`}</TheNho>}
                {don.coc && don.coc.da_dung > 0 && <span className="kt-mo">{`Đã trừ ${vietSo(don.coc.da_dung)}`}</span>}
                {don.coc && don.coc.con_du > 0 && <span className="kt-mo">{`Còn ${vietSo(don.coc.con_du)}`}</span>}
              </Cum>
              <span className="kt-phai">
                {"còn nợ "}
                <span className={dangTre ? "kt-do" : undefined}>{vietSo(don.con_no)}</span>
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  {coChon && (
                    <th>
                      <input type="checkbox" className="kt-ck" checked={daChonHet} disabled={idChon.length === 0}
                        aria-label={`Chọn mọi đợt còn nợ của ${don.code}`}
                        onChange={(e) => dao(idChon, e.target.checked)} />
                    </th>
                  )}
                  <th>Đợt</th>
                  <th>Ngày giao</th>
                  <th>Hoá đơn</th>
                  <th>Hạn trả</th>
                  <th className="kt-so">Giá trị</th>
                  <th className="kt-so">Đã trả</th>
                  {/* Cột RIÊNG, không gộp vào "Đã trả" (chủ chốt 27/08/2026): cầm sao kê nhà cung
                      cấp dò không ra giao dịch nào cho phần cọc chiếu xuống. */}
                  <th className="kt-so">Trừ cọc</th>
                  <th className="kt-so">Còn nợ</th>
                </tr>
              </thead>
              <tbody>
                {don.items.map((row) => {
                  const khoa = `${don.purchase_request_id}:${row.delivery_id ?? "don"}`;
                  // Dòng "cả đơn" (phiếu CŨ) không có hàng nào quy về được ⇒ không mở khối hàng.
                  const coHang = row.lines.length > 0;
                  const mo = coHang && moHang === khoa;
                  const daTich = row.delivery_id != null && chon.has(row.delivery_id);
                  const lop = ["kt-dong", daTich ? "kt-da-tich" : "", row.da_tat_toan ? "kt-xong" : ""].filter(Boolean).join(" ");
                  const bam = () => coHang && onMoHang(mo ? null : khoa);
                  return (
                    <Fragment key={khoa}>
                      <tr className={lop} tabIndex={coHang ? 0 : undefined} aria-expanded={coHang ? mo : undefined}
                        title={coHang ? "Bấm để xem hàng của đợt" : undefined}
                        onClick={bam}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          // Esc trên dòng đang mở: gấp khối hàng, KHÔNG đóng ngăn (ngăn bỏ qua phím đã
                          // preventDefault). Esc lần nữa mới tới ngăn.
                          if (e.key === "Escape" && mo) {
                            e.preventDefault();
                            onMoHang(null);
                            return;
                          }
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            bam();
                          }
                        }}>
                        {coChon && (
                          <td onClick={(e) => e.stopPropagation()}>
                            {row.delivery_id == null ? (
                              // Đơn cũ không theo đợt: ô mờ + lời giải thích, không giấu đi — giấu thì
                              // người dùng tưởng dòng này trả gộp được mà không ra.
                              <input type="checkbox" className="kt-ck" disabled
                                aria-label={`Chọn ${tenKhoan(row)} của ${don.code}`}
                                title="Đơn cũ không theo đợt giao. Lập phiếu chi cho đơn này ở màn Đơn mua hàng." />
                            ) : chonDuoc(row) ? (
                              <input type="checkbox" className="kt-ck" checked={daTich}
                                aria-label={`Chọn ${tenKhoan(row)} của ${don.code}`}
                                onChange={(e) => dao([row.delivery_id as number], e.target.checked)} />
                            ) : null}
                          </td>
                        )}
                        <td>{tenKhoan(row)}</td>
                        <td>{ngay(row.delivery_date)}</td>
                        <td>
                          <HoaDon so={row.invoice_number} ngayHd={row.invoice_date} files={row.hoa_don_files} />
                        </td>
                        <td>
                          <HanTra row={row} homNay={detail.as_of} />
                        </td>
                        <td className="kt-so">{so(row.amount)}</td>
                        <td className="kt-so">{so(row.paid)}</td>
                        <td className="kt-so">{so(row.coc_bu)}</td>
                        <td className="kt-so">
                          <b>{vietSo(row.con_no)}</b>
                        </td>
                      </tr>
                      {mo && <HangCuaDot item={row} soCot={soCot} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
