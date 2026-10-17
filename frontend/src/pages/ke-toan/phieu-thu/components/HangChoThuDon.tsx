/** Hàng "Đơn hàng chờ thu" (17/10/2026), cùng khuôn "Gia công chờ chi" bên Phiếu chi: cọc của đơn đã
 *  chốt chưa thu đủ + hoá đơn khách chưa trả hết. Thu đủ thì dòng rời danh sách; huỷ phiếu thu thì
 *  dòng quay lại. Số còn nợ của hoá đơn cùng số màn Công nợ phải thu. Cột "Trả lại ngoài đơn" chỉ hiện
 *  khi có hoá đơn được cộng nợ lại tiền đã trả khách ngoài đơn: Phải thu + Trả lại ngoài đơn − Đã thu =
 *  Còn phải thu, Đã thu là số thật của phiếu. */
import type { CocChoThu, HoaDonChoThu } from "../../../../api/client";
import { CuonLuoi, rongLuoi, type CauHinhLuoi, type CotLuoi } from "../../../../components/LuoiDs";
import { ngay, tien } from "../../shared/dinhDang";

export type DongChoThu = { loai: "coc"; r: CocChoThu } | { loai: "hoa_don"; r: HoaDonChoThu };

export const COT_CHO_THU: (CotLuoi & { w?: number; n?: boolean })[] = [
  { key: "khach", label: "Khách hàng", coDinh: true, w: 260 },
  { key: "khoan", label: "Khoản thu", w: 120 },
  { key: "nguon", label: "Nguồn", w: 220 },
  { key: "han", label: "Hạn thu", w: 120 },
  { key: "phai_thu", label: "Phải thu", n: true, w: 140 },
  { key: "tra_ngoai", label: "Trả lại ngoài đơn", n: true, w: 150 },
  { key: "da_thu", label: "Đã thu", n: true, w: 140 },
  { key: "con", label: "Còn phải thu", n: true, w: 150 },
  { key: "nut", label: "Thao tác", coDinh: true, w: 140 },
];

/** Cọc trước (việc cần làm sớm để đơn chạy), rồi hoá đơn theo hạn thu — thứ tự máy chủ đã xếp. */
export function gopDongChoThu(coc: CocChoThu[], hoaDon: HoaDonChoThu[]): DongChoThu[] {
  return [
    ...coc.map((r) => ({ loai: "coc" as const, r })),
    ...hoaDon.map((r) => ({ loai: "hoa_don" as const, r })),
  ];
}

export function HangChoThuDon({
  rows,
  loi,
  onLap,
  onMoDon,
  luoi,
}: {
  rows: DongChoThu[] | null;
  loi: string | null;
  /** Không có = không có quyền lập phiếu thu ⇒ không hiện nút. */
  onLap?: (dong: DongChoThu) => void;
  /** Không có = không có quyền xem Đơn hàng bán ⇒ mã đơn là chữ thường. */
  onMoDon?: (orderId: number) => void;
  luoi?: CauHinhLuoi;
}) {
  const coHoan = rows?.some((d) => d.loai === "hoa_don" && (d.r.hoan_khong_don ?? 0) > 0) ?? false;
  const goc = coHoan ? COT_CHO_THU : COT_CHO_THU.filter((c) => c.key !== "tra_ngoai");
  const cot = luoi ? luoi.rongHien(luoi.xep(goc).filter((c) => !luoi.an.has(c.key))) : goc;
  return (
    <div className="lds-sheet">
      <p className="kt-gc-ghi">
        Cọc của đơn đã chốt chưa thu đủ và hóa đơn khách chưa trả hết. Thu đủ thì khoản đó rời khỏi danh sách này.
      </p>
      <CuonLuoi ghim={luoi?.soGhim(cot)}>
        <table className="lds-g" style={{ minWidth: rongLuoi(cot) }}>
          <colgroup>
            {cot.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
          </colgroup>
          <thead>
            <tr>
              {cot.map((c) => (
                <th key={c.key} className={c.n ? "n" : undefined} aria-label={c.key === "nut" ? "Thao tác" : undefined}>
                  {c.key === "nut" ? null : c.label}
                  {luoi?.keo(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loi ? (
              <tr>
                <td colSpan={cot.length} className="lds-trong">
                  <span className="lds-do" role="alert">{`Không tải được danh sách đơn hàng chờ thu. ${loi}`}</span>
                </td>
              </tr>
            ) : rows == null ? (
              <tr><td colSpan={cot.length} className="lds-trong">Đang tải…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={cot.length} className="lds-trong">Không còn khoản nào chờ thu.</td></tr>
            ) : (
              rows.map((d) => (
                <tr key={d.loai === "coc" ? `coc-${d.r.order_id}` : `hd-${d.r.invoice_id}`}>
                  {cot.map((c) => oChoThu(c.key, d, onLap, onMoDon))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CuonLuoi>
    </div>
  );
}

function oChoThu(
  key: string,
  d: DongChoThu,
  onLap?: (dong: DongChoThu) => void,
  onMoDon?: (orderId: number) => void,
) {
  const r = d.r;
  const maDon = onMoDon ? (
    <button type="button" className="lds-lk" onClick={() => onMoDon(r.order_id)}>{r.order_code}</button>
  ) : r.order_code;
  switch (key) {
    case "khach":
      return <td key={key} title={r.customer_name ?? undefined}>{r.customer_name ?? "—"}</td>;
    case "khoan":
      return <td key={key}><span className="lds-tag">{d.loai === "coc" ? "Cọc" : "Hóa đơn"}</span></td>;
    case "nguon":
      return d.loai === "coc" ? (
        <td key={key}>{maDon}</td>
      ) : (
        <td key={key} title={`Hóa đơn ${d.r.invoice_number} đơn ${r.order_code}`}>
          {`HĐ ${d.r.invoice_number}`} <span className="lds-mu">đơn</span> {maDon}
        </td>
      );
    case "han":
      return <td key={key}>{d.loai === "hoa_don" && d.r.due_date ? ngay(d.r.due_date) : ""}</td>;
    case "phai_thu":
      return <td key={key} className="n">{tien(d.loai === "coc" ? d.r.can_thu : d.r.amount)}</td>;
    case "tra_ngoai": {
      const hoan = d.loai === "hoa_don" ? d.r.hoan_khong_don ?? 0 : 0;
      return <td key={key} className="n" title={hoan > 0 ? "Đã trả lại khách ngoài đơn, cộng nợ lại vào hoá đơn này" : undefined}>
        {hoan > 0 ? tien(hoan) : ""}
      </td>;
    }
    case "da_thu": {
      const da = d.r.da_thu;
      return <td key={key} className="n">{da > 0 ? tien(da) : ""}</td>;
    }
    case "con":
      return <td key={key} className="n">{tien(d.loai === "coc" ? d.r.con_thieu : d.r.con_no)}</td>;
    case "nut":
      return (
        <td key={key} className="lds-nut">
          {onLap && r.customer_id != null && (
            <button type="button" className="kt-btn kt-btn--nho" onClick={() => onLap(d)}>Lập phiếu thu</button>
          )}
        </td>
      );
    default:
      return <td key={key} />;
  }
}
