// Khối "Chờ chốt giấy" trên bàn tổ Cắt (spec giấy theo khổ §4.6).
//
// Lệnh / bài ghép có giấy, sau phát hành, hiện ở đây: dòng giấy cần (mã · khổ · số tờ), tồn tờ ĐÚNG
// khổ và các lô cuộn cùng mã để tổ tự xem — máy không kết luận. Tổ chốt một trong hai: chèn bước
// cắt (chọn công đoạn của tổ, sắp thứ tự) hoặc "Không cần cắt — đủ giấy". Chốt xong mới mở bước
// mang giấy của tổ khác (cổng "chờ tổ Cắt", §4.7).
//
// Nạp lại theo `eventTick` (SSE nhóm sản xuất, mắc ở AppShell): lệnh mới phát hành tự hiện, không
// bắt bấm tải lại. Màn xưởng: nút to, chữ to.
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type ChotGiayDong } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { Icon } from "../components/Icons";
import { ngay, ngayGio, num } from "./keHoachSxShared";
import { nhanDonVi } from "./lsxBuoc";

export function ThsxChotGiay({
  teamId, eventTick, onDaGhi,
}: {
  teamId: number;
  eventTick?: number;
  /** Chốt / gỡ chốt xong — bàn tổ nạp lại danh sách việc (bước cắt vừa chèn là việc của tổ này). */
  onDaGhi?: () => void;
}) {
  const { token } = useAuth();
  const [ds, setDs] = useState<ChotGiayDong[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chon, setChon] = useState<ChotGiayDong | null>(null);

  const nap = useCallback(() => {
    if (!token) return;
    api.sanXuat.chotGiay.list(token, teamId)
      .then((r) => { setDs(r); setLoi(null); })
      .catch((e) => setLoi(e instanceof ApiError ? e.message : "Không tải được danh sách chờ chốt giấy."));
  }, [token, teamId]);
  useEffect(() => { nap(); }, [nap, eventTick]);

  const ghi = async (f: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setLoi(null);
    try {
      await f();
      setChon(null);
      nap();
      onDaGhi?.();
    } catch (e) {
      setLoi(e instanceof ApiError ? e.message : "Không lưu được — thử lại.");
      nap();
    } finally {
      setBusy(false);
    }
  };
  const khoa = (d: ChotGiayDong) =>
    d.chu_the === "lsx" ? { lsx_id: d.id } : { bai_ghep_id: d.id };

  if (!ds || ds.length === 0) {
    return loi ? <div className="thsx-chot"><p className="thsx-chot__loi" role="alert">{loi}</p></div> : null;
  }
  const choChot = ds.filter((d) => !d.chot).length;

  return (
    <section className="thsx-chot" aria-label="Chờ chốt giấy">
      <div className="thsx-chot__h">
        <Icon name="scissors" size={16} />
        <span>Chờ chốt giấy</span>
        {choChot > 0 && <span className="thsx-chot__n thsx-num">{choChot}</span>}
      </div>
      {loi && <p className="thsx-chot__loi" role="alert">{loi}</p>}
      <ul className="thsx-chot__list">
        {ds.map((d) => (
          <li key={`${d.chu_the}${d.id}`} className={`thsx-chot__it${d.chot ? " is-da-chot" : ""}`}>
            <div className="thsx-chot__dau">
              <b className="thsx-chot__ma">{d.ma}</b>
              <span className="thsx-chot__ten">{d.chu_the === "bai" ? "Bài ghép · " : ""}{d.ten}</span>
              {d.han && <span className="thsx-chot__han">Hạn {ngay(d.han)}</span>}
            </div>
            {d.giay.map((g, i) => (
              <p key={i} className="thsx-chot__giay">
                {g.ma} · {g.nhan_kho} · cần <b className="thsx-num">{num(g.so_to)}</b> {nhanDonVi(g.don_vi)} nguyên
                {" · "}
                {g.ton_to_dung_kho == null
                  ? "chưa có khổ để so tồn"
                  : <>tồn đúng khổ <b className="thsx-num">{num(g.ton_to_dung_kho)}</b></>}
              </p>
            ))}
            {d.cuon_cung_ma.length > 0 && (
              <p className="thsx-chot__cuon">
                Cuộn cùng mã:{" "}
                {d.cuon_cung_ma.map((c) =>
                  `${c.ma_lo} (khổ ${c.kho_rong} mm, còn ${num(c.sl_con_lai)} ${nhanDonVi(c.don_vi)}, ${c.kho_ten})`,
                ).join(" · ")}
              </p>
            )}
            {d.chot ? (
              <div className="thsx-chot__act">
                <span className="thsx-chot__nhan">
                  <Icon name="check" size={15} />{" "}
                  {d.chot.cach === "cat"
                    ? `Đã chốt: chèn ${d.chot.cong_doan.join(", ") || "bước cắt"}`
                    : "Đã chốt: không cắt"}
                  {d.chot.boi_ten ? ` · ${d.chot.boi_ten}` : ""}
                  {d.chot.luc ? ` · ${ngayGio(d.chot.luc)}` : ""}
                </span>
                {d.sua_duoc && (
                  <Button variant="ghost" disabled={busy}
                    onClick={() => ghi(() => api.sanXuat.chotGiay.go(token!, { team_id: teamId, ...khoa(d) }))}>
                    Gỡ chốt
                  </Button>
                )}
              </div>
            ) : (
              <div className="thsx-chot__act">
                <Button variant="accent" disabled={busy || d.cong_doan_chen_duoc.length === 0}
                  title={d.cong_doan_chen_duoc.length === 0
                    ? "Chưa có công đoạn nào giao cho tổ này trong danh mục Công đoạn" : undefined}
                  onClick={() => setChon(d)}>
                  <Icon name="scissors" size={15} /> Chèn bước cắt
                </Button>
                <Button variant="secondary" disabled={busy}
                  onClick={() => ghi(() => api.sanXuat.chotGiay.chot(token!, {
                    team_id: teamId, ...khoa(d), cach: "khong_cat",
                  }))}>
                  Không cần cắt — đủ giấy
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {chon && (
        <HopChenCat
          dong={chon} busy={busy}
          onDong={() => setChon(null)}
          onChen={(ids) => ghi(() => api.sanXuat.chotGiay.chot(token!, {
            team_id: teamId, ...khoa(chon), cach: "cat", cong_doan_ids: ids,
          }))}
        />
      )}
    </section>
  );
}

/** Hộp chọn công đoạn cắt: tick nhiều, lên/xuống để sắp thứ tự chạy. */
function HopChenCat({
  dong, busy, onDong, onChen,
}: {
  dong: ChotGiayDong;
  busy: boolean;
  onDong: () => void;
  onChen: (ids: number[]) => void;
}) {
  const [thuTu, setThuTu] = useState<number[]>([]);
  const ten = new Map(dong.cong_doan_chen_duoc.map((c) => [c.id, c.ten]));
  const doi = (id: number) =>
    setThuTu((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const doiCho = (i: number, j: number) =>
    setThuTu((t) => {
      if (j < 0 || j >= t.length) return t;
      const n = [...t];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onDong(); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onDong]);

  return (
    <div className="thsx-chot__scrim" role="presentation" onClick={onDong}>
      <div className="thsx-chot__hop" role="dialog" aria-modal="true"
        aria-label={`Chèn bước cắt cho ${dong.ma}`} onClick={(e) => e.stopPropagation()}>
        <h3 className="thsx-chot__hop-h">Chèn bước cắt · {dong.ma}</h3>
        <p className="thsx-chot__hop-mo">Chọn công đoạn — bước chạy theo thứ tự tick, sắp lại bằng nút lên/xuống.</p>
        <ul className="thsx-chot__cd">
          {dong.cong_doan_chen_duoc.map((c) => (
            <li key={c.id}>
              <label className="thsx-chot__cd-o">
                <input type="checkbox" checked={thuTu.includes(c.id)} onChange={() => doi(c.id)} />
                <span>{c.ten}</span>
                <span className="thsx-chot__cd-ma">{c.ma}</span>
              </label>
            </li>
          ))}
        </ul>
        {thuTu.length > 0 && (
          <ol className="thsx-chot__thu-tu" aria-label="Thứ tự chạy">
            {thuTu.map((id, i) => (
              <li key={id}>
                <span>{i + 1}. {ten.get(id)}</span>
                <button type="button" className="thsx-chot__mui" aria-label={`Đưa ${ten.get(id)} lên`}
                  disabled={i === 0} onClick={() => doiCho(i, i - 1)}>▲</button>
                <button type="button" className="thsx-chot__mui" aria-label={`Đưa ${ten.get(id)} xuống`}
                  disabled={i === thuTu.length - 1} onClick={() => doiCho(i, i + 1)}>▼</button>
              </li>
            ))}
          </ol>
        )}
        <div className="thsx-chot__act">
          <Button variant="ghost" onClick={onDong} disabled={busy}>Huỷ</Button>
          <Button variant="accent" disabled={busy || thuTu.length === 0} onClick={() => onChen(thuTu)}>
            <Icon name="scissors" size={15} /> Chèn
          </Button>
        </div>
      </div>
    </div>
  );
}
