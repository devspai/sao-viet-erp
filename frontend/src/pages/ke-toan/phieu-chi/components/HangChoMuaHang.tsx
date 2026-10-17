/** Hàng "Mua hàng chờ chi" (docs/prd-mua-hang-cho-chi-o-phieu-chi.md, chủ 17/10/2026): bấm mục lọc nhanh
 *  "Mua hàng chờ chi" thì bảng phiếu đổi sang hàng này — ĐƠN mua đã duyệt còn cọc chưa chi hoặc còn đợt
 *  giao còn nợ. MỖI ĐƠN MỘT DÒNG; bấm dòng mở POPUP các khoản (cọc, từng đợt), mỗi khoản một nút lập
 *  phiếu — một phiếu chi vẫn chỉ gắn một khoản (luật cũ). Chi đủ thì đơn tự rời hàng.
 *  Popup thay cho kiểu bung dòng ngay trong bảng (chủ chê "trượt xuống nhìn xấu", 17/10/2026). */
import { ChevronRight, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { MuaHangChoChi } from "../../../../api/client";
import { DetailModal } from "../../../../components/DetailModal";
import { CuonLuoi, rongLuoi, type CauHinhLuoi, type CotLuoi } from "../../../../components/LuoiDs";
import { ngay, tien, vietSo } from "../../shared/dinhDang";
import { tenDonVi, useNapTenDonVi } from "../../../tenDonVi";
import { isoToday } from "../shared/helpers";

export const COT_MUA_HANG: (CotLuoi & { w?: number; n?: boolean })[] = [
  { key: "don", label: "Đơn mua", coDinh: true, w: 300 },
  { key: "coc", label: "Cọc còn phải chi", n: true, w: 150 },
  { key: "dot", label: "Đợt giao còn nợ", n: true, w: 190 },
  { key: "tong", label: "Tổng cần chi", n: true, w: 150 },
  { key: "han", label: "Hạn gần nhất", w: 190 },
  { key: "mo", label: "Mở", coDinh: true, w: 44 },
];

/** Khoản được bấm lập phiếu: CỌC của đơn, hoặc ĐÚNG một đợt giao. */
export type KhoanChi = { coc: true } | { coc: false; dotId: number };

export function HangChoMuaHang({
  rows,
  loi,
  tim = "",
  moSan = null,
  onLap,
  onMoDon,
  luoi,
}: {
  rows: MuaHangChoChi[] | null;
  loi: string | null;
  /** Ô tìm của trang — lọc ngay trên máy theo mã đơn / tên NCC (cả hàng đã nạp hết, không phân trang). */
  tim?: string;
  /** Mã đơn mở sẵn (link "Chi tiền ở Phiếu chi" từ ngăn Đơn mua hàng). */
  moSan?: string | null;
  /** Không có = không có quyền lập phiếu chi ⇒ không hiện nút. */
  onLap?: (row: MuaHangChoChi, khoan: KhoanChi) => void;
  /** Không có = không có quyền xem màn Đơn mua hàng ⇒ không hiện link "Xem đơn". */
  onMoDon?: (code: string) => void;
  luoi?: CauHinhLuoi;
}) {
  const cot = luoi ? luoi.rongHien(luoi.xep(COT_MUA_HANG).filter((c) => !luoi.an.has(c.key))) : COT_MUA_HANG;
  const [xemId, setXemId] = useState<number | null>(null);
  const loc = useMemo(() => {
    const t = tim.trim().toLowerCase();
    if (!rows || !t) return rows;
    return rows.filter((r) => `${r.don.code} ${r.don.supplier_name ?? ""}`.toLowerCase().includes(t));
  }, [rows, tim]);

  // Link từ ngăn Đơn mua hàng: mở sẵn popup đúng đơn đó (khi hàng đã nạp).
  const [daMoSan, setDaMoSan] = useState(false);
  useEffect(() => {
    if (!moSan || !rows || daMoSan) return;
    const r = rows.find((x) => x.don.code === moSan);
    if (r) setXemId(r.don.id);
    setDaMoSan(true);
  }, [moSan, rows, daMoSan]);
  // Chi đủ ⇒ đơn rời hàng ⇒ popup (nếu còn mở) tự đóng theo.
  const dangXem = xemId == null ? null : (rows ?? []).find((r) => r.don.id === xemId) ?? null;

  return (
    <div className="lds-sheet">
      <p className="kt-gc-ghi">
        Đơn mua đã duyệt còn cọc chưa chi hoặc còn đợt giao chưa trả. Bấm một đơn để xem các khoản và lập phiếu
        chi; chi đủ thì đơn rời khỏi danh sách này.
      </p>
      <CuonLuoi ghim={luoi?.soGhim(cot)}>
        <table className="lds-g kt-mh" style={{ minWidth: rongLuoi(cot) }}>
          <colgroup>
            {cot.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}
          </colgroup>
          <thead>
            <tr>
              {cot.map((c) => (
                <th key={c.key} className={c.n ? "n" : undefined} aria-label={c.key === "mo" ? "Mở các khoản" : undefined}>
                  {c.key === "mo" ? null : c.label}
                  {luoi?.keo(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loi ? (
              <tr>
                <td colSpan={cot.length} className="lds-trong">
                  <span className="lds-do" role="alert">{`Không tải được hàng mua hàng chờ chi. ${loi}`}</span>
                </td>
              </tr>
            ) : loc == null ? (
              <tr><td colSpan={cot.length} className="lds-trong">Đang tải…</td></tr>
            ) : loc.length === 0 ? (
              <tr>
                <td colSpan={cot.length} className="lds-trong">
                  {tim.trim() ? "Không có đơn nào khớp ô tìm." : "Không còn đơn mua nào chờ chi."}
                </td>
              </tr>
            ) : (
              loc.map((r) => (
                <tr
                  key={r.don.id}
                  className={`lds-dong${xemId === r.don.id ? " is-chon" : ""}`}
                  tabIndex={0}
                  aria-haspopup="dialog"
                  onClick={() => setXemId(r.don.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setXemId(r.don.id);
                    }
                  }}
                >
                  {cot.map((c) => oDon(c.key, r))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CuonLuoi>
      {dangXem && (
        <DetailModal
          kicker="Mua hàng chờ chi"
          title={dangXem.don.code}
          subtitle={dangXem.don.supplier_name ?? undefined}
          badge={dangXem.qua_han ? <span className="lds-chip lds-chip--do">Quá hạn</span> : undefined}
          width={820}
          onClose={() => setXemId(null)}
        >
          <CacKhoan
            r={dangXem}
            // Đóng popup rồi mới mở form lập phiếu — không chồng hai lớp cửa sổ.
            onLap={onLap ? (row, khoan) => { setXemId(null); onLap(row, khoan); } : undefined}
            onMoDon={onMoDon ? (code) => { setXemId(null); onMoDon(code); } : undefined}
          />
        </DetailModal>
      )}
    </div>
  );
}

/** Ô của dòng đơn theo khoá cột. */
function oDon(key: string, r: MuaHangChoChi) {
  switch (key) {
    case "don":
      return (
        <td key={key} title={`${r.don.code} ${r.don.supplier_name ?? ""}`}>
          {r.don.code}{" "}
          <span className="lds-mu">{r.don.supplier_name ?? "—"}</span>
        </td>
      );
    case "coc":
      return <td key={key} className={r.coc_can_chi > 0 ? "n" : "n lds-mu3"}>{r.coc_can_chi > 0 ? tien(r.coc_can_chi) : "—"}</td>;
    case "dot":
      return (
        <td key={key} className={r.so_dot_no > 0 ? "n" : "n lds-mu3"}>
          {r.so_dot_no > 0 ? <><span className="lds-mu">{r.so_dot_no} đợt</span>{" "}{tien(r.no_dot)}</> : "—"}
        </td>
      );
    case "tong":
      return <td key={key} className="n"><b>{tien(r.tong_can_chi)}</b></td>;
    case "han":
      return (
        <td key={key}>
          {r.han_gan_nhat ? ngay(r.han_gan_nhat) : <span className="lds-mu3">Chưa có đợt</span>}
          {r.qua_han && <>{" "}<span className="lds-chip lds-chip--do">Quá hạn</span></>}
        </td>
      );
    case "mo":
      return (
        <td key={key} className="c lds-mu" aria-hidden="true">
          <ChevronRight size={16} />
        </td>
      );
    default:
      return <td key={key} />;
  }
}

/** Popup của một đơn: tóm tắt tiền cả đơn, rồi cọc (nếu còn — kèm hàng đã đặt) và từng đợt còn nợ (kèm
 *  vật tư về trong đợt, đơn giá, thành tiền, đã chi, cọc trừ). Mỗi khoản một nút lập phiếu. */
function CacKhoan({
  r,
  onLap,
  onMoDon,
}: {
  r: MuaHangChoChi;
  onLap?: (row: MuaHangChoChi, khoan: KhoanChi) => void;
  onMoDon?: (code: string) => void;
}) {
  useNapTenDonVi();
  const homNay = isoToday();
  const don = r.don;
  // Thành tiền máy chủ trả là SAU CK/VAT ⇒ phải hiện % CK/VAT, không thì SL × đơn giá không khớp.
  // Cột chỉ mọc khi có dòng mang CK/VAT.
  const dongDon = new Map(don.lines.map((l) => [l.id, l]));
  const coCk = don.lines.some((l) => l.discount_percent > 0);
  const coVat = don.lines.some((l) => l.vat_percent > 0);
  const pt = (x: number | undefined) => (x ? `${vietSo(x)}%` : "—");
  const dauBang = (sl: string) => (
    <tr>
      <th>Vật tư</th><th className="n">{sl}</th><th>ĐVT</th><th className="n">Đơn giá</th>
      {coCk && <th className="n">CK</th>}
      {coVat && <th className="n">VAT</th>}
      <th className="n">Thành tiền</th>
    </tr>
  );
  const kho = (l: { kho_rong: number; kho_dai: number }) =>
    l.kho_rong > 0 && <>{" "}<span className="lds-mu">{l.kho_rong}×{l.kho_dai}</span></>;
  const dots = don.deliveries
    .filter((d) => d.con_no > 0)
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date) || a.seq_no - b.seq_no);
  return (
    <div className="kt-mh-khoan">
      {/* Bức tranh cả đơn trước, rồi mới tới từng khoản — biết đơn bao nhiêu, về bao nhiêu, trả bao nhiêu. */}
      <dl className="kt-mh-tom">
        <div><dt>Giá trị đơn</dt><dd>{tien(don.total_estimate)}</dd></div>
        <div><dt>Hàng đã về</dt><dd>{tien(don.gia_tri_da_giao)}</dd></div>
        <div><dt>Đã chi</dt><dd>{tien(don.net_paid)}</dd></div>
        <div className="kt-mh-tom__can"><dt>Cần chi</dt><dd>{tien(r.tong_can_chi)}</dd></div>
      </dl>
      <div role="list" aria-label={`Các khoản cần chi của ${don.code}`} className="kt-mh-khoan__ds">
        {r.coc_can_chi > 0 && (
          <section className="kt-mh-k" role="listitem" aria-label="Cọc">
            <header className="kt-mh-k__dau">
              <div className="kt-mh-k__ten">
                <b>Cọc</b>
                <span className="kt-mh-k__mo">
                  <span>đã khai {tien(don.deposit_expected)}</span>
                  <span>đã chi {tien(don.coc_da_chi)}</span>
                </span>
              </div>
              <span className="kt-mh-k__so">còn {tien(r.coc_can_chi)}</span>
              {onLap && (
                <button type="button" className="kt-btn kt-btn--nho" onClick={() => onLap(r, { coc: true })}>
                  Lập phiếu chi cọc
                </button>
              )}
            </header>
            {/* Cọc là tiền của CẢ đơn ⇒ kể hàng đã đặt. */}
            <table className="kt-mh-bang">
              <caption>Hàng đã đặt</caption>
              <thead>
                {dauBang("SL đặt")}
              </thead>
              <tbody>
                {don.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.item_name}{kho(l)}</td>
                    <td className="n">{vietSo(l.quantity)}</td>
                    <td>{tenDonVi(l.unit) ?? l.unit}</td>
                    <td className="n">{tien(l.expected_unit_price)}</td>
                    {coCk && <td className="n">{pt(l.discount_percent)}</td>}
                    {coVat && <td className="n">{pt(l.vat_percent)}</td>}
                    <td className="n">{tien(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {dots.map((d) => {
          const quaHan = d.due_date != null && d.due_date < homNay;
          return (
            <section key={d.id} className="kt-mh-k" role="listitem" aria-label={`Đợt ${d.seq_no}`}>
              <header className="kt-mh-k__dau">
                <div className="kt-mh-k__ten">
                  <b>Đợt {d.seq_no}</b>
                  <span className="kt-mh-k__mo">
                    <span>giao {ngay(d.delivery_date)}</span>
                    <span>
                      hạn {d.due_date ? ngay(d.due_date) : "chưa có"}
                      {quaHan && <>{" "}<span className="lds-chip lds-chip--do">Quá hạn</span></>}
                    </span>
                    <span>
                      {d.invoice_number
                        ? `HĐ ${d.invoice_symbol ? `${d.invoice_symbol} ` : ""}${d.invoice_number}${d.invoice_date ? ` ngày ${ngay(d.invoice_date)}` : ""}`
                        : "chưa có hoá đơn"}
                    </span>
                  </span>
                </div>
                <span className="kt-mh-k__so">còn nợ {tien(d.con_no)}</span>
                {onLap && (
                  <button type="button" className="kt-btn kt-btn--nho" onClick={() => onLap(r, { coc: false, dotId: d.id })}>
                    Lập phiếu chi
                  </button>
                )}
              </header>
              <table className="kt-mh-bang">
                <caption>Hàng về đợt {d.seq_no}</caption>
                <thead>
                  {dauBang("SL nhận")}
                </thead>
                <tbody>
                  {d.lines.map((l) => {
                    const goc = dongDon.get(l.purchase_request_line_id);
                    return (
                    <tr key={l.id}>
                      <td>
                        {l.item_name}
                        {kho(l)}
                      </td>
                      <td className="n">
                        {vietSo(l.quantity)}
                        {/* Phần dư 0đ phải lộ ra — NCC thật ra có tính tiền phần đó thì bắt được lúc đối chiếu. */}
                        {l.quantity_du > 0 && <span className="lds-mu" title="Phần giao vượt số đặt, không tính tiền"> (dư {vietSo(l.quantity_du)})</span>}
                      </td>
                      <td>{tenDonVi(l.unit) ?? l.unit}</td>
                      <td className="n">{tien(l.don_gia)}</td>
                      {coCk && <td className="n">{pt(goc?.discount_percent)}</td>}
                      {coVat && <td className="n">{pt(goc?.vat_percent)}</td>}
                      <td className="n">{tien(l.thanh_tien)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <dl className="kt-mh-k__tien">
                <div><dt>Giá trị đợt</dt><dd>{tien(d.amount)}</dd></div>
                <div><dt>Đã chi</dt><dd>{tien(d.paid_amount)}</dd></div>
                {d.coc_bu > 0 && <div><dt>Cọc trừ</dt><dd>{tien(d.coc_bu)}</dd></div>}
                <div className="kt-mh-k__con"><dt>Còn nợ</dt><dd>{tien(d.con_no)}</dd></div>
              </dl>
            </section>
          );
        })}
      </div>
      {onMoDon && (
        <div className="kt-mh-khoan__chan">
          <button type="button" className="lds-lk kt-mh-khoan__xem" onClick={() => onMoDon(don.code)}>
            Xem đơn đầy đủ <ExternalLink size={12} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
