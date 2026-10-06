/** Tab Chứng từ của ngăn phiếu chi / phiếu thu (đặc tả A.5, PC-2, PT-2): ô kéo-thả một hàng, lưới
 *  ảnh xem trước 132px, mỗi tệp có Xem / Xoá. Phiếu đã hủy chỉ xem — không thêm, không xoá (lỗi
 *  thật số 12). Lời gọi tải lên / xoá do màn truyền vào (`taiMot`, `xoaMot`).
 *
 *  Xoá xong hiện "Đã xoá … Hoàn tác" TRONG ngăn 5 giây. API không có đường khôi phục, nên trước khi
 *  xoá màn tải tệp về giữ trong bộ nhớ; "Hoàn tác" = tải lại đúng tệp đó lên. Không tải về được
 *  (mất mạng, tệp quá lớn…) thì thông báo chỉ ghi "Đã xoá", không hứa hoàn tác.
 */
import { Eye, FileText, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError, anhNho, assetUrl } from "../../../api/client";
import { Cum, TheNho } from "./Cum";
import { locTep, type TepChungTu } from "./tepChungTu";

function loaiTep(t: TepChungTu): string {
  const kieu = t.file_type ?? "";
  if (kieu.startsWith("image/")) return "Ảnh";
  if (kieu === "application/pdf") return "PDF";
  return "Tệp";
}

/** Tải tệp về giữ trong bộ nhớ để Hoàn tác được; hỏng thì null (không hứa hoàn tác). */
async function giuTep(t: TepChungTu): Promise<File | null> {
  try {
    const url = assetUrl(t.file_url);
    if (!url || typeof fetch !== "function") return null;
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return null;
    const b = await r.blob();
    return new File([b], t.file_name, { type: t.file_type ?? b.type });
  } catch {
    return null;
  }
}

export function TabChungTu({
  tep,
  daHuy,
  coQuyen,
  taiMot,
  xoaMot,
  chuKeo,
  chuChuaCo,
  onDoi,
}: {
  tep: TepChungTu[];
  /** Phiếu đã hủy: chỉ xem. */
  daHuy: boolean;
  /** Có quyền gán chứng từ (ô Lập của màn). */
  coQuyen: boolean;
  taiMot: (f: File) => Promise<unknown>;
  xoaMot: (tepId: number) => Promise<unknown>;
  /** Chữ ô kéo-thả khi đã có tệp, vd "Kéo ảnh hoá đơn hoặc ủy nhiệm chi vào đây". */
  chuKeo: string;
  /** Chữ ô kéo-thả khi chưa có tệp, vd "Chưa có chứng từ. Kéo ảnh biên nhận vào đây". */
  chuChuaCo: string;
  /** Danh sách tệp vừa đổi — nạp lại ngăn và bảng (cờ "Thiếu chứng từ"). */
  onDoi: () => void;
}) {
  const sua = coQuyen && !daHuy;
  const [ban, setBan] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [keo, setKeo] = useState(false);
  const [bao, setBao] = useState<{ ten: string; tep: File | null } | null>(null);

  useEffect(() => {
    if (!bao) return;
    const hen = window.setTimeout(() => setBao(null), 5000);
    return () => window.clearTimeout(hen);
  }, [bao]);

  async function taiLen(ds: File[]) {
    if (!ds.length) return;
    // Cùng một luật với ô đính kèm của form lập phiếu (ảnh hoặc PDF, tối đa 10 MB).
    const { nhan, loi: hong } = locTep(ds);
    setLoi(hong);
    if (!nhan.length) return;
    setBan(true);
    try {
      for (const f of nhan) await taiMot(f);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không tải được tệp lên.");
    } finally {
      setBan(false);
      onDoi();
    }
  }

  async function xoa(t: TepChungTu) {
    setLoi(null);
    setBan(true);
    const giu = await giuTep(t);
    try {
      await xoaMot(t.id);
      setBao({ ten: t.file_name, tep: giu });
      onDoi();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không xoá được tệp.");
    } finally {
      setBan(false);
    }
  }

  async function hoanTac() {
    if (!bao?.tep) return;
    const f = bao.tep;
    setBao(null);
    await taiLen([f]);
  }

  return (
    <>
      {sua ? (
        <label className={`kt-tha${keo ? " kt-tha--keo" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setKeo(true); }}
          onDragLeave={() => setKeo(false)}
          onDrop={(e) => {
            e.preventDefault();
            setKeo(false);
            void taiLen(Array.from(e.dataTransfer.files));
          }}>
          <i><Upload size={18} aria-hidden="true" /></i>
          <div>
            <b>{tep.length ? chuKeo : chuChuaCo}</b>
            <small>Ảnh hoặc PDF tối đa 10 MB mỗi tệp</small>
          </div>
          <span className="kt-btn kt-btn--nho">{ban ? "Đang xử lý…" : "Chọn tệp"}</span>
          <input type="file" hidden multiple accept="image/*,application/pdf" disabled={ban}
            aria-label="Chọn tệp chứng từ"
            onChange={(e) => {
              const ds = Array.from(e.target.files ?? []);
              e.target.value = "";
              void taiLen(ds);
            }} />
        </label>
      ) : tep.length === 0 ? (
        <p className="kt-mo">
          {daHuy ? "Phiếu đã hủy, không thêm chứng từ." : "Chưa có chứng từ."}
        </p>
      ) : null}
      {loi && <p className="kt-o__loi" role="alert">{loi}</p>}
      {tep.length > 0 && (
        <div className="kt-cts">
          {tep.map((t) => {
            const url = assetUrl(t.file_url) ?? "#";
            const loai = loaiTep(t);
            return (
              <div key={t.id} className="kt-ct">
                <div className="kt-ct__anh">
                  {loai === "Ảnh" ? (
                    <img src={anhNho(t.file_url, 320) ?? url} alt={t.file_name} />
                  ) : (
                    <>
                      <span className="kt-ct__pdf"><TheNho>{loai}</TheNho></span>
                      <FileText size={32} aria-hidden="true" />
                    </>
                  )}
                </div>
                <div className="kt-ct__ten">
                  <div>
                    <b title={t.file_name}>{t.file_name}</b>
                    <small><Cum><TheNho>{loai}</TheNho></Cum></small>
                  </div>
                  <a className="kt-ic" href={url} target="_blank" rel="noreferrer" aria-label={`Xem ${t.file_name}`} title="Xem">
                    <Eye size={16} aria-hidden="true" />
                  </a>
                  {sua && (
                    <button type="button" className="kt-ic" aria-label={`Xoá ${t.file_name}`} title="Xoá" disabled={ban}
                      onClick={() => void xoa(t)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {bao && (
        <div className="kt-bao" role="status">
          {`Đã xoá ${bao.ten}`}
          {bao.tep && <button type="button" onClick={() => void hoanTac()}>Hoàn tác</button>}
        </div>
      )}
    </>
  );
}
