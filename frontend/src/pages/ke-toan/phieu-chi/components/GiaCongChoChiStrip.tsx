// Hàng "Gia công chờ chi" đầu màn Phiếu chi (spec gia công ngoài §5): lần đã chốt số, chưa có
// phiếu chi còn hiệu lực. Không có dòng nào thì không vẽ gì. Tự nạp theo tick SSE.
import { useEffect, useState } from "react";
import { ApiError, api, type GiaCongChoChi } from "../../../../api/client";
import { useAuth } from "../../../../auth/useAuth";
import { Button } from "../../../../components/Button";
import { nhanDonVi } from "../../../lsxBuoc";

export function GiaCongChoChiStrip({
  eventTick,
  canCreate,
  onLap,
}: {
  eventTick: number;
  canCreate: boolean;
  onLap: (row: GiaCongChoChi) => void;
}) {
  const { token } = useAuth();
  const [rows, setRows] = useState<GiaCongChoChi[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    api.giaCongNgoai
      .choChi(token)
      .then((r) => { setRows(r); setErr(null); })
      .catch((e: unknown) => setErr(e instanceof ApiError ? e.message : String(e)));
  }, [token, eventTick]);

  if (err) return <div className="banner banner--error">{err}</div>;
  if (rows.length === 0) return null;
  return (
    <section className="acct-gc-cho" aria-label="Gia công chờ chi">
      <h2 className="acct-gc-cho__title">Gia công chờ chi ({rows.length})</h2>
      <ul className="acct-gc-cho__list">
        {rows.map((r) => (
          <li key={r.gia_cong_ngoai_id} className="acct-gc-cho__row">
            <span className="acct-gc-cho__ncc">{r.nha_cung_cap_ten}</span>
            <span>{r.nhan_nguon || r.lsx_ma} · {r.ten_viec}</span>
            <span>
              {r.sl_cuoi.toLocaleString("vi-VN")} {r.don_vi ? nhanDonVi(r.don_vi) : ""}
              {r.thanh_tien != null ? ` · ${r.thanh_tien.toLocaleString("vi-VN")}đ` : ""}
            </span>
            <span className="acct-gc-cho__ai">
              {r.chot_boi_ten ?? ""}{r.chot_luc ? ` · ${new Date(r.chot_luc).toLocaleDateString("vi-VN")}` : ""}
            </span>
            {canCreate && (
              <Button variant="accent" onClick={() => onLap(r)}>Lập phiếu chi</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
