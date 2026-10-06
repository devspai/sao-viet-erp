/** Chứng từ đính kèm của phiếu chi / phiếu thu — luật tệp và ô "Chứng từ đính kèm" của form lập.
 *
 *  Một luật cho mọi chỗ nhận tệp (form lập phiếu, tab Chứng từ của ngăn): ảnh hoặc PDF, tối đa
 *  10 MB mỗi tệp. Form lập chọn tệp trước, tải lên ngay SAU KHI phiếu lập xong.
 */
import { ChevronLeft, ChevronRight, CircleAlert, FileText, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { idO } from "./KhungFormPhieu";

const TOI_DA = 10 * 1024 * 1024;

/** Tệp đính kèm của một phiếu — cùng hình dạng ở phiếu chi và phiếu thu. */
export type TepChungTu = {
  id: number;
  file_name: string;
  file_url: string;
  file_type: string | null;
  uploaded_by: number | null;
  uploaded_at: string | null;
};

/** Lọc tệp hợp lệ; trả thêm câu lỗi (nếu có) để hiện tại ô. */
export function locTep(ds: FileList | File[] | null): { nhan: File[]; loi: string | null } {
  const nhan: File[] = [];
  const hong: string[] = [];
  for (const f of Array.from(ds ?? [])) {
    if (!(f.type.startsWith("image/") || f.type === "application/pdf")) hong.push(`${f.name} không phải ảnh hoặc PDF.`);
    else if (f.size > TOI_DA) hong.push(`${f.name} lớn hơn 10 MB.`);
    else nhan.push(f);
  }
  return { nhan, loi: hong.length ? hong.join(" ") : null };
}

/** Tải các tệp đã chọn lên phiếu vừa lập (`taiMot` gọi API của đúng loại phiếu). Trả câu lỗi nếu có
 *  tệp hỏng — phiếu VẪN đã lập. */
export async function taiTepSauKhiLap(
  maPhieu: string,
  tep: File[],
  taiMot: (f: File) => Promise<unknown>,
): Promise<string | null> {
  try {
    for (const f of tep) await taiMot(f);
    return null;
  } catch {
    return `Phiếu ${maPhieu} đã lập nhưng có tệp đính kèm tải lên thất bại — mở phiếu để đính kèm lại.`;
  }
}

/** URL tạm (object URL) cho các tệp đang chọn — thu hồi khi danh sách đổi hoặc ô biến mất. */
function useUrlTam(files: File[]): string[] {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

const laPdf = (f: File) => f.type === "application/pdf";

/** Lớp xem to một tệp đang chọn: ảnh hiện nguyên khổ, PDF mở trong khung; ← → đổi tệp, Esc đóng.
 *  Ngăn phải thấy lớp `.kt-xt` thì nhường phím cho nó. */
function XemTep({ files, urls, i, onDoi, onDong }: {
  files: File[]; urls: string[]; i: number; onDoi: (i: number) => void; onDong: () => void;
}) {
  const f = files[i];
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDong();
      else if (e.key === "ArrowRight" && i < files.length - 1) onDoi(i + 1);
      else if (e.key === "ArrowLeft" && i > 0) onDoi(i - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [i, files.length, onDoi, onDong]);
  if (!f) return null;
  return createPortal(
    <div className="kt-xt" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onDong()}>
      <div className="kt-xt__khung" role="dialog" aria-modal="true" aria-label={`Xem ${f.name}`}>
        <div className="kt-xt__dau">
          <b>{f.name}</b>
          {files.length > 1 && <span>{`${i + 1}/${files.length}`}</span>}
          <span className="kt-xt__nut">
            <button type="button" className="kt-ic" aria-label="Tệp trước" disabled={i === 0} onClick={() => onDoi(i - 1)}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button type="button" className="kt-ic" aria-label="Tệp sau" disabled={i === files.length - 1} onClick={() => onDoi(i + 1)}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="kt-ic" aria-label="Đóng xem tệp" title="Đóng (Esc)" onClick={onDong}>
              <X size={18} aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className="kt-xt__than">
          {laPdf(f) ? <iframe src={urls[i]} title={f.name} /> : <img src={urls[i]} alt={f.name} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Ô "Ảnh chứng từ gốc" của form lập phiếu: một hàng nền giấy (tên ô + giải thích + nút "Chọn ảnh"),
 *  kéo thả vào hàng cũng được; tệp đã chọn hiện thành lưới ảnh thu nhỏ — bấm vào để xem to, nút ✕ ở
 *  góc để bỏ. Số tệp in thành dòng "Kèm theo" trên phiếu. */
export function OChungTu({
  files,
  setFiles,
  loi,
  onLoi,
  nhan = "Ảnh chứng từ gốc",
  goi,
}: {
  files: File[];
  setFiles: (next: File[]) => void;
  loi?: string;
  onLoi: (loi: string | null) => void;
  /** Nhãn ô — form trả nhiều đợt ghi "Chứng từ gắn vào cả 3 phiếu". */
  nhan?: string;
  goi?: string;
}) {
  const urls = useUrlTam(files);
  const [xem, setXem] = useState<number | null>(null);
  const [keoVao, setKeoVao] = useState(false);
  const them = (ds: FileList | null) => {
    const { nhan: hop, loi: hong } = locTep(ds);
    onLoi(hong);
    if (hop.length) setFiles([...files, ...hop]);
  };
  const dongXem = useCallback(() => setXem(null), []);
  return (
    <div className={`kt-o kt-o--rong${loi ? " kt-o--loi" : ""}`}>
      <div className="kt-tep">
        <label className={`kt-tep__tha${keoVao ? " kt-tep__tha--keo" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setKeoVao(true);
          }}
          onDragLeave={() => setKeoVao(false)}
          onDrop={(e) => {
            e.preventDefault();
            setKeoVao(false);
            them(e.dataTransfer.files);
          }}>
          <i className="kt-tep__ic"><Upload size={16} aria-hidden="true" /></i>
          <span>
            <b>{nhan}</b>
            <small>{goi ?? "Hoá đơn, biên nhận, ảnh chụp sao kê. Ảnh hoặc PDF, tối đa 10 MB mỗi tệp. Số tệp in thành \"Kèm theo\" trên phiếu."}</small>
          </span>
          <span className="kt-btn kt-btn--nho kt-tep__nut" aria-hidden="true">Chọn ảnh</span>
          <input id={idO("chung_tu")} type="file" hidden multiple accept="image/*,application/pdf"
            onChange={(e) => {
              them(e.target.files);
              e.target.value = "";
            }} />
        </label>
        {files.length > 0 && (
          <ul className="kt-tep__luoi">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <button type="button" className="kt-tep__anh" aria-label={`Xem ${f.name}`} title="Bấm để xem to"
                  onClick={() => setXem(i)}>
                  {laPdf(f) ? (
                    <span className="kt-tep__pdf"><FileText size={26} aria-hidden="true" />PDF</span>
                  ) : (
                    <img src={urls[i]} alt="" />
                  )}
                </button>
                <span className="kt-tep__ten">{f.name}</span>
                <button type="button" className="kt-tep__bo" aria-label={`Bỏ ${f.name}`} title="Bỏ tệp này"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {loi && (
        <span className="kt-o__loi" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {loi}
        </span>
      )}
      {xem != null && <XemTep files={files} urls={urls} i={xem} onDoi={setXem} onDong={dongXem} />}
    </div>
  );
}
