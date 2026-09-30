// ĐÓNG LỆNH ở màn KCS (spec 2026-09-29-dong-lenh-thu-cong-design.md). KCS kiểm xong, gửi nhập kho,
// rồi tự bấm đóng — KHÔNG có cổng điều kiện; phần còn dở chỉ hiện thành cảnh báo trong hộp xác nhận.
// Đóng theo NHÓM: mọi lệnh của nhóm đóng cùng lúc. Mở lại được. Thay `KcsChotNhom` (tự đóng đủ /
// trưởng KCS đóng thiếu — gỡ 29/09/2026).
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type SxDongLenhTinhTrang } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { Icon } from "../../components/Icons";
import { num } from "../keHoachSxShared";
import { nhanDonVi } from "../lsxBuoc";
import { useNapTenDonVi } from "../tenDonVi";

function gioVN(iso: string): string {
  const d = new Date(iso);
  const hai = (n: number) => String(n).padStart(2, "0");
  return `${hai(d.getHours())}:${hai(d.getMinutes())} ${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function tieuDeDong(tt: SxDongLenhTinhTrang): string {
  const ma = tt.lenh.map((l) => l.ma);
  return ma.length > 1 ? `Đóng ${ma.length} lệnh: ${ma.join(", ")}?` : `Đóng lệnh ${ma[0] ?? ""}?`;
}

export function KcsDongLenh({
  nhomId, canDong, eventTick, onDone,
}: {
  nhomId: number;
  /** Người thuộc phòng ban KCS — máy chủ gác `gate_kcs`. */
  canDong: boolean;
  eventTick?: number;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const [tt, setTt] = useState<SxDongLenhTinhTrang | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hop, setHop] = useState(false);
  useNapTenDonVi();

  const tai = useCallback(() => {
    if (!token) return;
    api.sanXuat.tinhTrangDongLenh(token, nhomId)
      .then((r) => { setTt(r); setLoi(null); })
      .catch((e) => setLoi(e instanceof ApiError ? e.message : "Không đọc được tình trạng lệnh."));
  }, [token, nhomId]);

  useEffect(() => { tai(); }, [tai, eventTick]);

  const daDong = tt?.trang_thai === "closed";

  async function xacNhan() {
    if (!token || !tt || busy) return;
    setBusy(true);
    setLoi(null);
    try {
      const body = { expected_version: tt.version };
      if (daDong) await api.sanXuat.moLaiLenh(token, tt.nhom_id, body);
      else await api.sanXuat.dongLenh(token, tt.nhom_id, body);
      setHop(false);
      tai();
      onDone();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : daDong ? "Không mở lại được." : "Không đóng được.");
    } finally {
      setBusy(false);
    }
  }

  const dv = tt?.don_vi ? ` ${nhanDonVi(tt.don_vi)}` : "";

  return (
    <section className="kcs-section">
      <h2>Đóng lệnh</h2>
      <div className="kcs-chot">
        {loi && <div className="banner banner--error" role="alert"><span>{loi}</span></div>}
        {tt == null ? (
          !loi && <p className="kcs-chot__phu">Đang tải…</p>
        ) : (
          <>
            <div className="kcs-chot__so">
              <span>KCS đạt <b>{num(tt.da_dat)}</b>{tt.muc_tieu != null && <> / {num(tt.muc_tieu)}</>}{dv}</span>
            </div>
            {daDong && (
              <p className="kcs-chot__cau kcs-chot__cau--dong">
                <Icon name="packageCheck" size={14} />
                <span>
                  Đã đóng{tt.dong_boi ? ` bởi ${tt.dong_boi}` : ""}{tt.dong_luc ? ` lúc ${gioVN(tt.dong_luc)}` : ""}.
                </span>
              </p>
            )}

            {canDong && !hop && (
              <div className="kcs-chot__nut">
                <button type="button" className={`btn btn--sm ${daDong ? "btn--ghost" : "btn--accent"}`}
                  onClick={() => setHop(true)} disabled={busy}>
                  <Icon name={daDong ? "rotateCcw" : "packageCheck"} size={13} /> {daDong ? "Mở lại" : "Đóng lệnh"}
                </button>
              </div>
            )}

            {canDong && hop && (
              <div className="kcs-chot__xn" role="dialog" aria-label={daDong ? "Mở lại lệnh" : "Đóng lệnh"}>
                <p><b>{daDong ? "Mở lại lệnh? Việc chưa làm sẽ hiện lại ở bàn tổ." : tieuDeDong(tt)}</b></p>
                {!daDong && tt.canh_bao.length > 0 && (
                  <ul className="kcs-chot__chan">
                    {tt.canh_bao.map((c) => <li key={c.ma}>{c.cau}</li>)}
                  </ul>
                )}
                <div className="kcs-chot__nut">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHop(false)} disabled={busy}>
                    Để sau
                  </button>
                  <button type="button" className="btn btn--accent btn--sm" onClick={xacNhan} disabled={busy}>
                    <Icon name="check" size={13} />{" "}
                    {busy ? "Đang lưu…" : daDong ? "Xác nhận mở lại" : "Xác nhận đóng"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
