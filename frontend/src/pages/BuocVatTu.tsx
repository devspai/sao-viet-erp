import { useEffect, useMemo, useState } from "react";
import type { Row } from "../api/rebuildCatalog";
import { Select } from "../components/Select";
import { tenDonVi, useNapTenDonVi } from "./tenDonVi";

export interface BuocVatTuDong { uid: string; vat_tu_id: number; gia_tri_chip: Record<string, number> }
interface Chip { ma: string; ten: string; don_vi?: string | null }

const chipsCua = (vt: Row | undefined): Chip[] =>
  Array.isArray(vt?.chips) ? (vt!.chips as Chip[]) : [];

/** Chuẩn hoá để SO tên: thường hoá, bỏ dấu, đ→d. Chỉ dùng để so, không bao giờ in ra. */
const chuanHoa = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Nhãn ngắn của ô chip: bỏ cụm trùng TÊN VẬT TƯ khỏi tên chip ("Dài support" của vật tư
 *  "Support" → "Dài"). So theo TỪ, không phân biệt hoa thường/dấu. Bỏ xong mà rỗng (chip tên
 *  đúng bằng tên vật tư) hoặc không thấy cụm trùng thì giữ nguyên tên chip. */
export function nhanNgan(tenChip: string, tenVatTu: string): string {
  const tu = tenChip.trim().split(/\s+/).filter(Boolean);
  const mau = chuanHoa(tenVatTu).trim().split(/\s+/).filter(Boolean);
  if (mau.length === 0 || tu.length === 0) return tenChip;
  const tuCh = tu.map(chuanHoa);
  for (let i = 0; i + mau.length <= tu.length; i++) {
    if (mau.every((m, k) => tuCh[i + k] === m)) {
      const con = [...tu.slice(0, i), ...tu.slice(i + mau.length)].join(" ")
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      return con === "" ? tenChip : con;
    }
  }
  return tenChip;
}

/** Tóm tắt một bước cho viên công đoạn: số vật tư + số ô chip CHƯA nhập số. */
export function tomTatBuoc(dong: BuocVatTuDong[], vatTuDm: Row[]): { so: number; chipTrong: number } {
  let chipTrong = 0;
  for (const d of dong) {
    const vt = vatTuDm.find((v) => v.id === d.vat_tu_id);
    for (const c of chipsCua(vt)) if (d.gia_tri_chip[c.ma] === undefined) chipTrong++;
  }
  return { so: dong.length, chipTrong };
}

/** Ô số của một chip, gọn một dòng: nhãn ngắn · ô số · đơn vị — cả ba nằm TRONG một khung.
 *  Ô chữ + bàn phím số (gõ "3,5" hay "3.5" đều ăn — dấu thập phân của `type="number"` phụ thuộc
 *  ngôn ngữ trình duyệt). Chưa có số thì viền màu cảnh báo. Tên đầy đủ ở tooltip + aria-label. */
function OChip({ nhan, nhanDu, don_vi, value, onChange }: {
  nhan: string; nhanDu: string; don_vi: string; value: number | undefined; onChange: (raw: string) => void;
}) {
  const [chu, setChu] = useState(value === undefined ? "" : String(value));
  useEffect(() => {
    if ((chu === "" ? undefined : Number(chu)) !== value) setChu(value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const trong = value === undefined;
  return (
    <label
      className={`tg-bvt__o${trong ? " tg-bvt__o--trong" : ""}`}
      title={trong ? `${nhanDu} — chưa nhập số` : nhanDu}
    >
      <span className="tg-bvt__o-nhan">{nhan}</span>
      <input
        className="tg-bvt__o-so"
        type="text"
        inputMode="decimal"
        aria-label={nhanDu}
        aria-invalid={trong || undefined}
        value={chu}
        placeholder="0"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
          setChu(raw);
          onChange(raw);
        }}
      />
      {don_vi ? <span className="tg-bvt__o-dv">{don_vi}</span> : null}
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

  const nutXoa = (i: number, ten: string, cls: string) => (
    <button
      type="button"
      className={cls}
      aria-label={`Xóa vật tư ${ten}`}
      title="Xóa vật tư khỏi bước này"
      onClick={() => onChange(dong.filter((_, j) => j !== i))}
    >
      ×
    </button>
  );

  // Hai nhóm, giữ thứ tự gốc trong từng nhóm: vật tư có chip mỗi cái một DÒNG (cần chỗ cho ô số),
  // vật tư không chip thu thành thẻ nhỏ chung một hàng, nút "+ Thêm" đứng cuối hàng thẻ.
  const ds = dong.map((d, i) => {
    const vt = tra.get(d.vat_tu_id);
    const ten = vt ? String(vt.ten) : `Vật tư #${d.vat_tu_id} (đã ngừng dùng)`;
    return { d, i, ten, chips: chipsCua(vt) };
  });
  const coChip = ds.filter((x) => x.chips.length > 0);
  const khongChip = ds.filter((x) => x.chips.length === 0);

  return (
    <div className="tg-bvt">
      <div className="tg-bvt__head">Vật tư của bước {tenBuoc}</div>
      {dong.length === 0 && <p className="tg-bvt__rong">Bước này chưa có vật tư.</p>}
      {coChip.map(({ d, i, ten, chips }) => (
        <div className="tg-bvt__dong" key={d.uid}>
          <span className="tg-bvt__ten">{ten}</span>
          <div className="tg-bvt__ochips">
            {chips.map((c) => (
              <OChip
                key={c.ma}
                nhan={nhanNgan(c.ten, ten)}
                nhanDu={c.ten}
                don_vi={c.don_vi ? (tenDonVi(c.don_vi) ?? "") : ""}
                value={d.gia_tri_chip[c.ma]}
                onChange={(raw) => setChip(i, c.ma, raw)}
              />
            ))}
          </div>
          {nutXoa(i, ten, "tg-bvt__xoa")}
        </div>
      ))}
      {(khongChip.length > 0 || chuaCo.length > 0) && (
        <div className="tg-bvt__tags">
          {khongChip.map(({ d, i, ten }) => (
            <span className="tg-bvt__tag" key={d.uid}>
              <span className="tg-bvt__tag-ten">{ten}</span>
              {nutXoa(i, ten, "tg-bvt__tag-x")}
            </span>
          ))}
          {chuaCo.length > 0 && (
            <div className="tg-bvt__them">
              <Select
                options={chuaCo.map((v) => ({ value: String(v.id), label: String(v.ten) }))}
                value=""
                placeholder="+ Thêm"
                onChange={(v) => {
                  const id = Number(v);
                  if (id) onChange([...dong, { uid: taoUid(), vat_tu_id: id, gia_tri_chip: {} }]);
                }}
                ariaLabel={`Thêm vật tư vào bước ${tenBuoc}`}
                searchable
                portal
                className="tg-bvt__them-btn"
                listClassName="tg-pop"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
