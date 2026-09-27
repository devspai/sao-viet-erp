// Khối "Gia công ngoài" trên hồ sơ lệnh (spec 2026-09-26 §7). MỘT cửa ghi duy nhất của lần gia
// công: Đã mang đi · Chốt số · Mở lại · Đề nghị xuất giấy · Huỷ trọn gói. Bàn tổ / Xếp lịch / KCS
// chỉ nhìn. Tự nạp lại theo tick SSE — khối không có ô nhập dở dang nào ngoài mini-form đang mở,
// mà state của mini-form nằm riêng, nạp lại không xoá nó.
//
// Nguồn lệnh HOẶC bài ghép (spec 2026-09-27 §4): lần của bước CHUNG bài ghép thao tác ở màn bài
// ghép; màn từng lệnh thành viên chỉ hiện một dòng chỉ đọc bấm sang bài ghép.
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  type GiaCongNgoaiLan,
  type GiaCongNoiVe,
} from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { nhanDonVi } from "../lsxBuoc";
import { NHAN_NOI_VE, NHAN_TRANG_THAI, goiYChot, nutCuaLan, tomTat } from "./giaCong";
import "./giaCong.css";

type FormChot = { sl: string; noiVe: GiaCongNoiVe | null; dich: number | null };

export function GiaCongNgoaiPanel({
  lsxId,
  baiGhepId,
  eventTick = 0,
  canUpdate,
  onChanged,
  onMoBaiGhep,
}: {
  /** Đúng MỘT trong hai: khối trên hồ sơ lệnh, hoặc khối trên màn bài ghép. */
  lsxId?: number;
  baiGhepId?: number;
  eventTick?: number;
  canUpdate: boolean;
  /** Lệnh đổi trạng thái (huỷ trọn gói về Nháp, chốt về kho làm nhóm đóng…) — màn cha nạp lại. */
  onChanged: () => void;
  /** Dòng chỉ đọc (lần của bài ghép trên màn lệnh) bấm sang màn bài ghép. */
  onMoBaiGhep?: (baiGhepId: number) => void;
}) {
  const { token } = useAuth();
  const [lans, setLans] = useState<GiaCongNgoaiLan[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [chot, setChot] = useState<Record<number, FormChot>>({});
  const [slGui, setSlGui] = useState<Record<number, string>>({});
  const [huy, setHuy] = useState<{ lan: GiaCongNgoaiLan; lyDo: string } | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    const req = baiGhepId != null
      ? api.giaCongNgoai.cuaBaiGhep(token, baiGhepId)
      : lsxId != null ? api.giaCongNgoai.cuaLenh(token, lsxId) : null;
    req
      ?.then(setLans)
      .catch((e: unknown) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [token, lsxId, baiGhepId]);
  useEffect(() => load(), [load, eventTick]);

  async function chay(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    setErr(null);
    try {
      await fn();
      load();
      onChanged();
      return true;
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : String(e));
      // Lỗi (đặc biệt 409 lệch version) vẫn nạp lại — version hiển thị phải khớp máy chủ, không
      // thì bấm lần nữa lại 409 tiếp dù đã có version mới.
      load();
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!lans || lans.length === 0) return err ? <div className="banner banner--error">{err}</div> : null;
  const dvTen = (ma: string | null) => (ma ? nhanDonVi(ma) : "");
  return (
    <section className="gcn" aria-label="Gia công ngoài">
      <h3 className="gcn__title">Gia công ngoài</h3>
      {err && <div className="banner banner--error" role="alert">{err}</div>}
      {lans.map((l) => {
        if (l.chi_xem && l.bai_ghep_id != null && baiGhepId == null) {
          // Lần của bước chung bài ghép trên màn LỆNH: một dòng chỉ đọc, thao tác ở màn bài ghép.
          return (
            <article key={l.id} className={`gcn__lan gcn__lan--${l.trang_thai} gcn__lan--chi-xem`}>
              <div className="gcn__head">
                <strong className="gcn__viec">{l.ten_viec}</strong>
                <span className="gcn__ncc">đi chung bài ghép {l.bai_ghep_ma} — {l.nha_cung_cap_ten}</span>
                <span className={`gcn__tt gcn__tt--${l.trang_thai}`}>{NHAN_TRANG_THAI[l.trang_thai]}</span>
                {onMoBaiGhep && (
                  <Button variant="ghost" onClick={() => onMoBaiGhep(l.bai_ghep_id!)}>
                    Mở bài ghép
                  </Button>
                )}
              </div>
            </article>
          );
        }
        const nut = nutCuaLan(l);
        const f = chot[l.id];
        const dangBan = busy === l.id;
        const thaoTac = canUpdate && !l.chi_xem;
        const chia = l.chia_theo_lenh ?? [];
        return (
          <article key={l.id} className={`gcn__lan gcn__lan--${l.trang_thai}`}>
            <div className="gcn__head">
              <strong className="gcn__viec">{l.ten_viec}</strong>
              <span className="gcn__ncc">{l.nha_cung_cap_ten}</span>
              <span className={`gcn__tt gcn__tt--${l.trang_thai}`}>{NHAN_TRANG_THAI[l.trang_thai]}</span>
              {l.don_gia != null && (
                <span className="gcn__gia">
                  {l.don_gia.toLocaleString("vi-VN")}đ / {dvTen(l.don_vi)}
                </span>
              )}
            </div>

            {l.trang_thai === "cho_mang_di" && l.sl_cho_mang_di > 0 && (
              <p className="gcn__note">
                Bước trước đã bàn giao {l.sl_cho_mang_di.toLocaleString("vi-VN")} {dvTen(l.don_vi_gui)} — chờ mang đi.
              </p>
            )}
            {l.trang_thai === "cho_mang_di" && l.sl_cho_mang_di === 0 && l.co_buoc_truoc && (
              <p className="gcn__note">Chờ bước trước bàn giao hàng sang.</p>
            )}
            {l.trang_thai === "dang_o_ngoai" && l.sl_cho_mang_di > 0 && (
              <p className="gcn__note">
                Còn {l.sl_cho_mang_di.toLocaleString("vi-VN")} {dvTen(l.don_vi_gui)} mới bàn giao — mang thêm nếu đã đem đi.
              </p>
            )}
            {l.kieu === "tron_goi" && (
              <p className="gcn__note">
                {l.xuong_cap_giay ? "Xưởng cấp giấy" : "Nhà gia công tự lo giấy"}
                {l.xuat_giay ? ` · Đề nghị xuất giấy ${l.xuat_giay.ma}` : ""}
                {l.sl_dat != null ? ` · Đặt ${l.sl_dat.toLocaleString("vi-VN")} ${dvTen(l.don_vi)}` : ""}
              </p>
            )}
            {(l.trang_thai === "da_xong" || l.mang_di_boi_ten) && (
              <p className="gcn__tomtat">{tomTat(l, dvTen)}</p>
            )}
            {l.trang_thai === "da_huy" && (
              <p className="gcn__note">
                {l.huy_boi_ten ?? "—"} huỷ{l.ly_do_huy ? `: ${l.ly_do_huy}` : ""}
              </p>
            )}
            {l.bai_ghep_id != null && (
              <p className="gcn__note">Các lệnh trên tờ: {(l.lenh ?? []).map((x) => x.ma).join(", ")}</p>
            )}
            {canUpdate && l.chi_xem && (
              <p className="gcn__note">
                Chỉ xem — bài ghép có lệnh ngoài phạm vi của bạn. Nhờ người phụ trách các lệnh còn lại thao tác.
              </p>
            )}

            {thaoTac && (
              <div className="gcn__nut">
                {nut.mangDi && (
                  <>
                    {!l.co_buoc_truoc && l.trang_thai === "cho_mang_di" && (
                      <label className="gcn__o">
                        <span>Số mang đi ({dvTen(l.don_vi_gui)})</span>
                        <input
                          inputMode="decimal"
                          value={slGui[l.id] ?? ""}
                          onChange={(e) => setSlGui((m) => ({ ...m, [l.id]: e.target.value }))}
                        />
                      </label>
                    )}
                    <Button
                      variant="accent"
                      loading={dangBan}
                      onClick={() => chay(l.id, () => api.giaCongNgoai.mangDi(token!, l.id, {
                        version: l.version,
                        sl_gui: l.co_buoc_truoc ? null : Number(slGui[l.id] || 0) || null,
                      }))}
                    >
                      {l.trang_thai === "dang_o_ngoai" ? "Mang thêm" : "Đã mang đi"}
                    </Button>
                  </>
                )}
                {nut.chot && !f && (
                  <Button variant="accent" onClick={() => setChot((m) => ({ ...m, [l.id]: goiYChot(l) }))}>
                    Chốt số nhận về
                  </Button>
                )}
                {nut.xuatGiay && (
                  <Button
                    loading={dangBan}
                    onClick={() => chay(l.id, () => api.giaCongNgoai.xuatGiay(token!, l.id, l.version))}
                  >
                    Đề nghị xuất giấy
                  </Button>
                )}
                {nut.huyTronGoi && (
                  <Button variant="ghost" onClick={() => setHuy({ lan: l, lyDo: "" })}>
                    Huỷ gia công trọn gói
                  </Button>
                )}
                {nut.moLai && (
                  <Button
                    variant="ghost"
                    loading={dangBan}
                    disabled={!!l.ly_do_khong_mo_lai}
                    title={l.ly_do_khong_mo_lai ?? undefined}
                    onClick={() => chay(l.id, () => api.giaCongNgoai.moLai(token!, l.id, l.version))}
                  >
                    Mở lại
                  </Button>
                )}
                {nut.moLai && l.ly_do_khong_mo_lai && (
                  <span className="gcn__note">{l.ly_do_khong_mo_lai}</span>
                )}
              </div>
            )}

            {thaoTac && f && (
              <div className="gcn__form">
                <label className="gcn__o">
                  <span>Số nhận về ({dvTen(l.don_vi)})</span>
                  <input
                    inputMode="decimal"
                    value={f.sl}
                    autoFocus
                    onChange={(e) => setChot((m) => ({ ...m, [l.id]: { ...f, sl: e.target.value } }))}
                  />
                </label>
                <fieldset className="gcn__noive">
                  <legend>Hàng về đâu</legend>
                  {l.noi_ve_hop_le.map((nv) => (
                    <label key={nv}>
                      <input
                        type="radio"
                        name={`gcn-noive-${l.id}`}
                        checked={f.noiVe === nv}
                        onChange={() => setChot((m) => ({ ...m, [l.id]: { ...f, noiVe: nv } }))}
                      />
                      {NHAN_NOI_VE[nv]}
                    </label>
                  ))}
                </fieldset>
                {chia.length > 0 && (
                  // Số chốt là tờ ghép — máy chủ nhân số con/tờ ra phần từng lệnh (spec 2026-09-27 §2).
                  <table className="gcn__chia">
                    <caption>Chia về từng lệnh</caption>
                    <thead>
                      <tr><th>Lệnh</th><th>Số con/tờ</th><th>Nhận</th><th>Bước nhận</th></tr>
                    </thead>
                    <tbody>
                      {chia.map((c) => (
                        <tr key={c.lsx_id}>
                          <td>{c.lsx_ma}</td>
                          <td>{c.so_con.toLocaleString("vi-VN")}</td>
                          <td>
                            {Number(f.sl) > 0
                              ? `${(Math.round(Number(f.sl) * c.so_con * 1000) / 1000).toLocaleString("vi-VN")} ${dvTen(c.don_vi)}`
                              : "—"}
                          </td>
                          <td>{c.buoc_nhan ?? "Nhập kho"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {f.noiVe === "xuong" && l.chang_sau.length > 1 && chia.length === 0 && (
                  <label className="gcn__o">
                    <span>Bước nhận hàng</span>
                    <select
                      value={f.dich ?? ""}
                      onChange={(e) => setChot((m) => ({
                        ...m, [l.id]: { ...f, dich: e.target.value ? Number(e.target.value) : null },
                      }))}
                    >
                      <option value="">— chọn bước —</option>
                      {l.chang_sau.map((c) => <option key={c.id} value={c.id}>{c.ten}</option>)}
                    </select>
                  </label>
                )}
                <div className="gcn__nut">
                  <Button
                    variant="accent"
                    loading={dangBan}
                    disabled={!(Number(f.sl) > 0) || !f.noiVe}
                    onClick={async () => {
                      const xong = await chay(l.id, () => api.giaCongNgoai.chot(token!, l.id, {
                        version: l.version, sl_cuoi: Number(f.sl), noi_ve: f.noiVe!,
                        dich_cong_viec_id: f.dich,
                      }));
                      if (xong) setChot((m) => { const n = { ...m }; delete n[l.id]; return n; });
                    }}
                  >
                    Chốt
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setChot((m) => { const n = { ...m }; delete n[l.id]; return n; })}
                  >
                    Thôi
                  </Button>
                </div>
              </div>
            )}

            {l.lich_su.length > 0 && (
              <details className="gcn__lichsu">
                <summary>Nhật ký ({l.lich_su.length})</summary>
                <ul>
                  {l.lich_su.map((h, i) => (
                    <li key={i}>
                      <span className="gcn__luc">
                        {h.luc ? new Date(h.luc).toLocaleString("vi-VN") : ""}
                      </span>{" "}
                      <b>{h.ai}</b> · {h.viec}{h.chi_tiet ? ` — ${h.chi_tiet}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        );
      })}

      <ConfirmDialog
        open={huy != null}
        title={`Huỷ gia công trọn gói — ${huy?.lan.lsx_ma ?? ""}?`}
        message="Lệnh về Nháp, gói phát hành thu hồi. Đề nghị xuất giấy chưa xuất sẽ huỷ theo."
        confirmLabel="Huỷ trọn gói"
        danger
        busy={huy != null && busy === huy.lan.id}
        confirmDisabled={(huy?.lyDo.trim().length ?? 0) < 3}
        onConfirm={async () => {
          if (!huy) return;
          const xong = await chay(huy.lan.id, () => api.giaCongNgoai.huyTronGoi(token!, huy.lan.id, {
            version: huy.lan.version, ly_do: huy.lyDo.trim(),
          }));
          if (xong) setHuy(null);
        }}
        onCancel={() => setHuy(null)}
      >
        <label className="gcn__o">
          <span>Lý do huỷ</span>
          <textarea
            rows={2}
            value={huy?.lyDo ?? ""}
            onChange={(e) => setHuy((h) => (h ? { ...h, lyDo: e.target.value } : h))}
          />
        </label>
      </ConfirmDialog>
    </section>
  );
}
