// BẢNG ĐƠN MUA dùng CHUNG cho Mua hàng › Đơn mua và Kế toán › Đơn mua hàng (phương án 3, 07/10/2026).
// Trước đây hai màn có hai bảng viết riêng nên cùng một đơn hiện hai kiểu; nay hai nơi chỉ khác chip
// lọc mặc định và nút trong ngăn đơn.
//
// Hai cột trạng thái tách bạch như trang Orders của Shopify: HÀNG (Nháp → Đã về đủ) và TIỀN (Chưa trả
// → Đã trả đủ, kèm hạn). Chưa có hàng về thì chưa có nợ ⇒ cột Còn nợ và Tiền để trống.
// Khuôn lưới `lds` (08/10/2026): cột do màn cha giữ (`useCotBang`), mỗi màn một khoá nhớ.
import type { ReactNode } from "react";
import type { MuaChoLenh, PurchaseRequestRow } from "../../../api/client";
import { CuonLuoi, ngayVN, rongLuoi, soCotGhim, soVN } from "../../../components/LuoiDs";
import { PhanTrangDayDu } from "../../../components/PhanTrangDayDu";
import { fmtDate, fmtDateTime } from "../../../utils/format";
import { OMuaCho } from "../mua-cho/OMuaCho";
import { ChipNhan, DongRong, type CotBang, type CotMH } from "../luoi-mua-hang";
import { ChamTT, TT_DON, TT_TIEN } from "../trang-thai-mua";
import "../trang-thai-mua.css";

/** Cột của lưới Đơn mua: Mã → Ngày → Nhà cung cấp → chứng từ nguồn → Mua cho → Tiền → Hàng → Tiền (trả). */
export const COT_DON: CotMH[] = [
  { key: "ma", label: "Mã đơn", coDinh: true, w: 150 },
  { key: "ngay", label: "Ngày tạo", w: 104 },
  { key: "can", label: "Ngày cần", w: 104 },
  { key: "ncc", label: "Nhà cung cấp", w: 220 },
  { key: "yc", label: "Yêu cầu", w: 160 },
  { key: "mua_cho", label: "Mua cho", w: 160 },
  { key: "tong", label: "Tổng đơn", w: 120, n: true },
  { key: "no", label: "Còn nợ", w: 110, n: true },
  { key: "hang", label: "Hàng", w: 190 },
  { key: "tien", label: "Tiền" },
];

/** "7/10/2026" → "7/10" (bỏ năm; ngày đủ nằm ở chú thích). */
const ngayNgan = (d: string) => fmtDate(d).replace(/\/\d{4}$/, "");

/** Hạn trả gần nhất trong các đợt còn nợ — `null` khi không đợt nào có hạn. */
export function hanGanNhat(row: PurchaseRequestRow): string | null {
  return (
    row.deliveries
      .filter((d) => d.con_no > 0 && d.due_date)
      .map((d) => d.due_date as string)
      .sort()[0] ?? null
  );
}

function OHang({ row }: { row: PurchaseRequestRow }) {
  let phu: ReactNode = null;
  if (row.status === "partially_received" && row.total_estimate > 0) {
    phu = `${Math.min(99, Math.round((row.gia_tri_da_giao / row.total_estimate) * 100))}%`;
  } else if ((row.status === "purchased" || row.status === "approved") && row.expected_receipt_date) {
    phu = `hẹn ${ngayNgan(row.expected_receipt_date)}`;
  }
  return (
    <>
      <ChipNhan nhan={TT_DON[row.status]} />
      {phu && <span className="lds-mu" style={{ marginLeft: 6 }}>{phu}</span>}
    </>
  );
}

function OTien({ row }: { row: PurchaseRequestRow }) {
  if (!row.nhom_tien) {
    return row.coc_da_chi > 0 && row.status !== "cancelled" ? (
      <span className="lds-mu">Đã cọc {soVN(row.coc_da_chi)}</span>
    ) : null;
  }
  const han = row.nhom_tien === "da_tra" ? null : hanGanNhat(row);
  return (
    <>
      <ChamTT nhan={TT_TIEN[row.nhom_tien]} />
      {han && <span className="lds-mu" style={{ marginLeft: 6 }}>hạn {ngayNgan(han)}</span>}
    </>
  );
}

export function BangDonMua({
  cot,
  rows,
  loading,
  loi,
  onThuLai,
  chonId,
  onChon,
  openYcmh,
  coLoc,
  onXoaLoc,
  goiYTrong,
  total,
  page,
  size,
  onPage,
  onSize,
  onMoLenh,
}: {
  cot: CotBang;
  rows: PurchaseRequestRow[];
  loading: boolean;
  loi: string | null;
  onThuLai: () => void;
  chonId: number | null;
  onChon: (id: number) => void;
  /** Thiếu = không có ô Xem màn Yêu cầu mua hàng ⇒ mã chỉ hiện dạng chữ. */
  openYcmh?: (code: string) => void;
  coLoc: boolean;
  onXoaLoc: () => void;
  /** Câu gợi ý khi bảng trống mà không lọc gì. */
  goiYTrong: string;
  total: number;
  page: number;
  size: number;
  onPage: (p: number) => void;
  onSize: (n: number) => void;
  onMoLenh?: (l: MuaChoLenh) => void;
}) {
  const cotHien = cot.hien;
  return (
    <div className="lds-sheet">
      <CuonLuoi ghim={soCotGhim(cotHien)}>
        {/* Cột co giãn cuối (Tiền: chấm + "hạn dd/mm") cần ≥ 200px, hơn mức 150 mặc định. */}
        <table className="lds-g" style={{ minWidth: rongLuoi(cotHien, 200) }}>
          <colgroup>
            {cotHien.map((c) => (
              <col key={c.key} style={c.w ? { width: c.w } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cotHien.map((c) => (
                <th key={c.key} className={c.n ? "n" : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(loading && rows.length === 0) || loi || rows.length === 0 ? (
              <DongRong
                soCot={cotHien.length}
                dangTai={loading && rows.length === 0}
                loi={loi}
                onThuLai={onThuLai}
                chuaCo="Chưa có đơn mua hàng nào."
                khongKhop="Không có đơn mua hàng nào khớp điều kiện đang lọc."
                coLoc={coLoc}
                onXoaLoc={onXoaLoc}
                goiY={goiYTrong}
              />
            ) : (
              rows.map((row) => {
                const huy = row.status === "cancelled" || row.status === "rejected";
                const nd = row.content?.trim() || row.purpose?.trim() || "";
                const mo = () => onChon(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`lds-dong${chonId === row.id ? " is-chon" : ""}${row.status === "cancelled" ? " mh-cu" : ""}`}
                    tabIndex={0}
                    title={nd || undefined}
                    onClick={mo}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        mo();
                      }
                    }}
                  >
                    {cotHien.map((c) => {
                      switch (c.key) {
                        case "ma":
                          return <td key={c.key}>{row.code}</td>;
                        case "ngay":
                          return <td key={c.key} title={fmtDateTime(row.created_at)}>{ngayVN(row.created_at)}</td>;
                        case "can":
                          return (
                            <td key={c.key} title={row.needed_date ? fmtDate(row.needed_date) : undefined}>
                              {row.needed_date ? ngayVN(row.needed_date) : ""}
                            </td>
                          );
                        case "ncc":
                          return (
                            <td key={c.key} title={row.supplier_name ?? undefined}>
                              {row.supplier_name || <span className="lds-mu3">Chưa chọn</span>}
                            </td>
                          );
                        case "yc":
                          return (
                            <td key={c.key}>
                              {row.sources.length === 0 ? (
                                <span className="lds-mu3">Không gắn</span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="lds-lk"
                                    disabled={!openYcmh}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openYcmh?.(row.sources[0].code);
                                    }}
                                  >
                                    {row.sources[0].code}
                                  </button>
                                  {row.sources.length > 1 && (
                                    <span className="lds-tag" title={row.sources.slice(1).map((s) => s.code).join("\n")}>
                                      +{row.sources.length - 1}
                                    </span>
                                  )}
                                </>
                              )}
                            </td>
                          );
                        case "mua_cho":
                          return (
                            <td key={c.key} onClick={(e) => e.stopPropagation()}>
                              <OMuaCho loai={row.loai_mua_cac} lenh={row.mua_cho} onMoLenh={onMoLenh} />
                            </td>
                          );
                        case "tong":
                          return (
                            <td key={c.key} className="n">
                              <span className={huy ? "mh-gach" : undefined}>{soVN(row.total_estimate)}</span>
                            </td>
                          );
                        case "no":
                          return (
                            <td key={c.key} className="n">
                              {!huy && row.outstanding_amount > 0 ? soVN(row.outstanding_amount) : ""}
                            </td>
                          );
                        case "hang":
                          return <td key={c.key}><OHang row={row} /></td>;
                        case "tien":
                          return <td key={c.key}><OTien row={row} /></td>;
                        default:
                          return <td key={c.key} />;
                      }
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </CuonLuoi>
      {total > 0 && (
        <PhanTrangDayDu
          trang={page}
          size={size}
          tong={total}
          soDong={rows.length}
          onTrang={onPage}
          onSize={onSize}
          loading={loading}
          donVi="đơn"
          ariaLabel="Phân trang đơn mua hàng"
        />
      )}
    </div>
  );
}
