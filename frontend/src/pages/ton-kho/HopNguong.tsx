// Hộp đặt ngưỡng tồn của MỘT dòng tồn (bước 4 của mẫu C). Mở chung từ ba chỗ: nút "Đặt ngưỡng"
// trong bảng, nút "Sửa"/"Đặt ngưỡng" trong ngăn, chip trạng thái.
//
// - Dòng tính hộ (không bắt buộc): số ngày đủ dùng × lượng xuất bình quân 90 ngày ⇒ điền Tối thiểu.
// - Xem trước đổi theo số đang gõ và nói luôn kết quả: chip trạng thái + số cần mua.
// - Tối đa bỏ trống = không báo "Dư", và mua bổ sung chỉ về tới Tối thiểu.
import { useEffect, useMemo, useState } from "react";
import { Gauge, X } from "lucide-react";

import { ApiError, api, type HangLoai, type StockThreshold } from "../../api/client";
import { fmtQty } from "../khoShared";
import { ThangNguong, ThanhNguong } from "./ThanhNguong";

export interface DongNguong {
  hang_loai: HangLoai;
  hang_id: number;
  dang: "to" | "cuon" | null;
  khoRong: number;
  khoDai: number;
  ten: string;
  nhanKho: string;
  dvt: string;
  ton: number;
}

const NGAY_BINH_QUAN = 90;

/** Ô số kiểu Việt: hiện "4.000", nhận gõ "4000" / "4.000" / "4000,5". */
function docSo(s: string): number | null {
  const t = s.trim().replace(/\./g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function HopNguong({
  token,
  khoId,
  khoTen,
  dong,
  hienTai,
  duKien,
  onSaved,
  onClose,
}: {
  token: string;
  khoId: number;
  khoTen: string;
  dong: DongNguong;
  hienTai: StockThreshold | undefined;
  /** Dự kiến sau khi lệnh lĩnh và hàng về (từ dự báo). `null` = chưa tải được. */
  duKien: number | null;
  onSaved: (t: StockThreshold) => void;
  onClose: () => void;
}) {
  const [min, setMin] = useState(hienTai ? fmtQty(hienTai.nguong_ton) : "");
  const [max, setMax] = useState(hienTai?.nguong_toi_da != null ? fmtQty(hienTai.nguong_toi_da) : "");
  const [canhBao, setCanhBao] = useState(hienTai ? hienTai.canh_bao : true);
  const [soNgay, setSoNgay] = useState("25");
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  // Lượng xuất bình quân mỗi ngày trong 90 ngày qua (xuất thường, không tính chuyển kho).
  const [moiNgay, setMoiNgay] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let song = true;
    // Máy chủ cộng sẵn — khỏi kéo cả lịch sử xuất của mặt hàng về chỉ để lấy một con số.
    api.kho.phieu
      .tongXuat(token, dong.hang_loai, dong.hang_id, khoId, NGAY_BINH_QUAN,
        dong.dang ? { dang: dong.dang, kho_rong: dong.khoRong, kho_dai: dong.khoDai } : undefined)
      .then(({ tong }) => {
        if (song) setMoiNgay(tong > 0 ? tong / NGAY_BINH_QUAN : null);
      })
      .catch(() => song && setMoiNgay(null));
    return () => {
      song = false;
    };
  }, [token, khoId, dong.hang_loai, dong.hang_id, dong.dang, dong.khoRong, dong.khoDai]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // Bắt ở pha capture: ngăn bên dưới không được đóng theo khi Esc là để đóng hộp này.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const nMin = docSo(min);
  const nMax = docSo(max);
  const ngay = docSo(soNgay);
  const goiY = moiNgay && ngay && ngay > 0 ? Math.ceil(moiNgay * ngay) : null;
  const hopLe = nMin != null && !Number.isNaN(nMin) && nMin >= 0
    && (nMax == null || (!Number.isNaN(nMax) && nMax >= nMin));

  const ketQua = useMemo(() => {
    if (!hopLe || nMin == null) return null;
    const ton = dong.ton;
    const muc = ton <= nMin ? "mua" : nMax != null && ton > nMax ? "thua" : "du";
    const dk = duKien ?? ton;
    const dich = nMax ?? nMin;
    const mua = dk <= nMin ? Math.max(0, Math.ceil(dich - dk)) : 0;
    return { muc, mua };
  }, [hopLe, nMin, nMax, dong.ton, duKien]);

  async function luu() {
    if (nMin == null || Number.isNaN(nMin) || nMin < 0) {
      setLoi("Tối thiểu phải là số không âm.");
      return;
    }
    if (nMax != null && (Number.isNaN(nMax) || nMax < nMin)) {
      setLoi("Tối đa phải lớn hơn hoặc bằng Tối thiểu.");
      return;
    }
    setBusy(true);
    setLoi(null);
    try {
      const t = await api.kho.nguongTon.upsert(token, {
        hang_loai: dong.hang_loai,
        hang_id: dong.hang_id,
        kho_id: khoId,
        // Giấy tờ: ngưỡng của đúng dòng khổ này; cuộn / hàng khác gửi 0 · 0.
        kho_rong: dong.khoRong,
        kho_dai: dong.khoDai,
        nguong_ton: nMin,
        nguong_can_ton: null,
        nguong_toi_da: nMax,
        canh_bao: canhBao,
      });
      onSaved(t);
      onClose();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không lưu được ngưỡng tồn.");
    } finally {
      setBusy(false);
    }
  }

  const dvt = dong.dvt;
  return (
    <div className="tkh-hop-man" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="tkh-hop" role="dialog" aria-modal="true" aria-labelledby="tkh-hop-tieu">
        <div className="tkh-hop__dau">
          <div>
            <h3 id="tkh-hop-tieu">Ngưỡng tồn</h3>
            <div className="tkh-bang-sub">
              <span>{dong.ten}</span>
              {dong.nhanKho && <span className="tkh-the">{dong.nhanKho}</span>}
              <span>tại {khoTen}</span>
            </div>
          </div>
          <span className="tkh-sp" />
          <button type="button" className="tkh-x" aria-label="Đóng" onClick={onClose} disabled={busy}><X /></button>
        </div>
        <div className="tkh-hop__than">
          <div className="tkh-tinh-ho">
            {moiNgay === undefined ? (
              <span>Đang tính lượng xuất bình quân…</span>
            ) : moiNgay === null ? (
              <span>Chưa có lượng xuất trong {NGAY_BINH_QUAN} ngày qua để tính hộ. Gõ thẳng Tối thiểu bên dưới.</span>
            ) : (
              <>
                <span>Đủ dùng</span>
                <span className="tkh-nhap"><input aria-label="Số ngày đủ dùng" inputMode="numeric" value={soNgay}
                  onChange={(e) => setSoNgay(e.target.value)} /></span>
                <span>ngày × <b className="tkh-num">{fmtQty(Math.round(moiNgay * 10) / 10)} {dvt}</b> xuất mỗi ngày
                  {goiY != null && <> = <b className="tkh-num">{fmtQty(goiY)} {dvt}</b></>}</span>
                <span className="tkh-sp" />
                <button type="button" className="tkh-btn tkh-btn--nho" disabled={goiY == null}
                  onClick={() => goiY != null && setMin(fmtQty(goiY))}>Điền vào Tối thiểu</button>
                <span className="tkh-goi">Lượng xuất mỗi ngày là bình quân {NGAY_BINH_QUAN} ngày qua tại kho này.</span>
              </>
            )}
          </div>

          <div className="tkh-hai">
            <div className="tkh-o">
              <label htmlFor="tkh-min">Tối thiểu <em>*</em></label>
              <div className="tkh-nhap"><input id="tkh-min" inputMode="decimal" autoFocus value={min}
                onChange={(e) => setMin(e.target.value)} /><span>{dvt}</span></div>
              <p>Tồn chạm hoặc dưới mức này là Cần mua.</p>
            </div>
            <div className="tkh-o">
              <label htmlFor="tkh-max">Tối đa</label>
              <div className="tkh-nhap"><input id="tkh-max" inputMode="decimal" value={max} placeholder="Không giới hạn"
                onChange={(e) => setMax(e.target.value)} /><span>{dvt}</span></div>
              <p>Mua bổ sung tới mức này. Bỏ trống thì không báo Dư và mua về tới Tối thiểu.</p>
            </div>
          </div>

          {hopLe && nMin != null && ketQua && (
            <div className="tkh-xem">
              <div className="tkh-muc" style={{ margin: 0 }}>Xem trước</div>
              <div className="tkh-xem__thanh">
                <ThanhNguong ton={dong.ton} min={nMin} max={nMax} rong
                  moc={[
                    { so: dong.ton, nhan: `Tồn ${fmtQty(dong.ton)}`, lop: dong.ton <= nMin ? "tkh-do" : "" },
                    ...(duKien != null && duKien !== dong.ton
                      ? [{ so: Math.max(0, duKien), nhan: `Dự kiến ${fmtQty(duKien)}`, lop: "tkh-mo" }]
                      : []),
                  ]} />
              </div>
              <ThangNguong ton={dong.ton} min={nMin} max={nMax} fmt={fmtQty}
                them={duKien != null ? [Math.max(0, duKien)] : []} />
              <p>
                Với mức này mặt hàng ở trạng thái{" "}
                <span className={`tkh-chip tkh-chip--${ketQua.muc}`}>
                  {ketQua.muc === "mua" ? "Cần mua" : ketQua.muc === "thua" ? "Dư" : "Đủ"}
                </span>
                {ketQua.mua > 0 && (
                  <>, cần mua <b>{fmtQty(ketQua.mua)} {dvt}</b> để về {nMax != null ? "Tối đa" : "Tối thiểu"}</>
                )}
                .
              </p>
            </div>
          )}

          <label className="tkh-cong">
            <input type="checkbox" checked={canhBao} onChange={(e) => setCanhBao(e.target.checked)} />
            <span className="tkh-cong__nut" aria-hidden="true" />
            <span>Bật cảnh báo khi tồn xuống dưới Tối thiểu</span>
          </label>
          {loi && <div className="tkh-bao-loi" role="alert">{loi}</div>}
        </div>
        <div className="tkh-hop__chan">
          <button type="button" className="tkh-btn tkh-btn--nhe" onClick={onClose} disabled={busy}>Huỷ</button>
          <button type="button" className="tkh-btn tkh-btn--chinh" onClick={() => void luu()} disabled={busy}>
            <Gauge aria-hidden="true" />{busy ? "Đang lưu…" : "Lưu ngưỡng"}
          </button>
        </div>
      </div>
    </div>
  );
}
