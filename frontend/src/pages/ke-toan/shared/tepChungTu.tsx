/** Chứng từ đính kèm của phiếu chi / phiếu thu — luật tệp và ô "Chứng từ đính kèm" của form lập.
 *
 *  Một luật cho mọi chỗ nhận tệp (form lập phiếu, tab Chứng từ của ngăn): ảnh hoặc PDF, tối đa
 *  10 MB mỗi tệp. Form lập chọn tệp trước, tải lên ngay SAU KHI phiếu lập xong.
 */
import { Upload } from "lucide-react";

import { Cum, TheNho } from "./Cum";
import { OF, idO } from "./KhungFormPhieu";

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

/** Ô "Chứng từ đính kèm" của form lập phiếu: chọn ảnh hoặc PDF; mỗi tệp một dòng thẻ loại + tên + "Bỏ". */
export function OChungTu({
  files,
  setFiles,
  loi,
  onLoi,
  nhan = "Chứng từ đính kèm",
  goi = "Ảnh hoặc PDF tối đa 10 MB mỗi tệp. Tải lên ngay khi phiếu lập xong.",
}: {
  files: File[];
  setFiles: (next: File[]) => void;
  loi?: string;
  onLoi: (loi: string | null) => void;
  /** Nhãn ô — form trả nhiều đợt ghi "Chứng từ gắn vào cả 3 phiếu". */
  nhan?: string;
  goi?: string;
}) {
  return (
    <OF khoa="chung_tu" nhan={nhan} rong loi={loi} goi={goi}>
      <div className="kt-tep-chon">
        <label className="kt-btn kt-btn--nho">
          <Upload size={14} aria-hidden="true" />
          Chọn tệp
          <input id={idO("chung_tu")} type="file" hidden multiple accept="image/*,application/pdf"
            onChange={(e) => {
              const { nhan, loi: hong } = locTep(e.target.files);
              e.target.value = "";
              onLoi(hong);
              if (nhan.length) setFiles([...files, ...nhan]);
            }} />
        </label>
        {files.length > 0 && (
          <ul className="kt-tep-ds">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <Cum>
                  <TheNho>{f.type === "application/pdf" ? "PDF" : "Ảnh"}</TheNho>
                  <span>{f.name}</span>
                </Cum>
                <button type="button" className="kt-btn kt-btn--tron kt-btn--nho" aria-label={`Bỏ ${f.name}`}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  Bỏ
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OF>
  );
}
