import { useEffect, useMemo, useState } from "react";
import type { Row } from "../api/rebuildCatalog";
import { Select } from "../components/Select";
import { tenDonVi, useNapTenDonVi } from "./tenDonVi";

export interface BuocVatTuDong { uid: string; vat_tu_id: number; gia_tri_chip: Record<string, number> }
interface Chip { ma: string; ten: string; don_vi?: string | null }

const chipsCua = (vt: Row | undefined): Chip[] =>
  Array.isArray(vt?.chips) ? (vt!.chips as Chip[]) : [];

/** Ô số của một chip: ô chữ + bàn phím số (gõ "3,5" hay "3.5" đều ăn — dấu thập phân của
 *  `type="number"` phụ thuộc ngôn ngữ trình duyệt), đơn vị nằm TRONG ô, bên phải. */
function OChip({ nhan, don_vi, value, onChange }: {
  nhan: string; don_vi: string; value: number | undefined; onChange: (raw: string) => void;
}) {
  const [chu, setChu] = useState(value === undefined ? "" : String(value));
  useEffect(() => {
    if ((chu === "" ? undefined : Number(chu)) !== value) setChu(value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="tg-field tg-bvt__chip">
      <span className="tg-microlabel">{nhan}</span>
      <div className={don_vi ? "tg-suffixwrap tg-bvt__wrap" : undefined}>
        <input
          className="tg-input tg-input--num"
          type="text"
          inputMode="decimal"
          aria-label={nhan}
          value={chu}
          placeholder="0"
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
            setChu(raw);
            onChange(raw);
          }}
        />
        {don_vi ? <span className="tg-suffix">{don_vi}</span> : null}
      </div>
    </label>
  );
}

interface Props {
  tenBuoc: string;
  dong: BuocVatTuDong[];
  vatTuDm: Row[];
  onChange: (next: BuocVatTuDong[]) => void;
  taoUid: () => string;
}

export default function BuocVatTu({ tenBuoc, dong, vatTuDm, onChange, taoUid }: Props) {
  useNapTenDonVi();   // đơn vị hiện bằng TÊN trong danh mục, không in mã trần
  // Dựng một lần theo danh mục — danh mục đứng yên trong khi người dùng gõ chip, mỗi nhịp gõ chỉ `dong` đổi.
  const tra = useMemo(() => new Map(vatTuDm.map((v) => [v.id, v])), [vatTuDm]);
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
        const chips = chipsCua(vt);
        return (
          <div className="tg-bvt__row" key={d.uid}>
            <div className="tg-bvt__top">
              <span className="tg-bvt__ten">{ten}</span>
              <button
                type="button"
                className="tg-bvt__xoa"
                aria-label={`Xóa vật tư ${ten}`}
                title="Xóa vật tư khỏi bước này"
                onClick={() => onChange(dong.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
            {chips.length > 0 && (
              <div className="tg-bvt__chips">
                {chips.map((c) => (
                  <OChip
                    key={c.ma}
                    nhan={c.ten}
                    don_vi={c.don_vi ? (tenDonVi(c.don_vi) ?? "") : ""}
                    value={d.gia_tri_chip[c.ma]}
                    onChange={(raw) => setChip(i, c.ma, raw)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {chuaCo.length > 0 && (
        <div className="tg-bvt__them">
          <Select
            options={chuaCo.map((v) => ({ value: String(v.id), label: String(v.ten) }))}
            value=""
            placeholder="+ Thêm vật tư…"
            onChange={(v) => {
              const id = Number(v);
              if (id) onChange([...dong, { uid: taoUid(), vat_tu_id: id, gia_tri_chip: {} }]);
            }}
            ariaLabel={`Thêm vật tư vào bước ${tenBuoc}`}
            searchable
            portal
            className="tg-input"
            listClassName="tg-pop"
          />
        </div>
      )}
    </div>
  );
}
