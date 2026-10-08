// Tab "Yêu cầu giao" — danh sách yêu cầu chờ lên kế hoạch (tách từ pages/GiaoHangPage.tsx).
//
// Tick NHIỀU yêu cầu ⇒ "Lên lượt xe (N)" (chủ chốt 18/09/2026 — "gom nhiều phiếu lại chạy 1
// lượt"): mỗi yêu cầu vẫn một đơn giao hàng + một phiếu xuất kho, chung một vòng xe.
//
// Bố cục theo phương án A (docs/mockups/giao-hang-lam-lai-3-phuong-an.html, chủ chọn 07/10/2026):
// mỗi yêu cầu MỘT dòng, cột Hàng ghi thẳng món + số (thay thẻ "N mặt hàng"), cột Cần giao nói theo
// hạn (Quá hạn / Hôm nay / Ngày mai). Thanh "Lên lượt xe" NỔI ở đáy màn và chỉ hiện khi đã tick —
// nổi chứ không chen vào trên bảng, để lúc hiện/ẩn bảng không nhảy làm cú bấm sau trượt.
import { Fragment, useEffect, useState, type ReactNode } from "react";
import type { DeliveryRequest } from "../../../../api/client";
import { Button } from "../../../../components/Button";
import { EmptyRow } from "../../../../components/EmptyState";
import { fmtDateTime } from "../../../../utils/format";
import { ChipGh, KhoangTrong } from "../components/giaoHangCells";
import { hanGiao, ngayThuan } from "../shared/helpers";
import { CuonLuoi, soCotGhim, rongLuoi, tenKhachGon, xepCot, apLuoi, type CauHinhLuoi, type CotLuoi } from "../../../../components/LuoiDs";

// Lưới phương án A (07/10/2026). Thứ tự: chọn, Mã yêu cầu, Ngày tạo, Đơn, Khách, Hàng, Số lượng,
// Cần giao, Giao tới, Người yêu cầu, nút Lên đơn giao.
export const COT_YC: (CotLuoi & { w?: number; n?: boolean })[] = [
  { key: "chon", label: "Chọn", coDinh: true, w: 38 },
  { key: "ma", label: "Mã yêu cầu", coDinh: true, w: 160 },
  { key: "ngay", label: "Ngày tạo", w: 100 },
  { key: "don", label: "Đơn", w: 100 },
  { key: "khach", label: "Khách hàng", w: 190 },
  { key: "hang", label: "Hàng", w: 230 },
  { key: "sl", label: "Số lượng", w: 105, n: true },
  { key: "can", label: "Cần giao", w: 120 },
  { key: "toi", label: "Giao tới", w: 190 },
  { key: "nguoi", label: "Người yêu cầu", w: 130 },
  { key: "nut", label: "Thao tác", coDinh: true },
];

/** Ngày dạng dd/MM/yyyy theo giờ Việt Nam (mốc máy chủ trả UTC, có khi thiếu hậu tố múi). */
function ngayVn(value: string): string {
  const coMui = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
  const d = new Date(!coMui && value.includes("T") ? `${value}Z` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
      });
}

// =============================================================================
// Tab · Yêu cầu giao
// =============================================================================
export function BangChoLenKeHoach({
  rows,
  loading,
  coLoc = false,
  onMo,
  onLenKeHoach,
  onLenLuot,
  luoi,
  cotAn,
  thuTu = [],
  pheTrang,
}: {
  rows: DeliveryRequest[];
  loading: boolean;
  /** Đang áp ô tìm / kỳ / điều kiện — bảng rỗng thì nói "không khớp" chứ không "hết việc". */
  coLoc?: boolean;
  onMo: (id: number) => void;
  onLenKeHoach: (r: DeliveryRequest) => void;
  /** Lên CHUNG một lượt xe cho các yêu cầu đã tick. */
  onLenLuot?: (rs: DeliveryRequest[]) => void;
  /** Cột người xem đã ẩn (nút "Cột"). */
  /** Cấu hình lưới của màn cha — có thì ghim + kéo độ rộng được. */
  luoi?: CauHinhLuoi;
  cotAn?: Set<string>;
  /** Thứ tự cột người xem đã kéo (nút "Cột"). */
  thuTu?: string[];
  /** Chân bảng (phân trang) — nằm TRONG khung lưới. */
  pheTrang?: ReactNode;
}) {
  // Chọn theo TRANG đang xem. Bảng tải lại (SSE, lên đơn xong) thì bỏ những dòng không còn — yêu
  // cầu đã lên đơn biến khỏi tab, giữ id của nó là gửi lại một yêu cầu đã có chuyến.
  const [chon, setChon] = useState<Set<number>>(new Set());
  // Yêu cầu nhiều món đang SỔ đủ các món ngay dưới hàng (bấm thẻ "+N món").
  const [soRa, setSoRa] = useState<Set<number>>(new Set());
  useEffect(() => {
    setChon((cu) => {
      const con = new Set([...cu].filter((id) => rows.some((r) => r.id === id)));
      return con.size === cu.size ? cu : con;
    });
  }, [rows]);

  if (!loading && rows.length === 0 && coLoc)
    return (
      <KhoangTrong
        title="Không có yêu cầu nào khớp bộ lọc"
        desc="Đổi kỳ, bỏ bớt điều kiện hoặc xoá ô tìm để xem thêm yêu cầu đang chờ."
      />
    );
  if (!loading && rows.length === 0)
    return (
      <KhoangTrong
        title="Không có yêu cầu giao nào đang chờ"
        desc="Mọi yêu cầu Bán hàng gửi sang đều đã lên đơn giao hàng. Yêu cầu mới sẽ hiện ở đây ngay, không cần tải lại trang."
      />
    );

  const doi = (id: number) =>
    setChon((cu) => {
      const moi = new Set(cu);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });
  const tatCa = rows.length > 0 && rows.every((r) => chon.has(r.id));

  const cot = apLuoi(luoi, xepCot(COT_YC, thuTu).filter((c) => !cotAn?.has(c.key) && (c.key !== "chon" || onLenLuot)));
  return (
    <>
      <div className="lds-sheet">
        <CuonLuoi ghim={soCotGhim(cot, luoi?.ghim)}>
        <table className="lds-g" style={{ minWidth: rongLuoi(cot, 130) }}>
          <colgroup>
            {cot.map((c) => (
              <col key={c.key} style={c.w ? { width: c.w } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cot.map((c) =>
                c.key === "chon" ? (
                  <th key={c.key} className="c">
                    <input type="checkbox" className="lds-cb" checked={tatCa} aria-label="Chọn tất cả yêu cầu trên trang"
                      onChange={() => setChon(tatCa ? new Set() : new Set(rows.map((r) => r.id)))} />
                  </th>
                ) : (
                  <th key={c.key} className={c.n ? "n" : undefined} aria-label={c.key === "nut" ? "Thao tác" : undefined}>
                    {c.key === "nut" ? null : c.label}
                    {luoi?.keo(c.key)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {/* Xương chỉ khi CHƯA có hàng nào — tải lại thì giữ hàng cũ, đừng chồng 5 hàng xương lên trên. */}
            {loading && rows.length === 0 && <EmptyRow colSpan={cot.length} trangThai="dang-tai" />}
            {rows.map((r) => {
              const dau = r.lines[0];
              const them = r.lines.length - 1;
              const han = hanGiao(r.ngay_can_giao);
              const tatCaHang = r.lines
                .map((l) => `${l.mo_ta ?? l.hang_ten ?? ""}: ${l.qty.toLocaleString("vi-VN")}${l.don_vi_tinh ? ` ${l.don_vi_tinh}` : ""}`)
                .join("\n");
              const dangSo = soRa.has(r.id);
              const o = (k: string) => {
                switch (k) {
                  case "chon":
                    return (
                      <td key={k} className="c">
                        <input type="checkbox" className="lds-cb" checked={chon.has(r.id)} aria-label={`Chọn ${r.code}`}
                          onChange={() => doi(r.id)} />
                      </td>
                    );
                  case "ma":
                    return (
                      <td key={k}>
                        <button type="button" className="lds-lk" onClick={() => onMo(r.id)}>{r.code}</button>
                      </td>
                    );
                  case "ngay":
                    return <td key={k} title={fmtDateTime(r.created_at)}>{ngayVn(r.created_at)}</td>;
                  case "don":
                    return <td key={k}>{r.order_code}</td>;
                  case "khach":
                    return <td key={k} title={r.customer_name ?? undefined}>{tenKhachGon(r.customer_name)}</td>;
                  case "hang":
                    return (
                      <td key={k} title={tatCaHang}>
                        <span>{dau ? dau.mo_ta ?? dau.hang_ten : "—"}</span>
                        {them > 0 && (
                          <button type="button" className="lds-tag lds-tag--bam" aria-expanded={dangSo}
                            onClick={() => setSoRa((cu) => {
                              const moi = new Set(cu);
                              if (moi.has(r.id)) moi.delete(r.id);
                              else moi.add(r.id);
                              return moi;
                            })}>
                            {dangSo ? "Thu gọn" : `+${them} món`}
                          </button>
                        )}
                      </td>
                    );
                  case "sl":
                    // Một món thì số của món đó; nhiều món khác đơn vị thì cộng vô nghĩa ⇒ để trống,
                    // xem đủ ở ô Hàng (rê chuột / "+N món") hoặc mở mã yêu cầu.
                    return (
                      <td key={k} className="n">
                        {dau && them === 0 ? (
                          <>
                            {dau.qty.toLocaleString("vi-VN")}
                            {dau.don_vi_tinh && <span className="lds-u">{dau.don_vi_tinh}</span>}
                          </>
                        ) : <span className="lds-mu3">—</span>}
                      </td>
                    );
                  case "can":
                    return (
                      <td key={k} title={r.ngay_can_giao ? ngayThuan(r.ngay_can_giao) : undefined}>
                        {han.tone ? <ChipGh text={han.text} tone={han.tone} /> : han.text}
                      </td>
                    );
                  case "toi":
                    return <td key={k} className="lds-mu" title={r.dia_chi ?? undefined}>{r.dia_chi ?? "—"}</td>;
                  case "nguoi":
                    return <td key={k}>{r.created_by_name}</td>;
                  case "nut":
                    return (
                      <td key={k} className="lds-nut">
                        <Button variant="ghost" onClick={() => onLenKeHoach(r)}>Lên đơn giao</Button>
                      </td>
                    );
                  default:
                    return <td key={k} />;
                }
              };
              return (
                <Fragment key={r.id}>
                  <tr className={chon.has(r.id) ? "is-tick" : undefined}>{cot.map((c) => o(c.key))}</tr>
                  {dangSo && (
                    <tr className="lds-so">
                      <td colSpan={cot.length}>
                        <ul>
                          {r.lines.map((l) => (
                            <li key={l.id}>
                              <span>{l.mo_ta ?? l.hang_ten}</span>
                              <span>
                                {l.qty.toLocaleString("vi-VN")}
                                {l.don_vi_tinh && <span className="lds-u">{l.don_vi_tinh}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </CuonLuoi>
        {pheTrang}
      </div>
      {onLenLuot && chon.size > 0 && (
        <div className="gh-chon-noi" role="region" aria-label="Yêu cầu đã chọn">
          <span>Đã chọn {chon.size} yêu cầu</span>
          <span className="gh-nho">Chở chung một lượt xe</span>
          <Button variant="ghost" onClick={() => setChon(new Set())}>Bỏ chọn</Button>
          <Button variant="accent" onClick={() => onLenLuot(rows.filter((r) => chon.has(r.id)))}>
            Lên lượt xe ({chon.size})
          </Button>
        </div>
      )}
    </>
  );
}
