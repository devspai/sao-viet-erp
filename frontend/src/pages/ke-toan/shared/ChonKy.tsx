/** Thanh chọn kỳ của 5 màn kế toán (đặc tả A.17) — y khuôn Thống kê khách hàng.
 *
 *  Nhóm nút kỳ | hai ô ngày khi "Tuỳ chọn" | ô tích "So với cùng kỳ năm trước" | nhãn kỳ bên phải.
 *  Kỳ đang chọn nhớ THEO MÀN trong phiên trang (Map cấp module): mở lại màn không về "Tháng này".
 *  Kỳ cũng ghi lên URL (`?man=<màn>&ky=nam&so=1`, `tu`/`den` khi Tuỳ chọn) — xem `urlMan.ts`.
 */
import { useEffect, useMemo, useState } from "react";

import { LOAI_KY, homNayVN, kyCungKy, loiKhoang, tinhKy } from "../../../utils/ky";
import type { KyXem, LoaiKy } from "../../../utils/ky";
import { ngay } from "./dinhDang";
import { docThamSoMan, useDongBoUrl, type GiaTriUrl } from "./urlMan";

export type TrangThaiKy = { loai: LoaiKy; tuy: KyXem | null; soSanh: boolean };

const MAC_DINH: TrangThaiKy = { loai: "thang", tuy: null, soSanh: true };

/** Kỳ đã chọn của từng màn — sống hết phiên trang, mất khi tải lại (tải lại thì URL giữ, xem dưới). */
const nhoKy = new Map<string, TrangThaiKy>();

/** Kỳ từ URL của màn (`?man=<màn>&ky=&tu=&den=&so=`, đặc tả A.18). Thiếu `ky`, loại kỳ lạ, hay
 *  "Tuỳ chọn" mà khoảng ngày sai ⇒ null (dùng kỳ nhớ / mặc định). `so=0` tắt so sánh. */
export function kyTuUrl(p: URLSearchParams | null): TrangThaiKy | null {
  const loai = p?.get("ky");
  if (!p || !loai || !LOAI_KY.some(([l]) => l === loai)) return null;
  const soSanh = p.get("so") !== "0";
  if (loai !== "tuy") return { loai: loai as LoaiKy, tuy: null, soSanh };
  const tu = p.get("tu") ?? "";
  const den = p.get("den") ?? "";
  return loiKhoang(tu, den) ? null : { loai: "tuy", tuy: { tu, den }, soSanh };
}

/** Khoá URL của kỳ — luôn ghi `ky` và `so` cho link gửi đi đọc được ngay; `tu`/`den` chỉ khi Tuỳ chọn. */
export function kyLenUrl(tt: TrangThaiKy): GiaTriUrl {
  return {
    ky: tt.loai,
    so: tt.soSanh ? "1" : "0",
    tu: tt.loai === "tuy" ? tt.tuy?.tu : undefined,
    den: tt.loai === "tuy" ? tt.tuy?.den : undefined,
  };
}

export type ChonKyTuyChon = {
  /** Kỳ TẠM (đường dẫn sâu mở kỳ rộng để thấy phiếu cũ): áp lên màn nhưng KHÔNG ghi vào bộ nhớ
   *  kỳ của màn — lần sau mở màn vẫn về kỳ người dùng đã chọn. */
  tam?: boolean;
};

export function useKyMan(manId: string): {
  tt: TrangThaiKy;
  ky: KyXem;
  cungKy: KyXem | null;
  chon: (loai: LoaiKy, tuy?: KyXem, tuyChon?: ChonKyTuyChon) => void;
  datSoSanh: (b: boolean) => void;
} {
  // URL thắng bộ nhớ: mở từ link / tải lại trang thì thấy đúng kỳ trên link.
  const [tt, setTtTho] = useState<TrangThaiKy>(() => {
    const tuUrl = kyTuUrl(docThamSoMan(manId));
    if (tuUrl) {
      nhoKy.set(manId, tuUrl);
      return tuUrl;
    }
    return nhoKy.get(manId) ?? MAC_DINH;
  });
  const homNay = homNayVN();
  const ky = useMemo(() => tinhKy(tt.loai, homNay, tt.tuy), [tt.loai, tt.tuy, homNay]);
  const cungKy = useMemo(() => (tt.soSanh ? kyCungKy(ky) : null), [tt.soSanh, ky]);
  useDongBoUrl(manId, kyLenUrl(tt));

  const datTt = (doi: (cu: TrangThaiKy) => TrangThaiKy, nho = true) =>
    setTtTho((cu) => {
      const moi = doi(cu);
      if (nho) nhoKy.set(manId, moi);
      return moi;
    });
  // "Tuỳ chọn" không kèm khoảng thì lấy luôn kỳ đang xem làm điểm xuất phát cho hai ô ngày.
  const chon = (loai: LoaiKy, tuy?: KyXem, tuyChon?: ChonKyTuyChon) =>
    datTt(
      (cu) => ({
        ...cu,
        loai,
        tuy: loai === "tuy" ? (tuy ?? cu.tuy ?? tinhKy(cu.loai, homNayVN(), cu.tuy)) : null,
      }),
      !tuyChon?.tam,
    );
  const datSoSanh = (b: boolean) => datTt((cu) => ({ ...cu, soSanh: b }));

  return { tt, ky, cungKy, chon, datSoSanh };
}

export function ChonKy({ kyMan }: { kyMan: ReturnType<typeof useKyMan> }) {
  const { tt, ky, cungKy, chon, datSoSanh } = kyMan;
  const [tu, setTu] = useState(ky.tu);
  const [den, setDen] = useState(ky.den);
  useEffect(() => {
    setTu(ky.tu);
    setDen(ky.den);
  }, [ky.tu, ky.den]);

  const loi = tt.loai === "tuy" ? loiKhoang(tu, den) : null;
  // Ô gõ dở / ngày ngược thì giữ kỳ cũ, không gọi máy chủ.
  const apTuy = (a: string, b: string) => {
    if (!loiKhoang(a, b)) chon("tuy", { tu: a, den: b });
  };
  const homNay = homNayVN();

  return (
    <div className="kt-ky">
      <div className="kt-ky__nut" role="group" aria-label="Kỳ xem số liệu">
        {LOAI_KY.map(([l, t]) => (
          <button key={l} type="button" className={tt.loai === l ? "on" : undefined} aria-pressed={tt.loai === l}
            onClick={() => chon(l)}>
            {t}
          </button>
        ))}
      </div>
      {tt.loai === "tuy" && (
        <div className="kt-ky__tuy">
          <input type="date" aria-label="Từ ngày" min="2000-01-01" max={homNay} value={tu}
            onChange={(e) => {
              setTu(e.target.value);
              apTuy(e.target.value, den);
            }} />
          <span>đến</span>
          <input type="date" aria-label="Đến ngày" min="2000-01-01" max={homNay} value={den}
            onChange={(e) => {
              setDen(e.target.value);
              apTuy(tu, e.target.value);
            }} />
          {loi && <span className="kt-ky__loi" role="alert">{loi}</span>}
        </div>
      )}
      <label className="kt-ky__so">
        <input type="checkbox" checked={tt.soSanh} onChange={(e) => datSoSanh(e.target.checked)} />
        So với cùng kỳ năm trước
      </label>
      <div className="kt-ky__nhan">
        {ngay(ky.tu)} – {ngay(ky.den)}
        {cungKy && <span>so với {ngay(cungKy.tu)} – {ngay(cungKy.den)}</span>}
      </div>
    </div>
  );
}
