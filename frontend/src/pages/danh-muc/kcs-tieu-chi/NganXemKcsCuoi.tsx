// Ngăn "Xem KCS cuối thấy gì" (`docs/design-tieu-chi-kcs-lam-lai.md` §6): chọn các công đoạn một
// lệnh sẽ chạy qua, xem bước KCS cuối sẽ bày những tiêu chí nào. Nạp `khai-bao` MỘT lần không kèm
// tìm (ô trái có thể đang lọc), bật/tắt thẻ tính ở trình duyệt. Không chọn từ lệnh thật — người chỉ
// có quyền danh mục KCS sẽ bị chặn quyền lệnh sản xuất.
import { useEffect, useMemo, useState } from "react";

import { ApiError, api } from "../../../api/client";
import { NganPhai } from "../../ke-toan/shared/NganPhai";
import "../../ke-toan/ke-toan.css";
import { ChipGd } from "./ChipGd";
import { type CongDoanTc, gomTheoGd } from "./kcsTieuChi";

export function NganXemKcsCuoi({
  token, chonSan, onDong,
}: {
  token: string;
  /** Công đoạn đang chọn ở ô phải (có tiêu chí) — bật sẵn. */
  chonSan: number | null;
  onDong: () => void;
}) {
  const [ds, setDs] = useState<CongDoanTc[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [bat, setBat] = useState<Set<number>>(() => new Set(chonSan != null ? [chonSan] : []));

  useEffect(() => {
    let huy = false;
    api.kcsHangMuc.khaiBao(token)
      .then((kb) => { if (!huy) setDs(kb.giai_doan.flatMap((g) => g.cong_doan)); })
      .catch((e) => { if (!huy) { setDs([]); setLoi(e instanceof ApiError ? e.message : "Không tải được danh mục tiêu chí."); } });
    return () => { huy = true; };
  }, [token]);

  const nhom = useMemo(() => gomTheoGd(ds ?? []), [ds]);
  // Thứ tự xem trước: giai đoạn rồi thứ tự công đoạn như ô trái.
  const daBat = nhom.flatMap((g) => g.cong_doan).filter((c) => bat.has(c.cong_doan_id));
  const coTc = daBat.filter((c) => c.hang_muc.length > 0);
  const tong = coTc.reduce((s, c) => s + c.hang_muc.length, 0);

  const doi = (id: number) => setBat((cu) => {
    const m = new Set(cu);
    if (m.has(id)) m.delete(id); else m.add(id);
    return m;
  });

  return (
    <NganPhai tieuDe="Xem KCS cuối thấy gì" onDong={onDong}>
      <div className="ktc-xem">
        {loi && <div className="banner banner--error" role="alert"><span>{loi}</span></div>}
        <p className="ktc-xem__phu">Chọn các công đoạn một lệnh sẽ chạy qua.</p>
        {ds == null ? <div className="ktc-trong">Đang tải…</div> : (
          <div className="ktc-xem__chon">
            {nhom.map((g) => (
              <div key={g.nhom || "khac"} className="ktc-xem__nhom">
                <div className="ktc-nhom__nhan"><ChipGd nhom={g.nhom} /></div>
                <div className="ktc-xem__the">
                  {g.cong_doan.map((c) => (
                    <button key={c.cong_doan_id} type="button" aria-pressed={bat.has(c.cong_doan_id)}
                      className={`ktc-bat${c.hang_muc.length ? "" : " ktc-bat--rong"}`}
                      onClick={() => doi(c.cong_doan_id)}>
                      {c.ten}
                      <span className="ktc-bat__so">{c.hang_muc.length || "chưa có"}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="ktc-xem__ket">
          <h3>KCS cuối sẽ tick {tong} tiêu chí</h3>
          {daBat.length === 0 ? (
            <div className="ktc-trong">Chưa chọn công đoạn nào.</div>
          ) : coTc.length === 0 ? (
            <div className="ktc-trong">Các công đoạn đã chọn chưa có tiêu chí nào.</div>
          ) : coTc.map((c) => (
            <section key={c.cong_doan_id} className="ktc-xem__cd">
              <div className="ktc-xem__cd-dau">
                <span>{c.ten}</span>
                <span className="ktc-dem">{c.hang_muc.length}</span>
              </div>
              <ol className="ktc-xem__ds">
                {c.hang_muc.map((h) => <li key={h.id}>{h.ten}</li>)}
              </ol>
            </section>
          ))}
          {daBat.length > coTc.length && coTc.length > 0 && (
            <p className="ktc-nhac">
              {daBat.length - coTc.length} công đoạn đã chọn chưa có tiêu chí, KCS cuối không có gì để tick ở đó.
            </p>
          )}
          <p className="ktc-nhac">Lệnh thật xếp các nhóm theo thứ tự công đoạn trong quy trình của lệnh.</p>
        </div>
      </div>
    </NganPhai>
  );
}
