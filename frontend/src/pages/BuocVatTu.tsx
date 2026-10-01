import type { Row } from "../api/rebuildCatalog";

export interface BuocVatTuDong { uid: string; vat_tu_id: number; gia_tri_chip: Record<string, number> }
interface Chip { ma: string; ten: string; don_vi?: string | null }

const chipsCua = (vt: Row | undefined): Chip[] =>
  Array.isArray(vt?.chips) ? (vt!.chips as Chip[]) : [];

interface Props {
  tenBuoc: string;
  dong: BuocVatTuDong[];
  vatTuDm: Row[];
  onChange: (next: BuocVatTuDong[]) => void;
  taoUid: () => string;
}

export default function BuocVatTu({ tenBuoc, dong, vatTuDm, onChange, taoUid }: Props) {
  const tra = new Map(vatTuDm.map((v) => [v.id, v]));
  const chuaCo = vatTuDm.filter((v) => !dong.some((d) => d.vat_tu_id === v.id));

  const setChip = (i: number, ma: string, raw: string) =>
    onChange(dong.map((d, j) => {
      if (j !== i) return d;
      const { [ma]: _bo, ...con } = d.gia_tri_chip;
      const so = Number(raw);
      return { ...d, gia_tri_chip: raw.trim() === "" || !Number.isFinite(so) ? con : { ...con, [ma]: so } };
    }));

  return (
    <div className="tg-bvt">
      <div className="tg-bvt__head">Vật tư của bước {tenBuoc}</div>
      {dong.length === 0 && <p className="tg-bvt__rong">Bước này chưa có vật tư.</p>}
      {dong.map((d, i) => {
        const vt = tra.get(d.vat_tu_id);
        const ten = vt ? String(vt.ten) : `Vật tư #${d.vat_tu_id} (đã ngừng dùng)`;
        return (
          <div className="tg-bvt__row" key={d.uid}>
            <span className="tg-bvt__ten">{ten}</span>
            <div className="tg-bvt__chips">
              {chipsCua(vt).map((c) => (
                <label key={c.ma} className="tg-bvt__chip">
                  <span>{c.ten}</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    aria-label={`${c.ten} của ${ten}`}
                    value={d.gia_tri_chip[c.ma] ?? ""}
                    placeholder="0"
                    onChange={(e) => setChip(i, c.ma, e.target.value)}
                  />
                  {c.don_vi ? <small>{c.don_vi}</small> : null}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="tg-bvt__xoa"
              aria-label={`Xóa vật tư ${ten}`}
              onClick={() => onChange(dong.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        );
      })}
      {chuaCo.length > 0 && (
        <select
          className="tg-bvt__them"
          aria-label={`Thêm vật tư vào bước ${tenBuoc}`}
          value=""
          onChange={(e) => {
            const id = Number(e.target.value);
            if (id) onChange([...dong, { uid: taoUid(), vat_tu_id: id, gia_tri_chip: {} }]);
          }}
        >
          <option value="">+ Thêm vật tư…</option>
          {chuaCo.map((v) => <option key={v.id} value={v.id}>{String(v.ten)}</option>)}
        </select>
      )}
    </div>
  );
}
