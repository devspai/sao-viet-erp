// Thẻ công đoạn ở bước KCS cuối (`docs/design-tieu-chi-kcs-lam-lai.md` §3a, cách 3). Chưa xét / Đạt:
// tiêu chí bày để ĐỌC + hai nút "Đạt" | "Có lỗi". Có lỗi: tick mục HỎNG, số lỗi (đơn vị BƯỚC CUỐI —
// trừ thẳng vào số đạt), mô tả tự điền từ mục hỏng (sửa tay thì thôi tự điền), ảnh cộng dồn. Một thẻ
// có lỗi = MỘT dòng lỗi quy về công việc nguồn của thẻ. Màu trung tính, chỉ chữ đỏ cho mục hỏng.
import type { TepXem } from "../../components/tepDinhKem";
import { Icon } from "../../components/Icons";
import { coChu } from "../../lib/anhNen";
import { DongTep } from "../ThsxDongTep";
import { type TheCd, type TrangThaiThe, moTaThe, tenTieuChi } from "./theCongDoan";

export function KcsTheCongDoan({
  the, tt, dv, duSoAnh, dangNen, onDat, onCoLoi, onDoiHong, onSo, onMoTa, onChup, onChon, onBoAnh, onXem,
}: {
  the: TheCd;
  tt: TrangThaiThe;
  /** Đơn vị của BƯỚC CUỐI (vd "hộp"). */
  dv: string;
  duSoAnh: boolean;
  dangNen: boolean;
  onDat: () => void;
  onCoLoi: () => void;
  onDoiHong: (thuTu: number) => void;
  onSo: (s: string) => void;
  onMoTa: (s: string) => void;
  onChup: () => void;
  onChon: () => void;
  onBoAnh: (id: number) => void;
  onXem: (t: TepXem) => void;
}) {
  const id = `kkf-the-${the.cvId}`;
  const trangThai = tt.loai === "dat" ? "Đạt"
    : tt.loai === "loi" ? (tt.hong.size ? `${tt.hong.size} mục hỏng` : "Có lỗi")
      : `${the.tieuChi.length} tiêu chí`;
  return (
    <section className={`kkf-tcd${tt.loai !== "chua" ? " is-xong" : ""}`} aria-labelledby={`${id}-ten`}>
      <div className="kkf-tcd__dau">
        <div className="kkf-tcd__ten">
          <span id={`${id}-ten`}>{the.ten}</span>
          {the.phu && <span className="kkf-tcd__phu">{the.phu}</span>}
        </div>
        <span className={`kkf-tcd__tt${tt.loai === "loi" ? " is-loi" : ""}`}>{trangThai}</span>
      </div>

      {tt.loai !== "loi" ? (
        <>
          <ul className="kkf-tcd__doc">
            {the.tieuChi.map((tc) => <li key={tc.thu_tu}>{tenTieuChi(tc)}</li>)}
          </ul>
          <div className="kkf-tcd__cap">
            <button type="button" aria-pressed={tt.loai === "dat"} onClick={onDat}>
              <Icon name="check" size={15} /> Đạt
            </button>
            <button type="button" onClick={onCoLoi} aria-label={`Có lỗi ở ${the.ten}`}>
              <Icon name="x" size={15} /> Có lỗi
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="kkf-tcd__goi">Tick mục hỏng</p>
          <ul className="kkf-tcd__chon">
            {the.tieuChi.map((tc) => {
              const hong = tt.hong.has(tc.thu_tu);
              return (
                <li key={tc.thu_tu}>
                  <label className={hong ? "is-hong" : undefined}>
                    <input type="checkbox" checked={hong} onChange={() => onDoiHong(tc.thu_tu)} />
                    <span>{tenTieuChi(tc)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="kkf-tcd__loi">
            <label className="kkf-tcd__nhan" htmlFor={`${id}-so`}>Số lỗi ({dv})</label>
            <input id={`${id}-so`} type="number" min={0} inputMode="decimal" placeholder="0"
              className="kkf-loi__o" value={tt.so} onChange={(e) => onSo(e.target.value)} />
            <label className="kkf-tcd__nhan" htmlFor={`${id}-mt`}>
              Mô tả <span className="kkf-tcd__mo">tự điền từ mục hỏng, sửa được</span>
            </label>
            <textarea id={`${id}-mt`} rows={Math.max(2, tt.hong.size)} value={moTaThe(the, tt)}
              onChange={(e) => onMoTa(e.target.value)} />
            <div className="kcs-drawer__anh-dau">
              <span className="kcs-drawer__anh-nhan">Ảnh lỗi (ít nhất 1)</span>
              <span className="kcs-drawer__anh-dem">
                {tt.anh.length > 0 ? `${tt.anh.length} ảnh` : "Chưa có ảnh"}{dangNen && ", đang xử lý…"}
              </span>
            </div>
            <div className="kcs-drawer__anh-nut">
              <button type="button" className="btn btn--ghost" disabled={duSoAnh} onClick={onChup}>
                <Icon name="camera" size={14} /> Chụp ảnh
              </button>
              <button type="button" className="btn btn--ghost" disabled={duSoAnh} onClick={onChon}>
                <Icon name="upload" size={14} /> Chọn ảnh có sẵn
              </button>
            </div>
            {tt.anh.length > 0 && (
              <ul className="thsx-tep__ds">
                {tt.anh.map((a) => (
                  <DongTep key={a.id} onXem={onXem} onBo={() => onBoAnh(a.id)}
                    t={{ ten_tep: a.file.name, file_url: a.url, content_type: a.file.type }}
                    meta={a.goc > a.file.size ? `${coChu(a.file.size)} (đã nén từ ${coChu(a.goc)})` : coChu(a.file.size)} />
                ))}
              </ul>
            )}
          </div>
          <div className="kkf-tcd__cap">
            <button type="button" onClick={onDat}><Icon name="check" size={15} /> Thôi, đạt</button>
            <span />
          </div>
        </>
      )}
    </section>
  );
}
