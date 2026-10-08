/** Hàng "Gia công chờ chi" (đặc tả PC-1): bấm mục lọc nhanh "Gia công chờ chi" thì bảng phiếu đổi sang
 *  hàng này — lần gia công ngoài đã chốt số lượng, chưa có phiếu chi còn hiệu lực. Vẽ bằng khuôn lưới
 *  chung `lds-g` (08/10/2026). Nút "Lập phiếu chi" là nút PHỤ (nút chính chỉ ở đầu trang). */
import type { GiaCongChoChi } from "../../../../api/client";
import { CuonLuoi, rongLuoi, type CauHinhLuoi, type CotLuoi } from "../../../../components/LuoiDs";
import { ngay } from "../../shared/dinhDang";
import { cacViec, soChot } from "../shared/giaCong";

export const COT_GIA_CONG: (CotLuoi & { w?: number; n?: boolean })[] = [
  { key: "nha", label: "Nhà gia công", coDinh: true, w: 260 },
  { key: "viec", label: "Việc", w: 260 },
  { key: "so_chot", label: "Số chốt", n: true, w: 130 },
  { key: "chot_boi", label: "Chốt bởi", w: 200 },
  { key: "nut", label: "Thao tác", coDinh: true, w: 140 },
];

export function HangChoGiaCong({
  rows,
  loi,
  onLap,
  luoi,
}: {
  rows: GiaCongChoChi[] | null;
  loi: string | null;
  /** Không có = không có quyền lập phiếu chi ⇒ không hiện nút. */
  onLap?: (row: GiaCongChoChi) => void;
  /** Cấu hình lưới của màn cha (nút "Cột") — có thì ẩn / đổi chỗ / ghim / kéo độ rộng được. */
  luoi?: CauHinhLuoi;
}) {
  const cot = luoi ? luoi.rongHien(luoi.xep(COT_GIA_CONG).filter((c) => !luoi.an.has(c.key))) : COT_GIA_CONG;
  return (
    <div className="lds-sheet">
      <p className="kt-gc-ghi">
        Việc thuê ngoài đã chốt số lượng, chưa trả tiền. Lập phiếu chi xong thì việc rời khỏi danh sách này.
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
                  <span className="lds-do" role="alert">{`Không tải được hàng gia công chờ chi. ${loi}`}</span>
                </td>
              </tr>
            ) : rows == null ? (
              <tr><td colSpan={cot.length} className="lds-trong">Đang tải…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={cot.length} className="lds-trong">Không còn việc gia công nào chờ chi.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.gia_cong_ngoai_id}>
                  {cot.map((c) => oGiaCong(c.key, r, onLap))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CuonLuoi>
    </div>
  );
}

/** Ô của một dòng theo khoá cột. */
function oGiaCong(key: string, r: GiaCongChoChi, onLap?: (row: GiaCongChoChi) => void) {
  switch (key) {
    case "nha":
      return (
        <td key={key} title={`${r.nha_cung_cap_ten} ${r.nhan_nguon || r.lsx_ma}`}>
          {r.nha_cung_cap_ten}{" "}
          <span className="lds-mu">{r.nhan_nguon || r.lsx_ma}</span>
        </td>
      );
    case "viec":
      return (
        <td key={key} title={r.ten_viec}>
          {cacViec(r.ten_viec).map((v, i) => (
            <span key={v}>
              {i > 0 && " "}
              <span className="lds-tag">{v}</span>
            </span>
          ))}
        </td>
      );
    case "so_chot":
      return <td key={key} className="n">{soChot(r)}</td>;
    case "chot_boi":
      return (
        <td key={key}>
          {r.chot_boi_ten ?? "—"}
          {r.chot_luc && <>{" "}<span className="lds-mu">{ngay(r.chot_luc)}</span></>}
        </td>
      );
    case "nut":
      return (
        <td key={key} className="lds-nut">
          {onLap && (
            <button type="button" className="kt-btn kt-btn--nho" onClick={() => onLap(r)}>Lập phiếu chi</button>
          )}
        </td>
      );
    default:
      return <td key={key} />;
  }
}
